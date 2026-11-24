const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument, degrees } = require('pdf-lib');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { toPdf, PDF_SOURCE_EXTS, PASSWORD_PROTECTED } = require('../utils/converters');
const { isSafeId } = require('../utils/safeId');
const { run } = require('../utils/run');

const router = express.Router();
const { TEMP_DIR } = require('../utils/paths');
const MAX_SOURCES = 20;
const TURNS = [0, 90, 180, 270];
// Thumbnails per file; pages after that still get their size, and turn with
// the file. The longer side of the file's largest page is drawn this wide.
const PREVIEW_PAGES = 200;
const THUMB_PX = 160;
// One page shown large (tapped in the grid): its longer side, as a JPEG.
const LARGE_PX = 1200;

const isTurn = (r) => TURNS.includes(r);
// A whole-file turn, or one per page (checked against the page count later).
const isRotation = (r) => isTurn(r) || (Array.isArray(r) && r.length <= 100000 && r.every(isTurn));

// The preview of a source lives in temp/preview-<id>/: pages.json, and for a
// source that is not a PDF the PDF it became, which the merge then reuses
// rather than running LibreOffice twice. The hourly clean-up sweeps it like
// any other temp entry, and deleting the upload removes it.
const previewDir = (id) => path.join(TEMP_DIR, `preview-${id}`);

const previewPdf = (id) => {
  try {
    const { converted } = JSON.parse(fs.readFileSync(path.join(previewDir(id), 'pages.json'), 'utf8'));
    const file = converted && path.join(previewDir(id), converted);
    return file && fs.existsSync(file) ? file : null;
  } catch {
    return null;
  }
};

// Page sizes as a reader sees them: a /Rotate of 90 or 270 swaps them.
const pageSizes = (doc) => doc.getPages().map((page) => {
  const { width, height } = page.getSize();
  const sideways = page.getRotation().angle % 180 !== 0;
  return {
    width: Math.round(sideways ? height : width),
    height: Math.round(sideways ? width : height),
  };
});

