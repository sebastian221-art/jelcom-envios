import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import SelectorCliente from "../components/SelectorCliente.jsx";

const CLAVE_BORRADOR = "jelcom_borrador_correo";

export default function Correo() {
  const navigate = useNavigate();
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

  // ---- Dividir en sub-envíos ----
  const [dividir, setDividir] = useState(false);
  const [cantidadPartes, setCantidadPartes] = useState(3);
  const [subIds, setSubIds] = useState([]);
  const [subEstados, setSubEstados] = useState({});
  const [dividiendo, setDividiendo] = useState(false);

  // Restaura el borrador guardado (si hay uno) apenas se monta la pantalla.
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null");
      if (g) {
        if (g.clienteId != null) setClienteId(g.clienteId);
        if (g.nombre) setNombre(g.nombre);
        if (g.asunto) setAsunto(g.asunto);
        if (g.cuerpo) setCuerpo(g.cuerpo);
        if (g.imagenUrl) setImagenUrl(g.imagenUrl);
        if (g.enlace) setEnlace(g.enlace);
      }
    } catch {}
  }, []);

  // Guarda el borrador cada vez que cambia algo, mientras no exista un envío creado.
  useEffect(() => {
    if (envioId) return;
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ clienteId, nombre, asunto, cuerpo, imagenUrl, enlace }));
  }, [clienteId, nombre, asunto, cuerpo, imagenUrl, enlace, envioId]);

  // Logs del envío normal (solo si NO se dividió)
  useEffect(() => {
    if (!envioId || subIds.length) return;
    const iv = setInterval(async () => {
      const r = await fetch(`/api/envios/${envioId}/logs?desde=${ultimoLog.current}`).then(r => r.json());
      if (r.logs?.length) { ultimoLog.current = r.logs[r.logs.length - 1].id; setLogs(p => [...p, ...r.logs]); }
      if (r.envio) setEstado(r.envio);
      if (r.envio && ["finalizada", "error"].includes(r.envio.estado)) setEnviando(false);
    }, 1200);
    return () => clearInterval(iv);
  }, [envioId, subIds]);
  useEffect(() => { if (logsBox.current) logsBox.current.scrollTop = logsBox.current.scrollHeight; }, [logs]);

  // Progreso de los sub-envíos (solo si SÍ se dividió)
  useEffect(() => {
    if (!subIds.length) return;
    const iv = setInterval(async () => {
      const resultados = await Promise.all(subIds.map(id => fetch(`/api/envios/${id}`).then(r => r.json())));
      const mapa = {};
      resultados.forEach(e => { mapa[e.id] = e; });
      setSubEstados(mapa);
    }, 2000);
    return () => clearInterval(iv);
  }, [subIds]);

  async function crearYSubir() {
    if (!nombre || !asunto || !cuerpo) { alert("Pon nombre del envío, asunto y cuerpo"); return; }
    if (!archivoRef.current.files[0]) { alert("Selecciona la base de correos"); return; }
    setCargando(true);
    const c = await fetch("/api/envios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campana_id: clienteId, nombre, canal: "correo", asunto, cuerpo, imagen_url: imagenUrl || null, enlace: enlace || null }),
    }).then(r => r.json());
    setEnvioId(c.id);
    localStorage.removeItem(CLAVE_BORRADOR);
    const fd = new FormData(); fd.append("archivo", archivoRef.current.files[0]);
    const d = await fetch(`/api/envios/${c.id}/base`, { method: "POST", body: fd }).then(r => r.json());
    setDepu(d); setCargando(false);
  }
  async function enviar() {
    if (dividir && cantidadPartes >= 2) {
      setDividiendo(true);
      const r = await fetch(`/api/envios/${envioId}/dividir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad: cantidadPartes }),
      }).then(r => r.json());
      setDividiendo(false);
      if (r.error) { alert(r.error); return; }
      setSubIds(r.ids); setEnviando(true);
      return;
    }
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
  function descargarConsolidado() { window.open(`/api/envios/${envioId}/informe-consolidado`, "_blank"); }
  function nueva() {
    setNombre(""); setAsunto(""); setCuerpo(""); setImagenUrl(""); setEnlace(""); setEnvioId(null); setDepu(null); setLogs([]); setEstado(null); setEnviando(false);
    setDividir(false); setSubIds([]); setSubEstados({});
    localStorage.removeItem(CLAVE_BORRADOR); if (archivoRef.current) archivoRef.current.value = "";
  }

  const puedeEnviar = depu && depu.validos > 0 && !enviando;
  const finalizada = estado && ["finalizada", "error"].includes(estado.estado);

  const subLista = subIds.map(id => subEstados[id]).filter(Boolean);
  const subTodosFinalizados = subLista.length === subIds.length && subLista.every(e => ["finalizada", "error"].includes(e.estado));
  const subTotalEnviados = subLista.reduce((a, e) => a + (e.total_enviados || 0), 0);
  const subTotalErrores = subLista.reduce((a, e) => a + (e.total_errores || 0), 0);
  const subTotalValidos = subLista.reduce((a, e) => a + (e.total_validos || 0), 0);

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

          {!enviando && !subIds.length && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={dividir} onChange={e => setDividir(e.target.checked)} style={{ width: "auto", margin: 0 }} />
                Dividir en varios sub-envíos (para que termine más rápido)
              </label>
              {dividir && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <span>¿En cuántas partes?</span>
                  <input type="number" min={2} max={20} value={cantidadPartes}
                         onChange={e => setCantidadPartes(Number(e.target.value))}
                         style={{ width: 70, marginBottom: 0 }} />
                  <span className="hint" style={{ margin: 0 }}>
                    ≈ {depu.validos ? Math.ceil(depu.validos / Math.max(1, cantidadPartes)) : 0} contactos por parte
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="btn-row" style={{ marginBottom: 16 }}>
            {!finalizada && !subIds.length && estado?.estado !== "pausada" &&
              <button className="naranja" onClick={enviar} disabled={!puedeEnviar || dividiendo}>
                {dividiendo ? "Dividiendo…" : enviando ? "Enviando…" : dividir ? "▶ Dividir y enviar" : "▶ Realizar envío"}
              </button>}
            {enviando && !subIds.length && estado?.estado === "en_curso" && <button className="sec" onClick={pausar}>⏸ Pausar</button>}
            {estado?.estado === "pausada" && !subIds.length && <button className="naranja" onClick={enviar}>▶ Reanudar</button>}
            {finalizada && !subIds.length && <button className="verde" onClick={descargar}>⬇ Descargar informe Excel</button>}
            {subIds.length > 0 && <button className="verde" onClick={descargarConsolidado}>⬇ Descargar informe consolidado</button>}
            {(!!envioId) && <button className="sec" onClick={nueva}>+ Nuevo envío (el actual sigue en curso)</button>}
          </div>

          {!subIds.length && estado && (
            <div className="hint">Estado: <strong>{estado.estado}</strong> · Enviados: {estado.total_enviados || 0} · Errores: {estado.total_errores || 0} · Total: {estado.total_validos}</div>
          )}
          {!subIds.length && (
            <div className="logs" ref={logsBox}>
              {logs.length === 0 && <div className="info">Los logs del envío aparecerán aquí…</div>}
              {logs.map(l => <div key={l.id} className={`linea ${l.nivel}`}><span className="ts">{l.ts?.slice(11)}</span>{l.mensaje}</div>)}
            </div>
          )}

          {subIds.length > 0 && (
            <div>
              <div className="hint">
                {subTodosFinalizados ? "🏁 Todos los sub-envíos terminaron." : "🚀 Sub-envíos corriendo en paralelo…"} ·
                {" "}Enviados: {subTotalEnviados} · Errores: {subTotalErrores} · Total: {subTotalValidos}
              </div>
              <div className="tabla-wrap" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>Sub-envío</th><th>Estado</th><th>Enviados</th><th>Errores</th><th>Total</th><th></th></tr></thead>
                  <tbody>
                    {subIds.map((id, i) => {
                      const e = subEstados[id];
                      return (
                        <tr key={id}>
                          <td>Parte {i + 1}/{subIds.length}</td>
                          <td>{e ? e.estado : "cargando…"}</td>
                          <td>{e?.total_enviados ?? "—"}</td>
                          <td>{e?.total_errores ?? "—"}</td>
                          <td>{e?.total_validos ?? "—"}</td>
                          <td><button className="sec" onClick={() => navigate(`/envios/${id}`)}>Ver</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}