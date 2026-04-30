'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';
import ClaimsUpload from '../components/ClaimsUpload';

type Claim = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  uploaded_at: string;
};

type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';
type FilterOption = 'all' | 'pdf' | 'image';

export default function UploadedFilesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      setLoading(false);
    }
    getUser();
  }, [router]);

  const fetchClaims = useCallback(async () => {
    if (!user) return;
    setClaimsLoading(true);
    const { data, error } = await supabase
      .from('claims')
      .select('*')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });

    if (!error && data) {
      setClaims(data);
    }
    setClaimsLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchClaims();
    }
  }, [user, fetchClaims]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  async function handleDeleteClaim(claim: Claim) {
    const confirmed = window.confirm(`Delete "${claim.file_name}"? This cannot be undone.`);
    if (!confirmed) return;

    const { error: storageError } = await supabase.storage
      .from('claims')
      .remove([claim.file_path]);

    if (storageError) {
      alert(`Failed to delete file: ${storageError.message}`);
      return;
    }

    const { error: dbError } = await supabase
      .from('claims')
      .delete()
      .eq('id', claim.id);

    if (dbError) {
      alert(`Failed to remove record: ${dbError.message}`);
      return;
    }

    fetchClaims();
  }

  async function handleViewFile(claim: Claim) {
    const { data, error } = await supabase.storage
      .from('claims')
      .createSignedUrl(claim.file_path, 60); // URL valid for 60 seconds

    if (error || !data?.signedUrl) {
      alert('Could not open file. Please try again.');
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getFileIcon(fileType: string): string {
    if (fileType === 'application/pdf') return '📄';
    if (fileType.startsWith('image/')) return '🖼️';
    return '📎';
  }

  // Apply search, filter, sort
  const filteredClaims = claims
    .filter((claim) => {
      if (filterBy === 'pdf' && claim.file_type !== 'application/pdf') return false;
      if (filterBy === 'image' && !claim.file_type.startsWith('image/')) return false;
      if (search.trim() && !claim.file_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date_desc': return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
        case 'date_asc': return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
        case 'name_asc': return a.file_name.localeCompare(b.file_name);
        case 'name_desc': return b.file_name.localeCompare(a.file_name);
        case 'size_desc': return b.file_size - a.file_size;
        case 'size_asc': return a.file_size - b.file_size;
        default: return 0;
      }
    });

  const totalSize = claims.reduce((sum, c) => sum + c.file_size, 0);

  if (loading) {
    return (
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <p>Loading your files...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="dash-layout">
      <aside className="dash-sidebar">
        <a href="/" className="logo-mark">
          <Image src="/logo.png" alt="Clarity Health logo" width={32} height={32} style={{filter: 'brightness(1.4)'}} />
          <span className="logo-text">Clarity <em>Health</em></span>
        </a>

        <div className="dash-section-label">Main</div>
        <a href="/profile" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="dash-nav-item"><div className="dash-nav-icon">🏠</div> Dashboard</div>
        </a>
        <div className="dash-nav-item"><div className="dash-nav-icon">📋</div> My Plans <span className="soon-tag">soon</span></div>
        <div className="dash-nav-item"><div className="dash-nav-icon">⚖️</div> Compare Plans <span className="soon-tag">soon</span></div>

        <div className="dash-section-label">My Data</div>
        <div className="dash-nav-item"><div className="dash-nav-icon">📄</div> Claims & Profile <span className="soon-tag">soon</span></div>
        <a href="/uploaded-files" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="dash-nav-item active"><div className="dash-nav-icon">📎</div> Uploaded Files</div>
        </a>

        <div className="dash-section-label">Account</div>
        <a href="/settings" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="dash-nav-item"><div className="dash-nav-icon">⚙️</div> Settings</div>
        </a>
        <div className="dash-nav-item"><div className="dash-nav-icon">💳</div> Billing <span className="soon-tag">soon</span></div>
        <div className="dash-nav-item"><div className="dash-nav-icon">❓</div> Help</div>

        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-avatar">{initials}</div>
            <div style={{flex: 1, minWidth: 0}}>
              <div className="dash-user-name">{firstName} {lastName}</div>
              <div className="dash-user-role">{role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="dash-logout-btn">Log Out</button>
        </div>
      </aside>

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Uploaded Files</div>
            <div className="dash-date">
              {claims.length} file{claims.length !== 1 ? 's' : ''} · {formatFileSize(totalSize)} total
            </div>
          </div>
        </div>

        {/* Upload section */}
        <div className="dash-card" style={{marginBottom: '1.5rem'}}>
          <div className="dash-card-header">
            <div className="dash-card-title">Upload new claims</div>
            <div className="dash-card-action">Drag &amp; drop or click</div>
          </div>
          <ClaimsUpload userId={user.id} onUploadComplete={fetchClaims} />
        </div>

        {/* Files section */}
        <div className="dash-card">
          <div className="dash-card-header">
            <div className="dash-card-title">All Files</div>
            <div className="dash-card-action">{filteredClaims.length} of {claims.length}</div>
          </div>

          {/* Controls row */}
          {claims.length > 0 && (
            <div style={{display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center'}}>
              <input
                type="text"
                placeholder="Search by file name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{flex: '1 1 240px', minWidth: '200px'}}
              />
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                className="form-input"
                style={{width: 'auto', minWidth: '130px'}}
              >
                <option value="all">All types</option>
                <option value="pdf">PDFs only</option>
                <option value="image">Images only</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="form-input"
                style={{width: 'auto', minWidth: '160px'}}
              >
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="name_asc">Name (A–Z)</option>
                <option value="name_desc">Name (Z–A)</option>
                <option value="size_desc">Largest first</option>
                <option value="size_asc">Smallest first</option>
              </select>
            </div>
          )}

          {/* Files list */}
          {claimsLoading ? (
            <div className="empty-state">
              <div className="empty-state-desc">Loading your files...</div>
            </div>
          ) : claims.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">No files uploaded yet</div>
              <div className="empty-state-desc">Upload your first claim above to get started.</div>
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">No matches found</div>
              <div className="empty-state-desc">Try adjusting your search or filter.</div>
            </div>
          ) : (
            <div className="files-list">
              {filteredClaims.map((claim) => (
                <div key={claim.id} className="file-row">
                  <div className="file-icon">{getFileIcon(claim.file_type)}</div>
                  <div className="file-info">
                    <div className="file-name">{claim.file_name}</div>
                    <div className="file-meta">
                      {formatFileSize(claim.file_size)} · Uploaded {formatDate(claim.uploaded_at)}
                    </div>
                  </div>
                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button
                      className="file-delete-btn"
                      onClick={() => handleViewFile(claim)}
                      style={{color: '#1e3a5f', borderColor: '#c4cdd5'}}
                    >
                      View
                    </button>
                    <button
                      className="file-delete-btn"
                      onClick={() => handleDeleteClaim(claim)}
                      aria-label={`Delete ${claim.file_name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}