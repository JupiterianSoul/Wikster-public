const s = (id, n, en, fr, noteEn, noteFr) => ({ id, n, name: { en, fr }, note: { en: noteEn, fr: noteFr } });

export const BOOSTER_LOOKS = [
  s('foilarch', 1, 'Foil Arch', 'Arche de foil', 'Crimped foil, an arched window and fine brushed lines.', 'Un foil serti, une fenêtre en arche et de fines lignes brossées.'),
  s('kraft', 2, 'Kraft Window', 'Fenêtre kraft', 'Card stock with a die-cut porthole, a twine band and a stamp.', 'Du carton brut, un hublot découpé, une ficelle et un tampon.'),
  s('deco', 3, 'Art Deco', 'Art déco', 'Gold sunburst on black lacquer and a diamond medallion.', 'Un soleil doré sur laque noire et un médaillon en losange.'),
  s('holoprism', 4, 'Holo Prism', 'Prisme holo', 'Rainbow foil over the whole pack, slowly shifting.', 'Un foil arc-en-ciel sur tout le paquet, qui dérive lentement.'),
  s('volume', 5, 'Encyclopedia', 'Encyclopédie', 'A leather-bound volume with gilt bands and a raised spine.', 'Un volume relié cuir, filets dorés et dos à nerfs.'),
  s('cartridge', 6, '8-Bit Cartridge', 'Cartouche 8 bits', 'Notched pixel corners, scanlines and arcade type.', 'Des coins en pixels, des lignes de balayage et une police d’arcade.'),
  s('blueprint', 7, 'Blueprint', 'Plan technique', 'A drafting grid, a construction circle and a title block.', 'Une grille de dessin, un cercle de construction et un cartouche.'),
  s('seedpacket', 8, 'Seed Packet', 'Sachet de graines', 'Cream paper, a ribbon banner and a halftone oval.', 'Du papier crème, un ruban et un ovale en trame.'),
  s('neon', 9, 'Neon Sign', 'Enseigne néon', 'A glowing tube frame that flickers now and then.', 'Un cadre en tube lumineux qui grésille de temps en temps.'),
  s('swiss', 10, 'Swiss Poster', 'Affiche suisse', 'Flat color blocks, a big card count and strict type.', 'Des aplats de couleur, un grand chiffre et une typo stricte.'),
  s('stainedglass', 11, 'Stained Glass', 'Vitrail', 'An arched window of leaded panes around a lit medallion.', 'Un vitrail en arche autour d’un médaillon éclairé.'),
  s('crystal', 12, 'Crystal Facet', 'Cristal taillé', 'A cut-gem shape with faceted light that twinkles.', 'Une silhouette de gemme taillée qui scintille.'),
  s('topo', 13, 'Topographic', 'Topographie', 'Contour lines, a compass star and map coordinates.', 'Des courbes de niveau, une rose des vents et des coordonnées.'),
  s('comic', 14, 'Comic Burst', 'Bulle de BD', 'Halftone dots, an action starburst and outlined lettering.', 'Des points de trame, une explosion et un lettrage cerné.'),
  s('matte', 15, 'Matte Luxe', 'Mat luxe', 'A soft-touch dark finish, a debossed ring and a tear line.', 'Une finition mate, un anneau embossé et une ligne à déchirer.'),
  s('stamp', 16, 'Postage Stamp', 'Timbre-poste', 'Perforated edges, an engraved vignette and a postmark.', 'Des bords dentelés, une vignette gravée et un cachet.'),
  s('circuit', 17, 'Circuit Board', 'Circuit imprimé', 'Gold traces, a chip in the middle and blinking LEDs.', 'Des pistes dorées, une puce au centre et des diodes qui clignotent.'),
  s('letter', 18, 'Sealed Letter', 'Lettre scellée', 'An air-mail envelope with the emblem pressed in wax.', 'Une enveloppe par avion, l’emblème pressé dans la cire.'),
  s('aurora', 19, 'Aurora Glass', 'Verre aurore', 'Frosted glass over slow drifting colored light.', 'Du verre dépoli sur une lumière colorée qui dérive.'),
  s('tarot', 20, 'Tarot', 'Tarot', 'A night-sky card with a star border and a turning ray ring.', 'Une lame de nuit étoilée avec un anneau de rayons qui tourne.')
];

