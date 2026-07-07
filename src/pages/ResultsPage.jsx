import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { orderService }              from '../services/orders'
import { examService }               from '../services/exams'
import { patientService, formatAge } from '../services/patients'
import { db }                        from '../services/database'
import { useAppStore }               from '../store/appStore'
import { Spinner }                   from '../components/ui/index'
import {
  ChevronLeft, Save, CheckCircle, AlertTriangle, User,
  ChevronDown, ChevronUp, Loader2, Activity,
  ArrowUp, ArrowDown, Minus, ClipboardCheck,
  Plus, X, FileText
} from 'lucide-react'
import clsx from 'clsx'

// ── Categorías ────────────────────────────────────────────────────────────────
const CAT = {
  'HEMATOLOGÍA':       { color:'#ef4444', light:'rgba(239,68,68,0.07)',   icon:'🩸', name:'Hematología'        },
  'QUÍMICA SANGUÍNEA': { color:'#f59e0b', light:'rgba(245,158,11,0.07)',  icon:'⚗️',  name:'Química Sanguínea'  },
  'EXAMEN DE ORINA':   { color:'#eab308', light:'rgba(234,179,8,0.07)',   icon:'🧪', name:'Examen de Orina'    },
  'CITOLOGÍA':         { color:'#8b5cf6', light:'rgba(139,92,246,0.07)',  icon:'🔬', name:'Citología'          },
  'MICROBIOLOGÍA':     { color:'#16a34a', light:'rgba(22,163,74,0.07)',   icon:'🦠', name:'Microbiología'      },
  'COPROLOGÍA':        { color:'#0d9488', light:'rgba(13,148,136,0.07)',  icon:'🧫', name:'Coprología'         },
  'SEROLOGÍA':         { color:'#3b82f6', light:'rgba(59,130,246,0.07)',  icon:'💉', name:'Serología'          },
  'INMUNOHEMATOLOGÍA': { color:'#ec4899', light:'rgba(236,72,153,0.07)',  icon:'🩺', name:'Inmunohematología'  },
  'OTROS':             { color:'#64748b', light:'rgba(100,116,139,0.07)', icon:'📝', name:'Otros'              },
}
const getCat = c => CAT[c] || CAT['OTROS']

// ── EGO ───────────────────────────────────────────────────────────────────────
const EGO_FIS = ['Volumen','Color','Aspecto','Densidad','pH','Espuma','Olor']
const EGO_QUI = ['Glucosa','Cetonas','Proteínas','Sangre','Urobilinógeno','Bilirrubina','Nitrito']
const egoSec  = n => EGO_FIS.some(k=>n.toLowerCase().startsWith(k.toLowerCase())) ? 'fis'
                   : EGO_QUI.some(k=>n.toLowerCase().startsWith(k.toLowerCase())) ? 'qui' : 'mic'

// ── Referencia formateada ─────────────────────────────────────────────────────
function fmtRef(param) {
  const r = param.reference
  if (!r) return param.ref_text || ''
  // Texto interpretativo tiene prioridad sobre el rango numérico crudo
  if (r.text_value && !r.text_value.includes('|')) return r.text_value
  if (r.value_min != null && r.value_max != null) return `${r.value_min} – ${r.value_max}${param.unit?' '+param.unit:''}`
  if (r.value_min != null) return `≥ ${r.value_min}${param.unit?' '+param.unit:''}`
  if (r.value_max != null) return `≤ ${r.value_max}${param.unit?' '+param.unit:''}`
  return param.ref_text || ''
}

