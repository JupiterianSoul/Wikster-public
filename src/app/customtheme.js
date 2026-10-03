import { t, tx } from '../i18n.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { DEFAULT_THEME, THEMES, applyTheme, paintTheme } from '../ui/themes.js';
import {
  ALPHA_TOKENS, CUSTOM_THEME, LAYERS, MAX_VEIL, NO_SPECIAL, PALETTE_GROUPS, SPECIALS,
  alphaOf, composeCustom, contrastWarnings, defaultCustom, normalizeCustom, opaqueHex, presetPalette, themeTokens, withAlpha
} from '../ui/customtheme.js';
import { themeIdOwned } from '../appearance.js';
import { ownsTheme } from '../ink.js';
import { esc, paintScene, refreshWornTheme, state, storedTheme, toast, useTheme } from './core.js';

const owns = (id) => themeIdOwned(state.profile, id);
export const customOwned = () => ownsTheme(state.profile, CUSTOM_THEME);

let draft = null;
let saveTimer = 0;
let liveFrame = 0;
let box = null;

const tokenKey = (token) => `ctTok_${token.replace(/-/g, '_')}`;
const ownedThemes = () => THEMES.filter((theme) => owns(theme.id));

export function startingCustom() {
  if (state.profile.customTheme) return normalizeCustom(state.profile.customTheme, owns);
  const current = storedTheme();
  return normalizeCustom(defaultCustom(current !== CUSTOM_THEME && owns(current) ? current : DEFAULT_THEME), owns);
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  state.profile.customTheme = normalizeCustom(draft, owns);
  store.saveProfile(state.profile);
  if (storedTheme() === CUSTOM_THEME) refreshWornTheme();
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}

function liveApply() {
  if (storedTheme() !== CUSTOM_THEME || liveFrame) return;
  liveFrame = requestAnimationFrame(() => {
    liveFrame = 0;
    const composed = composeCustom(draft, themeTokens, owns);
    applyTheme(CUSTOM_THEME, composed);
    paintScene({ scene: composed.scene, special: composed.special, tint: composed.tint, veil: composed.veil });
  });
}

export function wearCustom() {
  if (!customOwned()) return false;
  if (!state.profile.customTheme) {
    draft = startingCustom();
    save();
  } else if (saveTimer) save();
  useTheme(CUSTOM_THEME, { announce: true });
  return storedTheme() === CUSTOM_THEME;
}

function swatchOf(palette) {
  return `<span class="theme-swatch">${[palette.bg, palette.accent, palette['accent-2']].map((c) => `<span style="background:${opaqueHex(c)}"></span>`).join('')}</span>`;
}

