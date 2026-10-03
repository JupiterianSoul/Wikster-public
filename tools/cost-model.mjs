const PER_PLAYER_DAY = {
  edgeCalls: 22,
  pushCalls: 3,
  wikiRequests: 18,
  ledgerRows: 16,
  cardRows: 22,
  otherRows: 12,
  egressKB: 900
};

const BYTES = { ledgerRow: 260, cardRow: 420, otherRow: 300 };
const CONCURRENT_SHARE = 0.12;
const MAU_PER_DAU = 3.2;

const PLANS = [
  { name: 'Free', base: 0, db: 0.5, egress: 5, edge: 0.5e6, realtime: 200, mau: 50e3 },
  { name: 'Pro', base: 25, db: 8, egress: 250, edge: 2e6, realtime: 500, mau: 100e3,
    extra: { dbGB: 0.125, egressGB: 0.09, edgeMillion: 2, realtimeThousand: 10, mau: 0.00325 } }
];

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

function month(dau, monthsLive = 6) {
  const d = PER_PLAYER_DAY;
  const rowsPerDay = d.ledgerRows * BYTES.ledgerRow + d.cardRows * BYTES.cardRow + d.otherRows * BYTES.otherRow;
  return {
    dau,
    mau: dau * MAU_PER_DAU,
    edge: dau * (d.edgeCalls + d.pushCalls) * 30,
    wiki: dau * d.wikiRequests * 30,
    dbGB: (dau * MAU_PER_DAU * 0.35 * rowsPerDay * 30 * monthsLive) / 1e9 + 0.05,
    egressGB: (dau * d.egressKB * 30) / 1e6,
    realtime: Math.ceil(dau * CONCURRENT_SHARE)
  };
}

function bill(use) {
  const free = PLANS[0];
  if (use.dbGB <= free.db && use.egressGB <= free.egress && use.edge <= free.edge && use.realtime <= free.realtime && use.mau <= free.mau) {
    return { plan: 'Free', cost: 0 };
  }
  const pro = PLANS[1];
  const x = pro.extra;
  const cost = pro.base
    + Math.max(0, use.dbGB - pro.db) * x.dbGB
    + Math.max(0, use.egressGB - pro.egress) * x.egressGB
    + Math.max(0, use.edge - pro.edge) / 1e6 * x.edgeMillion
    + Math.ceil(Math.max(0, use.realtime - pro.realtime) / 1000) * x.realtimeThousand
    + Math.max(0, use.mau - pro.mau) * x.mau;
  const compute = use.dau <= 2000 ? 0 : use.dau <= 10000 ? 15 : use.dau <= 30000 ? 60 : 110;
  return { plan: compute ? `Pro + compute $${compute}` : 'Pro', cost: cost + compute };
}

console.log('Monthly Supabase use and bill by daily players, after six months live\n');
console.log('| Daily players | Monthly players | Edge calls | Wikipedia requests | Database | Egress | Realtime peak | Plan | $/month |');
console.log('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |');
for (const dau of [50, 200, 1000, 5000, 20000, 50000]) {
  const use = month(dau);
  const { plan, cost } = bill(use);
  console.log(`| ${fmt(dau)} | ${fmt(use.mau)} | ${fmt(use.edge)} | ${fmt(use.wiki)} | ${use.dbGB.toFixed(2)} GB | ${use.egressGB.toFixed(1)} GB | ${use.realtime} | ${plan} | ${cost.toFixed(0)} |`);
}
console.log('\nAssumptions per daily player per day:', JSON.stringify(PER_PLAYER_DAY));
console.log('Prices are Supabase list prices as last checked; confirm on supabase.com/pricing before relying on them.');