const buildPreview = async (id) => {
  const dir = previewDir(id);
  const pagesJson = path.join(dir, 'pages.json');
  if (fs.existsSync(pagesJson)) {
    const now = new Date();
    fs.utimesSync(dir, now, now); // still in use: keep it from the clean-up
    return JSON.parse(fs.readFileSync(pagesJson, 'utf8'));
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  try {
    const sourcePath = path.join(TEMP_DIR, id);
    const pdfPath = await toPdf(sourcePath, dir);
    let doc;
    try {
      doc = await PDFDocument.load(fs.readFileSync(pdfPath));
    } catch (error) {
      throw new AppError(/encrypt/i.test(error.message || '') ? PASSWORD_PROTECTED : `Couldn't read ${id} as a PDF`, 422);
    }
    const pages = pageSizes(doc);
    const shown = Math.min(pages.length, PREVIEW_PAGES);
    const longest = Math.max(...pages.slice(0, shown).map((p) => Math.max(p.width, p.height)));
    const dpi = Math.min(40, Math.max(2, Math.round((THUMB_PX * 72) / longest)));
    // Ghostscript draws each page as it sits, its own /Rotate included; the
    // user's turns go on top of that in the browser.
    await run('gs', [
      '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=png16m', `-r${dpi}`,
      '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', '-dFirstPage=1', `-dLastPage=${shown}`,
      `-sOutputFile=${path.join(dir, 'p-%d.png')}`, pdfPath,
    ]);
    pages.slice(0, shown).forEach((page, i) => {
      const png = path.join(dir, `p-${i + 1}.png`);
      if (!fs.existsSync(png)) return;
      page.thumb = `data:image/png;base64,${fs.readFileSync(png).toString('base64')}`;
      fs.rmSync(png, { force: true });
    });
    const preview = {
      id,
      pageCount: pages.length,
      pages,
      converted: pdfPath === sourcePath ? null : path.basename(pdfPath),
    };
    fs.writeFileSync(pagesJson, JSON.stringify(preview));
    return preview;
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
};

// One build per source at a time: opening the dialog twice must not start a
// second LibreOffice run for the same document. Large pages likewise, per page.
const building = new Map();
const once = (key, build) => {
  if (!building.has(key)) building.set(key, build().finally(() => building.delete(key)));
  return building.get(key);
};
const preview = (id) => once(id, () => buildPreview(id));

const largePage = (id, n) => once(`${id}#${n}`, async () => {
  const { pages, converted } = await preview(id);
  const dir = previewDir(id);
  const jpg = path.join(dir, `large-${n}.jpg`);
  if (!fs.existsSync(jpg)) {
    const { width, height } = pages[n - 1];
    const dpi = Math.min(300, Math.max(10, Math.round((LARGE_PX * 72) / Math.max(width, height))));
    const pdfPath = converted ? path.join(dir, converted) : path.join(TEMP_DIR, id);
    await run('gs', [
      '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=jpeg', '-dJPEGQ=80', `-r${dpi}`,
      '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', `-dFirstPage=${n}`, `-dLastPage=${n}`,
      `-sOutputFile=${jpg}`, pdfPath,
    ]);
    if (!fs.existsSync(jpg)) throw new AppError(`Couldn't draw page ${n}`, 500);
  }
  return `data:image/jpeg;base64,${fs.readFileSync(jpg).toString('base64')}`;
});

const failWith = (message, statusCode, failedId) => {
  const err = new AppError(message, statusCode);
  err.failedId = failedId;
  return err;
};

/**
 * POST /merge/pages  { id }
 *
 * What a source will contribute to a merge: its page count, each page's size
 * as seen, and a small PNG of each (as a data: URL, so one request per file
 * rather than one per page). Office documents and images are turned into a
 * PDF first, and the merge reuses that PDF.
 */
router.post('/pages', async (req, res, next) => {
  try {
    const { id } = req.body || {};
    if (!isSafeId(id)) throw new AppError('Invalid file id', 400);
    if (!PDF_SOURCE_EXTS.includes(path.extname(id).toLowerCase())) {
      throw new AppError(`${id} cannot be turned into a PDF`, 400);
    }
    if (!fs.existsSync(path.join(TEMP_DIR, id))) throw new AppError('File not found', 404);
    const data = { ...(await preview(id)) };
    delete data.converted; // a server-side file name, not the client's business
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /merge/page  { id, page }
 *
 * One page of a source drawn large (its longer side LARGE_PX, as a JPEG
 * data: URL), for when the thumbnail is too small to tell. `page` counts
 * from 1. Cached beside the preview.
 */
router.post('/page', async (req, res, next) => {
  try {
    const { id, page } = req.body || {};
    if (!isSafeId(id)) throw new AppError('Invalid file id', 400);
    if (!PDF_SOURCE_EXTS.includes(path.extname(id).toLowerCase())) {
      throw new AppError(`${id} cannot be turned into a PDF`, 400);
    }
    if (!fs.existsSync(path.join(TEMP_DIR, id))) throw new AppError('File not found', 404);
    const { pageCount } = await preview(id);
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new AppError(`page must be a whole number from 1 to ${pageCount}`, 400);
    }
    res.status(200).json({ success: true, data: { page, image: await largePage(id, page) } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /merge  { ids: string[], rotate?: (number | number[])[] }
 *
 * `ids` is the page order. `rotate`, if given, runs beside it: how far to turn
 * that source's pages clockwise (0, 90, 180 or 270), either one number for
 * every page or an array with one per page. The turn is added to any rotation
 * the page already has; it only changes the page's /Rotate entry, so nothing
 * is re-encoded. Every source is converted to PDF (or passed through
 * if it already is one) strictly in sequence - that both preserves the order
 * and keeps LibreOffice to one job at a time - and the pages are stitched
 * together with pdf-lib. The merge is atomic: if any source cannot be turned
 * into a PDF the whole request fails and names that file, because a merged
 * document silently missing one of its parts is the wrong document.
 */
router.post('/', async (req, res, next) => {
  const { ids, rotate } = req.body || {};
  const jobId = uuidv4();
  const scratchDir = path.join(TEMP_DIR, `merge-${jobId}`);

  try {
    if (!Array.isArray(ids) || ids.length < 2) {
      throw new AppError('Provide at least two file ids to merge, in the order you want them', 400);
    }
    if (ids.length > MAX_SOURCES) {
      throw new AppError(`At most ${MAX_SOURCES} files can be merged at once`, 400);
    }
    if (rotate !== undefined
      && (!Array.isArray(rotate) || rotate.length !== ids.length || !rotate.every(isRotation))) {
      throw new AppError('rotate must give 0, 90, 180 or 270 for each file (or a list of them, one per page), in the same order as ids', 400);
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

    for (const [index, id] of ids.entries()) {
      const sourcePath = path.join(TEMP_DIR, id);

      let pdfPath = previewPdf(id);
      try {
        pdfPath = pdfPath || await toPdf(sourcePath, scratchDir);
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
      const turn = rotate ? rotate[index] : 0;
      if (Array.isArray(turn) && turn.length !== pages.length) {
        throw new AppError(`rotate for ${id} lists ${turn.length} pages; it has ${pages.length}`, 400);
      }
      pages.forEach((page, p) => {
        const by = Array.isArray(turn) ? turn[p] : turn;
        // A page may already carry any multiple of 90, negative included.
        if (by) page.setRotation(degrees((((page.getRotation().angle + by) % 360) + 360) % 360));
        merged.addPage(page);
      });
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
