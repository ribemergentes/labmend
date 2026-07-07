import XLSXStyle from 'xlsx-js-style'

// ── Colores corporativos ──────────────────────────────────────────────────────
const C = {
  blue:       '1E40AF',  // azul oscuro título
  blueLight:  'DBEAFE',  // azul claro cabecera columnas
  blueMid:    '2563EB',  // azul medio
  white:      'FFFFFF',
  grayBg:     'F8FAFC',  // fondo filas alternas
  grayBorder: 'CBD5E1',  // borde general
  grayText:   '64748B',  // texto secundario
  dark:       '0F172A',  // texto principal
  red:        'DC2626',  // valor alto
  orange:     'D97706',  // valor bajo
  green:      '16A34A',  // valor normal
  greenBg:    'DCFCE7',
  redBg:      'FEE2E2',
  orangeBg:   'FEF3C7',
}

// ── Estilos base ──────────────────────────────────────────────────────────────
const S = {
  title: {
    font: { bold: true, sz: 16, color: { rgb: C.white } },
    fill: { fgColor: { rgb: C.blue } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  subtitle: {
    font: { sz: 10, color: { rgb: C.white }, italic: true },
    fill: { fgColor: { rgb: C.blue } },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  colHeader: {
    font: { bold: true, sz: 9, color: { rgb: C.blue } },
    fill: { fgColor: { rgb: C.blueLight } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top:    { style: 'medium', color: { rgb: C.blueMid } },
      bottom: { style: 'medium', color: { rgb: C.blueMid } },
      left:   { style: 'thin',   color: { rgb: C.grayBorder } },
      right:  { style: 'thin',   color: { rgb: C.grayBorder } },
    },
  },
  cell: (even) => ({
    font: { sz: 10, color: { rgb: C.dark } },
    fill: { fgColor: { rgb: even ? C.grayBg : C.white } },
    alignment: { vertical: 'center', wrapText: false },
    border: {
      top:    { style: 'thin', color: { rgb: C.grayBorder } },
      bottom: { style: 'thin', color: { rgb: C.grayBorder } },
      left:   { style: 'thin', color: { rgb: C.grayBorder } },
      right:  { style: 'thin', color: { rgb: C.grayBorder } },
    },
  }),
  cellCenter: (even) => ({
    ...S.cell(even),
    alignment: { horizontal: 'center', vertical: 'center' },
  }),
  cellBold: (even) => ({
    ...S.cell(even),
    font: { bold: true, sz: 10, color: { rgb: C.dark } },
  }),
  empty: {
    font: { sz: 10 },
    fill: { fgColor: { rgb: C.blue } },
  },
  infoLabel: {
    font: { bold: true, sz: 9, color: { rgb: C.grayText } },
    fill: { fgColor: { rgb: C.grayBg } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: C.grayBorder } },
      bottom: { style: 'thin', color: { rgb: C.grayBorder } },
    },
  },
  infoValue: {
    font: { sz: 9, color: { rgb: C.dark } },
    fill: { fgColor: { rgb: C.white } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: C.grayBorder } },
      bottom: { style: 'thin', color: { rgb: C.grayBorder } },
    },
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function colName(c) {
  let s = ''
  c++
  while (c > 0) { s = String.fromCharCode(65 + (c - 1) % 26) + s; c = Math.floor((c - 1) / 26) }
  return s
}

function setCell(ws, col, row, value, style) {
  const addr = `${colName(col)}${row}`
  ws[addr] = { v: value ?? '', t: typeof value === 'number' ? 'n' : 's', s: style }
}

function mergeRange(ws, c1, r1, c2, r2) {
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { c: c1, r: r1 - 1 }, e: { c: c2, r: r2 - 1 } })
}

function now() {
  return new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })
}

function buildHeader(ws, title, subtitle, totalCols, startRow = 1) {
  // Fila de título (azul oscuro)
  setCell(ws, 0, startRow, `  LabMend — ${title}`, S.title)
  for (let c = 1; c < totalCols; c++) setCell(ws, c, startRow, '', S.empty)
  mergeRange(ws, 0, startRow, totalCols - 1, startRow)

  // Fila de subtítulo
  setCell(ws, 0, startRow + 1, `  ${subtitle}`, S.subtitle)
  for (let c = 1; c < totalCols; c++) setCell(ws, c, startRow + 1, '', S.empty)
  mergeRange(ws, 0, startRow + 1, totalCols - 1, startRow + 1)

  return startRow + 2  // siguiente fila libre
}

