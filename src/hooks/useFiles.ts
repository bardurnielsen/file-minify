import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FileItem, MergeState, MissingTool, PhoneAccess, Tier, UpdateStatus } from '../types';
import { MAX_FILE_BYTES } from '../processing';

const EMPTY_MERGE: MergeState = { status: 'idle', order: [], excluded: [], name: 'merged.pdf' };

interface FileStore {
  files: FileItem[];
  /** Tier applied to newly dropped files; remembered across visits. */
  defaultTier: Tier;
  merge: MergeState;
  /** Per-file upload limit, as the server reports it (GET /config). */
  maxFileBytes: number;
  setMaxFileBytes: (bytes: number) => void;
  /** The Windows build, on the PC itself (GET /config); null everywhere else. */
  phone: PhoneAccess | null;
  setPhone: (phone: PhoneAccess | null) => void;
  /** Also the Windows build's: its version, what it's missing, and updates. */
  version: string | null;
  missingTools: MissingTool[];
  setNative: (native: { version: string | null; missingTools: MissingTool[] }) => void;
  update: UpdateStatus | null;
  /** The update notice was put off ("Later") or its version skipped. */
  updateNoticeHidden: boolean;
  setUpdate: (update: UpdateStatus | null, noticeHidden: boolean) => void;
  setUpdateNoticeHidden: (hidden: boolean) => void;
  setDefaultTier: (tier: Tier) => void;
  addFiles: (newFiles: FileItem[]) => void;
  removeFile: (id: string) => void;
  updateFile: (id: string, updates: Partial<FileItem> | ((file: FileItem) => Partial<FileItem>)) => void;
  clearFiles: () => void;
  setMerge: (updates: Partial<MergeState> | ((merge: MergeState) => Partial<MergeState>)) => void;
  resetMerge: () => void;
}

export const useFiles = create<FileStore>()(
  persist(
    (set) => ({
      files: [],
      defaultTier: 'balanced',
      merge: EMPTY_MERGE,
      maxFileBytes: MAX_FILE_BYTES,
      setMaxFileBytes: (maxFileBytes) => set({ maxFileBytes }),
      phone: null,
      setPhone: (phone) => set({ phone }),
      version: null,
      missingTools: [],
      setNative: ({ version, missingTools }) => set({ version, missingTools }),
      update: null,
      updateNoticeHidden: false,
      setUpdate: (update, updateNoticeHidden) => set({ update, updateNoticeHidden }),
      setUpdateNoticeHidden: (updateNoticeHidden) => set({ updateNoticeHidden }),
      setDefaultTier: (defaultTier) => set({ defaultTier }),
      addFiles: (newFiles) => set((state) => ({ files: [...state.files, ...newFiles] })),
      removeFile: (id) =>
        set((state) => ({
          files: state.files.filter((f) => f.id !== id),
          merge: {
            ...state.merge,
            order: state.merge.order.filter((x) => x !== id),
            excluded: state.merge.excluded.filter((x) => x !== id),
          },
        })),
      updateFile: (id, updates) =>
        set((state) => ({
          files: state.files.map((f) =>
            f.id === id ? { ...f, ...(typeof updates === 'function' ? updates(f) : updates) } : f
          ),
        })),
      clearFiles: () => set({ files: [], merge: EMPTY_MERGE }),
      setMerge: (updates) =>
        set((state) => ({
          merge: { ...state.merge, ...(typeof updates === 'function' ? updates(state.merge) : updates) },
        })),
      resetMerge: () => set({ merge: EMPTY_MERGE }),
    }),
    {
      name: 'fileminify-prefs',
      // File objects cannot be serialised; only the preference survives reloads.
      partialize: (state) => ({ defaultTier: state.defaultTier }),
    }
  )
);
