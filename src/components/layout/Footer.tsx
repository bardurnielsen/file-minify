import React from 'react';

const Footer: React.FC = () => (
  <footer className="py-8">
    <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-2 px-4 text-xs text-zinc-400 dark:text-zinc-500 sm:flex-row sm:px-6">
      <span>© {new Date().getFullYear()} FileMinify</span>
      <span>Files are processed on our server and deleted within an hour.</span>
    </div>
  </footer>
);

export default Footer;
