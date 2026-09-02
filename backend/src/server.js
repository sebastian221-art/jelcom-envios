require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { init } = require("./db");

init();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/campanas", require("./routes/campanas"));   // clientes + consolidado
app.use("/api/envios", require("./routes/envios"));       // envíos individuales
app.use("/api/conexiones", require("./routes/conexiones"));
const whatsapp = require("./routes/whatsapp");
app.use("/api/whatsapp", whatsapp);
app.use("/api/cuentas", require("./routes/cuentas"));
app.use("/api/cuentas-sms", require("./routes/cuentas_sms"));
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/configuracion", require("./routes/configuracion"));
app.use("/api/voz", require("./routes/voz"));
app.use("/api/voces", require("./routes/voces"));
app.use("/api/callcenter", require("./routes/callcenter"));

app.get("/api/health", (req, res) => res.json({ ok: true, servicio: "JELCOM Envíos", version: "3.1.0" }));

const PORT = process.env.PORT || 4000;
whatsapp.retomarSondeosPendientes();
require("./services/motor").retomarEnCurso();
app.listen(PORT, () => {
  console.log(`\n🚀 JELCOM Envíos — backend corriendo en http://localhost:${PORT}`);
  console.log(`   Prueba: http://localhost:${PORT}/api/health\n`);
});