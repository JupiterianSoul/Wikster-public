import { guardRoutes } from './guard.mjs';
import { RELEASES } from '../../src/data/releases.js';
import { KNOWN_WIKIS } from '../../src/data/wikis.js';
export const ARTICLES = [
  ['Cygnus X-1', 'A galactic X-ray source in the constellation Cygnus, widely accepted as the first black hole ever identified by astronomers working in the field.', 420000],
  ['Antikythera mechanism', 'An ancient Greek hand-powered orrery, the oldest known example of an analogue computer, used to predict astronomical positions decades ahead.', 90000],
  ['Tardigrade', 'A phylum of eight-legged segmented micro-animals known as water bears, notable for surviving extremes of temperature, pressure and radiation.', 210000],
  ['Mount Erebus', 'The southernmost active volcano on Earth, with a persistent convecting lava lake in its summit crater on Ross Island in Antarctica.', 15000],
  ['Voynich manuscript', 'An illustrated codex hand-written in an unknown writing system, carbon-dated to the early fifteenth century and never deciphered.', 320000],
  ['Sagrada Familia', 'A large unfinished minor basilica in Barcelona designed by the Catalan architect Antoni Gaudi, under construction since 1882.', 260000],
  ['Opuntia', 'A genus of flowering plants in the cactus family, commonly called prickly pear, native to the Americas and naturalised widely elsewhere.', 8000],
  ['Ayrton Senna', 'A Brazilian racing driver who won three Formula One world championships and is widely regarded as one of the greatest drivers of all time.', 500000]
];

export const FINDER_SITES = {
  'https://zelda.fandom.com/api.php': { sitename: 'Zelda Wiki', articles: 11976, server: 'https://zelda.fandom.com' },
  'https://zelda.fandom.com/fr/api.php': { sitename: 'ZeldaWiki', articles: 4473, lang: 'fr', server: 'https://zelda.fandom.com', scriptpath: '/fr' },
  'https://zelda.wiki.gg/api.php': { sitename: 'Zelda NSFW Wiki', articles: 50000, server: 'https://zelda.wiki.gg' },
  'https://thelegendofzelda.miraheze.org/w/api.php': { sitename: 'The Legend of Zelda Encyclopedia', articles: 448, server: 'https://thelegendofzelda.miraheze.org', scriptpath: '/w' }
};

const siteinfo = (site) => ({ query: {
  general: { sitename: site.sitename, server: site.server, scriptpath: site.scriptpath ?? '', lang: site.lang ?? 'en', articlepath: `${site.scriptpath ?? ''}/wiki/$1`, mainpage: 'Main Page' },
  statistics: { articles: site.articles, images: Math.round(site.articles * 3) }
} });

const CORS = { 'access-control-allow-origin': '*' };

const IMG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#334155"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="320" height="240" fill="url(%23g)"/><circle cx="160" cy="108" r="54" fill="#e2e8f0"/></svg>`;

