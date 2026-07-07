import { useState, useEffect } from 'react'
import { authService, ROLES } from '../services/auth'
import { useAppStore } from '../store/appStore'
import { PageHeader, Modal, EmptyState, Spinner } from '../components/ui/index'
import { Plus, Edit2, Shield, Eye, EyeOff, Users } from 'lucide-react'
import clsx from 'clsx'

const ROLE_OPTIONS = [
  { value:'administrador',  label:'👑 Administrador',    desc:'Acceso completo al sistema' },
  { value:'bioquimico',     label:'🔬 Bioquímico/Químico',desc:'Ingreso y verificación de resultados' },
  { value:'recepcion',      label:'📋 Recepcionista',    desc:'Registro de pacientes y órdenes' },
  { value:'administrativo', label:'💼 Administrativo',   desc:'Panel financiero y reportes de ingresos' },
]

const ROLE_COLORS = {
  administrador:  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  bioquimico:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  recepcion:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  administrativo: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}

const DEF = { name:'', email:'', password:'', role:'recepcion', active:true }

export default function UsersPage() {
  const { user: currentUser, addNotification } = useAppStore()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(DEF)
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try { const u=await authService.getUsers(); setUsers(u||[]) }
    catch { addNotification('Error cargando usuarios','error') }
    finally { setLoading(false) }
  }

  function openNew()  { setEditing(null); setForm(DEF); setShowPw(false); setModal(true) }
  function openEdit(u){ setEditing(u); setForm({name:u.name,email:u.email,password:'',role:u.role,active:u.active===1||u.active===true}); setShowPw(false); setModal(true) }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) {
        await authService.updateUser(editing.id, form)
        addNotification('Usuario actualizado','success')
      } else {
        if (!form.password) { addNotification('Ingresa una contraseña','warning'); setSaving(false); return }
        await authService.createUser(form)
        addNotification('Usuario creado correctamente','success')
      }
      setModal(false); load()
    } catch(e) { addNotification(e.message||'Error al guardar','error') }
    finally { setSaving(false) }
  }

  const set = f => e => setForm(v=>({...v,[f]: e.target.type==='checkbox'?e.target.checked:e.target.value}))

  return (
    <div>
      <PageHeader title="👥 Gestión de Usuarios" subtitle={`${users.length} usuarios registrados`}
        actions={<button className="btn-primary" onClick={openNew}><Plus size={16}/>Nuevo Usuario</button>}/>

      {/* Role permission overview */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {ROLE_OPTIONS.map(r => {
          const roleData = ROLES[r.value]
          const perms = roleData?.permissions || []
          const isAll = perms.includes('all')
          return (
            <div key={r.value} className="card p-4">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{r.label}</p>
              <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">{r.desc}</p>
              <div className="space-y-1">
                {isAll ? (
                  <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400">✓ Acceso completo</span>
                ) : perms.slice(0,4).map(p => (
                  <p key={p} className="text-[10px] text-slate-500 flex items-center gap-1">
                    <span className="text-emerald-500">✓</span>
                    {p.split('.').reverse().join(' ')}
                  </p>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={28}/></div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="Sin usuarios" action={<button className="btn-primary" onClick={openNew}><Plus size={14}/>Crear Usuario</button>}/>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map(u => {
              const isCurrent = u.id === currentUser?.id
              return (
                <div key={u.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className={clsx('w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0',
                      u.active ? 'bg-slate-100 dark:bg-slate-700' : 'bg-slate-50 dark:bg-slate-800 opacity-50')}>
                      {ROLES[u.role]?.icon || '👤'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{u.name}</p>
                        {isCurrent && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">Tú</span>}
                        {!u.active && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold">Inactivo</span>}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx('text-[11px] font-bold px-2.5 py-1 rounded-xl', ROLE_COLORS[u.role])}>
                      {ROLES[u.role]?.label || u.role}
                    </span>
                    <button className="btn-secondary text-xs py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={()=>openEdit(u)}><Edit2 size={12}/>Editar</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal isOpen={modal} onClose={()=>setModal(false)}
        title={editing?`Editar: ${editing.name}`:'Nuevo Usuario'} size="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Nombre completo *</label>
              <input required className="input-field" value={form.name} onChange={set('name')} placeholder="Nombre completo"/>
            </div>
            <div>
              <label className="label-field">Correo electrónico *</label>
              <input required type="email" className="input-field" value={form.email} onChange={set('email')} placeholder="correo@labmend.com"/>
            </div>
          </div>

          <div>
            <label className="label-field">Contraseña {editing?'(dejar vacío para no cambiar)':'*'}</label>
            <div className="relative">
              <input type={showPw?'text':'password'} className="input-field pr-10"
                value={form.password} onChange={set('password')} placeholder={editing?'Nueva contraseña...':'Contraseña...'}
                required={!editing}/>
              <button type="button" onClick={()=>setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw?<EyeOff size={15}/>:<Eye size={15}/>}
              </button>
            </div>
          </div>

          <div>
            <label className="label-field">Rol del sistema *</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map(r => (
                <label key={r.value} className={clsx(
                  'flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-150',
                  form.role===r.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                )}>
                  <input type="radio" name="role" value={r.value} checked={form.role===r.value} onChange={set('role')} className="mt-0.5"/>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{r.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {editing && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={set('active')} className="rounded"/>
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Usuario activo</span>
            </label>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving?'Guardando...':editing?'Actualizar Usuario':'Crear Usuario'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
