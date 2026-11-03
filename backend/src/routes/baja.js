// ─────────────────────────────────────────────────────────────
//  BAJA DE CORREOS — el destinatario se da de baja con un clic.
//  GET  /api/baja?e=..&t=..  → página con botón "Confirmar baja"
//       (no se da de baja solo con abrir el link: los antivirus de
//        correo abren los links y darían de baja a gente sin querer)
//  POST /api/baja?e=..&t=..  → lo agrega a la LISTA NEGRA de inmediato
//       (es lo que usa el botón nativo de Gmail/Yahoo, List-Unsubscribe-Post)
// ─────────────────────────────────────────────────────────────
const express = require("express");
const { db } = require("../db");
const listaNegra = require("../services/listaNegra");
const { firmaValida } = require("../services/correoHtml");

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

function pagina(titulo, texto, boton) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${titulo}</title></head><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:460px;margin:60px auto;background:#fff;padding:32px;border-radius:10px;text-align:center;">
    <h2 style="margin:0 0 12px;color:#1F3864;">${titulo}</h2>
    <p style="color:#444;line-height:1.5;">${texto}</p>${boton || ""}
  </div></body></html>`;
}
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function validar(req) {
  const email = String(req.query.e || "").trim();
  const n = listaNegra.normalizar(email);
  if (!n || n.tipo !== "correo" || !firmaValida(email, req.query.t)) return null;
  return { email, valor: n.valor };
}

router.get("/", (req, res) => {
  const v = validar(req);
  if (!v) return res.status(400).send(pagina("Enlace no válido", "Este enlace de baja no es válido o está incompleto."));
  const accion = `?e=${encodeURIComponent(v.email)}&t=${encodeURIComponent(req.query.t)}`;
  res.send(pagina("¿Darte de baja?", `Dejarás de recibir nuestros correos en <strong>${esc(v.email)}</strong>.`,
    `<form method="POST" action="${accion}"><button type="submit" style="margin-top:12px;background:#ED7D31;color:#fff;border:0;padding:12px 26px;border-radius:6px;font-size:15px;cursor:pointer;">Confirmar baja</button></form>`));
});

router.post("/", (req, res) => {
  const v = validar(req);
  if (!v) return res.status(400).send(pagina("Enlace no válido", "Este enlace de baja no es válido o está incompleto."));
  db.prepare("INSERT OR IGNORE INTO lista_negra (valor, tipo, motivo) VALUES (?, 'correo', ?)")
    .run(v.valor, "Se dio de baja desde el enlace del correo");
  res.send(pagina("Listo", `Ya no recibirás más correos en <strong>${esc(v.email)}</strong>.`));
});

module.exports = router;
