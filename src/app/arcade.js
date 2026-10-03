import * as quests from '../quests.js';
import { record } from '../ledger.js';
import { t, tx } from '../i18n.js';
import { ALBUM_TIERS, albumHasTiers, albumTierBooster, albumTiersReached, buildAlbums } from '../albums.js';
import * as store from '../collection.js';
import { iconSvg } from '../data/icons.js';
import { press, reveal } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { el, esc, money, refreshWallet, showScreen, state, toast } from './core.js';
import { specName } from '../booster.js';
import { CURRENCY_NAME, formatAmount } from '../pricing.js';
import { paintDrawerLinks, pushNote } from './drawer.js';
import { gainBooster } from './open.js';
import { updateBadges } from './regalia.js';
import { signedIn, userId } from './gate.js';
import { guildGoalSetup, reportGuildGoal } from '../guildgoal.js';
import { addSeasonPoints, pointsForReport } from '../season.js';
import { emit } from '../ui/bus.js';
import { econ, onLaunch, serverEconomy } from './econ.js';
import { afterReveal } from './hush.js';

guildGoalSetup(() => signedIn() && Boolean(state.guild));
onLaunch((launch) => { if (launch?.quests && userId()) quests.takeBoard(userId(), launch.quests); });

export function questUserKey() {
  return (userId() ?? 'local');
}

export function reportQuest(metric, detail = {}) {
  try { if (record(state.profile, metric, detail)) store.saveProfile(state.profile); } catch {}
  try { reportGuildGoal(metric, detail); } catch {}
  try { earnSeasonPoints(pointsForReport(metric, detail)); } catch {}
  try {
    const done = quests.track(metric, detail, questUserKey());
    for (const id of done) {
      const quest = quests.describe(quests.loadBoard(questUserKey())).find((r) => r.id === id)?.quest;
      if (quest) afterReveal(() => { toast(esc(t('questDone', { name: tx(quest.name) })), 'ok'); pushNote('trophy', t('questDone', { name: tx(quest.name) }), 'quests'); });
    }
    afterReveal(paintDrawerLinks, 'drawerLinks');
  } catch (error) {
    console.warn('quest report failed', error);
  }
}
export function seasonReached(season) {
  if (!season?.reached?.length) return;
  afterReveal(() => seasonShown(season));
}

function seasonShown(season) {
  for (const i of season.reached) {
    toast(esc(t('seasonRungReached', { n: i + 1 })), 'ok');
    pushNote('calendar', t('seasonRungReached', { n: i + 1 }), 'season');
  }
  paintDrawerLinks();
  emit('season', { key: season.key, before: season.points - season.gained, after: season.points, reached: season.reached });
}

export function earnSeasonPoints(amount) {
  if (!(amount > 0) || serverEconomy()) return;
  const moved = addSeasonPoints(state.profile, amount);
  store.saveProfile(state.profile);
  afterReveal(() => {
    for (const i of moved.reached) {
      toast(esc(t('seasonRungReached', { n: i + 1 })), 'ok');
      pushNote('calendar', t('seasonRungReached', { n: i + 1 }), 'season');
    }
    paintDrawerLinks();
    emit('season', moved);
  });
}

export let albumsDoneBefore = null;

export function reportAlbums() {
  try {
    const albums = buildAlbums(store.allEntries(state.collection), state.customPacks);
    const done = albums.filter((a) => a.complete).length;
    if (albumsDoneBefore !== null && done > albumsDoneBefore) for (let i = albumsDoneBefore; i < done; i++) reportQuest('album');
    albumsDoneBefore = done;
    awardAlbumTiers(albums);
  } catch {}
}

let medalsAsked = null;

function serverMedals() {
  if (medalsAsked) return medalsAsked;
  medalsAsked = econ('medals').then((res) => {
    for (const w of res.won ?? []) {
      const tierName = t(`albumTier_${w.tier}`);
      const extra = w.spec ? ` + ${specName(w.spec)}` : '';
      afterReveal(() => {
        toast(t('albumTierWon', { tier: tierName, album: esc(w.name), reward: `${money(w.coins)}${esc(extra)}` }), 'ok');
        pushNote('album', t('albumTierWon', { tier: tierName, album: w.name, reward: `${formatAmount(w.coins)} ${CURRENCY_NAME}${extra}` }), 'binder');
      });
      if (w.spec) gainBooster(w.spec);
    }
    if (res.won?.length) { afterReveal(() => synth.playCoins()); updateBadges(); }
    seasonReached(res.season);
  }).catch(() => {}).finally(() => { medalsAsked = null; });
  return medalsAsked;
}

