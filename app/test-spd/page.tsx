'use client';

import { useState } from 'react';

export default function TestSpdPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setDuration(null);

    const start = Date.now();
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/rfps/extract-spd', {
        method: 'POST',
        body: formData,
      });

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      setDuration(parseFloat(elapsed));

      const data = await res.json();
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${data.error || 'Unknown error'} — ${data.message || ''}`);
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 1000, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>SPD Extraction Test</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Upload a benefits PDF. Hits <code>/api/rfps/extract-spd</code>. Throwaway test page.
      </p>

      <div style={{ marginBottom: 16 }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={loading}
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        style={{
          padding: '10px 20px',
          background: loading ? '#999' : '#1e3a5f',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: loading ? 'wait' : 'pointer',
          fontSize: 15,
        }}
      >
        {loading ? 'Extracting… (can take 30–60s)' : 'Extract benefits'}
      </button>

      {duration !== null && (
        <p style={{ marginTop: 16, color: '#666' }}>Took {duration}s</p>
      )}

      {error && (
        <div style={{ marginTop: 24, padding: 16, background: '#fee', border: '1px solid #fcc', borderRadius: 6 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Response</h2>
          <pre
            style={{
              background: '#f5f5f5',
              padding: 16,
              borderRadius: 6,
              overflow: 'auto',
              maxHeight: 600,
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}