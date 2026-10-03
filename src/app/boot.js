import { startTour } from './tour.js';
import { initBack } from './back.js';
import { registerShell, roomyConnection } from './worker.js';
import { iconSvg, logoSvg } from '../data/icons.js';
import { setBeforeUpdateReload, watchForUpdates } from './update.js';
import { checkWhatsNew } from './whatsnew.js';
import { checkNotices } from './notices.js';
import { LANGUAGES, getLanguage, languageChosen, loadLanguage, setLanguage, t, tx } from '../i18n.js';
import { Bar, NavBar, Odometer, Rail, Ring, Segmented, Sheet, installTapFeedback, press, trackDrag } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import * as store from '../collection.js';
import { THEME_PACKS } from '../data/packs.js';
import { STARTER_PACKS, starterCoins, STARTER_PACK_CARDS, drawCapsFor, todayRarityForRank } from '../economy.js';
import { SPECIAL_RARITY_ID, codeThemeOwned, missingCodeDefs } from '../codedefs.js';
import { isFriendId } from '../friendcodes.js';
import { popularityFromViews, popularityFromWordCount, priceFor } from '../pricing.js';
import { RARITIES, rarityById, rarityFromPopularity } from '../data/rarities.js';
import { DEFAULT_THEME, THEMES, themeById } from '../ui/themes.js';
import { backdrop } from '../ui/backdrop.js';
import { specId, specName, toDrawPack } from '../booster.js';
import * as quests from '../quests.js';
import * as account from '../account.js';
import { canClaim } from '../daily.js';
import { music } from '../ui/music.js';
import { emit, on } from '../ui/bus.js';
import { onSaveChanged, touch } from '../save.js';
import * as wikdle from '../wikdle.js';
import { drawArticles, fetchTopRead } from '../wiki/lazy.js';
import { generateShop } from '../shop.js';
import * as odds from '../data/odds.js';
import { addXp } from '../progression.js';
import { timedTopTier } from '../timed.js';
import { reportAlbums, earnSeasonPoints } from './arcade.js';
import { applyPanelState, paintPanel, togglePanel } from './panel.js';
import { openFilters, renderBinder, turnAlbumPage } from './binder.js';
import { $, THEME_KEY, WIDE, applyStrings, bind, debug, el, esc, flushPlaytime, migrateLanguages, migrateSpecialCards, migrateViews, money, navTabFor, placeDrawerLinks, refreshWallet, refreshWornTheme, setTickerJob, showScreen, shuffle, state, storedTheme, syncTicker, toast, useTheme, wornScene } from './core.js';
import * as leaderboard from '../leaderboard.js';
import { flushGuildGoal, reportGuildGoal } from '../guildgoal.js';
import { pointsForReport, seasonAt } from '../season.js';
import { addInk, grant, onInk } from '../ink.js';
import { bump, ledger } from '../ledger.js';
import { utcDayIndex } from '../days.js';
import { tilt } from './detail.js';
import { buildDrawer, closeDrawer, openDrawer, openHelp, openNotifications, paintDrawerLinks } from './drawer.js';
import { landFromEmail } from './recovery.js';
import { flushSync, gateAltAction, leaveAccount, onSession, purgeRetiredCodes, purgeRetiredThemes, resumeAccount, showGate, stopSocialPoll, submitGate, syncSoon, userId } from './gate.js';
import { live } from './live.js';
import { applyRarityVars, drainLevelUps, gainBooster, homeTabFor, initSwipe, paintOpenHint, showLevelUp, skipToSummary, warmDrawer, warmOpenFx } from './open.js';
import { MIRRORED, econ, economyBusy, economyIdle, economySettling, flushEconomy, localTotals, onEconomySettled, serverEconomy, serverOwnedKeys, warmEconomy } from './econ.js';
import { leaving } from '../account/client.js';
import { isPc } from '../pc/mode.js';
import { buildBooster, createCustomPack, onFinderInput, openAllTimed, paintPackCaption, renderPacks, renderTimed, showPacks, syncTimed } from './packs.js';
import { pendingOpens, readyCount } from './ready.js';
import { paintPlaytime, renderProfile } from './profile.js';
import { loadHonours, refreshLevelBadge, updateBadges } from './regalia.js';
import { applySettings } from './prefs.js';
import { openDanger, sayDangerNote as sayWipeNote } from './danger.js';
import { payStipend, renderShop, shopIsBuilt, showShop } from './stipend.js';
import { chatTyped, keepChatBottom, loadFriends, openFriend, parkLiveSocial, renderFriends, runSearch, sendChat, settlePresence, socialAction, syncSocial, unparkLiveSocial } from './social.js';
import { restoreLive, startLiveOps } from './liveops.js';

quests.useClaimedSource((key) => (key !== 'local' && serverEconomy() ? { known: true, ...(state.profile?.questDay ?? {}) } : null));

bind({
  screens: {
    packs: $('#screen-packs'), timed: $('#screen-timed'), shop: $('#screen-shop'),
    binder: $('#screen-binder'), profile: $('#screen-profile'),
    settings: $('#screen-settings'), friends: $('#screen-friends'),
    friend: $('#screen-friend'), chat: $('#screen-chat'), ach: $('#screen-ach'),
    discussions: $('#screen-discussions'),
    updates: $('#screen-updates'), quiz: $('#screen-quiz'),
    customize: $('#screen-customize'), badges: $('#screen-badges'),
    market: $('#screen-market'), cardindex: $('#screen-cardindex'),
    glossary: $('#screen-glossary'), open: $('#screen-open'),
    games: $('#screen-games'), wikdle: $('#screen-wikdle'),
    duel: $('#screen-duel'), reveal: $('#screen-reveal'), versus: $('#screen-versus'),
    quests: $('#screen-quests'), leaderboard: $('#screen-leaderboard'), guilds: $('#screen-guilds'),
    season: $('#screen-season'), atelier: $('#screen-atelier'), selling: $('#screen-selling')
  },
  seasonTitle: $('#season-title'), seasonBanner: $('#season-banner'), seasonMark: $('#season-mark'), seasonKicker: $('#season-kicker'),
  seasonName: $('#season-name'), seasonTagline: $('#season-tagline'), seasonDates: $('#season-dates'),
  seasonPoints: $('#season-points'), seasonPointsLabel: $('#season-points-label'), seasonNext: $('#season-next'), seasonBar: $('#season-bar'),
  seasonTrackLabel: $('#season-track-label'), seasonTrack: $('#season-track'), seasonQuestLabel: $('#season-quest-label'), seasonQuest: $('#season-quest'),
  seasonShopLabel: $('#season-shop-label'), seasonShop: $('#season-shop'), seasonBoardLabel: $('#season-board-label'), seasonBoard: $('#season-board'),
  seasonCalendarLabel: $('#season-calendar-label'), seasonCalendar: $('#season-calendar'),
  gamesTitle: $('#games-title'), gamesSub: $('#games-sub'), gamesList: $('#games-list'),
  wikdleTitle: $('#wikdle-title'), wikdleBody: $('#wikdle-body'), wikdleBack: $('#wikdle-back'),
  duelTitle: $('#duel-title'), duelBody: $('#duel-body'), duelBack: $('#duel-back'),
  revealTitle: $('#reveal-title'), revealBody: $('#reveal-body'), revealBack: $('#reveal-back'),
  versusTitle: $('#versus-title'), versusBody: $('#versus-body'), versusBack: $('#versus-back'),
  questsTitle: $('#quests-title'), questsSub: $('#quests-sub'), questsBody: $('#quests-body'),
  leaderboardTitle: $('#leaderboard-title'), leaderboardSeg: $('#leaderboard-seg'),
  leaderboardBody: $('#leaderboard-body'), leaderboardMe: $('#leaderboard-me'),
  backdrop: $('#backdrop'), navbar: $('#navbar'),
  menuBtn: $('#menu-btn'), menuIcon: $('#menu-icon'),

  levelBadge: $('#level-badge'),
  wallet: $('#wallet'), walletMark: $('#wallet-mark'), walletAmount: $('#wallet-amount'),
  bell: $('#bell'), bellIcon: $('#bell-icon'), bellCount: $('#bell-count'), menuBadge: $('#menu-badge'),
  discussionsTitle: $('#discussions-title'), discussionsIntro: $('#discussions-intro'), discussionsList: $('#discussions-list'),
  discussionsMore: $('#discussions-more'), discussionsEmpty: $('#discussions-empty'), discussionsEmptyMark: $('#discussions-empty-mark'),
  discussionsEmptyText: $('#discussions-empty-text'), discussionsStatus: $('#discussions-status'),
  statsStamp: $('#stats-stamp'), friendStatsStamp: $('#friend-stats-stamp'),

  drawer: $('#drawer'), drawerScrim: $('#drawer .drawer-scrim'), drawerPanel: $('#drawer .drawer-panel'),
  drawerMark: $('#drawer-mark'), drawerWho: $('#drawer-who'), drawerLinks: $('#drawer-links'),
  updatesTitle: $('#updates-title'), updatesSub: $('#updates-sub'), updatesList: $('#updates-list'),
  quizTitle: $('#quiz-title'), quizBody: $('#quiz-body'), quizBack: $('#quiz-back'),
  splash: $('#splash'), splashMark: $('#splash-mark'),

  packsSeg: $('#packs-seg'), packsRail: $('#packs-rail'), packsCaption: $('#packs-caption'),
  packsName: $('#packs-name'), packsSub: $('#packs-sub'), packsOwn: $('#packs-own'),
  packsActions: $('#packs-actions'), packsOpen: $('#packs-open'), packsOpenAll: $('#packs-open-all'), packsHint: $('#packs-hint'),
  packsEmpty: $('#packs-empty'), packsEmptyMark: $('#packs-empty-mark'),
  packsEmptyText: $('#packs-empty-text'), packsEmptyCta: $('#packs-empty-cta'),
  creatorWrap: $('#creator-wrap'), creator: $('#creator'), forgeSeal: $('#forge-seal'),
  forgeTitle: $('#forge-title'), forgeNote: $('#forge-note'), forgeIdeas: $('#forge-ideas'), forgeResults: $('#forge-results'),
  creatorInput: $('#creator-input'), creatorGo: $('#creator-go'), creatorStatus: $('#creator-status'),
  creatorMineLabel: $('#creator-mine-label'),
  creatorMine: $('#creator-mine'), creatorEmpty: $('#creator-empty'),
  creatorEmptyMark: $('#creator-empty-mark'), creatorEmptyText: $('#creator-empty-text'),

  timedTitle: $('#timed-title'), timedOpen: $('#timed-open'), timedOpenAll: $('#timed-open-all'),
  freeRing: $('#free-ring'), freeCount: $('#free-count'), freeCap: $('#free-cap'),
  freeState: $('#free-state'), freePips: $('#free-pips'), freeFoot: $('#free-foot'),
  freeTrackLabel: $('#free-track-label'), freePerks: $('#free-perks'),
  trackLevel: $('#track-level'), trackRemaining: $('#track-remaining'), trackBar: $('#track-bar'),
  trackNext: $('#track-next'),

  shopTitle: $('#shop-title'), restock: $('#restock'), shopMarket: $('#shop-market'),
  shopPurse: $('#shop-purse'), shopPurseLabel: $('#shop-purse-label'),
  shopRestockLabel: $('#shop-restock-label'),

  oddsBtn: $('#odds-btn'), oddsIcon: $('#odds-icon'),

  binderTitle: $('#binder-title'), binderStats: $('#binder-stats'),
  albumShelf: $('#album-shelf'), albumView: $('#album-view'), albumBack: $('#album-back'),
  albumName: $('#album-name'), albumProgress: $('#album-progress'),
  binderSeg: $('#binder-seg'), binderSegWrap: $('#binder-seg-wrap'),
  binderTools: $('#binder-tools'), classicView: $('#classic-view'),
  classicFilter: $('#classic-filter'), classicFilterCount: $('#classic-filter-count'),
  classicCount: $('#classic-count'), classicSort: $('#classic-sort'), classicRarity: $('#classic-rarity'),
  classicPick: $('#classic-pick'), simpleAlbums: $('#simple-albums'), binderSimple: $('#binder-simple'),
  binderSell: $('#binder-sell'), binderModes: $('#binder-modes'),
  sellingTitle: $('#selling-title'), sellingIntro: $('#selling-intro'), sellingRoot: $('#selling-root'),
  classicSearch: $('#classic-search'), classicSearchWrap: $('#classic-search-wrap'),
  classicSearchMark: $('#classic-search-mark'),
  albumBook: $('#album-book'), albumLeaf: $('#album-leaf'),
  pageSlots: $('#page-slots'), pageno: $('#pageno'),
  panel: $('#panel'), panelBody: $('#panel-body'), panelToggle: $('#panel-toggle'),
  showcaseLabel: $('#showcase-label'), showcaseNote: $('#showcase-note'), showcaseGrid: $('#showcase-grid'),
  friendShowcaseHead: $('#friend-showcase-head'), friendShowcaseLabel: $('#friend-showcase-label'), friendShowcase: $('#friend-showcase'),
  friendBadgesLabel: $('#friend-badges-label'), friendBadgesEmpty: $('#friend-badges-empty'), friendBadges: $('#friend-badges'),
  guildsTitle: $('#guilds-title'), guildsIntro: $('#guilds-intro'), guildHome: $('#guild-home'), guildJoin: $('#guild-join'),
  guildTag: $('#guild-tag'), guildName: $('#guild-name'), guildAbout: $('#guild-about'), guildMeta: $('#guild-meta'),
  guildScores: $('#guild-scores'), guildLeave: $('#guild-leave'), guildDelete: $('#guild-delete'), guildInvite: $('#guild-invite'),
  guildInvitesRoom: $('#guild-invites-room'), guildInvitesLabel: $('#guild-invites-label'), guildInvites: $('#guild-invites'),
  guildRosterLabel: $('#guild-roster-label'), guildRoster: $('#guild-roster'),
  guildGoal: $('#guild-goal'), guildGoalLabel: $('#guild-goal-label'), guildGoalLeft: $('#guild-goal-left'), guildGoalText: $('#guild-goal-text'),
  guildGoalBar: $('#guild-goal-bar'), guildGoalCount: $('#guild-goal-count'), guildGoalReward: $('#guild-goal-reward'), guildGoalClaim: $('#guild-goal-claim'),
  guildMatch: $('#guild-match'), guildMatchLabel: $('#guild-match-label'), guildMatchLeft: $('#guild-match-left'), guildVersus: $('#guild-versus'), guildMatchLast: $('#guild-match-last'),
  guildRoomsSeg: $('#guild-rooms-seg'), guildRoomChat: $('#guild-room-chat'), guildRoomBank: $('#guild-room-bank'), guildRoomMembers: $('#guild-room-members'),
  guildChatLog: $('#guild-chat-log'), guildChatForm: $('#guild-chat-form'), guildChatInput: $('#guild-chat-input'), guildChatSend: $('#guild-chat-send'),
  guildBankNote: $('#guild-bank-note'), guildBankDonate: $('#guild-bank-donate'), guildBank: $('#guild-bank'),
  guildFind: $('#guild-find'), guildFindMark: $('#guild-find-mark'), guildFindInput: $('#guild-find-input'), guildFindGo: $('#guild-find-go'),
  guildFindStatus: $('#guild-find-status'), guildResults: $('#guild-results'), guildCreateLabel: $('#guild-create-label'),
  guildCreate: $('#guild-create'), guildCreateGo: $('#guild-create-go'), guildCreateStatus: $('#guild-create-status'),
  guildBoardLabel: $('#guild-board-label'), guildSeg: $('#guild-seg'), guildBoard: $('#guild-board'),
  albumDots: $('#album-dots'), albumHint: $('#album-hint'),
  achTitle: $('#ach-title'), achSub: $('#ach-sub'), achList: $('#ach-list'),
  friendActions: $('#friend-actions'), friendAlbums: $('#friend-albums'),
  tradesHead: $('#trades-head'), tradesLabel: $('#trades-label'), tradesList: $('#trades-list'),
  friendsStale: $('#friends-stale'),
  chatBack: $('#chat-back'), chatAvatar: $('#chat-avatar'), chatName: $('#chat-name'),
  chatPresence: $('#chat-presence'), chatLog: $('#chat-log'),
  chatWho: $('#chat-who'), chatTools: $('#chat-tools'), chatTyping: $('#chat-typing'),
  chatForm: $('#chat-form'), chatInput: $('#chat-input'), chatSend: $('#chat-send'),
  binderEmpty: $('#binder-empty'), binderEmptyMark: $('#binder-empty-mark'),
  binderEmptyText: $('#binder-empty-text'),
  filterOpen: $('#filter-open'), filterCount: $('#filter-count'),

  profileTitle: $('#profile-title'),
  profileRing: $('#profile-ring'), profileLevel: $('#profile-level'), profileRank: $('#profile-rank'),
  xpBar: $('#xp-bar'), xpLine: $('#xp-line'), nextRewardLabel: $('#next-reward-label'),
  nextReward: $('#next-reward'), statsLabel: $('#stats-label'), statGrid: $('#stat-grid'),
  rarityLabel: $('#rarity-label'), rarityBars: $('#rarity-bars'),

  settingsTitle: $('#settings-title'), themeLabel: $('#theme-label'), themeGrid: $('#theme-grid'),
  customizeTitle: $('#customize-title'), identityLabel: $('#identity-label'), identityList: $('#identity-list'),
  framesLabel: $('#frames-label'), framesNote: $('#frames-note'), frameStyles: $('#frame-styles'),
  fxLabel: $('#fx-label'), fxNote: $('#fx-note'), fxTiers: $('#fx-tiers'), customizeDoor: $('#customize-door'),
  looksLabel: $('#looks-label'), looksNote: $('#looks-note'), lookPicks: $('#look-picks'),
  openingsLabel: $('#openings-label'), openingsNote: $('#openings-note'), openingPicks: $('#opening-picks'),
  inkBtn: $('#ink-btn'), inkIcon: $('#ink-icon'),
  atelierTitle: $('#atelier-title'), atelierLead: $('#atelier-lead'), atelierPurseLabel: $('#atelier-purse-label'), atelierPurse: $('#atelier-purse'),
  atelierCoinsLabel: $('#atelier-coins-label'), atelierCoins: $('#atelier-coins'), atelierExchange: $('#atelier-exchange'),
  atelierThemesLabel: $('#atelier-themes-label'), atelierThemes: $('#atelier-themes'), atelierFramesLabel: $('#atelier-frames-label'), atelierFrames: $('#atelier-frames'),
  atelierFxLabel: $('#atelier-fx-label'), atelierFxNote: $('#atelier-fx-note'), atelierFx: $('#atelier-fx'),
  atelierLooksLabel: $('#atelier-looks-label'), atelierLooksNote: $('#atelier-looks-note'), atelierLooks: $('#atelier-looks'),
  atelierOpeningsLabel: $('#atelier-openings-label'), atelierOpeningsNote: $('#atelier-openings-note'), atelierOpenings: $('#atelier-openings'),
  atelierSupportHead: $('#atelier-support-head'), atelierSupportLabel: $('#atelier-support-label'), atelierSupportNote: $('#atelier-support-note'), atelierSupport: $('#atelier-support'),
  shopAds: $('#shop-ads'),
  badgesLabel: $('#badges-label'), badgeGrid: $('#badge-grid'),
  badgesTitle: $('#badges-title'), badgesIntro: $('#badges-intro'), badgesAll: $('#badges-all'),
  indexTitle: $('#index-title'), indexIntro: $('#index-intro'), indexCounts: $('#index-counts'),
  indexSearch: $('#index-search'), indexRarities: $('#index-rarities'), indexSorts: $('#index-sorts'),
  indexStatus: $('#index-status'), indexList: $('#index-list'), indexMore: $('#index-more'),
  glossaryTitle: $('#glossary-title'), glossaryIntro: $('#glossary-intro'), glossaryList: $('#glossary-list'),
  marketTitle: $('#market-title'), marketIntro: $('#market-intro'), marketSeg: $('#market-seg'),
  marketStatus: $('#market-status'), marketList: $('#market-list'), marketSell: $('#market-sell'),
  openPrev: $('#open-prev'), openNext: $('#open-next'),
  prefsLabel: $('#prefs-label'), settingsList: $('#settings-list'),
  accountLabel: $('#account-label'), accountList: $('#account-list'),
  dataLabel: $('#data-label'), dataList: $('#data-list'),
  redeemLabel: $('#redeem-label'), redeemList: $('#redeem-list'),
  aboutLabel: $('#about-label'), aboutList: $('#about-list'),

  openScreen: $('#screen-open'), openBack: $('#open-back'), openTitle: $('#open-title'),
  openSkip: $('#open-skip'), openQuick: $('#open-quick'), openFast: $('#open-fast'), openFastLabel: $('#open-fast-label'), openAll: $('#open-all'),
  burstLayer: $('#burst-layer'),
  openProgress: $('#open-progress'), openStage: $('#open-stage'), boosterSlot: $('#booster-slot'),
  cardStack: $('#card-stack'), summary: $('#summary'), openHint: $('#open-hint'), openDone: $('#open-done'),

  sheet: $('#sheet'), sheetTitle: $('#sheet-title'), sheetBody: $('#sheet-body'), sheetClose: $('#sheet-close'),

  friendsTitle: $('#friends-title'), friendsIntro: $('#friends-intro'),
  find: $('#find'), findMark: $('#find-mark'), findInput: $('#find-input'),
  findGo: $('#find-go'), findStatus: $('#find-status'), findResults: $('#find-results'),
  resultsHead: $('#results-head'), resultsLabel: $('#results-label'),
  incomingHead: $('#incoming-head'), incomingLabel: $('#incoming-label'), incomingList: $('#incoming-list'),
  friendsHead: $('#friends-head'), friendsLabel: $('#friends-label'), friendsList: $('#friends-list'),
  outgoingHead: $('#outgoing-head'), outgoingLabel: $('#outgoing-label'), outgoingList: $('#outgoing-list'),
  friendsEmpty: $('#friends-empty'), friendsEmptyMark: $('#friends-empty-mark'),
  friendsEmptyText: $('#friends-empty-text'),

  friendBack: $('#friend-back'), friendName: $('#friend-name'), friendRing: $('#friend-ring'),
  friendLevel: $('#friend-level'), friendRank: $('#friend-rank'), friendStats: $('#friend-stats'),
  friendCardsLabel: $('#friend-cards-label'), friendCardsStatus: $('#friend-cards-status'),
  friendStatsLabel: $('#friend-stats-label'), friendRarityLabel: $('#friend-rarity-label'),
  friendRarityBars: $('#friend-rarity-bars'), friendSeg: $('#friend-seg'),
  friendSegWrap: $('#friend-seg-wrap'), friendClassic: $('#friend-classic'),
   friendRemove: $('#friend-remove'),

  gate: $('#gate'), gateMark: $('#gate-mark'), gateTitle: $('#gate-title'), gateBody: $('#gate-body'),
  gateSeg: $('#gate-seg'), gateSteam: $('#gate-steam'), gateForm: $('#gate-form'), gateStatus: $('#gate-status'),
  gateAlt: $('#gate-alt'), gateFoot: $('#gate-foot'),

  welcome: $('#welcome'), welcomeMark: $('#welcome-mark'), welcomeTitle: $('#welcome-title'),
  welcomeBody: $('#welcome-body'), langChoices: $('#lang-choices'), starter: $('#starter'),
  starterTitle: $('#starter-title'), starterBody: $('#starter-body'),
  starterLoot: $('#starter-loot'), starterGo: $('#starter-go'),

  flash: $('#flash'), toast: $('#toast'), xpPop: $('#xp-pop')
});

