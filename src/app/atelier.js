import { paintSupport } from './support.js';
import { t, tx } from '../i18n.js';
import { bump } from '../ledger.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { DEFAULT_THEME, THEMES } from '../ui/themes.js';
import { FRAME_GRADES, INK_FRAMES } from '../frames.js';
import { RARITIES, rarityText } from '../data/rarities.js';
import { DEFAULT_FX, FX_BY_RARITY } from '../data/fx.js';
import { BOOSTER_LOOKS, OPENINGS } from '../data/looks.js';
import { wearLook, wearOpening, wornLook, wornOpening } from '../cosmetics.js';
import { lookTile, openingTile } from './openpreview.js';
import {
  CUSTOM_THEME_PRICE, EXCHANGE_RATE, LOOK_PRICE, OPENING_PRICE, ownsLook, ownsOpening, INK_DAILY_WEEK, INK_GUILD_GOAL, INK_GUILD_MATCH, THEME_PRICE,
  addInk, exchangeCost, fxPrice, grant, inkForLevel, ownsFrame, ownsFx, ownsTheme, spendInk
} from '../ink.js';
import { formatAmount } from '../pricing.js';
import { el, esc, ink, money, openSheet, refreshWallet, showScreen, state, storedTheme, toast, useTheme } from './core.js';
import { live } from './live.js';
import { spawnBurst } from './open.js';
import { econ, econMessage, serverEconomy } from './econ.js';
import { renderBinder } from './binder.js';
import { renderPacks } from './packs.js';
import { renderShop } from './shop.js';
import { fxSampleCard } from './fxcard.js';
import { frameStage, frameStyle, pickFrameStyle } from './regalia.js';
import { wearFx } from './settings.js';
import { CUSTOM_THEME } from '../ui/customtheme.js';
import { customOwned, startingCustom } from './customtheme.js';
import { isPc } from '../pc/mode.js';

export const ATELIER_THEMES = THEMES.filter((theme) => !theme.code && !theme.season && !theme.supporter && theme.id !== DEFAULT_THEME);

export function renderAtelier() {
  el.atelierTitle.textContent = t('tabAtelier');
  el.atelierLead.textContent = t('atelierLead');
  el.atelierPurseLabel.textContent = t('atelierPurse');
  el.atelierCoinsLabel.textContent = t('shopPurse');
  el.atelierPurse.innerHTML = ink(state.ink);
  el.atelierCoins.innerHTML = money(state.wallet);
  el.atelierExchange.textContent = t('atelierExchange');
  el.atelierThemesLabel.textContent = t('atelierThemes');
  const customLabel = document.getElementById('atelier-custom-label');
  if (customLabel) customLabel.textContent = t('atelierCustom');
  el.atelierFramesLabel.textContent = t('atelierFrames');
  el.atelierFxLabel.textContent = t('atelierFx');
  el.atelierFxNote.textContent = t('atelierFxNote');
  el.atelierLooksLabel.textContent = t('atelierLooks');
  el.atelierLooksNote.textContent = t('atelierLooksNote', { price: formatAmount(LOOK_PRICE) });
  el.atelierOpeningsLabel.textContent = t('atelierOpenings');
  el.atelierOpeningsNote.textContent = t('atelierOpeningsNote', { price: formatAmount(OPENING_PRICE) });
  if (!el.atelierExchange.dataset.wired) {
    el.atelierExchange.dataset.wired = '1';
    press(el.atelierExchange, { sound: null });
    el.atelierExchange.addEventListener('click', () => { synth.playTap(); openExchange(); });
  }
  paintThemes();
  paintCustom();
  paintFrames();
  paintFx();
  paintLooks();
  paintOpenings();
  paintSupport();
}

function paintLooks() {
  const worn = wornLook();
  el.atelierLooks.replaceChildren(...BOOSTER_LOOKS.map((look) => {
    const owned = ownsLook(state.profile, look.id);
    const tile = lookTile(look, {
      button: priceButton({
        owned, price: LOOK_PRICE, worn: look.id === worn,
        buy: () => buy('looks', look.id, LOOK_PRICE, tx(look.name)),
        wear: () => { wearLook(look.id); renderPacks(); renderShop(); toast(esc(t('lookEquipped', { name: tx(look.name) }))); renderAtelier(); }
      })
    });
    tile.classList.toggle('is-owned', owned);
    tile.classList.toggle('is-on', look.id === worn);
    return tile;
  }));
}

