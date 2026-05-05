// ============================================================================
// Flight Log — settings (isolated module)
// Kept separate from app.js so log.js can import `settings` without creating
// a circular dependency (app.js → log.js → app.js).
// ============================================================================

import { DEFAULTS } from './config.js';

const SETTINGS_KEY = 'flightlog.settings.v1';

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export const settings = loadSettings();
