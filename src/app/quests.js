import { t, tx } from '../i18n.js';
import { paintFaces } from './faces.js';
import { bump, bumpMax, bumpMin, noteIn } from '../ledger.js';
import * as quests from '../quests.js';
import { Ring, Segmented, press, reveal } from '../ui/components.js';
import { QUEST_TIERS } from '../data/quests.js';
import { specName } from '../booster.js';
import { iconSvg } from '../data/icons.js';
import * as store from '../collection.js';
import { synth } from '../ui/sound.js';
import { formatCountdown } from '../shop.js';
import * as leaderboard from '../leaderboard.js';
import { formatAmount } from '../pricing.js';
import { earnSeasonPoints, gameStage, houseError, questUserKey, seasonReached } from './arcade.js';
import { econ, serverEconomy } from './econ.js';
import { pointsForQuest } from '../season.js';
import { el, esc, money, refreshWallet, state, toast } from './core.js';
import { addInk, inkForQuestTier } from '../ink.js';
import { paintDrawerLinks } from './drawer.js';
import { showGate, signedIn, userId } from './gate.js';
import { on } from '../ui/bus.js';
import { gainBooster, spawnBurst } from './open.js';
import { claimAll, claimAllBar } from './claimall.js';

quests.useClaimedSource((key) => (key !== 'local' && serverEconomy() ? { known: true, ...(state.profile?.questDay ?? {}) } : null));

function noteQuestClaimed(row) {
  bump(state.profile, 'questsClaimed');
  if (row.quest.tier === 'hard') bump(state.profile, 'questsHard');
  if (quests.describe(quests.loadBoard(questUserKey())).every((r) => r.claimed)) bump(state.profile, 'questDays');
  store.saveProfile(state.profile);
  earnSeasonPoints(pointsForQuest());
}

async function payQuestLocally(row) {
  const reward = await quests.claim(row.id, questUserKey());
  if (reward.money) { store.saveWallet(store.loadWallet() + reward.money); refreshWallet(); }
  if (reward.booster) gainBooster({ ...reward.booster }, 1);
  addInk(inkForQuestTier(row.quest.tier));
  return reward;
}

function questError(error) {
  const code = String(error?.message ?? '');
  toast(esc(code === 'CLAIMED' || code === 'ALREADY_CLAIMED' ? t('questClaimed')
    : code === 'NOT_DONE' || code === 'NOT_CLAIMABLE' ? t('questNotDone') : houseError(error)), 'error');
  synth.playDenied();
}

async function claimQuest(row, tier, btn) {
  btn.disabled = true;
  try {
    if (serverEconomy()) {
      const { reward, paid } = await quests.claimWith(row.id, questUserKey(), (id, opts) => econ('quest', { id }, opts));
      if (reward.booster) gainBooster({ ...reward.booster }, 1);
      seasonReached(paid?.season);
    } else {
      await payQuestLocally(row);
    }
    noteQuestClaimed(row);
    refreshWallet();
    synth.playPurchase();
    const rect = btn.getBoundingClientRect();
    spawnBurst({ shapes: ['star4', 'orb'], colors: [tier.color, '#f8fafc', '#fbbf24'], count: 16, spread: 1, gravity: 0.3 },
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, { scale: 0.8 });
    toast(esc(t('questPaid', { name: tx(row.quest.name) })), 'ok');
  } catch (error) {
    btn.disabled = false;
    questError(error);
  }
  paintQuests(quests.loadBoard(questUserKey()));
  paintDrawerLinks();
}

export async function claimAllQuests(anchor = null) {
  const key = questUserKey();
  const rows = quests.claimableRows(key);
  if (!rows.length) return { ok: 0, failed: 0 };
  let done;
  if (serverEconomy()) {
    const jobs = quests.startClaimAll(key).map(({ row, after, facts }) => async () => {
      let paid;
      try {
        paid = await econ('quest', { id: row.id }, { after, facts, gather: true });
      } catch (error) {
        if (quests.wasClaimed(error)) quests.settleClaims(key, [row.id], { known: true });
        throw error;
      }
      quests.settleClaims(key, [row.id]);
      if (row.quest.reward.booster) gainBooster({ ...row.quest.reward.booster }, 1);
      seasonReached(paid?.season);
      noteQuestClaimed(row);
    });
    done = await claimAll(jobs, { anchor });
  } else {
    done = await claimAll(rows.map((row) => async () => { await payQuestLocally(row); noteQuestClaimed(row); }), { anchor });
  }
  if (!done.ok && done.error) questError(done.error);
  if (state.tab === 'quests') paintQuests(quests.loadBoard(key));
  paintDrawerLinks();
  return done;
}

