// ─────────────────────────────────────────────────────────────
//  ADAPTADOR TWILIO — inicia llamadas de voz.
//  Cuando la llamada se conecta, Twilio pide instrucciones (TwiML) a
//  nuestro webhook, que le dice qué audio reproducir y captura la tecla.
//  Requiere: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMERO,
//  y PUBLIC_URL (la URL pública del backend: ngrok en local, Railway en prod).
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const { obtenerPublicUrl } = require("../publicurl");

function config() {
  return {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    numero: process.env.TWILIO_NUMERO,       // número Twilio desde el que se llama
    publicUrl: obtenerPublicUrl(),           // URL pública (BD o .env)
  };
}
function estaConfigurado() {
  const c = config();
  return Boolean(c.sid && c.token && c.numero);
}

// Inicia UNA llamada. El webhook /api/voz/twiml/:envioId le dirá qué hacer.
// Devuelve { ok, comprobante (callSid), error }
async function llamar(telefono, envioId) {
  const c = config();
  if (!estaConfigurado()) return { ok: false, error: "Twilio no configurado (.env)" };
  if (!c.publicUrl) return { ok: false, error: "Falta PUBLIC_URL (URL pública para webhooks)" };

  const to = telefono.startsWith("+") ? telefono : "+" + telefono;
  const twimlUrl = `${c.publicUrl}/api/voz/twiml/${envioId}`;
  const statusUrl = `${c.publicUrl}/api/voz/estado/${envioId}`;

  try {
    const params = new URLSearchParams();
    params.append("To", to);
    params.append("From", c.numero);
    params.append("Url", twimlUrl);                        // qué reproducir al contestar
    params.append("Method", "POST");
    params.append("StatusCallback", statusUrl);            // avisa contestada/no contestada
    params.append("StatusCallbackEvent", "completed");
    params.append("StatusCallbackMethod", "POST");
    params.append("MachineDetection", "Enable");           // detecta buzón de voz

    const resp = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Calls.json`,
      params,
      { auth: { username: c.sid, password: c.token }, timeout: 30000 }
    );
    return { ok: true, comprobante: resp.data.sid };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

// Prueba de conexión: consulta la cuenta.
async function probar() {
  const c = config();
  if (!estaConfigurado()) return { estado: "sin_probar", detalle: "Faltan credenciales en .env" };
  try {
    const resp = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${c.sid}.json`,
      { auth: { username: c.sid, password: c.token }, timeout: 15000 }
    );
    return { estado: "ok", detalle: `Cuenta: ${resp.data?.friendly_name || c.sid}` };
  } catch (e) {
    return { estado: "error", detalle: e.response?.data?.message || e.message };
  }
}

module.exports = { llamar, probar, estaConfigurado };