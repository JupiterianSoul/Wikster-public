export const PICTURE_BASE = 'https://fixture.supabase.co/storage/v1/object/public/friend-pictures/legacy';
export const MAKER_PHOTO = `${PICTURE_BASE}/maker-test.jpg`;
export const SOLO_PHOTO = `${PICTURE_BASE}/solo-test.jpg`;

const maker = {
  key: 'special:creator',
  creator: true,
  title: { en: 'The Maker', fr: 'Le Fabricant' },
  description: { en: 'A made up biography', fr: 'Une biographie inventée' },
  extract: {
    en: 'Test Person is a made up character who builds apps for the test suite. Nothing in this text is about a real person.',
    fr: 'Personne Test est un personnage inventé qui construit des applications pour les tests. Rien ici ne parle d’une vraie personne.'
  },
  photo: MAKER_PHOTO
};

const look = (name) => ({
  name: { en: `${name}’s Test Booster`, fr: `Booster de test de ${name}` },
  tagline: { en: `${name}, a test tagline`, fr: `${name}, une accroche de test` },
  album: { en: `${name}’s Test Album`, fr: `Album de test de ${name}` },
  message: { en: `${name}. A made up message for the tests. Made for you.`, fr: `${name}. Un message inventé pour les tests. Fait pour toi.` }
});

const commons = (n) => ({
  url: `https://upload.wikimedia.org/wikipedia/commons/a/aa/Fixture_picture_${n}.jpg`,
  credit: `Fixture author ${n}`, license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  link: `https://commons.wikimedia.org/wiki/File:Fixture_picture_${n}.jpg`
});

export const ROTOR = {
  id: 'rotortest', person: 'Rotortest',
  accent: '#0000ff', accent2: '#00003d', light: '#ccd2ff',
  theme: 'wankel', skin: 'rotor',
  emblem: 'rotor', foil: 'epitrochoid', family: 'roundel', shapes: ['rotor', 'ring'],
  ...look('Rotortest'),
  badge: { id: 'special-rotortest', motif: 'rotor', foil: ['#ccd2ff', '#0000ff', '#00003d'], name: { en: 'Rotortest’s Test Badge', fr: 'Badge de test de Rotortest' } },
  cards: [
    { en: 'Sports car', fr: 'Voiture de sport', name: { en: 'The fixture car', fr: 'La voiture de test' }, image: commons(1) },
    { en: 'Racing car', fr: 'Voiture de course', image: commons(2) },
    { en: 'Engineer', fr: 'Ingénieur', image: commons(3) },
    { en: 'Inventor', fr: 'Inventeur', image: commons(4) },
    { en: 'Engine', fr: 'Moteur', image: commons(5) },
    { en: 'Video game', fr: 'Jeu vidéo' }
  ],
  extra: maker
};

export const TREE = {
  id: 'treetest', person: 'Treetest',
  accent: '#c8102e', accent2: '#3a0710', light: '#ffd6dc',
  theme: 'elden', skin: 'erdtree',
  emblem: 'erdtree', foil: 'runes', family: 'arch', shapes: ['petal', 'orb'],
  ...look('Treetest'),
  badge: { id: 'special-treetest', motif: 'erdtree', foil: ['#ffd6dc', '#c8102e', '#3a0710'], name: { en: 'Treetest’s Test Badge', fr: 'Badge de test de Treetest' } },
  cards: [
    { en: 'Chess', fr: 'Échecs', pictureLang: 'en' },
    { en: 'Go (game)', fr: 'Go (jeu)', pictureLang: 'en' },
    { en: 'Checkers', fr: 'Dames', pictureLang: 'en' },
    { en: 'Backgammon', fr: 'Backgammon', pictureLang: 'en' },
    { en: 'Linux', fr: 'Linux', name: { en: 'Linux [REDACTED]', fr: 'Linux [CENSURÉ]' }, art: 'opsec', redact: true }
  ],
  extra: maker
};

export const FIRE = {
  id: 'firetest', person: 'Firetest',
  accent: '#fa8072', accent2: '#5b1717', light: '#ffe4de',
  theme: 'hellfire', frame: 'hellfire', skin: 'hellfire',
  emblem: 'hellfire', foil: 'facets', family: 'crest', shapes: ['shard', 'star4'],
  ...look('Firetest'),
  badge: { id: 'special-firetest', motif: 'hellfire', live: 'fire', foil: ['#ffe4de', '#fa8072', '#5b1717'], name: { en: 'Firetest’s Test Badge', fr: 'Badge de test de Firetest' } },
  cards: [
    { en: 'Orchestra', fr: 'Orchestre' },
    { en: 'Orchestra', fr: 'Orchestre', slot: 'violin', name: { en: 'First Violin', fr: 'Premier violon' },
      text: { en: 'A made up violinist for the tests, who plays the first part.', fr: 'Un violoniste inventé pour les tests, qui joue la première partie.' } },
    { en: 'Orchestra', fr: 'Orchestre', slot: 'cello', name: { en: 'Cellist', fr: 'Violoncelliste' },
      text: { en: 'A made up cellist for the tests, who holds the low end.', fr: 'Un violoncelliste inventé pour les tests, qui tient les graves.' } },
    { en: 'Conductor', fr: 'Chef d’orchestre', text: { en: 'A made up conductor for the tests.', fr: 'Un chef inventé pour les tests.' } },
    { en: 'The Matrix', fr: 'Matrix (film)', name: { en: 'Matrix', fr: 'Matrix' }, art: 'matrix' },
    { en: 'Painting', fr: 'Peinture' },
    { en: 'Sculpture', fr: 'Sculpture' }
  ],
  extra: maker
};

