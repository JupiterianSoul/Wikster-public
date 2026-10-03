import { readFileSync } from 'node:fs';
import { check, done, fakeStorage } from './lib.mjs';
import { createEconDb } from '../lib/econdb.mjs';

fakeStorage();
const ct = await import('../../src/ui/customtheme.js');
const look = await import('../../src/appearance.js');
const { THEMES } = await import('../../src/ui/themes.js');
const { RARITIES } = await import('../../src/data/rarities.js');
const { CUSTOM_THEME_PRICE, THEME_PRICE } = await import('../../src/ink.js');
const { run, EconError } = await import('../../src/econ/engine.js');

const css = readFileSync('src/styles/themes.css', 'utf8');
const TOKENS = {};
for (const m of css.matchAll(/\[data-theme='([\w-]+)'\]\s*\{([^}]*)\}/g)) {
  TOKENS[m[1]] = Object.fromEntries([...m[2].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
}
const tokensOf = (id) => TOKENS[id] ?? {};

check('a hex colour reads back as itself', ct.toHex(ct.parseColor('#7dd3fc')) === '#7dd3fc');
check('short hex grows', ct.cleanHex('#abc') === '#aabbcc');
check('rgba becomes eight digit hex', ct.cleanHex('rgba(255, 255, 255, 0.2)') === '#ffffff33');
check('the modern rgb syntax reads too', ct.cleanHex('rgb(0 255 65 / 50%)') === '#00ff4180');
check('nonsense is refused', ct.parseColor('red') === null && ct.parseColor('#12') === null && ct.parseColor('rgba(1,2)') === null);
check('opacity can be read and set', ct.alphaOf('#ffffff33') === 0.2 && ct.withAlpha('#102030', 0.5) === '#10203080');

check('black on white is the widest contrast', ct.contrastRatio('#000000', '#ffffff') === 21);
check('a colour on itself has none', ct.contrastRatio('#336699', '#336699') === 1);
check('a see-through panel is judged over what is under it', ct.contrastRatio('#ffffff', '#ffffff00', '#000000') === 21);
check('the default palette reads well everywhere', ct.contrastWarnings(ct.DEFAULT_PALETTE).length === 0);
const muddy = ct.contrastWarnings({ ...ct.DEFAULT_PALETTE, ink: '#10142a', 'accent-ink': '#7dd3fc' });
check('text the colour of the panels is flagged', muddy.some((w) => w.id === 'inkSolid') && muddy.some((w) => w.id === 'inkBg'));
check('and so is text on the accent', muddy.some((w) => w.id === 'accentInk'));
check('each warning says how far off it is', muddy.every((w) => w.ratio < w.min && w.min >= 3));
const dim = { ...ct.DEFAULT_PALETTE, bg: '#2a0a0a', 'surface-solid': '#330c0c', 'ink-dim': '#552222', 'ink-faint': '#3a1212', accent: '#8a1020' };
const fixed = ct.composeCustom({ palette: dim }).vars;
const reads = (token) => [dim.bg, dim['surface-solid']].every((bg) => ct.contrastRatio(fixed[token], bg) >= 4.5);
check('a dim palette still gets readable secondary text', reads('--ink-dim') && reads('--ink-faint') && reads('--accent-text'), JSON.stringify(fixed));
check('the accent itself keeps the chosen colour', fixed['--accent'] === '#8a1020');
check('a palette that already reads well is left alone', ct.composeCustom({ palette: ct.DEFAULT_PALETTE }).vars['--ink-dim'] === ct.DEFAULT_PALETTE['ink-dim']);
check('every built-in theme reads well on its own panels', THEMES.every((th) => {
  const palette = ct.paletteFromTokens(tokensOf(th.id), th);
  return ct.contrastRatio(palette.ink, palette['surface-solid']) >= 4.5;
}));

const TIERS = [...RARITIES, ct.RARITY_TEXT_TIERS.at(-1)];
const rarityMisses = (palette, vars, sky = []) => TIERS.flatMap((tier) => {
  const text = vars[ct.rarityTextVar(tier.id)];
  if (!text) return [`${tier.id} has no text colour`];
  return ct.rarityGrounds(palette, tier.color, sky)
    .map(([bg, base]) => ct.contrastRatio(text, bg, base))
    .filter((r) => r < 4.5)
    .map((r) => `${tier.id} ${text} at ${r}:1`);
});
const themeMisses = THEMES.flatMap((th) => {
  const palette = ct.paletteFromTokens(tokensOf(th.id), th);
  return rarityMisses(palette, ct.rarityTextTokens(palette, th.backdrop?.sky ?? []), th.backdrop?.sky ?? []).map((m) => `${th.id}: ${m}`);
});
check(`rarity names read at 4.5:1 on every built-in theme (${THEMES.length}), Paper, Rotary and Erdtree included`,
  themeMisses.length === 0 && ['paper', 'wankel', 'elden'].every((id) => THEMES.some((th) => th.id === id)), themeMisses.slice(0, 6).join(' | '));
const mythicDefault = ct.rarityTextTokens(ct.paletteFromTokens(tokensOf('aurora'), THEMES.find((th) => th.id === 'aurora')))[ct.rarityTextVar('mythic')];
check('the Mythic name is lifted on the default theme', mythicDefault !== '#e02134' && ct.contrastRatio(mythicDefault, '#10142a') >= 4.5, mythicDefault);
check('the rarity identity colours themselves stay the same', RARITIES.find((r) => r.id === 'mythic').color === '#e02134' && RARITIES.find((r) => r.id === 'legendary').color === '#fbbf24');
const paperText = ct.rarityTextTokens(ct.paletteFromTokens(tokensOf('paper'), THEMES.find((th) => th.id === 'paper')));
check('on a light theme the pale tiers get darker, not lighter', ct.luminance(ct.parseColor(paperText[ct.rarityTextVar('legendary')])) < ct.luminance(ct.parseColor('#fbbf24')), paperText[ct.rarityTextVar('legendary')]);
const customPalettes = [
  ct.DEFAULT_PALETTE,
  { ...ct.DEFAULT_PALETTE, bg: '#f4efe4', surface: '#ffffff', 'surface-2': '#f7f2e8', 'surface-solid': '#ffffff', ink: '#1d1a14' },
  { ...ct.DEFAULT_PALETTE, bg: '#2a0a0a', 'surface-solid': '#330c0c' },
  { ...ct.DEFAULT_PALETTE, bg: '#0d3b1e', 'surface-solid': '#14532d', surface: '#4ade8022' },
  { ...ct.DEFAULT_PALETTE, bg: '#fde68a', 'surface-solid': '#fef3c7', surface: '#ffffffaa', 'surface-2': '#ffffffcc' },
  ...THEMES.map((th) => ct.paletteFromTokens(tokensOf(th.id), th))
];
const customMisses = customPalettes.flatMap((palette, i) => rarityMisses(palette, ct.composeCustom({ palette }).vars).map((m) => `#${i}: ${m}`));
check('custom themes carry readable rarity names for any palette', customMisses.length === 0, customMisses.slice(0, 6).join(' | '));
const friendMisses = ['#ff2d55', '#00e5ff', '#fde047', '#7c3aed'].flatMap((accent) => ['aurora', 'paper', 'wankel', 'elden'].flatMap((base) => {
  const palette = { ...ct.paletteFromTokens(tokensOf(base), THEMES.find((th) => th.id === base)), accent };
  return rarityMisses(palette, ct.composeCustom({ base, palette }).vars).map((m) => `${base} ${accent}: ${m}`);
}));
check('friend themes built on any base read too', friendMisses.length === 0, friendMisses.slice(0, 6).join(' | '));

const owned = new Set(['aurora', 'arcade', 'matrix', 'pixel']);
const owns = (id) => owned.has(id);
const tidy = ct.normalizeCustom({
  palette: { accent: '#FF00AA', ink: 'blue', bg: '#123456', extra: '#ffffff' },
  layers: { sound: 'arcade', font: 'matrix', shape: 'noir', scene: 'nope', special: 'matrix' },
  veil: 400
}, owns);
check('a good colour is kept, lowercased', tidy.palette.accent === '#ff00aa' && tidy.palette.bg === '#123456');
check('a bad one falls back to the default', tidy.palette.ink === ct.DEFAULT_PALETTE.ink);
check('unknown tokens are dropped', !('extra' in tidy.palette) && Object.keys(tidy.palette).length === ct.PALETTE_TOKENS.length);
check('owned layers stay', tidy.layers.sound === 'arcade' && tidy.layers.font === 'matrix');
check('a layer from a theme not owned falls back to aurora', tidy.layers.shape === 'aurora');
check('an unknown scene falls back too', tidy.layers.scene === 'aurora');
check('only themes with special touches lend them', tidy.layers.special === ct.NO_SPECIAL);
check('the veil is held to its range', tidy.veil === ct.MAX_VEIL);

const mixed = ct.composeCustom({
  palette: { ...ct.DEFAULT_PALETTE, accent: '#ff00aa', ink: '#fefefe' },
  layers: { sound: 'arcade', font: 'matrix', shape: 'arcade', scene: 'matrix', special: 'pixel' }
}, tokensOf, owns);
check('the shape layer decides the element shapes', mixed.shape === 'arcade');
check('the font comes from its own theme', /monospace/.test(mixed.vars['--font']) && mixed.vars['--display-transform'] === 'uppercase');
check('every palette colour is set but the background', ct.PALETTE_TOKENS.every((tk) => tk === 'bg' ? !('--bg' in mixed.vars) : mixed.vars[`--${tk}`]));
check('the palette wins over the shape theme', mixed.vars['--accent'] === '#ff00aa' && mixed.vars['--ink'] === '#fefefe');
check('the shape theme glow takes the new accent', /#ff00aa/.test(mixed.vars['--surface-shadow']) && !/34,\s*211,\s*238/.test(mixed.vars['--surface-shadow']));
check('scene, sound and special touches are their own layers', mixed.scene === 'matrix' && mixed.sound === 'arcade' && mixed.special === 'pixel');
check('the shape theme brings its motion', mixed.motion.scale === THEMES.find((th) => th.id === 'arcade').motion.scale);
check('the background colour tints the scene', mixed.tint === ct.DEFAULT_PALETTE.bg);
const paper = ct.paletteFromTokens(tokensOf('paper'), THEMES.find((th) => th.id === 'paper'));
check('a preset takes the colours of its theme', paper.ink === '#171512' && paper.surface === '#fffdf7' && paper.bg === '#f2eee4');
const glassy = ct.paletteFromTokens(tokensOf('aurora'), THEMES[0]);
check('see-through tokens keep their opacity', ct.alphaOf(glassy.surface) < 0.1 && glassy['surface-solid'] === '#10142a');
check('the aurora preset is the default palette', ct.PALETTE_TOKENS.every((tk) => glassy[tk] === ct.DEFAULT_PALETTE[tk]));

const st = {
  owned: { themes: ['custom', 'arcade', 'matrix'], fx: ['legendary:moltengold'] },
  codesRedeemed: { pixeltest: 1, waiting: 1 },
  codeDefs: { pixeltest: { id: 'pixeltest', theme: 'pixel' }, waiting: { id: 'waiting', theme: 'elden' } },
  seasonUnlocks: { themes: ['frost'], badges: [] }
};
check('aurora is everyone\'s', look.themeIdOwned({}, 'aurora'));
check('a bought theme is owned', look.themeIdOwned(st, 'arcade') && !look.themeIdOwned(st, 'paper'));
check('a code theme follows its code', look.themeIdOwned(st, 'pixel') && !look.themeIdOwned({ owned: { themes: ['pixel'] } }, 'pixel'));
check('only a redeemed definition counts', look.themeIdOwned(st, 'elden') && !look.themeIdOwned({ ...st, codesRedeemed: { pixeltest: 1 } }, 'elden') && !look.themeIdOwned({ codesRedeemed: { pixeltest: 1 } }, 'pixel'));
check('a season theme follows the season', look.themeIdOwned(st, 'frost') && !look.themeIdOwned({ owned: { themes: ['frost'] } }, 'frost'));
check('the custom theme is its own purchase', look.themeIdOwned(st, 'custom') && !look.themeIdOwned({}, 'custom'));

const built = look.buildAppearance({ theme: 'custom', custom: tidy, fx: { legendary: 'moltengold', rare: 'classic', epic: 'nope' } });
check('an appearance keeps real effects only', JSON.stringify(built.fx) === '{"legendary":"moltengold"}');
check('and carries the whole palette and every layer', Object.keys(built.custom.palette).length === 15 && ct.LAYERS.every((l) => built.custom.layers[l]));
check('it stays small', JSON.stringify(built).length < 900, String(JSON.stringify(built).length));
const strict = look.cleanAppearance({ ...built, fx: { legendary: 'moltengold', epic: 'geode' }, custom: { ...built.custom, layers: { ...built.custom.layers, shape: 'noir', font: 'matrix' } } }, st);
check('the server keeps owned effects only', JSON.stringify(strict.fx) === '{"legendary":"moltengold"}');
check('and drops a layer not owned', !('shape' in strict.custom.layers) && strict.custom.layers.font === 'matrix');
check('a custom theme without the purchase falls back', look.cleanAppearance({ theme: 'custom', custom: built.custom }, { owned: { themes: [] } }).theme === 'aurora');
check('an unknown legacy theme is shaped, not trusted', look.cleanAppearance({ theme: 'neon-2030' }).theme === 'neon-2030' && look.cleanAppearance({ theme: 'neon-2030' }, st).theme === 'aurora');
check('rubbish is no appearance at all', look.cleanAppearance('matrix') === null && look.cleanAppearance({ theme: 'x'.repeat(5000) }) === null);
check('key order does not change the signature', look.canonical({ a: 1, b: { d: 2, c: 3 } }) === look.canonical({ b: { c: 3, d: 2 }, a: 1 }));

const schema = readFileSync('supabase/schema.sql', 'utf8');
const block = schema.slice(schema.indexOf('-- appearance'));
const sqlList = (name) => block.match(new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]+)\\]`))[1].split(',').map((s) => s.trim().replace(/'/g, ''));
check('the server knows every code theme', sqlList('v_code_themes').join() === THEMES.filter((th) => th.code).map((th) => th.id).join() && !/v_codes|codesRedeemed->v_code/.test(block));
check('and every season theme', sqlList('v_seasons').join() === THEMES.filter((th) => th.season).map((th) => th.season).join()
  && THEMES.filter((th) => th.season).every((th) => th.season === th.id));
check('and every rarity', sqlList('v_rarities').join() === RARITIES.map((r) => r.id).join());
check('and every palette token', sqlList('v_tokens').join() === ct.PALETTE_TOKENS.join());
check('and every layer', sqlList('v_layers').join() === ct.LAYERS.join());
check('and every theme with special touches', sqlList('v_specials').join() === ct.SPECIALS.join());
check('the appearance block comes just before the friend codes, the last one, and the file still reloads the schema', /-- appearance[\s\S]*-- friend codes[\s\S]*notify pgrst, 'reload schema';\n$/.test(schema)
  && schema.lastIndexOf('\n-- ') === schema.indexOf('\n-- friend codes')
  && schema.lastIndexOf('\n-- ', schema.indexOf('\n-- friend codes') - 1) === schema.indexOf('\n-- appearance'));

const db = createEconDb();
const call = (id, action, args) => run({ store: db.store(id), now: Date.UTC(2026, 9, 2), random: () => 0.5, draw: async () => [], later: () => {}, user: id }, action, args);
const refused = async (fn, code) => { try { await fn(); return false; } catch (e) { return e instanceof EconError && e.code === code; } };
await call('u', 'import');
await db.store('u').apply({ ink: 520 });
check('the custom theme is dearer than any theme', CUSTOM_THEME_PRICE === 500 && CUSTOM_THEME_PRICE > THEME_PRICE);
const bought = await call('u', 'atelier', { kind: 'themes', id: 'custom' });
check('the Atelier sells it for 500 Ink', bought.wallet.ink === 20 && bought.state.owned.themes.includes('custom'));
check('only once', await refused(() => call('u', 'atelier', { kind: 'themes', id: 'custom' }), 'OWNED'));
await call('v', 'import');
await db.store('v').apply({ ink: 499 });
check('and not on credit', await refused(() => call('v', 'atelier', { kind: 'themes', id: 'custom' }), 'INSUFFICIENT_FUNDS'));

done();
