const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const isDev = !app.isPackaged

// ── AUTO UPDATER ───────────────────────────────────────────────────────────────
let autoUpdater = null
function setupUpdater() {
  if (isDev) return  // No buscar actualizaciones en desarrollo
  try {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = false       // Descargar solo cuando el usuario confirme
    autoUpdater.autoInstallOnAppQuit = true

    // Repositorio público — no se necesita token

    autoUpdater.on('checking-for-update',  () => sendUpdateStatus('checking'))
    autoUpdater.on('update-not-available', () => sendUpdateStatus('up-to-date'))
    autoUpdater.on('error',                (e) => sendUpdateStatus('error', { message: e.message }))
    autoUpdater.on('update-available',     (info) => sendUpdateStatus('available', info))
    autoUpdater.on('download-progress',    (p) => sendUpdateStatus('downloading', { percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded',    (info) => sendUpdateStatus('ready', info))
  } catch(e) { console.warn('[Updater] No disponible:', e.message) }
}

function sendUpdateStatus(event, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', { event, ...data })
  }
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    show: false,
    backgroundColor: '#0f1117',
  })

  if (isDev) {
  mainWindow.loadURL('http://localhost:5173')
} else {
  const indexPath = path.join(__dirname, '../dist/index.html')
  mainWindow.loadFile(indexPath)
}

  // Mostrar ventana cuando esté lista
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Fallback: si ready-to-show no dispara en 8s, mostrar igual
  const showTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  }, 8000)
  mainWindow.once('ready-to-show', () => clearTimeout(showTimeout))

  // Manejar fallo de carga (página en blanco sin motivo)
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('did-fail-load:', code, desc)
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  })

  // Manejar crash del renderer
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer crash:', details.reason)
  })
}

