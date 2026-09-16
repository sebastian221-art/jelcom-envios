// backend/src/routes/apikeys.js
// Administración de API keys para sistemas externos (Satella, PSI, hospital, etc.)
const express = require("express");
const crypto = require("crypto");
const { db } = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT id, nombre, api_key, activa, creada_en, ultimo_uso FROM api_keys ORDER BY id DESC").all());
});

router.post("/", (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta el nombre del sistema" });
  const key = "jk_" + crypto.randomBytes(24).toString("hex");
  const info = db.prepare("INSERT INTO api_keys (nombre, api_key) VALUES (?,?)").run(nombre, key);
  res.json({ id: info.lastInsertRowid, nombre, api_key: key });
});

router.delete("/:id", (req, res) => {
  db.prepare("UPDATE api_keys SET activa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;