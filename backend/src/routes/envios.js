// Rutas de ENVÍOS individuales: crear, subir base, enviar, pausar, logs, informe.
const express = require("express");
const multer = require("multer");
const { db } = require("../db");
const { depurarTelefonos, depurarCorreos, analizarSMS } = require("../services/depurar");
const motor = require("../services/motor");
const informe = require("../services/informe");
const informeConsolidado = require("../services/informeConsolidado");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024 } });

router.post("/analizar-sms", (req, res) => {
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ error: "Falta texto" });
  res.json(analizarSMS(texto));
});

// Crear envío (asociado a una campaña/cliente)
router.post("/", (req, res) => {
  const { campana_id, cuenta_wa_id, cuenta_sms_id, nombre, canal, cuerpo, asunto, imagen_url, enlace, plantilla, idioma, modo_audio, audio_url, texto_voz, voz_id, tecla_captura, creado_por } = req.body;
  if (!nombre || !canal) return res.status(400).json({ error: "nombre y canal son obligatorios" });
  const info = db.prepare(
    `INSERT INTO envios (campana_id, cuenta_wa_id, cuenta_sms_id, nombre, canal, cuerpo, asunto, imagen_url, enlace, plantilla, idioma, modo_audio, audio_url, texto_voz, voz_id, tecla_captura, creado_por, estado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'borrador')`
  ).run(campana_id||1, cuenta_wa_id||null, cuenta_sms_id||null, nombre, canal, cuerpo||null, asunto||null, imagen_url||null, enlace||null, plantilla||null, idioma||null, modo_audio||null, audio_url||null, texto_voz||null, voz_id||null, tecla_captura||null, creado_por||null);
  res.json({ id: info.lastInsertRowid });
});

// Listar envíos (con nombre de campaña). Filtros: ?campana_id= &desde= &hasta= &estados=en_curso,pausada
router.get("/", (req, res) => {
  const { campana_id, desde, hasta, estados } = req.query;
  let sql = `SELECT e.*, c.nombre AS campana_nombre, c.color AS campana_color
             FROM envios e JOIN campanas c ON c.id=e.campana_id WHERE 1=1`;
  const args = [];
  if (campana_id) { sql += " AND e.campana_id=?"; args.push(campana_id); }
  if (desde) { sql += " AND date(e.creado_en)>=date(?)"; args.push(desde); }
  if (hasta) { sql += " AND date(e.creado_en)<=date(?)"; args.push(hasta); }
  if (estados) {
    const lista = estados.split(",").map(s => s.trim()).filter(Boolean);
    if (lista.length) { sql += ` AND e.estado IN (${lista.map(() => "?").join(",")})`; args.push(...lista); }
  }
  sql += " ORDER BY e.id DESC";
  res.json(db.prepare(sql).all(...args));
});

router.get("/:id", (req, res) => {
  const e = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "No existe" });
  res.json(e);
});

// Subir base y depurar
router.post("/:id/base", upload.single("archivo"), (req, res) => {
  const e = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "Envío no existe" });
  if (!req.file) return res.status(400).json({ error: "Falta el archivo" });

  const depura = e.canal === "correo" ? depurarCorreos : depurarTelefonos;
  const { validos, descartados, totalBase } = depura(req.file.buffer);

  db.prepare("DELETE FROM contactos WHERE envio_id=?").run(e.id);
  db.prepare("DELETE FROM descartados WHERE envio_id=?").run(e.id);
  const insC = db.prepare("INSERT INTO contactos (envio_id, destino) VALUES (?,?)");
  const insD = db.prepare("INSERT INTO descartados (envio_id, valor, motivo) VALUES (?,?,?)");
  db.transaction(() => {
    for (const v of validos) insC.run(e.id, v);
    for (const d of descartados) insD.run(e.id, d.valor, d.motivo);
  })();

  const dup = descartados.filter(d=>d.motivo==="duplicado").length;
  const inv = descartados.filter(d=>d.motivo==="invalido").length;
  db.prepare(`UPDATE envios SET total_base=?, total_validos=?, total_dup=?, total_invalid=?, estado='lista' WHERE id=?`)
    .run(totalBase, validos.length, dup, inv, e.id);

  res.json({ total_base: totalBase, validos: validos.length, duplicados: dup, invalidos: inv });
});

// Genera el audio de ElevenLabs si hace falta (bot de voz, modo 'texto'), una sola vez.
async function asegurarAudioVoz(e) {
  if (e.canal === "voz" && e.modo_audio === "texto" && !e.audio_url) {
    const eleven = require("../services/proveedores/elevenlabs");
    const r = await eleven.generarAudio(e.texto_voz || e.cuerpo, e.voz_id);
    if (!r.ok) throw new Error("No se pudo generar el audio: " + r.error);
    db.prepare("UPDATE envios SET audio_url=? WHERE id=?").run(r.archivo, e.id);
    e.audio_url = r.archivo;
  }
  return e;
}

