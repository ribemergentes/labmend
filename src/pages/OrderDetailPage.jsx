import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { orderService } from '../services/orders'
import { sqlDate } from '../services/database'
import { useAppStore } from '../store/appStore'
import { hasPermission } from '../services/auth'
import { generateResultsPDF, generateLabelsPDF } from '../services/pdfReports'
import { emailService, whatsappService } from '../services/notifications'
import { patientService } from '../services/patients'
import { StatusBadge, PriorityBadge, Spinner } from '../components/ui/index'
import {
  ChevronLeft, Printer, Tag, Edit2, Mail, MessageCircle, ClipboardList,
  Loader2, CheckCircle, AlertCircle, User, FileText,
  Clock, Paperclip, Send, Info, Download
} from 'lucide-react'
import clsx from 'clsx'

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS_OPT = [
  { v:'pendiente',  l:'Pendiente',  dot:'bg-amber-400'   },
  { v:'en_proceso', l:'En Proceso', dot:'bg-blue-500'    },
  { v:'completado', l:'Completado', dot:'bg-emerald-500' },
  { v:'entregado',  l:'Entregado',  dot:'bg-violet-500'  },
  { v:'cancelado',  l:'Cancelado',  dot:'bg-red-500'     },
]

// ── Hook: construir PDF ───────────────────────────────────────────────────────
function usePDF(orderId) {
  const [busy, setBusy] = useState(false)

  const build = useCallback(async ({ compress = false, forDoctor = false } = {}) => {
    setBusy(true)
    try {
      const full = await orderService.getById(orderId)
      const age  = patientService.getAge(full.patient_birth_date)
      const list = []
      for (const oe of (full.exams || [])) {
        const res = await orderService.getExamResults(oe.id)
        if (res.length) list.push({ exam_name: oe.exam_name, exam_category: oe.exam_category, exam_code: oe.exam_code, exam_show_subtitle: oe.exam_show_subtitle ?? 1, exam_subtitles_config: oe.exam_subtitles_config ?? null, exam_print_columns: oe.exam_print_columns ?? 0, results: res })
      }
      if (!list.length) throw new Error('Esta orden aún no tiene resultados ingresados.')
      const doc = await generateResultsPDF(full, list, full.patient_birth_date, full.patient_sex, { compress, forDoctor })
      return { doc, order: full }
    } finally { setBusy(false) }
  }, [orderId])

  return { build, busy }
}

