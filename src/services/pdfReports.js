/**
 * pdfReports.js v7
 * CAMBIOS:
 *  - Sin líneas verticales — solo separadores horizontales punteados
 *  - Referencias de tipo "select" (A|B|C) no se muestran en columna Referencia
 *  - Código de barras reducido a la mitad de largo, pegado a la derecha del bloque
 *  - Firma "RESPONSABLE TÉCNICO" al final de cada examen
 *  - Encabezado completo en cada página
 */

import jsPDF     from 'jspdf'
import autoTable from 'jspdf-autotable'
import JsBarcode from 'jsbarcode'
import { formatAge } from './patients'
import { sqlDate }   from './database'

// ── Paleta ─────────────────────────────────────────────────────────────────────
const K = {
  black:  [0,   0,   0  ],
  dark:   [25,  25,  25 ],
  gray:   [110, 110, 110],
  lgray:  [190, 190, 190],
  xlgray: [238, 238, 238],
  thead:  [210, 210, 210],
  rowalt: [249, 249, 249],
  white:  [255, 255, 255],
  red:    [185, 0,   0  ],
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function tf(doc, sz, style = 'normal', col = K.dark) {
  doc.setFontSize(sz); doc.setFont('helvetica', style); doc.setTextColor(...col)
}

function hline(doc, y, x1, x2, lw = 0.3, col = K.lgray) {
  doc.setDrawColor(...col); doc.setLineWidth(lw); doc.line(x1, y, x2, y)
}

// Línea punteada entre filas — guiones más separados y suaves
function dottedLine(doc, y, x1, x2, col = [215, 215, 215]) {
  doc.setDrawColor(...col)
  doc.setLineWidth(0.1)
  const dash = 1.8, gap = 3.5
  for (let x = x1; x < x2; x += dash + gap) {
    doc.line(x, y, Math.min(x + dash, x2), y)
  }
}

// Separador entre áreas — guiones más largos y espaciados
function areaSeparator(doc, y, x1, x2) {
  doc.setDrawColor(175, 175, 175)
  doc.setLineWidth(0.2)
  const dash = 4, gap = 5
  for (let x = x1; x < x2; x += dash + gap) {
    doc.line(x, y, Math.min(x + dash, x2), y)
  }
}

// Limpia caracteres no-latin para jsPDF
function cleanRef(text) {
  if (!text) return ''
  return String(text)
    .replace(/[\u2264\u2266]/g, '<=')
    .replace(/[\u2265\u2267]/g, '>=')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00BD\u00BC\u00BE]/g, '')
    .replace(/[^\x00-\xFF]/g, c => {
      const m={'β':'b','µ':'u','°':'°','±':'+-'}; return m[c]||''
    })
    .trim()
}

// Barcode nítido para impresión — líneas delgadas, número debajo
function barcodeDataUrl(text) {
  try {
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, String(text), {
      format:'CODE128', width:1.2, height:32,
      displayValue:true, fontSize:14, textMargin:2, font:'monospace',
      background:'#ffffff', lineColor:'#111111', margin:2,
    })
    return canvas.toDataURL('image/png')
  } catch(e) { return null }
}

// Referencia limpia — si es tipo select (tiene |) devuelve cadena vacía
function refDisplay(r, sex) {
  if (!r) return ''

  // Si tiene "|" es una lista de opciones → no mostrar en columna referencia
  const checkPipeStr = s => typeof s === 'string' && s.includes('|')

  if (r.reference_text) {
    if (checkPipeStr(r.reference_text)) return ''
    return cleanRef(r.reference_text)
  }
  if (r.ref_min != null && r.ref_max != null)
    return `${r.ref_min} - ${r.ref_max}`

  const refs = r.references || (r.reference ? [r.reference] : [])
  if (!refs.length) return ''
  const best = refs.find(x => x.sex === sex) || refs.find(x => !x.sex) || refs[0]
  if (!best) return ''
  if (best.text_value) {
    if (checkPipeStr(best.text_value)) return ''
    return cleanRef(best.text_value)
  }
  if (best.value_min != null && best.value_max != null)
    return `${best.value_min} - ${best.value_max}`
  if (best.value_min != null) return `>= ${best.value_min}`
  if (best.value_max != null) return `<= ${best.value_max}`
  return ''
}

// ── Config del laboratorio ─────────────────────────────────────────────────────
async function getCfg() {
  try {
    const { db } = await import('./database')
    const rows = await db.query('SELECT key, value FROM lab_config')
    const c = {}
    for (const r of rows) if (r.value) c[r.key] = r.value
    return c
  } catch { return {} }
}

