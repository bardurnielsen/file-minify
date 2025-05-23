import React, { useState } from 'react';
import { Settings, Sliders, Check } from 'lucide-react';
import { FileItem, ProcessingOption } from '../../types';
import { motion } from 'framer-motion';
import OptionSlider from './OptionSlider';
import FormatSelector from './FormatSelector';

interface ProcessingOptionsProps {
  files: FileItem[];
  globalOptions: ProcessingOption;
  onOptionChange: (fileId: string, options: Partial<ProcessingOption>) => void;
  onGlobalOptionChange: (options: Partial<ProcessingOption>) => void;
  onProcess: () => void;
}

const ProcessingOptions: React.FC<ProcessingOptionsProps> = ({
  files,
  globalOptions,
  onOptionChange,
  onGlobalOptionChange,
  onProcess,
}) => {
  const [applyToAll, setApplyToAll] = useState(true);

  return (
    <div className="space-y-6">
      <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800">
        <div className="flex items-start">
          <Settings className="w-5 h-5 text-primary-600 dark:text-primary-400 mt-0.5 mr-3" />
          <div>
            <h3 className="font-medium text-primary-800 dark:text-primary-300 mb-1">
              Global Processing Options
            </h3>
            <p className="text-sm text-primary-700 dark:text-primary-400 mb-4">
              These settings will apply to all files by default. You can override them individually below.
            </p>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Quality
                </label>
                <OptionSlider 
                  value={globalOptions.quality} 
                  onChange={(value) => onGlobalOptionChange({ quality: value })}
                  min={1}
                  max={100}
                  step={1}
                />
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Lower quality, smaller size</span>
                  <span>Higher quality, larger size</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Output Format
                </label>
                <FormatSelector 
                  value={globalOptions.format}
                  onChange={(value) => onGlobalOptionChange({ format: value })}
                />
              </div>
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Max Size (MB)
                </label>
                <OptionSlider 
                  value={globalOptions.maxSize} 
                  onChange={(value) => onGlobalOptionChange({ maxSize: value })}
                  min={1}
                  max={50}
                  step={1}
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="apply-to-all"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="apply-to-all" className="ml-2 block text-sm text-slate-700 dark:text-slate-300">
                  Apply these settings to all files
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-lg text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2">
          Files to Process ({files.length})
        </h3>

        <div className="space-y-3">
          {files.map((file) => (
            <motion.div
              key={file.id}
              className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center mr-3">
                  <Sliders className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 truncate">
                  <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type}
                  </p>
                </div>
              </div>

              {!applyToAll && (
                <div className="mt-2 pl-11 space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Quality
                    </label>
                    <OptionSlider 
                      value={file.options.quality} 
                      onChange={(value) => onOptionChange(file.id, { quality: value })}
                      min={1}
                      max={100}
                      step={1}
                      size="sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Format
                    </label>
                    <FormatSelector 
                      value={file.options.format}
                      onChange={(value) => onOptionChange(file.id, { format: value })}
                      size="sm"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <motion.button
          onClick={onProcess}
          className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-medium flex items-center"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Check className="w-5 h-5 mr-2" />
          Process {files.length} Files
        </motion.button>
      </div>
    </div>
  );
};

export default ProcessingOptions;