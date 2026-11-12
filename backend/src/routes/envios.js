// Rutas de ENVÍOS individuales: crear, subir base, enviar, pausar, logs, informe.
const express = require("express");
const multer = require("multer");
const { db } = require("../db");
const { depurarTelefonos, depurarCorreos, analizarSMS, normTelefono, detectarColumna, EMAIL_RE, corregirDominio } = require("../services/depurar");
const { leerTarifas } = require("./tarifas");
const motor = require("../services/motor");
const informe = require("../services/informe");
const listaNegra = require("../services/listaNegra");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20*1024*1024 } });

// ─────────────────────────────────────────────────────────────
//  ENVÍOS DIVIDIDOS: un envío que se partió en sub-envíos se trata
//  SIEMPRE como uno solo hacia afuera — los sub-envíos no aparecen en
//  el historial, los totales se suman y hay UN solo informe.
// ─────────────────────────────────────────────────────────────
const hijosDe = (id) => db.prepare("SELECT * FROM envios WHERE padre_id=? ORDER BY id").all(id);

// Estado del conjunto: en_curso si alguna parte corre, pausada si alguna
// está pausada, finalizada cuando todas terminaron.
function estadoFamilia(hijos) {
  const est = hijos.map(h => h.estado);
  if (est.includes("en_curso")) return "en_curso";
  if (est.includes("pausada")) return "pausada";
  if (est.every(e => ["finalizada", "error"].includes(e))) return est.every(e => e === "error") ? "error" : "finalizada";
  return "en_curso"; // alguna parte aún en 'lista' esperando arrancar
}

// Devuelve el envío con los números de TODA su familia (original + partes).
function vistaAgregada(e) {
  if (!e || e.padre_id) return e;
  const hijos = hijosDe(e.id);
  if (!hijos.length) return e;
  const ids = [e.id, ...hijos.map(h => h.id)];
  const marcas = ids.map(() => "?").join(",");
  const validos = db.prepare(`SELECT COUNT(*) n FROM contactos WHERE envio_id IN (${marcas})`).get(...ids).n;
  const fines = hijos.map(h => h.enviado_en).filter(Boolean).sort();
  return {
    ...e,
    estado: estadoFamilia(hijos),
    total_validos: validos,
    total_enviados: hijos.reduce((a, h) => a + (h.total_enviados || 0), e.total_enviados || 0),
    total_errores: hijos.reduce((a, h) => a + (h.total_errores || 0), e.total_errores || 0),
    enviado_en: fines.length ? fines[fines.length - 1] : e.enviado_en,
    dividido: true,
    num_partes: hijos.length,
    partes: hijos.map(h => h.id),
  };
}

router.post("/analizar-sms", (req, res) => {
  const { texto } = req.body;
  if (!texto) return res.status(400).json({ error: "Falta texto" });
  res.json(analizarSMS(texto));
});

// Valida una base SIN crear nada: mismas reglas que /:id/base (depurar.js +
// lista negra). multipart: archivo + canal (sms | whatsapp | correo | voz).
// Sirve para revisar antes de crear el envío y explicar qué se descarta.
router.post("/validar-base", upload.single("archivo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Falta el archivo" });
  const canal = String(req.body?.canal || "sms");
  try {
    const depura = canal === "correo" ? depurarCorreos : depurarTelefonos;
    const { validos: crudos, descartados, totalBase } = depura(req.file.buffer);
    const bloqueados = listaNegra.conjunto();
    const validos = crudos.filter((v) => !listaNegra.enConjunto(bloqueados, v));
    const col = detectarColumna(req.file.buffer, canal);
    const inv = descartados.filter((d) => d.motivo === "invalido");
    res.json({
      canal, archivo: req.file.originalname, total_base: totalBase, validos: validos.length,
      duplicados: descartados.filter((d) => d.motivo === "duplicado").length, invalidos: inv.length,
      lista_negra: crudos.length - validos.length,
      columna: col.columna, modo_lectura: col.modo, encabezados: col.encabezados.slice(0, 15),
      muestra_validos: validos.slice(0, 5), muestra_invalidos: inv.slice(0, 8).map((d) => d.valor),
    });
  } catch (e) { res.status(400).json({ error: `No pude leer la base: ${e.message}` }); }
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
// Los sub-envíos (partes de un envío dividido) NO se listan por separado:
// se muestran sumados dentro de su envío original. ?incluir_partes=1 para verlos.
router.get("/", (req, res) => {
  const { campana_id, desde, hasta, estados, incluir_partes } = req.query;
  let sql = `SELECT e.*, c.nombre AS campana_nombre, c.color AS campana_color
             FROM envios e JOIN campanas c ON c.id=e.campana_id WHERE 1=1`;
  const args = [];
  if (!incluir_partes) sql += " AND e.padre_id IS NULL";
  if (campana_id) { sql += " AND e.campana_id=?"; args.push(campana_id); }
  if (desde) { sql += " AND date(e.creado_en)>=date(?)"; args.push(desde); }
  if (hasta) { sql += " AND date(e.creado_en)<=date(?)"; args.push(hasta); }
  sql += " ORDER BY e.id DESC";
  let filas = db.prepare(sql).all(...args).map(vistaAgregada);
  if (estados) {
    const lista = estados.split(",").map(s => s.trim()).filter(Boolean);
    if (lista.length) filas = filas.filter(e => lista.includes(e.estado));
  }
  res.json(filas);
});

