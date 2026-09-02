// Rutas de CUENTAS DE SMS (multi-proveedor: hablame, brevo).
const express = require("express");
const { db } = require("../db");
const hablame = require("../services/proveedores/hablame");
const brevoSms = require("../services/proveedores/brevo_sms");
const labsmobile = require("../services/proveedores/labsmobile");

const router = express.Router();

// Listar (token/apikey enmascarados)
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM cuentas_sms WHERE activa=1 ORDER BY id").all();
  const safe = rows.map(r => ({
    ...r,
    hablame_apikey: r.hablame_apikey ? "••••••" : "",
    brevo_apikey: r.brevo_apikey ? "••••••" : "",
    labsmobile_token: r.labsmobile_token ? "••••••" : "",
    tiene_credenciales: !!(r.hablame_apikey || r.brevo_apikey || r.labsmobile_token),
  }));
  res.json(safe);
});

// Crear
router.post("/", (req, res) => {
  const { nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url, brevo_apikey, labsmobile_usuario, labsmobile_token } = req.body;
  if (!nombre || !proveedor) return res.status(400).json({ error: "Nombre y proveedor son obligatorios" });
  const info = db.prepare(
    `INSERT INTO cuentas_sms (nombre, proveedor, remitente, hablame_account, hablame_apikey, hablame_url, brevo_apikey, labsmobile_usuario, labsmobile_token)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(nombre, proveedor, remitente || null,
        hablame_account || null, hablame_apikey || null, hablame_url || null, brevo_apikey || null,
        labsmobile_usuario || null, labsmobile_token || null);
  res.json({ id: info.lastInsertRowid });
});

// Editar (credenciales solo si vienen no vacías)
router.put("/:id", (req, res) => {
  const c = db.prepare("SELECT * FROM cuentas_sms WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "No existe" });
  const { nombre, remitente, hablame_account, hablame_apikey, hablame_url, brevo_apikey } = req.body;
  db.prepare(
    `UPDATE cuentas_sms SET nombre=?, remitente=?, hablame_account=?, hablame_url=?,
       hablame_apikey=CASE WHEN ?<>'' THEN ? ELSE hablame_apikey END,
       brevo_apikey=CASE WHEN ?<>'' THEN ? ELSE brevo_apikey END
     WHERE id=?`
  ).run(nombre ?? c.nombre, remitente ?? c.remitente, hablame_account ?? c.hablame_account, hablame_url ?? c.hablame_url,
        hablame_apikey || "", hablame_apikey || "", brevo_apikey || "", brevo_apikey || "", c.id);
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("UPDATE cuentas_sms SET activa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Probar una cuenta
router.post("/:id/probar", async (req, res) => {
  const c = db.prepare("SELECT * FROM cuentas_sms WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "No existe" });
  const r = c.proveedor === "brevo" ? await brevoSms.probar(c) : c.proveedor === "labsmobile" ? await labsmobile.probar(c) : await hablame.probar(c);
  res.json(r);
});

module.exports = router;