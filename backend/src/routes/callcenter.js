// ─────────────────────────────────────────────────────────────
//  RUTAS DE ADMINISTRACIÓN DEL CALL CENTER
//  Formularios (+ preguntas), tipificaciones y agentes.
// ─────────────────────────────────────────────────────────────
const express = require("express");
const { db } = require("../db");
const webrtc = require("../services/webrtc");

const router = express.Router();

// ---------- FORMULARIOS ----------
router.get("/formularios", (req, res) => {
  const forms = db.prepare("SELECT * FROM formularios ORDER BY id DESC").all();
  for (const f of forms) {
    f.preguntas = db.prepare("SELECT * FROM preguntas WHERE formulario_id=? ORDER BY orden, id").all(f.id)
      .map(p => ({ ...p, opciones: p.opciones ? JSON.parse(p.opciones) : [] }));
  }
  res.json(forms);
});

router.get("/formularios/:id", (req, res) => {
  const f = db.prepare("SELECT * FROM formularios WHERE id=?").get(req.params.id);
  if (!f) return res.status(404).json({ error: "No existe" });
  f.preguntas = db.prepare("SELECT * FROM preguntas WHERE formulario_id=? ORDER BY orden, id").all(f.id)
    .map(p => ({ ...p, opciones: p.opciones ? JSON.parse(p.opciones) : [] }));
  res.json(f);
});

// Crear/actualizar un formulario completo con sus preguntas de una vez
router.post("/formularios", (req, res) => {
  const { nombre, descripcion, preguntas } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta el nombre del formulario" });
  const info = db.prepare("INSERT INTO formularios (nombre, descripcion) VALUES (?,?)").run(nombre, descripcion || null);
  const formId = info.lastInsertRowid;
  guardarPreguntas(formId, preguntas || []);
  res.json({ id: formId });
});

router.put("/formularios/:id", (req, res) => {
  const f = db.prepare("SELECT * FROM formularios WHERE id=?").get(req.params.id);
  if (!f) return res.status(404).json({ error: "No existe" });
  const { nombre, descripcion, preguntas } = req.body;
  db.prepare("UPDATE formularios SET nombre=?, descripcion=? WHERE id=?").run(nombre ?? f.nombre, descripcion ?? f.descripcion, f.id);
  if (preguntas) {
    db.prepare("DELETE FROM preguntas WHERE formulario_id=?").run(f.id);
    guardarPreguntas(f.id, preguntas);
  }
  res.json({ ok: true });
});

