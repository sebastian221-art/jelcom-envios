import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";

const NOMBRE_CANAL = { sms: "SMS", whatsapp: "WhatsApp", correo: "Correo", voz: "Bot de voz" };

// Página de seguimiento de UN envío, sin importar el canal. Se llega aquí desde
// el panel de "Envíos activos" o directo por URL — el progreso vive en el
// backend, así que refrescar o entrar de nuevo siempre muestra el estado real.
export default function EnvioDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [envio, setEnvio] = useState(null);
  const [logs, setLogs] = useState([]);
  const ultimoLog = useRef(0);
  const logsBox = useRef();

  async function cargarInfo() {
    const e = await fetch(`/api/envios/${id}`).then(r => r.json());
    setEnvio(e);
  }
  async function cargarLogs() {
    const r = await fetch(`/api/envios/${id}/logs?desde=${ultimoLog.current}`).then(r => r.json());
    if (r.logs?.length) { ultimoLog.current = r.logs[r.logs.length - 1].id; setLogs(p => [...p, ...r.logs]); }
    if (r.envio) setEnvio(e => ({ ...e, ...r.envio }));
  }

  useEffect(() => {
    cargarInfo();
    const iv = setInterval(cargarLogs, 1200);
    return () => clearInterval(iv);
  }, [id]);
  useEffect(() => { if (logsBox.current) logsBox.current.scrollTop = logsBox.current.scrollHeight; }, [logs]);

  async function pausar() { await fetch(`/api/envios/${id}/pausar`, { method: "POST" }); }
  async function reanudar() { await fetch(`/api/envios/${id}/enviar`, { method: "POST" }); }
  function descargar() { window.open(`/api/envios/${id}/informe`, "_blank"); }

  if (!envio) return <div><h1>Cargando…</h1></div>;

  const finalizada = ["finalizada", "error"].includes(envio.estado);
  const puedePausar = envio.estado === "en_curso";
  const puedeReanudar = envio.estado === "pausada";

  return (
    <div>
      <button className="sec" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>← Volver</button>
      <h1>{envio.nombre}</h1>
      <div className="sub">{NOMBRE_CANAL[envio.canal] || envio.canal} · {envio.campana_nombre || ""}</div>

      <div className="card">
        <h2>Seguimiento</h2>
        <div className="btn-row" style={{ marginBottom: 16 }}>
          {puedePausar && <button className="sec" onClick={pausar}>⏸ Pausar</button>}
          {puedeReanudar && <button className="naranja" onClick={reanudar}>▶ Reanudar</button>}
          {finalizada && <button className="verde" onClick={descargar}>⬇ Descargar informe Excel</button>}
        </div>
        <div className="hint">
          Estado: <strong>{envio.estado}</strong> · Enviados: {envio.total_enviados || 0} · Errores: {envio.total_errores || 0} · Total: {envio.total_validos || 0}
        </div>
        <div className="logs" ref={logsBox} style={{ marginTop: 12 }}>
          {logs.length === 0 && <div className="info">Cargando logs…</div>}
          {logs.map(l => <div key={l.id} className={`linea ${l.nivel}`}><span className="ts">{l.ts?.slice(11)}</span>{l.mensaje}</div>)}
        </div>
      </div>
    </div>
  );
}