function autoWidth(ws, data, cols) {
  ws['!cols'] = cols.map((col, i) => {
    const maxData = Math.max(...data.map(r => String(r[i] ?? '').length))
    const w = Math.min(Math.max(col.min || 10, maxData + 2, col.header.length + 2), col.max || 40)
    return { wch: w }
  })
}

// ═════════════════════════════════════════════════════════════════════════════
export const excelService = {

  // ── EXPORTAR PACIENTES ────────────────────────────────────────────────────
  exportPatients(patients, filename = `Pacientes_LabMend_${new Date().toISOString().slice(0,10)}.xlsx`) {
    const ws = {}
    const cols = [
      { header: 'Código',          min: 10, max: 14 },
      { header: 'Apellidos',       min: 14, max: 30 },
      { header: 'Nombres',         min: 14, max: 30 },
      { header: 'C.I./Pasaporte',  min: 14, max: 20 },
      { header: 'F. Nacimiento',   min: 13, max: 18 },
      { header: 'Sexo',            min: 10, max: 14 },
      { header: 'Teléfono',        min: 13, max: 18 },
      { header: 'WhatsApp',        min: 13, max: 18 },
      { header: 'Email',           min: 20, max: 38 },
      { header: 'Dirección',       min: 20, max: 40 },
    ]
    const totalCols = cols.length

    let row = buildHeader(ws,
      'Registro de Pacientes',
      `Exportado el ${now()} — ${patients.length} paciente(s)`,
      totalCols
    )

    // Cabecera de columnas
    cols.forEach((c, i) => setCell(ws, i, row, c.header, S.colHeader))
    row++

    // Datos
    const tableData = patients.map((p, idx) => {
      const even = idx % 2 === 0
      const age  = p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : ''
      const row_data = [
        p.code,
        p.last_name,
        p.first_name,
        p.id_number || '',
        p.birth_date ? new Date(p.birth_date).toLocaleDateString('es-ES') : '',
        p.sex === 'M' ? 'Masculino' : p.sex === 'F' ? 'Femenino' : '',
        p.phone || '',
        p.whatsapp || '',
        p.email || '',
        p.address || '',
      ]
      row_data.forEach((val, ci) => {
        const style = ci === 0 ? S.cellBold(even) : ci === 5 ? S.cellCenter(even) : S.cell(even)
        setCell(ws, ci, row + idx, val, style)
      })
      return row_data
    })

    // Rango total
    const lastRow = row + patients.length - 1
    ws['!ref'] = `A1:${colName(totalCols - 1)}${lastRow}`

    // Anchos
    autoWidth(ws, tableData, cols)

    // Altura filas
    ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }]
    for (let i = 2; i <= lastRow; i++) ws['!rows'].push({ hpt: i === row - 1 ? 22 : 18 })

    // Freeze después del header
    ws['!freeze'] = { xSplit: 0, ySplit: row - 1 }

    const wb = XLSXStyle.utils.book_new()
    XLSXStyle.utils.book_append_sheet(wb, ws, 'Pacientes')
    XLSXStyle.writeFile(wb, filename)
  },

  // ── EXPORTAR ÓRDENES ──────────────────────────────────────────────────────
  exportOrders(orders, filename = `Ordenes_LabMend_${new Date().toISOString().slice(0,10)}.xlsx`) {
    const ws = {}
    const cols = [
      { header: 'N° Orden',    min: 12, max: 18 },
      { header: 'Paciente',    min: 20, max: 36 },
      { header: 'Fecha',       min: 12, max: 16 },
      { header: 'Estado',      min: 12, max: 16 },
      { header: 'Prioridad',   min: 11, max: 15 },
      { header: 'Médico',      min: 16, max: 30 },
      { header: 'Total (Bs.)', min: 12, max: 14 },
    ]
    const totalCols = cols.length

    const STATUS_LABEL = {
      pendiente: 'Pendiente', en_proceso: 'En Proceso',
      completado: 'Completado', entregado: 'Entregado', cancelado: 'Cancelado',
    }

    let row = buildHeader(ws,
      'Registro de Órdenes',
      `Exportado el ${now()} — ${orders.length} orden(es)`,
      totalCols
    )

    cols.forEach((c, i) => setCell(ws, i, row, c.header, S.colHeader))
    row++

    const tableData = orders.map((o, idx) => {
      const even = idx % 2 === 0
      const row_data = [
        o.order_number,
        o.patient_name,
        new Date(o.created_at).toLocaleDateString('es-ES'),
        STATUS_LABEL[o.status] || o.status,
        o.priority === 'urgente' ? 'Urgente' : o.priority === 'emergencia' ? 'Emergencia' : 'Normal',
        o.doctor_name || '—',
        o.total_amount ?? 0,
      ]

      row_data.forEach((val, ci) => {
        let style
        if (ci === 0) style = S.cellBold(even)
        else if (ci === 6) style = { ...S.cellCenter(even), font: { bold: true, sz: 10, color: { rgb: C.blue } } }
        else if (ci === 2 || ci === 4) style = S.cellCenter(even)
        else style = S.cell(even)
        setCell(ws, ci, row + idx, val, style)
      })
      return row_data
    })

    const lastRow = row + orders.length - 1
    ws['!ref'] = `A1:${colName(totalCols - 1)}${lastRow}`
    autoWidth(ws, tableData, cols)
    ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }]
    for (let i = 2; i <= lastRow; i++) ws['!rows'].push({ hpt: i === row - 1 ? 22 : 18 })
    ws['!freeze'] = { xSplit: 0, ySplit: row - 1 }

    const wb = XLSXStyle.utils.book_new()
    XLSXStyle.utils.book_append_sheet(wb, ws, 'Órdenes')
    XLSXStyle.writeFile(wb, filename)
  },

  // ── EXPORTAR RESULTADOS ───────────────────────────────────────────────────
  exportResults(results, orderInfo, filename) {
    if (!filename) {
      const name = (orderInfo.patient_name || 'paciente').replace(/\s+/g, '_')
      filename = `Resultados_${name}_${orderInfo.order_number}.xlsx`
    }

    const ws = {}
    const cols = [
      { header: 'N° Orden',   min: 12, max: 16 },
      { header: 'Paciente',   min: 20, max: 36 },
      { header: 'Examen',     min: 18, max: 32 },
      { header: 'Parámetro',  min: 18, max: 32 },
      { header: 'Resultado',  min: 12, max: 16 },
      { header: 'Unidad',     min: 10, max: 14 },
      { header: 'Ref. Min',   min: 10, max: 14 },
      { header: 'Ref. Max',   min: 10, max: 14 },
      { header: 'Estado',     min: 11, max: 14 },
    ]
    const totalCols = cols.length

    // Info de la orden (bloque superior)
    let row = buildHeader(ws,
      'Resultados de Laboratorio',
      `Orden: ${orderInfo.order_number}  |  Paciente: ${orderInfo.patient_name}  |  ${now()}`,
      totalCols
    )

    cols.forEach((c, i) => setCell(ws, i, row, c.header, S.colHeader))
    row++

    const tableData = []
    for (const exam of results) {
      for (const [idx_r, r] of exam.results.entries()) {
        const isHigh = r.is_abnormal && r.abnormal_type === 'high'
        const isLow  = r.is_abnormal && r.abnormal_type === 'low'
        const even   = tableData.length % 2 === 0

        const statusLabel = r.is_abnormal ? (isHigh ? '▲ ALTO' : '▼ BAJO') : 'Normal'
        const statusStyle = {
          ...S.cellCenter(even),
          font: { bold: r.is_abnormal, sz: 10, color: { rgb: isHigh ? C.red : isLow ? C.orange : C.green } },
          fill: { fgColor: { rgb: isHigh ? C.redBg : isLow ? C.orangeBg : even ? C.grayBg : C.white } },
        }

        const row_data = [
          orderInfo.order_number,
          orderInfo.patient_name,
          exam.exam_name,
          r.param_name,
          r.value ?? '',
          r.unit || '',
          r.ref_min ?? '',
          r.ref_max ?? '',
          statusLabel,
        ]

        row_data.forEach((val, ci) => {
          let style
          if (ci === 8) style = statusStyle
          else if (ci === 0) style = S.cellBold(even)
          else if (ci >= 4) style = S.cellCenter(even)
          else style = S.cell(even)
          setCell(ws, ci, row + tableData.length, val, style)
        })

        tableData.push(row_data)
      }
    }

    const lastRow = row + tableData.length - 1
    ws['!ref'] = `A1:${colName(totalCols - 1)}${lastRow}`
    autoWidth(ws, tableData, cols)
    ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }]
    for (let i = 2; i <= lastRow; i++) ws['!rows'].push({ hpt: i === row - 1 ? 22 : 18 })
    ws['!freeze'] = { xSplit: 0, ySplit: row - 1 }

    const wb = XLSXStyle.utils.book_new()
    XLSXStyle.utils.book_append_sheet(wb, ws, 'Resultados')
    XLSXStyle.writeFile(wb, filename)
  },
}
