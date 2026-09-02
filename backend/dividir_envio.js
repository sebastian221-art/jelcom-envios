// dividir_envio.js — Divide un envío grande en mini-envíos paralelos, SIN
// riesgo de duplicados. Uso: node dividir_envio.js <ID_DEL_ENVIO> [tamaño]
//
// Qué hace, en orden:
//  1. Pausa el envío original (si ya estaba corriendo; si nunca arrancó,
//     este paso simplemente no hace nada, y eso es normal).
//  2. Espera unos segundos a que el motor termine el mensaje que tenía
//     a medias en ese momento (si lo había).
//  3. Toma EXACTAMENTE los contactos que quedaron "pendiente" (ni uno
//     más, ni uno menos — así no hay riesgo de mandar el mismo SMS dos veces).
//  4. Los reparte en mini-envíos nuevos del tamaño que indiques (por
//     defecto 1000), todos con el mismo mensaje/cuenta que el original.
//  5. Lanza TODOS los mini-envíos al mismo tiempo, en paralelo de verdad.
//
// Cuando termine, para ver el TOTAL sumado (original + todos los mini-envíos),
// usa el "Informe consolidado" en Historial, filtrando por ese cliente y fecha
// — ya suma automáticamente todos los envíos de esa campaña.
// O usa informe_combinado.js para el formato Jelcom completo (4 hojas).

const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const ID_ORIGINAL = process.argv[2];
const TAMANO_LOTE = parseInt(process.argv[3] || '1000', 10);
const BASE_URL = 'http://localhost:4000';

if (!ID_ORIGINAL) {
  console.log('Uso: node dividir_envio.js <ID_DEL_ENVIO> [tamaño_del_lote]');
  console.log('Ejemplo: node dividir_envio.js 12 1000');
  process.exit(1);
}

const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

function post(rutaApi) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${rutaApi}`, { method: 'POST' }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}
function espera(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const original = db.prepare("SELECT * FROM envios WHERE id=?").get(ID_ORIGINAL);
  if (!original) { console.log(`❌ No existe el envío ${ID_ORIGINAL}`); process.exit(1); }
  console.log(`Envío original: "${original.nombre}" (canal: ${original.canal}, estado: ${original.estado})`);

  console.log('⏸️  Pausando el envío original (si estaba corriendo)...');
  await post(`/api/envios/${ID_ORIGINAL}/pausar`);
  console.log('   Esperando 5s por si tenía un mensaje a medias...');
  await espera(5000);

  const pendientes = db.prepare("SELECT destino FROM contactos WHERE envio_id=? AND estado='pendiente'").all(ID_ORIGINAL);
  console.log(`📋 Contactos pendientes por repartir: ${pendientes.length}`);
  if (pendientes.length === 0) { console.log('No hay pendientes, no hay nada que dividir.'); process.exit(0); }

  const lotes = [];
  for (let i = 0; i < pendientes.length; i += TAMANO_LOTE) {
    lotes.push(pendientes.slice(i, i + TAMANO_LOTE));
  }
  console.log(`📦 Se van a crear ${lotes.length} mini-envíos de hasta ${TAMANO_LOTE} contactos cada uno.`);

  const insertarEnvio = db.prepare(`
    INSERT INTO envios (campana_id, cuenta_wa_id, cuenta_sms_id, nombre, canal, estado,
      cuerpo, asunto, imagen_url, enlace, plantilla, idioma, modo_audio, audio_url,
      texto_voz, voz_id, tecla_captura, total_base, total_validos, creado_por)
    VALUES (?,?,?,?,?, 'lista', ?,?,?,?,?,?,?,?,?,?,?, ?,?, ?)
  `);
  const insertarContacto = db.prepare("INSERT INTO contactos (envio_id, destino) VALUES (?,?)");

  const nuevosIds = [];
  const crearTodos = db.transaction(() => {
    lotes.forEach((lote, i) => {
      const info = insertarEnvio.run(
        original.campana_id, original.cuenta_wa_id, original.cuenta_sms_id,
        `${original.nombre} (parte ${i + 1}/${lotes.length})`, original.canal,
        original.cuerpo, original.asunto, original.imagen_url, original.enlace,
        original.plantilla, original.idioma, original.modo_audio, original.audio_url,
        original.texto_voz, original.voz_id, original.tecla_captura,
        lote.length, lote.length, 'dividir_envio.js'
      );
      const nuevoId = info.lastInsertRowid;
      for (const c of lote) insertarContacto.run(nuevoId, c.destino);
      nuevosIds.push(nuevoId);
    });
  });
  crearTodos();
  console.log(`✅ Creados ${nuevosIds.length} mini-envíos: IDs ${nuevosIds.join(', ')}`);

  // IMPORTANTE: los contactos que se acaban de copiar a los mini-envíos
  // TODAVÍA existen como filas "pendiente" en el envío ORIGINAL (nunca se
  // tocaron, solo se copiaron). Si no se limpian: (a) el informe combinado
  // los contaría DOBLE, y (b) si alguien reanuda el original por error en
  // el futuro, se le volvería a mandar el mensaje a esos mismos contactos.
  // Por eso se borran aquí, ahora que ya están copiados y a salvo en los
  // mini-envíos nuevos.
  const borrar = db.prepare("DELETE FROM contactos WHERE envio_id=? AND estado='pendiente'");
  const limpiados = borrar.run(ID_ORIGINAL);
  console.log(`🧹 Limpiados ${limpiados.changes} contactos "pendiente" del envío original (ya viven en los mini-envíos, sin duplicar).`);

  console.log('🚀 Lanzando todos los mini-envíos en paralelo...');
  await Promise.all(nuevosIds.map(id => post(`/api/envios/${id}/enviar`)));
  console.log('🎉 Listo. Todos los mini-envíos están corriendo en paralelo.');
  console.log('   Revisa el panel "Envíos activos" en la plataforma para verlos todos.');
  console.log('   Cuando terminen, usa "Informe consolidado" en Historial (o informe_combinado.js) para el TOTAL sumado.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });