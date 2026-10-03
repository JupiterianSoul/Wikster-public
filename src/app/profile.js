import { SHOWCASE_MAX } from '../showcase.js';
import { withSpecialPhoto } from '../codedefs.js';
import { atMaxLevel, levelFraction, levelOf, rankFor, rewardForLevel, xpToNext } from '../progression.js';
import { paintRingFace } from './social.js';
import { frameTier } from '../frames.js';
import { t, tx } from '../i18n.js';
import * as store from '../collection.js';
import { evaluate as evaluateAchievements } from '../achievements.js';
import * as account from '../account.js';
import { RARITIES, rarityById, rarityOfCard, rarityRank, rarityText } from '../data/rarities.js';
import { Bar } from '../ui/components.js';
import { el, openSheet, state } from './core.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { buildStaticCard, openCardDetail } from './detail.js';
import { signedIn, userId } from './gate.js';
import { live } from './live.js';
import { rewardCard } from './open.js';
import { achFacts, frameStyle, paintFrameInto, renderBadges } from './regalia.js';
import { ownAppearance, wearLook } from './lookview.js';
import { markThumb } from './mature.js';
import { paintOwnStatsBoard } from './statsboard.js';

export function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function paintPlaytime() {
  const cell = el.statGrid?.querySelector('[data-stat="playtime"] > b');
  if (cell) cell.textContent = formatDuration(state.profile.playMs ?? 0);
}

export function renderProfile() {
  const { progress, rarityCounts } = state.profile;
  const level = levelOf(progress);
  const rank = rankFor(level);
  const atMax = atMaxLevel(progress);

  wearLook(el.screens.profile, ownAppearance());
  el.profileTitle.textContent = t('profileTitle');
  live.profileRing.set(levelFraction(progress), String(level));
  el.profileRing.classList.toggle('is-max', atMax);
  paintFrameInto(el.profileRing, frameStyle(), frameTier(level));
  paintRingFace(el.profileRing, state.account?.profile);
  el.profileLevel.textContent = atMax ? t('profileMax') : t('profileLevel', { n: level });
  el.profileRank.textContent = tx(rank.name);
  live.xpBar.set(levelFraction(progress));
  el.xpLine.textContent = atMax ? t('levelMaxNote', { n: level }) : t('profileXpLine', {
    have: (Number(progress.xp) || 0).toLocaleString(), need: xpToNext(progress).toLocaleString()
  });

  el.nextRewardLabel.textContent = t('profileNextReward');
  el.nextReward.replaceChildren(
    atMax ? document.createTextNode(t('profileMax'))
      : rewardCard(rewardForLevel(level + 1), { art: false })
  );

  paintShowcase();
  renderBadges();

  el.statsLabel.textContent = t('profileStats');
  freshOwnStats();
  paintOwnStamp();
  const facts = achFacts();
  const achList = evaluateAchievements(facts, state.profile.achievements?.redeemed ?? []);
  paintOwnStatsBoard(el.statGrid, { facts, achDone: achList.filter((a) => a.unlocked).length, achTotal: achList.length });

  el.rarityLabel.textContent = t('statRarity');
  const peak = Math.max(1, ...RARITIES.map((r) => rarityCounts[r.id] ?? 0));
  el.rarityBars.replaceChildren(...RARITIES.map((rarity) => {
    const count = rarityCounts[rarity.id] ?? 0;
    const row = document.createElement('div');
    row.className = 'rarity-row';
    row.innerHTML = `<span class="rarity-name"></span><span class="rarity-track"></span><span class="rarity-count"></span>`;
    const name = row.querySelector('.rarity-name');
    name.textContent = tx(rarity.name);
    name.style.color = rarityText(rarity);
    const bar = new Bar(row.querySelector('.rarity-track'));
    bar.set(count / peak, { animate: false });
    bar.fill.style.background = rarity.color;
    row.querySelector('.rarity-count').textContent = count.toLocaleString();
    return row;
  }));

}

export const OWN_TTL = 30000;
let ownCheckedAt = 0;
let ownChecking = null;
let ownSig = '';

export function paintOwnStamp() {
  const node = el.statsStamp;
  if (!node) return;
  node.classList.toggle('is-busy', Boolean(ownChecking));
  node.hidden = !ownChecking;
  node.textContent = ownChecking ? t('statsUpdating') : '';
}

