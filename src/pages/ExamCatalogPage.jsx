/**
 * ExamCatalogPage v4 — Catálogo jerárquico por áreas
 * Áreas numeradas (1, 2, 3…) + exámenes individuales (2.1, 2.2…)
 */
import { useState, useEffect } from 'react'
import { examService } from '../services/exams'
import { useAppStore } from '../store/appStore'
import { PageHeader, Modal } from '../components/ui/index'
import { db, generateId } from '../services/database'
import {
  Plus, Save, X, Search,
  DollarSign, Settings, FlaskConical, Beaker,
  Tag, Activity, ChevronRight, ChevronDown,
  Users, User, Upload, Download, Trash2, AlertTriangle, Lock
} from 'lucide-react'
import clsx from 'clsx'

// ── Orden canónico de áreas ────────────────────────────────────────────────────
const CAT_ORDER = [
  'HEMATOLOGÍA','QUÍMICA SANGUÍNEA','EXAMEN DE ORINA','CITOLOGÍA',
  'MICROBIOLOGÍA','COPROLOGÍA','SEROLOGÍA','INMUNOHEMATOLOGÍA','OTROS',
]

const CAT_META = {
  'HEMATOLOGÍA':        { icon:'🩸', accent:'#dc2626', light:'#fef2f2', dark:'#991b1b', border:'border-red-200'    },
  'QUÍMICA SANGUÍNEA':  { icon:'⚗️',  accent:'#d97706', light:'#fffbeb', dark:'#92400e', border:'border-amber-200'  },
  'EXAMEN DE ORINA':    { icon:'🧪', accent:'#ca8a04', light:'#fefce8', dark:'#854d0e', border:'border-yellow-200' },
  'CITOLOGÍA':          { icon:'🔬', accent:'#7c3aed', light:'#f5f3ff', dark:'#4c1d95', border:'border-purple-200' },
  'MICROBIOLOGÍA':      { icon:'🦠', accent:'#059669', light:'#ecfdf5', dark:'#064e3b', border:'border-green-200'  },
  'COPROLOGÍA':         { icon:'🧫', accent:'#0d9488', light:'#f0fdfa', dark:'#134e4a', border:'border-teal-200'   },
  'SEROLOGÍA':          { icon:'💉', accent:'#2563eb', light:'#eff6ff', dark:'#1e3a8a', border:'border-blue-200'   },
  'INMUNOHEMATOLOGÍA':  { icon:'🩺', accent:'#db2777', light:'#fdf2f8', dark:'#831843', border:'border-pink-200'   },
  'OTROS':              { icon:'📝', accent:'#64748b', light:'#f8fafc', dark:'#334155', border:'border-slate-200'  },
}

const INPUT_LABELS = {
  number:  { txt:'NUM',  cls:'bg-blue-100 text-blue-700'   },
  text:    { txt:'TXT',  cls:'bg-slate-100 text-slate-600' },
  select:  { txt:'SEL',  cls:'bg-purple-100 text-purple-700' },
  textarea:{ txt:'PAR',  cls:'bg-amber-100 text-amber-700' },
}

function catM(cat) {
  return CAT_META[cat] || { icon:'🔬', accent:'#64748b', light:'#f8fafc', dark:'#334155', border:'border-slate-200' }
}
function areaNum(cat) {
  const i = CAT_ORDER.indexOf(cat)
  return i >= 0 ? i + 1 : '?'
}

