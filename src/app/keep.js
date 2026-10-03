import { getLanguage } from '../i18n.js';
import { wornLook } from '../cosmetics.js';
import { state } from './core.js';

export function uiKey() {
  const root = document.documentElement;
  return [getLanguage(), innerWidth, innerHeight, root.dataset.theme ?? '', root.style.cssText, wornLook() ?? '',
    JSON.stringify(state.frameStyle ?? null), JSON.stringify(state.cardFx ?? null), JSON.stringify(state.profile?.settings ?? null),
    state.account?.session?.user?.id ?? ''].join('|');
}

export function profileStamp() {
  const { playMs, ...rest } = state.profile ?? {};
  return JSON.stringify(rest);
}

export function keeper(signature) {
  let built = null;
  const key = () => `${uiKey()}#${signature()}`;
  return {
    fresh: () => built !== null && built === key(),
    mark: () => { built = key(); },
    drop: () => { built = null; }
  };
}
