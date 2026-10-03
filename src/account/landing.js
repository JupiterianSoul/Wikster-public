import { supabase } from './client.js';

const HASH_KEYS = ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'provider_token', 'provider_refresh_token', 'error', 'error_code', 'error_description', 'sb'];
const QUERY_KEYS = ['code', 'token_hash', 'type', 'error', 'error_code', 'error_description'];
const OTP_TYPES = new Set(['recovery', 'signup', 'invite', 'magiclink', 'email', 'email_change']);
const PKCE_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESUME_KEY = 'wikster.recovering';

export function parseLanding(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const query = url.searchParams;
  const both = (k) => hash.get(k) ?? query.get(k);
  if (both('error_code') || both('error_description')) {
    return { kind: 'error', code: both('error_code') ?? both('error') ?? '', text: both('error_description') ?? '' };
  }
  if (hash.get('access_token') && hash.get('refresh_token')) {
    return { kind: 'tokens', type: hash.get('type') ?? '', access: hash.get('access_token'), refresh: hash.get('refresh_token') };
  }
  if (query.get('token_hash') && OTP_TYPES.has(query.get('type') ?? 'recovery')) {
    return { kind: 'otp', type: query.get('type') ?? 'recovery', tokenHash: query.get('token_hash') };
  }
  if (PKCE_CODE.test(query.get('code') ?? '')) return { kind: 'code', code: query.get('code'), type: query.get('type') ?? '' };
  return null;
}

export function cleanLanding(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const k of HASH_KEYS) hash.delete(k);
  for (const k of QUERY_KEYS) url.searchParams.delete(k);
  const rest = hash.toString();
  url.hash = rest ? `#${rest}` : '';
  return url.href;
}

function takeFromUrl() {
  if (typeof location === 'undefined') return null;
  const found = parseLanding(location.href);
  if (!found) return null;
  try { history.replaceState(history.state, '', cleanLanding(location.href)); } catch {}
  return found;
}

const landed = takeFromUrl();

export function takeLanding() {
  if (landed) return landed;
  try {
    const id = sessionStorage.getItem(RESUME_KEY);
    if (id) return { kind: 'resume', user: id };
  } catch {}
  return null;
}

export function markRecovering(userId) {
  try {
    if (userId) sessionStorage.setItem(RESUME_KEY, userId);
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {}
}

const expired = (code, text) => /otp_expired|expired|invalid|already.?used|not.?found|refresh.?token/i.test(`${code} ${text}`);

function problem(error) {
  const raw = `${error?.code ?? ''} ${error?.message ?? error ?? ''}`;
  if (/failed to fetch|network|load failed/i.test(raw)) return { problem: 'offline' };
  if (expired('', raw) || error?.status === 401 || error?.status === 403) return { problem: 'expired' };
  return { problem: 'broken' };
}

export async function settleLanding(found) {
  if (!found) return null;
  if (found.kind === 'error') return { problem: expired(found.code, found.text) ? 'expired' : 'broken' };
  if (!supabase) return { problem: 'broken' };
  try {
    if (found.kind === 'resume') {
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;
      if (!session || session.user?.id !== found.user) { markRecovering(null); return null; }
      return { recovery: true, session };
    }
    if (found.kind === 'tokens') {
      const { data, error } = await supabase.auth.setSession({ access_token: found.access, refresh_token: found.refresh });
      if (error) return problem(error);
      return { recovery: found.type === 'recovery', session: data.session };
    }
    if (found.kind === 'otp') {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: found.tokenHash, type: found.type });
      if (error) return problem(error);
      return { recovery: found.type === 'recovery', session: data.session };
    }
    if (found.kind === 'code') {
      const { data, error } = await supabase.auth.exchangeCodeForSession(found.code);
      if (error) return { problem: 'device' };
      return { recovery: data.redirectType === 'PASSWORD_RECOVERY' || found.type === 'recovery', session: data.session };
    }
  } catch (error) {
    return problem(error);
  }
  return null;
}
