import { useState, useEffect, useRef } from "react";
import SelectorCliente from "../components/SelectorCliente.jsx";

const CLAVE_BORRADOR = "jelcom_borrador_whatsapp";

export default function WhatsApp() {
  const [modo, setModo] = useState("A");
  return (
    <div>
      <h1>Envío de WhatsApp</h1>
      <div className="sub">Envía con plantilla existente, crea plantillas nuevas, o administra tus cuentas de WhatsApp.</div>
      <div className="tabs">
        <button className={`tab ${modo === "A" ? "activo" : ""}`} onClick={() => setModo("A")}>⚡ Plantilla existente</button>
        <button className={`tab ${modo === "B" ? "activo" : ""}`} onClick={() => setModo("B")}>✏️ Crear plantilla</button>
        <button className={`tab ${modo === "C" ? "activo" : ""}`} onClick={() => setModo("C")}>📱 Cuentas</button>
      </div>
      {modo === "A" && <ModoEnvio />}
      {modo === "B" && <ModoCrearPlantilla />}
      {modo === "C" && <ModoCuentas />}
    </div>
  );
}

// Hook: carga cuentas de WhatsApp
function useCuentas() {
  const [cuentas, setCuentas] = useState([]);
  async function cargar() { setCuentas(await fetch("/api/cuentas").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);
  return [cuentas, cargar];
}

// ─────────── MODO A: enviar ───────────
function ModoEnvio() {
  const [cuentas] = useCuentas();
  const [clienteId, setClienteId] = useState(null);
  const [cuentaId, setCuentaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [plantilla, setPlantilla] = useState("");
  const [idioma, setIdioma] = useState("es");
  const [imagenUrl, setImagenUrl] = useState("");
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
        if (g.plantilla) setPlantilla(g.plantilla);
        if (g.idioma) setIdioma(g.idioma);
        if (g.imagenUrl) setImagenUrl(g.imagenUrl);
      }
    } catch {}
  }, []);

  // Guarda el borrador cada vez que cambia algo, mientras no exista un envío creado.
  useEffect(() => {
    if (envioId) return;
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ clienteId, cuentaId, nombre, plantilla, idioma, imagenUrl }));
  }, [clienteId, cuentaId, nombre, plantilla, idioma, imagenUrl, envioId]);

  // cuando cambia el cliente, autoselecciona su cuenta por defecto
  // (si no tiene ninguna asignada, selecciona la única disponible o avisa)
  async function onCliente(id) {
    setClienteId(id);
    const camp = await fetch("/api/campanas").then(r => r.json());
    const c = camp.find(x => x.id === id);
    if (c && c.cuenta_wa_id) {
      setCuentaId(c.cuenta_wa_id);
    } else if (cuentas.length === 1) {
      setCuentaId(cuentas[0].id);
    } else {
      setCuentaId("");
    }
  }

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
    if (!nombre || !plantilla) { alert("Pon nombre del envío y de la plantilla"); return; }
    if (!cuentaId) { alert("Elige con qué cuenta de WhatsApp se enviará"); return; }
    if (!archivoRef.current.files[0]) { alert("Selecciona la base"); return; }
    setCargando(true);
    const c = await fetch("/api/envios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campana_id: clienteId, cuenta_wa_id: cuentaId, nombre, canal: "whatsapp", plantilla, idioma, imagen_url: imagenUrl || null }),
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
  function nueva() { setNombre(""); setPlantilla(""); setImagenUrl(""); setEnvioId(null); setDepu(null); setLogs([]); setEstado(null); setEnviando(false); localStorage.removeItem(CLAVE_BORRADOR); if (archivoRef.current) archivoRef.current.value = ""; }

  const puedeEnviar = depu && depu.validos > 0 && !enviando;
  const finalizada = estado && ["finalizada", "error"].includes(estado.estado);

  return (
    <>
      <div className="card">
        <h2><span className="num">1</span> Contenido</h2>
        <SelectorCliente valor={clienteId} onChange={onCliente} disabled={!!envioId} />
        <label>Cuenta de WhatsApp (con qué número se envía)</label>
        <select value={cuentaId} onChange={e => setCuentaId(Number(e.target.value))} disabled={!!envioId}>
          <option value="">— Elige una cuenta —</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` (${c.telefono})` : ""}</option>)}
        </select>
        <div className="hint">
          {cuentaId
            ? "Se autoselecciona la del cliente, pero puedes cambiarla para este envío."
            : "⚠️ Este cliente no tiene una cuenta de WhatsApp asignada por defecto. Elige una arriba antes de continuar."}
        </div>
        <label>Nombre del envío</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Festipatitas Bucaramanga" disabled={!!envioId} />
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 2 }}>
            <label>Nombre de la plantilla (en Meta)</label>
            <input type="text" value={plantilla} onChange={e => setPlantilla(e.target.value)} placeholder="ej. festipatitas_campoalegre" disabled={!!envioId} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Idioma</label>
            <input type="text" value={idioma} onChange={e => setIdioma(e.target.value)} placeholder="es" disabled={!!envioId} />
          </div>
        </div>
        <label>URL de la imagen de cabecera (opcional)</label>
        <input type="text" value={imagenUrl} onChange={e => setImagenUrl(e.target.value)} placeholder="https://i.ibb.co/... (vacío si la plantilla no lleva imagen)" disabled={!!envioId} />
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

