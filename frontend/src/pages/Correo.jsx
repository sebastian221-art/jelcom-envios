import { useState, useEffect, useRef } from "react";
import SelectorCliente from "../components/SelectorCliente.jsx";

export default function Correo() {
  const [clienteId, setClienteId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [enlace, setEnlace] = useState("");
  const [envioId, setEnvioId] = useState(null);
  const [depu, setDepu] = useState(null);
  const [logs, setLogs] = useState([]);
  const [estado, setEstado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const archivoRef = useRef();
  const ultimoLog = useRef(0);
  const logsBox = useRef();

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

  async function crearYSubir() {
    if (!nombre || !asunto || !cuerpo) { alert("Pon nombre del envío, asunto y cuerpo"); return; }
    if (!archivoRef.current.files[0]) { alert("Selecciona la base de correos"); return; }
    setCargando(true);
    const c = await fetch("/api/envios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campana_id: clienteId, nombre, canal: "correo", asunto, cuerpo, imagen_url: imagenUrl || null, enlace: enlace || null }),
    }).then(r => r.json());
    setEnvioId(c.id);
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
  function nueva() { setNombre(""); setAsunto(""); setCuerpo(""); setImagenUrl(""); setEnlace(""); setEnvioId(null); setDepu(null); setLogs([]); setEstado(null); setEnviando(false); if (archivoRef.current) archivoRef.current.value = ""; }

  const puedeEnviar = depu && depu.validos > 0 && !enviando;
  const finalizada = estado && ["finalizada", "error"].includes(estado.estado);

  return (
    <div>
      <h1>Envío de Correo</h1>
      <div className="sub">Crea el correo, sube la base, dispara y descarga el informe. Con imagen y enlace opcionales.</div>

      <div className="card">
        <h2><span className="num">1</span> Contenido</h2>
        <SelectorCliente valor={clienteId} onChange={setClienteId} disabled={!!envioId} />
        <label>Nombre del envío</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Mailing Turismo Guajira" disabled={!!envioId} />
        <label>Asunto del correo</label>
        <input type="text" value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Ej. ¡Vive la magia del mar Caribe con Cajasan!" disabled={!!envioId} />
        <label>Cuerpo del mensaje</label>
        <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} placeholder="Escribe el texto del correo. Separa párrafos con una línea en blanco." style={{ minHeight: 160 }} disabled={!!envioId} />
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label>URL de imagen (opcional)</label>
            <input type="text" value={imagenUrl} onChange={e => setImagenUrl(e.target.value)} placeholder="https://i.ibb.co/..." disabled={!!envioId} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Enlace de la imagen (opcional)</label>
            <input type="text" value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="https://cajasan.com/..." disabled={!!envioId} />
          </div>
        </div>
        <div className="hint">Si pones imagen y enlace, al hacer clic en la imagen el destinatario irá a esa dirección.</div>
      </div>

      <div className="card">
        <h2><span className="num">2</span> Base de correos</h2>
        <input type="file" ref={archivoRef} accept=".xlsx,.xls,.csv" disabled={!!envioId} />
        <div className="hint">Se depura solo: separa varios correos por celda, corrige typos de dominio (gamil→gmail) y quita inválidos.</div>
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
          <h2><span className="num">3</span> Envío</h2>
          <div className="btn-row" style={{ marginBottom: 16 }}>
            {!finalizada && estado?.estado !== "pausada" && <button className="naranja" onClick={enviar} disabled={!puedeEnviar}>{enviando ? "Enviando…" : "▶ Realizar envío"}</button>}
            {enviando && estado?.estado === "en_curso" && <button className="sec" onClick={pausar}>⏸ Pausar</button>}
            {estado?.estado === "pausada" && <button className="naranja" onClick={enviar}>▶ Reanudar</button>}
            {finalizada && <button className="verde" onClick={descargar}>⬇ Descargar informe Excel</button>}
            {!!envioId && <button className="sec" onClick={nueva}>+ Nuevo envío (el actual sigue en curso)</button>}
          </div>
          {estado && <div className="hint">Estado: <strong>{estado.estado}</strong> · Enviados: {estado.total_enviados || 0} · Errores: {estado.total_errores || 0} · Total: {estado.total_validos}</div>}
          <div className="logs" ref={logsBox}>
            {logs.length === 0 && <div className="info">Los logs del envío aparecerán aquí…</div>}
            {logs.map(l => <div key={l.id} className={`linea ${l.nivel}`}><span className="ts">{l.ts?.slice(11)}</span>{l.mensaje}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}