// ── Carga logo de impresión ────────────────────────────────────────────────────
async function loadLogoDataUrl({ compress = false } = {}) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}logo_impresion.png`)
    if (!res.ok) return null
    const blob = await res.blob()
    if (!compress) {
      return new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror   = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
    // Modo comprimido: redimensionar + JPEG
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const MAX_W = 360, MAX_H = 150
        const ratio = Math.min(MAX_W / img.naturalWidth, MAX_H / img.naturalHeight, 1)
        const w = Math.round(img.naturalWidth  * ratio)
        const h = Math.round(img.naturalHeight * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      img.src = url
    })
  } catch { return null }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  generateResultsPDF
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateResultsPDF(order, examResults, birthDate, sex, { compress = false, forDoctor = false } = {}) {
  const cfg     = await getCfg()
  const logoUrl = await loadLogoDataUrl({ compress })
  // Estilo de valores anormales: 'none' | 'bold' | 'red' | 'symbol'
  const abnStyle = forDoctor
    ? (cfg.abnormal_doctor  || 'bold')
    : (cfg.abnormal_patient || 'none')

  const PW = 210, PH = 297
  const ML = 10, MR = 10
  const CW = PW - ML - MR   // 190 mm
  const FOOTER_H = 20

  const labName     = cfg.lab_name     || 'LABORATORIO CLINICO'
  const labAddress  = cfg.lab_address  || ''
  const labPhone    = cfg.lab_phone    || ''
  const labEmail    = cfg.lab_email    || ''
  const labDirector = cfg.lab_director || 'Director Tecnico'
  const labLicense  = cfg.lab_license  || ''
  const sigTitle    = cfg.sig_title || 'RESPONSABLE T\xc9CNICO'
  const sigName     = cfg.sig_name  || ''
  const sigExtra    = cfg.sig_extra || ''
  const labService  = cfg.lab_service  || 'Laboratorio Clinico'
  const labFooter   = cfg.result_footer
    || 'Este resultado es valido unicamente con firma del responsable.'
  const showCutLine        = cfg.pdf_cut_line === '1'
  const showFechaIngreso   = cfg.pdf_fecha_ingreso  !== '0'   // default activo
  const showFechaInforme   = cfg.pdf_fecha_informe  !== '0'   // default activo
  const soloFecha          = cfg.pdf_solo_fecha     === '1'   // default sin hora

  const patName  = (order.patient_name || '').toUpperCase()
  const patId    = order.patient_id_number || ''
  const patSex   = sex || order.patient_sex || ''
  const ageStr   = formatAge(birthDate || order.patient_birth_date) || ''
  const sexStr   = patSex === 'M' ? 'MASCULINO' : patSex === 'F' ? 'FEMENINO' : ''
  const orderNum = order.order_number || ''

  const fmtDate = d => {
    if (!d) return ''
    const dt = sqlDate(d)
    const dateStr = dt.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
    if (soloFecha) return dateStr
    return dateStr + ' ' + dt.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
  }
  const fechaStr = fmtDate(order.created_at)
  const printStr = fmtDate(new Date())

  // ── Documento ──────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress })
  let y = 0
  let headerTitleY = 0   // Y donde se dibuja "INFORME DE RESULTADOS" — usado para el contador
  let showTableHeader = true  // se actualiza tras separar normalExams

  // ── Columnas (sin líneas verticales — solo usamos X para posicionar texto) ──
  const COL = {
    prueba: { x: ML,       w: 68 },
    result: { x: ML + 68,  w: 42 },
    unidad: { x: ML + 110, w: 22 },
    refer:  { x: ML + 132, w: 68 },
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  drawHeader — se llama en página 1 y en cada página nueva
  // ─────────────────────────────────────────────────────────────────────────────
  function drawHeader() {
    // ── Encabezado — Logo izquierda + datos laboratorio derecha ──
    const LOGO_W = 60
    const LOGO_H = 25
    const LOGO_X = ML
    const LOGO_Y = 5

    if (logoUrl) {
      try { doc.addImage(logoUrl, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H) }
      catch { /* logo no disponible */ }
    }

    // Bloque de texto del laboratorio
    const TX  = ML + 8
    const TW  = PW - MR - TX
    const TCX = TX + TW / 2
    let   ty  = LOGO_Y + 5

    // Nombre del laboratorio
    tf(doc, 13, 'bold', [20, 45, 90])
    const nameLines = doc.splitTextToSize('LABORATORIO DE ANÁLISIS CLÍNICO', TW)
    nameLines.forEach(l => { doc.text(l, TCX, ty, { align: 'center' }); ty += 4.5 })

    // Subtítulo
    if (cfg.lab_subtitle) {
      ty += 0.5
      tf(doc, 8, 'italic', [100, 120, 150])
      doc.text(cfg.lab_subtitle, TCX, ty, { align: 'center' }); ty += 3.5
    }

    // Dirección
    if (labAddress) {
      tf(doc, 8, 'normal', K.gray)
      const aLines = doc.splitTextToSize(labAddress, TW - 2)
      aLines.forEach(l => { doc.text(l, TCX, ty, { align: 'center' }); ty += 3 })
    }

    // Correo electrónico
    if (labEmail) {
      tf(doc, 8, 'normal', K.gray)
      doc.text('Correo: ' + labEmail, TCX, ty, { align: 'center' }); ty += 3
    }

    // Teléfono
    if (labPhone) {
      tf(doc, 8, 'normal', K.gray)
      doc.text('Tel: ' + labPhone, TCX, ty, { align: 'center' }); ty += 3
    }

    // Director / Licencia
    if (labDirector && labDirector !== 'Dr./Dra. Director(a)') {
      tf(doc, 6, 'normal', [150, 150, 150])
      const lic = labLicense ? `  ·  Lic. ${labLicense}` : ''
      doc.text(labDirector + lic, TCX, ty, { align: 'center' })
    }

    y = LOGO_Y + LOGO_H - 4

    // Título — solo texto, sin bordes ni líneas
    headerTitleY = y + 2   // guardamos Y para el contador de páginas
    tf(doc, 11, 'bold', K.black)
    doc.text('INFORME DE RESULTADOS', PW / 2, headerTitleY, { align:'center' })
    y += 5

    // ── Bloque paciente — interlineado casi cero (0.3mm entre filas) ─────────
    const MID = ML + CW * 0.56

    const LX  = ML + 3
    const RX  = MID + 3
    const FS  = 7.5          // tamaño fuente datos
    const RH  = FS * 0.3528          // alto de línea: solo fuente en mm ≈ 2.65mm (sin extra)
    const PT  = 0.5          // padding mínimo superior

    // Calcular cuántas filas hay para ajustar el bloque
    const leftRows = 4 + (order.doctor_name ? 1 : 0)
    const BH = PT * 2 + leftRows * RH

    doc.setFillColor(250, 251, 253)
    doc.rect(ML, y, CW, BH, 'F')
    hline(doc, y + BH, ML, PW - MR, 0.4, K.lgray)

    // Número de orden — derecha arriba, negro negrita
    tf(doc, 8, 'bold', K.black)
    doc.text('N\xba ' + orderNum, PW - MR - 3, y + PT + RH * 0.8, { align: 'right' })

    function pRow(label, value, bx, row, mxW) {
      const cy  = y + PT + row * RH + RH * 0.82
      const mx  = mxW ?? (MID - bx - 20)
      tf(doc, 6, 'bold', K.dark)
      doc.text(label + ':', bx, cy)
      tf(doc, FS, 'bold', K.dark)
      doc.text(String(value||''), bx + 18, cy, { maxWidth: mx })
    }

    // Col izquierda
    pRow('Paciente',  patName,  LX, 0)
    pRow('C.I.',      patId,    LX, 1)
    pRow('Edad',      ageStr,   LX, 2)
    pRow('Sexo',      sexStr,   LX, 3)

    // Col derecha — desplazada más a la derecha, maxWidth hasta el barcode
    const RX2  = MID -18
    const RMX  = PW - MR - RX2 - 4   // deja espacio al barcode
    // ambas: solo distingue labels cuando hay DOS fechas Y soloFecha está desactivado
    const ambas = showFechaIngreso && showFechaInforme && !soloFecha
    const labelIngreso = ambas ? 'F. Ingreso' : 'Fecha'
    const labelInforme = ambas ? 'F. Informe' : 'Fecha'
    let rr = 0
    if (showFechaIngreso) { pRow(labelIngreso, fechaStr || '—', RX2, rr, RMX); rr++ }
    if (showFechaInforme) { pRow(labelInforme, printStr || '—', RX2, rr, RMX); rr++ }
    pRow('Servicio',   labService, RX2, rr, RMX); rr++
    if (order.doctor_name) pRow('M\xe9dico', order.doctor_name, RX2, rr, RMX)

    // Código de barras — esquina derecha, subido
    const bc = barcodeDataUrl(orderNum)
    if (bc) {
      const bcW = Math.min((PW - MR - MID - 3) * 0.82, 36)
      const bcH = RH * 2.8
      const bcX = PW - MR - bcW - 2
      const bcY = y + PT + RH * 1.4
      doc.addImage(bc, 'PNG', bcX, bcY, bcW, bcH)
    }

    y += BH + 1

    // Cabecera tabla (se omite cuando todos los exámenes usan layout en columnas)
    if (showTableHeader) drawTableHeader()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  drawTableHeader — PRUEBA | RESULTADO | UNIDAD | REFERENCIA
  //  Sin líneas verticales
  // ─────────────────────────────────────────────────────────────────────────────
  function drawTableHeader() {
    const hH = 6.5
    // Sin relleno — solo líneas y tipografía
    hline(doc, y,        ML, PW - MR, 0.6, K.black)
    hline(doc, y + hH,   ML, PW - MR, 0.6, K.black)

    tf(doc, 7, 'bold', [80, 80, 80])
    doc.text('PRUEBA',     COL.prueba.x + 2, y + 4.3)
    doc.text('RESULTADO',  COL.result.x + 2, y + 4.3)
    doc.text('UNIDAD',     COL.unidad.x + 2, y + 4.3)
    doc.text('REFERENCIA', COL.refer.x  + 2, y + 4.3)
    y += hH
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Verificar espacio
  // ─────────────────────────────────────────────────────────────────────────────
  function ensureSpace(needed = 7) {
    if (y + needed > PH - FOOTER_H - 2) {
      doc.addPage()
      drawHeader()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Fila de sección  ░░░ HEMATOLOGÍA ░░░
  // ─────────────────────────────────────────────────────────────────────────────
  function drawSectionRow(label) {
    ensureSpace(6)
    const sH = 4.5
    tf(doc, 9, 'bold', K.black)
    doc.text(label.toUpperCase(), ML + 2, y + 3.5)
    y += sH
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Sub-sección
  // ─────────────────────────────────────────────────────────────────────────────
  function drawSubRow(label) {
    tf(doc, 7, 'bolditalic', K.gray)
    const lines = doc.splitTextToSize(String(label || ''), CW - 8)
    const sH = lines.length * 3.2 + 1.6
    ensureSpace(sH + 1)
    doc.setFillColor(244, 244, 244)
    doc.rect(ML, y, CW, sH, 'F')
    hline(doc, y + sH, ML, PW-MR, 0.15, K.lgray)
    lines.forEach((l, i) => doc.text(l, ML + 4, y + 2.0 + i * 3.2))
    y += sH
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Nombre de examen compacto — mismo estilo que filas de parámetros (serología, etc.)
  // ─────────────────────────────────────────────────────────────────────────────
  function drawExamNameRow(label) {
    const rH = 4.2
    ensureSpace(rH + 1)
    doc.setFillColor(236, 241, 247)
    doc.rect(ML, y, CW, rH, 'F')
    dottedLine(doc, y + rH, ML, PW - MR, K.lgray)
    tf(doc, 7, 'bold', K.dark)
    doc.text(String(label || ''), ML + 3, y + 3.0, { maxWidth: CW - 6 })
    y += rH
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Sub-sub-sección (nivel 2, ej: Macroscópico / Microscópico dentro de un examen)
  // ─────────────────────────────────────────────────────────────────────────────
  function drawSubSubRow(label) {
    ensureSpace(5)
    const sH = 3.8
    doc.setFillColor(250, 250, 250)
    doc.rect(ML, y, CW, sH, 'F')
    hline(doc, y + sH, ML, PW-MR, 0.1, [210, 210, 210])
    tf(doc, 7, 'italic', [140, 140, 140])
    doc.text(label, ML + 8, y + 2.8)
    y += sH
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Fila de resultado — SIN líneas verticales, separadores punteados
  // ─────────────────────────────────────────────────────────────────────────────
  function drawRow(prueba, resultado, unidad, referencia, isAbnormal, abnType, shade) {
    const lineH = 3.8   // altura por línea de texto
    const PAD   = 1.2   // padding vertical

    // Pre-calcular líneas para determinar altura real de la fila
    tf(doc, 7.5, 'normal', K.dark)
    const nameLines = doc.splitTextToSize(String(prueba || ''), COL.prueba.w - 4)
    tf(doc, 8, 'normal', K.dark)
    const resLines  = doc.splitTextToSize(String(resultado || ''), COL.result.w - 3)
    tf(doc, 7, 'normal', K.gray)
    const refLines  = doc.splitTextToSize(cleanRef(String(referencia || '')), COL.refer.w - 3)

    const maxLines = Math.max(nameLines.length, resLines.length, refLines.length, 1)
    const rH = PAD * 2 + maxLines * lineH

    ensureSpace(rH + 1)

    if (shade) {
      doc.setFillColor(...K.rowalt)
      doc.rect(ML, y, CW, rH, 'F')
    }

    dottedLine(doc, y + rH, ML, PW - MR, K.lgray)

    // Símbolo según tipo (high/low) para estilo 'symbol'
    const abnSym = isAbnormal
      ? (abnType === 'high' ? ' \u2191' : abnType === 'low' ? ' \u2193' : ' *')
      : ''

    // Nombre prueba — prefijo '*' solo en bold/red
    const showPrefix = isAbnormal && (abnStyle === 'bold' || abnStyle === 'red')
    tf(doc, 7.5, 'normal', K.dark)
    nameLines.forEach((l, i) =>
      doc.text((i === 0 ? (showPrefix ? '* ' : '  ') : '  ') + l,
        COL.prueba.x + 1, y + PAD + i * lineH + lineH * 0.8))

    // Resultado — estilo según config
    if      (isAbnormal && abnStyle === 'red')    tf(doc, 8, 'bold',   K.red)
    else if (isAbnormal && abnStyle === 'bold')   tf(doc, 8, 'bold',   K.black)
    else                                          tf(doc, 8, 'normal', K.dark)

    const resVal = (l, i) => l + (i === 0 && isAbnormal && abnStyle === 'symbol' ? abnSym : '')
    resLines.forEach((l, i) =>
      doc.text(resVal(l, i), COL.result.x + 2, y + PAD + i * lineH + lineH * 0.8))

    // Unidad — primera línea
    tf(doc, 7, 'normal', K.gray)
    doc.text(String(unidad || ''), COL.unidad.x + 2, y + PAD + lineH * 0.8)

    // Referencia
    tf(doc, 7, 'normal', K.gray)
    refLines.forEach((l, i) =>
      doc.text(l, COL.refer.x + 2, y + PAD + i * lineH + lineH * 0.8))

    y += rH
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Fila textarea para citología — col. izquierda: nombre | col. derecha: párrafo
  // ─────────────────────────────────────────────────────────────────────────────
  function drawRowTextarea(prueba, text, shade = false) {
    if (!text || !String(text).trim()) return
    const textStr   = String(text).trim()
    const pruebaStr = String(prueba || '')

    // Nombre en columna prueba | Texto alineado con columna resultado
    const nameColW  = COL.result.x - ML - 4
    const nameX     = ML + 2
    const textX     = COL.result.x + 2
    const textW     = COL.unidad.x - textX - 2
    const lineH     = 2.7
    const padTop    = 2.6
    const padBot    = 1.8

    tf(doc, 7.5, 'normal', K.dark)
    const textLines  = doc.splitTextToSize(textStr, textW)
    tf(doc, 7.5, 'bold', K.gray)
    const nameLines  = doc.splitTextToSize(pruebaStr, nameColW - 4)
    const rowH = padTop + Math.max(nameLines.length, textLines.length) * lineH + padBot

    ensureSpace(rowH + 1)

    // Fondo intercalado
    if (shade) {
      doc.setFillColor(...K.rowalt)
      doc.rect(ML, y, CW, rowH, 'F')
    }

    // Separador horizontal inferior
    dottedLine(doc, y + rowH, ML, PW - MR, K.lgray)

    // Nombre del parámetro
    tf(doc, 7.5, 'bold', K.gray)
    nameLines.forEach((l, i) => doc.text(l, nameX, y + padTop + i * lineH))

    // Texto del resultado — ocupa desde col resultado hasta referencia
    tf(doc, 7.5, 'normal', K.dark)
    textLines.forEach((l, i) => doc.text(l, textX, y + padTop + i * lineH))

    y += rowH
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Layout por grupos en columnas: cada columna = un grupo, título arriba
  // ─────────────────────────────────────────────────────────────────────────────
  function renderMultiColumn(exam) {
    const NCOLS  = 3
    const GAP    = 2                              // separación entre columnas
    const colW   = (CW - GAP * (NCOLS - 1)) / NCOLS  // ~62mm por columna
    const rowH   = 4.0                            // altura de cada fila de parámetro
    const titleH = 4.5                            // altura del título de grupo

    // ── Recolectar grupos ────────────────────────────────────────────────────
    let groups = []
    const subCfg = parseSubConfig(exam)
    if (subCfg?.length) {
      const assigned = new Set()
      const mapped   = subCfg.filter(g => g.visible !== false).map(g => {
        if (!g.params?.length) return { label: g.label, items: null }
        const items = exam.results.filter(r => g.params.some(p => pname(r).startsWith(p)))
        items.forEach(r => assigned.add(pname(r).trim().toLowerCase()))
        return { label: g.label, items }
      })
      const catchIdx = mapped.findIndex(g => g.items === null)
      if (catchIdx >= 0)
        mapped[catchIdx] = { ...mapped[catchIdx],
          items: exam.results.filter(r => !assigned.has(pname(r).trim().toLowerCase())) }
      groups = mapped.filter(g => g.items?.length)
    } else {
      groups = [{ label: '', items: exam.results }]
    }

    // ── Separar textos libres (se renderizan al final, fuera de columnas) ────
    const freeTexts = []
    groups.forEach(g =>
      g.items.filter(r => r.input_type === 'textarea' || pname(r).startsWith('Obs'))
             .forEach(r => { if (!freeTexts.some(x => pname(x) === pname(r))) freeTexts.push(r) })
    )

    // ── Altura real de un grupo (solo filas normales, sin efecto secundario) ─
    const groupHeight = g => {
      const rows = g.items.filter(r => r.input_type !== 'textarea' && !pname(r).startsWith('Obs'))
      return (g.label ? titleH : 0) + rows.length * rowH
    }

    // ── Renderizar bloques de NCOLS grupos ───────────────────────────────────
    for (let gi = 0; gi < groups.length; gi += NCOLS) {
      const block  = groups.slice(gi, gi + NCOLS)
      const blockH = Math.max(...block.map(groupHeight), rowH)

      ensureSpace(blockH + 3)
      const startY = y

      block.forEach((g, ci) => {
        const cx = ML + ci * (colW + GAP)
        let   cy = startY

        // Título del grupo
        if (g.label) {
          doc.setFillColor(238, 238, 238)
          doc.rect(cx, cy, colW, titleH, 'F')
          hline(doc, cy + titleH, cx, cx + colW, 0.2, [200, 200, 200])
          tf(doc, 7, 'italic', [115, 115, 115])
          doc.text(g.label, cx + 2, cy + titleH * 0.72)
          cy += titleH
        }

        // Filas de parámetros
        const rows = g.items.filter(r => r.input_type !== 'textarea' && !pname(r).startsWith('Obs'))
        rows.forEach((r, i) => {
          if (i % 2 === 1) {
            doc.setFillColor(...K.rowalt)
            doc.rect(cx, cy, colW, rowH, 'F')
          }
          const isAbn = !!r.is_abnormal
          const val   = String(r.value ?? '—')

          // Nombre (truncado a una línea)
          tf(doc, 7, 'normal', K.dark)
          const nm = doc.splitTextToSize((isAbn ? '* ' : '') + dname(r), colW * 0.54)[0]
          doc.text(nm, cx + 1.5, cy + rowH * 0.73)

          // Valor
          if      (isAbn && abnStyle === 'red')  tf(doc, 7.5, 'bold',   K.red)
          else if (isAbn && abnStyle === 'bold') tf(doc, 7.5, 'bold',   K.black)
          else                                   tf(doc, 7.5, 'normal', K.dark)
          doc.text(val, cx + colW * 0.81, cy + rowH * 0.73, { align: 'right' })

          // Unidad
          tf(doc, 6.5, 'normal', K.gray)
          doc.text(r.unit || '', cx + colW * 0.82, cy + rowH * 0.73)

          cy += rowH
        })
      })

      // Separador vertical ligero entre columnas del bloque
      for (let ci = 1; ci < block.length; ci++) {
        const sx = ML + ci * (colW + GAP) - GAP / 2
        doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.15)
        doc.line(sx, startY, sx, startY + blockH)
      }

      y = startY + blockH + 3
      dottedLine(doc, y - 1.5, ML, PW - MR, K.lgray)
    }

    // Textos libres (Observaciones, etc.) debajo de las columnas
    freeTexts.forEach(r => drawFreeText(dname(r), r.value))
  }

  function parseSubConfig(exam) {
    try { return exam.exam_subtitles_config ? JSON.parse(exam.exam_subtitles_config) : null } catch { return null }
  }

  function renderWithSubtitleGroups(results, config) {
    const groups = config.filter(g => g.visible !== false)
    if (!groups.length) return
    const assigned = new Set()

    const mapped = groups.map(g => {
      if (!g.params?.length) return { ...g, items: null }
      const items = results.filter(r => g.params.some(p => pname(r).startsWith(p)))
      items.forEach(r => assigned.add(pname(r).trim().toLowerCase()))
      return { ...g, items }
    })

    const catchIdx = mapped.findIndex(g => g.items === null)
    if (catchIdx >= 0) {
      mapped[catchIdx] = {
        ...mapped[catchIdx],
        items: results.filter(r => !assigned.has(pname(r).trim().toLowerCase()))
      }
    }

    mapped.forEach(g => {
      if (!g.items?.length) return
      drawSubSubRow(g.label)
      g.items.forEach((r, i) => {
        if (r.input_type === 'textarea')
          drawFreeText(dname(r), r.value)
        else if (pname(r).startsWith('Obs'))
          drawFreeText(dname(r), r.value)
        else
          drawRow(dname(r), r.value, r.unit||'', refDisplay(r, patSex), r.is_abnormal, r.abnormal_type, i%2===1)
      })
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Texto libre
  // ─────────────────────────────────────────────────────────────────────────────
  function drawFreeText(label, text) {
    if (!text || !String(text).trim()) return
    ensureSpace(9)
    tf(doc, 7, 'bold', K.gray)
    doc.text(String(label||'') + ':', ML + 2, y + 4)
    y += 5
    tf(doc, 7.5, 'normal', K.dark)
    const lines = doc.splitTextToSize(String(text), CW - 6)
    for (const line of lines) {
      ensureSpace(5)
      doc.text(line, ML + 4, y + 3.5)
      y += 4.5
    }
    dottedLine(doc, y, ML, PW-MR, K.lgray)
    y += 2
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Firma del responsable (al final de cada examen)
  // ─────────────────────────────────────────────────────────────────────────────
  function drawSignature() {
    // Altura real del contenido de la firma
    const sigContentH = 4          // línea punteada + espacio
      + 2.8                        // título firma
      + (sigName  ? 2.4 : 0)
      + (sigExtra ? 2.4 : 0)
      + 4                          // padding inferior

    const available = PH - FOOTER_H - 2 - y   // espacio restante en página actual

    if (available >= sigContentH + 18) {
      // Espacio amplio — gap normal de 18mm
      y += 18
    } else if (available >= sigContentH + 6) {
      // Espacio justo — gap proporcional: mitad del espacio libre
      y += Math.round((available - sigContentH) * 0.5)
    } else {
      // No cabe — nueva página, gap mínimo de 10mm
      doc.addPage()
      drawHeader()
      y += 10
    }

    // Línea de firma centrada — puntitos finos
    const sigW = 40
    const sigX = PW / 2 - sigW / 2

    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.08)
    for (let x = sigX; x < sigX + sigW; x += 0.4 + 0.5) {  //   espacio entre la firma   y la letra 
      doc.line(x, y, Math.min(x + 0.4, sigX + sigW), y)
    }
    y += 3

    tf(doc, 7.5, 'bold', K.black)
    doc.text(sigTitle, PW / 2, y, { align: 'center' })
    y += 2.8

    tf(doc, 7, 'normal', K.gray)
    if (sigName) {
      doc.text(sigName, PW / 2, y, { align: 'center' })
      y += 2.4
    }
    if (sigExtra) {
      doc.text(sigExtra, PW / 2, y, { align: 'center' })
      y += 2.4
    }
    y += 4
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  PRIMERA PÁGINA
  // ═════════════════════════════════════════════════════════════════════════════
  // Calcular showTableHeader antes del primer drawHeader()
  showTableHeader = examResults.some(e => {
    if (!e.results?.length) return false
    const isBlank = e.exam_code === 'OTR-001'
      || e.results.some(r => (r.param_name || r.parameter_name || '') === '__rows')
    return !isBlank && !e.exam_print_columns
  })
  drawHeader()

  // ═════════════════════════════════════════════════════════════════════════════
  //  ITERAR EXÁMENES — agrupados por ÁREA
  // ═════════════════════════════════════════════════════════════════════════════
  const pname = r => r.param_name || r.parameter_name || ''
  const dname = r => pname(r).replace(/^Colesterol\s+Total$/i, 'Colesterol')

  // Orden deseado para química sanguínea
  const QUIMICA_ORDER = [
    'glucosa','urea','creatinina',
    'tgo','ast','tgp','alt',
    'bilirrubina directa','bilirrubina indirecta','bilirrubina total',
    'colesterol hdl','colesterol ldl',
    'colesterol',
    'trigl',
    'cido','urico','úrico',
    'prote',
    'alb',
    'proteinuria',
    'creatinuria',
  ]
  function quimicaIdx(r) {
    const n = pname(r).toLowerCase()
    for (let i = 0; i < QUIMICA_ORDER.length; i++) {
      if (n.includes(QUIMICA_ORDER[i])) return i
    }
    return 999
  }

  // Etiquetas personalizadas de área (guardadas en lab_config como JSON)
  let areaLabels = {}
  try { areaLabels = JSON.parse(cfg.area_labels || '{}') } catch {}

  // Separar formularios en blanco del resto
  const blankForms  = []
  const normalExams = []
  for (const exam of examResults) {
    if (!exam.results?.length) continue
    const isBlank = exam.exam_code === 'OTR-001'
      || exam.results.some(r => pname(r) === '__rows')
    if (isBlank) blankForms.push(exam)
    else normalExams.push(exam)
  }

  // Agrupar exámenes normales por área/categoría (manteniendo orden de llegada)
  const areaOrder = []
  const areaMap   = new Map()
  for (const exam of normalExams) {
    const cat = (exam.exam_category || 'GENERAL').toUpperCase()
    if (!areaMap.has(cat)) { areaMap.set(cat, []); areaOrder.push(cat) }
    areaMap.get(cat).push(exam)
  }

  // ── Dibujar por ÁREA ────────────────────────────────────────────────────────
  for (const cat of areaOrder) {
    const exams        = areaMap.get(cat)
    const displayLabel = areaLabels[cat] || cat
    drawSectionRow(displayLabel)

    const isQuimicaArea = cat.includes('QUIMICA') || cat.includes('BIOQU')

    // ── Química sanguínea: recolectar todos los parámetros, ordenar y renderizar juntos ──
    if (isQuimicaArea) {
      const seen = new Set()
      const allResults = exams.flatMap(e => e.results).filter(r => {
        const key = pname(r).trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      const OK = ['Observ','Datos gin','Adecuac','Interpretac','Conclu']
      const normal = allResults
        .filter(r => !OK.some(k => pname(r).startsWith(k)))
        .sort((a, b) => quimicaIdx(a) - quimicaIdx(b))
      const obs = allResults.filter(r => OK.some(k => pname(r).startsWith(k)))
      normal.forEach((r,i) => {
        if (r.input_type === 'textarea') drawFreeText(dname(r), r.value)
        else drawRow(dname(r), r.value, r.unit||'',
          refDisplay(r,patSex), r.is_abnormal, r.abnormal_type, i%2===1)
      })
      obs.forEach(r => drawFreeText(dname(r), r.value))
      areaSeparator(doc, y, COL.result.x, PW - MR)
      y += 2
      continue
    }

    for (const exam of exams) {
      // Layout compacto en columnas (activado desde catálogo)
      if (exam.exam_print_columns) {
        if (exam.exam_name && exam.exam_show_subtitle !== 0) drawExamNameRow(exam.exam_name)
        renderMultiColumn(exam)
        continue
      }

      const isEGO   = cat.includes('ORINA')
      const isCopro = cat.includes('COPRO')

      if (isEGO) {
        if (exam.exam_name && exam.exam_show_subtitle !== 0) drawExamNameRow(exam.exam_name)
        const subCfg = parseSubConfig(exam)
        if (subCfg?.length) {
          renderWithSubtitleGroups(exam.results, subCfg)
        } else {
          // Sin config de catálogo: renderizado genérico sin subtítulos forzados
          exam.results.forEach((r, i) => {
            if (r.input_type === 'textarea') drawFreeText(dname(r), r.value)
            else drawRow(dname(r), r.value, r.unit||'',
              refDisplay(r, patSex), r.is_abnormal, r.abnormal_type, i%2===1)
          })
        }
      } else if (isCopro) {
        const examNameUp = (exam.exam_name || '').toUpperCase()
        const noSplit = examNameUp.includes('SANGRE OCULTA') || examNameUp.includes('PYLORI')
        const drawCoproResult = (r, i) => {
          if (r.input_type === 'textarea')
            drawFreeText(dname(r), r.value)
          else if (pname(r).startsWith('Obs'))
            drawFreeText(dname(r), r.value)
          else
            drawRow(dname(r), r.value, r.unit||'',
              refDisplay(r,patSex), r.is_abnormal, r.abnormal_type, i%2===1)
        }
        if (exam.exam_name && exam.exam_show_subtitle !== 0) drawExamNameRow(exam.exam_name)
        if (noSplit) {
          exam.results.forEach((r,i) => drawCoproResult(r, i))
        } else {
          const subCfg = parseSubConfig(exam)
          if (subCfg?.length) {
            renderWithSubtitleGroups(exam.results, subCfg)
          } else {
            const MK = ['Consistencia','Moco','Restos']
            const macro = exam.results.filter(r => MK.some(k => pname(r).startsWith(k)))
            const micro = exam.results.filter(r => !macro.includes(r))
            if (macro.length) {
              drawSubSubRow('Examen Macroscopico')
              macro.forEach((r,i) => drawCoproResult(r, i))
            }
            if (micro.length) {
              drawSubSubRow('Examen Microscopico')
              micro.forEach((r,i) => drawCoproResult(r, i))
            }
          }
        }
      } else {
        // Nombre del examen compacto (configurable desde catálogo)
        if (exam.exam_name && exam.exam_show_subtitle !== 0) drawExamNameRow(exam.exam_name)

        // Deduplicar por nombre de parámetro
        const seen = new Set()
        const dedupedResults = exam.results.filter(r => {
          const key = pname(r).trim().toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        const OK     = ['Observ','Datos gin','Adecuac','Interpretac','Conclu']
        const normal = dedupedResults.filter(r => !OK.some(k => pname(r).startsWith(k)))
        const obs    = dedupedResults.filter(r =>  OK.some(k => pname(r).startsWith(k)))
        // Renderiza un resultado respetando su input_type
        const drawResult = (r, i) => {
          if (r.input_type === 'textarea')
            drawFreeText(dname(r), r.value)
          else
            drawRow(dname(r), r.value, r.unit||'',
              refDisplay(r, patSex), r.is_abnormal, r.abnormal_type, i%2===1)
        }

        const subCfg = parseSubConfig(exam)
        if (subCfg?.length) {
          renderWithSubtitleGroups(normal, subCfg)
          obs.forEach((r, i) => drawResult(r, i))
        } else {
          normal.forEach((r, i) => drawResult(r, i))
          obs.forEach((r, i) => drawResult(r, i))
        }
      }
    }

    areaSeparator(doc, y, COL.result.x, PW - MR)
    y += 2
  }

  // ── Formularios en Blanco (sin cambios) ────────────────────────────────────
  for (const exam of blankForms) {
    const rowsResult    = exam.results.find(r => pname(r) === '__rows')
    let sections = []
    try {
      const parsed = JSON.parse(rowsResult?.value || '[]')
      if (Array.isArray(parsed) && parsed.length > 0) {
        sections = parsed[0]?.rows !== undefined
          ? parsed
          : [{ title:'', rows:parsed, obs: parsed.find(x=>x.obs)?.obs||'' }]
      }
    } catch {}
    const activeSections = sections.filter(s => (s.rows||[]).some(r => r.n || r.r))
    if (!activeSections.length) continue
    activeSections.forEach(sec => {
      if (sec.title?.trim()) drawExamNameRow(sec.title.trim())
      const activeRows = (sec.rows||[]).filter(r => r.n || r.r)
      activeRows.forEach((r,i) => {
        drawRow(r.n||'—', r.r||'', r.u||'', r.ref||'', false, null, i%2===1)
      })
      if (sec.obs?.trim()) drawFreeText('Observaciones', sec.obs.trim())
    })
  }

  // ── Firma — justo después de todos los resultados, centrada ─────────────────
  drawSignature()

  // Línea de corte — solo si hay más de 20mm de espacio vacío tras la firma
  if (showCutLine && (PH - y) > 20) {
    const cutY = y - 3
    doc.setDrawColor(185, 185, 185)
    doc.setLineWidth(0.1)
    const dl = 2.2, gl = 2.8
    for (let x = ML; x < PW - MR; x += dl + gl) {
      doc.line(x, cutY, Math.min(x + dl, PW - MR), cutY)
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  PIE EN TODAS LAS PÁGINAS
  // ═════════════════════════════════════════════════════════════════════════════
  const totalPages = doc.internal.getNumberOfPages()
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg)

    // Contador de página — junto al título, lateral derecho
    tf(doc, 7, 'normal', K.gray)
    doc.text(`P\xe1g. ${pg} / ${totalPages}`, PW - MR, headerTitleY, { align: 'right' })

  }

  return doc
}

// ── generateLabelsPDF ──────────────────────────────────────────────────────────
export async function generateLabelsPDF(orders) {
  const cfg     = await getCfg()
  const doc     = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4', compress: true })
  const PW      = 210
  const COLS=2, ROWS=7
  const LW=(PW-24)/COLS, LH=36, GX=6, GY=4, SX=8, SY=8
  const labName = cfg.lab_name || 'LabMend'
  const list    = Array.isArray(orders) ? orders : [orders]

  list.forEach((order,pos) => {
    const col = pos%COLS
    const row = Math.floor(pos/COLS)%ROWS
    if (pos>0 && pos%(COLS*ROWS)===0) doc.addPage()
    const x=SX+col*(LW+GX), y=SY+row*(LH+GY)
    doc.setFillColor(250,250,250)
    doc.roundedRect(x,y,LW,LH,2,2,'F')
    doc.setDrawColor(140,140,140); doc.setLineWidth(0.5)
    doc.roundedRect(x,y,LW,LH,2,2,'S')
    doc.setFillColor(20,20,20)
    doc.roundedRect(x,y,LW,7,2,2,'F')
    doc.rect(x,y+3,LW,4,'F')
    tf(doc,7,'bold',[255,255,255])
    doc.text(labName,x+LW/2,y+5.2,{align:'center',maxWidth:LW-4})
    tf(doc,8.5,'bold',[0,0,0])
    doc.text((order.patient_name||'').toUpperCase(),x+LW/2,y+13,{align:'center',maxWidth:LW-4})
    tf(doc,7,'normal',[110,110,110])
    doc.text(new Date(order.created_at).toLocaleDateString('es-ES'),x+LW/2,y+18,{align:'center'})
    const bc=barcodeDataUrl(order.order_number)
    if(bc) doc.addImage(bc,'PNG',x+3,y+20,LW-6,14)
  })
  return doc
}
