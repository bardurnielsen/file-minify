import React from 'react';
import { motion } from 'framer-motion';
import { FileCog, Download, Trash2, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { FileItem } from '../../types';
import { Progress } from './progress';

interface ProcessingQueueProps {
  files: FileItem[];
  onRemoveFile: (id: string) => void;
  onDownload: (fileId: string, processedId: string) => void;
  onClearCompleted: () => void;
}

const ProcessingQueue: React.FC<ProcessingQueueProps> = ({ 
  files, 
  onRemoveFile,
  onDownload,
  onClearCompleted
}) => {
  const completedFiles = files.filter(file => file.status === 'completed');
  const processingFiles = files.filter(file => file.status === 'processing');
  const pendingFiles = files.filter(file => file.status === 'idle');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    else return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  };

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'processing':
        return <FileCog className="w-5 h-5 text-primary-500 animate-pulse" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-error-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-lg text-slate-800 dark:text-slate-200">
          Processing Queue
        </h3>
        {completedFiles.length > 0 && (
          <button
            onClick={onClearCompleted}
            className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Clear completed
          </button>
        )}
      </div>

      <div className="space-y-6">
        {processingFiles.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Processing ({processingFiles.length})
            </h4>
            <div className="space-y-3">
              {processingFiles.map((file) => (
                <motion.div
                  key={file.id}
                  className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-800/50 flex items-center justify-center mr-3">
                      {renderStatusIcon(file.status)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatFileSize(file.size)} • {file.options.format.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                      <span>Processing...</span>
                      <span>{Math.round(file.progress)}%</span>
                    </div>
                    <Progress value={file.progress} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {completedFiles.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Completed ({completedFiles.length})
            </h4>
            <div className="space-y-3">
              {completedFiles.map((file) => {
                const savingsPercent = file.compressedSize 
                  ? Math.round((1 - (file.compressedSize / file.size)) * 100)
                  : 0;
                
                return (
                  <motion.div
                    key={file.id}
                    className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="flex items-center mb-3">
                      <div className="w-8 h-8 rounded-full bg-success-100 dark:bg-success-900/30 flex items-center justify-center mr-3">
                        {renderStatusIcon(file.status)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatFileSize(file.size)} → {formatFileSize(file.compressedSize || file.size)} 
                          {file.compressedSize && ` (${savingsPercent}% smaller)`}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        {file.processedId && (
                          <motion.button
                            onClick={() => onDownload(file.id, file.processedId!)}
                            className="p-2 text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 bg-primary-50 dark:bg-primary-900/20 rounded-md"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Download className="w-5 h-5" />
                          </motion.button>
                        )}
                        <motion.button
                          onClick={() => onRemoveFile(file.id)}
                          className="p-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Trash2 className="w-5 h-5" />
                        </motion.button>
                      </div>
                    </div>
                    
                    {file.compressedSize && savingsPercent > 0 && (
                      <div className="bg-success-50 dark:bg-success-900/20 rounded-md p-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-success-700 dark:text-success-400">
                            You saved {formatFileSize(file.size - file.compressedSize)}
                          </span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Pending ({pendingFiles.length})
            </h4>
            <div className="space-y-3">
              {pendingFiles.map((file) => (
                <motion.div
                  key={file.id}
                  className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3">
                      {renderStatusIcon(file.status)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatFileSize(file.size)} • Waiting to process
                      </p>
                    </div>
                    <motion.button
                      onClick={() => onRemoveFile(file.id)}
                      className="p-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {files.length === 0 && (
          <div className="text-center py-10">
            <FileCog className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">No files in queue</h3>
            <p className="text-slate-500 dark:text-slate-400">
              Upload some files to get started with compression
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingQueue;