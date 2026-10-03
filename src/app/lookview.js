import { DEFAULT_THEME, THEMES, paintTheme } from '../ui/themes.js';
import { CUSTOM_THEME, composeCustom, composeFriend, themeTokens } from '../ui/customtheme.js';
import { friendThemeOf, isFriendLook } from '../friendcodes.js';
import { DEFAULT_FX, fxExists } from '../data/fx.js';
import { SPECIAL_RARITY_ID } from '../codedefs.js';
import { buildAppearance, cleanAppearance } from '../appearance.js';
import { on } from '../ui/bus.js';
import { composedCustom, composedFriend, paintScene, restoreScene, state, storedTheme } from './core.js';

export function ownAppearance() {
  const id = storedTheme();
  const composed = id === CUSTOM_THEME ? composedCustom() : null;
  const friend = isFriendLook(id) && composedFriend(id) ? friendThemeOf(id) : null;
  const theme = composed ? CUSTOM_THEME : friend ? id : THEMES.some((th) => th.id === id) ? id : DEFAULT_THEME;
  return buildAppearance({ theme, custom: composed?.custom ?? null, fx: state.cardFx ?? {}, friend });
}

export function resolveLook(raw) {
  const look = cleanAppearance(raw);
  if (!look) return null;
  if (look.theme === CUSTOM_THEME) return { ...composeCustom(look.custom, themeTokens), fx: look.fx };
  if (isFriendLook(look.theme) && look.friend) return { ...composeFriend(look.theme, look.friend), fx: look.fx };
  const theme = THEMES.find((th) => th.id === look.theme);
  if (!theme) return { id: null, fx: look.fx };
  return { id: theme.id, shape: theme.id, scene: theme.id, special: theme.id, tint: null, veil: 0, fx: look.fx };
}

export function wearLook(node, raw) {
  const look = resolveLook(raw);
  if (!node) return look;
  if (!look?.id) {
    paintTheme(node, null);
    delete node.dataset.worn;
    return look;
  }
  paintTheme(node, look.vars ? look : { id: look.id });
  node.dataset.worn = look.id;
  return look;
}

export function fxOn(card, look, rarity) {
  if (!card || !look || !rarity) return card;
  const id = rarity.id === SPECIAL_RARITY_ID ? DEFAULT_FX : (look.fx?.[rarity.id] ?? DEFAULT_FX);
  if (id !== DEFAULT_FX && fxExists(rarity.id, id)) card.dataset.fx = id;
  else delete card.dataset.fx;
  return card;
}

let swapped = false;
let shown = null;

export function sceneFor(look) {
  if (look?.id && shown === 'friend') {
    paintScene(look);
    swapped = true;
  } else if (swapped) {
    restoreScene();
    swapped = false;
  }
}

on('screen', (name) => {
  if (name === 'open') return;
  shown = name;
  sceneFor(name === 'friend' ? state.viewing?.look : null);
});
