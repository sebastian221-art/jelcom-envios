// importar_cuentas.js — CORRE ESTO EN LA CONSOLA DE RAILWAY (backend).
// Lee cuentas_export.json (que subiste con git push) y las inserta
// DIRECTAMENTE en la base de este mismo contenedor (sin red, sin URLs).
// No duplica: si ya existe una cuenta con el mismo nombre, la salta.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const ARCHIVO = path.join(__dirname, 'cuentas_export.json');
if (!fs.existsSync(ARCHIVO)) {
  console.log('❌ No encuentro cuentas_export.json en esta carpeta. ¿Hiciste push del archivo?');
  process.exit(1);
}
const datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));

const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

// --- WhatsApp ---
const yaWa = new Set(db.prepare("SELECT nombre FROM cuentas_whatsapp").all().map(r => r.nombre));
const insertarWa = db.prepare(`INSERT INTO cuentas_whatsapp (nombre, telefono, wa_token, wa_phone_id, wa_business_id)
                                VALUES (@nombre, @telefono, @wa_token, @wa_phone_id, @wa_business_id)`);
let creadasWa = 0;
for (const c of datos.whatsapp || []) {
  if (yaWa.has(c.nombre)) { console.log(`⏭️  WhatsApp "${c.nombre}" ya existe, se omite`); continue; }
  insertarWa.run(c);
  creadasWa++;
  console.log(`✅ WhatsApp "${c.nombre}" creada`);
}

// --- SMS ---
const yaSms = new Set(db.prepare("SELECT nombre FROM cuentas_sms").all().map(r => r.nombre));
const insertarSms = db.prepare(`INSERT INTO cuentas_sms (nombre, proveedor, remitente, hablame_account, hablame_apikey,
                                  hablame_url, brevo_apikey, labsmobile_usuario, labsmobile_token)
                                 VALUES (@nombre, @proveedor, @remitente, @hablame_account, @hablame_apikey,
                                  @hablame_url, @brevo_apikey, @labsmobile_usuario, @labsmobile_token)`);
let creadasSms = 0;
for (const c of datos.sms || []) {
  if (yaSms.has(c.nombre)) { console.log(`⏭️  SMS "${c.nombre}" ya existe, se omite`); continue; }
  insertarSms.run(c);
  creadasSms++;
  console.log(`✅ SMS "${c.nombre}" creada`);
}

console.log(`\n🎉 Listo. WhatsApp creadas: ${creadasWa} · SMS creadas: ${creadasSms}`);