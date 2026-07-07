import { useAppStore } from '../../store/appStore'
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

export default function NotificationsBar() {
  const { notifications, removeNotification } = useAppStore()
  if (!notifications.length) return null
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm w-full px-4">
      {notifications.map(n => (
        <div key={n.id} className={clsx(
          'flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm font-medium animate-slide-up backdrop-blur-sm',
          n.type==='success' && 'bg-emerald-50/95 border-emerald-200 text-emerald-800 dark:bg-emerald-900/80 dark:border-emerald-700/50 dark:text-emerald-200',
          n.type==='error'   && 'bg-red-50/95 border-red-200 text-red-800 dark:bg-red-900/80 dark:border-red-700/50 dark:text-red-200',
          n.type==='warning' && 'bg-amber-50/95 border-amber-200 text-amber-800 dark:bg-amber-900/80 dark:border-amber-700/50 dark:text-amber-200',
          (!n.type||n.type==='info') && 'bg-blue-50/95 border-blue-200 text-blue-800 dark:bg-blue-900/80 dark:border-blue-700/50 dark:text-blue-200',
        )}>
          <span className="mt-0.5 flex-shrink-0">
            {n.type==='success' && <CheckCircle size={16}/>}
            {n.type==='error'   && <AlertCircle size={16}/>}
            {n.type==='warning' && <AlertTriangle size={16}/>}
            {(!n.type||n.type==='info') && <Info size={16}/>}
          </span>
          <span className="flex-1 leading-snug">{n.msg}</span>
          <button onClick={()=>removeNotification(n.id)} className="opacity-50 hover:opacity-100 flex-shrink-0 mt-0.5"><X size={14}/></button>
        </div>
      ))}
    </div>
  )
}
