// Rutas de USUARIOS: crear, listar, editar, activar/desactivar.
const express = require("express");
const { db } = require("../db");

const router = express.Router();

// Listar
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM usuarios ORDER BY id").all());
});

// Crear
router.post("/", (req, res) => {
  const { nombre, email, rol } = req.body;
  if (!nombre || !email) return res.status(400).json({ error: "Nombre y email son obligatorios" });
  try {
    const info = db.prepare("INSERT INTO usuarios (nombre, email, rol) VALUES (?,?,?)")
      .run(nombre, email.toLowerCase().trim(), rol || "operador");
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(400).json({ error: "Ya existe un usuario con ese email" });
    res.status(500).json({ error: e.message });
  }
});

// Editar
router.put("/:id", (req, res) => {
  const u = db.prepare("SELECT * FROM usuarios WHERE id=?").get(req.params.id);
  if (!u) return res.status(404).json({ error: "No existe" });
  const { nombre, email, rol, activo } = req.body;
  db.prepare("UPDATE usuarios SET nombre=?, email=?, rol=?, activo=? WHERE id=?")
    .run(nombre ?? u.nombre, (email ?? u.email).toLowerCase().trim(), rol ?? u.rol,
         activo != null ? (activo ? 1 : 0) : u.activo, u.id);
  res.json({ ok: true });
});

// Eliminar
router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM usuarios WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;