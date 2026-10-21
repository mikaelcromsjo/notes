// A descriptive default title for an uploaded file, used when a note is made
// from a file and nobody typed a title (share sheet, mail-in, the picker with
// the title left blank). A cleaned-up filename, or — when the name says
// nothing — the document's own title metadata (PDF Info / XMP, Office /
// OpenDocument core properties), suffixed with what kind of file it is: "Soulkin 2027 Programme (PDF)".
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const KIND_LABEL = {
  '.pdf': 'PDF',
  '.doc': 'Word',
  '.docx': 'Word',
  '.odt': 'Document',
  '.rtf': 'Document',
  '.xls': 'Excel',
  '.xlsx': 'Excel',
  '.ods': 'Spreadsheet',
  '.csv': 'CSV',
  '.ppt': 'PowerPoint',
  '.pptx': 'PowerPoint',
  '.odp': 'Presentation',
  '.txt': 'Text',
  '.md': 'Markdown',
  '.ics': 'Calendar',
  '.json': 'JSON',
  '.zip': 'Zip',
  '.mp4': 'Video',
  '.webm': 'Video',
  '.mov': 'Video',
  '.epub': 'E-book',
};

// Names a camera, recorder, browser or file picker makes up — they say nothing.
const MEANINGLESS = new RegExp(
  '^(?:(?:img|pxl|vid|dsc|dcim|mvimg|screenshot|screen[ _-]?recording|signal|whatsapp|image|photo|picture|' +
    'file|document|download|upload|blob|recording|audio|voice|untitled|scan)?[\\s_.\\-():\\d]*' +
    '|[0-9a-f-]{8,})$',
  'i'
);

// "Soulkin_2027_Programme-and-Community_Calendar" -> "Soulkin 2027 Programme and Community Calendar"
function prettyName(stem) {
  let s = String(stem || '');
  s = s.replace(/[_+]+/g, ' ');
  if (!/\s/.test(s)) s = s.replace(/(?<=\S)[-.](?=\S)/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

// "IMG_20261021_110322" -> "2026-10-21 11:03"
function stampFrom(stem) {
  const m = /(20\d\d)[-_.]?(\d\d)[-_.]?(\d\d)(?:[ _\-T]?(\d\d)[-_.:]?(\d\d))?/.exec(stem || '');
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return '';
  return `${m[1]}-${m[2]}-${m[3]}${m[4] && +m[4] < 24 ? ` ${m[4]}:${m[5]}` : ''}`;
}

function decodeXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Bytes (as a latin1 string) of a PDF text string -> JS string.
function pdfBytesToText(bytes) {
  if (bytes.startsWith('\xfe\xff')) return Buffer.from(bytes.slice(2), 'latin1').swap16().toString('utf16le');
  if (bytes.startsWith('\xef\xbb\xbf')) return Buffer.from(bytes.slice(3), 'latin1').toString('utf8');
  const utf8 = Buffer.from(bytes, 'latin1').toString('utf8');
  return utf8.includes('�') ? bytes : utf8;
}

function pdfLiteral(s) {
  // s starts just after "(" — read to the balancing ")".
  let out = '';
  let depth = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[++i];
      if (n === undefined) break;
      const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[n];
      if (esc) out += esc;
      else if (/[0-7]/.test(n)) {
        const oct = /^[0-7]{1,3}/.exec(s.slice(i))[0];
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        i += oct.length - 1;
      } else if (n === '\r' || n === '\n') {
        if (n === '\r' && s[i + 1] === '\n') i++;
      } else out += n;
    } else if (c === '(') {
      depth++;
      out += c;
    } else if (c === ')') {
      if (--depth === 0) break;
      out += c;
    } else out += c;
  }
  return out;
}

