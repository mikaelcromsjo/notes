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

// A multer instance that writes image/audio uploads to data/uploads/ with a
// random name + allowlisted extension, rejecting everything else.
function diskUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => {
        const ext = IMAGE_EXT[file.mimetype] || AUDIO_EXT[file.mimetype] || '.bin';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      cb(null, Boolean(IMAGE_EXT[file.mimetype] || AUDIO_EXT[file.mimetype]));
    },
  });
}

module.exports = { uploadsDir, IMAGE_EXT, AUDIO_EXT, diskUpload };
