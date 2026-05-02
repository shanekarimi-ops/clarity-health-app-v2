// Account type helpers
// Reads the account_type from a Supabase auth user's metadata.
// Falls back gracefully for users created before account_type existed.

export type AccountType = 'individual' | 'broker' | 'hr_employer';

export function getAccountType(user: any): AccountType {
  const stored = user?.user_metadata?.account_type;

  if (stored === 'broker' || stored === 'hr_employer' || stored === 'individual') {
    return stored;
  }

  // Legacy users: infer from older 'role' field, default to individual
  const legacyRole = user?.user_metadata?.role;
  if (legacyRole === 'Broker') return 'broker';
  if (legacyRole === 'HR') return 'hr_employer';

  return 'individual';
}

// Returns the right home/dashboard URL for a given account type.
export function dashboardPathFor(accountType: AccountType): string {
  if (accountType === 'broker') return '/broker/dashboard';
  return '/profile';
}