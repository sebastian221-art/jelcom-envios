// migrar_labsmobile_voces.js — agrega lo que falta para LabsMobile y Voces
// SIN BORRAR datos existentes. Se corre UNA sola vez desde la carpeta backend.
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

// 1. Agregar columnas de LabsMobile a cuentas_sms, solo si faltan
const columnas = db.prepare("PRAGMA table_info(cuentas_sms)").all();
const nombres = columnas.map(c => c.name);

if (!nombres.includes('labsmobile_usuario')) {
  db.exec("ALTER TABLE cuentas_sms ADD COLUMN labsmobile_usuario TEXT");
  console.log("✅ Columna labsmobile_usuario agregada");
} else {
  console.log("La columna labsmobile_usuario ya existía");
}

if (!nombres.includes('labsmobile_token')) {
  db.exec("ALTER TABLE cuentas_sms ADD COLUMN labsmobile_token TEXT");
  console.log("✅ Columna labsmobile_token agregada");
} else {
  console.log("La columna labsmobile_token ya existía");
}

// 2. Crear la tabla de voces guardadas de ElevenLabs, si no existe
db.exec(`
CREATE TABLE IF NOT EXISTS voces_elevenlabs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  voice_id      TEXT NOT NULL,
  descripcion   TEXT,
  activa        INTEGER DEFAULT 1,
  creada_en     TEXT DEFAULT (datetime('now','localtime'))
);
`);
console.log("✅ Tabla voces_elevenlabs lista (creada si no existía)");

console.log("🎉 Migración completa. Tus datos existentes (cuentas, envíos, campañas) NO se borraron.");