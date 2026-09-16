import { useState, useEffect, useRef } from "react";
import SelectorCliente from "../components/SelectorCliente.jsx";

const CLAVE_BORRADOR = "jelcom_borrador_sms";

export default function SMS() {
  const [modo, setModo] = useState("A"); // A = enviar, B = cuentas
  return (
    <div>
      <h1>Envío de SMS</h1>
      <div className="sub">Envía SMS con el proveedor que elijas, o administra tus cuentas (Háblame, Brevo…).</div>
      <div className="tabs">
        <button className={`tab ${modo === "A" ? "activo" : ""}`} onClick={() => setModo("A")}>💬 Enviar SMS</button>
        <button className={`tab ${modo === "B" ? "activo" : ""}`} onClick={() => setModo("B")}>📱 Cuentas / Proveedores</button>
      </div>
      {modo === "A" ? <ModoEnvio /> : <ModoCuentas />}
    </div>
  );
}

function useCuentasSms() {
  const [cuentas, setCuentas] = useState([]);
  async function cargar() { setCuentas(await fetch("/api/cuentas-sms").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);
  return [cuentas, cargar];
}

// ─────────── ENVIAR ───────────
function ModoEnvio() {
  const [cuentas] = useCuentasSms();
  const [clienteId, setClienteId] = useState(null);
  const [cuentaId, setCuentaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [analisis, setAnalisis] = useState(null);
  const [envioId, setEnvioId] = useState(null);
  const [depu, setDepu] = useState(null);
  const [logs, setLogs] = useState([]);
  const [estado, setEstado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const archivoRef = useRef();
  const ultimoLog = useRef(0);
  const logsBox = useRef();

  // Restaura el borrador guardado (si hay uno) apenas se monta la pantalla.
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null");
      if (g) {
        if (g.clienteId != null) setClienteId(g.clienteId);
        if (g.cuentaId) setCuentaId(g.cuentaId);
        if (g.nombre) setNombre(g.nombre);
        if (g.texto) setTexto(g.texto);
      }
    } catch {}
  }, []);

  // Guarda el borrador cada vez que cambia algo, mientras no exista un envío creado.
  useEffect(() => {
    if (envioId) return;
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ clienteId, cuentaId, nombre, texto }));
  }, [clienteId, cuentaId, nombre, texto, envioId]);

  useEffect(() => {
    if (!texto) { setAnalisis(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch("/api/envios/analizar-sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) }).then(r => r.json());
      setAnalisis(r);
    }, 350);
    return () => clearTimeout(t);
  }, [texto]);

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
    if (!nombre || !texto) { alert("Pon nombre del envío y el mensaje"); return; }
    if (!cuentaId) { alert("Elige con qué cuenta/proveedor se enviará"); return; }
    if (!archivoRef.current.files[0]) { alert("Selecciona la base (Excel)"); return; }
    setCargando(true);
    const c = await fetch("/api/envios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campana_id: clienteId, cuenta_sms_id: cuentaId, nombre, canal: "sms", cuerpo: texto }),
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
  function nueva() { setNombre(""); setTexto(""); setAnalisis(null); setEnvioId(null); setDepu(null); setLogs([]); setEstado(null); setEnviando(false); localStorage.removeItem(CLAVE_BORRADOR); if (archivoRef.current) archivoRef.current.value = ""; }

  const puedeEnviar = depu && depu.validos > 0 && !enviando;
  const finalizada = estado && ["finalizada", "error"].includes(estado.estado);

  return (
    <>
      <div className="card">
        <h2><span className="num">1</span> Contenido</h2>
        <SelectorCliente valor={clienteId} onChange={setClienteId} disabled={!!envioId} />
        <label>Cuenta / Proveedor de SMS</label>
        <select value={cuentaId} onChange={e => setCuentaId(Number(e.target.value))} disabled={!!envioId}>
          <option value="">— Elige una cuenta —</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.proveedor})</option>)}
        </select>
        {cuentas.length === 0 && <div className="hint">No tienes cuentas de SMS. Crea una en la pestaña "Cuentas / Proveedores".</div>}
        <label>Nombre del envío</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Recordatorio evento agosto" disabled={!!envioId} />
        <label>Mensaje</label>
        <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe el SMS. Evita tildes y ñ para que quepa en 1 segmento." disabled={!!envioId} />
        {analisis && (
          <div className="hint">
            {analisis.caracteres} caracteres · {analisis.codificacion} · <strong>{analisis.segmentos} segmento{analisis.segmentos > 1 ? "s" : ""}</strong>
            {analisis.segmentos > 1 && " · cada segmento se cobra aparte"}
          </div>
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
    </>
  );
}

