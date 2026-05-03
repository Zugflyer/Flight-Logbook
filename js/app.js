// ============================================================================
// Flight Log — app shell
// Tabs, password gate, settings, log module.
// ============================================================================

import { store, onChange, isUnlocked, tryUnlock, lock, loadAll } from './data.js';
import { DEFAULTS } from './config.js';
import { initLog, openManageAirports } from './log.js';
import { initStats } from './stats.js';
import { initMap } from './map.js';

// ---------- Settings (localStorage-backed) ----------
const SETTINGS_KEY = 'flightlog.settings.v1';
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
export const settings = loadSettings();

// ---------- Tabs ----------
const tabs = document.getElementById('tabs');
const panels = document.getElementById('panels');
tabs.addEventListener('click', e => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  const target = btn.dataset.tab;
  for (const b of tabs.querySelectorAll('button')) b.classList.toggle('active', b === btn);
  for (const p of panels.querySelectorAll('.panel'))
    p.classList.toggle('active', p.dataset.panel === target);
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
const authPwd = document.getElementById('auth-pwd');
const authSubmit = document.getElementById('auth-submit');
const authMsg = document.getElementById('auth-msg');

function openAuthModal() {
  authModal.classList.remove('hidden');
  setTimeout(() => authPwd.focus(), 50);
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
  const pw = authPwd.value;
  if (!tryUnlock(pw)) {
    authMsg.textContent = 'Wrong password.';
    authPwd.select();
    return;
  }
  authMsg.textContent = 'Loading…';
  authSubmit.disabled = true;
  try {
    await loadAll();
    closeAuthModal();
    reflectAuth();
  } catch (e) {
    authMsg.textContent = 'Error loading data: ' + (e.message || e);
  } finally {
    authSubmit.disabled = false;
  }
}
authSubmit.addEventListener('click', handleUnlock);
authPwd.addEventListener('keydown', e => { if (e.key === 'Enter') handleUnlock(); });

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
lockBtn.addEventListener('click', () => {
  lock();
  settingsModal.classList.add('hidden');
  reflectAuth();
  openAuthModal();
});

const manageAirportsBtn = document.getElementById('manage-airports-btn');
manageAirportsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
  openManageAirports();
});

// ---------- Auth state reflection ----------
function reflectAuth() {
  if (store.unlocked) {
    authBtn.textContent = 'Unlocked';
    authBtn.classList.add('unlocked');
    authModal.classList.add('hidden');
  } else {
    authBtn.textContent = 'Unlock';
    authBtn.classList.remove('unlocked');
  }
}

onChange(evt => {
  if (!evt || typeof evt !== 'object') return;
  if (evt.type === 'init:done') {
    reflectAuth();
    if (!store.unlocked) {
      showBanner('Locked. Click "Unlock" to view your flights.');
      openAuthModal();
    }
  }
  if (evt.type === 'data:loaded') {
    showBanner(`Loaded ${evt.counts.flights} flights and ${evt.counts.airports} airports.`, 'success');
    setTimeout(hideBanner, 2500);
  }
  if (evt.type === 'auth:locked') {
    showBanner('Locked.');
  }
});

// ---------- Init log module ----------
initLog();
initStats();
initMap();
