import React from 'react';
import Header from './Header';
import Footer from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 md:py-12">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;