export function awardAlbumTiers(albums) {
  if (serverEconomy()) {
    const claimed = state.profile.albumTiers ?? {};
    if (albums.some((a) => albumHasTiers(a) && albumTiersReached(a) > (Number(claimed[a.key]) || 0))) serverMedals();
    return;
  }
  const claimed = { ...(state.profile.albumTiers ?? {}) };
  let paid = 0;
  let coins = 0;
  for (const album of albums) {
    if (!albumHasTiers(album)) continue;
    const reached = albumTiersReached(album);
    const had = Math.min(ALBUM_TIERS.length, Number(claimed[album.key]) || 0);
    for (let i = had; i < reached; i++) {
      const tier = ALBUM_TIERS[i];
      coins += tier.coins;
      const spec = albumTierBooster(album, tier);
      if (spec) gainBooster(spec);
      const tierName = t(`albumTier_${tier.id}`);
      const extra = spec ? ` + ${specName(spec)}` : '';
      afterReveal(() => {
        toast(t('albumTierWon', { tier: tierName, album: esc(album.name), reward: `${money(tier.coins)}${esc(extra)}` }), 'ok');
        pushNote('album', t('albumTierWon', { tier: tierName, album: album.name, reward: `${formatAmount(tier.coins)} ${CURRENCY_NAME}${extra}` }), 'binder');
      });
      paid += 1;
    }
    if (reached > had) claimed[album.key] = reached;
  }
  if (!paid) return;
  state.profile.albumTiers = claimed;
  store.saveProfile(state.profile);
  if (coins) { store.saveWallet(store.loadWallet() + coins); afterReveal(() => { refreshWallet(); synth.playCoins(); }); }
  updateBadges();
}

export function gameStage(iconId, text, action = null) {
  const box = document.createElement('div');
  box.className = 'game-stage';
  box.innerHTML = `<span class="game-stage-icon">${iconSvg(iconId, { size: 46 })}</span><p class="game-note"></p>`;
  box.querySelector('.game-note').textContent = text;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    btn.textContent = action.label;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); action.run(); });
    box.appendChild(btn);
  }
  return box;
}

export function houseError(error) {
  const code = String(error?.message ?? '');
  if (code === 'SIGN_IN') return t('gameSignIn');
  if (code === 'CLOSED') return t('gameClosed');
  if (code === 'TIMEOUT') return t('gameTimeout');
  if (code === 'TAMPER') return t('gameTamper');
  if (code === 'SCHEMA') return t('gameSchema');
  return t('gameFailed');
}

export function renderGames() {
  el.gamesTitle.textContent = t('tabGames');
  el.gamesSub.textContent = t('gamesIntro');
  const tiles = [
    { id: 'wikdle', icon: 'grid', color: '#4ade80', title: t('wikdleTitle'), note: t('gamesWikdleNote'), run: () => import('./wikdle.js').then(async (m) => { await m.renderWikdle(); showScreen('wikdle'); }) },
    { id: 'duel', icon: 'podium', color: '#f472b6', title: t('duelTitle'), note: t('gamesDuelNote'), run: () => import('./duel.js').then((m) => { m.renderDuel(); showScreen('duel'); }) },
    { id: 'reveal', icon: 'search', color: '#22d3ee', title: t('revealGameTitle'), note: t('gamesRevealNote'), run: () => import('./reveal.js').then((m) => { m.renderReveal(); showScreen('reveal'); }) },
    { id: 'versus', icon: 'friends', color: '#a78bfa', title: t('versusTitle'), note: t('gamesVersusNote'), run: () => import('./versus.js').then((m) => { showScreen('versus'); m.renderVersus(); }) },
  ];
  const list = document.createElement('div');
  list.className = 'games-list';
  list.replaceChildren(...tiles.map((tile) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-tile';
    btn.style.setProperty('--game', tile.color);
    btn.innerHTML = `<span class="game-tile-art">${iconSvg(tile.icon, { size: 28 })}</span>
      <span class="game-tile-copy"><b></b><p></p></span>
      <span class="game-tile-go"><span class="game-tile-play"></span>${iconSvg('chevronRight', { size: 18 })}</span>`;
    btn.querySelector('.game-tile-play').textContent = t('versusPlay');
    btn.querySelector('b').textContent = tile.title;
    btn.querySelector('p').textContent = tile.note;
    press(btn, { sound: null });
    btn.addEventListener('click', () => { synth.playTap(); tile.run(); });
    return btn;
  }));
  el.gamesList.replaceChildren(list);
  reveal(list.children, { step: 60 });
}