router.get("/:id", (req, res) => {
  const e = db.prepare(`SELECT e.*, c.nombre AS campana_nombre FROM envios e
                        LEFT JOIN campanas c ON c.id=e.campana_id WHERE e.id=?`).get(req.params.id);
  if (!e) return res.status(404).json({ error: "No existe" });
  res.json(vistaAgregada(e));
});

// Borra un envío. Solo se permite si todavía no se procesó nada: estado
// 'borrador' o 'lista' (nunca en_curso/pausada/finalizada/error) y ningún
// contacto fue efectivamente enviado (evita perder el historial de un envío real).
router.delete("/:id", (req, res) => {
  const e = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "No existe" });

  if (hijosDe(e.id).length) {
    return res.status(400).json({ error: "No se puede borrar: este envío ya fue dividido en partes" });
  }
  if (!["borrador", "lista"].includes(e.estado)) {
    return res.status(400).json({ error: "Solo se puede borrar un envío en estado 'borrador' o 'lista'" });
  }

  const { total } = db.prepare("SELECT COUNT(*) AS total FROM contactos WHERE envio_id=? AND estado<>'pendiente'").get(e.id);
  if (total > 0) {
    return res.status(400).json({ error: "No se puede borrar: el envío ya tiene contactos enviados" });
  }

  db.prepare("DELETE FROM envios WHERE id=?").run(e.id); // contactos/descartados/logs caen por ON DELETE CASCADE
  res.json({ ok: true });
});

// Subir base y depurar
router.post("/:id/base", upload.single("archivo"), (req, res) => {
  const e = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "Envío no existe" });
  if (!req.file) return res.status(400).json({ error: "Falta el archivo" });

  const depura = e.canal === "correo" ? depurarCorreos : depurarTelefonos;
  const resultado = depura(req.file.buffer);
  const { descartados, totalBase } = resultado;

  // Quita a quienes están en la lista negra (pidieron no recibir más mensajes)
  const bloqueados = listaNegra.conjunto();
  const validos = [];
  for (const v of resultado.validos) {
    if (listaNegra.enConjunto(bloqueados, v)) descartados.push({ valor: v, motivo: "lista_negra" });
    else validos.push(v);
  }

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

  const ln = descartados.filter(d=>d.motivo==="lista_negra").length;
  res.json({ total_base: totalBase, validos: validos.length, duplicados: dup, invalidos: inv, lista_negra: ln });
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

  // Envío dividido: "reanudar" el original = reanudar sus partes pausadas.
  const hijos = hijosDe(e.id);
  if (hijos.length) {
    hijos.filter(h => ["pausada", "lista"].includes(h.estado)).forEach(h => motor.procesar(h.id).catch(() => {}));
    return res.json({ ok: true, partes: hijos.length });
  }
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
  const hijos = hijosDe(Number(req.params.id));
  if (hijos.length) {
    const ok = hijos.map(h => motor.pausar(h.id)).some(Boolean);
    return res.json({ ok });
  }
  const ok = motor.pausar(Number(req.params.id));
  res.json({ ok });
});

// Reintentar fallidos (manual): vuelve a enviar, despacio y de a uno, a todos
// los contactos que quedaron en error (en un envío dividido: de todas sus partes).
router.post("/:id/reintentar-fallidos", (req, res) => {
  try { res.json({ ok: true, ...motor.reintentarFallidos(Number(req.params.id)) }); }
  catch (e) { res.status(e.message.includes("corriendo") ? 409 : 400).json({ error: e.message }); }
});

