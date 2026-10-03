import { styleForSpec } from './packstyle.js';
import { specId, specBaseName, specTierName } from './booster.js';
import { rarityById } from './data/rarities.js';
import { emblemSvg, monogramSvg } from './data/emblems.js';
import { t } from './i18n.js';
import { lookById } from './data/looks.js';
import { wornLook } from './cosmetics.js';

export function buildPackElement(spec, { interactive = false, size = '', look } = {}) {
  const style = styleForSpec(spec);
  const booster = document.createElement('div');
  booster.className = `booster ${size}`.trim();
  booster.dataset.spec = specId(spec);
  booster.dataset.family = style.family ?? 'roundel';
  booster.style.setProperty('--accent', style.accent);
  booster.style.setProperty('--accent2', style.accent2);
  booster.style.setProperty('--foil', style.foil);
  booster.style.setProperty('--holo', style.holo);

  if (spec.rarityId) {
    const rarity = rarityById(spec.rarityId);
    booster.dataset.rarity = rarity.id;
    booster.classList.add('is-lit');
    booster.style.setProperty('--rarity', rarity.color);
    booster.style.setProperty('--rarity-glow', rarity.glow);
  }

  const emblem = style.emblem?.kind === 'monogram'
    ? monogramSvg(style.emblem.letter, style.emblem.spin)
    : emblemSvg(style.emblem?.id ?? 'open');

  booster.innerHTML = `
    <div class="booster-body">
      <div class="booster-foil" aria-hidden="true"></div>
      <div class="booster-face">
        <div class="booster-emblem" aria-hidden="true">
          <div class="emblem-deco"></div>
          <div class="emblem-art">${emblem}</div>
        </div>
        <span class="booster-name"></span>
        <span class="booster-count"></span>
      </div>
      <div class="booster-holo" aria-hidden="true"></div>
      ${interactive ? '<div class="booster-mouth" aria-hidden="true"></div>' : ''}
      <div class="booster-shine" aria-hidden="true"></div>
      <div class="booster-crimp is-top" aria-hidden="true"></div>
      <div class="booster-crimp is-bottom" aria-hidden="true"></div>
      ${interactive ? `
        <div class="booster-tear" aria-hidden="true"></div>
        <div class="rip-front" aria-hidden="true"></div>
        <div class="rip-zone" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>` : ''}
    </div>`;

  booster.querySelector('.booster-name').textContent = specBaseName(spec);
  booster.querySelector('.booster-count').textContent = `${spec.cards} ${t('cards', { n: spec.cards })}`;
  const tier = specTierName(spec);
  if (tier) {
    const el = document.createElement('span');
    el.className = 'booster-tier';
    el.textContent = tier;
    booster.querySelector('.booster-face').appendChild(el);
  }
  const lookId = look === undefined ? wornLook() : look;
  const chosen = spec.kind === 'code' ? null : lookById(lookId);
  if (chosen) dressLook(booster, chosen, spec, emblem, tier);
  return booster;
}

function zig(teeth = 13, depth = 2.8) {
  const top = [];
  for (let i = 0; i <= teeth * 2; i++) top.push(`${(i / (teeth * 2) * 100).toFixed(2)}% ${i % 2 ? 0 : depth}%`);
  const bottom = [];
  for (let i = teeth * 2; i >= 0; i--) bottom.push(`${(i / (teeth * 2) * 100).toFixed(2)}% ${i % 2 ? 100 : 100 - depth}%`);
  return `polygon(${top.join(',')},${bottom.join(',')})`;
}

function star(points, inner) {
  const p = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : 50;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    p.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${p.join(',')})`;
}

const SHAPES = { zig: zig(), burst: star(14, 33), wax: star(22, 45) };

function dressLook(booster, look, spec, emblem, tier) {
  booster.dataset.look = look.id;
  const layer = document.createElement('div');
  layer.className = `look lk${look.n}`;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `--zig:${SHAPES.zig};--burst:${SHAPES.burst};--wax:${SHAPES.wax}`;
  if (tier) layer.dataset.tier = '1';
  layer.innerHTML = `<div class="lk-sh"><i class="l1"></i><i class="l2"></i><i class="l3"></i>
    <div class="lk-em">${emblem}</div><b class="lk-name"></b><span class="lk-cnt"></span><span class="lk-tier"></span><i class="lk-gl"></i><i class="lk-ed"></i></div>`;
  const name = specBaseName(spec);
  const nameEl = layer.querySelector('.lk-name');
  nameEl.textContent = name;
  const len = name.length + (look.id === 'tarot' ? 4 : 0);
  if (len > 10) nameEl.style.setProperty('--fit', String(Math.max(0.55, 10 / len)));
  layer.querySelector('.lk-cnt').textContent = `${spec.cards} ${t('cards', { n: spec.cards })}`;
  if (tier) layer.querySelector('.lk-tier').textContent = tier;
  booster.querySelector('.booster-body').appendChild(layer);
  booster.querySelector('.booster-tear')?.appendChild(layer.cloneNode(true));
}

const LOOK_VARS = ['--accent', '--accent2', '--foil', '--holo', '--e1', '--e2', '--e3', '--rarity', '--rarity-glow'];

export function lookScrap(booster, scrap, width, height) {
  const layer = booster?.querySelector('.booster-body > .look');
  if (!layer) return false;
  const cs = getComputedStyle(booster);
  for (const name of LOOK_VARS) {
    const value = cs.getPropertyValue(name).trim();
    if (value) scrap.style.setProperty(name, value);
  }
  scrap.classList.add('has-look');
  scrap.dataset.look = booster.dataset.look ?? '';
  scrap.style.fontSize = `${width}px`;
  const copy = layer.cloneNode(true);
  copy.style.height = `${height}px`;
  scrap.appendChild(copy);
  return true;
}

export function buildCardBack(spec) {
  const style = styleForSpec(spec);
  const emblem = style.emblem?.kind === 'monogram'
    ? monogramSvg(style.emblem.letter, style.emblem.spin)
    : emblemSvg(style.emblem?.id ?? 'open');

  const back = document.createElement('div');
  back.className = 'card-face card-back';
  back.dataset.family = style.family ?? 'roundel';
  back.style.setProperty('--accent', style.accent);
  back.style.setProperty('--accent2', style.accent2);
  back.style.setProperty('--foil', style.foil);
  back.innerHTML = `
    <div class="cb-foil" aria-hidden="true"></div>
    <div class="cb-deco" aria-hidden="true"></div>
    <div class="cb-emblem" aria-hidden="true">${emblem}</div>
    <div class="cb-word" aria-hidden="true">WIKSTER</div>
    <div class="cb-frame" aria-hidden="true"></div>`;
  return back;
}
