'use strict';

// Tests de LISTA NEGRA y de ENVÍOS DIVIDIDOS (un solo informe) con node --test.
// Base SQLite TEMPORAL con el esquema real y proveedor SMS (Háblame) simulado,
// así nunca se toca la base real ni se manda ningún mensaje de verdad.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
const express = require('express');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const dbModulePath = require.resolve('../src/db/index.js');
const hablamePath = require.resolve('../src/services/proveedores/hablame.js');

const archivoTemporal = path.join(os.tmpdir(), `jelcom-test-listanegra-${process.pid}.db`);
if (fs.existsSync(archivoTemporal)) fs.unlinkSync(archivoTemporal);
const db = new Database(archivoTemporal);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8'));
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: { db, init: () => {} } };

// Proveedor SMS falso: registra a quién "envía" y siempre responde ok.
const enviadosA = [];
require.cache[hablamePath] = {
  id: hablamePath, filename: hablamePath, loaded: true,
  exports: { enviarUno: async (destino) => { enviadosA.push(destino); return { ok: true, comprobante: 'SIM-' + destino }; }, probar: async () => ({}) },
};

const app = express();
app.use(express.json());
app.use('/api/envios', require('../src/routes/envios.js'));
app.use('/api/lista-negra', require('../src/routes/listaNegra.js'));
const server = app.listen(0);
const url = (p) => `http://127.0.0.1:${server.address().port}${p}`;
const listaNegra = require('../src/services/listaNegra.js');

test.after(() => { server.close(); db.close(); fs.unlinkSync(archivoTemporal); });

function excelDe(numeros) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(numeros.map(n => [n])), 'Hoja1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
async function subirBase(envioId, numeros) {
  const fd = new FormData();
  fd.append('archivo', new Blob([excelDe(numeros)]), 'base.xlsx');
  return (await fetch(url(`/api/envios/${envioId}/base`), { method: 'POST', body: fd })).json();
}
async function crearEnvioSMS(nombre) {
  const r = await fetch(url('/api/envios'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, canal: 'sms', cuerpo: 'Hola prueba' }) });
  return (await r.json()).id;
}
async function esperar(cond, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('tiempo agotado esperando la condición');
}

test('normaliza el mismo celular escrito de varias formas', () => {
  for (const v of ['3193455031', '57 319 345 5031', '+573193455031', '319-345-5031']) {
    assert.deepEqual(listaNegra.normalizar(v), { valor: '3193455031', tipo: 'telefono' });
  }
  assert.deepEqual(listaNegra.normalizar(' Juan@Gmail.COM '), { valor: 'juan@gmail.com', tipo: 'correo' });
  assert.equal(listaNegra.normalizar('12345'), null);
  // Gmail: puntos y +etiquetas no cambian el buzón
  assert.equal(listaNegra.normalizar('alejandro.sampayo@gmail.com').valor, 'alejandrosampayo@gmail.com');
  assert.equal(listaNegra.normalizar('Alejandro.Sampayo+cajasan@googlemail.com').valor, 'alejandrosampayo@gmail.com');
  // Otros dominios sí respetan los puntos
  assert.equal(listaNegra.normalizar('juan.perez@hotmail.com').valor, 'juan.perez@hotmail.com');
});

test('agregar a la lista negra y no permitir repetidos', async () => {
  const r1 = await fetch(url('/api/lista-negra'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valor: '+57 319 345 5031', nombre: 'Santiago Chacón Ramírez', motivo: 'Pidió no recibir más información' }) });
  assert.equal(r1.status, 200);
  const r2 = await fetch(url('/api/lista-negra'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valor: '3193455031' }) });
  assert.equal(r2.status, 409);
  const v = await (await fetch(url('/api/lista-negra/verificar?valor=573193455031'))).json();
  assert.equal(v.bloqueado, true);
});

