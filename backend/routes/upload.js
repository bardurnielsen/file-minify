const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { AppError } = require('../middleware/errorHandler');
const { isSafeId } = require('../utils/safeId');
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
  'image/svg+xml': ['.svg'],
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

// Stored names are interpolated into shell commands further down the pipeline
// (ffmpeg, gs, convert, libreoffice), so nothing from originalname may reach
// disk verbatim: the extension is picked from the table above, never copied.
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
    cb(null, path.join(__dirname, '../temp'));
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

// Configure multer upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseSize(process.env.MAX_FILE_SIZE, 52428800), // 50MB default
  }
}).array('files', 10);

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

    try {
      // Set JSON content type header only for successful response
      res.setHeader('Content-Type', 'application/json');
      
      // Return file info
      const uploadedFiles = req.files.map(file => ({
        id: path.basename(file.path),
        originalName: file.originalname,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
      }));

      return res.status(200).json({
        success: true,
        count: uploadedFiles.length,
        data: uploadedFiles
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message || 'Error processing uploaded files'
      });
    }
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
    const filePath = path.join(__dirname, '../temp', id);
    
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