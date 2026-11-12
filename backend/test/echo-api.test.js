// ARCHIVO: backend/test/echo-api.test.js
'use strict';

// Tests de las rutas que usa Echo (la agente de Emilia que opera Jelcom):
// validar-base, familia (envíos divididos como uno solo), costo con tarifas
// y envío de prueba.
// Base SQLite TEMPORAL con el esquema real; proveedores simulados.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
const express = require('express');
const XLSX = require('xlsx');

const dbModulePath = require.resolve('../src/db/index.js');
const archivo = path.join(os.tmpdir(), `jelcom-test-echo-${process.pid}.db`);
if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
const db = new Database(archivo);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8'));
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: { db, init: () => {} } };

// Proveedor SMS simulado: no sale nada a internet.
const hablamePath = require.resolve('../src/services/proveedores/hablame.js');
const enviadosSimulados = [];
require.cache[hablamePath] = { id: hablamePath, filename: hablamePath, loaded: true, exports: { enviarUno: async (dest, texto) => { enviadosSimulados.push({ dest, texto }); return { ok: true, comprobante: 'sim-' + dest }; }, probar: async () => ({ estado: 'ok' }) } };

const app = express();
app.use(express.json());
app.use('/api/envios', require('../src/routes/envios.js'));
app.use('/api/tarifas', require('../src/routes/tarifas.js'));
const server = app.listen(0);
const url = (p) => `http://127.0.0.1:${server.address().port}${p}`;
test.after(() => { server.close(); db.close(); try { fs.unlinkSync(archivo); } catch {} });

function subir(ruta, contenido, nombre, campos = {}) {
  const fd = new FormData();
  fd.append('archivo', new Blob([contenido]), nombre);
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return fetch(url(ruta), { method: 'POST', body: fd });
}

test('validar-base lee CSV con comas entre comillas y usa la columna por encabezado', async () => {
  const csv = 'nombre,telefono\n"Pérez, Juan",3001234567\n"Gómez, Ana",300 123 4567\nLuis,12345\nMarta,3109876543\n';
  const r = await subir('/api/envios/validar-base', Buffer.from(csv), 'base.csv', { canal: 'sms' });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.columna, 'telefono');
  assert.equal(j.validos, 2);       // 3001234567 y 3109876543
  assert.equal(j.duplicados, 1);    // "300 123 4567" = mismo número
  assert.equal(j.invalidos, 1);     // 12345
  assert.deepEqual(j.muestra_validos, ['573001234567', '573109876543']);
  const n = db.prepare('SELECT COUNT(*) AS n FROM envios').get().n;
  assert.equal(n, 0, 'validar NO crea envíos');
});

test('validar-base lee Excel y correos con typos de dominio', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nombre', 'Correo'], ['A', 'ana@gmial.com'], ['B', 'malo@'], ['C', 'c@x.com; d@y.com']]), 'h');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const j = await (await subir('/api/envios/validar-base', buf, 'base.xlsx', { canal: 'correo' })).json();
  assert.equal(j.columna, 'Correo');
  assert.equal(j.validos, 3);
  assert.ok(j.muestra_validos.includes('ana@gmail.com'), 'corrige gmial.com → gmail.com');
  assert.equal(j.invalidos, 1);
});

test('familia, costo y cierre del original al terminar todas las partes', async () => {
  db.prepare("INSERT INTO cuentas_sms (id, nombre, proveedor, activa) VALUES (1,'Hablame','hablame',1)").run();
  const { id } = await (await fetch(url('/api/envios'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Prueba', canal: 'sms', cuerpo: 'Hola mundo', cuenta_sms_id: 1 }) })).json();
  const base = 'telefono\n' + Array.from({ length: 10 }, (_, i) => `30000000${String(i).padStart(2, '0')}`).join('\n');
  await subir(`/api/envios/${id}/base`, Buffer.from(base), 'b.csv');

  // Sin tarifas: el costo NO inventa números.
  let c = await (await fetch(url(`/api/envios/${id}/costo`))).json();
  assert.equal(c.costo.estimado, null);
  assert.ok(c.faltan.includes('tarifa_sms_hablame'));

  await fetch(url('/api/tarifas'), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tarifa_sms: 20 }) });
  c = await (await fetch(url(`/api/envios/${id}/costo`))).json();
  assert.equal(c.tarifa, 20);
  assert.equal(c.costo.estimado, 200);   // 10 contactos × 1 segmento × 20

  // Dividir en 2 (lanza las partes) y esperar a que terminen.
  const div = await (await fetch(url(`/api/envios/${id}/dividir`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad: 2 }) })).json();
  assert.equal(div.ids.length, 2);
  for (let i = 0; i < 100; i++) {
    const f = await (await fetch(url(`/api/envios/${id}/familia`))).json();
    if (f.estado === 'finalizada') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const f = await (await fetch(url(`/api/envios/${div.ids[0]}/familia`))).json();   // consultando por una PARTE
  assert.equal(f.raiz.id, id, 'una parte resuelve a su original');
  assert.equal(f.dividido, true);
  assert.equal(f.estado, 'finalizada');
  assert.equal(f.totales.enviados, 10);
  assert.equal(f.totales.pendientes, 0);

  c = await (await fetch(url(`/api/envios/${id}/costo`))).json();
  assert.equal(c.costo.real, 200);

  // Informe pedido por una parte → sale UN Excel del envío completo.
  const inf = await fetch(url(`/api/envios/${div.ids[1]}/informe-consolidado`));
  assert.equal(inf.status, 200);
  assert.match(inf.headers.get('content-type'), /spreadsheetml/);
});

test('prueba manda UN mensaje sin tocar contactos ni contadores', async () => {
  const { id } = await (await fetch(url('/api/envios'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'P2', canal: 'sms', cuerpo: 'Texto de prueba', cuenta_sms_id: 1 }) })).json();
  const antes = enviadosSimulados.length;
  const r = await (await fetch(url(`/api/envios/${id}/prueba`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destino: '+57 300 111 2233' }) })).json();
  assert.equal(r.ok, true);
  assert.equal(r.destino, '573001112233');
  assert.equal(enviadosSimulados.length, antes + 1);
  assert.equal(enviadosSimulados.at(-1).texto, 'Texto de prueba');
  const e = db.prepare('SELECT total_enviados FROM envios WHERE id=?').get(id);
  assert.equal(e.total_enviados, 0);
  const malo = await fetch(url(`/api/envios/${id}/prueba`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destino: '123' }) });
  assert.equal(malo.status, 400);
});
