import { chromium, devices } from 'playwright';
import { launchOptions } from '../lib/browser.mjs';
import { installStubs } from '../lib/stubs.mjs';
import { installSupabase, newDatabase } from '../lib/supastub.mjs';

let fails = 0;
const check = (l, c, e = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${e ? '  ' + e : ''}`); };
const section = (s) => console.log(`\n== ${s}`);
const browser = await chromium.launch(launchOptions());
const shared = newDatabase();
const errors = [];
const logs = new Map();
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';

async function newPlayer(label, { pc = false, viewport = null, language = 'en' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', ...(pc ? { viewport: viewport ?? { width: 1600, height: 900 } } : devices['Pixel 7']), ...(viewport && !pc ? { viewport } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} PAGE: ${e.message}`));
  installStubs(page);
  const log = [];
  logs.set(page, log);
  await installSupabase(page, { db: shared, log });
  await page.addInitScript(({ pc, language }) => {
    if (sessionStorage.getItem('inbox.seeded')) return;
    sessionStorage.setItem('inbox.seeded', '1');
    localStorage.setItem('wikster.language', language);
    if (pc) localStorage.setItem('wikster.layout.v1', 'pc');
    localStorage.setItem('wikster.profile.v1', JSON.stringify({
      started: true, createdAt: Date.now(), playMs: 0, boostersOpened: 3,
      rarityCounts: {}, progress: { level: 5, xp: 0 }, pendingLevels: [],
      daily: { v: 2, day: 1, weeks: 0, lastDay: Math.floor(Date.now() / 86400000), shownDay: Math.floor(Date.now() / 86400000) },
      timed: { count: 0, stamp: Date.now() }, freeTaken: { window: 0, ids: [] }
    }));
    localStorage.setItem('wikster.wallet.v1', '50000');
  }, { pc, language });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await closeSheets(page);
  return page;
}
async function closeSheets(page) {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator('#sheet').isVisible().catch(() => false))) break;
    if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
    else await page.locator('#sheet .btn-primary').click().catch(() => 0);
    await page.waitForTimeout(400);
  }
}
async function gate(page, email, username, { signIn = false } = {}) {
  if (!(await page.locator('#gate-form').isVisible().catch(() => false))) {
    await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
    await page.waitForTimeout(400);
    await page.locator('.drawer-link[data-link="friends"]').first().click({ timeout: 5000 }).catch(() => 0);
    await page.waitForTimeout(900);
  }
  await page.locator(`#gate-seg .seg-option[data-value="${signIn ? 'signin' : 'signup'}"]`).click();
  await page.waitForTimeout(250);
  await page.locator('#gate-form input[name="email"]').fill(email);
  await page.locator('#gate-form input[name="password"]').fill('hunter2hunter2');
  if (await page.locator('#gate-form input[name="age"]').count()) await page.locator('#gate-form input[name="age"]').fill('30');
  await page.locator('#gate-form button[type="submit"]').click();
  await page.waitForTimeout(1000);
  if (!signIn && await page.locator('#gate-form input[name="username"]').count()) {
    await page.locator('#gate-form input[name="username"]').fill(username);
    await page.locator('#gate-form button[type="submit"]').click();
    await page.waitForTimeout(1100);
  }
  await page.waitForTimeout(signIn ? 1800 : 0);
  await closeSheets(page);
}
const viaDrawer = async (page, link) => {
  await page.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
  await page.waitForTimeout(400);
  await page.locator(`.drawer-link[data-link="${link}"]`).click();
  await page.waitForTimeout(900);
};
const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    if (ok || Date.now() > end) return ok;
    await new Promise((r) => setTimeout(r, 50));
  }
};
const timed = async (fn, ms = 4000) => {
  const at = Date.now();
  const ok = await until(fn, ms);
  return { ok, ms: Date.now() - at };
};
const idOf = (email) => shared.users.get(email)?.id;
let seq = 0;
const stamp = (offset = 0) => new Date(Date.now() + offset).toISOString();
const say = (from, to, body, offset = 0) => {
  const row = { id: `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`, sender: from, recipient: to, body, created_at: stamp(offset), read_at: null };
  shared.messages.push(row);
  shared.emitChange('messages', 'INSERT', row);
  return row;
};
const badge = (page, sel) => page.evaluate((sel) => {
  const n = document.querySelector(sel);
  if (!n || n.hidden || getComputedStyle(n).display === 'none') return null;
  return { n: Number(n.dataset.n ?? n.textContent), kind: n.dataset.kind ?? null, text: n.textContent };
}, sel);
const menuBadge = (page) => badge(page, '#menu-badge');
const bellBadge = (page) => badge(page, '#bell-count');

