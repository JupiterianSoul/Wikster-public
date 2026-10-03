import { buildPackElement } from '../packview.js';
import { loadOpenFx } from './open.js';
import { t, tx } from '../i18n.js';

const SAMPLE = { kind: 'theme', themeId: 'animals', rarityId: null, cards: 5 };
const TIERS = ['#9aa3b5', '#34d399', '#3b82f6', '#a855f7', '#f0b43c'];

export function samplePack(look, size = '') {
  return buildPackElement(SAMPLE, { size, look });
}

function miniCard(color, legendary) {
  const c = document.createElement('div');
  c.className = `ofx-oc${legendary ? ' is-leg' : ''}`;
  c.style.setProperty('--r', color);
  c.innerHTML = '<span class="ofx-oc-rays"></span><span class="ofx-oc-in"><span class="ofx-oc-f"><i></i></span><span class="ofx-oc-b"></span></span>';
  return c;
}

export function openingPreview(id, { hold = null } = {}) {
  const box = document.createElement('div');
  box.className = 'ofx-stage';
  box.setAttribute('role', 'button');
  box.setAttribute('tabindex', '0');
  const hint = document.createElement('span');
  hint.className = 'ofx-stage-hint';
  hint.textContent = t('openingPreviewPlay');
  let running = false;

  const rest = () => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return null;
    box.replaceChildren();
    const packW = Math.min(w * 0.24, (h * 0.68) / 1.79);
    const pack = samplePack(undefined);
    pack.style.setProperty('--pack-w', `${packW}px`);
    pack.style.setProperty('--pack-h', `${packW * 1.79}px`);
    pack.style.width = `${packW}px`;
    pack.style.height = `${packW * 1.79}px`;
    const holder = document.createElement('div');
    holder.className = 'ofx-rest';
    holder.appendChild(pack);
    box.append(holder, hint);
    return { w, h, packW, pack };
  };

  const play = async () => {
    if (running) return;
    const r = rest();
    if (!r) return;
    running = true;
    box.classList.add('is-running');
    const { w, h, packW, pack } = r;
    box.querySelector('.ofx-rest')?.remove();
    const u = packW / 24;
    const cw = Math.min(13 * u, (w - 6 * 2.4 * u) / 5);
    const ch = cw * 1.4;
    const cards = TIERS.map((color, i) => {
      const c = miniCard(color, i === 4);
      c.style.width = `${cw}px`;
      c.style.height = `${ch}px`;
      c.style.fontSize = `${cw / 13}px`;
      return c;
    });
    const gap = cw + 2.4 * u;
    const targets = cards.map((_, i) => ({ x: ((i - 2) * gap) / u, y: 2 }));
    const root = document.createElement('div');
    root.className = 'ofx-preview-root';
    box.appendChild(root);
    const { playOpening } = await loadOpenFx();
    await playOpening(id, { root, center: { x: w / 2, y: h / 2 }, pack, packW, packH: packW * 1.79, cards, targets, hold: hold ? hold() : null });
    for (const c of cards) {
      c.classList.add('is-up');
      await new Promise((res) => setTimeout(res, 170));
    }
    await new Promise((res) => setTimeout(res, 600));
    running = false;
    box.classList.remove('is-running');
    hint.textContent = t('openingPreviewAgain');
  };

  box.addEventListener('click', play);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  const seen = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !running && !box.querySelector('.ofx-rest')) rest();
  });
  seen.observe(box);
  return box;
}

export function lookTile(look, { button }) {
  const card = document.createElement('div');
  card.className = 'look-tile atelier-tile';
  card.dataset.look = look ? look.id : 'classic';
  const stage = document.createElement('div');
  stage.className = 'look-stage';
  const pack = samplePack(look ? look.id : null, 'is-small');
  stage.appendChild(pack);
  liveLook(stage, pack);
  const name = document.createElement('h4');
  name.textContent = look ? tx(look.name) : t('lookClassic');
  const note = document.createElement('p');
  note.textContent = look ? tx(look.note) : t('lookClassicNote');
  card.append(stage, name, note, button);
  return card;
}

const liveWatch = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) target.firstElementChild?.classList.toggle('is-live', isIntersecting);
  }, { threshold: 0.2 })
  : null;

function liveLook(stage, pack) {
  if (liveWatch) liveWatch.observe(stage);
  else pack.classList.add('is-live');
  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const r = stage.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width - 0.5;
    const y = (event.clientY - r.top) / r.height - 0.5;
    pack.style.transform = `perspective(500px) rotateY(${(x * 18).toFixed(1)}deg) rotateX(${(-y * 14).toFixed(1)}deg)`;
  });
  stage.addEventListener('pointerleave', () => { pack.style.transform = ''; });
}

export function openingTile(opening, { button }) {
  const card = document.createElement('div');
  card.className = 'opening-tile atelier-tile';
  card.dataset.opening = opening ? opening.id : 'classic';
  const name = document.createElement('h4');
  name.textContent = opening ? tx(opening.name) : t('openingClassic');
  const note = document.createElement('p');
  note.textContent = opening ? tx(opening.note) : t('openingClassicNote');
  card.append(opening ? openingPreview(opening.id) : classicPreview(), name, note, button);
  return card;
}


function classicPreview() {
  const box = document.createElement('div');
  box.className = 'ofx-stage is-still';
  const holder = document.createElement('div');
  holder.className = 'ofx-rest';
  const pack = samplePack(undefined, 'is-small');
  holder.appendChild(pack);
  box.appendChild(holder);
  return box;
}
