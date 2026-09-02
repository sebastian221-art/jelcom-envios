import { useState, useEffect, useRef } from "react";
import { Device } from "@twilio/voice-sdk";

// Pantalla del AGENTE: softphone (habla por el navegador) + formulario en vivo.
export default function Agente() {
  const [agentes, setAgentes] = useState([]);
  const [agenteId, setAgenteId] = useState("");
  const [campanas, setCampanas] = useState([]);
  const [campId, setCampId] = useState("");
  const [tipificaciones, setTipificaciones] = useState([]);
  const [formulario, setFormulario] = useState(null);

  const [device, setDevice] = useState(null);
  const [estadoTel, setEstadoTel] = useState("desconectado"); // desconectado|listo|llamando|en_llamada
  const [contacto, setContacto] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [tipSel, setTipSel] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [mensaje, setMensaje] = useState("");

  const callRef = useRef(null);
  const timerRef = useRef(null);
  const inicioRef = useRef(null);

  // cargar catálogos
  useEffect(() => {
    fetch("/api/callcenter/agentes").then(r => r.json()).then(setAgentes);
    fetch("/api/callcenter/campanas-llamada").then(r => r.json()).then(setCampanas);
    fetch("/api/callcenter/tipificaciones").then(r => r.json()).then(setTipificaciones);
  }, []);

  // cuando elige campaña, cargar su formulario
  useEffect(() => {
    if (!campId) { setFormulario(null); return; }
    const c = campanas.find(x => x.id === Number(campId));
    if (c && c.formulario_id) {
      fetch(`/api/callcenter/formularios/${c.formulario_id}`).then(r => r.json()).then(setFormulario);
    } else setFormulario(null);
  }, [campId, campanas]);

  // conectar softphone
  async function conectar() {
    if (!agenteId) { alert("Elige tu usuario de agente"); return; }
    try {
      const r = await fetch(`/api/callcenter/token/${agenteId}`).then(r => r.json());
      if (r.error) { alert("No se pudo conectar: " + r.error); return; }
      const dev = new Device(r.token, { codecPreferences: ["opus", "pcmu"] });
      dev.on("registered", () => { setEstadoTel("listo"); setMensaje("Softphone conectado y listo."); });
      dev.on("error", (e) => { setMensaje("Error del softphone: " + e.message); });
      dev.on("disconnect", () => finLlamada());
      await dev.register();
      setDevice(dev);
      await fetch(`/api/callcenter/agentes/${agenteId}/estado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "disponible" }) });
    } catch (e) { alert("Error al conectar: " + e.message); }
  }

  function desconectar() {
    if (device) device.destroy();
    setDevice(null); setEstadoTel("desconectado"); setMensaje("");
    if (agenteId) fetch(`/api/callcenter/agentes/${agenteId}/estado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "desconectado" }) });
  }

  // pedir siguiente contacto
  async function siguiente() {
    if (!campId) { alert("Elige una campaña"); return; }
    const r = await fetch(`/api/callcenter/campanas-llamada/${campId}/siguiente`).then(r => r.json());
    if (r.fin) { setMensaje("No quedan contactos pendientes en esta campaña."); setContacto(null); return; }
    setContacto(r.contacto); setRespuestas({}); setTipSel(""); setSegundos(0);
    setMensaje(`Contacto listo: ${r.contacto.nombre || r.contacto.telefono}. ${r.modo === "automatico" ? "Marcando…" : "Presiona Llamar."}`);
    if (r.modo === "automatico") setTimeout(() => llamar(r.contacto), 800);
  }

  // iniciar llamada por el navegador
  async function llamar(cont) {
    const c = cont || contacto;
    if (!c || !device) return;
    setEstadoTel("llamando");
    const call = await device.connect({ params: { To: c.telefono } });
    callRef.current = call;
    call.on("accept", () => {
      setEstadoTel("en_llamada");
      inicioRef.current = Date.now();
      timerRef.current = setInterval(() => setSegundos(Math.floor((Date.now() - inicioRef.current) / 1000)), 1000);
      fetch(`/api/callcenter/contactos-llamada/${c.id}/tomar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agente_id: agenteId, call_sid: call.parameters?.CallSid || "" }) });
    });
    call.on("disconnect", () => finLlamada());
  }

  function colgar() { if (callRef.current) callRef.current.disconnect(); }
  function finLlamada() {
    setEstadoTel(device ? "listo" : "desconectado");
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function setResp(pid, valor) { setRespuestas(r => ({ ...r, [pid]: valor })); }

  async function guardarGestion() {
    if (!contacto) return;
    if (!tipSel) { alert("Elige una tipificación"); return; }
    const respArr = Object.entries(respuestas).map(([pregunta_id, valor]) => ({ pregunta_id: Number(pregunta_id), valor }));
    await fetch(`/api/callcenter/contactos-llamada/${contacto.id}/gestion`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipificacion_id: Number(tipSel), duracion_seg: segundos, respuestas: respArr, estado: "completado" }),
    });
    setMensaje("Gestión guardada. Pide el siguiente contacto.");
    setContacto(null); setRespuestas({}); setTipSel(""); setSegundos(0);
  }

  const mmss = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;

  return (
    <div>
      <h1>Puesto del agente</h1>
      <div className="sub">Conéctate, pide contactos, habla por el navegador y registra la gestión.</div>

      <div className="card">
        <h2>Conexión</h2>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label>Soy el agente</label>
            <select value={agenteId} onChange={e => setAgenteId(Number(e.target.value))} disabled={estadoTel !== "desconectado"}>
              <option value="">— Elige —</option>
              {agentes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Campaña</label>
            <select value={campId} onChange={e => setCampId(Number(e.target.value))}>
              <option value="">— Elige —</option>
              {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.cliente_nombre}</option>)}
            </select>
          </div>
          <div>
            {estadoTel === "desconectado"
              ? <button className="naranja" onClick={conectar}>Conectar softphone</button>
              : <button className="sec" onClick={desconectar}>Desconectar</button>}
          </div>
        </div>
        <div className="hint" style={{ marginTop: 12 }}>
          Estado del teléfono: <strong style={{ color: estadoTel === "en_llamada" ? "#16a34a" : estadoTel === "llamando" ? "#FF6B00" : "#374151" }}>{estadoTel}</strong>
          {estadoTel === "en_llamada" && <> · Duración: <strong>{mmss}</strong></>}
        </div>
        {mensaje && <div className="hint" style={{ marginTop: 6 }}>{mensaje}</div>}
      </div>

      {estadoTel !== "desconectado" && (
        <div className="card">
          <h2>Llamada</h2>
          <div className="btn-row" style={{ marginBottom: 14 }}>
            {!contacto && <button className="naranja" onClick={siguiente}>➡ Siguiente contacto</button>}
            {contacto && estadoTel === "listo" && <button className="verde" onClick={() => llamar()}>📞 Llamar a {contacto.nombre || contacto.telefono}</button>}
            {estadoTel === "en_llamada" && <button className="sec" onClick={colgar}>📵 Colgar</button>}
          </div>
          {contacto && (
            <div className="hint">
              Contacto: <strong>{contacto.nombre || "Sin nombre"}</strong> · {contacto.telefono}
            </div>
          )}
        </div>
      )}

      {contacto && (
        <div className="card">
          <h2>Gestión</h2>
          {formulario && formulario.preguntas?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {formulario.preguntas.map(p => (
                <div key={p.id} style={{ marginBottom: 16 }}>
                  <label>{p.texto}{p.obligatoria ? " *" : ""}</label>
                  {p.tipo === "si_no" && (
                    <div className="btn-row">
                      <button className={respuestas[p.id] === "Sí" ? "naranja" : "sec"} onClick={() => setResp(p.id, "Sí")}>Sí</button>
                      <button className={respuestas[p.id] === "No" ? "naranja" : "sec"} onClick={() => setResp(p.id, "No")}>No</button>
                    </div>
                  )}
                  {p.tipo === "opcion" && (
                    <div className="btn-row" style={{ flexWrap: "wrap" }}>
                      {p.opciones.map(o => (
                        <button key={o} className={respuestas[p.id] === o ? "naranja" : "sec"} onClick={() => setResp(p.id, o)}>{o}</button>
                      ))}
                    </div>
                  )}
                  {p.tipo === "texto" && <input type="text" value={respuestas[p.id] || ""} onChange={e => setResp(p.id, e.target.value)} />}
                  {p.tipo === "numero" && <input type="text" inputMode="numeric" value={respuestas[p.id] || ""} onChange={e => setResp(p.id, e.target.value.replace(/\D/g, ""))} />}
                </div>
              ))}
            </div>
          )}
          <label>Tipificación (resultado de la llamada) *</label>
          <div className="btn-row" style={{ flexWrap: "wrap", marginBottom: 16 }}>
            {tipificaciones.map(t => (
              <button key={t.id} onClick={() => setTipSel(t.id)}
                style={{ background: tipSel === t.id ? t.color : "#fff", color: tipSel === t.id ? "#fff" : "#1a1a1a", border: `1.5px solid ${t.color}` }}>
                {t.nombre}
              </button>
            ))}
          </div>
          <button className="verde" onClick={guardarGestion}>✓ Guardar gestión</button>
        </div>
      )}
    </div>
  );
}