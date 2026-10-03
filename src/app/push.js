import { supabase } from '../account.js';
import { getLanguage } from '../i18n.js';

const bridge = () => (typeof window !== 'undefined' ? window.WiksterPush : null);
const SENT_KEY = 'wikster.pushToken';

let signedIn = false;

async function send(token) {
  if (!signedIn || !token || !supabase) return;
  const lang = getLanguage() === 'fr' ? 'fr' : 'en';
  const stamp = `${token}|${lang}`;
  try { if (localStorage.getItem(SENT_KEY) === stamp) return; } catch {}
  let failed = true;
  try { failed = Boolean((await supabase.rpc('register_push_token', { p_token: token, p_platform: 'android', p_lang: lang })).error); } catch {}
  if (!failed) { try { localStorage.setItem(SENT_KEY, stamp); } catch {} }
}

export function registerPush() {
  const b = bridge();
  if (!b?.token) return;
  signedIn = true;
  window.wiksterPushToken = (token) => { send(String(token ?? '')).catch(() => {}); };
  try { send(String(b.token() ?? '')).catch(() => {}); } catch {}
}

export async function forgetPush() {
  const b = bridge();
  signedIn = false;
  if (!b?.token || !supabase) return;
  let token = '';
  try { token = String(b.token() ?? ''); } catch {}
  try { localStorage.removeItem(SENT_KEY); } catch {}
  if (token) { try { await supabase.rpc('drop_push_token', { p_token: token }); } catch {} }
}
