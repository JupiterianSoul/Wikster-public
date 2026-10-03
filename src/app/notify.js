const bridge = () => (typeof window !== 'undefined' ? window.WiksterNotify : null);

export const inWrapper = () => Boolean(bridge()?.notify);

export function notifyState() {
  const b = bridge();
  if (b?.notify) { try { return b.enabled() ? 'on' : 'off'; } catch { return 'on'; } }
  if (typeof Notification === 'undefined') return 'none';
  return Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'off' : 'ask';
}

export async function askNotify() {
  const b = bridge();
  if (b?.request) { try { b.request(); } catch {} return notifyState(); }
  if (typeof Notification === 'undefined') return 'none';
  try { await Notification.requestPermission(); } catch {}
  return notifyState();
}

export const shouldNotify = () => notifyState() === 'on' && document.visibilityState !== 'visible';

export function systemNotify(title, body, tag = 'wikster') {
  const b = bridge();
  if (b?.notify) {
    try { b.notify(String(title ?? ''), String(body ?? ''), String(tag)); return true; } catch { return false; }
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const note = new Notification(String(title ?? ''), { body: String(body ?? ''), tag: String(tag), icon: 'icons/icon-192.png' });
    note.onclick = () => {
      try { window.focus(); } catch {}
      note.close();
      try { window.wiksterOpenTag?.(String(tag)); } catch {}
    };
    return true;
  } catch {
    return false;
  }
}

export function clearNotify(tag = 'wikster') {
  const b = bridge();
  if (b?.clear) { try { b.clear(String(tag)); } catch {} }
}
