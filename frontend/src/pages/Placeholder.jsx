export default function Placeholder({ titulo, fase }) {
  return (
    <div>
      <h1>{titulo}</h1>
      <div className="sub">Esta sección llega en la siguiente fase.</div>
      <div className="card">
        <p style={{ color: "#595959", lineHeight: 1.7 }}>
          🚧 <strong>{titulo}</strong> todavía no está activo.
          {fase && <> Corresponde a la <strong>{fase}</strong>, que construiremos sobre esta misma base
          (el motor de envío, la depuración y el generador de informes ya sirven para todos los canales).</>}
        </p>
      </div>
    </div>
  );
}