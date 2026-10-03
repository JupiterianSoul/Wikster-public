import { t, tx } from '../i18n.js';
import { iconSvg } from '../data/icons.js';
import { press } from '../ui/components.js';
import { synth } from '../ui/sound.js';
import { openSheet, showScreen } from './core.js';
import { live } from './live.js';

export const SEEN_KEY = 'wikster.seenRelease.v1';
const AT_MOST = 3;

const releases = () => import('../data/releases.js').then((m) => m.RELEASES);
const seenId = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const markSeen = (all) => { try { localStorage.setItem(SEEN_KEY, all.at(-1).id); } catch {} };

function unseenIn(all) {
  const seen = seenId();
  const at = seen ? all.findIndex((r) => r.id === seen) : -1;
  const from = at >= 0 ? at + 1 : all.length - 1;
  return all.slice(from).reverse().slice(0, AT_MOST);
}

export async function checkWhatsNew({ fresh = false } = {}) {
  const all = await releases();
  if (fresh || !seenId()) { markSeen(all); return false; }
  const list = unseenIn(all);
  if (!list.length) return false;
  let tries = 0;
  const attempt = () => {
    if (live.sheet?.open || document.querySelector('.reveal, .tour, .welcome:not([hidden])')) {
      if (tries++ < 120) setTimeout(attempt, 500);
      return;
    }
    openWhatsNew(list);
  };
  setTimeout(attempt, 1400);
  return true;
}

export async function openWhatsNew(list = null) {
  const all = await releases();
  list ??= unseenIn(all);
  markSeen(all);
  openSheet(t('whatsNewTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'whatsnew';
    const lead = document.createElement('p');
    lead.className = 'whatsnew-lead';
    lead.textContent = t(list.length === 1 ? 'whatsNewLeadOne' : 'whatsNewLead', { n: list.length });
    wrap.appendChild(lead);
    for (const release of list) {
      const item = document.createElement('div');
      item.className = 'whatsnew-item';
      item.style.setProperty('--tl', release.accent);
      item.innerHTML = `<h4><span class="whatsnew-node">${iconSvg(release.icon, { size: 14 })}</span><span></span></h4><ul></ul>`;
      item.querySelector('h4 span:last-child').textContent = tx(release.title);
      item.querySelector('ul').replaceChildren(...release.points.map((point) => {
        const li = document.createElement('li');
        li.textContent = tx(point);
        return li;
      }));
      wrap.appendChild(item);
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-primary btn-block';
    go.textContent = t('whatsNewNotes');
    press(go, { sound: null });
    go.addEventListener('click', () => {
      synth.playTap();
      live.sheet.hide();
      import('./updates.js').then((m) => { showScreen('updates'); m.renderUpdates(); });
    });
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'btn btn-ghost btn-block';
    later.textContent = t('whatsNewClose');
    press(later, { sound: null });
    later.addEventListener('click', () => live.sheet.hide());
    wrap.append(go, later);
    body.appendChild(wrap);
  });
}
