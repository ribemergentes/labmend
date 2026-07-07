/**
 * Sync Service — SQLite (offline) ↔ Supabase (online)
 * - Realtime WebSocket: recibe cambios de otras PCs en ~1-2 seg
 * - Upload inmediato: sube datos locales a Supabase al instante
 * - Auto-poll cada 25 seg: fallback por si el WebSocket falla
 * - fullDownload: descarga TODO en el primer inicio (nueva PC)
 */
import { supabase, isSupabaseConfigured, getOnlineStatus } from './supabase'
import { db, isElectron } from './database'

// Orden de subida respetando FK: patients → orders → order_exams → results
const TABLES        = ['patients', 'orders', 'order_exams', 'results']
const SYNCED_TABLES = new Set(TABLES)
// Catálogo (se sube antes que datos clínicos para que FK de exam_id resuelvan)
const CATALOG_PUSH  = ['exams', 'exam_parameters', 'reference_values']
// Descarga completa: catálogo + usuarios + datos clínicos
const ALL_TABLES    = ['users', 'exams', 'exam_parameters', 'reference_values', ...TABLES]

// ── Conversor SQLite → Supabase ───────────────────────────────────────────────
function toSupabase(row) {
  const r = { ...row }
  delete r.synced
  // Booleanos
  if ('active'      in r) r.active      = r.active      === 1 || r.active      === true
  if ('is_abnormal' in r) r.is_abnormal = r.is_abnormal === 1 || r.is_abnormal === true
  // Proteger campos NOT NULL obligatorios
  if ('first_name'    in r && !r.first_name)    r.first_name    = '(Sin nombre)'
  if ('last_name'     in r && !r.last_name)     r.last_name     = '(Sin apellido)'
  if ('order_number'  in r && !r.order_number)  r.order_number  = `ORD-${r.id?.slice(-6) || Date.now()}`
  if ('name'          in r && !r.name)          r.name          = `(${r.id?.slice(-4) || '?'})`
  return r
}
function toSQLite(v) {
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

// ── Upsert local silencioso (para recibir datos del realtime/download) ────────
async function upsertLocal(table, row) {
  const exists = await db.get(`SELECT id FROM ${table} WHERE id=?`, [row.id])
  const keys   = Object.keys(row)
  const vals   = keys.map(k => toSQLite(row[k]))
  if (exists) {
    const sets = keys.filter(k => k !== 'id').map(k => `${k}=?`).join(',')
    const sv   = keys.filter(k => k !== 'id').map(k => toSQLite(row[k]))
    await db.run(`UPDATE ${table} SET ${sets},synced=1 WHERE id=?`, [...sv, row.id])
  } else {
    const ph = keys.map(() => '?').join(',')
    if (SYNCED_TABLES.has(table)) {
      await db.run(`INSERT OR IGNORE INTO ${table} (${keys.join(',')},synced) VALUES (${ph},1)`, vals)
    } else {
      await db.run(`INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${ph})`, vals)
    }
  }
}

// ── Upsert batch con fallback fila-a-fila en conflictos ───────────────────────
async function upsertBatch(table, rows) {
  const mapped = rows.map(toSupabase)
  const { error } = await supabase.from(table).upsert(mapped, { onConflict: 'id' })
  if (!error) return { ok: rows.length, fail: 0, errors: [] }

  // Si el batch falla (UNIQUE, NOT NULL, FK) → intentar fila por fila
  let ok = 0, fail = 0
  const errors = []
  for (const row of rows) {
    const { error: e } = await supabase.from(table).upsert([toSupabase(row)], { onConflict: 'id' })
    if (e) {
      fail++
      errors.push(`id=${row.id?.slice(-6)}: ${e.message}`)
      console.warn(`[Sync] ↑ ${table} row skip:`, e.message)
    } else {
      ok++
      await db.run(`UPDATE ${table} SET synced=1 WHERE id=?`, [row.id])
    }
  }
  return { ok, fail, errors }
}

// ── Debounce de upload inmediato ──────────────────────────────────────────────
let _uploadTimer = null
let _isSyncing   = false

function scheduleUpload() {
  if (_uploadTimer) clearTimeout(_uploadTimer)
  if (_isSyncing) {
    // Sync en curso — reintentar cuando termine (en vez de descartar)
    _uploadTimer = setTimeout(scheduleUpload, 1200)
    return
  }
  _uploadTimer = setTimeout(() => syncService.uploadPending(), 800)
}

// ═════════════════════════════════════════════════════════════════════════════
export const syncService = {
  isRunning:     false,
  _realtimeSubs: [],
  _pollInterval: null,

  // ── UPLOAD INMEDIATO (sube pendientes respetando orden FK) ────────────────
  async uploadPending() {
    if (!isElectron || !isSupabaseConfigured() || !getOnlineStatus() || !supabase) return
    _isSyncing = true
    try {
      for (const table of TABLES) {
        const rows = await db.query(`SELECT * FROM ${table} WHERE synced=0`)
        if (!rows.length) continue
        const { ok, errors } = await upsertBatch(table, rows)
        // Marcar como synced los que se subieron en el batch exitoso
        if (errors.length === 0) {
          for (const r of rows)
            await db.run(`UPDATE ${table} SET synced=1 WHERE id=?`, [r.id])
        }
        if (errors.length) console.warn(`[Sync] ${table}: ${ok} ok, ${errors.length} omitidos`)
      }
    } catch(e) {
      console.error('[Sync] uploadPending exception:', e.message)
    } finally { _isSyncing = false }
  },

  // ── FORZAR SUBIDA TOTAL (catálogo → datos clínicos, fila-a-fila en errores) ─
  async forcePush() {
    if (!isElectron || !isSupabaseConfigured() || !supabase)
      return { success: false, reason: 'Supabase no configurado' }
    if (!getOnlineStatus())
      return { success: false, reason: 'Sin conexión a internet' }
    _isSyncing = true
    const results = {}
    try {
      // 1. Catálogo primero (FK de order_exams.exam_id y results.parameter_id)
      for (const table of CATALOG_PUSH) {
        try {
          const rows = await db.query(`SELECT * FROM ${table}`)
          if (!rows.length) { results[table] = { ok: true, count: 0 }; continue }
          const { ok, fail, errors } = await upsertBatch(table, rows)
          results[table] = fail === 0
            ? { ok: true, count: ok }
            : { ok: false, error: errors[0], count: ok, skipped: fail }
        } catch(e) { results[table] = { ok: false, error: e.message } }
      }

      // 2. Datos clínicos (patients → orders → order_exams → results)
      for (const table of TABLES) {
        try {
          await db.run(`UPDATE ${table} SET synced=0`)
          const rows = await db.query(`SELECT * FROM ${table}`)
          if (!rows.length) { results[table] = { ok: true, count: 0 }; continue }
          const { ok, fail, errors } = await upsertBatch(table, rows)
          results[table] = fail === 0
            ? { ok: true, count: ok }
            : { ok: false, error: errors[0], count: ok, skipped: fail }
        } catch(e) { results[table] = { ok: false, error: e.message } }
      }
      return { success: true, results }
    } finally { _isSyncing = false }
  },

  // ── DESCARGA COMPLETA (nueva PC o re-sincronización total) ────────────────
  async fullDownload() {
    if (!isElectron) return { success:false, reason:'No Electron' }
    if (!isSupabaseConfigured() || !supabase)
      return { success:false, reason:'Supabase no configurado' }
    if (!getOnlineStatus())
      return { success:false, reason:'Sin conexión a internet.' }

    _isSyncing = true
    let total  = 0
    const errors = []
    try {
      for (const table of ALL_TABLES) {
        try {
          const { data, error } = await supabase.from(table).select('*')
          if (error) { errors.push(`${table}: ${error.message}`); continue }
          if (!data?.length) continue
          for (const row of data) {
            const keys = Object.keys(row)
            const vals = keys.map(k => toSQLite(row[k]))
            const ph   = keys.map(() => '?').join(',')
            if (SYNCED_TABLES.has(table)) {
              await db.run(
                `INSERT OR REPLACE INTO ${table} (${keys.join(',')},synced) VALUES (${ph},1)`, vals
              )
            } else {
              await db.run(
                `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${ph})`, vals
              )
            }
            total++
          }
        } catch(e) { errors.push(`${table}: ${e.message}`) }
      }
      return { success: true, total, errors }
    } catch(e) {
      return { success: false, reason: e.message }
    } finally { _isSyncing = false }
  },

  // ── DIAGNÓSTICO DE CONEXIÓN ───────────────────────────────────────────────
  async diagnose() {
    const info = {
      configured:  isSupabaseConfigured(),
      online:      getOnlineStatus(),
      clientReady: !!supabase,
      tables:      {},
    }
    if (!info.configured || !info.clientReady) return info
    for (const table of TABLES) {
      try {
        const { data, error } = await supabase.from(table).select('id').limit(1)
        const pending = await db.query(`SELECT COUNT(*) as c FROM ${table} WHERE synced=0`)
        info.tables[table] = error
          ? { ok: false, error: error.message, code: error.code }
          : { ok: true, pending: pending[0]?.c ?? 0 }
        if (!error && data?.[0]) {
          const { error: we } = await supabase.from(table).upsert([data[0]], { onConflict: 'id' })
          info.tables[table].writable   = !we
          if (we) info.tables[table].writeError = we.message
        } else if (!error) {
          info.tables[table].writable = 'no-rows-to-test'
        }
      } catch(e) {
        info.tables[table] = { ok: false, error: e.message }
      }
    }
    return info
  },

  // ── SYNC COMPLETO (upload + download incremental) ─────────────────────────
  async syncAll() {
    if (!isElectron)            return { success:false, reason:'No Electron' }
    if (!isSupabaseConfigured()) return { success:false, reason:'Supabase no configurado' }
    if (!getOnlineStatus())     return { success:false, reason:'Sin conexión' }
    if (this.isRunning)         return { success:false, reason:'Ya en progreso' }

    this.isRunning = true
    _isSyncing     = true
    const stats    = { uploaded:0, downloaded:0, errors:[] }

    try {
      // 1. Subir pendientes
      for (const table of TABLES) {
        try {
          const rows = await db.query(`SELECT * FROM ${table} WHERE synced=0`)
          if (!rows.length) continue
          const { ok, errors } = await upsertBatch(table, rows)
          if (errors.length === 0) {
            for (const r of rows)
              await db.run(`UPDATE ${table} SET synced=1 WHERE id=?`, [r.id])
          }
          if (errors.length) errors.forEach(e => stats.errors.push(`↑ ${table}: ${e}`))
          stats.uploaded += ok
        } catch(e) { stats.errors.push(`↑ ${table}: ${e.message}`) }
      }

      // 2. Descargar cambios remotos más recientes
      for (const table of TABLES) {
        try {
          const last  = await db.get(`SELECT MAX(updated_at) as t FROM ${table}`)
          const since = last?.t || '2000-01-01'
          const { data, error } = await supabase.from(table).select('*').gt('updated_at', since)
          if (error || !data?.length) continue
          for (const row of data) { await upsertLocal(table, row); stats.downloaded++ }
        } catch(e) { stats.errors.push(`↓ ${table}: ${e.message}`) }
      }
    } finally { this.isRunning = false; _isSyncing = false }

    // Subir cualquier registro que haya sido escrito durante el ciclo de sync
    this.uploadPending()

    return { success:true, ...stats }
  },

  // ── REALTIME SUBSCRIPTIONS ────────────────────────────────────────────────
  startRealtime(onUpdate) {
    if (!isElectron || !isSupabaseConfigured() || !supabase) return
    this.stopRealtime()
    for (const table of TABLES) {
      const ch = supabase
        .channel(`rt_${table}`)
        .on('postgres_changes', { event:'*', schema:'public', table }, async payload => {
          try {
            const row = payload.new || payload.old
            if (!row?.id) return
            if (payload.eventType === 'DELETE') return
            await upsertLocal(table, row)
            if (onUpdate) onUpdate({ table, event: payload.eventType, id: row.id })
          } catch(e) { console.warn('[Realtime] error:', e.message) }
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') console.log(`[Realtime] ✓ ${table}`)
          if (status === 'CHANNEL_ERROR') console.warn(`[Realtime] ✗ ${table}`)
        })
      this._realtimeSubs.push(ch)
    }
  },

  stopRealtime() {
    for (const ch of this._realtimeSubs) {
      try { supabase?.removeChannel(ch) } catch {}
    }
    this._realtimeSubs = []
  },

  // ── AUTO POLL ─────────────────────────────────────────────────────────────
  startAutoPoll(onResult, intervalMs = 25000) {
    if (!isElectron || !isSupabaseConfigured()) return
    this.stopAutoPoll()
    this._pollInterval = setInterval(async () => {
      if (getOnlineStatus()) {
        const r = await this.syncAll()
        if (onResult) onResult(r)
      }
    }, intervalMs)
    if (getOnlineStatus()) this.syncAll().then(r => { if (onResult) onResult(r) })
  },

  stopAutoPoll() {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null }
  },

  // ── START / STOP ──────────────────────────────────────────────────────────
  start(onUpdate) {
    this.startRealtime(onUpdate)
    this.startAutoPoll(onUpdate, 60000)  // 60s — realtime cubre actualizaciones inmediatas
    if (typeof window !== 'undefined') {
      window.removeEventListener('labmend:data-written', scheduleUpload)
      window.addEventListener('labmend:data-written', scheduleUpload)
    }
  },

  stop() {
    this.stopRealtime()
    this.stopAutoPoll()
    if (typeof window !== 'undefined') {
      window.removeEventListener('labmend:data-written', scheduleUpload)
    }
    if (_uploadTimer) { clearTimeout(_uploadTimer); _uploadTimer = null }
  },
}