export const SOLO = {
  id: 'solotest', person: 'Solotest', solo: true,
  accent: '#00e5a8', accent2: '#002b22', light: '#c8fff0',
  theme: null, skin: 'algorithm',
  emblem: 'algorithm', foil: 'circuit', family: 'panel', shapes: ['square', 'streak'],
  name: { en: 'Solotest', fr: 'Solotest' },
  tagline: { en: 'One test card', fr: 'Une carte de test' },
  album: { en: 'Solotest', fr: 'Solotest' },
  message: { en: 'A made up message: there is only one Solotest.', fr: 'Un message inventé : il n’y a qu’un Solotest.' },
  badge: { id: 'special-solotest', motif: 'algorithm', foil: ['#c8fff0', '#00e5a8', '#002b22'], name: { en: 'Solotest', fr: 'Solotest' } },
  cards: [],
  extra: {
    key: 'special:solotest',
    title: { en: 'Solotest', fr: 'Solotest' },
    description: { en: 'A made up legend', fr: 'Une légende inventée' },
    extract: { en: 'Solotest is a made up friend who only exists in the test suite, calm and sharp.', fr: 'Solotest est un ami inventé qui n’existe que dans les tests, calme et vif.' },
    photo: SOLO_PHOTO
  }
};

export const CROWN = {
  id: 'crowntest', person: 'Crowntest', regalia: true,
  accent: '#fbbf24', accent2: '#7c2d12', light: '#fff7d6',
  theme: 'apotheosis', frame: 'god', skin: 'creator',
  emblem: 'seal', foil: 'goldleaf', family: 'crest', shapes: ['orb', 'square'],
  name: { en: 'The Test Crown', fr: 'La Couronne de test' },
  tagline: { en: 'A made up regalia', fr: 'Des insignes inventés' },
  album: { en: 'The Test Crown', fr: 'La Couronne de test' },
  message: { en: 'A made up message for the Test Crown. There is no booster here on purpose.', fr: 'Un message inventé pour la Couronne de test. Il n’y a pas de booster ici, volontairement.' },
  badge: { id: 'special-crowntest', motif: 'seal', foil: ['#fff7d6', '#fbbf24', '#7c2d12'], name: { en: 'The Test Crown', fr: 'La Couronne de test' } },
  cards: []
};

export const PLAIN = {
  id: 'plaintest', person: 'Plaintest',
  accent: '#3b82f6', accent2: '#0b2a6b', light: '#bfdbfe',
  theme: 'rire', skin: 'laugh',
  emblem: 'laugh', foil: 'waves', family: 'marquee', shapes: ['orb', 'star4'],
  ...look('Plaintest'),
  badge: { id: 'special-plaintest', motif: 'laugh', foil: ['#bfdbfe', '#3b82f6', '#1d4ed8'], name: { en: 'Plaintest’s Test Badge', fr: 'Badge de test de Plaintest' } },
  cards: [
    { en: 'Cat', fr: 'Chat' },
    { en: 'Dog', fr: 'Chien' },
    { en: 'Bird', fr: 'Oiseau' },
    { en: 'Fish', fr: 'Poisson' },
    { en: 'Horse', fr: 'Cheval' }
  ],
  extra: maker
};

export const LEGACY_CODES = {
  R0T0RT3ST: ROTOR,
  TR33T3ST: TREE,
  F1R3T3ST: FIRE,
  S0L0T3ST: SOLO,
  CR0WNT3ST: CROWN,
  PL41NT3ST: PLAIN
};

export const codeOf = (def) => Object.keys(LEGACY_CODES).find((code) => LEGACY_CODES[code] === def);

export function seedLegacyCodes(econDb) {
  for (const [code, def] of Object.entries(LEGACY_CODES)) {
    econDb.codes.set(code, { code, items: [], per_user: 1, special: null, legacy: JSON.parse(JSON.stringify(def)) });
  }
  return econDb;
}

export const defsOf = (...defs) => Object.fromEntries(defs.map((def) => [def.id, JSON.parse(JSON.stringify(def))]));

export const ADULT_FIXTURE = { api: 'https://grownups.example.test/api.php', names: ['porn', 'porno', 'Fixture Grown Ups'] };
