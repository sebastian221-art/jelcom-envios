'use strict';

// Tests de backend/src/errorHandlers.js con node --test (sin Jest).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const errorHandlers = require('../src/errorHandlers.js');

test('unhandledRejection: solo loguea, no cierra el proceso', () => {
  const exitOriginal = process.exit;
  const errorOriginal = console.error;
  const llamadasExit = [];
  const mensajes = [];
  process.exit = (codigo) => llamadasExit.push(codigo);
  console.error = (...args) => mensajes.push(args.join(' '));

  try {
    errorHandlers.manejarRechazoNoCapturado(new Error('rechazo de prueba'));
  } finally {
    process.exit = exitOriginal;
    console.error = errorOriginal;
  }

  assert.equal(llamadasExit.length, 0, 'no debe llamar a process.exit');
  assert.ok(mensajes.some((m) => m.includes('rechazo de prueba')), 'debe loguear el motivo del rechazo');
});

test('uncaughtException: loguea y cierra el proceso con process.exit(1)', () => {
  const exitOriginal = process.exit;
  const errorOriginal = console.error;
  const llamadasExit = [];
  const mensajes = [];
  process.exit = (codigo) => llamadasExit.push(codigo);
  console.error = (...args) => mensajes.push(args.join(' '));

  try {
    errorHandlers.manejarExcepcionNoCapturada(new Error('excepción de prueba'));
  } finally {
    process.exit = exitOriginal;
    console.error = errorOriginal;
  }

  assert.deepEqual(llamadasExit, [1], 'debe llamar a process.exit(1) exactamente una vez');
  assert.ok(mensajes.some((m) => m.includes('excepción de prueba')), 'debe loguear el error');
});

test('integración real: un uncaughtException termina el proceso con código 1', () => {
  const rutaHandlers = path.join(__dirname, '..', 'src', 'errorHandlers.js');
  const script = `
    require(${JSON.stringify(rutaHandlers)});
    setImmediate(() => { throw new Error('boom'); });
  `;
  assert.throws(
    () => execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' }),
    (err) => {
      assert.equal(err.status, 1, 'el proceso hijo debe salir con código 1');
      return true;
    }
  );
});

test('integración real: un unhandledRejection NO termina el proceso', () => {
  const rutaHandlers = path.join(__dirname, '..', 'src', 'errorHandlers.js');
  const script = `
    require(${JSON.stringify(rutaHandlers)});
    Promise.reject(new Error('boom-rejection'));
    setTimeout(() => { console.log('SIGUE_VIVO'); process.exit(0); }, 200);
  `;
  const salida = execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' }).toString();
  assert.match(salida, /SIGUE_VIVO/, 'el proceso debe seguir corriendo y llegar al setTimeout');
});
