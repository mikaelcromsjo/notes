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

// Same mailbox, read side — server/mail-ingest.js polls it over IMAP with the
// same credentials (a Gmail app password covers both). `ingestAddresses`
// defaults to the account's own `+notes` and `+note` aliases (`+note` was the
// old mailrouter address); MAIL_INGEST_ADDRESS / `ingestAddress` may be a
// comma-separated list. `ingestAddress` = the first one, for display.
function imapConfig() {
  if (!user || !pass) return null;
  const [local, domain] = String(user).split('@');
  const ingestAddresses = String(
    process.env.MAIL_INGEST_ADDRESS ||
    fileCfg.ingestAddress ||
    `${local}+notes@${domain},${local}+note@${domain}`
  ).split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
  return {
    host: process.env.IMAP_HOST || fileCfg.imapHost || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || fileCfg.imapPort || 993),
    user,
    pass,
    ingestAddress: ingestAddresses[0],
    ingestAddresses,
  };
}

module.exports = { sendMail, configured, imapConfig, FROM };
