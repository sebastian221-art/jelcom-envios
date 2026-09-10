// migrar_cuentas.js — Copia SOLO las cuentas (WhatsApp + SMS) de tu base
// LOCAL hacia Railway, usando las rutas normales de la API (POST /api/cuentas
// y POST /api/cuentas-sms). No toca campañas, envíos ni historial.
// Evita duplicados: si ya existe una cuenta con el mismo nombre en Railway,
// se salta (no la crea de nuevo).
//
// Uso: node migrar_cuentas.js https://TU-BACKEND.up.railway.app
const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const http = require('http');

const RAILWAY_URL = process.argv[2];
if (!RAILWAY_URL) {
  console.log('Uso: node migrar_cuentas.js https://TU-BACKEND.up.railway.app');
  process.exit(1);
}

const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

function req(metodo, ruta, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(ruta, RAILWAY_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const r = lib.request(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(out); } catch { parsed = null; }
        resolve({ status: res.statusCode, raw: out, json: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// Pide una lista (GET). Si la respuesta no es un array, avisa y muestra por qué.
async function pedirLista(ruta, etiqueta) {
  const r = await req('GET', ruta);
  if (r.status !== 200) {
    console.log(`   ⚠️  ${etiqueta}: Railway respondió status ${r.status}. Cuerpo: ${r.raw.slice(0, 300)}`);
    return [];
  }
  if (!Array.isArray(r.json)) {
    console.log(`   ⚠️  ${etiqueta}: la respuesta no fue una lista. Cuerpo recibido: ${r.raw.slice(0, 300)}`);
    return [];
  }
  return r.json;
}

async function migrarWhatsApp() {
  const locales = db.prepare("SELECT * FROM cuentas_whatsapp WHERE activa=1").all();
  const remotas = await pedirLista('/api/cuentas', 'GET /api/cuentas');
  const nombresRemotos = new Set(remotas.map(c => c.nombre));

  console.log(`\n📱 Cuentas WhatsApp locales: ${locales.length} | ya en Railway: ${remotas.length}`);
  for (const c of locales) {
    if (nombresRemotos.has(c.nombre)) {
      console.log(`   ⏭️  "${c.nombre}" ya existe en Railway, se omite`);
      continue;
    }
    const r = await req('POST', '/api/cuentas', {
      nombre: c.nombre, telefono: c.telefono,
      wa_token: c.wa_token, wa_phone_id: c.wa_phone_id, wa_business_id: c.wa_business_id,
    });
    if (r.status >= 200 && r.status < 300 && r.json?.id) {
      console.log(`   ✅ Creada "${c.nombre}" en Railway (id ${r.json.id})`);
    } else {
      console.log(`   ❌ Falló crear "${c.nombre}": status ${r.status} · ${r.raw.slice(0, 300)}`);
    }
  }
}

async function migrarSms() {
  const locales = db.prepare("SELECT * FROM cuentas_sms WHERE activa=1").all();
  const remotas = await pedirLista('/api/cuentas-sms', 'GET /api/cuentas-sms');
  const nombresRemotos = new Set(remotas.map(c => c.nombre));

  console.log(`\n💬 Cuentas SMS locales: ${locales.length} | ya en Railway: ${remotas.length}`);
  for (const c of locales) {
    if (nombresRemotos.has(c.nombre)) {
      console.log(`   ⏭️  "${c.nombre}" ya existe en Railway, se omite`);
      continue;
    }
    const r = await req('POST', '/api/cuentas-sms', {
      nombre: c.nombre, proveedor: c.proveedor, remitente: c.remitente,
      hablame_account: c.hablame_account, hablame_apikey: c.hablame_apikey, hablame_url: c.hablame_url,
      brevo_apikey: c.brevo_apikey,
      labsmobile_usuario: c.labsmobile_usuario, labsmobile_token: c.labsmobile_token,
    });
    if (r.status >= 200 && r.status < 300 && r.json?.id) {
      console.log(`   ✅ Creada "${c.nombre}" en Railway (id ${r.json.id})`);
    } else {
      console.log(`   ❌ Falló crear "${c.nombre}": status ${r.status} · ${r.raw.slice(0, 300)}`);
    }
  }
}

async function main() {
  console.log(`Conectando a: ${RAILWAY_URL}`);
  await migrarWhatsApp();
  await migrarSms();
  console.log('\n🎉 Migración de cuentas terminada.');
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });