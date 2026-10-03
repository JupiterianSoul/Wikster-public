import { t } from '../i18n.js';
import { DEFAULT_FX } from '../data/fx.js';
import { CARD_FRONT_MARKUP, applyRarityVars, fillFront } from './open.js';

const SAMPLE_ART = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="440" height="330" viewBox="0 0 440 330">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#dbe4ee"/><stop offset="0.62" stop-color="#9fb0c4"/></linearGradient>
<linearGradient id="l" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#6b7c92"/><stop offset="1" stop-color="#37455a"/></linearGradient></defs>
<rect width="440" height="330" fill="url(#s)"/>
<circle cx="330" cy="86" r="34" fill="#f2f6fb" opacity="0.9"/>
<path d="M0 214 L96 132 L168 196 L242 122 L330 214 Z" fill="#8494a9"/>
<path d="M0 330 L0 206 L118 150 L226 214 L318 158 L440 226 L440 330 Z" fill="url(#l)"/>
<path d="M0 330 L0 268 L140 236 L280 288 L440 250 L440 330 Z" fill="#25313f"/>
</svg>`)}`;

function sampleArticle() {
  return {
    key: 'sample',
    title: t('fxSampleTitle'),
    description: t('fxSampleDesc'),
    extract: t('fxSampleExtract'),
    thumbnail: SAMPLE_ART,
    price: 1240,
    views: 86000,
    packIcon: 'packs'
  };
}

const watcher = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) target.classList.toggle('is-lit', isIntersecting);
  }, { threshold: 0.02 })
  : null;

export function fxSampleCard(rarity, fxId) {
  const card = document.createElement('article');
  card.className = 'card fx-sample is-revealed';
  applyRarityVars(card, rarity);
  if (fxId && fxId !== DEFAULT_FX) card.dataset.fx = fxId;
  else delete card.dataset.fx;
  card.innerHTML = `<div class="card-inner"><div class="card-face card-front">${CARD_FRONT_MARKUP}</div></div>`;
  fillFront(card.querySelector('.card-front'), sampleArticle(), rarity);
  if (watcher) watcher.observe(card);
  else card.classList.add('is-lit');
  return card;
}
