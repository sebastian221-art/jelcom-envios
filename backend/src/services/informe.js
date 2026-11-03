// ─────────────────────────────────────────────────────────────
//  GENERADOR DE INFORMES — formato estándar JELCOM
//  Produce el Excel de una campaña finalizada, con las 4 hojas:
//  Resumen · Detalle de envíos · Descartados · Comprobantes
//  (para SMS el comprobante es el SMS ID)
// ─────────────────────────────────────────────────────────────
const ExcelJS = require("exceljs");
const { db } = require("../db");

const AZUL="FF1F3864", AZUL2="FF2E5496", VERDE="FF1E7F4F", VERDEB="FFE2EFDA";
const NARANJA="FFED7D31", NARANJB="FFFCE4D6", NARANJF="FFFDF2EC", MARRON="FF843C0C";
const GRIS="FF595959", GRISC="FFF2F2F2", GRISCL="FF808080", BLANCO="FFFFFFFF", ALT="FFFAFAFA", ROJO="FFC00000";

function fill(hex){ return { type:"pattern", pattern:"solid", fgColor:{argb:hex} }; }
function arial(size,bold,color,italic){ return { name:"Arial", size, bold:!!bold, italic:!!italic, color:{argb:color||"FF000000"} }; }
const borde = { style:"thin", color:{argb:"FFBFBFBF"} };
const BD = { top:borde, bottom:borde, left:borde, right:borde };
const CEN = { horizontal:"center", vertical:"middle" };
const IZQ = { horizontal:"left", vertical:"middle" };
const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// Familia de un envío: el original + sus partes (si se dividió).
// Si piden el informe de una PARTE, se genera el del original completo:
// un envío dividido tiene siempre UN solo informe.
function familia(envioId) {
  const e = db.prepare("SELECT id, padre_id FROM envios WHERE id=?").get(envioId);
  if (!e) return null;
  const raizId = e.padre_id || e.id;
  const hijos = db.prepare("SELECT * FROM envios WHERE padre_id=? ORDER BY id").all(raizId);
  return { raizId, hijos, ids: [raizId, ...hijos.map(h => h.id)] };
}

function estadoFamilia(raiz, hijos) {
  if (!hijos.length) return raiz.estado;
  const est = hijos.map(h => h.estado);
  if (est.includes("en_curso")) return "en_curso";
  if (est.includes("pausada")) return "pausada";
  if (est.every(x => ["finalizada","error"].includes(x))) return est.every(x => x === "error") ? "error" : "finalizada";
  return "en_curso";
}

const MOTIVOS = {
  duplicado: "Duplicado (ya estaba en la base)",
  invalido: "Sin dato válido",
  lista_negra: "En lista negra (pidió no recibir mensajes)",
};

