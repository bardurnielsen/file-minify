import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileRejection, useDropzone } from 'react-dropzone';
import { fromEvent } from 'file-selector';
import { AnimatePresence, HTMLMotionProps, motion } from 'framer-motion';
import { Download, Layers, RefreshCw, Trash2 } from 'lucide-react';
import { FileItem, FileType, ProcessingOption, Tier } from '../../types';
import { KEEP_ORIGINAL } from '../../formats';
import {
  ACCEPT,
  MAX_FILES_PER_DROP,
  detectType,
  isMergeReady,
  isMergeable,
  isOffice,
  isStale,
  mergeSourceId,
  outputNameFor,
  requestBodyFor,
  routeFor,
} from '../../processing';
import { MergeError, deleteUpload, downloadBlob, mergeFiles, processFile, uploadFile } from '../../lib/api';
import { formatBytes, percentChange, plural, uid, cn } from '../../lib/format';
import { useFiles } from '../../hooks/useFiles';
import { useToast } from '../ui/toaster';
import { Button } from '../ui/button';
import { AddMoreStrip, DropHero } from './DropZone';
import FileRow from './FileRow';
import TierControl from './TierControl';
import MergeDialog, { MergeRow, mergedFileName } from './MergeDialog';

// Uploads, and processing of images and PDFs, which finish in well under a
// second. Three keeps the queue moving.
const CONCURRENCY = 3;
// LibreOffice refuses to run two headless conversions at once (profile lock),
// so Office files are processed in their own single-file lane.
const OFFICE_CONCURRENCY = 1;
// Each video encode already uses every core it can get, so running several at
// once only multiplies memory and makes all of them finish later. One at a
// time also finishes them in the order they were started.
const VIDEO_CONCURRENCY = 1;

