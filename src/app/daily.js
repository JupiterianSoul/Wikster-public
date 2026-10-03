import { t, tx } from '../i18n.js';
import { rarityById, rarityText } from '../data/rarities.js';
import { WEEK, canClaim, claim as claimDaily, loyaltyPct, msUntilNextUtcDay, nextIndex as nextGiftIndex, streakAlive, utcDayNumber, weekLadder } from '../daily.js';
import { buckSvg, iconSvg } from '../data/icons.js';
import * as store from '../collection.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { CRATE_CARD_WEIGHTS, CRATE_TIER_WEIGHTS, formatCountdown } from '../shop.js';
import { oddsRows } from '../data/odds.js';
import { THEME_PACKS } from '../data/packs.js';
import { TODAY_POOL, todayBands } from '../economy.js';
import { reportQuest, seasonReached } from './arcade.js';
import { esc, ink, money, openSheet, refreshWallet, state, toast } from './core.js';
import { INK_DAILY_WEEK, addInk } from '../ink.js';
import { pushNote } from './drawer.js';
import { live } from './live.js';
import { ensureReady, fireFlash, gainBooster, spawnBurst } from './open.js';
import { predictedDry } from './ready.js';
import { pityLeft } from '../econ/rules.js';
import { econ, econMessage, serverEconomy } from './econ.js';
import { renderPacks } from './packs.js';
import { updateBadges } from './regalia.js';

export function giftLabel(gift) {
  const bits = [];
  if (gift.coins) bits.push(money(gift.coins));
  if (gift.spec) {
    bits.push(esc(gift.spec.rarityId
      ? t('giftBoosterTier', { tier: tx(rarityById(gift.spec.rarityId).name) })
      : t('giftBoosterN', { n: gift.spec.cards })));
  }
  return bits.join(' + ');
}

export function giftTile(rung, status) {
  const tile = document.createElement('div');
  const kind = rung.spec && rung.coins ? 'both' : rung.spec ? 'booster' : 'coins';
  tile.className = `daily-tile is-${status} is-${kind}${rung.day === WEEK ? ' is-big' : ''}`;
  tile.innerHTML = `
    <span class="daily-tile-day"></span>
    <span class="daily-tile-art"></span>
    <span class="daily-tile-val tabular"></span>`;
  tile.querySelector('.daily-tile-day').textContent = t('dailyDayShort', { n: rung.day });
  const art = tile.querySelector('.daily-tile-art');
  if (status === 'claimed') art.innerHTML = iconSvg('check', { size: 15 });
  else if (kind === 'coins') art.innerHTML = buckSvg({ size: 14 });
  else art.innerHTML = iconSvg('packs', { size: 15 });
  const val = tile.querySelector('.daily-tile-val');
  if (kind === 'coins') val.textContent = rung.coins.toLocaleString();
  else if (kind === 'booster') val.textContent = rung.spec.rarityId ? tx(rarityById(rung.spec.rarityId).name) : t('dailyCardsN', { n: rung.spec.cards });
  else val.textContent = `${rung.coins.toLocaleString()} +`;
  tile.title = giftLabel(rung).replace(/<[^>]+>/g, '');
  return tile;
}

export function openDaily({ auto = false } = {}) {
  if (auto) {
    const today = utcDayNumber();
    if (state.profile.daily.shownDay === today) return;
    state.profile.daily.shownDay = today;
    store.saveProfile(state.profile);
  }
  openSheet(t('dailyTitle'), buildDailyBody, { onClose: () => { clearInterval(state.dailyTimer); state.dailyTimer = null; } });
}

