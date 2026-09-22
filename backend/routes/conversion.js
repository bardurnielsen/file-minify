const express = require('express');
const path = require('path');
const fs = require('fs');
const { AppError } = require('../middleware/errorHandler');
const { isSafeId } = require('../utils/safeId');
const { run } = require('../utils/run');
const logger = require('../utils/logger');
const {
  convertOfficeToPDF,
  convertImageToPDF,
  compressPDF,
  needsPassword,
  PASSWORD_PROTECTED,
} = require('../utils/converters');

const PDF_LEVELS = ['low', 'medium', 'high'];

const router = express.Router();

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
    switch (format) {
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

// Convert video to another format
const convertVideo = async (filePath, format) => {
  const outputPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}.${format}`
  );
  
  if (path.resolve(outputPath) === path.resolve(filePath)) {
    throw new AppError(`File is already in ${format} format`, 400);
  }
  
  try {
    // -y is required: without it FFmpeg prompts before overwriting an existing
    // output and blocks forever, since it has no stdin to answer from.
    await run('ffmpeg', ['-y', '-i', filePath, outputPath]);
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
    await run('convert', [`${filePath}[0]`, outputPath]);
    
    // Check if the output file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('Conversion failed: Output file not found');
    }
    
    return outputPath;
  } catch (error) {
    logger.error('PDF to image conversion failed', error);
    if (needsPassword(error.stderr)) throw new AppError(PASSWORD_PROTECTED, 422);
    throw new AppError('PDF to image conversion failed', 500);
  }
};

// Conversion route - convert file to specified format
router.post('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isSafeId(id)) {
      throw new AppError('File not found', 404);
    }
    let { format } = req.body;
    
    // If body contains options object, extract format from it
    if (req.body.options && req.body.options.format) {
      format = req.body.options.format;
    }
    // Normalise once. A non-string format used to reach .toLowerCase() and come
    // back as a 500; it is an unsupported format, which is a 400.
    format = typeof format === 'string' ? format : '';
    
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
      if (format !== 'pdf') {
        throw new AppError('Office documents can only be converted to PDF', 400);
      }
      outputPath = await convertOfficeToPDF(filePath);
      // An optional named level runs the PDF through Ghostscript, as the
      // compression route does for a dropped PDF. Keep whichever is smaller.
      const { quality } = req.body;
      if (PDF_LEVELS.includes(quality)) {
        const compressedPath = await compressPDF(outputPath, { quality });
        if (fs.statSync(compressedPath).size < fs.statSync(outputPath).size) {
          fs.unlinkSync(outputPath);
          outputPath = compressedPath;
        } else {
          fs.unlinkSync(compressedPath);
        }
      }
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fileExt)) {
      // Image conversion
      if (format === 'pdf') {
        // Convert image to PDF
        outputPath = await convertImageToPDF(filePath);
      } else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(format)) {
        // Convert image to another image format
        outputPath = await convertImage(filePath, format);
      } else {
        throw new AppError('Unsupported image format', 400);
      }
    } else if (['.mp4', '.webm', '.mov', '.avi'].includes(fileExt)) {
      // Video conversion
      if (!['mp4', 'webm', 'mov', 'avi'].includes(format)) {
        throw new AppError('Unsupported video format', 400);
      }
      outputPath = await convertVideo(filePath, format);
    } else if (fileExt === '.pdf') {
      // PDF conversion
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(format)) {
        // Convert PDF to image
        outputPath = await convertPDFToImage(filePath, format);
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
        newFormat: format
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
    if (!isSafeId(id)) {
      throw new AppError('File not found', 404);
    }
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