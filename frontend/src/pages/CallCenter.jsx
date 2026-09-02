import { useState, useEffect } from "react";
import SelectorCliente from "../components/SelectorCliente.jsx";

export default function CallCenter() {
  const [tab, setTab] = useState("campanas");
  return (
    <div>
      <h1>Call Center</h1>
      <div className="sub">Configura campañas de llamada, formularios, tipificaciones y agentes.</div>
      <div className="tabs">
        <button className={`tab ${tab === "campanas" ? "activo" : ""}`} onClick={() => setTab("campanas")}>📋 Campañas</button>
        <button className={`tab ${tab === "formularios" ? "activo" : ""}`} onClick={() => setTab("formularios")}>📝 Formularios</button>
        <button className={`tab ${tab === "tipificaciones" ? "activo" : ""}`} onClick={() => setTab("tipificaciones")}>🏷️ Tipificaciones</button>
        <button className={`tab ${tab === "agentes" ? "activo" : ""}`} onClick={() => setTab("agentes")}>👤 Agentes</button>
      </div>
      {tab === "campanas" && <TabCampanas />}
      {tab === "formularios" && <TabFormularios />}
      {tab === "tipificaciones" && <TabTipificaciones />}
      {tab === "agentes" && <TabAgentes />}
    </div>
  );
}

// ---------- CAMPAÑAS DE LLAMADA ----------
function TabCampanas() {
  const [lista, setLista] = useState([]);
  const [forms, setForms] = useState([]);
  const [clienteId, setClienteId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [formId, setFormId] = useState("");
  const [modo, setModo] = useState("manual");
  const [nuevaId, setNuevaId] = useState(null);
  const [contactosTxt, setContactosTxt] = useState("");

  async function cargar() {
    setLista(await fetch("/api/callcenter/campanas-llamada").then(r => r.json()));
    setForms(await fetch("/api/callcenter/formularios").then(r => r.json()));
  }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nombre) { alert("Pon nombre de la campaña"); return; }
    const r = await fetch("/api/callcenter/campanas-llamada", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campana_id: clienteId, nombre, formulario_id: formId || null, modo_marcado: modo }),
    }).then(r => r.json());
    setNuevaId(r.id); setNombre(""); cargar();
  }

  async function subirContactos() {
    if (!nuevaId) { alert("Crea la campaña primero"); return; }
    const contactos = contactosTxt.split("\n").map(l => {
      const [nombre, telefono] = l.split(/[,;\t]/).map(s => s.trim());
      return telefono ? { nombre, telefono } : { telefono: nombre };
    }).filter(c => c.telefono);
    const r = await fetch(`/api/callcenter/campanas-llamada/${nuevaId}/contactos`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactos }),
    }).then(r => r.json());
    alert(`${r.agregados} contactos agregados.`);
    setContactosTxt(""); cargar();
  }

  return (
    <>
      <div className="card">
        <h2><span className="num">+</span> Nueva campaña de llamada</h2>
        <SelectorCliente valor={clienteId} onChange={setClienteId} />
        <label>Nombre de la campaña</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Confirmación Chef en Casa" />
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label>Formulario</label>
            <select value={formId} onChange={e => setFormId(Number(e.target.value))}>
              <option value="">— Sin formulario —</option>
              {forms.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Modo de marcado</label>
            <select value={modo} onChange={e => setModo(e.target.value)}>
              <option value="manual">Manual (el agente marca)</option>
              <option value="automatico">Automático (el sistema marca)</option>
            </select>
          </div>
        </div>
        <button className="naranja" onClick={crear}>Crear campaña</button>
      </div>

      {nuevaId && (
        <div className="card">
          <h2>Cargar contactos a la campaña recién creada</h2>
          <div className="hint" style={{ marginTop: -6 }}>Un contacto por línea. Formato: <code>Nombre, teléfono</code> (o solo el teléfono).</div>
          <textarea value={contactosTxt} onChange={e => setContactosTxt(e.target.value)} placeholder={"Juan Pérez, 3001234567\nMaría López, 3109876543"} style={{ minHeight: 140 }} />
          <button className="naranja" onClick={subirContactos}>Cargar contactos</button>
        </div>
      )}

      <div className="card">
        <h2>Campañas de llamada</h2>
        {lista.length === 0 ? <div className="empty" style={{ padding: 24 }}>Aún no hay campañas.</div> : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Campaña</th><th>Cliente</th><th>Formulario</th><th>Modo</th><th>Progreso</th></tr></thead>
              <tbody>
                {lista.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                    <td>{c.cliente_nombre}</td>
                    <td>{c.formulario_nombre || "—"}</td>
                    <td><span className="tag-canal">{c.modo_marcado}</span></td>
                    <td>{c.completados} / {c.total}</td>
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

// ---------- FORMULARIOS ----------
function TabFormularios() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState("");
  const [preguntas, setPreguntas] = useState([]);

  async function cargar() { setLista(await fetch("/api/callcenter/formularios").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);

  function agregarPregunta() { setPreguntas(p => [...p, { texto: "", tipo: "si_no", opciones: [] }]); }
  function setP(i, k, v) { setPreguntas(p => p.map((q, j) => j === i ? { ...q, [k]: v } : q)); }
  function setOpciones(i, txt) { setP(i, "opciones", txt.split(",").map(s => s.trim()).filter(Boolean)); }
  function quitarPregunta(i) { setPreguntas(p => p.filter((_, j) => j !== i)); }

  async function guardar() {
    if (!nombre) { alert("Pon nombre del formulario"); return; }
    if (!preguntas.length) { alert("Agrega al menos una pregunta"); return; }
    await fetch("/api/callcenter/formularios", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, preguntas }),
    });
    setNombre(""); setPreguntas([]); cargar();
  }
  async function eliminar(id) { if (!confirm("¿Eliminar formulario?")) return; await fetch(`/api/callcenter/formularios/${id}`, { method: "DELETE" }); cargar(); }

  return (
    <>
      <div className="card">
        <h2><span className="num">+</span> Nuevo formulario</h2>
        <label>Nombre del formulario</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Encuesta de satisfacción" />

        {preguntas.map((p, i) => (
          <div key={i} style={{ border: "1px solid #eaeaea", borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 2 }}>
                <label>Pregunta {i + 1}</label>
                <input type="text" value={p.texto} onChange={e => setP(i, "texto", e.target.value)} placeholder="Texto de la pregunta" style={{ marginBottom: 8 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Tipo</label>
                <select value={p.tipo} onChange={e => setP(i, "tipo", e.target.value)} style={{ marginBottom: 8 }}>
                  <option value="si_no">Sí / No</option>
                  <option value="opcion">Opciones</option>
                  <option value="texto">Texto libre</option>
                  <option value="numero">Número</option>
                </select>
              </div>
              <button className="sec" onClick={() => quitarPregunta(i)} style={{ marginBottom: 8 }}>Quitar</button>
            </div>
            {p.tipo === "opcion" && (
              <input type="text" defaultValue={p.opciones.join(", ")} onBlur={e => setOpciones(i, e.target.value)} placeholder="Opciones separadas por coma: Carne, Pollo, Vegetariano" />
            )}
          </div>
        ))}
        <div className="btn-row">
          <button className="sec" onClick={agregarPregunta}>+ Agregar pregunta</button>
          <button className="naranja" onClick={guardar}>Guardar formulario</button>
        </div>
      </div>

      <div className="card">
        <h2>Formularios creados</h2>
        {lista.length === 0 ? <div className="empty" style={{ padding: 24 }}>Aún no hay formularios.</div> : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Preguntas</th><th></th></tr></thead>
              <tbody>
                {lista.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.nombre}</td>
                    <td>{f.preguntas?.length || 0}</td>
                    <td><button className="sec" onClick={() => eliminar(f.id)}>Eliminar</button></td>
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

// ---------- TIPIFICACIONES ----------
function TabTipificaciones() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [exito, setExito] = useState(false);

  async function cargar() { setLista(await fetch("/api/callcenter/tipificaciones").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nombre) { alert("Pon el nombre"); return; }
    await fetch("/api/callcenter/tipificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, color, es_exito: exito }) });
    setNombre(""); cargar();
  }
  async function eliminar(id) { await fetch(`/api/callcenter/tipificaciones/${id}`, { method: "DELETE" }); cargar(); }

  return (
    <>
      <div className="card">
        <h2><span className="num">+</span> Nueva tipificación</h2>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label>Nombre</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Cliente satisfecho" />
          </div>
          <div>
            <label>Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 60, height: 44, padding: 4 }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <input type="checkbox" checked={exito} onChange={e => setExito(e.target.checked)} style={{ width: "auto", margin: 0 }} />
            Cuenta como éxito
          </label>
          <button className="naranja" onClick={crear} style={{ marginBottom: 16 }}>Crear</button>
        </div>
      </div>
      <div className="card">
        <h2>Tipificaciones</h2>
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Color</th><th>Éxito</th><th></th></tr></thead>
            <tbody>
              {lista.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.nombre}</td>
                  <td><span style={{ display: "inline-block", width: 20, height: 20, borderRadius: 6, background: t.color }} /></td>
                  <td>{t.es_exito ? "Sí" : "—"}</td>
                  <td><button className="sec" onClick={() => eliminar(t.id)}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- AGENTES ----------
function TabAgentes() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState("");

  async function cargar() { setLista(await fetch("/api/callcenter/agentes").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nombre) { alert("Pon el nombre"); return; }
    await fetch("/api/callcenter/agentes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }) });
    setNombre(""); cargar();
  }
  async function eliminar(id) { await fetch(`/api/callcenter/agentes/${id}`, { method: "DELETE" }); cargar(); }

  return (
    <>
      <div className="card">
        <h2><span className="num">+</span> Nuevo agente</h2>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}>
            <label>Nombre del agente</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Lina Adarme" />
          </div>
          <button className="naranja" onClick={crear} style={{ marginBottom: 16 }}>Crear</button>
        </div>
      </div>
      <div className="card">
        <h2>Agentes</h2>
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {lista.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.nombre}</td>
                  <td><span className={`badge ${a.estado === "disponible" ? "finalizada" : a.estado === "en_llamada" ? "en_curso" : "lista"}`}>{a.estado}</span></td>
                  <td><button className="sec" onClick={() => eliminar(a.id)}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}