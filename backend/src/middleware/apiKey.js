// backend/src/middleware/apiKey.js
// Exige la cabecera x-api-key en las rutas /api/external/... y actualiza
// cuándo fue usada por última vez, para que puedas ver qué sistemas están activos.
const { db } = require("../db");

module.exports = function verificarApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key) return res.status(401).json({ error: "Falta la cabecera x-api-key" });
  const registro = db.prepare("SELECT * FROM api_keys WHERE api_key=? AND activa=1").get(key);
  if (!registro) return res.status(401).json({ error: "API key inválida o desactivada" });
  db.prepare("UPDATE api_keys SET ultimo_uso=datetime('now','localtime') WHERE id=?").run(registro.id);
  req.sistemaExterno = registro.nombre;
  next();
};