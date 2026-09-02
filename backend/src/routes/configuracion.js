// Rutas de CONFIGURACIÓN: datos de Jelcom + estado de credenciales de proveedores.
const express = require("express");
const { db } = require("../db");

const router = express.Router();

// Devuelve toda la configuración (clave-valor) + qué credenciales están puestas en el .env
router.get("/", (req, res) => {
  const filas = db.prepare("SELECT clave, valor FROM configuracion").all();
  const config = {};
  for (const f of filas) config[f.clave] = f.valor;

  // Estado de credenciales del .env (sin exponer los valores)
  const credenciales = {
    hablame: {
      account: !!process.env.HABLAME_ACCOUNT,
      apikey: !!process.env.HABLAME_API_KEY,
      remitente: process.env.HABLAME_REMITENTE || "",
    },
    brevo: {
      apikey: !!process.env.BREVO_API_KEY,
      remitente_email: process.env.BREVO_REMITENTE_EMAIL || "",
    },
    meta_env: {
      token: !!process.env.WA_TOKEN,
      phone_id: !!process.env.WA_PHONE_NUMBER_ID,
    },
  };

  res.json({ config, credenciales });
});

// Guardar un valor de configuración
router.put("/:clave", (req, res) => {
  const { valor } = req.body;
  db.prepare("INSERT INTO configuracion (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=?")
    .run(req.params.clave, valor ?? "", valor ?? "");
  res.json({ ok: true });
});

module.exports = router;