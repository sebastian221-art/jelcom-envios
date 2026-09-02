// ─────────────────────────────────────────────────────────────
//  MOTOR DE ENVÍO — único para todos los canales.
//  Procesa los contactos 'pendiente' de un ENVÍO.
//  Reintenta, se puede PAUSAR y REANUDAR, registra estado real y logs.
// ─────────────────────────────────────────────────────────────
const { db } = require("../db");
const hablame = require("./proveedores/hablame");
const brevoSms = require("./proveedores/brevo_sms");
const labsmobile = require("./proveedores/labsmobile");
const meta = require("./proveedores/meta");
const brevo = require("./proveedores/brevo");
const twilio = require("./proveedores/twilio");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const activos = new Map(); // envio_id -> { pausar: bool }

function log(envioId, mensaje, nivel = "info") {
  db.prepare("INSERT INTO logs (envio_id, nivel, mensaje) VALUES (?,?,?)").run(envioId, nivel, mensaje);
}

async function enviarSegunCanal(canal, envio, contacto) {
  if (canal === "sms") {
    // elige el proveedor según la cuenta SMS asignada
    let cuenta = null;
    if (envio.cuenta_sms_id) cuenta = db.prepare("SELECT * FROM cuentas_sms WHERE id=?").get(envio.cuenta_sms_id);
    if (cuenta && cuenta.proveedor === "brevo") return brevoSms.enviarUno(contacto.destino, envio.cuerpo, cuenta);
    if (cuenta && cuenta.proveedor === "labsmobile") return labsmobile.enviarUno(contacto.destino, envio.cuerpo, cuenta);
    return hablame.enviarUno(contacto.destino, envio.cuerpo, cuenta);
  }
  if (canal === "whatsapp") {
    let cuenta = null;
    if (envio.cuenta_wa_id) {
      cuenta = db.prepare("SELECT * FROM cuentas_whatsapp WHERE id=?").get(envio.cuenta_wa_id);
    }
    return meta.enviarUno(contacto.destino, {
      plantilla: envio.plantilla,
      idioma: envio.idioma,
      imagenUrl: envio.imagen_url,
      cuenta,
    });
  }
  if (canal === "correo") {
    return brevo.enviarUno(contacto.destino, {
      asunto: envio.asunto,
      cuerpo: envio.cuerpo,
      imagenUrl: envio.imagen_url,
      enlace: envio.enlace,
    });
  }
  if (canal === "voz") {
    // Inicia la llamada. El resultado (contestada/tecla) llega por webhook después.
    return twilio.llamar(contacto.destino, envio.id);
  }
  return { ok: false, error: `Canal ${canal} aún no implementado` };
}

async function procesar(envioId) {
  const envio = db.prepare("SELECT * FROM envios WHERE id=?").get(envioId);
  if (!envio) throw new Error("Envío no encontrado");
  if (envio.estado === "en_curso" && activos.has(envioId)) return;

  activos.set(envioId, { pausar: false });
  db.prepare("UPDATE envios SET estado='en_curso' WHERE id=?").run(envioId);
  log(envioId, "▶️ Envío iniciado / reanudado");

  const pendientes = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND estado='pendiente' ORDER BY id").all(envioId);
  log(envioId, `Pendientes por enviar: ${pendientes.length}`);

  const updOk = db.prepare("UPDATE contactos SET estado='enviado', comprobante=?, enviado_en=datetime('now','localtime'), intento=? WHERE id=?");
  const updErr = db.prepare("UPDATE contactos SET estado='error', detalle_error=?, intento=? WHERE id=?");
  const incEnv = db.prepare("UPDATE envios SET total_enviados=total_enviados+1 WHERE id=?");
  const incErr = db.prepare("UPDATE envios SET total_errores=total_errores+1 WHERE id=?");

  let ok = 0, err = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (activos.get(envioId)?.pausar) {
      db.prepare("UPDATE envios SET estado='pausada' WHERE id=?").run(envioId);
      log(envioId, "⏸️ Envío pausado. Puedes reanudarlo cuando quieras.", "warn");
      activos.delete(envioId);
      return { pausado: true, ok, err };
    }
    const c = pendientes[i];
    let enviado = false, ultimoError = "";
    for (let intento = 1; intento <= 3 && !enviado; intento++) {
      const r = await enviarSegunCanal(envio.canal, envio, c);
      if (r.ok) { updOk.run(r.comprobante || "", intento, c.id); incEnv.run(envioId); ok++; enviado = true; }
      else {
        ultimoError = r.error || "error desconocido";
        const esRed = /timeout|ECONN|network|socket|ETIMEDOUT/i.test(ultimoError);
        if (esRed && intento < 3) { log(envioId, `⚠️ ${c.destino}: fallo de red (intento ${intento}/3), reintentando...`, "warn"); await delay(3000); }
        else break;
      }
    }
    if (!enviado) { updErr.run(ultimoError, 3, c.id); incErr.run(envioId); err++; if (err <= 5) log(envioId, `❌ ${c.destino}: ${ultimoError}`, "error"); }
    if (i % 50 === 0 || i === pendientes.length - 1) log(envioId, `Progreso: ${i + 1}/${pendientes.length} · enviados ${ok} · errores ${err}`);
    await delay(300);
  }

  db.prepare("UPDATE envios SET estado='finalizada', enviado_en=datetime('now','localtime') WHERE id=?").run(envioId);
  log(envioId, `🏁 Envío finalizado. Enviados: ${ok} · Errores: ${err}`);
  activos.delete(envioId);
  return { finalizado: true, ok, err };
}

function pausar(envioId) {
  const ctrl = activos.get(envioId);
  if (ctrl) { ctrl.pausar = true; return true; }
  return false;
}

// Se llama UNA vez cuando arranca el servidor. Busca envíos que quedaron
// marcados "en_curso" pero que en realidad no tienen ningún proceso vivo
// detrás (porque el backend se reinició a mitad de un envío), y los retoma
// solos, sin que el usuario tenga que hacer nada.
function retomarEnCurso() {
  const huerfanos = db.prepare("SELECT id, nombre FROM envios WHERE estado='en_curso'").all();
  for (const e of huerfanos) {
    log(e.id, "🔄 El servidor se reinició; retomando este envío automáticamente.");
    procesar(e.id).catch(err => {
      log(e.id, "Error fatal al retomar: " + err.message, "error");
      db.prepare("UPDATE envios SET estado='error' WHERE id=?").run(e.id);
    });
  }
  if (huerfanos.length) console.log(`🔄 Retomados ${huerfanos.length} envío(s) que quedaron "en_curso" de una sesión anterior.`);
}

module.exports = { procesar, pausar, retomarEnCurso };