section('three players');
const a = await newPlayer('A');
await gate(a, 'ada@example.com', 'ada_lovelace');
const b = await newPlayer('B');
await gate(b, 'grace@example.com', 'grace_h');
const c = await newPlayer('C');
await gate(c, 'carol@example.com', 'carol_c');
const idA = idOf('ada@example.com');
const idB = idOf('grace@example.com');
const idC = idOf('carol@example.com');
shared.friendships.push(
  { id: 'f-ab', requester: idA, addressee: idB, status: 'accepted', created_at: stamp(-86400000) },
  { id: 'f-ac', requester: idC, addressee: idA, status: 'accepted', created_at: stamp(-86400000) }
);
say(idB, idA, 'an old hello from grace', -3600000).read_at = stamp(-3500000);
say(idA, idB, 'and my answer', -3000000);
say(idC, idA, 'carol was here', -600000);
await a.evaluate(() => window.__wikster.syncSocial());
await a.waitForTimeout(800);
check('A starts with one unread, counted from the server', (await menuBadge(a))?.n === 1, JSON.stringify(await menuBadge(a)));

section('the discussions tab');
const callsBefore = shared.conversationCalls ?? 0;
const msgReads = () => logs.get(a).filter((l) => /^GET \/rest\/v1\/messages/.test(l)).length;
const readsBefore = msgReads();
await viaDrawer(a, 'discussions');
check('the Discussions screen is up', await a.locator('#screen-discussions').isVisible());
check('it lists both conversations', await until(async () => (await a.locator('#discussions-list .talk-row').count()) === 2));
check('one query for the whole list, no reads per friend', (shared.conversationCalls ?? 0) - callsBefore === 1 && msgReads() === readsBefore,
  `rpc=${(shared.conversationCalls ?? 0) - callsBefore} reads=${msgReads() - readsBefore}`);
const order = () => a.locator('#discussions-list .talk-row .talk-name').allTextContents();
check('latest activity first', (await order()).join(',') === 'carol_c,grace_h', (await order()).join(','));
const carolRow = a.locator('#discussions-list .talk-row', { hasText: 'carol_c' });
check('the unread conversation shows its count', /^1$/.test((await carolRow.locator('.nb').textContent().catch(() => '')).trim()) && await carolRow.evaluate((n) => n.classList.contains('is-unread')));
check('its last line is there', /carol was here/.test(await carolRow.locator('.talk-last').textContent()));
const graceRow = a.locator('#discussions-list .talk-row', { hasText: 'grace_h' });
check('my own last line is marked as mine with a tick', /you:/i.test(await graceRow.locator('.talk-last').textContent()) && (await graceRow.locator('.talk-ticks').count()) === 1);
check('a time on each row', (await a.locator('#discussions-list .talk-when').allTextContents()).every((s) => s.trim().length > 0));
check('online dots from the presence lobby', await until(async () => (await a.locator('#discussions-list .talk-row .presence-dot').count()) === 2));
check('the phone shows Friends and Discussions as two tabs', (await a.locator('#screen-discussions .social-tab').count()) === 2
  && await a.locator('#screen-discussions .social-tab.is-on').textContent().then((s) => /discussions/i.test(s)));

