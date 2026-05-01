'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '../supabase';

type Props = {
  userId: string;
  onUploadComplete?: () => void;
};

export default function ClaimsUpload({ userId, onUploadComplete }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const MAX_SIZE_MB = 10;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setErrorMsg('');
    setSuccessMsg('');
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setErrorMsg(`"${file.name}" is not a supported file type. Please upload PDF, JPG, or PNG files only.`);
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setErrorMsg(`"${file.name}" is too large. Max file size is ${MAX_SIZE_MB}MB.`);
        return;
      }
    }

    setUploading(true);
    let successCount = 0;
    const claimIdsToParse: string[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress(`Uploading ${i + 1} of ${fileArray.length}: ${file.name}`);

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${userId}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('claims')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        setErrorMsg(`Failed to upload "${file.name}": ${uploadError.message}`);
        setUploading(false);
        setUploadProgress('');
        return;
      }

      const { data: insertedClaim, error: dbError } = await supabase
        .from('claims')
        .insert({
          user_id: userId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
        })
        .select()
        .single();

      if (dbError) {
        setErrorMsg(`Saved "${file.name}" but failed to record it: ${dbError.message}`);
        setUploading(false);
        setUploadProgress('');
        return;
      }

      if (insertedClaim?.id) {
        claimIdsToParse.push(insertedClaim.id);
      }

      successCount++;
    }

    setUploading(false);
    setUploadProgress('');
    setSuccessMsg(`✓ ${successCount} file${successCount !== 1 ? 's' : ''} uploaded successfully`);
    if (onUploadComplete) onUploadComplete();

    // Fire-and-forget: trigger Claude parsing for each uploaded claim.
    // We don't await these — UI stays snappy. Failures are logged but don't surface to user.
    claimIdsToParse.forEach((claimId) => {
      fetch('/api/parse-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId, user_id: userId }),
      }).catch((err) => {
        console.error('Background parse failed for claim', claimId, err);
      });
    });

    setTimeout(() => setSuccessMsg(''), 4000);
  }, [userId, onUploadComplete]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="claims-upload-wrapper">
      <div
        className={`claims-dropzone ${isDragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />

        <div className="dropzone-icon">📄</div>

        {uploading ? (
          <>
            <div className="dropzone-title">Uploading...</div>
            <div className="dropzone-subtitle">{uploadProgress}</div>
          </>
        ) : (
          <>
            <div className="dropzone-title">
              {isDragging ? 'Drop your files here' : 'Upload your claims'}
            </div>
            <div className="dropzone-subtitle">
              Drag and drop, or <span className="dropzone-link">click to browse</span>
            </div>
            <div className="dropzone-hint">
              PDF, JPG, or PNG · Max {MAX_SIZE_MB}MB per file · Multiple files supported
            </div>
          </>
        )}
      </div>

      {errorMsg && <div className="upload-error">{errorMsg}</div>}
      {successMsg && <div className="upload-success">{successMsg}</div>}
    </div>
  );
}