// ─────────── CUENTAS ───────────
function ModoCuentas() {
  const [cuentas, recargar] = useCuentasSms();
  const [proveedor, setProveedor] = useState("brevo");
  const [form, setForm] = useState({ nombre: "", remitente: "", hablame_account: "", hablame_apikey: "", brevo_apikey: "", labsmobile_usuario: "", labsmobile_token: "" });
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(null);
  const [resultado, setResultado] = useState({});

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function crear() {
    if (!form.nombre) { alert("Pon un nombre a la cuenta"); return; }
    if (proveedor === "brevo" && !form.brevo_apikey) { alert("Falta la API key de Brevo"); return; }
    if (proveedor === "hablame" && (!form.hablame_account || !form.hablame_apikey)) { alert("Faltan account y API key de Háblame"); return; }
    if (proveedor === "labsmobile" && (!form.labsmobile_usuario || !form.labsmobile_token)) { alert("Faltan usuario y token de LabsMobile"); return; }
    setGuardando(true);
    await fetch("/api/cuentas-sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, proveedor }) });
    setForm({ nombre: "", remitente: "", hablame_account: "", hablame_apikey: "", brevo_apikey: "", labsmobile_usuario: "", labsmobile_token: "" });
    setGuardando(false); recargar();
  }
  async function probar(id) {
    setProbando(id);
    const r = await fetch(`/api/cuentas-sms/${id}/probar`, { method: "POST" }).then(r => r.json());
    setResultado(p => ({ ...p, [id]: r })); setProbando(null);
  }
  async function eliminar(id) { if (!confirm("¿Quitar esta cuenta?")) return; await fetch(`/api/cuentas-sms/${id}`, { method: "DELETE" }); recargar(); }

  return (
    <>
      <div className="card">
        <h2><span className="num">+</span> Nueva cuenta de SMS</h2>
        <label>Proveedor</label>
        <select value={proveedor} onChange={e => setProveedor(e.target.value)}>
          <option value="brevo">Brevo (SMS)</option>
          <option value="hablame">Háblame</option>
          <option value="labsmobile">LabsMobile</option>
        </select>
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          <div style={{ flex: 2 }}>
            <label>Nombre de la cuenta</label>
            <input type="text" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder={proveedor === "brevo" ? "Ej. Brevo SMS" : proveedor === "hablame" ? "Ej. Háblame Jelcom" : "Ej. LabsMobile Jelcom"} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Remitente (nombre corto)</label>
            <input type="text" value={form.remitente} onChange={e => set("remitente", e.target.value)} placeholder="JELCOM" maxLength={11} />
          </div>
        </div>
        {proveedor === "brevo" && (
          <>
            <label>API Key de Brevo</label>
            <input type="text" value={form.brevo_apikey} onChange={e => set("brevo_apikey", e.target.value)} placeholder="xkeysib-..." />
            <div className="hint">Puedes usar la misma API key de Brevo que ya usas para correo.</div>
          </>
        )}
        {proveedor === "hablame" && (
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label>Account (Háblame)</label>
              <input type="text" value={form.hablame_account} onChange={e => set("hablame_account", e.target.value)} placeholder="Tu account" />
            </div>
            <div style={{ flex: 1 }}>
              <label>API Key (Háblame)</label>
              <input type="text" value={form.hablame_apikey} onChange={e => set("hablame_apikey", e.target.value)} placeholder="Tu apikey" />
            </div>
          </div>
        )}
        {proveedor === "labsmobile" && (
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <label>Usuario (email de tu cuenta LabsMobile)</label>
              <input type="text" value={form.labsmobile_usuario} onChange={e => set("labsmobile_usuario", e.target.value)} placeholder="tucorreo@jelcom.com" />
            </div>
            <div style={{ flex: 1 }}>
              <label>API Token (LabsMobile)</label>
              <input type="text" value={form.labsmobile_token} onChange={e => set("labsmobile_token", e.target.value)} placeholder="Generado en Configuración API" />
            </div>
          </div>
        )}
        <button className="naranja" onClick={crear} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cuenta"}</button>
      </div>

      <div className="card">
        <h2>Cuentas guardadas</h2>
        {cuentas.length === 0 ? <div className="empty" style={{ padding: 24 }}>Aún no hay cuentas. Crea la primera arriba.</div> : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Proveedor</th><th>Remitente</th><th>Probar</th><th></th></tr></thead>
              <tbody>
                {cuentas.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                    <td><span className="tag-canal">{c.proveedor}</span></td>
                    <td>{c.remitente || "—"}</td>
                    <td>
                      <button className="sec" onClick={() => probar(c.id)} disabled={probando === c.id}>{probando === c.id ? "…" : "Probar"}</button>
                      {resultado[c.id] && (
                        <div style={{ fontSize: 11, marginTop: 4, color: resultado[c.id].estado === "ok" ? "#16a34a" : "#dc2626" }}>
                          {resultado[c.id].estado === "ok" ? "✓ " : "✗ "}{resultado[c.id].detalle}
                        </div>
                      )}
                    </td>
                    <td><button className="sec" onClick={() => eliminar(c.id)}>Quitar</button></td>
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