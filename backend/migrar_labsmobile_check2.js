// migrar_labsmobile_check2.js — corrige el detector del script anterior
// (que se confundía con el nombre de las columnas) y esta vez SÍ reconstruye
// la tabla si la regla de "proveedor" todavía no incluye 'labsmobile'.
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

const sqlActual = db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='cuentas_sms'"
).get().sql;

// Esta vez buscamos la palabra CON comillas simples, como aparece dentro
// de la regla CHECK (...'labsmobile'...) — así no se confunde con el
// nombre de columna "labsmobile_usuario".
const reglaYaCorrecta = sqlActual.includes("'labsmobile'");

if (reglaYaCorrecta) {
  console.log("La regla del CHECK ya incluye 'labsmobile' de verdad. No hay que tocar nada.");
} else {
  console.log("Confirmado: la regla del CHECK sigue vieja. Reconstruyendo la tabla...");
  db.pragma('foreign_keys = OFF');
  const hacer = db.transaction(() => {
    db.exec(`
      CREATE TABLE cuentas_sms_nueva (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre          TEXT NOT NULL,
        proveedor       TEXT NOT NULL DEFAULT 'hablame' CHECK (proveedor IN ('hablame','brevo','labsmobile')),
        remitente       TEXT,
        hablame_account TEXT,
        hablame_apikey  TEXT,
        hablame_url     TEXT,
        brevo_apikey    TEXT,
        labsmobile_usuario TEXT,
        labsmobile_token   TEXT,
        activa          INTEGER DEFAULT 1,
        creada_en       TEXT DEFAULT (datetime('now','localtime'))
      );
    `);
    db.exec(`
      INSERT INTO cuentas_sms_nueva
        (id, nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url,
         brevo_apikey, labsmobile_usuario, labsmobile_token, activa, creada_en)
      SELECT id, nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url,
             brevo_apikey, labsmobile_usuario, labsmobile_token, activa, creada_en
      FROM cuentas_sms;
    `);
    db.exec("DROP TABLE cuentas_sms;");
    db.exec("ALTER TABLE cuentas_sms_nueva RENAME TO cuentas_sms;");
  });
  hacer();
  db.pragma('foreign_keys = ON');
  console.log("✅ Tabla cuentas_sms reconstruida de verdad esta vez, con 'labsmobile' en la regla.");
}

const total = db.prepare("SELECT COUNT(*) n FROM cuentas_sms").get().n;
const verif = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cuentas_sms'").get().sql;
console.log(`Cuentas conservadas: ${total}`);
console.log(`Regla final: ${verif.includes("'labsmobile'") ? "✅ correcta (incluye labsmobile)" : "❌ algo salió mal"}`);