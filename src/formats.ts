import { FileType } from './types';

export interface FormatOption {
  value: string;
  label: string;
}

export const KEEP_ORIGINAL: FormatOption = { value: 'original', label: 'Keep format' };

// Target formats the backend can actually produce for each source type.
// Mirrors the branches in backend/routes/conversion.js - keep the two in sync.
const TARGETS: Record<FileType, FormatOption[]> = {
  image: [
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP' },
    { value: 'gif', label: 'GIF' },
    { value: 'pdf', label: 'PDF' },
  ],
  video: [
    { value: 'mp4', label: 'MP4' },
    { value: 'webm', label: 'WebM' },
    { value: 'mov', label: 'MOV' },
    { value: 'avi', label: 'AVI' },
  ],
  pdf: [
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP' },
    { value: 'gif', label: 'GIF' },
  ],
  document: [{ value: 'pdf', label: 'PDF' }],
  spreadsheet: [{ value: 'pdf', label: 'PDF' }],
  presentation: [{ value: 'pdf', label: 'PDF' }],
  other: [],
};

/** Every target a file type can become, regardless of source extension. */
export const targetsFor = (type: FileType): FormatOption[] => TARGETS[type];

/** Anything that is a PDF, or that the backend can turn into one, can be merged. */
export const canBecomePdf = (type: FileType) =>
  type === 'pdf' || TARGETS[type].some((option) => option.value === 'pdf');

export const extensionOf = (fileName: string) =>
  fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';

// Converting a file to the format it already is either fails outright (Sharp
// refuses to read and write the same path) or is a no-op, so never offer it.
const isSourceFormat = (value: string, fileName: string) => {
  const ext = extensionOf(fileName);
  if (!ext) return false;
  const alias = (v: string) => (v === 'jpeg' ? 'jpg' : v);
  return alias(value) === alias(ext);
};

// Formats offered for a single file.
export const formatsFor = (type: FileType, fileName: string): FormatOption[] => [
  KEEP_ORIGINAL,
  ...TARGETS[type].filter((option) => !isSourceFormat(option.value, fileName)),
];
