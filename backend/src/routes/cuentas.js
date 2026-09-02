// Rutas de CUENTAS de WhatsApp: crear, listar, editar, probar.
const express = require("express");
const { db } = require("../db");
const meta = require("../services/proveedores/meta");

const router = express.Router();

// Listar cuentas (sin exponer el token completo en el listado)
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM cuentas_whatsapp WHERE activa=1 ORDER BY id").all();
  // enmascara el token para el listado
  const safe = rows.map(r => ({
    ...r,
    wa_token: r.wa_token ? r.wa_token.slice(0, 6) + "••••••" : "",
    tiene_token: !!r.wa_token,
  }));
  res.json(safe);
});

// Crear cuenta
router.post("/", (req, res) => {
  const { nombre, telefono, wa_token, wa_phone_id, wa_business_id } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta el nombre" });
  const info = db.prepare(
    `INSERT INTO cuentas_whatsapp (nombre, telefono, wa_token, wa_phone_id, wa_business_id)
     VALUES (?,?,?,?,?)`
  ).run(nombre, telefono||null, wa_token||null, wa_phone_id||null, wa_business_id||null);
  res.json({ id: info.lastInsertRowid });
});

// Editar cuenta (solo actualiza los campos enviados; token solo si viene no vacío)
router.put("/:id", (req, res) => {
  const c = db.prepare("SELECT * FROM cuentas_whatsapp WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "No existe" });
  const { nombre, telefono, wa_token, wa_phone_id, wa_business_id } = req.body;
  db.prepare(
    `UPDATE cuentas_whatsapp SET nombre=?, telefono=?, wa_phone_id=?, wa_business_id=?,
     wa_token=CASE WHEN ?<>'' THEN ? ELSE wa_token END WHERE id=?`
  ).run(nombre ?? c.nombre, telefono ?? c.telefono, wa_phone_id ?? c.wa_phone_id,
        wa_business_id ?? c.wa_business_id, wa_token||"", wa_token||"", c.id);
  res.json({ ok: true });
});

// Desactivar (borrado suave)
router.delete("/:id", (req, res) => {
  db.prepare("UPDATE cuentas_whatsapp SET activa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Probar una cuenta concreta contra Meta
router.post("/:id/probar", async (req, res) => {
  const c = db.prepare("SELECT * FROM cuentas_whatsapp WHERE id=?").get(req.params.id);
  if (!c) return res.status(404).json({ error: "No existe" });
  const r = await meta.probar(c);
  res.json(r);
});

module.exports = router;