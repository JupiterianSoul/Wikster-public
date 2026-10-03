import { check, done } from './lib.mjs';

const { ALL_SUPPORTER_PRODUCTS, SUPPORTER_THEMES, grantsFor, productById } = await import('../../src/data/supporter.js');
const { THEMES } = await import('../../src/ui/themes.js');
const { BADGES } = await import('../../src/badges.js');

for (const pack of ALL_SUPPORTER_PRODUCTS) {
  const rows = grantsFor(pack.product);
  check(`${pack.id} grants only Ink and cosmetics, never Buckarooz, boosters or cards`,
    rows.length > 0 && rows.every((r) => r.kind === 'ink' || (r.kind === 'owned' && ['themes', 'supporter'].includes(r.payload.bucket))));
  check(`${pack.id} names themes that exist and are marked as supporter themes`,
    pack.themes.every((id) => THEMES.some((th) => th.id === id && th.supporter)));
  check(`${pack.id} names badges that exist`, pack.badges.every((id) => BADGES.some((b) => b.supporter === id)));
}
check('every supporter theme is sold by some pack', SUPPORTER_THEMES.every((id) => ALL_SUPPORTER_PRODUCTS.some((p) => p.themes.includes(id))));
check('an unknown product grants nothing', grantsFor('nope').length === 0 && productById('nope') === null);
check('higher tiers include everything below them', ALL_SUPPORTER_PRODUCTS.slice(0, 3).every((p, i, all) => i === 0 || all[i - 1].badges.every((b) => p.badges.includes(b))));

done();
