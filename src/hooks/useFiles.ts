import { create } from 'zustand';
import { FileItem } from '../types';

interface FileStore {
  files: FileItem[];
  addFiles: (newFiles: FileItem[]) => void;
  removeFile: (id: string) => void;
  updateFile: (id: string, updates: Partial<FileItem>) => void;
  clearFiles: () => void;
}

export const useFiles = create<FileStore>((set) => ({
  files: [],
  addFiles: (newFiles) => set((state) => ({ 
    files: [...state.files, ...newFiles] 
  })),
  removeFile: (id) => set((state) => ({ 
    files: state.files.filter(file => file.id !== id) 
  })),
  updateFile: (id, updates) => set((state) => ({
    files: state.files.map(file => 
      file.id === id ? { ...file, ...updates } : file
    )
  })),
  clearFiles: () => set({ files: [] }),
}));