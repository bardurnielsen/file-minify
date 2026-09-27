import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// In the desktop app's window (the preload bridge exists), app:… styles apply:
// a first screen that fits the window (tailwind.config.js).
if (window.fileminify) document.documentElement.dataset.app = 'desktop';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
