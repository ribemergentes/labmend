import { useState, useEffect } from 'react'
import { db } from '../services/database'
import { useAppStore } from '../store/appStore'
import { PageHeader, StatCard, Spinner } from '../components/ui/index'
import { TrendingUp, DollarSign, Calendar, BarChart2, FileText, ChevronDown, ArrowUpRight } from 'lucide-react'

function formatBs(val) { return `Bs ${(val||0).toFixed(2)}` }

export default function FinancialPage() {
  const addNotification = useAppStore(s=>s.addNotification)
  const [period, setPeriod] = useState('month') // day | week | month | year
  const [data, setData] = useState({ summary:null, byCategory:[], byExam:[], dailyRevenue:[] })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true)
    try {
      // Date filter
      const filters = {
        day:   "DATE(o.created_at) = DATE('now')",
        week:  "DATE(o.created_at) >= DATE('now','-7 days')",
        month: "strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')",
        year:  "strftime('%Y', o.created_at) = strftime('%Y', 'now')",
      }
      const f = filters[period]

      const [summary, byCategory, byExam, dailyRevenue] = await Promise.all([
        // Summary
        db.get(`SELECT
          COUNT(DISTINCT o.id) as total_orders,
          SUM(o.total_amount) as total_revenue,
          COUNT(DISTINCT o.patient_id) as unique_patients,
          AVG(o.total_amount) as avg_order
          FROM orders o WHERE ${f} AND o.status != 'cancelado'`),

        // By category
        db.query(`SELECT e.category, COUNT(oe.id) as count, SUM(ex.price) as revenue
          FROM order_exams oe
          JOIN orders o ON oe.order_id = o.id
          JOIN exams ex ON oe.exam_id = ex.id
          LEFT JOIN exams e ON oe.exam_id = e.id
          WHERE ${f} AND o.status != 'cancelado'
          GROUP BY e.category ORDER BY revenue DESC`),

        // By exam
        db.query(`SELECT ex.name, ex.code, ex.category, COUNT(oe.id) as count, SUM(ex.price) as revenue
          FROM order_exams oe
          JOIN orders o ON oe.order_id = o.id
          JOIN exams ex ON oe.exam_id = ex.id
          WHERE ${f} AND o.status != 'cancelado'
          GROUP BY ex.id ORDER BY count DESC LIMIT 10`),

        // Daily revenue (last 14 days)
        db.query(`SELECT DATE(o.created_at) as date, SUM(o.total_amount) as revenue, COUNT(o.id) as orders
          FROM orders o WHERE DATE(o.created_at) >= DATE('now','-14 days') AND o.status != 'cancelado'
          GROUP BY DATE(o.created_at) ORDER BY date DESC LIMIT 14`),
      ])

      setData({ summary, byCategory, byExam, dailyRevenue })
    } catch(e) { console.error(e); addNotification('Error cargando datos financieros', 'error') }
    finally { setLoading(false) }
  }

  const periodLabels = { day:'Hoy', week:'Esta Semana', month:'Este Mes', year:'Este Año' }

  const catColors = {
    'HEMATOLOGÍA':'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'QUÍMICA SANGUÍNEA':'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'EXAMEN DE ORINA':'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    'SEROLOGÍA':'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'CITOLOGÍA':'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    'MICROBIOLOGÍA':'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'COPROPARASITOLOGÍA':'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    'INMUNOHEMATOLOGÍA':'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size={32}/></div>

  const rev = data.summary?.total_revenue || 0
  const orders = data.summary?.total_orders || 0
  const patients = data.summary?.unique_patients || 0
  const avg = data.summary?.avg_order || 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <PageHeader title="📊 Panel Financiero" subtitle="Ingresos y estadísticas en bolivianos (Bs)"/>
        {/* Period selector */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700 shadow-sm">
          {Object.entries(periodLabels).map(([k,v]) => (
            <button key={k} onClick={()=>setPeriod(k)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 ${
                period===k
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-5 col-span-1 bg-gradient-to-br from-blue-600 to-blue-700 border-0">
          <p className="text-blue-200 text-[11px] font-bold uppercase tracking-widest">Ingresos {periodLabels[period]}</p>
          <p className="text-3xl font-extrabold text-white mt-2 tracking-tight">{formatBs(rev)}</p>
          <p className="text-blue-200 text-xs mt-1 flex items-center gap-1">
            <ArrowUpRight size={12}/>{orders} órdenes completadas
          </p>
        </div>
        <StatCard label={`Órdenes ${periodLabels[period]}`} value={orders} icon={FileText} color="blue"/>
        <StatCard label="Pacientes Únicos" value={patients} icon={TrendingUp} color="green"/>
        <StatCard label="Promedio por Orden" value={formatBs(avg)} icon={BarChart2} color="purple"/>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* By category */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-700/60">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Ingresos por Categoría</h3>
            <p className="text-xs text-slate-400 mt-0.5">{periodLabels[period]}</p>
          </div>
          <div className="p-4 space-y-3">
            {data.byCategory.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Sin datos en este período</p>}
            {data.byCategory.map((c,i) => {
              const maxRev = data.byCategory[0]?.revenue || 1
              const pct = Math.round((c.revenue/maxRev)*100)
              return (
                <div key={c.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${catColors[c.category]||'bg-slate-100 text-slate-600'}`}>
                      {c.category}
                    </span>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{formatBs(c.revenue)}</span>
                      <span className="text-[10px] text-slate-400 ml-2">{c.count} exam.</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{width:`${pct}%`}}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top exams */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-700/60">
            <h3 className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Top 10 Exámenes</h3>
            <p className="text-xs text-slate-400 mt-0.5">Por número de solicitudes</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.byExam.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Sin datos</p>}
            {data.byExam.map((ex,i) => (
              <div key={ex.code} className="flex items-center gap-3 px-5 py-3">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                  i===0?'bg-amber-100 text-amber-700':i===1?'bg-slate-100 text-slate-600':i===2?'bg-orange-100 text-orange-700':'bg-slate-50 text-slate-500'
                }`}>{i+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{ex.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{ex.code}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{formatBs(ex.revenue)}</p>
                  <p className="text-[10px] text-slate-400">{ex.count}×</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily revenue table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-700/60">
          <h3 className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Ingresos Diarios — Últimos 14 días</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th-cell">Fecha</th>
                <th className="th-cell">Órdenes</th>
                <th className="th-cell">Ingresos</th>
                <th className="th-cell">Barra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.dailyRevenue.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-400 text-sm py-8">Sin datos</td></tr>
              )}
              {data.dailyRevenue.map(d => {
                const maxD = data.dailyRevenue[0]?.revenue || 1
                const pct = Math.round((d.revenue/maxD)*100)
                return (
                  <tr key={d.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="td-cell font-semibold">
                      {new Date(d.date+'T12:00:00').toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}
                    </td>
                    <td className="td-cell text-center">{d.orders}</td>
                    <td className="td-cell font-extrabold text-emerald-600 dark:text-emerald-400">{formatBs(d.revenue)}</td>
                    <td className="td-cell w-40">
                      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full" style={{width:`${pct}%`}}/>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
