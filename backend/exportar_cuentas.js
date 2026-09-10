// exportar_cuentas.js — CORRE ESTO LOCAL. Lee tus cuentas de WhatsApp y SMS
// locales y las guarda en un archivo cuentas_export.json (en la misma
// carpeta backend). Ese archivo es el que subes a GitHub/Railway.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

const whatsapp = db.prepare("SELECT nombre, telefono, wa_token, wa_phone_id, wa_business_id FROM cuentas_whatsapp WHERE activa=1").all();
const sms = db.prepare(`SELECT nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url,
                                brevo_apikey, labsmobile_usuario, labsmobile_token
                         FROM cuentas_sms WHERE activa=1`).all();

const salida = { whatsapp, sms, exportado_en: new Date().toISOString() };
fs.writeFileSync(path.join(__dirname, 'cuentas_export.json'), JSON.stringify(salida, null, 2));

console.log(`✅ Exportadas ${whatsapp.length} cuentas de WhatsApp y ${sms.length} cuentas de SMS`);
console.log('   Archivo generado: backend/cuentas_export.json');
console.log('   Ahora: git add, commit, push. Luego corre importar_cuentas.js en la consola de Railway.');