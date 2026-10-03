import { regional, USERNAME_RE, supabase } from './client.js';
import { ensureProfile } from './profile.js';
import { SITE_URL, isBundledCopy, isDesktopApp } from '../version.js';
import { androidApp } from '../platform.js';

export function resetOpensOnWeb() {
  return isDesktopApp() || isBundledCopy() || androidApp();
}

export function authRedirect() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol) || resetOpensOnWeb()) return SITE_URL;
  return new URL('./', location.href).href;
}

export async function verifySession(session) {
  if (!session?.access_token || !supabase) return session ?? null;
  try {
    const answer = await Promise.race([
      supabase.auth.getUser(session.access_token),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 4000))
    ]);
    if (answer.timeout) return session;
    const { error } = answer;
    if (!error) return session;
    const gone = error.status === 401 || error.status === 403
      || /not (found|exist)|does not exist|invalid/i.test(String(error.message ?? ''));
    if (!gone) return session;
  } catch {
    return session;
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return null;
}

export async function currentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export function onAuthChange(fn) {
  return (supabase?.auth.onAuthStateChange((_event, session) => fn(session)));
}

const TRIES_KEY = 'wikster.authTries';
const FREE_TRIES = { signin: 5, reset: 3 };

function readTries() {
  try { return JSON.parse(localStorage.getItem(TRIES_KEY) ?? '{}') ?? {}; } catch { return {}; }
}

function writeTries(all) {
  try { localStorage.setItem(TRIES_KEY, JSON.stringify(all)); } catch {}
}

function holdOff(kind) {
  const entry = readTries()[kind];
  if (entry?.until && entry.until > Date.now()) throw new Error('too many tries, wait a moment');
}

function noteTry(kind, failed) {
  const all = readTries();
  if (!failed) { delete all[kind]; writeTries(all); return; }
  const entry = all[kind] ?? { n: 0, until: 0 };
  entry.n += 1;
  const over = entry.n - FREE_TRIES[kind];
  entry.until = over > 0 ? Date.now() + Math.min(15 * 60, 15 * 2 ** (over - 1)) * 1000 : 0;
  all[kind] = entry;
  writeTries(all);
}

export async function signIn(email, password) {
  holdOff('signin');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(), password
  });
  if (error) {
    if (/invalid login/i.test(String(error.message))) noteTry('signin', true);
    throw error;
  }
  noteTry('signin', false);
  return data.session;
}

export async function signUp(email, password, meta = {}) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: meta, emailRedirectTo: authRedirect() } });
  if (error) throw error;
  return { session: data.session, needsConfirmation: !data.session };
}

export async function claimUsername(userId, username) {
  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) throw new Error('username invalid');

  const { data: free, error: checkError } = await supabase.rpc('username_available', { name });
  if (checkError) throw checkError;
  if (!free) return null;

  return ensureProfile(userId, name);
}

export async function confirmAge(meta) {
  const { data, error } = await supabase.auth.updateUser({ data: meta });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function sendReset(email) {
  holdOff('reset');
  noteTry('reset', true);
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect() });
  if (error) throw error;
}

export async function setNewPassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  noteTry('reset', false);
  return data.user;
}

export async function signInWithSteam(ticket, { link = false } = {}) {
  if (!supabase) throw new Error('offline');
  const { data, error } = await supabase.functions.invoke(regional('steam-auth'), { body: { ticket, link } });
  if (error) {
    let detail = null;
    try { detail = await error.context?.json?.(); } catch {}
    throw new Error(detail?.error ?? 'steam sign-in failed');
  }
  if (link) return data;
  const { data: session, error: otpError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (otpError) throw otpError;
  return session.session;
}
