// What kind of attachment note a single file should be. Shared by mail-in
// (a lone email attachment), the upload routes (a "file" upload that is really
// a photo or recording) and db.js's one-time fix-up of existing file notes, so
// a .jpg is an image note however it arrived.
const path = require('path');
const { IMAGE_EXT, AUDIO_EXT, FILE_EXT, safeFileExt, isExecutableMime } = require('./upload-config');

const MIME_BY_EXT = { '.jpeg': 'image/jpeg' };
for (const map of [IMAGE_EXT, AUDIO_EXT]) {
  for (const [mime, ext] of Object.entries(map)) if (!MIME_BY_EXT[ext]) MIME_BY_EXT[ext] = mime;
}

// Image/audio for a name + declared MIME, or null. A missing/generic MIME
// falls back to the extension.
function mediaKind(name, contentType) {
  const ext = path.extname(name || '').toLowerCase();
  let mime = String(contentType || '').toLowerCase();
  if ((!mime || mime === 'application/octet-stream') && MIME_BY_EXT[ext]) mime = MIME_BY_EXT[ext];
  if (IMAGE_EXT[mime]) return { type: 'image', mime, ext: IMAGE_EXT[mime] };
  if (AUDIO_EXT[mime]) return { type: 'audio', mime, ext: AUDIO_EXT[mime] };
  return null;
}

// The type an uploaded "file" really is: 'image'/'audio' when the stored file
// is one (judged by its stored name, whose extension upload-config picked from
// the MIME allowlist — so it serves with the right Content-Type), else 'file'.
function uploadedFileType(file) {
  if (!file) return 'file';
  const k = mediaKind(file.filename, file.mimetype);
  return k && MIME_BY_EXT[path.extname(file.filename).toLowerCase()] ? k.type : 'file';
}

function parseVcard(text) {
  const src = String(text).replace(/\r?\n[ \t]/g, '');
  const get = (name) => {
    const m = new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, 'im').exec(src);
    return m ? m[1].replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim() : '';
  };
  let name = get('FN');
  if (!name) {
    const [last = '', first = ''] = get('N').split(';');
    name = `${first} ${last}`.trim();
  }
  if (!name) return null;
  return { name, phone: get('TEL'), email: get('EMAIL') };
}

// What a lone mail attachment ({filename, contentType, content}) becomes, or
// null if it must be zipped instead (a MIME/extension we refuse to serve
// directly from /uploads).
function classify(att) {
  const name = att.filename || '';
  const media = mediaKind(name, att.contentType);
  if (media) return media;
  const ext = path.extname(name).toLowerCase();
  const mime = String(att.contentType || '').toLowerCase();
  if (/^text\/(x-)?vcard$|^text\/directory$/.test(mime) || ext === '.vcf') {
    const contact = parseVcard(att.content.toString('utf8'));
    if (contact) return { type: 'contact', contact };
  }
  if (FILE_EXT[mime]) return { type: 'file', mime, ext: FILE_EXT[mime] };
  if (isExecutableMime(mime)) return null;
  const safe = safeFileExt(name);
  if (ext && safe === '.bin') return null; // blocked extension
  return { type: 'file', mime: mime || 'application/octet-stream', ext: safe };
}

module.exports = { MIME_BY_EXT, mediaKind, uploadedFileType, parseVcard, classify };
