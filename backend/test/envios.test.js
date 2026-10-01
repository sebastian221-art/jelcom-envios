'use strict';

// Tests de DELETE /api/envios/:id (backend/src/routes/envios.js) con node --test.
//
// Usan una base SQLite TEMPORAL con el mismo esquema real (nunca la de
// backend/data/jelcom.db), montan el router real sobre un servidor Express
// efímero (puerto 0) y pegan requests HTTP reales con fetch.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
const express = require('express');

const dbModulePath = require.resolve('../src/db/index.js');

const archivoTemporal = path.join(os.tmpdir(), `jelcom-test-envios-${process.pid}.db`);
if (fs.existsSync(archivoTemporal)) fs.unlinkSync(archivoTemporal);
const dbTemporal = new Database(archivoTemporal);
dbTemporal.pragma('foreign_keys = ON'); // necesario para que el ON DELETE CASCADE de contactos/descartados/logs funcione
dbTemporal.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8'));

// Sustituye el módulo real de conexión a datos por la BD temporal ANTES de
// que las rutas de envíos (o cualquier otro) lo requieran por primera vez.
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { db: dbTemporal, init: () => {} },
};

const router = require('../src/routes/envios.js');
const app = express();
app.use(express.json());
app.use('/api/envios', router);
const server = app.listen(0);
const urlEnvio = (id) => `http://127.0.0.1:${server.address().port}/api/envios/${id}`;

test.after(() => {
  server.close();
  dbTemporal.close();
  fs.unlinkSync(archivoTemporal);
});

function crearEnvio(estado) {
  const info = dbTemporal
    .prepare("INSERT INTO envios (nombre, canal, estado) VALUES (?, 'sms', ?)")
    .run('Envío de prueba — delete', estado);
  return info.lastInsertRowid;
}

test('DELETE borra un envío en estado "borrador" sin contactos enviados', async () => {
  const id = crearEnvio('borrador');

  const res = await fetch(urlEnvio(id), { method: 'DELETE' });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(dbTemporal.prepare('SELECT * FROM envios WHERE id=?').get(id), undefined);
});

test('DELETE borra un envío en estado "lista" sin contactos enviados, en cascada con sus contactos pendientes', async () => {
  const id = crearEnvio('lista');
  dbTemporal.prepare("INSERT INTO contactos (envio_id, destino, estado) VALUES (?,?,'pendiente')").run(id, '3000000000');

  const res = await fetch(urlEnvio(id), { method: 'DELETE' });

  assert.equal(res.status, 200);
  assert.equal(dbTemporal.prepare('SELECT * FROM envios WHERE id=?').get(id), undefined);
  assert.equal(dbTemporal.prepare('SELECT * FROM contactos WHERE envio_id=?').get(id), undefined);
});

test('DELETE rechaza un envío en estado "en_curso" (ni borrador ni lista)', async () => {
  const id = crearEnvio('en_curso');

  const res = await fetch(urlEnvio(id), { method: 'DELETE' });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /borrador.*lista/);
  assert.ok(dbTemporal.prepare('SELECT * FROM envios WHERE id=?').get(id), 'el envío no debió borrarse');
});

test('DELETE rechaza un envío "lista" que ya tiene contactos enviados', async () => {
  const id = crearEnvio('lista');
  dbTemporal.prepare("INSERT INTO contactos (envio_id, destino, estado) VALUES (?,?,'enviado')").run(id, '3000000000');

  const res = await fetch(urlEnvio(id), { method: 'DELETE' });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /contactos enviados/);
  assert.ok(dbTemporal.prepare('SELECT * FROM envios WHERE id=?').get(id), 'el envío no debió borrarse');
});

test('DELETE responde 404 si el envío no existe', async () => {
  const res = await fetch(urlEnvio(999999), { method: 'DELETE' });
  assert.equal(res.status, 404);
});
