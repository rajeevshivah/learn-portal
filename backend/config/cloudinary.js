const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Documents / resources (raw files)
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'learn-portal/episodes',
    resource_type: 'raw',
    allowed_formats: ['pdf', 'doc', 'docx', 'pptx', 'txt', 'zip'],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
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

module.exports = { cloudinary, upload, uploadImage };