const pcShell = isPc ? import('../pc/index.js') : null;

let starting = null;
let starterSpecs = null;

const fromDaily = (name) => (...args) => import('./daily.js').then((m) => m[name](...args));
const openDaily = fromDaily('openDaily');
const openOdds = fromDaily('openOdds');
const openWallet = fromDaily('openWallet');

const renderCustomize = () => import('./settings.js').then((m) => m.renderCustomize());

const afterIntro = (fn) => {
  if (document.getElementById('intro')) addEventListener('wikster:start', () => fn(), { once: true });
  else fn();
};

const whenIdle = (fn, wait) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: wait });
  else setTimeout(fn, 200);
};

export function showWelcome() {
  el.welcomeMark.innerHTML = logoSvg({ size: 62 });
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.replaceChildren(...LANGUAGES.map((lang) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice lang-choice${lang.id === getLanguage() ? ' is-on' : ''}`;
    button.dataset.lang = lang.id;
    button.innerHTML = `<span>${lang.label}</span><span>${iconSvg('chevron', { size: 16 })}</span>`;
    press(button, { sound: null });
    button.addEventListener('click', () => {
      setLanguage(lang.id);
      synth.resume();
      synth.playTap();
      showStarter();
    });
    return button;
  }));
  if (!starting || starterSpecs) { starting = null; starterSpecs = null; }
  el.starter.hidden = true;
  el.welcome.hidden = false;
}

function paintStarter() {
  el.starterTitle.textContent = t('starterTitle');
  el.starterBody.innerHTML = t('starterBody', { coins: money(starterCoins()), packs: STARTER_PACKS });
  el.starterGo.textContent = t('letsGo');
  if (starterSpecs) {
    el.starterLoot.classList.remove('is-loading');
    el.starterLoot.replaceChildren(...starterSpecs.map((spec) => buildBooster(spec, { size: 'is-tiny' })));
  } else {
    el.starterLoot.classList.add('is-loading');
    el.starterLoot.innerHTML = `<span class="muted is-pending">${esc(t('starterLoading'))}</span>`;
  }
}

async function grantStarterPacks() {
  let starters;
  if (serverEconomy()) {
    const res = await econ('starter').catch(() => null);
    starters = res?.specs ?? [];
    starters.forEach((spec) => gainBooster(spec, 1));
  } else {
    store.grantStarter(state.profile);
    starters = shuffle(THEME_PACKS).slice(0, STARTER_PACKS).map((theme) => ({
      kind: 'theme', themeId: theme.id, rarityId: null, cards: STARTER_PACK_CARDS
    }));
    starters.forEach((spec) => gainBooster(spec, 1));
  }
  starterSpecs = starters;
  refreshWallet();
  paintStarter();
  renderPacks();
  renderShop();
  renderBinder();
  updateBadges();
}

export function showStarter() {
  applyStrings();
  el.welcomeTitle.textContent = t('welcomeTitle');
  el.welcomeBody.textContent = t('welcomeBody');
  el.langChoices.querySelectorAll('.lang-choice').forEach((b) =>
    b.classList.toggle('is-on', b.dataset.lang === getLanguage()));
  paintStarter();
  if (el.starter.hidden) {
    el.starter.hidden = false;
    synth.playFanfare();
  }
  starting ??= grantStarterPacks().catch((error) => console.error('starter', error));
  return starting;
}

export function regradeCollection() {
  let changed = 0;
  for (const entry of Object.values(state.collection.entries ?? {})) {
    if (entry.special) { if (!isFriendId(entry.special) && entry.rarityId !== SPECIAL_RARITY_ID) { entry.rarityId = SPECIAL_RARITY_ID; changed++; } continue; }
    let pop = entry.popularity;
    if (!Number.isFinite(pop)) {
      pop = Number.isFinite(entry.views) && entry.views > 0
        ? popularityFromViews(entry.views)
        : popularityFromWordCount(entry.wordCount);
      entry.popularity = pop;
    }
    const rarity = entry.rarityId ? rarityById(entry.rarityId) : rarityFromPopularity(pop);
    const price = priceFor(pop, rarity);
    if (entry.rarityId !== rarity.id || entry.price !== price) {
      entry.rarityId = rarity.id;
      entry.price = price;
      changed++;
    }
  }
  if (!changed) return 0;
  const counts = {};
  for (const entry of Object.values(state.collection.entries ?? {})) {
    counts[entry.rarityId] = (counts[entry.rarityId] ?? 0) + Math.max(1, entry.count ?? 1);
  }
  state.profile.rarityCounts = counts;
  store.saveCollection(state.collection);
  store.saveProfile(state.profile);
  return changed;
}

export function init() {
  restoreLive();
  onEconomySettled(() => {
    refreshWornTheme();
    renderPacks();
    updateBadges();
    if (state.tab === 'binder') renderBinder();
    if (state.tab === 'shop') renderShop();
  });
  window.addEventListener('online', paintOpenHint);
  window.addEventListener('offline', paintOpenHint);
  buildDrawer();
  WIDE.addEventListener('change', () => {
    buildDrawer();
    applyPanelState();
    setTickerJob('panel', WIDE.matches ? paintPanel : null);
    paintPanel({ force: true });
    if (state.tab === 'binder') renderBinder();
    if (state.tab === 'packs') renderPacks();
  });

  const wanted = themeById(storedTheme());
  if (wanted.code && !codeThemeOwned(state.profile, wanted.id) && !missingCodeDefs(state.profile).length) {
    try { localStorage.setItem(THEME_KEY, DEFAULT_THEME); touch(THEME_KEY); } catch {}
  }
  useTheme(storedTheme());
  el.splashMark.innerHTML = logoSvg({ size: 78 });
  backdrop.mount(el.backdrop).setTheme(wornScene.scene);

  const owed = store.reclaimOpenInFlight(state.inventory);
  if (owed) setTimeout(() => toast(t('openRecovered', { name: specName(owed) }), 'ok'), 2400);

  const healed = store.healCustomPacks(state.collection);
  if (healed) state.customPacks = store.loadCustomPacks();

  const pruned = store.pruneImagelessCards(state.collection);
  if (pruned) console.info(`Removed ${pruned} pictureless card(s) from the collection`);

  purgeRetiredCodes();
  purgeRetiredThemes();
  regradeCollection();

  setTimeout(migrateLanguages, 3200);
  setTimeout(migrateSpecialCards, 1600);
  setTimeout(migrateViews, 5200);
  watchForUpdates();
  setBeforeUpdateReload(() => flushSync());
  setTimeout(() => checkWhatsNew({ fresh: !state.profile.started }), 1200);
  checkNotices();
  setTimeout(registerShell, 3000);
  setTimeout(warmDrawer, 2500);
  setTimeout(warmOpenFx, 4000);
  afterIntro(() => setTimeout(() => loadHonours().then(() => { updateBadges(); paintDrawerLinks(); }).catch(() => {}), roomyConnection() ? 3000 : 15000));
  sayWipeNote();
  el.wikdleBack.addEventListener('click', () => { synth.playTap(); showScreen('games'); });
  el.panelToggle.addEventListener('click', togglePanel);
  press(el.panelToggle, { sound: null });
  el.duelBack.addEventListener('click', () => { synth.playTap(); showScreen('games'); });
  el.revealBack.addEventListener('click', () => { synth.playTap(); import('./reveal.js').then((m) => m.leaveReveal()); showScreen('games'); });
  el.versusBack.addEventListener('click', () => { synth.playTap(); showScreen('games'); });
  quests.onQuestsChange(() => { paintDrawerLinks(); paintPanel({ force: true }); });
  reportAlbums();
  applyPanelState();
  paintPanel({ force: true });

  live.walletOdo = new Odometer(el.walletAmount);
  live.levelRing = new Ring(el.levelBadge, { size: 40, width: 3 });
  live.profileRing = new Ring(el.profileRing, { size: 62, width: 4 });
  live.friendRing = new Ring(el.friendRing, { size: 62, width: 4 });
  live.freeRing = new Ring(el.freeRing, { size: 132, width: 8 });
  live.xpBar = new Bar(el.xpBar);
  live.trackBar = new Bar(el.trackBar);

  packsRail = new Rail(el.packsRail, { onFocus: paintPackCaption });
  live.sheet = new Sheet(el.sheet);
  initBack();

  live.packsSeg = new Segmented(el.packsSeg, [
    { id: 'owned', label: t('owned') },
    { id: 'custom', label: t('tabCustom') }
  ], (mode) => { state.packMode = mode; renderPacks(); });

  live.nav = new NavBar(el.navbar, [
    { id: 'shop', icon: iconSvg('gem', { size: 21 }) },
    { id: 'timed', icon: iconSvg('clock', { size: 21 }) },
    { id: 'packs', icon: iconSvg('packs', { size: 21 }) },
    { id: 'binder', icon: iconSvg('collection', { size: 21 }) },
    { id: 'profile', icon: iconSvg('profile', { size: 21 }) }
  ], (id) => {
    if (id === 'packs') showPacks();
    if (id === 'binder') renderBinder();
    if (id === 'shop') { payStipend(); showShop(); }
    if (id === 'timed') renderTimed();
    if (id === 'profile') { renderProfile(); loadFriends(); }
    showScreen(id);
  });
  live.nav.select(navTabFor(state.tab), { silent: true });

  placeDrawerLinks();

  applySettings();
  applyStrings();
  refreshWallet();
  refreshLevelBadge();
  updateBadges();
  initSwipe();
  tilt.init();

  renderPacks();
  if (isPc) renderShop();
  else {
    on('screen', (name) => { if (name === 'shop' && !shopIsBuilt()) renderShop(); });
    if (roomyConnection()) afterIntro(() => whenIdle(() => { if (!shopIsBuilt()) renderShop(); }, 1500));
  }
  renderBinder();

  installTapFeedback();
  [el.wallet, el.menuBtn, el.inkBtn, el.bell, el.levelBadge, el.packsOpen, el.timedOpen,
   el.filterOpen, el.openBack, el.openSkip, el.openDone, el.sheetClose, el.starterGo,
   el.timedOpenAll, el.packsOpenAll, el.openAll,
   el.packsEmptyCta, el.creatorGo, el.findGo, el.friendBack,
   el.friendRemove, el.gateAlt, el.oddsBtn, el.albumBack, el.chatBack, el.quizBack].forEach((node) => press(node));

  el.wallet.addEventListener('click', openWallet);
  el.inkBtn?.addEventListener('click', () => { import('./atelier.js').then((m) => m.openInkSheet()); });
  el.bell.addEventListener('click', openNotifications);
  el.menuBtn.addEventListener('click', () => (el.drawer.hidden ? openDrawer() : closeDrawer()));
  el.drawerScrim.addEventListener('click', closeDrawer);
  el.levelBadge.addEventListener('click', () => { renderProfile(); showScreen('profile'); });

  el.oddsIcon.innerHTML = iconSvg('gem', { size: 15 });
  el.oddsBtn.addEventListener('click', () => {
    const spec = el.openScreen?.classList.contains('is-active')
      ? state.spec
      : (el.screens.packs?.classList.contains('is-active')
          ? state.packSlots?.[packsRail.index]?.spec ?? null
          : null);
    openOdds(spec?.rarityId ?? null, { today: spec?.kind === 'today' });
  });
  el.marketSell.addEventListener('click', () => { synth.playTap(); import('./market.js').then((m) => m.openSellSheet()); });
  press(el.marketSell, { sound: null });
  document.querySelectorAll('.help-btn').forEach((button) => {
    press(button, { sound: null });
    button.addEventListener('click', () => { synth.playTap(); openHelp(button.dataset.help); });
  });
  el.filterOpen.addEventListener('click', openFilters);
  el.classicFilter.addEventListener('click', openFilters);
  el.quizBack.addEventListener('click', () => import('./quiz.js').then((m) => m.leaveQuiz()));
  document.getElementById('app')?.addEventListener('scroll', () => backdrop.markBusy(), { passive: true });
  el.chatBack.addEventListener('click', () => {
    clearInterval(live.chatTimer);
    const from = state.chatFrom;
    state.chat = null;
    if (from === 'discussions') { import('./inbox.js').then((m) => m.openTarget('discussions')); return; }
    renderFriends();
    showScreen('friends');
  });
  el.chatForm.addEventListener('submit', sendChat);
  el.chatInput.addEventListener('input', chatTyped);
  el.chatInput.addEventListener('focus', () => setTimeout(keepChatBottom, 260));
  window.visualViewport?.addEventListener('resize', keepChatBottom);
  window.addEventListener('resize', keepChatBottom);
  press(el.chatWho, { sound: null });
  el.chatWho.addEventListener('click', () => {
    const entry = state.chat;
    if (!entry) return;
    synth.playTap();
    openFriend(entry);
  });
  el.albumBack.addEventListener('click', () => {
    synth.playSheet(false);
    state.album = null;
    renderBinder();
  });
  el.albumBook.addEventListener('pointerdown', (event) => {
    trackDrag(event, {
      onMove: () => {},
      onEnd: (dx) => { if (Math.abs(dx) > 42) turnAlbumPage(dx < 0 ? 1 : -1); }
    });
  });
  el.packsEmptyCta.addEventListener('click', () => { payStipend(); renderShop(); showScreen('shop'); });
  el.creator.addEventListener('submit', createCustomPack);
  el.creatorInput.addEventListener('input', onFinderInput);

  const leaveOpen = () => {
    const home = homeTabFor(state.spec);
    if (home === 'timed') renderTimed();
    else renderPacks();
    showScreen(home);
  };
  el.openBack.addEventListener('click', leaveOpen);
  el.openDone.addEventListener('click', leaveOpen);
  el.openSkip.addEventListener('click', skipToSummary);

  el.sheetClose.addEventListener('click', () => live.sheet.hide());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.drawer.hidden) closeDrawer();
    else if (live.sheet.open) live.sheet.hide();
  });

  el.gateForm.onsubmit = submitGate;
  el.gateAlt.onclick = gateAltAction;
  el.find.addEventListener('submit', runSearch);
  el.friendBack.addEventListener('click', () => {
    state.viewing = null;
    synth.playTap();
    renderFriends();
    showScreen('friends');
  });
  el.friendRemove.addEventListener('click', () => {
    const entry = state.viewing;
    if (!entry) return;
    if (el.friendRemove.dataset.armed !== '1') {
      el.friendRemove.dataset.armed = '1';
      el.friendRemove.textContent = t('friendsRemoveConfirm');
      el.friendRemove.classList.add('btn-danger');
      synth.playArm();
      setTimeout(() => {
        el.friendRemove.dataset.armed = '';
        el.friendRemove.textContent = t('friendsRemove');
        el.friendRemove.classList.remove('btn-danger');
      }, 4000);
      return;
    }
    el.friendRemove.dataset.armed = '';
    el.friendRemove.textContent = t('friendsRemove');
    el.friendRemove.classList.remove('btn-danger');
    state.viewing = null;
    showScreen('friends');
    socialAction(() => account.removeFriendship(entry.id), 'friendsRemoved');
  });

  el.starterGo.addEventListener('click', () => {
    el.welcome.hidden = true;
    synth.playTap();
    showScreen('packs');
    const daily = () => { if (canClaim(state.profile.daily)) openDaily({ auto: true }); };
    setTimeout(() => startTour({ done: daily }), 350);
  });

  music.prime();
  music.poke();
  for (const gesture of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(gesture, () => music.poke(), { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    if (visible) {
      leaving(false);
      live.visibleSince = Date.now();
      syncTimed();
      updateBadges();
      music.unpark();
      unparkLiveSocial();
      resumeAccount();
      settlePresence();
      warmEconomy();
    } else {
      leaving();
      flushEconomy();
      warmEconomy();
      stopSocialPoll();
      parkLiveSocial();
      flushPlaytime();
      live.visibleSince = null;
      synth.suspend();
      music.park();
      settlePresence();
      flushSync();
      quests.flushQuests();
    }
    backdrop.setPaused(!visible || document.documentElement.classList.contains('is-immersive'));
    syncTicker();
  });
  window.addEventListener('pagehide', () => { leaving(); flushEconomy(); flushPlaytime(); flushSync(); quests.flushQuests(); });
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    flushPlaytime();
    if (state.tab === 'profile') paintPlaytime();
  }, 60000);
  window.addEventListener('online', () => { leaderboard.flushScores().catch(() => {}); flushGuildGoal().catch(() => {}); syncSoon(); quests.flushQuests(); });

  if (document.getElementById('intro')) addEventListener('wikster:start', () => backdrop.start(), { once: true });
  else backdrop.start();
  pcShell?.then((m) => m.startPc()).catch((error) => console.error('pc shell', error));
  startSession();
}

export async function startSession() {
  if (!account.configured) {
    if (!languageChosen() || !state.profile.started) showWelcome();
    else {
      payStipend();
      if (canClaim(state.profile.daily)) openDaily({ auto: true });
    }
    return endSplash();
  }

  account.leaveToServer((id) => serverOwnedKeys(id), () => MIRRORED);
  onSaveChanged((key) => { if (!key || !serverOwnedKeys(userId()).includes(key)) syncSoon(); });
  account.onAuthChange((session) => { onSession(session); });

  try {
    if (await landFromEmail()) { startLiveOps(); return; }
    const session = await account.currentSession();
    if (!session) startLiveOps();
    await onSession(session);
  } catch {
    startLiveOps();
    showGate();
    endSplash();
  }
}

export const SPLASH_MIN = 900;

export const splashStart = performance.now();

export let splashDone = false;

export function endSplash() {
  if (splashDone) return;
  splashDone = true;
  window.wiksterReady = true;
  dispatchEvent(new Event('wikster:ready'));
  if (document.getElementById('intro')) {
    el.splash.hidden = true;
    return;
  }
  const wait = Math.max(0, SPLASH_MIN - (performance.now() - splashStart));
  setTimeout(() => {
    el.splash.classList.add('is-going');
    setTimeout(() => { el.splash.hidden = true; }, 460);
  }, wait);
}

addEventListener('wikster:start', () => { synth.resume(); synth.playFanfare(); });
addEventListener('wikster:intro-skip', () => { synth.resume(); synth.playTap(); });
addEventListener('wikster:intro-mark', () => { if (synth.ctx?.state === 'running') synth.playReady(); });

export let packsRail;

live.binderSeg = undefined;

onInk((kind, n) => { bump(state.profile, kind === 'earn' ? 'inkEarned' : 'inkSpent', n); store.saveProfile(state.profile); });
{
  const day = utcDayIndex();
  if (ledger(state.profile).lastPlayDay !== day) { ledger(state.profile).lastPlayDay = day; bump(state.profile, 'playDays'); store.saveProfile(state.profile); }
}
const styled = () => new Promise((done) => {
  if (!document.getElementById('wikster-css') || document.documentElement.classList.contains('is-styled')) { done(); return; }
  addEventListener('wikster:styled', () => done(), { once: true });
});

Promise.all([loadLanguage(), styled()]).then(init);

window.__wikster = {
  state, store, debug, RARITIES, synth, music, backdrop, THEMES, THEME_PACKS, regrade: regradeCollection, serverEconomy, econ,
  economyIdle, economyBusy, economySettling, localTotals,
  levelUp: showLevelUp, wikdle,
  draw: drawArticles, generateShop, syncSocial, drawCaps: drawCapsFor, drawPack: toDrawPack, odds, specId,
  topRead: fetchTopRead, todayRarity: todayRarityForRank,
  signOut: () => leaveAccount(),
  flushSync,
  pollBoards: () => emit('board-poll'),
  guildGoal: (metric, detail) => { reportGuildGoal(metric, detail); return flushGuildGoal(); },
  season: (metric, detail) => earnSeasonPoints(pointsForReport(metric, detail)),
  seasonAt,
  setTheme: (id) => { useTheme(id); renderPacks(); renderShop(); renderBinder(); if (state.tab === 'customize') renderCustomize(); },
  debugRarity(id) {
    const forced = rarityById(id);
    document.querySelectorAll('.card').forEach((card) => {
      applyRarityVars(card, forced);
      const badge = card.querySelector('.rarity-badge');
      if (badge) badge.textContent = tx(forced.name);
    });
    return forced;
  },
  grant(amount = 10000) { if (serverEconomy()) return 'server'; store.saveWallet(store.loadWallet() + amount); refreshWallet(); },
  grantInk(amount = 500) { if (serverEconomy()) return 'server'; addInk(amount); refreshWallet(); },
  own(kind, ids) { if (serverEconomy()) return 'server'; for (const id of ids) grant(state.profile, kind, id); store.saveProfile(state.profile); if (state.tab === 'customize') renderCustomize(); },
  giveBooster(spec) { if (serverEconomy()) return 'server'; gainBooster(spec, 1); renderPacks(); },
  giveTimed(n = 5) { if (serverEconomy()) return 'server'; state.profile.timed.count += n; store.saveProfile(state.profile); renderTimed(); updateBadges(); },
  addXp(amount = 5000) { if (serverEconomy()) return 'server';
    const levels = addXp(state.profile.progress, amount);
    if (levels.length) state.profile.pendingLevels.push(...levels);
    store.saveProfile(state.profile);
    refreshLevelBadge();
    drainLevelUps();
    return state.profile.progress;
  },
  timedTopTier,
  boosters: { readyCount, pending: () => pendingOpens().length, openAllTimed },
  resetAll: () => openDanger('all'),
  statsSummary: () => import('./statsboard.js').then((m) => m.publicSummary())
};
