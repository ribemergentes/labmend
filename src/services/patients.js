import { db, generateId, now, isElectron } from './database'

// ── Formatear edad exacta con años y meses ────────────────────────────────────
export function formatAge(birthDate) {
  if (!birthDate) return null
  const bd   = new Date(birthDate)
  const hoy  = new Date()

  let years  = hoy.getFullYear() - bd.getFullYear()
  let months = hoy.getMonth()    - bd.getMonth()

  if (months < 0) { years--; months += 12 }
  if (hoy.getDate() < bd.getDate()) months--
  if (months < 0) { years--; months += 12 }

  // Reglas gramaticales: singular/plural
  const yr  = years  === 1 ? '1 año'    : years  > 1  ? `${years} años`   : null
  const mo  = months === 1 ? '1 mes'    : months > 1  ? `${months} meses` : null

  // < 2 años → mostrar meses también
  if (years < 2) {
    if (yr && mo)  return `${yr} y ${mo}`
    if (yr)        return yr           // exactamente 1 año
    if (mo)        return mo           // menos de 1 año
    return 'Recién nacido'
  }
  // ≥ 2 años → solo años
  return yr || '0 años'
}

export const patientService = {
  async getAll(search = '') {
    if (search) {
      const q = `%${search}%`
      return db.query(
        `SELECT * FROM patients WHERE first_name LIKE ? OR last_name LIKE ? OR id_number LIKE ? OR code LIKE ?
         ORDER BY last_name, first_name`, [q,q,q,q])
    }
    return db.query('SELECT * FROM patients ORDER BY last_name, first_name')
  },

  async getById(id) { return db.get('SELECT * FROM patients WHERE id=?',[id]) },

  async create(data) {
    const id  = generateId()
    const cnt = await db.get('SELECT COUNT(*) as c FROM patients')
    const code = `PAC-${String((cnt?.c||0)+1).padStart(5,'0')}`
    await db.run(
      `INSERT INTO patients (id,code,first_name,last_name,birth_date,sex,id_number,phone,whatsapp,email,address,notes,synced,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'))`,
      [id,code,data.first_name,data.last_name,data.birth_date||null,data.sex||null,
       data.id_number||null,data.phone||null,data.whatsapp||null,data.email||null,data.address||null,data.notes||null])
    return id
  },

  async update(id, data) {
    await db.run(
      `UPDATE patients SET first_name=?,last_name=?,birth_date=?,sex=?,id_number=?,phone=?,whatsapp=?,
       email=?,address=?,notes=?,updated_at=datetime('now'),synced=0 WHERE id=?`,
      [data.first_name,data.last_name,data.birth_date||null,data.sex||null,data.id_number||null,
       data.phone||null,data.whatsapp||null,data.email||null,data.address||null,data.notes||null,id])
  },

  // Mantener para compatibilidad
  getAge(birthDate) {
    if (!birthDate) return null
    const bd = new Date(birthDate), hoy = new Date()
    let age = hoy.getFullYear() - bd.getFullYear()
    if (hoy.getMonth() - bd.getMonth() < 0 || (hoy.getMonth()===bd.getMonth() && hoy.getDate()<bd.getDate())) age--
    return age
  }
}
