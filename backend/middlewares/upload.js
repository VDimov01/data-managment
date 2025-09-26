// middlewares/upload.js
const multer = require('multer');
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB per image, tweak as needed
    files: 10
  }
});
module.exports = { uploadMemory };
