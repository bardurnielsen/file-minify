const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { AppError } = require('../middleware/errorHandler');
const { isSafeId } = require('../utils/safeId');
const { run } = require('../utils/run');
const logger = require('../utils/logger');
const { compressPDF } = require('../utils/converters');

const router = express.Router();

// The UI sends 'original' to mean "keep the source format", and a missing
// format means the same. Resolve it to the source extension so it never lands in
// a filename or an encoder as a literal. Resolved formats become part of an
// output filename passed to the encoders, so only known-good ones are allowed
// through (commands run without a shell, but a path is still a path). The lists
// are per encoder: a format the other one handles is still a 400 here, not a
// 500 from inside Sharp or ffmpeg. The rejected value is never echoed back -
// it is client-controlled and would otherwise reach the log verbatim.
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const VIDEO_FORMATS = ['mp4', 'webm', 'mov', 'avi'];

const resolveFormat = (filePath, format, allowed) => {
  const resolved = !format || format === 'original'
    ? path.extname(filePath).slice(1).toLowerCase()
    : String(format).toLowerCase();
  if (!allowed.includes(resolved)) {
    throw new AppError('Unsupported output format for this file type', 400);
  }
  return resolved;
};

// Compress image file
const compressImage = async (filePath, options) => {
  const { quality, format: rawFormat } = options;
  const format = resolveFormat(filePath, rawFormat, IMAGE_FORMATS);
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
    
    await sharpInstance.toFile(outputPath);
    return outputPath;
  } catch (error) {
    logger.error('Image compression failed', error);
    throw new AppError('Image compression failed', 500);
  }
};

// Per codec and tier. x265 reaches the same quality at a higher CRF than
// x264, so the numbers are not comparable across codecs.
//   shortSide  the tier's default resolution cap (short side, never upscaled)
//   ceiling    peak video bitrate as a share of the source's. CRF alone asks for
//              a quality level, and on an already-lean source (a 4 Mbps 1080p
//              phone clip) that level needed *more* bits than the source had, so
//              Balanced and Best both came out larger and the original was kept.
//              The ceiling makes every tier a real step down; on a high-bitrate
//              source it never binds and CRF decides. x265's are a quarter
//              lower, so on a lean source it is still the smaller codec rather
//              than the same size at a better quality. Scaled down further
//              when the picture is (see ceilingFor).
const VIDEO_SETTINGS = {
  h264: {
    low: { crf: '28', preset: 'slow', shortSide: 720, ceiling: 0.45, audio: '96k' },
    medium: { crf: '24', preset: 'slow', shortSide: 1080, ceiling: 0.55, audio: '128k' },
    high: { crf: '21', preset: 'slow', ceiling: 0.8, audio: '128k' },
  },
  h265: {
    low: { crf: '30', preset: 'medium', shortSide: 720, ceiling: 0.34, audio: '96k' },
    medium: { crf: '27', preset: 'medium', shortSide: 1080, ceiling: 0.41, audio: '128k' },
    high: { crf: '24', preset: 'medium', ceiling: 0.6, audio: '128k' },
  },
};
const VIDEO_CODECS = { h264: 'libx264', h265: 'libx265' };
// HEVC is only muxed into MP4/MOV here; WebM and AVI would reject it or play
// nowhere.
const HEVC_FORMATS = ['mp4', 'mov'];
// An explicit resolution choice: a short-side cap, or 'source' for none.
// Absent means the tier (or, with a target size, the bitrate) decides.
const RESOLUTIONS = { source: null, 1080: 1080, 720: 720, 480: 480 };

// With a target size and no explicit resolution, fit the picture to the bits:
// a starved 1080p encode looks blockier than a clean 720p one.
const shortSideForBitrate = (kbps) =>
  kbps >= 5000 ? null : kbps >= 2500 ? 1080 : kbps >= 1000 ? 720 : 480;

// Peak bitrate in kbps, or null when the source bitrate is unknown. Fewer
// pixels need fewer bits, though not proportionally - hence the 0.75 power.
const ceilingFor = (source, share, shortSide) => {
  if (!source.videoKbps) return null;
  const srcShort = Math.min(source.width, source.height);
  const outShort = shortSide && srcShort ? Math.min(shortSide, srcShort) : srcShort;
  const pixels = srcShort ? (outShort / srcShort) ** 2 : 1;
  return Math.max(200, Math.floor(source.videoKbps * share * pixels ** 0.75));
};

