import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FileItem, Tier } from '../types';

interface FileStore {
  files: FileItem[];
  /** Tier applied to newly dropped files; remembered across visits. */
  defaultTier: Tier;
  setDefaultTier: (tier: Tier) => void;
  addFiles: (newFiles: FileItem[]) => void;
  removeFile: (id: string) => void;
  updateFile: (id: string, updates: Partial<FileItem> | ((file: FileItem) => Partial<FileItem>)) => void;
  clearFiles: () => void;
}

export const useFiles = create<FileStore>()(
  persist(
    (set) => ({
      files: [],
      defaultTier: 'balanced',
      setDefaultTier: (defaultTier) => set({ defaultTier }),
      addFiles: (newFiles) => set((state) => ({ files: [...state.files, ...newFiles] })),
      removeFile: (id) => set((state) => ({ files: state.files.filter((f) => f.id !== id) })),
      updateFile: (id, updates) =>
        set((state) => ({
          files: state.files.map((f) =>
            f.id === id ? { ...f, ...(typeof updates === 'function' ? updates(f) : updates) } : f
          ),
        })),
      clearFiles: () => set({ files: [] }),
    }),
    {
      name: 'fileminify-prefs',
      // File objects cannot be serialised; only the preference survives reloads.
      partialize: (state) => ({ defaultTier: state.defaultTier }),
    }
  )
);
