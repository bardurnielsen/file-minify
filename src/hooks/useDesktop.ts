import { useEffect } from 'react';
import { useFiles } from './useFiles';
import { useToast } from '../components/ui/toaster';
import { desktop } from '../lib/native';

/**
 * The desktop app's window, both ways: it saves downloads straight to the
 * Downloads folder, so the page says where each went; and it asks before
 * closing while files are still being worked on, so the page tells it when.
 * Does nothing without the bridge.
 */
export const useDesktop = () => {
  const { addToast } = useToast();
  // Queued counts: those files are about to upload or process, and closing
  // would drop them just the same.
  const busy = useFiles(
    (s) =>
      s.merge.status === 'running' ||
      s.files.some((f) => f.status === 'uploading' || f.status === 'queued' || f.status === 'processing')
  );

  useEffect(() => {
    desktop?.setBusy(busy);
  }, [busy]);

  useEffect(() => {
    if (!desktop) return;
    const bridge = desktop;
    return bridge.onDownloadSaved(({ id, name }) =>
      addToast({
        type: 'success',
        title: `Saved to Downloads: ${name}`,
        action: { label: 'Show in folder', onClick: () => void bridge.showDownload(id) },
        // Download all saves several at once: one toast, for the latest.
        key: 'download-saved',
        duration: 8000,
      })
    );
  }, [addToast]);
};
