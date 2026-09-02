// Devuelve la URL pública (ngrok/Railway) para los webhooks de Twilio.
// Prioridad: lo que el usuario guardó en la página de Bot de voz (BD) > el .env.
const { db } = require("../db");

function obtenerPublicUrl() {
  try {
    const row = db.prepare("SELECT valor FROM configuracion WHERE clave='public_url'").get();
    if (row && row.valor && row.valor.trim()) return row.valor.trim().replace(/\/+$/, "");
  } catch (e) { /* si la tabla no existe aún, cae al .env */ }
  return (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
}

module.exports = { obtenerPublicUrl };