'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

type HouseholdData = {
  zip_code: string | null;
  annual_income: number | null;
  household_size: number | null;
  coverage_scope: string | null;
  tobacco_any: boolean | null;
};

type MemberData = {
  member_order: number;
  age: number | null;
  relationship: string;
};

export default function FindPlansPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const [household, setHousehold] = useState<HouseholdData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Load household
      const { data: hh } = await supabase
        .from('households')
        .select('id, zip_code, annual_income, household_size, coverage_scope, tobacco_any')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!hh) {
        setLoading(false);
        return;
      }

      setHousehold(hh);

      // Load members
      const { data: memberRows } = await supabase
        .from('household_members')
        .select('member_order, age, relationship')
        .eq('household_id', hh.id)
        .order('member_order', { ascending: true });

      const loadedMembers: MemberData[] = (memberRows || []).map((m: any) => ({
        member_order: m.member_order,
        age: m.age,
        relationship: m.relationship,
      }));
      setMembers(loadedMembers);

      // Check completeness
      const missing: string[] = [];
      if (!hh.zip_code) missing.push('ZIP code');
      if (!hh.annual_income) missing.push('Annual household income');
      if (!hh.household_size) missing.push('Household size');
      if (loadedMembers.length === 0) {
        missing.push('Household member ages');
      } else if (loadedMembers.some((m) => m.age == null)) {
        missing.push('Age for every household member');
      }
      setMissingFields(missing);

      setLoading(false);
    }
    loadData();
  }, [router]);

  async function handleSubmit() {
    if (!household || !user) return;
    setErrorMsg('');
    setStatusMsg('');
    setSubmitting(true);

    const ages = members
      .sort((a, b) => a.member_order - b.member_order)
      .map((m) => m.age!)
      .filter((a) => a != null);

    const payload = {
      zipCode: household.zip_code,
      householdSize: household.household_size,
      annualIncome: household.annual_income,
      ages,
      usesTobacco: household.tobacco_any || false,
      userId: user.id,
    };

    try {
      setStatusMsg('Fetching plans from the federal Marketplace...');

      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Something went wrong');
        setSubmitting(false);
        return;
      }

      setStatusMsg('Done! Redirecting to your plans...');
      router.push('/my-plans');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error');
      setSubmitting(false);
    }
  }

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

  const householdComplete = household && missingFields.length === 0;

  // Pretty-print coverage scope
  const coverageScopeLabel: Record<string, string> = {
    individual: 'Just you',
    employee_plus_spouse: 'You + spouse',
    employee_plus_children: 'You + child(ren)',
    family: 'Whole family',
  };

  return (
    <div className="dash-layout">
      <Sidebar
        active={'find-plans' as any}
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Find Plans</div>
            <div className="dash-date">Get AI-ranked Marketplace plan recommendations for your household</div>
          </div>
        </div>

        {/* CASE 1: No household at all */}
        {!household && (
          <div
            className="dash-card"
            style={{
              marginBottom: '1.5rem',
              backgroundColor: '#fff8e6',
              borderLeft: '4px solid #d4a83c',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ fontWeight: 700, color: '#1e3a5f', marginBottom: '0.4rem', fontSize: '1.05rem' }}>
                  Set up your household first
                </div>
                <div style={{ fontSize: '0.9rem', color: '#3a4d68', lineHeight: 1.6 }}>
                  We need to know who you're covering, where you live, and your household income before we can pull plans from the Marketplace.
                </div>
              </div>
              <Link href="/household" className="btn-sm btn-accent" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Set up Household →
              </Link>
            </div>
          </div>
        )}

        {/* CASE 2: Household exists but incomplete */}
        {household && !householdComplete && (
          <div
            className="dash-card"
            style={{
              marginBottom: '1.5rem',
              backgroundColor: '#fff8e6',
              borderLeft: '4px solid #d4a83c',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ fontWeight: 700, color: '#1e3a5f', marginBottom: '0.4rem', fontSize: '1.05rem' }}>
                  Household is missing some details
                </div>
                <div style={{ fontSize: '0.9rem', color: '#3a4d68', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                  Before we can find plans, please complete these fields on your Household page:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#3a4d68', fontSize: '0.875rem' }}>
                  {missingFields.map((field) => (
                    <li key={field} style={{ marginBottom: '0.25rem' }}>{field}</li>
                  ))}
                </ul>
              </div>
              <Link href="/household" className="btn-sm btn-accent" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Complete Household →
              </Link>
            </div>
          </div>
        )}

        {/* CASE 3: Household complete — show summary + run button */}
        {householdComplete && (
          <>
            <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
              <div className="dash-card-header">
                <div className="dash-card-title">We'll search for plans matching:</div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <SummaryStat label="Coverage" value={coverageScopeLabel[household.coverage_scope || 'individual'] || household.coverage_scope || '—'} />
                <SummaryStat label="ZIP Code" value={household.zip_code || '—'} />
                <SummaryStat label="Household Size" value={household.household_size?.toString() || '—'} />
                <SummaryStat label="Annual Income" value={household.annual_income ? `$${household.annual_income.toLocaleString()}` : '—'} />
              </div>

              <div style={{ borderTop: '1px solid #eef1f4', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                  Members
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {members.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '0.4rem 0.75rem',
                        backgroundColor: '#f4f6f8',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        color: '#1e3a5f',
                      }}
                    >
                      {relationshipLabel(m.relationship)}, age {m.age}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#6b7785' }}>
                Tobacco use: {household.tobacco_any ? 'Yes' : 'No'}
                {' · '}
                <Link href="/household" style={{ color: '#7a9b76', textDecoration: 'underline' }}>
                  Edit household
                </Link>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-sm btn-accent"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Working...' : 'Get My Recommendations →'}
              </button>
              {statusMsg && <span style={{ color: '#7a9b76', fontSize: '0.875rem' }}>{statusMsg}</span>}
              {errorMsg && <span style={{ color: '#d95858', fontSize: '0.875rem' }}>{errorMsg}</span>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '1rem', border: '1px solid #e1e6eb', borderRadius: '6px', backgroundColor: '#fafbfc' }}>
      <div style={{ fontSize: '0.7rem', color: '#6b7785', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f', marginTop: '0.25rem' }}>
        {value}
      </div>
    </div>
  );
}

function relationshipLabel(rel: string): string {
  const map: Record<string, string> = {
    self: 'You',
    spouse: 'Spouse',
    domestic_partner: 'Partner',
    child: 'Child',
    dependent: 'Dependent',
  };
  return map[rel] || rel;
}