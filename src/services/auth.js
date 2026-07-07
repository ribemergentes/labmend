import { db, generateId, isElectron } from './database'
import { supabase, isSupabaseConfigured } from './supabase'

// ── SHA-256 (fallback offline) ────────────────────────────────────────────────
async function sha256(str) {
  const buf  = new TextEncoder().encode(str)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('')
}

// ── Roles ─────────────────────────────────────────────────────────────────────
export const ROLES = {
  administrador:  { label:'Administrador',      color:'violet',  icon:'👑', permissions:['all'] },
  bioquimico:     { label:'Bioquímico/Químico', color:'blue',    icon:'🔬', permissions:['results.enter','results.verify','orders.view','orders.update','patients.view','reports.print','exams.view'] },
  recepcion:      { label:'Recepcionista',      color:'emerald', icon:'📋', permissions:['patients.create','patients.edit','patients.view','orders.create','orders.view','reports.print'] },
  administrativo: { label:'Administrativo',     color:'amber',   icon:'💼', permissions:['financiero','orders.view','patients.view','reports.print'] },
}

export function hasPermission(user, perm) {
  if (!user) return false
  const role = ROLES[user.role]
  if (!role) return false
  if (role.permissions.includes('all')) return true
  return role.permissions.includes(perm)
}

// ── Sesión local ──────────────────────────────────────────────────────────────
const KEY = 'labmend_user'
function save(u)  { try { localStorage.setItem(KEY, JSON.stringify(u)) } catch {} }
function clear()  { try { localStorage.removeItem(KEY) } catch {} }
export function getStoredUser() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null } catch { return null }
}

// ── Buscar rol en SQLite local ────────────────────────────────────────────────
async function getRoleLocal(email) {
  if (!isElectron) return null
  return db.get('SELECT id,name,email,role,active FROM users WHERE LOWER(email)=?', [email])
}

// ── Buscar rol en Supabase ────────────────────────────────────────────────────
async function getRoleRemote(email) {
  if (!isSupabaseConfigured() || !supabase) return null
  try {
    // Intentar exact match primero
    const { data } = await supabase
      .from('users')
      .select('id,name,email,role,active')
      .ilike('email', email)   // ilike = case-insensitive
      .limit(1)
      .maybeSingle()
    return data
  } catch { return null }
}

