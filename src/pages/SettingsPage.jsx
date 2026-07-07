import { useState, useEffect } from 'react'
import { db } from '../services/database'
import { doctorService } from '../services/doctors'
import { useAppStore } from '../store/appStore'
import { PageHeader, Spinner } from '../components/ui/index'
import { Save, FlaskConical, Mail, Info, Eye, Tag, Upload, Download, Activity, RefreshCw, CheckCircle, XCircle, AlertCircle, ArrowDownToLine, Loader2, UserPlus, Trash2, Edit2, Stethoscope, X, Check } from 'lucide-react'

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron

const LAB_FIELDS = [
  { key:'lab_name',     label:'Nombre del Laboratorio', placeholder:'Laboratorio Clínico LabMend', icon:'🏥' },
  { key:'lab_address',  label:'Dirección',              placeholder:'Av. Principal #123, Ciudad',  icon:'📍' },
  { key:'lab_phone',    label:'Teléfono / WhatsApp',    placeholder:'+591 7xx xxxxx',               icon:'📞' },
  { key:'lab_email',    label:'Correo Electrónico',     placeholder:'lab@ejemplo.com', type:'email', icon:'📧' },
  { key:'lab_director', label:'Director / Resp. Técnico', placeholder:'Dr./Dra. Nombre Apellido',  icon:'👨‍⚕️' },
  { key:'lab_license',  label:'N° Licencia / Reg. Sanitario', placeholder:'Lic. No. 0000',         icon:'📋' },
  { key:'result_footer', label:'Pie de página en PDF', placeholder:'Resultado válido con firma...', textarea:true, icon:'📄' },
]

const SIG_FIELDS = [
  { key:'sig_title', label:'Título de Firma', placeholder:'RESPONSABLE TÉCNICO', icon:'🏷️' },
  { key:'sig_name',  label:'Nombre en Firma', placeholder:'Dr./Dra. Nombre Apellido', icon:'✍️' },
  { key:'sig_extra', label:'Línea adicional en Firma', placeholder:'Ej: Bioquímico Clínico · Reg. 0000', icon:'➕' },
]

const SMTP_FIELDS = [
  { key:'smtp_host', label:'Servidor SMTP', placeholder:'smtp.gmail.com' },
  { key:'smtp_port', label:'Puerto',        placeholder:'587', type:'number' },
  { key:'smtp_user', label:'Usuario / Correo', placeholder:'tucorreo@gmail.com', type:'email' },
  { key:'smtp_pass', label:'Contraseña de App',placeholder:'xxxx xxxx xxxx xxxx', type:'password' },
  { key:'smtp_from', label:'Nombre remitente', placeholder:'LabMend <lab@ejemplo.com>' },
]