const graceLive = say(idB, idA, 'grace again, live');
await a.screenshot({ path: 'inbox-discussions.png' });
check('a new message lifts its conversation to the top, live', await until(async () => (await order()).join(',') === 'grace_h,carol_c'), (await order()).join(','));
check('with its line and unread count', await until(async () => /grace again, live/.test(await graceRow.locator('.talk-last').textContent())
  && (await graceRow.locator('.nb').textContent().catch(() => '')).trim() === '1'));
check('still one list query after the live update', (shared.conversationCalls ?? 0) - callsBefore === 1);
await graceRow.click();
check('tapping a conversation opens that chat', await until(async () => await a.locator('#screen-chat').isVisible() && /grace_h/.test(await a.locator('#chat-name').textContent())));
check('reading it on the server', await until(async () => shared.messages.filter((m) => m.sender === idB && m.recipient === idA).every((m) => m.read_at)));
await a.locator('#chat-back').click();
await a.waitForTimeout(500);
check('back from the chat lands on Discussions', await a.locator('#screen-discussions').isVisible());
check('and that conversation is read now', await until(async () => !(await graceRow.evaluate((n) => n.classList.contains('is-unread')))));
void graceLive;

section('chat bubbles keep their footer clear of the words');
const LONG_WORD = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(5);
const LINES = 'Ceci est une longue phrase en français qui revient à la ligne plusieurs fois, avec des accents, des virgules et des mots composés comme arc-en-ciel. '.repeat(3);
const SHORT = ['hi', 'ok', '👍', '🎉🎉🎉', 'Vu ?', 'a'];
for (const body of [LONG_WORD, LINES, 'Emoji in the middle 🃏🎴 of a sentence with 🇫🇷 flags and ❤️‍🔥', ...SHORT]) say(idB, idA, body, 1000 + (++seq));
for (const body of ['mine short', 'ok', LONG_WORD.slice(0, 120), LINES.slice(0, 200)]) {
  const row = { id: `00000000-0000-4000-9100-${String(++seq).padStart(12, '0')}`, sender: idA, recipient: idB, body, created_at: stamp(2000 + seq), read_at: seq % 2 ? stamp(3000 + seq) : null };
  shared.messages.push(row);
}
const overlaps = (page) => page.evaluate(() => {
  const out = [];
  const bubbles = [...document.querySelectorAll('.screen.is-active .bubble')];
  for (const bubble of bubbles) {
    const text = bubble.querySelector('.bubble-text');
    const meta = bubble.querySelector('.bubble-meta');
    if (!text || !meta) { out.push('missing parts'); continue; }
    const range = document.createRange();
    range.selectNodeContents(text);
    const lines = [...range.getClientRects()];
    const m = meta.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    for (const r of lines) {
      if (r.width < 1) continue;
      const hit = r.left < m.right - 0.5 && r.right > m.left + 0.5 && r.top < m.bottom - 0.5 && r.bottom > m.top + 0.5;
      if (hit) out.push(`overlap: ${text.textContent.slice(0, 20)}`);
    }
    if (m.left < box.left - 0.5 || m.right > box.right + 0.5 || m.bottom > box.bottom + 0.5) out.push(`meta outside: ${text.textContent.slice(0, 20)}`);
    const t = text.getBoundingClientRect();
    if (t.right > box.right + 0.5 || t.left < box.left - 0.5) out.push(`text outside: ${text.textContent.slice(0, 20)}`);
  }
  return { n: bubbles.length, out };
});
await viaDrawer(a, 'discussions');
await a.locator('#discussions-list .talk-row', { hasText: 'grace_h' }).click();
await until(async () => (await a.locator('#chat-log .bubble').count()) >= 14);
const phone = await overlaps(a);
await a.screenshot({ path: 'inbox-chat.png' });
check('phone: no footer touches the text of any bubble', phone.n >= 14 && phone.out.length === 0, `${phone.n} bubbles ${phone.out.slice(0, 4).join(' | ')}`);
check('the read ticks sit inside their bubble', await a.evaluate(() => [...document.querySelectorAll('#chat-log .bubble.is-mine .bubble-ticks')].every((t) => {
  const b = t.closest('.bubble').getBoundingClientRect(); const r = t.getBoundingClientRect();
  return r.left >= b.left && r.right <= b.right && r.bottom <= b.bottom;
})));
const shortRow = await a.evaluate(() => {
  const bubble = [...document.querySelectorAll('#chat-log .bubble')].find((n) => n.querySelector('.bubble-text').textContent === 'hi');
  const t = bubble.querySelector('.bubble-text').getBoundingClientRect();
  const m = bubble.querySelector('.bubble-meta').getBoundingClientRect();
  return { sameLine: Math.abs(t.bottom - m.bottom) < 6, after: m.left >= t.right };
});
check('a short message keeps time on its own line end, beside the words', shortRow.sameLine && shortRow.after, JSON.stringify(shortRow));
await a.evaluate(() => { document.documentElement.style.fontSize = '24px'; document.body.style.fontSize = '1.3rem'; });
await a.waitForTimeout(300);
const big = await overlaps(a);
check('large text: still no overlap', big.out.length === 0, big.out.slice(0, 4).join(' | '));
await a.evaluate(() => { document.documentElement.style.fontSize = ''; document.body.style.fontSize = ''; });
await a.setViewportSize({ width: 320, height: 640 });
await a.waitForTimeout(300);
const narrow = await overlaps(a);
await a.screenshot({ path: 'inbox-chat-320.png' });
check('a 320px phone: still no overlap', narrow.out.length === 0, narrow.out.slice(0, 4).join(' | '));
await a.setViewportSize(devices['Pixel 7'].viewport);
await a.waitForTimeout(200);

