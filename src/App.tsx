import React from 'react';
import { ThemeProvider } from './components/theme-provider';
import { Toaster, ToastProvider } from './components/ui/toaster';
import Layout from './components/layout/Layout';
import FileProcessor from './components/file-processor/FileProcessor';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Layout>
          <FileProcessor />
        </Layout>
        <Toaster />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;