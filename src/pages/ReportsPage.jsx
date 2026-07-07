import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { generateResultsPDF } from '../services/pdfReports'
import { emailService, whatsappService } from '../services/notifications'
import { orderService } from '../services/orders'
import { PageHeader, Spinner } from '../components/ui/index'
import {
  Search, Printer, FileText, Mail, MessageCircle,
  Calendar, Hash, Stethoscope, Loader2, CheckCircle,
  AlertCircle, X, RefreshCw, ClipboardList, Clock,
  CheckSquare, TruckIcon, Ban, Filter, FlaskConical,
  BarChart2, ChevronDown, ChevronUp, BookOpen, Download
} from 'lucide-react'
import clsx from 'clsx'

// ── Configuración de estados ───────────────────────────────────────────────────
const STATUSES = [
  { key: 'all',        label: 'Todos',       icon: ClipboardList, color: 'slate'   },
  { key: 'pendiente',  label: 'Pendiente',   icon: Clock,         color: 'amber'   },
  { key: 'en_proceso', label: 'En Proceso',  icon: Loader2,       color: 'blue'    },
  { key: 'completado', label: 'Completado',  icon: CheckSquare,   color: 'emerald' },
  { key: 'entregado',  label: 'Entregado',   icon: TruckIcon,     color: 'violet'  },
  { key: 'cancelado',  label: 'Cancelado',   icon: Ban,           color: 'red'     },
]

