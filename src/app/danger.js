import { getLanguage, t } from '../i18n.js';
import * as account from '../account.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { press } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { WIPE_EVERY_DAYS, starterCoins } from '../economy.js';
import { DAY_MS, utcDateText } from '../days.js';
import { CURRENCY_NAME, formatAmount } from '../pricing.js';
import { DEFAULT_THEME } from '../ui/themes.js';
import { esc, openSheet, state, toast, useTheme } from './core.js';
import { live } from './live.js';
import { reloadFromStorage, signedIn, userId } from './gate.js';
import { econ, econStateNow, economyIdle, onServerState, serverEconomy } from './econ.js';
import { confirmSoon, forgetReady, openingPending, scheduleReady } from './ready.js';

const NOTE_KEY = 'wikster.dangerNote';
const KEEP = new Set([
  'wikster.agelock.v1', 'wikster.language', 'wikster.ripDirection', 'wikster.layout.v1', 'wikster.uiScale.v1',
  'wikster.pcTabs.v1', 'wikster.panel.v1', 'wikster.authTries', 'wikster.seenRelease.v1'
]);
const NOTES = {
  all: ['dangerAllDone', 'ok'],
  account: ['dangerAccountDone', 'ok'],
  'all-elsewhere': ['dangerAllElsewhere', 'error'],
  'account-elsewhere': ['dangerAccountElsewhere', 'error']
};
const SETUP = {
  cards: {
    title: 'dangerCardsTitle', lead: 'dangerCardsLead', gone: 'dangerCardsGone', kept: 'dangerCardsKept',
    guestGone: 'dangerGuestCardsGone', guestKept: 'dangerGuestCardsKept', word: 'dangerWordCards', go: 'settingsCardWipe', claim: 'wipecards'
  },
  all: {
    title: 'dangerAllTitle', lead: 'dangerAllLead', guestLead: 'dangerGuestAllLead', gone: 'dangerAllGone', kept: 'dangerAllKept',
    guestGone: 'dangerGuestAllGone', guestKept: 'dangerGuestAllKept', word: 'dangerWordAll', go: 'settingsReset', claim: 'wipe'
  },
  account: {
    title: 'dangerAccountTitle', lead: 'dangerAccountLead', gone: 'dangerAccountGone', kept: 'dangerAccountKept',
    word: 'dangerWordAccount', go: 'dangerGoAccount'
  }
};

let busy = false;
let holding = null;
let leaving = false;
let refreshing = false;
let knownAt = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lines = (text) => String(text).split('\n').map((s) => s.trim()).filter(Boolean);
const period = (now = Date.now()) => Math.floor(now / (WIPE_EVERY_DAYS * DAY_MS));
const nextAt = (now = Date.now()) => (period(now) + 1) * WIPE_EVERY_DAYS * DAY_MS;
const dateText = (ms) => utcDateText(ms, getLanguage(), { day: 'numeric', month: 'long', year: 'numeric' });
const amountText = () => `${formatAmount(starterCoins())} ${CURRENCY_NAME}`;
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const normal = (text) => String(text ?? '').trim().toLocaleUpperCase();
const wipedAt = (st) => Number(st?.wiped?.at) || 0;

function block(kind, title, items) {
  return h(`div.danger-block${kind ? `.${kind}` : ''}`, h('h5', title), h('ul', items.map((item) => h('li', item))));
}