section('badges, live');
await a.locator('#chat-back').click();
await a.waitForTimeout(400);
await a.locator('.nav-item[data-tab="packs"]').click();
await a.waitForTimeout(600);
const startMenu = (await menuBadge(a))?.n ?? 0;
const D = await newPlayer('D');
await gate(D, 'dora@example.com', 'dora_d');
const idD = idOf('dora@example.com');
const ask = { id: 'f-da', requester: idD, addressee: idA, status: 'pending', created_at: stamp() };
shared.friendships.push(ask);
shared.emitChange('friendships', 'INSERT', ask);
const req = await timed(async () => ((await menuBadge(a))?.n ?? 0) === startMenu + 1);
check('a friend request lights the menu badge within a second', req.ok && req.ms <= 1000, `${req.ms}ms`);
check('the Friends link carries a social badge', await until(async () => (await badge(a, '.drawer-link[data-link="friends"] .nb'))?.kind === 'social'));
const beforeMsg = (await menuBadge(a))?.n ?? 0;
say(idB, idA, 'are you there?');
const msg = await timed(async () => ((await menuBadge(a))?.n ?? 0) === beforeMsg + 1);
check('a message adds to it within a second', msg.ok && msg.ms <= 1000, `${msg.ms}ms`);
const unreadNow = await a.evaluate(() => [...window.__wikster.state.social.unread.values()].reduce((n, x) => n + x, 0));
check('the Discussions link shows a message badge with every unread line', await until(async () => {
  const x = await badge(a, '.drawer-link[data-link="discussions"] .nb');
  return x?.kind === 'message' && x.n === unreadNow && unreadNow >= 1;
}), String(unreadNow));
const trade = { id: 'tr-1', proposer: idB, recipient: idA, offer: [{ key: 'en:Owl', title: 'Owl', rarityId: 'rare' }], ask: [], status: 'pending', created_at: stamp(), resolved_at: null };
shared.trades.push(trade);
shared.emitChange('trades', 'INSERT', trade);
const tr = await timed(async () => (await menuBadge(a))?.kind === 'gift');
check('a trade offer turns the badge to the trade colour within a second', tr.ok && tr.ms <= 1000, `${tr.ms}ms`);
const challenge = { id: 'ch-1', kind: 'clash', challenger: idC, opponent: idA, status: 'open', payload: {}, reply: null, result: null, claimed: [], created_at: stamp(), updated_at: stamp() };
shared.challenges.push(challenge);
shared.emitChange('challenges', 'INSERT', challenge);
check('a challenge lights the Games link within a second', (await timed(async () => (await badge(a, '.drawer-link[data-link="games"] .nb'))?.kind === 'versus', 1000)).ok);
await a.evaluate(() => document.querySelector('.appbar .icon-btn')?.click());
await a.waitForTimeout(500);
await a.screenshot({ path: 'inbox-drawer.png' });
await a.keyboard.press('Escape');
await a.waitForTimeout(400);
check('the bell counts them too', await until(async () => ((await bellBadge(a))?.n ?? 0) >= 3), JSON.stringify(await bellBadge(a)));
check('each badge kind has its own colour', await a.evaluate(() => {
  const colour = (sel) => { const n = document.querySelector(sel); return n ? getComputedStyle(n).backgroundColor : null; };
  const all = ['.drawer-link[data-link="friends"] .nb', '.drawer-link[data-link="discussions"] .nb', '.drawer-link[data-link="games"] .nb'].map(colour);
  return all.every(Boolean) && new Set(all).size === 3;
}));
check('a fresh badge plays a short entrance, nothing that loops', await a.evaluate(() => {
  const n = document.querySelector('#menu-badge');
  const anims = n.getAnimations();
  return anims.every((x) => x.effect.getTiming().iterations === 1);
}));