export function installStubs(page, { fandomOk = true, calls = null } = {}) {
  guardRoutes(page);
  let i = 0;
  const note = (u) => { if (calls) calls.push(u); };

  page.addInitScript((latest) => {
    try { if (!localStorage.getItem('wikster.seenRelease.v1')) localStorage.setItem('wikster.seenRelease.v1', latest); } catch {}
  }, RELEASES.at(-1).id);

  page.route(/(jupiteriansoul\.github\.io\/Wikster|wikster\.pages\.dev)\/version\.json/, (r) =>
    r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ sha: 'dev', at: 0 }) }));

  page.route(/(upload|thumb)\.wikimedia\.org/, (r) => {
    const n = Number(/hero-(\d+)/.exec(r.request().url())?.[1] ?? 0);
    const hue = (n * 47) % 360;
    r.fulfill({ contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body:
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
         <rect width="320" height="320" fill="hsl(${hue} 45% 32%)"/>
         <circle cx="160" cy="130" r="66" fill="hsl(${hue} 60% 66%)"/>
         <rect y="230" width="320" height="90" fill="hsl(${hue} 50% 22%)"/>
       </svg>` });
  });


  page.route(/wikimedia\.org\/api\/rest_v1\/metrics\/pageviews/, (r) => {
    const url = decodeURIComponent(r.request().url());
    note(url);
    const hit = ARTICLES.find(([t]) => url.includes(t.replace(/ /g, '_')));
    const views = hit ? hit[2] : 5000;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({
      items: [{ views }, { views: Math.round(views * 0.9) }]
    })});
  });
  page.route(/wikimedia\.org\/api\/rest_v1\/metrics\/pageviews\/top/, (r) => {
    note(r.request().url());
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({
      items: [{ articles: [...ARTICLES].sort((a, b) => b[2] - a[2]).map(([title, , views], i) => ({ article: title.replace(/ /g, '_'), views, rank: i + 1 })) }]
    })});
  });

  page.route(/[a-z]{2}\.wikipedia\.org\/w\/api\.php/, (r) => {
    const url = r.request().url();
    note(url);

    if (url.includes('meta=siteinfo')) {
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        query: { statistics: { articles: 6912930 } }
      })});
      return;
    }

    if (url.includes('generator=search') || url.includes('generator=random')
        || (/[?&]titles=/.test(url) && url.includes('extracts'))) {
      const q = decodeURIComponent((/gsrsearch=([^&]*)/.exec(url)?.[1] ?? '').replace(/\+/g, ' '));
      const rawTitles = (/[?&]titles=([^&]*)/.exec(url)?.[1] ?? '').replace(/\+/g, '%20');
      const wanted = rawTitles ? decodeURIComponent(rawTitles).split('|') : [];
      const chosen = wanted.length
        ? wanted.map((t) => ARTICLES.find(([title]) => title === t)
            ?? [t, `${t} is the subject of this article, written at length for the stub so that every card has an opening paragraph to show on its face.`, 120000])
        : ARTICLES;
      const pages = {};
      chosen.forEach(([title, extract]) => {
        const known = ARTICLES.findIndex(([t]) => t === title);
        const id = known >= 0 ? 700 + known : 5000 + [...title].reduce((n, c) => n + c.charCodeAt(0), 0);
        pages[String(id)] = {
          pageid: id, title, extract, description: 'stub article',
          categories: [{ title: `Category:${q || 'Stub'}` }],
          thumbnail: { source: 'https://upload.wikimedia.org/s.svg', width: 400 },
          fullurl: 'https://xx.wikipedia.org/wiki/' + encodeURIComponent(title),
          length: 12000
        };
      });
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        query: { searchinfo: { totalhits: 640 }, pages }
      })});
      return;
    }

    if (url.includes('list=search') && url.includes('srinfo=suggestion')) {
      const q = decodeURIComponent((/srsearch=([^&]*)/.exec(url)?.[1] ?? '').replace(/\+/g, ' '));
      const zelda = /^zeld/i.test(q);
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: {
        searchinfo: zelda ? { totalhits: 700, ...(q.toLowerCase() !== 'zelda' ? { suggestion: 'zelda' } : {}) } : { totalhits: 0 },
        search: zelda ? [{ title: 'The Legend of Zelda' }] : []
      } }) });
      return;
    }

    if (url.includes('prop=pageimages')) {
      const raw = (/titles=([^&]*)/.exec(url)?.[1] ?? '').replace(/\+/g, '%20');
      const titles = decodeURIComponent(raw).split('|');
      const pages = {};
      titles.forEach((title, i) => {
        pages[String(900 + i)] = {
          pageid: 900 + i, title,
          thumbnail: { source: `https://upload.wikimedia.org/hero-${i}.svg` }
        };
      });
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages } }) });
      return;
    }

    r.fulfill({ contentType: 'application/json', body: JSON.stringify({
      query: {
        searchinfo: { totalhits: 640 },
        search: ARTICLES.map(([t]) => ({ title: t, wordcount: 3200 }))
      }
    })});
  });

  const summary = (title, extract) => ({
    type: 'standard', pageid: 700 + ARTICLES.findIndex(([t]) => t === title),
    title, titles: { normalized: title }, description: 'stub article', extract,
    thumbnail: { source: 'https://upload.wikimedia.org/s.svg' },
    content_urls: { desktop: { page: 'https://xx.wikipedia.org/wiki/' + encodeURIComponent(title) } }
  });

  page.route(/[a-z]{2}\.wikipedia\.org\/api\/rest_v1\/page\/random/, (r) => {
    note(r.request().url());
    const [t, e] = ARTICLES[i++ % ARTICLES.length];
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(summary(t, e)) });
  });

  page.route(/[a-z]{2}\.wikipedia\.org\/api\/rest_v1\/page\/summary/, (r) => {
    note(r.request().url());
    const raw = decodeURIComponent(r.request().url().split('/summary/')[1]).replace(/_/g, ' ');
    const hit = ARTICLES.find(([t]) => t === raw) ?? ARTICLES[i++ % ARTICLES.length];
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(summary(hit[0], hit[1])) });
  });

  page.route(/www\.wikidata\.org\/w\/api\.php/, (r) => {
    const url = new URL(r.request().url());
    note(url.href);
    const p = url.searchParams;
    if (p.get('list') === 'search') {
      const hit = /zelda/i.test(p.get('srsearch') ?? '');
      return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ query: { search: hit ? [{ title: 'Q12393' }] : [] } }) });
    }
    if (p.get('action') === 'wbgetentities') {
      return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ entities: { Q12393: {
        labels: { en: { value: 'The Legend of Zelda' } },
        claims: {
          P4073: [{ mainsnak: { datavalue: { value: 'zelda' } } }, { mainsnak: { datavalue: { value: 'fr.zelda' } } }],
          P11994: [{ mainsnak: { datavalue: { value: 'zelda' } } }]
        }
      } } }) });
    }
    r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ query: { pages: {} } }) });
  });

  page.route(/meta\.miraheze\.org/, (r) => {
    note(r.request().url());
    const wanted = new URL(r.request().url()).searchParams.get('wdwikis') ?? '';
    const wikis = /thelegendofzeldawiki/.test(wanted)
      ? { thelegendofzeldawiki: { url: 'https://thelegendofzelda.miraheze.org', sitename: 'The Legend of Zelda Encyclopedia', public: '' } } : {};
    r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ query: { wikidiscover: { wikis } } }) });
  });

  const finderSite = (r) => {
    const url = new URL(r.request().url());
    note(url.href);
    const site = FINDER_SITES[`${url.origin}${url.pathname}`];
    if (site && url.searchParams.get('meta') === 'siteinfo') return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(siteinfo(site)) });
    if (site) return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ query: { pages: {} } }) });
    return r.fulfill({ status: 404, contentType: 'text/html', body: 'not found' });
  };
  page.route(/\.wiki\.gg\//, finderSite);
  page.route(/[a-z0-9-]+\.miraheze\.org\/w\/api\.php/, finderSite);
  const knownHosts = new Set(KNOWN_WIKIS.map((w) => new URL(w.api).hostname).filter((h) => !/wikipedia\.org$/.test(h)));
  page.route((url) => knownHosts.has(url.hostname), finderSite);

  page.route(/api\.openverse\.org/, (r) => {
    note(r.request().url());
    r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ result_count: 0, results: [] }) });
  });

  page.route(/community\.fandom\.com/, (r) => {
    note(r.request().url());
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });

  page.route(/\.fandom\.com\/(?:[a-z]{2}\/)?api\.php/, async (r) => {
    const url = r.request().url();
    note(url);
    const isTerraria = /terraria\.fandom\.com/.test(url);
    const french = /\/fr\/api\.php/.test(url);
    const found = FINDER_SITES[url.split('?')[0]];
    if (found && fandomOk) {
      r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(url.includes('meta=siteinfo') ? siteinfo(found) : { query: { pages: {} } }) });
      return;
    }
    if (!isTerraria || !fandomOk) {
      r.fulfill({ status: 404, contentType: 'text/html', body: 'not found' });
      return;
    }

    const PAGES = french
      ? { 11: 'Lame de Terra', 12: 'Œil de Cthulhu', 13: 'Hardmode', 14: 'Mur de Chair', 15: 'Seigneur de la Lune', 16: 'Corruption' }
      : { 11: 'Terra Blade', 12: 'Eye of Cthulhu', 13: 'Hardmode', 14: 'Wall of Flesh', 15: 'Moon Lord', 16: 'Corruption' };

    if (url.includes('meta=siteinfo')) {
      await new Promise((res) => setTimeout(res, 500));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        query: {
          general: {
            sitename: french ? 'Terraria Wiki FR' : 'Terraria Wiki',
            server: 'https://terraria.fandom.com',
            articlepath: (french ? '/fr' : '') + '/wiki/$1',
            mainpage: french ? 'Accueil' : 'Terraria Wiki',
            logo: '//terraria.fandom.com/hero-9.svg'
          },
          statistics: { articles: french ? 1800 : 4212 }
        }
      })});
      return;
    }
    if (url.includes('list=random') || url.includes('generator=random')) {
      const pages = {};
      Object.entries(PAGES).forEach(([id, title]) => {
        pages[id] = { pageid: Number(id), title, thumbnail: { source: `https://upload.wikimedia.org/hero-${id}.svg` } };
      });
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        query: url.includes('generator=random')
          ? { pages }
          : { random: Object.entries(PAGES).map(([id, title]) => ({ id: Number(id), title })) }
      })});
      return;
    }
    if (url.includes('prop=extracts')) {
      const id = /pageids=(\d+)/.exec(url)?.[1] ?? '11';
      const name = PAGES[id] ?? PAGES[11];
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        query: { pages: { [id]: {
          pageid: Number(id), title: name,
          extract: french
            ? `${name} est un élément central de Terraria, présent dans tout le monde du jeu et jouant un rôle important dans la progression des joueurs vers les étapes finales.`
            : `${name} is a fixture of Terraria, appearing throughout the world and playing a central role in how players progress through the game's later stages.`,
          thumbnail: { source: 'https://upload.wikimedia.org/hero-3.svg' },
          fullurl: `https://terraria.fandom.com/wiki/${encodeURIComponent(name)}`,
          length: 9000
        }}}
      })});
      return;
    }
    if (url.includes('titles=')) {
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({
        query: { pages: { 1: { pageid: 1, title: 'Main', thumbnail: { source: 'https://upload.wikimedia.org/hero-7.svg' } } } }
      })});
      return;
    }
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
  });
}
