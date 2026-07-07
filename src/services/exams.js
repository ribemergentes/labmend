import { db, generateId } from './database'

export const examService = {
  async getAll(category = null) {
    if (category) {
      return db.query('SELECT * FROM exams WHERE category=? AND active=1 ORDER BY name', [category])
    }
    return db.query('SELECT * FROM exams WHERE active=1 ORDER BY category, name')
  },

  async getCategories() {
    const rows = await db.query('SELECT DISTINCT category FROM exams ORDER BY category')
    return rows.map(r => r.category)
  },

  async getById(id) {
    return db.get('SELECT * FROM exams WHERE id=?', [id])
  },

  async getParameters(examId) {
    return db.query(
      'SELECT * FROM exam_parameters WHERE exam_id=? ORDER BY sort_order',
      [examId]
    )
  },

  async getParameterWithRefs(parameterId, sex = null, age = null) {
    const param = await db.get('SELECT * FROM exam_parameters WHERE id=?', [parameterId])
    if (!param) return null

    let refSql = 'SELECT * FROM reference_values WHERE parameter_id=?'
    const refParams = [parameterId]
    
    if (sex) {
      refSql += ' AND (sex IS NULL OR sex=?)'
      refParams.push(sex)
    }
    if (age !== null) {
      refSql += ' AND (age_min <= ? AND age_max >= ?)'
      refParams.push(age, age)
    }

    const refs = await db.query(refSql, refParams)
    return { ...param, references: refs }
  },

  async getExamWithParameters(examId, sex = null, age = null) {
    const exam = await db.get('SELECT * FROM exams WHERE id=?', [examId])
    if (!exam) return null
    const params = await db.query('SELECT * FROM exam_parameters WHERE exam_id=? ORDER BY sort_order', [examId])
    
    const paramsWithRefs = await Promise.all(params.map(async p => {
      let refSql = 'SELECT * FROM reference_values WHERE parameter_id=?'
      const refArgs = [p.id]
      if (sex) { refSql += ' AND (sex IS NULL OR sex=?)'; refArgs.push(sex) }
      if (age !== null) { refSql += ' AND (? BETWEEN age_min AND age_max)'; refArgs.push(age) }
      const refs = await db.query(refSql, refArgs)
      // prefer sex-specific refs
      const sortedRefs = refs.sort((a, b) => {
        if (a.sex === sex && b.sex !== sex) return -1
        if (a.sex !== sex && b.sex === sex) return 1
        return 0
      })
      return { ...p, references: sortedRefs, reference: sortedRefs[0] || null }
    }))

    return { ...exam, parameters: paramsWithRefs }
  },

  checkAbnormal(value, reference, inputType = 'number') {
    if (!reference || value === null || value === undefined || value === '') return { is_abnormal: false }
    
    if (inputType === 'number' || inputType === 'decimal') {
      const num = parseFloat(value)
      if (isNaN(num)) return { is_abnormal: false }
      if (reference.value_min !== null && num < reference.value_min) {
        return { is_abnormal: true, abnormal_type: 'low' }
      }
      if (reference.value_max !== null && num > reference.value_max) {
        return { is_abnormal: true, abnormal_type: 'high' }
      }
    }
    return { is_abnormal: false }
  }
}
