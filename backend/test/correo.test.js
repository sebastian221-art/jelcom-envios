'use strict';

// Tests del correo: adaptador Mailgun (sin internet: axios simulado) y
// enlace de BAJA que agrega el correo a la lista negra.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');
const express = require('express');

process.env.PUBLIC_URL = 'https://backend.ejemplo.com';
process.env.BAJA_SECRET = 'secreto-de-prueba';
process.env.MAILGUN_API_KEY = 'key-prueba';
process.env.MAILGUN_DOMAIN = 'mg.ejemplo.com';
process.env.MAILGUN_FROM = 'Cajasan <comunicaciones@mg.ejemplo.com>';

const dbModulePath = require.resolve('../src/db/index.js');
const archivoTemporal = path.join(os.tmpdir(), `jelcom-test-correo-${process.pid}.db`);
if (fs.existsSync(archivoTemporal)) fs.unlinkSync(archivoTemporal);
const db = new Database(archivoTemporal);
db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8'));
require.cache[dbModulePath] = { id: dbModulePath, filename: dbModulePath, loaded: true, exports: { db, init: () => {} } };

// axios simulado: guarda la última petición POST
const axiosPath = require.resolve('axios');
let ultima = null;
require.cache[axiosPath] = { id: axiosPath, filename: axiosPath, loaded: true,
  exports: { post: async (url, body, opts) => { ultima = { url, body, opts }; return { data: { id: '<msg-123@mg.ejemplo.com>' } }; } } };

const mailgun = require('../src/services/proveedores/mailgun.js');
const { urlBaja } = require('../src/services/correoHtml.js');

const app = express();
app.use('/api/baja', require('../src/routes/baja.js'));
const server = app.listen(0);
const local = (u) => u.replace('https://backend.ejemplo.com', `http://127.0.0.1:${server.address().port}`);
test.after(() => { server.close(); db.close(); fs.unlinkSync(archivoTemporal); });

test('Mailgun: envía al endpoint correcto con remitente, asunto, imagen y encabezados de baja', async () => {
  const r = await mailgun.enviarUno('persona@gmail.com', { asunto: 'Certificado Escolar', cuerpo: '', imagenUrl: 'https://i.ibb.co/x/pieza.jpg' });
  assert.equal(r.ok, true);
  assert.equal(r.comprobante, '<msg-123@mg.ejemplo.com>');
  assert.equal(ultima.url, 'https://api.mailgun.net/v3/mg.ejemplo.com/messages');
  assert.deepEqual(ultima.opts.auth, { username: 'api', password: 'key-prueba' });
  const f = new URLSearchParams(ultima.body);
  assert.equal(f.get('from'), 'Cajasan <comunicaciones@mg.ejemplo.com>');
  assert.equal(f.get('to'), 'persona@gmail.com');
  assert.equal(f.get('subject'), 'Certificado Escolar');
  assert.match(f.get('html'), /pieza\.jpg/);
  assert.match(f.get('html'), /darte de baja/);
  assert.match(f.get('h:List-Unsubscribe'), /^<https:\/\/backend\.ejemplo\.com\/api\/baja\?e=persona%40gmail\.com&t=[0-9a-f]{24}>$/);
  assert.equal(f.get('h:List-Unsubscribe-Post'), 'List-Unsubscribe=One-Click');
});

test('Baja: abrir el link NO da de baja; confirmar (POST) sí lo agrega a la lista negra', async () => {
  const u = local(urlBaja('Juan.Perez@gmail.com'));
  const get = await fetch(u);
  assert.equal(get.status, 200);
  assert.match(await get.text(), /Confirmar baja/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lista_negra').get().n, 0, 'solo abrir no debe dar de baja');

  const post = await fetch(u, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(post.status, 200);
  const fila = db.prepare('SELECT * FROM lista_negra').get();
  assert.equal(fila.valor, 'juanperez@gmail.com');
  assert.equal(fila.tipo, 'correo');
});

test('Baja: rechaza enlaces con la firma alterada (nadie puede dar de baja correos ajenos)', async () => {
  const u = local(urlBaja('otra@hotmail.com')).replace(/t=[0-9a-f]+/, 't=000000000000000000000000');
  const r = await fetch(u, { method: 'POST' });
  assert.equal(r.status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM lista_negra WHERE valor='otra@hotmail.com'").get().n, 0);
});
