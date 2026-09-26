import React, { useEffect, useState } from 'react';
import { Moon, Smartphone, Sun } from 'lucide-react';
import { useNavigation } from '../../contexts/NavigationContext';
import { useTheme } from '../theme-provider';
import { cn } from '../../lib/format';
import { useFiles } from '../../hooks/useFiles';
import PhoneDialog from './PhoneDialog';

const Logo: React.FC = () => (
  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900">
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2v5m0 0L5.5 4.5M8 7l2.5-2.5" />
      <path d="M8 14V9m0 0l-2.5 2.5M8 9l2.5 2.5" />
    </svg>
  </span>
);

const useResolvedTheme = () => {
  const { theme } = useTheme();
  const [system, setSystem] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return theme === 'system' ? system : theme;
};

// The Windows launcher opens /?phone after phone access is switched on, so the
// code to scan is the first thing on screen.
const PHONE_PARAM = 'phone';

const Header: React.FC = () => {
  const { currentPage, setCurrentPage } = useNavigation();
  const { setTheme } = useTheme();
  const resolved = useResolvedTheme();
  const phone = useFiles((s) => s.phone);
  const [phoneOpen, setPhoneOpen] = useState(() =>
    new URLSearchParams(window.location.search).has(PHONE_PARAM)
  );

  // Drop ?phone from the address once read, so a reload doesn't reopen it.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PHONE_PARAM)) return;
    url.searchParams.delete(PHONE_PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/70">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setCurrentPage('home')}
          className="flex items-center gap-2.5 rounded-lg focus-ring"
          aria-label="FileMinify home"
        >
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            FileMinify
          </span>
        </button>

        <nav className="flex items-center gap-1">
          {phone && (
            <button
              type="button"
              onClick={() => setPhoneOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 focus-ring dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <Smartphone className="h-4 w-4" />
              Use on phone
            </button>
          )}
          <button
            type="button"
            onClick={() => setCurrentPage(currentPage === 'howitworks' ? 'home' : 'howitworks')}
            className={cn(
              'h-8 rounded-lg px-3 text-[13px] font-medium transition-colors focus-ring',
              currentPage === 'howitworks'
                ? 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'
            )}
          >
            How it works
          </button>
          <button
            type="button"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 focus-ring dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </nav>
      </div>
      <PhoneDialog open={phoneOpen} onOpenChange={setPhoneOpen} />
    </header>
  );
};

export default Header;
