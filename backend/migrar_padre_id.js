// migrar_padre_id.js — agrega la columna padre_id a envios, SIN borrar nada.
// Corre esto UNA vez local (node migrar_padre_id.js) y luego pégalo/corre
// lo mismo en la consola de Railway (igual que hicimos con cuentas_export).
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

const columnas = db.prepare("PRAGMA table_info(envios)").all().map(c => c.name);
if (!columnas.includes('padre_id')) {
  db.exec("ALTER TABLE envios ADD COLUMN padre_id INTEGER REFERENCES envios(id)");
  console.log("✅ Columna padre_id agregada a la tabla envios");
} else {
  console.log("La columna padre_id ya existía, no se tocó nada");
}
console.log("🎉 Listo. Tus datos existentes no se borraron.");