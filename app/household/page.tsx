'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import Sidebar from '../components/Sidebar';

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

const COVERAGE_SCOPE_OPTIONS = [
  { value: 'individual', label: 'Just me', hint: 'Employee-only coverage' },
  { value: 'employee_plus_spouse', label: 'Me + spouse', hint: 'Employee + spouse/partner' },
  { value: 'employee_plus_children', label: 'Me + child(ren)', hint: 'Employee + children, no spouse' },
  { value: 'family', label: 'Whole family', hint: 'Employee + spouse + children' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'self', label: 'Me' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'domestic_partner', label: 'Domestic partner' },
  { value: 'child', label: 'Child' },
  { value: 'dependent', label: 'Dependent' },
];

type Member = {
  id?: string;
  member_order: number;
  age: string;
  relationship: string;
  tobacco_user: boolean;
};

export default function HouseholdPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Household-level fields
  const [zipCode, setZipCode] = useState('');
  const [annualIncome, setAnnualIncome] = useState<string>('');
  const [householdSize, setHouseholdSize] = useState<string>('1');
  const [coverageScope, setCoverageScope] = useState<string>('individual');
  const [tobaccoAny, setTobaccoAny] = useState(false);
  const [conditions, setConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState('');
  const [preferredProviders, setPreferredProviders] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState<string>('');
  const [priorityLowDeductible, setPriorityLowDeductible] = useState(3);
  const [priorityMentalHealth, setPriorityMentalHealth] = useState(3);
  const [priorityDentalVision, setPriorityDentalVision] = useState(3);
  const [priorityNationwideNetwork, setPriorityNationwideNetwork] = useState(3);

  // Per-member fields
  const [members, setMembers] = useState<Member[]>([
    { member_order: 1, age: '', relationship: 'self', tobacco_user: false },
  ]);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      // Load household
      const { data: household } = await supabase
        .from('households')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (household) {
        setHouseholdId(household.id);
        setZipCode(household.zip_code || '');
        setAnnualIncome(household.annual_income?.toString() || '');
        setHouseholdSize(household.household_size?.toString() || '1');
        setCoverageScope(household.coverage_scope || 'individual');
        setTobaccoAny(household.tobacco_any || false);
        setConditions(household.conditions || []);
        setMedications(household.medications || '');
        setPreferredProviders(household.preferred_providers || '');
        setMonthlyBudget(household.monthly_budget?.toString() || '');
        setPriorityLowDeductible(household.priority_low_deductible || 3);
        setPriorityMentalHealth(household.priority_mental_health || 3);
        setPriorityDentalVision(household.priority_dental_vision || 3);
        setPriorityNationwideNetwork(household.priority_nationwide_network || 3);

        // Load members
        const { data: memberRows } = await supabase
          .from('household_members')
          .select('*')
          .eq('household_id', household.id)
          .order('member_order', { ascending: true });

        if (memberRows && memberRows.length > 0) {
          const sizeNum = household.household_size || memberRows.length;
          const loaded: Member[] = memberRows.map((m: any) => ({
            id: m.id,
            member_order: m.member_order,
            age: m.age?.toString() || '',
            relationship: m.relationship || 'self',
            tobacco_user: m.tobacco_user || false,
          }));
          // Pad to household_size with empty member rows if needed
          while (loaded.length < sizeNum) {
            loaded.push({
              member_order: loaded.length + 1,
              age: '',
              relationship: loaded.length === 1 ? 'spouse' : 'child',
              tobacco_user: false,
            });
          }
          setMembers(loaded);
        }
      }

      setLoading(false);
    }
    loadData();
  }, [router]);

  function handleHouseholdSizeChange(value: string) {
    setHouseholdSize(value);
    const sizeNum = parseInt(value) || 1;
    setMembers((prev) => {
      const next = [...prev];
      while (next.length < sizeNum) {
        next.push({
          member_order: next.length + 1,
          age: '',
          relationship: next.length === 0 ? 'self' : next.length === 1 ? 'spouse' : 'child',
          tobacco_user: false,
        });
      }
      while (next.length > sizeNum) next.pop();
      return next;
    });
    // Auto-suggest coverage scope
    if (sizeNum === 1) setCoverageScope('individual');
    else if (sizeNum === 2) setCoverageScope('employee_plus_spouse');
    else setCoverageScope('family');
  }

  function handleMemberChange(index: number, field: keyof Member, value: any) {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

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

    // Validation
    if (!zipCode || zipCode.length < 5) {
      setErrorMsg('Please enter a valid 5-digit ZIP code.');
      setSaving(false);
      return;
    }
    const sizeNum = parseInt(householdSize) || 1;
    if (sizeNum < 1) {
      setErrorMsg('Household size must be at least 1.');
      setSaving(false);
      return;
    }
    if (members.some((m) => !m.age)) {
      setErrorMsg('Please enter the age for each household member.');
      setSaving(false);
      return;
    }

    const householdPayload = {
      user_id: user.id,
      zip_code: zipCode.trim(),
      annual_income: annualIncome ? parseFloat(annualIncome) : null,
      household_size: sizeNum,
      coverage_scope: coverageScope,
      tobacco_any: tobaccoAny,
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

    // Upsert household
    const { data: savedHousehold, error: hhError } = await supabase
      .from('households')
      .upsert(householdPayload, { onConflict: 'user_id' })
      .select()
      .single();

    if (hhError || !savedHousehold) {
      setErrorMsg(hhError?.message || 'Failed to save household.');
      setSaving(false);
      return;
    }

    setHouseholdId(savedHousehold.id);

    // Replace members atomically: delete existing, insert fresh
    const { error: delError } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', savedHousehold.id);

    if (delError) {
      setErrorMsg(`Saved household but failed to update members: ${delError.message}`);
      setSaving(false);
      return;
    }

    const memberRows = members.map((m, i) => ({
      household_id: savedHousehold.id,
      user_id: user.id,
      member_order: i + 1,
      age: m.age ? parseInt(m.age) : null,
      relationship: m.relationship,
      tobacco_user: m.tobacco_user,
    }));

    const { error: memError } = await supabase
      .from('household_members')
      .insert(memberRows);

    if (memError) {
      setErrorMsg(`Household saved but members failed: ${memError.message}`);
      setSaving(false);
      return;
    }

    // Activity log
    await supabase.from('activity_log').insert({
      actor_user_id: user.id,
      event_type: 'household_updated',
      event_summary: `Updated household: ${sizeNum} member${sizeNum === 1 ? '' : 's'}, ${coverageScope.replace(/_/g, ' ')} coverage`,
      metadata: {
        household_size: sizeNum,
        coverage_scope: coverageScope,
        zip_code: zipCode.trim(),
      },
    });

    setSaving(false);
    setSuccessMsg('Household saved successfully.');
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading your household...</p>
      </div>
    );
  }

  const firstName = user?.user_metadata?.first_name || 'there';
  const lastName = user?.user_metadata?.last_name || '';
  const role = user?.user_metadata?.role || 'Individual';

  return (
    <div className="dash-layout">
      <Sidebar
        active="household"
        firstName={firstName}
        lastName={lastName}
        role={role}
        onLogout={handleLogout}
      />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <div className="dash-greeting">Household</div>
            <div className="dash-date">Tell us about everyone you're covering — we use this everywhere on Clarity</div>
          </div>
        </div>

        <form onSubmit={handleSave}>
          {/* Section 1: Basics */}
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Household Basics</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
              Where you live, who's in your household, and your annual income.
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
                  disabled={saving}
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
                  onChange={(e) => handleHouseholdSizeChange(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label">Annual household income (USD)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  placeholder="e.g. 100000"
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-field" style={{ marginTop: '1.25rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.75rem 1rem',
                  border: `1px solid ${tobaccoAny ? '#7a9b76' : '#e1e6eb'}`,
                  borderRadius: '6px',
                  backgroundColor: tobaccoAny ? '#ebf3ea' : '#fff',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#1e3a5f',
                  maxWidth: '320px',
                }}
              >
                <input
                  type="checkbox"
                  checked={tobaccoAny}
                  onChange={(e) => setTobaccoAny(e.target.checked)}
                  disabled={saving}
                  style={{ margin: 0 }}
                />
                Anyone in household uses tobacco
              </label>
            </div>
          </div>

          {/* Section 2: Coverage Scope */}
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Who do you want covered?</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
              This determines which plan tier we recommend (individual, family, etc.).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {COVERAGE_SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    padding: '1rem',
                    border: `2px solid ${coverageScope === option.value ? '#7a9b76' : '#e1e6eb'}`,
                    borderRadius: '8px',
                    backgroundColor: coverageScope === option.value ? '#ebf3ea' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    color: '#1e3a5f',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      name="coverageScope"
                      value={option.value}
                      checked={coverageScope === option.value}
                      onChange={() => setCoverageScope(option.value)}
                      disabled={saving}
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontWeight: 600 }}>{option.label}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7785', marginLeft: '1.5rem' }}>{option.hint}</div>
                </label>
              ))}
            </div>
          </div>

          {/* Section 3: Members */}
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Household Members</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
              Per-person ages help us pull accurate Marketplace pricing and tailor recommendations.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {members.map((member, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr 1fr auto',
                    gap: '0.75rem',
                    alignItems: 'center',
                    padding: '0.75rem',
                    border: '1px solid #e1e6eb',
                    borderRadius: '6px',
                    backgroundColor: '#fafbfc',
                  }}
                >
                  <div style={{ fontSize: '0.875rem', color: '#6b7785', fontWeight: 600, minWidth: '60px' }}>
                    #{i + 1}
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Relationship</label>
                    <select
                      className="form-input"
                      value={member.relationship}
                      onChange={(e) => handleMemberChange(i, 'relationship', e.target.value)}
                      disabled={saving || i === 0}
                    >
                      {RELATIONSHIP_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.7rem' }}>Age</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      max="120"
                      value={member.age}
                      onChange={(e) => handleMemberChange(i, 'age', e.target.value)}
                      disabled={saving}
                      required
                    />
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: '0.75rem',
                      color: '#6b7785',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={member.tobacco_user}
                      onChange={(e) => handleMemberChange(i, 'tobacco_user', e.target.checked)}
                      disabled={saving}
                      style={{ margin: 0 }}
                    />
                    Tobacco
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Health Profile */}
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Health Profile</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
              Tell us about your household's health needs. The more we know, the smarter the recommendations.
            </p>

            <div className="form-field">
              <label className="form-label">Existing conditions (select all that apply)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
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
                      style={{ margin: 0 }}
                    />
                    {condition}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-field" style={{ marginTop: '1.25rem' }}>
              <label className="form-label">Current medications (optional)</label>
              <textarea
                className="form-input"
                placeholder="e.g. Metformin 500mg, Lisinopril 10mg"
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                disabled={saving}
                rows={2}
                style={{ resize: 'vertical', minHeight: '60px' }}
              />
            </div>

            <div className="form-field" style={{ marginTop: '1.25rem' }}>
              <label className="form-label">Preferred doctors or hospitals (optional)</label>
              <textarea
                className="form-input"
                placeholder="e.g. Dr. Smith at Mayo Clinic, Banner Health network"
                value={preferredProviders}
                onChange={(e) => setPreferredProviders(e.target.value)}
                disabled={saving}
                rows={2}
                style={{ resize: 'vertical', minHeight: '60px' }}
              />
            </div>
          </div>

          {/* Section 5: Coverage Priorities */}
          <div className="dash-card" style={{ marginBottom: '1.5rem' }}>
            <div className="dash-card-header">
              <div className="dash-card-title">Coverage Priorities</div>
            </div>
            <p style={{ color: '#6b7785', fontSize: '0.9rem', margin: '0 0 1.5rem 0' }}>
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
                style={{ maxWidth: '200px' }}
              />
            </div>

            <PrioritySlider label="Low deductible" value={priorityLowDeductible} onChange={setPriorityLowDeductible} disabled={saving} />
            <PrioritySlider label="Mental health coverage" value={priorityMentalHealth} onChange={setPriorityMentalHealth} disabled={saving} />
            <PrioritySlider label="Dental and vision coverage" value={priorityDentalVision} onChange={setPriorityDentalVision} disabled={saving} />
            <PrioritySlider label="Nationwide network (for travel)" value={priorityNationwideNetwork} onChange={setPriorityNationwideNetwork} disabled={saving} />
          </div>

          {/* Save */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <button type="submit" className="btn-sm btn-accent" disabled={saving}>
              {saving ? 'Saving...' : 'Save household'}
            </button>
            {errorMsg && <span style={{ color: '#d95858', fontSize: '0.875rem' }}>{errorMsg}</span>}
            {successMsg && <span style={{ color: '#7a9b76', fontSize: '0.875rem' }}>{successMsg}</span>}
          </div>
        </form>
      </main>
    </div>
  );
}

function PrioritySlider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="form-field" style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <label className="form-label" style={{ margin: 0 }}>{label}</label>
        <span style={{ fontSize: '0.875rem', color: '#7a9b76', fontWeight: 600 }}>{value} / 5</span>
      </div>
      <input
        type="range"
        min="1"
        max="5"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={disabled}
        style={{ width: '100%', accentColor: '#7a9b76' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>
        <span>Not important</span>
        <span>Critical</span>
      </div>
    </div>
  );
}