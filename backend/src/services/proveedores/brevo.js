// ─────────────────────────────────────────────────────────────
//  ADAPTADOR BREVO (Correo transaccional)
//  Cuando pegues BREVO_API_KEY en el .env, queda conectado.
//  Envía uno por uno (API transaccional) para tener logs y pausar/reanudar.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const API = "https://api.brevo.com/v3";
const { construirHtml, encabezadosBaja } = require("../correoHtml");

function config() {
  return {
    apiKey: process.env.BREVO_API_KEY,
    remitenteNombre: process.env.BREVO_REMITENTE_NOMBRE || "JELCOM",
    remitenteEmail: process.env.BREVO_REMITENTE_EMAIL,
  };
}
function estaConfigurado() { return Boolean(config().apiKey); }
function headers() {
  return { "api-key": config().apiKey, "Content-Type": "application/json", accept: "application/json" };
}

// Envía UN correo. Devuelve { ok, comprobante, error }
async function enviarUno(email, { asunto, cuerpo, imagenUrl, enlace }) {
  const c = config();
  if (!estaConfigurado()) return { ok: false, error: "Brevo no configurado (.env)" };
  if (!c.remitenteEmail) return { ok: false, error: "Falta BREVO_REMITENTE_EMAIL en .env" };
  try {
    const resp = await axios.post(
      `${API}/smtp/email`,
      {
        sender: { name: c.remitenteNombre, email: c.remitenteEmail },
        to: [{ email }],
        subject: asunto,
        htmlContent: construirHtml({ cuerpo, imagenUrl, enlace, email }),
        headers: encabezadosBaja(email),
      },
      { headers: headers(), timeout: 30000 }
    );
    return { ok: true, comprobante: resp.data?.messageId || "" };
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.message || e.message;
    return { ok: false, error: status ? `${status}: ${msg}` : msg };
  }
}

// Prueba de conexión: consulta la cuenta.
async function probar() {
  if (!estaConfigurado()) return { estado: "sin_probar", detalle: "Falta API key en .env" };
  try {
    const resp = await axios.get(`${API}/account`, { headers: headers(), timeout: 15000 });
    const plan = resp.data?.plan?.[0];
    const saldo = plan?.credits != null ? String(plan.credits) : null;
    return { estado: "ok", detalle: `Cuenta: ${resp.data?.email || ""}`.trim(), saldo };
  } catch (e) {
    return { estado: "error", detalle: e.response?.data?.message || e.message };
  }
}

module.exports = { enviarUno, probar, estaConfigurado };