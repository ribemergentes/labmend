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

// ── Normalización para comparar/buscar ────────────────────────────────────────
// CI: sin espacios, puntos ni guiones, en mayúsculas ("  1234567 lp." → "1234567LP")
export function normalizeCI(ci) {
  return (ci || '').replace(/[\s.\-]/g, '').toUpperCase()
}
// Nombre: minúsculas, sin tildes, espacios colapsados ("MARÍA  Pérez " → "maria perez")
export function normalizeName(name) {
  return (name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

export const patientService = {
  async getAll(search = '') {
    const words = (search || '').trim().split(/\s+/).filter(Boolean)
    if (words.length) {
      // Cada palabra debe aparecer en nombre+apellido (juntos), CI o código.
      // Así "juan perez" encuentra a "JUAN CARLOS PEREZ MAMANI".
      const cond = words.map(() =>
        `((first_name || ' ' || last_name) LIKE ? OR id_number LIKE ? OR code LIKE ?)`
      ).join(' AND ')
      const params = words.flatMap(w => [`%${w}%`, `%${w}%`, `%${w}%`])
      return db.query(
        `SELECT * FROM patients WHERE ${cond} ORDER BY last_name, first_name`, params)
    }
    return db.query('SELECT * FROM patients ORDER BY last_name, first_name')
  },

  // ── Detección de duplicados (a nivel de aplicación, no de esquema) ──────────
  // Devuelve { ciMatch, nameMatch } — el paciente existente con el mismo CI
  // (comparado normalizado) y/o el mismo nombre+apellido (normalizado).
  // excludeId: en modo edición, el propio paciente no cuenta como duplicado.
  async findDuplicates({ id_number, first_name, last_name }, excludeId = null) {
    const all = await db.query(
      'SELECT id, code, first_name, last_name, id_number FROM patients')
    const ci   = normalizeCI(id_number)
    const name = normalizeName(`${first_name || ''} ${last_name || ''}`)

    let ciMatch = null, nameMatch = null
    for (const p of all) {
      if (p.id === excludeId) continue
      if (!ciMatch && ci && normalizeCI(p.id_number) === ci) ciMatch = p
      if (!nameMatch && name && normalizeName(`${p.first_name} ${p.last_name}`) === name) nameMatch = p
    }

    // Datos extra para el aviso (cuántas órdenes tiene, última visita)
    for (const m of [ciMatch, nameMatch]) {
      if (m && m.order_count === undefined) {
        const s = await db.get(
          'SELECT COUNT(*) as c, MAX(created_at) as last FROM orders WHERE patient_id=?', [m.id])
        m.order_count = s?.c || 0
        m.last_visit  = s?.last || null
      }
    }
    return { ciMatch, nameMatch }
  },

  // ── Historial del paciente (solo lectura, usa tablas existentes) ────────────
  async getStats(patientId) {
    const orders = await db.get(
      'SELECT COUNT(*) as total, MAX(created_at) as last_visit FROM orders WHERE patient_id=?',
      [patientId])
    const exams = await db.get(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN oe.status='completado' THEN 1 ELSE 0 END) as done
       FROM order_exams oe JOIN orders o ON oe.order_id=o.id
       WHERE o.patient_id=?`, [patientId])
    const paid = await db.get(
      `SELECT COALESCE(SUM(pm.amount),0) as total
       FROM payments pm JOIN orders o ON pm.order_id=o.id
       WHERE o.patient_id=?`, [patientId])
    return {
      total_orders: orders?.total || 0,
      last_visit:   orders?.last_visit || null,
      total_exams:  exams?.total || 0,
      exams_done:   exams?.done || 0,
      total_paid:   paid?.total || 0,
    }
  },

  async getHistory(patientId) {
    return db.query(
      `SELECT o.id, o.order_number, o.status, o.priority, o.created_at, o.total_amount, o.doctor_name,
              (SELECT COUNT(*) FROM order_exams oe WHERE oe.order_id=o.id) as exam_count,
              (SELECT GROUP_CONCAT(e.name, ', ') FROM order_exams oe
               LEFT JOIN exams e ON oe.exam_id=e.id WHERE oe.order_id=o.id) as exam_names,
              (SELECT COUNT(*) FROM results r JOIN order_exams oe2 ON r.order_exam_id=oe2.id
               WHERE oe2.order_id=o.id AND r.is_abnormal=1) as abnormal_count
       FROM orders o
       WHERE o.patient_id=?
       ORDER BY o.created_at DESC`, [patientId])
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
