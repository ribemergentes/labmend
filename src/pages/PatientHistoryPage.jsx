import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { patientService, formatAge } from '../services/patients'
import { sqlDate } from '../services/database'
import { hasPermission } from '../services/auth'
import { useAppStore } from '../store/appStore'
import { Spinner } from '../components/ui/index'
import { ChevronLeft, Edit2, Plus, ClipboardList, FlaskConical, CalendarClock, Wallet, Phone, Mail, MessageSquare, AlertCircle, ChevronRight } from 'lucide-react'

const STATUS_COLOR = {
  pendiente:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  en_proceso:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completado:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  entregado:   'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  cancelado:   'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
}
const STATUS_LABEL = {
  pendiente: 'Pendiente', en_proceso: 'En Proceso',
  completado: 'Completado', entregado: 'Entregado', cancelado: 'Cancelado',
}

function fmtDate(d) {
  return sqlDate(d)?.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) || '—'
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
        <Icon size={17} className="text-blue-600 dark:text-blue-400"/>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-black text-slate-900 dark:text-white leading-tight truncate">{value}</p>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function PatientHistoryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useAppStore(s=>s.user)
  const addNotification = useAppStore(s=>s.addNotification)
  const [patient, setPatient] = useState(null)
  const [stats, setStats]     = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const canFinanciero = hasPermission(user, 'financiero') || user?.role === 'administrador'

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      patientService.getById(id),
      patientService.getStats(id),
      patientService.getHistory(id),
    ]).then(([p, s, h]) => {
      if (!alive) return
      if (!p) { addNotification('Paciente no encontrado','error'); navigate('/patients'); return }
      setPatient(p); setStats(s); setHistory(h)
    }).catch(() => {
      if (alive) { addNotification('Error cargando historial','error'); navigate('/patients') }
    }).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id])

  if (loading || !patient) return <div className="flex justify-center p-16"><Spinner size={28}/></div>

  const age = formatAge(patient.birth_date)
  const initials = `${patient.first_name?.[0]||'?'}${patient.last_name?.[0]||'?'}`.toUpperCase()
  const gradient = patient.sex === 'F' ? 'from-rose-400 to-pink-600'
    : patient.sex === 'M' ? 'from-blue-400 to-blue-600' : 'from-slate-400 to-slate-600'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Ficha del Paciente</h1>
          <p className="text-sm text-slate-400 mt-0.5">Historial de órdenes y exámenes</p>
        </div>
        <button
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          onClick={()=>navigate('/patients')}>
          <ChevronLeft size={16}/> Volver
        </button>
      </div>

      {/* Datos del paciente */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-black text-lg shadow-md flex-shrink-0`}>
            {initials}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-black text-slate-900 dark:text-white">
                {patient.last_name}, {patient.first_name}
              </p>
              {patient.sex && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  patient.sex==='F'
                    ? 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400'
                    : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                }`}>{patient.sex==='F'?'Femenino':'Masculino'}</span>
              )}
              {age && <span className="text-xs font-semibold text-slate-400">{age}</span>}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-400">
              <span className="font-mono">{patient.code}</span>
              {patient.id_number && <span>CI: {patient.id_number}</span>}
              {patient.phone && <span className="flex items-center gap-1"><Phone size={10}/>{patient.phone}</span>}
              {patient.whatsapp && <span className="flex items-center gap-1"><MessageSquare size={10}/>{patient.whatsapp}</span>}
              {patient.email && <span className="flex items-center gap-1"><Mail size={10}/>{patient.email}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={()=>navigate(`/patients/${patient.id}/edit`)}>
              <Edit2 size={14}/> Editar
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm shadow-blue-600/30 transition-colors"
              onClick={()=>navigate(`/orders/new?patient=${patient.id}`)}>
              <Plus size={15}/> Nueva Orden
            </button>
          </div>
        </div>
        {patient.notes && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2">
            {patient.notes}
          </p>
        )}
      </div>

      {/* Resumen */}
      <div className={`grid gap-3 ${canFinanciero ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
        <StatCard icon={ClipboardList} label="Órdenes" value={stats.total_orders}/>
        <StatCard icon={FlaskConical} label="Exámenes" value={stats.total_exams}
          sub={stats.total_exams > 0 ? `${stats.exams_done} completados` : null}/>
        <StatCard icon={CalendarClock} label="Última visita" value={fmtDate(stats.last_visit)}/>
        {canFinanciero && (
          <StatCard icon={Wallet} label="Total pagado" value={`Bs ${(stats.total_paid||0).toFixed(2)}`}/>
        )}
      </div>

      {/* Historial de órdenes */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Historial de órdenes</p>
        </div>
        {history.length === 0 ? (
          <div className="py-14 flex flex-col items-center gap-2 text-center">
            <ClipboardList size={26} className="text-slate-300 dark:text-slate-600"/>
            <p className="text-sm font-semibold text-slate-400">Este paciente aún no tiene órdenes</p>
            <button
              className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
              onClick={()=>navigate(`/orders/new?patient=${patient.id}`)}>
              <Plus size={14}/> Crear primera orden
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {history.map(o => (
              <div key={o.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition-colors cursor-pointer group"
                onClick={()=>navigate(`/orders/${o.id}`)}>
                <div className="w-28 flex-shrink-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">{o.order_number}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(o.created_at)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={o.exam_names||''}>
                    {o.exam_count} examen{o.exam_count!==1?'es':''}{o.exam_names ? ` · ${o.exam_names}` : ''}
                  </p>
                  {o.doctor_name && <p className="text-[11px] text-slate-400 mt-0.5 truncate">Dr(a). {o.doctor_name}</p>}
                </div>
                {o.abnormal_count > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 flex-shrink-0"
                    title={`${o.abnormal_count} resultado(s) fuera de rango`}>
                    <AlertCircle size={12}/>{o.abnormal_count}
                  </span>
                )}
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${STATUS_COLOR[o.status] || STATUS_COLOR.pendiente}`}>
                  {STATUS_LABEL[o.status] || o.status}
                </span>
                <ChevronRight size={15} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors flex-shrink-0"/>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
