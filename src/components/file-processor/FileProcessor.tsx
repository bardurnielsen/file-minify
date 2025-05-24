import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import FileUploader from './FileUploader';
import ProcessingOptions from './ProcessingOptions';
import ProcessingQueue from './ProcessingQueue';
import { FileItem, FileType, ProcessingOption } from '../../types';
import { useFiles } from '../../hooks/useFiles';
import { useToast } from '../ui/toaster';

const API_BASE_URL = '/api';

const FileProcessor: React.FC = () => {
  const { files, addFiles, removeFile, updateFile, clearFiles } = useFiles();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('upload');
  const [globalOptions, setGlobalOptions] = useState<ProcessingOption>({
    quality: 80,
    format: 'original',
    maxSize: 10,
  });

  const handleFilesAccepted = async (acceptedFiles: File[]) => {
    try {
      const formData = new FormData();
      acceptedFiles.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const data = await response.json();

      if (!data.success || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from server');
      }
      
      const newFiles = data.data.map((fileData: any) => {
        let type: FileType = 'other';
        if (fileData.mimetype.includes('image')) type = 'image';
        else if (fileData.mimetype.includes('video')) type = 'video';
        else if (fileData.mimetype.includes('pdf')) type = 'pdf';
        else if (fileData.mimetype.includes('word')) type = 'document';
        else if (fileData.mimetype.includes('excel')) type = 'spreadsheet';

        const originalFile = acceptedFiles.find(f => f.name === fileData.originalName);
        if (!originalFile) {
          throw new Error(`Original file not found for ${fileData.originalName}`);
        }

        return {
          id: fileData.id,
          file: originalFile,
          name: fileData.originalName,
          size: fileData.size,
          type,
          status: 'idle',
          progress: 0,
          options: { ...globalOptions },
        };
      });

      addFiles(newFiles);
      
      if (newFiles.length > 0) {
        setActiveTab('options');
        addToast({
          type: 'success',
          title: 'Files uploaded successfully',
          description: `${newFiles.length} files ready for processing`,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      addToast({
        type: 'error',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'There was an error uploading your files',
      });
    }
  };

  const handleProcessFiles = async () => {
    for (const file of files) {
      if (file.status !== 'idle') continue;

      try {
        updateFile(file.id, { status: 'processing', progress: 0 });

        // Determine endpoint based on file type and desired format
        const isConversion = (file.type === 'document' || file.type === 'spreadsheet') ||
          (file.type === 'image' && file.options.format === 'pdf');
        const endpoint = isConversion ? '/conversion' : '/compression';

        const response = await fetch(`${API_BASE_URL}${endpoint}/${file.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(file.options),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Processing failed');
        }

        const data = await response.json();
        
        updateFile(file.id, { 
          status: 'completed', 
          progress: 100,
          processedId: data.data.id,
          compressedSize: data.data.compressedSize || data.data.convertedSize,
        });

        addToast({
          type: 'success',
          title: 'File processed successfully',
          description: `${file.name} has been processed and is ready for download`,
        });
      } catch (error) {
        console.error('Processing error:', error);
        updateFile(file.id, { status: 'error', progress: 0 });
        addToast({
          type: 'error',
          title: 'Processing failed',
          description: error instanceof Error ? error.message : `Failed to process ${file.name}`,
        });
      }
    }
    
    setActiveTab('queue');
  };

  const handleDownload = async (fileId: string, processedId: string) => {
    try {
      const file = files.find(f => f.id === fileId);
      if (!file) return;

      // Determine download endpoint based on file type and format
      const isConversion = (file.type === 'document' || file.type === 'spreadsheet') ||
        (file.type === 'image' && file.options.format === 'pdf');
      const endpoint = isConversion ? '/conversion/download' : '/compression/download';

      const response = await fetch(`${API_BASE_URL}${endpoint}/${processedId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed-${file.name}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addToast({
        type: 'success',
        title: 'Download started',
        description: `${file.name} is being downloaded`,
      });
    } catch (error) {
      console.error('Download error:', error);
      addToast({
        type: 'error',
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'There was an error downloading your file',
      });
    }
  };

  const handleOptionChange = (fileId: string, options: Partial<ProcessingOption>) => {
    updateFile(fileId, { options: { ...files.find(f => f.id === fileId)?.options!, ...options } });
  };

  const handleGlobalOptionChange = (options: Partial<ProcessingOption>) => {
    const newOptions = { ...globalOptions, ...options };
    setGlobalOptions(newOptions);
    
    files.forEach(file => {
      if (file.status === 'idle') {
        updateFile(file.id, { options: newOptions });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden"
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="p-4 md:p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">
              File Compression & Conversion
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Compress and convert your files with ease. Support for images, videos, PDFs, and more.
            </p>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="options" disabled={files.length === 0}>Options</TabsTrigger>
              <TabsTrigger value="queue" disabled={files.length === 0}>Queue</TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 md:p-6">
            <TabsContent value="upload" className="mt-0">
              <FileUploader onFilesAccepted={handleFilesAccepted} />
            </TabsContent>

            <TabsContent value="options" className="mt-0">
              <ProcessingOptions 
                files={files}
                globalOptions={globalOptions}
                onOptionChange={handleOptionChange}
                onGlobalOptionChange={handleGlobalOptionChange}
                onProcess={handleProcessFiles}
              />
            </TabsContent>

            <TabsContent value="queue" className="mt-0">
              <ProcessingQueue 
                files={files}
                onRemoveFile={removeFile}
                onDownload={handleDownload}
                onClearCompleted={() => {
                  const newFiles = files.filter(file => file.status !== 'completed');
                  clearFiles();
                  addFiles(newFiles);
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default FileProcessor;