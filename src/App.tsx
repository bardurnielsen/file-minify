import React from 'react';
import { ThemeProvider } from './components/theme-provider';
import { Toaster, ToastProvider } from './components/ui/toaster';
import Layout from './components/layout/Layout';
import FileProcessor from './components/file-processor/FileProcessor';
import FeaturesTab from './components/file-processor/FeaturesTab';
import HowItWorksTab from './components/file-processor/HowItWorksTab';
import GetStartedTab from './components/file-processor/GetStartedTab';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';

function AppContent() {
  const { currentPage, setCurrentPage } = useNavigation();

  const renderPage = () => {
    switch (currentPage) {
      case 'features':
        return (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 md:p-8">
              <FeaturesTab />
            </div>
          </div>
        );
      case 'howitworks':
        return (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 md:p-8">
              <HowItWorksTab />
            </div>
          </div>
        );
      case 'getstarted':
        return (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 md:p-8">
              <GetStartedTab onSwitchToUpload={() => setCurrentPage('home')} />
            </div>
          </div>
        );
      default:
        return <FileProcessor />;
    }
  };

  return (
    <Layout>
      {renderPage()}
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <NavigationProvider>
          <AppContent />
          <Toaster />
        </NavigationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;