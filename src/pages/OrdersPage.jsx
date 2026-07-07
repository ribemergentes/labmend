import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { orderService } from '../services/orders'
import { useAppStore } from '../store/appStore'
import { StatusBadge, PriorityBadge, Spinner } from '../components/ui/index'
import { Plus, ClipboardList, Search, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { excelService } from '../services/excel'
import { sqlDate } from '../services/database'
import Pagination from '../components/ui/Pagination'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente',   label: 'Pendiente'   },
  { value: 'en_proceso',  label: 'En Proceso'  },
  { value: 'completado',  label: 'Completado'  },
  { value: 'entregado',   label: 'Entregado'   },
  { value: 'cancelado',   label: 'Cancelado'   },
]

const PRIORITY_COLOR = {
  normal:      'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  urgente:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  emergencia:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}
const PRIORITY_LABEL = { normal: 'Normal', urgente: 'Urgente', emergencia: 'Emergencia' }

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

export default function OrdersPage() {
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const addNotification = useAppStore(s => s.addNotification)
  const _refreshKey     = useAppStore(s => s._refreshKey)
  const [orders, setOrders]   = useState([])
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState(sp.get('status') || '')
  const [loading, setLoading] = useState(true)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => { loadOrders() }, [search, status, _refreshKey])
  useEffect(() => { setPage(1) }, [search, status])

  // Si la página actual queda fuera de rango (ej. tras filtrar), volver a la última válida
  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize))
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [totalPages])
  const pageItems = orders.slice((page-1)*pageSize, page*pageSize)

  async function loadOrders() {
    try { const d = await orderService.getAll({ search, status }); setOrders(d) }
    catch { addNotification('Error cargando órdenes', 'error') }
    finally { setLoading(false) }
  }

  const selectCls = "px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Órdenes de Trabajo</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {loading ? 'Cargando...' : `${orders.length} orden${orders.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={() => excelService.exportOrders(orders)}>
            <FileSpreadsheet size={15} className="text-emerald-600"/> Exportar Excel
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm shadow-blue-600/30 transition-colors"
            onClick={() => navigate('/orders/new')}>
            <Plus size={16}/> Nueva Orden
          </button>
        </div>
      </div>

      {/* Tabla card */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
        {/* Barra de búsqueda y filtro */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por N° orden, paciente o médico..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Encabezado de columnas */}
        {!loading && orders.length > 0 && (
          <div className="grid grid-cols-[130px_1fr_100px_120px_110px_110px_32px] gap-0 px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 border-b border-slate-100 dark:border-slate-800/80">
            <span>N° Orden</span>
            <span>Paciente</span>
            <span className="text-center">Fecha</span>
            <span className="text-center">Estado</span>
            <span className="text-center">Prioridad</span>
            <span className="text-center">Total</span>
            <span/>
          </div>
        )}

        {/* Contenido */}
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={28}/></div>
        ) : orders.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <ClipboardList size={24} className="text-slate-400"/>
            </div>
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-300">
                {search || status ? 'Sin resultados' : 'Aún no hay órdenes'}
              </p>
              <p className="text-sm text-slate-400 mt-0.5">
                {search || status ? 'Intenta con otros filtros' : 'Crea tu primera orden de trabajo'}
              </p>
            </div>
            {!search && !status && (
              <button className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                onClick={() => navigate('/orders/new')}>
                <Plus size={14}/> Nueva Orden
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {pageItems.map(o => {
              const fecha = sqlDate(o.created_at)?.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' }) || '—'
              return (
                <div key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="grid grid-cols-[130px_1fr_100px_120px_110px_110px_32px] gap-0 items-center px-5 py-3.5 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group">

                  {/* N° Orden */}
                  <div>
                    <p className="font-mono font-extrabold text-blue-600 dark:text-blue-400 text-xs tracking-wider">{o.order_number}</p>
                    {o.created_by_name && (
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{o.created_by_name}</p>
                    )}
                  </div>

                  {/* Paciente */}
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{o.patient_name}</p>
                    {o.doctor_name && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">Dr. {o.doctor_name}</p>
                    )}
                  </div>

                  {/* Fecha */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{fecha}</p>

                  {/* Estado */}
                  <div className="flex justify-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${STATUS_COLOR[o.status] || STATUS_COLOR.pendiente}`}>
                      {STATUS_LABEL[o.status] || o.status}
                    </span>
                  </div>

                  {/* Prioridad */}
                  <div className="flex justify-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${PRIORITY_COLOR[o.priority] || PRIORITY_COLOR.normal}`}>
                      {PRIORITY_LABEL[o.priority] || 'Normal'}
                    </span>
                  </div>

                  {/* Total */}
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 text-center">
                    {o.total_amount != null ? `${Number(o.total_amount).toFixed(2)} Bs.` : '—'}
                  </p>

                  {/* Flecha */}
                  <ChevronRight size={15} className="text-slate-300 dark:text-slate-700 group-hover:text-blue-400 transition-colors"/>
                </div>
              )
            })}
          </div>
        )}

        {!loading && (
          <Pagination total={orders.length} page={page} pageSize={pageSize}
            onPage={setPage} onPageSize={setPageSize}/>
        )}
      </div>
    </div>
  )
}
