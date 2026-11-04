// ─────────────────────────────────────────────────────────────
//  ADAPTADOR MAILGUN (Correo)
//  Variables en Railway / .env:
//    MAILGUN_API_KEY   → Sending API key (o Private API key)
//    MAILGUN_DOMAIN    → dominio verificado, ej. mg.tudominio.com
//    MAILGUN_FROM      → remitente, ej. "Cajasan <comunicaciones@mg.tudominio.com>"
//    MAILGUN_REGION    → "us" (por defecto) o "eu"
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const { construirHtml, encabezadosBaja } = require("../correoHtml");

function config() {
  const region = (process.env.MAILGUN_REGION || "us").toLowerCase();
  return {
    apiKey: process.env.MAILGUN_API_KEY,
    dominio: process.env.MAILGUN_DOMAIN,
    from: process.env.MAILGUN_FROM,
    api: region === "eu" ? "https://api.eu.mailgun.net/v3" : "https://api.mailgun.net/v3",
  };
}
function estaConfigurado() { const c = config(); return Boolean(c.apiKey && c.dominio); }
function auth(c) { return { username: "api", password: c.apiKey }; }

// Envía UN correo. Devuelve { ok, comprobante, error }
async function enviarUno(email, { asunto, cuerpo, imagenUrl, enlace }) {
  const c = config();
  if (!estaConfigurado()) return { ok: false, error: "Mailgun no configurado (MAILGUN_API_KEY / MAILGUN_DOMAIN)" };
  const form = new URLSearchParams();
  form.append("from", c.from || `JELCOM <no-responder@${c.dominio}>`);
  form.append("to", email);
  form.append("subject", asunto || "");
  form.append("html", construirHtml({ cuerpo, imagenUrl, enlace, email }));
  for (const [k, v] of Object.entries(encabezadosBaja(email))) form.append(`h:${k}`, v);
  try {
    const resp = await axios.post(`${c.api}/${c.dominio}/messages`, form.toString(), {
      auth: auth(c), headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 30000,
    });
    return { ok: true, comprobante: resp.data?.id || "" };
  } catch (e) {
    // Se guarda el código HTTP (ej. "429: ...") para saber si fue por ir muy rápido.
    const status = e.response?.status;
    const msg = e.response?.data?.message || (typeof e.response?.data === "string" ? e.response.data.slice(0, 200) : "") || e.message;
    return { ok: false, error: status ? `${status}: ${msg}` : msg };
  }
}

// Prueba de conexión: consulta el estado del dominio en Mailgun.
async function probar() {
  const c = config();
  if (!estaConfigurado()) return { estado: "sin_probar", detalle: "Faltan MAILGUN_API_KEY y MAILGUN_DOMAIN" };
  try {
    const resp = await axios.get(`${c.api}/domains/${c.dominio}`, { auth: auth(c), timeout: 15000 });
    const dom = resp.data?.domain || {};
    const estado = dom.state;
    if (estado === "disabled" || dom.is_disabled) {
      const motivo = [dom.disabled?.reason, dom.disabled?.note].filter(Boolean).join(" — ");
      return { estado: "error", detalle: `Mailgun DESHABILITÓ el dominio ${c.dominio}${motivo ? ": " + motivo : ""}. No es DNS: revisa el correo de Mailgun o abre un ticket de soporte.` };
    }
    return estado === "active"
      ? { estado: "ok", detalle: `Dominio ${c.dominio} verificado` }
      : { estado: "error", detalle: `Dominio ${c.dominio} en estado "${estado}" (faltan registros DNS)` };
  } catch (e) {
    const status = e.response?.status;
    return { estado: "error", detalle: status === 401 ? "API key de Mailgun incorrecta" : (e.response?.data?.message || e.message) };
  }
}

module.exports = { enviarUno, probar, estaConfigurado };