export function buildDailyBody(body) {
  const daily = state.profile.daily;
  const ladder = weekLadder(daily.weeks);
  const ready = canClaim(daily);
  const next = nextGiftIndex(daily);
  const taken = ready ? next : (daily.day === 0 ? WEEK : daily.day);
  const broken = ready && daily.lastDay != null && !streakAlive(daily);
  const today = ladder[next];

  body.innerHTML = `
    <div class="daily">
      <div class="daily-hero${ready ? ' is-ready' : ''}">
        <button class="present" type="button" data-claim aria-label="">
          <span class="present-glow" aria-hidden="true"></span>
          <span class="present-lid" aria-hidden="true"></span>
          <span class="present-box" aria-hidden="true">
            <span class="present-ribbon-v"></span>
          </span>
        </button>
        <div class="daily-copy">
          <b data-headline></b>
          <span data-status></span>
          <span class="daily-note" data-note hidden></span>
        </div>
      </div>
      <div class="daily-week" data-week></div>
      <div class="daily-foot">
        <span data-week-n></span>
        <span class="tabular" data-reset></span>
      </div>
    </div>`;

  const headline = body.querySelector('[data-headline]');
  const status = body.querySelector('[data-status]');
  const note = body.querySelector('[data-note]');
  const present = body.querySelector('.present');
  if (ready) {
    headline.textContent = t('dailyTapToOpen');
    status.innerHTML = `${t('dailyDayOf', { n: today.day, of: WEEK })} · ${giftLabel(today.gift ?? today)}`;
    if (broken) { note.hidden = false; note.textContent = t('dailyStreakBroken'); }
    present.setAttribute('aria-label', t('dailyClaim'));
    press(present, { sound: null });
    present.addEventListener('click', () => {
      if (present.classList.contains('is-opening')) return;
      synth.resume();
      present.classList.add('is-opening');
      const rect = present.getBoundingClientRect();
      spawnBurst({ shapes: ['star4', 'orb'], colors: ['#fbbf24', '#f8fafc', '#f472b6'],
        count: 22, spread: 1.15, gravity: 0.3 },
        { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.35 }, { scale: 0.9 });
      fireFlash(0.25, '#fbbf24');
      setTimeout(() => claimGift(body), 420);
    }, { once: true });
  } else {
    headline.textContent = taken === WEEK ? t('dailyWeekDone') : t('dailyClaimed');
    status.textContent = t('dailyDayOf', { n: taken, of: WEEK });
  }

  body.querySelector('[data-week]').replaceChildren(...ladder.map((rung, i) => giftTile(
    rung,
    i < taken ? 'claimed' : i === next && ready ? 'ready' : i === (ready ? next : taken % WEEK) ? 'next' : 'locked'
  )));

  const weekLine = body.querySelector('[data-week-n]');
  const pct = loyaltyPct(daily.weeks);
  weekLine.textContent = t('dailyWeekN', { n: (daily.weeks ?? 0) + 1 }) + (pct ? ` · ${t('dailyLoyalty', { pct })}` : '');
  const reset = body.querySelector('[data-reset]');
  const tick = () => { reset.textContent = t('dailyResetsUtc', { time: formatCountdown(msUntilNextUtcDay()) }); };
  tick();
  clearInterval(state.dailyTimer);
  state.dailyTimer = setInterval(() => {
    if (!live.sheet.open) { clearInterval(state.dailyTimer); return; }
    if (msUntilNextUtcDay() < 1000 && !canClaim(daily)) { buildDailyBody(body); return; }
    tick();
  }, 1000);
}

export function grantGift(gift) {
  if (gift.coins) {
    store.saveWallet(store.loadWallet() + gift.coins);
    refreshWallet();
  }
  if (gift.spec) {
    gainBooster({ ...gift.spec }, 1);
    renderPacks();
  }
  synth.playGift();
}

export async function claimGift(body) {
  let got;
  if (serverEconomy()) {
    try {
      const res = await econ('daily');
      got = res.got;
      if (got?.gift?.spec) ensureReady(got.gift.spec);
      renderPacks();
      synth.playGift();
      seasonReached(res.season);
    } catch (error) {
      toast(esc(econMessage(error, t)), 'error');
      buildDailyBody(body);
      return;
    }
  } else {
    got = claimDaily(state.profile.daily);
    if (!got) return;
    store.saveProfile(state.profile);
    grantGift(got.gift);
  }
  reportQuest('daily');
  toast(t('dailyGot', { reward: giftLabel(got.gift) }), 'ok');
  if (got.weekDone) {
    if (!serverEconomy()) addInk(INK_DAILY_WEEK);
    refreshWallet();
    pushNote('gift', t('dailyWeekDoneNote'), 'packs');
  }
  buildDailyBody(body);
  updateBadges();
}

