import { getLanguage, t, tx } from '../i18n.js';
import { claimableTiers, daysLeft, seasonAt, seasonEntry } from '../season.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import * as quests from '../quests.js';
import * as duel from '../duel.js';
import * as reveal from '../reveal.js';
import * as wikdle from '../wikdle.js';
import { canClaim, msUntilNextUtcDay } from '../daily.js';
import { formatCountdown } from '../shop.js';
import { formatAmount } from '../pricing.js';
import { nextFreeAt, nextRefreshAt } from '../economy.js';
import { atMaxLevel, levelFraction, levelOf, rankFor, xpToNext } from '../progression.js';
import { fill, h } from '../ui/dom.js';
import { activeFilterCount, openFilters } from './binder.js';
import { WIDE, el, money, showScreen, state } from './core.js';
import { openNotifications, unreadCount } from './drawer.js';
import { userId } from './gate.js';
import { recall } from './memo.js';
import { questUserKey } from './arcade.js';

const PANEL_KEY = 'wikster.panel.v1';
const stored = () => { try { return localStorage.getItem(PANEL_KEY); } catch { return null; } };
export const panelOpen = () => stored() !== 'closed';

let signature = '';

export function applyPanelState() {
  document.documentElement.dataset.panel = panelOpen() ? 'open' : 'closed';
  const title = document.getElementById('panel-title');
  if (title) title.textContent = t('panelTitle');
  if (el.panelToggle) {
    el.panelToggle.innerHTML = iconSvg(panelOpen() ? 'chevronRight' : 'chevronLeft', { size: 16 });
    el.panelToggle.setAttribute('aria-label', t(panelOpen() ? 'panelHide' : 'panelShow'));
    el.panelToggle.setAttribute('aria-expanded', String(panelOpen()));
  }
}

export function togglePanel() {
  try { localStorage.setItem(PANEL_KEY, panelOpen() ? 'closed' : 'open'); } catch {}
  synth.playTap();
  applyPanelState();
  paintPanel({ force: true });
}

const line = (icon, text, extra = null, clock = null) => h('div.panel-line', [
  h('span.panel-line-icon', { html: iconSvg(icon, { size: 15 }), 'aria-hidden': 'true' }),
  h('span.panel-line-text', clock ? { dataset: { clock } } : null, text),
  extra
]);

function clockText(name) {
  if (name === 'gift') return t('panelGiftIn', { time: formatCountdown(msUntilNextUtcDay()) });
  if (name === 'restock') return `${t('shopRestockIn')} ${formatCountdown(nextRefreshAt() - Date.now())}`;
  if (name === 'free') return t('freeAgainIn', { time: formatCountdown(nextFreeAt() - Date.now()) });
  return '';
}

function paintClocks() {
  for (const node of el.panelBody.querySelectorAll('[data-clock]')) node.textContent = clockText(node.dataset.clock);
}

const action = (label, run) => {
  const btn = h('button.btn.btn-sm.btn-ghost.panel-action', { type: 'button' }, label);
  press(btn, { sound: null });
  btn.addEventListener('click', () => { synth.playTap(); run(); });
  return btn;
};

const block = (title, rows) => h('section.panel-block', [h('h3.panel-title', title), ...rows.filter(Boolean)]);

function todayBlock() {
  const progress = state.profile.progress ?? { level: 1, xp: 0 };
  const level = levelOf(progress);
  const atMax = atMaxLevel(progress);
  const claimable = quests.claimableCount(questUserKey());
  const board = quests.loadBoard(questUserKey());
  const done = board.quests.filter((q) => q.progress >= q.target).length;
  const unread = unreadCount();
  const gift = canClaim(state.profile.daily);

  return block(t('panelToday'), [
    h('div.panel-level', [
      h('div.panel-level-head', [
        h('b', atMax ? t('profileMax') : t('panelLevel', { n: level })),
        h('span.panel-rank', tx(rankFor(level).name))
      ]),
      h(`span.panel-xp${atMax ? '.is-max' : ''}`, h('i', { style: { width: `${Math.round(levelFraction(progress) * 100)}%` } })),
      h('span.panel-xp-note.tabular', atMax ? t('levelMaxNote', { n: level })
        : t('panelXp', { have: (Number(progress.xp) || 0).toLocaleString(), need: xpToNext(progress).toLocaleString() }))
    ]),
    line('gift', gift ? t('panelGiftReady') : clockText('gift'),
      gift ? action(t('dailyClaim'), () => import('./daily.js').then((m) => m.openDaily())) : null, gift ? null : 'gift'),
    line('scroll', t('panelQuests', { done, n: board.quests.length }),
      claimable ? action(t('panelClaim', { n: claimable }), () => showScreen('quests')) : null),
    line('bell', unread ? t('panelUnread', { n: unread }) : t('panelNoUnread'),
      unread ? action(t('panelRead'), () => openNotifications()) : null)
  ]);
}

