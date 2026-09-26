import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useFiles } from '../../hooks/useFiles';
import { fetchConfig, installMissingTools, startUpdate } from '../../lib/api';
import { remindLater, skipVersion } from '../../lib/updateNotice';
import type { MissingTool } from '../../types';

const Bar: React.FC<{ tone: 'info' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    role="status"
    className={
      tone === 'warn'
        ? 'border-b border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100'
        : 'border-b border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100'
    }
  >
    <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-[13px] sm:px-6">
      {children}
    </div>
  </div>
);

const linkButton =
  'rounded underline decoration-current/40 underline-offset-2 transition-colors hover:decoration-current focus-ring';

type UpdateStep = 'idle' | 'downloading' | 'started' | 'failed';

/**
 * The Windows build, on the PC itself: a newer release is out. "Update"
 * fetches its setup and starts it (FileMinify closes while setup replaces it,
 * and setup offers to start it again); "Later" and "Skip" put the notice off
 * (lib/updateNotice.ts), while the header keeps an "Update available" button.
 */
export const UpdateNotice: React.FC = () => {
  const update = useFiles((s) => s.update);
  const hidden = useFiles((s) => s.updateNoticeHidden);
  const [step, setStep] = useState<UpdateStep>('idle');
  const latest = update?.available ? update.latest : undefined;
  if (!latest || (hidden && step === 'idle')) return null;

  const run = () => {
    setStep('downloading');
    startUpdate().then(
      () => setStep('started'),
      () => setStep('failed')
    );
  };
  const putOff = (how: 'later' | 'skip') => {
    if (how === 'later') remindLater(latest.version);
    else skipVersion(latest.version);
    useFiles.getState().setUpdateNoticeHidden(true);
  };

  return (
    <Bar tone="info">
      <ArrowUpCircle className="h-4 w-4 shrink-0" />
      {step === 'downloading' ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Downloading FileMinify {latest.version}…
        </span>
      ) : step === 'started' ? (
        <span>
          Setup for FileMinify {latest.version} is starting. Click through it: FileMinify closes while it updates,
          and setup starts it again at the end.
        </span>
      ) : (
        <>
          <span className="font-medium">
            {step === 'failed'
              ? 'The update could not be downloaded. Check the internet connection and try again.'
              : `FileMinify ${latest.version} is available.`}
          </span>
          <span className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={run}>
              {step === 'failed' ? 'Try again' : 'Update'}
            </Button>
            <button type="button" className={linkButton} onClick={() => putOff('later')}>
              Later
            </button>
            <button type="button" className={linkButton} onClick={() => putOff('skip')}>
              Skip this version
            </button>
            <a href={latest.notes} target="_blank" rel="noopener noreferrer" className={linkButton}>
              What’s new
            </a>
          </span>
        </>
      )}
    </Bar>
  );
};

// What each missing piece stops working, in the user's terms.
const BREAKS: Record<MissingTool, string> = {
  ffmpeg: 'FFmpeg: videos can’t be compressed or converted',
  imagemagick: 'ImageMagick: images can’t become PDFs, nor PDFs images',
  libreoffice: 'LibreOffice: Word, Excel and PowerPoint files can’t be converted',
  ghostscript: 'Ghostscript: PDFs can’t be compressed (reinstall FileMinify to restore it)',
  vcruntime: 'the Visual C++ runtime: PDFs can’t be compressed',
};
const INSTALLABLE: MissingTool[] = ['ffmpeg', 'imagemagick', 'libreoffice', 'vcruntime'];
const POLL_MS = 10_000;

/**
 * The Windows build, on the PC itself: tools FileMinify needs aren't there
 * (declined in setup, or uninstalled since). Says what won't work, and
 * installs them in a window of their own; the notice goes once they're found.
 */
export const ToolsNotice: React.FC = () => {
  const missing = useFiles((s) => s.missingTools);
  const [installing, setInstalling] = useState(false);
  const [failed, setFailed] = useState(false);

  // While the install runs, look again every few seconds.
  useEffect(() => {
    if (!installing) return;
    const timer = setInterval(() => {
      void fetchConfig().then((config) => {
        if (!config?.missingTools) return;
        const { version } = useFiles.getState();
        useFiles.getState().setNative({ version, missingTools: config.missingTools });
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [installing]);

  if (missing.length === 0) return null;
  const canInstall = missing.some((t) => INSTALLABLE.includes(t));

  const install = () => {
    setFailed(false);
    installMissingTools().then(
      () => setInstalling(true),
      () => setFailed(true)
    );
  };

  return (
    <Bar tone="warn">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {missing.length === 1 ? 'A tool FileMinify needs is missing' : 'Tools FileMinify needs are missing'}
        </p>
        <ul className="mt-0.5 list-disc pl-5">
          {missing.map((t) => (
            <li key={t}>{BREAKS[t]}</li>
          ))}
        </ul>
        {installing && (
          <p className="mt-1">
            A window shows the install. Answer <strong>Yes</strong> when Windows asks; this message goes away
            when it’s done.
          </p>
        )}
        {failed && <p className="mt-1">The install could not be started. Run FileMinify’s setup again instead.</p>}
      </div>
      {canInstall && !installing && (
        <Button variant="primary" size="sm" onClick={install}>
          Install {missing.length === 1 ? 'it' : 'them'}
        </Button>
      )}
    </Bar>
  );
};
