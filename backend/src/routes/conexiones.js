// Rutas del tablero de Conexiones: estado de cada proveedor.
const express = require("express");
const { db } = require("../db");
const hablame = require("../services/proveedores/hablame");
const meta = require("../services/proveedores/meta");
const brevo = require("../services/proveedores/brevo");
const twilio = require("../services/proveedores/twilio");
const eleven = require("../services/proveedores/elevenlabs");

const router = express.Router();

// Estado guardado de todas las conexiones
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM conexiones").all());
});

// Probar una conexión y guardar su estado
router.post("/:proveedor/probar", async (req, res) => {
  const prov = req.params.proveedor;
  let resultado;
  if (prov === "hablame") resultado = await hablame.probar();
  else if (prov === "meta") resultado = await meta.probar();
  else if (prov === "brevo") resultado = await brevo.probar();
  else if (prov === "twilio") resultado = await twilio.probar();
  else if (prov === "elevenlabs") resultado = await eleven.probar();
  else resultado = { estado: "sin_probar", detalle: "Proveedor aún no implementado en Fase 1" };

  db.prepare(
    `UPDATE conexiones SET estado=?, detalle=?, saldo=?, ultimo_chequeo=datetime('now','localtime') WHERE proveedor=?`
  ).run(resultado.estado, resultado.detalle || null, resultado.saldo || null, prov);

  res.json({ proveedor: prov, ...resultado });
});

module.exports = router;