section('a badge or a note leads to the exact place');
await a.locator('#bell').click();
await a.waitForTimeout(500);
check('the trade note opens that trade', await (async () => {
  await a.locator('#sheet .note-row[data-kind="trade"] .note-open').click();
  return until(async () => (await a.locator('#sheet').isVisible()) && /owl/i.test(await a.locator('#sheet-body').textContent()) && (await a.locator('#sheet [data-accept]').count()) === 1);
})());
await closeSheets(a);
await a.locator('#bell').click();
await a.waitForTimeout(500);
await a.locator('#sheet .note-row[data-kind="message"] .note-open').first().click();
check('the message note opens that chat', await until(async () => await a.locator('#screen-chat').isVisible() && /grace_h/.test(await a.locator('#chat-name').textContent())));
await a.locator('#chat-back').click();
await a.waitForTimeout(400);
await a.locator('#bell').click();
await a.waitForTimeout(500);
await a.locator('#sheet .note-row[data-kind="request"] .note-open').click();
check('the request note opens Friends on that request', await until(async () => await a.locator('#screen-friends').isVisible()
  && (await a.locator('#incoming-list [data-request="f-da"]').count()) === 1));
check('and points at it', await until(async () => a.locator('#incoming-list [data-request="f-da"]').evaluate((n) => n.classList.contains('is-spotlit')), 1500));
await a.evaluate((id) => window.wiksterOpenTag(`chat:${id}`), idC);
check('a tapped system notification opens its chat', await until(async () => await a.locator('#screen-chat').isVisible() && /carol_c/.test(await a.locator('#chat-name').textContent())));
await a.evaluate(() => window.wiksterOpenTag('versus:ch-1'));
check('and a challenge opens on its row', await until(async () => await a.locator('#screen-versus').isVisible()
  && (await a.locator('#versus-body .versus-row[data-challenge="ch-1"]').count()) === 1));

