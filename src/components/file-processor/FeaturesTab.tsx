import React from 'react';
import { motion } from 'framer-motion';
import { 
  FileArchive, 
  Image, 
  Video, 
  FileText, 
  Zap,
  Shield
} from 'lucide-react';

const FeaturesTab: React.FC = () => {
  const features = [
    {
      icon: <FileArchive className="w-6 h-6" />,
      title: "PDF Compression",
      description: "Reduce PDF file sizes while maintaining quality. Perfect for email attachments and faster uploads."
    },
    {
      icon: <Image className="w-6 h-6" />,
      title: "Image Optimization",
      description: "Compress JPEG, PNG, WebP images and convert between formats. Adjustable quality settings."
    },
    {
      icon: <Video className="w-6 h-6" />,
      title: "Video Compression",
      description: "Shrink video files for easier sharing. Support for MP4, WebM, MOV, and AVI formats."
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Document Conversion",
      description: "Convert Word, Excel, and PowerPoint files to PDF format instantly."
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Batch Processing",
      description: "Process multiple files at once with customizable settings for each file."
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Secure & Private",
      description: "Files are processed locally and automatically deleted after 1 hour for your privacy."
    }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
          Powerful File Processing Features
        </h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Everything you need to compress, convert, and optimize your files with professional-grade tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start space-x-4">
              <div className="text-primary-600 dark:text-primary-400 mt-1">
                {feature.icon}
              </div>
              <div>
                <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {feature.title}
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  {feature.description}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default FeaturesTab;