// ============================================================================
// Flight Log — config
//
// SUPABASE_URL and SUPABASE_ANON_KEY are safe to put in client-side code:
//   • The anon (publishable) key only grants the permissions you've defined
//     in your Row Level Security policies. With the policies in
//     sql/03_rls_lockdown.sql, anonymous users can only SELECT.
//   • Writes require a real Supabase user session — sign in via the Unlock
//     dialog. Sessions persist in localStorage between visits.
// ============================================================================

export const SUPABASE_URL  = 'https://hgnemihlqicszoxrijqb.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lMrYi9ZPVj3XtRqSk0jGiQ_M7v0C2D_';

// Default settings
export const DEFAULTS = {
  unit: 'km',
};
