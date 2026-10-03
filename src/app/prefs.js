import { pulse } from '../ui/native.js';
import { t } from '../i18n.js';
import { synth } from '../ui/sound.js';
import { press } from '../ui/components.js';
import { music } from '../ui/music.js';
import { backdrop } from '../ui/backdrop.js';
import { el, rememberLook, settings, state } from './core.js';
import { applyMatureLock } from './mature.js';

export function settingsRowShell(titleKey, noteKey) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>`;
  row.querySelector('h4').textContent = t(titleKey);
  row.querySelector('p').textContent = t(noteKey);
  return row;
}

export function settingsRowButton(row, label, run) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-ghost row-action';
  btn.textContent = label;
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); run(btn); });
  row.appendChild(btn);
  return btn;
}

export function paintSyncLine(row) {
  const line = row?.querySelector('p');
  if (!line) return;
  if (state.account.syncing) { line.textContent = t('accountSyncing'); return; }
  if (state.account.failed) { line.textContent = t('accountSyncFailed'); return; }
  if (!state.account.syncedAt) { line.textContent = t('accountSyncNote'); return; }
  const mins = Math.floor((Date.now() - state.account.syncedAt) / 60000);
  line.textContent = t('accountSynced', {
    when: mins < 1 ? t('accountJustNow') : t('accountMinsAgo', { n: mins })
  });
}

export function renderAccountRow() {
  return (paintSyncLine(el.dataList.querySelector('[data-account="sync"]')));
}

export function buzz(ms = 12, strength = Math.min(1, ms / 50)) {
  if (settings().haptics === false) return;
  pulse(ms, strength);
}

export let wakeLock = null;

export async function holdWakeLock() {
  if (settings().awake === false || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock?.request('screen') ?? null;
    wakeLock?.addEventListener?.('release', () => { wakeLock = null; });
  } catch {}
}

export function releaseWakeLock() {
  try { wakeLock?.release?.(); } catch {}
  wakeLock = null;
}

export function applySettings() {
  const s = settings();
  document.documentElement.dataset.lowpower = s.lowPower ? '1' : '0';
  rememberLook({ lp: s.lowPower ? 1 : 0 });
  document.documentElement.dataset.hints = s.hints ? '1' : '0';
  document.documentElement.dataset.prices = s.prices === false ? '0' : '1';
  document.documentElement.dataset.blurAdult = s.blurAdult ? '1' : '0';
  applyMatureLock();
  document.documentElement.dataset.rarityShapes = s.rarityShapes ? '1' : '0';
  if (s.awake === false) releaseWakeLock();
  synth.setMuted(!s.sound);
  synth.setVolume(s.volume ?? 1);
  music.setVolume(s.musicVolume ?? 0.4);
  music.setOn(s.music !== false);
  backdrop.setLowPower(s.lowPower);
}
