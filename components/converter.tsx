'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { 
  Upload, 
  FileCheck, 
  FileX, 
  Download, 
  Loader2, 
  Archive, 
  Trash2, 
  CheckCircle2,
  AlertCircle,
  Settings2,
  BarChart3,
  ShieldCheck,
  Zap,
  ArrowRight
} from 'lucide-react';
import JSZip from 'jszip';
import { cn } from '@/lib/utils';

interface ConversionResult {
  id: string;
  originalName: string;
  newName: string;
  status: 'pending' | 'converting' | 'success' | 'error';
  errorMessage?: string;
  base64?: string;
  size?: number;
  previewUrl?: string;
}

export default function Converter() {
  const [results, setResults] = useState<ConversionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [view, setView] = useState<'home' | 'converter'>('home');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newResults: ConversionResult[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      originalName: file.name,
      newName: file.name.replace(/\.svg$/i, '.eps'),
      status: 'pending',
      previewUrl: URL.createObjectURL(file)
    }));
    setResults(prev => [...prev, ...newResults]);
    setView('converter');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/svg+xml': ['.svg'] },
    multiple: true
  });

  const clearAll = () => {
    results.forEach(r => {
      if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
    });
    setResults([]);
  };

  const removeFile = (id: string) => {
    setResults(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const processFiles = async () => {
    if (results.length === 0) return;
    setIsProcessing(true);
    setOverallProgress(0);

    const pendingItems = results.filter(r => r.status === 'pending');
    const totalPending = pendingItems.length;
    let completedCount = 0;
    
    for (const item of pendingItems) {
      setResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'converting' } : r));

      try {
        const formData = new FormData();
        const response = await fetch(item.previewUrl!);
        const blob = await response.blob();
        formData.append('files', blob, item.originalName);

        const convResponse = await fetch('/api/convert', {
          method: 'POST',
          body: formData
        });

        const contentType = convResponse.headers.get('content-type');
        if (!convResponse.ok) {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await convResponse.json();
            throw new Error(errorData.error || `Server error: ${convResponse.status}`);
          } else {
            const errorText = await convResponse.text();
            console.error('Server returned non-JSON error:', errorText.substring(0, 500));
            throw new Error(`Server returned status ${convResponse.status}. It might be a file size limit issue.`);
          }
        }

        if (!contentType || !contentType.includes('application/json')) {
          const text = await convResponse.text();
          console.error('Unexpected response format:', text.substring(0, 500));
          throw new Error('Server returned an unexpected response format (not JSON).');
        }

        const data = await convResponse.json();
        
        if (data.error) throw new Error(data.error);
        
        const result = data.results[0];
        if (result.error) {
          setResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'error', errorMessage: result.error } : r));
        } else {
          setResults(prev => prev.map(r => r.id === item.id ? { 
            ...r, 
            status: 'success', 
            base64: result.content, 
            size: result.size 
          } : r));
        }
      } catch (err: any) {
        setResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'error', errorMessage: err.message } : r));
      } finally {
        completedCount++;
        setOverallProgress(Math.round((completedCount / totalPending) * 100));
      }
    }

    setIsProcessing(false);
  };

  const downloadFile = (result: ConversionResult) => {
    if (!result.base64) return;
    const link = document.createElement('a');
    link.href = `data:application/postscript;base64,${result.base64}`;
    link.download = result.newName;
    link.click();
  };

  const downloadAllAsZip = async () => {
    const successItems = results.filter(r => r.status === 'success' && r.base64);
    if (successItems.length === 0) return;

    const zip = new JSZip();
    successItems.forEach(item => {
      const binaryString = atob(item.base64!);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      zip.file(item.newName, bytes);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'vectorconvert_pro_batch.zip';
    link.click();
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const pendingCount = results.filter(r => r.status === 'pending').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const totalSize = results.reduce((acc, r) => acc + (r.size || 0), 0);

  return (
    <div className="flex flex-col h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('home')}>
          <Image 
            src="https://i.postimg.cc/brMV7T0C/20260501-182631-8-4-300-4.jpg" 
            alt="Amirhub Logo" 
            width={40} 
            height={40}
            className="rounded shadow-sm"
            referrerPolicy="no-referrer"
            unoptimized
          />
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">Amirhub SVG to EPS</h1>
        </div>
      </header>

      {view === 'home' ? (
        <main className="flex-1 flex flex-col items-center justify-center p-8 bg-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <div className="grid grid-cols-6 gap-8 p-12">
              {Array.from({ length: 24 }).map((_, i) => (
                <ShieldCheck key={i} className="w-24 h-24 text-indigo-900" />
              ))}
            </div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl w-full text-center relative z-10"
          >
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-8">
              <Zap className="w-3.5 h-3.5" />
              Next-Gen Vector Processing
            </div>

            <div className="flex justify-center mb-8">
              <Image 
                src="https://i.postimg.cc/brMV7T0C/20260501-182631-8-4-300-4.jpg" 
                alt="Amirhub Logo Large" 
                width={120} 
                height={120}
                className="rounded-2xl shadow-2xl shadow-indigo-100"
                referrerPolicy="no-referrer"
                unoptimized
              />
            </div>
            
            <h2 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6">
              Convert SVG to EPS with <span className="text-indigo-600">Zero Quality Loss</span>
            </h2>
            
            <p className="text-xl text-slate-500 mb-10 leading-relaxed max-w-2xl mx-auto">
              Professional-grade vector conversion engine. Process batch files instantly with our lossless PostScript rendering algorithm.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => setView('converter')}
                className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 group"
              >
                Get Started Now <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </button>
              
              <div 
                {...getRootProps()}
                className="bg-white border-2 border-dashed border-slate-200 px-8 py-4 rounded-xl font-bold text-lg text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all cursor-pointer"
              >
                <input {...getInputProps()} />
                Drop Files Directly
              </div>
            </div>

            <div className="mt-16 grid grid-cols-3 gap-8">
              <div className="p-4">
                <div className="text-indigo-600 font-bold text-2xl mb-1">100%</div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Vector Preservation</div>
              </div>
              <div className="p-4">
                <div className="text-indigo-600 font-bold text-2xl mb-1">Batch</div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Parallel Processing</div>
              </div>
              <div className="p-4">
                <div className="text-indigo-600 font-bold text-2xl mb-1">Secure</div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">AES-256 Encryption</div>
              </div>
            </div>
          </motion.div>
        </main>
      ) : (
        /* Main Content Area */
        <main className="flex-1 flex gap-6 p-8 overflow-hidden min-h-0">
          {/* Left Side: Upload & Queue */}
          <section className="w-3/5 flex flex-col gap-6 overflow-hidden">
            {/* Drop Zone */}
            <div 
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer",
                isDragActive ? "border-indigo-400 bg-indigo-50/30" : "border-slate-300 bg-white hover:border-indigo-400"
              )}
            >
              <input {...getInputProps()} />
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-lg font-medium text-slate-700">Drag & drop SVG files here</p>
              <p className="text-sm text-slate-400 mt-1">Maximum 100MB per file</p>
            </div>
            {/* Queue logic continues... */}

          {/* File Queue */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm overflow-hidden min-h-0">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <h2 className="font-semibold text-slate-700">
                Conversion Queue 
                {results.length > 0 && (
                  <span className="ml-2 font-normal text-slate-400 text-sm">({results.length} items selected)</span>
                )}
              </h2>
              {results.length > 0 && (
                <button 
                  onClick={clearAll}
                  className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {results.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <FileCheck className="w-8 h-8 opacity-20" />
                  </div>
                  <p>Queue is empty. Upload SVGs to begin.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  <AnimatePresence initial={false}>
                    {results.map((result) => (
                      <motion.div 
                        key={result.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={cn(
                          "flex items-center px-6 py-4 transition-colors",
                          result.status === 'error' ? "bg-red-50/20" : "hover:bg-slate-50/50"
                        )}
                      >
                        {/* Status Icon */}
                        <div className={cn(
                          "w-10 h-10 rounded flex items-center justify-center mr-4",
                          result.status === 'success' ? "bg-emerald-50 text-emerald-600" :
                          result.status === 'error' ? "bg-red-50 text-red-600" :
                          "bg-slate-50 text-slate-400"
                        )}>
                          {result.status === 'success' ? <CheckCircle2 className="h-6 w-6" /> :
                           result.status === 'error' ? <AlertCircle className="h-6 w-6" /> :
                           result.status === 'converting' ? <Loader2 className="h-6 w-6 animate-spin" /> :
                           <FileCheck className="h-6 w-6" />}
                        </div>

                        {/* File Details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{result.originalName}</p>
                          <p className={cn(
                            "text-xs mt-0.5",
                            result.status === 'error' ? "text-red-500" : "text-slate-400"
                          )}>
                            {result.status === 'success' ? `${(result.size! / 1024 / 1024).toFixed(1)} MB • Processing Complete` :
                             result.status === 'error' ? `Error: ${result.errorMessage}` :
                             result.status === 'converting' ? "Generating precision vectors..." :
                             "Ready for conversion"}
                          </p>
                        </div>

                        {/* Actions / Info */}
                        <div className="flex items-center gap-3">
                          {result.status === 'success' && (
                            <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 rounded uppercase tracking-wider">
                              100% EPS
                            </span>
                          )}
                          
                          <div className="flex items-center gap-1">
                            {result.status === 'success' && (
                              <button 
                                onClick={() => downloadFile(result)}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => removeFile(result.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Side: Action & Settings */}
        <section className="w-2/5 flex flex-col gap-6 overflow-y-auto">
          {/* Conversion Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Summary Results
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Ready to Download</span>
                <span className="text-slate-900 font-semibold">{successCount} files ({(totalSize / 1024 / 1024).toFixed(1)} MB)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Pending Conversion</span>
                <span className="text-slate-900 font-semibold">{pendingCount} file{pendingCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Failed Items</span>
                <span className={cn("font-semibold", errorCount > 0 ? "text-red-600" : "text-slate-900")}>
                  {errorCount} file{errorCount !== 1 ? 's' : ''}
                </span>
              </div>

              {isProcessing && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2 py-2"
                >
                  <div className="flex justify-between text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    <span>Batch Progress</span>
                    <span>{overallProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <motion.div 
                      className="h-full bg-indigo-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${overallProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </motion.div>
              )}
              
              <hr className="border-slate-100" />
              
              <div className="pt-2 flex flex-col gap-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Actions</p>
                
                <button 
                  onClick={processFiles}
                  disabled={isProcessing || pendingCount === 0}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-lg font-bold shadow-md shadow-indigo-100 hover:bg-indigo-700 disabled:bg-slate-200 disabled:shadow-none transition-all active:scale-[0.98]"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                  Run Conversion
                </button>

                <button 
                  onClick={downloadAllAsZip}
                  disabled={successCount === 0}
                  className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 py-3 rounded-lg font-semibold hover:bg-slate-50 disabled:bg-white disabled:text-slate-300 disabled:border-slate-100 transition-all active:scale-[0.98]"
                >
                  <Archive className="w-5 h-5" />
                  Download .ZIP Archive
                </button>
              </div>
            </div>
          </div>

          {/* Summary Results ... */}
          
          <div className="mt-auto opacity-40 hover:opacity-100 transition-opacity">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Amirhub Security Protocol Active
              </div>
            </div>
          </div>
        </section>
      </main>
    )}

      {/* Footer Bar */}
      <footer className="px-8 py-3 bg-white border-t border-slate-200 flex justify-between items-center flex-shrink-0">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            All systems operational
          </span>
          <span className="text-xs text-slate-300">|</span>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-slate-400" /> Encryption: AES-256
          </span>
        </div>
        <div className="text-xs text-slate-400">
          Amirhub Engine v2.4.1 © 2024
        </div>
      </footer>
    </div>
  );
}
