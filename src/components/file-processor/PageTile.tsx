import React from 'react';
import { RotateCw } from 'lucide-react';

/**
 * One page as a small square tile: tap it to see it larger, turn it with its
 * rotate button. The merge dialog's grid and the main list's strips share it.
 */
const PageTile: React.FC<{
  n: number;
  name: string;
  caption: string;
  width: number;
  height: number;
  thumb?: string;
  turn: number;
  onRotate: () => void;
  onOpen: () => void;
}> = ({ n, name, caption, width, height, thumb, turn, onRotate, onOpen }) => (
  <div className="min-w-0">
    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
      {thumb ? (
        <img
          src={thumb}
          alt={`Page ${n} of ${name}`}
          style={{ transform: `rotate(${turn}deg)` }}
          className="max-h-[80%] max-w-[80%] bg-white shadow-sm ring-1 ring-zinc-900/10 transition-transform"
        />
      ) : (
        <div
          aria-label={`Page ${n} of ${name}`}
          style={{ aspectRatio: `${width} / ${height}`, transform: `rotate(${turn}deg)` }}
          className="max-h-[80%] max-w-[80%] bg-white shadow-sm ring-1 ring-zinc-900/10 transition-transform"
        />
      )}
      {turn > 0 && (
        <span className="tnum absolute left-1 top-1 rounded bg-zinc-900/80 px-1 text-[10px] font-medium text-white">{turn}°</span>
      )}
      <button
        type="button"
        aria-label={`Show page ${n} of ${name} larger`}
        title="Show this page larger"
        onClick={onOpen}
        className="absolute inset-0 cursor-zoom-in rounded-lg focus-ring"
      />
      <button
        type="button"
        aria-label={`Rotate page ${n} of ${name}`}
        title="Turn this page 90°"
        onClick={onRotate}
        className="absolute bottom-1 right-1 rounded-md bg-white/90 p-1.5 text-zinc-600 shadow-sm ring-1 ring-zinc-900/10 hover:text-zinc-900 focus-ring dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:text-zinc-50"
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>
    </div>
    {caption && (
      <p className="mt-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400" title={caption}>
        {caption}
      </p>
    )}
  </div>
);

export default PageTile;