// ─────────── MODO B: crear plantilla ───────────
function ModoCrearPlantilla() {
  const [cuentas] = useCuentas();
  const [cuentaId, setCuentaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("MARKETING");
  const [idioma, setIdioma] = useState("es");
  const [cuerpo, setCuerpo] = useState("");
  const [tipoCabecera, setTipoCabecera] = useState("ninguna");
  const [imagenEjemplo, setImagenEjemplo] = useState("");
  const [plantillas, setPlantillas] = useState([]);
  const [enviando, setEnviando] = useState(false);

  async function cargar() { setPlantillas(await fetch("/api/whatsapp/plantillas").then(r => r.json())); }
  useEffect(() => { cargar(); const iv = setInterval(cargar, 15000); return () => clearInterval(iv); }, []);

  async function enviarRevision() {
    if (!nombre || !cuerpo) { alert("Pon nombre y cuerpo"); return; }
    if (!cuentaId) { alert("Elige la cuenta de WhatsApp donde se creará"); return; }
    if (tipoCabecera === "imagen" && !imagenEjemplo) { alert("Para cabecera de imagen, pon una URL de ejemplo"); return; }
    setEnviando(true);
    const r = await fetch("/api/whatsapp/plantillas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, categoria, idioma, cuerpo, tipo_cabecera: tipoCabecera, imagen_ejemplo: imagenEjemplo || null, cuenta_wa_id: cuentaId }),
    }).then(r => r.json());
    setEnviando(false);
    if (r.error) { alert("Meta rechazó la creación: " + r.error); return; }
    setNombre(""); setCuerpo(""); setImagenEjemplo(""); cargar();
  }
  function badge(e) {
    const map = { APPROVED: "finalizada", PENDIENTE: "en_curso", PENDING: "en_curso", REJECTED: "error" };
    const txt = { APPROVED: "Aprobada", PENDIENTE: "En revisión", PENDING: "En revisión", REJECTED: "Rechazada" };
    return <span className={`badge ${map[e] || "lista"}`}>{txt[e] || e}</span>;
  }

  return (
    <>
      <div className="card">
        <h2><span className="num">1</span> Datos de la plantilla</h2>
        <label>Cuenta de WhatsApp donde se crea</label>
        <select value={cuentaId} onChange={e => setCuentaId(Number(e.target.value))}>
          <option value="">— Elige una cuenta —</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          <div style={{ flex: 2 }}>
            <label>Nombre (minúsculas, sin ñ ni tildes)</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="ej. cumpleanos_splash" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Idioma</label>
            <input type="text" value={idioma} onChange={e => setIdioma(e.target.value)} placeholder="es" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label>Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility (utilidad)</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Cabecera</label>
            <select value={tipoCabecera} onChange={e => setTipoCabecera(e.target.value)}>
              <option value="ninguna">Sin cabecera (solo texto)</option>
              <option value="imagen">Imagen</option>
            </select>
          </div>
        </div>
        {tipoCabecera === "imagen" && (
          <>
            <label>URL de imagen de ejemplo (Meta la pide para aprobar)</label>
            <input type="text" value={imagenEjemplo} onChange={e => setImagenEjemplo(e.target.value)} placeholder="https://i.ibb.co/..." />
          </>
        )}
        <label>Cuerpo del mensaje</label>
        <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} placeholder="Texto de la plantilla tal como saldrá en WhatsApp." style={{ minHeight: 140 }} />
        <div className="hint">Meta revisa cada plantilla antes de permitir su uso. Suele tardar de minutos a unas horas.</div>
        <button className="naranja" onClick={enviarRevision} disabled={enviando}>{enviando ? "Enviando a Meta…" : "Enviar a revisión"}</button>
      </div>

      <div className="card">
        <h2>Plantillas enviadas</h2>
        <div className="hint" style={{ marginTop: -6 }}>El estado se actualiza solo. Cuando diga "Aprobada", úsala en "Plantilla existente".</div>
        {plantillas.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>Aún no has creado plantillas desde el sistema.</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Categoría</th><th>Estado</th><th>Creada</th></tr></thead>
              <tbody>
                {plantillas.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td>{p.categoria}</td>
                    <td>{badge(p.estado)}{p.motivo && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{p.motivo}</div>}</td>
                    <td>{(p.creada_en || "").slice(0, 16)}</td>
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

// ─────────── MODO C: cuentas de WhatsApp ───────────
function ModoCuentas() {
  const [cuentas, recargar] = useCuentas();
  const [form, setForm] = useState({ nombre: "", telefono: "", wa_token: "", wa_phone_id: "", wa_business_id: "" });
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(null);
  const [resultado, setResultado] = useState({});

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function crear() {
    if (!form.nombre || !form.wa_token || !form.wa_phone_id) { alert("Nombre, token y phone ID son obligatorios"); return; }
    setGuardando(true);
    await fetch("/api/cuentas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ nombre: "", telefono: "", wa_token: "", wa_phone_id: "", wa_business_id: "" });
    setGuardando(false); recargar();
  }
  async function probar(id) {
    setProbando(id);
    const r = await fetch(`/api/cuentas/${id}/probar`, { method: "POST" }).then(r => r.json());
    setResultado(p => ({ ...p, [id]: r })); setProbando(null);
  }
  async function eliminar(id) {
    if (!confirm("¿Quitar esta cuenta? Los envíos ya hechos con ella no se afectan.")) return;
    await fetch(`/api/cuentas/${id}`, { method: "DELETE" }); recargar();
  }

  return (
    <>
      <div className="card">
        <h2><span className="num">+</span> Nueva cuenta de WhatsApp</h2>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 2 }}>
            <label>Nombre de la cuenta</label>
            <input type="text" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej. WhatsApp Cajasan" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Número (informativo)</label>
            <input type="text" value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="+57 300 000 0000" />
          </div>
        </div>
        <label>Token de acceso (WA_TOKEN)</label>
        <input type="text" value={form.wa_token} onChange={e => set("wa_token", e.target.value)} placeholder="EAAxxxxx..." />
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label>Phone Number ID</label>
            <input type="text" value={form.wa_phone_id} onChange={e => set("wa_phone_id", e.target.value)} placeholder="123456789" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Business ID (para crear plantillas)</label>
            <input type="text" value={form.wa_business_id} onChange={e => set("wa_business_id", e.target.value)} placeholder="987654321" />
          </div>
        </div>
        <button className="naranja" onClick={crear} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cuenta"}</button>
      </div>

      <div className="card">
        <h2>Cuentas guardadas</h2>
        {cuentas.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>Aún no hay cuentas. Crea la primera arriba.</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Número</th><th>Phone ID</th><th>Token</th><th>Probar</th><th></th></tr></thead>
              <tbody>
                {cuentas.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                    <td>{c.telefono || "—"}</td>
                    <td>{c.wa_phone_id || "—"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.wa_token || "—"}</td>
                    <td>
                      <button className="sec" onClick={() => probar(c.id)} disabled={probando === c.id}>
                        {probando === c.id ? "…" : "Probar"}
                      </button>
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