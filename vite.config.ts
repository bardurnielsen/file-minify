import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Only `vite build` runs, inside the frontend image; there is no dev server
// setup (the app runs under Docker Compose, see CLAUDE.md).
export default defineConfig({
  plugins: [react()],
});
