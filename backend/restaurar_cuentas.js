// restaurar_cuentas.js — Carga las cuentas de WhatsApp y SMS si no existen.
// Se corre en cada arranque (antes del servidor). NO borra nada y NO duplica:
// si una cuenta ya está en la base, la salta.
//
// De dónde saca las cuentas (en este orden):
//   1. Variable de entorno CUENTAS_RESPALDO (en Railway → Variables). Recomendado.
//   2. Archivo backend/cuentas_respaldo.json (solo en tu PC; está en .gitignore).
// Si no encuentra ninguna de las dos, no hace nada y deja arrancar el servidor.

const fs = require('fs');
const path = require('path');

try {
  const { db, init } = require('./src/db');
  init(); // crea las tablas si la base es nueva (por ejemplo, un volumen vacío)

  let texto = process.env.CUENTAS_RESPALDO;
  let origen = 'variable CUENTAS_RESPALDO';
  const archivo = path.join(__dirname, 'cuentas_respaldo.json');
  if (!texto && fs.existsSync(archivo)) { texto = fs.readFileSync(archivo, 'utf8'); origen = 'cuentas_respaldo.json'; }
  if (!texto) { console.log('ℹ️  restaurar_cuentas: sin respaldo configurado, no se carga nada.'); process.exit(0); }

  const data = JSON.parse(texto);

  const buscaWa = db.prepare('SELECT id FROM cuentas_whatsapp WHERE wa_phone_id=?');
  const insWa = db.prepare(`INSERT INTO cuentas_whatsapp (nombre, telefono, wa_token, wa_phone_id, wa_business_id)
                            VALUES (?,?,?,?,?)`);
  const buscaSms = db.prepare('SELECT id FROM cuentas_sms WHERE nombre=? AND proveedor=?');
  const insSms = db.prepare(`INSERT INTO cuentas_sms
    (nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url, brevo_apikey, labsmobile_usuario, labsmobile_token)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  let wa = 0, sms = 0;
  db.transaction(() => {
    for (const c of (data.whatsapp || [])) {
      if (!c.wa_phone_id || buscaWa.get(c.wa_phone_id)) continue;
      insWa.run(c.nombre, c.telefono || null, c.wa_token || null, c.wa_phone_id, c.wa_business_id || null);
      console.log(`✅ WhatsApp restaurada: ${c.nombre}`); wa++;
    }
    for (const c of (data.sms || [])) {
      if (buscaSms.get(c.nombre, c.proveedor)) continue;
      insSms.run(c.nombre, c.proveedor, c.remitente || null, c.hablame_account || null, c.hablame_apikey || null,
        c.hablame_url || null, c.brevo_apikey || null, c.labsmobile_usuario || null, c.labsmobile_token || null);
      console.log(`✅ SMS restaurada: ${c.nombre} (${c.proveedor})`); sms++;
    }
  })();

  console.log(wa + sms
    ? `🎉 restaurar_cuentas (${origen}): ${wa} WhatsApp y ${sms} SMS cargadas.`
    : `✔️  restaurar_cuentas: todas las cuentas ya estaban, nada que cargar.`);
} catch (e) {
  // Nunca bloquear el arranque del servidor por esto
  console.error('⚠️  restaurar_cuentas falló (el servidor arranca igual):', e.message);
}
process.exit(0);