export function openWallet() {
  openSheet(t('walletTitle'), (body) => {
    body.innerHTML = `
      <p style="font-size:2rem;font-weight:800;color:var(--positive);display:flex;align-items:baseline;gap:3px;margin-bottom:8px" data-balance></p>
      <p style="margin-bottom:16px" data-what></p>
      <div class="row"><div class="row-copy"><h4 data-earn-t></h4><p data-earn></p></div></div>
      <div class="row"><div class="row-copy"><h4 data-spend-t></h4><p data-spend></p></div></div>
      <div class="row"><div class="row-copy"><h4 data-ink-t></h4><p data-ink></p></div><button class="btn btn-sm btn-ghost row-action" type="button" data-ink-go></button></div>
      <p class="muted" style="font-size:.78rem;line-height:1.55;margin-top:16px" data-note></p>`;
    body.querySelector('[data-balance]').innerHTML = money(state.wallet);
    body.querySelector('[data-what]').textContent = t('walletWhat');
    body.querySelector('[data-earn-t]').textContent = t('walletEarnTitle');
    body.querySelector('[data-earn]').textContent = t('walletEarn');
    body.querySelector('[data-spend-t]').textContent = t('walletSpendTitle');
    body.querySelector('[data-spend]').textContent = t('walletSpend');
    body.querySelector('[data-note]').textContent = t('walletNote');
    body.querySelector('[data-ink-t]').innerHTML = `${t('inkTitle')} · ${ink(state.ink)}`;
    body.querySelector('[data-ink]').textContent = t('walletInkLine');
    const go = body.querySelector('[data-ink-go]');
    go.textContent = t('walletInkMore');
    press(go, { sound: null });
    go.addEventListener('click', () => { synth.playTap(); import('./atelier.js').then((m) => m.openInkSheet()); });
  });
}

function oddsRow(rarity, text) {
  const row = document.createElement('tr');
  row.innerHTML = `<td><span class="odds-name"><span class="odds-swatch"></span><span></span></span></td><td class="odds-pct tabular"></td>`;
  const swatch = row.querySelector('.odds-swatch');
  swatch.style.color = rarity.color;
  swatch.style.background = rarity.color;
  const label = row.querySelector('.odds-name span:last-child');
  label.textContent = tx(rarity.name);
  label.style.color = rarityText(rarity);
  row.querySelector('.odds-pct').textContent = text;
  return row;
}

const pctText = (pct) => (pct >= 0.1 ? `${Math.round(pct * 100) / 100}%` : '< 0.1%');

function oddsTable(head, rows) {
  const table = document.createElement('table');
  table.className = 'odds-table';
  table.innerHTML = '<thead><tr><th></th><th></th></tr></thead><tbody></tbody>';
  const [h1, h2] = table.querySelectorAll('th');
  h1.textContent = head[0];
  h2.textContent = head[1];
  table.querySelector('tbody').replaceChildren(...rows);
  return table;
}

export function openOddsFor(specs) {
  const tiers = [...new Set(specs.map((spec) => spec.rarityId ?? null))];
  if (specs.every((spec) => spec.kind === 'today')) { openOdds(null, { today: true }); return; }
  if (tiers.length === 1) { openOdds(tiers[0]); return; }
  openSheet(t('pullRates'), (body) => {
    const note = document.createElement('p');
    note.style.marginBottom = '12px';
    note.textContent = t('oddsBundleNote');
    body.appendChild(note);
    for (const tier of tiers) {
      const title = document.createElement('h4');
      title.className = 'odds-sub';
      title.textContent = tier ? t('oddsRowTier', { rarity: tx(rarityById(tier).name) }) : t('oddsRowBasic');
      body.append(title, oddsTable([t('rarity'), t('oddsChance')], oddsRows(tier).map(({ rarity, pct }) => oddsRow(rarity, pctText(pct)))));
    }
  });
}

