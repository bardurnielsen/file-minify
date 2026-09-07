import React, { useState } from 'react';
import { FileItem, ProcessingOption, Tier } from '../../types';
import { formatsFor, KEEP_ORIGINAL } from '../../formats';
import { imageQualityFor, isOffice, sameRequest } from '../../processing';
import { Button } from '../ui/button';
import FormatSelector from './FormatSelector';
import OptionSlider from './OptionSlider';
import TierControl from './TierControl';

interface AdjustPanelProps {
  file: FileItem;
  onApply: (options: ProcessingOption) => void;
  onClose: () => void;
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

/**
 * Per-file controls. Only shows what the backend will actually honour for this
 * file type and route, so nothing here is a placebo.
 */
const AdjustPanel: React.FC<AdjustPanelProps> = ({ file, onApply, onClose }) => {
  const [draft, setDraft] = useState<ProcessingOption>(file.options);
  const patch = (p: Partial<ProcessingOption>) => setDraft((d) => ({ ...d, ...p }));

  const converting = isOffice(file.type) || draft.format !== KEEP_ORIGINAL.value;
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
          {isOffice(file.type) ? (
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

        {converting ? (
          <p className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            Conversions use the encoder&apos;s standard quality; the quality setting doesn&apos;t apply.
            To shrink the file in its current format, choose &ldquo;Keep format&rdquo;.
          </p>
        ) : (
          <>
            <Field
              label="Quality"
              hint={file.type === 'pdf' ? PDF_HINT[draft.tier] : undefined}
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
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={unchanged} onClick={() => onApply(draft)}>
          {file.result ? 'Apply and redo' : 'Apply'}
        </Button>
      </div>
    </div>
  );
};

export default AdjustPanel;
