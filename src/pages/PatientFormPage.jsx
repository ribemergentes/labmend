import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { patientService } from '../services/patients'
import { useAppStore } from '../store/appStore'
import { Spinner } from '../components/ui/index'
import { ChevronLeft, Save, User, Phone, MapPin, FileText, MessageSquare, Mail } from 'lucide-react'

const DEF = { first_name:'', last_name:'', birth_date:'', sex:'', id_number:'', phone:'', whatsapp:'', email:'', address:'', notes:'' }

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        {label}{required && <span className="text-blue-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-blue-600 dark:text-blue-400"/>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</p>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="pl-11 space-y-4">
        {children}
      </div>
    </div>
  )
}

const inputCls = "w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 dark:focus:border-blue-500 transition-all"

export default function PatientFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addNotification = useAppStore(s=>s.addNotification)
  const [form, setForm] = useState(DEF)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const isEdit = !!id

  useEffect(() => {
    if (isEdit) {
      setLoading(true)
      patientService.getById(id)
        .then(p => { if(p) setForm({...DEF,...p}) })
        .catch(() => addNotification('Error cargando paciente', 'error'))
        .finally(() => setLoading(false))
    }
  }, [id])

  const set = f => e => setForm(v=>({...v,[f]:e.target.value}))

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true)
    try {
      if (isEdit) { await patientService.update(id,form); addNotification('Paciente actualizado','success') }
      else { await patientService.create(form); addNotification('Paciente creado correctamente','success') }
      navigate('/patients')
    } catch(err) { addNotification(err.message||'Error al guardar','error') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center p-16"><Spinner size={28}/></div>

  const initials = `${form.first_name?.[0]||''}${form.last_name?.[0]||''}`.toUpperCase() || '?'
  const avatarGradient = form.sex==='F' ? 'from-rose-400 to-pink-600' : form.sex==='M' ? 'from-blue-400 to-blue-600' : 'from-slate-400 to-slate-500'

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {isEdit ? 'Editar Paciente' : 'Nuevo Paciente'}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {isEdit ? 'Modifica los datos del paciente' : 'Completa la información del paciente'}
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          onClick={()=>navigate('/patients')}>
          <ChevronLeft size={16}/> Volver
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Avatar preview + nombre rápido */}
        <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white font-black text-lg shadow-md flex-shrink-0 transition-all duration-300`}>
            {initials}
          </div>
          <div className="flex-1 grid grid-cols-2 gap-3">
            <Field label="Nombres" required>
              <input required className={inputCls} value={form.first_name} onChange={set('first_name')} placeholder="Nombres del paciente"/>
            </Field>
            <Field label="Apellidos" required>
              <input required className={inputCls} value={form.last_name} onChange={set('last_name')} placeholder="Apellidos del paciente"/>
            </Field>
          </div>
        </div>

        {/* Sección: Identificación */}
        <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-5">
          <Section icon={User} title="Identificación" description="Datos personales del paciente">
            <div className="grid grid-cols-3 gap-3">
              <Field label="C.I. / Pasaporte">
                <input className={inputCls} value={form.id_number||''} onChange={set('id_number')} placeholder="Nro. documento"/>
              </Field>
              <Field label="Fecha de Nacimiento">
                <input type="date" className={inputCls} value={form.birth_date||''} onChange={set('birth_date')}/>
              </Field>
              <Field label="Sexo">
                <select className={inputCls} value={form.sex||''} onChange={set('sex')}>
                  <option value="">Seleccionar...</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </Field>
            </div>
          </Section>
        </div>

        {/* Sección: Contacto */}
        <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <Section icon={Phone} title="Contacto" description="Se usa para enviar resultados al paciente">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono">
                <input className={inputCls} value={form.phone||''} onChange={set('phone')} placeholder="+591 7xx xxxxx"/>
              </Field>
              <Field label="WhatsApp">
                <div className="relative">
                  <MessageSquare size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none"/>
                  <input className={`${inputCls} pl-8`} value={form.whatsapp||''} onChange={set('whatsapp')} placeholder="7xxxxxxx"/>
                </div>
              </Field>
              <Field label="Correo Electrónico">
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none"/>
                  <input type="email" className={`${inputCls} pl-8`} value={form.email||''} onChange={set('email')} placeholder="correo@ejemplo.com"/>
                </div>
              </Field>
              <Field label="Dirección">
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
                  <input className={`${inputCls} pl-8`} value={form.address||''} onChange={set('address')} placeholder="Dirección del paciente"/>
                </div>
              </Field>
            </div>
          </Section>
        </div>

        {/* Sección: Notas */}
        <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <Section icon={FileText} title="Observaciones" description="Notas adicionales sobre el paciente">
            <textarea
              rows={3}
              className={`${inputCls} resize-none`}
              value={form.notes||''}
              onChange={set('notes')}
              placeholder="Alergias, condiciones especiales, notas relevantes..."/>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pb-2">
          <button type="button" className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={()=>navigate('/patients')}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold shadow-sm shadow-blue-600/30 transition-colors">
            <Save size={15}/>{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Paciente'}
          </button>
        </div>
      </form>
    </div>
  )
}
