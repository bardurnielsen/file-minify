import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useFiles } from '../../hooks/useFiles';
import { fetchConfig } from '../../lib/api';
import { desktop, type ToolsInstallProblem } from '../../lib/native';
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

type UpdateStep = 'idle' | 'downloading' | 'installing' | 'failed';

/**
 * The desktop app's own window: a newer release is out. "Update" downloads it,
 * showing how far it has got, then the app quits, installs it and starts
 * again (desktop.startUpdate()); "Later" and "Skip" put the notice off
 * (lib/updateNotice.ts), while the header keeps an "Update available" button.
 */
export const UpdateNotice: React.FC = () => {
  const update = useFiles((s) => s.update);
  const hidden = useFiles((s) => s.updateNoticeHidden);
  const [step, setStep] = useState<UpdateStep>('idle');
  const [percent, setPercent] = useState<number | null>(null);
  const latest = update?.available ? update.latest : undefined;
  if (!desktop || !latest || (hidden && step === 'idle')) return null;
  const bridge = desktop;

  const run = () => {
    setStep('downloading');
    setPercent(null);
    const stop = bridge.onUpdateProgress((p) => setPercent(Math.max(0, Math.min(100, Math.floor(p)))));
    bridge.startUpdate().then(
      () => {
        stop();
        setStep('installing');
      },
      () => {
        stop();
        setStep('failed');
      }
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
          Downloading FileMinify {latest.version}…{percent !== null && ` ${percent}%`}
        </span>
      ) : step === 'installing' ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Installing FileMinify {latest.version}. It opens again in a moment.
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
 * The desktop app, on the PC itself: tools FileMinify needs aren't there
 * (declined on first start, or uninstalled since). Says what won't work and,
 * in the app's own window, installs them in a window of their own
 * (desktop.installTools()); the notice goes once they're found. A browser tab
 * on the same PC has no bridge, so there it only says where to go.
 */
export const ToolsNotice: React.FC = () => {
  const missing = useFiles((s) => s.missingTools);
  const [installing, setInstalling] = useState(false);
  const [problem, setProblem] = useState<ToolsInstallProblem | null>(null);

  // While the install runs, look again every few seconds. Once its window has
  // closed, stop: what is still missing (a declined prompt, say) gets its
  // button back.
  useEffect(() => {
    if (!installing) return;
    const timer = setInterval(() => {
      void fetchConfig().then((config) => {
        if (!config?.missingTools) return;
        const { version } = useFiles.getState();
        useFiles.getState().setNative({ version, missingTools: config.missingTools });
        if (!config.installingTools) setInstalling(false);
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [installing]);

  if (missing.length === 0) return null;
  const canInstall = missing.some((t) => INSTALLABLE.includes(t));

  const install = () => {
    if (!desktop) return;
    setProblem(null);
    desktop.installTools().then(
      (result) => {
        // 'running': an install is already going; wait for it like our own.
        if (result.ok || result.problem === 'running') setInstalling(true);
        else setProblem(result.problem);
      },
      () => setProblem('failed')
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
        {problem === 'no-winget' && (
          <p className="mt-1">
            Windows’ <strong>App Installer</strong> (winget) is missing, so FileMinify can’t fetch it. Install
            App Installer from the Microsoft Store, then try again.
          </p>
        )}
        {problem === 'failed' && (
          <p className="mt-1">
            The install could not be started. Try again in a moment; the{' '}
            <button type="button" className={linkButton} onClick={() => void desktop?.openLogFolder()}>
              log
            </button>{' '}
            may say why.
          </p>
        )}
        {canInstall && !desktop && (
          <p className="mt-1">Open FileMinify’s own window to install {missing.length === 1 ? 'it' : 'them'}.</p>
        )}
      </div>
      {canInstall && desktop && !installing && (
        <Button variant="primary" size="sm" onClick={install}>
          Install {missing.length === 1 ? 'it' : 'them'}
        </Button>
      )}
    </Bar>
  );
};