async function generarEnvio(envioId) {
  const fam = familia(envioId);
  if (!fam) throw new Error("Envío no encontrado");
  const c = db.prepare("SELECT e.*, cm.nombre AS campana_nombre FROM envios e JOIN campanas cm ON cm.id=e.campana_id WHERE e.id=?").get(fam.raizId);
  if (!c) throw new Error("Envío no encontrado");
  const marcas = fam.ids.map(() => "?").join(",");
  const contactos = db.prepare(`SELECT * FROM contactos WHERE envio_id IN (${marcas}) ORDER BY id`).all(...fam.ids);
  const descartados = db.prepare(`SELECT * FROM descartados WHERE envio_id IN (${marcas}) ORDER BY id`).all(...fam.ids);
  const dividido = fam.hijos.length > 0;
  const estado = estadoFamilia(c, fam.hijos);
  const fines = [c.enviado_en, ...fam.hijos.map(h => h.enviado_en)].filter(Boolean).sort();
  const fecha = fines.length ? fines[fines.length - 1] : c.creado_en;

  const enviados = contactos.filter(x => x.estado !== "error" && x.estado !== "pendiente");
  const errores = contactos.filter(x => x.estado === "error");
  const dupCount = descartados.filter(d => d.motivo==="duplicado").length;
  const invCount = descartados.filter(d => d.motivo==="invalido").length;
  const lnCount = descartados.filter(d => d.motivo==="lista_negra").length;

  const wb = new ExcelJS.Workbook();

  // ---------- RESUMEN ----------
  const ws = wb.addWorksheet("Resumen", { views:[{showGridLines:false}] });
  [3,26,22,20,16].forEach((w,i)=> ws.getColumn(i+1).width=w);

  function titulo(row, texto, size, bg){
    ws.mergeCells(row,2,row,5);
    const cell=ws.getCell(row,2); cell.value=texto; cell.font=arial(size,true,BLANCO);
    cell.fill=fill(bg); cell.alignment=CEN; ws.getRow(row).height=size>13?30:22;
  }
  function banda(row,texto){ titulo(row,texto,12,AZUL2); }
  function kpi(row, heads, vals, fills, colors, vsize){
    heads.forEach((h,j)=>{ const cell=ws.getCell(row,2+j); cell.value=h; cell.font=arial(9,true,GRIS); cell.fill=fill(fills[j]); cell.alignment=CEN; cell.border=BD; });
    ws.getRow(row).height=20;
    vals.forEach((v,j)=>{ const cell=ws.getCell(row+1,2+j); cell.value=v; cell.font=arial(vsize||20,true,colors[j]); cell.fill=fill(BLANCO); cell.alignment=CEN; cell.border=BD; });
    ws.getRow(row+1).height=38;
  }

  titulo(2, "REPORTE DE ENVÍO MASIVO — "+c.canal.toUpperCase(), 16, AZUL);
  titulo(3, "JELCOM Soluciones Empresariales", 10, AZUL2); ws.getRow(3).height=18;

  const ficha = [
    ["Cliente:", c.campana_nombre],
    ["Envío:", c.nombre],
    ["Canal:", c.canal.toUpperCase()],
    ["Estado:", dividido ? `${estado} (enviado en ${fam.hijos.length} partes en paralelo)` : estado],
    ["Fecha de envío:", fecha],
  ];
  let r=5;
  for (const [k,v] of ficha){
    const a=ws.getCell(r,2); a.value=k; a.font=arial(10,true,AZUL); a.alignment=IZQ;
    ws.mergeCells(r,3,r,5); const b=ws.getCell(r,3); b.value=v; b.font=arial(10); b.alignment=IZQ;
    r++;
  }

  banda(11,"RESUMEN DE PROCESAMIENTO");
  kpi(12, ["Registros en base","Descartados","ENVIADOS","Fallidos"],
       [miles(c.total_base), miles(dupCount+invCount+lnCount), miles(enviados.length), miles(errores.length)],
       [GRISC,NARANJB,VERDEB,GRISC], [AZUL,NARANJA,VERDE,ROJO]);
  ws.mergeCells(14,2,14,5);
  const nota=ws.getCell(14,2);
  nota.value=`La base contenía ${miles(c.total_base)} registros. Se depuró a ${miles(contactos.length)} contactos únicos (${dupCount} duplicados, ${invCount} inválidos${lnCount ? `, ${lnCount} en lista negra` : ""}). Envío ejecutado por la plataforma JELCOM.`;
  nota.font=arial(8,false,GRISCL,true); nota.alignment={horizontal:"center",vertical:"middle",wrapText:true}; ws.getRow(14).height=18;

  banda(16,"MENSAJE ENVIADO");
  ws.mergeCells(17,2,21,5);
  const msg=ws.getCell(17,2); msg.value=c.cuerpo||""; msg.font=arial(9); msg.alignment={horizontal:"left",vertical:"top",wrapText:true}; msg.border=BD;

  // ---------- DETALLE ----------
  const d = wb.addWorksheet("Detalle de envíos", { views:[{showGridLines:false, state:"frozen", ySplit:1}] });
  [8,22,18].forEach((w,i)=> d.getColumn(i+1).width=w);
  ["#","Destino","Estado"].forEach((h,j)=>{ const cell=d.getCell(1,1+j); cell.value=h; cell.font=arial(10,true,BLANCO); cell.fill=fill(AZUL2); cell.alignment=CEN; cell.border=BD; });
  d.getRow(1).height=20;
  contactos.forEach((x,i)=>{
    const row=i+2; const bg = i%2? ALT: BLANCO;
    const est = x.estado==="error" ? "FALLIDO" : "ENVIADO";
    const cE = est==="ENVIADO";
    [i+1, "+"+x.destino, est].forEach((v,j)=>{
      const cell=d.getCell(row,1+j); cell.value=v; cell.border=BD;
      if (j===2){ cell.font=arial(9,true, cE?VERDE:ROJO); cell.fill=fill(cE?VERDEB:NARANJB); cell.alignment=CEN; }
      else { cell.font=arial(j===1?10:9); cell.fill=fill(bg); cell.alignment=CEN; if(j===1) cell.numFmt="@"; }
    });
  });

  // ---------- DESCARTADOS ----------
  const ds = wb.addWorksheet("Descartados", { views:[{showGridLines:false, state:"frozen", ySplit:4}] });
  [8,26,34].forEach((w,i)=> ds.getColumn(i+1).width=w);
  ds.mergeCells(1,1,1,3); const dt=ds.getCell(1,1); dt.value=`REGISTROS DESCARTADOS (${descartados.length})`; dt.font=arial(13,true,BLANCO); dt.fill=fill(NARANJA); dt.alignment=CEN; ds.getRow(1).height=26;
  ds.mergeCells(2,1,2,3); const dsub=ds.getCell(2,1); dsub.value=`${dupCount} duplicados, ${invCount} sin dato válido${lnCount ? ` y ${lnCount} en lista negra (excluidos a petición del titular)` : ""}.`; dsub.font=arial(9,false,GRIS,true); dsub.alignment={horizontal:"center",vertical:"middle",wrapText:true}; ds.getRow(2).height=22;
  ["#","Valor","Motivo"].forEach((h,j)=>{ const cell=ds.getCell(4,1+j); cell.value=h; cell.font=arial(10,true,BLANCO); cell.fill=fill(NARANJA); cell.alignment=CEN; cell.border=BD; });
  descartados.forEach((x,i)=>{
    const row=i+5; const bg=i%2?NARANJF:BLANCO;
    [i+1, x.valor, MOTIVOS[x.motivo] || x.motivo].forEach((v,j)=>{
      const cell=ds.getCell(row,1+j); cell.value=v; cell.border=BD; cell.fill=fill(bg);
      cell.font=arial(9, false, j===2?MARRON:"FF000000"); cell.alignment=j===2?IZQ:CEN; if(j===1) cell.numFmt="@";
    });
  });

  // ---------- COMPROBANTES ----------
  const cp = wb.addWorksheet("Comprobantes", { views:[{showGridLines:false, state:"frozen", ySplit:4}] });
  [8,22,60].forEach((w,i)=> cp.getColumn(i+1).width=w);
  cp.mergeCells(1,1,1,3); const ct=cp.getCell(1,1); ct.value="COMPROBANTES TÉCNICOS DE ENVÍO"; ct.font=arial(13,true,BLANCO); ct.fill=fill(AZUL); ct.alignment=CEN; cp.getRow(1).height=26;
  cp.mergeCells(2,1,2,3); const csub=cp.getCell(2,1); csub.value="Identificador único que el proveedor asigna a cada mensaje, verificable en su plataforma."; csub.font=arial(9,false,GRIS,true); csub.alignment={horizontal:"left",vertical:"top",wrapText:true}; cp.getRow(2).height=30;
  ["#","Destino","Comprobante (ID)"].forEach((h,j)=>{ const cell=cp.getCell(4,1+j); cell.value=h; cell.font=arial(10,true,BLANCO); cell.fill=fill(AZUL2); cell.alignment=CEN; cell.border=BD; });
  let rr=5;
  for (const x of enviados){
    const bg=(rr%2)?BLANCO:ALT;
    [rr-4, "+"+x.destino, x.comprobante||""].forEach((v,j)=>{
      const cell=cp.getCell(rr,1+j); cell.value=v; cell.border=BD; cell.fill=fill(bg);
      cell.font=arial(j===2?8:(j===1?10:9)); cell.alignment=j===2?IZQ:CEN; if(j===1||j===2) cell.numFmt="@";
    });
    rr++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, nombre: `Reporte_${c.canal}_${c.nombre.replace(/\s+/g,"_")}.xlsx` };
}

