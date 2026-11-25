import React from 'react';
import { createPortal } from 'react-dom';
import { FileItem } from '../../types';
import { mergeSourceId, pageTurn, displayName } from '../../processing';
import { useFiles } from '../../hooks/useFiles';
import { largePage } from '../../lib/pageImages';
import PageTile from './PageTile';

/** The hover box's longer side. */
const HOVER_PX = 360;
/** How long the pointer rests on a page before the box opens. */
const HOVER_DELAY_MS = 250;

interface Hover {
  page: number;
  rect: DOMRect;
}

/**
 * A page shown large beside the pointer while it rests on a tile (a mouse
 * only: a phone has no hover, and a tap opens the merge dialog's large view
 * instead). The thumbnail stands in until the server's sharper picture comes.
 */
const HoverBox: React.FC<{
  sourceId: string;
  name: string;
  hover: Hover;
  width: number;
  height: number;
  thumb?: string;
  turn: number;
}> = ({ sourceId, name, hover, width, height, thumb, turn }) => {
  // Remembered with its page, so moving to the next page shows that page's
  // thumbnail until its own picture arrives, never the previous one.
  const [loaded, setLoaded] = React.useState<{ page: number; src: string }>();
  React.useEffect(() => {
    let live = true;
    largePage(sourceId, hover.page + 1).then(
      (src) => live && setLoaded({ page: hover.page, src }),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [sourceId, hover.page]);
  const image = loaded?.page === hover.page ? loaded.src : undefined;

  // The box is sized for the page as turned; the picture inside is sized
  // unturned and rotated into it.
  const sideways = turn % 180 !== 0;
  const scale = HOVER_PX / Math.max(width, height);
  const box = { w: (sideways ? height : width) * scale, h: (sideways ? width : height) * scale };
  const gap = 12;
  const right = hover.rect.right + gap + box.w + 8 <= window.innerWidth;
  const left = right ? hover.rect.right + gap : Math.max(8, hover.rect.left - gap - box.w);
  const top = Math.min(
    Math.max(8, hover.rect.top + hover.rect.height / 2 - box.h / 2),
    window.innerHeight - box.h - 8
  );

  return createPortal(
    <div
      className="pointer-events-none fixed z-50 flex items-center justify-center rounded-xl bg-white p-1.5 shadow-2xl ring-1 ring-zinc-900/10 dark:bg-zinc-900 dark:ring-white/10"
      style={{ left, top, width: box.w + 12, height: box.h + 12 }}
    >
      {(image ?? thumb) && (
        <img
          src={image ?? thumb}
          alt={`Page ${hover.page + 1} of ${name}, enlarged`}
          style={{ width: width * scale, height: height * scale, transform: `rotate(${turn}deg)`, maxWidth: 'none' }}
          className="shrink-0 bg-white"
        />
      )}
    </div>,
    document.body
  );
};

/**
 * A file's pages under its row in the main list, as soon as they are
 * previewed: turn a sideways one straight away, before opening the merge.
 * The turns are the merge's (merge.rotation / pageRotation); the file's own
 * download is not turned, and the strip says so.
 */
const PageStrip: React.FC<{
  file: FileItem;
  onRotatePage: (page: number) => void;
  onOpenPage: (page: number) => void;
}> = ({ file, onRotatePage, onOpenPage }) => {
  const sourceId = mergeSourceId(file) ?? '';
  const preview = useFiles((s) => s.merge.previews[sourceId]);
  const merge = useFiles((s) => s.merge);
  const [hover, setHover] = React.useState<Hover | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  React.useEffect(() => {
    if (!hover) return;
    const close = () => setHover(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [hover]);

  if (!preview || preview.status !== 'ready' || !preview.pages?.length) return null;
  const pages = preview.pages;
  const name = displayName(file);
  const shown = pages.slice(0, 40);
  const hovered = hover ? pages[hover.page] : undefined;

  return (
    <div className="border-t border-zinc-100 px-4 pb-3 pt-2.5 sm:px-5 dark:border-zinc-800">
      <p className="text-[11px] text-zinc-400">
        {pages.length > 1 ? `${pages.length} pages` : 'The page'} as it will be merged · turn one with its rotate
        button; turns apply when you merge
      </p>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={`Pages of ${name}`}>
        {shown.map((page, p) => (
          <div
            key={p}
            className="w-16 shrink-0"
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return;
              const rect = e.currentTarget.getBoundingClientRect();
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => setHover({ page: p, rect }), HOVER_DELAY_MS);
            }}
            onPointerLeave={() => {
              window.clearTimeout(timer.current);
              setHover(null);
            }}
          >
            <PageTile
              n={p + 1}
              name={name}
              caption=""
              width={page.width}
              height={page.height}
              thumb={page.thumb}
              turn={pageTurn(merge, file.id, p)}
              onRotate={() => onRotatePage(p)}
              onOpen={() => {
                window.clearTimeout(timer.current);
                setHover(null);
                onOpenPage(p);
              }}
            />
          </div>
        ))}
        {pages.length > shown.length && (
          <p className="flex shrink-0 items-center px-2 text-[11px] text-zinc-400">
            +{pages.length - shown.length} more in Merge to PDF
          </p>
        )}
      </div>
      {hover && hovered && (
        <HoverBox
          sourceId={sourceId}
          name={name}
          hover={hover}
          width={hovered.width}
          height={hovered.height}
          thumb={hovered.thumb}
          turn={pageTurn(merge, file.id, hover.page)}
        />
      )}
    </div>
  );
};

export default PageStrip;
