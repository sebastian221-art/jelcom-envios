import { useState, useEffect } from "react";

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState({ nombre: "", email: "", rol: "operador" });
  const [guardando, setGuardando] = useState(false);

  async function cargar() { setUsuarios(await fetch("/api/usuarios").then(r => r.json())); }
  useEffect(() => { cargar(); }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function crear() {
    if (!form.nombre || !form.email) { alert("Nombre y email son obligatorios"); return; }
    setGuardando(true);
    const r = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then(r => r.json());
    setGuardando(false);
    if (r.error) { alert(r.error); return; }
    setForm({ nombre: "", email: "", rol: "operador" }); cargar();
  }
  async function cambiarRol(u, rol) { await fetch(`/api/usuarios/${u.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rol }) }); cargar(); }
  async function toggleActivo(u) { await fetch(`/api/usuarios/${u.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo: u.activo ? 0 : 1 }) }); cargar(); }
  async function eliminar(u) { if (!confirm(`¿Eliminar a ${u.nombre}?`)) return; await fetch(`/api/usuarios/${u.id}`, { method: "DELETE" }); cargar(); }

  return (
    <div>
      <h1>Usuarios</h1>
      <div className="sub">Quién puede usar la plataforma. Admin ve y configura todo; operador solo hace envíos.</div>

      <div className="card">
        <h2><span className="num">+</span> Nuevo usuario</h2>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 2 }}>
            <label>Nombre</label>
            <input type="text" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Nombre completo" />
          </div>
          <div style={{ flex: 2 }}>
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="correo@jelcom.com" />
          </div>
          <div style={{ flex: 1 }}>
            <label>Rol</label>
            <select value={form.rol} onChange={e => set("rol", e.target.value)}>
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <button className="naranja" onClick={crear} disabled={guardando}>{guardando ? "Guardando…" : "Crear usuario"}</button>
      </div>

      <div className="card">
        <h2>Usuarios registrados</h2>
        {usuarios.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>Aún no hay usuarios.</div>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                    <td>{u.email}</td>
                    <td>
                      <select value={u.rol} onChange={e => cambiarRol(u, e.target.value)} style={{ margin: 0, padding: "6px 10px", width: "auto" }}>
                        <option value="operador">Operador</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.activo ? "finalizada" : "error"}`} onClick={() => toggleActivo(u)} style={{ cursor: "pointer" }}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td><button className="sec" onClick={() => eliminar(u)}>Eliminar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint" style={{ marginTop: 12 }}>Toca el estado para activar/desactivar sin borrar.</div>
      </div>
    </div>
  );
}