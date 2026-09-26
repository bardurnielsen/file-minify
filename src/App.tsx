import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from './components/theme-provider';
import { ToastProvider } from './components/ui/toaster';
import Layout from './components/layout/Layout';
import FileProcessor from './components/file-processor/FileProcessor';
import HowItWorks from './components/pages/HowItWorks';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { fetchConfig, fetchUpdateStatus } from './lib/api';
import { noticePutOff } from './lib/updateNotice';
import { useFiles } from './hooks/useFiles';

function AppContent() {
  const { currentPage } = useNavigation();
  return <Layout>{currentPage === 'howitworks' ? <HowItWorks /> : <FileProcessor />}</Layout>;
}

function App() {
  // The upload limit is a server setting; ask once, keep the default otherwise.
  // The Windows build also says here whether phones may connect, its version
  // and any missing tools; knowing its version, it then asks about updates.
  useEffect(() => {
    void fetchConfig().then((config) => {
      if (!config) return;
      const store = useFiles.getState();
      store.setMaxFileBytes(config.maxFileBytes);
      store.setPhone(config.phone ?? null);
      store.setNative({ version: config.version ?? null, missingTools: config.missingTools ?? [] });
      if (!config.version) return;
      void fetchUpdateStatus().then((update) => {
        const latest = update?.available ? update.latest?.version : undefined;
        useFiles.getState().setUpdate(update, latest ? noticePutOff(latest) : false);
      });
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
