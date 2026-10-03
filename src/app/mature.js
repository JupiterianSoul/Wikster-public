import { t } from '../i18n.js';
import { ADULT_AGE, adultConfirmed, matureMeta, matureOptedIn } from '../age.js';
import * as account from '../account.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { press } from '../ui/components.js';
import { esc, openSheet, settings, state, toast } from './core.js';
import { live } from './live.js';
import { isMature } from '../sensitive.js';
import { androidApp } from '../platform.js';
import { useSafeDraws } from '../wiki/core.js';
import { minorsWiki } from '../wiki/safety.js';

export const sessionUser = () => state.account?.session?.user ?? null;

export function markThumb(node, card) {
  if (!node) return;
  const on = isMature(card);
  node.toggleAttribute('data-adult', on);
  node.classList.toggle('adult-thumb', on);
}

const localNoNsfw = () => {
  try { return settings()?.noNsfw === true; } catch { return false; }
};

export function noNsfw() {
  const meta = sessionUser()?.user_metadata;
  if (meta && typeof meta.no_nsfw === 'boolean') return meta.no_nsfw;
  return localNoNsfw();
}

export const hideNsfw = () => noNsfw() || androidApp();

export const matureAllowed = () => !androidApp() && !noNsfw() && matureOptedIn(sessionUser()?.user_metadata);

export const packHidden = (pack) => Boolean(pack?.wiki) && (minorsWiki(pack.wiki) || (hideNsfw() && pack.wiki.mature === true));

useSafeDraws(() => noNsfw());

let pushing = false;

function keepMetaInStep() {
  const user = sessionUser();
  if (!user || pushing || !localNoNsfw() || typeof user.user_metadata?.no_nsfw === 'boolean') return;
  pushing = true;
  account.confirmAge({ no_nsfw: true }).then((next) => {
    if (next && state.account.session?.user?.id === next.id) state.account.session = { ...state.account.session, user: next };
  }).catch(() => {}).finally(() => { pushing = false; });
}

export function applyMatureLock() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.matureLock = matureAllowed() ? '0' : '1';
  document.documentElement.dataset.nsfwHide = hideNsfw() ? '1' : '0';
  keepMetaInStep();
}

async function saveMature(on, age = null) {
  const user = await account.confirmAge(matureMeta(on, age));
  if (user && state.account.session) state.account.session = { ...state.account.session, user };
  applyMatureLock();
  return matureAllowed() === on;
}

async function purgeUnsafe() {
  const ready = await import('./ready.js').catch(() => null);
  const econ = await import('./econ.js').catch(() => null);
  const unsafe = (card) => isMature(card?.article ?? card);
  let dropped = [];
  if (econ?.serverEconomy()) {
    try { dropped = (await econ.econ('safeReady', {}, { quiet: true }))?.dropped ?? []; } catch {}
  }
  ready?.dropReadyWhere?.((nonce, cards) => dropped.includes(nonce) || cards.some(unsafe));
}

async function saveNoNsfw(on) {
  if (sessionUser()) {
    const user = await account.confirmAge({ no_nsfw: on });
    if (user && state.account.session) state.account.session = { ...state.account.session, user };
  }
  settings().noNsfw = on;
  store.saveProfile(state.profile);
  applyMatureLock();
  if (on) purgeUnsafe().catch(() => {});
  return noNsfw() === on;
}

export function noNsfwRow(onChange = () => {}) {
  const row = document.createElement('div');
  row.className = 'row no-nsfw-row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="switch row-action" type="button" role="switch"><span class="switch-knob"></span></button>`;
  row.querySelector('h4').textContent = t('settingsNoNsfw');
  row.querySelector('p').textContent = t('settingsNoNsfwNote');
  const button = row.querySelector('.switch');
  const paint = () => {
    const on = noNsfw();
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-checked', String(on));
    button.setAttribute('aria-label', `${t('settingsNoNsfw')}: ${on ? t('on') : t('off')}`);
  };
  paint();
  button.addEventListener('click', async () => {
    const next = !noNsfw();
    button.disabled = true;
    let ok = false;
    try { ok = await saveNoNsfw(next); } catch { ok = false; }
    button.disabled = false;
    paint();
    if (ok) { synth.resume(); synth.playToggle(next); onChange(next); }
    else toast(esc(t('noNsfwNotSaved')), 'error');
  });
  return row;
}

function askAge(done) {
  openSheet(t('matureAgeTitle'), (body) => {
    const note = document.createElement('p');
    note.className = 'sheet-note mature-age-note';
    note.textContent = t('matureAgeBody', { age: ADULT_AGE });
    const wrap = document.createElement('label');
    wrap.className = 'field mature-age-field';
    wrap.innerHTML = `
      <span class="field-label"></span>
      <span class="age-row">
        <input name="mature-age" type="range" min="1" max="99" step="1" value="30" />
        <output class="age-value">?</output>
      </span>`;
    wrap.querySelector('.field-label').textContent = t('gateAge');
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');
    input.addEventListener('input', () => {
      input.dataset.touched = '1';
      out.textContent = input.value;
    });
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-primary btn-block mature-age-go';
    go.textContent = t('matureAgeConfirm');
    press(go, { sound: null });
    go.addEventListener('click', async () => {
      if (!input.dataset.touched) { toast(esc(t('gateAgeNeeded')), 'error'); return; }
      const age = Number(input.value);
      live.sheet.hide();
      if (age < ADULT_AGE) {
        synth.playDenied();
        toast(esc(t('matureTooYoung', { age: ADULT_AGE })), 'error');
        done(false);
        return;
      }
      done(await saveMature(true, age).catch(() => false));
    });
    body.append(note, wrap, go);
  });
}

export function matureRow(onChange = () => {}) {
  if (androidApp()) return null;
  const row = document.createElement('div');
  row.className = 'row mature-row';
  row.innerHTML = `
    <div class="row-copy"><h4></h4><p></p></div>
    <button class="switch row-action" type="button" role="switch"><span class="switch-knob"></span></button>`;
  row.querySelector('h4').textContent = t('settingsMature');
  const button = row.querySelector('.switch');
  const paint = () => {
    const user = sessionUser();
    const on = matureAllowed();
    row.querySelector('p').textContent = t(user ? 'settingsMatureNote' : 'settingsMatureGuest', { age: ADULT_AGE });
    button.classList.toggle('is-on', on);
    button.classList.toggle('is-off-limits', !user || noNsfw());
    button.setAttribute('aria-checked', String(on));
    button.setAttribute('aria-label', `${t('settingsMature')}: ${on ? t('on') : t('off')}`);
  };
  paint();
  button.addEventListener('click', async () => {
    const user = sessionUser();
    if (!user) { synth.playDenied(); toast(esc(t('matureSignIn')), 'error'); return; }
    if (noNsfw()) { synth.playDenied(); toast(esc(t('noNsfwFirst')), 'error'); return; }
    const next = !matureAllowed();
    const finish = (ok) => {
      paint();
      if (ok) { synth.resume(); synth.playToggle(next); onChange(next); }
      else if (next) toast(esc(t('matureNotSaved')), 'error');
    };
    if (next && !adultConfirmed(user)) { askAge(finish); return; }
    button.disabled = true;
    try { finish(await saveMature(next)); } catch { finish(false); } finally { button.disabled = false; }
  });
  row.addEventListener('wikster:repaint', paint);
  return row;
}

export const matureBadge = () => {
  const badge = document.createElement('span');
  badge.className = 'mature-badge';
  badge.textContent = t('matureBadge');
  return badge;
};
