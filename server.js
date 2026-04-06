'use strict';
const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();

// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  PORT:              process.env.PORT              || 3000,
  EMAIL_USER:        process.env.EMAIL_USER        || '',
  EMAIL_PASS:        process.env.EMAIL_PASS        || '',
  DESTINATION_EMAIL: process.env.DESTINATION_EMAIL || '',
  SMTP_HOST:         process.env.SMTP_HOST         || 'smtp.gmail.com',
  SMTP_PORT:         parseInt(process.env.SMTP_PORT || '587'),
};

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── PDF field coordinates ────────────────────────────────────────────────────
// Measured precisely from the real PDF (enrolment_electoral.pdf)
// PDF is A4: 595.3 x 841.9 pt — pdf-lib origin = bottom-left
// x values: just after the English label ends; y = 841.9 - pymupdf_y_bottom
const FIELDS = {
  // Consular registration number  (label ends x=225.8)
  consularNumber:  { x: 230, y: 485.3, size: 9, maxWidth: 280 },

  // First name  (label ends x=127.6)
  firstName:       { x: 160, y: 459.4, size: 9, maxWidth: 340 },

  // Maiden name  (label ends x=141.8)
  maidenName:      { x: 160, y: 433.4, size: 9, maxWidth: 340 },

  // Last name  (label ends x=125.2)
  lastName:        { x: 160, y: 407.5, size: 9, maxWidth: 340 },

  // Date of birth  (label ends x=156)
  dateOfBirth:     { x: 215, y: 381.6, size: 9, maxWidth: 200 },

  // Place of birth  (label ends x=141.3)
  placeOfBirth:    { x: 160, y: 355.7, size: 9, maxWidth: 340 },

  // Father's name — single field "prénom + nom" on one line (label ends x=145)
  fatherName:      { x: 160, y: 329.6, size: 9, maxWidth: 340 },

  // Mother's name — prénom + nom on one line  (label ends x=149)
  // The PDF label reads "اسم و لقب الأم" = prénom et nom de la mère
  motherName:      { x: 160, y: 302.9, size: 9, maxWidth: 340 },

  // Marital status  (label ends x=144.2)
  maritalStatus:   { x: 160, y: 276.1, size: 9, maxWidth: 340 },

  // Spouse name  (label ends x=138.6)
  spouseName:      { x: 160, y: 250.2, size: 9, maxWidth: 340 },

  // Address  (label ends x=119.3 with colon)
  address:         { x: 130, y: 224.1, size: 9, maxWidth: 390 },

  // Phone  (label ends x=147.6)
  phone:           { x: 160, y: 197.3, size: 9, maxWidth: 340 },

  // Email  (label ends x=102.6)
  email:           { x: 115, y: 171.4, size: 9, maxWidth: 350 },

  // "In .... on ...."  line  (y_pdflib = 119.7)
  city:            { x: 90,  y: 119.7, size: 9, maxWidth: 130 },   // after "In"
  requestDate:     { x: 270, y: 119.7, size: 9, maxWidth: 140 },   // after "on"

  // Signature image — placed below "Applicant's signature" text (y≈93.7)
  // We put the image slightly above that line
  signature: { x: 90, y: 50, w: 180, h: 55 },
};

