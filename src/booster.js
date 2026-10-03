import { THEME_PACKS, themeById } from './data/packs.js';
import { codeById, codeLook, codeTitles, extraCard } from './codedefs.js';
import { rarityById, rarityRank } from './data/rarities.js';
import { drawCapsFor } from './economy.js';
import { liveOddsFor } from './data/odds.js';
import { tx, t, getLanguage } from './i18n.js';
import { proceduralStyle, customSeed } from './packstyle.js';
import { isFriendSpec } from './friendcodes.js';

const OPEN_ACCENT = { accent: '#94a3b8', accent2: '#334155' };

export function specId(spec) {
  const rarity = spec.rarityId ?? 'std';
  if (spec.kind === 'timed') return `timed|${spec.timedLevel ?? 1}|std|${spec.cards}`;
  if (spec.kind === 'today') return `today|${spec.day}|std|${spec.cards}`;
  if (spec.kind === 'code') return `code|${spec.codeId}|${rarity}|${spec.cards}`;
  if (spec.kind === 'custom') {
    const topic = spec.wiki?.topic ? `#${String(spec.wiki.topic).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}` : '';
    const host = spec.wiki ? new URL(spec.wiki.apiUrl).host + new URL(spec.wiki.apiUrl).pathname.replace('/api.php', '') + topic : spec.customId;
    return `custom|${host}|${rarity}|${spec.cards}`;
  }
  return `${spec.kind}|${spec.themeId ?? 'any'}|${rarity}|${spec.cards}`;
}

export function specName(spec) {
  const tier = spec.rarityId ? tx(rarityById(spec.rarityId).name) : null;

  if (spec.kind === 'timed') return t('timedBooster');
  if (spec.kind === 'today') return t('todayBooster');
  if (isFriendSpec(spec)) return spec.codeName || t('codeBooster');
  if (spec.kind === 'code') {
    const base = codeLook(codeById(spec.codeId)).name || t('codeBooster');
    return tier ? `${base} · ${tier}` : base;
  }
  if (spec.kind === 'custom') {
    const base = spec.customName ?? spec.wiki?.sitename ?? 'Custom';
    return tier ? `${base} · ${tier}` : base;
  }
  if (spec.themeId) {
    const base = tx(themeById(spec.themeId)?.name);
    return tier ? `${base} · ${tier}` : base;
  }
  return tier ? t('rarityBooster', { rarity: tier }) : t('wildcard');
}

export function specBaseName(spec) {
  if (spec.kind === 'timed') return t('timedBooster');
  if (spec.kind === 'today') return t('todayBooster');
  if (isFriendSpec(spec)) return spec.codeFor || spec.codeName || t('codeBooster');
  if (spec.kind === 'code') return codeById(spec.codeId)?.person ?? t('codeBooster');
  if (spec.kind === 'custom') return spec.customName ?? spec.wiki?.sitename ?? 'Custom';
  if (spec.themeId) return tx(themeById(spec.themeId)?.name);
  return spec.rarityId ? t('wildcard') : t('wildcard');
}

export const specTierName = (spec) =>
  spec.kind === 'code' ? t('specialTier') : spec.rarityId ? tx(rarityById(spec.rarityId).name) : null;

export function specTagline(spec) {
  if (spec.kind === 'timed') return t('timedTagline');
  if (spec.kind === 'today') return t('todayTagline', { day: spec.day ?? '' });
  if (isFriendSpec(spec)) return spec.codeFor ? t('friendBoosterTagline', { name: spec.codeFor }) : '';
  if (spec.kind === 'code') return codeLook(codeById(spec.codeId)).tagline;
  if (spec.kind === 'custom') return spec.customTagline ?? '';
  if (spec.themeId) return tx(themeById(spec.themeId)?.tagline);
  return '';
}

export function specColours(spec) {
  if (spec.kind === 'timed') return { accent: '#38bdf8', accent2: '#0c4a6e' };
  if (spec.kind === 'today') return { accent: '#f8fafc', accent2: '#7f1d1d' };
  if (isFriendSpec(spec)) return { accent: spec.accent ?? '#64748b', accent2: spec.accent2 ?? '#1e2233' };
  if (spec.kind === 'code') {
    const look = codeLook(codeById(spec.codeId));
    return { accent: look.accent, accent2: look.accent2 };
  }
  if (spec.kind === 'custom') {
    const style = proceduralStyle(customSeed(spec));
    return { accent: style.accent, accent2: style.accent2 };
  }
  const theme = themeById(spec.themeId);
  if (theme) return { accent: theme.accent, accent2: theme.accent2 };
  if (spec.rarityId) {
    const rarity = rarityById(spec.rarityId);
    return { accent: rarity.color, accent2: '#1e2233' };
  }
  return OPEN_ACCENT;
}

export const specIcon = (spec) =>
  spec.kind === 'timed' ? 'clock'
    : spec.kind === 'today' ? 'globe'
    : spec.kind === 'code' ? 'gift'
    : spec.kind === 'custom' ? (spec.icon ?? 'wand')
      : themeById(spec.themeId)?.icon ?? (spec.rarityId ? 'gem' : 'packs');

export function specHero(spec) {
  const theme = themeById(spec.themeId);
  if (!theme) return null;
  const lang = getLanguage();
  return theme.hero[lang] ?? theme.hero.en;
}

export function specQueries(spec) {
  if (spec.kind === 'code') return codeById(spec.codeId)?.queries ?? [];
  const theme = themeById(spec.themeId);
  if (!theme) return [];
  const lang = getLanguage();
  return theme.queries[lang] ?? theme.queries.en ?? [];
}

export function toDrawPack(spec) {
  const code = spec.kind === 'code' ? codeById(spec.codeId) : null;
  const roll = !code && themeById(spec.themeId)?.titles;
  const lang = getLanguage();
  const titles = code ? codeTitles(code)
    : roll ? (roll[lang] ?? roll.en).map((title, i) => ({ title, fallback: roll.en[i] ?? title, name: null }))
      : [];
  return {
    name: specName(spec),
    cards: spec.cards,
    source: (code || roll) ? 'titles' : spec.kind === 'today' ? 'today' : spec.kind === 'custom' ? 'custom' : 'wikipedia',
    day: spec.kind === 'today' ? spec.day : null,
    titles,
    pick: roll ? spec.cards : null,
    extra: code ? [extraCard(code)].filter(Boolean) : [],
    special: code?.id ?? null,
    skin: code?.skin ?? null,
    fallbackArt: code ? codeLook(code).accent : null,
    queries: specQueries(spec),
    wiki: spec.wiki ?? null,
    look: { icon: specIcon(spec), ...specColours(spec) },
    ...drawCapsFor(spec),
    odds: liveOddsFor(spec.rarityId ?? null, spec)
  };
}

export const themeSpecs = (cards, rarityId = null) =>
  THEME_PACKS.map((theme) => ({ kind: 'theme', themeId: theme.id, rarityId, cards }));

export const isPremium = (spec) => Boolean(spec.rarityId) && rarityRank(spec.rarityId) >= 4;
