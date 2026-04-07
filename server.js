'use strict';
const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();

const CONFIG = {
  PORT:              process.env.PORT              || 3000,
  EMAIL_USER:        process.env.EMAIL_USER        || '',
  EMAIL_PASS:        process.env.EMAIL_PASS        || '',
  DESTINATION_EMAIL: process.env.DESTINATION_EMAIL || '',
};

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const FIELDS = {
  consularNumber  : { x: 230, y: 490.9, size: 9, maxWidth: 310 },
  lastName        : { x:  75, y: 463.1, size: 9, maxWidth: 440 },
  maidenName      : { x: 145, y: 435.1, size: 9, maxWidth: 370 },
  firstName       : { x: 100, y: 407.1, size: 9, maxWidth: 415 },
  dateOfBirth     : { x:  75, y: 379.2, size: 9, maxWidth: 155 },
  placeOfBirth    : { x: 265, y: 379.2, size: 9, maxWidth: 200 },
  fatherName      : { x: 165, y: 351.3, size: 9, maxWidth: 350 },
  motherName      : { x: 220, y: 323.4, size: 9, maxWidth: 295 },
  maritalStatus   : { x:  90, y: 295.4, size: 9, maxWidth: 420 },
  spouseName      : { x: 155, y: 267.6, size: 9, maxWidth: 355 },
  spouseFirstName : { x: 185, y: 239.6, size: 9, maxWidth: 325 },
  address         : { x:  90, y: 211.6, size: 9, maxWidth: 420 },
  postalCode      : { x: 105, y: 183.8, size: 9, maxWidth: 405 },
  phone           : { x: 150, y: 155.8, size: 9, maxWidth: 355 },
  email           : { x:  80, y: 127.8, size: 9, maxWidth: 400 },
  city            : { x: 370, y:  87.5, size: 9, maxWidth: 100 },
  requestDate     : { x: 475, y:  87.5, size: 9, maxWidth:  80 },
  signature       : { x:  36, y:  63,   w: 160,  h: 45 },
};
async function fillPDF(data) {
  const templatePath = path.join(__dirname, 'template.pdf');
  if (!fs.existsSync(templatePath)) {
    throw new Error('template.pdf introuvable.');
  }
  const pdfBytes = fs.readFileSync(templatePath);
  const pdfDoc   = await PDFDocument.load(pdfBytes);
  const page     = pdfDoc.getPages()[0];
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);

  function drawField(key, value) {
    if (!value) return;
    const f = FIELDS[key];
    page.drawText(String(value), {
      x: f.x, y: f.y, size: f.size || 9,
      font, color: rgb(0,0,0),
      maxWidth: f.maxWidth || 250,
    });
  }

  drawField('consularNumber', data.consularNumber);
  drawField('lastName',       data.lastName);
  drawField('maidenName',     data.maidenName);
  drawField('firstName',      data.firstName);

  const dob = data.dateOfBirth
    ? new Date(data.dateOfBirth + 'T00:00:00').toLocaleDateString('fr-FR') : '';
  drawField('dateOfBirth',  dob);
  drawField('placeOfBirth', data.placeOfBirth);

  const fatherFull = [data.fatherFirstName].filter(Boolean).join(' ');
  drawField('fatherName', fatherFull);

  const motherFull = [data.motherFirstName, data.motherLastName].filter(Boolean).join(' ');
  drawField('motherName', motherFull);

  drawField('maritalStatus', data.maritalStatus);

  const spouseFull = [data.spouseFirstName, data.spouseName].filter(Boolean).join(' ');
  drawField('spouseName', spouseFull);

  const addressFull = [data.street, data.postalCode, data.addressCity].filter(Boolean).join(', ');
  drawField('address',    addressFull);
  drawField('postalCode', data.postalCode);
  drawField('phone',      data.phone);
  drawField('email',      data.email);
  drawField('city',       data.city);

  const reqDate = data.requestDate
    ? new Date(data.requestDate + 'T00:00:00').toLocaleDateString('fr-FR') : '';
  drawField('requestDate', reqDate);

  if (data.signature && data.signature.startsWith('data:image/png;base64,')) {
    const base64 = data.signature.split(',')[1];
    const imgBuf = Buffer.from(base64, 'base64');
    const sigImg = await pdfDoc.embedPng(imgBuf);
    const sf = FIELDS.signature;
    page.drawImage(sigImg, { x: sf.x, y: sf.y, width: sf.w, height: sf.h });
  }

  return await pdfDoc.save();
}

async function sendEmail(pdfBuffer, data) {
  if (!CONFIG.EMAIL_PASS) throw new Error('Variable EMAIL_PASS (clé API Brevo) non configurée.');
  if (!CONFIG.DESTINATION_EMAIL) throw new Error('Variable DESTINATION_EMAIL non configurée.');

  const fileName = `inscription_electorale_${data.lastName || 'inconnu'}_${data.firstName || ''}.pdf`
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_');

  const body = {
    sender:      { name: 'Formulaire Electoral', email: CONFIG.EMAIL_USER || 'electionnedjah@gmail.com' },
    to:          [{ email: CONFIG.DESTINATION_EMAIL }],
    subject:     `Inscription électorale - ${data.lastName} ${data.firstName}`,
    textContent: [
      `Nouvelle demande d'inscription électorale reçue.`,
      ``,
      `Nom      : ${data.lastName} ${data.firstName}`,
      `Né(e) le : ${data.dateOfBirth} à ${data.placeOfBirth}`,
      `Adresse  : ${data.street}, ${data.postalCode} ${data.addressCity}`,
      `Email    : ${data.email}`,
      `Tél      : ${data.phone}`,
      ``,
      `Le formulaire rempli est joint en pièce jointe.`,
    ].join('\n'),
    attachment: [{
      name:    fileName,
      content: Buffer.from(pdfBuffer).toString('base64'),
    }],
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': CONFIG.EMAIL_PASS },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${err}`);
  }
}

app.post('/send', async (req, res) => {
  try {
    const data = req.body;
    const required = ['firstName','lastName','dateOfBirth','placeOfBirth',
                      'fatherFirstName','motherFirstName','motherLastName',
                      'maritalStatus','street','postalCode','addressCity',
                      'phone','email','city','requestDate'];
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

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

app.listen(CONFIG.PORT, () => {
  console.log(`✅  Serveur prêt → http://localhost:${CONFIG.PORT}`);
  if (!CONFIG.EMAIL_PASS)        console.warn('⚠️   EMAIL_PASS non défini');
  if (!CONFIG.DESTINATION_EMAIL) console.warn('⚠️   DESTINATION_EMAIL non défini');
});
