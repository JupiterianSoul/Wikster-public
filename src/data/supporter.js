export const SUPPORTER_TIERS = [
  {
    id: 'contributor',
    product: 'wikster.supporter.contributor',
    usd: 2.99,
    name: { en: 'Contributor', fr: 'Contributeur' },
    pitch: { en: 'The Folio theme and the Contributor badge.', fr: 'Le thème Folio et le badge Contributeur.' },
    themes: ['folio'],
    badges: ['contributor'],
    ink: 0
  },
  {
    id: 'editor',
    product: 'wikster.supporter.editor',
    usd: 4.99,
    name: { en: 'Editor', fr: 'Rédacteur' },
    pitch: { en: 'Everything in Contributor, 800 Ink and the Editor badge.', fr: 'Tout Contributeur, 800 d’Encre et le badge Rédacteur.' },
    themes: ['folio'],
    badges: ['contributor', 'editor'],
    ink: 800
  },
  {
    id: 'curator',
    product: 'wikster.supporter.curator',
    usd: 9.99,
    name: { en: 'Curator', fr: 'Conservateur' },
    pitch: { en: 'Everything in Editor, 2,000 Ink, the Gilded Edge theme and the Curator badge.', fr: 'Tout Rédacteur, 2 000 d’Encre, le thème Tranche dorée et le badge Conservateur.' },
    themes: ['folio', 'gilded'],
    badges: ['contributor', 'editor', 'curator'],
    ink: 2000
  }
];

export const STEAM_SUPPORTER = {
  id: 'steam-supporter',
  product: 'steam.supporter',
  usd: 1.99,
  name: { en: 'Supporter Pack', fr: 'Pack de soutien' },
  pitch: { en: 'The Folio theme, the Contributor badge and 400 Ink.', fr: 'Le thème Folio, le badge Contributeur et 400 d’Encre.' },
  themes: ['folio'],
  badges: ['contributor'],
  ink: 400
};

export const SUPPORTER_THEMES = ['folio', 'gilded'];

export const ALL_SUPPORTER_PRODUCTS = [...SUPPORTER_TIERS, STEAM_SUPPORTER];

export const productById = (product) => ALL_SUPPORTER_PRODUCTS.find((p) => p.product === product) ?? null;

export function grantsFor(product, note = { en: 'Thank you for supporting Wikster.', fr: 'Merci de soutenir Wikster.' }) {
  const pack = productById(product);
  if (!pack) return [];
  const rows = [
    { kind: 'owned', payload: { bucket: 'themes', ids: pack.themes } },
    { kind: 'owned', payload: { bucket: 'supporter', ids: pack.badges } }
  ];
  if (pack.ink > 0) rows.push({ kind: 'ink', payload: { amount: pack.ink, mode: 'add' } });
  return rows.map((row) => ({ ...row, note_en: note.en, note_fr: note.fr }));
}

export const AD_REWARDS = {
  coins: { amount: 250 },
  ink: { amount: 3 },
  booster: { spec: { kind: 'open', themeId: null, rarityId: null, cards: 3 } }
};

export const AD_DAILY_CAP = 5;