app.whenReady().then(() => {
  createWindow()
  setupUpdater()
  // Verificar actualizaciones 5s después de arrancar (dar tiempo al renderer)
  if (!isDev) setTimeout(() => { try { autoUpdater?.checkForUpdates() } catch(e){} }, 5000)
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── DATABASE ──────────────────────────────────────────────────────────────────
let db = null
function getDb() {
  if (db) return db
  try {
    const Database = require('better-sqlite3')
    const dbPath = isDev ? path.join(__dirname, '../labmend.db') : path.join(app.getPath('userData'), 'labmend.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initDb(db)
    return db
  } catch(e) { console.error('SQLite error:', e); return null }
}

function uid() { return require('crypto').randomBytes(8).toString('hex') }

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('administrador','bioquimico','recepcion','administrativo')),
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY, code TEXT UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      birth_date TEXT, sex TEXT CHECK(sex IN ('M','F')), id_number TEXT, phone TEXT,
      whatsapp TEXT, email TEXT, address TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, code TEXT UNIQUE,
      description TEXT, price REAL DEFAULT 0, currency TEXT DEFAULT 'Bs',
      active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS exam_parameters (
      id TEXT PRIMARY KEY, exam_id TEXT REFERENCES exams(id) ON DELETE CASCADE,
      name TEXT NOT NULL, unit TEXT, input_type TEXT DEFAULT 'number',
      sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reference_values (
      id TEXT PRIMARY KEY, parameter_id TEXT REFERENCES exam_parameters(id) ON DELETE CASCADE,
      sex TEXT, age_min INTEGER DEFAULT 0, age_max INTEGER DEFAULT 999,
      value_min REAL, value_max REAL, text_value TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, order_number TEXT UNIQUE NOT NULL,
      patient_id TEXT REFERENCES patients(id),
      doctor_name TEXT, diagnosis TEXT,
      status TEXT DEFAULT 'pendiente' CHECK(status IN ('pendiente','en_proceso','completado','entregado','cancelado')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('normal','urgente','emergencia')),
      notes TEXT, total_amount REAL DEFAULT 0,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS order_exams (
      id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
      exam_id TEXT REFERENCES exams(id),
      status TEXT DEFAULT 'pendiente' CHECK(status IN ('pendiente','en_proceso','completado')),
      assigned_to TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY, order_exam_id TEXT REFERENCES order_exams(id) ON DELETE CASCADE,
      parameter_id TEXT REFERENCES exam_parameters(id),
      value TEXT, is_abnormal INTEGER DEFAULT 0, abnormal_type TEXT, notes TEXT,
      entered_by TEXT REFERENCES users(id), verified_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS lab_config (
      key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id),
      amount REAL NOT NULL, currency TEXT DEFAULT 'Bs',
      method TEXT DEFAULT 'efectivo',
      notes TEXT, created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Users — solo admin inicial (los demás vienen de Supabase)
  // Hash PBKDF2 con salt, mismo formato que verifica src/services/auth.js
  const adminExists = db.prepare("SELECT id FROM users WHERE role='administrador' LIMIT 1").get()
  if (!adminExists) {
    const { pbkdf2Sync, randomBytes } = require('crypto')
    const salt = randomBytes(16).toString('hex')
    const hash = pbkdf2Sync('admin123', Buffer.from(salt,'hex'), 100000, 32, 'sha256').toString('hex')
    db.prepare("INSERT OR IGNORE INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)")
      .run(uid(),'Administrador','admin@labmend.com',`pbkdf2$100000$${salt}$${hash}`,'administrador')
  }

  // ── Migraciones de esquema (ANTES del seed para que las columnas existan) ───
  const examCols = db.prepare("PRAGMA table_info(exams)").all().map(c=>c.name)
  if (!examCols.includes('synced'))
    db.prepare("ALTER TABLE exams ADD COLUMN synced INTEGER DEFAULT 0").run()
  if (!examCols.includes('updated_at'))
    db.prepare("ALTER TABLE exams ADD COLUMN updated_at TEXT DEFAULT NULL").run()
  if (!examCols.includes('show_subtitle'))
    db.prepare("ALTER TABLE exams ADD COLUMN show_subtitle INTEGER DEFAULT 1").run()
  if (!examCols.includes('subtitles_config'))
    db.prepare("ALTER TABLE exams ADD COLUMN subtitles_config TEXT DEFAULT NULL").run()
  if (!examCols.includes('print_columns'))
    db.prepare("ALTER TABLE exams ADD COLUMN print_columns INTEGER DEFAULT 0").run()

  // Exams seed
  const examCount = db.prepare("SELECT COUNT(*) as c FROM exams").get()
  if (examCount.c === 0) seedCatalog(db)

  // Config defaults
  const ic = db.prepare("INSERT OR IGNORE INTO lab_config (key,value) VALUES (?,?)")
  for (const [k,v] of [
    ['initial_sync_done','0'],
    ['lab_name','Laboratorio Clínico LabMend'],
    ['lab_address','Dirección del Laboratorio'],
    ['lab_phone','+591 000 00000'],
    ['lab_email','lab@labmend.com'],
    ['lab_director','Dr./Dra. Director(a)'],
    ['lab_license','Lic. No. 0000'],
    ['currency','Bs'],
    ['result_footer','Este resultado es válido únicamente con firma del responsable técnico.'],
    // SMTP: sin credenciales por defecto — cada laboratorio configura su propia
    // cuenta en Configuración. Las instalaciones existentes conservan las suyas
    // (INSERT OR IGNORE no pisa valores ya guardados).
    ['smtp_host','smtp.gmail.com'],
    ['smtp_port','587'],
    ['smtp_user',''],
    ['smtp_pass',''],
    ['smtp_from',''],
    ['whatsapp_country','591'],
  ]) ic.run(k,v)

  // Seed subtitles_config para exámenes con lógica pre-existente
  // Seed subtitles_config para COP-001 (installs existentes sin el campo)
  db.prepare("UPDATE exams SET subtitles_config=? WHERE code='COP-001' AND (subtitles_config IS NULL OR subtitles_config='')")
    .run(JSON.stringify([
      { label:'Examen Macroscopico', visible:true, params:['Consistencia','Moco','Restos'] },
      { label:'Examen Microscopico', visible:true, params:[] },
    ]))

  // ── Migraciones de catálogo ─────────────────────────────────────────────────
  const { randomBytes: rb } = require('crypto')
  const muid = () => rb(8).toString('hex')
  const safeRun = (fn) => { try { fn() } catch(e) { console.warn('Migration warning:', e.message) } }

  // ── Migración Widal: solo corre UNA vez (flag en lab_config) ─────────────
  const widalMigDone = db.prepare("SELECT value FROM lab_config WHERE key='migration_widal_v1'").get()
  if (!widalMigDone) {
    const widalExam = db.prepare("SELECT id FROM exams WHERE code='SER-003'").get()
    if (widalExam) {
      safeRun(() => {
        db.prepare("DELETE FROM results WHERE parameter_id IN (SELECT id FROM exam_parameters WHERE exam_id=?)").run(widalExam.id)
        db.prepare("DELETE FROM exam_parameters WHERE exam_id=?").run(widalExam.id)
        db.prepare("INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
          .run(muid(), widalExam.id, 'Título', 'dilución', 'number', 0)
      })
    }
    db.prepare("INSERT OR IGNORE INTO lab_config (key,value) VALUES (?,?)").run('migration_widal_v1', '1')
  }

  // ── Migración Coprología completa ──────────────────────────────────────────
  // Renombrar exámenes
  db.prepare("UPDATE exams SET name=? WHERE code='COP-002'")
    .run('Antígeno de Helicobacter pylori en Heces')
  db.prepare("UPDATE exams SET name=? WHERE code='COP-001'")
    .run('Examen General de Heces')

  // Parámetros correctos de COP-001
  const coprExam = db.prepare("SELECT id FROM exams WHERE code='COP-001'").get()
  if (coprExam) {
    // Definición correcta: [nombre, unidad, tipo, sort, opciones_txt]
    const correctParams = [
      ['Consistencia',       '',       'select',   0, 'Formada|Blanda|Semi-blanda|Diarreica|Pastosa|Liquida'],
      ['Moco',               '',       'select',   1, 'Ausente|Presente|Escaso|Abundante'],
      ['Restos Alimenticios','',       'select',   2, 'Ausente|Presente|Escaso|Abundante'],
      ['Leucocitos',         '/campo', 'text',     3, '0-2 por campo'],
      ['Eritrocitos',        '/campo', 'text',     4, 'Ausente'],
      ['Bacterias',          '',       'text',     5, 'Flora habitual'],
      ['Levaduras',          '',       'select',   6, 'Ausente|Escasas|Moderadas|Abundantes'],
      ['Almidón',            '',       'select',   7, 'Ausente|Escaso|Moderado|Abundante'],
      ['Formas Parasitarias','',       'textarea', 8, 'No se observan'],
      ['Observaciones',      '',       'textarea', 9, ''],
    ]
    const getParam = db.prepare("SELECT id FROM exam_parameters WHERE exam_id=? AND name=?")
    const insParam  = db.prepare("INSERT INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
    const updParam  = db.prepare("UPDATE exam_parameters SET unit=?,input_type=?,sort_order=? WHERE id=?")
    const insRef    = db.prepare("INSERT OR IGNORE INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,?,?,?,?,?)")
    const updRef    = db.prepare("UPDATE reference_values SET text_value=? WHERE parameter_id=? AND (sex IS NULL OR sex='')")
    const delRef    = db.prepare("DELETE FROM reference_values WHERE parameter_id=?")

    for (const [name, unit, type, sort, txt] of correctParams) {
      let row = getParam.get(coprExam.id, name)
      if (!row) {
        const pid = muid()
        insParam.run(pid, coprExam.id, name, unit, type, sort)
        row = { id: pid }
        if (txt) insRef.run(muid(), row.id, null, 0, 999, null, null, txt)
      } else {
        updParam.run(unit, type, sort, row.id)
        if (txt) {
          const refExists = db.prepare("SELECT id FROM reference_values WHERE parameter_id=?").get(row.id)
          if (refExists) updRef.run(txt, row.id)
          else insRef.run(muid(), row.id, null, 0, 999, null, null, txt)
        } else {
          delRef.run(row.id)
        }
      }
    }
  }

  // Reformar OTR-001 → único parámetro JSON para tabla dinámica
  db.prepare("UPDATE exams SET name='Formulario en Blanco' WHERE code='OTR-001'").run()
  const otrExam = db.prepare("SELECT id FROM exams WHERE code='OTR-001'").get()
  if (otrExam) {
    const hasRowsParam = db.prepare("SELECT id FROM exam_parameters WHERE exam_id=? AND name='__rows'").get(otrExam.id)
    if (!hasRowsParam) {
      // Eliminar resultados huérfanos primero (results.parameter_id no tiene CASCADE)
      safeRun(() => {
        const oldParams = db.prepare("SELECT id FROM exam_parameters WHERE exam_id=?").all(otrExam.id)
        for (const op of oldParams) {
          db.prepare("DELETE FROM results WHERE parameter_id=?").run(op.id)
          db.prepare("DELETE FROM reference_values WHERE parameter_id=?").run(op.id)
        }
        db.prepare("DELETE FROM exam_parameters WHERE exam_id=?").run(otrExam.id)
      })
      // Insertar único parámetro que almacenará filas como JSON
      db.prepare("INSERT INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
        .run(muid(), otrExam.id, '__rows', '', 'textarea', 0)
    }
  }

  // Reemplazar Cilindro Hialino y Cilindro Granuloso por un único parámetro "Cilindros"
  const egoExam = db.prepare("SELECT id FROM exams WHERE code='ORI-001'").get()
  if (egoExam) {
    const cilExists = db.prepare("SELECT id FROM exam_parameters WHERE exam_id=? AND name='Cilindros'").get(egoExam.id)
    if (!cilExists) {
      // Obtener sort_order de Eritrocitos para insertar justo después
      const eritRow = db.prepare("SELECT sort_order FROM exam_parameters WHERE exam_id=? AND name='Eritrocitos'").get(egoExam.id)
      const newOrder = eritRow ? eritRow.sort_order + 1 : 50
      // Desplazar los parámetros siguientes
      db.prepare("UPDATE exam_parameters SET sort_order=sort_order+1 WHERE exam_id=? AND sort_order>=?").run(egoExam.id, newOrder)
      const { randomBytes } = require('crypto')
      db.prepare("INSERT INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
        .run(randomBytes(8).toString('hex'), egoExam.id, 'Cilindros', '/campo', 'text', newOrder)
    }
    // Eliminar viejos parámetros — primero resultados huérfanos (results no tiene CASCADE en parameter_id)
    safeRun(() => {
      db.prepare(`DELETE FROM results WHERE parameter_id IN (
        SELECT id FROM exam_parameters WHERE exam_id=? AND name IN ('Cilindro Hialino','Cilindro Granuloso')
      )`).run(egoExam.id)
      db.prepare("DELETE FROM exam_parameters WHERE exam_id=? AND name IN ('Cilindro Hialino','Cilindro Granuloso')").run(egoExam.id)
    })
  }

  // Renombrar "Colesterol Total" → "Colesterol" en examen y parámetro
  db.prepare("UPDATE exams SET name='Colesterol' WHERE code='QUI-007' AND name='Colesterol Total'").run()
  db.prepare("UPDATE exam_parameters SET name='Colesterol' WHERE name='Colesterol Total' AND exam_id=(SELECT id FROM exams WHERE code='QUI-007')").run()

  // Agregar Creatinuria de 24 Horas si no existe (QUI-015)
  const cruExisting = db.prepare("SELECT id FROM exams WHERE code='QUI-015'").get()
  if (!cruExisting) {
    const cruId = muid()
    db.prepare("INSERT OR IGNORE INTO exams (id,category,name,code,price,currency,active) VALUES (?,?,?,?,?,?,1)")
      .run(cruId, 'QUÍMICA SANGUÍNEA', 'Creatinuria de 24 Horas', 'QUI-015', 45, 'Bs')
    const cruP1 = muid()
    db.prepare("INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
      .run(cruP1, cruId, 'Creatinuria 24h', 'mg/24h', 'number', 0)
    db.prepare("INSERT OR IGNORE INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,?,?,?,?,?)")
      .run(muid(), cruP1, null, 0, 999, 16, 28, '16-28 mg/24h')
    const cruP2 = muid()
    db.prepare("INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
      .run(cruP2, cruId, 'Observaciones', '', 'textarea', 1)
  }

  // Agregar Sangre Oculta en Heces si no existe
  const soExisting = db.prepare("SELECT id FROM exams WHERE code='COP-003'").get()
  if (!soExisting) {
    const soId = muid()
    db.prepare("INSERT OR IGNORE INTO exams (id,category,name,code,price,currency,active) VALUES (?,?,?,?,?,?,1)")
      .run(soId, 'COPROLOGÍA', 'Sangre Oculta en Heces', 'COP-003', 40, 'Bs')
    const soParamId = muid()
    db.prepare("INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
      .run(soParamId, soId, 'Sangre Oculta', '', 'select', 0)
    db.prepare("INSERT OR IGNORE INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,?,?,?,?,?)")
      .run(muid(), soParamId, null, 0, 999, null, null, 'Negativo|Positivo')
  }
}

function seedCatalog(db) {
  const { randomBytes } = require('crypto')
  const uid = () => randomBytes(8).toString('hex')
  const iE = db.prepare(
    "INSERT OR IGNORE INTO exams (id,category,name,code,price,currency,active,show_subtitle,subtitles_config) VALUES (?,?,?,?,?,?,1,?,?)"
  )
  const iP = db.prepare("INSERT OR IGNORE INTO exam_parameters (id,exam_id,name,unit,input_type,sort_order) VALUES (?,?,?,?,?,?)")
  const iR = db.prepare("INSERT OR IGNORE INTO reference_values (id,parameter_id,sex,age_min,age_max,value_min,value_max,text_value) VALUES (?,?,?,?,?,?,?,?)")

  // ── HEMATOLOGÍA ───────────────────────────────────────────────────────────
  iE.run("e_hemo","HEMATOLOGÍA","Hemograma Completo","HEM-001",80,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Hematocrito (Hto)","%","number",0); iR.run(uid(),pid,"M",0,999,47,57,null); iR.run(uid(),pid,"F",0,999,45,54,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Hemoglobina (Hb)","g/dL","number",1); iR.run(uid(),pid,"M",0,999,15.5,18.8,null); iR.run(uid(),pid,"F",0,999,14.8,17.8,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Glóbulos Rojos (RBC)","mill/mm³","number",2); iR.run(uid(),pid,"M",0,999,5.7,6.2,null); iR.run(uid(),pid,"F",0,999,4.9,5.9,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","VES (VSG)","mm/h","number",3); iR.run(uid(),pid,"M",0,999,0,15,null); iR.run(uid(),pid,"F",0,999,0,20,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Glóbulos Blancos (WBC)","/mm³","number",4); iR.run(uid(),pid,null,0,999,5000,10000,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Neutrófilos","%","number",5); iR.run(uid(),pid,null,0,999,55,70,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Eosinófilos","%","number",6); iR.run(uid(),pid,null,0,999,0,4,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Basófilos","%","number",7); iR.run(uid(),pid,null,0,999,0,1,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Linfocitos","%","number",8); iR.run(uid(),pid,null,0,999,20,35,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Monocitos","%","number",9); iR.run(uid(),pid,null,0,999,2,8,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Cayados","%","number",10); iR.run(uid(),pid,null,0,999,0,3,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Plaquetas","/mm³","number",11); iR.run(uid(),pid,null,0,999,150000,450000,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hemo","Observaciones","","textarea",12) })()

  // ── QUÍMICA SANGUÍNEA ─────────────────────────────────────────────────────
  iE.run("e_glic","QUÍMICA SANGUÍNEA","Glicemia","QUI-001",30,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_glic","Glucosa","mg/dL","number",0); iR.run(uid(),pid,null,0,999,70,110,"70-110 mg/dL en ayunas") })()

  iE.run("e_urea","QUÍMICA SANGUÍNEA","Urea","QUI-002",30,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_urea","Urea","mg/dL","number",0); iR.run(uid(),pid,null,0,999,10,40,null) })()

  iE.run("e_creat","QUÍMICA SANGUÍNEA","Creatinina","QUI-003",30,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_creat","Creatinina","mg/dL","number",0); iR.run(uid(),pid,"M",0,999,0.6,1.2,null); iR.run(uid(),pid,"F",0,999,0.5,1,null) })()

  iE.run("e_tgo","QUÍMICA SANGUÍNEA","Transaminasa TGO (AST)","QUI-004",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_tgo","TGO / AST","U/L","number",0); iR.run(uid(),pid,"M",0,999,0,40,null); iR.run(uid(),pid,"F",0,999,0,38,null) })()

  iE.run("e_tgp","QUÍMICA SANGUÍNEA","Transaminasa TGP (ALT)","QUI-005",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_tgp","TGP / ALT","U/L","number",0); iR.run(uid(),pid,"M",0,999,0,45,null); iR.run(uid(),pid,"F",0,999,0,38,null) })()

  iE.run("e_bili","QUÍMICA SANGUÍNEA","Bilirrubinas","QUI-006",40,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_bili","Bilirrubina Directa","mg/dL","number",0); iR.run(uid(),pid,null,0,999,0,0.4,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_bili","Bilirrubina Indirecta","mg/dL","number",1) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_bili","Bilirrubina Total","mg/dL","number",2); iR.run(uid(),pid,null,0,999,0,1.2,null) })()

  iE.run("e_col","QUÍMICA SANGUÍNEA","Colesterol","QUI-007",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_col","Colesterol","mg/dL","number",0); iR.run(uid(),pid,null,0,999,0,200,"<200 Optimo | 200-239 Moderado | >239 Alto") })()

  iE.run("e_hdl","QUÍMICA SANGUÍNEA","Colesterol HDL","QUI-008",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hdl","Colesterol HDL","mg/dL","number",0); iR.run(uid(),pid,"M",0,999,40,999,"M: >40  F: >50 mg/dL"); iR.run(uid(),pid,"F",0,999,50,999,null) })()

  iE.run("e_ldl","QUÍMICA SANGUÍNEA","Colesterol LDL","QUI-009",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ldl","Colesterol LDL","mg/dL","number",0); iR.run(uid(),pid,null,0,999,0,100,"<100 Optimo | 100-139 Moderado | >140 Alto") })()

  iE.run("e_trig","QUÍMICA SANGUÍNEA","Triglicéridos","QUI-010",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_trig","Triglicéridos","mg/dL","number",0); iR.run(uid(),pid,null,0,999,0,150,"< 150 mg/dL") })()

  iE.run("e_au","QUÍMICA SANGUÍNEA","Ácido Úrico","QUI-011",30,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_au","Ácido Úrico","mg/dL","number",0); iR.run(uid(),pid,"M",0,999,3.5,7.2,null); iR.run(uid(),pid,"F",0,999,2.6,6,null) })()

  iE.run("e_prot","QUÍMICA SANGUÍNEA","Proteínas Totales","QUI-012",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_prot","Proteínas Totales","g/dL","number",0); iR.run(uid(),pid,null,0,999,6,8,null) })()

  iE.run("e_alb","QUÍMICA SANGUÍNEA","Albúmina","QUI-013",35,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_alb","Albúmina","g/dL","number",0); iR.run(uid(),pid,null,0,999,3.5,5.5,null) })()

  iE.run("e_p24","QUÍMICA SANGUÍNEA","Proteinuria de 24 Horas","QUI-014",45,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_p24","Proteinuria 24h","mg/24h","number",0); iR.run(uid(),pid,null,0,999,28,170,"28-170 mg/24h") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_p24","Observaciones","","textarea",1) })()

  iE.run("dfffe34aff2e5b68","QUÍMICA SANGUÍNEA","Creatinuria de 24 Horas","QUI-015",45,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"dfffe34aff2e5b68","Creatinuria 24h","mg/24h","number",0); iR.run(uid(),pid,null,0,999,16,28,"16-28 mg/24h") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"dfffe34aff2e5b68","Observaciones","","textarea",1) })()

  // ── EXAMEN DE ORINA ───────────────────────────────────────────────────────
  iE.run("e_ego","EXAMEN DE ORINA","Examen General de Orina (EGO)","ORI-001",35,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Volumen","mL","text",0) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Color","","select",1); iR.run(uid(),pid,null,0,999,null,null,"Amarillo palido|Amarillo|Amarillo claro|Amarillo oscuro|Ambar|Palido|Pajizo|Anaranjado|Naranja|Naranja oscuro|Naranja brillante|Rojizo|Rosado|Coral|Cafe|Cafe claro|Caoba|Guindo|Marron|Vino|Verdusco") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Aspecto","","select",2); iR.run(uid(),pid,null,0,999,null,null,"Limpido|Ligeramente opalescente|Opalescente|Turbio") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Densidad","","number",3); iR.run(uid(),pid,null,0,999,1.005,1.03,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","pH","","number",4); iR.run(uid(),pid,null,0,999,5,7,null) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Espuma","","select",5); iR.run(uid(),pid,null,0,999,null,null,"Ausente|Escasa|Poco persistente|Persistente") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Olor","","select",6); iR.run(uid(),pid,null,0,999,null,null,"Sui generis|Fetido|Dulzon|No contiene") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Glucosa","","select",7); iR.run(uid(),pid,null,0,999,null,null,"No contiene|Trazas|Vestigios|100 mg/dL (+)|300 mg/dL (++)|+|++|+++") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Cetonas","","select",8); iR.run(uid(),pid,null,0,999,null,null,"No contiene|Trazas|15 mg/dL|40 mg/dL|80 mg/dL|180 mg/dL") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Proteínas","","select",9); iR.run(uid(),pid,null,0,999,null,null,"No contiene|Trazas|30 mg/dL|100 mg/dL|300 mg/dL|>2000 mg/dL") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Sangre","","select",10); iR.run(uid(),pid,null,0,999,null,null,"No contiene|Vestigios|Trazas|+|++|+++") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Urobilinógeno","","select",11); iR.run(uid(),pid,null,0,999,null,null,"Normal|1 UI/dL|2 UI/dL|3 UI/dL|4 UI/dL|8 UI/dL") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Bilirrubina","","select",12); iR.run(uid(),pid,null,0,999,null,null,"No contiene|Trazas|+|++|+++") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Nitrito","","select",13); iR.run(uid(),pid,null,0,999,null,null,"Negativo (-)|Positivo (+)|Trazas") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Células Epiteliales","/campo","text",14) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Células Renales","/campo","text",15) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Leucocitos","/campo","text",16) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Eritrocitos","/campo","text",17) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Cilindros","/campo","text",18) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Levaduras","","text",19) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Flora Bacteriana","","select",20); iR.run(uid(),pid,null,0,999,null,null,"Ausente|Escasa cantidad|Regular cantidad|Moderada cantidad|Abundante cantidad|Muy escasa|Escasa y mixta|Moderada mixta|Abundante mixta|Escasa activa|Moderada y activa|Abundante y activa") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_ego","Otros","","textarea",21) })()

  // ── CITOLOGÍA ─────────────────────────────────────────────────────────────
  iE.run("e_pap","CITOLOGÍA","Citología Cérvico-Vaginal (PAP - Bethesda)","CIT-001",120,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Datos Gineco-Obstétricos","","textarea",0) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Adecuación de la Muestra","","textarea",1) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Células Escamosas Superficiales","","textarea",2) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Células Intermedias","","textarea",3) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Células Endocervicales","","textarea",4) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Inflamación","","textarea",5) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Cambios Reactivos","","textarea",6) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Microorganismos","","textarea",7) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Interpretación (Sistema Bethesda)","","textarea",8) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pap","Observaciones","","textarea",9) })()

  // ── MICROBIOLOGÍA ─────────────────────────────────────────────────────────
  iE.run("e_secvag","MICROBIOLOGÍA","Sec. Vaginal - Fresco y Tinción Gram","MIC-001",60,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_secvag","pH","","number",0) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_secvag","KOH","","text",1) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_secvag","Test de Amina","","text",2) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_secvag","Examen en Fresco","","textarea",3) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_secvag","Tinción Gram","","textarea",4) })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_secvag","Conclusión","","textarea",5) })()

  // ── COPROLOGÍA ────────────────────────────────────────────────────────────
  const _copSubCfg = JSON.stringify([
    { label:'Examen Macroscopico', visible:true, params:['Consistencia','Moco','Restos'] },
    { label:'Examen Microscopico', visible:true, params:[] },
  ])
  iE.run("e_copro","COPROLOGÍA","Examen General de Heces","COP-001",35,'Bs',1,_copSubCfg)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Consistencia","","select",0); iR.run(uid(),pid,null,0,999,null,null,"Formada|Blanda|Semi-blanda|Diarreica|Pastosa|Liquida") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Moco","","select",1); iR.run(uid(),pid,null,0,999,null,null,"Ausente|Presente|Escaso|Abundante") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Restos Alimenticios","","select",2); iR.run(uid(),pid,null,0,999,null,null,"Ausente|Presente|Escaso|Abundante") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Leucocitos","/campo","text",3); iR.run(uid(),pid,null,0,999,0,2,"0-2 por campo") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Eritrocitos","/campo","text",4); iR.run(uid(),pid,null,0,999,null,null,"Ausente") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Bacterias","","text",5); iR.run(uid(),pid,null,0,999,null,null,"Flora habitual") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Levaduras","","select",6); iR.run(uid(),pid,null,0,999,null,null,"Ausente|Escasas|Moderadas|Abundantes") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Almidón","","select",7); iR.run(uid(),pid,null,0,999,null,null,"Ausente|Escaso|Moderado|Abundante") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Formas Parasitarias","","textarea",8); iR.run(uid(),pid,null,0,999,null,null,"No se observan") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_copro","Observaciones","","textarea",9) })()

  iE.run("e_hpyl","COPROLOGÍA","Antígeno de Helicobacter pylori en Heces","COP-002",70,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hpyl","Antígeno H. pylori","","select",0); iR.run(uid(),pid,null,0,999,null,null,"Negativo|Positivo|Débilmente positivo") })()

  iE.run("e_soculta","COPROLOGÍA","Sangre Oculta en Heces","COP-003",40,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_soculta","Sangre Oculta","","select",0); iR.run(uid(),pid,null,0,999,null,null,"Negativo|Positivo") })()

  // ── SEROLOGÍA ─────────────────────────────────────────────────────────────
  iE.run("e_fr","SEROLOGÍA","Factor Reumatoideo (FR)","SER-001",50,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_fr","Factor Reumatoideo","IU/mL","text",0) })()

  iE.run("e_asto","SEROLOGÍA","ASTO (Antiestreptolisina O)","SER-002",55,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_asto","ASTO","UI/mL","text",0) })()

  iE.run("e_widal","SEROLOGÍA","Prueba de Widal","SER-003",60,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_widal","Título","dilución","number",0) })()

  iE.run("e_pcr","SEROLOGÍA","Proteína C Reactiva (PCR)","SER-004",50,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_pcr","PCR","mg/dL","text",0) })()

  iE.run("e_hpyls","SEROLOGÍA","Anticuerpos Anti-H. pylori (IgG/IgM)","SER-005",70,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hpyls","Anti-H. pylori","","select",0); iR.run(uid(),pid,null,0,999,null,null,"No Reactivo|Reactivo") })()

  iE.run("e_hbsag","SEROLOGÍA","HBsAg - Hepatitis B Antígeno de Superficie","SER-006",80,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hbsag","HBsAg","","select",0); iR.run(uid(),pid,null,0,999,null,null,"No Reactivo|Reactivo") })()

  iE.run("e_vih","SEROLOGÍA","Prueba Rápida VIH","SER-007",90,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_vih","VIH","","select",0); iR.run(uid(),pid,null,0,999,null,null,"No Reactivo|Reactivo") })()

  iE.run("e_hcg","SEROLOGÍA","Test de Embarazo en Sangre (β-hCG)","SER-008",70,'Bs',0,"[]")
  ;(()=>{ const pid=uid(); iP.run(pid,"e_hcg","Test de Embarazo (β-hCG)","","select",0); iR.run(uid(),pid,null,0,999,null,null,"Negativo|Positivo|Debilmente positivo") })()

  // ── INMUNOHEMATOLOGÍA ─────────────────────────────────────────────────────
  iE.run("e_grupo","INMUNOHEMATOLOGÍA","Grupo Sanguíneo y Factor Rh","INM-001",40,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_grupo","Grupo ABO","","select",0); iR.run(uid(),pid,null,0,999,null,null,"A|B|AB|O") })()
  ;(()=>{ const pid=uid(); iP.run(pid,"e_grupo","Factor Rh","","select",1); iR.run(uid(),pid,null,0,999,null,null,"Positivo (+)|Negativo (-)") })()

  // ── OTROS ─────────────────────────────────────────────────────────────────
  iE.run("e_otros","OTROS","Formulario en Blanco","OTR-001",0,'Bs',1,null)
  ;(()=>{ const pid=uid(); iP.run(pid,"e_otros","__rows","","textarea",0) })()
}


// ── IPC ───────────────────────────────────────────────────────────────────────
const ipc = (name, fn) => ipcMain.handle(name, fn)

ipc('db:query', (e,sql,p) => { try{const d=getDb();if(!d)return{error:'DB unavailable'};return{data:d.prepare(sql).all(...(p||[]))}}catch(e){return{error:e.message}} })
ipc('db:get',   (e,sql,p) => { try{const d=getDb();if(!d)return{error:'DB unavailable'};return{data:d.prepare(sql).get(...(p||[]))}}catch(e){return{error:e.message}} })
ipc('db:run',   (e,sql,p) => { try{const d=getDb();if(!d)return{error:'DB unavailable'};return{data:d.prepare(sql).run(...(p||[]))}}catch(e){return{error:e.message}} })
ipc('db:transaction', (e,ops) => {
  try {
    const d=getDb(); if(!d) return {error:'DB unavailable'}
    const res=[]; const tx=d.transaction(()=>{for(const op of ops)res.push(d.prepare(op.sql).run(...(op.params||[])))})
    tx(); return {data:res}
  } catch(e){return{error:e.message}}
})

// Email sending via nodemailer
ipc('email:send', async(e, {to, subject, html, pdfBase64, filename}) => {
  try {
    const nodemailer = require('nodemailer')
    const d = getDb()
    const cfg = {}
    const rows = d.prepare("SELECT key,value FROM lab_config WHERE key LIKE 'smtp%' OR key='lab_name'").all()
    for (const r of rows) cfg[r.key] = r.value

    if (!cfg.smtp_user || !cfg.smtp_pass) return {error:'Configura el correo SMTP en Configuración del laboratorio'}

    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host || 'smtp.gmail.com',
      port: parseInt(cfg.smtp_port) || 587,
      secure: false,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    })

    const attachments = pdfBase64 ? [{
      filename: filename || 'resultados.pdf',
      content: Buffer.from(pdfBase64, 'base64'),
      contentType: 'application/pdf'
    }] : []

    await transporter.sendMail({
      from: cfg.smtp_from || `${cfg.lab_name} <${cfg.smtp_user}>`,
      to, subject, html, attachments
    })
    return { success: true }
  } catch(e) { return { error: e.message } }
})

ipc('app:getVersion', () => app.getVersion())
ipc('dialog:saveFile', async(e,opts) => dialog.showSaveDialog(mainWindow,opts))
ipc('dialog:openFile', async(e,opts) => dialog.showOpenDialog(mainWindow,opts))
ipc('fs:writeFile', (e,{filePath,content}) => { try { require('fs').writeFileSync(filePath,content,'utf8'); return {success:true} } catch(err){return{error:err.message}} })
ipc('fs:readFile',  (e,filePath)            => { try { return {data:require('fs').readFileSync(filePath,'utf8')} } catch(err){return{error:err.message}} })
// Handlers combinados: diálogo + I/O en un solo IPC (no requieren window.electron.fs en renderer)
ipc('catalog:exportToFile', async(e, {content, defaultName}) => {
  try {
    const res = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName, filters:[{name:'JSON',extensions:['json']}] })
    if (res.canceled) return {canceled:true}
    require('fs').writeFileSync(res.filePath, content, 'utf8')
    return {success:true, filePath:res.filePath}
  } catch(err){return{error:err.message}}
})
ipc('catalog:importFromFile', async(e) => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, { filters:[{name:'JSON',extensions:['json']}], properties:['openFile'] })
    if (res.canceled || !res.filePaths?.length) return {canceled:true}
    const data = require('fs').readFileSync(res.filePaths[0], 'utf8')
    return {data}
  } catch(err){return{error:err.message}}
})
ipc('pdf:save', async(e, { base64, defaultName }) => {
  try {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled) return { canceled: true }
    require('fs').writeFileSync(res.filePath, Buffer.from(base64, 'base64'))
    return { success: true, filePath: res.filePath }
  } catch(err) { return { error: err.message } }
})
ipc('pdf:saveAndOpen', async(e, { base64, defaultName }) => {
  try {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled) return { canceled: true }
    require('fs').writeFileSync(res.filePath, Buffer.from(base64, 'base64'))
    shell.openPath(res.filePath)
    return { success: true, filePath: res.filePath }
  } catch(err) { return { error: err.message } }
})
ipc('shell:openExternal', (e,url) => shell.openExternal(url))
ipc('app:getUserDataPath', () => app.getPath('userData'))

// ── UPDATE IPC ────────────────────────────────────────────────────────────────
ipc('update:check',         () => { try { autoUpdater?.checkForUpdates() } catch(e){ return {error:e.message} } })
ipc('update:download',      () => { try { autoUpdater?.downloadUpdate()  } catch(e){ return {error:e.message} } })
ipc('update:install',       () => { try { autoUpdater?.quitAndInstall()  } catch(e){ return {error:e.message} } })
