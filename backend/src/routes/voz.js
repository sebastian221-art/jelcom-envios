// ─────────────────────────────────────────────────────────────
//  RUTAS DE VOZ (bot de voz)
//  - /twiml/:envioId   → Twilio pide qué reproducir al contestar (TwiML)
//  - /gather/:envioId  → recibe la tecla que marcó la persona
//  - /estado/:envioId  → Twilio avisa si contestó / no contestó / duración
//  - /audio/:archivo   → sirve los mp3 generados por ElevenLabs
//  - /generar-audio    → genera un audio de prueba desde texto
// ─────────────────────────────────────────────────────────────
const express = require("express");
const path = require("path");
const fs = require("fs");
const { db } = require("../db");
const eleven = require("../services/proveedores/elevenlabs");
const { obtenerPublicUrl } = require("../services/publicurl");

const router = express.Router();
// Twilio manda los webhooks como form-urlencoded
router.use(express.urlencoded({ extended: false }));

function publicUrl() { return obtenerPublicUrl(); }

// Escapa texto para XML (TwiML)
function xml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// TwiML: qué hace Twilio cuando la persona contesta
router.post("/twiml/:envioId", (req, res) => {
  const envio = db.prepare("SELECT * FROM envios WHERE id=?").get(req.params.envioId);
  res.type("text/xml");
  if (!envio) { res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`); return; }

  // Si detecta buzón de voz, cuelga (no gasta reproduciendo a una máquina)
  const esBuzon = req.body.AnsweredBy && req.body.AnsweredBy.startsWith("machine");
  if (esBuzon) { res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`); return; }

  // Fuente del audio: pregrabado (URL) o generado (archivo servido por /audio)
  let audioUrl = "";
  if (envio.modo_audio === "pregrabado" && envio.audio_url) {
    audioUrl = envio.audio_url;
  } else if (envio.modo_audio === "texto" && envio.audio_url) {
    // para 'texto', audio_url guarda el nombre del mp3 generado
    audioUrl = `${publicUrl()}/api/voz/audio/${envio.audio_url}`;
  }

  let cuerpo = "";
  if (envio.tecla_captura) {
    // Reproduce el audio y espera que marquen una tecla
    const gatherUrl = `${publicUrl()}/api/voz/gather/${envio.id}`;
    const dentro = audioUrl
      ? `<Play>${xml(audioUrl)}</Play>`
      : `<Say language="es-MX">${xml(envio.texto_voz || envio.cuerpo || "")}</Say>`;
    cuerpo = `<Gather numDigits="1" action="${xml(gatherUrl)}" method="POST" timeout="6">${dentro}</Gather>`;
  } else {
    cuerpo = audioUrl
      ? `<Play>${xml(audioUrl)}</Play>`
      : `<Say language="es-MX">${xml(envio.texto_voz || envio.cuerpo || "")}</Say>`;
  }

  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response>${cuerpo}<Hangup/></Response>`);
});

// Recibe la tecla marcada
router.post("/gather/:envioId", (req, res) => {
  const tecla = req.body.Digits || "";
  const callSid = req.body.CallSid || "";
  if (callSid) {
    db.prepare("UPDATE contactos SET tecla_marcada=? WHERE comprobante=?").run(tecla, callSid);
    db.prepare("INSERT INTO logs (envio_id, nivel, mensaje) VALUES (?,?,?)")
      .run(req.params.envioId, "info", `☎️ Tecla marcada: ${tecla || "(ninguna)"}`);
  }
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">Gracias. Hasta pronto.</Say><Hangup/></Response>`);
});

// Estado final de la llamada (contestada / no contestada / duración)
router.post("/estado/:envioId", (req, res) => {
  const callSid = req.body.CallSid || "";
  const estadoLlamada = req.body.CallStatus || "";
  const duracion = parseInt(req.body.CallDuration || "0", 10);
  const contestada = estadoLlamada === "completed" && duracion > 0;

  if (callSid) {
    db.prepare("UPDATE contactos SET estado=?, duracion_seg=? WHERE comprobante=?")
      .run(contestada ? "contestada" : "no_contestada", duracion, callSid);
  }
  res.sendStatus(200);
});

// Sirve los mp3 generados por ElevenLabs
router.get("/audio/:archivo", (req, res) => {
  const ruta = path.join(eleven.CARPETA_AUDIO, path.basename(req.params.archivo));
  if (!fs.existsSync(ruta)) return res.sendStatus(404);

  const stat = fs.statSync(ruta);
  const total = stat.size;
  const range = req.headers.range;

  // El reproductor de audio del navegador suele pedir "un pedazo" del archivo
  // (petición Range) para saber la duración y poder adelantar. Si no le
  // respondemos ese tipo de petición correctamente, el audio puede sonar
  // vacío o mostrar 0:00 aunque el archivo esté perfecto en el servidor.
  if (range) {
    const partes = range.replace(/bytes=/, "").split("-");
    const inicio = parseInt(partes[0], 10);
    const fin = partes[1] ? parseInt(partes[1], 10) : total - 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${inicio}-${fin}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": (fin - inicio) + 1,
      "Content-Type": "audio/mpeg",
    });
    fs.createReadStream(ruta, { start: inicio, end: fin }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": total,
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(ruta).pipe(res);
  }
});

// Genera un audio desde texto (para previsualizar antes de enviar)
router.post("/generar-audio", express.json(), async (req, res) => {
  const { texto, voz_id } = req.body;
  if (!texto) return res.status(400).json({ error: "Falta texto" });
  const r = await eleven.generarAudio(texto, voz_id);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, archivo: r.archivo, url: `${publicUrl()}/api/voz/audio/${r.archivo}` });
});

// Leer/guardar la URL pública (ngrok) desde la página de Bot de voz
router.get("/public-url", (req, res) => {
  res.json({ url: obtenerPublicUrl() });
});
router.post("/public-url", express.json(), (req, res) => {
  const { url } = req.body;
  const limpia = (url || "").trim().replace(/\/+$/, "");
  db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('public_url', ?) ON CONFLICT(clave) DO UPDATE SET valor=?")
    .run(limpia, limpia);
  res.json({ ok: true, url: limpia });
});

module.exports = router;