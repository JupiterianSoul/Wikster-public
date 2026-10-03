import { check, done } from './lib.mjs';

const { TODAY_CARDS, TODAY_POOL, TODAY_PRICE, RETURN_RATE, SELL_RATE, WRAPPER_CARDS, todayBands, todayExpectedCardValue, todayRarityForRank } =
  await import('../../src/economy.js');
const { priceFor } = await import('../../src/pricing.js');
const { rarityById, rarityRank } = await import('../../src/data/rarities.js');

check('the day\'s number one is Prismatic', todayRarityForRank(1).id === 'prismatic');
check('the next four are Exotic', todayRarityForRank(2).id === 'exotic' && todayRarityForRank(5).id === 'exotic');
check('the two hundredth is Rare', todayRarityForRank(TODAY_POOL).id === 'rare');
check('nothing on the list is below Rare', rarityRank(todayRarityForRank(TODAY_POOL).id) >= rarityRank('rare'));

let monotonic = true;
for (let rank = 2; rank <= TODAY_POOL; rank++) {
  if (rarityRank(todayRarityForRank(rank).id) > rarityRank(todayRarityForRank(rank - 1).id)) monotonic = false;
}
check('a lower place is never a higher tier', monotonic);

check('a rank off the end lands on the last band', todayRarityForRank(9999).id === 'rare');
check('a nonsense rank does too', todayRarityForRank(0).id === 'rare' && todayRarityForRank(NaN).id === 'rare');

const bands = todayBands();
let covered = true;
let expected = 1;
for (const band of bands) {
  if (band.from !== expected) covered = false;
  expected = (band.to ?? TODAY_POOL) + 1;
}
check('the bands cover the list end to end', covered, JSON.stringify(bands.map((b) => `${b.from}-${b.to ?? '+'}`)));
check('the last band is open ended', bands[bands.length - 1].to === null);

const prismaticRanks = Array.from({ length: TODAY_POOL }, (_, i) => i + 1)
  .filter((rank) => todayRarityForRank(rank).id === 'prismatic').length;
check('one place in the pool earns Prismatic', prismaticRanks === 1, String(prismaticRanks));

let sum = 0;
for (let rank = 1; rank <= TODAY_POOL; rank++) sum += priceFor(1, todayRarityForRank(rank));
check('the expected card is the ladder\'s average', Math.abs(todayExpectedCardValue() - sum / TODAY_POOL) < 0.001);

const byTheRule = Math.max(5, Math.round(
  ((todayExpectedCardValue() * SELL_RATE) / RETURN_RATE) * (TODAY_CARDS + WRAPPER_CARDS) / 5) * 5);
check('the price follows the game\'s rule', TODAY_PRICE === byTheRule, `${TODAY_PRICE} vs ${byTheRule}`);

const packValue = todayExpectedCardValue() * TODAY_CARDS;
check('a pack sells back for less than it costs', packValue * SELL_RATE < TODAY_PRICE,
  `sell ${Math.round(packValue * SELL_RATE)} vs price ${TODAY_PRICE}`);
check('and by the same margin as every other pack',
  Math.abs((packValue * SELL_RATE) / TODAY_PRICE - RETURN_RATE * (TODAY_CARDS / (TODAY_CARDS + WRAPPER_CARDS))) < 0.01);

const byFame = priceFor(1, rarityById('prismatic')) * TODAY_CARDS;
check('grading on fame alone would have paid several times the price', byFame * SELL_RATE > TODAY_PRICE * 2,
  `${Math.round(byFame * SELL_RATE)} vs ${TODAY_PRICE}`);

done();
