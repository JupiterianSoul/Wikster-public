export const THEMES = [
  {
    id: 'aurora',
    name: { en: 'Aurora', fr: 'Aurore' },
    blurb: {
      en: 'Deep space glass. Slow ribbons of light, soft springs, bell tones.',
      fr: 'Verre spatial. Rubans de lumière lents, ressorts doux, cloches.'
    },
    swatch: ['#0b1024', '#7dd3fc', '#a78bfa'],
    backdrop: { renderer: 'aurora', ribbons: 5, speed: 0.00013, alpha: 0.5 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'fm',
      gain: 0.62,
      root: 261.63,
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 3.2, decay: 2.6, mix: 0.34 },
      filter: 5200,
      drive: 0.15,
      transient: 'air'
    }
  },
  {
    id: 'paper',
    name: { en: 'Paper', fr: 'Papier' },
    blurb: {
      en: 'Printed and pressed. Hard ink borders, snappy motion, wooden notes.',
      fr: 'Imprimé et pressé. Traits d’encre nets, mouvements vifs, notes de bois.'
    },
    swatch: ['#f2eee4', '#1f6f5c', '#c2410c'],
    backdrop: { renderer: 'paper', flecks: 900, drift: 0.00004 },
    motion: { scale: 0.6, ease: 'cubic-bezier(0.2, 0.9, 0.3, 1)', pop: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
    sound: {
      voice: 'marimba',
      gain: 0.66,
      root: 349.23,
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 0.9, decay: 3.6, mix: 0.1 },
      filter: 3200,
      drive: 0.05,
      transient: 'knock'
    }
  },
  {
    id: 'arcade',
    name: { en: 'Arcade', fr: 'Arcade' },
    blurb: {
      en: 'Cabinet glow. Scanlines, hard edges, square waves, no mercy.',
      fr: 'Lueur de borne. Balayage, angles durs, ondes carrées, sans pitié.'
    },
    swatch: ['#05060a', '#22d3ee', '#f0abfc'],
    backdrop: { renderer: 'arcade', rows: 22, speed: 0.00028 },
    motion: { scale: 0.42, ease: 'cubic-bezier(0.16, 0.9, 0.2, 1)', pop: 'cubic-bezier(0.2, 2.2, 0.4, 1)' },
    sound: {
      voice: 'chip',
      gain: 0.55,
      root: 220,
      scale: [0, 4, 7, 11, 12],
      reverb: { seconds: 0.35, decay: 6, mix: 0.04 },
      filter: 9000,
      drive: 0.55,
      transient: 'bit'
    }
  },
  {
    id: 'noir',
    name: { en: 'Noir', fr: 'Noir' },
    blurb: {
      en: 'One light, one shadow. Grain, gold, plucked strings, slow cuts.',
      fr: 'Une lumière, une ombre. Grain, or, cordes pincées, coupes lentes.'
    },
    swatch: ['#0a0a0a', '#e8c37a', '#6b6b6b'],
    backdrop: { renderer: 'noir', grain: 0.09, leak: true },
    motion: { scale: 1.5, ease: 'cubic-bezier(0.16, 1, 0.3, 1)', pop: 'cubic-bezier(0.25, 1.2, 0.4, 1)' },
    sound: {
      voice: 'keys',
      root: 174.61,
      scale: [0, 3, 7, 10, 14],
      reverb: { seconds: 2.6, decay: 3.2, mix: 0.24 },
      filter: 2400,
      drive: 0,
      transient: 'brush'
    }
  }