// Scale so the short side is at most `max`, whichever way round the video is,
// so a portrait phone clip is not squeezed to 405 px wide. -2 keeps the other
// side even, which yuv420p requires.
const capShortSide = (max) =>
  `scale='if(gt(iw,ih),-2,min(${max},iw))':'if(gt(iw,ih),min(${max},ih),-2)'`;

// Compress video file
const compressVideo = async (filePath, options) => {
  const {
    quality = 'medium', format: rawFormat, maxSize, codec = 'h264', resolution,
  } = options;
  const format = resolveFormat(filePath, rawFormat, VIDEO_FORMATS);
  if (!Object.hasOwn(VIDEO_CODECS, codec)) {
    throw new AppError('Unsupported video codec', 400);
  }
  if (codec === 'h265' && !HEVC_FORMATS.includes(format)) {
    throw new AppError('H.265 is only available for MP4 and MOV', 400);
  }
  if (resolution !== undefined &&
      (typeof resolution !== 'string' || !Object.hasOwn(RESOLUTIONS, resolution))) {
    throw new AppError('Unsupported resolution', 400);
  }
  const outputPath = path.join(
    path.dirname(filePath),
    `compressed-${path.basename(filePath).split('.')[0]}.${format}`
  );
  
  try {
    const level = ['low', 'medium', 'high'].includes(quality) ? quality : 'medium';
    const setting = VIDEO_SETTINGS[codec][level];
    const source = await probeVideo(filePath);

    // yuv420p keeps 10-bit phone footage playable: otherwise x264 writes High 10,
    // which browsers and most phones refuse. hvc1 is the HEVC tag Apple players
    // need; the default hev1 opens as a black screen in QuickTime and Safari.
    const video = ['-c:v', VIDEO_CODECS[codec], '-pix_fmt', 'yuv420p'];
    if (codec === 'h265') video.push('-tag:v', 'hvc1');
    const x265 = (params) =>
      codec === 'h265' ? ['-x265-params', ['log-level=error', ...params].join(':')] : [];
    const scale = (shortSide) => (shortSide ? ['-vf', capShortSide(shortSide)] : []);
    const chosen = resolution === undefined ? undefined : RESOLUTIONS[resolution];

    const shortSide = chosen === undefined ? setting.shortSide : chosen;
    const ceiling = ceilingFor(source, setting.ceiling, shortSide);
    
    // -y is required: without it FFmpeg prompts before overwriting an existing
    // output (including /dev/null below) and blocks forever, since it has no
    // stdin to answer from.
    let passes = [[
      '-y', '-i', filePath, ...video,
      ...x265([]), '-crf', setting.crf, '-preset', setting.preset,
      ...(ceiling ? ['-maxrate', `${ceiling}k`, '-bufsize', `${ceiling * 2}k`] : []),
      ...scale(shortSide),
      '-c:a', 'aac', '-b:a', setting.audio, outputPath,
    ]];
    let passLog = null;
    
    // If max size is specified, use two-pass encoding to target file size
    if (maxSize) {
      const targetSize = maxSize * 1024; // Convert MB to KB
      if (!source.duration) throw new Error('Could not read the video duration');
      // The target covers the whole file, so the audio's share comes off the
      // video bitrate; otherwise every result overshot by 128 kbps x duration.
      const audioKbps = 128;
      const bitrate = Math.max(100, Math.floor((targetSize * 8) / source.duration) - audioKbps);
      const fitted = chosen === undefined ? shortSideForBitrate(bitrate) : chosen;
      
      // Each job needs its own pass log. FFmpeg defaults to ffmpeg2pass-0.log in
      // the working directory, so concurrent jobs would corrupt each other.
      passLog = path.join(
        path.dirname(filePath),
        `passlog-${path.basename(filePath, path.extname(filePath))}`
      );
      
      // Was one shell string joined by &&; awaiting in sequence keeps the same
      // stop-on-failure behaviour without a shell to do the chaining. x265 takes
      // its pass options through -x265-params rather than -pass/-passlogfile.
      const pass = (n) => codec === 'h265'
        ? x265([`pass=${n}`, `stats=${passLog}.log`])
        : ['-pass', String(n), '-passlogfile', passLog];
      passes = [
        ['-y', '-i', filePath, ...video, '-b:v', `${bitrate}k`, ...scale(fitted),
         ...pass(1), '-an', '-f', 'mp4', '/dev/null'],
        ['-y', '-i', filePath, ...video, '-b:v', `${bitrate}k`, ...scale(fitted),
         ...pass(2), '-c:a', 'aac', '-b:a', `${audioKbps}k`, outputPath],
      ];
    }
    
    try {
      for (const args of passes) {
        await run('ffmpeg', args);
      }
    } finally {
      if (passLog) {
        for (const scratch of [`${passLog}-0.log`, `${passLog}-0.log.mbtree`,
                               `${passLog}.log`, `${passLog}.log.cutree`]) {
          try { fs.unlinkSync(scratch); } catch (e) { /* never written */ }
        }
      }
    }
    return outputPath;
  } catch (error) {
    logger.error('Video compression failed', error);
    throw new AppError('Video compression failed', 500);
  }
};

