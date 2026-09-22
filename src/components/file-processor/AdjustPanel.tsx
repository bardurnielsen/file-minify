import React, { useEffect, useState } from 'react';
import { FileItem, ProcessingOption, Tier, VideoCodec, VideoResolution } from '../../types';
import { formatsFor, KEEP_ORIGINAL } from '../../formats';
import { canUseHevc, imageQualityFor, isOffice, sameRequest } from '../../processing';
import { cn } from '../../lib/format';
import { Button } from '../ui/button';
import FormatSelector from './FormatSelector';
import OptionSlider from './OptionSlider';
import TierControl from './TierControl';

interface AdjustPanelProps {
  file: FileItem;
  onApply: (options: ProcessingOption) => void;
  onClose: () => void;
  /** The file is waiting for these settings before its first run. */
  holding?: boolean;
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="grid gap-2 sm:grid-cols-[8rem_1fr] sm:items-start sm:gap-4">
    <div className="pt-1.5">
      <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

const PDF_HINT: Record<Tier, string> = {
  small: 'Images inside the PDF are downsampled to 72 dpi - fine for screens.',
  balanced: 'Images inside the PDF are downsampled to 150 dpi - good for reading and email.',
  high: 'Images inside the PDF are kept at up to 300 dpi - safe for print.',
};

const CODECS: { value: VideoCodec; label: string }[] = [
  { value: 'h264', label: 'H.264' },
  { value: 'h265', label: 'H.265' },
];

const CODEC_HINT: Record<VideoCodec, string> = {
  h264: 'Plays everywhere.',
  h265: 'Around a quarter smaller at the same quality, but slower to encode. Some browsers and older devices can’t play it.',
};

const RESOLUTIONS: { value: VideoResolution | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'source', label: 'Original' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
];

const AUTO_RESOLUTION: Record<Tier, string> = {
  small: 'Auto: up to 720p for this quality.',
  balanced: 'Auto: up to 1080p for this quality.',
  high: 'Auto: kept at the original size for this quality.',
};

const resolutionHint = (o: ProcessingOption) => {
  if (o.resolution === 'source') return 'Kept at the original size.';
  if (o.resolution) return `Shortest side at most ${o.resolution} px. Never enlarged.`;
  return o.targetSizeMb ? 'Auto: picked to suit the target size.' : AUTO_RESOLUTION[o.tier];
};

/** A compact single-choice pill group, styled like TierControl. */
const Segmented = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="inline-flex max-w-full flex-wrap rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80"
  >
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 rounded-lg px-3 text-[13px] font-medium transition-colors focus-ring',
            active
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
          )}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

/**
 * Per-file controls. Only shows what the backend will actually honour for this
 * file type and route, so nothing here is a placebo.
 */
const AdjustPanel: React.FC<AdjustPanelProps> = ({ file, onApply, onClose, holding }) => {
  const [draft, setDraft] = useState<ProcessingOption>(file.options);
  // A held panel stays open, so follow the toolbar's "all files" tier rather
  // than quietly starting with what was set before it changed.
  useEffect(() => setDraft(file.options), [file.options]);
  const patch = (p: Partial<ProcessingOption>) => setDraft((d) => ({ ...d, ...p }));

  const office = isOffice(file.type);
  const converting = office || draft.format !== KEEP_ORIGINAL.value;
  // Office output is a PDF compressed at the chosen tier, so the tier applies.
  const tierApplies = !converting || office;
  const sizeMb = file.size / 1024 / 1024;
  const canTargetSize = file.type === 'video' && sizeMb >= 2;
  const targetMax = Math.max(1, Math.min(50, Math.ceil(sizeMb) - 1));
  const unchanged = file.result
    ? sameRequest(file.type, draft, file.result.options)
    : sameRequest(file.type, draft, file.options) && file.status !== 'error';

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/70 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-5">
      <div className="space-y-5">
        <Field label="Output" hint={converting ? 'Handled by the conversion route.' : undefined}>
          {office ? (
            <div className="pt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              PDF <span className="text-zinc-400 dark:text-zinc-500">· the only target for Office files</span>
            </div>
          ) : (
            <FormatSelector
              value={draft.format}
              options={formatsFor(file.type, file.name)}
              onChange={(format) => patch({ format })}
            />
          )}
        </Field>

        {!tierApplies ? (
          <p className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            Conversions use the encoder&apos;s standard quality; the quality setting doesn&apos;t apply.
            To shrink the file in its current format, choose &ldquo;Keep format&rdquo;.
          </p>
        ) : (
          <>
            <Field
              label="Quality"
              hint={file.type === 'pdf' || office ? PDF_HINT[draft.tier] : undefined}
            >
              <TierControl
                id={`adjust-${file.id}`}
                value={draft.tier}
                onChange={(tier) => patch({ tier, quality: undefined })}
                disabled={!!draft.targetSizeMb}
              />
            </Field>

            {file.type === 'image' && (
              <Field label="Fine-tune" hint="1 is tiny and rough, 100 is nearly lossless.">
                <div className="pt-1">
                  <OptionSlider
                    value={imageQualityFor(draft)}
                    min={1}
                    max={100}
                    onChange={(quality) => patch({ quality })}
                    aria-label="Image quality"
                  />
                </div>
              </Field>
            )}

            {file.type === 'video' && (
              <Field label="Resolution" hint={resolutionHint(draft)}>
                <Segmented
                  label="Resolution"
                  options={RESOLUTIONS}
                  value={draft.resolution ?? 'auto'}
                  onChange={(r) => patch({ resolution: r === 'auto' ? undefined : r })}
                />
              </Field>
            )}

            {canUseHevc(file.type, file.name) && (
              <Field label="Codec" hint={CODEC_HINT[draft.codec ?? 'h264']}>
                <Segmented
                  label="Video codec"
                  options={CODECS}
                  value={draft.codec ?? 'h264'}
                  onChange={(c) => patch({ codec: c === 'h264' ? undefined : c })}
                />
              </Field>
            )}

            {canTargetSize && (
              <Field
                label="Target size"
                hint="Two-pass encode aimed at a file size. Quality then follows the target."
              >
                <div className="space-y-3 pt-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100"
                      checked={!!draft.targetSizeMb}
                      onChange={(e) =>
                        patch({
                          targetSizeMb: e.target.checked
                            ? Math.max(1, Math.min(targetMax, Math.round(sizeMb / 2)))
                            : undefined,
                        })
                      }
                    />
                    Aim for a specific size instead
                  </label>
                  {draft.targetSizeMb && (
                    <OptionSlider
                      value={draft.targetSizeMb}
                      min={1}
                      max={targetMax}
                      unit="MB"
                      onChange={(targetSizeMb) => patch({ targetSizeMb })}
                      aria-label="Target size in megabytes"
                    />
                  )}
                </div>
              </Field>
            )}
          </>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        {!holding && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={!holding && unchanged}
          onClick={() => onApply(draft)}
        >
          {holding ? (converting ? 'Convert' : 'Compress') : file.result ? 'Apply and redo' : 'Apply'}
        </Button>
      </div>
    </div>
  );
};

export default AdjustPanel;
