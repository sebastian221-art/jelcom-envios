'use strict';

// Tests de la SEGUNDA PASADA: al terminar un envío, los que fallaron se
// reintentan solos, más despacio y de a uno (también en envíos divididos).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
const express = require('express');
const XLSX = require('xlsx');

process.env.REINTENTO_DELAY_MS = '5';
process.env.LIMITE_ESPERA_MS = '5';

const dbModulePath = require.resolve('../src/db/index.js');
const hablamePath = require.resolve('../src/services/proveedores/hablame.js');
const archivoTemporal = path.join(os.tmpdir(), `jelcom-test-reintentos-${process.pid}.db`);
if (fs.existsSync(archivoTemporal)) fs.unlinkSync(archivoTemporal);
const db = new Database(archivoTemporal);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8'));
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: { db, init: () => {} } };

// Proveedor falso controlable:
//  fallaVeces[destino] = cuántas veces seguidas falla antes de funcionar
//  siempreFalla = set de destinos que nunca funcionan
//  error = texto del error que devuelve
const llamadas = [];
const fake = { fallaVeces: {}, siempreFalla: new Set(), error: 'Rejected' };
require.cache[hablamePath] = { id: hablamePath, filename: hablamePath, loaded: true, exports: {
  probar: async () => ({}),
  enviarUno: async (destino) => {
    llamadas.push(destino);
    if (fake.siempreFalla.has(destino)) return { ok: false, error: fake.error };
    if ((fake.fallaVeces[destino] || 0) > 0) { fake.fallaVeces[destino]--; return { ok: false, error: fake.error }; }
    return { ok: true, comprobante: 'OK-' + destino };
  },
} };

const app = express();
app.use(express.json());
app.use('/api/envios', require('../src/routes/envios.js'));
const server = app.listen(0);
const url = (p) => `http://127.0.0.1:${server.address().port}${p}`;
test.after(() => { server.close(); db.close(); fs.unlinkSync(archivoTemporal); });

async function crearConBase(nombre, numeros) {
  const id = (await (await fetch(url('/api/envios'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, canal: 'sms', cuerpo: 'Hola' }) })).json()).id;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(numeros.map(n => [n])), 'H');
  const fd = new FormData();
  fd.append('archivo', new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })]), 'b.xlsx');
  await fetch(url(`/api/envios/${id}/base`), { method: 'POST', body: fd });
  return id;
}
async function esperar(cond, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return; await new Promise(r => setTimeout(r, 50)); }
  throw new Error('tiempo agotado esperando la condición');
}
const estado = (id) => db.prepare('SELECT * FROM envios WHERE id=?').get(id);
const logsDe = (ids) => db.prepare(`SELECT mensaje FROM logs WHERE envio_id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(l => l.mensaje);

test('los que fallan se reintentan solos al final y se recuperan', async () => {
  fake.error = 'Rejected'; fake.fallaVeces = { '573001000001': 1, '573001000003': 1 };
  const id = await crearConBase('Falla una vez', ['3001000001', '3001000002', '3001000003']);
  await fetch(url(`/api/envios/${id}/enviar`), { method: 'POST' });
  await esperar(() => estado(id).estado === 'finalizada');
  const e = estado(id);
  assert.equal(e.total_enviados, 3);
  assert.equal(e.total_errores, 0);
  const c = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND destino='573001000001'").get(id);
  assert.equal(c.estado, 'enviado');
  assert.equal(c.intento, 4, 'quedó marcado como recuperado en la segunda pasada');
  assert.ok(logsDe([id]).some(m => /Segunda pasada: reintentando 2/.test(m)));
});

test('si sigue fallando queda en error, sin ciclos infinitos', async () => {
  fake.siempreFalla = new Set(['573002000002']);
  const id = await crearConBase('Falla siempre', ['3002000001', '3002000002']);
  llamadas.length = 0;
  await fetch(url(`/api/envios/${id}/enviar`), { method: 'POST' });
  await esperar(() => estado(id).estado === 'finalizada');
  assert.equal(estado(id).total_errores, 1);
  assert.equal(llamadas.filter(d => d === '573002000002').length, 2, '1 vez normal + 1 en la segunda pasada');
  const c = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND destino='573002000002'").get(id);
  assert.equal(c.estado, 'error');
  assert.equal(c.detalle_error, 'Rejected');

  // Botón "Reintentar fallidos": ahora el proveedor ya funciona
  fake.siempreFalla = new Set();
  const r = await (await fetch(url(`/api/envios/${id}/reintentar-fallidos`), { method: 'POST' })).json();
  assert.equal(r.fallidos, 1);
  await esperar(() => estado(id).estado === 'finalizada' && estado(id).total_errores === 0);
  assert.equal(estado(id).total_enviados, 2);
});

test('error 429 (muy rápido): espera y reintenta en el momento', async () => {
  fake.error = '429: Too many requests'; fake.fallaVeces = { '573003000001': 2 };
  const id = await crearConBase('Rate limit', ['3003000001']);
  await fetch(url(`/api/envios/${id}/enviar`), { method: 'POST' });
  await esperar(() => estado(id).estado === 'finalizada');
  assert.equal(estado(id).total_enviados, 1);
  assert.ok(logsDe([id]).some(m => /ir más despacio/.test(m)));
});

test('envío dividido: UNA sola segunda pasada para todas las partes, al final', async () => {
  fake.error = 'Rejected'; fake.fallaVeces = { '573004000001': 1, '573004000006': 1 };
  const numeros = Array.from({ length: 6 }, (_, i) => '300400000' + (i + 1));
  const id = await crearConBase('Dividido con fallas', numeros);
  const div = await (await fetch(url(`/api/envios/${id}/dividir`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad: 3 }) })).json();
  const todos = [id, ...div.ids];
  await esperar(() => div.ids.every(h => estado(h).estado === 'finalizada')
    && logsDe(todos).some(m => /Segunda pasada terminada/.test(m)));
  assert.equal(logsDe(todos).filter(m => /Segunda pasada: reintentando/.test(m)).length, 1);
  const lista = await (await fetch(url('/api/envios'))).json();
  const padre = lista.find(e => e.id === id);
  assert.equal(padre.total_enviados, 6);
  assert.equal(padre.total_errores, 0);
  assert.equal(padre.estado, 'finalizada');
});
