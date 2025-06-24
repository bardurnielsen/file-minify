const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();
const execPromise = promisify(exec);

// Convert Office documents to PDF
const convertOfficeToPDF = async (filePath) => {
  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.pdf`
  );
  
  try {
    // Use LibreOffice for conversion
    const cmd = `libreoffice --headless --convert-to pdf --outdir "${path.dirname(filePath)}" "${filePath}"`;
    
    logger.info(`Executing conversion command: ${cmd}`);
    const { stdout, stderr } = await execPromise(cmd);
    
    if (stdout) logger.info(`LibreOffice stdout: ${stdout}`);
    if (stderr) logger.warn(`LibreOffice stderr: ${stderr}`);
    
    // Check if the output file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Conversion failed: Output file not found');
    }
    
    // Log file details
    const stats = fs.statSync(outputPath);
    logger.info(`Conversion successful: ${outputPath}, Size: ${stats.size} bytes`);
    
    return outputPath;
  } catch (error) {
    logger.error('Office to PDF conversion failed', error);
    throw new AppError('Office to PDF conversion failed', 500);
  }
};

// Convert image to another format
const convertImage = async (filePath, format) => {
  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.${format}`
  );
  
  try {
    // Use Sharp for image conversion
    const sharp = require('sharp');
    let sharpInstance = sharp(filePath);
    
    // Use the correct Sharp format methods
    switch (format.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg();
        break;
      case 'png':
        sharpInstance = sharpInstance.png();
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp();
        break;
      case 'gif':
        sharpInstance = sharpInstance.gif();
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
    
    await sharpInstance.toFile(outputPath);
    return outputPath;
  } catch (error) {
    logger.error('Image conversion failed', error);
    throw new AppError('Image conversion failed', 500);
  }
};

// Convert image to PDF
const convertImageToPDF = async (filePath) => {
  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.pdf`
  );
  
  try {
    // Use ImageMagick to convert image to PDF
    const cmd = `convert "${filePath}" "${outputPath}"`;
    await execPromise(cmd);
    
    // Check if the output file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Conversion failed: Output file not found');
    }
    
    return outputPath;
  } catch (error) {
    logger.error('Image to PDF conversion failed', error);
    throw new AppError('Image to PDF conversion failed', 500);
  }
};

// Convert video to another format
const convertVideo = async (filePath, format) => {
  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.${format}`
  );
  
  try {
    // Use FFmpeg for video conversion
    const cmd = `ffmpeg -i "${filePath}" "${outputPath}"`;
    await execPromise(cmd);
    return outputPath;
  } catch (error) {
    logger.error('Video conversion failed', error);
    throw new AppError('Video conversion failed', 500);
  }
};

// Convert PDF to image
const convertPDFToImage = async (filePath, format) => {
  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.${format}`
  );
  
  try {
    // Use ImageMagick to convert PDF to image (first page only)
    const cmd = `convert "${filePath}[0]" "${outputPath}"`;
    await execPromise(cmd);
    
    // Check if the output file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Conversion failed: Output file not found');
    }
    
    return outputPath;
  } catch (error) {
    logger.error('PDF to image conversion failed', error);
    throw new AppError('PDF to image conversion failed', 500);
  }
};

// Conversion route - convert file to specified format
router.post('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    let { format } = req.body;
    
    // If body contains options object, extract format from it
    if (req.body.options && req.body.options.format) {
      format = req.body.options.format;
    }
    
    // Default to PDF for office documents if format is 'original' or not specified
    const filePath = path.join(__dirname, '../temp', id);
    const fileExt = path.extname(filePath).toLowerCase();
    const isOfficeDoc = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].includes(fileExt);
    if (isOfficeDoc && (!format || format === 'original')) {
      format = 'pdf';
    }
    
    if (!format || format === 'original') {
      throw new AppError('Format is required for conversion', 400);
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found', 404);
    }
    
    // Determine file type and apply appropriate conversion
    let outputPath;
    
    // Log the conversion request for debugging
    logger.info(`Converting file: ${id}, Extension: ${fileExt}, Format: ${format}`);
    
    if (['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'].includes(fileExt)) {
      // Office to PDF conversion
      if (format.toLowerCase() !== 'pdf') {
        throw new AppError('Office documents can only be converted to PDF', 400);
      }
      outputPath = await convertOfficeToPDF(filePath);
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fileExt)) {
      // Image conversion
      if (format.toLowerCase() === 'pdf') {
        // Convert image to PDF
        outputPath = await convertImageToPDF(filePath);
      } else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(format.toLowerCase())) {
        // Convert image to another image format
        outputPath = await convertImage(filePath, format.toLowerCase());
      } else {
        throw new AppError('Unsupported image format', 400);
      }
    } else if (['.mp4', '.webm', '.mov', '.avi'].includes(fileExt)) {
      // Video conversion
      if (!['mp4', 'webm', 'mov', 'avi'].includes(format.toLowerCase())) {
        throw new AppError('Unsupported video format', 400);
      }
      outputPath = await convertVideo(filePath, format.toLowerCase());
    } else if (fileExt === '.pdf') {
      // PDF conversion
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(format.toLowerCase())) {
        // Convert PDF to image
        outputPath = await convertPDFToImage(filePath, format.toLowerCase());
      } else {
        throw new AppError('PDFs can only be converted to image formats (JPG, PNG, WebP, GIF)', 400);
      }
    } else {
      throw new AppError('Unsupported file type for conversion', 400);
    }
    
    // Get file stats
    const originalStats = fs.statSync(filePath);
    const convertedStats = fs.statSync(outputPath);
    
    res.status(200).json({
      success: true,
      data: {
        id: path.basename(outputPath),
        originalSize: originalStats.size,
        convertedSize: convertedStats.size,
        originalFormat: path.extname(filePath).replace('.', ''),
        newFormat: format.toLowerCase()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Download converted file
router.get('/download/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const filePath = path.join(__dirname, '../temp', id);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found', 404);
    }
    
    // Set content disposition and send file
    res.download(filePath);
  } catch (error) {
    next(error);
  }
});

module.exports = router;