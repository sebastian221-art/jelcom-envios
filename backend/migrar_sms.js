// migrar_sms.js — agrega lo que falta para SMS multi-proveedor SIN BORRAR datos existentes.
// Se corre UNA sola vez desde la carpeta backend.
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

// 1. Crear la tabla cuentas_sms si no existe
db.exec(`
CREATE TABLE IF NOT EXISTS cuentas_sms (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL,
  proveedor       TEXT NOT NULL DEFAULT 'hablame' CHECK (proveedor IN ('hablame','brevo')),
  remitente       TEXT,
  hablame_account TEXT,
  hablame_apikey  TEXT,
  hablame_url     TEXT,
  brevo_apikey    TEXT,
  activa          INTEGER DEFAULT 1,
  creada_en       TEXT DEFAULT (datetime('now','localtime'))
);
`);
console.log("✅ Tabla cuentas_sms lista (creada si no existía)");

// 2. Agregar la columna cuenta_sms_id a envios, solo si falta
const columnas = db.prepare("PRAGMA table_info(envios)").all();
const yaExiste = columnas.some(c => c.name === 'cuenta_sms_id');
if (!yaExiste) {
  db.exec("ALTER TABLE envios ADD COLUMN cuenta_sms_id INTEGER REFERENCES cuentas_sms(id)");
  console.log("✅ Columna cuenta_sms_id agregada a la tabla envios");
} else {
  console.log("La columna cuenta_sms_id ya existía, no se tocó nada");
}

console.log("🎉 Migración completa. Tus datos existentes (campañas, cuentas, envíos) NO se borraron.");