import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { patientService } from '../services/patients'
import { useAppStore } from '../store/appStore'
import { PageHeader, SearchInput, EmptyState, Spinner } from '../components/ui/index'
import { Plus, Users, Edit2, ClipboardList, Phone, Mail, Calendar, Search } from 'lucide-react'
import { excelService } from '../services/excel'
import Pagination from '../components/ui/Pagination'

function debounce(fn,d){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d)}}

function AvatarInitials({ firstName, lastName, sex }) {
  const initials = `${firstName?.[0]||'?'}${lastName?.[0]||'?'}`.toUpperCase()
  const gradient = sex === 'F'
    ? 'from-rose-400 to-pink-600'
    : sex === 'M'
    ? 'from-blue-400 to-blue-600'
    : 'from-slate-400 to-slate-600'
  return (
    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-extrabold text-sm flex-shrink-0 shadow-sm`}>
      {initials}
    </div>
  )
}

export default function PatientsPage() {
  const navigate = useNavigate()
  const addNotification = useAppStore(s=>s.addNotification)
  const _refreshKey     = useAppStore(s=>s._refreshKey)
  const [patients, setPatients] = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const load = useCallback(debounce(async(q)=>{
    try { const d=await patientService.getAll(q); setPatients(d) }
    catch { addNotification('Error al cargar pacientes','error') }
    finally { setLoading(false) }
  },300),[])

  useEffect(()=>{ load(search) },[search, _refreshKey])
  useEffect(()=>{ setPage(1) },[search])

  // Si la página actual queda fuera de rango (ej. tras filtrar), volver a la última válida
  const totalPages = Math.max(1, Math.ceil(patients.length / pageSize))
  useEffect(()=>{ if (page > totalPages) setPage(totalPages) },[totalPages])
  const pageItems = patients.slice((page-1)*pageSize, page*pageSize)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Pacientes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {loading ? 'Cargando...' : `${patients.length} paciente${patients.length!==1?'s':''} registrado${patients.length!==1?'s':''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            onClick={()=>excelService.exportPatients(patients)}>
            Exportar Excel
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm shadow-blue-600/30 transition-colors"
            onClick={()=>navigate('/patients/new')}>
            <Plus size={16}/> Nuevo Paciente
          </button>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-[#161b27] rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
        {/* Search bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar por nombre, C.I. o código..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
            />
          </div>
        </div>

        {/* Column headers */}
        {!loading && patients.length > 0 && (
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 border-b border-slate-100 dark:border-slate-800/80">
            <span className="w-11"/>
            <span>Paciente</span>
            <span className="text-center w-24">Contacto</span>
            <span className="text-right w-36">Acciones</span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={28}/></div>
        ) : patients.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Users size={24} className="text-slate-400"/>
            </div>
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-300">
                {search ? 'Sin resultados' : 'Aún no hay pacientes'}
              </p>
              <p className="text-sm text-slate-400 mt-0.5">
                {search ? 'Intenta con otro término' : 'Registra tu primer paciente'}
              </p>
            </div>
            {!search && (
              <button className="mt-1 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors"
                onClick={()=>navigate('/patients/new')}>
                <Plus size={14}/> Nuevo Paciente
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {pageItems.map(p => {
              const age = patientService.getAge(p.birth_date)
              return (
                <div key={p.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-5 py-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition-colors group">

                  {/* Avatar (clic → ficha del paciente) */}
                  <div className="cursor-pointer" onClick={()=>navigate(`/patients/${p.id}`)}>
                    <AvatarInitials firstName={p.first_name} lastName={p.last_name} sex={p.sex}/>
                  </div>

                  {/* Info principal (clic → ficha del paciente) */}
                  <div className="min-w-0 cursor-pointer" onClick={()=>navigate(`/patients/${p.id}`)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {p.last_name}, {p.first_name}
                      </p>
                      {p.sex && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          p.sex==='F'
                            ? 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400'
                            : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                        }`}>
                          {p.sex==='F'?'Femenino':'Masculino'}
                        </span>
                      )}
                      {age !== null && (
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                          {age} años
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400 font-mono">{p.code}</span>
                      {p.id_number && <span className="text-xs text-slate-400">CI: {p.id_number}</span>}
                    </div>
                  </div>

                  {/* Contacto */}
                  <div className="flex flex-col items-center gap-1 w-24">
                    {p.phone && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                        <Phone size={10}/>{p.phone}
                      </span>
                    )}
                    {p.email && (
                      <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[90px]" title={p.email}>
                        <Mail size={10}/>{p.email}
                      </span>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 w-36 justify-end">
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-all"
                      onClick={()=>navigate(`/orders/new?patient=${p.id}`)}>
                      <ClipboardList size={11}/>Orden
                    </button>
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                      onClick={()=>navigate(`/patients/${p.id}/edit`)}>
                      <Edit2 size={11}/>Editar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && (
          <Pagination total={patients.length} page={page} pageSize={pageSize}
            onPage={setPage} onPageSize={setPageSize}/>
        )}
      </div>
    </div>
  )
}
