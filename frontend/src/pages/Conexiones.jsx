import { useState, useEffect } from "react";

const NOMBRES = {
  hablame: { nombre: "Háblame", uso: "SMS" },
  meta: { nombre: "Meta / WhatsApp", uso: "WhatsApp" },
  brevo: { nombre: "Brevo", uso: "Correo" },
  twilio: { nombre: "Twilio", uso: "Bot de voz (llamadas)" },
  elevenlabs: { nombre: "ElevenLabs", uso: "Bot de voz (audio)" },
};

export default function Conexiones() {
  const [conns, setConns] = useState([]);
  const [probando, setProbando] = useState(null);

  async function cargar() { setConns(await fetch("/api/conexiones").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);

  async function probar(prov) {
    setProbando(prov);
    await fetch(`/api/conexiones/${prov}/probar`, { method: "POST" }).then(r => r.json());
    await cargar(); setProbando(null);
  }

  return (
    <div>
      <h1>Conexiones</h1>
      <div className="sub">Estado de cada proveedor. Revisa aquí primero si algo falla en los envíos.</div>
      <div className="conn-grid">
        {conns.map(c => {
          const meta = NOMBRES[c.proveedor] || { nombre: c.proveedor, uso: "" };
          const cls = c.estado === "ok" ? "ok" : c.estado === "error" ? "error" : "sin";
          const txt = c.estado === "ok" ? "Conectado" : c.estado === "error" ? "Error" : "Sin probar";
          return (
            <div className="conn" key={c.proveedor}>
              <div className="top">
                <div>
                  <div className="nombre">{meta.nombre}</div>
                  <div className="uso">{meta.uso}</div>
                </div>
                <span className={`estado-badge ${cls}`}><span className={`dot ${cls}`} />{txt}</span>
              </div>
              <div className="detalle">
                {c.detalle || "Aún no se ha probado esta conexión."}
                {c.saldo && <div style={{ marginTop: 6 }}>Saldo: <strong>{c.saldo}</strong></div>}
                {c.ultimo_chequeo && <div style={{ marginTop: 6, fontSize: 11, opacity: .6 }}>Última prueba: {c.ultimo_chequeo}</div>}
              </div>
              <button className="sec" onClick={() => probar(c.proveedor)} disabled={probando === c.proveedor}>
                {probando === c.proveedor ? "Probando…" : "Probar conexión"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}