const STATUS_CARD_STYLES = {
  slate:   { card: 'border-slate-200   dark:border-slate-700   bg-slate-50    dark:bg-slate-800/40',  num: 'text-slate-700   dark:text-slate-200',  icon: 'text-slate-400'   },
  amber:   { card: 'border-amber-200   dark:border-amber-800/50 bg-amber-50   dark:bg-amber-900/20',  num: 'text-amber-700   dark:text-amber-300',  icon: 'text-amber-400'   },
  blue:    { card: 'border-blue-200    dark:border-blue-800/50  bg-blue-50    dark:bg-blue-900/20',   num: 'text-blue-700    dark:text-blue-300',   icon: 'text-blue-400'    },
  emerald: { card: 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20', num: 'text-emerald-700 dark:text-emerald-300', icon: 'text-emerald-500' },
  violet:  { card: 'border-violet-200  dark:border-violet-800/50 bg-violet-50  dark:bg-violet-900/20',  num: 'text-violet-700  dark:text-violet-300',  icon: 'text-violet-500'  },
  red:     { card: 'border-red-200     dark:border-red-800/50   bg-red-50     dark:bg-red-900/20',    num: 'text-red-700     dark:text-red-300',    icon: 'text-red-400'     },
}

const STATUS_BADGE = {
  pendiente:  'bg-amber-100   text-amber-700   dark:bg-amber-900/30   dark:text-amber-300',
  en_proceso: 'bg-blue-100    text-blue-700    dark:bg-blue-900/30    dark:text-blue-300',
  completado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  entregado:  'bg-violet-100  text-violet-700  dark:bg-violet-900/30  dark:text-violet-300',
  cancelado:  'bg-red-100     text-red-700     dark:bg-red-900/30     dark:text-red-300',
}

const STATUS_BORDER = {
  pendiente:  'border-l-amber-400',
  en_proceso: 'border-l-blue-500',
  completado: 'border-l-emerald-500',
  entregado:  'border-l-violet-500',
  cancelado:  'border-l-red-400',
}

// Colores por área
const AREA_COLORS = {
  HEMATOLOGIA: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border-red-200 dark:border-red-800/40',
  HEMATOLOGÍA: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border-red-200 dark:border-red-800/40',
  QUIMICA:     'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800/40',
  ORINA:       'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/40',
  COPRO:       'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300 border-orange-200 dark:border-orange-800/40',
  SEROLOGIA:   'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border-purple-200 dark:border-purple-800/40',
  SEROLOGÍA:   'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border-purple-200 dark:border-purple-800/40',
  MICROBIOLOGIA: 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300 border-teal-200 dark:border-teal-800/40',
  MICROBIOLOGÍA: 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300 border-teal-200 dark:border-teal-800/40',
  HORMONAL:    'bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300 border-pink-200 dark:border-pink-800/40',
  CITOLOGIA:   'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40',
  CITOLOGÍA:   'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40',
}

function areaColor(cat = '') {
  const up = cat.toUpperCase()
  for (const [key, cls] of Object.entries(AREA_COLORS)) {
    if (up.includes(key)) return cls
  }
  return 'bg-slate-50 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300 border-slate-200 dark:border-slate-700'
}

// Agrupar exámenes por área
function groupByArea(exams = []) {
  const map = {}
  for (const e of exams) {
    const cat = (e.exam_category || 'GENERAL').toUpperCase()
    if (!map[cat]) map[cat] = []
    map[cat].push(e)
  }
  return Object.entries(map)
}

// ── Nombre de archivo PDF ─────────────────────────────────────────────────────
function pdfFileName(order) {
  const name = (order.patient_name || 'Paciente')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar tildes
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
  const d   = new Date(order.created_at || Date.now())
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  const num  = (order.order_number || '').replace(/[^A-Z0-9]/gi, '')
  return `${name}_${date}_${num}.pdf`
}

// ── Construir PDF ─────────────────────────────────────────────────────────────
async function buildPDF(orderId, { compress = false, forDoctor = false } = {}) {
  const fullOrder   = await orderService.getById(orderId)
  const examResults = []
  for (const oe of (fullOrder.exams || [])) {
    const results = await orderService.getExamResults(oe.id)
    if (results.length) examResults.push({
      exam_name: oe.exam_name, exam_category: oe.exam_category,
      exam_code: oe.exam_code,
      exam_show_subtitle:    oe.exam_show_subtitle    ?? 1,
      exam_subtitles_config: oe.exam_subtitles_config ?? null,
      results,
    })
  }
  if (!examResults.length) throw new Error('Esta orden no tiene resultados ingresados aún.')
  const doc = await generateResultsPDF(fullOrder, examResults, fullOrder.patient_birth_date, fullOrder.patient_sex, { compress, forDoctor })
  return { doc, order: fullOrder }
}

// ── Chip feedback ─────────────────────────────────────────────────────────────
function Chip({ state }) {
  if (state === 'idle') return null
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
      state === 'loading' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      state === 'ok'      && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      state === 'err'     && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    )}>
      {state === 'loading' && <Loader2 size={9} className="animate-spin"/>}
      {state === 'ok'      && <CheckCircle size={9}/>}
      {state === 'err'     && <AlertCircle size={9}/>}
      {state === 'loading' ? 'Procesando...' : state === 'ok' ? 'Listo' : 'Error'}
    </span>
  )
}

