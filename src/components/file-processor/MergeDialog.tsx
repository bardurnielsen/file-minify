import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Reorder, useDragControls } from 'framer-motion';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Download,
  GripVertical,
  Layers,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { FileItem, MergeState } from '../../types';
import { formatBytes, plural, cn } from '../../lib/format';
import { isMergeable, isMergeReady, TYPE_LABEL } from '../../processing';
import { extensionOf } from '../../formats';
import { Button } from '../ui/button';

interface MergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: FileItem[];
  merge: MergeState;
  onChange: (updates: Partial<MergeState>) => void;
  onRun: () => void;
  onDownload: () => void;
}

/** What the download will actually be called. */
export const mergedFileName = (name: string) =>
  `${(name || 'merged').trim().replace(/\.pdf$/i, '') || 'merged'}.pdf`;

const move = (list: string[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const Thumb: React.FC<{ file: FileItem }> = ({ file }) =>
  file.previewUrl ? (
    <img src={file.previewUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-zinc-900/5" />
  ) : (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] font-semibold uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      {extensionOf(file.name).slice(0, 4)}
    </div>
  );

const OrderRow: React.FC<{
  file: FileItem;
  index: number;
  count: number;
  failed: boolean;
  onMove: (to: number) => void;
  onExclude: () => void;
}> = ({ file, index, count, failed, onMove, onExclude }) => {
  const controls = useDragControls();
  const ready = isMergeReady(file);
  return (
    <Reorder.Item
      value={file.id}
      dragListener={false}
      dragControls={controls}
      className={cn(
        'flex select-none items-center gap-2.5 rounded-xl border bg-white px-2 py-2 dark:bg-zinc-900',
        failed ? 'border-rose-300 dark:border-rose-800' : 'border-zinc-200/80 dark:border-zinc-800'
      )}
      whileDrag={{ scale: 1.02, boxShadow: '0 12px 32px -12px rgba(0,0,0,0.25)' }}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none rounded-md p-1 text-zinc-400 hover:text-zinc-700 active:cursor-grabbing dark:hover:text-zinc-200"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="tnum w-5 shrink-0 text-center text-xs font-medium text-zinc-400">{index + 1}</span>
      <Thumb file={file} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{file.name}</p>
        <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
          {TYPE_LABEL[file.type]} · {formatBytes(file.size)}
          {!ready && ' · still uploading'}
          {failed && <span className="text-rose-600 dark:text-rose-400"> · couldn&apos;t become a PDF</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Leave out of the merge" onClick={onExclude}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Reorder.Item>
  );
};

const MergeDialog: React.FC<MergeDialogProps> = ({ open, onOpenChange, files, merge, onChange, onRun, onDownload }) => {
  const byId = new Map(files.map((f) => [f.id, f]));
  const included = merge.order.map((id) => byId.get(id)).filter((f): f is FileItem => !!f);
  const leftOut = files.filter((f) => isMergeable(f) && !merge.order.includes(f.id));
  const unmergeable = files.filter((f) => !isMergeable(f));
  const allReady = included.every(isMergeReady);
  const canRun = included.length >= 2 && allReady && merge.status !== 'running';
  const failedFile = merge.failedFileId ? byId.get(merge.failedFileId) : undefined;

  const exclude = (id: string) =>
    onChange({ order: merge.order.filter((x) => x !== id), excluded: [...merge.excluded, id] });
  const include = (id: string) =>
    onChange({ order: [...merge.order, id], excluded: merge.excluded.filter((x) => x !== id) });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby="merge-desc"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xl outline-none data-[state=open]:animate-pop-in dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                <Layers className="h-4 w-4" />
                Merge into one PDF
              </Dialog.Title>
              <Dialog.Description id="merge-desc" className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                Pages follow this order. Drag or use the arrows to change it.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {included.length > 0 ? (
              <Reorder.Group
                axis="y"
                values={merge.order}
                onReorder={(order) => onChange({ order })}
                className="space-y-1.5"
              >
                {included.map((file, i) => (
                  <OrderRow
                    key={file.id}
                    file={file}
                    index={i}
                    count={included.length}
                    failed={merge.status === 'error' && merge.failedFileId === file.id}
                    onMove={(to) => onChange({ order: move(merge.order, i, to) })}
                    onExclude={() => exclude(file.id)}
                  />
                ))}
              </Reorder.Group>
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
                Nothing selected. Add files back from the list below.
              </p>
            )}

            {leftOut.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Left out</p>
                <ul className="mt-1.5 space-y-1">
                  {leftOut.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">{file.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => include(file.id)}>
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unmergeable.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Can&apos;t be included</p>
                <ul className="mt-1.5 space-y-1">
                  {unmergeable.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-500 dark:text-zinc-400">{file.name}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{TYPE_LABEL[file.type]} can&apos;t become a PDF</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5">
              <label htmlFor="merge-name" className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100">
                File name
              </label>
              <input
                id="merge-name"
                value={merge.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="mt-1.5 h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
          </div>

          <div className="border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
            {merge.status === 'running' && (
              <div className="mb-3">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-zinc-700 dark:text-zinc-200">
                    Converting and stitching {plural(merge.order.length, 'file')}…
                  </span>
                </div>
                <div className="indeterminate relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" />
                <p className="mt-1.5 text-xs text-zinc-400">Office documents are converted one at a time, so this can take a moment.</p>
              </div>
            )}
            {merge.status === 'done' && merge.result && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/30">
                <div className="min-w-0 text-[13px]">
                  <p className="truncate font-medium text-emerald-800 dark:text-emerald-300">{mergedFileName(merge.name)}</p>
                  <p className="tnum text-emerald-700/80 dark:text-emerald-400/80">
                    {plural(merge.result.pageCount, 'page')} from {plural(merge.result.fileCount, 'file')} · {formatBytes(merge.result.size)}
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={onDownload}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            )}
            {merge.status === 'error' && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] dark:border-rose-900/60 dark:bg-rose-950/30">
                <p className="flex items-start gap-2 text-rose-700 dark:text-rose-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {failedFile ? `Couldn't turn ${failedFile.name} into a PDF. ` : ''}
                    {merge.error}
                    {failedFile ? ' Nothing was merged.' : ''}
                  </span>
                </p>
                {failedFile && (
                  <div className="mt-2 pl-6">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        exclude(failedFile.id);
                        onRun();
                      }}
                    >
                      Leave it out and merge again
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-400">
                {included.length < 2
                  ? 'Pick at least two files.'
                  : !allReady
                    ? 'Waiting for uploads to finish.'
                    : `${plural(included.length, 'file')} in this order.`}
              </p>
              <div className="flex items-center gap-2">
                <Dialog.Close asChild>
                  <Button variant="ghost" size="sm">
                    {merge.status === 'done' ? 'Close' : 'Cancel'}
                  </Button>
                </Dialog.Close>
                <Button variant="primary" size="sm" disabled={!canRun} onClick={onRun}>
                  <Layers className="h-3.5 w-3.5" />
                  {merge.status === 'done' ? 'Merge again' : `Merge ${plural(included.length, 'file')}`}
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default MergeDialog;

/** Compact row above the file list once a merge has been started. */
export const MergeRow: React.FC<{
  merge: MergeState;
  onEdit: () => void;
  onDownload: () => void;
  onDismiss: () => void;
}> = ({ merge, onEdit, onDownload, onDismiss }) => (
  <div
    className={cn(
      'flex items-center gap-3 rounded-2xl border px-4 py-3.5 sm:gap-4 sm:px-5',
      merge.status === 'error'
        ? 'border-rose-200 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20'
        : 'border-zinc-900/15 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
    )}
  >
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
      <Layers className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{mergedFileName(merge.name)}</p>
      {merge.status === 'running' && (
        <>
          <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">Merging {plural(merge.order.length, 'file')}…</p>
          <div className="indeterminate relative mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700" />
        </>
      )}
      {merge.status === 'done' && merge.result && (
        <p className="tnum mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
          {plural(merge.result.pageCount, 'page')} from {plural(merge.result.fileCount, 'file')} · {formatBytes(merge.result.size)}
        </p>
      )}
      {merge.status === 'error' && (
        <p className="mt-0.5 text-[13px] text-rose-600 dark:text-rose-400">Merge failed - open it to see why.</p>
      )}
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {merge.status === 'done' && (
        <Button variant="primary" size="sm" onClick={onDownload}>
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Edit merge" onClick={onEdit} disabled={merge.status === 'running'}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Dismiss merge" onClick={onDismiss} disabled={merge.status === 'running'}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  </div>
);
