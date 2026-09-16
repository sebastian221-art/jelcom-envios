import { useState, useEffect } from "react";

export default function ApiExterna() {
  const [keys, setKeys] = useState([]);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevaKey, setNuevaKey] = useState(null); // se muestra completa solo justo al crearla

  async function cargar() { setKeys(await fetch("/api/apikeys").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nombre.trim()) { alert("Ponle un nombre al sistema (ej. Satella, PSI, Hospital San Gil)"); return; }
    setCreando(true);
    const r = await fetch("/api/apikeys", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nombre.trim() }),
    }).then(r => r.json());
    setCreando(false);
    if (r.error) { alert(r.error); return; }
    setNuevaKey(r);
    setNombre("");
    cargar();
  }
  async function revocar(id) {
    if (!confirm("¿Revocar esta API key? El sistema que la use dejará de poder conectarse.")) return;
    await fetch(`/api/apikeys/${id}`, { method: "DELETE" });
    cargar();
  }

  return (
    <div>
      <h1>API externa</h1>
      <div className="sub">Da acceso a otros sistemas (Satella, PSI, el hospital, etc.) para crear envíos, dividirlos y descargar informes.</div>

      {nuevaKey && (
        <div className="card" style={{ borderLeft: "4px solid var(--naranja)" }}>
          <h2>✅ API key creada para "{nuevaKey.nombre}"</h2>
          <div className="hint" style={{ marginTop: -6 }}>
            Cópiala ahora — por seguridad no se vuelve a mostrar completa después de salir de esta pantalla.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="text" readOnly value={nuevaKey.api_key} style={{ fontFamily: "monospace", marginBottom: 0 }} />
            <button className="sec" onClick={() => { navigator.clipboard.writeText(nuevaKey.api_key); alert("Copiada"); }}>Copiar</button>
          </div>
          <button className="sec" style={{ marginTop: 12 }} onClick={() => setNuevaKey(null)}>Cerrar</button>
        </div>
      )}

      <div className="card">
        <h2><span className="num">+</span> Nueva API key</h2>
        <label>Nombre del sistema</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Satella, PSI, Hospital San Gil" />
        <button className="naranja" onClick={crear} disabled={creando}>{creando ? "Generando…" : "Generar API key"}</button>
      </div>

      <div className="card">
        <h2>API keys activas</h2>
        {keys.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>Aún no has creado ninguna.</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Sistema</th><th>Key</th><th>Estado</th><th>Último uso</th><th>Creada</th><th></th></tr></thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 600 }}>{k.nombre}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{k.api_key.slice(0, 10)}••••••••</td>
                    <td>{k.activa ? <span className="badge finalizada">Activa</span> : <span className="badge error">Revocada</span>}</td>
                    <td>{k.ultimo_uso ? k.ultimo_uso.slice(0, 16) : "Nunca"}</td>
                    <td>{(k.creada_en || "").slice(0, 16)}</td>
                    <td>{k.activa === 1 && <button className="sec" onClick={() => revocar(k.id)}>Revocar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Cómo la usan tus otros sistemas</h2>
        <div className="hint" style={{ marginTop: -6 }}>
          Todas las rutas normales de la plataforma, bajo <code>/api/external/...</code>, mandando la key en la cabecera <code>x-api-key</code>.
        </div>
        <pre style={{ background: "#f4f4f4", padding: 14, borderRadius: 8, fontSize: 12.5, overflowX: "auto" }}>
{`curl -X POST https://backendjelcomenvios-production.up.railway.app/api/external/envios \\
  -H "x-api-key: TU_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"campana_id":1,"cuenta_wa_id":3,"nombre":"Prueba API","canal":"whatsapp","plantilla":"mi_plantilla","idioma":"es"}'`}
        </pre>
      </div>
    </div>
  );
}