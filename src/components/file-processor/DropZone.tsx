import React from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, FolderOpen, Plus } from 'lucide-react';
import { Tier } from '../../types';
import { cn } from '../../lib/format';
import TierControl from './TierControl';

interface HeroProps {
  onBrowse: () => void;
  isDragActive: boolean;
  isDragReject: boolean;
  defaultTier: Tier;
  onTierChange: (tier: Tier) => void;
}

/** The empty-state hero: the whole thing is the target. */
export const DropHero: React.FC<HeroProps> = ({
  onBrowse,
  isDragActive,
  isDragReject,
  defaultTier,
  onTierChange,
}) => (
  <div className="p-3 sm:p-4">
    <div
      onClick={onBrowse}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBrowse();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Drop files here or choose files"
      className={cn(
        'group relative flex cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-6 py-16 text-center transition-colors focus-ring sm:py-20',
        isDragReject
          ? 'border-rose-400 bg-rose-50/60 dark:border-rose-500/70 dark:bg-rose-950/20'
          : isDragActive
            ? 'border-emerald-500 bg-emerald-50/70 dark:border-emerald-400 dark:bg-emerald-950/30'
            : 'border-zinc-200 bg-zinc-50/60 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:hover:border-zinc-600'
      )}
    >
      <motion.div
        animate={isDragActive ? { y: 6, scale: 1.05 } : { y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={cn(
          'mb-6 flex h-16 w-16 items-center justify-center rounded-2xl shadow-sm transition-colors',
          isDragReject
            ? 'bg-rose-500 text-white'
            : isDragActive
              ? 'bg-emerald-500 text-white'
              : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        )}
      >
        <ArrowDown className="h-7 w-7" strokeWidth={2.25} />
      </motion.div>

      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
        {isDragReject
          ? 'That file type isn’t supported'
          : isDragActive
            ? 'Drop to start'
            : 'Drop files to make them smaller'}
      </h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Images, video, PDF and Office documents, up to 50 MB each. Sensible
        settings are picked for you. Drop several and you can also merge them
        into a single PDF.
      </p>

      <span className="mt-7 inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm transition-colors group-hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
        <FolderOpen className="h-4 w-4" />
        Choose files
      </span>
    </div>

    {/* Quiet defaults: visible, one click to change, never demanded. */}
    <div
      className="mt-3 flex flex-col items-center justify-between gap-3 px-2 py-2 text-[13px] text-zinc-500 dark:text-zinc-400 sm:flex-row"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3">
        <span>Quality</span>
        <TierControl id="defaults" size="sm" value={defaultTier} onChange={onTierChange} />
      </div>
      <span className="text-center sm:text-right">
        Formats are kept as they are · Office files become PDF
      </span>
    </div>
  </div>
);

interface AddMoreProps {
  onBrowse: () => void;
}

/** The compact strip that replaces the hero once files are present. */
export const AddMoreStrip: React.FC<AddMoreProps> = ({ onBrowse }) => (
  <button
    type="button"
    onClick={onBrowse}
    className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 focus-ring dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100"
  >
    <Plus className="h-4 w-4" />
    Add more files
    <span className="hidden text-zinc-400 dark:text-zinc-500 sm:inline">· or drop them anywhere on this card</span>
  </button>
);
