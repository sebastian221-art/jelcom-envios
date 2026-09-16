import { NavLink } from "react-router-dom";
import EnviosActivos from "./EnviosActivos.jsx";

export default function Layout({ children }) {
  const link = ({ isActive }) => (isActive ? "activo" : "");
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="marca">JEL<span>COM</span></div>
          <small>Plataforma de envíos masivos</small>
        </div>
        <nav>
          <div className="grupo">Canales</div>
          <NavLink to="/sms" className={link}><span className="ico">💬</span> SMS</NavLink>
          <NavLink to="/whatsapp" className={link}><span className="ico">🟢</span> WhatsApp</NavLink>
          <NavLink to="/correo" className={link}><span className="ico">✉️</span> Correo</NavLink>
          <NavLink to="/voz" className={link}><span className="ico">📞</span> Bot de voz</NavLink>

          <div className="grupo">Call Center</div>
          <NavLink to="/callcenter" className={link}><span className="ico">🎧</span> Call Center</NavLink>
          <NavLink to="/agente" className={link}><span className="ico">🎙️</span> Puesto del agente</NavLink>

          <div className="grupo">Gestión</div>
          <NavLink to="/historial" className={link}><span className="ico">📊</span> Historial de envíos</NavLink>
          <NavLink to="/conexiones" className={link}><span className="ico">🔌</span> Conexiones</NavLink>

          <div className="grupo">Sistema</div>
          <NavLink to="/api-externa" className={link}><span className="ico">🔑</span> API externa</NavLink>
          <NavLink to="/configuracion" className={link}><span className="ico">⚙️</span> Configuración</NavLink>
          <NavLink to="/usuarios" className={link}><span className="ico">👥</span> Usuarios</NavLink>
        </nav>
      </aside>
      <main className="main">
        <EnviosActivos />
        {children}
      </main>
    </div>
  );
}