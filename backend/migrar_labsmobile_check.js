// migrar_labsmobile_check.js — actualiza la regla de "proveedor" de cuentas_sms
// para que acepte 'labsmobile', SIN BORRAR ninguna cuenta ya guardada.
// SQLite no deja cambiar un CHECK directamente: hay que reconstruir la tabla
// con la regla nueva y copiar los datos adentro.
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

const yaTieneLabsmobile = db.prepare(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='cuentas_sms'"
).get().sql.includes('labsmobile');

if (yaTieneLabsmobile) {
  console.log("La regla ya incluye 'labsmobile', no hay que tocar nada.");
} else {
  db.pragma('foreign_keys = OFF');
  const hacer = db.transaction(() => {
    // 1. Tabla nueva, con la regla correcta
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
    // 2. Copiar todos los datos existentes
    db.exec(`
      INSERT INTO cuentas_sms_nueva
        (id, nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url,
         brevo_apikey, labsmobile_usuario, labsmobile_token, activa, creada_en)
      SELECT id, nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url,
             brevo_apikey, labsmobile_usuario, labsmobile_token, activa, creada_en
      FROM cuentas_sms;
    `);
    // 3. Reemplazar la tabla vieja por la nueva
    db.exec("DROP TABLE cuentas_sms;");
    db.exec("ALTER TABLE cuentas_sms_nueva RENAME TO cuentas_sms;");
  });
  hacer();
  db.pragma('foreign_keys = ON');
  console.log("✅ Tabla cuentas_sms reconstruida con soporte para 'labsmobile'");
}

const total = db.prepare("SELECT COUNT(*) n FROM cuentas_sms").get().n;
console.log(`🎉 Migración completa. Cuentas de SMS conservadas: ${total}`);