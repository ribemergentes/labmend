import clsx from 'clsx'
import { X, Loader2, Search, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react'

// ── PageHeader ─────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between mb-6 page-enter">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0 ml-4">{actions}</div>}
    </div>
  )
}

// ── StatusBadge ────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  pendiente:'Pendiente', en_proceso:'En Proceso', completado:'Completado',
  entregado:'Entregado', cancelado:'Cancelado',
}
export function StatusBadge({ status }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide', `status-${status}`)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 inline-block"/>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

// ── PriorityBadge ──────────────────────────────────────────────────────────
export function PriorityBadge({ priority }) {
  const styles = {
    normal:     'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-400',
    urgente:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    emergencia: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  }
  const icons = { normal:'', urgente:'⚠', emergencia:'🚨' }
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold', styles[priority])}>
      {icons[priority]} {priority?.charAt(0).toUpperCase() + priority?.slice(1)}
    </span>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────
export function Modal({ isOpen, onClose, title, children, size='md' }) {
  if (!isOpen) return null
  const sizes = { sm:'max-w-sm', md:'max-w-lg', lg:'max-w-2xl', xl:'max-w-4xl', full:'max-w-6xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className={clsx('relative card-glass w-full animate-slide-up', sizes[size])} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-700/60">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-500">
            <X size={16}/>
          </button>
        </div>
        <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────
export function Spinner({ size=18 }) {
  return <Loader2 size={size} className="animate-spin text-blue-600"/>
}

// ── EmptyState ─────────────────────────────────────────────────────────────
export function EmptyState({ icon:Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6 animate-fade-in">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center mb-4">
          <Icon size={28} className="text-slate-400"/>
        </div>
      )}
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</h3>
      {description && <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ── ConfirmDialog ──────────────────────────────────────────────────────────
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel='Confirmar', danger=false }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className={danger?'btn-danger':'btn-primary'} onClick={()=>{onConfirm();onClose()}}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}

// ── SearchInput ────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder='Buscar...' }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
      <input type="text" value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} className="input-field pl-9"/>
    </div>
  )
}

// ── Select ─────────────────────────────────────────────────────────────────
export function Select({ value, onChange, options, placeholder, className }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} className={clsx('input-field', className)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ── StatCard ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon:Icon, color='blue', trend, onClick }) {
  const colors = {
    blue:   'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    green:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    yellow: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    purple: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    red:    'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  return (
    <div className={clsx('card p-5 transition-all duration-200', onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5')}
      onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest truncate">{label}</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-1.5 tracking-tight">{value}</p>
          {trend && <p className="text-xs text-slate-400 mt-1">{trend}</p>}
        </div>
        {Icon && (
          <div className={clsx('p-3 rounded-2xl flex-shrink-0', colors[color])}>
            <Icon size={22}/>
          </div>
        )}
      </div>
    </div>
  )
}
