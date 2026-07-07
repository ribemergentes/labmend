/**
 * gen-seed.js — lee catalog-export.json y genera el nuevo seedCatalog
 */
const fs   = require('fs')
const path = require('path')

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog-export.json'), 'utf8'))
const { exams, params, refs } = data

const paramsBy   = {}
params.forEach(p => { (paramsBy[p.exam_id] = paramsBy[p.exam_id] || []).push(p) })
const refsByParam = {}
refs.forEach(r  => { (refsByParam[r.parameter_id] = refsByParam[r.parameter_id] || []).push(r) })

function j(v) { return JSON.stringify(v) }
function num(v) { return (v === null || v === undefined) ? 'null' : v }

// Order by canonical category
const CAT_ORDER = [
  'HEMATOLOGÍA','QUÍMICA SANGUÍNEA','EXAMEN DE ORINA','CITOLOGÍA',
  'MICROBIOLOGÍA','COPROLOGÍA','SEROLOGÍA','INMUNOHEMATOLOGÍA','OTROS',
]
exams.sort((a,b) => {
  const ai = CAT_ORDER.indexOf(a.category)
  const bi = CAT_ORDER.indexOf(b.category)
  if (ai !== bi) return (ai<0?99:ai) - (bi<0?99:bi)
  return (a.code||'').localeCompare(b.code||'')
})

let out = `function seedCatalog(db) {\n`
out += `  const { randomBytes } = require('crypto')\n`
out += `  const uid = () => randomBytes(8).toString('hex')\n`
out += `  const iE = db.prepare(\n`
out += `    "INSERT OR IGNORE INTO exams (id,category,name,code,price,currency,active,show_subtitle,subtitles_config) VALUES (?,?,?,?,?,?,1,?,?)"\n`
out += `  )\n`
out += `  const iP = db.prepare("INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")\n`
out += `  const iR = db.prepare("INSERT OR IGNORE INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,?,?,?,?,?)")\n\n`

let currentCat = ''
for (const exam of exams) {
  if (exam.category !== currentCat) {
    currentCat = exam.category
    const dashes = '─'.repeat(Math.max(2, 58 - currentCat.length))
    out += `  // ── ${currentCat} ${dashes}\n`
  }
  const showSub   = exam.show_subtitle ?? 1
  const subsCfg   = exam.subtitles_config || null
  const subsCfgJs = subsCfg ? j(subsCfg) : 'null'

  out += `  iE.run(${j(exam.id)},${j(exam.category)},${j(exam.name)},${j(exam.code)},${exam.price||0},'Bs',${showSub},${subsCfgJs})\n`

  const examParams = paramsBy[exam.id] || []
  for (const p of examParams) {
    const pRefs = refsByParam[p.id] || []
    out += `  ;(()=>{\n    const pid=uid()\n`
    out += `    iP.run(pid,${j(exam.id)},${j(p.name)},${j(p.unit||'')},${j(p.input_type||'number')},${p.sort_order})\n`
    for (const r of pRefs) {
      out += `    iR.run(uid(),pid,${j(r.sex)},${num(r.age_min)},${num(r.age_max)},${num(r.value_min)},${num(r.value_max)},${j(r.text_value)})\n`
    }
    out += `  })()\n`
  }
  out += `\n`
}

out += `}\n`

fs.writeFileSync(path.join(__dirname, 'seed-generated.txt'), out, 'utf8')
console.log('Done! seed-generated.txt written.')
