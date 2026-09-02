// Rutas de CAMPAÑAS (clientes/proyectos) + informe consolidado por rango de fechas.
const express = require("express");
const { db } = require("../db");
const informe = require("../services/informe");

const router = express.Router();

// Listar campañas con conteo de envíos
router.get("/", (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(e.id) AS num_envios
    FROM campanas c LEFT JOIN envios e ON e.campana_id=c.id
    GROUP BY c.id ORDER BY c.id
  `).all();
  res.json(rows);
});

// Crear campaña (cliente)
router.post("/", (req, res) => {
  const { nombre, color, cuenta_wa_id } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta el nombre" });
  const info = db.prepare("INSERT INTO campanas (nombre, color, cuenta_wa_id) VALUES (?,?,?)").run(nombre, color || "#FF6B00", cuenta_wa_id || null);
  res.json({ id: info.lastInsertRowid });
});

// Informe CONSOLIDADO: todos los envíos de una campaña en un rango de fechas
router.get("/:id/consolidado", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { buffer, nombre } = await informe.generarConsolidado(req.params.id, desde, hasta);
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buffer));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Asociar/cambiar la cuenta de WhatsApp por defecto de una campaña
router.put("/:id/cuenta", (req, res) => {
  const { cuenta_wa_id } = req.body;
  db.prepare("UPDATE campanas SET cuenta_wa_id=? WHERE id=?").run(cuenta_wa_id || null, req.params.id);
  res.json({ ok: true });
});

module.exports = router;