// ── Editor de Examen ────────────────────────────────────────────────────────────
function ExamEditor({ exam, onSave, onClose }) {
  const { addNotification } = useAppStore()
  const [form, setForm] = useState({
    category: exam?.category || 'HEMATOLOGÍA',
    customCat: '',
    name: exam?.name || '', code: exam?.code || '',
    price: exam?.price || '', description: exam?.description || '',
    show_subtitle: exam?.show_subtitle ?? 1,
    print_columns: exam?.print_columns ?? 0,
    subtitles: (() => { try { return exam?.subtitles_config ? JSON.parse(exam.subtitles_config).map(s => ({ ...s, _str: (s.params||[]).join(', ') })) : [] } catch { return [] } })(),
  })
  const [params,        setParams]        = useState([])
  const [removedParams, setRemovedParams] = useState([])
  const [loading,       setLoading]       = useState(false)
  const [saving,        setSaving]        = useState(false)

  const addSub    = () => setForm(f => ({ ...f, subtitles: [...f.subtitles, { label: '', visible: true, params: [], _str: '' }] }))
  const rmSub     = i  => setForm(f => ({ ...f, subtitles: f.subtitles.filter((_, j) => j !== i) }))
  const setSub    = (i, k, v) => setForm(f => ({ ...f, subtitles: f.subtitles.map((s, j) => j === i ? { ...s, [k]: v } : s) }))
  const addSubParam = (i, pname) => setForm(f => ({
    ...f,
    subtitles: f.subtitles.map((s, j) => {
      if (j !== i) return s
      const parts = (s._str || '').split(',').map(x => x.trim()).filter(Boolean)
      if (parts.includes(pname)) return s
      const newStr = parts.length ? parts.join(', ') + ', ' + pname : pname
      return { ...s, _str: newStr }
    })
  }))

  useEffect(() => {
    if (!exam?.id) { setParams([]); return }
    setLoading(true)
    examService.getParameters(exam.id).then(async ps => {
      const enriched = await Promise.all(ps.map(async p => {
        const refs = await db.query('SELECT * FROM reference_values WHERE parameter_id=?', [p.id])
        const hasSexRef = refs.some(r => r.sex === 'M' || r.sex === 'F')
        const mRef = refs.find(r => r.sex === 'M') || {}
        const fRef = refs.find(r => r.sex === 'F') || {}
        const commonRef = refs.find(r => !r.sex) || {}
        return {
          ...p, _new: false,
          _sexRef:   hasSexRef,
          _refText:  commonRef.text_value || '',
          _refMin:   hasSexRef ? (mRef.value_min ?? '') : (commonRef.value_min ?? ''),
          _refMax:   hasSexRef ? (mRef.value_max ?? '') : (commonRef.value_max ?? ''),
          _refMinF:  fRef.value_min ?? '',
          _refMaxF:  fRef.value_max ?? '',
          _refTextM: mRef.text_value || '',
          _refTextF: fRef.text_value || '',
          _refs: refs,
        }
      }))
      setParams(enriched)
    }).catch(() => setParams([])).finally(() => setLoading(false))
  }, [exam?.id])

  const addParam = () => setParams(p => [...p, {
    _new: true, id: generateId(), name: '', unit: '', input_type: 'number',
    sort_order: p.length, _refText: '', _refMin: '', _refMax: '',
    _refMinF: '', _refMaxF: '', _sexRef: false, _refTextM: '', _refTextF: '',
  }])
  const rmParam = i  => {
    const p = params[i]
    if (p && !p._new) setRemovedParams(r => [...r, p.id])
    setParams(ps => ps.filter((_, x) => x !== i))
  }
  const setP    = (i, k, v) => setParams(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const finalCat = form.category === '__new__' ? form.customCat.toUpperCase().trim() : form.category

  async function handleSave() {
    if (!form.name.trim()) { addNotification('Nombre requerido', 'warning'); return }
    if (form.category === '__new__' && !form.customCat.trim()) { addNotification('Escribe el nombre del área nueva', 'warning'); return }
    if (!finalCat)         { addNotification('Categoría requerida', 'warning'); return }
    // Validar min/max en parámetros numéricos
    for (const p of params) {
      if (!p.name.trim() || p.input_type === 'select' || p.input_type === 'text' || p.input_type === 'textarea') continue
      if (p._sexRef) {
        const minM = p._refMin !== '' ? parseFloat(p._refMin) : null
        const maxM = p._refMax !== '' ? parseFloat(p._refMax) : null
        const minF = p._refMinF !== '' ? parseFloat(p._refMinF) : null
        const maxF = p._refMaxF !== '' ? parseFloat(p._refMaxF) : null
        if (minM != null && maxM != null && minM > maxM) { addNotification(`"${p.name}" Masculino: Mín no puede ser mayor que Máx`, 'warning'); return }
        if (minF != null && maxF != null && minF > maxF) { addNotification(`"${p.name}" Femenino: Mín no puede ser mayor que Máx`, 'warning'); return }
      } else {
        const min = p._refMin !== '' ? parseFloat(p._refMin) : null
        const max = p._refMax !== '' ? parseFloat(p._refMax) : null
        if (min != null && max != null && min > max) { addNotification(`"${p.name}": Mín no puede ser mayor que Máx`, 'warning'); return }
      }
    }
    setSaving(true)
    try {
      // Asegurar columnas (pueden no existir si Electron no reinició)
      try { await db.run("ALTER TABLE exams ADD COLUMN show_subtitle INTEGER DEFAULT 1") } catch {}
      try { await db.run("ALTER TABLE exams ADD COLUMN subtitles_config TEXT DEFAULT NULL") } catch {}
      try { await db.run("ALTER TABLE exams ADD COLUMN print_columns INTEGER DEFAULT 0") } catch {}

      const subtitlesJson = JSON.stringify(
        form.subtitles
          .filter(s => s.label.trim())
          // eslint-disable-next-line no-unused-vars
          .map(({ _str, ...s }) => ({ ...s, params: (_str||'').split(',').map(p => p.trim()).filter(Boolean) }))
      )

      const eid = exam?.id || generateId()
      if (exam?.id) {
        await db.run(
          `UPDATE exams SET category=?,name=?,code=?,price=?,description=?,show_subtitle=?,subtitles_config=?,print_columns=? WHERE id=?`,
          [finalCat, form.name.trim(), form.code.trim() || null, parseFloat(form.price) || 0, form.description || null, form.show_subtitle ? 1 : 0, subtitlesJson, form.print_columns ? 1 : 0, eid]
        )
      } else {
        await db.run(
          `INSERT INTO exams (id,category,name,code,price,description,currency,active,synced,show_subtitle,subtitles_config,print_columns) VALUES (?,?,?,?,?,?,'Bs',1,0,?,?,?)`,
          [eid, finalCat, form.name.trim(), form.code.trim() || null, parseFloat(form.price) || 0, form.description || null, form.show_subtitle ? 1 : 0, subtitlesJson, form.print_columns ? 1 : 0]
        )
      }

      // Eliminar parámetros removidos del UI
      for (const pid of removedParams) {
        await db.run('DELETE FROM results WHERE parameter_id=?', [pid])
        await db.run('DELETE FROM reference_values WHERE parameter_id=?', [pid])
        await db.run('DELETE FROM exam_parameters WHERE id=?', [pid])
      }
      setRemovedParams([])

      for (let i = 0; i < params.length; i++) {
        const p = params[i]
        if (!p.name.trim()) continue
        if (p._new || !exam?.id) {
          await db.run(
            `INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)`,
            [p.id, eid, p.name.trim(), p.unit || '', p.input_type || 'number', i]
          )
        } else {
          await db.run(
            `UPDATE exam_parameters SET name=?,unit=?,input_type=?,sort_order=? WHERE id=?`,
            [p.name.trim(), p.unit || '', p.input_type || 'number', i, p.id]
          )
        }
        await db.run('DELETE FROM reference_values WHERE parameter_id=?', [p.id])
        if (p.input_type === 'select') {
          if (p._refText?.trim())
            await db.run(
              `INSERT INTO reference_values (id,parameter_id,text_value) VALUES (?,?,?)`,
              [generateId(), p.id, p._refText.trim()]
            )
        } else if (p._sexRef) {
          // Guardar refs separadas por sexo (con texto interpretativo opcional)
          if (p._refMin !== '' || p._refMax !== '' || p._refTextM?.trim())
            await db.run(
              `INSERT INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,0,999,?,?,?)`,
              [generateId(), p.id, 'M',
               p._refMin !== '' ? parseFloat(p._refMin) : null,
               p._refMax !== '' ? parseFloat(p._refMax) : null,
               p._refTextM?.trim() || null]
            )
          if (p._refMinF !== '' || p._refMaxF !== '' || p._refTextF?.trim())
            await db.run(
              `INSERT INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,0,999,?,?,?)`,
              [generateId(), p.id, 'F',
               p._refMinF !== '' ? parseFloat(p._refMinF) : null,
               p._refMaxF !== '' ? parseFloat(p._refMaxF) : null,
               p._refTextF?.trim() || null]
            )
        } else {
          // Referencia común (sin distinción de sexo)
          if (p._refMin !== '' || p._refMax !== '' || p._refText?.trim())
            await db.run(
              `INSERT INTO reference_values (id,parameter_id,value_min,value_max,text_value) VALUES (?,?,?,?,?)`,
              [generateId(), p.id,
               p.input_type === 'number' && p._refMin !== '' ? parseFloat(p._refMin) : null,
               p.input_type === 'number' && p._refMax !== '' ? parseFloat(p._refMax) : null,
               p._refText?.trim() || null]
            )
        }
      }
      addNotification(exam?.id ? 'Examen actualizado' : 'Examen creado', 'success')
      onSave()
    } catch (e) { addNotification('Error: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      {/* Categoría y datos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label-field">Área / Categoría *</label>
          <select className="input-field" value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {CAT_ORDER.map(c => (
              <option key={c} value={c}>{areaNum(c)}. {catM(c).icon} {c}</option>
            ))}
            <option value="__new__">+ Nueva área...</option>
          </select>
          {form.category === '__new__' && (
            <input className="input-field mt-2" placeholder="NOMBRE DEL ÁREA EN MAYÚSCULAS"
              value={form.customCat} onChange={e => setForm(f => ({ ...f, customCat: e.target.value }))}/>
          )}
        </div>
        <div className="col-span-2">
          <label className="label-field">Nombre del Examen *</label>
          <input className="input-field font-semibold" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Hemograma Completo"/>
        </div>
        <div>
          <label className="label-field">Código</label>
          <input className="input-field font-mono text-sm uppercase" value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="HEM-001"/>
        </div>
        <div>
          <label className="label-field">Precio (Bs)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Bs</span>
            <input type="number" step="0.5" className="input-field pl-8" value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00"/>
          </div>
        </div>
      </div>

      {/* Opciones de impresión */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 space-y-3">
        <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Opciones de impresión</p>

        {/* Subtítulo nivel 2 */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!form.show_subtitle}
            onChange={e => setForm(f => ({ ...f, show_subtitle: e.target.checked ? 1 : 0 }))}
            className="w-4 h-4 rounded accent-blue-600"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Mostrar nombre del examen como subtítulo (nivel 2)
          </span>
        </label>

        {/* Columnas compactas en PDF */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!form.print_columns}
            onChange={e => setForm(f => ({ ...f, print_columns: e.target.checked ? 1 : 0 }))}
            className="w-4 h-4 rounded accent-indigo-600"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Imprimir en columnas compactas (3 por fila, ahorra espacio)
          </span>
        </label>

        {/* Sub-subtítulos nivel 3 */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Sub-subtítulos en PDF <span className="font-normal text-slate-400">(nivel 3)</span>
            </span>
            <button type="button" onClick={addSub}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
              <Plus size={11}/> Agregar grupo
            </button>
          </div>

          {form.subtitles.length === 0 && (
            <p className="text-[11px] text-slate-400 italic py-1">Sin grupos configurados — los parámetros se imprimen sin división</p>
          )}

          <div className="space-y-2">
            {form.subtitles.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-2.5">
                {/* Cabecera: label + visible + delete */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    className="input-field flex-1 py-1 text-xs"
                    value={s.label}
                    onChange={e => setSub(i, 'label', e.target.value)}
                    placeholder="Ej: Examen Macroscópico"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={s.visible !== false}
                      onChange={e => setSub(i, 'visible', e.target.checked)}
                      className="w-3.5 h-3.5 accent-blue-600"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Mostrar</span>
                  </label>
                  <button type="button" onClick={() => rmSub(i)}
                    className="w-6 h-6 rounded flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
                    <X size={11}/>
                  </button>
                </div>
                {/* Prefijos de parámetros — texto libre */}
                <input
                  className="input-field w-full py-1 text-[11px] font-mono"
                  value={s._str || ''}
                  onChange={e => setSub(i, '_str', e.target.value)}
                  placeholder="Ej: Consistencia, Moco, Restos  (vacío = todos los restantes)"
                />
                {/* Chips de parámetros disponibles — clic para agregar */}
                {params.filter(p => p.name?.trim()).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] text-slate-400 self-center mr-0.5">Agregar:</span>
                    {params.filter(p => p.name?.trim()).map(p => (
                      <button type="button" key={p.id}
                        onClick={() => addSubParam(i, p.name.trim())}
                        className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors leading-none">
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Prefijos separados por coma. Dejar vacío = captura todos los parámetros restantes.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Parámetros */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            Parámetros <span className="text-slate-400 font-normal">({params.length})</span>
          </p>
          <button onClick={addParam} className="btn-primary text-xs py-1.5 px-3">
            <Plus size={12}/> Agregar
          </button>
        </div>

        {loading && <div className="text-center py-6 text-sm text-slate-400">Cargando...</div>}

        {!loading && params.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
            <Beaker size={28} className="mx-auto mb-2 text-slate-300"/>
            <p className="text-sm text-slate-400 mb-2">Sin parámetros</p>
            <button onClick={addParam} className="text-xs text-blue-600 font-bold hover:underline">
              + Agregar primero
            </button>
          </div>
        )}

        <div className="space-y-3">
          {params.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
              <div className="flex gap-2 mb-2.5">
                <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
                <input className="input-field flex-1 py-1.5 text-sm font-semibold" value={p.name}
                  onChange={e => setP(i, 'name', e.target.value)} placeholder="Nombre del parámetro"/>
                <button onClick={() => rmParam(i)} className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                  <X size={13}/>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <p className="text-[10px] text-slate-400 mb-1 font-semibold uppercase">Unidad</p>
                  <input className="input-field text-xs py-1.5" value={p.unit || ''}
                    onChange={e => setP(i, 'unit', e.target.value)} placeholder="mg/dL"/>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1 font-semibold uppercase">Tipo resultado</p>
                  <select className="input-field text-xs py-1.5" value={p.input_type || 'number'}
                    onChange={e => setP(i, 'input_type', e.target.value)}>
                    <option value="number">Numérico</option>
                    <option value="text">Texto (literal)</option>
                    <option value="select">Opciones (lista)</option>
                    <option value="textarea">Párrafo</option>
                  </select>
                </div>
              </div>

              {/* ── Referencias ──────────────────────────────────────── */}

              {/* Select: opciones pipe-separated */}
              {p.input_type === 'select' && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-1 font-semibold uppercase">Opciones (separar con |)</p>
                  <input className="input-field text-xs py-1.5" value={p._refText || ''}
                    onChange={e => setP(i, '_refText', e.target.value)}
                    placeholder="Opción A|Opción B|Opción C"/>
                </div>
              )}

              {/* Number y Text: con opción de ref por sexo y texto descriptivo */}
              {(p.input_type === 'number' || p.input_type === 'text') && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={!!p._sexRef}
                      onChange={e => setP(i, '_sexRef', e.target.checked)}
                      className="w-3.5 h-3.5 accent-blue-600"/>
                    <Users size={11} className="text-slate-400"/>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Diferente por sexo (M / F)</span>
                  </label>

                  {/* Sin distinción de sexo */}
                  {!p._sexRef && (
                    <div className="space-y-1.5 pl-1">
                      {p.input_type === 'number' && (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <p className="text-[10px] text-slate-400 mb-1">Mín (detección alterado)</p>
                            <input type="number" step="any" className="input-field text-xs py-1.5"
                              value={p._refMin ?? ''} onChange={e => setP(i, '_refMin', e.target.value)} placeholder="—"/>
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] text-slate-400 mb-1">Máx (detección alterado)</p>
                            <input type="number" step="any" className="input-field text-xs py-1.5"
                              value={p._refMax ?? ''} onChange={e => setP(i, '_refMax', e.target.value)} placeholder="—"/>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-slate-400 mb-1">Texto de referencia (muestra en reporte)</p>
                        <input className="input-field text-xs py-1.5" value={p._refText || ''}
                          onChange={e => setP(i, '_refText', e.target.value)}
                          placeholder='Ej: < 200 Óptimo; 200-239 Moderado; >239 Alto  ó  Negativo / Positivo'/>
                      </div>
                    </div>
                  )}

                  {/* Con distinción de sexo */}
                  {p._sexRef && (
                    <div className="space-y-2 pl-1">
                      {/* Masculino */}
                      <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 p-2.5 space-y-1.5">
                        <p className="text-[10px] font-extrabold text-blue-500 flex items-center gap-1">
                          <User size={9}/> Masculino
                        </p>
                        {p.input_type === 'number' && (
                          <div className="flex gap-2">
                            <input type="number" step="any" className="input-field text-xs py-1.5 flex-1"
                              value={p._refMin ?? ''} onChange={e => setP(i, '_refMin', e.target.value)} placeholder="Mín"/>
                            <input type="number" step="any" className="input-field text-xs py-1.5 flex-1"
                              value={p._refMax ?? ''} onChange={e => setP(i, '_refMax', e.target.value)} placeholder="Máx"/>
                          </div>
                        )}
                        <input className="input-field text-xs py-1.5 w-full" value={p._refTextM || ''}
                          onChange={e => setP(i, '_refTextM', e.target.value)}
                          placeholder='Texto para masculino (ej: > 0.6 Positivo; ≤ 0.6 Negativo)'/>
                      </div>
                      {/* Femenino */}
                      <div className="rounded-lg border border-pink-100 dark:border-pink-900/30 p-2.5 space-y-1.5">
                        <p className="text-[10px] font-extrabold text-pink-500 flex items-center gap-1">
                          <User size={9}/> Femenino
                        </p>
                        {p.input_type === 'number' && (
                          <div className="flex gap-2">
                            <input type="number" step="any" className="input-field text-xs py-1.5 flex-1"
                              value={p._refMinF ?? ''} onChange={e => setP(i, '_refMinF', e.target.value)} placeholder="Mín"/>
                            <input type="number" step="any" className="input-field text-xs py-1.5 flex-1"
                              value={p._refMaxF ?? ''} onChange={e => setP(i, '_refMaxF', e.target.value)} placeholder="Máx"/>
                          </div>
                        )}
                        <input className="input-field text-xs py-1.5 w-full" value={p._refTextF || ''}
                          onChange={e => setP(i, '_refTextF', e.target.value)}
                          placeholder='Texto para femenino'/>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 pb-1">
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={13}/>{saving ? 'Guardando...' : exam?.id ? 'Actualizar' : 'Crear Examen'}
        </button>
      </div>
    </div>
  )
}

// ── Helpers de referencia ───────────────────────────────────────────────────────
function RefDisplay({ refs, unit }) {
  if (!refs || refs.length === 0) return <span className="text-slate-300 text-xs">—</span>

  const hasSelect = refs.find(r => r.text_value?.includes('|'))
  if (hasSelect) {
    const opts = hasSelect.text_value.split('|').length
    return (
      <span className="text-[10px] text-slate-400 flex items-center gap-1">
        <span className="w-4 h-4 rounded bg-purple-100 text-purple-600 text-[9px] font-bold flex items-center justify-center">{opts}</span>
        opciones
      </span>
    )
  }

  const mRef = refs.find(r => r.sex === 'M')
  const fRef = refs.find(r => r.sex === 'F')
  const commonRef = refs.find(r => !r.sex)

  function refStr(r) {
    if (!r) return null
    // Texto interpretativo tiene prioridad
    if (r.text_value) return r.text_value
    const u = unit ? ` ${unit}` : ''
    if (r.value_min != null && r.value_max != null) return `${r.value_min} – ${r.value_max}${u}`
    if (r.value_max != null) return `≤ ${r.value_max}${u}`
    if (r.value_min != null) return `≥ ${r.value_min}${u}`
    return null
  }

  if (mRef || fRef) {
    const ms = refStr(mRef)
    const fs = refStr(fRef)
    return (
      <div className="space-y-0.5">
        {ms && <div className="flex items-start gap-1">
          <span className="text-[9px] font-bold text-blue-500 w-3 flex-shrink-0 mt-0.5">M:</span>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">{ms}</span>
        </div>}
        {fs && <div className="flex items-start gap-1">
          <span className="text-[9px] font-bold text-pink-500 w-3 flex-shrink-0 mt-0.5">F:</span>
          <span className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">{fs}</span>
        </div>}
      </div>
    )
  }
  const cs = refStr(commonRef)
  if (cs) return <span className="text-xs text-slate-600 dark:text-slate-400 leading-tight">{cs}</span>
  return <span className="text-slate-300 text-xs">—</span>
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function ExamCatalogPage() {
  const { user, addNotification } = useAppStore()
  const isAdmin = user?.role === 'administrador'

  const [all,           setAll]          = useState([])
  const [selected,      setSelected]     = useState(null)
  const [params,        setParams]       = useState([])
  const [loadingParams, setLoadingParams]= useState(false)
  const [search,        setSearch]       = useState('')
  const [catFilter,     setCatFilter]    = useState(null)
  const [collapsed,     setCollapsed]    = useState({})
  const [editPrice,     setEditPrice]    = useState(null)
  const [priceVal,      setPriceVal]     = useState('')
  const [editorOpen,    setEditorOpen]   = useState(false)
  const [editingExam,   setEditingExam]  = useState(null)
  const [savingPrice,   setSavingPrice]  = useState(false)
  const [deleteOpen,    setDeleteOpen]   = useState(false)
  const [deleteConfirm, setDeleteConfirm]= useState('')
  const [deletePass,    setDeletePass]   = useState('')
  const [deleteUsage,   setDeleteUsage]  = useState(0)
  const [deleting,      setDeleting]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const exams = await examService.getAll()
    setAll(exams)
    if (!selected && exams.length) selectExam(exams[0])
  }

  async function selectExam(exam) {
    setSelected(exam)
    setLoadingParams(true)
    const examId = exam.id
    try {
      const ps = await examService.getParameters(examId)
      const enriched = await Promise.all(ps.map(async p => {
        const refs = await db.query('SELECT * FROM reference_values WHERE parameter_id=?', [p.id])
        return { ...p, refs }
      }))
      // Descartar resultado si el usuario ya cambió a otro examen
      setSelected(curr => {
        if (curr?.id === examId) setParams(enriched)
        return curr
      })
    } catch { setParams([]) }
    finally { setLoadingParams(false) }
  }

  // Categorías presentes
  const cats = [
    ...CAT_ORDER.filter(c => all.some(e => e.category === c)),
    ...all.map(e => e.category).filter(c => !CAT_ORDER.includes(c))
      .filter((c, i, a) => a.indexOf(c) === i).sort()
  ]

  // Exámenes filtrados
  const filtered = all.filter(e => {
    const matchCat    = !catFilter || e.category === catFilter
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
      || (e.code || '').toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // Agrupar y ordenar por categoría
  const grouped = {}
  for (const e of filtered) {
    if (!grouped[e.category]) grouped[e.category] = []
    grouped[e.category].push(e)
  }
  // Ordenar exámenes dentro de cada categoría por código
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => (a.code || '').localeCompare(b.code || ''))
  }
  const sortedCats = [
    ...CAT_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CAT_ORDER.includes(c)).sort()
  ]

  async function savePrice() {
    if (!editPrice) return
    const price = parseFloat(priceVal)
    if (isNaN(price) || price < 0) { addNotification('Precio inválido — debe ser 0 o mayor', 'warning'); return }
    setSavingPrice(true)
    try {
      await db.run('UPDATE exams SET price=? WHERE id=?', [price, editPrice.id])
      addNotification('Precio actualizado', 'success')
      setEditPrice(null)
      load()
    } catch { addNotification('Error', 'error') }
    finally { setSavingPrice(false) }
  }

  function afterSave() { setEditorOpen(false); setEditingExam(null); load() }

  async function openDelete() {
    if (!selected) return
    const rows = await db.query('SELECT COUNT(*) as cnt FROM order_exams WHERE exam_id=?', [selected.id])
    setDeleteUsage(rows[0]?.cnt || 0)
    setDeleteConfirm('')
    setDeletePass('')
    setDeleteOpen(true)
  }

  async function handleDelete() {
    if (!selected) return
    if (deleteConfirm.trim().toLowerCase() !== selected.name.trim().toLowerCase()) {
      addNotification('El nombre no coincide', 'warning'); return
    }
    // Verificar contraseña del usuario actual (SHA-256)
    const { user } = useAppStore.getState()
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deletePass)))
    ).map(b => b.toString(16).padStart(2,'0')).join('')
    const valid = await db.get('SELECT id FROM users WHERE id=? AND password_hash=?', [user.id, hash])
    if (!valid) { addNotification('Contraseña incorrecta', 'error'); return }

    setDeleting(true)
    try {
      const inUse = deleteUsage > 0
      if (inUse) {
        // Soft delete — conserva historial
        await db.run('UPDATE exams SET active=0 WHERE id=?', [selected.id])
        addNotification('Examen desactivado (tiene órdenes asociadas)', 'success')
      } else {
        // Hard delete — cascada completa
        const paramIds = (await db.query('SELECT id FROM exam_parameters WHERE exam_id=?', [selected.id])).map(p => p.id)
        for (const pid of paramIds) {
          await db.run('DELETE FROM results WHERE parameter_id=?', [pid])
          await db.run('DELETE FROM reference_values WHERE parameter_id=?', [pid])
        }
        await db.run('DELETE FROM exam_parameters WHERE exam_id=?', [selected.id])
        await db.run('DELETE FROM exams WHERE id=?', [selected.id])
        addNotification('Examen eliminado permanentemente', 'success')
      }
      setDeleteOpen(false)
      setSelected(null)
      setParams([])
      load()
    } catch(e) { addNotification('Error al eliminar: ' + e.message, 'error') }
    finally { setDeleting(false) }
  }

  // ── Exportar catálogo ────────────────────────────────────────────────────
  // Arma el snapshot completo: catálogo + configuración del laboratorio.
  // Se excluyen credenciales SMTP y flags internos de sync/migración: no deben
  // viajar en un archivo que se comparte entre equipos.
  async function buildCatalogSnapshot() {
    const [exams, params, refs, labConfig] = await Promise.all([
      db.query('SELECT * FROM exams WHERE active=1 ORDER BY category,code'),
      db.query('SELECT * FROM exam_parameters ORDER BY exam_id,sort_order'),
      db.query('SELECT * FROM reference_values'),
      db.query(`SELECT key,value FROM lab_config
                WHERE key NOT LIKE 'smtp%' AND key NOT LIKE 'migration%' AND key<>'initial_sync_done'`),
    ])
    return { version:2, exportedAt: new Date().toISOString(), exams, params, refs, labConfig }
  }

  async function handleExport() {
    try {
      const content = JSON.stringify(await buildCatalogSnapshot(), null, 2)
      const date = new Date().toISOString().slice(0,10)
      const r = await window.electron.catalog.exportToFile({ content, defaultName: `catalogo-mendlab-${date}.json` })
      if (r.canceled) return
      if (r.error) throw new Error(r.error)
      addNotification('Catálogo y configuración exportados correctamente', 'success')
    } catch(e) { addNotification('Error al exportar: ' + e.message, 'error') }
  }

  // ── Importar catálogo ────────────────────────────────────────────────────
  // Blindado: (1) respaldo automático del estado actual antes de tocar nada,
  // (2) aplicación en UNA transacción — si algo falla no queda nada a medias,
  // (3) acepta archivos v1 (solo catálogo) y v2 (catálogo + configuración).
  async function handleImport() {
    if (!window.confirm('¿Importar catálogo? Los exámenes y parámetros existentes serán reemplazados por los del archivo.\n\nAntes de importar se guardará un respaldo automático de tu configuración actual.')) return
    try {
      const r = await window.electron.catalog.importFromFile()
      if (r.canceled) return
      if (r.error) throw new Error(r.error)
      const data = JSON.parse(r.data)
      const { exams, params, refs, labConfig } = data
      if (!Array.isArray(exams) || !Array.isArray(params) || !Array.isArray(refs))
        throw new Error('Archivo inválido — falta exams, params o refs')

      // Validar antes de tocar nada
      const invalidExam = exams.find(e => !e.id || !e.name?.trim() || !e.category?.trim())
      if (invalidExam) throw new Error('Archivo inválido — hay exámenes sin id, nombre o categoría')
      const invalidParam = params.find(p => !p.id || !p.exam_id || !p.name?.trim())
      if (invalidParam) throw new Error('Archivo inválido — hay parámetros sin id, exam_id o nombre')

      // RESPALDO AUTOMÁTICO — si no se puede guardar, se aborta la importación
      let backupPath = null
      try {
        const snapshot = JSON.stringify(await buildCatalogSnapshot(), null, 2)
        const dir = await window.electron.app.getUserDataPath()
        const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        backupPath = `${dir}/respaldo-catalogo-${ts}.json`
        const w = await window.electron.fs.writeFile({ filePath: backupPath, content: snapshot })
        if (w?.error) throw new Error(w.error)
      } catch(e) {
        throw new Error(`No se pudo crear el respaldo automático (${e.message}). Importación cancelada por seguridad.`)
      }

      // Asegurar columnas (fuera de la transacción: ALTER no es transaccional igual)
      try { await db.run('ALTER TABLE exams ADD COLUMN show_subtitle INTEGER DEFAULT 1') } catch {}
      try { await db.run('ALTER TABLE exams ADD COLUMN subtitles_config TEXT DEFAULT NULL') } catch {}
      try { await db.run('ALTER TABLE exams ADD COLUMN print_columns INTEGER DEFAULT 0') } catch {}

      // Detectar qué ya existe (lecturas previas, la escritura va toda junta)
      const existingExamIds  = new Set((await db.query('SELECT id FROM exams')).map(x => x.id))
      const existingParamIds = new Set((await db.query('SELECT id FROM exam_parameters')).map(x => x.id))

      const ops = []

      for (const e of exams) {
        if (existingExamIds.has(e.id)) {
          ops.push({ sql:'UPDATE exams SET category=?,name=?,code=?,description=?,price=?,currency=?,active=?,show_subtitle=?,subtitles_config=?,print_columns=? WHERE id=?',
            params:[e.category,e.name,e.code,e.description??null,e.price,e.currency??'Bs',e.active??1,e.show_subtitle??1,e.subtitles_config??null,e.print_columns??0,e.id] })
        } else {
          ops.push({ sql:'INSERT INTO exams (id,category,name,code,description,price,currency,active,show_subtitle,subtitles_config,print_columns) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            params:[e.id,e.category,e.name,e.code,e.description??null,e.price,e.currency??'Bs',e.active??1,e.show_subtitle??1,e.subtitles_config??null,e.print_columns??0] })
        }
      }

      for (const p of params) {
        if (existingParamIds.has(p.id)) {
          ops.push({ sql:'UPDATE exam_parameters SET exam_id=?,name=?,unit=?,input_type=?,sort_order=? WHERE id=?',
            params:[p.exam_id,p.name,p.unit??'',p.input_type??'number',p.sort_order??0,p.id] })
        } else {
          ops.push({ sql:'INSERT INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)',
            params:[p.id,p.exam_id,p.name,p.unit??'',p.input_type??'number',p.sort_order??0] })
        }
      }

      // Referencias: reemplazar todas las de los parámetros importados
      const paramIdSet = new Set(params.map(p => p.id))
      for (const pid of paramIdSet) {
        ops.push({ sql:'DELETE FROM reference_values WHERE parameter_id=?', params:[pid] })
      }
      for (const ref of refs) {
        if (paramIdSet.has(ref.parameter_id)) {
          ops.push({ sql:'INSERT OR REPLACE INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,?,?,?,?,?)',
            params:[ref.id,ref.parameter_id,ref.sex??null,ref.age_min??0,ref.age_max??999,ref.value_min??null,ref.value_max??null,ref.text_value??null] })
        }
      }

      // Configuración del laboratorio (solo archivos v2; nunca credenciales SMTP)
      let cfgCount = 0
      if (Array.isArray(labConfig)) {
        for (const c of labConfig) {
          if (!c?.key || String(c.key).startsWith('smtp') || String(c.key).startsWith('migration') || c.key === 'initial_sync_done') continue
          ops.push({ sql:"INSERT INTO lab_config (key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')",
            params:[c.key, c.value ?? ''] })
          cfgCount++
        }
      }

      // Todo o nada
      await db.transaction(ops)

      addNotification(
        `Importados ${exams.length} exámenes${cfgCount ? ` y ${cfgCount} ajustes de configuración` : ''}. Respaldo previo guardado.`,
        'success'
      )
      console.info('[Catálogo] Respaldo pre-importación:', backupPath)
      load()
    } catch(e) { addNotification('Error al importar: ' + e.message, 'error') }
  }

  const selMeta = selected ? catM(selected.category) : null
  const toggleCat = cat => setCollapsed(p => ({ ...p, [cat]: !p[cat] }))

  // ── Pantalla de bienvenida cuando el catálogo está vacío ─────────────────
  if (all.length === 0) return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-xl shadow-blue-500/25">
            <FlaskConical size={36} className="text-white"/>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mb-2">Catálogo vacío</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
            No hay exámenes configurados. Importa tu catálogo JSON existente o crea uno nuevo desde cero.
          </p>
        </div>

        {/* Opciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* Importar */}
          {window.electron?.isElectron && isAdmin && (
            <button onClick={handleImport}
              className="group flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/10 hover:border-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/20 transition-all duration-200 text-left cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-violet-100 dark:bg-violet-900/40 group-hover:bg-violet-200 dark:group-hover:bg-violet-800/40 flex items-center justify-center transition-colors">
                <Upload size={26} className="text-violet-600 dark:text-violet-400"/>
              </div>
              <div>
                <p className="font-extrabold text-violet-800 dark:text-violet-300 text-base mb-1">Importar catálogo JSON</p>
                <p className="text-violet-600 dark:text-violet-400 text-xs leading-relaxed">
                  Carga tu configuración desde un archivo <code className="bg-violet-200 dark:bg-violet-800 px-1 rounded">.json</code> exportado anteriormente. Restaura todos los exámenes, parámetros y valores de referencia.
                </p>
              </div>
            </button>
          )}

          {/* Crear desde cero */}
          {isAdmin && (
            <button onClick={() => { setEditingExam(null); setEditorOpen(true) }}
              className="group flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10 hover:border-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-all duration-200 text-left cursor-pointer">
              <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/40 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 flex items-center justify-center transition-colors">
                <Plus size={26} className="text-blue-600 dark:text-blue-400"/>
              </div>
              <div>
                <p className="font-extrabold text-blue-800 dark:text-blue-300 text-base mb-1">Crear nuevo examen</p>
                <p className="text-blue-600 dark:text-blue-400 text-xs leading-relaxed">
                  Agrega exámenes manualmente uno a uno. Define categoría, nombre, código, precio, parámetros y valores de referencia.
                </p>
              </div>
            </button>
          )}
        </div>

        {/* Info */}
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
          💡 Después de importar o crear exámenes, podrás seguir agregando, editando y exportando el catálogo normalmente.
        </div>
      </div>

      {/* Modal editor (para crear el primero) */}
      {editorOpen && (
        <Modal isOpen={editorOpen} onClose={() => { setEditorOpen(false); setEditingExam(null) }} title={editingExam ? 'Editar Examen' : 'Nuevo Examen'} size="xl">
          <ExamEditor exam={editingExam} onSave={afterSave} onClose={() => { setEditorOpen(false); setEditingExam(null) }}/>
        </Modal>
      )}
    </div>
  )

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      <div className="px-6 pt-5 pb-0">
        <PageHeader
          title="Catálogo de Exámenes"
          subtitle={`${all.length} exámenes · ${cats.length} áreas`}
          actions={
            <div className="flex gap-2">
              {window.electron?.isElectron && (
                <>
                  <button className="btn-secondary" onClick={handleExport} title="Exportar catálogo a JSON">
                    <Download size={14}/> Exportar
                  </button>
                  {isAdmin && (
                    <button className="btn-secondary" onClick={handleImport} title="Importar catálogo desde JSON">
                      <Upload size={14}/> Importar
                    </button>
                  )}
                </>
              )}
              {isAdmin && (
                <button className="btn-primary" onClick={() => { setEditingExam(null); setEditorOpen(true) }}>
                  <Plus size={15}/> Nuevo Examen
                </button>
              )}
            </div>
          }
        />
      </div>

      <div className="flex flex-1 overflow-hidden px-6 pb-6 gap-4 mt-4">

        {/* ── Col 1: Sidebar de áreas ─────────────────────────────────────────── */}
        <div className="w-56 flex-shrink-0 flex flex-col gap-0.5 overflow-y-auto">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest px-2 mb-2">
            Áreas del Laboratorio
          </p>

          {/* Todos */}
          <button onClick={() => setCatFilter(null)}
            className={clsx(
              'flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all text-xs font-semibold',
              !catFilter
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}>
            <FlaskConical size={13}/>
            <span className="flex-1">Todos</span>
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-md font-bold',
              !catFilter ? 'bg-white/20 text-white dark:bg-black/20 dark:text-slate-900' : 'bg-slate-200 dark:bg-slate-700 text-slate-500')}>
              {all.length}
            </span>
          </button>

          {cats.map(cat => {
            const m   = catM(cat)
            const num = areaNum(cat)
            const cnt = all.filter(e => e.category === cat).length
            const act = catFilter === cat
            return (
              <button key={cat}
                onClick={() => setCatFilter(act ? null : cat)}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all',
                  act ? 'shadow-sm text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
                style={act ? { backgroundColor: m.accent } : {}}>
                {/* Número de área */}
                <span className={clsx(
                  'w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center flex-shrink-0',
                  act ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                )}>{num}</span>
                <span className="text-sm leading-none flex-shrink-0">{m.icon}</span>
                <span className="text-xs font-semibold truncate flex-1">{cat}</span>
                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0',
                  act ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400')}>
                  {cnt}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Col 2: Lista de exámenes (jerárquica) ───────────────────────────── */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input className="input-field pl-8 text-sm py-2 text-xs"
              placeholder="Buscar examen o código..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1">
            {sortedCats.map(cat => {
              const exams = grouped[cat] || []
              const m     = catM(cat)
              const num   = areaNum(cat)
              const open  = collapsed[cat] !== true

              return (
                <div key={cat} className={clsx('rounded-xl border overflow-hidden', m.border)}>
                  {/* Cabecera de área */}
                  <button
                    onClick={() => toggleCat(cat)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                    style={{ background: m.light }}>
                    <span className="w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 text-white"
                      style={{ background: m.accent }}>{num}</span>
                    <span className="text-sm">{m.icon}</span>
                    <span className="text-xs font-extrabold flex-1 uppercase tracking-wide"
                      style={{ color: m.dark }}>{cat}</span>
                    <span className="text-[10px] text-slate-400">{exams.length}</span>
                    {open
                      ? <ChevronDown size={12} style={{ color: m.accent }}/>
                      : <ChevronRight size={12} style={{ color: m.accent }}/>
                    }
                  </button>

                  {/* Sub-exámenes */}
                  {open && (
                    <div className="bg-white dark:bg-slate-900 divide-y divide-slate-50 dark:divide-slate-800/40">
                      {exams.map((exam, idx) => {
                        const isSel = selected?.id === exam.id
                        const subNum = `${num}.${idx + 1}`
                        return (
                          <button key={exam.id}
                            onClick={() => selectExam(exam)}
                            className={clsx(
                              'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all',
                              isSel ? 'text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                            )}
                            style={isSel ? { background: m.accent } : {}}>
                            {/* Sub-número */}
                            <span className={clsx(
                              'text-[9px] font-extrabold w-8 flex-shrink-0 font-mono',
                              isSel ? 'text-white/80' : 'text-slate-400'
                            )}>{subNum}</span>
                            <div className="flex-1 min-w-0">
                              <p className={clsx('text-xs font-semibold truncate', isSel ? 'text-white' : '')}>
                                {exam.name}
                              </p>
                              <p className={clsx('text-[10px] font-mono', isSel ? 'text-white/60' : 'text-slate-400')}>
                                {exam.code}
                              </p>
                            </div>
                            <span className={clsx('text-[11px] font-extrabold flex-shrink-0',
                              isSel ? 'text-white' : 'text-emerald-600 dark:text-emerald-400')}>
                              {(exam.price || 0).toFixed(0)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <Search size={24} className="mx-auto mb-2 opacity-30"/>
                <p className="text-xs">Sin resultados</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Col 3: Panel de detalle ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-slate-300">
              <div className="text-center">
                <FlaskConical size={48} className="mx-auto mb-3 opacity-30"/>
                <p className="text-sm">Selecciona un examen</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header del examen */}
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="px-6 py-5 flex items-start justify-between"
                  style={{ background: `linear-gradient(135deg, ${selMeta?.accent}15 0%, ${selMeta?.accent}06 100%)` }}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{selMeta?.icon}</span>
                      {/* Número de área y sub */}
                      {(() => {
                        const catExams = (grouped[selected.category] || [])
                        const idx = catExams.findIndex(e => e.id === selected.id)
                        const num = areaNum(selected.category)
                        const sub = idx >= 0 ? `${num}.${idx + 1}` : `${num}`
                        return (
                          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-lg text-white"
                            style={{ background: selMeta?.accent }}>
                            {sub}
                          </span>
                        )
                      })()}
                      <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-lg"
                        style={{ backgroundColor: selMeta?.accent + '22', color: selMeta?.accent }}>
                        {selected.category}
                      </span>
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                      {selected.name}
                    </h2>
                    {selected.description && (
                      <p className="text-sm text-slate-500 mt-1">{selected.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Tag size={12} className="text-slate-400"/>
                        <span className="font-mono text-slate-500 text-xs">{selected.code || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">Precio:</span>
                        <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                          Bs {(selected.price || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Activity size={11}/>
                        <span>{params.length} parámetros</span>
                      </div>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2 flex-shrink-0 ml-4">
                      <button
                        onClick={() => { setEditPrice(selected); setPriceVal(String(selected.price || 0)) }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors shadow-sm">
                        <DollarSign size={12}/> Precio
                      </button>
                      <button
                        onClick={() => { setEditingExam(selected); setEditorOpen(true) }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm">
                        <Settings size={12}/> Editar
                      </button>
                      <button
                        onClick={openDelete}
                        title="Eliminar examen"
                        className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/40 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors shadow-sm flex items-center justify-center">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  )}
                </div>

                {/* Tabla de parámetros */}
                <div className="border-t border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-12 px-5 py-2.5 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-3">Parámetro</div>
                    <div className="col-span-2 text-center">Unidad</div>
                    <div className="col-span-2 text-center">Tipo</div>
                    <div className="col-span-4">Valores de Referencia</div>
                  </div>

                  {loadingParams && (
                    <div className="py-10 text-center text-sm text-slate-400">Cargando parámetros...</div>
                  )}
                  {!loadingParams && params.length === 0 && (
                    <div className="py-10 text-center text-sm text-slate-400">Sin parámetros definidos</div>
                  )}

                  {!loadingParams && params.map((p, i) => {
                    const itm = INPUT_LABELS[p.input_type] || INPUT_LABELS.text
                    return (
                      <div key={p.id}
                        className="grid grid-cols-12 items-center px-5 py-3 text-sm border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition-colors">
                        <div className="col-span-1 text-center">
                          <span className="text-xs text-slate-400 font-mono">{i + 1}</span>
                        </div>
                        <div className="col-span-3 font-semibold text-slate-800 dark:text-slate-200 text-sm">
                          {p.name}
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="text-xs font-mono text-slate-500">{p.unit || <span className="text-slate-300">—</span>}</span>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className={clsx('text-[10px] font-extrabold px-2 py-0.5 rounded-lg', itm.cls)}>
                            {itm.txt}
                          </span>
                        </div>
                        <div className="col-span-4">
                          <RefDisplay refs={p.refs} unit={p.unit}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal precio */}
      <Modal isOpen={!!editPrice} onClose={() => { setEditPrice(null); setPriceVal('') }} title="Editar Precio" size="sm">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{editPrice?.name}</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-extrabold text-slate-400">Bs</span>
            <input type="number" step="0.5" autoFocus className="input-field pl-10 text-3xl font-extrabold text-center"
              value={priceVal} onChange={e => setPriceVal(e.target.value)}/>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setEditPrice(null)}>Cancelar</button>
            <button className="btn-primary" onClick={savePrice} disabled={savingPrice}>
              <Save size={13}/>{savingPrice ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal editor */}
      <Modal isOpen={editorOpen} onClose={() => { setEditorOpen(false); setEditingExam(null) }} size="xl"
        title={editingExam ? `Editar: ${editingExam.name}` : 'Nuevo Examen'}>
        <ExamEditor exam={editingExam} onSave={afterSave} onClose={() => { setEditorOpen(false); setEditingExam(null) }}/>
      </Modal>

      {/* Modal eliminar examen */}
      <Modal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar Examen" size="sm">
        <div className="space-y-5">
          {/* Aviso de uso */}
          {deleteUsage > 0 ? (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Examen en uso</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Este examen está en <strong>{deleteUsage}</strong> orden(es). Se <strong>desactivará</strong> (no aparecerá en nuevas órdenes) pero el historial se conserva.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <Trash2 size={16} className="text-red-500 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Eliminación permanente</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  Este examen no tiene órdenes. Se eliminarán permanentemente el examen, sus parámetros y valores de referencia. <strong>Esta acción no se puede deshacer.</strong>
                </p>
              </div>
            </div>
          )}

          {/* Confirmar nombre */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1.5">
              Escribe el nombre del examen para confirmar
            </label>
            <input
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 transition-all font-mono"
              placeholder={selected?.name}
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">Debe coincidir exactamente: <span className="font-mono text-slate-600 dark:text-slate-400">{selected?.name}</span></p>
          </div>

          {/* Contraseña */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
              <Lock size={10}/> Tu contraseña de administrador
            </label>
            <input
              type="password"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 transition-all"
              placeholder="••••••••"
              value={deletePass}
              onChange={e => setDeletePass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDelete()}
            />
          </div>

          {/* Acciones */}
          <div className="flex gap-2 justify-end pt-1">
            <button className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setDeleteOpen(false)}>
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || !deleteConfirm || !deletePass}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
              <Trash2 size={13}/>
              {deleting ? 'Eliminando...' : deleteUsage > 0 ? 'Desactivar Examen' : 'Eliminar Permanentemente'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
