import React from 'react';
import { FileDown } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileDown className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
            FileMinify
          </h1>
        </div>
        <nav>
          <ul className="flex space-x-6">
            <li>
              <a 
                href="#" 
                className="text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Features
              </a>
            </li>
            <li>
              <a 
                href="#" 
                className="text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                How It Works
              </a>
            </li>
            <li>
              <a 
                href="#" 
                className="text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg transition-colors"
              >
                Get Started
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;