// The PDF's own title: XMP dc:title, else the Info dictionary's /Title. Both
// are usually stored uncompressed near the start or the end of the file.
function pdfTitle(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const read = (pos, len) => {
      const buf = Buffer.alloc(Math.max(0, Math.min(len, size - pos)));
      fs.readSync(fd, buf, 0, buf.length, pos);
      return buf.toString('latin1');
    };
    const HEAD = 2 * 1024 * 1024;
    const TAIL = 512 * 1024;
    const text = size <= HEAD + TAIL ? read(0, size) : read(0, HEAD) + read(size - TAIL, TAIL);
    const xmp = /<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(text);
    if (xmp) {
      const t = decodeXml(Buffer.from(xmp[1], 'latin1').toString('utf8'));
      if (usable(t)) return t;
    }
    const re = /\/Title\s*(\(|<)/g;
    let m;
    while ((m = re.exec(text))) {
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 4096);
      let bytes;
      if (m[1] === '(') bytes = pdfLiteral(rest);
      else {
        const hex = /^([0-9a-fA-F\s]*)>/.exec(rest);
        if (!hex) continue;
        bytes = Buffer.from(hex[1].replace(/\s/g, ''), 'hex').toString('latin1');
      }
      const t = pdfBytesToText(bytes);
      if (usable(t)) return t;
    }
  } finally {
    fs.closeSync(fd);
  }
  return '';
}

// Office Open XML (docProps/core.xml) or OpenDocument (meta.xml) title.
function officeTitle(file) {
  const zip = new AdmZip(file);
  for (const name of ['docProps/core.xml', 'meta.xml']) {
    const entry = zip.getEntry(name);
    if (!entry || entry.header.size > 1024 * 1024) continue;
    const m = /<dc:title>([\s\S]*?)<\/dc:title>/.exec(entry.getData().toString('utf8'));
    if (m && usable(decodeXml(m[1]))) return decodeXml(m[1]);
  }
  return '';
}

// Metadata titles are often junk a tool filled in.
function usable(t) {
  const s = cleanMeta(t);
  return (
    s.length >= 3 &&
    !/^(?:untitled|document\d*|title|presentation\d*|book\d*|slide \d+|microsoft (?:word|powerpoint|excel)|pdf|unknown)$/i.test(s) &&
    !/^[\w\- ]+\.(?:docx?|pdf|pptx?|xlsx?|indd|qxp|tmp|dvi)$/i.test(s) &&
    !MEANINGLESS.test(s)
  );
}

function cleanMeta(t) {
  return String(t || '')
    .replace(/^Microsoft (?:Word|PowerPoint|Excel) - /i, '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaTitle(file, ext) {
  try {
    if (ext === '.pdf') return cleanMeta(pdfTitle(file.path));
    if (/^\.(?:docx|xlsx|pptx|odt|ods|odp)$/.test(ext)) return cleanMeta(officeTitle(file.path));
  } catch {
    /* unreadable / not really that format — fall back to the filename */
  }
  return '';
}

// `type` = the note type the file became ('image' | 'audio' | 'file');
// `file` = the multer descriptor ({path, filename, originalname}).
function describeFile(type, file) {
  const original = String((file && file.originalname) || '');
  const ext = path.extname(original || (file && file.filename) || '').toLowerCase();
  const stem = path.basename(original, path.extname(original));
  const named = stem && !MEANINGLESS.test(stem) ? prettyName(stem) : '';

  if (type === 'image' || type === 'audio') {
    if (named) return named.slice(0, 200);
    const base = type === 'image' ? (/screenshot/i.test(stem) ? 'Screenshot' : 'Photo') : 'Recording';
    const stamp = stampFrom(stem);
    return stamp ? `${base} ${stamp}` : base;
  }

  const label = KIND_LABEL[ext] || (ext ? ext.slice(1).toUpperCase() : '');
  // A wordy filename is what the user knows the file by; the metadata title
  // is often a template leftover ("Table of Contents"), so it only stands in
  // for a filename that is a code or a number ("1-s2.0-S0002-main.pdf").
  const words = (named.match(/\p{L}{3,}/gu) || []).length;
  const title = (words >= 2 ? named : metaTitle(file, ext)) || named;
  if (!title) {
    const stamp = stampFrom(stem);
    return `${label ? `${label} file` : 'File'}${stamp ? ` ${stamp}` : ''}`;
  }
  const suffix = label && !title.toLowerCase().includes(`(${label.toLowerCase()})`) ? ` (${label})` : '';
  return title.slice(0, 200 - suffix.length) + suffix;
}

// True when a shared title/text is just a file's name ("report_v2.pdf") —
// what Android puts in the share's subject when it hands over a file.
function looksLikeFilename(s) {
  return /^[^\n/\\]{1,200}\.[A-Za-z0-9]{2,5}$/.test(String(s || '').trim()) && !/\s{2}|^https?:/i.test(s);
}

module.exports = { describeFile, looksLikeFilename };