// ═════════════════════════════════════════════════════════════════════════════
export const authService = {

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  async login(email, password) {
    const em = email.toLowerCase().trim()

    // ── MODO ONLINE: Supabase Auth ──────────────────────────────────────────
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password })
      if (error) {
        // Si falla Supabase Auth, intentar con hash local (usuario creado offline)
        if (isElectron) {
          const hash = await sha256(password)
          const local = await db.get(
            'SELECT * FROM users WHERE LOWER(email)=? AND password_hash=? AND active=1',
            [em, hash]
          )
          if (local) {
            const u = { id:local.id, name:local.name, email:local.email, role:local.role }
            save(u); return u
          }
        }
        throw new Error('Credenciales incorrectas o usuario inactivo.')
      }

      // Obtener rol: primero local (más rápido), si no en Supabase
      let roleData = await getRoleLocal(em)
      if (!roleData) roleData = await getRoleRemote(em)

      if (!roleData) {
        // Usuario autenticado en Supabase Auth pero sin entrada en tabla users.
        // Crear automáticamente usando metadatos de Supabase Auth.
        const meta     = data.user?.user_metadata || {}
        const metaRole = meta.role || 'recepcion'
        const metaName = meta.name || meta.full_name || em
        const newId    = generateId()

        if (isElectron) {
          await db.run(
            'INSERT OR IGNORE INTO users (id,name,email,password_hash,role,active) VALUES (?,?,?,?,?,1)',
            [newId, metaName, em, '', metaRole]
          )
        }
        // También insertar en Supabase users table
        try {
          await supabase.from('users').upsert(
            [{ id:newId, name:metaName, email:em, password_hash:'', role:metaRole, active:true }],
            { onConflict:'email' }
          )
        } catch {}

        roleData = { id:newId, name:metaName, email:em, role:metaRole, active:1 }
      }

      if (!roleData.active) throw new Error('Usuario inactivo.')

      const u = { id:roleData.id, name:roleData.name, email:roleData.email, role:roleData.role }
      save(u); return u
    }

    // ── MODO OFFLINE: sesión cacheada de Supabase ───────────────────────────
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session && session.user?.email?.toLowerCase() === em) {
          const roleData = await getRoleLocal(em)
          if (roleData && roleData.active) {
            const u = { id:roleData.id, name:roleData.name, email:roleData.email, role:roleData.role }
            save(u); return u
          }
        }
      } catch {}
      throw new Error('Sin conexión a internet.\nPara iniciar sesión por primera vez en este equipo, necesitas internet.')
    }

    // ── FALLBACK: SQLite puro (sin Supabase configurado) ────────────────────
    if (isElectron) {
      const hash = await sha256(password)
      const user = await db.get(
        'SELECT * FROM users WHERE LOWER(email)=? AND password_hash=? AND active=1',
        [em, hash]
      )
      if (!user) throw new Error('Credenciales incorrectas o usuario inactivo.')
      const u = { id:user.id, name:user.name, email:user.email, role:user.role }
      save(u); return u
    }

    throw new Error('Esta aplicación requiere el instalador de escritorio.')
  },

  // ── LOGOUT ─────────────────────────────────────────────────────────────────
  async logout() {
    if (isSupabaseConfigured() && supabase) {
      try { await supabase.auth.signOut() } catch {}
    }
    clear()
  },

  getCurrentUser() { return getStoredUser() },

  // ── RESTAURAR SESIÓN AL INICIO (sin contraseña) ───────────────────────────
  async restoreSession() {
    const stored = getStoredUser()

    // Verificar que el usuario guardado aún existe en la DB local
    // (puede no existir si se borró y recreó la base de datos)
    if (stored && isElectron) {
      const exists = await db.get('SELECT id FROM users WHERE id=?', [stored.id])
      if (!exists) {
        // El usuario del localStorage ya no existe en la DB — buscar por email
        const fresh = await db.get(
          'SELECT id,name,email,role FROM users WHERE LOWER(email)=?',
          [stored.email.toLowerCase()]
        )
        if (fresh) {
          const u = { id:fresh.id, name:fresh.name, email:fresh.email, role:fresh.role }
          save(u); return u
        }
        // No encontrado en ningún lado — limpiar sesión
        clear(); return null
      }
    }

    if (!isSupabaseConfigured() || !supabase) return stored
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      if (stored && stored.email === session.user.email) return stored
      // Session existe pero no hay user guardado — buscar rol
      const em = session.user.email.toLowerCase()
      const roleData = await getRoleLocal(em) || await getRoleRemote(em)
      if (!roleData || !roleData.active) return null
      const u = { id:roleData.id, name:roleData.name, email:roleData.email, role:roleData.role }
      save(u); return u
    } catch { return stored }
  },

  // ── USUARIOS ───────────────────────────────────────────────────────────────
  async getUsers() {
    if (isElectron) return db.query('SELECT id,name,email,role,active,created_at FROM users ORDER BY name')
    return []
  },

  async createUser(data) {
    const hash = await sha256(data.password)
    const id   = generateId()

    // 1. Guardar en SQLite local
    if (isElectron) {
      await db.run(
        'INSERT INTO users (id,name,email,password_hash,role,active) VALUES (?,?,?,?,?,1)',
        [id, data.name, data.email.toLowerCase(), hash, data.role]
      )
    }

    // 2. Crear en Supabase Auth (si hay conexión)
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      try {
        await supabase.auth.signUp({
          email:    data.email.toLowerCase(),
          password: data.password,
          options:  { data: { name: data.name, role: data.role } },
        })
      } catch { /* el usuario queda en SQLite, se sincronizará luego */ }
    }

    return id
  },

  async updateUser(id, data) {
    if (!isElectron) return
    const updates = {
      name:   data.name,
      email:  data.email.toLowerCase(),
      role:   data.role,
      active: data.active ? 1 : 0,
    }
    if (data.password) updates.password_hash = await sha256(data.password)
    const fields = Object.keys(updates).map(k => `${k}=?`).join(',')
    await db.run(
      `UPDATE users SET ${fields},updated_at=datetime('now') WHERE id=?`,
      [...Object.values(updates), id]
    )
  },

  async deleteUser(id) {
    if (!isElectron) return
    await db.run('UPDATE users SET active=0,updated_at=datetime("now") WHERE id=?', [id])
  },
}
