export const KNOWN_WIKIS = [
  { api: 'https://bulbapedia.bulbagarden.net/w/api.php', names: ['Pokémon', 'Pokemon', 'Bulbapedia'] },
  { api: 'https://minecraft.wiki/api.php', names: ['Minecraft'] },
  { api: 'https://www.mariowiki.com/api.php', names: ['Super Mario', 'Mario', 'Mario Bros'] },
  { api: 'https://terraria.wiki.gg/api.php', names: ['Terraria'] },
  { api: 'https://runescape.wiki/api.php', names: ['RuneScape', 'RS3'] },
  { api: 'https://oldschool.runescape.wiki/api.php', names: ['Old School RuneScape', 'OSRS'] },
  { api: 'https://en.uesp.net/w/api.php', names: ['The Elder Scrolls', 'Elder Scrolls', 'Skyrim', 'Oblivion', 'Morrowind'] },
  { api: 'https://tolkiengateway.net/w/api.php', names: ['Tolkien', 'Middle-earth', 'Lord of the Rings', 'The Hobbit'] },
  { api: 'https://warcraft.wiki.gg/api.php', names: ['Warcraft', 'World of Warcraft', 'WoW', 'Wowpedia'] },
  { api: 'https://stardewvalleywiki.com/mediawiki/api.php', names: ['Stardew Valley', 'Stardew'] },
  { api: 'https://wiki.teamfortress.com/w/api.php', names: ['Team Fortress', 'Team Fortress 2', 'TF2'] },
  { api: 'https://nookipedia.com/w/api.php', names: ['Animal Crossing', 'Nookipedia'] },
  { api: 'https://www.ssbwiki.com/api.php', names: ['Super Smash Bros', 'Smash Bros', 'Smash'] },
  { api: 'https://www.pikminwiki.com/api.php', names: ['Pikmin'] },
  { api: 'https://fireemblemwiki.org/w/api.php', names: ['Fire Emblem'] },
  { api: 'https://starcitizen.tools/api.php', names: ['Star Citizen'] },
  { api: 'https://wiki.factorio.com/api.php', names: ['Factorio'] },
  { api: 'https://satisfactory.wiki.gg/api.php', names: ['Satisfactory'] },
  { api: 'https://dwarffortresswiki.org/api.php', names: ['Dwarf Fortress'] },
  { api: 'https://www.poewiki.net/w/api.php', names: ['Path of Exile', 'PoE'] },
  { api: 'https://wiki.leagueoflegends.com/en-us/api.php', names: ['League of Legends', 'LoL'] },
  { api: 'https://hearthstone.wiki.gg/api.php', names: ['Hearthstone'] },
  { api: 'https://www.halopedia.org/api.php', names: ['Halo', 'Halopedia'] },
  { api: 'https://undertale.wiki/api.php', names: ['Undertale'] },
  { api: 'https://deltarune.wiki/api.php', names: ['Deltarune'] },
  { api: 'https://en.wikivoyage.org/w/api.php', names: ['Wikivoyage', 'Travel', 'Voyage'] }
];

export const MATURE_HOSTS = ['wikiporno.org', 'boobpedia.com', 'iafd.com', 'pornhub.com', 'xhamster.com', 'rule34.xxx', 'e621.net', 'hentaiwiki.net'];

export const MATURE_WORDS = /\b(porn\w*|p0rn\w*|pr[o0]n[osz]?|hentai|nsfw|xxx|erotic\w*|boob\w*|r-?18|rule ?34|fetish\w*|lewd|nude|nudity|smut|ecchi|sex (toys?|work|shop)|sexual content|adult (content|films?|videos?|entertainment)|18\+|mature content)(?![\w+])/i;

export const MATURE_INNER = /porn|p0rn|pr0n|hentai/i;

export const MATURE_CATEGORIES = /(nsfw|mature content|adult content|explicit content|explicit images|pornograph|hentai|nudity|nude|sexual content|erotic|\b18\+|\br-?18\b|rule 34|fetish|sexual (?:anatomy|acts|positions|intercourse|arousal)|sex (?:organs|positions|toys)|human sexuality|\bpenis\b|\bvagina\b|\bvulva\b|clitoris|masturbation|ecchi|lewd|\bsmut\b)/i;
