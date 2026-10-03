import { t } from '../i18n.js';
import { MUSIC, SOFTWARE, WIKIPEDIA_LICENCE, cardCredit } from '../credits.js';
import { BUILD, SITE_URL } from '../version.js';
import { openSheet } from './core.js';
import { settingsRowButton, settingsRowShell } from './settings.js';

const link = (href, text) => {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
};

const para = (...parts) => {
  const p = document.createElement('p');
  for (const part of parts) p.append(part);
  return p;
};

const heading = (text) => {
  const h = document.createElement('h4');
  h.className = 'credits-head';
  h.textContent = text;
  return h;
};

export const pageUrl = (name) => `${SITE_URL}${name}.html`;

export function openPage(name, title) {
  openSheet(title, (body) => {
    const frame = document.createElement('iframe');
    frame.className = 'page-frame';
    frame.src = `${name}.html`;
    frame.title = title;
    frame.loading = 'lazy';
    const out = para(link(pageUrl(name), t('aboutInBrowser')));
    out.className = 'page-frame-link';
    body.append(frame, out);
  }, { overGate: !document.getElementById('gate')?.hidden });
}

export function openCredits() {
  openSheet(t('creditsTitle'), (body) => {
    const wrap = document.createElement('div');
    wrap.className = 'credits';
    const music = document.createElement('ul');
    music.className = 'credits-list';
    for (const track of MUSIC) {
      const li = document.createElement('li');
      li.append(link(track.url, track.file));
      music.appendChild(li);
    }
    const software = document.createElement('ul');
    software.className = 'credits-list';
    for (const item of SOFTWARE) {
      const li = document.createElement('li');
      li.append(link(item.url, item.name), ` (${item.licence})`);
      software.appendChild(li);
    }
    wrap.append(
      heading(t('creditsCards')),
      para(t('creditsCardsText'), ' ', link(WIKIPEDIA_LICENCE.url, WIKIPEDIA_LICENCE.name), '.'),
      para(t('creditsImages')),
      para(t('creditsCustom')),
      para(t('creditsPictures'), ' ', link('https://openverse.org', 'Openverse'), '.'),
      para(t('creditsToday')),
      heading(t('creditsQuiz')),
      para(t('creditsQuizText')),
      heading(t('creditsMusic')),
      para(t('creditsMusicText'), ' ', link('https://freesound.org/people/migfus20/', 'migfus20'), ' (Freesound).'),
      music,
      heading(t('creditsSounds')),
      para(t('creditsSoundsText'), ' ', link('https://www.npmjs.com/package/uisfx', 'uisfx'), ' (CC0 1.0).'),
      heading(t('creditsFont')),
      para(t('creditsFontText'), ' ', link('https://openfontlicense.org', 'SIL Open Font License 1.1'), '.'),
      heading(t('creditsSoftware')),
      software,
      heading(t('creditsAffiliation')),
      para(t('creditsAffiliationText'))
    );
    body.appendChild(wrap);
  });
}

export function creditLine(card) {
  const credit = cardCredit(card);
  if (!credit) return pictureLine(card?.picture);
  const line = document.createElement('p');
  line.className = 'card-credit';
  line.append(t('creditText'), ' ', link(credit.article, credit.source ?? t('creditSource')));
  if (credit.licence) line.append(', ', link(credit.licence.url, credit.licence.name));
  const picture = pictureLine(card?.picture);
  if (credit.image && !picture) line.append(' · ', link(credit.image, t('creditImage')));
  if (!picture) return line;
  const both = document.createDocumentFragment();
  both.append(line, picture);
  return both;
}

export function pictureLine(picture) {
  if (!picture || !picture.source || picture.source === 'text') return null;
  const line = document.createElement('p');
  line.className = 'card-credit card-credit-picture';
  const safe = (url) => (/^https:\/\//.test(String(url ?? '')) ? url : null);
  const where = (label) => (safe(picture.link) ? link(picture.link, label) : label);
  if (picture.source === 'wikidata') line.append(t('pictureWikidata'), ' ', where('Wikimedia Commons'));
  else if (picture.source === 'linked') line.append(t('pictureLinked'), ' ', where(picture.from ?? t('creditSource')));
  else if (picture.source === 'openverse') {
    line.append(t('pictureOpenverse'), ' ', where(picture.credit || t('pictureUnknown')));
    if (picture.license) line.append(', ', safe(picture.licenseUrl) ? link(picture.licenseUrl, picture.license) : picture.license);
    line.append(' ', t('pictureVia'), ' ', link('https://openverse.org', 'Openverse'));
  } else if (picture.source === 'commons') {
    line.append(t('pictureCommons'), ' ', picture.credit || t('pictureUnknown'));
    if (picture.license) line.append(', ', safe(picture.licenseUrl) ? link(picture.licenseUrl, picture.license) : picture.license);
    line.append(' ', t('pictureVia'), ' ', where('Wikimedia Commons'));
  } else if (picture.source === 'upload') {
    line.append(t('pictureUpload'), ' ', where(picture.credit || t('pictureUnknown')));
    if (picture.license) line.append(', ', picture.license);
  } else return null;
  return line;
}

export function aboutRows() {
  const rows = [];
  const tour = settingsRowShell('tourReplayTitle', 'tourReplayNote');
  settingsRowButton(tour, t('tourReplayOpen'), () => import('./tour.js').then((m) => m.startTour({ force: true })));
  rows.push(tour);
  const credits = settingsRowShell('creditsTitle', 'creditsNote');
  settingsRowButton(credits, t('creditsOpen'), () => openCredits());
  rows.push(credits);
  for (const [page, title, note] of [
    ['privacy', 'privacyTitle', 'privacyNote'],
    ['terms', 'termsTitle', 'termsNote'],
    ['support', 'supportTitle', 'supportNote']
  ]) {
    const row = settingsRowShell(title, note);
    settingsRowButton(row, t('aboutOpenPage'), () => openPage(page, t(title)));
    rows.push(row);
  }
  const version = settingsRowShell('versionTitle', 'versionNote');
  version.querySelector('p').textContent = t('versionNote', {
    sha: BUILD.sha,
    date: BUILD.at ? new Date(BUILD.at).toISOString().slice(0, 10) : '-'
  });
  rows.push(version);
  return rows;
}
