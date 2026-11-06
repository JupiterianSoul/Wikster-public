# Wikster

A trading card game where every card is a real Wikipedia article.

Open booster packs, collect articles from 26 subjects, and hunt for the rare prints. The more people read an article, the more its card is worth.

## Play

https://wikster.pages.dev

## What you can do

- Open boosters and pull cards across 8 rarities, from Common to Prismatic
- Fill albums, earn medals and climb 500 levels
- Trade, gift and chat with friends
- Bid on cards in the live auction house
- Join a guild, hit weekly goals and face other guilds
- Play the minigames: Wikdle, Popularity Duel, Guess the Article and two head-to-head games with friends
- Take on daily quests and seasonal events
- Climb the daily, weekly and all-time leaderboards
- Unlock themes, level frames, card effects and badges
- Play in English or French

## Development

The game is a Vite app with Supabase as the backend. It is also wrapped for Android (WebView) and for Steam (Tauri).

```
npm install
cp .env.example .env     # your Supabase URL and publishable key
npm run dev
```

Other scripts:

- `npm run build` and `npm run preview`
- `npm test` runs the checks (translations, a source sweep, unit tests, type check) and then the browser tests
- `npm run check` runs only the static checks
- `npm run shots` takes desktop screenshots

The database schema is in `supabase/schema.sql` and the edge functions are in `supabase/functions/`. SQL tests are in `tests/sql/`.

## Credits

Card text and images come from Wikipedia under [CC BY-SA](https://en.wikipedia.org/wiki/Wikipedia:Copyrights). Every card links back to its article. Wikster is not affiliated with Wikipedia or the Wikimedia Foundation.

Music and sound credits are in `src/assets/music/LICENSE.md` and `src/assets/sfx/LICENSE.md`.
