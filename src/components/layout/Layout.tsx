import React from 'react';
import Header from './Header';
import Footer from './Footer';
import { ToolsNotice, UpdateNotice } from './Notices';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative flex min-h-screen flex-col">
    {/* A soft glow behind the hero; decorative only. */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(16,185,129,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgba(16,185,129,0.09),transparent_70%)]"
    />
    <Header />
    <ToolsNotice />
    <UpdateNotice />
    <main className="mx-auto w-full max-w-3xl flex-grow px-4 pb-10 pt-10 sm:px-6 sm:pt-14">{children}</main>
    <Footer />
  </div>
);

export default Layout;
