import { t, getLanguage } from '../i18n.js';
import { supabase } from '../account/client.js';
import { el, openSheet, state, toast } from './core.js';
import { live } from './live.js';
import { isSchemaGap } from '../account/schema.js';
import { parseStamp } from '../days.js';

const SEEN_KEY = 'wikster.seenNotice.v1';

const seen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); }
  catch { return new Set(); }
};
const markSeen = (id) => {
  try {
    const all = seen();
    all.add(String(id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...all].slice(-50)));
  } catch {}
};

async function selfId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch { return null; }
}

export const liveFor = (row, me, now = Date.now(), guild = null) => Boolean(row)
  && (!row.starts_at || parseStamp(row.starts_at) <= now)
  && (!row.ends_at || parseStamp(row.ends_at) > now)
  && (!row.target_user || row.target_user === me)
  && (!row.target_guild || (Boolean(guild) && row.target_guild === guild && !row.target_user));

async function myGuildId(me) {
  if (!me) return null;
  if (state.guild === undefined) {
    try { await import('./guilds.js').then((m) => m.loadMyGuild()); } catch {}
  }
  return state.guild?.id ?? null;
}

async function readNotices(id = null) {
  const me = await selfId();
  const guild = await myGuildId(me);
  const stamp = new Date().toISOString();
  let query = supabase
    .from('announcements')
    .select('id, title_en, title_fr, body_en, body_fr, kind, starts_at, ends_at, target_user, target_guild')
    .lte('starts_at', stamp)
    .or(`ends_at.is.null,ends_at.gt.${stamp}`);
  if (id != null) query = query.eq('id', id);
  query = me ? query.or(`target_user.is.null,target_user.eq.${me}`) : query.is('target_user', null);
  query = guild ? query.or(`target_guild.is.null,target_guild.eq.${guild}`) : query.is('target_guild', null);
  const { data, error } = await query.order('starts_at', { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []).filter((row) => liveFor(row, me, Date.now(), guild));
}

export async function fetchNotice() {
  if (!supabase) return null;
  try {
    const already = seen();
    return (await readNotices()).find((row) => !already.has(String(row.id))) ?? null;
  } catch (err) {
    if (!isSchemaGap(err)) console.warn('announcements', err);
    return null;
  }
}

let showing = null;

function whenFree(run) {
  let tries = 0;
  const attempt = () => {
    if (live.sheet?.open || document.querySelector('.reveal')) {
      if (tries++ < 120) setTimeout(attempt, 500);
      return;
    }
    run();
  };
  attempt();
}

export async function liveNotice(payload) {
  const id = Number(payload?.id);
  if (!supabase || !Number.isFinite(id)) return;
  if (payload.retired) {
    if (showing === id && live.sheet?.open) live.sheet.hide();
    return;
  }
  if (seen().has(String(id))) return;
  let row = null;
  try { [row] = await readNotices(id); } catch { return; }
  if (!row) return;
  whenFree(() => { if (!seen().has(String(row.id))) openNotice(row); });
}

export function paintComposers() {
  const held = state.standing && (!state.standing.until || parseStamp(state.standing.until) > Date.now()) ? state.standing : null;
  for (const node of [el.chatInput, el.chatSend, el.guildChatInput, el.guildChatSend]) if (node) node.disabled = Boolean(held);
}

export function applyStanding(payload) {
  const type = payload?.type;
  if (type === 'mute' || type === 'suspend') {
    state.standing = { muted: type === 'mute', reason: payload.reason ?? '', until: payload.until ?? null };
    paintComposers();
    whenFree(() => openSuspension(state.standing));
    return;
  }
  if (type !== 'clear') return;
  const had = Boolean(state.standing);
  state.standing = null;
  paintComposers();
  if (had) toast(t('standingLifted'));
}

export async function fetchSuspension() {
  if (!supabase) return null;
  try {
    const me = await selfId();
    if (!me) return null;
    const { data, error } = await supabase
      .from('suspensions')
      .select('reason, until, muted')
      .eq('user_id', me)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (data.until && parseStamp(data.until) <= Date.now()) return null;
    return data;
  } catch (err) {
    if (!isSchemaGap(err)) console.warn('suspension', err);
    return null;
  }
}

const pick = (row, field) => {
  const lang = getLanguage() === 'fr' ? 'fr' : 'en';
  return String(row[`${field}_${lang}`] || row[`${field}_en`] || '').trim();
};

const KINDS = { note: 'noticeKindNote', warning: 'noticeKindWarning', gift: 'noticeKindGift', event: 'noticeKindEvent' };

export function openNotice(row) {
  markSeen(row.id);
  showing = Number(row.id);
  const kind = KINDS[row.kind] ? row.kind : 'note';
  openSheet(pick(row, 'title') || t('noticeTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = `notice-sheet notice-${kind}`;
    wrap.dataset.kindLabel = t(KINDS[kind]);
    const text = document.createElement('p');
    text.className = 'notice-body';
    text.textContent = pick(row, 'body');
    wrap.append(text);
    body.append(wrap);
  });
}

export function openSuspension(row) {
  openSheet(t(row.muted ? 'mutedTitle' : 'suspendedTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'notice-sheet notice-warning';
    wrap.dataset.kindLabel = t('noticeKindWarning');
    const lead = document.createElement('p');
    lead.className = 'notice-body';
    lead.textContent = t(row.muted ? 'mutedLead' : 'suspendedLead');
    wrap.append(lead);
    if (row.reason) {
      const why = document.createElement('p');
      why.className = 'notice-reason';
      why.textContent = row.reason;
      wrap.append(why);
    }
    const until = document.createElement('p');
    until.className = 'notice-until';
    until.textContent = row.until
      ? t('noticeUntil', { when: new Date(row.until).toLocaleDateString() })
      : t('noticeUntilLifted');
    wrap.append(until);
    body.append(wrap);
  });
}

function fromDigest(digest) {
  const me = state.account.session?.user?.id ?? null;
  const held = digest.suspension;
  const suspension = held && !(held.until && parseStamp(held.until) <= Date.now()) ? held : null;
  const already = seen();
  const guild = digest.guild?.id ?? null;
  const notice = (Array.isArray(digest.notices) ? digest.notices : [])
    .filter((row) => liveFor(row, me, Date.now(), guild))
    .find((row) => !already.has(String(row.id))) ?? null;
  return [suspension, notice];
}

async function digestNotices() {
  if (!state.account.session) return null;
  try {
    const digest = await (await import('./social.js')).waitFullDigest(8000);
    return digest && 'notices' in digest ? digest : null;
  } catch {
    return null;
  }
}

export function checkNotices() {
  setTimeout(async () => {
    const digest = await digestNotices();
    const [suspension, notice] = digest ? fromDigest(digest) : await Promise.all([fetchSuspension(), fetchNotice()]);
    state.standing = suspension ?? null;
    paintComposers();
    if (!suspension && !notice) return;
    let tries = 0;
    const attempt = () => {
      if (live.sheet?.open || document.querySelector('.reveal')) {
        if (tries++ < 120) setTimeout(attempt, 500);
        return;
      }
      if (suspension) openSuspension(suspension);
      else openNotice(notice);
    };
    attempt();
  }, 2600);
}
