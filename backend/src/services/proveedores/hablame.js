// ─────────────────────────────────────────────────────────────
//  ADAPTADOR HÁBLAME (SMS)
//  Recibe credenciales por cuenta (multi-proveedor) o del .env.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");

function cred(cuenta) {
  if (cuenta && cuenta.hablame_apikey) {
    return {
      account: cuenta.hablame_account,
      apiKey: cuenta.hablame_apikey,
      remitente: cuenta.remitente,
      url: cuenta.hablame_url || "https://www.hablame.co/api/sms/v5",
    };
  }
  return {
    account: process.env.HABLAME_ACCOUNT,
    apiKey: process.env.HABLAME_API_KEY,
    remitente: process.env.HABLAME_REMITENTE,
    url: process.env.HABLAME_API_URL || "https://www.hablame.co/api/sms/v5",
  };
}

// Envía UN SMS. Devuelve { ok, comprobante, error }
async function enviarUno(telefono, texto, cuenta) {
  const c = cred(cuenta);
  if (!c.account || !c.apiKey) return { ok: false, error: "Cuenta Háblame sin credenciales" };
  try {
    const resp = await axios.post(
      `${c.url}/send`,
      {
        priority: true,
        certificate: false,
        flash: false,
        sendDate: null,
        messages: [{ to: telefono.replace(/^57/, ""), text: texto, from: c.remitente || undefined }],
      },
      { headers: { account: c.account, apikey: c.apiKey, "Content-Type": "application/json" }, timeout: 30000 }
    );
    const data = resp.data;
    const id = data?.messages?.[0]?.messageId || data?.messageId || data?.id || "enviado";
    return { ok: true, comprobante: String(id) };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.response?.data?.error || e.message };
  }
}

async function probar(cuenta) {
  const c = cred(cuenta);
  if (!c.account || !c.apiKey) return { estado: "sin_probar", detalle: "Faltan credenciales" };
  try {
    // Consulta de saldo/cuenta en Háblame
    const resp = await axios.get(`${c.url}/rate`, {
      headers: { account: c.account, apikey: c.apiKey }, timeout: 15000,
    });
    return { estado: "ok", detalle: "Conectado a Háblame" };
  } catch (e) {
    // algunos endpoints devuelven 200 solo en /send; si falla /rate, igual damos pista
    return { estado: "error", detalle: e.response?.data?.message || e.message };
  }
}

module.exports = { enviarUno, probar };