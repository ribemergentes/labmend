import { examService } from './exams'
import { patientService } from './patients'
import { db, generateId, now } from './database'

export const orderService = {
  async getAll(filters = {}) {
    let sql = `
      SELECT o.*, 
             p.first_name || ' ' || p.last_name as patient_name,
             p.code as patient_code,
             u.name as created_by_name
      FROM orders o
      LEFT JOIN patients p ON o.patient_id = p.id
      LEFT JOIN users u ON o.created_by = u.id
    `
    const params = []
    const where = []

    if (filters.status) { where.push('o.status = ?'); params.push(filters.status) }
    if (filters.patient_id) { where.push('o.patient_id = ?'); params.push(filters.patient_id) }
    if (filters.date_from) { where.push('DATE(o.created_at) >= ?'); params.push(filters.date_from) }
    if (filters.date_to) { where.push('DATE(o.created_at) <= ?'); params.push(filters.date_to) }
    if (filters.search) {
      where.push('(o.order_number LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)')
      const q = `%${filters.search}%`
      params.push(q, q, q)
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY o.created_at DESC'
    if (filters.limit) sql += ` LIMIT ${filters.limit}`

    return db.query(sql, params)
  },

  async getById(id) {
    const order = await db.get(`
      SELECT o.*, 
             p.first_name || ' ' || p.last_name as patient_name,
             p.code as patient_code, p.sex as patient_sex, p.birth_date as patient_birth_date,
             p.id_number as patient_id_number, p.phone as patient_phone, p.whatsapp as patient_whatsapp, p.email as patient_email
      FROM orders o
      LEFT JOIN patients p ON o.patient_id = p.id
      WHERE o.id = ?`, [id])
    if (!order) return null

    let exams
    try {
      exams = await db.query(`
        SELECT oe.*, e.name as exam_name, e.code as exam_code, e.category as exam_category,
               e.show_subtitle as exam_show_subtitle, e.subtitles_config as exam_subtitles_config, e.print_columns as exam_print_columns,
               u.name as assigned_to_name
        FROM order_exams oe
        LEFT JOIN exams e ON oe.exam_id = e.id
        LEFT JOIN users u ON oe.assigned_to = u.id
        WHERE oe.order_id = ?`, [id])
    } catch {
      // Fallback: columna show_subtitle puede no existir si la migración aún no corrió
      exams = await db.query(`
        SELECT oe.*, e.name as exam_name, e.code as exam_code, e.category as exam_category,
               u.name as assigned_to_name
        FROM order_exams oe
        LEFT JOIN exams e ON oe.exam_id = e.id
        LEFT JOIN users u ON oe.assigned_to = u.id
        WHERE oe.order_id = ?`, [id])
    }

    return { ...order, exams }
  },

  async create(data, userId) {
    const id = generateId()

    // ── Validar FK antes de la transacción ───────────────────────────────────
    const patient = await db.get('SELECT id FROM patients WHERE id=?', [data.patient_id])
    if (!patient) throw new Error('Paciente no encontrado. Recarga la página e intenta de nuevo.')

    for (const examId of (data.exam_ids || [])) {
      const exam = await db.get('SELECT id FROM exams WHERE id=?', [examId])
      if (!exam) throw new Error(`Examen con ID "${examId}" no existe en la base de datos. Recarga el catálogo.`)
    }

    // userId puede ser null si no hay usuario logueado (evitar FK con undefined)
    const safeUserId = userId || null
    if (safeUserId) {
      const usr = await db.get('SELECT id FROM users WHERE id=?', [safeUserId])
      if (!usr) {
        // El userId no existe localmente — usar null para no violar FK
        // (puede pasar con sesiones Supabase no sincronizadas)
      }
    }
    const finalUserId = safeUserId && await db.get('SELECT id FROM users WHERE id=?', [safeUserId])
      ? safeUserId : null

    // Generate order number
    const d = new Date()
    const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
    const last = await db.get(
      "SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1",
      [`LAB-${dateStr}-%`]
    )
    const seq = last ? (parseInt(last.order_number.split('-').pop()) || 0) + 1 : 1
    const orderNumber = `LAB-${dateStr}-${String(seq).padStart(4, '0')}`

    const ops = [
      {
        sql: `INSERT INTO orders (id, order_number, patient_id, doctor_name, diagnosis, status, priority, notes, total_amount, created_by, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        params: [id, orderNumber, data.patient_id, data.doctor_name || null, data.diagnosis || null,
                 'pendiente', data.priority || 'normal', data.notes || null,
                 data.total_amount || 0, finalUserId, now(), now()]
      }
    ]

    for (const examId of (data.exam_ids || [])) {
      ops.push({
        sql: 'INSERT INTO order_exams (id, order_id, exam_id, status, updated_at) VALUES (?,?,?,?,datetime(\'now\'))',
        params: [generateId(), id, examId, 'pendiente']
      })
    }

    await db.transaction(ops)
    return { id, orderNumber }
  },

  async updateStatus(id, status) {
    await db.run('UPDATE orders SET status=?, updated_at=?, synced=0 WHERE id=?', [status, now(), id])
  },

  async getExamResults(orderExamId) {
    return db.query(`
      SELECT r.*,
             ep.name as param_name, ep.unit, ep.input_type, ep.sort_order as param_sort,
             rv.text_value as reference_text,
             rv.value_min as ref_min, rv.value_max as ref_max, rv.sex as ref_sex,
             u1.name as entered_by_name, u2.name as verified_by_name
      FROM results r
      LEFT JOIN exam_parameters ep ON r.parameter_id = ep.id
      LEFT JOIN reference_values rv ON rv.parameter_id = ep.id AND (rv.sex IS NULL OR rv.sex = (
        SELECT p.sex FROM orders o JOIN patients p ON o.patient_id=p.id
        JOIN order_exams oe ON oe.order_id=o.id WHERE oe.id=r.order_exam_id LIMIT 1
      ))
      LEFT JOIN users u1 ON r.entered_by = u1.id
      LEFT JOIN users u2 ON r.verified_by = u2.id
      WHERE r.order_exam_id = ?
      ORDER BY ep.sort_order`, [orderExamId])
  },

  async saveResults(orderExamId, results, userId) {
    // Validar que userId exista en la DB (evita FK si la DB fue recreada)
    const safeUserId = userId && await db.get('SELECT id FROM users WHERE id=?', [userId])
      ? userId : null

    const ops = []
    for (const r of results) {
      const existing = await db.get('SELECT id FROM results WHERE order_exam_id=? AND parameter_id=?',
        [orderExamId, r.parameter_id])
      if (existing) {
        ops.push({
          sql: 'UPDATE results SET value=?, is_abnormal=?, abnormal_type=?, notes=?, entered_by=?, updated_at=?, synced=0 WHERE id=?',
          params: [r.value, r.is_abnormal ? 1 : 0, r.abnormal_type || null, r.notes || null, safeUserId, now(), existing.id]
        })
      } else {
        ops.push({
          sql: 'INSERT INTO results (id, order_exam_id, parameter_id, value, is_abnormal, abnormal_type, notes, entered_by, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime(\'now\'))',
          params: [generateId(), orderExamId, r.parameter_id, r.value, r.is_abnormal ? 1 : 0, r.abnormal_type || null, r.notes || null, safeUserId]
        })
      }
    }
    // Update order_exam status
    ops.push({
      sql: "UPDATE order_exams SET status='en_proceso', synced=0 WHERE id=?",
      params: [orderExamId]
    })
    if (ops.length) await db.transaction(ops)
  },

    async verifyResults(orderExamId, userId) {
    const safeUserId = userId && await db.get('SELECT id FROM users WHERE id=?', [userId])
      ? userId : null
    await db.transaction([
      { sql: "UPDATE results SET verified_by=?, updated_at=?, synced=0 WHERE order_exam_id=?", params: [safeUserId, now(), orderExamId] },
      { sql: "UPDATE order_exams SET status='completado', synced=0 WHERE id=?", params: [orderExamId] }
    ])

    const pending = await db.get(
      "SELECT COUNT(*) as c FROM order_exams WHERE order_id=(SELECT order_id FROM order_exams WHERE id=?) AND status != 'completado'",
      [orderExamId]
    )

    if (pending?.c === 0) {
      const orderId = await db.get('SELECT order_id FROM order_exams WHERE id=?', [orderExamId])
      if (orderId) {
        await db.run(
          "UPDATE orders SET status='completado', updated_at=?, synced=0 WHERE id=?",
          [now(), orderId.order_id]
        )
      }
    }
  },

  // Obtener todos los exámenes de una orden con sus parámetros
  async getOrderExamsWithParams(orderId) {
    const order = await this.getById(orderId)
    if (!order) return null

    const enriched = []

    for (const oe of (order.exams || [])) {
      const age = patientService.getAge(order.patient_birth_date)

      const exam = await examService.getExamWithParameters(
        oe.exam_id,
        order.patient_sex,
        age
      )

      const existingResults = await this.getExamResults(oe.id)

      const resultsMap = {}

      for (const r of existingResults) {
        resultsMap[r.parameter_id] = {
          value: r.value || '',
          is_abnormal: r.is_abnormal,
          abnormal_type: r.abnormal_type,
          notes: r.notes || ''
        }
      }

      for (const p of (exam?.parameters || [])) {
        if (!resultsMap[p.id]) {
          resultsMap[p.id] = {
            value: '',
            is_abnormal: false,
            abnormal_type: null,
            notes: ''
          }
        }
      }

      enriched.push({
        ...oe,
        examData: exam,
        resultsMap
      })
    }

    return { ...order, enrichedExams: enriched }
  }

}