import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import SMS from "./pages/SMS.jsx";
import WhatsApp from "./pages/WhatsApp.jsx";
import Correo from "./pages/Correo.jsx";
import Voz from "./pages/Voz.jsx";
import CallCenter from "./pages/CallCenter.jsx";
import Agente from "./pages/Agente.jsx";
import Usuarios from "./pages/Usuarios.jsx";
import Configuracion from "./pages/Configuracion.jsx";
import Conexiones from "./pages/Conexiones.jsx";
import Historial from "./pages/Historial.jsx";
import Placeholder from "./pages/Placeholder.jsx";
import EnvioDetalle from "./pages/EnvioDetalle.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/sms" />} />
          <Route path="/sms" element={<SMS />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/correo" element={<Correo />} />
          <Route path="/voz" element={<Voz />} />
          <Route path="/callcenter" element={<CallCenter />} />
          <Route path="/agente" element={<Agente />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/envios/:id" element={<EnvioDetalle />} />
          <Route path="/conexiones" element={<Conexiones />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/usuarios" element={<Usuarios />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </React.StrictMode>
);