export default function SettingsPage() {
  const { addNotification, diagnoseSync, forcePush, fullDownload, syncNow, syncStatus, lastSync, lastSyncErrors, doctors, loadDoctors } = useAppStore()
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('lab')
  const [diagResult, setDiagResult] = useState(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [pushResult, setPushResult] = useState(null)
  const [pushing, setPushing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [dlResult, setDlResult] = useState(null)
  const [doctorForm, setDoctorForm] = useState({ name: '', specialty: '' })
  const [editingDoctor, setEditingDoctor] = useState(null) // id en edición
  const [editForm, setEditForm] = useState({ name: '', specialty: '' })
  const [doctorSaving, setDoctorSaving] = useState(false)
  const [updateStatus, setUpdateStatus] = useState(null)  // null | checking | up-to-date | available | downloading | ready | error
  const [updateInfo,   setUpdateInfo]   = useState({})
  const [appVersion,   setAppVersion]   = useState('')

  useEffect(() => { loadConfig() }, [])

  useEffect(() => {
    if (!isElectron) return
    window.electron.app.getVersion().then(v => setAppVersion(v)).catch(()=>{})
    if (!window.electron?.updater) return
    const unsub = window.electron.updater.onStatus(data => {
      setUpdateStatus(data.event)
      setUpdateInfo(data)
    })
    return unsub
  }, [])

  async function loadConfig() {
    try {
      const rows = await db.query('SELECT key,value FROM lab_config')
      const cfg = {}
      for (const r of rows) cfg[r.key] = r.value || ''
      setConfig(cfg)

    } catch(e) { addNotification('Error al cargar configuración','error') }
    setLoading(false)
  }

  async function addDoctor() {
    if (!doctorForm.name.trim()) return
    setDoctorSaving(true)
    try {
      await doctorService.create(doctorForm)
      await loadDoctors()
      setDoctorForm({ name: '', specialty: '' })
    } catch(e) { addNotification('Error: ' + e.message, 'error') }
    setDoctorSaving(false)
  }

  async function saveEditDoctor(id) {
    if (!editForm.name.trim()) return
    setDoctorSaving(true)
    try {
      await doctorService.update(id, editForm)
      await loadDoctors()
      setEditingDoctor(null)
    } catch(e) { addNotification('Error: ' + e.message, 'error') }
    setDoctorSaving(false)
  }

  async function removeDoctor(id) {
    try {
      await doctorService.remove(id)
      await loadDoctors()
    } catch(e) { addNotification('Error: ' + e.message, 'error') }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const ops = Object.entries(config).map(([key,value]) => ({
        sql: `INSERT INTO lab_config (key,value,updated_at) VALUES (?,?,datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`,
        params: [key, value||'']
      }))
      await db.transaction(ops)
      addNotification('✅ Configuración guardada correctamente', 'success')
    } catch(e) {
      console.error(e)
      addNotification('Error al guardar: ' + e.message, 'error')
    }
    setSaving(false)
  }

  const setField = (key,val) => setConfig(c=>({...c,[key]:val}))

  if (loading) return <div className="flex justify-center p-16"><Spinner/></div>

  return (
    <div>
      <PageHeader title="⚙️ Configuración del Laboratorio"
        subtitle="Datos que aparecerán en reportes PDF, correos y etiquetas"/>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700 shadow-sm w-fit">
        {[['lab','🏥 Laboratorio'],['doctores','👨‍⚕️ Doctores'],['smtp','📧 Correo SMTP'],['sync','☁️ Sincronización'],['update','🔄 Actualización']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all duration-150 ${
              tab===k ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {l}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave}>
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 card p-6 space-y-4">
            {tab === 'lab' && (
              <>
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <FlaskConical size={17} className="text-blue-600 dark:text-blue-400"/>
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900 dark:text-slate-100">Datos del Laboratorio</p>
                    <p className="text-xs text-slate-500">Aparecen en encabezados de reportes PDF</p>
                  </div>
                </div>

                {LAB_FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="label-field">{f.icon} {f.label}</label>
                    {f.textarea ? (
                      <textarea rows={3} className="input-field resize-none"
                        value={config[f.key]||''} onChange={e=>setField(f.key,e.target.value)} placeholder={f.placeholder}/>
                    ) : (
                      <input type={f.type||'text'} className="input-field"
                        value={config[f.key]||''} onChange={e=>setField(f.key,e.target.value)} placeholder={f.placeholder}/>
                    )}
                  </div>
                ))}

                {/* ── Sección exclusiva de firma ── */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-sm">✍️</div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100">Firma en PDF</p>
                      <p className="text-[11px] text-slate-400">Solo aparece debajo de la línea de firma al imprimir. Independiente del encabezado.</p>
                    </div>
                  </div>
                  {SIG_FIELDS.map(f => (
                    <div key={f.key} className="mb-2">
                      <label className="label-field">{f.icon} {f.label}</label>
                      <input type="text" className="input-field"
                        value={config[f.key]||''} onChange={e=>setField(f.key,e.target.value)} placeholder={f.placeholder}/>
                    </div>
                  ))}
                  {/* Vista previa de la firma */}
                  {(config.sig_title || config.sig_name || config.sig_extra) && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-600 text-center">
                      <div className="border-b border-dotted border-slate-400 w-32 mx-auto mb-2"/>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {config.sig_title || 'RESPONSABLE TÉCNICO'}
                      </p>
                      {config.sig_name  && <p className="text-[11px] text-slate-500 mt-0.5">{config.sig_name}</p>}
                      {config.sig_extra && <p className="text-[11px] text-slate-400">{config.sig_extra}</p>}
                    </div>
                  )}
                </div>

                {/* ── Línea de corte en PDF ── */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">✂️</div>
                      <div>
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-100">Línea de corte en PDF</p>
                        <p className="text-[11px] text-slate-400">Imprime una línea punteada al pie de cada página para facilitar el corte</p>
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => setField('pdf_cut_line', config.pdf_cut_line === '1' ? '0' : '1')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        config.pdf_cut_line === '1' ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                      }`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        config.pdf_cut_line === '1' ? 'translate-x-6' : 'translate-x-1'
                      }`}/>
                    </button>
                  </div>
                </div>

                {/* ── Fechas en PDF ── */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-sm">📅</div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100">Fechas en el PDF</p>
                      <p className="text-[11px] text-slate-400">Selecciona qué fechas aparecen en el encabezado del reporte</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { key: 'pdf_fecha_ingreso', label: 'Fecha de Ingreso', desc: 'Fecha en que se creó la orden', def: '1' },
                      { key: 'pdf_fecha_informe', label: 'Fecha de Informe', desc: 'Fecha actual al momento de imprimir', def: '1' },
                      { key: 'pdf_solo_fecha',    label: 'Solo Fecha (sin hora)', desc: 'Muestra únicamente la fecha, sin hora', def: '0' },
                    ].map(({ key, label, desc, def }) => {
                      const active = (config[key] ?? def) === '1'
                      return (
                        <div key={key} className="flex items-center justify-between py-1.5">
                          <div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</p>
                            <p className="text-[11px] text-slate-400">{desc}</p>
                          </div>
                          <button type="button"
                            onClick={() => setField(key, active ? '0' : '1')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                              active ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                            }`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              active ? 'translate-x-6' : 'translate-x-1'
                            }`}/>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── Alertas de valores fuera de rango en PDF ── */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/60">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm">⚠️</div>
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100">Alertas de valores fuera de rango</p>
                      <p className="text-[11px] text-slate-400">Cómo se muestran los valores anormales en el PDF</p>
                    </div>
                  </div>
                  {[
                    { key: 'abnormal_doctor',  label: '📋 PDF del Doctor (Guardar)', def: 'bold' },
                    { key: 'abnormal_patient', label: '🧾 PDF del Paciente (Imprimir)', def: 'none' },
                  ].map(({ key, label, def }) => (
                    <div key={key} className="mb-3">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { val: 'bold',   icon: 'N', label: 'Negrilla' },
                          { val: 'red',    icon: '🔴', label: 'Rojo' },
                          { val: 'none',   icon: '—',  label: 'Sin alerta' },
                        ].map(opt => {
                          const active = (config[key] || def) === opt.val
                          return (
                            <button key={opt.val} type="button"
                              onClick={() => setField(key, opt.val)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-300'
                              }`}>
                              <span className={opt.val === 'bold' ? 'font-black' : ''}>{opt.icon}</span>
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-400 mt-1">Los cambios aplican al próximo PDF generado. Guarda la configuración para que se mantengan.</p>
                </div>
              </>
            )}

            {tab === 'doctores' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
                  <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                    <Stethoscope size={17} className="text-teal-600 dark:text-teal-400"/>
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900 dark:text-slate-100">Médicos Solicitantes</p>
                    <p className="text-xs text-slate-500">Si hay un solo médico registrado, se selecciona automáticamente al crear una orden</p>
                  </div>
                </div>

                {/* Lista de doctores */}
                <div className="space-y-2">
                  {doctors.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                      No hay médicos registrados aún
                    </p>
                  )}
                  {doctors.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                      {editingDoctor === doc.id ? (
                        <>
                          <div className="flex-1 flex gap-2">
                            <input autoFocus className="input-field text-sm flex-1" value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="Nombre completo" onKeyDown={e => e.key==='Enter' && saveEditDoctor(doc.id)}/>
                            <input className="input-field text-sm w-40" value={editForm.specialty}
                              onChange={e => setEditForm(f => ({ ...f, specialty: e.target.value }))}
                              placeholder="Especialidad" onKeyDown={e => e.key==='Enter' && saveEditDoctor(doc.id)}/>
                          </div>
                          <button type="button" onClick={() => saveEditDoctor(doc.id)} disabled={doctorSaving}
                            className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200 transition-colors">
                            <Check size={14}/>
                          </button>
                          <button type="button" onClick={() => setEditingDoctor(null)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 transition-colors">
                            <X size={14}/>
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                            <Stethoscope size={14} className="text-teal-600 dark:text-teal-400"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{doc.name}</p>
                            {doc.specialty && <p className="text-xs text-slate-400 truncate">{doc.specialty}</p>}
                          </div>
                          <button type="button" onClick={() => { setEditingDoctor(doc.id); setEditForm({ name: doc.name, specialty: doc.specialty || '' }) }}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                            <Edit2 size={13}/>
                          </button>
                          <button type="button" onClick={() => removeDoctor(doc.id)}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 size={13}/>
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Agregar nuevo */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/60">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Agregar médico</p>
                  <div className="flex gap-2">
                    <input className="input-field text-sm flex-1" value={doctorForm.name}
                      onChange={e => setDoctorForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Dr./Dra. Nombre Apellido"
                      onKeyDown={e => e.key==='Enter' && (e.preventDefault(), addDoctor())}/>
                    <input className="input-field text-sm w-40" value={doctorForm.specialty}
                      onChange={e => setDoctorForm(f => ({ ...f, specialty: e.target.value }))}
                      placeholder="Especialidad (opcional)"
                      onKeyDown={e => e.key==='Enter' && (e.preventDefault(), addDoctor())}/>
                    <button type="button" onClick={addDoctor} disabled={doctorSaving || !doctorForm.name.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold disabled:opacity-40 transition-colors shrink-0">
                      {doctorSaving ? <Loader2 size={14} className="animate-spin"/> : <UserPlus size={14}/>}
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'smtp' && (
              <>
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <Mail size={17} className="text-emerald-600 dark:text-emerald-400"/>
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900 dark:text-slate-100">Configuración de Correo SMTP</p>
                    <p className="text-xs text-slate-500">Para enviar resultados por email</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 text-sm text-blue-800 dark:text-blue-300">
                  <p className="font-bold mb-2">📌 Configuración rápida con Gmail:</p>
                  <ol className="space-y-1 text-xs list-decimal list-inside">
                    <li>Ve a myaccount.google.com → Seguridad → Verificación en 2 pasos (activar)</li>
                    <li>Luego: Seguridad → Contraseñas de aplicaciones</li>
                    <li>Genera una contraseña para "Correo" y "Windows"</li>
                    <li>Usa esa contraseña de 16 caracteres aquí abajo</li>
                  </ol>
                </div>
                {SMTP_FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="label-field">{f.label}</label>
                    <input type={f.type||'text'} className="input-field"
                      value={config[f.key]||''} onChange={e=>setField(f.key,e.target.value)} placeholder={f.placeholder}/>
                  </div>
                ))}
              </>
            )}

            {tab === 'sync' && (() => {
              const handleDiag = async () => {
                setDiagLoading(true); setDiagResult(null)
                try { setDiagResult(await diagnoseSync()) }
                catch(e) { setDiagResult({ error: e.message }) }
                finally { setDiagLoading(false) }
              }
              const handleForce = async () => {
                if (!window.confirm('¿Subir TODOS los registros locales a Supabase? Esto puede tardar unos segundos.')) return
                setPushing(true); setPushResult(null)
                try { setPushResult(await forcePush()) }
                catch(e) { setPushResult({ success:false, reason:e.message }) }
                finally { setPushing(false) }
              }
              const handleDownload = async () => {
                if (!window.confirm('¿Descargar TODOS los datos desde Supabase? Sobreescribe datos locales.')) return
                setDownloading(true); setDlResult(null)
                try { setDlResult(await fullDownload()) }
                catch(e) { setDlResult({ success:false, reason:e.message }) }
                finally { setDownloading(false) }
              }
              const StatusIcon = ({ok}) => ok === true
                ? <CheckCircle size={13} className="text-emerald-500"/>
                : ok === false ? <XCircle size={13} className="text-red-500"/>
                : <AlertCircle size={13} className="text-amber-500"/>
              return (
                <div className="space-y-5">
                  {/* Estado actual */}
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Upload size={17} className="text-blue-600 dark:text-blue-400"/>
                    </div>
                    <div>
                      <p className="font-extrabold text-slate-900 dark:text-slate-100">Sincronización con Supabase</p>
                      <p className="text-xs text-slate-500">Estado: <span className={`font-bold ${syncStatus==='ok'?'text-emerald-600':syncStatus==='error'?'text-red-500':'text-amber-500'}`}>{syncStatus}</span>
                        {lastSync && <> · Último sync: {lastSync.toLocaleTimeString('es-ES')}</>}
                      </p>
                    </div>
                  </div>

                  {lastSyncErrors?.length > 0 && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 space-y-1">
                      <p className="text-xs font-bold text-red-700 dark:text-red-400">Errores del último sync:</p>
                      {lastSyncErrors.map((e,i) => <p key={i} className="text-xs text-red-600 dark:text-red-300 font-mono">{e}</p>)}
                    </div>
                  )}

                  {/* Botones de acción */}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={syncNow}
                      className="btn-secondary text-xs">
                      <RefreshCw size={13}/> Sync incremental
                    </button>
                    <button type="button" onClick={handleDiag} disabled={diagLoading}
                      className="btn-secondary text-xs">
                      <Activity size={13}/> {diagLoading ? 'Diagnosticando...' : 'Diagnosticar conexión'}
                    </button>
                    <button type="button" onClick={handleForce} disabled={pushing}
                      className="btn-primary text-xs bg-amber-600 hover:bg-amber-700 border-amber-700">
                      <Upload size={13}/> {pushing ? 'Subiendo...' : 'Forzar subida total'}
                    </button>
                    <button type="button" onClick={handleDownload} disabled={downloading}
                      className="btn-primary text-xs bg-violet-600 hover:bg-violet-700 border-violet-700">
                      <Download size={13}/> {downloading ? 'Descargando...' : 'Descarga inicial (nueva PC)'}
                    </button>
                  </div>

                  {/* Resultado diagnóstico */}
                  {diagResult && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                      <p className="font-bold text-slate-700 dark:text-slate-300">Resultado del diagnóstico:</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          ['Supabase configurado', diagResult.configured],
                          ['Conexión a internet',  diagResult.online],
                          ['Cliente listo',        diagResult.clientReady],
                        ].map(([label, val]) => (
                          <div key={label} className="flex items-center gap-1.5">
                            <StatusIcon ok={!!val}/>
                            <span className="text-slate-600 dark:text-slate-400">{label}</span>
                          </div>
                        ))}
                      </div>
                      {diagResult.tables && (
                        <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-700 pt-2">
                          <p className="font-bold text-slate-600 dark:text-slate-400">Tablas:</p>
                          {Object.entries(diagResult.tables).map(([t, info]) => (
                            <div key={t} className="flex items-start gap-2">
                              <StatusIcon ok={info.ok}/>
                              <div>
                                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{t}</span>
                                {info.ok ? (
                                  <span className="text-slate-500 ml-2">
                                    lectura ✓ · escritura {info.writable===true?'✓':info.writable==='no-rows-to-test'?'(sin filas para probar)':'✗'}
                                    {info.pending > 0 && <span className="text-amber-600 font-bold ml-2">{info.pending} pendientes</span>}
                                    {info.writeError && <span className="text-red-500 ml-2">— {info.writeError}</span>}
                                  </span>
                                ) : (
                                  <span className="text-red-500 ml-2">{info.error} {info.code && `(${info.code})`}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {diagResult.error && <p className="text-red-500">{diagResult.error}</p>}
                    </div>
                  )}

                  {/* Resultado force push */}
                  {pushResult && (
                    <div className={`p-3 rounded-xl border text-xs space-y-1 ${pushResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40' : 'bg-red-50 dark:bg-red-900/20 border-red-200'}`}>
                      <p className={`font-bold ${pushResult.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>
                        {pushResult.success ? '✓ Subida completada' : `✗ Error: ${pushResult.reason}`}
                      </p>
                      {pushResult.results && Object.entries(pushResult.results).map(([t,v]) => (
                        <p key={t} className={v.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-400'}>
                          {v.ok ? `✓ ${t}: ${v.count} registros` : `⚠ ${t}: ${v.count || 0} ok, ${v.skipped || 0} omitidos — ${v.error}`}
                        </p>
                      ))}
                    </div>
                  )}

                  {dlResult && (
                    <div className={`p-3 rounded-xl border text-xs space-y-1 ${dlResult.success ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40' : 'bg-red-50 dark:bg-red-900/20 border-red-200'}`}>
                      <p className={`font-bold ${dlResult.success ? 'text-violet-700 dark:text-violet-400' : 'text-red-600'}`}>
                        {dlResult.success ? `✓ Descarga completada — ${dlResult.total} registros` : `✗ ${dlResult.reason}`}
                      </p>
                      {dlResult.errors?.map((e,i) => <p key={i} className="text-amber-600 font-mono">⚠ {e}</p>)}
                    </div>
                  )}
                </div>
              )
            })()}

            {tab === 'update' && (
              <div className="space-y-5">
                {/* Versión actual */}
                <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <ArrowDownToLine size={17} className="text-emerald-600 dark:text-emerald-400"/>
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900 dark:text-slate-100">Actualización automática</p>
                    <p className="text-xs text-slate-500">Versión instalada: <span className="font-bold text-slate-700 dark:text-slate-300">v{appVersion || '—'}</span></p>
                  </div>
                </div>

                {!isElectron && (
                  <p className="text-xs text-slate-500 italic">Las actualizaciones solo están disponibles en la aplicación de escritorio.</p>
                )}

                {isElectron && (
                  <>
                    {/* Estado */}
                    {updateStatus === 'checking' && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 size={15} className="animate-spin"/> Buscando actualizaciones...
                      </div>
                    )}
                    {updateStatus === 'up-to-date' && (
                      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                        <CheckCircle size={15}/> Ya tienes la versión más reciente.
                      </div>
                    )}
                    {updateStatus === 'error' && (
                      <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
                        <p className="text-xs font-bold text-red-700 dark:text-red-400">Error al buscar actualizaciones</p>
                        <p className="text-xs text-red-600 dark:text-red-300 font-mono mt-1">{updateInfo.message}</p>
                      </div>
                    )}
                    {updateStatus === 'available' && (
                      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 space-y-3">
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
                          Nueva versión disponible: v{updateInfo.version}
                        </p>
                        {updateInfo.releaseNotes && (
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            {String(updateInfo.releaseNotes).replace(/<[^>]+>/g,'').slice(0,200)}
                          </p>
                        )}
                        <button onClick={() => window.electron.updater.download()}
                          className="btn-primary text-sm">
                          <Download size={14}/> Descargar actualización
                        </button>
                      </div>
                    )}
                    {updateStatus === 'downloading' && (
                      <div className="space-y-2">
                        <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin"/> Descargando actualización...
                        </p>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div className="h-2 bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${updateInfo.percent || 0}%` }}/>
                        </div>
                        <p className="text-xs text-slate-400 text-right">{updateInfo.percent || 0}%</p>
                      </div>
                    )}
                    {updateStatus === 'ready' && (
                      <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 space-y-3">
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          ¡v{updateInfo.version} lista para instalar!
                        </p>
                        <p className="text-xs text-slate-500">La aplicación se reiniciará para aplicar la actualización.</p>
                        <button onClick={() => window.electron.updater.install()}
                          className="btn-primary text-sm bg-emerald-600 hover:bg-emerald-700 border-emerald-700">
                          <RefreshCw size={14}/> Reiniciar y actualizar
                        </button>
                      </div>
                    )}

                    {/* Botón buscar */}
                    {(!updateStatus || updateStatus === 'up-to-date' || updateStatus === 'error') && (
                      <button onClick={() => { setUpdateStatus('checking'); window.electron.updater.check() }}
                        className="btn-secondary text-sm">
                        <RefreshCw size={14}/> Buscar actualizaciones
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {tab !== 'sync' && tab !== 'update' && (
            <div className="pt-3 flex justify-end">
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={16}/>{saving ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="card p-5">
              <p className="font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2"><Eye size={15}/> Vista Previa PDF</p>
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700">
                <p className="text-sm font-bold text-blue-700 dark:text-blue-400 truncate">{config.lab_name||'Nombre del Laboratorio'}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{config.lab_address||'Dirección'}</p>
                <p className="text-xs text-slate-500">Tel: {config.lab_phone||'Teléfono'}</p>
                <p className="text-xs text-slate-500 truncate">{config.lab_email||'Email'}</p>
                <div className="mt-2 pt-2 border-t border-blue-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{config.lab_director||'Director/a'}</p>
                  <p className="text-xs text-slate-400">{config.lab_license||'Lic. No. —'}</p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-start gap-2">
                <Info size={14} className="text-blue-500 mt-0.5 flex-shrink-0"/>
                <p className="text-xs text-slate-500 leading-relaxed">Los precios de exámenes se configuran desde el <strong>Catálogo de Exámenes</strong> (ícono ✏️ sobre cada examen).</p>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
