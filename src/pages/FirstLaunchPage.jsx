import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { FlaskConical, Wifi, WifiOff, Download, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'

export default function FirstLaunchPage() {
  const { completeFirstLaunch, isOnline } = useAppStore()
  const [state,   setState]   = useState('idle')  // idle | syncing | done | error
  const [message, setMessage] = useState('')
  const [total,   setTotal]   = useState(0)

  // Intentar sync automático al montar si hay internet
  useEffect(() => {
    if (isOnline) handleSync()
  }, [])

  async function handleSync() {
    if (!navigator.onLine) {
      setState('error')
      setMessage('Sin conexión a internet. Conecta el equipo a internet e intenta de nuevo.')
      return
    }
    setState('syncing')
    setMessage('Conectando con el servidor...')

    const r = await completeFirstLaunch()

    if (r.success) {
      setTotal(r.total || 0)
      setState('done')
    } else {
      setState('error')
      setMessage(r.reason || 'Error de conexión. Verifica tu internet e intenta de nuevo.')
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0f1117]">

      {/* Panel izquierdo decorativo */}
      <div className="hidden lg:flex flex-col w-[400px] bg-gradient-to-b from-blue-600 via-blue-700 to-indigo-800 p-12 relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5"/>
          <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-white/5"/>
          <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-white/5"/>
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-12">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                <FlaskConical size={24} className="text-white"/>
              </div>
              <div>
                <p className="text-white font-extrabold text-xl tracking-tight">MendLab</p>
                <p className="text-blue-200 text-xs font-medium">Sistema de Laboratorio Clínico</p>
              </div>
            </div>

            <div className="space-y-6">
              {[
                { icon:'🌐', title:'Conectado a la Nube', desc:'Tus datos se sincronizan en tiempo real entre todos los equipos' },
                { icon:'💾', title:'Offline-First',        desc:'Trabaja sin internet — los datos se sincronizan al reconectar' },
                { icon:'⚡', title:'Tiempo Real',          desc:'Los cambios aparecen en otras PCs en menos de 2 segundos' },
                { icon:'🔒', title:'Seguro',               desc:'Datos protegidos con credenciales reales, sin accesos de demostración' },
              ].map(f => (
                <div key={f.title} className="flex items-start gap-4">
                  <span className="text-2xl flex-shrink-0">{f.icon}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{f.title}</p>
                    <p className="text-blue-200 text-xs mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-blue-300 text-xs">MendLab v7 — Sincronización con Supabase</p>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Logo móvil */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
              <FlaskConical size={20} className="text-white"/>
            </div>
            <p className="font-extrabold text-slate-900 dark:text-white tracking-tight">MendLab</p>
          </div>

          {/* Estado: idle / syncing */}
          {(state === 'idle' || state === 'syncing') && (
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 mb-6">
                {state === 'syncing'
                  ? <Loader2 size={32} className="text-blue-600 animate-spin"/>
                  : <Download size={32} className="text-blue-600"/>
                }
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                {state === 'syncing' ? 'Sincronizando datos...' : 'Primera configuración'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
                {state === 'syncing'
                  ? 'Descargando pacientes, órdenes y resultados desde el servidor. Esto puede tomar unos segundos.'
                  : 'Este equipo necesita descargar los datos del sistema. Se requiere conexión a internet para continuar.'
                }
              </p>

              {/* Indicador de conexión */}
              <div className={`flex items-center gap-2 text-sm mb-6 px-4 py-3 rounded-xl ${
                navigator.onLine
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}>
                {navigator.onLine
                  ? <><Wifi size={16}/> Conectado a internet</>
                  : <><WifiOff size={16}/> Sin conexión — conecta el equipo e intenta de nuevo</>
                }
              </div>

              {state === 'idle' && (
                <button onClick={handleSync} disabled={!navigator.onLine}
                  className="btn-primary w-full justify-center py-3 disabled:opacity-50">
                  <Download size={16}/> Descargar y Sincronizar
                </button>
              )}

              {state === 'syncing' && (
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div className="h-2 bg-blue-500 rounded-full animate-pulse" style={{width:'70%'}}/>
                </div>
              )}
            </>
          )}

          {/* Estado: done */}
          {state === 'done' && (
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 mb-6">
                <CheckCircle size={32} className="text-emerald-600"/>
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                ¡Sincronización completada!
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
                Se descargaron <span className="font-bold text-slate-700 dark:text-slate-200">{total} registros</span> correctamente.
                El sistema ya está listo para usarse.
              </p>
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 mb-6">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                  A partir de ahora este equipo puede trabajar sin internet. Los datos se sincronizan automáticamente cuando hay conexión.
                </p>
              </div>
              <button onClick={() => window.location.reload()}
                className="btn-primary w-full justify-center py-3">
                <CheckCircle size={16}/> Ir al inicio de sesión
              </button>
            </>
          )}

          {/* Estado: error */}
          {state === 'error' && (
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 mb-6">
                <AlertCircle size={32} className="text-red-600"/>
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                Error de conexión
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4">
                {message}
              </p>
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 mb-6">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                  Verifica que:
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-300 mt-1 space-y-0.5 list-disc list-inside">
                  <li>El equipo está conectado a internet</li>
                  <li>El archivo <code className="font-mono">.env</code> tiene las credenciales de Supabase</li>
                  <li>El proyecto Supabase está activo</li>
                </ul>
              </div>
              <button onClick={handleSync}
                className="btn-primary w-full justify-center py-3">
                <RefreshCw size={16}/> Reintentar
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
