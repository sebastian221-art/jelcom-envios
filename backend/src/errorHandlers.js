// ─────────────────────────────────────────────────────────────
//  MANEJADORES GLOBALES DE ERRORES — red de seguridad del proceso.
//  Se cargan una sola vez, al arrancar el servidor.
//
//  - unhandledRejection: una promesa rechazada que nadie atrapó (ej. un
//    await sin try/catch en algún envío en curso). NO tumba el proceso:
//    solo se loguea, porque cortar el servidor por un error de un envío
//    individual afectaría a todos los demás envíos y usuarios activos.
//  - uncaughtException: un error síncrono que escapó de todo try/catch.
//    Acá el estado del proceso ya no es confiable (Node lo advierte
//    explícitamente), así que se loguea y se cierra con process.exit(1)
//    para que un supervisor (pm2, systemd, Railway, etc.) lo reinicie limpio.
// ─────────────────────────────────────────────────────────────

function manejarRechazoNoCapturado(razon) {
  const mensaje = razon instanceof Error ? razon.stack || razon.message : String(razon);
  console.error("⚠️  Promesa rechazada sin manejar:", mensaje);
}

function manejarExcepcionNoCapturada(error) {
  console.error("💥 Excepción no capturada:", error.stack || error.message);
  process.exit(1);
}

function registrar() {
  process.on("unhandledRejection", manejarRechazoNoCapturado);
  process.on("uncaughtException", manejarExcepcionNoCapturada);
}

registrar();

module.exports = { registrar, manejarRechazoNoCapturado, manejarExcepcionNoCapturada };
