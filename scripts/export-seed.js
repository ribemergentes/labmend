/**
 * export-seed.js — Lee el DB actual y genera el código seedCatalog actualizado
 * Uso: node scripts/export-seed.js
 */
const path  = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '../labmend.db')
const db = new Database(dbPath, { readonly: true })

const exams  = db.prepare("SELECT * FROM exams WHERE active=1 ORDER BY category, code").all()
const params = db.prepare("SELECT * FROM exam_parameters ORDER BY exam_id, sort_order").all()
const refs   = db.prepare("SELECT * FROM reference_values").all()

const paramsBy = {}
params.forEach(p => { (paramsBy[p.exam_id] = paramsBy[p.exam_id] || []).push(p) })
const refsByParam = {}
refs.forEach(r => { (refsByParam[r.parameter_id] = refsByParam[r.parameter_id] || []).push(r) })

function j(v) { return JSON.stringify(v) }
function num(v) { return v === null || v === undefined ? 'null' : v }

let out = `function seedCatalog(db) {\n`
out += `  const { randomBytes } = require('crypto')\n`
out += `  const uid = () => randomBytes(8).toString('hex')\n`
out += `  const iE = db.prepare("INSERT OR IGNORE INTO exams (id,category,name,code,price,currency,active,show_subtitle,subtitles_config) VALUES (?,?,?,?,?,?,1,?,?)")\n`
out += `  const iP = db.prepare("INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")\n`
out += `  const iR = db.prepare("INSERT OR IGNORE INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,?,?,?,?,?)")\n\n`

let currentCat = ''
for (const exam of exams) {
  if (exam.category !== currentCat) {
    currentCat = exam.category
    out += `  // ── ${currentCat} ${'─'.repeat(Math.max(0, 60 - currentCat.length))}\n`
  }
  const examParams = paramsBy[exam.id] || []
  const showSub = exam.show_subtitle ?? 1
  const subsCfg = exam.subtitles_config ? exam.subtitles_config.replace(/'/g, "\\'") : null
  const subsCfgArg = subsCfg ? `'${subsCfg}'` : 'null'

  out += `  iE.run(${j(exam.id)},${j(exam.category)},${j(exam.name)},${j(exam.code)},${exam.price||0},'Bs',${showSub},${subsCfgArg})\n`

  for (const p of examParams) {
    out += `  ;(()=>{ const pid=uid(); iP.run(pid,${j(exam.id)},${j(p.name)},${j(p.unit||'')},${j(p.input_type||'number')},${p.sort_order})\n`
    const pRefs = refsByParam[p.id] || []
    for (const r of pRefs) {
      out += `    iR.run(uid(),pid,${j(r.sex)},${num(r.age_min)},${num(r.age_max)},${num(r.value_min)},${num(r.value_max)},${j(r.text_value)})\n`
    }
    out += `  })()\n`
  }
  out += `\n`
}

out += `}\n`

const fs = require('fs')
const outPath = require('path').join(__dirname, 'seed-output.txt')
fs.writeFileSync(outPath, out, 'utf8')
db.close()
process.exit(0)
