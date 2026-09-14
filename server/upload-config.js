const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Stored extension comes from an allowlist keyed to the uploaded MIME type, never
// from the client-supplied filename — otherwise an `x.html` / `x.svg` "image"
// lands under /uploads and executes as script on this origin. SVG is excluded
// deliberately (it can carry script). Shared by the attachment upload in
// routes/notes.js and the PWA share target in routes/share.js.
const IMAGE_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};
const AUDIO_EXT = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
};

// Generic (non-image, non-audio) file attachments: a broad allowlist of common
// document / archive / data / video MIME types. Deliberately excludes anything
// that renders as script on this origin — no text/html, image/svg+xml, xml,
// javascript — even though /uploads is already served scriptless + sandboxed.
const FILE_EXT = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-7z-compressed': '.7z',
  'application/x-tar': '.tar',
  'application/gzip': '.gz',
  'application/x-gzip': '.gz',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
  'application/vnd.oasis.opendocument.presentation': '.odp',
  'application/rtf': '.rtf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/markdown': '.md',
  'text/calendar': '.ics',
  'application/json': '.json',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

// Extensions that must never land under /uploads regardless of the declared
// MIME — they execute as script / markup, or run as a program.
const BLOCKED_FILE_EXT = new Set([
  '.svg', '.html', '.htm', '.xhtml', '.shtml', '.xml', '.js', '.mjs', '.cjs',
  '.wasm', '.php', '.phtml', '.php3', '.php4', '.php5', '.pht', '.asp', '.aspx',
  '.jsp', '.sh', '.bash', '.bat', '.cmd', '.com', '.exe', '.scr', '.msi',
  '.hta', '.jar', '.vbs', '.ps1',
]);

// For a generic file whose MIME isn't in FILE_EXT (e.g. application/octet-stream):
// keep the client filename's extension only if it's a short alphanumeric run
// that isn't on the executable/markup denylist. Otherwise store it as `.bin`.
function safeFileExt(originalname) {
  const m = /(\.[A-Za-z0-9]{1,8})$/.exec(originalname || '');
  if (!m) return '.bin';
  const ext = m[1].toLowerCase();
  return BLOCKED_FILE_EXT.has(ext) ? '.bin' : ext;
}

// True for MIME types that render/execute as markup or script on this origin.
function isExecutableMime(mime) {
  return /^(?:text\/html|application\/xhtml|image\/svg|application\/x-?httpd-php|application\/(?:x-)?javascript|application\/ecmascript|text\/javascript)\b/i.test(
    mime || ''
  );
}

// A multer instance that writes uploads to data/uploads/ with a random name +
// safe extension. Images/audio use their MIME allowlist; any other file is
// accepted unless its MIME renders as script/markup on this origin.
function diskUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => {
        const ext =
          IMAGE_EXT[file.mimetype] ||
          AUDIO_EXT[file.mimetype] ||
          FILE_EXT[file.mimetype] ||
          safeFileExt(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (IMAGE_EXT[file.mimetype] || AUDIO_EXT[file.mimetype] || FILE_EXT[file.mimetype]) {
        return cb(null, true);
      }
      cb(null, !isExecutableMime(file.mimetype));
    },
  });
}

module.exports = { uploadsDir, IMAGE_EXT, AUDIO_EXT, FILE_EXT, diskUpload };