function paintOpenings() {
  const worn = wornOpening();
  el.atelierOpenings.replaceChildren(...OPENINGS.map((opening) => {
    const owned = ownsOpening(state.profile, opening.id);
    const tile = openingTile(opening, {
      button: priceButton({
        owned, price: OPENING_PRICE, worn: opening.id === worn,
        buy: () => buy('openings', opening.id, OPENING_PRICE, tx(opening.name)),
        wear: () => { wearOpening(opening.id); toast(esc(t('openingEquipped', { name: tx(opening.name) }))); renderAtelier(); }
      })
    });
    tile.classList.toggle('is-owned', owned);
    tile.classList.toggle('is-on', opening.id === worn);
    return tile;
  }));
}

function paintThemes() {
  const current = storedTheme();
  el.atelierThemes.replaceChildren(...ATELIER_THEMES.map((theme) => {
    const owned = ownsTheme(state.profile, theme.id);
    const card = document.createElement('div');
    card.className = `theme-card atelier-tile${owned ? ' is-owned' : ''}${theme.id === current ? ' is-on' : ''}`;
    card.dataset.theme = theme.id;
    card.innerHTML = `
      <span class="theme-swatch">${theme.swatch.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
      <h4></h4><p></p>
      <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
    card.querySelector('h4').textContent = tx(theme.name);
    card.querySelector('p').textContent = tx(theme.blurb);
    card.appendChild(priceButton({
      owned, price: THEME_PRICE, worn: theme.id === current,
      buy: () => buy('themes', theme.id, THEME_PRICE, tx(theme.name)),
      wear: () => { useTheme(theme.id, { announce: true }); renderPacks(); renderShop(); renderBinder(); renderAtelier(); }
    }));
    return card;
  }));
}

function paintCustom() {
  const shelf = document.getElementById('atelier-custom');
  if (!shelf) return;
  const owned = customOwned();
  const worn = storedTheme() === CUSTOM_THEME;
  const card = document.createElement('div');
  card.className = `theme-card atelier-tile is-custom${owned ? ' is-owned' : ''}${worn ? ' is-on' : ''}`;
  card.dataset.theme = CUSTOM_THEME;
  const palette = startingCustom().palette;
  card.innerHTML = `
    <span class="theme-swatch is-spectrum">${[palette.bg, palette.accent, palette['accent-2']].map((c) => `<span style="background:${c.slice(0, 7)}"></span>`).join('')}</span>
    <h4></h4><p></p>
    <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
  card.querySelector('h4').textContent = t('customThemeName');
  card.querySelector('p').textContent = t('customThemeBlurb');
  const button = priceButton({
    owned, price: CUSTOM_THEME_PRICE, worn: false,
    buy: () => buy('themes', CUSTOM_THEME, CUSTOM_THEME_PRICE, t('customThemeName')),
    wear: () => openCustomEditor()
  });
  if (owned) button.querySelector('.buy-label').textContent = t('customThemeOpen');
  button.dataset.customTheme = owned ? 'open' : 'buy';
  card.appendChild(button);
  shelf.replaceChildren(card);
}

export function openCustomEditor() {
  import('./settings.js').then((m) => {
    showScreen('customize');
    m.renderCustomize();
    if (isPc) import('../pc/legacy.js').then((pc) => pc.legacySelect('customize', 'custom-theme-label')).catch(() => {});
    requestAnimationFrame(() => document.getElementById('custom-theme-head')?.scrollIntoView?.({ block: 'start' }));
  });
}

function paintFrames() {
  const wearing = frameStyle();
  const grades = FRAME_GRADES.map((grade) => ({ grade, frames: INK_FRAMES.filter((f) => f.grade === grade.id) }))
    .filter((g) => g.frames.length)
    .sort((a, b) => a.frames[0].price - b.frames[0].price);
  const note = document.createElement('p');
  note.className = 'frames-note frame-shop-note';
  note.textContent = t('atelierFrameNote');
  el.atelierFrames.replaceChildren(note, ...grades.map(({ grade, frames }) => {
    const group = document.createElement('div');
    group.className = 'fx-tier frame-grade';
    group.dataset.grade = grade.id;
    group.style.setProperty('--grade', grade.color);
    group.innerHTML = `<div class="fx-tier-head"><span class="grade-chip"></span><span class="fx-tier-count tabular"></span></div><div class="frame-grid"></div>`;
    group.querySelector('.grade-chip').textContent = tx(grade.name);
    group.querySelector('.fx-tier-count').innerHTML = t('atelierFxPrice', { price: ink(frames[0].price) });
    group.querySelector('.frame-grid').replaceChildren(...frames.map((style) => {
      const owned = ownsFrame(state.profile, style.id);
      const card = document.createElement('div');
      card.className = `frame-card frame-tile atelier-tile${owned ? ' is-owned' : ''}${style.id === wearing ? ' is-on' : ''}`;
      card.dataset.frame = style.id;
      card.dataset.grade = grade.id;
      card.innerHTML = `<span class="frame-copy"><h4></h4><span class="grade-chip is-small"></span></span>
        <span class="theme-check">${iconSvg('check', { size: 14 })}</span>`;
      card.prepend(frameStage(style.id, { size: 56, width: 4 }));
      card.querySelector('h4').textContent = tx(style.name);
      card.querySelector('.grade-chip').textContent = tx(grade.name);
      card.appendChild(priceButton({
        owned, price: style.price, worn: style.id === wearing,
        buy: () => buy('frames', style.id, style.price, tx(style.name)),
        wear: () => { pickFrameStyle(style.id); toast(t('frameEquipped', { name: tx(style.name) })); renderAtelier(); }
      }));
      return card;
    }));
    return group;
  }));
}

function paintFx() {
  el.atelierFx.replaceChildren(...RARITIES.map((rarity) => {
    const price = fxPrice(rarity.id);
    const row = document.createElement('div');
    row.className = 'fx-tier';
    row.innerHTML = `<div class="fx-tier-head"><span class="fx-tier-name"></span>
      <span class="fx-tier-count tabular"></span></div><div class="fx-chips"></div>`;
    const name = row.querySelector('.fx-tier-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarityText(rarity);
    row.querySelector('.fx-tier-count').innerHTML = t('atelierFxPrice', { price: ink(price) });
    row.querySelector('.fx-chips').replaceChildren(...(FX_BY_RARITY[rarity.id] ?? []).map((style) => {
      const owned = ownsFx(state.profile, rarity.id, style.id);
      const worn = (state.cardFx[rarity.id] ?? DEFAULT_FX) === style.id;
      const chip = document.createElement('div');
      chip.className = `fx-chip atelier-tile${owned ? ' is-owned' : ''}${worn ? ' is-on' : ''}`;
      chip.dataset.fx = style.id;
      chip.style.setProperty('--rarity', rarity.color);
      chip.innerHTML = `<span class="fx-sample-slot"></span><span class="fx-chip-name"></span><span class="fx-chip-sub"></span>`;
      chip.querySelector('.fx-sample-slot').appendChild(fxSampleCard(rarity, style.id));
      chip.querySelector('.fx-chip-name').textContent = tx(style.name);
      chip.querySelector('.fx-chip-sub').textContent = tx(style.note);
      chip.appendChild(priceButton({
        owned, price, worn,
        buy: () => buy('fx', `${rarity.id}:${style.id}`, price, tx(style.name)),
        wear: () => { wearFx(rarity, style); toast(esc(t('fxEquipped', { name: tx(style.name), rarity: tx(rarity.name) }))); renderAtelier(); }
      }));
      return chip;
    }));
    return row;
  }));
}

function priceButton({ owned, price, worn, buy: onBuy, wear }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-sm atelier-buy${owned ? ' btn-ghost is-owned' : ' btn-primary'}`;
  if (worn) {
    btn.innerHTML = `<span class="buy-label">${esc(t('atelierWorn'))}</span>`;
    btn.disabled = true;
  } else if (owned) {
    btn.innerHTML = `<span class="buy-label">${esc(t('atelierWear'))}</span>`;
  } else {
    btn.innerHTML = `<span class="buy-label">${esc(t('buy'))}</span><span class="buy-price">${ink(price)}</span>`;
    if (state.ink < price) btn.classList.add('is-short');
  }
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); if (owned) wear(); else onBuy(btn); });
  return btn;
}

async function buy(kind, id, price, name) {
  if (serverEconomy()) {
    if (state.ink < price) {
      synth.playDenied();
      toast(esc(t('atelierShort', { n: formatAmount(price - state.ink) })), 'error');
      openExchange();
      return;
    }
    try { await econ('atelier', { kind, id }); } catch (error) {
      synth.playDenied();
      toast(esc(econMessage(error, t)), 'error');
      return;
    }
  } else if (!spendInk(price)) {
    synth.playDenied();
    toast(esc(t('atelierShort', { n: formatAmount(price - state.ink) })), 'error');
    openExchange();
    return;
  }
  if (!serverEconomy()) grant(state.profile, kind, id);
  bump(state.profile, 'atelierBuys');
  store.saveProfile(state.profile);
  refreshWallet();
  synth.playPurchase();
  const tile = el.atelierThemes.querySelector(`[data-theme="${id}"]`) ?? el.atelierFrames.querySelector(`[data-frame="${id}"]`)
    ?? el.atelierLooks.querySelector(`[data-look="${id}"]`) ?? el.atelierOpenings.querySelector(`[data-opening="${id}"]`)
    ?? el.atelierFx.querySelector(`[data-fx="${id.split(':')[1]}"]`);
  const rect = (tile ?? el.atelierPurse).getBoundingClientRect();
  spawnBurst({ shapes: ['star4', 'orb'], colors: ['#818cf8', '#ffffff', '#c7d2fe'], count: 16, spread: 1, gravity: 0.3 },
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, { scale: 0.8 });
  toast(esc(t('atelierBought', { name })), 'ok');
  renderAtelier();
}

export function openExchange() {
  openSheet(t('atelierExchangeTitle'), (body) => {
    const paint = () => {
      body.innerHTML = `
        <p class="atelier-balances"><span data-ink></span><span data-coins></span></p>
        <p style="margin-bottom:14px" data-note></p>
        <div class="settings-list" style="padding:0" data-rows></div>`;
      body.querySelector('[data-ink]').innerHTML = ink(state.ink);
      body.querySelector('[data-coins]').innerHTML = money(state.wallet);
      body.querySelector('[data-note]').textContent = t('atelierExchangeNote', { rate: formatAmount(EXCHANGE_RATE) });
      const rows = body.querySelector('[data-rows]');
      for (const n of [1, 10, 50]) {
        const cost = exchangeCost(n);
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<div class="row-copy"><h4></h4><p></p></div>`;
        row.querySelector('h4').innerHTML = ink(n);
        row.querySelector('p').innerHTML = t('atelierExchangeFor', { cost: money(cost) });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-primary row-action';
        btn.textContent = t('atelierPress');
        btn.disabled = state.wallet < cost;
        press(btn, { sound: null });
        btn.addEventListener('click', async () => {
          if (store.loadWallet() < cost) { synth.playDenied(); toast(esc(t('atelierNoCoins')), 'error'); return; }
          if (serverEconomy()) {
            btn.disabled = true;
            try { await econ('exchange', { ink: n }); } catch (error) {
              btn.disabled = false; synth.playDenied(); toast(esc(econMessage(error, t)), 'error'); return;
            }
          } else {
            store.saveWallet(store.loadWallet() - cost);
            addInk(n);
          }
          refreshWallet();
          synth.playCoins();
          toast(esc(t('atelierExchanged', { n: formatAmount(n) })), 'ok');
          paint();
          if (el.screens.atelier?.classList.contains('is-active')) renderAtelier();
        });
        row.appendChild(btn);
        rows.appendChild(row);
      }
    };
    paint();
  });
}