section('the same badges after a reload and on a second device');
await a.locator('.nav-item[data-tab="packs"]').click();
await a.waitForTimeout(500);
const counts = async (page) => page.evaluate(() => {
  const n = (sel) => { const x = document.querySelector(sel); return x && !x.hidden ? Number(x.dataset.n) : 0; };
  return { menu: n('#menu-badge'), friends: n('.drawer-link[data-link="friends"] .chip'), talks: n('.drawer-link[data-link="discussions"] .chip'), games: n('.drawer-link[data-link="games"] .chip') };
});
const live = await counts(a);
await a.reload({ waitUntil: 'domcontentloaded' });
await a.waitForTimeout(2600);
await closeSheets(a);
check('a reload shows the same counts, from the server', await until(async () => JSON.stringify(await counts(a)) === JSON.stringify(live)), `${JSON.stringify(live)} vs ${JSON.stringify(await counts(a))}`);
const a2 = await newPlayer('A2');
await gate(a2, 'ada@example.com', 'ada_lovelace', { signIn: true });
check('a second device shows them too', await until(async () => JSON.stringify(await counts(a2)) === JSON.stringify(live), 8000), `${JSON.stringify(live)} vs ${JSON.stringify(await counts(a2))}`);
say(idB, idA, 'a line for two devices');
check('both devices count it', await until(async () => (await counts(a)).talks === 1 && (await counts(a2)).talks === 1, 3000), `${JSON.stringify(await counts(a))} ${JSON.stringify(await counts(a2))}`);
await a2.evaluate((id) => window.wiksterOpenTag(`chat:${id}`), idB);
await until(async () => shared.messages.filter((m) => m.sender === idB && m.recipient === idA).every((m) => m.read_at));
const seen = await timed(async () => (await counts(a)).talks === 0, 2000);
check('reading on the second device clears the first within a second', seen.ok && seen.ms <= 1000, `${seen.ms}ms ${JSON.stringify(await counts(a))}`);
await a2.context().close();

section('the notifications sheet');
const idE = '00000000-0000-4000-8000-00000000eeee';
shared.profiles.set(idE, { ...shared.profiles.get(idD), id: idE, username: 'eve_e' });
const askE = { id: 'f-ea', requester: idE, addressee: idA, status: 'pending', created_at: stamp() };
shared.friendships.push(askE);
shared.emitChange('friendships', 'INSERT', askE);
const trade2 = { ...trade, id: 'tr-2', created_at: stamp(-60000) };
shared.trades.push(trade2);
shared.emitChange('trades', 'INSERT', trade2);
await a.evaluate(() => {
  const s = window.__wikster.state;
  s.profile.notifFeed = [
    { id: 'note-news', icon: 'spark', title: 'A new season starts', when: new Date(Date.now() - 1000).toISOString(), screen: 'season' },
    { id: 'note-gift', icon: 'gift', title: 'grace_h sent you a booster', when: new Date(Date.now() - 5000).toISOString(), screen: 'packs' },
    ...(s.profile.notifFeed ?? [])
  ];
  window.__wikster.store.saveProfile(s.profile);
});
say(idB, idA, 'one more');
await a.waitForTimeout(600);
await a.locator('#bell').click();
await a.waitForTimeout(600);
await a.screenshot({ path: 'inbox-notes.png' });
const kinds = await a.locator('#sheet .notes:not(.is-read) .note-row').evaluateAll((rows) => rows.map((r) => r.dataset.kind));
const groupOf = (k) => (['trade', 'gift', 'challenge'].includes(k) ? 0 : k === 'message' ? 1 : k === 'request' ? 2 : k === 'guild' ? 3 : 4);
check('unread notes run by priority: waiting on you, messages, requests, then news', kinds.length >= 4 && kinds.every((k, i) => i === 0 || groupOf(kinds[i - 1]) <= groupOf(k))
  && kinds[0] === 'trade' && kinds.includes('message') && kinds.includes('request') && groupOf(kinds.at(-1)) === 4, kinds.join(','));
