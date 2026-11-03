// ─────────────────────────────────────────────────────────────
//  HTML de los correos + enlace de BAJA (darse de baja con un clic).
//  Lo usan todos los proveedores de correo (Brevo, Mailgun...).
//  Gmail y Yahoo exigen a los envíos masivos un enlace de baja visible
//  y los encabezados List-Unsubscribe; sin eso los proveedores bloquean.
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");
const { obtenerPublicUrl } = require("./publicurl");

function secreto() {
  return process.env.BAJA_SECRET || process.env.PUBLIC_URL || "jelcom-baja";
}
// Firma corta para que nadie pueda dar de baja correos ajenos cambiando la URL.
function firmar(email) {
  return crypto.createHmac("sha256", secreto()).update(String(email).toLowerCase()).digest("hex").slice(0, 24);
}
function firmaValida(email, firma) {
  const esperada = firmar(email);
  return typeof firma === "string" && firma.length === esperada.length &&
    crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
}
function urlBaja(email) {
  const base = obtenerPublicUrl();
  if (!base) return null;
  return `${base}/api/baja?e=${encodeURIComponent(email)}&t=${firmar(email)}`;
}

// Encabezados para el botón "Cancelar suscripción" nativo de Gmail/Yahoo.
function encabezadosBaja(email) {
  const url = urlBaja(email);
  if (!url) return {};
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

function construirHtml({ cuerpo, imagenUrl, enlace, email }) {
  const parrafos = String(cuerpo || "")
    .split(/\n\n+/)
    .filter(p => p.trim())
    .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#222;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

  let imagenHtml = "";
  if (imagenUrl) {
    const img = `<img src="${imagenUrl}" alt="" style="max-width:100%;height:auto;border-radius:8px;display:block;" />`;
    imagenHtml = enlace
      ? `<div style="margin:20px 0;"><a href="${enlace}" target="_blank">${img}</a></div>`
      : `<div style="margin:20px 0;">${img}</div>`;
  }

  const url = email ? urlBaja(email) : null;
  const pie = url
    ? `<p style="margin:24px 0 0;font-size:11px;color:#888;text-align:center;">Si no deseas recibir más correos como este, <a href="${url}" style="color:#888;">haz clic aquí para darte de baja</a>.</p>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:28px;font-family:Arial,sans-serif;">
    ${parrafos}
    ${imagenHtml}
    ${pie}
  </div></body></html>`;
}

module.exports = { construirHtml, encabezadosBaja, urlBaja, firmar, firmaValida };