,
  {
    id: 'sunset',
    name: { en: "Sunset '84", fr: "Sunset '84" },
    blurb: {
      en: 'Neon horizon. A grid to the sun, pink chrome, fat analogue saws.',
      fr: 'Horizon néon. Une grille vers le soleil, chrome rose, synthés analogiques.'
    },
    swatch: ['#160a2e', '#f472b6', '#22d3ee'],
    backdrop: { renderer: 'sunset', speed: 0.00016 },
    motion: { scale: 0.85, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.3, 1.7, 0.5, 1)' },
    sound: {
      voice: 'synthwave',
      gain: 0.6,
      root: 233.08,
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 2.2, decay: 2.2, mix: 0.3 },
      filter: 4600,
      drive: 0.12,
      transient: 'air'
    }
  },
  {
    id: 'meadow',
    name: { en: 'Meadow', fr: 'Prairie' },
    blurb: {
      en: 'Late afternoon outside. Warm greens, drifting seeds, soft keys.',
      fr: 'Fin d’après-midi dehors. Verts chauds, graines au vent, notes douces.'
    },
    swatch: ['#17230f', '#a3e635', '#fbbf24'],
    backdrop: { renderer: 'meadow', motes: 40, speed: 0.00008 },
    motion: { scale: 1.15, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.4, 0.6, 1)' },
    sound: {
      voice: 'keys',
      root: 293.66,
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 1.8, decay: 2.8, mix: 0.22 },
      filter: 3800,
      drive: 0,
      transient: 'brush'
    }
  },
  {
    id: 'cartoon',
    name: { en: 'Cartoon', fr: 'Cartoon' },
    blurb: {
      en: 'Saturday morning. Thick ink, bouncy everything, rubber sounds.',
      fr: 'Dessin animé du samedi matin. Encre épaisse, rebonds partout, sons en caoutchouc.'
    },
    swatch: ['#fff8e7', '#ff4757', '#3aa0ff'],
    backdrop: { renderer: 'toon', speed: 0.00012 },
    motion: { scale: 1.05, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.28, 2.1, 0.5, 1)' },
    sound: {
      voice: 'marimba',
      gain: 0.68,
      root: 329.63,
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 1.1, decay: 2.6, mix: 0.16 },
      filter: 5600,
      drive: 0.05,
      transient: 'brush',
      kit: 'rubber'
    }
  },
  {
    id: 'matrix',
    name: { en: 'Matrix', fr: 'Matrix' },
    blurb: {
      en: 'Green rain on black glass. Terminal type, digital sounds.',
      fr: 'Pluie verte sur verre noir. Police de terminal, sons numériques.'
    },
    swatch: ['#020a04', '#00ff41', '#0f5c2e'],
    backdrop: { renderer: 'matrix', speed: 0.00018 },
    motion: { scale: 0.5, ease: 'cubic-bezier(0.3, 0, 0.2, 1)', pop: 'cubic-bezier(0.3, 1.2, 0.4, 1)' },
    sound: {
      voice: 'chip',
      gain: 0.5,
      root: 220,
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 1.4, decay: 2.4, mix: 0.2 },
      filter: 3400,
      drive: 0.18,
      transient: 'air',
      kit: 'scifi'
    }
  },
  {
    id: 'casino',
    name: { en: 'Casino', fr: 'Casino' },
    blurb: {
      en: 'Green felt after midnight. Gold trim, drifting suits, chips on wood.',
      fr: 'Tapis vert après minuit. Liseré doré, enseignes qui flottent, jetons sur bois.'
    },
    swatch: ['#0b2e20', '#f2ca4f', '#e0245e'],
    backdrop: { renderer: 'casino', speed: 0.0001 },
    motion: { scale: 0.9, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.5, 0.55, 1)' },
    sound: {
      voice: 'keys',
      gain: 0.9,
      root: 246.94,
      scale: [0, 2, 3, 7, 9],
      reverb: { seconds: 1.6, decay: 2.6, mix: 0.24 },
      filter: 4200,
      drive: 0.06,
      transient: 'brush',
      kit: 'mechanical'
    }
  },
  {
    id: 'horror',
    name: { en: 'Horror', fr: 'Horreur' },
    blurb: {
      en: 'A house with one light on. Fog, grain, and a red you should not follow.',
      fr: 'Une maison, une seule lumière. Brume, grain, et un rouge à ne pas suivre.'
    },
    swatch: ['#0a0508', '#c8102e', '#7a8a99'],
    backdrop: { renderer: 'horror', speed: 0.00012 },
    motion: { scale: 1.3, ease: 'cubic-bezier(0.3, 0, 0.2, 1)', pop: 'cubic-bezier(0.25, 1.1, 0.4, 1)' },
    sound: {
      voice: 'fm',
      gain: 0.62,
      root: 174.61,
      scale: [0, 1, 3, 6, 8],
      reverb: { seconds: 3.8, decay: 3, mix: 0.42 },
      filter: 2400,
      drive: 0.1,
      transient: 'air',
      kit: 'cinematic'
    }
  },
  {
    id: 'rire', code: true,
    name: { en: 'Rire', fr: 'Rire' },
    blurb: {
      en: 'Bright blue, bouncy springs, and a room that cannot keep a straight face.',
      fr: 'Bleu vif, ressorts bondissants, et une pièce qui ne garde pas son sérieux.'
    },
    swatch: ['#0a1630', '#3b82f6', '#bfdbfe'],
    backdrop: { renderer: 'rire', speed: 0.00016 },
    motion: { scale: 0.85, ease: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', pop: 'cubic-bezier(0.34, 1.7, 0.5, 1)' },
    sound: {
      voice: 'marimba',
      gain: 0.7,
      root: 392.0,
      scale: [0, 4, 7, 9, 12],
      reverb: { seconds: 1.2, decay: 3, mix: 0.16 },
      filter: 4200,
      drive: 0.08,
      transient: 'knock'
    }
  },
  {
    id: 'assur', code: true,
    name: { en: 'Assur', fr: 'Assur' },
    blurb: {
      en: 'Rose glaze on palace brick, cuneiform in the air, slow and ceremonial.',
      fr: 'Émail rose sur brique de palais, cunéiforme dans l’air, lent et cérémonieux.'
    },
    swatch: ['#2a0f1f', '#f472b6', '#f5d0a9'],
    backdrop: { renderer: 'assur', speed: 0.00006 },
    motion: { scale: 1.15, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.3, 1.3, 0.5, 1)' },
    sound: {
      voice: 'fm',
      gain: 0.6,
      root: 220.0,
      scale: [0, 1, 4, 5, 7, 8, 11],
      reverb: { seconds: 4.2, decay: 2.2, mix: 0.4 },
      filter: 3600,
      drive: 0.1,
      transient: 'brush'
    }
  },
  {
    id: 'pixel', code: true,
    name: { en: 'Pixel', fr: 'Pixel' },
    blurb: {
      en: 'Dodger blue, hard pixels, square notes and a level that never ends.',
      fr: 'Bleu dodger, pixels durs, notes carrées et un niveau qui ne finit jamais.'
    },
    swatch: ['#06162e', '#1e90ff', '#cfe7ff'],
    backdrop: { renderer: 'pixel', speed: 0.00022 },
    motion: { scale: 0.7, ease: 'cubic-bezier(0.2, 0.9, 0.3, 1)', pop: 'cubic-bezier(0.2, 1.4, 0.4, 1)' },
    sound: {
      voice: 'chip',
      gain: 0.5,
      root: 329.63,
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 0.4, decay: 4, mix: 0.05 },
      filter: 6000,
      drive: 0.2,
      transient: 'bit'
    }
  },
  {
    id: 'tabletop', code: true,
    name: { en: 'Tabletop', fr: 'Plateau' },
    blurb: {
      en: 'Violet felt under a lamp, dice at rest, meeples waiting for a turn.',
      fr: 'Feutre violet sous une lampe, dés au repos, meeples qui attendent leur tour.'
    },
    swatch: ['#1a0b2e', '#a855f7', '#e9d5ff'],
    backdrop: { renderer: 'tabletop', speed: 0.0001 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'keys',
      gain: 0.66,
      root: 293.66,
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 1.8, decay: 2.8, mix: 0.22 },
      filter: 3800,
      drive: 0.06,
      transient: 'knock'
    }
  },
  {
    id: 'raclette', code: true,
    name: { en: 'Raclette', fr: 'Raclette' },
    blurb: {
      en: 'Beige and lamplight, a half wheel under the heat, an evening that runs long.',
      fr: 'Beige et lumière de lampe, une demi-meule sous la chauffe, une soirée qui s’étire.'
    },
    swatch: ['#241a0f', '#d8c39a', '#f5ead6'],
    backdrop: { renderer: 'raclette', speed: 0.00012 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'keys',
      gain: 0.66,
      root: 220,
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 2.1, decay: 2.6, mix: 0.24 },
      filter: 3200,
      drive: 0.07,
      transient: 'knock'
    }
  },
  {
    id: 'lecture', code: true,
    name: { en: 'Reading', fr: 'Lecture' },
    blurb: {
      en: 'Turquoise on paper, a lamp at the elbow, one more chapter before bed.',
      fr: 'Turquoise sur papier, une lampe au coude, encore un chapitre avant de dormir.'
    },
    swatch: ['#07201d', '#2dd4bf', '#ccfbf1'],
    backdrop: { renderer: 'lecture', speed: 0.00009 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'marimba',
      gain: 0.6,
      root: 293.66,
      scale: [0, 2, 4, 7, 9],
      reverb: { seconds: 2.4, decay: 2.2, mix: 0.26 },
      filter: 4200,
      drive: 0.03,
      transient: 'brush'
    }
  },
  {
    id: 'yaourt', code: true,
    name: { en: 'Yoghurt', fr: 'Yaourt' },
    blurb: {
      en: 'Violet folded through cream, a spoon already in it, an episode already running.',
      fr: 'Du violet mêlé à la crème, la cuillère déjà dedans, un épisode déjà lancé.'
    },
    swatch: ['#1c0f33', '#a78bfa', '#ede9fe'],
    backdrop: { renderer: 'yaourt', speed: 0.00011 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'marimba',
      gain: 0.62,
      root: 261.63,
      scale: [0, 2, 5, 7, 9],
      reverb: { seconds: 2.0, decay: 2.4, mix: 0.22 },
      filter: 3600,
      drive: 0.04,
      transient: 'brush'
    }
  },
  {
    id: 'wankel', code: true,
    name: { en: 'Rotary', fr: 'Moteur Wankel' },
    blurb: {
      en: 'Pure blue on a blueprint, a rotor turning in its housing, apex seals catching the light.',
      fr: 'Bleu pur sur un plan d’ingénieur, un rotor qui tourne dans son carter, des segments d’apex qui accrochent la lumière.'
    },
    swatch: ['#00003d', '#0000ff', '#ccd2ff'],
    backdrop: { renderer: 'wankel', speed: 0.0008 },
    motion: { scale: 0.8, ease: 'cubic-bezier(0.2, 0.9, 0.25, 1)', pop: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
    sound: {
      voice: 'synthwave',
      gain: 0.58,
      root: 233.08,
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 1.4, decay: 2.8, mix: 0.18 },
      filter: 4200,
      drive: 0.16,
      transient: 'brap'
    }
  },
  {
    id: 'elden', code: true,
    name: { en: 'Erdtree', fr: 'Arbre-Monde' },
    blurb: {
      en: 'Ash and crimson under a golden tree, leaves of light falling, a bell somewhere far off.',
      fr: 'Cendre et cramoisi sous un arbre doré, des feuilles de lumière qui tombent, une cloche quelque part au loin.'
    },
    swatch: ['#120c0b', '#c8102e', '#e8b84a'],
    backdrop: { renderer: 'elden', speed: 0.00012 },
    motion: { scale: 1.15, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.3, 1.3, 0.5, 1)' },
    sound: {
      voice: 'fm',
      gain: 0.6,
      root: 146.83,
      scale: [0, 3, 5, 7, 10],
      reverb: { seconds: 4.4, decay: 2.4, mix: 0.4 },
      filter: 3200,
      drive: 0.06,
      transient: 'toll'
    }
  },
  {
    id: 'hellfire', code: true,
    name: { en: 'Hellfire', fr: 'Feu de l’enfer' },
    blurb: {
      en: 'The Creator’s own. Salmon on black, embers in the dark, lava in the cracks, and lightning when the breakdown hits.',
      fr: 'Celui du Créateur. Saumon sur noir, des braises dans l’obscurité, et la foudre quand le breakdown tombe.'
    },
    swatch: ['#0c0606', '#fa8072', '#ffe4de'],
    backdrop: { renderer: 'hellfire', speed: 0.00016 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'keys',
      gain: 0.7,
      root: 110,
      scale: [0, 2, 3, 5, 7, 8, 10],
      reverb: { seconds: 3.4, decay: 3.2, mix: 0.3 },
      filter: 2600,
      drive: 0.22,
      transient: 'knock'
    }
  },
  {
    id: 'apotheosis', code: true,
    name: { en: 'Apotheosis', fr: 'Apothéose' },
    blurb: {
      en: 'Gold on black, leaf and lamplight. The one nobody else is wearing.',
      fr: 'De l’or sur du noir, feuille et lumière de lampe. Celui que personne d’autre ne porte.'
    },
    swatch: ['#0b0805', '#fbbf24', '#fff7d6'],
    backdrop: { renderer: 'apotheosis', speed: 0.00016 },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: {
      voice: 'bells',
      gain: 0.7,
      root: 261.63,
      scale: [0, 4, 7, 11, 14],
      reverb: { seconds: 3.2, decay: 2.4, mix: 0.34 },
      filter: 5200,
      drive: 0.04,
      transient: 'chime'
    }
  },

  {
    id: 'folio', supporter: true,
    name: { en: 'Folio', fr: 'Folio' },
    blurb: {
      en: 'A library after closing: midnight blue, cream paper, pages turning in the dark.',
      fr: 'Une bibliothèque après la fermeture : bleu de minuit, papier crème, des pages qui tournent dans le noir.'
    },
    swatch: ['#0c1428', '#f3e7c9', '#9fb6d9'],
    backdrop: { renderer: 'season', sky: ['#070d1c', '#0c1428', '#0a1122'], particle: 'leaf', count: 34, speed: 0.55, glow: 'rgba(243, 231, 201, 0.10)' },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
    sound: { voice: 'fm', gain: 0.62, root: 293.66, scale: [0, 3, 7, 10, 14], reverb: { seconds: 3.4, decay: 2.6, mix: 0.34 }, filter: 5000, drive: 0.06, transient: 'air' }
  },
  {
    id: 'gilded', supporter: true,
    name: { en: 'Gilded Edge', fr: 'Tranche dorée' },
    blurb: {
      en: 'Black marble and gold leaf, with flecks of gold rising like dust in lamplight.',
      fr: 'Du marbre noir et de la feuille d’or, des paillettes dorées qui montent comme une poussière dans la lumière.'
    },
    swatch: ['#0d0b0a', '#e9c46a', '#fff1c1'],
    backdrop: { renderer: 'season', sky: ['#050404', '#0d0b0a', '#14100b'], particle: 'ember', count: 70, speed: 0.6, glow: 'rgba(233, 196, 106, 0.14)' },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: { voice: 'bells', gain: 0.66, root: 246.94, scale: [0, 4, 7, 11, 14], reverb: { seconds: 3.6, decay: 2.8, mix: 0.36 }, filter: 5400, drive: 0.04, transient: 'chime' }
  },

  {
    id: 'frost', season: 'frost',
    name: { en: 'Frost', fr: 'Givre' },
    blurb: { en: 'Ice blue on a polar night, snow that never quite lands, glass bells.', fr: 'Bleu glace sur une nuit polaire, une neige qui ne se pose jamais tout à fait, cloches de verre.' },
    swatch: ['#071426', '#bfe9ff', '#7dd3fc'],
    backdrop: { renderer: 'season', sky: ['#04101f', '#0a1a2e', '#071426'], particle: 'snow', count: 90, speed: 1, glow: 'rgba(191, 233, 255, 0.12)' },
    motion: { scale: 1.1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: { voice: 'fm', gain: 0.6, root: 329.63, scale: [0, 2, 4, 7, 9], reverb: { seconds: 3.6, decay: 2.8, mix: 0.36 }, filter: 5600, drive: 0.1, transient: 'air' }
  },
  {
    id: 'hearts', season: 'hearts',
    name: { en: 'Hearts', fr: 'Cœurs' },
    blurb: { en: 'Rose on wine, hearts drifting up like confetti, a warm piano.', fr: 'Rose sur lie-de-vin, des cœurs qui montent comme des confettis, un piano chaud.' },
    swatch: ['#2a0a16', '#fb7185', '#fda4af'],
    backdrop: { renderer: 'season', sky: ['#1a0610', '#2a0a16', '#180810'], particle: 'heart', count: 40, speed: 0.8, glow: 'rgba(251, 113, 133, 0.14)' },
    motion: { scale: 1.05, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.4, 0.6, 1)' },
    sound: { voice: 'keys', gain: 0.7, root: 293.66, scale: [0, 2, 4, 7, 9], reverb: { seconds: 2.4, decay: 2.6, mix: 0.28 }, filter: 3600, drive: 0, transient: 'brush' }
  },
  {
    id: 'thaw', season: 'thaw',
    name: { en: 'Thaw', fr: 'Dégel' },
    blurb: { en: 'Spring green on deep water, petals on the wind, wooden notes.', fr: 'Vert printemps sur eau profonde, des pétales au vent, notes de bois.' },
    swatch: ['#07211a', '#86efac', '#5eead4'],
    backdrop: { renderer: 'season', sky: ['#04150f', '#07211a', '#061a14'], particle: 'petal', count: 50, speed: 0.9, glow: 'rgba(134, 239, 172, 0.12)' },
    motion: { scale: 1.1, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.4, 0.6, 1)' },
    sound: { voice: 'marimba', gain: 0.66, root: 349.23, scale: [0, 2, 4, 7, 9], reverb: { seconds: 1.4, decay: 3, mix: 0.16 }, filter: 3400, drive: 0, transient: 'knock' }
  },
  {
    id: 'fools', season: 'fools',
    name: { en: 'Fools and Eggs', fr: 'Poissons et œufs' },
    blurb: { en: 'Yellow on purple, bubbles everywhere, a chip tune that cannot keep a straight face.', fr: 'Jaune sur violet, des bulles partout, un son de puce qui ne garde pas son sérieux.' },
    swatch: ['#1d1040', '#fde047', '#c4b5fd'],
    backdrop: { renderer: 'season', sky: ['#130a2c', '#1d1040', '#150c30'], particle: 'bubble', count: 36, speed: 1.1, glow: 'rgba(253, 224, 71, 0.1)' },
    motion: { scale: 1.3, ease: 'cubic-bezier(0.3, 1.6, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.8, 0.5, 1)' },
    sound: { voice: 'chip', gain: 0.5, root: 392, scale: [0, 2, 4, 5, 7, 9, 11], reverb: { seconds: 0.6, decay: 2, mix: 0.06 }, filter: 6000, drive: 0.1, transient: 'air' }
  },
  {
    id: 'bloom', season: 'bloom',
    name: { en: 'Bloom', fr: 'Floraison' },
    blurb: { en: 'Pink and leaf green, a garden at dusk, petals falling, felt keys.', fr: 'Rose et vert feuille, un jardin au crépuscule, des pétales qui tombent, touches feutrées.' },
    swatch: ['#132412', '#f9a8d4', '#a3e635'],
    backdrop: { renderer: 'season', sky: ['#0d1a0c', '#152012', '#0f1a0e'], particle: 'petal', count: 60, speed: 0.7, glow: 'rgba(249, 168, 212, 0.13)' },
    motion: { scale: 1.1, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.4, 0.6, 1)' },
    sound: { voice: 'keys', gain: 0.7, root: 329.63, scale: [0, 2, 4, 7, 9], reverb: { seconds: 2, decay: 2.8, mix: 0.24 }, filter: 3800, drive: 0, transient: 'brush' }
  },
  {
    id: 'solstice', season: 'solstice',
    name: { en: 'Solstice', fr: 'Solstice' },
    blurb: { en: 'Gold on deep sea, sparks off the water, bright bells.', fr: 'Or sur mer profonde, des étincelles sur l’eau, cloches claires.' },
    swatch: ['#06232e', '#fbbf24', '#22d3ee'],
    backdrop: { renderer: 'season', sky: ['#031820', '#06232e', '#041b25'], particle: 'spark', count: 70, speed: 1.2, glow: 'rgba(251, 191, 36, 0.16)' },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: { voice: 'fm', gain: 0.6, root: 392, scale: [0, 2, 4, 7, 9], reverb: { seconds: 2.6, decay: 2.4, mix: 0.3 }, filter: 6200, drive: 0.1, transient: 'air' }
  },
  {
    id: 'voyage', season: 'voyage',
    name: { en: 'Voyage', fr: 'Grand voyage' },
    blurb: { en: 'Orange on navy, carved capitals, bubbles rising through deep water.', fr: 'Orange sur marine, capitales gravées, des bulles qui montent en eau profonde.' },
    swatch: ['#0c1a3f', '#fb923c', '#93c5fd'],
    backdrop: { renderer: 'season', sky: ['#07112b', '#0c1a3f', '#091530'], particle: 'bubble', count: 44, speed: 1, glow: 'rgba(251, 146, 60, 0.12)' },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: { voice: 'synthwave', gain: 0.6, root: 261.63, scale: [0, 3, 5, 7, 10], reverb: { seconds: 2.4, decay: 2.2, mix: 0.3 }, filter: 4600, drive: 0.12, transient: 'air' }
  },
  {
    id: 'harvest', season: 'harvest',
    name: { en: 'Harvest', fr: 'Moisson' },
    blurb: { en: 'Amber on oak, leaves turning in the air, a serif, wooden notes.', fr: 'Ambre sur chêne, des feuilles qui tournent dans l’air, un empattement, notes de bois.' },
    swatch: ['#1f1108', '#f59e0b', '#fde68a'],
    backdrop: { renderer: 'season', sky: ['#160c05', '#1f1108', '#180d06'], particle: 'leaf', count: 46, speed: 0.9, glow: 'rgba(245, 158, 11, 0.14)' },
    motion: { scale: 0.9, ease: 'cubic-bezier(0.2, 0.9, 0.3, 1)', pop: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
    sound: { voice: 'marimba', gain: 0.66, root: 261.63, scale: [0, 2, 4, 7, 9], reverb: { seconds: 1.2, decay: 3.4, mix: 0.12 }, filter: 3000, drive: 0, transient: 'knock' }
  },
  {
    id: 'hallows', season: 'hallows',
    name: { en: 'Hallows', fr: 'Sabbat' },
    blurb: { en: 'Pumpkin on midnight purple, embers in the dark, bells from the wrong end of the corridor.', fr: 'Citrouille sur violet de minuit, des braises dans le noir, des cloches venues du mauvais bout du couloir.' },
    swatch: ['#160a2a', '#fb923c', '#c084fc'],
    backdrop: { renderer: 'season', sky: ['#0b0518', '#160a2a', '#0e061c'], particle: 'ember', count: 50, speed: 0.8, glow: 'rgba(251, 146, 60, 0.12)' },
    motion: { scale: 1.2, ease: 'cubic-bezier(0.3, 0, 0.2, 1)', pop: 'cubic-bezier(0.25, 1.1, 0.4, 1)' },
    sound: { voice: 'fm', gain: 0.6, root: 174.61, scale: [0, 1, 3, 6, 8], reverb: { seconds: 4, decay: 3.4, mix: 0.4 }, filter: 3000, drive: 0.2, transient: 'air' }
  },
  {
    id: 'ember', season: 'ember',
    name: { en: 'Ember', fr: 'Braise' },
    blurb: { en: 'Copper on charcoal, sparks rising from a fire you cannot see, a low piano.', fr: 'Cuivre sur charbon, des étincelles qui montent d’un feu qu’on ne voit pas, un piano grave.' },
    swatch: ['#120e0c', '#f97316', '#fdba74'],
    backdrop: { renderer: 'season', sky: ['#0b0807', '#120e0c', '#0d0908'], particle: 'ember', count: 60, speed: 1, glow: 'rgba(249, 115, 22, 0.16)' },
    motion: { scale: 1, ease: 'cubic-bezier(0.22, 1, 0.36, 1)', pop: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    sound: { voice: 'keys', gain: 0.7, root: 196, scale: [0, 2, 3, 5, 7, 8, 10], reverb: { seconds: 3, decay: 3, mix: 0.3 }, filter: 2800, drive: 0.1, transient: 'knock' }
  },
  {
    id: 'yule', season: 'yule',
    name: { en: 'Yule', fr: 'Noël' },
    blurb: { en: 'Red and pine, snow in the lamplight, bells that sound like December.', fr: 'Rouge et sapin, de la neige dans la lumière des lampes, des cloches qui sonnent comme décembre.' },
    swatch: ['#08231a', '#f87171', '#86efac'],
    backdrop: { renderer: 'season', sky: ['#04170f', '#08231a', '#061c14'], particle: 'snow', count: 100, speed: 0.8, glow: 'rgba(248, 113, 113, 0.14)' },
    motion: { scale: 1.1, ease: 'cubic-bezier(0.25, 1, 0.5, 1)', pop: 'cubic-bezier(0.3, 1.4, 0.6, 1)' },
    sound: { voice: 'fm', gain: 0.6, root: 349.23, scale: [0, 2, 4, 7, 9], reverb: { seconds: 3.4, decay: 2.8, mix: 0.36 }, filter: 6000, drive: 0.1, transient: 'air' }
  }
];

export const DEFAULT_THEME = 'aurora';

export const themeById = (id) => THEMES.find((theme) => theme.id === id) ?? THEMES[0];

const painted = new WeakMap();

export function paintTheme(node, look) {
  const held = painted.get(node);
  if (held) for (const name of held) node.style.removeProperty(name);
  painted.delete(node);
  const early = node.dataset.earlyVars;
  if (early) for (const name of early.split(' ')) node.style.removeProperty(name);
  delete node.dataset.earlyVars;
  delete node.dataset.custom;
  if (!look) { delete node.dataset.theme; return null; }
  const vars = look.vars ?? {};
  node.dataset.theme = look.shape ?? look.id;
  if (look.vars) node.dataset.custom = '1';
  for (const [name, value] of Object.entries(vars)) node.style.setProperty(name, value);
  painted.set(node, Object.keys(vars));
  return look;
}

export function applyTheme(id, composed = null) {
  const theme = themeById(composed ? composed.shape : id);
  const root = document.documentElement;
  paintTheme(root, composed ?? { id: theme.id });
  const motion = composed?.motion ?? theme.motion;
  root.style.setProperty('--motion-scale', String(motion.scale));
  root.style.setProperty('--ease', motion.ease);
  root.style.setProperty('--ease-pop', motion.pop);
  return composed ?? theme;
}
