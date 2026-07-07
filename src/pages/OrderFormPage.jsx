import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { orderService } from '../services/orders'
import { examService } from '../services/exams'
import { patientService } from '../services/patients'
import { useAppStore } from '../store/appStore'
import { PageHeader, SearchInput, Spinner } from '../components/ui/index'
import {
  ChevronLeft, ChevronDown, ChevronUp, Check, X,
  FlaskConical, Search, User, Stethoscope, ClipboardList,
  BadgeCheck, LayoutGrid
} from 'lucide-react'
import clsx from 'clsx'

const CAT_ORDER = [
  'HEMATOLOGÍA','QUÍMICA SANGUÍNEA','EXAMEN DE ORINA','CITOLOGÍA',
  'MICROBIOLOGÍA','COPROLOGÍA','SEROLOGÍA','INMUNOHEMATOLOGÍA','OTROS',
]
function areaNum(cat) {
  const i = CAT_ORDER.indexOf(cat)
  return i >= 0 ? String(i + 1) : '?'
}
const CAT_STYLE = {
  'HEMATOLOGÍA':       { dot:'bg-red-500',    active:'bg-red-500 text-white',    idle:'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100',    head:'bg-red-50/80 dark:bg-red-900/20'    },
  'QUÍMICA SANGUÍNEA': { dot:'bg-amber-500',  active:'bg-amber-500 text-white',  idle:'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100',  head:'bg-amber-50/80 dark:bg-amber-900/20'  },
  'EXAMEN DE ORINA':   { dot:'bg-yellow-500', active:'bg-yellow-500 text-white', idle:'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100', head:'bg-yellow-50/80 dark:bg-yellow-900/20' },
  'CITOLOGÍA':         { dot:'bg-purple-500', active:'bg-purple-500 text-white', idle:'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100', head:'bg-purple-50/80 dark:bg-purple-900/20' },
  'MICROBIOLOGÍA':     { dot:'bg-green-500',  active:'bg-green-500 text-white',  idle:'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100',  head:'bg-green-50/80 dark:bg-green-900/20'  },
  'COPROLOGÍA':        { dot:'bg-lime-500',   active:'bg-lime-500 text-white',   idle:'bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300 hover:bg-lime-100',   head:'bg-lime-50/80 dark:bg-lime-900/20'   },
  'SEROLOGÍA':         { dot:'bg-blue-500',   active:'bg-blue-500 text-white',   idle:'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100',   head:'bg-blue-50/80 dark:bg-blue-900/20'   },
  'INMUNOHEMATOLOGÍA': { dot:'bg-pink-500',   active:'bg-pink-500 text-white',   idle:'bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100',   head:'bg-pink-50/80 dark:bg-pink-900/20'   },
  'OTROS':             { dot:'bg-slate-400',  active:'bg-slate-500 text-white',  idle:'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200',  head:'bg-slate-50/80 dark:bg-slate-800/40'  },
}
const cs = c => CAT_STYLE[c] || CAT_STYLE['OTROS']

