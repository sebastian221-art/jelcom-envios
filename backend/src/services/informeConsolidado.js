// backend/src/services/informeConsolidado.js
// Genera el informe combinado de un envío "padre" + todos sus sub-envíos
// (creados al dividir un envío grande). Usa padre_id, no comparación de nombres.
const ExcelJS = require("exceljs");
const { db } = require("../db");

const AZUL = "FF1F3864", AZUL2 = "FF2E5496", VERDE = "FF1E7F4F",
      NARANJA = "FFED7D31", MARRON = "FF843C0C", BLANCO = "FFFFFFFF", ALT = "FFF2F2F2";
const arial = (size, bold, color, italic) => ({ name: "Arial", size, bold: !!bold, italic: !!italic, color: { argb: color || "FF000000" } });
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const CEN = { horizontal: "center", vertical: "middle" };
const IZQ = { horizontal: "left", vertical: "middle" };
const BD = { top: { style: "thin", color: { argb: "FFDDDDDD" } }, bottom: { style: "thin", color: { argb: "FFDDDDDD" } } };

async function generar(idOriginal) {
  const original = db.prepare("SELECT * FROM envios WHERE id=?").get(idOriginal);
  if (!original) throw new Error("Envío no encontrado");
  const campana = db.prepare("SELECT * FROM campanas WHERE id=?").get(original.campana_id);

  // Familia = el original + todos los que tengan padre_id = original.id
  const hijos = db.prepare("SELECT * FROM envios WHERE padre_id=? ORDER BY id").all(idOriginal);
  const familia = [original, ...hijos];

  const totBase = original.total_base;
  const totValidos = original.total_validos;
  let totEnviados = 0, totErrores = 0;
  for (const e of familia) { totEnviados += e.total_enviados || 0; totErrores += e.total_errores || 0; }

  const wb = new ExcelJS.Workbook();

  // ---------- RESUMEN ----------
  const ws1 = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws1.getColumn(1).width = 3; ws1.getColumn(2).width = 32; ws1.getColumn(3).width = 22;
  ws1.mergeCells("B2:C2");
  ws1.getCell("B2").value = "REPORTE DE ENVÍO MASIVO (COMBINADO) — " + original.canal.toUpperCase();
  ws1.getCell("B2").font = arial(16, true, BLANCO); ws1.getCell("B2").fill = fill(AZUL); ws1.getCell("B2").alignment = CEN;
  ws1.getRow(2).height = 30;

  const filasInfo = [
    ["Cliente:", campana ? campana.nombre : ""],
    ["Envío (combinado):", original.nombre],
    ["Canal:", original.canal.toUpperCase()],
    ["Cantidad de sub-envíos:", String(hijos.length)],
    ["Fecha del informe:", new Date().toLocaleString("es-CO")],
  ];
  let fila = 4;
  for (const [label, val] of filasInfo) {
    ws1.getCell(`B${fila}`).value = label; ws1.getCell(`B${fila}`).font = arial(10, true);
    ws1.getCell(`C${fila}`).value = val; ws1.getCell(`C${fila}`).font = arial(10);
    fila++;
  }
  fila += 1;
  ws1.mergeCells(`B${fila}:C${fila}`);
  ws1.getCell(`B${fila}`).value = "TOTALES";
  ws1.getCell(`B${fila}`).font = arial(12, true, BLANCO); ws1.getCell(`B${fila}`).fill = fill(AZUL2); ws1.getCell(`B${fila}`).alignment = CEN;
  fila++;
  const totalesFilas = [
    ["En base:", totBase], ["Válidos:", totValidos],
    ["Enviados:", totEnviados], ["Errores:", totErrores],
    ["% Éxito:", totValidos ? `${((totEnviados / totValidos) * 100).toFixed(1)}%` : "0%"],
  ];
  for (const [label, val] of totalesFilas) {
    ws1.getCell(`B${fila}`).value = label; ws1.getCell(`B${fila}`).font = arial(10, true);
    ws1.getCell(`C${fila}`).value = val; ws1.getCell(`C${fila}`).font = arial(11, true, VERDE);
    fila++;
  }

  // ---------- DETALLE DE ENVÍOS ----------
  const ws2 = wb.addWorksheet("Detalle de envíos", { views: [{ showGridLines: false, state: "frozen", ySplit: 1 }] });
  ["#", "Destino", "Estado", "Sub-envío", "Comprobante"].forEach((h, j) => {
    const c = ws2.getCell(1, j + 1); c.value = h; c.font = arial(10, true, BLANCO); c.fill = fill(AZUL2); c.alignment = CEN; c.border = BD;
  });
  ws2.columns = [{ width: 6 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 26 }];

  const consultaContactos = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND estado!='pendiente' ORDER BY id");
  let filaD = 2, contadorGlobal = 1;
  for (const e of familia) {
    const contactos = consultaContactos.all(e.id);
    for (const c of contactos) {
      const bg = contadorGlobal % 2 ? BLANCO : ALT;
      const valores = [contadorGlobal, c.destino, c.estado, e.nombre, c.comprobante || ""];
      valores.forEach((v, j) => {
        const cell = ws2.getCell(filaD, j + 1); cell.value = v; cell.font = arial(9); cell.fill = fill(bg); cell.border = BD;
        cell.alignment = j === 1 ? IZQ : CEN;
      });
      filaD++; contadorGlobal++;
    }
  }

  // ---------- DESCARTADOS ----------
  const ws3 = wb.addWorksheet("Descartados", { views: [{ showGridLines: false, state: "frozen", ySplit: 1 }] });
  ["#", "Valor", "Motivo", "Sub-envío"].forEach((h, j) => {
    const c = ws3.getCell(1, j + 1); c.value = h; c.font = arial(10, true, BLANCO); c.fill = fill(MARRON); c.alignment = CEN; c.border = BD;
  });
  ws3.columns = [{ width: 6 }, { width: 22 }, { width: 18 }, { width: 30 }];
  const consultaDescartados = db.prepare("SELECT * FROM descartados WHERE envio_id=? ORDER BY id");
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
    ws3.mergeCells("A2:D2");
    ws3.getCell("A2").value = "No hubo descartados en ninguno de los sub-envíos.";
    ws3.getCell("A2").font = arial(10, false, undefined, true);
  }

  // ---------- COMPROBANTES ----------
  const ws4 = wb.addWorksheet("Comprobantes", { views: [{ showGridLines: false, state: "frozen", ySplit: 1 }] });
  ["#", "Destino", "Comprobante (ID)", "Sub-envío"].forEach((h, j) => {
    const c = ws4.getCell(1, j + 1); c.value = h; c.font = arial(10, true, BLANCO); c.fill = fill(AZUL2); c.alignment = CEN; c.border = BD;
  });
  ws4.columns = [{ width: 6 }, { width: 18 }, { width: 34 }, { width: 30 }];
  let filaC = 2, contadorC = 1;
  for (const e of familia) {
    const enviados = db.prepare("SELECT * FROM contactos WHERE envio_id=? AND estado='enviado' ORDER BY id").all(e.id);
    for (const c of enviados) {
      const bg = contadorC % 2 ? BLANCO : ALT;
      [contadorC, c.destino, c.comprobante || "", e.nombre].forEach((v, j) => {
        const cell = ws4.getCell(filaC, j + 1); cell.value = v; cell.font = arial(9); cell.fill = fill(bg); cell.border = BD;
        cell.alignment = j === 1 ? IZQ : CEN;
      });
      filaC++; contadorC++;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `Reporte_COMBINADO_${original.nombre.replace(/\s+/g, "_")}.xlsx`;
  return { buffer, nombre };
}

module.exports = { generar };