check('grouped under headings', (await a.locator('#sheet .notes:not(.is-read) .notes-shelf').allTextContents()).join('|') === 'Waiting on you|Messages|Friend requests|News and rewards',
  (await a.locator('#sheet .notes:not(.is-read) .notes-shelf').allTextContents()).join('|'));
await a.locator('#sheet .note-row[data-note="note-news"] .note-tick').click();
await a.waitForTimeout(300);
check('one note marked read moves below, greyed', await a.locator('#sheet .notes.is-read .note-row[data-note="note-news"]').count() === 1
  && Number(await a.locator('#sheet .note-row.is-read').first().evaluate((n) => getComputedStyle(n).opacity)) < 1);
await a.locator('#sheet .notes-readall').click();
await a.waitForTimeout(300);
check('Read all leaves nothing unread', (await a.locator('#sheet .note-row.is-unread').count()) === 0 && (await bellBadge(a)) === null);
await a.screenshot({ path: 'inbox-notes-read.png' });
check('and the read ones stay, greyed, with Clear read', (await a.locator('#sheet .note-row.is-read').count()) >= 5 && (await a.locator('#sheet .notes-clear').count()) === 1);
const pending = await a.evaluate(() => window.__wikster.state.social.incoming.length);
await a.locator('#sheet .notes-clearall').click();
await a.waitForTimeout(300);
check('Clear all empties the sheet', (await a.locator('#sheet .note-row').count()) === 0 && (await a.locator('#sheet .notes-empty').count()) === 1);
check('without declining anything', (await a.evaluate(() => window.__wikster.state.social.incoming.length)) === pending && shared.friendships.some((f) => f.id === 'f-da'));
await closeSheets(a);
await a.evaluate(() => window.__wikster.flushSync());
await a.reload({ waitUntil: 'domcontentloaded' });
await a.waitForTimeout(2600);
await closeSheets(a);
const noteKinds = async () => {
  await a.locator('#bell').click();
  await a.waitForTimeout(500);
  const out = await a.locator('#sheet .note-row').evaluateAll((rows) => rows.map((r) => r.dataset.kind));
  await closeSheets(a);
  return out;
};
const afterReload = await noteKinds();
check('cleared stays cleared after a reload: no trade, request or message comes back', await a.evaluate(() => window.__wikster.state.social.loaded)
  && !afterReload.some((k) => ['trade', 'request', 'message'].includes(k)), afterReload.join(','));
const cleared = await a.evaluate(() => JSON.parse(localStorage.getItem('wikster.profile.v1')).notifCleared ?? []);
check('kept in the synced profile', cleared.includes('trade-tr-1') && cleared.includes('f-da'), cleared.join(','));
check('which reaches the server', JSON.stringify([shared.saves.get(idA) ?? null, shared.saveKeys.filter((k) => k.user_id === idA)]).includes('trade-tr-1'));
const bellBefore = (await bellBadge(a))?.n ?? 0;
say(idC, idA, 'something new');
check('a new message rings the bell again', await until(async () => ((await bellBadge(a))?.n ?? 0) === bellBefore + 1, 2000) && (await noteKinds()).includes('message'));

section('a friend\'s profile stats, fresh');
shared.profiles.get(idB).boosters_opened = 7;
shared.profiles.get(idB).cards = 40;
await viaDrawer(a, 'friends');
await a.locator('#friends-list .person', { hasText: 'grace_h' }).first().click();
await a.waitForTimeout(800);
const statOf = (label) => a.evaluate((label) => [...document.querySelectorAll('#friend-stats .stat-cell')]
  .find((c) => c.querySelector('span').textContent.toLowerCase().includes(label))?.querySelector('b').textContent ?? '', label);
