// Conexión a la base de datos SQLite (local).
// Para migrar a PostgreSQL en Railway, este es el único archivo que cambia.
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "..", "..", "data", "jelcom.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");     // mejor concurrencia lectura/escritura
db.pragma("foreign_keys = ON");

// Inicializa el esquema si aún no existe
function init() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  console.log("✅ Base de datos lista en:", DB_PATH);
}

module.exports = { db, init };