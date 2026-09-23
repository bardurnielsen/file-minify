export type FileType =
  | 'image'
  | 'video'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'other';

/** 'ready': uploaded and held until the user picks settings (see FileItem.hold). */
export type FileStatus = 'uploading' | 'ready' | 'queued' | 'processing' | 'done' | 'error';

// The one choice most people will ever make. Each file type maps it onto the
// parameters its encoder actually understands (see processing.ts).
export type Tier = 'small' | 'balanced' | 'high';

export type VideoCodec = 'h264' | 'h265';
/** Short-side cap, or 'source' for none. */
export type VideoResolution = 'source' | '1080' | '720' | '480';

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
  /** Video only: encoder for compression. Absent means H.264. */
  codec?: VideoCodec;
  /** Video only: absent lets the tier (or the target size) choose. */
  resolution?: VideoResolution;
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
  /**
   * Upload, but don't process until the user confirms settings. Set for video,
   * where an encode takes minutes and can't be cancelled, and the settings
   * (target size especially) matter more than for anything else.
   */
  hold?: boolean;
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
