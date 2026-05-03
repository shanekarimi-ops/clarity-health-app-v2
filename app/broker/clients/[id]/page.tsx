'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../supabase';
import BrokerSidebar from '../../../components/BrokerSidebar';
import ClaimsUpload from '../../../components/ClaimsUpload';
import { getAccountType } from '../../../lib/account';

type Client = {
  id: string;
  agency_id: string;
  assigned_broker_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  employer_name: string | null;
  member_count: number | null;
  state: string | null;
  zip: string | null;
  status: string;
  created_at: string;
};

type ClaimRow = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_at: string;
  parsed?: {
    parse_status: string | null;
    summary_text: string | null;
  } | null;
};

type RecRow = {
  id: string;
  created_at: string;
  zip_code: string | null;
  county_name: string | null;
  state: string | null;
  household_size: number | null;
  total_plans_available: number | null;
  overall_advice: string | null;
  plans: any;
};

type NoteRow = {
  id: string;
  client_id: string;
  broker_id: string;
  body: string;
  created_at: string;
};

type ActivityRow = {
  id: string;
  client_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  event_type: string;
  event_summary: string;
  metadata: any;
  created_at: string;
};

type LinkRow = {
  id: string;
  client_id: string;
  user_id: string | null;
  initiated_by: string;
  status: string;
  access_level: string;
  linked_at: string | null;
  created_at: string;
};

