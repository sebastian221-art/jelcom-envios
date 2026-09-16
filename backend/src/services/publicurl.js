// Devuelve la URL pública del backend para los webhooks de Twilio.
// Antes se guardaba manualmente (ngrok, que cambiaba cada reinicio).
// Ahora el backend vive fijo en Railway, así que siempre se toma de
// la variable de entorno PUBLIC_URL.
function obtenerPublicUrl() {
  return (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
}

module.exports = { obtenerPublicUrl };