module.exports = { generarEnvio, generarConsolidado };

// ─────────────────────────────────────────────────────────────
//  INFORME CONSOLIDADO — todos los envíos de una campaña (cliente)
//  en un rango de fechas. Una fila por envío + totales por canal.
// ─────────────────────────────────────────────────────────────
async function generarConsolidado(campanaId, desde, hasta) {
  const camp = db.prepare("SELECT * FROM campanas WHERE id=?").get(campanaId);
  if (!camp) throw new Error("Campaña no encontrada");

  let sql = "SELECT * FROM envios WHERE campana_id=? AND padre_id IS NULL";
  const args = [campanaId];
  if (desde) { sql += " AND date(creado_en)>=date(?)"; args.push(desde); }
  if (hasta) { sql += " AND date(creado_en)<=date(?)"; args.push(hasta); }
  sql += " ORDER BY creado_en";
  const envios = db.prepare(sql).all(...args);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Consolidado", { views:[{showGridLines:false}] });
  [3,28,14,14,14,14,14].forEach((w,i)=> ws.getColumn(i+1).width=w);

  function tit(row, texto, size, bg, span){
    ws.mergeCells(row,2,row,span||7);
    const cell=ws.getCell(row,2); cell.value=texto; cell.font=arial(size,true,BLANCO);
    cell.fill=fill(bg); cell.alignment=CEN; ws.getRow(row).height=size>13?30:22;
  }
  tit(2, "INFORME CONSOLIDADO — "+camp.nombre.toUpperCase(), 16, AZUL);
  tit(3, "JELCOM Soluciones Empresariales", 10, AZUL2); ws.getRow(3).height=18;
  const rango = (desde||"inicio")+"  a  "+(hasta||"hoy");
  tit(4, "Periodo: "+rango, 10, AZUL2); ws.getRow(4).height=16;

  // Encabezado de tabla
  const heads=["#","Envío","Canal","Base","Enviados","Entregados*","Estado"];
  heads.forEach((h,j)=>{ const cell=ws.getCell(6,2+j); cell.value=h; cell.font=arial(10,true,BLANCO); cell.fill=fill(AZUL2); cell.alignment=CEN; cell.border=BD; });
  ws.getRow(6).height=20;

  let r=7, totBase=0, totEnv=0;
  const porCanal={};
  envios.forEach((e0,i)=>{
    const bg=i%2?ALT:BLANCO;
    // Si el envío se dividió, se muestra como UNA fila con todas sus partes sumadas
    const fam = familia(e0.id);
    const marcas = fam.ids.map(() => "?").join(",");
    const e = { ...e0,
      total_validos: db.prepare(`SELECT COUNT(*) n FROM contactos WHERE envio_id IN (${marcas})`).get(...fam.ids).n,
      total_enviados: fam.hijos.reduce((a,h)=>a+(h.total_enviados||0), e0.total_enviados||0),
      estado: estadoFamilia(e0, fam.hijos),
    };
    const entregados=db.prepare(`SELECT COUNT(*) n FROM contactos WHERE envio_id IN (${marcas}) AND estado IN ('entregado','leido')`).get(...fam.ids).n;
    const row=[i+1, e.nombre, e.canal.toUpperCase(), e.total_validos||0, e.total_enviados||0, entregados||"—", e.estado];
    row.forEach((v,j)=>{ const cell=ws.getCell(r,2+j); cell.value=v; cell.border=BD; cell.fill=fill(bg); cell.font=arial(9, j===1); cell.alignment=j===1?IZQ:CEN; });
    totBase+=e.total_validos||0; totEnv+=e.total_enviados||0;
    porCanal[e.canal]=(porCanal[e.canal]||0)+(e.total_enviados||0);
    r++;
  });
  // Fila total
  const totRow=["", "TOTAL", "", totBase, totEnv, "", ""];
  totRow.forEach((v,j)=>{ const cell=ws.getCell(r,2+j); cell.value=v; cell.fill=fill(AZUL); cell.font=arial(10,true,BLANCO); cell.alignment=j===1?IZQ:CEN; cell.border=BD; });
  r+=2;

  // Resumen por canal
  tit(r, "TOTAL POR CANAL", 11, AZUL2, 4); r++;
  Object.entries(porCanal).forEach(([canal,n],i)=>{
    const bg=i%2?ALT:BLANCO;
    ws.getCell(r,2).value=canal.toUpperCase(); ws.getCell(r,2).font=arial(9,true); ws.getCell(r,2).fill=fill(bg); ws.getCell(r,2).border=BD; ws.getCell(r,2).alignment=IZQ;
    ws.mergeCells(r,3,r,4); ws.getCell(r,3).value=n+" envíos"; ws.getCell(r,3).font=arial(9); ws.getCell(r,3).fill=fill(bg); ws.getCell(r,3).border=BD; ws.getCell(r,3).alignment=CEN;
    r++;
  });
  r++;
  ws.mergeCells(r,2,r,7);
  const nota=ws.getCell(r,2);
  nota.value="* Entregados: solo disponible en envíos con confirmación de estados por webhook. Cifra informativa.";
  nota.font=arial(8,false,GRISCL,true); nota.alignment=IZQ;

  const buffer = await wb.xlsx.writeBuffer();
  const nombreArch = `Consolidado_${camp.nombre.replace(/\s+/g,"_")}_${(desde||"").replace(/-/g,"")}_${(hasta||"").replace(/-/g,"")}.xlsx`;
  return { buffer, nombre: nombreArch };
}