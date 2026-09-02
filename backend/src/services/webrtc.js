// ─────────────────────────────────────────────────────────────
//  WEBRTC (softphone del agente) con Twilio Voice SDK
//
//  Flujo:
//   1. El navegador del agente pide un TOKEN de acceso (generarToken).
//   2. Con ese token, el SDK de Twilio en el navegador se registra como
//      un "dispositivo" (Device) con la identidad del agente.
//   3. Cuando el agente llama a un cliente, el navegador hace Device.connect({To}),
//      que llega al TwiML App de Twilio → nuestro webhook /api/callcenter/voz/salida
//      → devolvemos TwiML <Dial><Number>cliente</Number></Dial> con el número Twilio
//      como identificador. Eso conecta el audio navegador ↔ cliente.
//
//  Requisitos en el .env (además de los de Twilio ya existentes):
//   TWILIO_API_KEY_SID     — API Key de Twilio (NO el Account SID)
//   TWILIO_API_KEY_SECRET  — el secreto de esa API Key
//   TWILIO_TWIML_APP_SID   — SID de una TwiML App creada en Twilio, cuya
//                            "Voice Request URL" apunte a:
//                            {PUBLIC_URL}/api/callcenter/voz/salida
// ─────────────────────────────────────────────────────────────
const twilioLib = require("twilio");
const AccessToken = twilioLib.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

function cfg() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKeySid: process.env.TWILIO_API_KEY_SID,
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET,
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID,
    numero: process.env.TWILIO_NUMERO,
  };
}

function estaConfigurado() {
  const c = cfg();
  return Boolean(c.accountSid && c.apiKeySid && c.apiKeySecret && c.twimlAppSid);
}

// Genera un token de acceso para que el navegador del agente se registre.
function generarToken(identidadAgente) {
  const c = cfg();
  if (!estaConfigurado()) return { ok: false, error: "Faltan credenciales WebRTC de Twilio (API Key / TwiML App) en .env" };

  const token = new AccessToken(c.accountSid, c.apiKeySid, c.apiKeySecret, {
    identity: identidadAgente,
    ttl: 3600, // 1 hora
  });
  const grant = new VoiceGrant({
    outgoingApplicationSid: c.twimlAppSid,
    incomingAllow: true,
  });
  token.addGrant(grant);
  return { ok: true, token: token.toJwt(), identidad: identidadAgente };
}

// TwiML para una llamada saliente desde el navegador del agente.
// 'to' es el número del cliente que el navegador manda como parámetro.
function twimlSalida(numeroCliente) {
  const c = cfg();
  const VoiceResponse = twilioLib.twiml.VoiceResponse;
  const resp = new VoiceResponse();
  if (!numeroCliente) {
    resp.say({ language: "es-MX" }, "No se indicó número de destino.");
    return resp.toString();
  }
  const to = numeroCliente.startsWith("+") ? numeroCliente : "+" + numeroCliente;
  // callerId = el número Twilio; graba la llamada
  const dial = resp.dial({ callerId: c.numero, record: "record-from-answer-dual", timeout: 30 });
  dial.number(to);
  return resp.toString();
}

module.exports = { generarToken, twimlSalida, estaConfigurado };