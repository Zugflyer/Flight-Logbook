// ============================================================================
// Flight Log — airline logo storage
//
// Logos live in a Supabase Storage bucket called 'airline-logos'.
// A small lookup table (public.airline_logos) maps IATA codes to file paths.
//
// At app load, we fetch the full lookup once and keep it in memory. Updates
// go straight to Supabase + the in-memory map; no need to refetch.
// ============================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = 'airline-logos';

// In-memory map: IATA -> { path, ext, url }
const logoMap = new Map();
let loaded = false;
const listeners = new Set();

export function onLogoChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify(iata) {
  for (const fn of listeners) fn(iata);
  window.dispatchEvent(new CustomEvent('flightlog:logo-changed', { detail: { iata } }));
}

// ---------- Initial load ----------
export async function loadLogos() {
  const { data, error } = await sb.from('airline_logos').select('*');
  if (error) {
    console.error('Failed to load airline logos:', error);
    return;
  }
  logoMap.clear();
  for (const row of data) {
    const url = sb.storage.from(BUCKET).getPublicUrl(row.path).data.publicUrl;
    logoMap.set(row.iata.toUpperCase(), { path: row.path, ext: row.ext, url });
  }
  loaded = true;
}

export function isLoaded() { return loaded; }

// ---------- Lookup ----------
export function getLogoUrl(iata) {
  if (!iata) return null;
  return logoMap.get(iata.toUpperCase())?.url || null;
}

export function hasLogo(iata) {
  return !!iata && logoMap.has(iata.toUpperCase());
}

// ---------- Upload ----------
/**
 * Upload a logo file for the given IATA code. Replaces any existing logo.
 * Returns the new public URL.
 */
export async function uploadLogo(iata, file) {
  if (!iata || !file) throw new Error('iata and file required');
  const code = iata.toUpperCase();

  // Determine extension. We trust the file's MIME type first, then filename.
  let ext = 'png';
  if (file.type === 'image/svg+xml') ext = 'svg';
  else if (file.type === 'image/jpeg' || file.type === 'image/jpg') ext = 'jpg';
  else if (file.type === 'image/png') ext = 'png';
  else if (file.type === 'image/webp') ext = 'webp';
  else {
    // Fall back to filename extension
    const m = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m && ['png','svg','jpg','jpeg','webp'].includes(m[1])) {
      ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    }
  }

  const path = `${code}.${ext}`;

  // If there's an existing logo with a different extension, delete it first
  const existing = logoMap.get(code);
  if (existing && existing.path !== path) {
    await sb.storage.from(BUCKET).remove([existing.path]);
  }

  // Upload (upsert overwrites if same path)
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext}`,
    cacheControl: '3600',
  });
  if (upErr) throw upErr;

  // Update lookup table
  const { error: dbErr } = await sb.from('airline_logos').upsert({
    iata: code, path, ext, uploaded_at: new Date().toISOString(),
  });
  if (dbErr) throw dbErr;

  // Update in-memory map. Add a cache-buster so the new image actually
  // appears (browsers cache previous URLs aggressively).
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
  logoMap.set(code, { path, ext, url });
  notify(code);
  return url;
}

// ---------- Delete ----------
export async function removeLogo(iata) {
  if (!iata) return;
  const code = iata.toUpperCase();
  const existing = logoMap.get(code);
  if (!existing) return;

  await sb.storage.from(BUCKET).remove([existing.path]);
  await sb.from('airline_logos').delete().eq('iata', code);
  logoMap.delete(code);
  notify(code);
}

// ---------- File picker helper ----------
/**
 * Open the OS file picker, restricted to image files.
 * Resolves with the selected File, or null if cancelled.
 */
export function pickLogoFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/svg+xml,image/jpeg,image/webp';
    input.style.display = 'none';
    document.body.appendChild(input);

    let resolved = false;
    const finish = (file) => {
      if (resolved) return;
      resolved = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => {
      finish(input.files?.[0] || null);
    });
    // Fallback: if user cancels, browser doesn't fire 'change'. We resolve
    // null on next focus event.
    window.addEventListener('focus', () => {
      setTimeout(() => finish(null), 300);
    }, { once: true });

    input.click();
  });
}