export function openInkSheet() {
  openSheet(t('inkTitle'), (body) => {
    body.innerHTML = `
      <p class="atelier-balances" style="margin-bottom:8px" data-balance></p>
      <p style="margin-bottom:16px" data-what></p>
      <div class="row"><div class="row-copy"><h4 data-earn-t></h4><p data-earn></p></div></div>
      <div class="row"><div class="row-copy"><h4 data-spend-t></h4><p data-spend></p></div></div>
      <button class="btn btn-primary btn-block" type="button" style="margin-top:16px" data-go></button>`;
    body.querySelector('[data-balance]').innerHTML = ink(state.ink);
    body.querySelector('[data-what]').textContent = t('inkWhat');
    body.querySelector('[data-earn-t]').textContent = t('walletEarnTitle');
    body.querySelector('[data-earn]').textContent = t('inkEarn', {
      level: inkForLevel(1), week: INK_DAILY_WEEK, goal: INK_GUILD_GOAL, match: INK_GUILD_MATCH, rate: formatAmount(EXCHANGE_RATE)
    });
    body.querySelector('[data-spend-t]').textContent = t('walletSpendTitle');
    body.querySelector('[data-spend]').textContent = t('inkSpend');
    const go = body.querySelector('[data-go]');
    go.textContent = t('atelierExchange');
    press(go, { sound: null });
    go.addEventListener('click', () => { live.sheet.hide(); setTimeout(openExchange, 260); });
  });
}
