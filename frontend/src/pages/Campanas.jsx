import { useState, useEffect } from "react";

export default function Campanas() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/api/campanas").then(r => r.json()).then(setRows);
  }, []);

  function informe(id) {
    window.open(`/api/campanas/${id}/informe`, "_blank");
  }

  return (
    <div>
      <h1>Campañas</h1>
      <div className="sub">Historial de todos los envíos. Descarga el informe de cualquiera.</div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="hint">Aún no hay campañas. Crea una desde SMS, WhatsApp o Correo.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th><th>Nombre</th><th>Canal</th><th>Estado</th>
                <th>Enviados</th><th>Fecha</th><th>Informe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.nombre}</td>
                  <td>{c.canal.toUpperCase()}</td>
                  <td><span className={`badge ${c.estado}`}>{c.estado}</span></td>
                  <td>{c.total_enviados || 0} / {c.total_validos || 0}</td>
                  <td>{(c.enviada_en || c.creada_en || "").slice(0, 16)}</td>
                  <td>
                    {c.estado === "finalizada"
                      ? <button className="sec" onClick={() => informe(c.id)}>⬇ Excel</button>
                      : <span style={{ opacity: .4 }}>—</span>}
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
