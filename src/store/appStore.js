import { create } from 'zustand'
import { authService, getStoredUser } from '../services/auth'
import { isElectron, db } from '../services/database'
import { isSupabaseConfigured } from '../services/supabase'
import { syncService } from '../services/sync'
import { doctorService } from '../services/doctors'

export const useAppStore = create((set, get) => ({
  user:           null,          // se restaura en initTheme
  theme:          localStorage.getItem('labmend_theme') || 'light',
  isOnline:       navigator.onLine,
  syncStatus:     'idle',        // idle | syncing | ok | error
  lastSync:       null,
  lastSyncErrors: [],
  realtimeActive: false,

  // ── Login ──────────────────────────────────────────────────────────────────
  login: async (email, password) => {
    const user = await authService.login(email, password)
    set({ user })
    get().startSync()
    return user
  },

  // ── Logout ─────────────────────────────────────────────────────────────────
  logout: async () => {
    get().stopSync()
    await authService.logout()
    set({ user:null, syncStatus:'idle', realtimeActive:false })
  },

  // ── Tema ───────────────────────────────────────────────────────────────────
  toggleTheme: () => {
    const theme = get().theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('labmend_theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },

  // ── Inicialización ─────────────────────────────────────────────────────────
  initTheme: async () => {
    // Tema
    const theme = localStorage.getItem('labmend_theme') || 'light'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })

    // Listeners de red
    window.addEventListener('online',  () => { set({ isOnline:true  }); get().startSync() })
    window.addEventListener('offline', () => { set({ isOnline:false }) })

    // Restaurar sesión (Supabase Auth o localStorage)
    const user = await authService.restoreSession()
    if (user) {
      set({ user })
      get().startSync()
    }
    get().loadDoctors()
  },

  // ── Sync ───────────────────────────────────────────────────────────────────
  startSync: async () => {
    if (!isElectron || !isSupabaseConfigured()) return
    set({ syncStatus:'syncing' })

    // Auto fullDownload en nueva instalación (initial_sync_done = '0')
    try {
      const row = await db.get("SELECT value FROM lab_config WHERE key='initial_sync_done'")
      if (row?.value === '0') {
        const r = await syncService.fullDownload()
        if (r.success) {
          await db.run("UPDATE lab_config SET value='1' WHERE key='initial_sync_done'")
          get()._triggerRefresh()
        }
      }
    } catch(e) { console.warn('[Sync] auto-fullDownload check:', e.message) }

    syncService.start((result) => {
      if (result?.success !== false) {
        set({
          syncStatus:     result?.errors?.length ? 'error' : 'ok',
          lastSync:       new Date(),
          lastSyncErrors: result?.errors || [],
          realtimeActive: true,
        })
        // Realtime llega con { table, event, id }
        // Poll llega con { success, downloaded, uploaded, errors }
        const hasChanges = result?.downloaded > 0 || result?.uploaded > 0 || !!result?.table
        if (hasChanges) { get()._triggerRefresh(); get().loadDoctors() }
      } else {
        set({ syncStatus:'error', realtimeActive:false, lastSyncErrors: result?.errors || [] })
      }
    })
  },

  stopSync: () => {
    syncService.stop()
    set({ syncStatus:'idle', realtimeActive:false })
  },

  // Refresh key para re-renderizar componentes con datos nuevos
  _refreshKey:      0,
  _triggerRefresh:  () => set(s => ({ _refreshKey: s._refreshKey + 1 })),

  // Sync manual
  syncNow: async () => {
    set({ syncStatus:'syncing' })
    try {
      const r = await syncService.syncAll()
      set({
        syncStatus:     r.success && !r.errors?.length ? 'ok' : 'error',
        lastSync:       r.success ? new Date() : get().lastSync,
        lastSyncErrors: r.errors || [],
      })
      if (r.success && (r.downloaded > 0 || r.uploaded > 0)) get()._triggerRefresh()
      return r
    } catch(e) {
      set({ syncStatus:'error', lastSyncErrors: [e.message || 'Error inesperado en sync'] })
      return { success:false, errors:[e.message] }
    }
  },

  // Diagnóstico de Supabase
  diagnoseSync: () => syncService.diagnose(),

  // Descarga completa desde Supabase (nueva PC o re-sync total)
  fullDownload: async () => {
    set({ syncStatus:'syncing' })
    try {
      const r = await syncService.fullDownload()
      if (r.success) {
        await db.run("UPDATE lab_config SET value='1' WHERE key='initial_sync_done'")
        get()._triggerRefresh()
        set({ syncStatus:'ok', lastSync: new Date(), lastSyncErrors: r.errors || [] })
      } else {
        set({ syncStatus:'error', lastSyncErrors: [r.reason || 'Error en descarga'] })
      }
      return r
    } catch(e) {
      set({ syncStatus:'error', lastSyncErrors: [e.message || 'Error inesperado en descarga'] })
      return { success:false, reason: e.message }
    }
  },

  // Forzar subida de todos los registros
  forcePush: async () => {
    set({ syncStatus:'syncing' })
    try {
      const r = await syncService.forcePush()
      const errors = Object.entries(r.results || {})
        .filter(([,v]) => !v.ok).map(([t,v]) => `${t}: ${v.error}`)
      set({
        syncStatus:     errors.length ? 'error' : 'ok',
        lastSync:       new Date(),
        lastSyncErrors: errors,
      })
      return r
    } catch(e) {
      set({ syncStatus:'error', lastSyncErrors: [e.message || 'Error inesperado en subida'] })
      return { success:false, reason: e.message }
    }
  },

  // ── Doctores (global, tiempo real) ──────────────────────────────────────────
  doctors: [],
  loadDoctors: async () => {
    try { set({ doctors: await doctorService.getAll() }) } catch {}
  },

  // ── Notificaciones ──────────────────────────────────────────────────────────
  notifications: [],
  addNotification: (msg, type='info') => {
    const id = Date.now()
    set(s => ({ notifications:[...s.notifications, {id, msg, type}] }))
    setTimeout(() => set(s => ({ notifications:s.notifications.filter(n=>n.id!==id) })), 5000)
  },
  removeNotification: (id) => set(s => ({ notifications:s.notifications.filter(n=>n.id!==id) })),
}))
