import React from 'react';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from './components/theme-provider';
import { ToastProvider } from './components/ui/toaster';
import Layout from './components/layout/Layout';
import FileProcessor from './components/file-processor/FileProcessor';
import HowItWorks from './components/pages/HowItWorks';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';

function AppContent() {
  const { currentPage } = useNavigation();
  return <Layout>{currentPage === 'howitworks' ? <HowItWorks /> : <FileProcessor />}</Layout>;
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <NavigationProvider>
            <AppContent />
          </NavigationProvider>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

export default App;
