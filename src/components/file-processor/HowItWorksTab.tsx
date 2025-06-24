import React from 'react';
import { motion } from 'framer-motion';
import { 
  Upload,
  Settings,
  Download,
  ArrowRight
} from 'lucide-react';

const HowItWorksTab: React.FC = () => {
  const steps = [
    {
      step: 1,
      title: "Upload Your Files",
      description: "Drag and drop or click to select files. Support for multiple file uploads at once.",
      icon: <Upload className="w-8 h-8" />,
      details: [
        "Support for PDFs, images, videos, and office documents",
        "Upload multiple files simultaneously",
        "No file size limits",
        "Secure upload with progress tracking"
      ]
    },
    {
      step: 2,
      title: "Choose Settings",
      description: "Select compression quality, output format, and other options for each file.",
      icon: <Settings className="w-8 h-8" />,
      details: [
        "Adjustable quality settings (1-100)",
        "Choose output formats",
        "Apply settings globally or per file",
        "Preview estimated output size"
      ]
    },
    {
      step: 3,
      title: "Download Results",
      description: "Process your files and download the optimized versions instantly.",
      icon: <Download className="w-8 h-8" />,
      details: [
        "Fast processing with real-time progress",
        "Download files individually or in batch",
        "See compression savings",
        "Files auto-delete after 1 hour"
      ]
    }
  ];

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Simple 3-Step Process
        </h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Compress and convert your files in just three easy steps. No technical knowledge required.
        </p>
      </div>

      <div className="space-y-8">
        {steps.map((step, index) => (
          <motion.div
            key={step.step}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="relative"
          >
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 flex items-center justify-center">
                    {step.icon}
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                    Step {step.step}: {step.title}
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    {step.description}
                  </p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {step.details.map((detail, detailIndex) => (
                      <li key={detailIndex} className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                        <div className="w-1.5 h-1.5 bg-primary-500 rounded-full mr-2"></div>
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className="flex justify-center my-4">
                <ArrowRight className="w-6 h-6 text-slate-400 rotate-90" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default HowItWorksTab;