import { useEffect, useState } from 'react'
import { Download, RefreshCw, CheckCircle, AlertCircle, Loader2, X, ArrowDownToLine } from 'lucide-react'

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron

export default function UpdateDialog() {
  const [status, setStatus] = useState(null)   // null | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'
  const [info,   setInfo]   = useState({})
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isElectron || !window.electron?.updater) return
    const unsub = window.electron.updater.onStatus(data => {
      setStatus(data.event)
      setInfo(data)
      if (data.event === 'available' || data.event === 'ready') setDismissed(false)
    })
    return unsub
  }, [])

  const handleDownload = () => window.electron.updater.download()
  const handleInstall  = () => window.electron.updater.install()
  const handleCheck    = () => {
    setStatus('checking')
    window.electron.updater.check()
  }

  // Solo mostrar si hay algo relevante para el usuario
  if (!isElectron) return null
  if (dismissed) return null
  if (!status || status === 'checking') return null
  if (status === 'up-to-date' || status === 'error') return null

  return (
    <div className="fixed bottom-5 right-5 z-[9999] w-80 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            {status === 'available'   && <ArrowDownToLine size={18} className="text-blue-500"/>}
            {status === 'downloading' && <Loader2 size={18} className="text-blue-500 animate-spin"/>}
            {status === 'ready'       && <CheckCircle size={18} className="text-emerald-500"/>}
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {status === 'available'   && 'Actualización disponible'}
              {status === 'downloading' && 'Descargando actualización...'}
              {status === 'ready'       && '¡Lista para instalar!'}
            </span>
          </div>
          {(status === 'available' || status === 'ready') && (
            <button onClick={() => setDismissed(true)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <X size={16}/>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 pb-4">
          {status === 'available' && (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Versión <span className="font-semibold text-blue-600 dark:text-blue-400">{info.version}</span> disponible.
                {info.releaseNotes ? ` ${String(info.releaseNotes).replace(/<[^>]+>/g,'').slice(0,80)}...` : ''}
              </p>
              <div className="flex gap-2">
                <button onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 px-3 rounded-xl transition-colors">
                  <Download size={13}/>Descargar
                </button>
                <button onClick={() => setDismissed(true)}
                  className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-semibold py-2 px-3 rounded-xl transition-colors">
                  Después
                </button>
              </div>
            </>
          )}

          {status === 'downloading' && (
            <div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mb-1.5 overflow-hidden">
                <div
                  className="h-1.5 bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${info.percent || 0}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 text-right">{info.percent || 0}%</p>
            </div>
          )}

          {status === 'ready' && (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Versión <span className="font-semibold text-emerald-600 dark:text-emerald-400">{info.version}</span> descargada.
                La app se reiniciará para aplicar los cambios.
              </p>
              <div className="flex gap-2">
                <button onClick={handleInstall}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-xl transition-colors">
                  <RefreshCw size={13}/>Reiniciar y actualizar
                </button>
                <button onClick={() => setDismissed(true)}
                  className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-semibold py-2 px-3 rounded-xl transition-colors">
                  Después
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