export default function OrderFormPage() {
  const navigate = useNavigate()
  const [sp]     = useSearchParams()
  const { user, addNotification, doctors } = useAppStore()

  const [patients,        setPatients]        = useState([])
  const [examsByCategory, setExamsByCategory] = useState({})
  const [selectedExams,   setSelectedExams]   = useState([])
  const [patientSearch,   setPatientSearch]   = useState('')
  const [examSearch,      setExamSearch]      = useState('')
  const [activeFilter,    setActiveFilter]    = useState('TODOS')
  const [collapsed,       setCollapsed]       = useState({})
  const [saving,          setSaving]          = useState(false)
  const [doctorCustom,    setDoctorCustom]    = useState(false)
  const [form, setForm] = useState({
    patient_id: sp.get('patient') || '',
    doctor_name: '', diagnosis: '', priority: 'normal', notes: ''
  })

  useEffect(() => { loadData() }, [])
  useEffect(() => { searchPatients() }, [patientSearch])
  // Auto-seleccionar si solo hay un doctor registrado
  useEffect(() => {
    if (doctors.length === 1 && !form.doctor_name)
      setForm(f => ({ ...f, doctor_name: doctors[0].name }))
  }, [doctors])

  async function loadData() {
    try {
      const exams = await examService.getAll()
      const byCat = {}
      for (const e of exams) {
        if (!byCat[e.category]) byCat[e.category] = []
        byCat[e.category].push(e)
      }
      for (const cat of Object.keys(byCat))
        byCat[cat].sort((a, b) => (a.code || '').localeCompare(b.code || ''))
      setExamsByCategory(byCat)
      if (form.patient_id) {
        const p = await patientService.getById(form.patient_id)
        if (p) setPatients([p])
      } else {
        const all = await patientService.getAll('')
        setPatients(all.slice(0, 30))
      }
    } catch { addNotification('Error cargando datos del formulario', 'error') }
  }

  async function searchPatients() {
    try {
      const p = await patientService.getAll(patientSearch)
      setPatients(p.slice(0, 30))
    } catch { addNotification('Error buscando pacientes', 'error') }
  }

  function toggleExam(exam) {
    setSelectedExams(prev =>
      prev.find(e => e.id === exam.id)
        ? prev.filter(e => e.id !== exam.id)
        : [...prev, exam]
    )
  }

  function toggleAllInCategory(cat, exams) {
    const allSel = exams.every(e => selectedExams.find(s => s.id === e.id))
    if (allSel) {
      setSelectedExams(prev => prev.filter(s => s.category !== cat))
    } else {
      setSelectedExams(prev => {
        const ids = new Set(prev.map(e => e.id))
        return [...prev, ...exams.filter(e => !ids.has(e.id))]
      })
    }
  }

  const totalBs = selectedExams.reduce((s, e) => s + (e.price || 0), 0)
  const selectedPatient = patients.find(p => p.id === form.patient_id)

  const orderedCats = [
    ...CAT_ORDER.filter(c => examsByCategory[c]),
    ...Object.keys(examsByCategory).filter(c => !CAT_ORDER.includes(c)).sort()
  ]

  function filterExams(exams) {
    if (!examSearch.trim()) return exams
    const q = examSearch.toLowerCase()
    return exams.filter(e =>
      e.name.toLowerCase().includes(q) || (e.code || '').toLowerCase().includes(q)
    )
  }

  // Categorías visibles según filtro activo + búsqueda
  const visibleCats = orderedCats.filter(c => {
    if (activeFilter !== 'TODOS' && c !== activeFilter) return false
    return filterExams(examsByCategory[c] || []).length > 0
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.patient_id) { addNotification('Selecciona un paciente', 'warning'); return }
    if (selectedExams.length === 0) { addNotification('Selecciona al menos un examen', 'warning'); return }
    setSaving(true)
    try {
      const { id, orderNumber } = await orderService.create({
        ...form, exam_ids: selectedExams.map(e => e.id), total_amount: totalBs
      }, user?.id)
      addNotification(`Orden ${orderNumber} creada`, 'success')
      navigate(`/orders/${id}`)
    } catch (err) {
      addNotification(err.message || 'Error al crear orden', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="Nueva Orden de Trabajo"
        actions={
          <button className="btn-secondary" onClick={() => navigate('/orders')}>
            <ChevronLeft size={16}/> Volver
          </button>
        }
      />

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-12 gap-5 items-start">

          {/* ── IZQUIERDA ───────────────────────────────────────────── */}
          <div className="col-span-4 space-y-4 sticky top-4">

            {/* Paciente */}
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40">
                <User size={14} className="text-slate-400"/>
                <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Paciente *</span>
              </div>
              <div className="p-4 space-y-2">
                <SearchInput value={patientSearch} onChange={setPatientSearch} placeholder="Buscar paciente..."/>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-700/50 divide-y divide-slate-50 dark:divide-slate-800/40">
                  {patients.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Sin resultados</p>
                  )}
                  {patients.map(p => (
                    <button type="button" key={p.id}
                      onClick={() => setForm(f => ({ ...f, patient_id: p.id }))}
                      className={clsx('w-full text-left px-3 py-2.5 text-xs transition-all duration-150',
                        form.patient_id === p.id
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300')}>
                      <p className="font-bold leading-tight">{p.last_name}, {p.first_name}</p>
                      <p className={clsx('text-[10px] mt-0.5', form.patient_id === p.id ? 'text-blue-200' : 'text-slate-400')}>
                        {p.code} · CI: {p.id_number || '—'}
                      </p>
                    </button>
                  ))}
                </div>
                {selectedPatient && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40">
                    <BadgeCheck size={14} className="text-emerald-600 flex-shrink-0"/>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                      {selectedPatient.first_name} {selectedPatient.last_name}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Detalles */}
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40">
                <Stethoscope size={14} className="text-slate-400"/>
                <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Detalles</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="label-field">Médico solicitante</label>
                  {doctors.length >= 2 && !doctorCustom ? (
                    <select className="input-field"
                      value={form.doctor_name}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setDoctorCustom(true)
                          setForm(f => ({ ...f, doctor_name: '' }))
                        } else {
                          setForm(f => ({ ...f, doctor_name: e.target.value }))
                        }
                      }}>
                      <option value="">— Seleccionar médico —</option>
                      {doctors.map(d => (
                        <option key={d.id} value={d.name}>
                          {d.name}{d.specialty ? ` · ${d.specialty}` : ''}
                        </option>
                      ))}
                      <option value="__custom__">✏️ Escribir otro...</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input className="input-field flex-1" value={form.doctor_name}
                        onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                        placeholder="Dr. Nombre Apellido"
                        autoFocus={doctorCustom}/>
                      {doctors.length >= 2 && (
                        <button type="button" onClick={() => { setDoctorCustom(false); setForm(f => ({ ...f, doctor_name: '' })) }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors">
                          Lista
                        </button>
                      )}
                    </div>
                  )}
                  {doctors.length === 1 && (
                    <p className="text-[11px] text-slate-400 mt-1">Médico asignado automáticamente</p>
                  )}
                </div>
                <div>
                  <label className="label-field">Diagnóstico / CIE</label>
                  <input className="input-field" value={form.diagnosis}
                    onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                    placeholder="Diagnóstico presuntivo"/>
                </div>
                <div>
                  <label className="label-field">Prioridad</label>
                  <select className="input-field" value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="normal">Normal</option>
                    <option value="urgente">⚠ Urgente</option>
                    <option value="emergencia">🚨 Emergencia</option>
                  </select>
                </div>
                <div>
                  <label className="label-field">Notas internas</label>
                  <textarea rows={2} className="input-field resize-none" value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Observaciones adicionales..."/>
                </div>
              </div>
            </div>

            {/* Resumen */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <ClipboardList size={14} className="text-slate-400"/>
                  <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Seleccionados</span>
                </div>
                {selectedExams.length > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {selectedExams.length}
                  </span>
                )}
              </div>

              {selectedExams.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-5">Ningún examen seleccionado</p>
              ) : (
                <div className="p-3 space-y-1 max-h-44 overflow-y-auto">
                  {selectedExams.map(e => (
                    <div key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                      <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', cs(e.category).dot)}/>
                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1">{e.name}</span>
                      <span className="text-[10px] font-bold text-emerald-600 flex-shrink-0">Bs {(e.price||0).toFixed(2)}</span>
                      <button type="button" onClick={() => toggleExam(e)}
                        className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <X size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedExams.length > 0 && (
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700/50 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/10 dark:to-blue-900/10 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{selectedExams.length} examen(es)</span>
                  <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">Bs {totalBs.toFixed(2)}</span>
                </div>
              )}
            </div>

            <button type="submit" disabled={saving}
              className={clsx('w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all duration-200',
                saving || !form.patient_id || selectedExams.length === 0
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white shadow-lg shadow-blue-500/20')}>
              {saving ? <><Spinner size="sm"/> Creando...</> : <><Check size={16}/> Crear Orden de Trabajo</>}
            </button>
          </div>

          {/* ── DERECHA — CATÁLOGO ──────────────────────────────────── */}
          <div className="col-span-8">
            <div className="card overflow-hidden flex flex-col" style={{ height:'calc(100vh - 130px)' }}>

              {/* Cabecera fija */}
              <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-700/60">

                {/* Buscador */}
                <div className="p-4 pb-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input className="input-field pl-8 text-sm"
                      value={examSearch}
                      onChange={e => { setExamSearch(e.target.value); setActiveFilter('TODOS') }}
                      placeholder="Buscar examen por nombre o código..."/>
                    {examSearch && (
                      <button type="button"
                        onClick={() => setExamSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X size={13}/>
                      </button>
                    )}
                  </div>
                </div>

                {/* Pills de filtro */}
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {/* Pill "Todos" */}
                  <button type="button"
                    onClick={() => { setActiveFilter('TODOS'); setExamSearch('') }}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-150',
                      activeFilter === 'TODOS'
                        ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-800 shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    )}>
                    <LayoutGrid size={11}/>
                    Todos
                    <span className={clsx('text-[9px] font-extrabold px-1.5 py-px rounded-full',
                      activeFilter === 'TODOS' ? 'bg-white/20 text-white dark:text-slate-800' : 'bg-slate-200 dark:bg-slate-600 text-slate-500')}>
                      {orderedCats.reduce((s,c) => s + (examsByCategory[c]||[]).length, 0)}
                    </span>
                  </button>

                  {orderedCats.map(cat => {
                    const selCount = selectedExams.filter(e => e.category === cat).length
                    const total    = (examsByCategory[cat] || []).length
                    const isActive = activeFilter === cat
                    return (
                      <button type="button" key={cat}
                        onClick={() => { setActiveFilter(isActive ? 'TODOS' : cat); setExamSearch('') }}
                        className={clsx(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-150',
                          isActive ? cs(cat).active + ' shadow-sm scale-105' : cs(cat).idle
                        )}>
                        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0',
                          isActive ? 'bg-white/70' : cs(cat).dot)}/>
                        {cat}
                        <span className={clsx('text-[9px] font-extrabold px-1.5 py-px rounded-full',
                          isActive ? 'bg-white/20 text-white' : 'bg-white/60 dark:bg-black/20 text-inherit')}>
                          {total}
                        </span>
                        {selCount > 0 && (
                          <span className="bg-blue-600 text-white text-[9px] font-extrabold px-1.5 py-px rounded-full">
                            {selCount}✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Lista scrolleable */}
              <div className="flex-1 overflow-y-auto">
                {visibleCats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-10">
                    <FlaskConical size={36} className="text-slate-200 dark:text-slate-700 mb-3"/>
                    <p className="text-sm font-medium text-slate-400">No se encontraron exámenes</p>
                    <p className="text-xs text-slate-300 mt-1">Intenta con otro término de búsqueda</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-800/30">
                    {visibleCats.map(cat => {
                      const exams    = filterExams(examsByCategory[cat] || [])
                      const selCount = selectedExams.filter(e => e.category === cat).length
                      const allSel   = exams.length > 0 && exams.every(e => selectedExams.find(s => s.id === e.id))
                      const isOpen   = collapsed[cat] !== true

                      return (
                        <div key={cat}>
                          {/* Header de área — funciona como nodo padre */}
                          <div className={clsx('flex items-center gap-0 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700/40', cs(cat).head)}>
                            {/* Checkbox de área = seleccionar/quitar todos */}
                            <button type="button"
                              onClick={() => toggleAllInCategory(cat, exams)}
                              title={allSel ? 'Quitar todos del área' : 'Seleccionar área completa'}
                              className="pl-4 pr-2 py-3 flex items-center flex-shrink-0">
                              <div className={clsx(
                                'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                                allSel
                                  ? 'bg-blue-600 border-blue-600'
                                  : selCount > 0
                                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30'
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                              )}>
                                {allSel && <Check size={11} className="text-white"/>}
                                {!allSel && selCount > 0 && <div className="w-2 h-0.5 bg-blue-500 rounded"/>}
                              </div>
                            </button>

                            {/* Número de área */}
                            <button type="button"
                              onClick={() => setCollapsed(p => ({ ...p, [cat]: !p[cat] }))}
                              className="flex items-center gap-2.5 flex-1 py-3 pr-4 text-left">
                              <span className={clsx('w-6 h-6 rounded-lg text-[11px] font-extrabold flex items-center justify-center flex-shrink-0 text-white shadow-sm', cs(cat).dot)}>
                                {areaNum(cat)}
                              </span>
                              <span className="text-[12px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wide">{cat}</span>
                              <span className="text-[10px] text-slate-400 font-normal">{exams.length} exáms.</span>
                              {selCount > 0 && (
                                <span className="bg-blue-600 text-white text-[9px] font-extrabold px-1.5 py-px rounded-full">
                                  {selCount}/{exams.length} ✓
                                </span>
                              )}
                              {isOpen
                                ? <ChevronUp size={12} className="text-slate-400 ml-auto"/>
                                : <ChevronDown size={12} className="text-slate-400 ml-auto"/>
                              }
                            </button>
                          </div>

                          {/* Exámenes individuales — con sub-número */}
                          {isOpen && (
                            <div className="grid grid-cols-2 bg-white dark:bg-slate-800/20">
                              {exams.map((exam, i) => {
                                const sel    = !!selectedExams.find(e => e.id === exam.id)
                                const subNum = `${areaNum(cat)}.${i + 1}`
                                return (
                                  <button type="button" key={exam.id}
                                    onClick={() => toggleExam(exam)}
                                    className={clsx(
                                      'flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 border-b border-r border-slate-50 dark:border-slate-800/30',
                                      sel
                                        ? 'bg-blue-50 dark:bg-blue-900/20'
                                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                    )}>
                                    <div className={clsx(
                                      'w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all',
                                      sel ? 'bg-blue-600 border-blue-600 shadow-sm shadow-blue-400/30' : 'border-slate-200 dark:border-slate-600'
                                    )}>
                                      {sel && <Check size={11} className="text-white"/>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {/* Sub-número */}
                                      <p className={clsx('text-[9px] font-extrabold font-mono mb-0.5',
                                        sel ? 'text-blue-400' : 'text-slate-300 dark:text-slate-600')}>
                                        {subNum}
                                      </p>
                                      <p className={clsx('text-xs font-semibold leading-tight truncate',
                                        sel ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300')}>
                                        {exam.name}
                                      </p>
                                    </div>
                                    <span className={clsx('text-xs font-extrabold flex-shrink-0',
                                      sel ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400')}>
                                      Bs {(exam.price || 0).toFixed(2)}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer total en catálogo */}
              {selectedExams.length > 0 && (
                <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-700/60 px-4 py-2.5 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    <span className="font-bold text-blue-600">{selectedExams.length}</span> exámenes seleccionados
                  </p>
                  <p className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                    Total: Bs {totalBs.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </form>
    </div>
  )
}
