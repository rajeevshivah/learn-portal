const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const { LESSON_FILE_TYPES } = require('./fileTypes');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Lesson resources (raw files): documents, code, notebooks, datasets.
// Raw files keep their extension in the public_id, so downloads stay usable.
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = path.basename(file.originalname || 'file', ext).replace(/[^\w\-]+/g, '_').slice(0, 60) || 'file';
    return {
      folder: 'learn-portal/episodes',
      resource_type: 'raw',
      public_id: `${base}_${Date.now().toString(36)}${ext}`,
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
    if (LESSON_FILE_TYPES.includes(ext)) return cb(null, true);
    const err = new Error(`.${ext || '?'} files can't be uploaded. Allowed: ${LESSON_FILE_TYPES.join(', ')}`);
    err.status = 400;
    cb(err);
  },
});

// Payment screenshots (images)
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'learn-portal/payments',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Whiteboard notes (PDF made in the browser from the board pages)
const boardStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'learn-portal/boards',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
  },
});

const uploadBoardPdf = multer({
  storage: boardStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

module.exports = { cloudinary, upload, uploadImage, uploadBoardPdf };
