import React from 'react';
import { useFiles } from '../../hooks/useFiles';

const AUTHOR_URL = 'https://github.com/bardurnielsen';

const Footer: React.FC = () => {
  // Only the Windows build reports a version, and there the files never leave
  // the PC.
  const version = useFiles((s) => s.version);

  return (
    <footer className="py-8">
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-2 px-4 text-xs text-zinc-400 dark:text-zinc-500 sm:flex-row sm:items-start sm:px-6">
        <div className="flex flex-col items-center gap-0.5 sm:items-start">
          <span>© {new Date().getFullYear()} FileMinify · Made by Bárður Nielsen</span>
          <span>
            Need something built?{' '}
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-700 dark:decoration-zinc-600 dark:hover:text-zinc-200"
            >
              Get in touch
            </a>
          </span>
        </div>
        <span className="text-center">
          {version
            ? `FileMinify ${version} · Files are processed on this PC and deleted within an hour.`
            : 'Files are processed on our server and deleted within an hour.'}
        </span>
      </div>
    </footer>
  );
};

export default Footer;
