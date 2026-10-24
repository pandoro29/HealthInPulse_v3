const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_EXAM_TYPES  = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// A extensão salva vem do tipo aceito, nunca do nome enviado: senão um
// "exame.html" declarado como image/png seria servido como HTML em /uploads.
const EXTENSION_BY_TYPE = {
  'application/pdf': '.pdf',
  'image/jpeg':      '.jpg',
  'image/png':       '.png',
  'image/webp':      '.webp',
};
const MAX_EXAM_SIZE   = 10 * 1024 * 1024; // 10 MB
const MAX_AVATAR_SIZE =  2 * 1024 * 1024; //  2 MB

const storage = (dest) =>
  multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads', dest),
    filename: (_req, file, cb) => {
      const hash = crypto.randomBytes(16).toString('hex');
      cb(null, `${Date.now()}-${hash}${EXTENSION_BY_TYPE[file.mimetype]}`);
    },
  });

const fileFilter = (allowed) => (_req, file, cb) => {
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`), false);
};

const examUpload = multer({
  storage: storage('exams'),
  limits: { fileSize: MAX_EXAM_SIZE },
  fileFilter: fileFilter(ALLOWED_EXAM_TYPES),
});

const avatarUpload = multer({
  storage: storage('avatars'),
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
});

module.exports = { examUpload, avatarUpload };
