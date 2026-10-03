import { t } from '../i18n.js';
import { synth } from '../ui/sound.js';

export function markPlayer(node, { id, name = '', level = null } = {}) {
  if (!node || !id) return node;
  node.dataset.player = id;
  if (name) node.dataset.playerName = name;
  if (level != null) node.dataset.playerLevel = String(level);
  node.classList.add('is-player');
  if (!node.matches('button, a')) {
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
  }
  if (name) node.title = t('chatSeeProfile', { name });
  return node;
}

function playerTarget(event) {
  const node = event.target.closest?.('[data-player]');
  if (!node || node.closest('#screen-friend')) return null;
  const inner = event.target.closest('button, a, input, select, textarea, wk-select');
  if (inner && inner !== node && node.contains(inner)) return null;
  return node;
}

function tapPlayer(node) {
  const id = node.dataset.player;
  if (!id) return;
  synth.playTap();
  import('./social.js').then((m) => m.openPlayer(id, { name: node.dataset.playerName ?? '', level: node.dataset.playerLevel ?? null, node })).catch(() => {});
}

let wired = false;

export function wirePlayers() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('click', (event) => {
    const node = playerTarget(event);
    if (!node) return;
    event.preventDefault();
    if (node.closest('#sheet')) document.querySelector('#sheet-close')?.click();
    tapPlayer(node);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = event.target?.closest?.('[data-player]');
    if (!node || node !== event.target || node.matches('button, a')) return;
    event.preventDefault();
    tapPlayer(node);
  });
}

wirePlayers();
