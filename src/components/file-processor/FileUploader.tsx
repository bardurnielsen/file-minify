import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Upload, File } from 'lucide-react';

interface FileUploaderProps {
  onFilesAccepted: (files: File[]) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFilesAccepted }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onFilesAccepted(acceptedFiles);
  }, [onFilesAccepted]);

  const { 
    getRootProps, 
    getInputProps, 
    isDragActive,
    isDragAccept,
    isDragReject
  } = useDropzone({
    onDrop,
    accept: {
      'image/*': [],
      'video/*': [],
      'application/pdf': [],
      'application/msword': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'application/vnd.ms-excel': [],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
    }
  });

  const getBorderColor = () => {
    if (isDragAccept) return 'border-success-500';
    if (isDragReject) return 'border-error-500';
    if (isDragActive) return 'border-primary-500';
    return 'border-slate-300 dark:border-slate-700';
  };

  return (
    <div className="space-y-6">
      <motion.div 
        {...getRootProps()} 
        className={`border-2 border-dashed ${getBorderColor()} rounded-lg p-8 cursor-pointer transition-colors text-center hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10`}
        whileTap={{ scale: 0.99 }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center">
          <Upload className="w-12 h-12 text-slate-400 dark:text-slate-500 mb-4" />
          
          {isDragActive ? (
            <p className="text-lg font-medium text-primary-600 dark:text-primary-400">
              Drop the files here...
            </p>
          ) : (
            <>
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                Drop files here or click to browse
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Supports PDF, images, videos, Word, and Excel files
              </p>
            </>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Images', 'Documents', 'Videos'].map((category) => (
          <motion.div 
            key={category}
            className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg flex items-center"
            whileHover={{ scale: 1.02 }}
          >
            <File className="w-6 h-6 text-primary-500 mr-3" />
            <div>
              <h3 className="font-medium text-slate-800 dark:text-slate-200">{category}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {category === 'Images' ? 'JPG, PNG, WebP, GIF' : 
                 category === 'Documents' ? 'PDF, Word, Excel' : 
                 'MP4, WebM, MOV, AVI'}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default FileUploader;