export function openDanger(which) {
  const set = SETUP[which];
  if (!set) return;
  if (which === 'account' && !signedIn()) {
    toast(esc(t('settingsDeleteNoAccount')), 'error');
    synth.playDenied();
    return;
  }
  const guest = !signedIn();
  const word = t(set.word);
  openSheet(t(set.title), (body) => {
    const status = h('p.find-status', { role: 'status' });
    const when = h('p.danger-when', which === 'account' ? t('dangerForever') : (guest ? '' : t('dangerMonthly')));
    when.hidden = !when.textContent;
    const input = h('input.creator-input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
      'aria-label': t('dangerType', { word }), dataset: { dangerWord: which }
    });
    const go = h('button.btn.btn-danger.btn-block', { type: 'button', disabled: true, dataset: { dangerGo: which } }, t(set.go));
    let refused = false;
    const paint = () => { go.disabled = refused || busy || normal(input.value) !== normal(word); };
    input.addEventListener('input', paint);
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !go.disabled) go.click(); });
    press(go, { sound: null });
    go.addEventListener('click', () => {
      if (go.disabled) return;
      runDanger(which, { go, input, status, paint }).catch(() => {});
    });
    body.append(h('div.danger-sheet',
      h('p.danger-lead', t(guest && set.guestLead ? set.guestLead : set.lead)),
      block('is-gone', t('dangerGoes'), lines(t(guest && set.guestGone ? set.guestGone : set.gone, { amount: amountText() }))),
      block('', t('dangerStays'), lines(t(guest && set.guestKept ? set.guestKept : set.kept))),
      when,
      h('p.danger-type', t('dangerType', { word })),
      input,
      go,
      status));
    if (!guest && set.claim && serverEconomy() && online()) {
      account.wipeTaken(userId(), `${set.claim}:${period()}`).then((taken) => {
        if (!taken) return;
        refused = true;
        when.hidden = false;
        when.textContent = t('dangerMonthlyUsed', { date: dateText(nextAt()) });
        paint();
      }).catch(() => {});
    }
  });
}

function say(ui, key, kind = 'error') {
  ui.status.textContent = t(key);
  ui.status.className = `find-status is-${kind}`;
}

async function settleOpenings(ms = 10000) {
  const end = Date.now() + ms;
  await Promise.race([economyIdle(), wait(ms)]);
  if (!openingPending()) return true;
  confirmSoon(0);
  while (openingPending() && Date.now() < end) await wait(250);
  return !openingPending();
}

async function accountGone() {
  try {
    const session = await account.currentSession();
    if (!session) return false;
    return (await account.verifySession(session)) === null;
  } catch {
    return false;
  }
}

async function runDanger(which, ui) {
  if (busy || leaving) return;
  if (which !== 'account' && !signedIn()) { localOnly(which); return; }
  if (!online()) { say(ui, 'dangerOffline'); synth.playDenied(); return; }
  if (which !== 'account' && !serverEconomy()) { say(ui, 'dangerNoServer'); synth.playDenied(); return; }
  busy = true;
  holding = which;
  ui.go.disabled = true;
  ui.input.disabled = true;
  say(ui, 'dangerWorking', 'working');
  account.holdSync(true);
  const before = wipedAt(econStateNow());
  let res = null;
  let code = '';
  try {
    if (which === 'account') {
      await Promise.race([economyIdle(), wait(8000)]);
      await account.deleteAccount();
    } else {
      if (!(await settleOpenings())) throw new Error('OPENINGS_PENDING');
      res = await econ('wipe', { scope: which }, { timeout: 30000 });
    }
  } catch (error) {
    code = String(error?.message ?? 'FAILED');
  }
  if (code && which === 'account' && await accountGone()) code = '';
  if (code && which !== 'account' && code !== 'ALREADY_CLAIMED' && code !== 'OPENINGS_PENDING') {
    const now = await econ('snapshot', { since: null }, { quiet: true }).catch(() => null);
    if (now?.state && wipedAt(now.state) > before && now.state.wiped?.scope === which) { res = now; code = ''; }
  }
  if (code) {
    busy = false;
    holding = null;
    account.holdSync(false);
    ui.input.disabled = false;
    ui.paint();
    say(ui, code === 'OPENINGS_PENDING' ? 'dangerBusy'
      : code === 'ALREADY_CLAIMED' ? 'econWipeWait'
        : ['TIMEOUT', 'CLOSED', 'NOT_LIVE', 'SERVER_DOWN'].includes(code) ? 'dangerNoServer'
          : code === 'UNAUTHORISED' ? 'dangerSignInAgain'
            : which === 'account' ? 'dangerAccountFailed' : 'dangerFailed');
    synth.playDenied();
    return;
  }
  knownAt = Math.max(knownAt, wipedAt(res?.state));
  if (which === 'cards') finishCards();
  else if (which === 'all') leave('all', true);
  else await finishAccount();
}

