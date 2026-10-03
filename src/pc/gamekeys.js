import { t } from '../i18n.js';

const CHOICES = {
  duel: '.duel-call',
  reveal: '.reveal-choice',
  quiz: '.quiz-choice, .quiz-cat',
  versus: '.versus-card, .versus-game, .pick-row, .person'
};

export const GAME_SCREENS = new Set(Object.keys(CHOICES));

const shown = (node) => node instanceof HTMLElement && node.offsetParent !== null && !node.disabled;

function screenNode(id) {
  return document.getElementById(`screen-${id}`);
}

function choices(id) {
  const root = screenNode(id);
  return root ? [...root.querySelectorAll(CHOICES[id])].filter(shown) : [];
}

function primary(id) {
  const root = screenNode(id);
  if (!root) return null;
  return [...root.querySelectorAll('.btn-primary')].filter((b) => shown(b) && !b.matches(CHOICES[id])).at(-1) ?? null;
}

function press(node) {
  node.focus?.({ preventScroll: true });
  node.click();
  return true;
}

export function gameKey(id, event) {
  if (!GAME_SCREENS.has(id)) return false;
  if (event.target.closest?.('input, textarea, select, wk-select')) return false;
  const key = event.key;
  const list = choices(id);
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= 9 && list[n - 1]) return press(list[n - 1]);
  if (id === 'duel' && (key === 'ArrowUp' || key === 'ArrowDown')) {
    const want = list.find((b) => b.dataset.call === (key === 'ArrowUp' ? 'higher' : 'lower'));
    if (want) return press(want);
  }
  if (id === 'reveal' && (key === 'c' || key === 'C')) {
    const clearer = screenNode(id)?.querySelector('.reveal-clearer');
    if (shown(clearer)) return press(clearer);
  }
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && list.length) {
    const at = list.indexOf(document.activeElement);
    const next = list[(at + (key === 'ArrowRight' ? 1 : -1) + list.length) % list.length] ?? list[0];
    next.focus({ preventScroll: true });
    return true;
  }
  if (key === 'Enter' || key === ' ') {
    if (list.includes(document.activeElement)) return press(document.activeElement);
    const go = primary(id);
    if (go) return press(go);
  }
  return false;
}

export function gamePrompts(id) {
  if (!GAME_SCREENS.has(id)) return [];
  const out = [];
  const count = choices(id).length;
  if (id === 'duel' && count) out.push(['↑  ↓', t('pcPromptHigherLower')]);
  else if (count) out.push([count > 1 ? `1-${Math.min(9, count)}` : '1', t('pcPromptChoose')]);
  if (id === 'reveal' && shown(screenNode(id)?.querySelector('.reveal-clearer'))) out.push(['C', t('pcPromptClearer')]);
  if (primary(id)) out.push(['Enter', t('pcPromptGo')]);
  return out;
}

export function watchGamePrompts(refresh) {
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refresh(); });
  };
  for (const id of GAME_SCREENS) {
    const node = screenNode(id);
    if (node) new MutationObserver(later).observe(node, { childList: true, subtree: true });
  }
}