function screenBlock(tab) {
  if (tab === 'shop') {
    return block(t('tabShop'), [
      line('gem', t('shopPurse'), h('b.panel-money', { html: money(state.wallet) })),
      line('hourglass', clockText('restock'), null, 'restock'),
      line('clock', clockText('free'), null, 'free'),
      action(t('pullRates'), () => import('./daily.js').then((m) => m.openOdds()))
    ]);
  }
  if (tab === 'packs' || tab === 'timed') {
    const owned = Object.values(state.inventory ?? {}).reduce((sum, row) => sum + (row.count ?? 0), 0);
    const timed = state.profile.timed ?? { count: 0 };
    return block(t('tabBoosters'), [
      line('packs', t('panelShelf', { n: owned })),
      line('hourglass', t('panelTimed', { n: timed.count ?? 0 })),
      action(t('tabTimed'), () => showScreen('timed'))
    ]);
  }
  if (tab === 'binder' || tab === 'cardindex' || tab === 'glossary') {
    const entries = store.allEntries(state.collection);
    const own = entries.filter((e) => !e.special);
    const stats = store.collectionStats(own);
    const active = activeFilterCount();
    return block(t('tabCollection'), [
      line('collection', t('panelCards', { copies: stats.copies, unique: own.length })),
      line('gem', t('panelValue'), h('b.panel-money', { html: money(stats.value) })),
      tab === 'binder' ? action(active ? t('panelFiltersOn', { n: active }) : t('filters'), () => openFilters()) : null
    ]);
  }
  if (tab === 'market') {
    const c = recall('market.counts', userId()) ?? {};
    return block(t('tabMarket'), [
      line('trade', t('panelSelling', { n: c.selling ?? 0 })),
      line('star', t('panelBidding', { n: (c.leading ?? 0) + (c.outbid ?? 0) })),
      action(t('marketSell'), () => import('./market.js').then((mod) => mod.openSellSheet()))
    ]);
  }
  if (tab === 'season') {
    const current = seasonAt();
    const entry = seasonEntry(state.profile, current.key);
    const ready = claimableTiers(state.profile, current.key);
    return block(t('tabSeason'), [
      line('calendar', t('panelSeason', { name: tx(current.season.name), n: daysLeft() })),
      line('star', t('panelSeasonPoints', { n: entry.points })),
      ready ? action(t('panelClaim', { n: ready }), () => showScreen('season')) : action(t('tabLeaderboard'), () => showScreen('leaderboard'))
    ]);
  }
  if (tab === 'atelier') {
    return block(t('tabAtelier'), [
      line('ink', t('panelInk', { n: formatAmount(state.ink) })),
      line('gem', t('panelCoins', { n: formatAmount(state.wallet) })),
      action(t('atelierExchange'), () => import('./atelier.js').then((mod) => mod.openExchange()))
    ]);
  }
  if (tab === 'guilds' || tab === 'leaderboard') {
    const g = state.guild;
    return block(t('tabGuilds'), [
      line('shield', g ? t('panelGuild', { tag: g.tag, name: g.name }) : t('panelGuildNone')),
      line('friends', g ? t('guildMembers', { n: g.members }) : t('guildsIntro')),
      action(t(tab === 'guilds' ? 'tabLeaderboard' : 'tabGuilds'), () => showScreen(tab === 'guilds' ? 'leaderboard' : 'guilds'))
    ]);
  }
  if (['games', 'wikdle', 'duel', 'reveal'].includes(tab)) {
    const game = wikdle.loadGame(wikdle.utcDay(), wikdle.langFor(getLanguage()));
    return block(t('tabGames'), [
      line('grid', game.status === 'playing' ? t('panelWikdleOpen') : t('panelWikdleDone')),
      line('podium', t('panelRounds', { game: t('duelTitle'), n: duel.roundsLeft() })),
      line('search', t('panelRounds', { game: t('revealGameTitle'), n: reveal.roundsLeft() })),
      action(t('tabLeaderboard'), () => showScreen('leaderboard'))
    ]);
  }
  return null;
}

function currentSignature() {
  const progress = state.profile.progress ?? {};
  const board = quests.loadBoard(questUserKey());
  return [
    state.tab, document.documentElement.dataset.panel, getLanguage(),
    progress.level, progress.xp, state.wallet, unreadCount(),
    canClaim(state.profile.daily), board.quests.filter((q) => q.progress >= q.target).length,
    quests.claimableCount(questUserKey()), claimableTiers(state.profile), seasonEntry(state.profile, seasonAt().key).points,
    duel.roundsLeft(), reveal.roundsLeft(), activeFilterCount(), state.guild?.id, state.guild?.members,
    Object.keys(state.collection?.entries ?? {}).length,
    Object.values(state.inventory ?? {}).reduce((s, r) => s + (r.count ?? 0), 0)
  ].join('|');
}

export function paintPanel({ force = false } = {}) {
  if (!el.panelBody) return;
  if (!WIDE.matches || !panelOpen()) { signature = ''; return; }
  const now = currentSignature();
  if (!force && now === signature) { paintClocks(); return; }
  signature = now;
  const blocks = [screenBlock(state.tab), todayBlock()].filter(Boolean);
  fill(el.panelBody, blocks);
  paintClocks();
}
