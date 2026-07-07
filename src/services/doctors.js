import { db, generateId } from './database'

export const doctorService = {
  async getAll() {
    return db.query('SELECT * FROM doctors WHERE active=1 ORDER BY name ASC')
  },

  async create({ name, specialty }) {
    const id = generateId()
    await db.run(
      'INSERT INTO doctors (id, name, specialty) VALUES (?,?,?)',
      [id, name.trim(), specialty?.trim() || null]
    )
    return id
  },

  async update(id, { name, specialty }) {
    await db.run(
      'UPDATE doctors SET name=?, specialty=? WHERE id=?',
      [name.trim(), specialty?.trim() || null, id]
    )
  },

  async remove(id) {
    await db.run('DELETE FROM doctors WHERE id=?', [id])
  },
}
