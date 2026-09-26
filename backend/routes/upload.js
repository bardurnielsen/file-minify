const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { AppError } = require('../middleware/errorHandler');
const { isSafeId } = require('../utils/safeId');
const { TEMP_DIR } = require('../utils/paths');
const router = express.Router();

// Accepted MIME types, each mapped to the extensions it may be stored under.
// The first entry is the canonical one, used when the client's own filename
// carries an extension we don't recognise for that type.
const ALLOWED_TYPES = {
  // Images
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  // SVG is deliberately absent: no route can compress, convert or merge one
  // (see IMAGE_EXTS and PDF_SOURCE_EXTS), and the frontend already drops it
  // from ACCEPT, so allowing the upload only leaves a dead file in temp/.
  // Videos
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  // PDFs
  'application/pdf': ['.pdf'],
  // Documents
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  // Spreadsheets
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  // Presentations
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx']
};

// Stored names become arguments to ffmpeg, gs, convert and libreoffice further
// down the pipeline. Those run without a shell, but each tool still parses its
// arguments, so nothing from originalname may reach disk verbatim: the
// extension is picked from the table above, never copied.
const safeExtFor = (file) => {
  const allowed = Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, file.mimetype)
    ? ALLOWED_TYPES[file.mimetype]
    : [];
  const claimed = path.extname(file.originalname).toLowerCase();
  return allowed.includes(claimed) ? claimed : allowed[0];
};

// MAX_FILE_SIZE is set as a human-readable string ("50MB") in Docker, but
// multer needs bytes and silently ignores a limit it cannot compare against.
const parseSize = (value, fallback) => {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(b|k|kb|m|mb|g|gb)?$/i);
  if (!match) return fallback;
  const units = { b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3 };
  const bytes = Math.floor(parseFloat(match[1]) * units[(match[2] || 'b').toLowerCase()]);
  // multer treats 0 as a real limit of zero, which would reject every upload.
  return bytes > 0 ? bytes : fallback;
};

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${safeExtFor(file)}`);
  }
});

// File filter to validate file types
const fileFilter = (req, file, cb) => {
  if (Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400), false);
  }
};

// Per-file limit in bytes. Exported so GET /config can tell the frontend, which
// then checks files before uploading them - one setting, not three copies.
const MAX_FILE_BYTES = parseSize(process.env.MAX_FILE_SIZE, 52428800); // 50MB default
const MAX_FILES = 10;

// Configure multer upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_BYTES,
  }
}).array('files', MAX_FILES);

// Handle file upload endpoint
router.post('/', (req, res) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload error'
      });
    } else if (err) {
      // Other errors
      return res.status(400).json({
        success: false,
        error: err.message || 'Unknown error during upload'
      });
    }

    // Check if files exist
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files were uploaded'
      });
    }

    // No `path` (it exposed the server's filesystem layout) and no `filename`
    // (always equal to `id`).
    const uploadedFiles = req.files.map(file => ({
      id: path.basename(file.path),
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    }));

    return res.status(200).json({
      success: true,
      count: uploadedFiles.length,
      data: uploadedFiles
    });
  });
});

// Handle file deletion
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!isSafeId(id)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    const filePath = path.join(TEMP_DIR, id);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    // Delete file
    fs.unlinkSync(filePath);
    
    return res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Error deleting file'
    });
  }
});

module.exports = router;
module.exports.MAX_FILE_BYTES = MAX_FILE_BYTES;
module.exports.MAX_FILES = MAX_FILES;
