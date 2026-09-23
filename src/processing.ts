import { canBecomePdf, extensionOf, KEEP_ORIGINAL } from './formats';
import { FileItem, FileType, ProcessingOption, Route, Tier, VideoResolution } from './types';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_DROP = 10;

const OFFICE_TYPES: FileType[] = ['document', 'spreadsheet', 'presentation'];
export const isOffice = (type: FileType) => OFFICE_TYPES.includes(type);

/**
 * THE routing rule, shared by the process call and the download call so the
 * two can never drift apart: office files only ever convert (to PDF); any file
 * with an explicit target format converts; everything else compresses.
 */
export const routeFor = (type: FileType, options: ProcessingOption): Route =>
  isOffice(type) || options.format !== KEEP_ORIGINAL.value ? 'conversion' : 'compression';

export const TIERS: { value: Tier; label: string; hint: string }[] = [
  { value: 'small', label: 'Smaller', hint: 'Biggest savings. Fine detail may soften a little.' },
  { value: 'balanced', label: 'Balanced', hint: 'Good savings, hard to tell from the original.' },
  { value: 'high', label: 'Best quality', hint: 'Modest savings, nothing visibly lost.' },
];

export const tierLabel = (tier: Tier) => TIERS.find((t) => t.value === tier)!.label;

// Sharp takes 1-100 for images. Ghostscript (PDF) and FFmpeg (video) take a
// named level; a number sent there is silently treated as "medium".
const IMAGE_QUALITY: Record<Tier, number> = { small: 60, balanced: 78, high: 90 };
const LEVEL: Record<Tier, 'low' | 'medium' | 'high'> = {
  small: 'low',
  balanced: 'medium',
  high: 'high',
};

export const imageQualityFor = (options: ProcessingOption) =>
  options.quality ?? IMAGE_QUALITY[options.tier];

export const targetFormatFor = (type: FileType, name: string, options: ProcessingOption) => {
  if (isOffice(type)) return 'pdf';
  if (options.format !== KEEP_ORIGINAL.value) return options.format;
  return extensionOf(name);
};

/** Body for POST /compression/:id or POST /conversion/:id. */
export const requestBodyFor = (
  type: FileType,
  options: ProcessingOption
): Record<string, string | number> => {
  // Office files go to PDF, and the backend then runs Ghostscript at this level
  // just as it does for a dropped PDF. Other conversions ignore quality.
  if (isOffice(type)) return { format: 'pdf', quality: LEVEL[options.tier] };
  if (routeFor(type, options) === 'conversion') return { format: options.format };
  switch (type) {
    case 'image':
      // maxSize is deliberately omitted: the backend treats it as a megapixel
      // cap and would silently downscale large photos.
      return { quality: imageQualityFor(options), format: KEEP_ORIGINAL.value };
    case 'pdf':
      return { quality: LEVEL[options.tier] };
    case 'video': {
      // With maxSize the backend two-pass encodes towards that size and ignores
      // quality entirely, so send one or the other - never both. Codec and
      // resolution are only sent when not left to the default, so older results
      // don't go stale.
      const extra = {
        ...(options.codec === 'h265' ? { codec: 'h265' } : {}),
        ...(options.resolution ? { resolution: options.resolution } : {}),
      };
      return options.targetSizeMb
        ? { format: KEEP_ORIGINAL.value, maxSize: options.targetSizeMb, ...extra }
        : { quality: LEVEL[options.tier], format: KEEP_ORIGINAL.value, ...extra };
    }
    default:
      return { quality: LEVEL[options.tier], format: KEEP_ORIGINAL.value };
  }
};

/** Two option sets are equivalent if they would send the same request. */
export const sameRequest = (type: FileType, a: ProcessingOption, b: ProcessingOption) =>
  routeFor(type, a) === routeFor(type, b) &&
  JSON.stringify(requestBodyFor(type, a)) === JSON.stringify(requestBodyFor(type, b));

/** A finished file whose current settings differ from what produced its result. */
export const isStale = (file: FileItem) =>
  file.status === 'done' && !!file.result && !sameRequest(file.type, file.options, file.result.options);

export const outputNameFor = (name: string, type: FileType, options: ProcessingOption) => {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : '';
  if (routeFor(type, options) === 'conversion') {
    return `${base}.${targetFormatFor(type, name, options)}`;
  }
  return ext ? `${base}-min.${ext}` : `${base}-min`;
};

/** Short, human description of what will happen to a file. */
export const describePlan = (file: FileItem) => {
  const { type, options } = file;
  if (isOffice(type)) return `Convert to PDF · ${tierLabel(options.tier)}`;
  if (options.format !== KEEP_ORIGINAL.value) return `Convert to ${options.format.toUpperCase()}`;
  const videoExtras =
    type === 'video'
      ? `${options.resolution ? ` · ${resolutionLabel(options.resolution)}` : ''}${
          options.codec === 'h265' ? ' · H.265' : ''
        }`
      : '';
  if (type === 'video' && options.targetSizeMb) return `Compress to about ${options.targetSizeMb} MB${videoExtras}`;
  if (type === 'image' && options.quality !== undefined) return `Compress · quality ${options.quality}`;
  return `Compress · ${tierLabel(options.tier)}${videoExtras}`;
};

const resolutionLabel = (r: VideoResolution) => (r === 'source' ? 'original size' : `${r}p`);

// The backend only muxes HEVC into MP4 and MOV.
const HEVC_EXTS = ['mp4', 'mov'];
export const canUseHevc = (type: FileType, name: string) =>
  type === 'video' && HEVC_EXTS.includes(extensionOf(name));

export const detectType = (file: File): FileType => {
  const mime = file.type || '';
  const ext = extensionOf(file.name);
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.includes('word') || ['doc', 'docx'].includes(ext)) return 'document';
  if (mime.includes('excel') || mime.includes('spreadsheetml') || ['xls', 'xlsx'].includes(ext)) return 'spreadsheet';
  if (mime.includes('powerpoint') || mime.includes('presentationml') || ['ppt', 'pptx'].includes(ext)) return 'presentation';
  return 'other';
};

export const TYPE_LABEL: Record<FileType, string> = {
  image: 'Image',
  video: 'Video',
  pdf: 'PDF',
  document: 'Word document',
  spreadsheet: 'Spreadsheet',
  presentation: 'Presentation',
  other: 'File',
};

// Mirrors the backend upload allowlist, minus SVG: the backend accepts the
// upload but can neither compress nor convert it, so it would only ever error.
export const ACCEPT: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
};

/** Whether a file can take part in a PDF merge at all (video cannot). */
export const isMergeable = (file: FileItem) => canBecomePdf(file.type);

/**
 * The temp-file id a merge should read: the processed output when there is
 * one (so a converted .docx is not pushed through LibreOffice twice and a
 * compressed PDF merges at its compressed size), otherwise the upload.
 */
export const mergeSourceId = (file: FileItem) => file.result?.processedId ?? file.serverId;

/** Mergeable and already on the server. */
export const isMergeReady = (file: FileItem) =>
  isMergeable(file) && !!mergeSourceId(file) && file.status !== 'uploading';
