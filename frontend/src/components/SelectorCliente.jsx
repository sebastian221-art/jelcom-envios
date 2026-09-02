import { useState, useEffect } from "react";

// Selector del cliente (campaña). Permite elegir uno o crear al vuelo,
// y al crear, asociarle su cuenta de WhatsApp por defecto.
export default function SelectorCliente({ valor, onChange, disabled }) {
  const [campanas, setCampanas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [cuentaNueva, setCuentaNueva] = useState("");

  async function cargar() {
    const r = await fetch("/api/campanas").then(r => r.json());
    setCampanas(r);
    if (!valor && r.length) onChange(r[0].id);
  }
  useEffect(() => {
    cargar();
    fetch("/api/cuentas").then(r => r.json()).then(setCuentas);
  }, []);

  async function crear() {
    if (!nuevo.trim()) return;
    const r = await fetch("/api/campanas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevo.trim(), cuenta_wa_id: cuentaNueva || null }),
    }).then(r => r.json());
    setNuevo(""); setCuentaNueva(""); setCreando(false);
    await cargar(); onChange(r.id);
  }

  return (
    <div>
      <label>Cliente / Campaña</label>
      {!creando ? (
        <div className="selector-cliente">
          <div>
            <select value={valor || ""} onChange={e => onChange(Number(e.target.value))} disabled={disabled}>
              {campanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {!disabled && <button type="button" className="sec" onClick={() => setCreando(true)}>+ Nuevo cliente</button>}
        </div>
      ) : (
        <div>
          <div className="selector-cliente">
            <div>
              <input type="text" value={nuevo} onChange={e => setNuevo(e.target.value)}
                     placeholder="Nombre del cliente (ej. Centro Comercial El Puente)" autoFocus />
            </div>
          </div>
          <label style={{ marginTop: 4 }}>Cuenta de WhatsApp por defecto (opcional)</label>
          <div className="selector-cliente">
            <div>
              <select value={cuentaNueva} onChange={e => setCuentaNueva(Number(e.target.value))}>
                <option value="">— Sin asociar —</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <button type="button" className="naranja" onClick={crear}>Crear</button>
            <button type="button" className="sec" onClick={() => setCreando(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}