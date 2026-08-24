// ============================================================================
// Flight Log — app shell
// Tabs, password gate, settings, log module.
// ============================================================================

import { store, onChange, signIn, signOut, loadAll } from './data.js';
import { DEFAULTS } from './config.js';
import { initLog, openManageAirports, openManageAircraft } from './log.js';
import { initStats } from './stats.js';
import { initMap } from './map.js';
import { initStatus } from './status.js';
import { initTrain } from './train.js';

// ---------- Settings (localStorage-backed) ----------
const SETTINGS_KEY = 'flightlog.settings.v1';
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
export const settings = loadSettings();

// ---------- Tabs ----------
const panels = document.getElementById('panels');

/**
 * Switch to the given tab. Updates the .active class on every [data-tab]
 * button anywhere in the document (so the Eurostar logo can also act as
 * a tab trigger) and on every .panel.
 */
function selectTab(target) {
  for (const b of document.querySelectorAll('[data-tab]')) {
    b.classList.toggle('active', b.dataset.tab === target);
  }
  for (const p of panels.querySelectorAll('.panel')) {
    p.classList.toggle('active', p.dataset.panel === target);
  }
  // Expose the active tab to CSS. The header 80/20 split and the blue/grey
  // wordmarks key off this attribute (an attribute is more dependable here
  // than :has(), and it works no matter where the button lives in the DOM).
  document.body.dataset.tab = target;
  // Panels are display:none while inactive, so anything that measures itself
  // (the log's virtual list, maps) reads a height of 0 and renders nothing.
  // Tell them they're visible again.
  window.dispatchEvent(new CustomEvent('flightlog:tab-changed', { detail: { tab: target } }));
}

// Reflect the tab that index.html marks active on first paint.
document.body.dataset.tab =
  document.querySelector('.panel.active')?.dataset.panel || 'log';

// Delegate clicks on any [data-tab] element to selectTab. This handles the
// tabs in the left header box AND the Eurostar logo button in the right one.
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  selectTab(btn.dataset.tab);
});

// ---------- Banner ----------
const banner = document.getElementById('banner');
function showBanner(msg, kind = '') {
  banner.textContent = msg;
  banner.className = 'banner ' + kind;
  banner.classList.remove('hidden');
}
function hideBanner() { banner.classList.add('hidden'); }

// ---------- Password gate modal ----------
const authModal = document.getElementById('auth-modal');
const authBtn = document.getElementById('auth-btn');
const authEmail = document.getElementById('auth-email');
const authPwd = document.getElementById('auth-pwd');
const authSubmit = document.getElementById('auth-submit');
const authMsg = document.getElementById('auth-msg');

function openAuthModal() {
  authModal.classList.remove('hidden');
  setTimeout(() => {
    // Focus email if empty, otherwise password
    (authEmail.value ? authPwd : authEmail).focus();
  }, 50);
}
function closeAuthModal() {
  authModal.classList.add('hidden');
  authPwd.value = '';
  authMsg.textContent = '';
}

authBtn.addEventListener('click', () => {
  if (store.unlocked) {
    document.getElementById('settings-modal').classList.remove('hidden');
  } else {
    openAuthModal();
  }
});

async function handleUnlock() {
  const email = authEmail.value.trim();
  const password = authPwd.value;
  if (!email || !password) {
    authMsg.textContent = 'Email and password are required.';
    return;
  }
  authMsg.textContent = 'Signing in…';
  authSubmit.disabled = true;
  try {
    const result = await signIn(email, password);
    if (!result.ok) {
      authMsg.textContent = result.error || 'Sign-in failed.';
      authPwd.select();
      return;
    }
    authMsg.textContent = 'Loading…';
    await loadAll();
    closeAuthModal();
    reflectAuth();
  } catch (e) {
    authMsg.textContent = 'Error: ' + (e.message || e);
  } finally {
    authSubmit.disabled = false;
  }
}
authSubmit.addEventListener('click', handleUnlock);
authPwd.addEventListener('keydown', e => { if (e.key === 'Enter') handleUnlock(); });
authEmail.addEventListener('keydown', e => { if (e.key === 'Enter') authPwd.focus(); });

// ---------- Settings modal ----------
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const unitSelect = document.getElementById('unit-select');
const settingsClose = document.getElementById('settings-close');
const lockBtn = document.getElementById('lock-btn');

unitSelect.value = settings.unit;
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
settingsClose.addEventListener('click', () => settingsModal.classList.add('hidden'));
unitSelect.addEventListener('change', () => {
  settings.unit = unitSelect.value;
  saveSettings(settings);
  window.dispatchEvent(new CustomEvent('flightlog:settings-changed'));
});
lockBtn.addEventListener('click', async () => {
  await signOut();
  settingsModal.classList.add('hidden');
  reflectAuth();
  openAuthModal();
});

const manageAirportsBtn = document.getElementById('manage-airports-btn');
manageAirportsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  openManageAirports();
});

const manageAircraftBtn = document.getElementById('manage-aircraft-btn');
if (manageAircraftBtn) {
  manageAircraftBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    openManageAircraft();
  });
}

// ---------- Auth state reflection ----------
function reflectAuth() {
  if (store.unlocked) {
    authBtn.textContent = 'Signed in';
    authBtn.classList.add('unlocked');
    authModal.classList.add('hidden');
  } else {
    authBtn.textContent = 'Sign in';
    authBtn.classList.remove('unlocked');
  }
}

onChange(evt => {
  if (!evt || typeof evt !== 'object') return;
  if (evt.type === 'init:done') {
    reflectAuth();
    if (!store.unlocked) {
      showBanner('Sign in to view your flights.');
      openAuthModal();
    }
  }
  if (evt.type === 'data:loaded') {
    showBanner(`Loaded ${evt.counts.flights} flights and ${evt.counts.airports} airports.`, 'success');
    setTimeout(hideBanner, 2500);
  }
  if (evt.type === 'auth:locked') {
    showBanner('Signed out.');
  }
});

// ---------- Init log module ----------
initLog();
initStats();
initMap();
initStatus();
initTrain();
