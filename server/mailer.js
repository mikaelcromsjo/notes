const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Credentials live in data/mail.json (gitignored, same pattern as
// data/vapid.json) or in env vars. Shape:
//   { "host", "port", "user", "pass", "from" }
const cfgPath =
  process.env.MAIL_CONFIG || path.join(__dirname, '..', 'data', 'mail.json');

let fileCfg = {};
try {
  fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
} catch {
  /* env-only, or mail disabled */
}

const host = process.env.SMTP_HOST || fileCfg.host;
const port = Number(process.env.SMTP_PORT || fileCfg.port || 587);
const user = process.env.SMTP_USER || fileCfg.user;
const pass = process.env.SMTP_PASS || fileCfg.pass;
const FROM = process.env.MAIL_FROM || fileCfg.from || user;

let transporter = null;
if (host && user && pass) {
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 587 uses STARTTLS, which nodemailer negotiates
    auth: { user, pass },
  });
}

const configured = () => Boolean(transporter);

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    throw new Error(`mailer not configured (no ${cfgPath} and no SMTP_* env)`);
  }
  return transporter.sendMail({ from: FROM, to, subject, text, html });
}

module.exports = { sendMail, configured, FROM };