router.post("/:id/enviar", async (req, res) => {
  const e = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "No existe" });
  if (e.total_validos === 0) return res.status(400).json({ error: "Sube una base primero" });

  try { await asegurarAudioVoz(e); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  motor.procesar(e.id).catch(err => {
    db.prepare("INSERT INTO logs (envio_id, nivel, mensaje) VALUES (?,?,?)").run(e.id, "error", "Error fatal: "+err.message);
    db.prepare("UPDATE envios SET estado='error' WHERE id=?").run(e.id);
  });
  res.json({ ok: true });
});

router.post("/:id/pausar", (req, res) => {
  const ok = motor.pausar(Number(req.params.id));
  res.json({ ok });
});

router.get("/:id/logs", (req, res) => {
  const desde = Number(req.query.desde || 0);
  const logs = db.prepare("SELECT * FROM logs WHERE envio_id=? AND id>? ORDER BY id").all(req.params.id, desde);
  const e = db.prepare("SELECT estado, total_enviados, total_errores, total_validos FROM envios WHERE id=?").get(req.params.id);
  res.json({ logs, envio: e });
});

router.get("/:id/informe", async (req, res) => {
  try {
    const { buffer, nombre } = await informe.generarEnvio(req.params.id);
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buffer));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Divide un envío en N sub-envíos y los lanza todos en paralelo.
// Body: { cantidad } — en cuántas partes dividirlo.
router.post("/:id/dividir", async (req, res) => {
  const original = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!original) return res.status(404).json({ error: "No existe" });
  const cantidad = Math.max(2, Number(req.body.cantidad) || 2);

  // Si es bot de voz con texto (ElevenLabs), genera el audio UNA vez antes de
  // repartir — así todos los sub-envíos comparten el mismo audio ya generado.
  try { await asegurarAudioVoz(original); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  motor.pausar(original.id);
  await new Promise(r => setTimeout(r, 1500)); // deja terminar el mensaje a medias, si había uno

  const pendientes = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND estado='pendiente'").all(original.id);
  if (pendientes.length === 0) return res.status(400).json({ error: "No hay contactos pendientes para dividir" });

  const tamanoLote = Math.ceil(pendientes.length / cantidad);
  const lotes = [];
  for (let i = 0; i < pendientes.length; i += tamanoLote) lotes.push(pendientes.slice(i, i + tamanoLote));

  const insertarEnvio = db.prepare(`
    INSERT INTO envios (campana_id, cuenta_wa_id, cuenta_sms_id, nombre, canal, estado, padre_id,
      cuerpo, asunto, imagen_url, enlace, plantilla, idioma, modo_audio, audio_url,
      texto_voz, voz_id, tecla_captura, total_base, total_validos, creado_por)
    VALUES (?,?,?,?,?, 'lista', ?, ?,?,?,?,?,?,?,?,?,?,?, ?,?, ?)
  `);
  const insertarContacto = db.prepare("INSERT INTO contactos (envio_id, destino) VALUES (?,?)");
  const nuevosIds = [];

  db.transaction(() => {
    lotes.forEach((lote, i) => {
      const info = insertarEnvio.run(
        original.campana_id, original.cuenta_wa_id, original.cuenta_sms_id,
        `${original.nombre} (parte ${i + 1}/${lotes.length})`, original.canal, original.id,
        original.cuerpo, original.asunto, original.imagen_url, original.enlace,
        original.plantilla, original.idioma, original.modo_audio, original.audio_url,
        original.texto_voz, original.voz_id, original.tecla_captura,
        lote.length, lote.length, original.creado_por
      );
      const nuevoId = info.lastInsertRowid;
      for (const c of lote) insertarContacto.run(nuevoId, c.destino);
      nuevosIds.push(nuevoId);
    });
    db.prepare("DELETE FROM contactos WHERE envio_id=? AND estado='pendiente'").run(original.id);
  })();

  nuevosIds.forEach(id => motor.procesar(id).catch(() => {}));

  res.json({ ids: nuevosIds });
});

// Informe consolidado: el envío original + todos sus sub-envíos (padre_id),
// en UN solo Excel, sumando enviados/errores sin duplicar la base.
router.get("/:id/informe-consolidado", async (req, res) => {
  try {
    const { buffer, nombre } = await informeConsolidado.generar(req.params.id);
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buffer));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;