const w = () => (typeof window !== 'undefined' ? window : {});

export const hasNativeHaptics = () => Boolean(w().WiksterHaptics?.pulse);

export function pulse(ms = 12, strength = 0.5) {
  const b = w().WiksterHaptics;
  if (b?.pulse) {
    try { b.pulse(Math.round(ms), Math.max(0, Math.min(1, strength))); return true; } catch { return false; }
  }
  try { return Boolean(navigator.vibrate?.(ms)); } catch { return false; }
}

export function tick() {
  const b = w().WiksterHaptics;
  if (b?.tick) { try { b.tick(); return; } catch {} }
  pulse(6, 0.3);
}

export const canShare = () => Boolean(w().WiksterShare?.share || (typeof navigator !== 'undefined' && navigator.share));

export async function share({ title = '', text = '', url = '' }) {
  const b = w().WiksterShare;
  if (b?.share) {
    try { b.share(String(title), String(text), String(url)); return true; } catch { return false; }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ title, text, url: url || undefined }); return true; } catch { return false; }
  }
  return false;
}
