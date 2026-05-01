'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

export default function FindPlansPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form fields
  const [zipCode, setZipCode] = useState('');
  const [householdSize, setHouseholdSize] = useState<string>('1');
  const [annualIncome, setAnnualIncome] = useState<string>('');
  const [ages, setAges] = useState<string[]>(['']);
  const [usesTobacco, setUsesTobacco] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Pre-fill from health_profiles if available
      const { data: profile } = await supabase
        .from('health_profiles')
        .select('zip_code, household_size, age')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        if (profile.zip_code) setZipCode(profile.zip_code);
        if (profile.household_size) {
          setHouseholdSize(profile.household_size.toString());
          // Initialize ages array to match household size
          const sizeNum = profile.household_size;
          setAges(Array(sizeNum).fill('').map((_, i) =>
            i === 0 && profile.age ? profile.age.toString() : ''
          ));
        } else if (profile.age) {
          setAges([profile.age.toString()]);
        }
      }

      setLoading(false);
    }
    loadData();
  }, [router]);

  // Keep ages array in sync with household size
  function handleHouseholdChange(value: string) {
    setHouseholdSize(value);
    const sizeNum = parseInt(value) || 1;
    setAges((prev) => {
      const newAges = [...prev];
      while (newAges.length < sizeNum) newAges.push('');
      while (newAges.length > sizeNum) newAges.pop();
      return newAges;
    });
  }

  function handleAgeChange(index: number, value: string) {
    setAges((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    // Basic validation
    if (!zipCode || zipCode.length < 5) {
      setErrorMsg('Please enter a valid 5-digit ZIP code.');
      return;
    }
    if (!annualIncome) {
      setErrorMsg('Please enter your annual household income.');
      return;
    }
    if (ages.some((a) => !a)) {
      setErrorMsg('Please enter the age for each household member.');
      return;
    }

    setSubmitting(true);

    const formData = {
      zipCode: zipCode.trim(),
      householdSize: parseInt(householdSize),
      annualIncome: parseInt(annualIncome),
      ages: ages.map((a) => parseInt(a)),
      usesTobacco,
    };

    // Step 3 will replace this with a real API call to /api/recommend
    console.log('Find Plans form submitted:', formData);
    alert('Form submitted! Check the browser console (F12) to see the data. The AI engine wires up next.');

    setSubmitting(false);
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
            <div className="dash-date">Tell us a bit about your household and we'll find your best matches</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Household Details</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
              We use this to pull live plans from the federal Marketplace and rank them for you.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="form-field">
                <label className="form-label">ZIP code</label>
                <input
                  className="form-input"
                  type="text"
                  maxLength={10}
                  placeholder="e.g. 85001"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Household size</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  max="20"
                  value={householdSize}
                  onChange={(e) => handleHouseholdChange(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Annual household income (USD)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="e.g. 52000"
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div className="form-field" style={{ marginTop: '1.25rem' }}>
              <label className="form-label">Age of each household member</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                {ages.map((age, i) => (
                  <input
                    key={i}
                    className="form-input"
                    type="number"
                    min="0"
                    max="120"
                    placeholder={i === 0 ? 'You' : `Person ${i + 1}`}
                    value={age}
                    onChange={(e) => handleAgeChange(i, e.target.value)}
                    disabled={submitting}
                    required
                  />
                ))}
              </div>
            </div>

            <div className="form-field" style={{ marginTop: '1.25rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.75rem 1rem',
                  border: `1px solid ${usesTobacco ? '#7a9b76' : '#e1e6eb'}`,
                  borderRadius: '6px',
                  backgroundColor: usesTobacco ? '#ebf3ea' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#1e3a5f',
                  maxWidth: '320px',
                }}
              >
                <input
                  type="checkbox"
                  checked={usesTobacco}
                  onChange={(e) => setUsesTobacco(e.target.checked)}
                  disabled={submitting}
                  style={{ margin: 0 }}
                />
                Anyone in household uses tobacco
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <button type="submit" className="btn-sm btn-accent" disabled={submitting}>
              {submitting ? 'Searching...' : 'Get My Recommendations →'}
            </button>
            {errorMsg && <span style={{ color: '#d95858', fontSize: '0.875rem' }}>{errorMsg}</span>}
          </div>
        </form>
      </main>
    </div>
  );
}