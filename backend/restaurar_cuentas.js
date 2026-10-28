// restaurar_cuentas.js — Vuelve a cargar las cuentas de WhatsApp y SMS desde el
// respaldo JSON (el que exportó la app). NO borra nada: si una cuenta ya existe
// (mismo wa_phone_id / mismo nombre+proveedor) la salta.
//
// Uso (dentro de la carpeta backend, con el backend DETENIDO):
//   1. Guarda tu respaldo como  backend\cuentas_respaldo.json
//   2. node restaurar_cuentas.js
//
// Opcional: node restaurar_cuentas.js otro_archivo.json

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const archivo = path.resolve(process.argv[2] || path.join(__dirname, 'cuentas_respaldo.json'));
if (!fs.existsSync(archivo)) {
  console.log(`❌ No encuentro el respaldo: ${archivo}`);
  console.log('   Guárdalo con ese nombre en la carpeta backend y vuelve a correr.');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

// Copia de seguridad de la base antes de tocar nada
const copia = path.join(__dirname, 'data', `jelcom_antes_restaurar_${Date.now()}.db`);
fs.copyFileSync(path.join(__dirname, 'data', 'jelcom.db'), copia);
console.log(`💾 Copia de seguridad creada: ${path.basename(copia)}\n`);

// ---- WhatsApp ----
const buscaWa = db.prepare('SELECT id FROM cuentas_whatsapp WHERE wa_phone_id=?');
const insWa = db.prepare(`INSERT INTO cuentas_whatsapp (nombre, telefono, wa_token, wa_phone_id, wa_business_id)
                          VALUES (?,?,?,?,?)`);
let waNuevas = 0;
for (const c of (data.whatsapp || [])) {
  const ya = buscaWa.get(c.wa_phone_id);
  if (ya) { console.log(`↷ WhatsApp ya existe: ${c.nombre} (id ${ya.id})`); continue; }
  const r = insWa.run(c.nombre, c.telefono || null, c.wa_token || null, c.wa_phone_id || null, c.wa_business_id || null);
  console.log(`✅ WhatsApp: ${c.nombre} → id ${r.lastInsertRowid}`);
  waNuevas++;
}

// ---- SMS ----
const buscaSms = db.prepare('SELECT id FROM cuentas_sms WHERE nombre=? AND proveedor=?');
const insSms = db.prepare(`INSERT INTO cuentas_sms
  (nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url, brevo_apikey, labsmobile_usuario, labsmobile_token)
  VALUES (?,?,?,?,?,?,?,?,?)`);
let smsNuevas = 0;
for (const c of (data.sms || [])) {
  const ya = buscaSms.get(c.nombre, c.proveedor);
  if (ya) { console.log(`↷ SMS ya existe: ${c.nombre} (id ${ya.id})`); continue; }
  const r = insSms.run(c.nombre, c.proveedor, c.remitente || null, c.hablame_account || null, c.hablame_apikey || null,
    c.hablame_url || null, c.brevo_apikey || null, c.labsmobile_usuario || null, c.labsmobile_token || null);
  console.log(`✅ SMS: ${c.nombre} (${c.proveedor}) → id ${r.lastInsertRowid}`);
  smsNuevas++;
}

console.log(`\n🎉 Listo: ${waNuevas} cuentas WhatsApp y ${smsNuevas} cuentas SMS restauradas.`);

// ---- Revisión de vínculos con campañas/envíos ----
console.log('\n🔎 Estado actual de cuentas y campañas:');
console.table(db.prepare('SELECT id, nombre, telefono, activa FROM cuentas_whatsapp').all());
console.table(db.prepare('SELECT id, nombre, proveedor, activa FROM cuentas_sms').all());
try {
  console.table(db.prepare('SELECT id, nombre, cuenta_wa_id FROM campanas').all());
  const huerf = db.prepare(`SELECT COUNT(*) n FROM campanas WHERE cuenta_wa_id IS NOT NULL
                            AND cuenta_wa_id NOT IN (SELECT id FROM cuentas_whatsapp)`).get().n;
  if (huerf) console.log(`⚠️  ${huerf} campaña(s) apuntan a una cuenta de WhatsApp con otro id. Pásame esta tabla y las reenlazo.`);
} catch (e) { /* sin campañas */ }
console.log('\nAhora reinicia el backend (npm start) y recarga la página.');