export function customCard(onWear) {
  const custom = startingCustom();
  const worn = storedTheme() === CUSTOM_THEME;
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `theme-card is-custom${worn ? ' is-on' : ''}`;
  card.dataset.theme = CUSTOM_THEME;
  card.innerHTML = `${swatchOf(custom.palette)}<h4></h4><p></p><span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
  card.querySelector('h4').textContent = t('customThemeName');
  card.querySelector('p').textContent = t('customThemeBlurb');
  press(card, { sound: null });
  card.addEventListener('click', () => {
    if (storedTheme() === CUSTOM_THEME) return;
    if (wearCustom()) onWear?.();
  });
  return card;
}

function paintPreview() {
  const preview = box?.querySelector('.ct-preview');
  if (!preview) return;
  const composed = composeCustom(draft, themeTokens, owns);
  paintTheme(preview, composed);
  preview.dataset.worn = CUSTOM_THEME;
  preview.style.setProperty('--ct-bg', draft.palette.bg.slice(0, 7));
  preview.dataset.shape = composed.shape;
  preview.dataset.font = composed.font;
  const warnings = contrastWarnings(draft.palette);
  const list = box.querySelector('.ct-warnings');
  list.replaceChildren(...(warnings.length ? warnings.map((w) => {
    const line = document.createElement('p');
    line.className = 'ct-warn';
    line.dataset.pair = w.id;
    line.innerHTML = `${iconSvg('close', { size: 13 })}<span></span>`;
    line.querySelector('span').textContent = t(`ctWarn_${w.id}`, { ratio: w.ratio.toFixed(1), min: w.min });
    return line;
  }) : [(() => {
    const line = document.createElement('p');
    line.className = 'ct-ok';
    line.innerHTML = `${iconSvg('check', { size: 13 })}<span></span>`;
    line.querySelector('span').textContent = t('customThemeReadable');
    return line;
  })()]));
}

function paintInputs() {
  if (!box) return;
  for (const input of box.querySelectorAll('input[data-token]')) input.value = opaqueHex(draft.palette[input.dataset.token]);
  for (const input of box.querySelectorAll('input[data-alpha]')) input.value = String(Math.round(alphaOf(draft.palette[input.dataset.alpha]) * 100));
  for (const select of box.querySelectorAll('select[data-layer]')) select.value = draft.layers[select.dataset.layer];
  const veil = box.querySelector('input[data-veil]');
  if (veil) veil.value = String(draft.veil);
  for (const chip of box.querySelectorAll('[data-preset]')) chip.classList.toggle('is-on', chip.dataset.preset === draft.base);
}

function changed({ commit = true } = {}) {
  paintPreview();
  liveApply();
  if (commit) saveSoon();
}

function section(titleKey, noteKey = null) {
  const wrap = document.createElement('div');
  wrap.className = 'ct-section';
  const title = document.createElement('h4');
  title.className = 'ct-title';
  title.textContent = t(titleKey);
  wrap.appendChild(title);
  if (noteKey) {
    const note = document.createElement('p');
    note.className = 'ct-note';
    note.textContent = t(noteKey);
    wrap.appendChild(note);
  }
  return wrap;
}

function previewNode() {
  const preview = document.createElement('div');
  preview.className = 'ct-preview';
  preview.innerHTML = `
    <span class="label"></span>
    <div class="ct-panel">
      <h4 data-pv-title></h4>
      <p class="ct-pv-ink" data-pv-body></p>
      <p class="ct-pv-dim" data-pv-dim></p>
      <p class="ct-pv-faint" data-pv-faint></p>
      <div class="ct-pv-row">
        <span class="btn btn-sm btn-primary" data-pv-go></span>
        <span class="btn btn-sm btn-ghost" data-pv-ghost></span>
        <span class="chip" data-pv-chip></span>
      </div>
      <div class="ct-pv-signals"><span class="is-pos">+120</span><span class="is-neg">-40</span><span class="is-warn">!</span></div>
    </div>
    <div class="ct-solid"><span></span></div>`;
  preview.setAttribute('aria-hidden', 'true');
  preview.querySelector('.label').textContent = t('customThemePreview');
  preview.querySelector('[data-pv-title]').textContent = t('customThemePreviewTitle');
  preview.querySelector('[data-pv-body]').textContent = t('customThemePreviewBody');
  preview.querySelector('[data-pv-dim]').textContent = t('customThemePreviewDim');
  preview.querySelector('[data-pv-faint]').textContent = t('customThemePreviewFaint');
  preview.querySelector('[data-pv-go]').textContent = t('customThemePreviewGo');
  preview.querySelector('[data-pv-ghost]').textContent = t('customThemePreviewGhost');
  preview.querySelector('[data-pv-chip]').textContent = t('customThemePreviewChip');
  preview.querySelector('.ct-solid span').textContent = t('ctTok_surface_solid');
  return preview;
}

function presetsNode() {
  const wrap = section('customThemePresets');
  const row = document.createElement('div');
  row.className = 'ct-presets';
  row.replaceChildren(...ownedThemes().map((theme) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ct-preset';
    chip.dataset.preset = theme.id;
    chip.innerHTML = `<span class="theme-swatch">${theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('')}</span><span class="ct-preset-name"></span>`;
    chip.querySelector('.ct-preset-name').textContent = tx(theme.name);
    press(chip, { sound: null });
    chip.addEventListener('click', () => {
      synth.playTap();
      draft.palette = presetPalette(theme.id);
      draft.base = theme.id;
      paintInputs();
      changed();
      toast(esc(t('customThemePresetDone', { name: tx(theme.name) })));
    });
    return chip;
  }));
  wrap.appendChild(row);
  return wrap;
}

function paletteNode() {
  const wrap = section('customThemeColors');
  for (const [group, tokens] of PALETTE_GROUPS) {
    const block = document.createElement('div');
    block.className = 'ct-group';
    const head = document.createElement('span');
    head.className = 'label';
    head.textContent = t(`ctGroup_${group}`);
    const list = document.createElement('div');
    list.className = 'ct-tokens';
    list.replaceChildren(...tokens.map((token) => {
      const row = document.createElement('div');
      row.className = 'ct-token';
      row.dataset.tokenRow = token;
      const id = `ct-${token}`;
      row.innerHTML = `<input type="color" id="${id}" data-token="${token}"><label for="${id}"></label>`;
      row.querySelector('label').textContent = t(tokenKey(token));
      const color = row.querySelector('input');
      color.setAttribute('aria-label', t(tokenKey(token)));
      color.addEventListener('input', () => {
        draft.palette[token] = withAlpha(color.value, alphaOf(draft.palette[token]));
        changed({ commit: false });
      });
      color.addEventListener('change', () => {
        draft.palette[token] = withAlpha(color.value, alphaOf(draft.palette[token]));
        changed();
      });
      if (ALPHA_TOKENS.includes(token)) {
        const alpha = document.createElement('input');
        alpha.type = 'range';
        alpha.min = '0';
        alpha.max = '100';
        alpha.step = '1';
        alpha.className = 'ct-alpha';
        alpha.dataset.alpha = token;
        alpha.setAttribute('aria-label', `${t(tokenKey(token))}: ${t('customThemeOpacity')}`);
        const move = (commit) => {
          draft.palette[token] = withAlpha(draft.palette[token], Number(alpha.value) / 100);
          changed({ commit });
        };
        alpha.addEventListener('input', () => move(false));
        alpha.addEventListener('change', () => move(true));
        row.appendChild(alpha);
      }
      return row;
    }));
    block.append(head, list);
    wrap.appendChild(block);
  }
  return wrap;
}

function layersNode() {
  const wrap = section('customThemeLayers', 'customThemeLayersNote');
  const list = document.createElement('div');
  list.className = 'ct-layers';
  const themes = ownedThemes();
  list.replaceChildren(...LAYERS.map((layer) => {
    const row = document.createElement('label');
    row.className = 'ct-layer';
    row.innerHTML = '<span></span><select class="filter-select"></select>';
    row.querySelector('span').textContent = t(`ctLayer_${layer}`);
    const select = row.querySelector('select');
    select.dataset.layer = layer;
    const options = layer === 'special'
      ? [[NO_SPECIAL, t('ctSpecialNone')], ...themes.filter((th) => SPECIALS.includes(th.id)).map((th) => [th.id, tx(th.name)])]
      : themes.map((th) => [th.id, tx(th.name)]);
    select.replaceChildren(...options.map(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }));
    select.addEventListener('change', () => {
      draft.layers[layer] = select.value;
      synth.playTap();
      changed();
      if (layer === 'sound' && storedTheme() === CUSTOM_THEME) { save(); synth.playTheme(); }
    });
    return row;
  }));
  wrap.appendChild(list);
  const veil = document.createElement('label');
  veil.className = 'ct-layer ct-veil';
  veil.innerHTML = '<span></span><input type="range" min="0" step="5" data-veil><small></small>';
  veil.querySelector('span').textContent = t('customThemeVeil');
  veil.querySelector('small').textContent = t('customThemeVeilNote');
  const range = veil.querySelector('input');
  range.max = String(MAX_VEIL);
  range.addEventListener('input', () => { draft.veil = Number(range.value); changed({ commit: false }); });
  range.addEventListener('change', () => { draft.veil = Number(range.value); changed(); });
  wrap.appendChild(veil);
  return wrap;
}

export function renderCustomTheme() {
  const head = document.getElementById('custom-theme-head');
  box = document.getElementById('custom-theme');
  const label = document.getElementById('custom-theme-label');
  if (!head || !box) return;
  const open = customOwned();
  head.hidden = !open;
  box.hidden = !open;
  if (label) label.textContent = t('customThemeLabel');
  if (!open) { box.replaceChildren(); return; }
  if (saveTimer) save();
  draft = startingCustom();

  const intro = document.createElement('div');
  intro.className = 'ct-intro';
  intro.innerHTML = '<p></p><div class="ct-actions"></div>';
  intro.querySelector('p').textContent = t('customThemeIntro');
  const worn = storedTheme() === CUSTOM_THEME;
  const wear = document.createElement('button');
  wear.type = 'button';
  wear.className = `btn btn-sm ${worn ? 'btn-ghost' : 'btn-primary'}`;
  wear.dataset.ctWear = '';
  wear.textContent = worn ? t('customThemeWorn') : t('customThemeWear');
  wear.disabled = worn;
  press(wear, { sound: null });
  wear.addEventListener('click', () => {
    save();
    if (wearCustom()) {
      toast(esc(t('customThemeOn')));
      import('./settings.js').then((m) => m.renderCustomize());
    }
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-sm btn-ghost';
  reset.dataset.ctReset = '';
  reset.textContent = t('customThemeReset');
  press(reset, { sound: null });
  reset.addEventListener('click', () => {
    synth.playTap();
    draft = normalizeCustom(defaultCustom(draft.base), owns);
    paintInputs();
    changed();
    toast(esc(t('customThemeResetDone')));
  });
  intro.querySelector('.ct-actions').append(wear, reset);

  const warnings = document.createElement('div');
  warnings.className = 'ct-warnings';
  warnings.setAttribute('role', 'status');
  warnings.setAttribute('aria-live', 'polite');

  const side = document.createElement('div');
  side.className = 'ct-side';
  side.append(previewNode(), warnings);
  const controls = document.createElement('div');
  controls.className = 'ct-controls';
  controls.append(presetsNode(), paletteNode(), layersNode());
  box.replaceChildren(intro, side, controls);
  paintInputs();
  paintPreview();
}