function resetLooks() {
  state.badgeLoadout = null;
  store.saveBadgeLoadout(null);
  useTheme(DEFAULT_THEME);
}

function finishCards() {
  forgetReady();
  resetLooks();
  account.holdSync(false);
  busy = false;
  holding = null;
  live.sheet?.hide();
  reloadFromStorage();
  scheduleReady(0);
  synth.playResolved();
  toast(esc(t('settingsCardWipeDone')), 'ok');
}

function localOnly(which) {
  if (which === 'all') { leave('all', true); return; }
  const kept = {};
  for (const [key, entry] of Object.entries(state.collection.entries ?? {})) if (entry?.special) kept[key] = entry;
  state.collection.entries = kept;
  store.saveCollection(state.collection);
  for (const [id, slot] of Object.entries(state.inventory)) if (slot?.spec?.kind !== 'code') delete state.inventory[id];
  store.saveInventory(state.inventory);
  store.saveWallet(starterCoins());
  forgetReady();
  resetLooks();
  live.sheet?.hide();
  reloadFromStorage();
  synth.playResolved();
  toast(esc(t('settingsCardWipeDone')), 'ok');
}

export function clearLocal({ keepAuth = false } = {}) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (KEEP.has(key) || (keepAuth && key.startsWith('wikster.auth'))) continue;
      localStorage.removeItem(key);
    }
  } catch {}
  try { sessionStorage.clear(); } catch {}
}

function leave(note, keepAuth) {
  leaving = true;
  account.holdSync(true);
  store.freezeWrites();
  clearLocal({ keepAuth });
  try { localStorage.setItem(NOTE_KEY, note); } catch {}
  location.reload();
}

async function finishAccount() {
  leaving = true;
  account.holdSync(true);
  await Promise.race([account.supabase?.auth.signOut({ scope: 'local' }), wait(3000)]).catch(() => {});
  leave('account', false);
}

async function refreshAfterCards() {
  if (refreshing) return;
  refreshing = true;
  try {
    await Promise.race([economyIdle(), wait(8000)]);
    forgetReady();
    if (serverEconomy()) await econ('snapshot', { since: null }, { quiet: true }).catch(() => null);
    resetLooks();
    reloadFromStorage();
    scheduleReady(0);
    toast(esc(t('dangerCardsElsewhere')));
  } finally {
    refreshing = false;
  }
}

function heardWipe(payload) {
  const at = Number(payload?.at) || 0;
  if (holding || leaving || !signedIn() || (at && at <= knownAt)) return;
  knownAt = Math.max(knownAt, at);
  if (payload?.scope === 'all') leave('all-elsewhere', true);
  else if (payload?.scope === 'cards') refreshAfterCards().catch(() => {});
}

async function heardGone() {
  if (holding === 'account' || leaving || !signedIn()) return;
  if (!(await accountGone())) return;
  leave('account-elsewhere', false);
}

account.onLive('wiped', ({ payload }) => heardWipe(payload));
account.onLive('gone', () => { heardGone().catch(() => {}); });
onServerState((was, now) => {
  const at = wipedAt(now);
  if (!at || holding || leaving) return;
  if (!was || !Object.keys(was).length) { knownAt = Math.max(knownAt, at); return; }
  if (at === wipedAt(was) || at <= knownAt) return;
  setTimeout(() => heardWipe(now.wiped), 0);
});

export function sayDangerNote() {
  let note = null;
  try {
    note = localStorage.getItem(NOTE_KEY);
    localStorage.removeItem(NOTE_KEY);
    localStorage.removeItem('wikster.wipeNote');
  } catch {}
  const said = NOTES[note];
  if (said) setTimeout(() => toast(esc(t(said[0])), said[1]), 1800);
}
