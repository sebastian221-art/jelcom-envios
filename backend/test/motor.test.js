'use strict';

// Tests de backend/src/services/motor.js con node --test (sin Jest).
//
// Usan una base SQLite TEMPORAL con el mismo esquema real (nunca la de
// backend/data/jelcom.db) y reemplazan el proveedor Twilio en el
// require.cache por uno que lanza una excepción, para comprobar que el
// try/catch agregado alrededor del await a enviarSegunCanal() evita que
// esa excepción se propague como una promesa rechazada sin manejar.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');

const dbModulePath = require.resolve('../src/db/index.js');
const twilioModulePath = require.resolve('../src/services/proveedores/twilio.js');

const archivoTemporal = path.join(os.tmpdir(), `jelcom-test-motor-${process.pid}.db`);
if (fs.existsSync(archivoTemporal)) fs.unlinkSync(archivoTemporal);
const dbTemporal = new Database(archivoTemporal);
dbTemporal.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8'));

// Sustituye el módulo real de conexión a datos por la BD temporal ANTES de
// que motor.js (o cualquier otro) lo requiera por primera vez.
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { db: dbTemporal, init: () => {} },
};

// Sustituye Twilio por un proveedor falso que SIEMPRE tira una excepción
// (no un { ok:false }), para simular el caso que el try/catch debe atajar.
require.cache[twilioModulePath] = {
  id: twilioModulePath,
  filename: twilioModulePath,
  loaded: true,
  exports: {
    llamar: async () => { throw new Error('Fallo simulado del proveedor Twilio'); },
    probar: async () => ({ estado: 'sin_probar' }),
    estaConfigurado: () => false,
  },
};

const motor = require('../src/services/motor.js');

test.after(() => {
  dbTemporal.close();
  fs.unlinkSync(archivoTemporal);
});

test('procesar() no revienta (ni deja una promesa rechazada) cuando el proveedor lanza una excepción', async () => {
  const info = dbTemporal
    .prepare("INSERT INTO envios (nombre, canal, estado) VALUES (?, 'voz', 'lista')")
    .run('Envío de prueba — motor');
  const envioId = info.lastInsertRowid;
  dbTemporal.prepare('INSERT INTO contactos (envio_id, destino) VALUES (?,?)').run(envioId, '3000000000');

  // Si el try/catch alrededor del await no existiera, esta excepción se
  // propagaría fuera de procesar() como un rechazo de promesa: el proceso
  // que ejecuta este test seguiría vivo solo gracias a que node --test ya
  // atrapa el rechazo, pero procesar() SÍ rechazaría. Con el fix, no rechaza.
  await assert.doesNotReject(() => motor.procesar(envioId));

  const contacto = dbTemporal.prepare('SELECT * FROM contactos WHERE envio_id=?').get(envioId);
  assert.equal(contacto.estado, 'error');
  assert.match(contacto.detalle_error, /Fallo simulado del proveedor Twilio/);

  const envio = dbTemporal.prepare('SELECT * FROM envios WHERE id=?').get(envioId);
  assert.equal(envio.estado, 'finalizada');
  assert.equal(envio.total_errores, 1);
  assert.equal(envio.total_enviados, 0);

  // Prueba directa de que el proceso Node actual sigue vivo y respondiendo
  // después de la excepción simulada (no hubo process.exit ni crash).
  assert.equal(process.exitCode, undefined);
});
