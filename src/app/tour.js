import { t } from '../i18n.js';
import * as store from '../collection.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { showScreen, state } from './core.js';
import { signedIn } from './gate.js';

const STEPS = [
  { target: '#packs-rail', title: 'tourPacksTitle', body: 'tourPacksBody', screen: 'packs' },
  { target: '#wallet', title: 'tourWalletTitle', body: 'tourWalletBody' },
  { target: '.nav-item[data-tab="shop"]', title: 'tourShopTitle', body: 'tourShopBody' },
  { target: '.nav-item[data-tab="timed"]', title: 'tourTimedTitle', body: 'tourTimedBody' },
  { target: '.nav-item[data-tab="binder"]', title: 'tourBinderTitle', body: 'tourBinderBody' },
  { target: '#menu-btn', title: 'tourMenuTitle', body: 'tourMenuBody' },
  { target: '.nav-item[data-tab="profile"]', title: 'tourProfileTitle', body: () => (signedIn() ? 'tourProfileBodyIn' : 'tourProfileBody') }
];

let active = null;

const visible = (node) => {
  if (!node) return false;
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden';
};

export const tourDone = () => Boolean(state.profile.tourDone);

function finish(done) {
  if (!active) return;
  window.removeEventListener('resize', active.place);
  document.removeEventListener('keydown', active.keys);
  active.root.remove();
  active = null;
  state.profile.tourDone = true;
  store.saveProfile(state.profile);
  done?.();
}

export function startTour({ force = false, done = null } = {}) {
  if (active || (!force && tourDone())) { done?.(); return false; }
  const steps = STEPS.filter((step) => visible(document.querySelector(step.target)) || step.screen);
  if (!steps.length) { done?.(); return false; }

  const root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-bubble" role="document">
      <p class="tour-count tabular"></p>
      <h3 class="tour-title"></h3>
      <p class="tour-body"></p>
      <div class="tour-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-skip></button>
        <button type="button" class="btn btn-primary btn-sm" data-next></button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const spot = root.querySelector('.tour-spot');
  const bubble = root.querySelector('.tour-bubble');
  const next = root.querySelector('[data-next]');
  const skip = root.querySelector('[data-skip]');
  skip.textContent = t('tourSkip');
  press(next, { sound: null });
  press(skip, { sound: null });

  let index = 0;
  const place = () => {
    const step = steps[index];
    const node = document.querySelector(step.target);
    if (!visible(node)) { spot.hidden = true; bubble.style.top = '50%'; bubble.style.transform = 'translate(-50%, -50%)'; return; }
    spot.hidden = false;
    const r = node.getBoundingClientRect();
    const pad = 6;
    spot.style.left = `${r.left - pad}px`;
    spot.style.top = `${r.top - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;
    const below = r.top + r.height / 2 < window.innerHeight / 2;
    bubble.style.transform = below ? 'translateX(-50%)' : 'translate(-50%, -100%)';
    bubble.style.top = below ? `${r.bottom + 14}px` : `${r.top - 14}px`;
  };
  const show = () => {
    const step = steps[index];
    if (step.screen) showScreen(step.screen);
    const bodyKey = typeof step.body === 'function' ? step.body() : step.body;
    root.querySelector('.tour-count').textContent = t('tourCount', { n: index + 1, total: steps.length });
    root.querySelector('.tour-title').textContent = t(step.title);
    root.querySelector('.tour-body').textContent = t(bodyKey);
    next.textContent = index === steps.length - 1 ? t('tourDone') : t('tourNext');
    skip.hidden = index === steps.length - 1;
    requestAnimationFrame(place);
  };
  const keys = (event) => {
    if (event.key === 'Escape') finish(done);
    if (event.key === 'Enter' || event.key === 'ArrowRight') next.click();
  };
  next.addEventListener('click', () => {
    synth.playTap();
    if (index >= steps.length - 1) { finish(done); return; }
    index += 1;
    show();
  });
  skip.addEventListener('click', () => { synth.playTap(); finish(done); });

  active = { root, place, keys };
  window.addEventListener('resize', place);
  document.addEventListener('keydown', keys);
  show();
  next.focus();
  return true;
}
