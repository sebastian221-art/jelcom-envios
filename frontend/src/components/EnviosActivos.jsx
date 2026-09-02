import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ICONO_CANAL = { sms: "💬", whatsapp: "🟢", correo: "✉️", voz: "📞" };
const MINUTOS_GRACIA = 20; // cuánto tiempo se queda visible un envío ya terminado

// Panel fijo de envíos en curso/pausados/recién terminados. Vive en el Layout,
// así que se ve desde cualquier página — cambiar de pantalla ya NO hace perder
// el seguimiento, y un envío terminado no desaparece de golpe sin avisar.
export default function EnviosActivos() {
  const [envios, setEnvios] = useState([]);
  const [abierto, setAbierto] = useState(true);
  const navigate = useNavigate();

  async function cargar() {
    try {
      const [activos, terminados] = await Promise.all([
        fetch("/api/envios?estados=en_curso,pausada").then(r => r.json()),
        fetch("/api/envios?estados=finalizada,error").then(r => r.json()),
      ]);
      const ahora = Date.now();
      const recientes = terminados.filter(e => {
        const fin = new Date((e.enviado_en || e.creado_en).replace(" ", "T")).getTime();
        return (ahora - fin) / 60000 <= MINUTOS_GRACIA;
      });
      setEnvios([...activos, ...recientes]);
    } catch {}
  }
  useEffect(() => {
    cargar();
    const iv = setInterval(cargar, 3000); // refresca cada 3s, sin importar la página
    return () => clearInterval(iv);
  }, []);

  async function pausar(id, e) {
    e.stopPropagation();
    await fetch(`/api/envios/${id}/pausar`, { method: "POST" });
    cargar();
  }
  async function reanudar(id, e) {
    e.stopPropagation();
    await fetch(`/api/envios/${id}/enviar`, { method: "POST" });
    cargar();
  }
  function descargar(id, e) {
    e.stopPropagation();
    window.open(`/api/envios/${id}/informe`, "_blank");
  }

  if (envios.length === 0) return null;
  const activos = envios.filter(e => ["en_curso", "pausada"].includes(e.estado));

  return (
    <div className="envios-activos">
      <div className="envios-activos-header" onClick={() => setAbierto(a => !a)}>
        {activos.length > 0 && <span className="pulso" />}
        <strong>
          {activos.length > 0 ? `${activos.length} envío${activos.length > 1 ? "s" : ""} en curso` : "Envíos recientes"}
        </strong>
        <span className="chevron">{abierto ? "▾" : "▸"}</span>
      </div>
      {abierto && (
        <div className="envios-activos-lista">
          {envios.map(e => {
            const terminado = ["finalizada", "error"].includes(e.estado);
            const pct = e.total_validos ? Math.round(((e.total_enviados + e.total_errores) / e.total_validos) * 100) : 0;
            return (
              <div key={e.id} className="envio-activo-item" onClick={() => navigate(`/envios/${e.id}`)}>
                <span className="ea-icono">{terminado ? "✅" : ICONO_CANAL[e.canal] || "📨"}</span>
                <div className="ea-info">
                  <div className="ea-nombre">{e.nombre} <span className="ea-cliente">· {e.campana_nombre}</span></div>
                  <div className="ea-barra"><div className="ea-barra-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="ea-detalle">{e.total_enviados}/{e.total_validos} · {terminado ? "Terminado" : e.estado}</div>
                </div>
                {e.estado === "en_curso" && <button className="sec ea-btn" onClick={(ev) => pausar(e.id, ev)}>⏸</button>}
                {e.estado === "pausada" && <button className="naranja ea-btn" onClick={(ev) => reanudar(e.id, ev)}>▶</button>}
                {terminado && <button className="verde ea-btn" onClick={(ev) => descargar(e.id, ev)}>⬇</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}