// migrar_api_keys.js — crea la tabla api_keys, SIN borrar nada existente.
// Corre local (node migrar_api_keys.js) y luego lo mismo en la consola de Railway.
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS api_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  api_key     TEXT NOT NULL UNIQUE,
  activa      INTEGER DEFAULT 1,
  creada_en   TEXT DEFAULT (datetime('now','localtime')),
  ultimo_uso  TEXT
);
`);
console.log("✅ Tabla api_keys lista (creada si no existía)");
console.log("🎉 Listo. Tus datos existentes no se borraron.");