const createLimiter = (limit: number) => {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= limit || queue.length === 0) return;
    active += 1;
    queue.shift()!();
  };
  return <T,>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
};

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Some browsers hand over files with an empty type (a .docx on Windows without
// Office, some Android pickers). react-dropzone used to fill it in from the
// extension; since v18 that table isn't bundled, so a blank type went up as
// application/octet-stream and the backend's allowlist refused it. The map is
// built from ACCEPT, so it covers exactly what the app takes.
const MIME_BY_EXTENSION = new Map(
  Object.entries(ACCEPT).flatMap(([mime, exts]) =>
    exts.map((ext) => [ext.replace(/^\./, ''), mime] as [string, string])
  )
);
const getFilesFromEvent = (event: Parameters<typeof fromEvent>[0]) =>
  fromEvent(event, { mimeTypes: MIME_BY_EXTENSION });

const rejectionMessage = (r: FileRejection) => {
  const code = r.errors[0]?.code;
  if (code === 'file-too-large') {
    return `${r.file.name} is over ${formatBytes(useFiles.getState().maxFileBytes)}.`;
  }
  if (code === 'file-invalid-type') return `${r.file.name} isn't a supported type.`;
  return `${r.file.name} couldn't be added.`;
};

const FileProcessor: React.FC = () => {
  const files = useFiles((s) => s.files);
  const defaultTier = useFiles((s) => s.defaultTier);
  const maxFileBytes = useFiles((s) => s.maxFileBytes);
  const merge = useFiles((s) => s.merge);
  const [mergeOpen, setMergeOpen] = useState(false);
  const { addToast } = useToast();
  const limiter = useRef(createLimiter(CONCURRENCY)).current;
  const officeLimiter = useRef(createLimiter(OFFICE_CONCURRENCY)).current;
  const videoLimiter = useRef(createLimiter(VIDEO_CONCURRENCY)).current;

  // Always read the freshest copy inside async work; options can change while
  // a file waits in the queue and the run must honour what the row shows.
  const getFile = (id: string) => useFiles.getState().files.find((f) => f.id === id);
  const update = useFiles.getState().updateFile;

  // Uploading and processing take separate slots: uploads share the general
  // lane, and only the processing step waits in its type's lane. Otherwise a
  // video dropped while another encodes couldn't even start uploading.
  const run = useCallback(
    async (id: string) => {
      const lane = (type: FileType) =>
        isOffice(type) ? officeLimiter : type === 'video' ? videoLimiter : limiter;
      try {
        if (!getFile(id)?.serverId) {
          await limiter(async () => {
            const file = getFile(id);
            if (!file) return;
            update(id, { status: 'uploading', uploadProgress: 0, error: undefined });
            const uploaded = await uploadFile(file.file, (fraction) =>
              update(id, { uploadProgress: fraction })
            );
            update(id, { serverId: uploaded.id, uploadProgress: 1 });
          });
        }
        const uploaded = getFile(id);
        if (!uploaded?.serverId) return; // removed while uploading
        if (uploaded.hold) {
          update(id, { status: 'ready' });
          return;
        }
        update(id, { status: 'queued' });
        await lane(uploaded.type)(async () => {
          const file = getFile(id);
          if (!file?.serverId) return; // removed while queued
          const { type, options, serverId } = file;
          const route = routeFor(type, options);
          update(id, { status: 'processing', startedAt: Date.now(), result: undefined, error: undefined });
          const data = await processFile(serverId, route, requestBodyFor(type, options));
          const outputSize = data.compressedSize ?? data.convertedSize ?? file.size;
          const ext = data.id.includes('.') ? data.id.split('.').pop()!.toLowerCase() : '';
          if (!getFile(id)) return;
          update(id, {
            status: 'done',
            result: {
              processedId: data.id,
              route,
              outputSize,
              outputFormat: data.newFormat ?? ext,
              // The backend hands back the upload itself when re-encoding would not
              // have made it smaller.
              unchanged: route === 'compression' && (data.id === serverId || outputSize >= file.size),
              options,
              details: data.details ?? null,
            },
          });
        });
      } catch (error) {
        if (!getFile(id)) return;
        update(id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Something went wrong.',
        });
      }
    },
    [limiter, officeLimiter, videoLimiter, update]
  );

  const handleDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      rejected.slice(0, 3).forEach((r) =>
        addToast({ type: 'error', title: 'Skipped a file', description: rejectionMessage(r), duration: 6000 })
      );
      if (accepted.length > MAX_FILES_PER_DROP) {
        addToast({
          type: 'warning',
          title: `Only the first ${MAX_FILES_PER_DROP} files were added`,
          description: 'Drop the rest once these are done.',
          duration: 6000,
        });
      }
      const batch = accepted.slice(0, MAX_FILES_PER_DROP);
      if (batch.length === 0) return;

      const tier = useFiles.getState().defaultTier;
      const items: FileItem[] = batch.map((file) => {
        const type = detectType(file);
        return {
          id: uid(),
          file,
          name: file.name,
          size: file.size,
          type,
          status: 'queued',
          uploadProgress: 0,
          options: { tier, format: KEEP_ORIGINAL.value },
          hold: type === 'video',
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        };
      });
      useFiles.getState().addFiles(items);
      items.forEach((item) => void run(item.id));
    },
    [addToast, run]
  );

  const { getRootProps, getInputProps, open, isDragActive, isDragReject } = useDropzone({
    onDrop: handleDrop,
    getFilesFromEvent,
    accept: ACCEPT,
    maxSize: maxFileBytes,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    useFsAccessApi: false,
  });

  const rerun = (id: string, options?: ProcessingOption) => {
    const file = getFile(id);
    if (!file) return;
    update(id, { options: options ?? file.options, status: 'queued' });
    void run(id);
  };

  /** Release a held file with the settings the user chose. */
  const start = (id: string, options: ProcessingOption) => {
    const file = getFile(id);
    if (!file) return;
    // Still uploading: its run is in flight and checks `hold` once the upload
    // lands, so starting another would upload the file twice.
    if (file.status === 'uploading') {
      update(id, { options, hold: false });
      return;
    }
    update(id, { hold: false });
    rerun(id, options);
  };

  const remove = (id: string) => {
    const file = getFile(id);
    if (!file) return;
    if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
    if (file.serverId) void deleteUpload(file.serverId);
    useFiles.getState().removeFile(id);
  };

  const clearAll = () => {
    useFiles.getState().files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      if (f.serverId) void deleteUpload(f.serverId);
    });
    useFiles.getState().clearFiles();
  };

  const download = async (id: string) => {
    const file = getFile(id);
    if (!file?.result) return;
    try {
      // Route and options come from the result, i.e. what actually produced the
      // file - not the row's current (possibly edited) settings.
      const blob = await downloadBlob(file.result.route, file.result.processedId);
      saveBlob(blob, outputNameFor(file.name, file.type, file.result));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        duration: 6000,
      });
    }
  };

  const downloadAll = async () => {
    const done = useFiles.getState().files.filter((f) => f.status === 'done');
    for (const [i, f] of done.entries()) {
      await download(f.id);
      if (i < done.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
  };

  const openMerge = () => {
    // Bring in every mergeable file the user has not deliberately left out,
    // keeping whatever order they already arranged.
    const { files: current, merge: m, setMerge } = useFiles.getState();
    const additions = current
      .filter((f) => isMergeable(f) && !m.order.includes(f.id) && !m.excluded.includes(f.id))
      .map((f) => f.id);
    if (additions.length) setMerge({ order: [...m.order, ...additions] });
    setMergeOpen(true);
  };

  const runMerge = async () => {
    const { files: current, merge: m, setMerge } = useFiles.getState();
    const byId = new Map(current.map((f) => [f.id, f]));
    const sources = m.order.map((id) => byId.get(id)).filter((f): f is FileItem => !!f && isMergeReady(f));
    if (sources.length < 2) return;
    setMerge({ status: 'running', error: undefined, failedFileId: undefined, result: undefined });
    try {
      const data = await mergeFiles(sources.map((f) => mergeSourceId(f)!));
      useFiles.getState().setMerge({
        status: 'done',
        result: data,
      });
    } catch (error) {
      const failedFileId =
        error instanceof MergeError && error.failedId
          ? sources.find((f) => mergeSourceId(f) === error.failedId)?.id
          : undefined;
      useFiles.getState().setMerge({
        status: 'error',
        error: error instanceof Error ? error.message : 'Merge failed.',
        failedFileId,
      });
    }
  };

  const downloadMerged = async () => {
    const m = useFiles.getState().merge;
    if (!m.result) return;
    try {
      const blob = await downloadBlob('merge', m.result.id);
      saveBlob(blob, mergedFileName(m.name));
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        duration: 6000,
      });
    }
  };

  const setTierForAll = (tier: Tier) => {
    useFiles.getState().setDefaultTier(tier);
    useFiles.getState().files.forEach((f) => {
      if (f.status === 'processing' || f.status === 'uploading') return;
      update(f.id, { options: { ...f.options, tier, quality: undefined } });
    });
  };

  // Object URLs for thumbnails are released when the page unloads.
  useEffect(
    () => () => {
      useFiles.getState().files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    },
    []
  );

  const summary = useMemo(() => {
    const done = files.filter((f) => f.status === 'done' && f.result);
    const busy = files.filter((f) => !['done', 'error', 'ready'].includes(f.status)).length;
    const before = done.reduce((s, f) => s + f.size, 0);
    const after = done.reduce((s, f) => s + (f.result?.outputSize ?? 0), 0);
    return {
      done: done.length,
      busy,
      stale: files.filter(isStale).length,
      mergeable: files.filter(isMergeable).length,
      saved: before - after,
      pct: percentChange(before, after),
    };
  }, [files]);

  const hasFiles = files.length > 0;
  const allTiersEqual = files.every((f) => f.options.tier === files[0]?.options.tier);
  const toolbarTier: Tier = hasFiles && allTiersEqual ? files[0].options.tier : defaultTier;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-[2.5rem] sm:leading-[1.1]">
          Smaller files. Nothing to fiddle with.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Compress images, video and PDFs, turn Office documents into PDFs, or merge several
          files into one PDF in the order you choose. Good defaults are chosen for you; every
          setting is still one click away.
        </p>
      </div>

      <motion.section
        // react-dropzone types its props as every HTML attribute, and the DOM
        // onDrag*/onAnimation* handler types clash with framer-motion's gesture
        // props of the same names. Dropzone never sets those, so only the types
        // disagree.
        {...(getRootProps() as HTMLMotionProps<'section'>)}
        layout
        className={cn(
          'relative rounded-[24px] border bg-white shadow-card outline-none dark:bg-zinc-900 dark:shadow-card-dark',
          hasFiles && isDragActive
            ? 'border-emerald-400 dark:border-emerald-500'
            : 'border-zinc-200/80 dark:border-zinc-800'
        )}
      >
        <input {...getInputProps()} />

        {!hasFiles ? (
          <DropHero
            onBrowse={open}
            isDragActive={isDragActive}
            isDragReject={isDragReject}
            defaultTier={defaultTier}
            onTierChange={(tier) => useFiles.getState().setDefaultTier(tier)}
          />
        ) : (
          <div className="p-3 sm:p-4">
            {/* Toolbar: what happened, and the one global control. */}
            <div className="flex flex-col gap-3 px-1 pb-3 pt-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="shrink-0 whitespace-nowrap">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {summary.busy > 0
                    ? `Working on ${plural(summary.busy, 'file')}…`
                    : summary.saved > 0
                      ? `Saved ${formatBytes(summary.saved)}`
                      : summary.done > 0
                        ? 'All done'
                        : plural(files.length, 'file')}
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500">
                  {summary.busy === 0 && summary.saved > 0 && summary.done > 0
                    ? `${summary.pct}% smaller across ${plural(summary.done, 'file')}`
                    : `${plural(files.length, 'file')}${summary.done > 0 ? ` · ${summary.done} ready` : ''}`}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <TierControl id="toolbar" size="sm" value={toolbarTier} onChange={setTierForAll} />
                <AnimatePresence initial={false}>
                  {summary.stale > 0 && (
                    <motion.div
                      key="apply"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => files.filter(isStale).forEach((f) => rerun(f.id))}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Redo {summary.stale}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
                {summary.mergeable >= 2 && (
                  <Button variant="secondary" size="sm" onClick={openMerge}>
                    <Layers className="h-3.5 w-3.5" />
                    Merge to PDF
                  </Button>
                )}
                {summary.done >= 2 && summary.busy === 0 && (
                  <Button variant="secondary" size="sm" onClick={downloadAll}>
                    <Download className="h-3.5 w-3.5" />
                    Download all
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={clearAll} aria-label="Clear all files">
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>

            {merge.status !== 'idle' && (
              <div className="mb-2">
                <MergeRow
                  merge={merge}
                  onEdit={() => setMergeOpen(true)}
                  onDownload={downloadMerged}
                  onDismiss={() => useFiles.getState().resetMerge()}
                />
              </div>
            )}

            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {files.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    onDownload={() => download(file.id)}
                    onRemove={() => remove(file.id)}
                    onRerun={(options) => rerun(file.id, options)}
                    onStart={(options) => start(file.id, options)}
                  />
                ))}
              </AnimatePresence>
            </ul>

            <div className="mt-2">
              <AddMoreStrip onBrowse={open} />
            </div>

            <AnimatePresence>
              {isDragActive && (
                <motion.div
                  key="overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-white/85 backdrop-blur-sm dark:bg-zinc-900/85"
                >
                  <div className="rounded-2xl border-2 border-dashed border-emerald-500 px-8 py-6 text-center">
                    <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      {isDragReject ? 'That type isn’t supported' : 'Drop to add'}
                    </div>
                    <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      They&apos;ll start right away with the current quality setting. Videos
                      wait for you to choose.
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.section>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        files={files}
        merge={merge}
        onChange={(updates) => useFiles.getState().setMerge(updates)}
        onRun={runMerge}
        onDownload={downloadMerged}
      />

      {!hasFiles && (
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          Up to 10 files at a time · Files are deleted from the server within an hour
        </p>
      )}
    </div>
  );
};

export default FileProcessor;