const statText = () => statOf('booster');
check('the friend screen shows the stats it loaded with the list', (await statText()) === '7' && (await statOf('card')) === '40', `${await statText()} ${await statOf('card')}`);
const profileReads = () => logs.get(a).filter((l) => /^GET \/rest\/v1\/profiles\?.*id=eq\./.test(l)).length;
const before = profileReads();
shared.profiles.get(idB).boosters_opened = 12;
const done = { ...challenge, id: 'ch-2', challenger: idB, opponent: idA, status: 'done', result: { winner: 'challenger' } };
shared.challenges.push(done);
shared.emitChange('challenges', 'INSERT', done);
check('a game settled with them refreshes their stats on screen', await until(async () => (await statText()) === '12', 3000), await statText());
check('with one small query', profileReads() - before === 1, String(profileReads() - before));
await a.locator('#friend-back').click();
shared.profiles.get(idB).boosters_opened = 19;
await a.waitForTimeout(31000);
await a.locator('#friends-list .person', { hasText: 'grace_h' }).first().click();
check('opening it after half a minute fetches them again', await until(async () => (await statText()) === '19', 3000), await statText());
check('and the stamp is gone once fresh', await until(async () => a.locator('#friend-stats-stamp').isHidden(), 2000));
await a.route('**/rest/v1/profiles?*', (route) => route.fulfill(route.request().method() === 'OPTIONS'
  ? { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: '' }
  : { status: 400, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ message: 'down', code: '400' }) }));
await a.locator('#friend-back').click();
await a.waitForTimeout(31000);
await a.locator('#friends-list .person', { hasText: 'grace_h' }).first().click();
await a.locator('#friend-stats-stamp').scrollIntoViewIfNeeded().catch(() => {});
await a.screenshot({ path: 'inbox-stats-stamp.png' });
check('when the server cannot be reached the stats say when they are from', await until(async () => /updated/i.test(await a.locator('#friend-stats-stamp').textContent()) && await a.locator('#friend-stats-stamp').isVisible(), 4000),
  await a.locator('#friend-stats-stamp').textContent());
await a.unroute('**/rest/v1/profiles?*');

section('PC: discussions in Social, bubbles and badges');
const p = await newPlayer('PC', { pc: true });
await gate(p, 'ada@example.com', 'ada_lovelace', { signIn: true });
await p.evaluate(() => window.wiksterPc?.go('social'));
await p.waitForTimeout(900);
check('Social has a Discussions tab', (await p.locator('.pc-subtab[data-screen="discussions"]').count()) === 1);
await p.locator('.pc-subtab[data-screen="discussions"]').click();
check('it lists the conversations', await until(async () => (await p.locator('#discussions-list .talk-row').count()) === 2));
await p.screenshot({ path: 'inbox-pc-discussions.png' });
check('the phone tabs stay hidden on a desk', await p.locator('#screen-discussions .social-tabs').isHidden());
const socialBefore = (await badge(p, '.pc-tab[data-dest="social"] .pc-tab-count'))?.n ?? 0;
say(idB, idA, 'hello desk');
check('a message adds to the Social tab badge at once', await until(async () => ((await badge(p, '.pc-tab[data-dest="social"] .pc-tab-count'))?.n ?? 0) === socialBefore + 1, 1500));
check('and the Discussions sub tab shows a message badge', await until(async () => (await badge(p, '.pc-subtab[data-screen="discussions"] .nb'))?.kind === 'message', 1500));
await p.locator('#discussions-list .talk-row', { hasText: 'grace_h' }).click();
await until(async () => (await p.locator('#chat-log .bubble').count()) >= 14);
const desk = await overlaps(p);
await p.screenshot({ path: 'inbox-pc-chat.png' });
check('desk: no footer touches the text of any bubble', desk.n >= 14 && desk.out.length === 0, desk.out.slice(0, 4).join(' | '));
check('the Discussions sub tab stays lit inside the chat', await p.locator('.pc-subtab[data-screen="discussions"]').evaluate((n) => n.classList.contains('is-on')));

console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno page errors');
if (errors.length) fails++;
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
