'use client';

import React, { useState, useRef } from 'react';

export type FileType = 'preview-logo' | 'preview-visual' | 'custom-music' | 'custom-sfx';

export interface FileMetadata {
  url: string;
  filename: string;
  duration?: number;
}

interface FileUploadProps {
  fileType: FileType;
  projectId: string;
  onUploadComplete: (result: FileMetadata) => void;
  onUploadError?: (error: string) => void;
  onUploadStart?: (filename: string) => void;
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

// Client-side size limits (must match server FILE_CONFIGS)
const FILE_SIZE_LIMITS: Record<FileType, number> = {
  'preview-logo': 5 * 1024 * 1024,
  'preview-visual': 10 * 1024 * 1024,
  'custom-music': 50 * 1024 * 1024,
  'custom-sfx': 20 * 1024 * 1024,
};

const AUDIO_FILE_TYPES: FileType[] = ['custom-music', 'custom-sfx'];

function measureAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      resolve(audio.duration && isFinite(audio.duration) ? audio.duration : null);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    // Timeout fallback in case metadata never loads
    setTimeout(() => {
      resolve(null);
      URL.revokeObjectURL(url);
    }, 5000);
  });
}

export function FileUpload({
  fileType,
  projectId,
  onUploadComplete,
  onUploadError,
  onUploadStart,
  className = '',
  children,
  accept,
  disabled = false,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    // Client-side size validation
    const maxSize = FILE_SIZE_LIMITS[fileType];
    if (file.size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      onUploadError?.(`File too large. Maximum size: ${maxMB}MB`);
      return;
    }

    setIsUploading(true);
    onUploadStart?.(file.name);

    try {
      // Measure audio duration client-side before uploading
      let duration: number | null = null;
      if (AUDIO_FILE_TYPES.includes(fileType)) {
        duration = await measureAudioDuration(file);
      }

      // Send raw binary body with metadata in headers
      // (avoids request.formData() size limits in Next.js)
      const response = await fetch('/api/upload-asset', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Type': fileType,
          'X-Project-Id': projectId,
          'X-Filename': encodeURIComponent(file.name),
          'X-File-Size': String(file.size),
          ...(duration != null ? { 'X-Duration': String(duration) } : {}),
        },
        body: file,
      });

      if (!response.ok) {
        let errorMessage = `Upload failed (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          const text = await response.text().catch(() => '');
          if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
      }

      let result: { url: string; filename: string; fileType: string; duration?: number };
      try {
        result = await response.json();
      } catch {
        throw new Error('Invalid response from server');
      }

      onUploadComplete({
        url: result.url,
        filename: result.filename,
        duration: result.duration ?? duration ?? undefined,
      });
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
  const [uploadingFilename, setUploadingFilename] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleUploadComplete = (key: string) => (result: FileMetadata) => {
    setUploadedFiles(prev => ({ ...prev, [key]: result }));
    setIsUploading(prev => ({ ...prev, [key]: false }));
    setUploadingFilename(prev => ({ ...prev, [key]: '' }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleUploadError = (key: string) => (error: string) => {
    setErrors(prev => ({ ...prev, [key]: error }));
    setIsUploading(prev => ({ ...prev, [key]: false }));
    setUploadingFilename(prev => ({ ...prev, [key]: '' }));
  };

  const startUpload = (key: string, filename?: string) => {
    setIsUploading(prev => ({ ...prev, [key]: true }));
    setErrors(prev => ({ ...prev, [key]: '' }));
    if (filename) {
      setUploadingFilename(prev => ({ ...prev, [key]: filename }));
    }
  };

  return {
    uploadedFiles,
    isUploading,
    uploadingFilename,
    errors,
    handleUploadComplete,
    handleUploadError,
    startUpload,
  };
}