router.delete("/formularios/:id", (req, res) => {
  db.prepare("DELETE FROM formularios WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

function guardarPreguntas(formId, preguntas) {
  const ins = db.prepare("INSERT INTO preguntas (formulario_id, texto, tipo, opciones, orden, obligatoria) VALUES (?,?,?,?,?,?)");
  preguntas.forEach((p, i) => {
    ins.run(formId, p.texto, p.tipo || "opcion",
      p.opciones && p.opciones.length ? JSON.stringify(p.opciones) : null,
      i, p.obligatoria ? 1 : 0);
  });
}

// ---------- TIPIFICACIONES ----------
router.get("/tipificaciones", (req, res) => {
  res.json(db.prepare("SELECT * FROM tipificaciones WHERE activa=1 ORDER BY id").all());
});
router.post("/tipificaciones", (req, res) => {
  const { nombre, color, es_exito } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta el nombre" });
  const info = db.prepare("INSERT INTO tipificaciones (nombre, color, es_exito) VALUES (?,?,?)")
    .run(nombre, color || "#6b7280", es_exito ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});
router.put("/tipificaciones/:id", (req, res) => {
  const t = db.prepare("SELECT * FROM tipificaciones WHERE id=?").get(req.params.id);
  if (!t) return res.status(404).json({ error: "No existe" });
  const { nombre, color, es_exito } = req.body;
  db.prepare("UPDATE tipificaciones SET nombre=?, color=?, es_exito=? WHERE id=?")
    .run(nombre ?? t.nombre, color ?? t.color, es_exito != null ? (es_exito ? 1 : 0) : t.es_exito, t.id);
  res.json({ ok: true });
});
router.delete("/tipificaciones/:id", (req, res) => {
  db.prepare("UPDATE tipificaciones SET activa=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- AGENTES ----------
router.get("/agentes", (req, res) => {
  res.json(db.prepare("SELECT * FROM agentes WHERE activo=1 ORDER BY id").all());
});
router.post("/agentes", (req, res) => {
  const { nombre, usuario_id } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta el nombre" });
  const info = db.prepare("INSERT INTO agentes (nombre, usuario_id) VALUES (?,?)").run(nombre, usuario_id || null);
  res.json({ id: info.lastInsertRowid });
});
router.delete("/agentes/:id", (req, res) => {
  db.prepare("UPDATE agentes SET activo=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- CAMPAÑAS DE LLAMADA ----------
router.get("/campanas-llamada", (req, res) => {
  const rows = db.prepare(`
    SELECT cl.*, c.nombre AS cliente_nombre, f.nombre AS formulario_nombre,
      (SELECT COUNT(*) FROM contactos_llamada WHERE camp_llamada_id=cl.id) AS total,
      (SELECT COUNT(*) FROM contactos_llamada WHERE camp_llamada_id=cl.id AND estado='completado') AS completados
    FROM campanas_llamada cl
    JOIN campanas c ON c.id=cl.campana_id
    LEFT JOIN formularios f ON f.id=cl.formulario_id
    ORDER BY cl.id DESC
  `).all();
  res.json(rows);
});

router.post("/campanas-llamada", (req, res) => {
  const { campana_id, nombre, formulario_id, modo_marcado } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta el nombre" });
  const info = db.prepare(
    "INSERT INTO campanas_llamada (campana_id, nombre, formulario_id, modo_marcado) VALUES (?,?,?,?)"
  ).run(campana_id || 1, nombre, formulario_id || null, modo_marcado || "manual");
  res.json({ id: info.lastInsertRowid });
});

// Subir contactos a una campaña de llamada (JSON: [{nombre, telefono}])
router.post("/campanas-llamada/:id/contactos", (req, res) => {
  const cl = db.prepare("SELECT * FROM campanas_llamada WHERE id=?").get(req.params.id);
  if (!cl) return res.status(404).json({ error: "No existe" });
  const { contactos } = req.body;
  if (!Array.isArray(contactos) || !contactos.length) return res.status(400).json({ error: "Sin contactos" });
  const ins = db.prepare("INSERT INTO contactos_llamada (camp_llamada_id, nombre, telefono) VALUES (?,?,?)");
  let n = 0;
  db.transaction(() => {
    for (const c of contactos) {
      let tel = String(c.telefono || "").replace(/\D/g, "");
      if (tel.length === 10 && tel.startsWith("3")) tel = "57" + tel;
      if (tel.length >= 10) { ins.run(cl.id, c.nombre || null, tel); n++; }
    }
  })();
  res.json({ agregados: n });
});

// ---------- AGENTE EN VIVO ----------
// Token WebRTC para el softphone del agente
router.get("/token/:agenteId", (req, res) => {
  const a = db.prepare("SELECT * FROM agentes WHERE id=?").get(req.params.agenteId);
  if (!a) return res.status(404).json({ error: "Agente no existe" });
  const r = webrtc.generarToken(`agente_${a.id}`);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
});

// Cambiar estado del agente (disponible / pausa / desconectado)
router.post("/agentes/:id/estado", (req, res) => {
  const { estado } = req.body;
  db.prepare("UPDATE agentes SET estado=? WHERE id=?").run(estado, req.params.id);
  res.json({ ok: true });
});

// Siguiente contacto a llamar de una campaña (marcación manual o automática)
router.get("/campanas-llamada/:id/siguiente", (req, res) => {
  const cl = db.prepare("SELECT * FROM campanas_llamada WHERE id=?").get(req.params.id);
  if (!cl) return res.status(404).json({ error: "No existe" });
  const c = db.prepare(
    "SELECT * FROM contactos_llamada WHERE camp_llamada_id=? AND estado='pendiente' ORDER BY id LIMIT 1"
  ).get(cl.id);
  if (!c) return res.json({ fin: true });
  res.json({ contacto: c, modo: cl.modo_marcado });
});

// Marcar que se inició la gestión de un contacto (lo toma un agente)
router.post("/contactos-llamada/:id/tomar", (req, res) => {
  const { agente_id, call_sid } = req.body;
  db.prepare("UPDATE contactos_llamada SET estado='en_curso', agente_id=?, call_sid=?, intentos=intentos+1 WHERE id=?")
    .run(agente_id || null, call_sid || null, req.params.id);
  res.json({ ok: true });
});

// Guardar la gestión: tipificación + respuestas del formulario + duración
router.post("/contactos-llamada/:id/gestion", (req, res) => {
  const cont = db.prepare("SELECT * FROM contactos_llamada WHERE id=?").get(req.params.id);
  if (!cont) return res.status(404).json({ error: "No existe" });
  const { tipificacion_id, respuestas, duracion_seg, estado } = req.body;

  db.prepare("UPDATE contactos_llamada SET tipificacion_id=?, duracion_seg=?, estado=?, atendido_en=datetime('now','localtime') WHERE id=?")
    .run(tipificacion_id || null, duracion_seg || null, estado || "completado", cont.id);

  if (Array.isArray(respuestas)) {
    db.prepare("DELETE FROM respuestas WHERE contacto_llamada_id=?").run(cont.id);
    const ins = db.prepare("INSERT INTO respuestas (contacto_llamada_id, pregunta_id, valor) VALUES (?,?,?)");
    db.transaction(() => {
      for (const r of respuestas) ins.run(cont.id, r.pregunta_id, String(r.valor ?? ""));
    })();
  }
  res.json({ ok: true });
});

// Webhook TwiML: llamada saliente desde el navegador del agente
router.post("/voz/salida", express.urlencoded({ extended: false }), (req, res) => {
  const numero = req.body.To || req.query.To || "";
  res.type("text/xml");
  res.send(webrtc.twimlSalida(numero));
});

// Progreso/tablero de una campaña de llamada
router.get("/campanas-llamada/:id/tablero", (req, res) => {
  const cl = db.prepare("SELECT * FROM campanas_llamada WHERE id=?").get(req.params.id);
  if (!cl) return res.status(404).json({ error: "No existe" });
  const total = db.prepare("SELECT COUNT(*) n FROM contactos_llamada WHERE camp_llamada_id=?").get(cl.id).n;
  const porEstado = db.prepare("SELECT estado, COUNT(*) n FROM contactos_llamada WHERE camp_llamada_id=? GROUP BY estado").all(cl.id);
  const porTip = db.prepare(`
    SELECT t.nombre, t.color, COUNT(*) n
    FROM contactos_llamada cc JOIN tipificaciones t ON t.id=cc.tipificacion_id
    WHERE cc.camp_llamada_id=? GROUP BY t.id
  `).all(cl.id);
  res.json({ total, porEstado, porTip });
});

// Informe Excel de una campaña de llamada (gestiones + respuestas)
router.get("/campanas-llamada/:id/informe", async (req, res) => {
  try {
    const ExcelJS = require("exceljs");
    const cl = db.prepare("SELECT cl.*, c.nombre AS cliente FROM campanas_llamada cl JOIN campanas c ON c.id=cl.campana_id WHERE cl.id=?").get(req.params.id);
    if (!cl) return res.status(404).json({ error: "No existe" });

    const contactos = db.prepare(`
      SELECT cc.*, a.nombre AS agente, t.nombre AS tipificacion
      FROM contactos_llamada cc
      LEFT JOIN agentes a ON a.id=cc.agente_id
      LEFT JOIN tipificaciones t ON t.id=cc.tipificacion_id
      WHERE cc.camp_llamada_id=? ORDER BY cc.id
    `).all(cl.id);

    const preguntas = cl.formulario_id
      ? db.prepare("SELECT * FROM preguntas WHERE formulario_id=? ORDER BY orden, id").all(cl.formulario_id)
      : [];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Gestiones", { views: [{ showGridLines: false }] });

    const cols = ["#", "Nombre", "Teléfono", "Estado", "Agente", "Tipificación", "Duración (seg)", ...preguntas.map(p => p.texto)];
    ws.addRow(cols);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
    ws.getRow(1).eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } }; c.alignment = { horizontal: "center" }; });

    contactos.forEach((c, i) => {
      const resp = db.prepare("SELECT pregunta_id, valor FROM respuestas WHERE contacto_llamada_id=?").all(c.id);
      const mapa = {}; resp.forEach(r => mapa[r.pregunta_id] = r.valor);
      ws.addRow([i + 1, c.nombre || "", c.telefono, c.estado, c.agente || "", c.tipificacion || "", c.duracion_seg || "", ...preguntas.map(p => mapa[p.id] || "")]);
    });

    [4, 22, 16, 14, 18, 24, 14].forEach((w, i) => ws.getColumn(i + 1).width = w);
    preguntas.forEach((p, i) => ws.getColumn(8 + i).width = 20);

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", `attachment; filename="Informe_CallCenter_${cl.nombre.replace(/\s+/g, "_")}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buffer));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;