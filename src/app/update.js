import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { checkForUpdate, goToLatest } from '../version.js';
import { onStaleBuild, reloadForStaleBuild } from './errors.js';
import { SEEN_KEY } from './whatsnew.js';

const EVERY_MS = 5 * 60 * 1000;
const GAP_MS = 60 * 1000;
const HOLD_MS = 3 * 60 * 1000;
const NOTES_SHOWN = 3;

let lastLook = 0;
let looking = null;
let shown = null;
let beforeReload = null;
let timer = null;

export const updateLocked = () => Boolean(shown);

export const setBeforeUpdateReload = (fn) => { beforeReload = fn; };

export function freshNotes(latest, known = []) {
  const ids = new Set(known.map((r) => r.id));
  const notes = Array.isArray(latest?.notes) ? latest.notes : [];
  return notes.filter((n) => n && typeof n.id === 'string' && !ids.has(n.id)).slice(-NOTES_SHOWN).reverse();
}

export function lookForUpdate({ force = false } = {}) {
  if (shown) return Promise.resolve(true);
  if (looking) return looking;
  if (!force && (!navigator.onLine || Date.now() - lastLook < GAP_MS)) return Promise.resolve(false);
  lastLook = Date.now();
  looking = checkForUpdate()
    .then((latest) => {
      if (!latest) return false;
      console.info(`Wikster: a newer build (${latest.sha}) is published`);
      showForcedUpdate(latest);
      return true;
    })
    .catch(() => false)
    .finally(() => { looking = null; });
  return looking;
}

const busyElsewhere = () => Boolean(document.getElementById('intro'))
  || Boolean(document.querySelector('#screen-open.is-active'));

export function showForcedUpdate(latest = {}) {
  if (shown) return shown;
  const since = Date.now();
  shown = { latest, node: null };
  const place = () => {
    const hold = Date.now() - since < HOLD_MS && busyElsewhere();
    if (document.getElementById('intro') || hold) { setTimeout(place, 1500); return; }
    import('../data/releases.js').then((m) => m.RELEASES, () => []).then((known) => { shown.node = paint(latest, known); });
  };
  place();
  return shown;
}

function paint(latest, known) {
  const notes = freshNotes(latest, known);
  const root = document.createElement('div');
  root.className = 'force-update';
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'force-update-title');
  root.setAttribute('aria-describedby', 'force-update-lead');
  root.dataset.sha = String(latest?.sha ?? '');

  const card = document.createElement('div');
  card.className = 'force-update-card';
  card.innerHTML = `<div class="force-update-mark" aria-hidden="true"><svg viewBox="0 0 48 48" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M38 24a14 14 0 1 1-4.1-9.9"/><path d="M35 6v9h-9"/></svg></div>
    <h2 id="force-update-title"></h2>
    <p id="force-update-lead" class="force-update-lead"></p>
    <div class="force-update-notes"></div>
    <button type="button" class="btn btn-primary btn-block force-update-go"></button>`;
  card.querySelector('h2').textContent = t('forceUpdateTitle');
  card.querySelector('.force-update-lead').textContent = t('forceUpdateLead');
  const list = card.querySelector('.force-update-notes');
  if (notes.length) {
    for (const release of notes) {
      const item = document.createElement('section');
      item.className = 'whatsnew-item force-update-note';
      if (typeof release.accent === 'string' && /^#[0-9a-f]{3,8}$/i.test(release.accent)) item.style.setProperty('--tl', release.accent);
      item.innerHTML = `<h4><span class="whatsnew-node">${iconSvg(String(release.icon ?? 'spark'), { size: 14 })}</span><span></span></h4><ul></ul>`;
      item.querySelector('h4 span:last-child').textContent = tx(release.title);
      item.querySelector('ul').replaceChildren(...(Array.isArray(release.points) ? release.points : []).map((point) => {
        const li = document.createElement('li');
        li.textContent = tx(point);
        return li;
      }));
      list.appendChild(item);
    }
  } else {
    const plain = document.createElement('p');
    plain.className = 'force-update-plain';
    plain.textContent = t('forceUpdateFixes');
    list.appendChild(plain);
  }
  const go = card.querySelector('.force-update-go');
  go.textContent = t('forceUpdateReload');
  go.addEventListener('click', () => reloadIntoLatest(go, notes));
  root.appendChild(card);

  for (const child of document.body.children) {
    if (child !== root && child.tagName !== 'SCRIPT') child.inert = true;
  }
  document.body.appendChild(root);
  document.documentElement.classList.add('is-updating');
  addEventListener('keydown', guardKeys, true);
  addEventListener('keyup', guardKeys, true);
  dispatchEvent(new Event('wikster:update-lock'));
  requestAnimationFrame(() => { root.classList.add('is-in'); go.focus({ preventScroll: true }); });
  return root;
}

function guardKeys(event) {
  const go = shown?.node?.querySelector('.force-update-go');
  if (!go) return;
  if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); go.focus(); return; }
  if ((event.key === 'Enter' || event.key === ' ') && event.target === go) { event.stopPropagation(); return; }
  event.preventDefault();
  event.stopImmediatePropagation();
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freshWorker() {
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (!reg) return;
  await Promise.race([reg.update().catch(() => {}), wait(4000)]);
  const next = reg.installing || reg.waiting;
  if (!next || next.state === 'activated') return;
  await Promise.race([
    new Promise((resolve) => {
      const done = () => { if (next.state === 'activated' || next.state === 'redundant') resolve(); };
      next.addEventListener('statechange', done);
      done();
    }),
    wait(8000)
  ]);
}

async function reloadIntoLatest(button, notes) {
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = t('forceUpdateLoading');
  if (notes.length) { try { localStorage.setItem(SEEN_KEY, notes[0].id); } catch {} }
  try { await Promise.race([Promise.resolve(beforeReload?.()), wait(3000)]); } catch {}
  try { await freshWorker(); } catch {}
  goToLatest();
}

export function watchForUpdates() {
  onStaleBuild(() => {
    lookForUpdate({ force: true }).then((found) => { if (!found) reloadForStaleBuild(); });
  });
  addEventListener('wikster:check-update', () => { lookForUpdate({ force: true }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') lookForUpdate();
  });
  addEventListener('online', () => lookForUpdate());
  addEventListener('pageshow', (event) => { if (event.persisted) lookForUpdate({ force: true }); });
  clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') lookForUpdate({ force: true });
  }, EVERY_MS);
  setTimeout(() => lookForUpdate({ force: true }), 4000);
}
