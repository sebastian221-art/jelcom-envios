import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El proxy hace que /api del frontend vaya al backend en el puerto 4000.
// Así no hay líos de CORS y en producción se cambia fácil.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});