const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const { AppError } = require('../middleware/errorHandler');
const logger = require('./logger');
const { RUN } = require('./run');

const execPromise = promisify(exec);

const OFFICE_EXTS = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
// Everything that can end up as a PDF, and so can take part in a merge.
const PDF_SOURCE_EXTS = [...OFFICE_EXTS, ...IMAGE_EXTS, '.pdf'];

// LibreOffice's headless mode holds a per-profile lock, so a second conversion
// started while one is running fails outright. Chain every office job behind
// the previous one; callers never see the queue.
let officeQueue = Promise.resolve();
const withOfficeLock = (task) => {
  const run = officeQueue.then(task, task);
  officeQueue = run.catch(() => {});
  return run;
};

// Convert Office documents to PDF. LibreOffice overwrites an existing output
// without prompting, so no non-interactive flag is needed here.
const convertOfficeToPDF = (filePath, outDir = path.dirname(filePath)) =>
  withOfficeLock(async () => {
    const outputPath = path.join(outDir, `${path.basename(filePath, path.extname(filePath))}.pdf`);
    try {
      const cmd = `libreoffice --headless --convert-to pdf --outdir "${outDir}" "${filePath}"`;
      logger.info(`Executing conversion command: ${cmd}`);
      const { stdout, stderr } = await execPromise(cmd, RUN);
      if (stdout) logger.info(`LibreOffice stdout: ${stdout}`);
      if (stderr) logger.warn(`LibreOffice stderr: ${stderr}`);
      if (!fs.existsSync(outputPath)) {
        throw new Error('Conversion failed: Output file not found');
      }
      const stats = fs.statSync(outputPath);
      logger.info(`Conversion successful: ${outputPath}, Size: ${stats.size} bytes`);
      return outputPath;
    } catch (error) {
      logger.error('Office to PDF conversion failed', error);
      throw new AppError('Office to PDF conversion failed', 500);
    }
  });

// Convert an image to PDF with ImageMagick, which also overwrites silently.
// firstFrameOnly stops an animated GIF becoming one page per frame.
const convertImageToPDF = async (
  filePath,
  { outDir = path.dirname(filePath), firstFrameOnly = false } = {}
) => {
  const outputPath = path.join(outDir, `${path.basename(filePath, path.extname(filePath))}.pdf`);
  try {
    const input = firstFrameOnly ? `${filePath}[0]` : filePath;
    await execPromise(`convert "${input}" "${outputPath}"`, RUN);
    if (!fs.existsSync(outputPath)) {
      throw new Error('Conversion failed: Output file not found');
    }
    return outputPath;
  } catch (error) {
    logger.error('Image to PDF conversion failed', error);
    throw new AppError('Image to PDF conversion failed', 500);
  }
};

// Produce a PDF for any file that can become one, writing into outDir.
// PDFs are returned as-is (never copied or modified).
const toPdf = async (filePath, outDir) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return filePath;
  if (OFFICE_EXTS.includes(ext)) return convertOfficeToPDF(filePath, outDir);
  if (IMAGE_EXTS.includes(ext)) {
    return convertImageToPDF(filePath, { outDir, firstFrameOnly: ext === '.gif' });
  }
  throw new AppError(`${ext ? ext.slice(1).toUpperCase() : 'This kind of'} file cannot be turned into a PDF`, 400);
};

module.exports = {
  OFFICE_EXTS,
  IMAGE_EXTS,
  PDF_SOURCE_EXTS,
  convertOfficeToPDF,
  convertImageToPDF,
  toPdf,
};
