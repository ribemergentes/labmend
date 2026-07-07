import { db, generateId, isElectron } from './database'
import { supabase, isSupabaseConfigured } from './supabase'

// ── Hashing de contraseñas (acceso offline) ───────────────────────────────────
// Formato moderno: pbkdf2$<iteraciones>$<salt hex>$<hash hex>  (PBKDF2-HMAC-SHA256)
// Formato legado:  64 hex chars = SHA-256 sin salt (instalaciones previas).
// El login acepta ambos y actualiza el legado al formato moderno de forma
// transparente en el primer inicio de sesión exitoso.
const PBKDF2_ITERATIONS = 100000

async function sha256(str) {
  const buf  = new TextEncoder().encode(str)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('')
}

const toHex   = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('')
const fromHex = (hex)   => new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h,16)))

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name:'PBKDF2', hash:'SHA-256', salt:saltBytes, iterations }, key, 256
  )
  return toHex(new Uint8Array(bits))
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`
}

async function verifyPassword(password, stored) {
  if (!stored) return { ok:false, legacy:false }
  if (stored.startsWith('pbkdf2$')) {
    const [, iters, saltHex, hashHex] = stored.split('$')
    const computed = await pbkdf2(password, fromHex(saltHex), parseInt(iters))
    return { ok: computed === hashHex, legacy:false }
  }
  // Legado: SHA-256 sin salt
  return { ok: (await sha256(password)) === stored, legacy:true }
}

// Verifica contra la fila local y, si el hash es legado y coincide,
// lo actualiza al formato moderno (silencioso; no afecta la sesión).
async function verifyLocalUser(email, password) {
  if (!isElectron) return null
  const user = await db.get('SELECT * FROM users WHERE LOWER(email)=? AND active=1', [email])
  if (!user) return null
  const { ok, legacy } = await verifyPassword(password, user.password_hash)
  if (!ok) return null
  if (legacy) {
    try {
      const upgraded = await hashPassword(password)
      await db.run('UPDATE users SET password_hash=? WHERE id=?', [upgraded, user.id])
    } catch {}
  }
  return user
}

// ── Freno anti fuerza bruta (por sesión de app) ───────────────────────────────
const MAX_ATTEMPTS = 5
const LOCK_MS      = 30000
const _attempts    = new Map()   // email → { fails, lockedUntil }

function checkThrottle(email) {
  const a = _attempts.get(email)
  if (a?.lockedUntil && Date.now() < a.lockedUntil) {
    const secs = Math.ceil((a.lockedUntil - Date.now()) / 1000)
    throw new Error(`Demasiados intentos fallidos. Espera ${secs} segundos.`)
  }
}
function registerFail(email) {
  const a = _attempts.get(email) || { fails:0, lockedUntil:0 }
  a.fails++
  if (a.fails >= MAX_ATTEMPTS) { a.lockedUntil = Date.now() + LOCK_MS; a.fails = 0 }
  _attempts.set(email, a)
}
function registerSuccess(email) { _attempts.delete(email) }

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
    checkThrottle(em)

    // ── MODO ONLINE: Supabase Auth ──────────────────────────────────────────
    if (isSupabaseConfigured() && supabase && navigator.onLine) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password })
      if (error) {
        // Si falla Supabase Auth, intentar con hash local (usuario creado offline)
        const local = await verifyLocalUser(em, password)
        if (local) {
          registerSuccess(em)
          const u = { id:local.id, name:local.name, email:local.email, role:local.role }
          save(u); return u
        }
        registerFail(em)
        throw new Error('Credenciales incorrectas o usuario inactivo.')
      }
      registerSuccess(em)

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
      const user = await verifyLocalUser(em, password)
      if (!user) { registerFail(em); throw new Error('Credenciales incorrectas o usuario inactivo.') }
      registerSuccess(em)
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
    if (!data.password || data.password.length < 8)
      throw new Error('La contraseña debe tener al menos 8 caracteres.')
    const hash = await hashPassword(data.password)
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

    // Protección: no dejar el sistema sin ningún administrador activo
    if (!data.active || data.role !== 'administrador') {
      const target = await db.get('SELECT role,active FROM users WHERE id=?', [id])
      if (target?.role === 'administrador' && target?.active) {
        const admins = await db.get("SELECT COUNT(*) as c FROM users WHERE role='administrador' AND active=1")
        if ((admins?.c ?? 0) <= 1)
          throw new Error('No puedes desactivar ni cambiar el rol del único administrador activo.')
      }
    }

    const updates = {
      name:   data.name,
      email:  data.email.toLowerCase(),
      role:   data.role,
      active: data.active ? 1 : 0,
    }
    if (data.password) {
      if (data.password.length < 8)
        throw new Error('La contraseña debe tener al menos 8 caracteres.')
      updates.password_hash = await hashPassword(data.password)
    }
    const fields = Object.keys(updates).map(k => `${k}=?`).join(',')
    await db.run(
      `UPDATE users SET ${fields},updated_at=datetime('now') WHERE id=?`,
      [...Object.values(updates), id]
    )
  },

  async deleteUser(id) {
    if (!isElectron) return
    const target = await db.get('SELECT role,active FROM users WHERE id=?', [id])
    if (target?.role === 'administrador' && target?.active) {
      const admins = await db.get("SELECT COUNT(*) as c FROM users WHERE role='administrador' AND active=1")
      if ((admins?.c ?? 0) <= 1)
        throw new Error('No puedes desactivar al único administrador activo.')
    }
    await db.run('UPDATE users SET active=0,updated_at=datetime("now") WHERE id=?', [id])
  },
}
