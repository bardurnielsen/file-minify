const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument } = require('pdf-lib');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { toPdf, PDF_SOURCE_EXTS } = require('../utils/converters');
const { isSafeId } = require('../utils/safeId');

const router = express.Router();
const TEMP_DIR = path.join(__dirname, '../temp');
const MAX_SOURCES = 20;

const failWith = (message, statusCode, failedId) => {
  const err = new AppError(message, statusCode);
  err.failedId = failedId;
  return err;
};

/**
 * POST /merge  { ids: string[] }
 *
 * `ids` is the page order. Every source is converted to PDF (or passed through
 * if it already is one) strictly in sequence - that both preserves the order
 * and keeps LibreOffice to one job at a time - and the pages are stitched
 * together with pdf-lib. The merge is atomic: if any source cannot be turned
 * into a PDF the whole request fails and names that file, because a merged
 * document silently missing one of its parts is the wrong document.
 */
router.post('/', async (req, res, next) => {
  const { ids } = req.body || {};
  const jobId = uuidv4();
  const scratchDir = path.join(TEMP_DIR, `merge-${jobId}`);

  try {
    if (!Array.isArray(ids) || ids.length < 2) {
      throw new AppError('Provide at least two file ids to merge, in the order you want them', 400);
    }
    if (ids.length > MAX_SOURCES) {
      throw new AppError(`At most ${MAX_SOURCES} files can be merged at once`, 400);
    }
    for (const id of ids) {
      if (!isSafeId(id)) throw new AppError('Invalid file id', 400);
      const ext = path.extname(id).toLowerCase();
      if (!PDF_SOURCE_EXTS.includes(ext)) {
        throw failWith(`${id} cannot be turned into a PDF`, 400, id);
      }
      if (!fs.existsSync(path.join(TEMP_DIR, id))) {
        throw failWith(`File not found: ${id}`, 404, id);
      }
    }

    fs.mkdirSync(scratchDir, { recursive: true });
    const merged = await PDFDocument.create();
    let fileCount = 0;

    for (const id of ids) {
      const sourcePath = path.join(TEMP_DIR, id);

      let pdfPath;
      try {
        pdfPath = await toPdf(sourcePath, scratchDir);
      } catch (error) {
        throw failWith(`Couldn't turn ${id} into a PDF`, error.statusCode === 400 ? 400 : 422, id);
      }

      let doc;
      try {
        doc = await PDFDocument.load(fs.readFileSync(pdfPath));
      } catch (error) {
        logger.error(`pdf-lib could not read ${pdfPath}`, error);
        const reason = /encrypt/i.test(error.message || '') ? ' - it is password-protected' : '';
        throw failWith(`Couldn't read ${id} as a PDF${reason}`, 422, id);
      }

      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
      fileCount += 1;
    }

    const outputPath = path.join(TEMP_DIR, `merged-${jobId}.pdf`);
    fs.writeFileSync(outputPath, await merged.save());
    const { size } = fs.statSync(outputPath);
    const pageCount = merged.getPageCount();
    logger.info(`Merged ${fileCount} files into ${path.basename(outputPath)} (${pageCount} pages, ${size} bytes)`);

    res.status(200).json({
      success: true,
      data: { id: path.basename(outputPath), size, pageCount, fileCount },
    });
  } catch (error) {
    if (error.failedId) {
      logger.error(`Merge failed on ${error.failedId}: ${error.message}`);
      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.message,
        failedId: error.failedId,
      });
    }
    next(error);
  } finally {
    // Only the merged result survives; intermediate per-file PDFs go with the
    // scratch directory. Passthrough PDFs live in TEMP_DIR and are untouched.
    fs.rm(scratchDir, { recursive: true, force: true }, () => {});
  }
});

router.get('/download/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isSafeId(id) || !/^merged-[0-9a-f-]+\.pdf$/.test(id)) {
      throw new AppError('File not found', 404);
    }
    const filePath = path.join(TEMP_DIR, id);
    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found', 404);
    }
    res.download(filePath);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
