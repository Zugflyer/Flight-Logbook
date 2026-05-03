// ============================================================================
// Shared Supabase client. Lives in its own module so both data.js and
// logos.js can import it without creating a circular dependency, and so we
// only have ONE GoTrueClient instance (the auth library complains and may
// misbehave if there are two clients sharing the same auth storage).
// ============================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'flightlog.auth',
  },
});
