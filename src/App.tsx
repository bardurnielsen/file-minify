import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from './components/theme-provider';
import { ToastProvider } from './components/ui/toaster';
import Layout from './components/layout/Layout';
import FileProcessor from './components/file-processor/FileProcessor';
import HowItWorks from './components/pages/HowItWorks';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { fetchConfig } from './lib/api';
import { useFiles } from './hooks/useFiles';

function AppContent() {
  const { currentPage } = useNavigation();
  return <Layout>{currentPage === 'howitworks' ? <HowItWorks /> : <FileProcessor />}</Layout>;
}

function App() {
  // The upload limit is a server setting; ask once, keep the default otherwise.
  // The Windows build also says here whether phones may connect.
  useEffect(() => {
    void fetchConfig().then((config) => {
      if (!config) return;
      useFiles.getState().setMaxFileBytes(config.maxFileBytes);
      useFiles.getState().setPhone(config.phone ?? null);
    });
  }, []);

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
