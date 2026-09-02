// ─────────────────────────────────────────────────────────────
//  ADAPTADOR BREVO SMS (transaccional)
//  Endpoint: https://api.brevo.com/v3/transactionalSMS/send
//  Recibe credenciales por cuenta (multi-proveedor) o del .env.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const API = "https://api.brevo.com/v3";

// Resuelve credenciales: prioriza la cuenta; si no, el .env de Brevo (correo).
function cred(cuenta) {
  if (cuenta && cuenta.brevo_apikey) {
    return { apiKey: cuenta.brevo_apikey, remitente: cuenta.remitente || "Jelcom" };
  }
  return { apiKey: process.env.BREVO_API_KEY, remitente: process.env.BREVO_SMS_REMITENTE || "Jelcom" };
}

// Envía UN SMS. Devuelve { ok, comprobante, error }
async function enviarUno(telefono, texto, cuenta) {
  const c = cred(cuenta);
  if (!c.apiKey) return { ok: false, error: "Cuenta Brevo SMS sin API key" };
  try {
    const resp = await axios.post(
      `${API}/transactionalSMS/send`,
      {
        sender: (c.remitente || "Jelcom").slice(0, 11), // máx 11 caracteres alfanumérico
        recipient: telefono, // con código de país, sin +
        content: texto,
        type: "transactional",
      },
      { headers: { "api-key": c.apiKey, "Content-Type": "application/json", accept: "application/json" }, timeout: 30000 }
    );
    const id = resp.data?.reference || resp.data?.messageId || String(resp.data?.messageId || "");
    return { ok: true, comprobante: id || "enviado" };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

// Prueba de conexión: consulta la cuenta (mismo endpoint que correo).
async function probar(cuenta) {
  const c = cred(cuenta);
  if (!c.apiKey) return { estado: "sin_probar", detalle: "Falta API key" };
  try {
    const resp = await axios.get(`${API}/account`, { headers: { "api-key": c.apiKey }, timeout: 15000 });
    return { estado: "ok", detalle: `Cuenta Brevo: ${resp.data?.email || ""}`.trim() };
  } catch (e) {
    return { estado: "error", detalle: e.response?.data?.message || e.message };
  }
}

module.exports = { enviarUno, probar };