// ── Chip de estado del envío ──────────────────────────────────────────────────
function SendState({ state, okMsg }) {
  if (state === 'idle') return null
  return (
    <div className={clsx(
      'flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all animate-fade-in',
      state === 'loading' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      state === 'ok'      && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      state === 'err'     && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    )}>
      {state === 'loading' && <Loader2 size={10} className="animate-spin"/>}
      {state === 'ok'      && <CheckCircle size={10}/>}
      {state === 'err'     && <AlertCircle size={10}/>}
      {state === 'loading' ? 'Procesando...' : state === 'ok' ? okMsg : 'Error'}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
export default function OrderDetailPage() {
  const { id }                     = useParams()
  const navigate                   = useNavigate()
  const { user, addNotification, _refreshKey }  = useAppStore()
  const { build, busy }            = usePDF(id)

  const [order,   setOrder]   = useState(null)
  const [loading, setLoading] = useState(true)

  // Estados de envío individuales
  const [printState, setPrintState] = useState('idle')
  const [saveState,  setSaveState]  = useState('idle')
  const [emailState, setEmailState] = useState('idle')  // idle|loading|ok|err
  const [waState,    setWaState]    = useState('idle')
  const [emailErr,   setEmailErr]   = useState('')
  const [waErr,      setWaErr]      = useState('')

  useEffect(() => { load() }, [id, _refreshKey])
  async function load() {
    try {
      const o = await orderService.getById(id)
      setOrder(o)
    } catch(e) {
      console.error('Error cargando orden:', e)
    } finally {
      setLoading(false)
    }
  }

  // ── Helpers de estado ─────────────────────────────────────────────────────
  function resetAfter(setter, ms = 4000) {
    setTimeout(() => setter('idle'), ms)
  }

  // ── Nombre de archivo ─────────────────────────────────────────────────────
  function pdfFileName() {
    if (!order) return 'resultado.pdf'
    const name = (order.patient_name || 'Paciente')
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
    const d    = new Date(order.created_at || Date.now())
    const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
    const num  = (order.order_number || '').replace(/[^A-Z0-9]/gi, '')
    return `${name}_${date}_${num}.pdf`
  }

  // ── Imprimir PDF ──────────────────────────────────────────────────────────
  async function handlePrint() {
    setPrintState('loading')
    try {
      const { doc } = await build()
      const fname = pdfFileName()
      doc.setProperties({ title: fname })
      const file = new File([doc.output('blob')], fname, { type: 'application/pdf' })
      const url = URL.createObjectURL(file)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      setPrintState('ok')
      addNotification('PDF abierto para imprimir', 'success')
      resetAfter(setPrintState)
    } catch(e) {
      setPrintState('err')
      addNotification('Error PDF: ' + e.message, 'error')
      resetAfter(setPrintState, 5000)
    }
  }

  // ── Guardar PDF (sin abrir visor) ─────────────────────────────────────────
  async function handleSave() {
    setSaveState('loading')
    try {
      const { doc } = await build({ compress: true, forDoctor: true })
      const fname = pdfFileName()
      doc.setProperties({ title: fname })
      if (window.electron?.pdf?.save) {
        const b64 = doc.output('datauristring').split(',')[1]
        const res = await window.electron.pdf.save({ base64: b64, defaultName: fname })
        if (res?.canceled) { setSaveState(null); return }
        if (res?.error) throw new Error(res.error)
      } else {
        doc.save(fname)
      }
      setSaveState('ok')
      addNotification('PDF guardado: ' + fname, 'success')
      resetAfter(setSaveState)
    } catch(e) {
      setSaveState('err')
      addNotification('Error PDF: ' + e.message, 'error')
      resetAfter(setSaveState, 5000)
    }
  }

  // ── Etiqueta ──────────────────────────────────────────────────────────────
  async function handleLabel() {
    try {
      const doc  = await generateLabelsPDF(order)
      const blob = doc.output('blob')
      const url  = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      addNotification('Etiqueta generada', 'success')
    } catch(e) { addNotification('Error etiqueta: ' + e.message, 'error') }
  }

  // ── Enviar por Email ──────────────────────────────────────────────────────
  async function handleEmail() {
    setEmailState('loading'); setEmailErr('')
    try {
      const { doc, order: full } = await build()
      const r = await emailService.send(full, doc)
      setEmailState('ok')
      addNotification(`✅ Correo enviado a ${r.sentTo}`, 'success')
      resetAfter(setEmailState, 5000)
    } catch(e) {
      setEmailState('err'); setEmailErr(e.message)
      addNotification(e.message, 'error')
      resetAfter(setEmailState, 6000)
    }
  }

  // ── Enviar por WhatsApp ───────────────────────────────────────────────────
  async function handleWhatsApp() {
    setWaState('loading'); setWaErr('')
    try {
      const { doc, order: full } = await build()
      const r = await whatsappService.send(full, doc)
      setWaState('ok')
      addNotification('✅ PDF descargado · WhatsApp abierto', 'success')
      resetAfter(setWaState, 6000)
    } catch(e) {
      setWaState('err'); setWaErr(e.message)
      addNotification(e.message, 'error')
      resetAfter(setWaState, 6000)
    }
  }

  async function updateStatus(status) {
    await orderService.updateStatus(id, status)
    addNotification('Estado actualizado', 'success')
    load()
  }

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size={28}/></div>
  if (!order)  return <div className="text-center py-20 text-slate-400">Orden no encontrada</div>

  const patEmail = order.patient_email || order.email || ''
  const patPhone = order.patient_whatsapp || order.patient_phone || order.whatsapp || order.phone || ''
  const isBusy   = busy || printState === 'loading' || saveState === 'loading' || emailState === 'loading' || waState === 'loading'

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-secondary" onClick={() => navigate('/orders')}>
          <ChevronLeft size={15}/>Volver
        </button>

        <div className="flex-1"/>

        {/* Ingresar Resultados */}
        {hasPermission(user,'results.enter') && (
          <button className="btn-primary" onClick={()=>navigate(`/results/order/${id}`)} disabled={isBusy}>
            <ClipboardList size={14}/>Ingresar Resultados
          </button>
        )}

        {/* Etiqueta */}
        <button className="btn-secondary" onClick={handleLabel} disabled={isBusy}>
          <Tag size={14}/>Etiqueta
        </button>

        {/* Guardar PDF */}
        <button
          onClick={handleSave} disabled={isBusy}
          className={clsx('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all',
            saveState === 'ok'  ? 'bg-emerald-600 text-white border-emerald-600' :
            saveState === 'err' ? 'bg-red-600 text-white border-red-600' :
            'bg-slate-600 text-white border-slate-600 hover:bg-slate-700 shadow-sm dark:bg-slate-700 dark:border-slate-600'
          )}>
          {saveState === 'loading' ? <Loader2 size={14} className="animate-spin"/> :
           saveState === 'ok'  ? <CheckCircle size={14}/> :
           saveState === 'err' ? <AlertCircle size={14}/> : <Download size={14}/>}
          {saveState === 'loading' ? 'Guardando...' :
           saveState === 'ok'  ? 'Guardado' :
           saveState === 'err' ? 'Error' : 'Guardar PDF'}
        </button>

        {/* Imprimir */}
        <button
          onClick={handlePrint} disabled={isBusy}
          className={clsx('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all',
            printState === 'ok'  ? 'bg-emerald-600 text-white border-emerald-600' :
            printState === 'err' ? 'bg-red-600 text-white border-red-600' :
            'bg-slate-800 text-white border-slate-800 hover:bg-slate-700 shadow-sm dark:bg-slate-700 dark:border-slate-600'
          )}>
          {printState === 'loading' || busy ? <Loader2 size={14} className="animate-spin"/> :
           printState === 'ok'  ? <CheckCircle size={14}/> :
           printState === 'err' ? <AlertCircle size={14}/> : <Printer size={14}/>}
          {printState === 'loading' || busy ? 'Generando...' :
           printState === 'ok'  ? 'Listo' :
           printState === 'err' ? 'Error' : 'Imprimir PDF'}
        </button>
      </div>

      {/* ── Grid principal ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-5">

        {/* ── Columna izquierda (2/3) ─────────────────────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Cabecera orden */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-xs font-mono text-slate-400 tracking-widest mb-1">{order.order_number}</p>
                <h2
                  className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title="Ver ficha e historial del paciente"
                  onClick={()=>order.patient_id && navigate(`/patients/${order.patient_id}`)}>
                  {order.patient_name}
                </h2>
                <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                  <Clock size={12}/>
                  {sqlDate(order.created_at)?.toLocaleDateString('es-ES',
                    { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <PriorityBadge priority={order.priority}/>
                <StatusBadge status={order.status}/>
              </div>
            </div>
            {/* Cambio de estado */}
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cambiar estado</p>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPT.map(s => (
                <button key={s.v} onClick={() => updateStatus(s.v)}
                  className={clsx(
                    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-bold border transition-all',
                    order.status === s.v
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600'
                  )}>
                  <span className={clsx('w-1.5 h-1.5 rounded-full', s.dot)}/>
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          {/* Lista exámenes */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-700/60 flex justify-between items-center">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">
                Exámenes ({(order.exams||[]).length})
              </h3>
              <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                Bs {(order.total_amount||0).toFixed(2)}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(order.exams||[]).map(oe => (
                <div key={oe.id}
                  className="flex items-center justify-between px-5 py-3.5 group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={clsx('w-2 h-2 rounded-full flex-shrink-0',
                      oe.status==='completado'?'bg-emerald-500':oe.status==='en_proceso'?'bg-blue-500':'bg-amber-400')}/>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{oe.exam_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{oe.exam_category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-all">
                    <StatusBadge status={oe.status}/>
                    {hasPermission(user,'results.enter') && (
                      <button className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => navigate(`/results/${oe.id}`)}>
                        <Edit2 size={11}/>Resultados
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Columna derecha (1/3) ───────────────────────────────────────── */}
        <div className="space-y-4">

          {/* ── BLOQUE EMAIL ───────────────────────────────────────────────── */}
          <div className={clsx('card p-5 transition-all duration-300',
            emailState==='ok'  && 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-slate-900',
            emailState==='err' && 'ring-2 ring-red-400 ring-offset-2 dark:ring-offset-slate-900',
          )}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center',
                  patEmail ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-slate-100 dark:bg-slate-700')}>
                  <Mail size={15} className={patEmail ? 'text-blue-600' : 'text-slate-400'}/>
                </div>
                <p className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">Correo Electrónico</p>
              </div>
              <SendState state={emailState} okMsg="¡Enviado!"/>
            </div>

            {patEmail ? (
              <>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-3 break-all bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                  📧 {patEmail}
                </p>
                <button onClick={handleEmail} disabled={isBusy}
                  className={clsx(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200',
                    emailState==='ok'      ? 'bg-emerald-600 text-white cursor-default' :
                    emailState==='err'     ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700' :
                    emailState==='loading' ? 'bg-blue-500 text-white cursor-not-allowed opacity-80' :
                    'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm shadow-blue-600/20'
                  )}>
                  {emailState==='loading'
                    ? <><Loader2 size={15} className="animate-spin"/>Generando y enviando...</>
                    : emailState==='ok'
                    ? <><CheckCircle size={15}/>Correo enviado con PDF ✓</>
                    : emailState==='err'
                    ? <><AlertCircle size={15}/>Reintentar envío</>
                    : <><Send size={15}/>Enviar PDF por Email</>
                  }
                </button>
                {emailState==='err' && emailErr && (
                  <p className="text-[11px] text-red-500 mt-2 leading-snug">{emailErr}</p>
                )}
                {emailState==='ok' && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 text-center mt-2 font-medium">
                    PDF adjuntado y enviado automáticamente ✅
                  </p>
                )}
              </>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-slate-400 mb-3">Sin correo registrado</p>
                <button onClick={() => navigate(`/patients/${order.patient_id}/edit`)}
                  className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">
                  + Agregar correo al paciente
                </button>
              </div>
            )}
          </div>

          {/* ── BLOQUE WHATSAPP ─────────────────────────────────────────────── */}
          <div className={clsx('card p-5 transition-all duration-300',
            waState==='ok'  && 'ring-2 ring-emerald-400 ring-offset-2 dark:ring-offset-slate-900',
            waState==='err' && 'ring-2 ring-red-400 ring-offset-2 dark:ring-offset-slate-900',
          )}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center',
                  patPhone ? 'bg-[#d1fae5] dark:bg-green-900/30' : 'bg-slate-100 dark:bg-slate-700')}>
                  <MessageCircle size={15} className={patPhone ? 'text-[#16a34a]' : 'text-slate-400'}/>
                </div>
                <p className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">WhatsApp</p>
              </div>
              <SendState state={waState} okMsg="¡Abierto!"/>
            </div>

            {patPhone ? (
              <>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                  📱 {patPhone}
                </p>
                <button onClick={handleWhatsApp} disabled={isBusy}
                  className={clsx(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200',
                    waState==='ok'      ? 'bg-emerald-600 text-white cursor-default' :
                    waState==='err'     ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700' :
                    waState==='loading' ? 'bg-[#25D366] text-white cursor-not-allowed opacity-80' :
                    'bg-[#25D366] hover:bg-[#20bf5d] active:bg-[#1aaa51] text-white shadow-sm shadow-green-600/25'
                  )}>
                  {waState==='loading'
                    ? <><Loader2 size={15} className="animate-spin"/>Descargando PDF...</>
                    : waState==='ok'
                    ? <><CheckCircle size={15}/>PDF listo · WhatsApp abierto ✓</>
                    : waState==='err'
                    ? <><AlertCircle size={15}/>Reintentar</>
                    : <><MessageCircle size={15}/>Enviar por WhatsApp</>
                  }
                </button>

                {/* Instrucción para adjuntar */}
                {waState==='ok' && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40">
                    <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 mb-1.5 flex items-center gap-1.5">
                      <Paperclip size={11}/>Un solo paso más:
                    </p>
                    <ol className="text-[10px] text-emerald-600 dark:text-emerald-400 space-y-1 list-decimal list-inside leading-relaxed">
                      <li>WhatsApp ya está abierto con el mensaje listo</li>
                      <li>Toca el ícono 📎 (adjuntar)</li>
                      <li>Selecciona el PDF descargado: <code className="bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded font-mono">{order.order_number}_resultados.pdf</code></li>
                      <li>Envía el mensaje ✉️</li>
                    </ol>
                  </div>
                )}

                {waState==='err' && waErr && (
                  <p className="text-[11px] text-red-500 mt-2 leading-snug">{waErr}</p>
                )}

                {/* Tooltip informativo */}
                {waState==='idle' && (
                  <div className="flex items-start gap-1.5 mt-2.5">
                    <Info size={11} className="text-slate-400 mt-0.5 flex-shrink-0"/>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      El PDF se descarga automáticamente y WhatsApp se abre con el mensaje escrito.
                      Solo debes adjuntar el archivo.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-slate-400 mb-3">Sin WhatsApp registrado</p>
                <button onClick={() => navigate(`/patients/${order.patient_id}/edit`)}
                  className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
                  + Agregar WhatsApp al paciente
                </button>
              </div>
            )}
          </div>

          {/* Datos paciente */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <User size={14} className="text-blue-600 dark:text-blue-400"/>
              </div>
              <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">Paciente</h3>
            </div>
            <div className="space-y-2.5">
              {[
                ['CI', order.patient_id_number],
                ['Código', order.patient_code],
                ['Sexo', order.patient_sex==='M'?'Masculino':order.patient_sex==='F'?'Femenino':null],
                ['Médico', order.doctor_name],
                ['Diagnóstico', order.diagnosis],
              ].filter(([,v])=>v).map(([l,v])=>(
                <div key={l}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{l}</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {order.notes && (
            <div className="card p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <FileText size={10}/>Notas
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{order.notes}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