export function renderQuests() {
  el.questsTitle.textContent = t('tabQuests');
  el.questsSub.hidden = true;
  paintQuests(quests.loadBoard(questUserKey()));
  if (signedIn() && !quests.boardFresh(questUserKey())) quests.syncBoard(questUserKey()).then((board) => { if (state.tab === 'quests') paintQuests(board); }).catch(() => {});
}

export function paintQuests(board) {
  const rows = quests.describe(board);
  const done = rows.filter((r) => r.progress >= r.target).length;
  const pot = rows.reduce((sum, r) => sum + (r.quest.reward.money || 0), 0);

  let shell = el.questsBody.querySelector('.quests-shell');
  const fresh = !shell || shell.dataset.day !== board.day || shell.dataset.user !== questUserKey();
  if (fresh) {
    shell = document.createElement('div');
    shell.className = 'quests-shell';
    shell.dataset.day = board.day;
    shell.dataset.user = questUserKey();
    shell.innerHTML = `
      <div class="quests-top panel">
        <span class="quests-ring" data-ring></span>
        <div class="quests-top-copy">
          <b data-headline></b>
          <span data-sub></span>
          <span class="quests-pot" data-pot></span>
        </div>
      </div>
      <div class="quests-all" data-all></div>
      <div class="quests" data-list></div>
      <p class="quests-reset tabular" data-reset></p>`;
    shell.ring = new Ring(shell.querySelector('[data-ring]'), { size: 58, width: 5 });
    el.questsBody.replaceChildren(shell);
    reveal([shell.querySelector('.quests-top')], { step: 0 });
  }
  shell.ring.set(rows.length ? done / rows.length : 0, `${done}/${rows.length}`);
  shell.querySelector('[data-headline]').textContent = done >= rows.length ? t('questsAllDone') : t('questsToGo', { n: rows.length - done });
  shell.querySelector('[data-sub]').textContent = t('questsIntroShort');
  shell.querySelector('[data-pot]').innerHTML = t('questsPot', { amount: money(pot) });

  const ready = rows.filter((r) => !r.claimed && r.progress >= r.target).length;
  const all = shell.querySelector('[data-all]');
  if (Number(all.dataset.n ?? 0) !== ready) {
    all.dataset.n = String(ready);
    all.replaceChildren(...(ready >= 2 ? [claimAllBar(ready, (btn) => claimAllQuests(btn))] : []));
  }
  all.hidden = ready < 2;

  const list = shell.querySelector('[data-list]');
  const seen = new Set();
  rows.forEach((row, i) => {
    seen.add(row.id);
    const tier = QUEST_TIERS[row.quest.tier];
    let card = list.querySelector(`[data-quest="${row.id}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'quest';
      card.dataset.quest = row.id;
      card.style.setProperty('--tier', tier.color);
      card.innerHTML = `
        <span class="quest-stripe" aria-hidden="true"></span>
        <div class="quest-main">
          <div class="quest-head"><b class="quest-name"></b><span class="quest-tier"></span></div>
          <p class="quest-how"></p>
          <div class="quest-bar"><i></i><span class="quest-bar-text tabular"></span></div>
          <div class="quest-foot"><span class="quest-reward"></span><span class="quest-state"></span></div>
        </div>`;
      card.querySelector('.quest-name').textContent = tx(row.quest.name);
      const how = card.querySelector('.quest-how');
      how.textContent = row.quest.how ? tx(row.quest.how) : '';
      how.hidden = !how.textContent;
      card.querySelector('.quest-tier').textContent = tx(tier.name);
      const rewardBits = [money(row.quest.reward.money)];
      if (row.quest.reward.booster) rewardBits.push(esc(specName(row.quest.reward.booster)));
      card.querySelector('.quest-reward').innerHTML = rewardBits.join(' + ');
      list.appendChild(card);
      if (fresh) { card.style.setProperty('--enter-from', '14px'); card.style.animationDelay = `${60 + i * 60}ms`; card.classList.add('is-entering'); }
    }
    const complete = row.progress >= row.target;
    card.classList.toggle('is-done', complete);
    card.classList.toggle('is-claimed', row.claimed);
    card.querySelector('.quest-bar i').style.width = `${Math.round(100 * Math.min(1, row.progress / row.target))}%`;
    card.querySelector('.quest-bar-text').textContent = `${Math.min(row.progress, row.target)} / ${row.target}`;
    const status = row.claimed ? 'claimed' : complete ? 'ready' : 'going';
    if (card.dataset.status === status) return;
    card.dataset.status = status;
    const slot = card.querySelector('.quest-state');
    if (status === 'claimed') {
      slot.innerHTML = `<span class="quest-stamp">${iconSvg('check', { size: 13 })}<span></span></span>`;
      slot.querySelector('.quest-stamp span').textContent = t('questClaimed');
    } else if (status === 'ready') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm quest-claim';
      btn.textContent = t('questClaim');
      press(btn, { sound: null });
      btn.addEventListener('click', () => claimQuest(row, tier, btn));
      slot.replaceChildren(btn);
    } else {
      slot.innerHTML = `<span class="quest-pct tabular"></span>`;
      slot.querySelector('.quest-pct').textContent = `${Math.round(100 * Math.min(1, row.progress / row.target))}%`;
    }
  });
  for (const stale of [...list.children]) if (!seen.has(stale.dataset.quest)) stale.remove();

  const reset = shell.querySelector('[data-reset]');
  const tick = () => { reset.textContent = t('questsReset', { time: formatCountdown(quests.msToReset(board)) }); };
  tick();
  clearInterval(state.questsTimer);
  state.questsTimer = setInterval(() => {
    if (state.tab !== 'quests') { clearInterval(state.questsTimer); return; }
    if (quests.msToReset(board) <= 0) { renderQuests(); return; }
    tick();
  }, 1000);
}

export let leaderboardSeg = null;

export function renderLeaderboard() {
  el.leaderboardTitle.textContent = t('tabLeaderboard');
  const view = state.leaderboardView ??= { window: 'daily', page: 0, rows: [], more: false };
  if (!leaderboardSeg) {
    leaderboardSeg = new Segmented(el.leaderboardSeg, leaderboard.WINDOWS.map((id) => ({ id, label: t(`lb_${id}`) })), (id) => {
      view.window = id; view.page = 0; view.rows = [];
      loadLeaderboard();
    });
  }
  leaderboardSeg.select?.(view.window, { silent: true });
  view.page = 0;
  view.rows = [];
  watchBoard();
  loadLeaderboard();
}

export function boardRow(r, { isMe, nameOf, subOf = null, cls = '' }) {
  const row = document.createElement('div');
  row.className = `lb-row${isMe(r) ? ' is-me' : ''}${r.rank <= 3 ? ` is-top${r.rank}` : ''} ${cls}`;
  row.innerHTML = `<span class="lb-rank tabular"></span><span class="person-mark lb-row-face" aria-hidden="true"></span><span class="lb-name"></span><span class="lb-score tabular"></span>`;
  row.querySelector('.lb-rank').textContent = `#${r.rank}`;
  const face = row.querySelector('.lb-row-face');
  if (r.userId) { face.dataset.face = r.userId; face.textContent = String(nameOf(r)).slice(0, 1).toUpperCase(); }
  else face.remove();
  const name = row.querySelector('.lb-name');
  name.textContent = nameOf(r);
  if (subOf) { const sub = document.createElement('small'); sub.className = 'lb-sub'; sub.textContent = subOf(r); name.appendChild(sub); }
  row.querySelector('.lb-score').textContent = formatAmount(r.score);
  return row;
}

export function boardNode(rows, { isMe, nameOf, faceOf, subOf = null, empty, guild = false }) {
  const step = (r, rank) => {
    const node = document.createElement('div');
    node.className = `lb-step is-r${rank}${r ? '' : ' is-empty'}${r && isMe(r) ? ' is-me' : ''}${guild ? ' is-guild' : ''}`;
    node.innerHTML = `
      <span class="lb-medal tabular"></span>
      <span class="person-mark lb-face" aria-hidden="true"></span>
      <span class="lb-step-name"></span>
      <span class="lb-step-score tabular"></span>`;
    node.querySelector('.lb-medal').textContent = String(rank);
    node.querySelector('.lb-face').textContent = r ? faceOf(r) : '·';
    if (r?.userId) node.querySelector('.lb-face').dataset.face = r.userId;
    node.querySelector('.lb-step-name').textContent = r ? nameOf(r) : t('lbOpenStep');
    node.querySelector('.lb-step-score').textContent = r ? formatAmount(r.score) : '';
    return node;
  };
  const list = document.createElement('div');
  list.className = 'lb';
  if (!rows.length) { list.appendChild(gameStage('podium', empty)); return list; }
  const podium = document.createElement('div');
  podium.className = 'lb-podium';
  podium.replaceChildren(step(rows[1], 2), step(rows[0], 1), step(rows[2], 3));
  list.appendChild(podium);
  const rest = rows.slice(3);
  if (rest.length) {
    const wrap = document.createElement('div');
    wrap.className = 'leaderboard';
    wrap.replaceChildren(...rest.map((r) => boardRow(r, { isMe, nameOf, subOf })));
    list.appendChild(wrap);
  }
  if (!guild) paintFaces(list, { fallback: (mark) => mark.textContent });
  return list;
}

let boardPoll = null;
let boardRepaint = null;
let boardPaintedAt = 0;
const BOARD_GAP = 20000;
const BOARD_POLL = 60000;
const boardMoved = () => {
  if (state.tab !== 'leaderboard' || boardRepaint) return;
  boardRepaint = setTimeout(() => {
    boardRepaint = null;
    if (state.tab !== 'leaderboard') return;
    boardPaintedAt = Date.now();
    state.leaderboardView.page = 0;
    loadLeaderboard({ quiet: true });
  }, Math.max(400, boardPaintedAt + BOARD_GAP - Date.now()));
};
const boardNow = () => { clearTimeout(boardRepaint); boardRepaint = null; boardPaintedAt = 0; boardMoved(); };
function watchBoard() {
  if (boardPoll || !signedIn()) return;
  boardPoll = setInterval(() => {
    if (state.tab !== 'leaderboard') { unwatchBoard(); return; }
    if (document.visibilityState === 'visible') boardNow();
  }, BOARD_POLL);
}
function unwatchBoard() {
  clearInterval(boardPoll);
  boardPoll = null;
  clearTimeout(boardRepaint);
  boardRepaint = null;
}
on('score', boardNow);
on('board-poll', boardNow);

export async function loadLeaderboard({ quiet = false } = {}) {
  const view = state.leaderboardView;
  const body = el.leaderboardBody;
  if (!signedIn()) {
    el.leaderboardMe.hidden = true;
    el.screens.leaderboard?.classList.remove('has-pin');
    body.replaceChildren(gameStage('podium', t('lbSignIn'), { label: t('gateSignIn'), run: () => showGate() }));
    return;
  }
  await leaderboard.flushScores().catch(() => {});
  if (view.page === 0 && !quiet) {
    el.leaderboardMe.hidden = true;
    el.screens.leaderboard?.classList.remove('has-pin');
    body.replaceChildren(gameStage('podium', t('lbLoading')));
  }
  let page, mine = null;
  try {
    [page, mine] = await Promise.all([leaderboard.fetchPage(view.window, view.page), leaderboard.fetchMyRank(view.window).catch(() => null)]);
    if (mine?.rank) { bumpMin(state.profile, 'bestRank', mine.rank); store.saveProfile(state.profile); }
  } catch (error) {
    body.replaceChildren(gameStage('podium', houseError(error), { label: t('retry'), run: () => loadLeaderboard() }));
    return;
  }
  if (state.tab !== 'leaderboard') return;
  view.rows = view.page === 0 ? page.rows : [...view.rows, ...page.rows];
  view.more = page.more;
  const me = userId();
  const list = boardNode(view.rows, {
    isMe: (r) => r.userId === me,
    nameOf: (r) => r.username,
    faceOf: (r) => String(r.username).slice(0, 1),
    empty: t('lbEmpty')
  });
  const rowNode = (r) => boardRow(r, { isMe: (x) => x.userId === me, nameOf: (x) => x.username });
  const reset = document.createElement('p');
  reset.className = 'lb-foot';
  const paintReset = () => {
    const ms = leaderboard.msToReset(view.window);
    reset.innerHTML = `${iconSvg('clock', { size: 14 })}<span></span>`;
    reset.querySelector('span').textContent = ms == null ? t('lbForever')
      : t(view.window === 'weekly' ? 'lbResetWeekly' : view.window === 'season' ? 'lbResetSeason' : 'lbResetDaily', { time: formatCountdown(ms) });
  };
  paintReset();
  clearInterval(state.lbTimer);
  state.lbTimer = setInterval(() => {
    if (state.tab !== 'leaderboard') { clearInterval(state.lbTimer); unwatchBoard(); return; }
    paintReset();
  }, 1000);
  list.appendChild(reset);
  if (view.more) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'btn btn-ghost btn-sm lb-more';
    more.textContent = t('lbMore');
    press(more, { sound: null });
    more.addEventListener('click', () => { synth.playTap(); view.page += 1; loadLeaderboard(); });
    list.appendChild(more);
  }
  body.replaceChildren(list);
  const onPage = view.rows.some((r) => r.userId === me);
  if (mine && !onPage) {
    el.leaderboardMe.replaceChildren(...rowNode({ rank: mine.rank, userId: me, username: t('lbYou'), score: mine.score }).childNodes);
    el.leaderboardMe.className = 'leaderboard-me lb-row is-me';
    el.leaderboardMe.hidden = false;
    el.screens.leaderboard?.classList.add('has-pin');
  }
}
