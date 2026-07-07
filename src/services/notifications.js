/**
 * ═══════════════════════════════════════════════════════════════
 *  NOTIFICATIONS SERVICE — Email + WhatsApp
 * ═══════════════════════════════════════════════════════════════
 *
 *  EMAIL:
 *    ✅ Totalmente automático — 1 clic
 *    ✅ PDF adjunto real en el correo
 *    ✅ Requiere config SMTP en Configuración
 *
 *  WHATSAPP:
 *    ✅ PDF se guarda automáticamente con nombre correcto
 *    ✅ WhatsApp Desktop/Web se abre automáticamente
 *    ✅ Mensaje prellenado con datos del paciente
 *    ⚠️  WhatsApp NO permite adjuntar archivos por API (restricción oficial)
 *       El usuario solo arrastra el PDF descargado al chat (1 gesto)
 * ═══════════════════════════════════════════════════════════════
 */
import { isElectron, db } from './database'

// ── Config ────────────────────────────────────────────────────────────────────
async function getCfg() {
  if (!isElectron) return {}
  try {
    const rows = await db.query('SELECT key,value FROM lab_config')
    const c = {}
    for (const r of rows) if (r.value) c[r.key] = r.value
    return c
  } catch { return {} }
}

// ── Formatear teléfono Bolivia ────────────────────────────────────────────────
function fmtPhone(raw = '') {
  let n = String(raw).replace(/[\s\-\(\)\+]/g, '')
  // 8 dígitos → agregar 591
  if (n.length === 8) n = '591' + n
  // 9 dígitos empezando en 6 o 7 → agregar 591
  else if (n.length === 9 && (n[0]==='6'||n[0]==='7')) n = '591' + n
  return n
}

// ══════════════════════════════════════════════════════════════════════════════
//  EMAIL  (100% automático)
// ══════════════════════════════════════════════════════════════════════════════
export const emailService = {
  async send(order, pdfDoc, overrideEmail = null) {
    const cfg   = await getCfg()
    const email = overrideEmail || order.patient_email || order.email

    if (!email?.trim()) throw new Error(
      'El paciente no tiene correo electrónico registrado.\nEdita el paciente y agrega su correo primero.')

    if (!cfg.smtp_user || !cfg.smtp_pass) throw new Error(
      'Configura el servidor SMTP en:\nConfiguración → pestaña "Correo SMTP"\n(necesitas usuario y contraseña de app Gmail)')

    if (!isElectron) throw new Error(
      'El envío de correo solo funciona en la aplicación de escritorio.')

    const pdfBase64 = pdfDoc.output('datauristring').split(',')[1]
    const labName   = cfg.lab_name || 'Laboratorio Clínico LabMend'

    const result = await window.electron.email.send({
      to:       email.trim(),
      subject:  `📋 Resultados de Laboratorio — ${order.order_number} — ${labName}`,
      html:     buildEmailHTML(order, labName, cfg),
      pdfBase64,
      filename: `${order.order_number}_resultados.pdf`,
    })

    if (result?.error) throw new Error(result.error)
    return { success: true, sentTo: email.trim() }
  },
}

