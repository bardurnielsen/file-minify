import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, animate } from 'framer-motion';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Presentation,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { FileItem, FileType, ProcessingOption } from '../../types';
import { formatBytes, percentChange, cn } from '../../lib/format';
import { describePlan, isOffice, isStale, targetFormatFor, tierLabel } from '../../processing';
import { extensionOf } from '../../formats';
import { Button } from '../ui/button';
import AdjustPanel from './AdjustPanel';

interface FileRowProps {
  file: FileItem;
  onDownload: () => void;
  onRemove: () => void;
  onRerun: (options?: ProcessingOption) => void;
  /** Release a held file (see FileItem.hold) with these settings. */
  onStart: (options: ProcessingOption) => void;
}

const TYPE_ICON: Record<FileType, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  video: Film,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  other: FileText,
};

const useElapsedSeconds = (since: number | undefined, active: boolean) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return since && active ? Math.floor((now - since) / 1000) : 0;
};

/** Counts up to the target so a result lands rather than appears. */
const CountUp: React.FC<{ to: number; suffix?: string; className?: string }> = ({
  to,
  suffix = '',
  className,
}) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const controls = animate(0, to, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [to]);
  return (
    <span className={cn('tnum', className)}>
      {value}
      {suffix}
    </span>
  );
};

/** Track = original size; the bar shrinks to the new size. The gap is what you saved. */
const SavingsBar: React.FC<{ before: number; after: number }> = ({ before, after }) => (
  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/50">
    <motion.div
      className="absolute inset-y-0 left-0 rounded-full bg-zinc-900 dark:bg-zinc-100"
      initial={{ width: '100%' }}
      animate={{ width: `${Math.max(2, Math.min(100, (after / before) * 100))}%` }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
    />
  </div>
);

const Thumb: React.FC<{ file: FileItem }> = ({ file }) => {
  const Icon = TYPE_ICON[file.type];
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-inset ring-zinc-900/5 dark:bg-zinc-800 dark:ring-white/10">
      {file.previewUrl ? (
        <img src={file.previewUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-500 dark:text-zinc-400">
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
};

const FileRow: React.FC<FileRowProps> = ({ file, onDownload, onRemove, onRerun, onStart }) => {
  const [adjusting, setAdjusting] = useState(false);
  const busy = file.status === 'uploading' || file.status === 'queued' || file.status === 'processing';
  const elapsed = useElapsedSeconds(file.startedAt, file.status === 'processing');
  const stale = isStale(file);
  const result = file.result;
  const srcExt = extensionOf(file.name).toUpperCase();
  // A held file shows its settings from the start, while it is still uploading.
  const showPanel = !!file.hold || (adjusting && !busy);

  useEffect(() => {
    if (busy) setAdjusting(false);
  }, [busy]);

  const renderStatus = () => {
    switch (file.status) {
      case 'uploading':
        return (
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-zinc-500 dark:text-zinc-400">Uploading</span>
              <span className="tnum text-zinc-500 dark:text-zinc-400">
                {Math.round(file.uploadProgress * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-900 transition-[width] duration-200 dark:bg-zinc-100"
                style={{ width: `${Math.max(2, file.uploadProgress * 100)}%` }}
              />
            </div>
          </div>
        );
      case 'ready':
        return (
          <div className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Uploaded · choose settings below, then start
          </div>
        );
      case 'queued':
        return <div className="text-[13px] text-zinc-500 dark:text-zinc-400">Waiting for a free slot…</div>;
      case 'processing':
        return (
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-zinc-700 dark:text-zinc-200">
                {describePlan(file).replace('Compress', 'Compressing').replace('Convert', 'Converting')}
              </span>
              {elapsed >= 3 && <span className="tnum text-zinc-400">{elapsed}s</span>}
            </div>
            <div className="indeterminate relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" />
            {file.type === 'video' && elapsed >= 8 && (
              <div className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                Video encoding is slow by nature - this can take a minute or two.
              </div>
            )}
          </div>
        );
      case 'error':
        return (
          <div className="flex items-start gap-2 text-[13px] text-rose-600 dark:text-rose-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{file.error ?? 'Something went wrong.'}</span>
          </div>
        );
      case 'done': {
        if (!result) return null;
        const pct = percentChange(file.size, result.outputSize);
        const outExt = result.outputFormat.toUpperCase();

        if (result.route === 'conversion') {
          const grew = pct < 0;
          return (
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
                <span className="inline-flex items-center gap-1 font-medium text-zinc-800 dark:text-zinc-100">
                  {srcExt} <span className="text-zinc-400">→</span> {outExt}
                </span>
                <span className="tnum whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {formatBytes(file.size)} → {formatBytes(result.outputSize)}
                </span>
                <span
                  className={cn(
                    'tnum whitespace-nowrap text-xs',
                    grew ? 'text-zinc-400 dark:text-zinc-500' : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {grew ? `+${Math.abs(pct)}%` : pct === 0 ? 'same size' : `−${pct}%`}
                </span>
              </div>
              {grew && (
                <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                  {isOffice(file.type)
                    ? 'PDF embeds fonts and layout, so small documents often grow a little.'
                    : 'A different format isn\u2019t always a smaller one.'}
                </div>
              )}
            </div>
          );
        }

        if (result.unchanged) {
          return (
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-sky-700 dark:text-sky-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  Already compact
                </span>
                <span className="tnum text-zinc-500 dark:text-zinc-400">{formatBytes(file.size)}</span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                <span className="hidden sm:inline">
                  Re-encoding wouldn&apos;t make it smaller, so you get the original back.
                </span>
                {result.options.tier !== 'small' && !result.options.targetSizeMb && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-200 dark:decoration-zinc-600 dark:hover:text-white"
                      onClick={() => onRerun({ ...file.options, tier: 'small', quality: undefined })}
                    >
                      Try “Smaller”
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        }

        return (
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="tnum whitespace-nowrap text-[13px] text-zinc-500 dark:text-zinc-400">
                {formatBytes(file.size)} → {formatBytes(result.outputSize)}
              </span>
              <CountUp
                to={pct}
                suffix="% smaller"
                className="whitespace-nowrap text-[13px] font-semibold text-emerald-600 dark:text-emerald-400"
              />
            </div>
            <div className="mt-1.5">
              <SavingsBar before={file.size} after={result.outputSize} />
            </div>
          </div>
        );
      }
    }
  };

  const meta = (() => {
    if (file.status === 'done' && result) {
      return null; // the status block carries the sizes
    }
    const target = targetFormatFor(file.type, file.name, file.options).toUpperCase();
    const plan = isOffice(file.type)
      ? `→ PDF · ${tierLabel(file.options.tier)}`
      : target !== srcExt
        ? `→ ${target}`
        : file.type === 'video' && file.options.targetSizeMb
          ? `≈ ${file.options.targetSizeMb} MB`
          : tierLabel(file.options.tier);
    return `${formatBytes(file.size)} · ${srcExt} · ${plan}`;
  })();

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 36 }}
      className={cn(
        'overflow-hidden rounded-2xl border bg-white transition-colors dark:bg-zinc-900',
        file.status === 'error'
          ? 'border-rose-200 dark:border-rose-900/60'
          : stale
            ? 'border-amber-300/80 dark:border-amber-700/60'
            : 'border-zinc-200/80 dark:border-zinc-800'
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3.5 sm:items-center sm:gap-4 sm:px-5">
        <Thumb file={file} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{file.name}</p>
            {stale && (
              <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                Settings changed
              </span>
            )}
          </div>
          {meta && <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">{meta}</p>}
          <div className={cn('mt-1.5', file.status === 'done' && 'sm:mt-1')}>{renderStatus()}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1 self-center">
          {file.status === 'done' && result && (
            <Button variant="primary" size="sm" onClick={onDownload} aria-label={`Download ${file.name}`}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          )}
          {file.status === 'error' && (
            <Button variant="secondary" size="sm" onClick={() => onRerun()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
          {stale && (
            <Button variant="secondary" size="sm" onClick={() => onRerun()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Redo
            </Button>
          )}
          {!busy && !file.hold && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Adjust settings"
              aria-expanded={adjusting}
              onClick={() => setAdjusting((v) => !v)}
              className={cn(adjusting && 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100')}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Remove" onClick={onRemove} disabled={file.status === 'processing'}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showPanel && (
          <motion.div
            key="adjust"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <AdjustPanel
              file={file}
              holding={!!file.hold}
              onClose={() => setAdjusting(false)}
              onApply={(options) => {
                setAdjusting(false);
                if (file.hold) onStart(options);
                else onRerun(options);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
};

export default FileRow;
