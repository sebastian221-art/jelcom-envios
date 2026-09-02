// Rutas específicas de WhatsApp: crear plantilla (Modo B) y consultar estado.
// El envío en sí usa las rutas de /api/envios (canal 'whatsapp'), igual que SMS.
const express = require("express");
const { db } = require("../db");
const meta = require("../services/proveedores/meta");

const router = express.Router();

// Sondeo automático: cada plantilla PENDIENTE se consulta a Meta cada 60s.
// Cuando Meta responde APPROVED/REJECTED, se guarda y se deja de sondear.
const sondeos = new Map(); // plantilla_id -> intervalId

function iniciarSondeo(plantillaId, nombre) {
  if (sondeos.has(plantillaId)) return;
  const iv = setInterval(async () => {
    const pl = db.prepare("SELECT cuenta_wa_id FROM plantillas WHERE id=?").get(plantillaId);
    const cuentaS = pl && pl.cuenta_wa_id ? db.prepare("SELECT * FROM cuentas_whatsapp WHERE id=?").get(pl.cuenta_wa_id) : null;
    const r = await meta.estadoPlantilla(nombre, cuentaS);
    if (r.estado && !["PENDING", "PENDIENTE", "ERROR", "NO_ENCONTRADA", "DESCONOCIDO"].includes(r.estado)) {
      db.prepare("UPDATE plantillas SET estado=?, motivo=?, revisada_en=datetime('now','localtime') WHERE id=?")
        .run(r.estado, r.motivo || null, plantillaId);
      clearInterval(iv);
      sondeos.delete(plantillaId);
    }
  }, 60000); // cada 60 segundos
  sondeos.set(plantillaId, iv);
}

// Al arrancar el server, retomar sondeo de las que quedaron pendientes
function retomarSondeosPendientes() {
  const pend = db.prepare("SELECT id, nombre FROM plantillas WHERE estado IN ('PENDIENTE','PENDING')").all();
  for (const p of pend) iniciarSondeo(p.id, p.nombre);
}

// Listar plantillas creadas desde el sistema
router.get("/plantillas", (req, res) => {
  res.json(db.prepare("SELECT * FROM plantillas ORDER BY id DESC").all());
});

// Crear plantilla (Modo B) -> la manda a Meta y arranca el sondeo automático
router.post("/plantillas", async (req, res) => {
  const { nombre, categoria, idioma, cuerpo, tipo_cabecera, imagen_ejemplo, cuenta_wa_id } = req.body;
  const cuenta = cuenta_wa_id ? db.prepare("SELECT * FROM cuentas_whatsapp WHERE id=?").get(cuenta_wa_id) : null;
  if (!nombre || !cuerpo) return res.status(400).json({ error: "nombre y cuerpo son obligatorios" });

  const r = await meta.crearPlantilla({
    nombre, categoria, idioma, cuerpo,
    tipoCabecera: tipo_cabecera || "ninguna",
    imagenEjemploUrl: imagen_ejemplo,
    cuenta,
  });
  if (!r.ok) return res.status(400).json({ error: r.error });

  const info = db.prepare(
    `INSERT INTO plantillas (nombre, categoria, idioma, cuerpo, tipo_cabecera, imagen_ejemplo, meta_id, cuenta_wa_id, estado)
     VALUES (?,?,?,?,?,?,?,?, 'PENDIENTE')`
  ).run(nombre, categoria || "MARKETING", idioma || "es", cuerpo, tipo_cabecera || "ninguna", imagen_ejemplo || null, r.id, cuenta_wa_id || null);

  iniciarSondeo(info.lastInsertRowid, nombre);
  res.json({ id: info.lastInsertRowid, meta_id: r.id, estado: "PENDIENTE" });
});

// Consultar estado de una plantilla manualmente (además del sondeo)
router.get("/plantillas/:id/estado", async (req, res) => {
  const p = db.prepare("SELECT * FROM plantillas WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ error: "No existe" });
  const r = await meta.estadoPlantilla(p.nombre);
  if (r.estado && !["ERROR", "NO_ENCONTRADA", "DESCONOCIDO"].includes(r.estado)) {
    db.prepare("UPDATE plantillas SET estado=?, motivo=?, revisada_en=datetime('now','localtime') WHERE id=?")
      .run(r.estado, r.motivo || null, p.id);
  }
  res.json({ ...p, estado: r.estado, motivo: r.motivo });
});

module.exports = router;
module.exports.retomarSondeosPendientes = retomarSondeosPendientes;