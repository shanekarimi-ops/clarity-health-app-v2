import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://slowraapenoaddikqexh.supabase.co';
const supabaseKey = 'sb_publishable_aMkMph-McXKE7mR7jgnAjw_KlwXXZod';

export const supabase = createClient(supabaseUrl, supabaseKey);