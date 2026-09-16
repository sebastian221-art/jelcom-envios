// frontend/server.js — Sirve el build de Vite (carpeta dist) Y reenvía
// cualquier petición a /api hacia el backend, usando la red privada de
// Railway (más rápido y seguro que ir por internet pública).
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// URL interna del backend dentro de Railway (red privada).
// Formato: http://<nombre-privado-del-servicio>.railway.internal:<puerto>
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://dynamic-nourishment.railway.internal:4000";

app.use("/api", createProxyMiddleware({ target: BACKEND_URL, changeOrigin: true }));

app.use(express.static(path.join(__dirname, "dist")));

// Cualquier otra ruta (las de React Router) devuelve el index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Frontend + proxy corriendo en puerto ${PORT}`);
  console.log(`/api -> ${BACKEND_URL}`);
});