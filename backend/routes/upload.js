const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { AppError } = require('../middleware/errorHandler');
const router = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../temp'));
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueFilename = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueFilename);
  }
});

// File filter to validate file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Videos
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
    // PDFs
    'application/pdf',
    // Documents
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Spreadsheets
    'application/vnd.ms-excel', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedTypes.includes(file.mimetype)) {
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
    fileSize: process.env.MAX_FILE_SIZE || 52428800, // 50MB default
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