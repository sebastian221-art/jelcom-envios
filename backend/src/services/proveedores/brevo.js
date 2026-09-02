// ─────────────────────────────────────────────────────────────
//  ADAPTADOR BREVO (Correo transaccional)
//  Cuando pegues BREVO_API_KEY en el .env, queda conectado.
//  Envía uno por uno (API transaccional) para tener logs y pausar/reanudar.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const API = "https://api.brevo.com/v3";

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

// Construye el HTML del correo: cuerpo + imagen opcional (enlazada) + enlace.
function construirHtml({ cuerpo, imagenUrl, enlace }) {
  const parrafos = String(cuerpo || "")
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#222;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  let imagenHtml = "";
  if (imagenUrl) {
    const img = `<img src="${imagenUrl}" alt="" style="max-width:100%;height:auto;border-radius:8px;" />`;
    imagenHtml = enlace
      ? `<div style="margin:20px 0;"><a href="${enlace}" target="_blank">${img}</a></div>`
      : `<div style="margin:20px 0;">${img}</div>`;
  }

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:28px;font-family:Arial,sans-serif;">
    ${parrafos}
    ${imagenHtml}
  </div></body></html>`;
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
        htmlContent: construirHtml({ cuerpo, imagenUrl, enlace }),
      },
      { headers: headers(), timeout: 30000 }
    );
    return { ok: true, comprobante: resp.data?.messageId || "" };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
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