// ── PDF builder ──────────────────────────────────────────────────────────────
async function fillPDF(data) {
  const templatePath = path.join(__dirname, 'template.pdf');

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      'template.pdf introuvable. Placez le PDF officiel dans le dossier racine du projet.'
    );
  }

  const pdfBytes = fs.readFileSync(templatePath);
  const pdfDoc   = await PDFDocument.load(pdfBytes);
  const page     = pdfDoc.getPages()[0];
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Draw calibration grid if needed (CALIBRATE=1)
  if (process.env.CALIBRATE === '1') {
    const { width, height } = page.getSize();
    for (let y = 0; y <= height; y += 50) {
      page.drawText(String(y), { x: 5,  y, size: 5, font, color: rgb(1,0,0) });
    }
    for (let x = 0; x <= width; x += 50) {
      page.drawText(String(x), { x, y: 5, size: 5, font, color: rgb(0,0,1) });
    }
  }

  // Helper: draw a text field, capped at maxWidth
  function drawField(key, value) {
    if (!value) return;
    const f = FIELDS[key];
    page.drawText(String(value), {
      x: f.x, y: f.y, size: f.size || 9,
      font, color: rgb(0,0,0),
      maxWidth: f.maxWidth || 250,
    });
  }

  drawField('consularNumber',  data.consularNumber);
  drawField('firstName',       data.firstName);
  drawField('maidenName',      data.maidenName);
  drawField('lastName',        data.lastName);

  // Format date dd/MM/yyyy for the PDF
  const dob = data.dateOfBirth
    ? new Date(data.dateOfBirth + 'T00:00:00').toLocaleDateString('fr-FR')
    : '';
  drawField('dateOfBirth', dob);
  drawField('placeOfBirth',    data.placeOfBirth);

  // Father: "prénom nom" on one line (PDF label = "Father's name")
  const fatherFull = [data.fatherFirstName, data.fatherLastName].filter(Boolean).join(' ');
  drawField('fatherName', fatherFull);

  // Mother: "prénom nom" on one line (PDF label = "Mother's name = اسم و لقب الأم")
  const motherFull = [data.motherFirstName, data.motherLastName].filter(Boolean).join(' ');
  drawField('motherName', motherFull);

  drawField('maritalStatus',   data.maritalStatus);
  drawField('spouseName',      data.spouseName);

  drawField('address',         data.address);
  drawField('phone',           data.phone);
  drawField('email',           data.email);

  drawField('city',            data.city);

  const reqDate = data.requestDate
    ? new Date(data.requestDate + 'T00:00:00').toLocaleDateString('fr-FR')
    : '';
  drawField('requestDate', reqDate);

  // Embed signature image
  if (data.signature && data.signature.startsWith('data:image/png;base64,')) {
    const base64 = data.signature.split(',')[1];
    const imgBuf = Buffer.from(base64, 'base64');
    const sigImg = await pdfDoc.embedPng(imgBuf);
    const sf = FIELDS.signature;
    page.drawImage(sigImg, { x: sf.x, y: sf.y, width: sf.w, height: sf.h });
  }

  return await pdfDoc.save();
}

// ── Email sender ─────────────────────────────────────────────────────────────
async function sendEmail(pdfBuffer, data) {
  if (!CONFIG.EMAIL_USER || !CONFIG.EMAIL_PASS) {
    throw new Error('Variables EMAIL_USER et EMAIL_PASS non configurées.');
  }
  if (!CONFIG.DESTINATION_EMAIL) {
    throw new Error('Variable DESTINATION_EMAIL non configurée.');
  }

  const transporter = nodemailer.createTransport({
    host: CONFIG.SMTP_HOST,
    port: CONFIG.SMTP_PORT,
    secure: CONFIG.SMTP_PORT === 465,
    auth: { user: CONFIG.EMAIL_USER, pass: CONFIG.EMAIL_PASS },
  });

  const fileName = `inscription_electorale_${data.lastName || 'inconnu'}_${data.firstName || ''}.pdf`
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_');

  await transporter.sendMail({
    from: `"Formulaire Electoral" <${CONFIG.EMAIL_USER}>`,
    to:   CONFIG.DESTINATION_EMAIL,
    subject: `📄 Inscription électorale – ${data.lastName} ${data.firstName}`,
    text: [
      `Nouvelle demande d'inscription électorale reçue.`,
      ``,
      `Nom     : ${data.lastName} ${data.firstName}`,
      `Né(e) le : ${data.dateOfBirth} à ${data.placeOfBirth}`,
      `Adresse  : ${data.address}`,
      `Email    : ${data.email}`,
      `Tél      : ${data.phone}`,
      ``,
      `Le formulaire rempli est joint en pièce jointe.`,
    ].join('\n'),
    attachments: [{
      filename: fileName,
      content:  pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

// ── Route POST /send ─────────────────────────────────────────────────────────
app.post('/send', async (req, res) => {
  try {
    const data = req.body;

    // Basic server-side validation
    const required = ['firstName','lastName','dateOfBirth','placeOfBirth',
                      'fatherFirstName','fatherLastName',
                      'motherFirstName','motherLastName',
                      'maritalStatus','address','phone','email','city','requestDate'];
    const missing = required.filter(k => !String(data[k] || '').trim());
    if (missing.length) {
      return res.status(400).send(`Champs manquants : ${missing.join(', ')}`);
    }

    const pdfBuffer = await fillPDF(data);
    await sendEmail(pdfBuffer, data);

    res.status(200).send('OK');
  } catch (err) {
    console.error('[/send]', err.message);
    res.status(500).send(err.message || 'Erreur serveur');
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  console.log(`✅  Serveur prêt → http://localhost:${CONFIG.PORT}`);
  if (!CONFIG.EMAIL_USER)        console.warn('⚠️   EMAIL_USER non défini');
  if (!CONFIG.EMAIL_PASS)        console.warn('⚠️   EMAIL_PASS non défini');
  if (!CONFIG.DESTINATION_EMAIL) console.warn('⚠️   DESTINATION_EMAIL non défini');
});
