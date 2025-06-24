import React from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle,
  Rocket,
  Globe,
  Shield,
  Zap,
  FileUp
} from 'lucide-react';

interface GetStartedTabProps {
  onSwitchToUpload: () => void;
}

const GetStartedTab: React.FC<GetStartedTabProps> = ({ onSwitchToUpload }) => {
  const benefits = [
    {
      icon: <Globe className="w-5 h-5" />,
      title: "Works Everywhere",
      description: "Compatible with all modern browsers. No software installation required."
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Privacy First",
      description: "Files are automatically deleted after processing. We never store your data."
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Lightning Fast",
      description: "Optimized algorithms ensure quick processing without quality loss."
    }
  ];

  const checklist = [
    "No registration or signup required",
    "100% free - no hidden costs",
    "No file size limits",
    "Batch processing support",
    "Secure HTTPS connection",
    "Works on mobile devices"
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-20 h-20 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <Rocket className="w-10 h-10 text-primary-600 dark:text-primary-400" />
        </motion.div>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Ready to Get Started?
        </h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Compress and convert your files in seconds. No signup, no fees, just powerful file processing at your fingertips.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {checklist.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="flex items-center space-x-2"
          >
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="text-slate-700 dark:text-slate-300">{item}</span>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="text-center"
      >
        <button
          onClick={onSwitchToUpload}
          className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-lg font-semibold text-lg inline-flex items-center space-x-2 transition-colors"
        >
          <FileUp className="w-5 h-5" />
          <span>Start Uploading Files</span>
        </button>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
          Click the button above or switch to the Upload tab to begin
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        {benefits.map((benefit, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
            className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 text-center"
          >
            <div className="text-primary-600 dark:text-primary-400 mb-3 flex justify-center">
              {benefit.icon}
            </div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-2">
              {benefit.title}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {benefit.description}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-6 border border-primary-100 dark:border-primary-800">
        <h4 className="font-semibold text-primary-900 dark:text-primary-300 mb-2">
          Quick Tip
        </h4>
        <p className="text-sm text-primary-800 dark:text-primary-400">
          You can drag and drop multiple files at once into the upload area. Each file can have its own compression settings, or you can apply the same settings to all files.
        </p>
      </div>
    </div>
  );
};

export default GetStartedTab;