export function freshOwnStats({ force = false } = {}) {
  if (!signedIn() || !account.configured || ownChecking) return ownChecking;
  if (!force && Date.now() - ownCheckedAt < OWN_TTL) return null;
  ownCheckedAt = Date.now();
  const me = userId();
  ownChecking = (async () => {
    const econ = await import('./econ.js');
    if (!econ.serverEconomy()) return;
    const row = await account.profileStats(me);
    if (!row || userId() !== me) return;
    const held = store.allEntries(state.collection).reduce((n, e) => n + (e.count ?? 0), 0);
    const sig = `${row.boosters_opened ?? 0}|${row.cards ?? 0}`;
    const behind = (row.boosters_opened ?? 0) !== (state.profile.boostersOpened ?? 0) || (row.cards ?? 0) !== held;
    if (!behind || sig === ownSig || econ.economyBusy()) return;
    ownSig = sig;
    await econ.refreshEconomy();
    const core = await import('./core.js');
    core.refreshWallet();
  })().catch(() => {}).finally(() => {
    ownChecking = null;
    if (state.tab === 'profile') renderProfile();
    else paintOwnStamp();
  });
  return ownChecking;
}

const MAX_PINS = SHOWCASE_MAX;

export function pinnedCards() {
  return (Array.isArray(state.profile.showcase) ? state.profile.showcase : []).filter((c) => c && c.key).slice(0, MAX_PINS);
}

export function pinCards(cards) {
  const keys = new Set(cards.map((c) => c.key));
  savePins([...cards, ...pinnedCards().filter((c) => !keys.has(c.key))]);
}

function savePins(pins) {
  state.profile.showcase = pins.slice(0, MAX_PINS);
  store.saveProfile(state.profile);
  paintShowcase();
  if (signedIn()) account.setShowcase(userId(), state.profile.showcase).catch(() => {});
}

export function paintShowcase() {
  if (!el.showcaseGrid) return;
  el.showcaseLabel.textContent = t('showcaseLabel');
  el.showcaseNote.textContent = t('showcaseNote');
  const pins = pinnedCards();
  el.showcaseGrid.replaceChildren(...Array.from({ length: Math.min(MAX_PINS, pins.length + 1) }, (_, i) => {
    const slot = document.createElement('div');
    slot.className = 'showcase-slot';
    const card = pins[i];
    if (card) {
      const node = buildStaticCard(withSpecialPhoto({ ...card }), rarityOfCard(card), null, { fav: false, wish: false });
      node.addEventListener('click', () => {
        const owned = state.collection.entries?.[card.key];
        if (owned) openCardDetail(card.key, owned, rarityOfCard(owned));
      });
      const off = document.createElement('button');
      off.type = 'button';
      off.className = 'icon-btn is-mini showcase-remove';
      off.setAttribute('aria-label', t('showcaseRemove'));
      off.innerHTML = iconSvg('close', { size: 14 });
      press(off, { sound: null });
      off.addEventListener('click', (e) => { e.stopPropagation(); synth.playTap(); savePins(pins.filter((_, j) => j !== i)); });
      slot.append(node, off);
    } else {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'showcase-empty';
      add.innerHTML = `${iconSvg('plus', { size: 22 })}<span></span>`;
      add.querySelector('span').textContent = t('showcaseEmpty');
      press(add, { sound: null });
      add.addEventListener('click', () => { synth.playTap(); openShowcasePicker(); });
      slot.appendChild(add);
    }
    return slot;
  }));
}

export function openShowcasePicker() {
  const pins = pinnedCards();
  const taken = new Set(pins.map((c) => c.key));
  const mine = store.allEntries(state.collection)
    .filter((c) => !taken.has(c.key))
    .sort((a, b) => rarityRank(b.rarityId) - rarityRank(a.rarityId));
  openSheet(t('showcasePick'), (body) => {
    if (!mine.length) {
      body.innerHTML = '<p class="muted"></p>';
      body.querySelector('p').textContent = t('giftNothing');
      return;
    }
    const list = document.createElement('div');
    list.className = 'pick-list';
    list.replaceChildren(...mine.map((card) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="pick-thumb"></span>
        <span class="pick-copy"><b></b><span></span></span>
        <span class="chip tabular">×${card.count}</span>`;
      if (card.thumbnail) row.querySelector('.pick-thumb').style.backgroundImage = `url("${card.thumbnail}")`;
      markThumb(row.querySelector('.pick-thumb'), card);
      row.querySelector('b').textContent = card.title;
      const tier = row.querySelector('.pick-copy span');
      tier.textContent = tx(rarityById(card.rarityId).name);
      tier.style.color = rarityText(rarityById(card.rarityId));
      press(row, { sound: null });
      row.addEventListener('click', () => {
        synth.playResolved();
        savePins([...pins, { ...card, count: 1, favorite: false }]);
        live.sheet.hide();
      });
      return row;
    }));
    body.appendChild(list);
  });
}
