import { useState, useEffect } from "react";

export default function Historial() {
  const [campanas, setCampanas] = useState([]);
  const [envios, setEnvios] = useState([]);
  const [cliente, setCliente] = useState("");     // "" = todos
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  useEffect(() => {
    fetch("/api/campanas").then(r => r.json()).then(setCampanas);
  }, []);

  async function cargar() {
    const q = new URLSearchParams();
    if (cliente) q.set("campana_id", cliente);
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    const r = await fetch("/api/envios?" + q.toString()).then(r => r.json());
    setEnvios(r);
  }
  useEffect(() => { cargar(); }, [cliente, desde, hasta]);

  function informeEnvio(id) { window.open(`/api/envios/${id}/informe`, "_blank"); }
  function consolidado() {
    if (!cliente) { alert("Elige un cliente para el informe consolidado"); return; }
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    window.open(`/api/campanas/${cliente}/consolidado?` + q.toString(), "_blank");
  }

  const totalEnviados = envios.reduce((a, e) => a + (e.total_enviados || 0), 0);

  return (
    <div>
      <h1>Historial de envíos</h1>
      <div className="sub">Consulta todos los envíos, filtra por cliente y fechas, y genera el informe consolidado.</div>

      <div className="filtros">
        <div>
          <label>Cliente</label>
          <select value={cliente} onChange={e => setCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        <button className="naranja" onClick={consolidado} disabled={!cliente}>
          📊 Informe consolidado
        </button>
      </div>

      {cliente && (
        <div className="hint" style={{ marginTop: -8, marginBottom: 18 }}>
          {envios.length} envíos · {totalEnviados.toLocaleString("es-CO")} mensajes en total{desde || hasta ? " en el rango elegido" : ""}.
        </div>
      )}

      <div className="tabla-wrap">
        {envios.length === 0 ? (
          <div className="empty"><div className="ico">📭</div>No hay envíos con estos filtros.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>Envío</th><th>Cliente</th><th>Canal</th>
                <th>Estado</th><th>Enviados</th><th>Fecha</th><th>Informe</th>
              </tr>
            </thead>
            <tbody>
              {envios.map(e => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td style={{ fontWeight: 600 }}>{e.nombre}</td>
                  <td>
                    <span className="pill-cliente">
                      <span className="punto" style={{ background: e.campana_color }} />
                      {e.campana_nombre}
                    </span>
                  </td>
                  <td><span className="tag-canal">{e.canal.toUpperCase()}</span></td>
                  <td><span className={`badge ${e.estado}`}>{e.estado}</span></td>
                  <td>{(e.total_enviados || 0).toLocaleString("es-CO")} / {(e.total_validos || 0).toLocaleString("es-CO")}</td>
                  <td>{(e.enviado_en || e.creado_en || "").slice(0, 16)}</td>
                  <td>
                    {e.estado === "finalizada"
                      ? <button className="sec" onClick={() => informeEnvio(e.id)}>⬇ Excel</button>
                      : <span style={{ opacity: .3 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}