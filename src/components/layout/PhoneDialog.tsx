import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Smartphone, X } from 'lucide-react';
import { encode } from 'uqr';
import { Button } from '../ui/button';
import { fetchConfig } from '../../lib/api';
import { desktop } from '../../lib/native';
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

const strong = 'text-zinc-900 dark:text-zinc-100';

/**
 * "Use on your phone", in the desktop app on the PC itself: the address a
 * phone on the same Wi-Fi opens, as a QR code, and the switch that allows
 * phones at all (desktop.setPhoneAccess(); main restarts the server and
 * reloads the window, with ?phone when turned on). A browser tab on the same
 * PC has no bridge, so there it says where the switch is.
 * Asked afresh on every opening, since a router can give the PC a new address.
 */
const PhoneDialog: React.FC<PhoneDialogProps> = ({ open, onOpenChange }) => {
  const phone = useFiles((s) => s.phone);
  const [switching, setSwitching] = useState(false);
  // Making the network Private (the Public-network warning's button).
  const [privateState, setPrivateState] = useState<'idle' | 'working' | 'declined' | 'failed'>('idle');
  const makePrivate = () => {
    if (!desktop) return;
    setPrivateState('working');
    void desktop.makeNetworkPrivate().then(async (result) => {
      setPrivateState(result.ok ? 'idle' : result.problem);
      // Read afresh: when it worked, the warning goes.
      const config = await fetchConfig();
      if (config) useFiles.getState().setPhone(config.phone ?? null);
    });
  };
  const [switchFailed, setSwitchFailed] = useState(false);

  const setAccess = (on: boolean) => {
    if (!desktop) return;
    setSwitching(true);
    setSwitchFailed(false);
    desktop.setPhoneAccess(on).then(
      // Main normally reloads the window now; if it doesn't, catch up here.
      () =>
        void fetchConfig().then((config) => {
          if (config) useFiles.getState().setPhone(config.phone ?? null);
          setSwitching(false);
        }),
      () => {
        setSwitching(false);
        setSwitchFailed(true);
      }
    );
  };
  const failed = switchFailed && (
    <p role="alert" className="text-rose-600 dark:text-rose-400">
      Phone access could not be changed. Try again, or use the FileMinify icon in the notification area.
    </p>
  );

  // Asked afresh on opening, and again whenever FileMinify gets the focus back
  // while the panel is open: after making the network Private in Windows'
  // settings, the warning goes by itself.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const refresh = () =>
      void fetchConfig().then((config) => {
        if (!live || !config) return;
        useFiles.getState().setPhone(config.phone ?? null);
        // Not the desktop app, or not asked from the PC (a stray ?phone).
        if (!config.phone) onOpenChange(false);
      });
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      window.removeEventListener('focus', refresh);
    };
  }, [open, onOpenChange]);

  const [main, ...others] = phone?.urls ?? [];
  const turnOff = desktop && (
    <div className="w-full space-y-2 text-center text-xs">
      <button
        type="button"
        onClick={() => setAccess(false)}
        disabled={switching}
        className="rounded underline decoration-current/40 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-current focus-ring disabled:opacity-60 dark:hover:text-zinc-100"
      >
        {switching ? 'Turning off…' : 'Turn off phone access'}
      </button>
      {failed}
    </div>
  );

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
                {desktop ? (
                  <>
                    <Button variant="primary" onClick={() => setAccess(true)} disabled={switching}>
                      {switching && <Loader2 className="h-4 w-4 animate-spin" />}
                      {switching ? 'Turning on…' : 'Turn on phone access'}
                    </Button>
                    <p>FileMinify restarts and shows the code to scan here.</p>
                    {failed}
                  </>
                ) : (
                  <>
                    <p>
                      To turn it on, right-click the <strong className={strong}>FileMinify</strong> icon in the
                      taskbar’s notification area (the tray, by the clock) and choose{' '}
                      <strong className={strong}>Phone access</strong>.
                    </p>
                    <p>Then open this again to see the code to scan.</p>
                  </>
                )}
              </div>
            ) : !main ? (
              <div className="space-y-3">
                <p>
                  This PC isn’t connected to a network at the moment. Connect it to the Wi-Fi the phone uses,
                  then open this again.
                </p>
                {turnOff}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                {phone.publicNetwork && phone.firewall !== 'allows' && (
                  <div
                    role="alert"
                    className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    <p className="font-medium">
                      {phone.firewall === 'blocks'
                        ? 'Phones can’t connect yet: Windows treats this Wi-Fi as Public.'
                        : 'This Wi-Fi is set to Public in Windows. If phones can’t connect, that’s why.'}
                    </p>
                    {desktop ? (
                      <>
                        <p className="mt-1">
                          FileMinify can make {phone.networkName ? <strong>{phone.networkName}</strong> : 'this network'}{' '}
                          Private for you; Windows asks for permission first. Only do that on a network you trust,
                          such as your home Wi-Fi.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <button
                            type="button"
                            onClick={makePrivate}
                            disabled={privateState === 'working'}
                            className="inline-flex h-8 items-center rounded-lg bg-amber-900 px-3 text-[13px] font-medium text-amber-50 transition-colors hover:bg-amber-950 focus-ring disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950 dark:hover:bg-amber-100"
                          >
                            {privateState === 'working'
                              ? 'Waiting for Windows’ permission…'
                              : `Make ${phone.networkName ?? 'this network'} Private`}
                          </button>
                          <button
                            type="button"
                            onClick={() => void desktop?.openNetworkSettings(phone.networkKind ?? 'other')}
                            className="rounded text-xs underline decoration-current/40 underline-offset-2 hover:decoration-current focus-ring"
                          >
                            {phone.networkKind === 'wifi' ? 'Change it in Wi-Fi settings instead' : 'Change it in network settings instead'}
                          </button>
                        </div>
                        {privateState === 'declined' && (
                          <p className="mt-2">Windows’ permission was declined, so nothing changed.</p>
                        )}
                        {privateState === 'failed' && (
                          <p className="mt-2">
                            That didn’t work. In the settings, open{' '}
                            <strong>{phone.networkName ? `${phone.networkName} properties` : 'this network’s properties'}</strong>{' '}
                            and set <strong>Network profile type</strong> to <strong>Private</strong>.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1">
                        In Windows Settings, open{' '}
                        <strong>{phone.networkName ? `${phone.networkName} properties` : 'this network’s properties'}</strong>{' '}
                        and set <strong>Network profile type</strong> to <strong>Private</strong>. Only do that on a
                        network you trust, such as your home Wi-Fi.
                      </p>
                    )}
                  </div>
                )}
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
                  <p>
                    The phone must be on the same Wi-Fi as this PC, and FileMinify must be running here.
                    {desktop &&
                      ' While phone access is on, closing the window keeps it running in the notification area.'}
                  </p>
                  <p>
                    Phone can’t connect? Windows asks once whether to let{' '}
                    <strong className="text-zinc-800 dark:text-zinc-200">FileMinify</strong> through its firewall:
                    it needs <em>Private networks</em> allowed.
                  </p>
                  <p>
                    Still nothing? Windows may treat this Wi-Fi as a <em>Public</em> network, where that doesn’t
                    apply: in Windows Settings → Network &amp; internet → Wi-Fi → this network, set it to{' '}
                    <em>Private</em>.
                  </p>
                </div>
                {turnOff}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PhoneDialog;