test('al cargar la base, quien está en lista negra queda descartado y NO recibe el mensaje', async () => {
  enviadosA.length = 0;
  const id = await crearEnvioSMS('Prueba lista negra');
  const d = await subirBase(id, ['3001111111', '3193455031', '3002222222']);
  assert.equal(d.validos, 2);
  assert.equal(d.lista_negra, 1);

  await fetch(url(`/api/envios/${id}/enviar`), { method: 'POST' });
  await esperar(() => db.prepare('SELECT estado FROM envios WHERE id=?').get(id).estado === 'finalizada');
  assert.ok(!enviadosA.includes('573193455031'), 'no se le debe enviar al de la lista negra');
  assert.equal(enviadosA.length, 2);
});

test('si lo agregan a la lista negra DESPUÉS de cargar la base, igual se omite y el envío sigue', async () => {
  enviadosA.length = 0;
  const id = await crearEnvioSMS('Prueba agregado tarde');
  await subirBase(id, ['3003333333', '3004444444', '3005555555']);
  await fetch(url('/api/lista-negra'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: '3004444444' }) });

  await fetch(url(`/api/envios/${id}/enviar`), { method: 'POST' });
  await esperar(() => db.prepare('SELECT estado FROM envios WHERE id=?').get(id).estado === 'finalizada');
  assert.deepEqual(enviadosA.sort(), ['573003333333', '573005555555']);
  const desc = db.prepare("SELECT * FROM descartados WHERE envio_id=? AND motivo='lista_negra'").all(id);
  assert.equal(desc.length, 1);
});

test('envío dividido: el historial muestra UNO solo, sumado, y hay UN solo informe', async () => {
  enviadosA.length = 0;
  const id = await crearEnvioSMS('Prueba dividido');
  const numeros = Array.from({ length: 9 }, (_, i) => '30100000' + String(10 + i));
  await subirBase(id, numeros);

  const div = await (await fetch(url(`/api/envios/${id}/dividir`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad: 3 }) })).json();
  assert.equal(div.ids.length, 3);
  await esperar(() => div.ids.every(h => db.prepare('SELECT estado FROM envios WHERE id=?').get(h).estado === 'finalizada'));

  const lista = await (await fetch(url('/api/envios'))).json();
  assert.ok(!lista.some(e => div.ids.includes(e.id)), 'las partes no deben aparecer sueltas en el historial');
  const padre = lista.find(e => e.id === id);
  assert.equal(padre.estado, 'finalizada');
  assert.equal(padre.total_enviados, 9);
  assert.equal(padre.total_validos, 9);
  assert.equal(padre.num_partes, 3);

  // Pedir el informe del original O de cualquier parte da el MISMO informe completo
  for (const pedido of [id, div.ids[1]]) {
    const res = await fetch(url(`/api/envios/${pedido}/informe`));
    assert.equal(res.status, 200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
    const detalle = wb.getWorksheet('Detalle de envíos');
    assert.equal(detalle.rowCount - 1, 9, 'el detalle debe traer los 9 contactos de todas las partes');
    assert.equal(wb.getWorksheet('Comprobantes').rowCount - 4, 9);
  }

  // No se puede volver a dividir ni borrar
  const otra = await fetch(url(`/api/envios/${id}/dividir`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad: 2 }) });
  assert.equal(otra.status, 400);
});

test('importar lista negra desde Excel (celulares y correos, ignora lo demás)', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Celular', 'Correo', 'Nombre'], ['3206666666', 'NoMolestar@Gmail.com', 'Ana'], ['3193455031', '', 'Repetido']]), 'H');
  const fd = new FormData();
  fd.append('archivo', new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })]), 'ln.xlsx');
  const r = await (await fetch(url('/api/lista-negra/importar'), { method: 'POST', body: fd })).json();
  assert.equal(r.agregados, 2);
  assert.equal(r.repetidos, 1);
  const ana = db.prepare("SELECT * FROM lista_negra WHERE valor='3206666666'").get();
  assert.equal(ana.nombre, 'Ana', 'debe guardar el nombre de la columna Nombre');
});
