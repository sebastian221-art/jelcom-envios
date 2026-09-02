// ─────────────────────────────────────────────────────────────
//  ADAPTADOR META / WHATSAPP
//  Ahora recibe las credenciales de una CUENTA (guardada en la BD),
//  no solo del .env. Si no se pasa cuenta, cae al .env (compatibilidad).
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const API = "https://graph.facebook.com/v21.0";

// Resuelve credenciales: prioriza la cuenta pasada; si no, usa el .env.
function cred(cuenta) {
  if (cuenta && cuenta.wa_token && cuenta.wa_phone_id) {
    return {
      token: cuenta.wa_token,
      phoneId: cuenta.wa_phone_id,
      businessId: cuenta.wa_business_id,
      idioma: process.env.WA_IDIOMA || "es",
    };
  }
  return {
    token: process.env.WA_TOKEN,
    phoneId: process.env.WA_PHONE_NUMBER_ID,
    businessId: process.env.WA_BUSINESS_ID,
    idioma: process.env.WA_IDIOMA || "es",
  };
}
function headers(c) { return { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" }; }

// Envía UN mensaje de plantilla usando las credenciales de la cuenta dada.
async function enviarUno(telefono, { plantilla, idioma, imagenUrl, cuenta }) {
  const c = cred(cuenta);
  if (!c.token || !c.phoneId) return { ok: false, error: "Cuenta de WhatsApp sin credenciales" };
  try {
    const components = [];
    if (imagenUrl) components.push({ type: "header", parameters: [{ type: "image", image: { link: imagenUrl } }] });
    const template = { name: plantilla, language: { code: idioma || c.idioma } };
    if (components.length) template.components = components;
    const resp = await axios.post(
      `${API}/${c.phoneId}/messages`,
      { messaging_product: "whatsapp", to: telefono, type: "template", template },
      { headers: headers(c), timeout: 30000 }
    );
    return { ok: true, comprobante: resp.data.messages?.[0]?.id || "" };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message };
  }
}

async function crearPlantilla({ nombre, categoria, idioma, cuerpo, tipoCabecera, imagenEjemploUrl, cuenta }) {
  const c = cred(cuenta);
  if (!c.token || !c.businessId) return { ok: false, error: "La cuenta no tiene Business ID configurado" };
  try {
    const components = [];
    if (tipoCabecera === "imagen") {
      components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [imagenEjemploUrl] } });
    }
    components.push({ type: "BODY", text: cuerpo });
    const resp = await axios.post(
      `${API}/${c.businessId}/message_templates`,
      { name: nombre, language: idioma || c.idioma, category: (categoria || "MARKETING").toUpperCase(), components },
      { headers: headers(c), timeout: 30000 }
    );
    return { ok: true, id: resp.data.id, estado: resp.data.status || "PENDING" };
  } catch (e) {
    return { ok: false, error: e.response?.data?.error?.message || e.message };
  }
}

async function estadoPlantilla(nombre, cuenta) {
  const c = cred(cuenta);
  if (!c.token || !c.businessId) return { estado: "DESCONOCIDO", motivo: "Falta configuración" };
  try {
    const resp = await axios.get(`${API}/${c.businessId}/message_templates`,
      { headers: headers(c), params: { name: nombre }, timeout: 20000 });
    const t = (resp.data?.data || [])[0];
    if (!t) return { estado: "NO_ENCONTRADA" };
    return { estado: t.status, motivo: t.rejected_reason || null };
  } catch (e) {
    return { estado: "ERROR", motivo: e.response?.data?.error?.message || e.message };
  }
}

// Prueba de conexión: prueba una cuenta concreta o la del .env.
async function probar(cuenta) {
  const c = cred(cuenta);
  if (!c.token || !c.phoneId) return { estado: "sin_probar", detalle: "Faltan credenciales" };
  try {
    const resp = await axios.get(`${API}/${c.phoneId}`, {
      headers: headers(c), params: { fields: "verified_name,display_phone_number" }, timeout: 15000,
    });
    return { estado: "ok", detalle: `${resp.data?.verified_name || ""} ${resp.data?.display_phone_number || ""}`.trim() };
  } catch (e) {
    return { estado: "error", detalle: e.response?.data?.error?.message || e.message };
  }
}

module.exports = { enviarUno, crearPlantilla, estadoPlantilla, probar };