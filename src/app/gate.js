import { SHOWCASE_MAX } from '../showcase.js';
import { languageChosen, t } from '../i18n.js';
import * as account from '../account.js';
import { iconSvg, logoSvg } from '../data/icons.js';
import { Segmented, press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { RARITIES } from '../data/rarities.js';
import { levelOf, rankFor } from '../progression.js';
import { canClaim } from '../daily.js';
import { RETIRED_CODES } from '../codedefs.js';
import { MIN_AGE, ageConfirmed, ageMeta, deviceLocked, lockDevice } from '../age.js';
import { DEFAULT_THEME, THEMES } from '../ui/themes.js';
import { CUSTOM_THEME } from '../ui/customtheme.js';
import { canonical } from '../appearance.js';
import { isFriendLook } from '../friendcodes.js';
import { on } from '../ui/bus.js';
import { ownAppearance } from './lookview.js';
import { DEFAULT_FRAME_STYLE, FRAME_STYLES } from '../framemeta.js';
import { renderBinder } from './binder.js';
import { endSplash, showWelcome } from './boot.js';
import { SPECIAL_FIX_KEY, VIEWS_FIX_KEY, applyStrings, el, flushPlaytime, refreshWallet, refreshWornTheme, showScreen, showUpdateBar, state, storedTheme, toast, useTheme } from './core.js';
import { live } from './live.js';
import { dropReady, warmDrawer } from './open.js';
import { renderPacks } from './packs.js';
import { loadHonours, refreshLevelBadge, updateBadges } from './regalia.js';
import { applySettings, renderAccountRow } from './prefs.js';
import { applyMatureLock } from './mature.js';
import { payStipend, renderShop } from './stipend.js';
import { collectDeliveries, fullDigest, giftsWaiting, liveSocialUp, readDigest, startLiveSocial, stopLiveSocial, syncSocial } from './social.js';
import { startLiveOps } from './liveops.js';
import * as leaderboard from '../leaderboard.js';
import { startEconomy, stopEconomy, takeLaunchStep } from './econ.js';
import { screenText } from '../wordfilter.js';
import { collectionValue } from '../econ/rules.js';
import { offline, retryDelay } from '../backoff.js';

export function signedIn() {
  return (Boolean(state.account.session));
}

export function userId() {
  return (state.account.session?.user?.id ?? null);
}

export function gateStatus(key, kind = '', vars = {}) {
  el.gateStatus.textContent = key ? t(key, vars) : '';
  el.gateStatus.className = `gate-status${kind ? ` is-${kind}` : ''}`;
}

export function describeError(error) {
  const key = account.readableError(error);
  if (key) return t(key);
  const raw = String(error?.message ?? error ?? '').trim();
  return raw || t('authUnknown');
}

export function gateMessage(text, kind = 'error') {
  el.gateStatus.textContent = text;
  el.gateStatus.className = `gate-status${kind ? ` is-${kind}` : ''}`;
}

export function field(name, labelKey, { type = 'text', icon = 'profile', hintKey = null, autocomplete = '' } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `
    <span class="field-label"></span>
    <span class="field-box"><span>${iconSvg(icon, { size: 17 })}</span>
      <input name="${name}" type="${type}" autocomplete="${autocomplete}" spellcheck="false" />
    </span>
    ${hintKey ? '<span class="field-hint"></span>' : ''}`;
  wrap.querySelector('.field-label').textContent = t(labelKey);
  if (hintKey) wrap.querySelector('.field-hint').textContent = t(hintKey);
  return wrap;
}

export function ageField() {
  const wrap = document.createElement('label');
  wrap.className = 'field age-field';
  wrap.innerHTML = `
    <span class="field-label"></span>
    <span class="age-row">
      <input name="age" type="range" min="1" max="99" step="1" value="50" />
      <output class="age-value">?</output>
    </span>`;
  wrap.querySelector('.field-label').textContent = t('gateAge');
  const input = wrap.querySelector('input');
  const out = wrap.querySelector('output');
  input.setAttribute('aria-valuetext', t('gateAge'));
  input.addEventListener('input', () => {
    input.dataset.touched = '1';
    out.textContent = input.value;
    input.setAttribute('aria-valuetext', input.value);
  });
  return wrap;
}

function readAge() {
  const input = el.gateForm.elements.age;
  if (!input?.dataset.touched) return null;
  return Number(input.value);
}

function legalLine() {
  const line = document.createElement('p');
  line.className = 'gate-legal';
  const link = (page, key) => {
    const a = document.createElement('button');
    a.type = 'button';
    a.className = 'link-btn';
    a.textContent = t(key);
    a.addEventListener('click', () => import('./about.js').then((m) => m.openPage(page, t(key))));
    return a;
  };
  const [before, middle, after] = t('gateLegal').split(/\{terms\}|\{privacy\}/);
  line.append(before ?? '', link('terms', 'termsTitle'), middle ?? '', link('privacy', 'privacyTitle'), after ?? '');
  return line;
}

export function buildGateForm() {
  const creating = state.account.mode === 'signup';
  if (creating && deviceLocked()) {
    const note = document.createElement('p');
    note.className = 'gate-blocked';
    note.textContent = t('gateAgeBlocked');
    el.gateForm.replaceChildren(note);
    el.gateAlt.textContent = t('gateHaveAccount');
    gateStatus(null);
    return;
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t(creating ? 'gateSignUp' : 'gateSignIn');
  press(submit, { sound: null });

  el.gateForm.replaceChildren(
    ...(creating ? [ageField()] : []),
    field('email', 'gateEmail', { type: 'email', icon: 'mail', autocomplete: 'email' }),
    field('password', 'gatePassword', {
      type: 'password', icon: 'key',
      hintKey: creating ? 'gatePasswordHint' : null,
      autocomplete: creating ? 'new-password' : 'current-password'
    }),
    submit,
    ...(creating ? [legalLine()] : [])
  );

  el.gateAlt.textContent = t(creating ? 'gateHaveAccount' : 'gateForgot');
  gateStatus(null);
}

export function setGateMode(mode) {
  state.account.mode = mode;
  live.gateSeg?.select(mode, { silent: true });
  buildGateForm();
}

export function showGate() {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t('gateTitle');
  el.gateBody.textContent = t('gateBody');
  el.gateFoot.textContent = t('gateFoot');
  el.gateSeg.parentElement.hidden = false;
  el.gateForm.onsubmit = submitGate;
  el.gateAlt.onclick = gateAltAction;

  if (!live.gateSeg) {
    live.gateSeg = new Segmented(el.gateSeg, [
      { id: 'signin', label: t('gateSignIn') },
      { id: 'signup', label: t('gateSignUp') }
    ], (mode) => setGateMode(mode));
  }
  setGateMode(state.account.mode);
  paintSteamButton();
  el.gate.hidden = false;
}

function paintSteamButton() {
  const steam = window.wiksterSteam;
  const on = Boolean(steam?.ready?.());
  el.gateSteam.hidden = !on;
  if (!on) return;
  el.gateSteam.textContent = t('gateSteam', { name: steam.status().name || 'Steam' });
  el.gateSteam.onclick = async () => {
    synth.playTap();
    el.gateSteam.disabled = true;
    el.gateStatus.textContent = t('gateSteamWorking');
    try {
      await account.signInWithSteam(await steam.ticket());
      el.gateStatus.textContent = '';
    } catch (error) {
      el.gateStatus.textContent = t(account.readableError(error) ?? 'gateSteamFailed');
    } finally {
      el.gateSteam.disabled = false;
    }
  };
}

export function hideGate() { el.gate.hidden = true; }

export function fieldValue(name) {
  return (el.gateForm.elements[name]?.value ?? '');
}

export let gateBusy = false;

export async function submitGate(event) {
  event.preventDefault();
  if (gateBusy) return;

  const email = fieldValue('email').trim();
  const password = fieldValue('password');
  const creating = state.account.mode === 'signup';

  if (creating) {
    if (deviceLocked()) return;
    const age = readAge();
    if (age === null) return gateStatus('gateAgeNeeded', 'error');
    if (age < MIN_AGE) { lockDevice(); synth.playDenied(); buildGateForm(); return; }
  }
  if (!email || !password) return gateStatus('authUnknown', 'error');

  gateBusy = true;
  gateStatus('gateWorking', 'working');
  synth.playTap();
  try {
    if (creating) {
      const result = await account.signUp(email, password, ageMeta(readAge()));
      if (result.needsConfirmation) {
        gateStatus('gateConfirm', 'ok');
        setGateMode('signin');
        return;
      }
      gateStatus('gateSignedUp', 'ok');
    } else {
      await account.signIn(email, password);
    }
    synth.playFanfare();
  } catch (error) {
    gateMessage(describeError(error));
    synth.playDenied();
  } finally {
    gateBusy = false;
  }
}

export async function gateAltAction() {
  if (state.account.mode === 'signup') { setGateMode('signin'); synth.playTap(); return; }
  await requestReset(fieldValue('email').trim());
}

let resetBusy = false;

export async function requestReset(email) {
  if (resetBusy) return false;
  if (!email) {
    el.gateForm.elements.email?.focus();
    gateStatus('gateResetNeedEmail', 'error');
    return false;
  }
  resetBusy = true;
  gateStatus('gateWorking', 'working');
  try {
    await account.sendReset(email);
  } catch (error) {
    const key = error?.status === 429 ? 'authTooMany' : account.readableError(error);
    if (key === 'authTooMany') { gateStatus('resetTooSoon', 'error'); return false; }
    if (key === 'authOffline' || key === 'authBadEmail') { gateStatus(key, 'error'); return false; }
  } finally {
    resetBusy = false;
  }
  gateStatus(account.resetOpensOnWeb() ? 'gateResetSentApp' : 'gateResetSent', 'ok');
  return true;
}

export function showNameGate() {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t('gateNameTitle');
  el.gateBody.textContent = t('gateNameBody');
  el.gateFoot.textContent = t('gateFoot');
  el.gateSeg.parentElement.hidden = true;
  el.gateAlt.textContent = t('accountSignOut');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t('gateNameSave');
  press(submit, { sound: null });
  el.gateForm.replaceChildren(
    field('username', 'gateUsername', { hintKey: 'gateUsernameHint', autocomplete: 'username' }),
    submit
  );
  gateStatus(null);
  el.gate.hidden = false;

  el.gateForm.onsubmit = async (event) => {
    event.preventDefault();
    const name = fieldValue('username').trim();
    if (!account.USERNAME_RE.test(name)) return gateStatus('authBadName', 'error');
    const refused = screenText(name, 'name');
    if (refused) return gateMessage(t(`filter_${refused}`));
    gateStatus('gateWorking', 'working');
    try {
      const profile = await account.claimUsername(userId(), name);
      if (!profile) return gateStatus('authNameTaken', 'error');
      state.account.profile = profile;
      synth.playFanfare();
      await enterApp();
    } catch (error) {
      gateMessage(describeError(error));
    }
  };
  el.gateAlt.onclick = () => leaveAccount();
}

export const SYNC_DEBOUNCE = 20000;
export const SYNC_MAX_WAIT = 60000;

export let syncTimer = null;

export let syncQueued = false;

let syncDueSince = 0;
let syncFails = 0;
const SYNC_RETRY_BASE = 5000;
const SYNC_RETRY_CAP = 120000;
let statsSent = '';
let showcaseSent = '';
const PLAY_STEP = 900000;

export async function currentStats() {
  const { achievementsUnlocked, allBadgeStates, wornBadges } = await loadHonours();
  const entries = store.allEntries(state.collection);
  const counts = state.profile.rarityCounts ?? {};
  const best = RARITIES.filter((r) => (counts[r.id] ?? 0) > 0).pop();
  return {
    level: levelOf(state.profile.progress),
    rank: rankFor(levelOf(state.profile.progress)).name.en,
    cards: entries.reduce((sum, e) => sum + e.count, 0),
    uniqueCards: entries.length,
    boostersOpened: state.profile.boostersOpened ?? 0,
    value: collectionValue(entries),
    bestRarity: best?.id ?? null,
    playMs: Math.floor((state.profile.playMs ?? 0) / PLAY_STEP) * PLAY_STEP,
    badges: (() => {
      const states = allBadgeStates();
      const earned = states.filter((st) => st.rank > 0);
      return {
        worn: wornBadges(states).map((st) => st.badge.id),
        earned: earned.map((st) => ({ id: st.badge.id, rank: st.rank, ...(st.badge.look ? { look: st.badge.look } : {}) })),
        ach: achievementsUnlocked()
      };
    })()
  };
}

export async function flushSync() {
  if (!signedIn() || !state.account.profile) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  flushPlaytime();
  const leavingNow = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (!leavingNow && (state.tab === 'open' || el.openScreen?.classList.contains('is-active'))) {
    syncTimer = setTimeout(flushSync, SYNC_DEBOUNCE);
    return;
  }
  syncDueSince = 0;
  if (state.account.syncing) { syncQueued = true; return; }

  state.account.syncing = true;
  renderAccountRow();
  try {
    if (await flushKeys()) {
      await publishLook();
      state.account.syncedAt = Date.now();
      state.account.failed = false;
      syncFails = 0;
      return;
    }
    const pushed = await account.pushSave(userId());
    if (pushed === 'outdated') { state.account.outdated = true; showUpdateBar('outdated'); return; }
    if (pushed === 'merged') takeMerge();
    const stats = await currentStats();
    const said = JSON.stringify(stats);
    if (said !== statsSent) {
      await account.publishStats(userId(), stats);
      statsSent = said;
    }
    if (Array.isArray(state.profile.showcase)) {
      const shown = JSON.stringify(state.profile.showcase.slice(0, SHOWCASE_MAX));
      if (shown !== showcaseSent) account.setShowcase(userId(), state.profile.showcase).then(() => { showcaseSent = shown; }, () => {});
    }
    await publishLook();
    state.account.syncedAt = Date.now();
    state.account.failed = false;
    syncFails = 0;
  } catch {
    state.account.failed = true;
    syncFails++;
  } finally {
    state.account.syncing = false;
    renderAccountRow();
    if (syncQueued) { syncQueued = false; syncSoon(); }
    else if (state.account.failed && !syncTimer && !offline()) {
      syncTimer = setTimeout(flushSync, retryDelay(syncFails - 1, { base: SYNC_RETRY_BASE, cap: SYNC_RETRY_CAP }));
    }
  }
}

let keyBaseSent = '';
let keyStatsSent = '';
let lookSent = '';

export async function publishLook() {
  const me = userId();
  if (!me || !state.account.profile) return false;
  const look = ownAppearance();
  const said = `${me}:${canonical(look)}`;
  if (said === lookSent) return false;
  const held = state.account.profile.appearance;
  if (!lookSent && held && canonical(held) === canonical(look)) { lookSent = said; return false; }
  try {
    if (!await account.publishAppearance(me, look)) return false;
  } catch { return false; }
  lookSent = said;
  state.account.profile.appearance = look;
  return true;
}

on('look', () => syncSoon());

async function flushKeys() {
  if (!account.keysWanted(userId())) return false;
  const full = await currentStats();
  const { summaryLanded, summaryToSend } = await import('./statsboard.js');
  const stats = {
    playMs: full.playMs,
    rank: full.rank,
    badges: full.badges,
    ...(Array.isArray(state.profile.showcase) ? { showcase: state.profile.showcase.slice(0, SHOWCASE_MAX) } : {})
  };
  const base = `${userId()}:${JSON.stringify(stats)}`;
  const leaving = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  let pending = null;
  if (leaving || base !== keyBaseSent) {
    try { pending = summaryToSend({ leaving }); } catch {}
  }
  if (pending) stats.summary = pending.summary;
  const said = `${userId()}:${JSON.stringify(stats)}`;
  const done = await account.syncMe(userId(), { stats: (base !== keyBaseSent || pending) && said !== keyStatsSent ? stats : null });
  if (!done) return false;
  if (done.status === 'outdated') { state.account.outdated = true; showUpdateBar('outdated'); return true; }
  if (done.status !== 'frozen') summaryLanded(pending);
  if (done.status === 'frozen') return true;
  if (done.status !== 'same') { keyStatsSent = said; keyBaseSent = base; }
  if (done.status === 'merged') takeMerge();
  return true;
}

export async function pullSaveNow() {
  if (!signedIn() || !state.account.profile) return;
  try {
    const done = account.keysWanted(userId()) ? await account.syncMe(userId(), { always: true }) : null;
    if (done) {
      if (done.status === 'merged') takeMerge();
      return;
    }
    if (await account.pushSave(userId()) === 'merged') takeMerge();
  } catch {}
}

export function takeMerge() {
  if (state.tab === 'open' || el.openScreen?.classList.contains('is-active')) { state.account.mergePending = true; return; }
  state.account.mergePending = false;
  reloadFromStorage();
  toast(t('syncMerged'));
}

export function syncSoon() {
  if (!signedIn() || !state.account.profile) return;
  const now = Date.now();
  if (!syncDueSince) syncDueSince = now;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushSync, Math.max(0, Math.min(SYNC_DEBOUNCE, syncDueSince + SYNC_MAX_WAIT - now)));
}

export const SOCIAL_POLL = 300000;

export let socialTimer = null;

export function startSocialPoll() {
  stopSocialPoll();
  if (!signedIn() || document.visibilityState !== 'visible') return;
  let ticks = 0;
  socialTimer = setInterval(() => {
    ticks++;
    if (liveSocialUp() && ticks % 3) return;
    syncSocial().then(() => {
      if (giftsWaiting()) import('./gifts.js').then((m) => m.collectGifts()).catch(() => {});
    }, () => {});
  }, SOCIAL_POLL);
}

export function stopSocialPoll() {
  clearInterval(socialTimer);
  socialTimer = null;
}

const RESUME_GAP = 180000;
let resumedAt = 0;

export async function resumeAccount() {
  if (!signedIn()) return;
  const had = Boolean(state.account.profile);
  const fresh = Date.now() - resumedAt > RESUME_GAP;
  if (fresh) account.forgetSchemaProbe();
  await fetchAccountProfile();
  if (state.account.failed || !had) syncSoon();
  startSocialPoll();
  startLiveSocial({ keep: true });
  startLiveOps();
  if (!fresh && had) return;
  resumedAt = Date.now();
  if (had && account.keysWanted(userId())) syncSoon();
  const social = syncSocial({ full: true, digest: fullDigest() }).catch(() => {});
  import('./push.js').then((m) => m.registerPush()).catch(() => {});
  import('./errors.js').then((m) => m.errorsSignedIn(true)).catch(() => {});
  import('./support.js').then((m) => m.restorePurchases()).catch(() => {});
  leaderboard.flushScores().catch(() => {});
  social.then(() => {
    if (giftsWaiting()) import('./gifts.js').then((m) => m.collectGifts()).catch(() => {});
    if (!fullDigest()) import('./guilds.js').then((m) => m.loadMyGuild({ fresh: true })).catch(() => {});
  });
}

export async function enterApp() {
  await goOnline(false);
}

function enterLocally() {
  hideGate();
  reloadFromStorage();
  welcomeOrDaily({ stipend: false });
}

function welcomeOrDaily({ stipend = true } = {}) {
  if (!languageChosen() || !state.profile.started) showWelcome();
  else {
    if (stipend) payStipend();
    if (canClaim(state.profile.daily)) import('./daily.js').then((m) => m.openDaily({ auto: true }));
  }
}

function reloadWhenIdle() {
  if (state.tab === 'open' || el.openScreen?.classList.contains('is-active')) { state.account.mergePending = true; return; }
  reloadFromStorage();
}

async function goOnline(shown) {
  startLiveSocial();
  try {
    if (await account.syncOnLogin(userId()) === 'merged' && shown) reloadWhenIdle();
  } catch {
    state.account.failed = true;
  }
  if (!shown) {
    hideGate();
    reloadFromStorage();
  }
  if (await startEconomy(userId())) {
    if (shown) reloadWhenIdle();
    else reloadFromStorage();
  }
  startLiveOps();
  if (shown && languageChosen() && state.profile.started) payStipend();
  const collected = takeLaunchStep('collect');
  setTimeout(warmDrawer, 1500);
  if (!state.account.failed) state.account.syncedAt = Date.now();
  if (!state.account.failed && account.saveFromOlderBuild()) {
    for (const key of [SPECIAL_FIX_KEY, VIEWS_FIX_KEY]) { try { localStorage.removeItem(key); } catch {} }
  }
  if (!state.account.failed && account.saveFromNewerBuild()) { state.account.outdated = true; showUpdateBar('outdated'); }
  resumedAt = Date.now();
  const digest = fullDigest(LAUNCH_DIGEST_MS);
  const social = syncSocial({ full: true, digest, collected: Boolean(collected) }).catch(() => {});
  startSocialPoll();
  startLiveSocial({ keep: true });
  import('./push.js').then((m) => m.registerPush()).catch(() => {});
  import('./errors.js').then((m) => m.errorsSignedIn(true)).catch(() => {});
  import('./support.js').then((m) => m.restorePurchases()).catch(() => {});
  const granted = takeLaunchStep('grants');
  if (granted) import('./gifts.js').then((m) => m.collectGifts({ launched: granted })).catch(() => {});
  leaderboard.flushScores().catch(() => {});
  social.then(() => {
    if (collected?.landed?.length) collectDeliveries(collected).catch(() => {});
    if (!granted && giftsWaiting()) import('./gifts.js').then((m) => m.collectGifts()).catch(() => {});
    if (!fullDigest(LAUNCH_DIGEST_MS)) import('./guilds.js').then((m) => m.loadMyGuild({ fresh: true })).catch(() => {});
  });

  if (!shown) welcomeOrDaily();
}

const LAUNCH_DIGEST_MS = 120000;

export const RETIRED_THEMES = ['darwin'];

export function purgeRetiredThemes() {
  const retired = new Set(RETIRED_THEMES);
  const fromRetired = (packId) => retired.has(String(packId ?? '').split('|')[1] ?? '');
  let changed = false;
  try {
    const entries = state.collection?.entries ?? {};
    for (const [key, entry] of Object.entries(entries)) {
      if (fromRetired(entry?.packId)) { delete entries[key]; changed = true; }
    }
    if (changed) store.saveCollection(state.collection);
    let shelf = false;
    for (const [id, slot] of Object.entries(state.inventory ?? {})) {
      if (slot?.spec?.kind !== 'code' && retired.has(slot?.spec?.themeId)) {
        delete state.inventory[id];
        dropReady(id);
        shelf = true;
      }
    }
    if (shelf) { store.saveInventory(state.inventory); changed = true; }
    if (changed) { console.info('A withdrawn subject was removed from this save'); syncSoon(); }
  } catch (error) {
    console.warn('could not remove a withdrawn subject', error);
  }
  return changed;
}

export function purgeRetiredCodes() {
  let changed = false;
  const retired = new Set(RETIRED_CODES);
  try {
    const entries = state.collection?.entries ?? {};
    for (const [key, entry] of Object.entries(entries)) {
      if (entry?.special && retired.has(entry.special)) { delete entries[key]; changed = true; }
    }
    if (changed) store.saveCollection(state.collection);
    let shelf = false;
    for (const [id, slot] of Object.entries(state.inventory ?? {})) {
      if (slot?.spec?.kind === 'code' && retired.has(slot.spec.codeId)) { delete state.inventory[id]; dropReady(id); shelf = true; }
    }
    if (shelf) { store.saveInventory(state.inventory); changed = true; }
    const profile = state.profile ?? {};
    for (const id of retired) {
      if (profile.codesRedeemed?.[id] != null) { delete profile.codesRedeemed[id]; changed = true; }
    }
    if (Array.isArray(state.badgeLoadout) && state.badgeLoadout.some((b) => retired.has(String(b).replace(/^special-/, '')))) {
      state.badgeLoadout = state.badgeLoadout.filter((b) => !retired.has(String(b).replace(/^special-/, '')));
      store.saveBadgeLoadout(state.badgeLoadout);
      changed = true;
    }
    if (changed) store.saveProfile(profile);
    const worn = THEMES.find((th) => th.id === storedTheme());
    if (storedTheme() !== CUSTOM_THEME && !isFriendLook(storedTheme()) && (!worn || (worn.code && retired.has(worn.code)))) { useTheme(DEFAULT_THEME); changed = true; }
    const frame = FRAME_STYLES.find((f) => f.id === state.frameStyle);
    if (!frame || (frame.code && retired.has(frame.code))) { state.frameStyle = DEFAULT_FRAME_STYLE; store.saveFrameStyle(DEFAULT_FRAME_STYLE); changed = true; }
    if (changed) { console.info('A withdrawn code was removed from this save'); syncSoon(); }
  } catch (error) {
    console.warn('purge failed', error);
  }
  return changed;
}

export function reloadFromStorage() {
  state.collection = store.loadCollection();
  state.inventory = store.loadInventory();
  state.profile = store.loadProfile();
  state.frameStyle = store.loadFrameStyle() ?? DEFAULT_FRAME_STYLE;
  state.badgeLoadout = store.loadBadgeLoadout();
  state.customPacks = store.loadCustomPacks();
  state.wallet = store.loadWallet();
  purgeRetiredCodes();
  purgeRetiredThemes();
  refreshWornTheme();
  applySettings();
  applyStrings();
  refreshWallet();
  refreshLevelBadge();
  renderPacks();
  renderShop();
  renderBinder();
  updateBadges();
}

export async function leaveAccount() {
  await flushSync().catch(() => {});
  await import('./push.js').then((m) => m.forgetPush()).catch(() => {});
  import('./errors.js').then((m) => m.errorsSignedIn(false)).catch(() => {});
  stopEconomy();
  try { await account.signOut(); } catch {}
  state.account.session = null;
  applyMatureLock();
  state.account.profile = null;
  handledUser = null;
  state.social = { friends: [], incoming: [], outgoing: [], results: [], loaded: false, unread: new Map(), trades: [] };
  stopSocialPoll();
  stopLiveSocial();
  state.guild = undefined;
  el.welcome.hidden = true;
  showScreen('packs');
  showGate();
}

export let handledUser;

let sessionsHeld = false;

export function holdSessions(on) { sessionsHeld = Boolean(on); }

export async function onSession(session) {
  if (sessionsHeld) return;
  const id = session?.user?.id ?? null;
  if (handledUser === id) return;
  handledUser = id;

  if (session) {
    session = await account.verifySession(session);
    if (!session) {
      handledUser = null;
      try { localStorage.clear(); sessionStorage.clear(); } catch {}
      reloadFromStorage();
    }
  }
  state.account.session = session ?? null;
  applyMatureLock();
  if (!session) { startLiveOps(); showGate(); endSplash(); return; }
  if (!ageConfirmed(session.user)) { showAgeGate(); endSplash(); return; }
  await continueSession();
  endSplash();
}

async function continueSession() {
  if (account.ownsLocalSave(userId())) {
    enterLocally();
    (async () => {
      const ready = await fetchAccountProfile();
      if (ready === 'no-name') { showNameGate(); return; }
      await goOnline(true);
    })().catch(() => { state.account.failed = true; });
    return;
  }
  const ready = await fetchAccountProfile();
  if (ready === 'no-name') { showNameGate(); return; }
  await enterApp();
}

export function showAgeGate() {
  el.gateMark.innerHTML = logoSvg({ size: 56 });
  el.gateTitle.textContent = t('gateAgeTitle');
  el.gateBody.textContent = t('gateAgeBody');
  el.gateFoot.textContent = t('gateFoot');
  el.gateSeg.parentElement.hidden = true;
  el.gateAlt.textContent = t('accountSignOut');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary btn-block';
  submit.textContent = t('gateAgeSave');
  press(submit, { sound: null });
  el.gateForm.replaceChildren(ageField(), submit);
  gateStatus(null);
  el.gate.hidden = false;

  el.gateForm.onsubmit = async (event) => {
    event.preventDefault();
    const age = readAge();
    if (age === null) return gateStatus('gateAgeNeeded', 'error');
    if (age < MIN_AGE) {
      lockDevice();
      synth.playDenied();
      state.account.mode = 'signup';
      await leaveAccount();
      return;
    }
    gateStatus('gateWorking', 'working');
    try {
      const user = await account.confirmAge(ageMeta(age));
      if (user && state.account.session) state.account.session = { ...state.account.session, user };
      synth.playFanfare();
      await continueSession();
    } catch (error) {
      gateMessage(describeError(error));
    }
  };
  el.gateAlt.onclick = () => leaveAccount();
}

export async function fetchAccountProfile() {
  if (!signedIn() || state.account.profile) return 'ok';
  try {
    const digest = await readDigest(null);
    const profile = digest?.me ?? await account.profileForSession(state.account.session);
    if (!profile) return 'no-name';
    state.account.profile = profile;
    state.account.failed = false;
    return 'ok';
  } catch {
    state.account.failed = true;
    return 'offline';
  }
}
