export type FileType =
  | 'image'
  | 'video'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'other';

export type FileStatus = 'uploading' | 'queued' | 'processing' | 'done' | 'error';

// The one choice most people will ever make. Each file type maps it onto the
// parameters its encoder actually understands (see processing.ts).
export type Tier = 'small' | 'balanced' | 'high';

export type Route = 'compression' | 'conversion';
/** Routes that serve a download; 'merge' produces one file from many. */
export type DownloadRoute = Route | 'merge';

export interface ProcessingOption {
  tier: Tier;
  /** 'original' keeps the source format; otherwise a target from formats.ts. */
  format: string;
  /** Images only: a fine-grained 1-100 quality that overrides the tier. */
  quality?: number;
  /** Video only: two-pass encode towards this size (MB); overrides the tier. */
  targetSizeMb?: number;
}

export interface FileResult {
  processedId: string;
  route: Route;
  outputSize: number;
  /** Extension of the file that was produced. */
  outputFormat: string;
  /** The backend kept the original because re-encoding would not have helped. */
  unchanged: boolean;
  /** The options that produced this result (used for downloads and staleness). */
  options: ProcessingOption;
}

export interface FileItem {
  /** Local id, stable from the moment the file is dropped. */
  id: string;
  /** `<uuid>.<ext>` assigned by POST /upload; absent until the upload finishes. */
  serverId?: string;
  file: File;
  name: string;
  size: number;
  type: FileType;
  status: FileStatus;
  /** 0-1 while uploading. */
  uploadProgress: number;
  startedAt?: number;
  options: ProcessingOption;
  result?: FileResult;
  error?: string;
  /** Object URL for image thumbnails; revoked when the row goes away. */
  previewUrl?: string;
}

export interface MergeResult {
  id: string;
  size: number;
  pageCount: number;
  fileCount: number;
  /** Local file ids that went in, in order. */
  sourceIds: string[];
}

export interface MergeState {
  status: 'idle' | 'running' | 'done' | 'error';
  /** Local file ids in page order. Mergeable files not listed are left out. */
  order: string[];
  /** Local file ids the user deliberately left out. */
  excluded: string[];
  name: string;
  result?: MergeResult;
  error?: string;
  /** Local id of the file the backend could not turn into a PDF. */
  failedFileId?: string;
}
