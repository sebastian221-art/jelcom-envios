// ─────────────────────────────────────────────────────────────
//  MOTOR DE ENVÍO — único para todos los canales.
//  Procesa los contactos 'pendiente' de un ENVÍO.
//  Reintenta, se puede PAUSAR y REANUDAR, registra estado real y logs.
//  Al terminar hace una SEGUNDA PASADA lenta con los que fallaron.
// ─────────────────────────────────────────────────────────────
const { db } = require("../db");
const hablame = require("./proveedores/hablame");
const brevoSms = require("./proveedores/brevo_sms");
const labsmobile = require("./proveedores/labsmobile");
const meta = require("./proveedores/meta");
const brevo = require("./proveedores/brevo");
const mailgun = require("./proveedores/mailgun");
const twilio = require("./proveedores/twilio");
const listaNegra = require("./listaNegra");

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
    // Proveedor de correo: CORREO_PROVEEDOR=mailgun en Railway para usar Mailgun.
    const proveedorCorreo = (process.env.CORREO_PROVEEDOR || "brevo").toLowerCase() === "mailgun" ? mailgun : brevo;
    return proveedorCorreo.enviarUno(contacto.destino, {
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

// ── Clasificación de errores ─────────────────────────────────
// Temporales: vale la pena reintentar (red caída, proveedor saturado,
// "vas muy rápido" = 429 / rate limit, errores 5xx del proveedor).
const esRed = (m) => /timeout|ECONN|network|socket|ETIMEDOUT|EAI_AGAIN/i.test(m || "");
const esLimite = (m) => /\b429\b|too many|rate.?limit|throttl|slow down|limit exceeded/i.test(m || "");

// Pausa (ms) entre contactos en la SEGUNDA PASADA (más lenta que la normal).
// Pausa entre contactos en la primera pasada. Correo va más despacio por defecto
// (1 por segundo ≈ 3.600/hora) para no disparar los bloqueos del proveedor.
const pausaEntre = (canal) => canal === "correo" ? (Number(process.env.CORREO_DELAY_MS) || 1000) : 300;
const delayReintento = () => Number(process.env.REINTENTO_DELAY_MS) || 1200;
// Espera base cuando el proveedor responde 429 / "vas muy rápido".
const esperaLimite = () => Number(process.env.LIMITE_ESPERA_MS) || 15000;

// Envía a UN contacto con hasta 3 intentos. Si el proveedor dice que vamos
// muy rápido (429) espera cada vez más (15 s, 30 s…) antes de volver a intentar.
async function enviarConReintentos(envioId, envio, c, factor = 1) {
  let ultimoError = "";
  for (let intento = 1; intento <= 3; intento++) {
    let r;
    try { r = await enviarSegunCanal(envio.canal, envio, c); }
    catch (e) { r = { ok: false, error: e.message || String(e) }; }
    if (r.ok) return { ok: true, comprobante: r.comprobante || "" };
    ultimoError = r.error || "error desconocido";
    if (intento === 3) break;
    if (esLimite(ultimoError)) {
      const ms = esperaLimite() * factor * intento;
      log(envioId, `🐢 ${c.destino}: el proveedor pide ir más despacio (${ultimoError.slice(0, 80)}). Esperando ${Math.round(ms / 1000)} s…`, "warn");
      await delay(ms);
    } else if (esRed(ultimoError)) {
      log(envioId, `⚠️ ${c.destino}: fallo de red (intento ${intento}/3), reintentando...`, "warn");
      await delay(3000);
    } else break; // error definitivo (correo inválido, número malo…): no insistir
  }
  return { ok: false, error: ultimoError };
}

function pausarAqui(envioId) {
  db.prepare("UPDATE envios SET estado='pausada' WHERE id=?").run(envioId);
  log(envioId, "⏸️ Envío pausado. Puedes reanudarlo cuando quieras.", "warn");
  activos.delete(envioId);
}

function finalizar(envioId) {
  db.prepare("UPDATE envios SET estado='finalizada', enviado_en=datetime('now','localtime') WHERE id=?").run(envioId);
  activos.delete(envioId);
}

// ─────────────────────────────────────────────────────────────
//  SEGUNDA PASADA: vuelve a enviar, UNO POR UNO y más despacio, a los
//  contactos que quedaron en error. Recorre todos los envíos de `ids`
//  (en un envío dividido: todas sus partes) desde UN solo proceso, así
//  no se dispara en paralelo. `todos=false` → solo los que aún no tuvieron
//  segunda pasada (intento <= 3); `todos=true` → todos los fallidos.
// ─────────────────────────────────────────────────────────────
async function segundaPasada(controlId, ids, { todos = false } = {}) {
  const marcas = ids.map(() => "?").join(",");
  const fallidos = db.prepare(
    `SELECT * FROM contactos WHERE envio_id IN (${marcas}) AND estado='error' ${todos ? "" : "AND COALESCE(intento,0) <= 3"} ORDER BY id`
  ).all(...ids);
  if (!fallidos.length) return { ok: 0, err: 0 };

  const pausa = delayReintento();
  log(controlId, `🔁 Segunda pasada: reintentando ${fallidos.length} fallido(s) más despacio (1 cada ${(pausa / 1000).toFixed(1)} s)…`);
  const envios = new Map(ids.map(id => [id, db.prepare("SELECT * FROM envios WHERE id=?").get(id)]));
  const updOk = db.prepare("UPDATE contactos SET estado='enviado', comprobante=?, enviado_en=datetime('now','localtime'), detalle_error=NULL, intento=? WHERE id=?");
  const updErr = db.prepare("UPDATE contactos SET detalle_error=?, intento=? WHERE id=?");
  const pasarAEnviado = db.prepare("UPDATE envios SET total_enviados=total_enviados+1, total_errores=MAX(total_errores-1,0) WHERE id=?");
  const quitarError = db.prepare("UPDATE envios SET total_errores=MAX(total_errores-1,0) WHERE id=?");

  let ok = 0, err = 0;
  for (let i = 0; i < fallidos.length; i++) {
    if (activos.get(controlId)?.pausar) { pausarAqui(controlId); return { pausado: true, ok, err }; }
    const c = fallidos[i];
    const intentoPrevio = Math.max(Number(c.intento) || 0, 3);
    if (listaNegra.bloqueado(c.destino)) {
      if (db.prepare("SELECT 1 FROM contactos WHERE id=?").get(c.id)) {
        listaNegra.excluirContacto(c.envio_id, c); quitarError.run(c.envio_id);
        log(controlId, `🚫 ${c.destino}: en lista negra, se omitió`, "warn");
      }
      continue;
    }
    const r = await enviarConReintentos(controlId, envios.get(c.envio_id), c, 2);
    if (r.ok) { updOk.run(r.comprobante, intentoPrevio + 1, c.id); pasarAEnviado.run(c.envio_id); ok++; }
    else { updErr.run(r.error, intentoPrevio + 1, c.id); err++; if (err <= 5) log(controlId, `❌ (2ª pasada) ${c.destino}: ${r.error}`, "error"); }
    if (i % 50 === 0 || i === fallidos.length - 1) log(controlId, `Segunda pasada: ${i + 1}/${fallidos.length} · recuperados ${ok} · siguen fallando ${err}`);
    await delay(pausa);
  }
  log(controlId, `✅ Segunda pasada terminada: recuperados ${ok} · siguen fallando ${err}`);
  return { ok, err };
}

// ¿Quedan otras partes de la misma familia corriendo, pausadas o sin arrancar?
function hermanosPendientes(envio) {
  if (!envio.padre_id) return false;
  return db.prepare("SELECT id, estado FROM envios WHERE padre_id=? AND id<>?").all(envio.padre_id, envio.id)
    .some(h => activos.has(h.id) || ["en_curso", "pausada", "lista"].includes(h.estado));
}
const familiaDe = (envio) => {
  const raiz = envio.padre_id || envio.id;
  return [raiz, ...db.prepare("SELECT id FROM envios WHERE padre_id=? ORDER BY id").all(raiz).map(h => h.id)];
};

async function procesar(envioId) {
  const envio = db.prepare("SELECT * FROM envios WHERE id=?").get(envioId);
  if (!envio) throw new Error("Envío no encontrado");
  if (envio.estado === "en_curso" && activos.has(envioId)) return;

  activos.set(envioId, { pausar: false });
  db.prepare("UPDATE envios SET estado='en_curso' WHERE id=?").run(envioId);
  log(envioId, "▶️ Envío iniciado / reanudado");
  listaNegra.aplicarAEnvio(envioId); // saca de una vez a los que ya estén en lista negra

  const pendientes = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND estado='pendiente' ORDER BY id").all(envioId);
  log(envioId, `Pendientes por enviar: ${pendientes.length}`);

  const updOk = db.prepare("UPDATE contactos SET estado='enviado', comprobante=?, enviado_en=datetime('now','localtime'), intento=? WHERE id=?");
  const updErr = db.prepare("UPDATE contactos SET estado='error', detalle_error=?, intento=3 WHERE id=?");
  const incEnv = db.prepare("UPDATE envios SET total_enviados=total_enviados+1 WHERE id=?");
  const incErr = db.prepare("UPDATE envios SET total_errores=total_errores+1 WHERE id=?");

  let ok = 0, err = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (activos.get(envioId)?.pausar) { pausarAqui(envioId); return { pausado: true, ok, err }; }
    const c = pendientes[i];
    // Revisión de último momento: si lo agregaron a la lista negra mientras
    // el envío corría, NO se le envía y se sigue con el siguiente.
    if (listaNegra.bloqueado(c.destino)) {
      const sigue = db.prepare("SELECT 1 FROM contactos WHERE id=?").get(c.id);
      if (sigue) { listaNegra.excluirContacto(envioId, c); log(envioId, `🚫 ${c.destino}: en lista negra, se omitió`, "warn"); }
      continue;
    }
    const r = await enviarConReintentos(envioId, envio, c);
    if (r.ok) { updOk.run(r.comprobante, 1, c.id); incEnv.run(envioId); ok++; }
    else { updErr.run(r.error, c.id); incErr.run(envioId); err++; if (err <= 5) log(envioId, `❌ ${c.destino}: ${r.error}`, "error"); }
    if (i % 50 === 0 || i === pendientes.length - 1) log(envioId, `Progreso: ${i + 1}/${pendientes.length} · enviados ${ok} · errores ${err}`);
    await delay(pausaEntre(envio.canal));
  }

  // Envío dividido: la segunda pasada la hace SOLO la última parte en terminar,
  // para toda la familia y de a uno (no 16 partes reintentando a la vez).
  if (hermanosPendientes(envio)) {
    finalizar(envioId);
    log(envioId, `🏁 Parte finalizada. Enviados: ${ok} · Errores: ${err}. Los fallidos se reintentan cuando terminen todas las partes.`);
    return { finalizado: true, ok, err };
  }

  log(envioId, `Primera pasada terminada. Enviados: ${ok} · Errores: ${err}`);
  const r2 = await segundaPasada(envioId, familiaDe(envio));
  if (r2.pausado) return { pausado: true, ok: ok + r2.ok, err };

  finalizar(envioId);
  log(envioId, `🏁 Envío finalizado. Enviados: ${ok + r2.ok} · Errores: ${err - r2.ok}`);
  return { finalizado: true, ok: ok + r2.ok, err: err - r2.ok };
}

// Reintento MANUAL (botón "Reintentar fallidos"): para envíos ya terminados.
// Toma a TODOS los fallidos del envío (o de todas sus partes) y los vuelve a
// enviar despacio. Devuelve cuántos va a reintentar; el trabajo sigue en segundo plano.
function reintentarFallidos(envioId) {
  const envio = db.prepare("SELECT * FROM envios WHERE id=?").get(envioId);
  if (!envio) throw new Error("Envío no encontrado");
  const ids = familiaDe(envio);
  if (ids.some(id => activos.has(id))) throw new Error("El envío todavía está corriendo; espera a que termine.");
  const marcas = ids.map(() => "?").join(",");
  const fallidos = db.prepare(`SELECT COUNT(*) n FROM contactos WHERE envio_id IN (${marcas}) AND estado='error'`).get(...ids).n;
  if (!fallidos) return { fallidos: 0 };

  // En un envío dividido corre sobre la última parte (el original no tiene contactos)
  const controlId = ids.length > 1 ? ids[ids.length - 1] : ids[0];
  activos.set(controlId, { pausar: false });
  db.prepare("UPDATE envios SET estado='en_curso' WHERE id=?").run(controlId);
  segundaPasada(controlId, ids, { todos: true })
    .then(r => { if (!r.pausado) finalizar(controlId); })
    .catch(e => { log(controlId, "Error en el reintento: " + e.message, "error"); finalizar(controlId); });
  return { fallidos };
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

module.exports = { procesar, pausar, retomarEnCurso, reintentarFallidos, esLimite };