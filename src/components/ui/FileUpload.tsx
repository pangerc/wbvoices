'use client';

import React, { useState, useRef } from 'react';

export type FileType = 'preview-logo' | 'preview-visual' | 'custom-music' | 'custom-sfx';

interface FileMetadata {
  url: string;
  filename: string;
}

interface FileUploadProps {
  fileType: FileType;
  projectId: string;
  onUploadComplete: (result: FileMetadata) => void;
  onUploadError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
  accept?: string;
  disabled?: boolean;
}

const FILE_ACCEPT_TYPES = {
  'preview-logo': 'image/*',
  'preview-visual': 'image/*',
  'custom-music': 'audio/*',
  'custom-sfx': 'audio/*',
} as const;

const FILE_LABELS = {
  'preview-logo': 'Logo',
  'preview-visual': 'Visual',
  'custom-music': 'Music Track',
  'custom-sfx': 'Sound Effect',
} as const;

export function FileUpload({
  fileType,
  projectId,
  onUploadComplete,
  onUploadError,
  className = '',
  children,
  accept,
  disabled = false,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', fileType);
      formData.append('projectId', projectId);

      const response = await fetch('/api/upload-asset', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      onUploadComplete(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error('Upload error:', errorMessage);
      onUploadError?.(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const acceptType = accept || FILE_ACCEPT_TYPES[fileType];
  const label = FILE_LABELS[fileType];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptType}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />
      
      {children ? (
        <div 
          onClick={triggerFileSelect}
          className={`cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
        >
          {children}
        </div>
      ) : (
        <button
          onClick={triggerFileSelect}
          disabled={disabled || isUploading}
          className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors ${className}`}
        >
          {isUploading ? `Uploading ${label}...` : `Upload ${label}`}
        </button>
      )}
    </>
  );
}

// Hook for easier usage
export function useFileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, FileMetadata>>({});
  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleUploadComplete = (key: string) => (result: FileMetadata) => {
    setUploadedFiles(prev => ({ ...prev, [key]: result }));
    setIsUploading(prev => ({ ...prev, [key]: false }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleUploadError = (key: string) => (error: string) => {
    setErrors(prev => ({ ...prev, [key]: error }));
    setIsUploading(prev => ({ ...prev, [key]: false }));
  };

  const startUpload = (key: string) => {
    setIsUploading(prev => ({ ...prev, [key]: true }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  return {
    uploadedFiles,
    isUploading,
    errors,
    handleUploadComplete,
    handleUploadError,
    startUpload,
  };
}