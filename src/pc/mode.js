export const LAYOUT_KEY = 'wikster.layout.v1';
export const SCALE_KEY = 'wikster.uiScale.v1';

const forcedByUrl = () => {
  try { return new URLSearchParams(location.search).get('layout'); } catch { return null; }
};

export function layoutChoice() {
  const url = forcedByUrl();
  if (url === 'pc' || url === 'mobile') return url;
  if (globalThis.WIKSTER_STEAM || globalThis.__TAURI_INTERNALS__) return 'pc';
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved === 'pc' || (saved === 'mobile' && navigator.webdriver)) return saved;
  } catch {}
  return 'auto';
}

export const PC_QUERY = '(hover: hover) and (pointer: fine)';

const phoneAgent = () => {
  if (navigator.userAgentData) return navigator.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

export function wantsPc() {
  const choice = layoutChoice();
  if (choice !== 'auto') return choice === 'pc';
  return typeof matchMedia === 'function' && matchMedia(PC_QUERY).matches && !phoneAgent();
}

export function setLayoutChoice(choice) {
  try {
    if (choice === 'auto') localStorage.removeItem(LAYOUT_KEY);
    else localStorage.setItem(LAYOUT_KEY, choice);
  } catch {}
}

export function uiScale() {
  try {
    const n = Number(localStorage.getItem(SCALE_KEY));
    if (n >= 0.7 && n <= 1.6) return n;
  } catch {}
  return typeof innerHeight === 'number' && innerHeight <= 820 ? 1.12 : 1;
}

export function setUiScale(n) {
  try { localStorage.setItem(SCALE_KEY, String(n)); } catch {}
  applyScale();
}

export function applyScale() {
  document.documentElement.style.setProperty('--pc-scale', String(uiScale()));
}

export const isPc = wantsPc();

if (isPc) {
  document.documentElement.classList.add('is-pc');
  applyScale();
}
