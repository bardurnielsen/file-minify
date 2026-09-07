export type FileType = 'image' | 'video' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'other';
export type FileStatus = 'idle' | 'processing' | 'completed' | 'error';

export interface ProcessingOption {
  quality: number;
  format: string;
  maxSize: number;
}

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: FileType;
  status: FileStatus;
  progress: number;
  options: ProcessingOption;
  processedId?: string;
  compressedSize?: number;
}