// ── Tarjeta de orden ──────────────────────────────────────────────────────────
function OrderCard({ order, addNotification }) {
  const [printSt, setPrintSt] = useState('idle')
  const [saveSt,  setSaveSt]  = useState('idle')
  const [emailSt, setEmailSt] = useState('idle')
  const [waSt,    setWaSt]    = useState('idle')
  const [expanded, setExpanded] = useState(false)
  const [pageCount, setPageCount] = useState(null)   // null=sin cargar, -1=error, N=páginas
  const [pcLoading, setPcLoading] = useState(false)
  const pcFetched = useRef(false)
  const busy = printSt === 'loading' || saveSt === 'loading' || emailSt === 'loading' || waSt === 'loading'

  const reset = setter => setTimeout(() => setter('idle'), 4000)

  // Carga silenciosa de páginas cuando se expande
  useEffect(() => {
    if (!expanded || pcFetched.current) return
    pcFetched.current = true
    setPcLoading(true)
    buildPDF(order.id)
      .then(({ doc }) => setPageCount(doc.internal.getNumberOfPages()))
      .catch(() => setPageCount(-1))
      .finally(() => setPcLoading(false))
  }, [expanded])

  async function handlePrint() {
    setPrintSt('loading')
    try {
      const { doc, order: full } = await buildPDF(order.id)
      const fname = pdfFileName(full)
      doc.setProperties({ title: fname })
      const file = new File([doc.output('blob')], fname, { type: 'application/pdf' })
      const url  = URL.createObjectURL(file)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setPrintSt('ok'); addNotification('PDF abierto para imprimir', 'success')
    } catch(e) { setPrintSt('err'); addNotification(e.message, 'error') }
    reset(setPrintSt)
  }

  async function handleSave() {
    setSaveSt('loading')
    try {
      const { doc, order: full } = await buildPDF(order.id, { compress: true, forDoctor: true })
      const fname = pdfFileName(full)
      doc.setProperties({ title: fname })
      if (window.electron?.pdf?.save) {
        const b64 = doc.output('datauristring').split(',')[1]
        const res = await window.electron.pdf.save({ base64: b64, defaultName: fname })
        if (res?.canceled) { setSaveSt(null); return }
        if (res?.error) throw new Error(res.error)
      } else {
        doc.save(fname)
      }
      setSaveSt('ok'); addNotification('PDF guardado: ' + fname, 'success')
    } catch(e) { setSaveSt('err'); addNotification(e.message, 'error') }
    reset(setSaveSt)
  }

  async function handleEmail() {
    setEmailSt('loading')
    try {
      const { doc, order: full } = await buildPDF(order.id)
      const r = await emailService.send(full, doc)
      setEmailSt('ok'); addNotification(`✅ Correo enviado a ${r.sentTo}`, 'success')
    } catch(e) { setEmailSt('err'); addNotification(e.message, 'error') }
    reset(setEmailSt)
  }

  async function handleWA() {
    setWaSt('loading')
    try {
      const { doc, order: full } = await buildPDF(order.id)
      await whatsappService.send(full, doc)
      setWaSt('ok'); addNotification('✅ PDF descargado · WhatsApp abierto', 'success')
    } catch(e) { setWaSt('err'); addNotification(e.message, 'error') }
    reset(setWaSt)
  }

  const dateObj   = new Date(order.created_at)
  const dateStr   = dateObj.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })
  const timeStr   = dateObj.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
  const areas     = groupByArea(order.exams)
  const examCnt   = order.exams?.length || 0

  const borderColor = STATUS_BORDER[order.status] || 'border-l-slate-300'

  return (
    <div className={clsx(
      'border-b border-slate-100 dark:border-slate-800/80 last:border-0',
      'border-l-4 transition-colors',
      'hover:bg-slate-50/70 dark:hover:bg-slate-800/25',
      borderColor,
    )}>
      <div className="px-5 py-3 space-y-2.5">

        {/* Fila superior: nombre + estado + orden + botones */}
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100 leading-tight truncate min-w-0 flex-1">
            {order.patient_name}
          </p>
          <span className={clsx('shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full',
            STATUS_BADGE[order.status] || 'bg-slate-100 text-slate-500'
          )}>
            {STATUSES.find(s => s.key === order.status)?.label || order.status}
          </span>
          <span className="shrink-0 font-mono text-xs font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
            #{order.order_number}
          </span>

          {/* Botones de acción — fila horizontal superior */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button onClick={handleSave} disabled={busy} title="Guardar PDF"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                         bg-slate-600 hover:bg-slate-700 text-white disabled:opacity-40 transition-colors shadow-sm">
              {saveSt === 'loading' ? <Loader2 size={11} className="animate-spin"/> : <Download size={11}/>}
              Guardar
            </button>
            <button onClick={handlePrint} disabled={busy} title="Imprimir PDF"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                         bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors shadow-sm">
              {printSt === 'loading' ? <Loader2 size={11} className="animate-spin"/> : <Printer size={11}/>}
              PDF
            </button>
            <button onClick={handleEmail} disabled={busy} title="Enviar por correo"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                         bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-40 transition-colors shadow-sm">
              {emailSt === 'loading' ? <Loader2 size={11} className="animate-spin"/> : <Mail size={11}/>}
              Email
            </button>
            <button onClick={handleWA} disabled={busy} title="Enviar por WhatsApp"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                         bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40 transition-colors shadow-sm">
              {waSt === 'loading' ? <Loader2 size={11} className="animate-spin"/> : <MessageCircle size={11}/>}
              WA
            </button>
          </div>
        </div>

        {/* Metadatos */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <Calendar size={11} className="text-slate-300 dark:text-slate-600"/>
            {dateStr} · {timeStr}
          </span>
          {order.doctor_name && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              <Stethoscope size={11} className="text-slate-300 dark:text-slate-600"/>
              {order.doctor_name}
            </span>
          )}
          {examCnt > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              <FlaskConical size={11} className="text-slate-300 dark:text-slate-600"/>
              {examCnt} examen{examCnt !== 1 ? 'es' : ''}
            </span>
          )}
          {/* Chips de feedback inline */}
          <Chip state={saveSt}/>
          <Chip state={printSt}/>
          <Chip state={emailSt}/>
          <Chip state={waSt}/>
        </div>

        {/* Chips de áreas */}
        {areas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {areas.map(([cat, exs]) => (
              <span key={cat}
                className={clsx('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border', areaColor(cat))}>
                {cat}
                <span className="font-bold text-[10px] opacity-60 bg-black/5 dark:bg-white/10 px-1 rounded">
                  {exs.length}
                </span>
              </span>
            ))}
            {examCnt > 0 && (
              <button onClick={() => setExpanded(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors font-medium">
                {expanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                {expanded ? 'Ocultar' : 'Ver exámenes'}
              </button>
            )}
            {pcLoading && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                <Loader2 size={9} className="animate-spin"/> calculando...
              </span>
            )}
            {pageCount !== null && pageCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <BookOpen size={9}/>
                {pageCount} pág{pageCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        {/* Lista expandida de exámenes */}
        {expanded && (
          <div className="flex flex-wrap gap-1.5">
            {(order.exams || []).map((e, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {e.exam_name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Accesos rápidos de fecha ──────────────────────────────────────────────────
function todayStr()     { return new Date().toISOString().slice(0,10) }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10) }
function weekStartStr() { const d = new Date(); d.setDate(d.getDate()-6); return d.toISOString().slice(0,10) }
function monthStartStr(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }

// ═════════════════════════════════════════════════════════════════════════════
export default function ReportsPage() {
  const addNotification = useAppStore(s => s.addNotification)
  const _refreshKey     = useAppStore(s => s._refreshKey)

  const [allOrders, setAllOrders]   = useState([])
  const [loading,   setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search,    setSearch]    = useState('')
  const [statusTab, setStatusTab] = useState('all')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [quickDate, setQuickDate] = useState('')   // 'hoy'|'ayer'|'semana'|'mes'|''

  useEffect(() => { load() }, [_refreshKey])

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const data = await orderService.getAll({})
      setAllOrders(data)
    } catch { addNotification('Error al cargar órdenes', 'error') }
    setLoading(false); setRefreshing(false)
  }

  function applyQuick(key) {
    setQuickDate(key)
    if (key === 'hoy')    { setDateFrom(todayStr());     setDateTo(todayStr()) }
    if (key === 'ayer')   { setDateFrom(yesterdayStr()); setDateTo(yesterdayStr()) }
    if (key === 'semana') { setDateFrom(weekStartStr());  setDateTo(todayStr()) }
    if (key === 'mes')    { setDateFrom(monthStartStr()); setDateTo(todayStr()) }
    if (key === '')       { setDateFrom(''); setDateTo('') }
  }

  const counts = useMemo(() => {
    const c = { all: allOrders.length }
    for (const s of STATUSES.filter(s => s.key !== 'all'))
      c[s.key] = allOrders.filter(o => o.status === s.key).length
    return c
  }, [allOrders])

  const filtered = useMemo(() => {
    let list = [...allOrders]
    if (statusTab !== 'all')
      list = list.filter(o => o.status === statusTab)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(o =>
        o.patient_name?.toLowerCase().includes(q) ||
        o.order_number?.toLowerCase().includes(q) ||
        o.patient_code?.toLowerCase().includes(q)
      )
    }
    if (dateFrom) list = list.filter(o => o.created_at?.slice(0,10) >= dateFrom)
    if (dateTo)   list = list.filter(o => o.created_at?.slice(0,10) <= dateTo)
    return list
  }, [allOrders, statusTab, search, dateFrom, dateTo])

  // Estadísticas del conjunto filtrado
  const stats = useMemo(() => {
    const totalExams = filtered.reduce((acc, o) => acc + (o.exams?.length || 0), 0)
    const areaCounts = {}
    for (const o of filtered)
      for (const e of (o.exams || []))
        areaCounts[(e.exam_category||'GENERAL').toUpperCase()] = (areaCounts[(e.exam_category||'GENERAL').toUpperCase()]||0) + 1
    return { totalExams, areaCounts }
  }, [filtered])

  function clearFilters() {
    setSearch(''); setStatusTab('all'); setDateFrom(''); setDateTo(''); setQuickDate('')
  }

  const hasActiveFilters = search || statusTab !== 'all' || dateFrom || dateTo

  const grouped = useMemo(() => {
    const groups = {}
    for (const o of filtered) {
      const day = o.created_at?.slice(0,10) || 'Sin fecha'
      if (!groups[day]) groups[day] = []
      groups[day].push(o)
    }
    return Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0]))
  }, [filtered])

  function fmtDay(dateStr) {
    if (dateStr === 'Sin fecha') return dateStr
    const d   = new Date(dateStr + 'T12:00:00')
    const hoy = new Date()
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1)
    if (d.toDateString() === hoy.toDateString())  return 'Hoy'
    if (d.toDateString() === ayer.toDateString()) return 'Ayer'
    return d.toLocaleDateString('es-ES', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
  }

  const QUICK_DATES = [
    { key: 'hoy',    label: 'Hoy' },
    { key: 'ayer',   label: 'Ayer' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes',    label: 'Mes' },
  ]

  return (
    <div>
      <PageHeader
        title="Impresión de Reportes"
        subtitle="Gestiona y envía los resultados de laboratorio"
      />

      <div className="max-w-4xl space-y-4">

        {/* ── Tabs de estado (pill-style horizontal) ── */}
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {STATUSES.map(s => {
            const st   = STATUS_CARD_STYLES[s.color]
            const Icon = s.icon
            const active = statusTab === s.key
            return (
              <button key={s.key}
                onClick={() => setStatusTab(s.key)}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold transition-all',
                  'hover:shadow-sm active:scale-[0.98]',
                  active
                    ? 'border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-200/60 dark:shadow-indigo-900/40'
                    : clsx(st.card, 'hover:border-slate-300 dark:hover:border-slate-600')
                )}>
                <Icon size={13} className={active ? 'text-white/90' : st.icon}/>
                <span className={active ? 'text-white' : 'text-slate-600 dark:text-slate-300'}>
                  {s.label}
                </span>
                <span className={clsx(
                  'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold',
                  active
                    ? 'bg-white/20 text-white'
                    : clsx(st.num, 'bg-black/5 dark:bg-white/10')
                )}>
                  {loading ? '·' : (counts[s.key] ?? 0)}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Barra de búsqueda + filtros integrados ── */}
        <div className="card p-3 space-y-3">
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            {/* Input de búsqueda */}
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
              <input
                className="input-field pl-9 pr-9 text-sm w-full"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, N° orden o CI..."
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={13}/>
                </button>
              )}
            </div>

            {/* Pills de fecha rápida siempre visibles */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUICK_DATES.map(q => (
                <button key={q.key} type="button"
                  onClick={() => applyQuick(quickDate === q.key ? '' : q.key)}
                  className={clsx('px-3 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap',
                    quickDate === q.key
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400')}>
                  {q.label}
                </button>
              ))}
            </div>

            {/* Botón fechas manuales */}
            <button type="button"
              onClick={() => setShowFilters(v => !v)}
              className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors shrink-0',
                showFilters || (dateFrom && !quickDate) || (dateTo && !quickDate)
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300')}>
              <Calendar size={13}/>
              Rango
              {(dateFrom || dateTo) && !quickDate && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"/>}
            </button>

            {/* Refresh */}
            <button type="button" onClick={() => load(true)} disabled={loading || refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200
                         dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400
                         hover:border-slate-300 disabled:opacity-40 transition-colors shrink-0"
              title="Recargar">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''}/>
            </button>
          </div>

          {/* Rango manual de fechas (colapsable) */}
          {showFilters && (
            <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 shrink-0">Desde</label>
                <input type="date" value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setQuickDate('') }}
                  className="input-field text-sm py-1.5 w-40"/>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 shrink-0">Hasta</label>
                <input type="date" value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setQuickDate('') }}
                  className="input-field text-sm py-1.5 w-40"/>
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={() => applyQuick('')}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-semibold transition-colors">
                  <X size={11}/> Limpiar fechas
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Barra de resumen cuando hay filtros activos ── */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5
                          bg-indigo-50 dark:bg-indigo-900/20
                          border border-indigo-200/60 dark:border-indigo-800/40
                          rounded-xl text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-300">
                <BarChart2 size={13}/>
                <span className="font-extrabold text-indigo-900 dark:text-indigo-200">{filtered.length}</span>
                orden{filtered.length !== 1 ? 'es' : ''}
              </span>
              {stats.totalExams > 0 && (
                <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <FlaskConical size={12}/>
                  <span className="font-bold">{stats.totalExams}</span> examen{stats.totalExams !== 1 ? 'es' : ''}
                </span>
              )}
              {Object.entries(stats.areaCounts).slice(0,4).map(([area, cnt]) => (
                <span key={area} className={clsx('px-2 py-0.5 rounded-md text-[10px] font-semibold border', areaColor(area))}>
                  {area}
                  <span className="ml-1 opacity-70">({cnt})</span>
                </span>
              ))}
            </div>
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 dark:hover:text-indigo-300
                         font-semibold shrink-0 transition-colors">
              <X size={11}/> Limpiar
            </button>
          </div>
        )}

        {/* ── Lista de órdenes ── */}
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={28}/></div>
        ) : grouped.length === 0 ? (
          <div className="card p-14 text-center">
            <FileText size={44} className="mx-auto text-slate-200 dark:text-slate-700 mb-3"/>
            <p className="text-slate-500 font-semibold text-sm">
              {hasActiveFilters ? 'Sin resultados para este filtro' : 'No hay órdenes registradas'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, orders]) => (
              <div key={day} className="card overflow-hidden">

                {/* Cabecera de grupo de fecha */}
                <div className="px-5 py-3 flex items-center justify-between
                                bg-gradient-to-r from-slate-50 to-slate-50/60
                                dark:from-slate-800/70 dark:to-slate-800/40
                                border-b border-slate-200/70 dark:border-slate-700/50">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
                      <Calendar size={13} className="text-indigo-600 dark:text-indigo-400"/>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 capitalize">
                        {fmtDay(day)}
                      </span>
                      {day !== 'Sin fecha' && fmtDay(day) !== 'Hoy' && fmtDay(day) !== 'Ayer' && (
                        <span className="ml-2 text-[11px] text-slate-400">
                          {new Date(day + 'T12:00:00').toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {orders.reduce((a,o) => a+(o.exams?.length||0),0)} exám.
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full
                                     bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {orders.length} orden{orders.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                </div>

                {/* Órdenes del día */}
                <div>
                  {orders.map(o => (
                    <OrderCard key={o.id} order={o} addNotification={addNotification}/>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