// Duration, dimensions and the video stream's bitrate. Some containers (WebM, many MKV
// remuxes) carry no per-stream bitrate; then it is estimated from the whole
// file less the audio, and failing that left null so no ceiling is applied.
const probeVideo = async (filePath) => {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-print_format', 'json',
    '-show_entries', 'format=duration,bit_rate:stream=codec_type,bit_rate,width,height', filePath,
  ]);
  const info = JSON.parse(stdout);
  const kbps = (v) => (Number(v) > 0 ? Number(v) / 1000 : 0);
  const streams = info.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioKbps = streams
    .filter((s) => s.codec_type === 'audio')
    .reduce((sum, s) => sum + (kbps(s.bit_rate) || 128), 0);
  const videoKbps = kbps(videoStream?.bit_rate) ||
    Math.max(0, kbps(info.format?.bit_rate) - audioKbps) || null;
  return {
    duration: parseFloat(info.format?.duration) || 0,
    videoKbps,
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
  };
};

// Compression route - process file compression based on file type
router.post('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isSafeId(id)) {
      throw new AppError('File not found', 404);
    }
    const { quality, format, maxSize, codec, resolution } = req.body;
    
    const filePath = path.join(__dirname, '../temp', id);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new AppError('File not found', 404);
    }
    
    // Determine file type and apply appropriate compression
    const fileExt = path.extname(filePath).toLowerCase();
    let outputPath;
    
    if (IMAGE_FORMATS.map(e => `.${e}`).includes(fileExt)) {
      // Image compression
      // A missing format means "keep it", as 'original' does. This used to
      // default to 'jpeg', so a PNG sent without one came back as a JPEG.
      outputPath = await compressImage(filePath, {
        quality: parseInt(quality) || 80,
        format
      });
    } else if (fileExt === '.pdf') {
      // PDF compression
      outputPath = await compressPDF(filePath, { 
        quality: quality || 'medium'
      });
    } else if (VIDEO_FORMATS.map(e => `.${e}`).includes(fileExt)) {
      // Video compression
      outputPath = await compressVideo(filePath, {
        quality: quality || 'medium',
        format,
        maxSize: maxSize ? parseInt(maxSize) : null,
        codec: codec || 'h264',
        resolution
      });
    } else {
      throw new AppError('Unsupported file type for compression', 400);
    }
    
    // Get file stats
    const originalStats = fs.statSync(filePath);
    let compressedStats = fs.statSync(outputPath);

    // Re-encoding already-compressed input can produce a larger file. When the
    // result is no smaller and the format is unchanged, keep the original.
    const sameExt = (a, b) => {
      const norm = e => (e === '.jpg' ? '.jpeg' : e);
      return norm(a) === norm(b);
    };
    if (compressedStats.size >= originalStats.size &&
        sameExt(path.extname(outputPath).toLowerCase(), fileExt)) {
      logger.info(`Compression inflated ${path.basename(filePath)}; keeping original`);
      fs.unlinkSync(outputPath);
      outputPath = filePath;
      compressedStats = originalStats;
    }
    
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