export const isElectron = typeof window !== 'undefined' && window.electron?.isElectron

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).substr(2,9) + Date.now().toString(36)
}
export function now() { return new Date().toISOString() }
// Parsea fechas de SQLite (sin TZ) como UTC para evitar desfase de día
export function sqlDate(d) {
  if (!d) return null
  const s = String(d)
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
}

export const db = {
  query: async (sql, params=[]) => {
    if (!isElectron) return []
    const r = await window.electron.db.query(sql, params)
    if (r.error) throw new Error(r.error)
    return r.data || []
  },
  get: async (sql, params=[]) => {
    if (!isElectron) return null
    const r = await window.electron.db.get(sql, params)
    if (r.error) throw new Error(r.error)
    return r.data
  },
  run: async (sql, params=[]) => {
    if (!isElectron) return { changes:0 }
    const r = await window.electron.db.run(sql, params)
    if (r.error) throw new Error(r.error)
    // Disparar evento para sync inmediato al escribir datos
    if (r.data?.changes > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('labmend:data-written'))
    }
    return r.data
  },
  transaction: async (ops) => {
    if (!isElectron) return []
    const r = await window.electron.db.transaction(ops)
    if (r.error) throw new Error(r.error)
    // Disparar evento para sync inmediato (igual que db.run)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('labmend:data-written'))
    }
    return r.data
  }
}
