// Rutas de VOCES guardadas de ElevenLabs. Se eligen por envío, en vez de
// depender de una sola voz fija en el .env.
const express = require("express");
const { db } = require("../db");
const eleven = require("../services/proveedores/elevenlabs");
const { obtenerPublicUrl } = require("../services/publicurl");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM voces_elevenlabs WHERE activa=1 ORDER BY id").all());
});

router.post("/", (req, res) => {
  const { nombre, voice_id, descripcion } = req.body;
  if (!nombre || !voice_id) return res.status(400).json({ error: "Nombre y Voice ID son obligatorios" });
  const info = db.prepare("INSERT INTO voces_elevenlabs (nombre, voice_id, descripcion) VALUES (?,?,?)")
    .run(nombre, voice_id.trim(), descripcion || null);
  res.json({ id: info.lastInsertRowid });
});

router.delete("/:id", (req, res) => {
  db.prepare("UPDATE voces_elevenlabs SET activa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Genera un audio corto de prueba con esta voz específica, para escucharla antes de usarla.
router.post("/:id/escuchar", async (req, res) => {
  const v = db.prepare("SELECT * FROM voces_elevenlabs WHERE id=?").get(req.params.id);
  if (!v) return res.status(404).json({ error: "No existe" });
  const texto = req.body?.texto || "Hola, esta es una prueba de esta voz para Jelcom.";
  const r = await eleven.generarAudio(texto, v.voice_id);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, url: `${obtenerPublicUrl()}/api/voz/audio/${r.archivo}` });
});

module.exports = router;