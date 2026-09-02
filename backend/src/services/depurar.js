// ─────────────────────────────────────────────────────────────
//  DEPURACIÓN — un solo lugar para toda la plataforma.
//  Reglas que ya validamos campaña por campaña:
//   - Teléfono: 10 dígitos, empieza en 3, se guarda como 57XXXXXXXXXX
//   - Correo: formato válido, se normaliza a minúsculas
//   - Duplicados: se descartan (se conserva el primero)
//   - Celdas con varios correos (coma/;/espacio) se separan
//   - La primera fila puede ser un dato real, no encabezado: se evalúa igual
// ─────────────────────────────────────────────────────────────
const XLSX = require("xlsx");

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// Correcciones de typos comunes de dominio (lo que corregíamos a mano)
const CORRECCIONES_DOMINIO = {
  "gmail.co": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com",
  "gmial.com": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com",
  "gmil.com": "gmail.com", "gnail.com": "gmail.com", "gmeil.com": "gmail.com",
  "hotmail.co": "hotmail.com", "hotmai.com": "hotmail.com", "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com", "hotmial.com": "hotmail.com", "otmail.com": "hotmail.com",
  "hormail.com": "hotmail.com", "hotmil.com": "hotmail.com",
  "outlook.co": "outlook.com", "outlok.com": "outlook.com", "outloo.com": "outlook.com",
  "yahoo.co": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com",
  "hotmail.es": "hotmail.com", "gmail.es": "gmail.com",
};

function corregirDominio(email) {
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  const usuario = email.slice(0, at);
  const dominio = email.slice(at + 1);
  const corregido = CORRECCIONES_DOMINIO[dominio];
  return corregido ? `${usuario}@${corregido}` : email;
}

function normTelefono(x) {
  const d = String(x == null ? "" : x).replace(/\D/g, "");
  if (d.length !== 10 || !d.startsWith("3")) return null;
  return "57" + d;
}

// Palabras clave que identifican una columna de teléfono o de correo por su encabezado
const PALABRAS_TELEFONO = ["telefono", "teléfono", "celular", "movil", "móvil", "phone", "numero", "número", "num_tel", "cel", "tel"];
const PALABRAS_CORREO = ["correo", "email", "e-mail", "mail"];

function normalizar(txt) {
  return String(txt).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Busca, en la primera fila, si hay una columna cuyo encabezado coincida con
// alguna palabra clave. Si la encuentra, es la columna correcta a usar y esa
// primera fila SÍ es un encabezado (se descarta como dato).
// Si no encuentra ninguna coincidencia, devuelve null (comportamiento anterior).
function buscarColumnaPorEncabezado(matriz, palabrasClave) {
  if (!matriz.length) return null;
  const encabezado = matriz[0];
  for (let i = 0; i < encabezado.length; i++) {
    const texto = normalizar(encabezado[i]);
    if (palabrasClave.some(p => texto.includes(normalizar(p)))) return i;
  }
  return null;
}

// Lee un Excel/CSV (buffer) y devuelve las celdas útiles.
// Si el archivo tiene VARIAS columnas y alguna se llama "Telefono"/"Correo"/etc,
// usa exactamente esa columna. Si no encuentra ninguna coincidencia (ej. bases
// de una sola columna sin encabezado, como las que ya veníamos usando), usa el
// comportamiento anterior: la primera celda no vacía de cada fila.
function leerCeldas(buffer, palabrasClave) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const colIdx = palabrasClave ? buscarColumnaPorEncabezado(matriz, palabrasClave) : null;
  const celdas = [];

  if (colIdx !== null) {
    // Encontramos la columna correcta por nombre: saltamos la fila 1 (encabezado)
    // y tomamos SOLO esa columna en el resto de filas.
    for (let f = 1; f < matriz.length; f++) {
      const celda = matriz[f][colIdx];
      if (celda !== "" && celda !== null && celda !== undefined && String(celda).trim() !== "") {
        celdas.push(celda);
      }
    }
  } else {
    // Comportamiento anterior: primera celda no vacía de cada fila
    // (para bases de una sola columna, con o sin encabezado).
    for (const fila of matriz) {
      let celda = "";
      for (const c of fila) {
        if (c !== "" && c !== null && c !== undefined) { celda = c; break; }
      }
      if (String(celda).trim() !== "") celdas.push(celda);
    }
  }
  return celdas;
}

// Depura para SMS/WhatsApp (teléfonos)
function depurarTelefonos(buffer) {
  const celdas = leerCeldas(buffer, PALABRAS_TELEFONO);
  const seen = new Set();
  const validos = [];
  const descartados = [];
  for (const celda of celdas) {
    const num = normTelefono(celda);
    if (!num) { descartados.push({ valor: String(celda), motivo: "invalido" }); continue; }
    if (seen.has(num)) { descartados.push({ valor: String(celda), motivo: "duplicado" }); continue; }
    seen.add(num); validos.push(num);
  }
  return { validos, descartados, totalBase: celdas.length };
}

// Depura para Correo (emails). Separa celdas con varios correos.
function depurarCorreos(buffer) {
  const celdas = leerCeldas(buffer, PALABRAS_CORREO);
  const seen = new Set();
  const validos = [];
  const descartados = [];
  for (const celda of celdas) {
    const partes = String(celda).trim().split(/[,;\s]+/).filter(Boolean);
    for (const p of partes) {
      let e = p.trim().toLowerCase();
      e = corregirDominio(e);   // corrige typos de dominio antes de validar
      if (!EMAIL_RE.test(e)) { descartados.push({ valor: p, motivo: "invalido" }); continue; }
      if (seen.has(e)) { descartados.push({ valor: e, motivo: "duplicado" }); continue; }
      seen.add(e); validos.push(e);
    }
  }
  return { validos, descartados, totalBase: celdas.length };
}

// GSM-7 vs UCS-2: calcula segmentos de un SMS (lo que hacíamos a mano)
const GSM = new Set("@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\n\r".split(""));
const GSM_EXT = new Set("^{}\\[~]|€".split(""));
function analizarSMS(texto) {
  const chars = [...texto];
  const esGSM = chars.every(c => GSM.has(c) || GSM_EXT.has(c));
  let longitud = chars.length;
  if (esGSM) longitud += chars.filter(c => GSM_EXT.has(c)).length; // los extendidos cuentan doble
  let segmentos;
  if (esGSM) segmentos = longitud <= 160 ? 1 : Math.ceil(longitud / 153);
  else       segmentos = chars.length <= 70 ? 1 : Math.ceil(chars.length / 67);
  return { codificacion: esGSM ? "GSM-7" : "UCS-2", caracteres: chars.length, segmentos };
}

module.exports = { depurarTelefonos, depurarCorreos, analizarSMS, normTelefono };