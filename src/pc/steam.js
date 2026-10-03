const tauri = () => (typeof window !== 'undefined' ? window.__TAURI__ : null);
const invoke = (cmd, args) => tauri()?.core?.invoke?.(cmd, args) ?? Promise.reject(new Error('NO_DESKTOP'));

export const STEAM_SUPPORTER_APP = Number(import.meta.env?.VITE_STEAM_SUPPORTER_APP ?? 0) || null;

let status = { ready: false, steamId: '', appId: 0, deck: false, bigPicture: false, name: '' };

async function refresh() {
  try { status = { ...status, ...(await invoke('steam_status')) }; } catch {}
  document.documentElement.classList.toggle('is-steam', status.ready);
  document.documentElement.classList.toggle('is-deck', status.deck);
  return status;
}

function keyboardFor(field) {
  if (!status.ready || !(status.deck || status.bigPicture)) return;
  const box = field.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  invoke('steam_keyboard', {
    x: Math.round(box.left * dpr), y: Math.round(box.top * dpr),
    w: Math.round(box.width * dpr), h: Math.round(box.height * dpr),
    numeric: field.type === 'number' || field.inputMode === 'numeric'
  }).catch(() => {});
}

export async function initSteam() {
  if (!tauri()) return null;
  await refresh();
  window.wiksterSteam = {
    desktop: true,
    ready: () => status.ready,
    status: () => ({ ...status }),
    ticket: () => invoke('steam_ticket'),
    owns: (app) => invoke('steam_owns', { app }),
    openStore: () => { if (STEAM_SUPPORTER_APP) invoke('steam_store', { app: STEAM_SUPPORTER_APP }).catch(() => {}); },
    openWeb: (url) => invoke('steam_web', { url }).catch(() => false),
    toggleFullscreen: async () => {
      const on = await invoke('is_fullscreen').catch(() => false);
      await invoke('set_fullscreen', { on: !on }).catch(() => {});
    },
    quit: () => invoke('quit').catch(() => {})
  };
  document.addEventListener('focusin', (event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) keyboardFor(field);
  });
  return status;
}
