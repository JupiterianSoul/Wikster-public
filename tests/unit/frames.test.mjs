import { check, done, fakeStorage } from './lib.mjs';

fakeStorage();
const frames = await import('../../src/frames.js');
const ink = await import('../../src/ink.js');
const { FRAME_STYLES, FRAME_GRADES, INK_FRAMES, frameSvg, frameGrade, inkFramePrice } = frames;

const TIERS = Array.from({ length: 50 }, (_, i) => i + 1);
const broken = [];
const dangling = [];
for (const style of FRAME_STYLES) {
  for (const tier of TIERS) {
    const svg = frameSvg(style.id, tier);
    if (!svg.startsWith('<svg') || /NaN|undefined|Infinity|\[object/.test(svg)) broken.push(`${style.id}@${tier}`);
    const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const missing = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]).filter((id) => !ids.has(id));
    if (missing.length) dangling.push(`${style.id}@${tier}: ${[...new Set(missing)].join(' ')}`);
  }
}
check('every frame draws at every one of the fifty tiers', broken.length === 0, broken.slice(0, 6).join(' '));
check('every gradient a frame uses is defined in its own drawing', dangling.length === 0, dangling.slice(0, 4).join(' | '));

const twice = [frameSvg('god', 20), frameSvg('god', 20)].map((svg) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
check('two drawings of the same frame never share an id', twice[0].length > 0 && !twice[0].some((id) => twice[1].includes(id)));

const viewBoxes = FRAME_STYLES.every((s) => [...frameSvg(s.id, 30).matchAll(/viewBox="([^"]+)"/g)].every((m) => m[1] === '-58 -58 116 116'));
check('every layer shares the same centred box', viewBoxes);
check('a frame starts with its static drawing, then its moving layers', FRAME_STYLES.every((s) => {
  const svg = frameSvg(s.id, 25);
  return svg.startsWith(`<svg data-grade="${s.grade}" class="fr fr-${s.id}"`) && [...svg.matchAll(/<svg /g)].length === 1 + [...svg.matchAll(/class="fr-layer/g)].length;
}));
check('tier zero draws nothing', frameSvg('metal', 0) === '');
check('an unknown frame falls back to metal', frameSvg('nope', 3).includes('fr-metal'));
check('the starting frame stays still and light', !frameSvg('metal', 1).includes('fr-layer') && frameSvg('metal', 1).length < 2500, String(frameSvg('metal', 1).length));

const sig = (id, tier) => frameSvg(id, tier).replace(/wf[0-9a-z]+/g, '#');
check('no two frames look alike', new Set(FRAME_STYLES.map((s) => sig(s.id, 12))).size === FRAME_STYLES.length);
check('a frame grows as its tier climbs', FRAME_STYLES.every((s) => sig(s.id, 1) !== sig(s.id, 50)), FRAME_STYLES.filter((s) => sig(s.id, 1) === sig(s.id, 50)).map((s) => s.id).join(' '));

const animated = (id) => (frameSvg(id, 50).match(/class="fr-layer [^"]*fr-(spin|pulse|twinkle|flash|flicker|drip)/g) ?? []).length + (frameSvg(id, 50).match(/class="fr-layer sing-ring/g) ?? []).length;
const rank = (s) => FRAME_GRADES.findIndex((g) => g.id === s.grade);
check('every frame has a grade', FRAME_STYLES.every((s) => rank(s) >= 0 && frameGrade(s).id === s.grade));
check('the classic frame is the only still one at its first tier', FRAME_STYLES.filter((s) => !frameSvg(s.id, 1).includes('fr-layer')).map((s) => s.id).join() === 'metal');
check('mythic and exclusive frames carry at least three moving layers', FRAME_STYLES.filter((s) => rank(s) >= 4).every((s) => animated(s.id) >= 3));
check('legendary frames move in at least two ways', FRAME_STYLES.filter((s) => s.grade === 'legendary').every((s) => animated(s.id) >= 2));

check('fourteen frames on the Atelier shelf', INK_FRAMES.length === 14 && INK_FRAMES.every((s) => s.minLevel === 1 && !s.code));
check('the first ten keep their ids and their price', ['ivy', 'gears', 'tide', 'storm', 'honey', 'inkwell', 'origami', 'lanterns', 'stained', 'comet']
  .every((id) => inkFramePrice(id) === ink.FRAME_PRICE));
check('epic frames cost twice a rare one, legendary ones more again', INK_FRAMES.every((s) => s.price === { rare: ink.FRAME_PRICE, epic: ink.FRAME_PRICE_EPIC, legendary: ink.FRAME_PRICE_LEGENDARY }[s.grade])
  && ink.FRAME_PRICE < ink.FRAME_PRICE_EPIC && ink.FRAME_PRICE_EPIC < ink.FRAME_PRICE_LEGENDARY && ink.FRAME_PRICE_LEGENDARY <= ink.CUSTOM_THEME_PRICE);
check('a frame that is not sold has no price', inkFramePrice('metal') === null && inkFramePrice('god') === null && inkFramePrice('nope') === null);
check('every frame is named in both languages, uniquely', new Set(FRAME_STYLES.map((s) => s.name.en)).size === FRAME_STYLES.length
  && FRAME_STYLES.every((s) => s.name.en && s.name.fr) && FRAME_GRADES.every((g) => g.name.en && g.name.fr));
check('the level path keeps its levels', ['metal:1', 'circuit:15', 'orbit:35', 'crest:60', 'crystal:90', 'aurora:125', 'runic:160', 'solar:200', 'singularity:500']
  .every((pair) => { const [id, lv] = pair.split(':'); return FRAME_STYLES.find((s) => s.id === id)?.minLevel === Number(lv); }));

done();