export default function ClientProfilePage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [user, setUser] = useState<any>(null);
  const [agencyName, setAgencyName] = useState('Your Agency');
  const [activeTab, setActiveTab] = useState<'overview' | 'documents' | 'recommendations' | 'notes' | 'activity'>('overview');
  const [notFound, setNotFound] = useState(false);

  // Documents state
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pollTimerRef = useRef<any>(null);

  // Recommendations state
  const [recs, setRecs] = useState<RecRow[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  // Activity state
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Link requests state
  const [links, setLinks] = useState<LinkRow[]>([]);

  // Run Recommendation modal state
  const [showRecModal, setShowRecModal] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [zipCode, setZipCode] = useState('');
  const [householdSize, setHouseholdSize] = useState(1);
  const [annualIncome, setAnnualIncome] = useState('');
  const [agesText, setAgesText] = useState('');
  const [usesTobacco, setUsesTobacco] = useState(false);

  // Edit Client modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmployer, setEditEmployer] = useState('');
  const [editMemberCount, setEditMemberCount] = useState(1);
  const [editState, setEditState] = useState('');
  const [editZip, setEditZip] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'pending' | 'closed'>('active');

  // Send Link Request modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState('');

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadClient();
  }, [clientId]);

  useEffect(() => {
    if (client) {
      loadClaims();
      loadRecommendations();
      loadNotes();
      loadActivity();
      loadLinks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  // Prefill rec modal household size
  useEffect(() => {
    if (showRecModal && client) {
      const mc = client.member_count || 1;
      setHouseholdSize(mc);
      if (!agesText) {
        setAgesText(Array.from({ length: mc }, () => '').join(', '));
      }
      // Prefill ZIP if client has one
      if (client.zip && !zipCode) {
        setZipCode(client.zip);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecModal, client?.id]);

  // Prefill Edit modal when opening
  useEffect(() => {
    if (showEditModal && client) {
      setEditFirstName(client.first_name || '');
      setEditLastName(client.last_name || '');
      setEditEmail(client.email || '');
      setEditPhone(client.phone || '');
      setEditEmployer(client.employer_name || '');
      setEditMemberCount(client.member_count || 1);
      setEditState(client.state || '');
      setEditZip(client.zip || '');
      setEditStatus((client.status as any) || 'active');
      setEditError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditModal, client?.id]);

  // Prefill Link modal when opening
  useEffect(() => {
    if (showLinkModal && client) {
      setLinkEmail(client.email || '');
      setLinkError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLinkModal, client?.id]);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toastMessage]);

  // Auto-refresh polling: every 5s while any claim is still parsing
  useEffect(() => {
    const anyPending = claims.some(
      (c) => !c.parsed || c.parsed.parse_status === null || c.parsed.parse_status === 'pending'
    );

    if (anyPending && client) {
      pollTimerRef.current = setTimeout(() => {
        loadClaims();
      }, 5000);
    }

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, client?.id]);

  // ===== Activity logging helper =====
  async function logActivity(eventType: string, eventSummary: string, metadata: any = null) {
    if (!user || !client) return;
    try {
      const actorName = `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim() || user.email || 'Unknown';
      await supabase.from('activity_log').insert({
        agency_id: client.agency_id,
        client_id: client.id,
        actor_user_id: user.id,
        actor_name: actorName,
        event_type: eventType,
        event_summary: eventSummary,
        metadata: metadata,
      });
      // Refresh in background — don't await
      loadActivity();
    } catch (e) {
      console.warn('Activity log failed (non-blocking):', e);
    }
  }

  async function loadClient() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    if (getAccountType(user) !== 'broker') {
      router.push('/profile');
      return;
    }

    setUser(user);

    const { data: brokerData } = await supabase
      .from('brokers')
      .select('agencies(name)')
      .eq('user_id', user.id)
      .single();

    if (brokerData?.agencies) {
      setAgencyName((brokerData.agencies as any).name || 'Your Agency');
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setClient(data as Client);
    setLoading(false);
  }

  const loadClaims = useCallback(async () => {
    if (!clientId) return;
    setClaimsLoading(true);

    const { data: claimRows, error: claimErr } = await supabase
      .from('claims')
      .select('id, file_name, file_path, file_size, file_type, uploaded_at')
      .eq('client_id', clientId)
      .order('uploaded_at', { ascending: false });

    if (claimErr || !claimRows) {
      console.error('Error loading claims:', claimErr);
      setClaims([]);
      setClaimsLoading(false);
      return;
    }

    if (claimRows.length === 0) {
      setClaims([]);
      setClaimsLoading(false);
      return;
    }

    const claimIds = claimRows.map((c) => c.id);
    const { data: parsedRows } = await supabase
      .from('claims_parsed')
      .select('claim_id, parse_status, summary_text')
      .in('claim_id', claimIds);

    const parsedMap = new Map<string, { parse_status: string | null; summary_text: string | null }>();
    (parsedRows || []).forEach((p: any) => {
      parsedMap.set(p.claim_id, {
        parse_status: p.parse_status,
        summary_text: p.summary_text,
      });
    });

    const merged: ClaimRow[] = claimRows.map((c) => ({
      ...c,
      parsed: parsedMap.get(c.id) || null,
    }));

    setClaims(merged);
    setClaimsLoading(false);
  }, [clientId]);

  const loadRecommendations = useCallback(async () => {
    if (!clientId) return;
    setRecsLoading(true);

    const { data, error } = await supabase
      .from('recommendations')
      .select('id, created_at, zip_code, county_name, state, household_size, total_plans_available, overall_advice, plans')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading recommendations:', error);
      setRecs([]);
    } else {
      setRecs((data as RecRow[]) || []);
    }
    setRecsLoading(false);
  }, [clientId]);

  const loadNotes = useCallback(async () => {
    if (!clientId) return;
    setNotesLoading(true);

    const { data, error } = await supabase
      .from('broker_notes')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading notes:', error);
      setNotes([]);
    } else {
      setNotes((data as NoteRow[]) || []);
    }
    setNotesLoading(false);
  }, [clientId]);

  const loadActivity = useCallback(async () => {
    if (!clientId) return;
    setActivityLoading(true);

    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading activity:', error);
      setActivity([]);
    } else {
      setActivity((data as ActivityRow[]) || []);
    }
    setActivityLoading(false);
  }, [clientId]);

  const loadLinks = useCallback(async () => {
    if (!clientId) return;

    const { data, error } = await supabase
      .from('client_links')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading links:', error);
      setLinks([]);
    } else {
      setLinks((data as LinkRow[]) || []);
    }
  }, [clientId]);

  async function handleDeleteClaim(claim: ClaimRow) {
    const confirmed = window.confirm(
      `Delete "${claim.file_name}"?\n\nThis will permanently remove the file and its parsed data. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(claim.id);

    try {
      if (claim.file_path) {
        const { error: storageErr } = await supabase.storage
          .from('claims')
          .remove([claim.file_path]);
        if (storageErr) {
          console.warn('Storage delete failed (will continue):', storageErr.message);
        }
      }

      const { error: parsedErr } = await supabase
        .from('claims_parsed')
        .delete()
        .eq('claim_id', claim.id);
      if (parsedErr) {
        console.warn('Parsed delete failed (will continue):', parsedErr.message);
      }

      const { error: claimErr } = await supabase
        .from('claims')
        .delete()
        .eq('id', claim.id);
      if (claimErr) {
        alert(`Could not delete document: ${claimErr.message}`);
        setDeletingId(null);
        return;
      }

      await loadClaims();
      logActivity('claim_deleted', `Deleted document "${claim.file_name}"`, {
        file_name: claim.file_name,
      });
    } catch (err: any) {
      console.error('Unexpected delete error:', err);
      alert(`Unexpected error deleting document: ${err.message || 'unknown'}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClaimUploaded() {
    await loadClaims();
    // Best-effort log — we don't have the file_name easily here, so generic.
    logActivity('claim_uploaded', 'Uploaded a new document', null);
  }

  async function handleRunRecommendation() {
    setRunError(null);

    if (!zipCode || zipCode.length < 5) {
      setRunError('Please enter a valid 5-digit ZIP code.');
      return;
    }

    const incomeNum = parseInt(annualIncome.replace(/[^0-9]/g, ''), 10);
    if (!incomeNum || incomeNum < 1000) {
      setRunError('Please enter a valid annual household income (e.g. 50000).');
      return;
    }

    const agesArr = agesText
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0 && n < 120);

    if (agesArr.length === 0) {
      setRunError('Please enter at least one age (comma-separated, e.g. "35, 33, 8").');
      return;
    }

    if (agesArr.length !== householdSize) {
      setRunError(`Household size is ${householdSize} but you entered ${agesArr.length} age${agesArr.length === 1 ? '' : 's'}. Please make them match.`);
      return;
    }

    setRunning(true);

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zipCode,
          householdSize,
          annualIncome: incomeNum,
          ages: agesArr,
          usesTobacco,
          userId: user?.id,
          clientId: client?.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setRunError(data.error || 'Could not run the recommendation. Please try again.');
        setRunning(false);
        return;
      }

      if (!data.recommendationId) {
        setRunError('Recommendation ran but failed to save. Please try again.');
        setRunning(false);
        return;
      }

      // Log the run
      const topPlanName = data.plans?.[0]?.name || 'Unknown plan';
      logActivity('recommendation_run', `Ran recommendation — top match: ${topPlanName}`, {
        recommendation_id: data.recommendationId,
        top_plan: topPlanName,
        plans_considered: data.totalPlansAvailable,
      });

      router.push(`/broker/clients/${client?.id}/recommendations/${data.recommendationId}`);
    } catch (err: any) {
      console.error('Run recommendation failed:', err);
      setRunError(err?.message || 'Unexpected error. Please try again.');
      setRunning(false);
    }
  }

  function handleOpenRecModal() {
    setRunError(null);
    setZipCode(client?.zip || '');
    setAnnualIncome('');
    setAgesText('');
    setUsesTobacco(false);
    setHouseholdSize(client?.member_count || 1);
    setShowRecModal(true);
  }

  // ===== Notes handlers =====
  async function handleAddNote() {
    if (!user || !client) return;
    const body = newNoteText.trim();
    if (!body) return;

    setPostingNote(true);

    try {
      const { error } = await supabase
        .from('broker_notes')
        .insert({
          client_id: client.id,
          broker_id: user.id,
          body: body,
        });

      if (error) {
        alert(`Could not save note: ${error.message}`);
        setPostingNote(false);
        return;
      }

      setNewNoteText('');
      await loadNotes();
      logActivity('note_added', `Added a note`, {
        note_preview: body.slice(0, 60),
      });
    } catch (err: any) {
      alert(`Unexpected error: ${err?.message || 'unknown'}`);
    } finally {
      setPostingNote(false);
    }
  }

  async function handleDeleteNote(note: NoteRow) {
    const confirmed = window.confirm('Delete this note? This cannot be undone.');
    if (!confirmed) return;

    setDeletingNoteId(note.id);

    try {
      const { error } = await supabase
        .from('broker_notes')
        .delete()
        .eq('id', note.id);

      if (error) {
        alert(`Could not delete note: ${error.message}`);
        setDeletingNoteId(null);
        return;
      }

      await loadNotes();
      logActivity('note_deleted', 'Deleted a note', null);
    } catch (err: any) {
      alert(`Unexpected error: ${err?.message || 'unknown'}`);
    } finally {
      setDeletingNoteId(null);
    }
  }

  // ===== Edit Client handler =====
  async function handleSaveClient() {
    if (!client) return;
    setEditError(null);

    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditError('First name and last name are required.');
      return;
    }

    setSavingClient(true);

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          employer_name: editEmployer.trim() || null,
          member_count: editMemberCount,
          state: editState.trim() || null,
          zip: editZip.trim() || null,
          status: editStatus,
        })
        .eq('id', client.id);

      if (error) {
        setEditError(error.message);
        setSavingClient(false);
        return;
      }

      // Reload the client to reflect changes
      const { data: refreshed } = await supabase
        .from('clients')
        .select('*')
        .eq('id', client.id)
        .single();

      if (refreshed) {
        setClient(refreshed as Client);
      }

      setShowEditModal(false);
      logActivity('client_edited', 'Updated client info', null);
    } catch (err: any) {
      setEditError(err?.message || 'Unexpected error');
    } finally {
      setSavingClient(false);
    }
  }

  // ===== Send Link Request handler =====
  async function handleSendLinkRequest() {
    if (!user || !client) return;
    setLinkError(null);

    const trimmedEmail = linkEmail.trim();
    if (!trimmedEmail) {
      setLinkError("Please enter the client's email address.");
      return;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setLinkError('Please enter a valid email address.');
      return;
    }

    // Check if there's already a pending link request
    const existingPending = links.find((l) => l.status === 'pending');
    if (existingPending) {
      setLinkError('There is already a pending link request for this client. Please wait for them to respond.');
      return;
    }

    setSendingLink(true);

    try {
      // Create the client_links row
      const { error: insertErr } = await supabase
        .from('client_links')
        .insert({
          client_id: client.id,
          user_id: null, // Will be filled when client signs up / accepts
          initiated_by: 'broker',
          status: 'pending',
          access_level: 'limited',
        });

      if (insertErr) {
        setLinkError(insertErr.message);
        setSendingLink(false);
        return;
      }

      // If the email was different from what's saved on the client, save it back
      if (client.email !== trimmedEmail) {
        await supabase
          .from('clients')
          .update({ email: trimmedEmail })
          .eq('id', client.id);

        // Refresh client locally
        setClient({ ...client, email: trimmedEmail });
      }

      // Log activity
      logActivity('link_request_sent', `Sent link request to ${trimmedEmail}`, {
        recipient_email: trimmedEmail,
      });

      // Refresh links list
      await loadLinks();

      // Close modal & show toast
      setShowLinkModal(false);
      setToastMessage('Link request created! Email delivery coming in Session 20.');
    } catch (err: any) {
      setLinkError(err?.message || 'Unexpected error. Please try again.');
    } finally {
      setSendingLink(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  function handleUploadDocClick() {
    setActiveTab('documents');
    setTimeout(() => {
      window.scrollTo({ top: 200, behavior: 'smooth' });
    }, 50);
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatRelativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return formatDate(iso);
  }

  function eventIcon(eventType: string): string {
    switch (eventType) {
      case 'claim_uploaded': return '📎';
      case 'claim_deleted': return '🗑';
      case 'recommendation_run': return '⭐';
      case 'note_added': return '📝';
      case 'note_deleted': return '🗑';
      case 'client_added': return '👤';
      case 'client_edited': return '✏️';
      case 'link_request_sent': return '🔗';
      case 'link_accepted': return '✅';
      default: return '•';
    }
  }

  function StatusBadge({ status }: { status: string | null | undefined }) {
    if (!status || status === 'pending') {
      return (
        <span style={{ ...statusBadge, background: '#fff4e0', color: '#a96a1c' }}>
          ⏳ Parsing…
        </span>
      );
    }
    if (status === 'success') {
      return (
        <span style={{ ...statusBadge, background: '#e8f0e6', color: '#5a7857' }}>
          ✓ Parsed
        </span>
      );
    }
    return (
      <span style={{ ...statusBadge, background: '#fde7e7', color: '#a44' }}>
        ✗ Failed
      </span>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar
          active="clients"
          firstName={user?.user_metadata?.first_name || ''}
          lastName={user?.user_metadata?.last_name || ''}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          Loading client...
        </div>
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
        <BrokerSidebar
          active="clients"
          firstName={user?.user_metadata?.first_name || ''}
          lastName={user?.user_metadata?.last_name || ''}
          agencyName={agencyName}
          onLogout={handleLogout}
        />
        <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
          <h1 style={{ fontFamily: 'Playfair Display, serif', color: '#1e3a5f' }}>
            Client not found
          </h1>
          <p style={{ color: '#3a4d68' }}>
            This client doesn't exist or you don't have access.
          </p>
          <Link href="/broker/clients" style={{ color: '#7a9b76', fontWeight: 600 }}>
            ← Back to clients
          </Link>
        </div>
      </div>
    );
  }

  const recentClaims = claims.slice(0, 3);
  const latestRec = recs[0] || null;
  const latestRecTopPlan = latestRec && Array.isArray(latestRec.plans) && latestRec.plans.length > 0
    ? latestRec.plans[0]
    : null;

  // Account link status
  const activeLink = links.find((l) => l.status === 'active' || l.status === 'accepted');
  const pendingLink = links.find((l) => l.status === 'pending');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#faf7f2' }}>
      <BrokerSidebar
        active="clients"
        firstName={user?.user_metadata?.first_name || ''}
        lastName={user?.user_metadata?.last_name || ''}
        agencyName={agencyName}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1, padding: '40px', fontFamily: 'Figtree, sans-serif' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '20px' }}>
          <Link
            href="/broker/clients"
            style={{ color: '#5b7a99', fontSize: '14px', textDecoration: 'none' }}
          >
            ← Back to clients
          </Link>
        </div>

        {/* Header card */}
        <div style={{
          background: 'white',
          border: '1px solid #eef1f4',
          borderRadius: '12px',
          padding: '28px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#1e3a5f',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 600,
                fontFamily: 'Playfair Display, serif',
              }}>
                {client.first_name[0]}{client.last_name[0]}
              </div>

              <div>
                <h1 style={{
                  fontFamily: 'Playfair Display, serif',
                  fontSize: '32px',
                  color: '#1e3a5f',
                  margin: 0,
                }}>
                  {client.first_name} {client.last_name}
                </h1>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {client.employer_name && (
                    <span style={{ color: '#3a4d68', fontSize: '14px' }}>
                      🏢 {client.employer_name}
                    </span>
                  )}
                  <span style={{ color: '#3a4d68', fontSize: '14px' }}>
                    👥 {client.member_count || 1} {(client.member_count || 1) === 1 ? 'member' : 'members'}
                  </span>
                  {client.state && (
                    <span style={{ color: '#3a4d68', fontSize: '14px' }}>
                      📍 {client.state}{client.zip ? ` ${client.zip}` : ''}
                    </span>
                  )}
                </div>
                {client.email && (
                  <div style={{ color: '#3a4d68', fontSize: '14px', marginTop: '6px' }}>
                    {client.email}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
                background: client.status === 'active' ? '#e8f0e6' : '#f5f5f5',
                color: client.status === 'active' ? '#5a7857' : '#666',
                textTransform: 'capitalize',
              }}>
                {client.status}
              </span>
              <button
                onClick={() => setShowEditModal(true)}
                style={editButton}
                title="Edit client"
              >
                ✏️ Edit
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
            <button style={primaryButtonActive} onClick={handleOpenRecModal}>
              Run Recommendation
            </button>
            <button style={secondaryButtonActive} onClick={handleUploadDocClick}>
              Upload Document
            </button>
            {activeLink ? (
              <button style={secondaryButtonDisabled} disabled title="Account already linked">
                ✅ Account Linked
              </button>
            ) : pendingLink ? (
              <button style={secondaryButtonDisabled} disabled title="Link request already pending">
                🔗 Link Request Pending
              </button>
            ) : (
              <button style={secondaryButtonActive} onClick={() => setShowLinkModal(true)}>
                🔗 Send Link Request
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '2px solid #eef1f4',
          marginBottom: '24px',
        }}>
          {(['overview', 'documents', 'recommendations', 'notes', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: 600,
                color: activeTab === tab ? '#1e3a5f' : '#5b7a99',
                cursor: 'pointer',
                fontFamily: 'Figtree, sans-serif',
                borderBottom: activeTab === tab ? '2px solid #7a9b76' : '2px solid transparent',
                marginBottom: '-2px',
                textTransform: 'capitalize',
              }}
            >
              {tab}
              {tab === 'documents' && claims.length > 0 && (
                <span style={countBadge}>{claims.length}</span>
              )}
              {tab === 'recommendations' && recs.length > 0 && (
                <span style={countBadge}>{recs.length}</span>
              )}
              {tab === 'notes' && notes.length > 0 && (
                <span style={countBadge}>{notes.length}</span>
              )}
              {tab === 'activity' && activity.length > 0 && (
                <span style={countBadge}>{activity.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ ...cardTitle, marginBottom: 0 }}>Latest Recommendation</h3>
                {recs.length > 0 && (
                  <button onClick={() => setActiveTab('recommendations')} style={linkButton}>
                    View all →
                  </button>
                )}
              </div>
              {!latestRec ? (
                <div style={emptyText}>
                  No recommendations yet. Click "Run Recommendation" above to generate one.
                </div>
              ) : (
                <div>
                  {latestRecTopPlan && (
                    <div style={{
                      padding: '12px',
                      background: '#faf7f2',
                      border: '1px solid #eef1f4',
                      borderRadius: '8px',
                      marginBottom: '10px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#7a9b76', fontWeight: 700, marginBottom: '4px' }}>
                        TOP MATCH
                      </div>
                      <div style={{ fontSize: '15px', color: '#1e3a5f', fontWeight: 600 }}>
                        {latestRecTopPlan.name || 'Plan'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#5b7a99', marginTop: '2px' }}>
                        {latestRecTopPlan.issuer || ''} · ${latestRecTopPlan.premiumWithCredit ?? latestRecTopPlan.premium ?? '—'}/mo
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    Run on {formatDate(latestRec.created_at)} · {latestRec.total_plans_available || 0} plans considered
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <Link
                      href={`/broker/clients/${client.id}/recommendations/${latestRec.id}`}
                      style={{ color: '#7a9b76', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
                    >
                      View full ranking →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ ...cardTitle, marginBottom: 0 }}>Recent Documents</h3>
                {claims.length > 0 && (
                  <button onClick={() => setActiveTab('documents')} style={linkButton}>
                    View all →
                  </button>
                )}
              </div>
              {recentClaims.length === 0 ? (
                <div style={emptyText}>
                  No documents uploaded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentClaims.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px',
                        background: '#faf7f2',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px',
                          color: '#1e3a5f',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          📄 {c.file_name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                          {formatDate(c.uploaded_at)}
                        </div>
                      </div>
                      <StatusBadge status={c.parsed?.parse_status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={cardTitle}>Client Info</h3>
              <div style={{ fontSize: '14px', color: '#3a4d68', lineHeight: '1.8' }}>
                <div><strong style={{ color: '#1e3a5f' }}>Name:</strong> {client.first_name} {client.last_name}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Email:</strong> {client.email || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Phone:</strong> {client.phone || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Employer:</strong> {client.employer_name || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Members:</strong> {client.member_count || 1}</div>
                <div><strong style={{ color: '#1e3a5f' }}>State:</strong> {client.state || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>ZIP:</strong> {client.zip || '—'}</div>
                <div><strong style={{ color: '#1e3a5f' }}>Added:</strong> {new Date(client.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardTitle}>Account Link</h3>
              {activeLink ? (
                <div>
                  <div style={{
                    padding: '12px',
                    background: '#e8f0e6',
                    border: '1px solid #c5d8c0',
                    borderRadius: '8px',
                    marginBottom: '10px',
                  }}>
                    <div style={{ fontSize: '13px', color: '#5a7857', fontWeight: 700, marginBottom: '4px' }}>
                      ✅ ACCOUNT LINKED
                    </div>
                    <div style={{ fontSize: '12px', color: '#3a4d68' }}>
                      Linked on {activeLink.linked_at ? formatDate(activeLink.linked_at) : formatDate(activeLink.created_at)}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                  You have {activeLink.access_level || 'limited'} access to this client's data.
                  </div>
                </div>
              ) : pendingLink ? (
                <div>
                  <div style={{
                    padding: '12px',
                    background: '#fff4e0',
                    border: '1px solid #f0d8a8',
                    borderRadius: '8px',
                    marginBottom: '10px',
                  }}>
                    <div style={{ fontSize: '13px', color: '#a96a1c', fontWeight: 700, marginBottom: '4px' }}>
                      🔗 LINK REQUEST PENDING
                    </div>
                    <div style={{ fontSize: '12px', color: '#3a4d68' }}>
                      Sent {formatRelativeTime(pendingLink.created_at)} · Waiting for client to accept
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    Email delivery coming in Session 20. For now, the request is logged in the database and will activate once the client accepts.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={emptyText}>
                    Not linked to an Individual account yet. Send a link request to connect their data.
                  </div>
                  <button
                    onClick={() => setShowLinkModal(true)}
                    style={{ ...primaryButtonActive, marginTop: '12px' }}
                  >
                    🔗 Send Link Request
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={cardStyle}>
              <h3 style={{ ...cardTitle, marginBottom: '6px' }}>
                Upload claims for {client.first_name}
              </h3>
              <div style={{ color: '#5b7a99', fontSize: '13px', marginBottom: '18px' }}>
                Drop in EOBs, claims, or medical statements. We'll auto-parse them with AI.
              </div>
              {user && (
                <ClaimsUpload
                  userId={user.id}
                  clientId={client.id}
                  onUploadComplete={handleClaimUploaded}
                />
              )}
            </div>

            <div style={cardStyle}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}>
                <h3 style={{ ...cardTitle, marginBottom: 0 }}>
                  Uploaded Documents ({claims.length})
                </h3>
                <button onClick={loadClaims} style={linkButton} disabled={claimsLoading}>
                  {claimsLoading ? 'Refreshing...' : '↻ Refresh'}
                </button>
              </div>

              {claims.length === 0 ? (
                <div style={emptyText}>
                  No documents uploaded yet. Use the upload area above to get started.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {claims.map((c) => {
                    const isDeleting = deletingId === c.id;
                    return (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '14px 16px',
                          background: '#faf7f2',
                          border: '1px solid #eef1f4',
                          borderRadius: '8px',
                          opacity: isDeleting ? 0.5 : 1,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '14px',
                            color: '#1e3a5f',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            📄 {c.file_name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#5b7a99', marginTop: '4px' }}>
                            {formatDate(c.uploaded_at)} · {formatFileSize(c.file_size)}
                          </div>
                          {c.parsed?.summary_text && (
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '6px', fontStyle: 'italic' }}>
                              {c.parsed.summary_text}
                            </div>
                          )}
                        </div>
                        <div style={{ marginLeft: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <StatusBadge status={c.parsed?.parse_status} />
                          <button
                            onClick={() => handleDeleteClaim(c)}
                            disabled={isDeleting}
                            style={deleteButton}
                            title="Delete document"
                          >
                            {isDeleting ? 'Deleting…' : '🗑'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'recommendations' && (
          <div style={cardStyle}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <h3 style={{ ...cardTitle, marginBottom: 0 }}>
                Recommendation History ({recs.length})
              </h3>
              <button onClick={handleOpenRecModal} style={primaryButtonActive}>
                + New Recommendation
              </button>
            </div>

            {recsLoading ? (
              <div style={emptyText}>Loading...</div>
            ) : recs.length === 0 ? (
              <div style={emptyText}>
                No recommendations have been run for this client yet. Click "New Recommendation" above to generate the first one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recs.map((r) => {
                  const topPlan = Array.isArray(r.plans) && r.plans.length > 0 ? r.plans[0] : null;
                  return (
                    <Link
                      key={r.id}
                      href={`/broker/clients/${client.id}/recommendations/${r.id}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '16px',
                        background: '#faf7f2',
                        border: '1px solid #eef1f4',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7a9b76'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#eef1f4'; }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', color: '#1e3a5f', fontWeight: 600 }}>
                            {topPlan ? topPlan.name : 'Recommendation'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#5b7a99', marginTop: '4px' }}>
                            {topPlan && topPlan.issuer ? `${topPlan.issuer} · ` : ''}
                            ${topPlan?.premiumWithCredit ?? topPlan?.premium ?? '—'}/mo · 
                            {' '}{r.total_plans_available || 0} plans considered · 
                            {' '}{r.zip_code ? `ZIP ${r.zip_code}` : ''}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                            Run on {formatDate(r.created_at)}
                          </div>
                        </div>
                        <div style={{ color: '#7a9b76', fontWeight: 600, fontSize: '13px', marginLeft: '16px' }}>
                          View →
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={cardStyle}>
              <h3 style={{ ...cardTitle, marginBottom: '6px' }}>
                Add a Note
              </h3>
              <div style={{ color: '#5b7a99', fontSize: '13px', marginBottom: '14px' }}>
                Internal only — never shown to the client. Use for advisor reminders, quick context, or follow-up items.
              </div>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="What's on your mind?"
                rows={4}
                disabled={postingNote}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #eef1f4',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Figtree, sans-serif',
                  color: '#1e3a5f',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  onClick={handleAddNote}
                  disabled={postingNote || !newNoteText.trim()}
                  style={{
                    ...primaryButtonActive,
                    opacity: postingNote || !newNoteText.trim() ? 0.5 : 1,
                    cursor: postingNote || !newNoteText.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {postingNote ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={cardTitle}>
                Notes ({notes.length})
              </h3>
              {notesLoading ? (
                <div style={emptyText}>Loading...</div>
              ) : notes.length === 0 ? (
                <div style={emptyText}>
                  No notes yet. Add one above to get started.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {notes.map((n) => {
                    const isDeletingThis = deletingNoteId === n.id;
                    return (
                      <div
                        key={n.id}
                        style={{
                          padding: '16px',
                          background: '#faf7f2',
                          border: '1px solid #eef1f4',
                          borderRadius: '8px',
                          opacity: isDeletingThis ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          color: '#1e3a5f',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {n.body}
                        </div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '12px',
                          paddingTop: '10px',
                          borderTop: '1px solid #eef1f4',
                        }}>
                          <div style={{ fontSize: '11px', color: '#888' }}>
                            {formatRelativeTime(n.created_at)} · {formatDate(n.created_at)}
                          </div>
                          <button
                            onClick={() => handleDeleteNote(n)}
                            disabled={isDeletingThis}
                            style={deleteButton}
                          >
                            {isDeletingThis ? 'Deleting…' : '🗑 Delete'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={cardStyle}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <h3 style={{ ...cardTitle, marginBottom: 0 }}>
                Activity ({activity.length})
              </h3>
              <button onClick={loadActivity} style={linkButton} disabled={activityLoading}>
                {activityLoading ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {activityLoading ? (
              <div style={emptyText}>Loading...</div>
            ) : activity.length === 0 ? (
              <div style={emptyText}>
                No activity yet. Things will show up here as you work with this client (uploads, recommendations, notes, etc.)
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activity.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      gap: '14px',
                      padding: '12px 14px',
                      background: '#faf7f2',
                      border: '1px solid #eef1f4',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{
                      fontSize: '20px',
                      lineHeight: 1,
                      flexShrink: 0,
                      paddingTop: '2px',
                    }}>
                      {eventIcon(a.event_type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', color: '#1e3a5f', fontWeight: 500 }}>
                        {a.event_summary}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                        {a.actor_name || 'Someone'} · {formatRelativeTime(a.created_at)} · {formatDate(a.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Run Recommendation Modal */}
      {showRecModal && (
        <div style={modalOverlay} onClick={() => !running && setShowRecModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Run Recommendation</h2>
            <div style={{ color: '#5b7a99', fontSize: '13px', marginBottom: '20px' }}>
              For {client.first_name} {client.last_name}
              {claims.filter((c) => c.parsed?.parse_status === 'success').length > 0 && (
                <> · Will use {claims.filter((c) => c.parsed?.parse_status === 'success').length} parsed claim{claims.filter((c) => c.parsed?.parse_status === 'success').length === 1 ? '' : 's'}</>
              )}
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>ZIP Code *</label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                placeholder="e.g. 85001"
                style={inputStyle}
                maxLength={5}
                disabled={running}
              />
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Household Size *</label>
              <input
                type="number"
                value={householdSize}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n) && n > 0 && n < 20) setHouseholdSize(n);
                }}
                style={inputStyle}
                min={1}
                max={20}
                disabled={running}
              />
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Annual Household Income *</label>
              <input
                type="text"
                value={annualIncome}
                onChange={(e) => setAnnualIncome(e.target.value)}
                placeholder="e.g. 50000"
                style={inputStyle}
                disabled={running}
              />
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>
                Ages * <span style={{ color: '#888', fontWeight: 400, fontSize: '12px' }}>
                  (comma-separated, one per household member)
                </span>
              </label>
              <input
                type="text"
                value={agesText}
                onChange={(e) => setAgesText(e.target.value)}
                placeholder="e.g. 35, 33, 8"
                style={inputStyle}
                disabled={running}
              />
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                Need {householdSize} age{householdSize === 1 ? '' : 's'}.
              </div>
            </div>

            <div style={{ ...fieldGroup, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="usesTobacco"
                checked={usesTobacco}
                onChange={(e) => setUsesTobacco(e.target.checked)}
                disabled={running}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="usesTobacco" style={{ ...fieldLabel, marginBottom: 0, cursor: 'pointer' }}>
                Primary applicant uses tobacco
              </label>
            </div>

            {runError && (
              <div style={errorBox}>
                {runError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRecModal(false)}
                style={secondaryButtonActive}
                disabled={running}
              >
                Cancel
              </button>
              <button
                onClick={handleRunRecommendation}
                style={primaryButtonActive}
                disabled={running}
              >
                {running ? 'Running... (10–30 sec)' : 'Run Recommendation'}
              </button>
            </div>

            {running && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: '#fff4e0',
                color: '#a96a1c',
                borderRadius: '6px',
                fontSize: '12px',
                textAlign: 'center',
              }}>
                Searching CMS Marketplace and ranking with Claude AI. Please don't close this window.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && (
        <div style={modalOverlay} onClick={() => !savingClient && setShowEditModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Edit Client</h2>
            <div style={{ color: '#5b7a99', fontSize: '13px', marginBottom: '20px' }}>
              Update {client.first_name}'s details.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={fieldGroup}>
                <label style={fieldLabel}>First Name *</label>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  style={inputStyle}
                  disabled={savingClient}
                />
              </div>
              <div style={fieldGroup}>
                <label style={fieldLabel}>Last Name *</label>
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  style={inputStyle}
                  disabled={savingClient}
                />
              </div>
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                style={inputStyle}
                disabled={savingClient}
              />
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Phone</label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                style={inputStyle}
                disabled={savingClient}
              />
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Employer</label>
              <input
                type="text"
                value={editEmployer}
                onChange={(e) => setEditEmployer(e.target.value)}
                style={inputStyle}
                disabled={savingClient}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div style={fieldGroup}>
                <label style={fieldLabel}>Members</label>
                <input
                  type="number"
                  value={editMemberCount}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n > 0 && n < 100) setEditMemberCount(n);
                  }}
                  style={inputStyle}
                  min={1}
                  disabled={savingClient}
                />
              </div>
              <div style={fieldGroup}>
                <label style={fieldLabel}>State</label>
                <input
                  type="text"
                  value={editState}
                  onChange={(e) => setEditState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="AZ"
                  style={inputStyle}
                  maxLength={2}
                  disabled={savingClient}
                />
              </div>
              <div style={fieldGroup}>
                <label style={fieldLabel}>ZIP</label>
                <input
                  type="text"
                  value={editZip}
                  onChange={(e) => setEditZip(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                  placeholder="85001"
                  style={inputStyle}
                  maxLength={5}
                  disabled={savingClient}
                />
              </div>
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                style={inputStyle}
                disabled={savingClient}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {editError && (
              <div style={errorBox}>
                {editError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={secondaryButtonActive}
                disabled={savingClient}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveClient}
                style={primaryButtonActive}
                disabled={savingClient}
              >
                {savingClient ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Link Request Modal */}
      {showLinkModal && (
        <div style={modalOverlay} onClick={() => !sendingLink && setShowLinkModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>🔗 Send Link Request</h2>
            <div style={{ color: '#5b7a99', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
              Invite {client.first_name} to link their personal Clarity Health account so you can collaborate on their benefits.
            </div>

            <div style={{
              background: '#faf7f2',
              border: '1px solid #eef1f4',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '20px',
            }}>
              <div style={{ fontSize: '13px', color: '#1e3a5f', fontWeight: 600, marginBottom: '8px' }}>
                What happens next:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#3a4d68', lineHeight: '1.7' }}>
                <li>A pending link request is created in our system</li>
                <li>The client gets an email invite to sign up or log in <em style={{ color: '#a96a1c' }}>(coming Session 20)</em></li>
                <li>Once they accept, you'll have read access to their data</li>
              </ul>
            </div>

            <div style={fieldGroup}>
              <label style={fieldLabel}>Client's Email *</label>
              <input
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder="client@example.com"
                style={inputStyle}
                disabled={sendingLink}
                autoFocus
              />
              <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                {client.email
                  ? `Prefilled from client record. Edit if needed.`
                  : `No email on file — adding one here will save it to the client record.`}
              </div>
            </div>

            {linkError && (
              <div style={errorBox}>
                {linkError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowLinkModal(false)}
                style={secondaryButtonActive}
                disabled={sendingLink}
              >
                Cancel
              </button>
              <button
                onClick={handleSendLinkRequest}
                style={primaryButtonActive}
                disabled={sendingLink}
              >
                {sendingLink ? 'Sending…' : '🔗 Send Link Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#1e3a5f',
          color: 'white',
          padding: '14px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(30, 58, 95, 0.3)',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: 'Figtree, sans-serif',
          zIndex: 2000,
          maxWidth: '380px',
        }}>
          ✅ {toastMessage}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #eef1f4',
  borderRadius: '12px',
  padding: '24px',
};

const cardTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: '18px',
  color: '#1e3a5f',
  marginTop: 0,
  marginBottom: '14px',
};

const emptyText: React.CSSProperties = {
  color: '#888',
  fontSize: '14px',
  fontStyle: 'italic',
};

const primaryButtonActive: React.CSSProperties = {
  background: '#7a9b76',
  color: 'white',
  border: 'none',
  padding: '10px 20px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
};

const secondaryButtonActive: React.CSSProperties = {
  background: 'white',
  color: '#1e3a5f',
  border: '1px solid #1e3a5f',
  padding: '10px 20px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
};

const secondaryButtonDisabled: React.CSSProperties = {
  background: 'white',
  color: '#3a4d68',
  border: '1px solid #d4d4d4',
  padding: '10px 20px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'not-allowed',
  fontFamily: 'Figtree, sans-serif',
  opacity: 0.6,
};

const linkButton: React.CSSProperties = {
  background: 'transparent',
  color: '#7a9b76',
  border: 'none',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
  padding: 0,
};

const deleteButton: React.CSSProperties = {
  background: 'transparent',
  color: '#a44',
  border: '1px solid #f0d0d0',
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
};

const editButton: React.CSSProperties = {
  background: 'white',
  color: '#5b7a99',
  border: '1px solid #d4d4d4',
  borderRadius: '6px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Figtree, sans-serif',
};

const statusBadge: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const countBadge: React.CSSProperties = {
  marginLeft: '6px',
  background: '#eef1f4',
  color: '#5b7a99',
  padding: '2px 8px',
  borderRadius: '10px',
  fontSize: '11px',
  fontWeight: 700,
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(30, 58, 95, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px',
};

const modalContent: React.CSSProperties = {
  background: 'white',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '520px',
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  fontFamily: 'Figtree, sans-serif',
};

const modalTitle: React.CSSProperties = {
  fontFamily: 'Playfair Display, serif',
  fontSize: '24px',
  color: '#1e3a5f',
  marginTop: 0,
  marginBottom: '8px',
};

const fieldGroup: React.CSSProperties = {
  marginBottom: '16px',
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#1e3a5f',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #eef1f4',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'Figtree, sans-serif',
  color: '#1e3a5f',
  boxSizing: 'border-box',
};

const errorBox: React.CSSProperties = {
  background: '#fde7e7',
  color: '#a44',
  padding: '12px',
  borderRadius: '6px',
  fontSize: '13px',
  marginBottom: '16px',
};