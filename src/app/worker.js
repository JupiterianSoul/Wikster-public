import { getLanguage } from '../i18n.js';

const WARM_AFTER_MS = 12000;
const KEEP_AGAIN_MS = 30000;

export function roomyConnection(connection = typeof navigator === 'undefined' ? null : navigator.connection) {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !/2g|3g/.test(String(connection.effectiveType ?? ''));
}

const loadedAssets = () => {
  try {
    return performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(location.origin) && name.includes('/assets/') && !name.endsWith('.mp3'));
  } catch {
    return [];
  }
};

function tell(message) {
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage(typeof message === 'function' ? message() : message)).catch(() => {});
}

let warmed = false;
function warmWhenRoomy() {
  if (warmed || !roomyConnection()) return;
  warmed = true;
  tell({ type: 'warm', lang: getLanguage() });
}

export function registerShell() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  const keep = () => ({ type: 'keep', urls: loadedAssets() });
  tell(keep);
  setTimeout(() => tell(keep), KEEP_AGAIN_MS);
  setTimeout(() => {
    warmWhenRoomy();
    navigator.connection?.addEventListener?.('change', warmWhenRoomy);
  }, WARM_AFTER_MS);
}
