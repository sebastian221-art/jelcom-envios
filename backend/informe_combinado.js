// informe_combinado.js — Junta el envío original + todos sus mini-envíos
// (creados por dividir_envio.js) en UN SOLO informe con el formato Jelcom
// de siempre: Resumen · Detalle de envíos · Descartados · Comprobantes.
//
// Uso: node informe_combinado.js <ID_DEL_ENVIO_ORIGINAL>
// Ejemplo: node informe_combinado.js 14
//
// Genera un archivo .xlsx en la misma carpeta backend.

const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const path = require('path');

const ID_ORIGINAL = process.argv[2];
if (!ID_ORIGINAL) {
  console.log('Uso: node informe_combinado.js <ID_DEL_ENVIO_ORIGINAL>');
  process.exit(1);
}

const db = new Database(path.join(__dirname, 'data', 'jelcom.db'));

// Colores del estándar Jelcom
const AZUL = 'FF1F3864', AZUL2 = 'FF2E5496', VERDE = 'FF1E7F4F',
      NARANJA = 'FFED7D31', MARRON = 'FF843C0C', BLANCO = 'FFFFFFFF', ALT = 'FFF2F2F2';
const arial = (size, bold, color, italic) => ({ name: 'Arial', size, bold: !!bold, italic: !!italic, color: { argb: color || 'FF000000' } });
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const CEN = { horizontal: 'center', vertical: 'middle' };
const IZQ = { horizontal: 'left', vertical: 'middle' };
const BD = { top: { style: 'thin', color: { argb: 'FFDDDDDD' } }, bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } };

async function main() {
  const original = db.prepare('SELECT * FROM envios WHERE id=?').get(ID_ORIGINAL);
  if (!original) { console.log(`❌ No existe el envío ${ID_ORIGINAL}`); process.exit(1); }

  const campana = db.prepare('SELECT * FROM campanas WHERE id=?').get(original.campana_id);

  // Buscar la "familia": el original + todos los mini-envíos que salieron de él
  // (los creó dividir_envio.js con el nombre "... (parte X/Y)")
  const familia = db.prepare(`
    SELECT * FROM envios
    WHERE campana_id = ? AND canal = ?
      AND (id = ? OR nombre LIKE ?)
    ORDER BY id
  `).all(original.campana_id, original.canal, ID_ORIGINAL, `${original.nombre} (parte%`);

  console.log(`📋 Envíos encontrados en la familia de "${original.nombre}": ${familia.length}`);
  familia.forEach(e => console.log(`   - ID ${e.id}: ${e.nombre} (${e.estado}) · ${e.total_enviados}/${e.total_validos}`));

  // IMPORTANTE: "En base" y "Válidos" NO se suman entre toda la familia —
  // los mini-envíos son PEDAZOS del mismo universo original, no contactos
  // nuevos. Sumarlos duplicaría el conteo. El universo real vive en el
  // envío original únicamente.
  const totBase = original.total_base;
  const totValidos = original.total_validos;
  // "Enviados" y "Errores" SÍ se suman: cada instancia (original + cada
  // mini-envío) realizó acciones reales y distintas, sin solaparse entre sí.
  let totEnviados = 0, totErrores = 0;
  for (const e of familia) {
    totEnviados += e.total_enviados || 0;
    totErrores += e.total_errores || 0;
  }

  const wb = new ExcelJS.Workbook();

  // ---------- HOJA 1: RESUMEN ----------
  const ws1 = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  ws1.getColumn(1).width = 3; ws1.getColumn(2).width = 32; ws1.getColumn(3).width = 22;
  ws1.mergeCells('B2:C2');
  ws1.getCell('B2').value = 'REPORTE DE ENVÍO MASIVO (COMBINADO) — ' + original.canal.toUpperCase();
  ws1.getCell('B2').font = arial(16, true, BLANCO); ws1.getCell('B2').fill = fill(AZUL); ws1.getCell('B2').alignment = CEN;
  ws1.getRow(2).height = 30;

  const filasInfo = [
    ['Cliente:', campana ? campana.nombre : ''],
    ['Envío (combinado):', original.nombre],
    ['Canal:', original.canal.toUpperCase()],
    ['Cantidad de sub-envíos:', String(familia.length)],
    ['Fecha del informe:', new Date().toLocaleString('es-CO')],
  ];
  let fila = 4;
  for (const [label, val] of filasInfo) {
    ws1.getCell(`B${fila}`).value = label; ws1.getCell(`B${fila}`).font = arial(10, true);
    ws1.getCell(`C${fila}`).value = val; ws1.getCell(`C${fila}`).font = arial(10);
    fila++;
  }
  fila += 1;
  ws1.mergeCells(`B${fila}:C${fila}`);
  ws1.getCell(`B${fila}`).value = 'TOTALES';
  ws1.getCell(`B${fila}`).font = arial(12, true, BLANCO); ws1.getCell(`B${fila}`).fill = fill(AZUL2); ws1.getCell(`B${fila}`).alignment = CEN;
  fila++;
  const totalesFilas = [
    ['En base:', totBase], ['Válidos:', totValidos],
    ['Enviados:', totEnviados], ['Errores:', totErrores],
    ['% Éxito:', totValidos ? `${((totEnviados / totValidos) * 100).toFixed(1)}%` : '0%'],
  ];
  for (const [label, val] of totalesFilas) {
    ws1.getCell(`B${fila}`).value = label; ws1.getCell(`B${fila}`).font = arial(10, true);
    ws1.getCell(`C${fila}`).value = val; ws1.getCell(`C${fila}`).font = arial(11, true, '1E7F4F' === VERDE ? VERDE : undefined);
    fila++;
  }

  // ---------- HOJA 2: DETALLE DE ENVÍOS ----------
  const ws2 = wb.addWorksheet('Detalle de envíos', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
  const headersDetalle = ['#', 'Destino', 'Estado', 'Sub-envío', 'Comprobante'];
  headersDetalle.forEach((h, j) => {
    const c = ws2.getCell(1, j + 1); c.value = h; c.font = arial(10, true, BLANCO); c.fill = fill(AZUL2); c.alignment = CEN; c.border = BD;
  });
  ws2.columns = [{ width: 6 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 26 }];

  const consultaContactos = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND estado!='pendiente' ORDER BY id");
  let filaD = 2, contadorGlobal = 1;
  for (const e of familia) {
    const contactos = consultaContactos.all(e.id);
    for (const c of contactos) {
      const bg = contadorGlobal % 2 ? BLANCO : ALT;
      const valores = [contadorGlobal, c.destino, c.estado, e.nombre, c.comprobante || ''];
      valores.forEach((v, j) => {
        const cell = ws2.getCell(filaD, j + 1); cell.value = v; cell.font = arial(9); cell.fill = fill(bg); cell.border = BD;
        cell.alignment = j === 1 ? IZQ : CEN;
      });
      filaD++; contadorGlobal++;
    }
  }
  console.log(`✅ Hoja Detalle: ${contadorGlobal - 1} contactos combinados`);

  // ---------- HOJA 3: DESCARTADOS ----------
  const ws3 = wb.addWorksheet('Descartados', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
  ['#', 'Valor', 'Motivo', 'Sub-envío'].forEach((h, j) => {
    const c = ws3.getCell(1, j + 1); c.value = h; c.font = arial(10, true, BLANCO); c.fill = fill(MARRON); c.alignment = CEN; c.border = BD;
  });
  ws3.columns = [{ width: 6 }, { width: 22 }, { width: 18 }, { width: 30 }];
  const consultaDescartados = db.prepare('SELECT * FROM descartados WHERE envio_id=? ORDER BY id');
  let filaDes = 2, contadorDes = 1;
  for (const e of familia) {
    const desc = consultaDescartados.all(e.id);
    for (const d of desc) {
      const bg = contadorDes % 2 ? BLANCO : ALT;
      [contadorDes, d.valor, d.motivo, e.nombre].forEach((v, j) => {
        const cell = ws3.getCell(filaDes, j + 1); cell.value = v; cell.font = arial(9); cell.fill = fill(bg); cell.border = BD;
        cell.alignment = j === 1 ? IZQ : CEN;
      });
      filaDes++; contadorDes++;
    }
  }
  if (contadorDes === 1) {
    ws3.mergeCells('A2:D2');
    ws3.getCell('A2').value = 'No hubo descartados en ninguno de los sub-envíos.';
    ws3.getCell('A2').font = arial(10, false, undefined, true);
  }

  // ---------- HOJA 4: COMPROBANTES ----------
  const ws4 = wb.addWorksheet('Comprobantes', { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
  ['#', 'Destino', 'Comprobante (ID)', 'Sub-envío'].forEach((h, j) => {
    const c = ws4.getCell(1, j + 1); c.value = h; c.font = arial(10, true, BLANCO); c.fill = fill(AZUL2); c.alignment = CEN; c.border = BD;
  });
  ws4.columns = [{ width: 6 }, { width: 18 }, { width: 34 }, { width: 30 }];
  let filaC = 2, contadorC = 1;
  for (const e of familia) {
    const enviados = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND estado='enviado' ORDER BY id").all(e.id);
    for (const c of enviados) {
      const bg = contadorC % 2 ? BLANCO : ALT;
      [contadorC, c.destino, c.comprobante || '', e.nombre].forEach((v, j) => {
        const cell = ws4.getCell(filaC, j + 1); cell.value = v; cell.font = arial(9); cell.fill = fill(bg); cell.border = BD;
        cell.alignment = j === 1 ? IZQ : CEN;
      });
      filaC++; contadorC++;
    }
  }

  const nombreArchivo = `Reporte_COMBINADO_${original.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  await wb.xlsx.writeFile(path.join(__dirname, nombreArchivo));
  console.log(`\n🎉 Informe combinado listo: ${nombreArchivo}`);
  console.log(`   Total combinado: ${totEnviados}/${totValidos} enviados · ${totErrores} errores`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });