import { useState, useEffect, useRef } from "react";

// Lista negra: contactos que pidieron no recibir más mensajes.
// Se excluyen solos de TODOS los envíos (SMS, WhatsApp, Correo y Bot de voz).
export default function ListaNegra() {
  const [lista, setLista] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState({ valor: "", nombre: "", documento: "", motivo: "Pidió no recibir más mensajes" });
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const archivoRef = useRef();

  async function cargar() {
    const q = busqueda.trim() ? `?q=${encodeURIComponent(busqueda.trim())}` : "";
    setLista(await fetch("/api/lista-negra" + q).then(r => r.json()));
  }
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [busqueda]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function agregar() {
    if (!form.valor.trim()) { alert("Escribe el celular o el correo"); return; }
    setGuardando(true);
    const r = await fetch("/api/lista-negra", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json());
    setGuardando(false);
    if (r.error) { alert(r.error); return; }
    setAviso(`✅ ${r.valor} agregado. Ya no recibirá mensajes de ningún canal.`);
    setForm(f => ({ ...f, valor: "", nombre: "", documento: "" }));
    cargar();
  }

  async function importar() {
    const archivo = archivoRef.current.files[0];
    if (!archivo) { alert("Elige un Excel o CSV"); return; }
    setImportando(true);
    const fd = new FormData(); fd.append("archivo", archivo);
    const r = await fetch("/api/lista-negra/importar", { method: "POST", body: fd }).then(r => r.json());
    setImportando(false);
    if (r.error) { alert(r.error); return; }
    setAviso(`✅ Importación lista: ${r.agregados} agregados · ${r.repetidos} ya estaban · ${r.ignorados} celdas ignoradas (no eran celular ni correo).`);
    archivoRef.current.value = "";
    cargar();
  }

  async function quitar(item) {
    if (!confirm(`¿Quitar ${item.valor} de la lista negra? Volverá a recibir mensajes.`)) return;
    await fetch(`/api/lista-negra/${item.id}`, { method: "DELETE" });
    cargar();
  }

  return (
    <div>
      <h1>Lista negra</h1>
      <div className="sub">
        Contactos que pidieron no recibir más mensajes. Se quitan automáticamente de cualquier envío —
        SMS, WhatsApp, Correo y Bot de voz — y el envío sigue normal con los demás.
      </div>

      {aviso && (
        <div className="card" style={{ borderLeft: "4px solid var(--naranja)", padding: "14px 18px" }}>
          {aviso}
          <button className="sec" style={{ marginLeft: 12 }} onClick={() => setAviso(null)}>Cerrar</button>
        </div>
      )}

      <div className="card">
        <h2><span className="num">+</span> Agregar contacto</h2>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label>Celular o correo</label>
            <input type="text" value={form.valor} onChange={e => set("valor", e.target.value)} placeholder="3193455031  o  correo@ejemplo.com" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Nombre (opcional)</label>
            <input type="text" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Nombre de la persona" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label>Documento (opcional)</label>
            <input type="text" value={form.documento} onChange={e => set("documento", e.target.value)} placeholder="CC / NIT" />
          </div>
          <div style={{ flex: 2 }}>
            <label>Motivo</label>
            <input type="text" value={form.motivo} onChange={e => set("motivo", e.target.value)} />
          </div>
        </div>
        <div className="hint">El celular puede venir con o sin 57, espacios o guiones: se guarda igual.</div>
        <button className="naranja" onClick={agregar} disabled={guardando}>{guardando ? "Guardando…" : "Agregar a la lista negra"}</button>
      </div>

      <div className="card">
        <h2><span className="num">⬆</span> Importar desde Excel</h2>
        <input type="file" ref={archivoRef} accept=".xlsx,.xls,.csv" />
        <div className="hint">Toma cualquier celda que sea un celular colombiano o un correo, en cualquier columna u hoja. Lo demás se ignora.</div>
        <button className="naranja" onClick={importar} disabled={importando}>{importando ? "Importando…" : "Importar"}</button>
      </div>

      <div className="card">
        <h2>Contactos bloqueados ({lista.length})</h2>
        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por número, correo, nombre o documento…" />
        {lista.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>{busqueda ? "No hay resultados." : "La lista negra está vacía."}</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Contacto</th><th>Tipo</th><th>Nombre</th><th>Documento</th><th>Motivo</th><th>Agregado</th><th></th></tr></thead>
              <tbody>
                {lista.map(x => (
                  <tr key={x.id}>
                    <td style={{ fontWeight: 600, fontFamily: "monospace" }}>{x.valor}</td>
                    <td><span className="tag-canal">{x.tipo === "correo" ? "CORREO" : "CELULAR"}</span></td>
                    <td>{x.nombre || "—"}</td>
                    <td>{x.documento || "—"}</td>
                    <td>{x.motivo || "—"}</td>
                    <td>{(x.creado_en || "").slice(0, 16)}</td>
                    <td><button className="sec" onClick={() => quitar(x)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
