import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { shallow } from 'zustand/shallow'
import { ROLES } from '../../services/auth'
import {
  LayoutDashboard, Users, ClipboardList, FlaskConical, FileBarChart,
  Settings, LogOut, Moon, Sun, Shield, BarChart2, ChevronLeft, ChevronRight, Wifi, WifiOff,
  Microscope
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

const NAV = [
  { to:'/',        icon:LayoutDashboard, label:'Dashboard',          exact:true },
  { to:'/patients',icon:Users,           label:'Pacientes',          perm:'patients.view' },
  { to:'/orders',  icon:ClipboardList,   label:'Órdenes',            perm:'orders.view' },
  { to:'/exams',   icon:FlaskConical,    label:'Catálogo de Exámenes',perm:'exams.view' },
  { to:'/reports', icon:FileBarChart,    label:'Reportes',           perm:'reports.print' },
  { to:'/financial',icon:BarChart2,      label:'Panel Financiero',   perm:'financiero' },
  { to:'/users',   icon:Shield,          label:'Usuarios',           adminOnly:true },
  { to:'/settings',icon:Settings,        label:'Configuración',      adminOnly:true },
]

export default function Layout() {
  const { user, logout, theme, toggleTheme, isOnline, realtimeActive, syncStatus } = useAppStore(
    s => ({ user:s.user, logout:s.logout, theme:s.theme, toggleTheme:s.toggleTheme,
            isOnline:s.isOnline, realtimeActive:s.realtimeActive, syncStatus:s.syncStatus }),
    shallow
  )
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const role = ROLES[user?.role]

  function canSeeNav(item) {
    if (item.adminOnly) return user?.role === 'administrador'
    if (item.perm === 'financiero') return user?.role === 'administrativo' || user?.role === 'administrador'
    if (item.perm) {
      if (user?.role === 'administrador') return true
      return role?.permissions?.includes(item.perm)
    }
    return true
  }

  const roleColors = {
    administrador:  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    bioquimico:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    recepcion:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    administrativo: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#0f1117]">
      <aside className={clsx(
        'flex flex-col bg-white dark:bg-[#161b27] border-r border-slate-200/80 dark:border-slate-800 transition-all duration-300 z-40 flex-shrink-0',
        collapsed ? 'w-[60px]' : 'w-[220px]'
      )}>
        {/* Logo */}
        <div className={clsx('flex items-center h-[72px] border-b border-slate-200/80 dark:border-slate-800', collapsed ? 'justify-center px-2' : 'px-5')}>
          {collapsed ? (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-700/30">
              <span className="text-white text-sm font-black tracking-tight">L</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-[20px] font-black leading-none tracking-tight text-slate-900 dark:text-white">
                Lab<span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">Mend</span>
              </p>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-blue-500/60 to-transparent"/>
                <p className="text-[9.5px] font-bold tracking-[0.22em] uppercase text-slate-400 dark:text-slate-500">Laboratorio Clínico</p>
              </div>
            </div>
          )}
        </div>

        {/* Online status */}
        {!collapsed && (
          <div className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold border-b',
            isOnline
              ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/20 text-orange-600 dark:text-orange-400'
          )}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', isOnline?'bg-emerald-500 animate-pulse':'bg-orange-500')}/>
            {isOnline
              ? (realtimeActive ? 'En línea' : 'En línea — Sync...')
              : 'Sin conexión'}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.filter(canSeeNav).map(item => {
            const isActive = item.exact ? location.pathname==='/' : location.pathname.startsWith(item.to) && item.to !== '/'
            return (
              <NavLink key={item.to} to={item.to} end={item.exact}
                className={clsx('flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-semibold transition-all duration-150',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200',
                  collapsed && 'justify-center px-0')}
                title={collapsed?item.label:undefined}>
                <item.icon size={16} className="flex-shrink-0"/>
                {!collapsed && item.label}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-slate-200/80 dark:border-slate-800 p-2 space-y-1">
          {!collapsed && (
            <div className="mx-1 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 mb-1">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{user?.name}</p>
              <span className={clsx('inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-lg mt-1', roleColors[user?.role])}>
                {role?.icon} {role?.label||user?.role}
              </span>
            </div>
          )}
          <button onClick={toggleTheme}
            className={clsx('flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-[13px] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-medium', collapsed&&'justify-center')}>
            {theme==='dark'?<Sun size={15}/>:<Moon size={15}/>}
            {!collapsed&&(theme==='dark'?'Modo claro':'Modo oscuro')}
          </button>
          <button onClick={async()=>{await logout();navigate('/login')}}
            className={clsx('flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl text-[13px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium', collapsed&&'justify-center')}>
            <LogOut size={15}/>{!collapsed&&'Cerrar Sesión'}
          </button>
          <button onClick={()=>setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-1 text-slate-300 dark:text-slate-700 hover:text-slate-500 dark:hover:text-slate-400 transition-colors">
            {collapsed?<ChevronRight size={12}/>:<ChevronLeft size={12}/>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet/>
        </div>
      </main>
    </div>
  )
}