// ════════════════════════════════════════════════════════════════════════════════
//  InputField
// ════════════════════════════════════════════════════════════════════════════════
function InputField({ param, value, onChange, isAbn, abnType }) {
  const opts = param.input_type==='select'
    ? (param.reference?.text_value||param.ref_text||'').split('|').map(s=>s.trim()).filter(Boolean) : []

  const base = 'w-full rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-0'
  const variantCls = isAbn && abnType==='high'
    ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 focus:ring-red-300 font-bold'
    : isAbn && abnType==='low'
    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 focus:ring-blue-300 font-bold'
    : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-blue-300 focus:border-blue-400'

  if (param.input_type==='textarea')
    return <textarea rows={3} value={value||''} onChange={e=>onChange(e.target.value)}
      className={clsx(base, variantCls,'px-3 py-2 resize-none')} placeholder="Observaciones..."/>
  if (param.input_type==='select' && opts.length)
    return <select value={value||''} onChange={e=>onChange(e.target.value)}
      className={clsx(base, variantCls,'px-3 py-2.5 cursor-pointer')}>
      <option value="">— Seleccionar —</option>
      {opts.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  if (param.input_type==='text')
    return <input type="text" value={value||''} onChange={e=>onChange(e.target.value)}
      className={clsx(base, variantCls,'px-3 py-2.5')} placeholder="Resultado..."/>

  return <input type="number" step="any" value={value||''} onChange={e=>onChange(e.target.value)}
    className={clsx(base, variantCls,'px-3 py-2.5 text-center text-[15px] font-bold')} placeholder="—"/>
}

// ════════════════════════════════════════════════════════════════════════════════
//  ParamRow
// ════════════════════════════════════════════════════════════════════════════════
function ParamRow({ param, result={}, onValueChange, shade }) {
  const isAbn   = result.is_abnormal
  const abnType = result.abnormal_type
  const hasVal  = result.value !== '' && result.value != null
  const refText = fmtRef(param)
  const sexLbl  = param.reference?.sex==='M' ? '♂' : param.reference?.sex==='F' ? '♀' : null

  return (
    <div className={clsx(
      'grid grid-cols-12 items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800/40 last:border-0 transition-colors',
      shade  ? 'bg-slate-50/40 dark:bg-slate-800/10' : 'bg-white dark:bg-transparent',
      isAbn  && '!bg-red-50/50 dark:!bg-red-900/10 border-l-2 border-l-red-400'
    )}>
      {/* Parámetro */}
      <div className="col-span-3">
        <p className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200 leading-tight">{param.name}</p>
        {param.unit && (
          <span className="inline-block mt-0.5 text-[9px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-px rounded-md">
            {param.unit}
          </span>
        )}
      </div>

      {/* Input */}
      <div className="col-span-4">
        <InputField param={param} value={result.value} isAbn={isAbn} abnType={abnType}
          onChange={v => onValueChange(param.id, v, param)}/>
      </div>

      {/* Referencia */}
      <div className="col-span-3">
        {refText
          ? <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
              {refText}
              {sexLbl && <span className="ml-1 opacity-60">{sexLbl}</span>}
            </p>
          : <span className="text-[11px] text-slate-200 dark:text-slate-700">—</span>
        }
      </div>

      {/* Estado */}
      <div className="col-span-2 flex justify-center">
        {isAbn && abnType==='high' && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-extrabold">
            <ArrowUp size={9}/> ALTO
          </span>
        )}
        {isAbn && abnType==='low' && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-extrabold">
            <ArrowDown size={9}/> BAJO
          </span>
        )}
        {!isAbn && hasVal && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
            <Minus size={9}/> OK
          </span>
        )}
      </div>
    </div>
  )
}

// ── Cabecera de tabla ─────────────────────────────────────────────────────────
function THead() {
  return (
    <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[9.5px] font-extrabold text-slate-400 uppercase tracking-widest">
      <div className="col-span-3">Parámetro / Unidad</div>
      <div className="col-span-4">Resultado</div>
      <div className="col-span-3">Valores de Referencia</div>
      <div className="col-span-2 text-center">Estado</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
//  Formulario en Blanco — secciones de examen con tabla horizontal
// ════════════════════════════════════════════════════════════════════════════════
const BLANK_COLS = [
  { key:'n',   label:'Nombre / Parámetro', ph:'Ej: Glucosa'  },
  { key:'r',   label:'Resultado',          ph:'5.4'          },
  { key:'u',   label:'Unidad',             ph:'mg/dL'        },
  { key:'ref', label:'Referencia',         ph:'70 – 110'     },
]
const mkRow = () => ({ n:'', r:'', u:'', ref:'' })
const mkSec = () => ({ id: Math.random().toString(36).slice(2), title:'', rows:[mkRow()], obs:'' })

// Parsea el JSON guardado, maneja formato antiguo [{n,r,u,ref,obs}] y nuevo [{title,rows,obs}]
function parseSections(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed) || parsed.length === 0) return [mkSec()]
    // Formato nuevo: tiene campo "rows"
    if (parsed[0]?.rows !== undefined) return parsed
    // Formato antiguo plano: convertir a sección única
    return [{ id:'legacy', title:'', rows: parsed.map(({n,r,u,ref}) => ({n:n||'',r:r||'',u:u||'',ref:ref||''})), obs: parsed.find(x=>x.obs)?.obs || '' }]
  } catch { return [mkSec()] }
}

// Cuenta filas con datos (n o r rellenos) en todas las secciones
function countFilledRows(sections) {
  return sections.flatMap(s => s.rows || []).filter(r => r.n || r.r).length
}

