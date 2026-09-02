import { useState, useEffect } from "react";

export default function Configuracion() {
  const [config, setConfig] = useState({});
  const [cred, setCred] = useState(null);
  const [guardado, setGuardado] = useState("");

  async function cargar() {
    const r = await fetch("/api/configuracion").then(r => r.json());
    setConfig(r.config || {}); setCred(r.credenciales || null);
  }
  useEffect(() => { cargar(); }, []);

  function set(k, v) { setConfig(c => ({ ...c, [k]: v })); }
  async function guardar(k) {
    await fetch(`/api/configuracion/${k}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valor: config[k] }) });
    setGuardado(k); setTimeout(() => setGuardado(""), 1500);
  }

  function Semaforo({ ok }) {
    return <span className={`estado-badge ${ok ? "ok" : "sin"}`}><span className={`dot ${ok ? "ok" : "sin"}`} />{ok ? "Configurado" : "Falta"}</span>;
  }

  return (
    <div>
      <h1>Configuración</h1>
      <div className="sub">Datos de la empresa para los informes y estado de las credenciales.</div>

      <div className="card">
        <h2>Datos de la empresa</h2>
        <label>Nombre de la empresa (sale en los informes)</label>
        <div style={{ display: "flex", gap: 10 }}>
          <input type="text" value={config.empresa_nombre || ""} onChange={e => set("empresa_nombre", e.target.value)} />
          <button className="sec" onClick={() => guardar("empresa_nombre")} style={{ marginBottom: 16 }}>{guardado === "empresa_nombre" ? "✓" : "Guardar"}</button>
        </div>
        <label>Email de la empresa</label>
        <div style={{ display: "flex", gap: 10 }}>
          <input type="text" value={config.empresa_email || ""} onChange={e => set("empresa_email", e.target.value)} />
          <button className="sec" onClick={() => guardar("empresa_email")} style={{ marginBottom: 16 }}>{guardado === "empresa_email" ? "✓" : "Guardar"}</button>
        </div>
        <label>Nota de transparencia (pie de informes)</label>
        <div style={{ display: "flex", gap: 10 }}>
          <input type="text" value={config.informe_nota || ""} onChange={e => set("informe_nota", e.target.value)} />
          <button className="sec" onClick={() => guardar("informe_nota")} style={{ marginBottom: 16 }}>{guardado === "informe_nota" ? "✓" : "Guardar"}</button>
        </div>
      </div>

      {cred && (
        <div className="card">
          <h2>Estado de credenciales</h2>
          <div className="hint" style={{ marginTop: -6 }}>Las credenciales se ponen en el archivo <code>.env</code> del backend (y las de WhatsApp en la pestaña Cuentas). Aquí solo ves si están puestas.</div>
          <div className="tabla-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Proveedor</th><th>Dato</th><th>Estado</th></tr></thead>
              <tbody>
                <tr><td rowSpan="3" style={{ fontWeight: 600 }}>Háblame (SMS)</td><td>Account</td><td><Semaforo ok={cred.hablame.account} /></td></tr>
                <tr><td>API Key</td><td><Semaforo ok={cred.hablame.apikey} /></td></tr>
                <tr><td>Remitente</td><td>{cred.hablame.remitente || <span style={{ opacity: .5 }}>—</span>}</td></tr>
                <tr><td rowSpan="2" style={{ fontWeight: 600 }}>Brevo (Correo)</td><td>API Key</td><td><Semaforo ok={cred.brevo.apikey} /></td></tr>
                <tr><td>Email remitente</td><td>{cred.brevo.remitente_email || <span style={{ opacity: .5 }}>—</span>}</td></tr>
                <tr><td rowSpan="2" style={{ fontWeight: 600 }}>Meta (.env respaldo)</td><td>Token</td><td><Semaforo ok={cred.meta_env.token} /></td></tr>
                <tr><td>Phone ID</td><td><Semaforo ok={cred.meta_env.phone_id} /></td></tr>
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 12 }}>Las cuentas de WhatsApp se administran en la página WhatsApp → pestaña Cuentas. Lo de aquí es solo el respaldo del <code>.env</code>.</div>
        </div>
      )}
    </div>
  );
}