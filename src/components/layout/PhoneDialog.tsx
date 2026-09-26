import React, { useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Smartphone, X } from 'lucide-react';
import { encode } from 'uqr';
import { Button } from '../ui/button';
import { fetchConfig } from '../../lib/api';
import { useFiles } from '../../hooks/useFiles';

/**
 * Dark on white whatever the theme: phone cameras want the contrast, and the
 * white border is the quiet zone they need to find the code.
 */
const QrCode: React.FC<{ text: string }> = ({ text }) => {
  const { d, size } = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 3 });
    let path = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) path += `M${x} ${y}h1v1h-1z`;
      })
    );
    return { d: path, size: qr.size };
  }, [text]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`QR code for ${text}`}
      shapeRendering="crispEdges"
      className="h-52 w-52 rounded-xl bg-white ring-1 ring-zinc-200 dark:ring-0"
    >
      <path d={d} fill="#18181b" />
    </svg>
  );
};

interface PhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Use on your phone", in the Windows build on the PC itself: the address a
 * phone on the same Wi-Fi opens, as a QR code, or how to allow phones at all.
 * Asked afresh on every opening, since a router can give the PC a new address.
 */
const PhoneDialog: React.FC<PhoneDialogProps> = ({ open, onOpenChange }) => {
  const phone = useFiles((s) => s.phone);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetchConfig().then((config) => {
      if (!live || !config) return;
      useFiles.getState().setPhone(config.phone ?? null);
      // Not the Windows build, or not asked from the PC (a stray ?phone).
      if (!config.phone) onOpenChange(false);
    });
    return () => {
      live = false;
    };
  }, [open, onOpenChange]);

  const [main, ...others] = phone?.urls ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby="phone-desc"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white shadow-2xl outline-none data-[state=open]:animate-pop-in dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                <Smartphone className="h-4 w-4" />
                Use on your phone
              </Dialog.Title>
              <Dialog.Description id="phone-desc" className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                {phone?.enabled
                  ? 'Scan the code with the phone’s camera, or type the address into its browser.'
                  : 'Phones on the same Wi-Fi as this PC can use FileMinify too.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="px-5 py-5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {!phone ? (
              <p>Checking…</p>
            ) : !phone.enabled ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Phone access is off.</p>
                <p>To turn it on:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open the Windows <strong className="text-zinc-900 dark:text-zinc-100">Start</strong> menu.</li>
                  <li>
                    Choose <strong className="text-zinc-900 dark:text-zinc-100">FileMinify phone access</strong> and
                    answer <strong className="text-zinc-900 dark:text-zinc-100">Yes</strong>.
                  </li>
                </ol>
                <p>FileMinify restarts and shows the code to scan here.</p>
              </div>
            ) : !main ? (
              <p>
                This PC isn’t connected to a network at the moment. Connect it to the Wi-Fi the phone uses,
                then open this again.
              </p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <QrCode text={main} />
                <p className="select-all rounded-lg bg-zinc-100 px-3 py-1.5 font-mono text-base font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50">
                  {main}
                </p>
                {others.length > 0 && (
                  <p className="text-center text-xs">
                    If that doesn’t work, this PC also answers at{' '}
                    {others.map((url, i) => (
                      <React.Fragment key={url}>
                        {i > 0 && ', '}
                        <span className="select-all font-mono text-zinc-700 dark:text-zinc-300">{url}</span>
                      </React.Fragment>
                    ))}
                    .
                  </p>
                )}
                <div className="w-full space-y-1.5 border-t border-zinc-100 pt-4 text-xs dark:border-zinc-800">
                  <p>The phone must be on the same Wi-Fi as this PC, and FileMinify must be running here.</p>
                  <p>
                    Phone can’t connect? Windows asks once whether to let{' '}
                    <strong className="text-zinc-800 dark:text-zinc-200">Node.js JavaScript Runtime</strong> through
                    its firewall: that is FileMinify, and it needs <em>Private networks</em> allowed.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PhoneDialog;
