// ARCHIVO: backend/src/routes/tarifas.js
// ─────────────────────────────────────────────────────────────
//  TARIFAS — cuánto cuesta cada unidad por canal, para saber cuánto
//  costó (o va a costar) un envío. Se guardan en `configuracion` con
//  claves tarifa_*; nada se inventa: si falta una tarifa, el cálculo
//  de costo lo dice.
//
//  Claves:
//   moneda                        (por defecto COP)
//   tarifa_sms                    por segmento, cualquier proveedor
//   tarifa_sms_hablame | _labsmobile | _brevo   por segmento, si difiere
//   tarifa_whatsapp               por mensaje, cualquier categoría
//   tarifa_whatsapp_marketing | _utility | _authentication
//   tarifa_correo                 por correo
//   tarifa_voz_minuto             por minuto de llamada contestada
// ─────────────────────────────────────────────────────────────
const express = require("express");
const { db } = require("../db");

const CLAVES = [
  "moneda", "tarifa_sms", "tarifa_sms_hablame", "tarifa_sms_labsmobile", "tarifa_sms_brevo",
  "tarifa_whatsapp", "tarifa_whatsapp_marketing", "tarifa_whatsapp_utility", "tarifa_whatsapp_authentication",
  "tarifa_correo", "tarifa_voz_minuto",
];

function leerTarifas() {
  const filas = db.prepare(`SELECT clave, valor FROM configuracion WHERE clave IN (${CLAVES.map(() => "?").join(",")})`).all(...CLAVES);
  const t = {};
  for (const f of filas) if (f.valor !== null && f.valor !== "") t[f.clave] = f.clave === "moneda" ? f.valor : Number(f.valor);
  if (!t.moneda) t.moneda = "COP";
  return t;
}

const router = express.Router();

router.get("/", (req, res) => res.json({ tarifas: leerTarifas(), claves: CLAVES }));

// Body: { tarifa_sms: 18, tarifa_whatsapp_marketing: 90, moneda: "COP", ... }
// Un valor null o "" borra esa tarifa.
router.put("/", (req, res) => {
  const cambios = [];
  const ups = db.prepare("INSERT INTO configuracion (clave, valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor");
  const del = db.prepare("DELETE FROM configuracion WHERE clave=?");
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!CLAVES.includes(k)) return res.status(400).json({ error: `Clave desconocida: ${k}. Válidas: ${CLAVES.join(", ")}` });
    if (v === null || v === "") { del.run(k); cambios.push(`${k} borrada`); continue; }
    if (k !== "moneda" && !(Number(v) >= 0)) return res.status(400).json({ error: `${k} debe ser un número ≥ 0` });
    ups.run(k, String(v)); cambios.push(`${k}=${v}`);
  }
  res.json({ ok: true, cambios, tarifas: leerTarifas() });
});

module.exports = router;
module.exports.leerTarifas = leerTarifas;