router.get("/:id/logs", (req, res) => {
  const desde = Number(req.query.desde || 0);
  const e = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "No existe" });
  const ids = [e.id, ...hijosDe(e.id).map(h => h.id)];
  const logs = db.prepare(`SELECT * FROM logs WHERE envio_id IN (${ids.map(() => "?").join(",")}) AND id>? ORDER BY id`).all(...ids, desde);
  const v = vistaAgregada(e);
  res.json({ logs, envio: { estado: v.estado, total_enviados: v.total_enviados, total_errores: v.total_errores, total_validos: v.total_validos } });
});

// Informe Excel. Si el envío se dividió (o si piden el de una de sus partes),
// devuelve UN SOLO informe unificado con todo el envío original + sus partes.
async function enviarInforme(req, res) {
  try {
    const { buffer, nombre } = await informe.generarEnvio(req.params.id);
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buffer));
  } catch (e) { res.status(500).json({ error: e.message }); }
}
router.get("/:id/informe", enviarInforme);
router.get("/:id/informe-consolidado", enviarInforme); // mismo informe unificado (se deja por compatibilidad)

// Divide un envío en N sub-envíos y los lanza todos en paralelo.
// Body: { cantidad } — en cuántas partes dividirlo.
router.post("/:id/dividir", async (req, res) => {
  const original = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!original) return res.status(404).json({ error: "No existe" });
  // Correo NO se divide: mandar en paralelo es lo que hace que el proveedor bloquee el dominio.
  if (original.canal === "correo") return res.status(400).json({ error: "Los correos no se dividen: en paralelo el proveedor bloquea el dominio. Desmarca 'Dividir' y envíalo normal (va a 1 por segundo)." });
  const cantidad = Math.max(2, Number(req.body.cantidad) || 2);

  // Si es bot de voz con texto (ElevenLabs), genera el audio UNA vez antes de
  // repartir — así todos los sub-envíos comparten el mismo audio ya generado.
  try { await asegurarAudioVoz(original); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  if (original.padre_id) return res.status(400).json({ error: "Este ya es una parte de un envío dividido" });
  if (hijosDe(original.id).length) return res.status(400).json({ error: "Este envío ya fue dividido" });

  motor.pausar(original.id);
  await new Promise(r => setTimeout(r, 1500)); // deja terminar el mensaje a medias, si había uno
  listaNegra.aplicarAEnvio(original.id); // nadie de la lista negra pasa a las partes

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

// ── Familia: detalle de un envío (dividido o no) como UNO solo ──────────────
// Raíz + partes + totales sumados + pendientes + últimos errores y logs de todas
// las partes. Funciona consultando por el original o por cualquier parte.
function familiaDe(id) {
  let raiz = db.prepare(`SELECT e.*, c.nombre AS campana_nombre FROM envios e LEFT JOIN campanas c ON c.id=e.campana_id WHERE e.id=?`).get(id);
  if (raiz && raiz.padre_id) raiz = db.prepare(`SELECT e.*, c.nombre AS campana_nombre FROM envios e LEFT JOIN campanas c ON c.id=e.campana_id WHERE e.id=?`).get(raiz.padre_id);
  if (!raiz) return null;
  const partes = hijosDe(raiz.id);
  const ids = [raiz.id, ...partes.map((p) => p.id)];
  const marcas = ids.map(() => "?").join(",");
  const porEstado = {};
  for (const r of db.prepare(`SELECT estado, COUNT(*) AS n FROM contactos WHERE envio_id IN (${marcas}) GROUP BY estado`).all(...ids)) porEstado[r.estado] = r.n;
  const v = vistaAgregada(raiz);
  const pendientes = porEstado.pendiente || 0;
  const logs = db.prepare(`SELECT envio_id, ts, nivel, mensaje FROM logs WHERE envio_id IN (${marcas}) ORDER BY id DESC LIMIT 40`).all(...ids).reverse();
  return {
    raiz: { ...raiz, estado: v.estado }, partes, ids, dividido: partes.length > 0, estado: v.estado,
    totales: { base: raiz.total_base || 0, validos: v.total_validos || 0, duplicados: raiz.total_dup || 0, invalidos: raiz.total_invalid || 0, enviados: v.total_enviados || 0, errores: v.total_errores || 0, pendientes, procesados: (v.total_enviados || 0) + (v.total_errores || 0), por_estado: porEstado },
    errores_recientes: logs.filter((l) => l.nivel === "error").slice(-8).map((l) => l.mensaje),
    logs,
  };
}

router.get("/:id/familia", (req, res) => {
  const f = familiaDe(req.params.id);
  if (!f) return res.status(404).json({ error: "No existe" });
  res.json(f);
});

// ── Costo: estimado (antes de disparar) y real (lo que ya salió) ────────────
// Usa las tarifas de Configuración (routes/tarifas.js). Si falta una tarifa,
// lo dice en `faltan` en vez de inventar un número. Suma todas las partes.
function costoDe(id) {
  const f = familiaDe(id);
  if (!f) return null;
  const e = f.raiz; const t = leerTarifas(); const faltan = []; const supuestos = [];
  const tarifa = (...claves) => { for (const k of claves) if (t[k] != null && t[k] !== "") return Number(t[k]); faltan.push(claves[0]); return null; };
  let unidad = "mensaje", precio = null, estimadas = f.totales.validos, reales = f.totales.enviados;
  if (e.canal === "sms") {
    const a = analizarSMS(e.cuerpo || "");
    unidad = `segmento (${a.segmentos} por SMS, ${a.codificacion})`;
    const cuenta = e.cuenta_sms_id ? db.prepare("SELECT proveedor FROM cuentas_sms WHERE id=?").get(e.cuenta_sms_id) : null;
    precio = tarifa(`tarifa_sms_${(cuenta && cuenta.proveedor) || "hablame"}`, "tarifa_sms");
    estimadas *= a.segmentos; reales *= a.segmentos;
  } else if (e.canal === "whatsapp") {
    const pl = e.plantilla ? db.prepare("SELECT categoria FROM plantillas WHERE nombre=? ORDER BY id DESC LIMIT 1").get(e.plantilla) : null;
    const cat = String((pl && pl.categoria) || "marketing").toLowerCase();
    if (!pl) supuestos.push("categoría de plantilla supuesta: marketing");
    precio = tarifa(`tarifa_whatsapp_${cat}`, "tarifa_whatsapp"); unidad = `mensaje WhatsApp (${cat})`;
  } else if (e.canal === "correo") {
    precio = tarifa("tarifa_correo"); unidad = "correo";
  } else if (e.canal === "voz") {
    precio = tarifa("tarifa_voz_minuto"); unidad = "minuto de llamada contestada";
    const marcas = f.ids.map(() => "?").join(",");
    const r = db.prepare(`SELECT COALESCE(SUM((duracion_seg + 59) / 60), 0) AS min FROM contactos WHERE envio_id IN (${marcas}) AND estado='contestada'`).get(...f.ids);
    reales = Number(r.min) || 0;
    supuestos.push("estimado = 1 minuto por contacto si todos contestan (máximo)");
  }
  const r2 = (n) => (precio == null ? null : Math.round(n * precio * 100) / 100);
  return { envio_id: e.id, canal: e.canal, moneda: t.moneda || "COP", unidad, tarifa: precio, unidades: { estimadas, reales }, costo: { estimado: r2(estimadas), real: r2(reales) }, faltan, supuestos, dividido: f.dividido };
}

router.get("/:id/costo", (req, res) => {
  const c = costoDe(req.params.id);
  if (!c) return res.status(404).json({ error: "No existe" });
  res.json(c);
});

// ── Envío de prueba: UN mensaje con la configuración real del envío a un
// destino de prueba (no toca contactos ni contadores). Para ver cómo llega.
router.post("/:id/prueba", async (req, res) => {
  const e = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.id);
  if (!e) return res.status(404).json({ error: "No existe" });
  let destino = String(req.body?.destino || "").trim();
  if (e.canal === "correo") {
    destino = corregirDominio(destino.toLowerCase());
    if (!EMAIL_RE.test(destino)) return res.status(400).json({ error: "Destino de prueba inválido: necesito un correo." });
  } else {
    const d = destino.replace(/\D/g, "");
    destino = normTelefono(d.length === 12 && d.startsWith("57") ? d.slice(2) : d);
    if (!destino) return res.status(400).json({ error: "Destino de prueba inválido: celular de 10 dígitos que empiece en 3." });
  }
  try { await asegurarAudioVoz(e); } catch (err) { return res.status(400).json({ error: err.message }); }
  let r;
  try { r = await motor.enviarSegunCanal(e.canal, e, { destino }); } catch (err) { r = { ok: false, error: err.message }; }
  db.prepare("INSERT INTO logs (envio_id, nivel, mensaje) VALUES (?,?,?)").run(e.id, r.ok ? "info" : "warn", `🧪 Prueba a ${destino}: ${r.ok ? "enviada" : "falló — " + r.error}`);
  res.status(r.ok ? 200 : 400).json({ ok: !!r.ok, destino, comprobante: r.comprobante || null, error: r.ok ? undefined : r.error });
});

module.exports = router;
module.exports.familiaDe = familiaDe;
module.exports.costoDe = costoDe;