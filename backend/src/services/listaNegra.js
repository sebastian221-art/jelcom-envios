// ─────────────────────────────────────────────────────────────
//  LISTA NEGRA — un solo lugar para saber si un contacto NO debe
//  recibir mensajes, en cualquier canal.
//  Teléfonos se guardan como 10 dígitos (3XXXXXXXXX), sin el 57,
//  para que "3193455031", "57 319 345 5031" y "+573193455031" sean
//  el mismo número. Correos en minúsculas.
// ─────────────────────────────────────────────────────────────
const { db } = require("../db");

// Devuelve { valor, tipo } normalizado, o null si no es teléfono ni correo válido.
function normalizar(entrada) {
  const txt = String(entrada == null ? "" : entrada).trim();
  if (!txt) return null;
  if (txt.includes("@")) {
    const correo = txt.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? { valor: correo, tipo: "correo" } : null;
  }
  let d = txt.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) return { valor: d, tipo: "telefono" };
  return null;
}

// destino tal como se guarda en contactos: "57XXXXXXXXXX" o un correo.
function bloqueado(destino) {
  const n = normalizar(destino);
  if (!n) return false;
  return !!db.prepare("SELECT 1 FROM lista_negra WHERE valor=?").get(n.valor);
}

// Set con todos los valores bloqueados (para filtrar bases grandes de una sola vez).
function conjunto() {
  return new Set(db.prepare("SELECT valor FROM lista_negra").all().map(r => r.valor));
}
function enConjunto(set, destino) {
  const n = normalizar(destino);
  return !!n && set.has(n.valor);
}

// Revisa los contactos PENDIENTES de un envío contra la lista negra:
// los saca del envío, los deja en "descartados" (motivo lista_negra) del envío
// raíz (el original, si es un sub-envío) y ajusta total_validos.
// Devuelve cuántos se quitaron.
function aplicarAEnvio(envioId) {
  const envio = db.prepare("SELECT id, padre_id FROM envios WHERE id=?").get(envioId);
  if (!envio) return 0;
  const raizId = envio.padre_id || envio.id;
  const set = conjunto();
  if (!set.size) return 0;
  const pendientes = db.prepare("SELECT id, destino FROM contactos WHERE envio_id=? AND estado='pendiente'").all(envioId);
  const quitar = pendientes.filter(c => enConjunto(set, c.destino));
  if (!quitar.length) return 0;
  const del = db.prepare("DELETE FROM contactos WHERE id=?");
  const insD = db.prepare("INSERT INTO descartados (envio_id, valor, motivo) VALUES (?,?, 'lista_negra')");
  db.transaction(() => {
    for (const c of quitar) { del.run(c.id); insD.run(raizId, c.destino); }
    db.prepare("UPDATE envios SET total_validos=MAX(total_validos-?,0) WHERE id=?").run(quitar.length, envioId);
  })();
  db.prepare("INSERT INTO logs (envio_id, nivel, mensaje) VALUES (?,?,?)")
    .run(envioId, "warn", `🚫 ${quitar.length} contacto(s) en lista negra excluido(s) del envío`);
  return quitar.length;
}

// Saca UN contacto pendiente (lo usa el motor justo antes de enviarle).
function excluirContacto(envioId, contacto) {
  const envio = db.prepare("SELECT id, padre_id FROM envios WHERE id=?").get(envioId);
  const raizId = envio ? (envio.padre_id || envio.id) : envioId;
  db.transaction(() => {
    db.prepare("DELETE FROM contactos WHERE id=?").run(contacto.id);
    db.prepare("INSERT INTO descartados (envio_id, valor, motivo) VALUES (?,?, 'lista_negra')").run(raizId, contacto.destino);
    db.prepare("UPDATE envios SET total_validos=MAX(total_validos-1,0) WHERE id=?").run(envioId);
  })();
}

module.exports = { normalizar, bloqueado, conjunto, enConjunto, aplicarAEnvio, excluirContacto };
