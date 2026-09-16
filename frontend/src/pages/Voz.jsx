import { useState, useEffect, useRef } from "react";
import SelectorCliente from "../components/SelectorCliente.jsx";

const CLAVE_BORRADOR = "jelcom_borrador_voz";

export default function Voz() {
  const [modo, setModo] = useState("A"); // A = enviar, B = voces
  return (
    <div>
      <h1>Bot de voz</h1>
      <div className="sub">Llamadas automáticas que reproducen un mensaje y capturan la tecla que marca la persona.</div>
      <div className="tabs">
        <button className={`tab ${modo === "A" ? "activo" : ""}`} onClick={() => setModo("A")}>📞 Enviar</button>
        <button className={`tab ${modo === "B" ? "activo" : ""}`} onClick={() => setModo("B")}>🎙️ Voces</button>
      </div>
      {modo === "A" ? <ModoEnvio /> : <ModoVoces />}
    </div>
  );
}

function useVoces() {
  const [voces, setVoces] = useState([]);
  async function cargar() { setVoces(await fetch("/api/voces").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);
  return [voces, cargar];
}

// ─────────── ENVIAR ───────────
function ModoEnvio() {
  const [voces] = useVoces();
  const [vozId, setVozId] = useState("");
  const [clienteId, setClienteId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [modoAudio, setModoAudio] = useState("texto"); // 'texto' | 'pregrabado'
  const [textoVoz, setTextoVoz] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [conTecla, setConTecla] = useState(true);
  const [teclaDesc, setTeclaDesc] = useState("Marque 1 para confirmar su asistencia");
  const [preview, setPreview] = useState("");
  const [generando, setGenerando] = useState(false);
  const [envioId, setEnvioId] = useState(null);
  const [depu, setDepu] = useState(null);
  const [logs, setLogs] = useState([]);
  const [estado, setEstado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const archivoRef = useRef();
  const ultimoLog = useRef(0);
  const logsBox = useRef();

  // preselecciona la primera voz guardada apenas carguen (si no hay una restaurada del borrador)
  useEffect(() => { if (voces.length && !vozId) setVozId(voces[0].voice_id); }, [voces]);

  // Restaura el borrador guardado (si hay uno) apenas se monta la pantalla.
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null");
      if (g) {
        if (g.clienteId != null) setClienteId(g.clienteId);
        if (g.nombre) setNombre(g.nombre);
        if (g.modoAudio) setModoAudio(g.modoAudio);
        if (g.textoVoz) setTextoVoz(g.textoVoz);
        if (g.audioUrl) setAudioUrl(g.audioUrl);
        if (typeof g.conTecla === "boolean") setConTecla(g.conTecla);
        if (g.teclaDesc) setTeclaDesc(g.teclaDesc);
        if (g.vozId) setVozId(g.vozId);
      }
    } catch {}
  }, []);

  // Guarda el borrador cada vez que cambia algo, mientras no exista un envío creado.
  useEffect(() => {
    if (envioId) return;
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ clienteId, nombre, modoAudio, textoVoz, audioUrl, conTecla, teclaDesc, vozId }));
  }, [clienteId, nombre, modoAudio, textoVoz, audioUrl, conTecla, teclaDesc, vozId, envioId]);

  useEffect(() => {
    if (!envioId) return;
    const iv = setInterval(async () => {
      const r = await fetch(`/api/envios/${envioId}/logs?desde=${ultimoLog.current}`).then(r => r.json());
      if (r.logs?.length) { ultimoLog.current = r.logs[r.logs.length - 1].id; setLogs(p => [...p, ...r.logs]); }
      if (r.envio) setEstado(r.envio);
      if (r.envio && ["finalizada", "error"].includes(r.envio.estado)) setEnviando(false);
    }, 1200);
    return () => clearInterval(iv);
  }, [envioId]);
  useEffect(() => { if (logsBox.current) logsBox.current.scrollTop = logsBox.current.scrollHeight; }, [logs]);

  async function previsualizarVoz() {
    if (!textoVoz) { alert("Escribe el texto primero"); return; }
    if (!vozId) { alert("Elige una voz en la pestaña 'Voces' primero"); return; }
    setGenerando(true);
    const r = await fetch("/api/voz/generar-audio", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: textoVoz, voz_id: vozId }),
    }).then(r => r.json());
    setGenerando(false);
    if (r.error) { alert("No se pudo generar: " + r.error); return; }
    setPreview(r.url);
  }

  async function crearYSubir() {
    if (!nombre) { alert("Pon nombre del envío"); return; }
    if (modoAudio === "texto" && !textoVoz) { alert("Escribe el texto del mensaje"); return; }
    if (modoAudio === "texto" && !vozId) { alert("Elige una voz en la pestaña 'Voces'"); return; }
    if (modoAudio === "pregrabado" && !audioUrl) { alert("Pon la URL del audio pregrabado"); return; }
    if (!archivoRef.current.files[0]) { alert("Selecciona la base"); return; }
    setCargando(true);
    const c = await fetch("/api/envios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campana_id: clienteId, nombre, canal: "voz",
        modo_audio: modoAudio,
        audio_url: modoAudio === "pregrabado" ? audioUrl : null,
        texto_voz: modoAudio === "texto" ? textoVoz : null,
        voz_id: modoAudio === "texto" ? vozId : null,
        tecla_captura: conTecla ? teclaDesc : null,
      }),
    }).then(r => r.json());
    setEnvioId(c.id);
    localStorage.removeItem(CLAVE_BORRADOR);
    const fd = new FormData(); fd.append("archivo", archivoRef.current.files[0]);
    const d = await fetch(`/api/envios/${c.id}/base`, { method: "POST", body: fd }).then(r => r.json());
    setDepu(d); setCargando(false);
  }
  async function enviar() {
    setEnviando(true); setLogs([]); ultimoLog.current = 0;
    try {
      const r = await fetch(`/api/envios/${envioId}/enviar`, { method: "POST" }).then(r => r.json());
      if (r.error) { alert(r.error); setEnviando(false); }
    } catch (err) {
      alert("No se pudo iniciar el envío: " + err.message);
      setEnviando(false);
    }
  }
  async function pausar() { await fetch(`/api/envios/${envioId}/pausar`, { method: "POST" }); }
  function descargar() { window.open(`/api/envios/${envioId}/informe`, "_blank"); }
  function nueva() { setNombre(""); setTextoVoz(""); setAudioUrl(""); setPreview(""); setEnvioId(null); setDepu(null); setLogs([]); setEstado(null); setEnviando(false); localStorage.removeItem(CLAVE_BORRADOR); if (archivoRef.current) archivoRef.current.value = ""; }

  const puedeEnviar = depu && depu.validos > 0 && !enviando;
  const finalizada = estado && ["finalizada", "error"].includes(estado.estado);

  return (
    <>
      <div className="card">
        <h2><span className="num">1</span> Contenido</h2>
        <SelectorCliente valor={clienteId} onChange={setClienteId} disabled={!!envioId} />
        <label>Nombre del envío</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Recordatorio Chef en Casa" disabled={!!envioId} />

        <label>Tipo de audio</label>
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={`tab ${modoAudio === "texto" ? "activo" : ""}`} onClick={() => setModoAudio("texto")} disabled={!!envioId}>🗣️ Voz desde texto</button>
          <button className={`tab ${modoAudio === "pregrabado" ? "activo" : ""}`} onClick={() => setModoAudio("pregrabado")} disabled={!!envioId}>🎵 Audio pregrabado</button>
        </div>

        {modoAudio === "texto" ? (
          <>
            <label>Voz a usar</label>
            {voces.length === 0 ? (
              <div className="hint">No tienes voces guardadas. Ve a la pestaña "Voces" arriba y agrega una primero.</div>
            ) : (
              <select value={vozId} onChange={e => setVozId(e.target.value)} disabled={!!envioId}>
                {voces.map(v => <option key={v.id} value={v.voice_id}>{v.nombre}</option>)}
              </select>
            )}
            <label>Texto que dirá la voz</label>
            <textarea value={textoVoz} onChange={e => setTextoVoz(e.target.value)} placeholder="Hola, le llamamos de Cajasan para recordarle su evento…" style={{ minHeight: 110 }} disabled={!!envioId} />
            {!envioId && (
              <div className="btn-row" style={{ marginBottom: 12 }}>
                <button className="sec" onClick={previsualizarVoz} disabled={generando}>{generando ? "Generando…" : "🔊 Escuchar prueba"}</button>
              </div>
            )}
            {preview && <audio controls src={preview} style={{ width: "100%", marginBottom: 14 }} />}
          </>
        ) : (
          <>
            <label>URL del audio pregrabado (mp3)</label>
            <input type="text" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="https://.../mensaje.mp3" disabled={!!envioId} />
            <div className="hint">El audio debe estar accesible por URL pública (mp3 o wav).</div>
          </>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={conTecla} onChange={e => setConTecla(e.target.checked)} style={{ width: "auto", margin: 0 }} disabled={!!envioId} />
          Capturar tecla marcada
        </label>
        {conTecla && (
          <input type="text" value={teclaDesc} onChange={e => setTeclaDesc(e.target.value)} placeholder="Ej. Marque 1 para confirmar" disabled={!!envioId} style={{ marginTop: 8 }} />
        )}
      </div>

      <div className="card">
        <h2><span className="num">2</span> Base de datos</h2>
        <input type="file" ref={archivoRef} accept=".xlsx,.xls,.csv" disabled={!!envioId} />
        <div className="hint">Se depura solo: 10 dígitos, celular colombiano, sin duplicados.</div>
        {!envioId && <button className="naranja" onClick={crearYSubir} disabled={cargando}>{cargando ? "Procesando…" : "Cargar y depurar"}</button>}
        {depu && (
          <div className="chips">
            <div className="chip gris">{depu.total_base}<small>En base</small></div>
            <div className="chip verde">{depu.validos}<small>Válidos</small></div>
            <div className="chip naranja">{depu.duplicados}<small>Duplicados</small></div>
            <div className="chip naranja">{depu.invalidos}<small>Inválidos</small></div>
          </div>
        )}
      </div>

      {depu && (
        <div className="card">
          <h2><span className="num">3</span> Llamadas</h2>
          <div className="btn-row" style={{ marginBottom: 16 }}>
            {!finalizada && estado?.estado !== "pausada" && <button className="naranja" onClick={enviar} disabled={!puedeEnviar}>{enviando ? "Llamando…" : "▶ Iniciar llamadas"}</button>}
            {enviando && estado?.estado === "en_curso" && <button className="sec" onClick={pausar}>⏸ Pausar</button>}
            {estado?.estado === "pausada" && <button className="naranja" onClick={enviar}>▶ Reanudar</button>}
            {finalizada && <button className="verde" onClick={descargar}>⬇ Descargar informe Excel</button>}
            {!!envioId && <button className="sec" onClick={nueva}>+ Nuevo envío (el actual sigue en curso)</button>}
          </div>
          {estado && <div className="hint">Estado: <strong>{estado.estado}</strong> · Llamadas iniciadas: {estado.total_enviados || 0} · Errores: {estado.total_errores || 0} · Total: {estado.total_validos}</div>}
          <div className="logs" ref={logsBox}>
            {logs.length === 0 && <div className="info">Los logs de las llamadas aparecerán aquí…</div>}
            {logs.map(l => <div key={l.id} className={`linea ${l.nivel}`}><span className="ts">{l.ts?.slice(11)}</span>{l.mensaje}</div>)}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>Nota: "contestada" y la tecla marcada llegan unos segundos después de cada llamada, cuando Twilio confirma el resultado.</div>
        </div>
      )}
    </>
  );
}

// ─────────── VOCES ───────────
function ModoVoces() {
  const [voces, recargar] = useVoces();
  const [nombre, setNombre] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [escuchando, setEscuchando] = useState(null);
  const [previews, setPreviews] = useState({});

  async function crear() {
    if (!nombre || !voiceId) { alert("Pon nombre y Voice ID"); return; }
    setGuardando(true);
    await fetch("/api/voces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, voice_id: voiceId, descripcion }) });
    setNombre(""); setVoiceId(""); setDescripcion("");
    setGuardando(false); recargar();
  }
  async function escuchar(id) {
    setEscuchando(id);
    const r = await fetch(`/api/voces/${id}/escuchar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(r => r.json());
    setEscuchando(null);
    if (r.error) { alert("No se pudo generar: " + r.error); return; }
    setPreviews(p => ({ ...p, [id]: r.url }));
  }
  async function eliminar(id) { if (!confirm("¿Quitar esta voz?")) return; await fetch(`/api/voces/${id}`, { method: "DELETE" }); recargar(); }

  return (
    <>
      <div className="card">
        <h2><span className="num">+</span> Nueva voz</h2>
        <div className="hint" style={{ marginTop: -6 }}>
          Consigue el Voice ID en elevenlabs.io → Voice Library → elige una voz → copia su ID.
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label>Nombre (para reconocerla)</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Voz Cajasan" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Voice ID de ElevenLabs</label>
            <input type="text" value={voiceId} onChange={e => setVoiceId(e.target.value)} placeholder="EXAVITQu4vr4xnSDxMaL" />
          </div>
        </div>
        <label>Descripción (opcional)</label>
        <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Voz femenina, tono institucional" />
        <button className="naranja" onClick={crear} disabled={guardando}>{guardando ? "Guardando…" : "Guardar voz"}</button>
      </div>

      <div className="card">
        <h2>Voces guardadas</h2>
        {voces.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>Aún no hay voces guardadas. Agrega la primera arriba.</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Voice ID</th><th>Descripción</th><th>Escuchar</th><th></th></tr></thead>
              <tbody>
                {voces.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.nombre}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{v.voice_id}</td>
                    <td>{v.descripcion || "—"}</td>
                    <td>
                      <button className="sec" onClick={() => escuchar(v.id)} disabled={escuchando === v.id}>
                        {escuchando === v.id ? "…" : "🔊 Escuchar"}
                      </button>
                      {previews[v.id] && <audio controls src={previews[v.id]} style={{ display: "block", marginTop: 6, width: 220 }} />}
                    </td>
                    <td><button className="sec" onClick={() => eliminar(v.id)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}