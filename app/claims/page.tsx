'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

export default function ClaimsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [claimsCount, setClaimsCount] = useState(0);
  const [parsedCount, setParsedCount] = useState(0);
  const [householdComplete, setHouseholdComplete] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Claims count
      const { count } = await supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setClaimsCount(count || 0);

      // Parsed claims count
      const { count: pCount } = await supabase
        .from('claims_parsed')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('parse_status', 'success');
      setParsedCount(pCount || 0);

      // Household completeness check
      const { data: household } = await supabase
        .from('households')
        .select('zip_code, household_size, annual_income')
        .eq('user_id', user.id)
        .maybeSingle();

      if (household) {
        const { count: memberCount } = await supabase
          .from('household_members')
          .select('*', { count: 'exact', head: true })
          .eq('household_id', (household as any).id || '')
          .not('age', 'is', null);

        setHouseholdComplete(
          !!household.zip_code &&
          !!household.household_size &&
          !!household.annual_income
        );
      }

      setLoading(false);
    }
    loadData();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  return (
    <div className="dash-layout">
      <Sidebar
        active="claims"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Claims</div>
            <div className="dash-date">Manage the claims documents that power your AI recommendations</div>
          </div>
        </div>

        {/* Profile data moved notice */}
        <div
          className="dash-card"
          style={{
            marginBottom: '1.5rem',
            backgroundColor: '#ebf3ea',
            borderLeft: '4px solid #7a9b76',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ fontWeight: 700, color: '#1e3a5f', marginBottom: '0.4rem' }}>
                Looking for your health profile or household details?
              </div>
              <div style={{ fontSize: '0.875rem', color: '#3a4d68', lineHeight: 1.6 }}>
                Conditions, medications, doctors, and household members now live on the new <strong>Household</strong> page.
                {!householdComplete && ' Your household is incomplete — finish it to unlock recommendations.'}
              </div>
            </div>
            <Link href="/household" className="btn-sm btn-accent" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {householdComplete ? 'View Household →' : 'Complete Household →'}
            </Link>
          </div>
        </div>

        {/* Claims summary */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">Your Claims</div>
          </div>
          <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
            Claims documents help our AI understand your actual healthcare usage. The more we have, the better the recommendations.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div style={{ padding: '1rem', border: '1px solid #e1e6eb', borderRadius: '6px', backgroundColor: '#fafbfc' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Uploaded</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e3a5f', marginTop: '0.25rem' }}>
                {claimsCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7785' }}>
                {claimsCount === 1 ? 'document' : 'documents'}
              </div>
            </div>

            <div style={{ padding: '1rem', border: '1px solid #e1e6eb', borderRadius: '6px', backgroundColor: '#fafbfc' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parsed by AI</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#7a9b76', marginTop: '0.25rem' }}>
                {parsedCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7785' }}>
                ready for analysis
              </div>
            </div>
          </div>

          {claimsCount === 0 ? (
            <div
              style={{
                padding: '1.25rem',
                border: '1px dashed #c8d0d8',
                borderRadius: '6px',
                backgroundColor: '#fafbfc',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.95rem', color: '#3a4d68', marginBottom: '0.5rem', fontWeight: 600 }}>
                No claims uploaded yet
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6b7785', marginBottom: '1rem' }}>
                Upload an Explanation of Benefits (EOB), bill, or claim summary to give the AI context about your usage.
              </div>
              <Link href="/uploaded-files" className="btn-sm btn-accent" style={{ textDecoration: 'none' }}>
                Upload claims →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#3a4d68' }}>
                {parsedCount === claimsCount
                  ? 'All your claims have been parsed and are ready to inform recommendations.'
                  : `${claimsCount - parsedCount} of your claims are still being processed or could not be parsed.`}
              </div>
              <Link href="/uploaded-files" className="btn-sm btn-ghost-sm" style={{ textDecoration: 'none' }}>
                Manage files →
              </Link>
            </div>
          )}
        </div>

        {/* What we extract */}
        <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
          <div className="dash-card-header">
            <div className="dash-card-title">What we extract from your claims</div>
          </div>
          <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.25rem 0' }}>
            Our AI reads your uploaded documents and pulls out the data points that matter for plan matching.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {[
              { icon: '🏥', label: 'Conditions & diagnoses', detail: 'Chronic conditions, ongoing issues' },
              { icon: '💊', label: 'Medications', detail: 'Current and past prescriptions' },
              { icon: '👨‍⚕️', label: 'Specialist visits', detail: 'Frequency and type of care' },
              { icon: '💰', label: 'Out-of-pocket costs', detail: 'What you actually paid' },
              { icon: '🩺', label: 'Procedures', detail: 'Tests, surgeries, treatments' },
              { icon: '📊', label: 'Total billed', detail: 'Annual healthcare spend' },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  padding: '0.85rem 1rem',
                  border: '1px solid #eef1f4',
                  borderRadius: '6px',
                  backgroundColor: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e3a5f' }}>{item.label}</div>
                  <div style={{ fontSize: '0.7rem', color: '#6b7785' }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}