import { t } from '../i18n.js';

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
