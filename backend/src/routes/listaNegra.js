// Rutas de LISTA NEGRA: listar, agregar, importar desde Excel, verificar y quitar.
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { db } = require("../db");
const listaNegra = require("../services/listaNegra");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Listar (con búsqueda opcional ?q= por número, correo, nombre o documento)
router.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  if (q) {
    const like = `%${q}%`;
    return res.json(db.prepare(
      "SELECT * FROM lista_negra WHERE valor LIKE ? OR nombre LIKE ? OR documento LIKE ? ORDER BY id DESC"
    ).all(like, like, like));
  }
  res.json(db.prepare("SELECT * FROM lista_negra ORDER BY id DESC").all());
});

// ¿Está este número/correo en la lista negra?  GET /verificar?valor=3193455031
router.get("/verificar", (req, res) => {
  const n = listaNegra.normalizar(req.query.valor);
  if (!n) return res.status(400).json({ error: "No es un celular colombiano ni un correo válido" });
  const fila = db.prepare("SELECT * FROM lista_negra WHERE valor=?").get(n.valor);
  res.json({ bloqueado: !!fila, registro: fila || null });
});

// Agregar uno. Body: { valor, nombre?, documento?, motivo? }
router.post("/", (req, res) => {
  const { valor, nombre, documento, motivo } = req.body;
  const n = listaNegra.normalizar(valor);
  if (!n) return res.status(400).json({ error: "Escribe un celular colombiano (10 dígitos, empieza en 3) o un correo válido" });
  const existe = db.prepare("SELECT id FROM lista_negra WHERE valor=?").get(n.valor);
  if (existe) return res.status(409).json({ error: "Ese contacto ya está en la lista negra", id: existe.id });
  const info = db.prepare("INSERT INTO lista_negra (valor, tipo, nombre, documento, motivo) VALUES (?,?,?,?,?)")
    .run(n.valor, n.tipo, nombre || null, documento || null, motivo || null);
  res.json({ id: info.lastInsertRowid, valor: n.valor, tipo: n.tipo });
});

// Importar muchos desde Excel/CSV: toma cualquier celda que sea celular o correo.
router.post("/importar", upload.single("archivo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta el archivo" });
  const motivo = req.body.motivo || "Importado desde archivo";
  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const ins = db.prepare("INSERT OR IGNORE INTO lista_negra (valor, tipo, motivo) VALUES (?,?,?)");
  let agregados = 0, repetidos = 0, ignorados = 0;
  db.transaction(() => {
    for (const nombreHoja of wb.SheetNames) {
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: "" });
      for (const fila of filas) for (const celda of fila) {
        if (String(celda).trim() === "") continue;
        const n = listaNegra.normalizar(celda);
        if (!n) { ignorados++; continue; }
        const r = ins.run(n.valor, n.tipo, motivo);
        if (r.changes) agregados++; else repetidos++;
      }
    }
  })();
  res.json({ agregados, repetidos, ignorados });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM lista_negra WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