export function openCrateOdds(customCount = 0) {
  openSheet(t('shopCrateOdds'), (body) => {
    const total = CRATE_TIER_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
    const cardsTotal = CRATE_CARD_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
    const subjects = THEME_PACKS.length + Math.min(8, customCount);
    const lead = document.createElement('p');
    lead.style.marginBottom = '12px';
    lead.textContent = t('shopCrateOddsLead', { n: subjects });
    const tierRows = CRATE_TIER_WEIGHTS.map(([id, w]) => {
      const rarity = id ? rarityById(id) : { name: t('shopCrateNoTier'), color: 'var(--ink-faint)' };
      return oddsRow(rarity, pctText((w / total) * 100));
    });
    const cardRows = CRATE_CARD_WEIGHTS.map(([n, w]) => {
      const row = document.createElement('tr');
      row.innerHTML = '<td></td><td class="odds-pct tabular"></td>';
      row.querySelector('td').textContent = t('shopItemMeta', { n });
      row.querySelector('.odds-pct').textContent = pctText((w / cardsTotal) * 100);
      return row;
    });
    const then = document.createElement('p');
    then.style.margin = '14px 0 0';
    then.className = 'muted';
    then.textContent = t('shopCrateOddsThen');
    const see = document.createElement('button');
    see.type = 'button';
    see.className = 'btn btn-ghost btn-sm';
    see.style.marginTop = '10px';
    see.textContent = t('oddsSeeCards');
    press(see, { sound: null });
    see.addEventListener('click', () => { synth.playTap(); openOddsFor(CRATE_TIER_WEIGHTS.map(([id]) => ({ kind: 'theme', rarityId: id }))); });
    body.append(lead, oddsTable([t('shopCrateTier'), t('oddsChance')], tierRows),
      oddsTable([t('shopCrateSize'), t('oddsChance')], cardRows), then, see);
  });
}

export function openOdds(rarityId = null, { today = false } = {}) {
  openSheet(t('pullRates'), (body) => {
    body.innerHTML = `
      <p style="margin-bottom:12px" data-note></p>
      <p style="margin-bottom:16px" data-row></p>
      <table class="odds-table">
        <thead><tr><th></th><th></th></tr></thead>
        <tbody></tbody>
      </table>`;
    body.querySelector('[data-note]').textContent = today ? t('oddsNoteToday') : t('oddsNote');
    const rowNote = body.querySelector('[data-row]');
    rowNote.textContent = today ? t('oddsRowToday', { pool: TODAY_POOL })
      : rarityId ? t('oddsRowTier', { rarity: tx(rarityById(rarityId).name) })
        : t('oddsRowBasic');
    const [h1, h2] = body.querySelectorAll('th');
    h1.textContent = t('rarity');
    h2.textContent = today ? t('oddsPlace') : t('oddsChance');
    if (today) {
      body.querySelector('tbody').replaceChildren(...todayBands().map(({ from, to, rarity }) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td><span class="odds-name"><span class="odds-swatch"></span><span></span></span></td><td class="odds-pct tabular"></td>`;
        const swatch = row.querySelector('.odds-swatch');
        swatch.style.color = rarity.color;
        swatch.style.background = rarity.color;
        const label = row.querySelector('.odds-name span:last-child');
        label.textContent = tx(rarity.name);
        label.style.color = rarityText(rarity);
        row.querySelector('.odds-pct').textContent = to == null ? t('oddsRankRest', { from })
          : from === to ? t('oddsRankOne', { n: from })
            : t('oddsRankRange', { from, to });
        return row;
      }));
      return;
    }
    body.querySelector('tbody').replaceChildren(...oddsRows(rarityId).map(({ rarity, pct }) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td><span class="odds-name"><span class="odds-swatch"></span><span></span></span></td><td class="odds-pct tabular"></td>`;
      const swatch = row.querySelector('.odds-swatch');
      swatch.style.color = rarity.color;
      swatch.style.background = rarity.color;
      const label = row.querySelector('.odds-name span:last-child');
      label.textContent = tx(rarity.name);
      label.style.color = rarityText(rarity);
      const cells = row.querySelectorAll('.odds-pct');
      cells[0].textContent = pctText(pct);
      return row;
    }));
    const rules = document.createElement('p');
    rules.className = 'muted odds-rules';
    rules.style.margin = '14px 0 0';
    const dry = serverEconomy() ? predictedDry() : Number(state.profile?.pity) || 0;
    rules.textContent = `${t('oddsHitSlot')} ${t('oddsPity', { n: pityLeft(dry) })}`;
    body.appendChild(rules);
  });
}