export const OPENINGS = [
  s('tearstrip', 1, 'Tear Strip', 'Languette', 'The strip rips off the top and the cards rise out.', 'La languette s’arrache et les cartes montent du paquet.'),
  s('zipper', 2, 'Zipper', 'Fermeture éclair', 'A zipper runs down the pack and the halves swing open.', 'Une fermeture éclair descend et les deux moitiés s’ouvrent.'),
  s('blade', 3, 'Blade Slice', 'Coup de lame', 'A light blade cuts the pack and the halves slide apart.', 'Une lame de lumière coupe le paquet en deux.'),
  s('shatter', 4, 'Shatter', 'Éclats', 'The pack cracks into shards that fly out.', 'Le paquet se brise en éclats qui s’envolent.'),
  s('burstfan', 5, 'Burst Fan', 'Explosion', 'Energy builds, the pack bursts and the cards arc out.', 'L’énergie monte, le paquet explose et les cartes jaillissent.'),
  s('unfold', 6, 'Unfold', 'Dépliage', 'The pack opens along its middle like folded paper.', 'Le paquet s’ouvre par le milieu comme un papier plié.'),
  s('vortex', 7, 'Vortex', 'Vortex', 'The pack spins into a swirl and the cards spiral out.', 'Le paquet tourne dans un tourbillon d’où les cartes sortent en spirale.'),
  s('deal', 8, 'Deal', 'Donne', 'The pack turns into a deck and the cards are dealt.', 'Le paquet devient un paquet de cartes qui se distribue.'),
  s('pour', 9, 'Pour', 'Déversement', 'The pack tips over and the cards tumble out.', 'Le paquet bascule et les cartes dégringolent.'),
  s('riseglint', 10, 'Rise and Glint', 'Envol et reflet', 'The cards rise as a stack, then slide into place.', 'Les cartes montent en pile puis glissent à leur place.'),
  s('reels', 11, 'Slot Reels', 'Rouleaux', 'Five reels spin and stop one by one on the cards.', 'Des rouleaux tournent et s’arrêtent un à un sur les cartes.'),
  s('portal', 12, 'Portal', 'Portail', 'The pack falls through a blue portal and the cards drop out of an orange one.', 'Le paquet tombe dans un portail bleu et les cartes ressortent d’un portail orange.'),
  s('peel', 13, 'Peel', 'Pelage', 'The front of the pack peels away from the corner.', 'La face du paquet se décolle depuis le coin.'),
  s('pop', 14, 'Pop', 'Pop', 'The pack inflates, wobbles and pops into confetti.', 'Le paquet gonfle, tremble et éclate en confettis.'),
  s('beam', 15, 'Beam', 'Rayon', 'A beam of light pulls the pack up and sends the cards down.', 'Un rayon aspire le paquet et renvoie les cartes.'),
  s('dissolve', 16, 'Dissolve', 'Dissolution', 'The pack breaks into drifting particles.', 'Le paquet se défait en particules qui s’envolent.'),
  s('thunder', 17, 'Thunderstrike', 'Coup de foudre', 'The room darkens and lightning splits the pack in two.', 'La pièce s’assombrit et la foudre fend le paquet.'),
  s('flap', 18, 'Envelope Flap', 'Rabat', 'The seal pops, the top of the pack folds back like a flap and the cards slide out.', 'Le sceau saute, le haut du paquet se rabat et les cartes glissent dehors.'),
  s('stackspread', 19, 'Stack Spread', 'Éventail', 'The cards shoot out as a stack and spread sideways.', 'Les cartes jaillissent en pile puis s’étalent.'),
  s('suspense', 20, 'Suspense', 'Suspense', 'The room dims, the pack pulses, then a flash.', 'La pièce s’assombrit, le paquet palpite, puis un éclair.')
];

export const lookById = (id) => BOOSTER_LOOKS.find((l) => l.id === id) ?? null;
export const openingById = (id) => OPENINGS.find((o) => o.id === id) ?? null;