function BlankFormTable({ params, results, onValueChange }) {
  const rowsParam = params.find(p => p.name === '__rows')
  const savedValue = results[rowsParam?.id]?.value

  const [sections, setSections] = useState(() => parseSections(savedValue))

  // Sincronizar si llegan datos del servidor
  useEffect(() => {
    if (!rowsParam) return
    const parsed = parseSections(savedValue)
    setSections(prev => JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed)
  }, [rowsParam?.id, savedValue])

  if (!rowsParam) return null

  function push(newSections) {
    setSections(newSections)
    onValueChange(rowsParam.id, JSON.stringify(newSections), rowsParam)
  }

  const addSec    = ()         => push([...sections, mkSec()])
  const rmSec     = si         => push(sections.filter((_, i) => i !== si))
  const setTitle  = (si, v)    => push(sections.map((s, i) => i === si ? { ...s, title: v }  : s))
  const setObs    = (si, v)    => push(sections.map((s, i) => i === si ? { ...s, obs:   v }  : s))
  const addRow    = si         => push(sections.map((s, i) => i === si ? { ...s, rows: [...s.rows, mkRow()] } : s))
  const rmRow     = (si, ri)   => push(sections.map((s, i) => i === si ? { ...s, rows: s.rows.filter((_, j) => j !== ri) } : s))
  const setCell   = (si, ri, k, v) => push(sections.map((s, i) =>
    i === si ? { ...s, rows: s.rows.map((r, j) => j === ri ? { ...r, [k]: v } : r) } : s))

  return (
    <div className="p-4 space-y-3">

      {sections.map((sec, si) => (
        <div key={sec.id || si}
          className="rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden shadow-sm">

          {/* ── Cabecera de sección ─────────────────────────────── */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <FileText size={13} className="text-slate-400 flex-shrink-0"/>
            <input
              className="flex-1 text-[13px] font-bold bg-transparent border-none outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-300 placeholder:font-normal"
              placeholder={`Examen ${si + 1}: nombre, área o prueba (ej: Hemograma, Química Sanguínea...)`}
              value={sec.title}
              onChange={e => setTitle(si, e.target.value)}
            />
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
              {(sec.rows||[]).filter(r=>r.n||r.r).length} fila(s)
            </span>
            {sections.length > 1 && (
              <button type="button" onClick={() => rmSec(si)}
                className="w-6 h-6 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-all flex-shrink-0">
                <X size={12}/>
              </button>
            )}
          </div>

          {/* ── Tabla de parámetros ─────────────────────────────── */}
          <div className="overflow-x-auto bg-white dark:bg-slate-900/20">
            <table className="w-full border-collapse text-xs" style={{minWidth:'520px'}}>
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/50">
                  <th className="w-7 py-2 text-center text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">#</th>
                  {BLANK_COLS.map(c => (
                    <th key={c.key} className="px-2 py-2 text-left text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                      {c.label}
                    </th>
                  ))}
                  <th className="w-7"/>
                </tr>
              </thead>
              <tbody>
                {(sec.rows || []).map((row, ri) => (
                  <tr key={ri} className={clsx(
                    'group border-b transition-colors',
                    ri % 2 === 0
                      ? 'border-slate-50 dark:border-slate-800/30 bg-white dark:bg-transparent'
                      : 'border-slate-100 dark:border-slate-800/50 bg-slate-50/60 dark:bg-slate-800/20'
                  )}>
                    <td className="py-1.5 text-center">
                      <span className="text-[9px] font-extrabold text-slate-300">{ri + 1}</span>
                    </td>
                    {BLANK_COLS.map(c => (
                      <td key={c.key} className="px-1.5 py-1">
                        <input
                          className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-blue-300 transition-all"
                          value={row[c.key] || ''}
                          onChange={e => setCell(si, ri, c.key, e.target.value)}
                          placeholder={c.ph}
                        />
                      </td>
                    ))}
                    <td className="py-1 text-center">
                      {(sec.rows||[]).length > 1 && (
                        <button type="button" onClick={() => rmRow(si, ri)}
                          className="w-6 h-6 rounded-lg text-transparent group-hover:text-slate-300 hover:!text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-all mx-auto">
                          <X size={11}/>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Footer: + fila + Observaciones ─────────────────── */}
          <div className="px-3 py-2.5 bg-white dark:bg-slate-900/10 border-t border-slate-100 dark:border-slate-700/40 space-y-2">
            <button type="button" onClick={() => addRow(si)}
              className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-700 transition-colors">
              <Plus size={12}/> Agregar fila
            </button>
            <div>
              <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Observaciones</p>
              <textarea
                rows={2}
                value={sec.obs || ''}
                onChange={e => setObs(si, e.target.value)}
                placeholder="Observaciones del examen..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 transition-all"
              />
            </div>
          </div>
        </div>
      ))}

      {/* ── Agregar sección/examen ──────────────────────────────── */}
      <button type="button" onClick={addSec}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-[12px] font-bold text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 dark:hover:border-blue-500 transition-all">
        <Plus size={14}/> Agregar examen
      </button>
    </div>
  )
}

// ── Sub-sección EGO/Copro ─────────────────────────────────────────────────────
function SubSec({ title, icon, params, results, onValueChange }) {
  const [open, setOpen] = useState(true)
  const abn    = params.filter(p=>results[p.id]?.is_abnormal).length
  const filled = params.filter(p=>results[p.id]?.value).length

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/40 mb-3 last:mb-0">
      <button type="button" onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-slate-100/60 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors">
        <span className="text-sm">{icon}</span>
        <span className="text-[10.5px] font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-widest flex-1 text-left">{title}</span>
        <span className="text-[10px] text-slate-400 font-medium">{filled}/{params.length}</span>
        {abn>0 && <span className="text-[9px] font-bold bg-red-100 dark:bg-red-900/30 text-red-500 px-2 py-0.5 rounded-full">{abn} alt.</span>}
        {open ? <ChevronUp size={12} className="text-slate-300"/> : <ChevronDown size={12} className="text-slate-300"/>}
      </button>
      {open && <>
        <THead/>
        {params.map((p,i)=><ParamRow key={p.id} param={p} result={results[p.id]} onValueChange={onValueChange} shade={i%2!==0}/>)}
      </>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
//  CategorySection — agrupa todos los exámenes de la misma área
// ════════════════════════════════════════════════════════════════════════════════
function CategorySection({ category, examList, allResults, onValueChange, onSaveCategory, onVerifyCategory, saving, canVerify }) {
  const [open, setOpen]     = useState(true)
  const cat = getCat(category)

  // Totales de la categoría
  const allParams  = examList.flatMap(oe => oe.examData?.parameters||[])
  const totalFill  = allParams.filter(p => {
    const oeId = examList.find(oe=>(oe.examData?.parameters||[]).find(ep=>ep.id===p.id))?.id
    return allResults[oeId]?.[p.id]?.value
  }).length
  const totalAbn   = allParams.filter(p => {
    const oeId = examList.find(oe=>(oe.examData?.parameters||[]).find(ep=>ep.id===p.id))?.id
    return allResults[oeId]?.[p.id]?.is_abnormal
  }).length
  const totalPar   = allParams.length
  const pct        = totalPar ? Math.round((totalFill/totalPar)*100) : 0
  const allDone    = examList.every(oe=>oe.status==='completado')

  return (
    <div className="mb-4 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700/50">

      {/* ── Header de categoría ─────────────────────────────────────────────── */}
      <button type="button" onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
        style={{ background: `linear-gradient(135deg, ${cat.color}18 0%, ${cat.color}08 100%)`,
                 borderLeft: `4px solid ${cat.color}` }}>
        <span className="text-2xl flex-shrink-0">{cat.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-slate-800 dark:text-slate-100 text-[14px] leading-tight">{category}</p>
          <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
            {examList.length} examen{examList.length!==1?'es':''} · {totalPar} parámetros
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Progreso */}
          <div className="text-right">
            <div className="flex items-center gap-2 mb-1 justify-end">
              <span className="text-[10px] text-slate-400">{totalFill}/{totalPar}</span>
              <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">{pct}%</span>
            </div>
            <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width:`${pct}%`, background: pct===100 ? '#10b981' : cat.color }}/>
            </div>
          </div>

          {totalAbn>0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full text-white"
              style={{ background: cat.color }}>
              <AlertTriangle size={10}/>{totalAbn}
            </span>
          )}
          {allDone && <CheckCircle size={18} className="text-emerald-500"/>}
          {open ? <ChevronUp size={15} className="text-slate-400"/> : <ChevronDown size={15} className="text-slate-400"/>}
        </div>
      </button>

      {open && (
        <div className="bg-white dark:bg-slate-900/30">
          {examList.map((oe, oeIdx) => {
            const params      = oe.examData?.parameters || []
            const results     = allResults[oe.id] || {}
            const isBlankForm = oe.exam_code === 'OTR-001'
            const isEGO       = oe.exam_category === 'EXAMEN DE ORINA'
            const isCopro     = oe.exam_category === 'COPROLOGÍA' &&
                                params.some(p => ['Consistencia','Moco','Restos'].some(n => p.name.toLowerCase().startsWith(n.toLowerCase())))
            const blankSecs  = isBlankForm ? parseSections(results[params[0]?.id]?.value) : []
            const blankFilled = isBlankForm ? countFilledRows(blankSecs) : 0
            const oeFilled   = isBlankForm ? blankFilled : params.filter(p=>results[p.id]?.value).length
            const oeAbn     = params.filter(p=>results[p.id]?.is_abnormal).length
            const multiExam = examList.length > 1

            return (
              <div key={oe.id} className={clsx(oeIdx>0 && 'border-t-2 border-dashed border-slate-100 dark:border-slate-800')}>

                {/* Sub-header del examen (solo si hay más de 1 examen en la categoría) */}
                {multiExam && (
                  <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50/80 dark:bg-slate-800/40">
                    <div className="w-1.5 h-5 rounded-full flex-shrink-0" style={{ background: cat.color }}/>
                    <p className="text-[12px] font-bold text-slate-700 dark:text-slate-300 flex-1">{oe.exam_name}</p>
                    <span className="text-[10px] text-slate-400">
                      {isBlankForm ? `${blankFilled} fila(s)` : `${oeFilled}/${params.length}`}
                    </span>
                    {oeAbn>0 && (
                      <span className="text-[9px] font-bold bg-red-100 dark:bg-red-900/30 text-red-500 px-2 py-0.5 rounded-full">
                        {oeAbn} alt.
                      </span>
                    )}
                    {oe.status==='completado' && (
                      <span className="text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle size={8}/> Verificado
                      </span>
                    )}
                  </div>
                )}

                {/* Parámetros */}
                {isBlankForm ? (
                  <BlankFormTable
                    params={params}
                    results={results}
                    onValueChange={(pid, v, p) => onValueChange(oe.id, pid, v, p)}
                  />
                ) : isEGO ? (
                  <div className="p-4 space-y-3">
                    <SubSec title="Examen Físico — Macroscópico"    icon="🔍" params={params.filter(p=>egoSec(p.name)==='fis')} results={results} onValueChange={(pid,v,p)=>onValueChange(oe.id,pid,v,p)}/>
                    <SubSec title="Examen Químico — Tira Reactiva"  icon="⚗️"  params={params.filter(p=>egoSec(p.name)==='qui')} results={results} onValueChange={(pid,v,p)=>onValueChange(oe.id,pid,v,p)}/>
                    <SubSec title="Examen Microscópico — Sedimento" icon="🔬" params={params.filter(p=>egoSec(p.name)==='mic')} results={results} onValueChange={(pid,v,p)=>onValueChange(oe.id,pid,v,p)}/>
                  </div>
                ) : isCopro ? (
                  <div className="p-4 space-y-3">
                    <SubSec title="Examen Macroscópico" icon="🔍"
                      params={params.filter(p=>['Consistencia','Moco','Restos'].some(n=>p.name.toLowerCase().startsWith(n.toLowerCase())))}
                      results={results} onValueChange={(pid,v,p)=>onValueChange(oe.id,pid,v,p)}/>
                    <SubSec title="Examen Microscópico" icon="🔬"
                      params={params.filter(p=>!['Consistencia','Moco','Restos'].some(n=>p.name.toLowerCase().startsWith(n.toLowerCase())))}
                      results={results} onValueChange={(pid,v,p)=>onValueChange(oe.id,pid,v,p)}/>
                  </div>
                ) : (
                  <>
                    {!multiExam && <THead/>}
                    {multiExam && (
                      <div className="grid grid-cols-12 gap-3 px-5 py-1.5 bg-white dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800 text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                        <div className="col-span-3">Parámetro</div>
                        <div className="col-span-4">Resultado</div>
                        <div className="col-span-3">Referencia</div>
                        <div className="col-span-2 text-center">Estado</div>
                      </div>
                    )}
                    {params.map((p,i) => (
                      <ParamRow key={p.id} param={p} result={results[p.id]} shade={i%2!==0}
                        onValueChange={(pid,v,param) => onValueChange(oe.id,pid,v,param)}/>
                    ))}
                  </>
                )}
              </div>
            )
          })}

          {/* Footer de categoría */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-700/40"
            style={{ background: `${cat.color}08` }}>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span><span className="font-bold text-slate-600 dark:text-slate-300">{totalFill}</span>/{totalPar} ingresados</span>
              {totalAbn>0 && <span className="text-red-500 font-semibold flex items-center gap-1"><AlertTriangle size={11}/>{totalAbn} fuera de rango</span>}
              {pct===100 && !totalAbn && <span className="text-emerald-500 font-semibold flex items-center gap-1"><CheckCircle size={11}/> Completo</span>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={()=>onSaveCategory(examList, allResults)} disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin"/> : <Save size={11}/>}
                Guardar
              </button>
              {canVerify && (
                <button type="button" onClick={()=>onVerifyCategory(examList, allResults)} disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50">
                  <CheckCircle size={11}/> Verificar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
//  PatientBand
// ════════════════════════════════════════════════════════════════════════════════
function PatientBand({ order, totalFill, totalPar, totalAbn }) {
  const patAge = formatAge(order.patient_birth_date || order.birth_date)
  const rawSex = order.patient_sex || order.sex
  const patSex = rawSex==='M' ? 'Masculino' : rawSex==='F' ? 'Femenino' : '—'
  const pct    = totalPar ? Math.round((totalFill/totalPar)*100) : 0
  const fmtD   = d => d ? new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}) : '—'

  const Field = ({label, value, mono=false}) => (
    <div className="min-w-0">
      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={clsx('text-[12px] font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate', mono&&'font-mono')}>
        {value||'—'}
      </p>
    </div>
  )

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700/50 mb-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-800 px-5 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <User size={20} className="text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-extrabold text-[15px] leading-tight truncate">
            {order.patient_name || `${order.first_name||''} ${order.last_name||''}`}
          </p>
          <p className="text-slate-400 text-[11px] mt-0.5">{patAge} · {patSex}</p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {totalAbn>0 && (
            <span className="flex items-center gap-1.5 bg-red-500/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-full">
              <AlertTriangle size={11}/>{totalAbn} alt.
            </span>
          )}
          {/* Círculo progreso */}
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3.5"/>
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={pct===100 ? '#10b981' : '#60a5fa'} strokeWidth="3.5"
                strokeDasharray={`${pct} 100`} strokeLinecap="round"/>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-white text-[11px] font-extrabold leading-none">{pct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Datos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-slate-100 dark:divide-slate-700/40 bg-white dark:bg-slate-800/30">
        <div className="px-4 py-3 space-y-2">
          <Field label="N° Orden"    value={order.order_number} mono/>
          <Field label="CI / Código" value={order.patient_id_number||order.id_number||order.patient_code}/>
        </div>
        <div className="px-4 py-3 space-y-2">
          <Field label="Fecha ingreso" value={fmtD(order.created_at)}/>
          <Field label="Prioridad"     value={order.priority==='urgente'?'⚠ Urgente':order.priority==='emergencia'?'🚨 Emergencia':'Normal'}/>
        </div>
        <div className="px-4 py-3 space-y-2">
          <Field label="Médico"      value={order.doctor_name}/>
          <Field label="Diagnóstico" value={order.diagnosis}/>
        </div>
        <div className="px-4 py-3 space-y-2">
          <Field label="Exámenes"    value={`${(order.enrichedExams||order.exams||[]).length} solicitados`}/>
          <Field label="Progreso"    value={`${totalFill} / ${totalPar} parámetros`}/>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════════
export default function ResultsPage() {
  const params   = useParams()
  const navigate = useNavigate()
  const { user, addNotification } = useAppStore()
  const canVerify = user?.role==='administrador' || user?.role==='bioquimico'

  const orderId     = params.orderId
  const orderExamId = params.orderExamId

  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [order,      setOrder]      = useState(null)
  const [allResults, setAllResults] = useState({})
  const [singleExam, setSingleExam] = useState(null)
  const [singleOE,   setSingleOE]   = useState(null)

  useEffect(()=>{ orderId ? loadOrder(orderId) : loadSingle(orderExamId) },[orderId, orderExamId])

  async function loadOrder(oid) {
    setLoading(true)
    try {
      const data = await orderService.getOrderExamsWithParams(oid)
      setOrder(data)
      const init = {}
      for (const oe of (data.enrichedExams||[])) init[oe.id] = oe.resultsMap
      setAllResults(init)
    } catch(e) { addNotification('Error cargando resultados','error') }
    finally { setLoading(false) }
  }

  async function loadSingle(oeId) {
    setLoading(true)
    try {
      const oe = await db.get(`
        SELECT oe.*, e.id as exam_id, e.name as exam_name, e.category,
               o.id as order_id, o.order_number, o.doctor_name, o.diagnosis, o.priority, o.created_at,
               p.first_name, p.last_name, p.sex, p.birth_date, p.id_number
        FROM order_exams oe
        JOIN exams e ON oe.exam_id=e.id
        JOIN orders o ON oe.order_id=o.id
        JOIN patients p ON o.patient_id=p.id
        WHERE oe.id=?`,[oeId])
      if(!oe){ addNotification('Examen no encontrado','error'); navigate(-1); return }
      setSingleOE(oe)
      const age  = patientService.getAge(oe.birth_date)
      const exam = await examService.getExamWithParameters(oe.exam_id, oe.sex, age)
      setSingleExam(exam)
      const existing = await orderService.getExamResults(oeId)
      const map = {}
      for(const r of existing) map[r.parameter_id]={value:r.value||'',is_abnormal:r.is_abnormal,abnormal_type:r.abnormal_type,notes:r.notes||''}
      for(const p of (exam?.parameters||[])) if(!map[p.id]) map[p.id]={value:'',is_abnormal:false,abnormal_type:null,notes:''}
      setAllResults({[oeId]:map})
    } catch(e){ addNotification('Error al cargar','error') }
    finally{ setLoading(false) }
  }

  function handleValueChange(oeId, paramId, value, param) {
    const abnormal = examService.checkAbnormal(value, param.reference, param.input_type)
    setAllResults(prev=>({
      ...prev,
      [oeId]:{ ...prev[oeId], [paramId]:{ ...(prev[oeId]?.[paramId]||{}), value, ...abnormal } }
    }))
  }

  async function handleSave(oeId, resultsForExam, examParams) {
    setSaving(true)
    try {
      const toSave = (examParams||[]).map(p=>({parameter_id:p.id,...(resultsForExam[p.id]||{})}))
      await orderService.saveResults(oeId, toSave, user.id)
      addNotification('Guardado','success')
    } catch(e){ addNotification('Error: '+e.message,'error') }
    finally{ setSaving(false) }
  }

  async function handleVerify(oeId, resultsForExam, examParams) {
    setSaving(true)
    try {
      const toSave = (examParams||[]).map(p=>({parameter_id:p.id,...(resultsForExam[p.id]||{})}))
      await orderService.saveResults(oeId, toSave, user.id)
      await orderService.verifyResults(oeId, user.id)
      addNotification('Verificado','success')
      if(orderId) loadOrder(orderId)
    } catch(e){ addNotification('Error: '+e.message,'error') }
    finally{ setSaving(false) }
  }

  async function handleSaveCategory(examList, resultsMap) {
    setSaving(true)
    try {
      for(const oe of examList){
        const params = oe.examData?.parameters||[]
        const toSave = params.map(p=>({parameter_id:p.id,...(resultsMap[oe.id]?.[p.id]||{})}))
        await orderService.saveResults(oe.id, toSave, user.id)
      }
      addNotification('Área guardada','success')
    } catch(e){ addNotification('Error: '+e.message,'error') }
    finally{ setSaving(false) }
  }

  async function handleVerifyCategory(examList, resultsMap) {
    setSaving(true)
    try {
      for(const oe of examList){
        const params = oe.examData?.parameters||[]
        const toSave = params.map(p=>({parameter_id:p.id,...(resultsMap[oe.id]?.[p.id]||{})}))
        await orderService.saveResults(oe.id, toSave, user.id)
        await orderService.verifyResults(oe.id, user.id)
      }
      addNotification('Área verificada','success')
      if(orderId) loadOrder(orderId)
    } catch(e){ addNotification('Error: '+e.message,'error') }
    finally{ setSaving(false) }
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      for(const oe of (order?.enrichedExams||[])){
        const examParams = oe.examData?.parameters||[]
        const toSave = examParams.map(p=>({parameter_id:p.id,...(allResults[oe.id]?.[p.id]||{})}))
        await orderService.saveResults(oe.id, toSave, user.id)
      }
      addNotification('Todos los resultados guardados','success')
      navigate(`/orders/${orderId}`)   // ← sale automáticamente
    } catch(e){ addNotification('Error: '+e.message,'error') }
    finally{ setSaving(false) }
  }

  if(loading) return(
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Spinner size={28}/><p className="text-sm text-slate-400">Cargando resultados...</p>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════════
  //  MODO INDIVIDUAL
  // ══════════════════════════════════════════════════════════════════════════════
  if(orderExamId && singleOE){
    const examParams = singleExam?.parameters||[]
    const results    = allResults[orderExamId]||{}
    const filled     = examParams.filter(p=>results[p.id]?.value).length
    const abnCount   = examParams.filter(p=>results[p.id]?.is_abnormal).length
    const fakeOrder  = {
      ...singleOE,
      patient_name:`${singleOE.first_name} ${singleOE.last_name}`,
      enrichedExams:[{id:orderExamId}], exams:[{id:orderExamId}],
    }
    const fakeExamList = [{
      id: orderExamId, exam_name: singleExam?.name, exam_category: singleExam?.category,
      examData: singleExam, status: singleOE.status,
    }]

    return (
      <div className="max-w-5xl mx-auto pb-28">
        <div className="flex items-center gap-2 mb-5">
          <button className="btn-secondary" onClick={()=>navigate(-1)}><ChevronLeft size={15}/> Volver</button>
        </div>
        <PatientBand order={fakeOrder} totalFill={filled} totalPar={examParams.length} totalAbn={abnCount}/>
        <CategorySection
          category={singleExam?.category||'OTROS'}
          examList={fakeExamList}
          allResults={allResults}
          onValueChange={handleValueChange}
          onSaveCategory={()=>handleSave(orderExamId,results,examParams)}
          onVerifyCategory={()=>handleVerify(orderExamId,results,examParams)}
          saving={saving} canVerify={canVerify}/>

        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex items-center gap-3">
          <p className="text-xs text-slate-400 mr-auto">
            <span className="font-bold text-slate-700 dark:text-slate-200">{filled}</span>/{examParams.length} ingresados
            {abnCount>0 && <span className="ml-2 text-red-500 font-semibold">· {abnCount} alterados</span>}
          </p>
          <button className="btn-secondary text-sm" onClick={()=>navigate(-1)}>Cancelar</button>
          <button className="btn-primary text-sm" onClick={()=>handleSave(orderExamId,results,examParams)} disabled={saving}>
            {saving?<Loader2 size={14} className="animate-spin"/>:<Save size={14}/>}
            {saving?'Guardando...':'Guardar Resultados'}
          </button>
          {canVerify&&(
            <button className="btn-success text-sm" onClick={()=>handleVerify(orderExamId,results,examParams)} disabled={saving}>
              <CheckCircle size={14}/> Verificar
            </button>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  MODO COMPLETO — agrupado por área
  // ══════════════════════════════════════════════════════════════════════════════
  if(!order) return <div className="text-center py-20 text-slate-400">Orden no encontrada</div>

  // Agrupar exámenes por categoría
  const grouped = {}
  for(const oe of (order.enrichedExams||[])){
    const cat = oe.exam_category||'OTROS'
    if(!grouped[cat]) grouped[cat]=[]
    grouped[cat].push(oe)
  }
  const catOrder = ['HEMATOLOGÍA','QUÍMICA SANGUÍNEA','EXAMEN DE ORINA','CITOLOGÍA','MICROBIOLOGÍA','COPROLOGÍA','SEROLOGÍA','INMUNOHEMATOLOGÍA','OTROS']
  const sortedCats = [...catOrder.filter(c=>grouped[c]),...Object.keys(grouped).filter(c=>!catOrder.includes(c)).sort()]

  const totalAbn  = Object.values(allResults).flatMap(r=>Object.values(r)).filter(r=>r.is_abnormal).length
  const totalFill = Object.values(allResults).flatMap(r=>Object.values(r)).filter(r=>r.value).length
  const totalPar  = (order.enrichedExams||[]).reduce((s,oe)=>s+(oe.examData?.parameters?.length||0),0)

  return (
    <div className="max-w-5xl mx-auto pb-28">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-secondary" onClick={()=>navigate(`/orders/${orderId}`)}>
          <ChevronLeft size={15}/> Volver a la orden
        </button>
      </div>

      <PatientBand order={order} totalFill={totalFill} totalPar={totalPar} totalAbn={totalAbn}/>

      {sortedCats.map(cat=>(
        <CategorySection key={cat}
          category={cat}
          examList={grouped[cat]}
          allResults={allResults}
          onValueChange={handleValueChange}
          onSaveCategory={handleSaveCategory}
          onVerifyCategory={handleVerifyCategory}
          saving={saving} canVerify={canVerify}/>
      ))}

      {/* Barra inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-4 mr-auto">
          <Activity size={14} className="text-slate-400"/>
          <span className="text-xs text-slate-500">
            <span className="font-bold text-slate-700 dark:text-slate-200">{totalFill}</span>/{totalPar} ingresados
          </span>
          {totalAbn>0&&<span className="text-xs text-red-500 font-semibold flex items-center gap-1"><AlertTriangle size={12}/>{totalAbn} alterados</span>}
          {totalFill===totalPar&&totalPar>0&&<span className="text-xs text-emerald-500 font-semibold flex items-center gap-1"><CheckCircle size={12}/> Completo</span>}
        </div>
        <button className="btn-secondary text-sm" onClick={()=>navigate(`/orders/${orderId}`)}>Cancelar</button>
        <button className="btn-primary text-sm" onClick={handleSaveAll} disabled={saving}>
          {saving?<Loader2 size={14} className="animate-spin"/>:<ClipboardCheck size={14}/>}
          {saving?'Guardando...':'Guardar y Finalizar'}
        </button>
      </div>
    </div>
  )
}
