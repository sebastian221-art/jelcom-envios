// ─────────────────────────────────────────────────────────────
//  ADAPTADOR ELEVENLABS — genera audio (voz) desde texto.
//  Devuelve un archivo mp3 que se guarda y se sirve para que Twilio lo reproduzca.
//  Cuando pegues ELEVENLABS_API_KEY en el .env, queda conectado.
// ─────────────────────────────────────────────────────────────
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API = "https://api.elevenlabs.io/v1";
const CARPETA_AUDIO = path.join(__dirname, "..", "..", "data", "audios");

function apiKey() { return process.env.ELEVENLABS_API_KEY; }
function estaConfigurado() { return Boolean(apiKey()); }

// Asegura la carpeta de audios
function asegurarCarpeta() {
  if (!fs.existsSync(CARPETA_AUDIO)) fs.mkdirSync(CARPETA_AUDIO, { recursive: true });
}

// Genera un mp3 desde texto y lo guarda. Devuelve { ok, archivo, error }
// vozId: id de voz de ElevenLabs (por defecto una en español)
async function generarAudio(texto, vozId) {
  if (!estaConfigurado()) return { ok: false, error: "ElevenLabs no configurado (.env)" };
  asegurarCarpeta();
  const voz = vozId || process.env.ELEVENLABS_VOZ_ID || "EXAVITQu4vr4xnSDxMaL"; // voz por defecto
  console.log(`🎙️  Generando audio con Voice ID: ${voz}  (vozId recibido: ${vozId || "(ninguno)"} · ELEVENLABS_VOZ_ID del .env: ${process.env.ELEVENLABS_VOZ_ID || "(vacío)"})`);
  try {
    const resp = await axios.post(
      `${API}/text-to-speech/${voz}`,
      { text: texto, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      { headers: { "xi-api-key": apiKey(), "Content-Type": "application/json", accept: "audio/mpeg" }, responseType: "arraybuffer", timeout: 60000 }
    );

    // ElevenLabs a veces responde 200 pero con un JSON de error en vez de audio real
    // (ej. sin créditos, voz inválida). Si pasa, aquí lo detectamos en vez de guardar
    // un archivo "vacío" silencioso.
    const tipo = resp.headers["content-type"] || "";
    if (!tipo.includes("audio")) {
      let msg = "ElevenLabs no devolvió audio válido";
      try { msg = JSON.parse(Buffer.from(resp.data).toString())?.detail?.message || msg; } catch {}
      console.log(`❌ ElevenLabs respondió sin audio real. Content-Type: ${tipo} · Mensaje: ${msg}`);
      return { ok: false, error: msg };
    }
    if (resp.data.byteLength < 500) {
      console.log(`⚠️  El audio generado es sospechosamente pequeño (${resp.data.byteLength} bytes) — puede estar vacío.`);
      return { ok: false, error: "El audio generado está vacío o corrupto (muy pocos bytes)." };
    }

    const nombre = `voz_${Date.now()}.mp3`;
    const ruta = path.join(CARPETA_AUDIO, nombre);
    fs.writeFileSync(ruta, Buffer.from(resp.data));
    console.log(`✅ Audio generado correctamente: ${nombre} (${resp.data.byteLength} bytes)`);
    return { ok: true, archivo: nombre };
  } catch (e) {
    let msg = e.message;
    try { msg = JSON.parse(Buffer.from(e.response.data).toString())?.detail?.message || msg; } catch {}
    console.log(`❌ Error al generar audio: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Prueba de conexión: lista las voces disponibles.
async function probar() {
  if (!estaConfigurado()) return { estado: "sin_probar", detalle: "Falta API key en .env" };
  try {
    const resp = await axios.get(`${API}/voices`, { headers: { "xi-api-key": apiKey() }, timeout: 15000 });
    const n = resp.data?.voices?.length || 0;
    return { estado: "ok", detalle: `Conectado · ${n} voces disponibles` };
  } catch (e) {
    return { estado: "error", detalle: e.response?.data?.detail?.message || e.message };
  }
}

module.exports = { generarAudio, probar, estaConfigurado, CARPETA_AUDIO };