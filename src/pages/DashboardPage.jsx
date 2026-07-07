import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../services/database'
import { useAppStore } from '../store/appStore'
import { StatCard, StatusBadge, PriorityBadge } from '../components/ui/index'
import { ClipboardList, Users, FlaskConical, CheckCircle, Clock, AlertTriangle, Plus, TrendingUp, Activity } from 'lucide-react'
import clsx from 'clsx'

export default function DashboardPage() {
  const user = useAppStore(s=>s.user)
  const addNotification = useAppStore(s=>s.addNotification)
  const navigate = useNavigate()
  const [stats, setStats] = useState({ ordersToday:0, pending:0, completedToday:0, patients:0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const [oToday, pending, completed, patients] = await Promise.all([
        db.get("SELECT COUNT(*) as c FROM orders WHERE DATE(created_at)=DATE('now')"),
        db.get("SELECT COUNT(*) as c FROM orders WHERE status IN ('pendiente','en_proceso')"),
        db.get("SELECT COUNT(*) as c FROM orders WHERE status='completado' AND DATE(created_at)=DATE('now')"),
        db.get("SELECT COUNT(*) as c FROM patients"),
      ])
      setStats({ ordersToday:oToday?.c||0, pending:pending?.c||0, completedToday:completed?.c||0, patients:patients?.c||0 })
      const orders = await db.query(`
        SELECT o.*, p.first_name||' '||p.last_name as patient_name
        FROM orders o LEFT JOIN patients p ON o.patient_id=p.id
        ORDER BY o.created_at DESC LIMIT 10
      `)
      setRecentOrders(orders)
    } catch(e){ console.error(e); addNotification('Error cargando el dashboard', 'error') }
    finally{ setLoading(false) }
  }

  const h = new Date().getHours()
  const greeting = h<12?'Buenos días':h<18?'Buenas tardes':'Buenas noches'

  const quickActions = [
    { label:'Nueva Orden', icon:Plus, to:'/orders/new', bg:'bg-blue-600 hover:bg-blue-700', shadow:'shadow-blue-600/30' },
    { label:'Nuevo Paciente', icon:Users, to:'/patients/new', bg:'bg-violet-600 hover:bg-violet-700', shadow:'shadow-violet-600/30' },
    { label:'Pendientes', icon:AlertTriangle, to:'/orders?status=pendiente', bg:'bg-amber-500 hover:bg-amber-600', shadow:'shadow-amber-500/30' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            {greeting}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5 capitalize">
            {new Date().toLocaleDateString('es-ES',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800/60 rounded-2xl px-4 py-2 border border-slate-200 dark:border-slate-700/60">
          <Activity size={16} className="text-emerald-500"/>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Sistema activo</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-1"/>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Órdenes Hoy" value={loading?'—':stats.ordersToday} icon={ClipboardList} color="blue" onClick={()=>navigate('/orders')}/>
        <StatCard label="Pendientes" value={loading?'—':stats.pending} icon={Clock} color="yellow" onClick={()=>navigate('/orders?status=pendiente')}/>
        <StatCard label="Completadas Hoy" value={loading?'—':stats.completedToday} icon={CheckCircle} color="green"/>
        <StatCard label="Pacientes" value={loading?'—':stats.patients} icon={Users} color="purple" onClick={()=>navigate('/patients')}/>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map(a => (
          <button key={a.label} onClick={()=>navigate(a.to)}
            className={clsx('flex items-center gap-3 px-5 py-4 rounded-2xl text-white font-bold text-sm transition-all duration-200 shadow-lg', a.bg, a.shadow, 'hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0')}>
            <a.icon size={18} className="flex-shrink-0"/>
            {a.label}
          </button>
        ))}
      </div>

      {/* Recent orders */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-700/60">
          <div>
            <h2 className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Órdenes Recientes</h2>
            <p className="text-xs text-slate-500 mt-0.5">Últimas órdenes registradas</p>
          </div>
          <button onClick={()=>navigate('/orders')} className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Ver todas →
          </button>
        </div>
        <div>
          {recentOrders.length===0 && !loading && (
            <div className="text-center py-12 text-sm text-slate-400">No hay órdenes registradas aún</div>
          )}
          {recentOrders.map((o,i) => (
            <div key={o.id} onClick={()=>navigate(`/orders/${o.id}`)}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors border-b border-slate-50 dark:border-slate-800/50 last:border-0 group">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-extrabold text-xs flex-shrink-0">
                  {i+1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{o.patient_name}</p>
                  <p className="text-xs text-slate-400 font-mono">{o.order_number} · {new Date(o.created_at).toLocaleDateString('es-ES')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <PriorityBadge priority={o.priority}/>
                <StatusBadge status={o.status}/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