// ══════════════════════════════════════════════════════════════════════════════
//  WHATSAPP  (máximo automatismo posible)
// ══════════════════════════════════════════════════════════════════════════════
export const whatsappService = {
  /**
   * Flujo:
   * 1. Genera PDF en memoria
   * 2. Guarda PDF automáticamente (nombre correcto)
   * 3. Copia el número de orden al portapapeles
   * 4. Abre WhatsApp con mensaje completo ya escrito
   * → Usuario solo necesita: adjuntar el PDF (Clip 📎 → archivo descargado)
   */
  async send(order, pdfDoc, overridePhone = null) {
    const cfg   = await getCfg()
    const phone = overridePhone || order.patient_whatsapp || order.patient_phone
                  || order.whatsapp || order.phone

    if (!phone?.toString().trim()) throw new Error(
      'El paciente no tiene número de WhatsApp registrado.\nEdita el paciente y agrega su número primero.')

    const labName  = cfg.lab_name || 'LabMend'
    const filename = `${order.order_number}_resultados.pdf`

    // ── Paso 1: Guardar PDF automáticamente ───────────────────────────────
    pdfDoc.save(filename)

    // ── Paso 2: Copiar número de orden al portapapeles ────────────────────
    try {
      await navigator.clipboard.writeText(order.order_number)
    } catch {}

    // ── Paso 3: Esperar que el sistema registre la descarga ───────────────
    await new Promise(r => setTimeout(r, 700))

    // ── Paso 4: Construir mensaje y abrir WhatsApp ────────────────────────
    const numero   = fmtPhone(phone)
    const fecha    = new Date(order.created_at).toLocaleDateString('es-ES',
      { day:'2-digit', month:'long', year:'numeric' })

    const mensaje = [
      `🔬 *${labName}*`,
      '',
      `Estimado/a *${order.patient_name}*,`,
      '',
      `Sus resultados de laboratorio ya están listos ✅`,
      '',
      `🆔 *Orden:* ${order.order_number}`,
      `📅 *Fecha:* ${fecha}`,
      '',
      `📎 Adjunto encontrará el archivo PDF con sus resultados.`,
      '',
      `_${labName} — Sistema LabMend_`,
    ].join('\n')

    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`

    if (isElectron && window.electron?.shell) {
      await window.electron.shell.openExternal(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }

    return { success: true, sentTo: numero, filename }
  },
}

// ══════════════════════════════════════════════════════════════════════════════
//  HTML del correo
// ══════════════════════════════════════════════════════════════════════════════
function buildEmailHTML(order, labName, cfg) {
  const fecha   = new Date(order.created_at).toLocaleDateString('es-ES',
    { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const labInfo = [cfg.lab_address, cfg.lab_phone ? `Tel: ${cfg.lab_phone}` : null, cfg.lab_email]
    .filter(Boolean).join(' · ')

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resultados de Laboratorio</title></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0"
  style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.10);">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8 55%,#2563eb);padding:44px 40px 40px;text-align:center;">
    <div style="display:inline-flex;align-items:center;justify-content:center;
      width:64px;height:64px;background:rgba(255,255,255,0.15);
      border-radius:18px;margin-bottom:20px;font-size:34px;">🔬</div>
    <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;
      line-height:1.2;">${labName}</h1>
    <p style="color:#93c5fd;margin:10px 0 0;font-size:14px;font-weight:400;">
      Resultados de Exámenes de Laboratorio</p>
    ${labInfo ? `<p style="color:#bfdbfe;margin:8px 0 0;font-size:12px;">${labInfo}</p>` : ''}
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:44px 40px 36px;">

    <p style="color:#111827;font-size:18px;margin:0 0 8px;font-weight:700;">
      Hola, <span style="color:#1d4ed8;">${order.patient_name}</span> 👋</p>
    <p style="color:#6b7280;font-size:15px;line-height:1.7;margin:0 0 32px;">
      Le informamos que sus resultados de exámenes de laboratorio están
      <strong style="color:#1d4ed8;">listos y disponibles</strong>.
      Encontrará el informe completo adjunto a este correo en formato PDF.
    </p>

    <!-- ORDER CARD -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="border-radius:16px;overflow:hidden;border:2px solid #bfdbfe;margin-bottom:32px;">
      <tr><td style="background:#dbeafe;padding:14px 24px;">
        <p style="margin:0;font-size:11px;color:#1e40af;
          text-transform:uppercase;letter-spacing:2px;font-weight:800;">
          Datos de su Orden</p>
      </td></tr>
      <tr><td style="background:#eff6ff;padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;width:50%;">
              <p style="margin:0 0 3px;font-size:11px;color:#6b7280;
                text-transform:uppercase;letter-spacing:1px;">Número de Orden</p>
              <p style="margin:0;font-size:26px;font-weight:900;color:#1d4ed8;
                font-family:monospace;letter-spacing:1px;">${order.order_number}</p>
            </td>
            <td style="vertical-align:top;width:50%;text-align:right;">
              <p style="margin:0 0 3px;font-size:11px;color:#6b7280;
                text-transform:uppercase;letter-spacing:1px;">Fecha de Examen</p>
              <p style="margin:0;font-size:14px;font-weight:700;color:#374151;">
                ${fecha}</p>
              ${order.doctor_name
                ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">
                   👨‍⚕️ Dr./Dra. ${order.doctor_name}</p>` : ''}
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- PDF NOTICE -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#f0fdf4;border:2px solid #86efac;
      border-radius:14px;margin-bottom:32px;">
      <tr><td style="padding:18px 22px;">
        <p style="margin:0;font-size:15px;color:#166534;font-weight:700;">
          📎 Su informe PDF está adjunto a este correo</p>
        <p style="margin:8px 0 0;font-size:13px;color:#4b7a5e;line-height:1.6;">
          Puede abrirlo directamente desde su cliente de correo,
          guardarlo en su dispositivo o imprimirlo cuando lo necesite.</p>
      </td></tr>
    </table>

    <p style="color:#9ca3af;font-size:12px;line-height:1.7;
      border-top:1px solid #f3f4f6;padding-top:22px;margin:0;">
      Este correo fue enviado automáticamente por el sistema <strong>LabMend</strong>.
      Si tiene alguna pregunta sobre sus resultados, comuníquese directamente
      con su laboratorio. No responda a este correo.
    </p>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;
    padding:20px 40px;text-align:center;">
    <p style="margin:0;color:#6b7280;font-size:13px;font-weight:700;">${labName}</p>
    ${labInfo ? `<p style="margin:5px 0 0;color:#9ca3af;font-size:12px;">${labInfo}</p>` : ''}
    <p style="margin:8px 0 0;color:#d1d5db;font-size:11px;">
      Sistema de Laboratorio Clínico LabMend</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`
}
