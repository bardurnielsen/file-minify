const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { exec } = require('child_process');
const { promisify } = require('util');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();
const execPromise = promisify(exec);

// Compress image file
const compressImage = async (filePath, options) => {
  const { quality = 80, format = 'jpeg', maxSize } = options;
  const outputPath = path.join(
    path.dirname(filePath),
    `compressed-${path.basename(filePath).split('.')[0]}.${format}`
  );
  
  try {
    let sharpInstance = sharp(filePath);
    
    // Set format
    if (format === 'jpeg' || format === 'jpg') {
      sharpInstance = sharpInstance.jpeg({ quality });
    } else if (format === 'png') {
      sharpInstance = sharpInstance.png({ quality });
    } else if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality });
    }
    
    // Resize if needed to meet max size constraint
    if (maxSize) {
      const metadata = await sharpInstance.metadata();
      const imageArea = metadata.width * metadata.height;
      const maxArea = maxSize * 1000000; // Convert MB to pixels (approximate)
      
      if (imageArea > maxArea) {
        const scaleFactor = Math.sqrt(maxArea / imageArea);
        const newWidth = Math.floor(metadata.width * scaleFactor);
        const newHeight = Math.floor(metadata.height * scaleFactor);
        sharpInstance = sharpInstance.resize(newWidth, newHeight);
      }
    }
    
    await sharpInstance.toFile(outputPath);
    return outputPath;
  } catch (error) {
    logger.error('Image compression failed', error);
    throw new AppError('Image compression failed', 500);
  }
};

// Compress PDF file
const compressPDF = async (filePath, options) => {
  const { quality = 'screen' } = options; // 'screen', 'ebook', 'printer', 'prepress'
  const outputPath = path.join(
    path.dirname(filePath),
    `compressed-${path.basename(filePath)}`
  );
  
  try {
    // Use Ghostscript for PDF compression
    const qualitySettings = {
      low: ['-dPDFSETTINGS=/screen', '-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=72'],
      medium: ['-dPDFSETTINGS=/ebook', '-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=150'],
      high: ['-dPDFSETTINGS=/printer', '-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=300']
    };
    
    // Determine quality settings based on input
    const qualitySetting = quality === 'low' ? qualitySettings.low : 
                          quality === 'high' ? qualitySettings.high : 
                          qualitySettings.medium;
                          
    const cmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dNOPAUSE -dQUIET -dBATCH ${qualitySetting.join(' ')} -sOutputFile="${outputPath}" "${filePath}"`;
    
    await execPromise(cmd);
    return outputPath;
  } catch (error) {
    logger.error('PDF compression failed', error);
    throw new AppError('PDF compression failed', 500);
  }
};

// Compress video file
const compressVideo = async (filePath, options) => {
  const { quality = 'medium', format = 'mp4', maxSize } = options;
  const outputPath = path.join(
    path.dirname(filePath),
    `compressed-${path.basename(filePath).split('.')[0]}.${format}`
  );
  
  try {
    // Map quality to FFmpeg settings
    const qualitySettings = {
      low: { crf: '28', preset: 'faster' },
      medium: { crf: '23', preset: 'medium' },
      high: { crf: '18', preset: 'slow' }
    };
    
    const setting = quality === 'low' ? qualitySettings.low : 
                   quality === 'high' ? qualitySettings.high : 
                   qualitySettings.medium;
    
    // Basic FFmpeg command for compression
    let cmd = `ffmpeg -i "${filePath}" -c:v libx264 -crf ${setting.crf} -preset ${setting.preset} -c:a aac -b:a 128k "${outputPath}"`;
    
    // If max size is specified, use two-pass encoding to target file size
    if (maxSize) {
      const targetSize = maxSize * 1024; // Convert MB to KB
      const duration = await getVideoDuration(filePath);
      const bitrate = Math.floor((targetSize * 8) / duration);
      
      cmd = `ffmpeg -i "${filePath}" -c:v libx264 -b:v ${bitrate}k -pass 1 -f mp4 /dev/null && ` +
            `ffmpeg -i "${filePath}" -c:v libx264 -b:v ${bitrate}k -pass 2 -c:a aac -b:a 128k "${outputPath}"`;
    }
    
    await execPromise(cmd);
    return outputPath;
  } catch (error) {
    logger.error('Video compression failed', error);
    throw new AppError('Video compression failed', 500);
  }
};

// Helper function to get video duration
const getVideoDuration = async (filePath) => {
  const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
  return parseFloat(stdout.trim());
};

// Compression route - process file compression based on file type
router.post('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quality, format, maxSize } = req.body;
    
    const filePath = path.join(__dirname, '../temp', id);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found', 404);
    }
    
    // Determine file type and apply appropriate compression
    const fileExt = path.extname(filePath).toLowerCase();
    let outputPath;
    
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fileExt)) {
      // Image compression
      outputPath = await compressImage(filePath, { 
        quality: parseInt(quality) || 80, 
        format: format || 'jpeg',
        maxSize: maxSize ? parseInt(maxSize) : null
      });
    } else if (fileExt === '.pdf') {
      // PDF compression
      outputPath = await compressPDF(filePath, { 
        quality: quality || 'medium'
      });
    } else if (['.mp4', '.webm', '.mov', '.avi'].includes(fileExt)) {
      // Video compression
      outputPath = await compressVideo(filePath, {
        quality: quality || 'medium',
        format: format || 'mp4',
        maxSize: maxSize ? parseInt(maxSize) : null
      });
    } else {
      throw new AppError('Unsupported file type for compression', 400);
    }
    
    // Get file stats
    const originalStats = fs.statSync(filePath);
    const compressedStats = fs.statSync(outputPath);
    
    res.status(200).json({
      success: true,
      data: {
        id: path.basename(outputPath),
        originalSize: originalStats.size,
        compressedSize: compressedStats.size,
        compressionRatio: (compressedStats.size / originalStats.size).toFixed(2),
        savedSpace: originalStats.size - compressedStats.size
      }
    });
  } catch (error) {
    next(error);
  }
});

// Download compressed file
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