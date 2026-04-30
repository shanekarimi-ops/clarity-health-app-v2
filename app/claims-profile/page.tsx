'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../supabase';

const CONDITIONS = [
  'Diabetes',
  'Hypertension (high blood pressure)',
  'Asthma',
  'Heart disease',
  'Cancer (current or past)',
  'Mental health condition',
  'Pregnancy (current or planning)',
  'Chronic pain',
  'Autoimmune condition',
  'None of the above',
];

export default function ClaimsProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [claimsCount, setClaimsCount] = useState(0);

  // Health profile fields
  const [age, setAge] = useState<string>('');
  const [householdSize, setHouseholdSize] = useState<string>('');
  const [zipCode, setZipCode] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState('');
  const [preferredProviders, setPreferredProviders] = useState('');

  // Priority sliders (1-5)
  const [monthlyBudget, setMonthlyBudget] = useState<string>('');
  const [priorityLowDeductible, setPriorityLowDeductible] = useState(3);
  const [priorityMentalHealth, setPriorityMentalHealth] = useState(3);
  const [priorityDentalVision, setPriorityDentalVision] = useState(3);
  const [priorityNationwideNetwork, setPriorityNationwideNetwork] = useState(3);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Load existing profile
      const { data: profile } = await supabase
        .from('health_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        setAge(profile.age?.toString() || '');
        setHouseholdSize(profile.household_size?.toString() || '');
        setZipCode(profile.zip_code || '');
        setConditions(profile.conditions || []);
        setMedications(profile.medications || '');
        setPreferredProviders(profile.preferred_providers || '');
        setMonthlyBudget(profile.monthly_budget?.toString() || '');
        setPriorityLowDeductible(profile.priority_low_deductible || 3);
        setPriorityMentalHealth(profile.priority_mental_health || 3);
        setPriorityDentalVision(profile.priority_dental_vision || 3);
        setPriorityNationwideNetwork(profile.priority_nationwide_network || 3);
      }

      // Load claims count
      const { count } = await supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setClaimsCount(count || 0);
      setLoading(false);
    }
    loadData();
  }, [router]);

  function toggleCondition(condition: string) {
    setConditions((prev) => {
      if (condition === 'None of the above') {
        return prev.includes(condition) ? [] : [condition];
      }
      const filtered = prev.filter((c) => c !== 'None of the above');
      if (filtered.includes(condition)) {
        return filtered.filter((c) => c !== condition);
      }
      return [...filtered, condition];
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const profileData = {
      user_id: user.id,
      age: age ? parseInt(age) : null,
      household_size: householdSize ? parseInt(householdSize) : null,
      zip_code: zipCode.trim() || null,
      conditions,
      medications: medications.trim() || null,
      preferred_providers: preferredProviders.trim() || null,
      monthly_budget: monthlyBudget ? parseInt(monthlyBudget) : null,
      priority_low_deductible: priorityLowDeductible,
      priority_mental_health: priorityMentalHealth,
      priority_dental_vision: priorityDentalVision,
      priority_nationwide_network: priorityNationwideNetwork,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('health_profiles')
      .upsert(profileData, { onConflict: 'user_id' });

    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setSuccessMsg('Profile saved successfully.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh'}}>
        <p>Loading your profile...</p>
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
        <a href="/claims-profile" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="dash-nav-item active"><div className="dash-nav-icon">📄</div> Claims & Profile</div>
        </a>
        <a href="/uploaded-files" style={{textDecoration: 'none', color: 'inherit'}}>
          <div className="dash-nav-item"><div className="dash-nav-icon">📎</div> Uploaded Files</div>
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
            <div className="dash-greeting">Claims & Profile</div>
            <div className="dash-date">Help us match you with the right plans</div>
          </div>
        </div>

        <form onSubmit={handleSave}>
          {/* Health Profile section */}
          <div className="dash-card" style={{marginBottom: '1.5rem'}}>
            <div className="dash-card-header">
              <div className="dash-card-title">Your Health Profile</div>
            </div>
            <p style={{color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0'}}>
              The more you tell us, the better the AI can match you with plans. All fields are optional.
            </p>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem'}}>
              <div className="form-field">
                <label className="form-label">Age</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="120"
                  placeholder="e.g. 34"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Household size</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="e.g. 4 (you + spouse + 2 kids)"
                  value={householdSize}
                  onChange={(e) => setHouseholdSize(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="form-field">
                <label className="form-label">ZIP code</label>
                <input
                  className="form-input"
                  type="text"
                  maxLength={10}
                  placeholder="e.g. 85001"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-field" style={{marginTop: '1.25rem'}}>
              <label className="form-label">Existing conditions (select all that apply)</label>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem', marginTop: '0.5rem'}}>
                {CONDITIONS.map((condition) => (
                  <label
                    key={condition}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.85rem',
                      border: `1px solid ${conditions.includes(condition) ? '#7a9b76' : '#e1e6eb'}`,
                      borderRadius: '6px',
                      backgroundColor: conditions.includes(condition) ? '#ebf3ea' : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: '#1e3a5f',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={conditions.includes(condition)}
                      onChange={() => toggleCondition(condition)}
                      disabled={saving}
                      style={{margin: 0}}
                    />
                    {condition}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-field" style={{marginTop: '1.25rem'}}>
              <label className="form-label">Current medications (optional)</label>
              <textarea
                className="form-input"
                placeholder="e.g. Metformin 500mg, Lisinopril 10mg"
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                disabled={saving}
                rows={2}
                style={{resize: 'vertical', minHeight: '60px'}}
              />
            </div>

            <div className="form-field" style={{marginTop: '1.25rem'}}>
              <label className="form-label">Preferred doctors or hospitals (optional)</label>
              <textarea
                className="form-input"
                placeholder="e.g. Dr. Smith at Mayo Clinic, Banner Health network"
                value={preferredProviders}
                onChange={(e) => setPreferredProviders(e.target.value)}
                disabled={saving}
                rows={2}
                style={{resize: 'vertical', minHeight: '60px'}}
              />
            </div>
          </div>

          {/* Coverage Priorities section */}
          <div className="dash-card" style={{marginBottom: '1.5rem'}}>
            <div className="dash-card-header">
              <div className="dash-card-title">Coverage Priorities</div>
            </div>
            <p style={{color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0'}}>
              Rate how important each factor is when choosing a plan. (1 = not important, 5 = critical)
            </p>

            <div className="form-field">
              <label className="form-label">Monthly budget for premiums (optional)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="e.g. 400"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                disabled={saving}
                style={{maxWidth: '200px'}}
              />
            </div>

            <PrioritySlider
              label="Low deductible"
              value={priorityLowDeductible}
              onChange={setPriorityLowDeductible}
              disabled={saving}
            />
            <PrioritySlider
              label="Mental health coverage"
              value={priorityMentalHealth}
              onChange={setPriorityMentalHealth}
              disabled={saving}
            />
            <PrioritySlider
              label="Dental and vision coverage"
              value={priorityDentalVision}
              onChange={setPriorityDentalVision}
              disabled={saving}
            />
            <PrioritySlider
              label="Nationwide network (for travel)"
              value={priorityNationwideNetwork}
              onChange={setPriorityNationwideNetwork}
              disabled={saving}
            />
          </div>

          {/* Claims summary */}
          <div className="dash-card" style={{marginBottom: '1.5rem'}}>
            <div className="dash-card-header">
              <div className="dash-card-title">Your Claims</div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem'}}>
              <div>
                <div style={{fontSize: '1.5rem', fontWeight: 700, color: '#1e3a5f'}}>
                  {claimsCount} {claimsCount === 1 ? 'claim' : 'claims'} uploaded
                </div>
                <div style={{fontSize: '0.875rem', color: '#6b7785', marginTop: '0.25rem'}}>
                  {claimsCount === 0
                    ? "Upload your claims to help the AI tailor recommendations to your actual usage."
                    : "Your claims are ready to be analyzed when the AI engine is available."}
                </div>
              </div>
              <a href="/uploaded-files" className="btn-sm btn-ghost-sm" style={{textDecoration: 'none'}}>
                Manage files →
              </a>
            </div>
          </div>

          {/* Save button */}
          <div style={{display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem'}}>
            <button type="submit" className="btn-sm btn-accent" disabled={saving}>
              {saving ? 'Saving...' : 'Save profile'}
            </button>
            {errorMsg && <span style={{color: '#d95858', fontSize: '0.875rem'}}>{errorMsg}</span>}
            {successMsg && <span style={{color: '#7a9b76', fontSize: '0.875rem'}}>{successMsg}</span>}
          </div>
        </form>
      </main>
    </div>
  );
}

function PrioritySlider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="form-field" style={{marginTop: '1.25rem'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
        <label className="form-label" style={{margin: 0}}>{label}</label>
        <span style={{fontSize: '0.875rem', color: '#7a9b76', fontWeight: 600}}>{value} / 5</span>
      </div>
      <input
        type="range"
        min="1"
        max="5"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={disabled}
        style={{width: '100%', accentColor: '#7a9b76'}}
      />
      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem'}}>
        <span>Not important</span>
        <span>Critical</span>
      </div>
    </div>
  );
}