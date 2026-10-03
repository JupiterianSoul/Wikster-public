import { iconSvg } from '../data/icons.js';
import { t } from '../i18n.js';

export function chatBubble({ own = false, body = '', when = '', status = null, who = null, kind = '' }) {
  const bubble = document.createElement('div');
  bubble.className = `bubble${own ? ' is-mine' : ''}${status === 'read' ? ' is-read' : ''}${kind ? ` ${kind}` : ''}`;
  if (who) bubble.appendChild(who);
  const text = document.createElement('span');
  text.className = 'bubble-text';
  text.textContent = body;
  const meta = document.createElement('span');
  meta.className = 'bubble-meta';
  const time = document.createElement('span');
  time.className = 'bubble-when';
  time.textContent = when;
  meta.appendChild(time);
  if (status === 'read' || status === 'sent') {
    const ticks = document.createElement('span');
    ticks.className = 'bubble-ticks';
    ticks.innerHTML = iconSvg(status === 'read' ? 'checks' : 'check', { size: 13 });
    const label = t(status === 'read' ? 'chatSeen' : 'chatSent');
    ticks.title = label;
    ticks.setAttribute('role', 'img');
    ticks.setAttribute('aria-label', label);
    meta.appendChild(ticks);
  }
  bubble.append(text, meta);
  return { bubble, meta, time };
}
