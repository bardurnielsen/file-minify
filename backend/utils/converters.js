const path = require('path');
const fs = require('fs');
const { AppError } = require('../middleware/errorHandler');
const logger = require('./logger');
const { run } = require('./run');
const { PDFDocument } = require('pdf-lib');

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
      logger.info(`Converting ${filePath} to PDF in ${outDir}`);
      const { stdout, stderr } = await run('libreoffice', [
        '--headless', '--convert-to', 'pdf', '--outdir', outDir, filePath,
      ]);
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
    // -auto-orient: a phone photo is stored sideways with an EXIF Orientation
    // tag, which a PDF page does not carry, so turn the pixels upright first.
    await run('convert', [input, '-auto-orient', outputPath]);
    if (!fs.existsSync(outputPath)) {
      throw new Error('Conversion failed: Output file not found');
    }
    return outputPath;
  } catch (error) {
    logger.error('Image to PDF conversion failed', error);
    throw new AppError('Image to PDF conversion failed', 500);
  }
};

// Ghostscript cannot open a PDF that needs a password just to read it, yet it
// exits 0 and writes a blank one-page PDF, which then looks like a 95% saving.
// Its stderr is the only sign. ImageMagick hands PDFs to Ghostscript, so the
// same message turns up in its error output.
const PASSWORD_PROTECTED = 'This PDF is password-protected. Remove the password and try again.';
const needsPassword = (output) => /requires a password/i.test(String(output || ''));

// Ghostscript 10.00 writes every object loose, so a PDF full of small objects
// (a spreadsheet with thousands of hyperlinks, say) stays large whatever the
// level. Repacking with pdf-lib puts them in compressed object streams, which
// is lossless. Best effort: pdf-lib refuses encrypted PDFs and may not parse
// every file, and either way the Ghostscript output is kept as it is. The
// repack only replaces it when it comes out smaller.
const repackPDF = async (filePath, label) => {
  try {
    const src = fs.readFileSync(filePath);
    const doc = await PDFDocument.load(src, { updateMetadata: false });
    // The Producer field names the tool that wrote the file, which is what
    // this is - shown in a viewer's document properties. Title, author and
    // subject belong to the document and are left alone.
    if (label) doc.setProducer(label);
    const out = await doc.save({ useObjectStreams: true });
    if (out.length < src.length) {
      fs.writeFileSync(filePath, out);
      logger.info(`Repacked ${path.basename(filePath)}: ${src.length} -> ${out.length} bytes`);
    }
  } catch (error) {
    logger.warn(`Repack skipped for ${path.basename(filePath)}: ${error.message}`);
  }
};

// Compress a PDF with Ghostscript at a named level (low|medium|high; anything
// else is medium), then repack it. -dBATCH/-dNOPAUSE keep it non-interactive,
// and it overwrites an existing output silently.
const compressPDF = async (filePath, options) => {
  const { quality = 'medium', label } = options; // quality: 'low' | 'medium' | 'high'
  const outputPath = path.join(
    path.dirname(filePath),
    `compressed-${path.basename(filePath)}`
  );
  let passwordRequired = false;

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
                          
    const { stderr } = await run('gs', [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4', '-dNOPAUSE', '-dQUIET', '-dBATCH',
      ...qualitySetting,
      `-sOutputFile=${outputPath}`,
      filePath,
    ]);
    passwordRequired = needsPassword(stderr);
  } catch (error) {
    logger.error('PDF compression failed', error);
    if (needsPassword(error.stderr)) throw new AppError(PASSWORD_PROTECTED, 422);
    throw new AppError('PDF compression failed', 500);
  }
  if (passwordRequired) {
    fs.rmSync(outputPath, { force: true });
    throw new AppError(PASSWORD_PROTECTED, 422);
  }
  await repackPDF(outputPath, label);
  return outputPath;
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
  compressPDF,
  needsPassword,
  PASSWORD_PROTECTED,
  toPdf,
};
