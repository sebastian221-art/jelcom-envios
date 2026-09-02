// ─────────────────────────────────────────────────────────────
//  ADAPTADOR LABSMOBILE (SMS)
//  API: https://api.labsmobile.com/json/send — HTTP Basic Auth
//  (usuario = email de la cuenta, contraseña = API Token)
//  Recibe credenciales por cuenta (multi-proveedor) o del .env.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const API = "https://api.labsmobile.com/json";

function cred(cuenta) {
  if (cuenta && cuenta.labsmobile_token) {
    return { usuario: cuenta.labsmobile_usuario, token: cuenta.labsmobile_token, remitente: cuenta.remitente || "Jelcom" };
  }
  return {
    usuario: process.env.LABSMOBILE_USUARIO,
    token: process.env.LABSMOBILE_TOKEN,
    remitente: process.env.LABSMOBILE_REMITENTE || "Jelcom",
  };
}
function auth(c) {
  return "Basic " + Buffer.from(`${c.usuario}:${c.token}`).toString("base64");
}

// Envía UN SMS. Devuelve { ok, comprobante, error }
async function enviarUno(telefono, texto, cuenta) {
  const c = cred(cuenta);
  if (!c.usuario || !c.token) return { ok: false, error: "Cuenta LabsMobile sin credenciales" };
  try {
    const resp = await axios.post(
      `${API}/send`,
      { message: texto, tpoa: c.remitente, recipient: [{ msisdn: telefono }] },
      { headers: { "Content-Type": "application/json", Authorization: auth(c) }, timeout: 30000 }
    );
    const data = resp.data;
    // code "0" = éxito; cualquier otro código es un error reportado por LabsMobile
    if (String(data.code) === "0" || data.code === 0) {
      return { ok: true, comprobante: data.subid || data.id || "enviado" };
    }
    return { ok: false, error: data.message || `LabsMobile código ${data.code}` };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

// Prueba de conexión: consulta el saldo de créditos.
async function probar(cuenta) {
  const c = cred(cuenta);
  if (!c.usuario || !c.token) return { estado: "sin_probar", detalle: "Faltan credenciales" };
  try {
    const resp = await axios.get(`${API}/balance`, {
      headers: { Authorization: auth(c) }, timeout: 15000,
    });
    const saldo = resp.data?.credits ?? resp.data?.balance ?? "?";
    return { estado: "ok", detalle: `Conectado a LabsMobile`, saldo: String(saldo) };
  } catch (e) {
    const status = e.response?.status;
    const msg = status === 401 ? "Usuario o token incorrecto"
              : status === 403 ? "IP no autorizada en tu cuenta LabsMobile"
              : e.response?.data?.message || e.message;
    return { estado: "error", detalle: msg };
  }
}

module.exports = { enviarUno, probar };