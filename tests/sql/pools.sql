select t_is('an unknown pool hands nothing and asks for a refill', (select (r->>'due')::boolean and jsonb_array_length(r->'cards') = 0 and (r->>'size')::int = 0
  from (select wiki_pool_draw('wp:en:test', 10, 120, 3600, 'wiki') r) x));
select t_is('the refill lock is held, so a second reader does not refill too', (select not (wiki_pool_draw('wp:en:test', 10, 120, 3600, 'wiki')->>'due')::boolean));

select t_is('a refill files its articles in one call', wiki_pool_fill('wp:en:test', 'wiki',
  (select jsonb_agg(jsonb_build_object('key', 'en:A' || i, 'title', 'A' || i, 'extract', 'text')) from generate_series(1, 250) i), 200) = 200);
select t_is('the pool keeps at most its size, newest first', (select count(*) = 200 from wiki_pool where pool = 'wp:en:test')
  and (select size = 200 and refill_after > now() and fetched_at is not null from wiki_pools where pool = 'wp:en:test'));
select wiki_pool_fill('wp:en:test', 'wiki', '[{"key":"en:A1","title":"A1","extract":"x"}]', 200);
select t_is('a refill that brings little new rests for hours', (select refill_after > now() + interval '1 hour' from wiki_pools where pool = 'wp:en:test'));
select t_is('a refill again replaces a card, it never doubles it', wiki_pool_fill('wp:en:test', 'wiki', '[{"key":"en:A250","title":"A250 again","extract":"x"}]', 200) = 200
  and (select count(*) <= 1 from wiki_pool where pool = 'wp:en:test' and key = 'en:A250')
  and (select count(distinct key) = 200 from wiki_pool where pool = 'wp:en:test'));
select t_is('a draw hands distinct cards, as many as asked', (select jsonb_array_length(r->'cards') = 30 and (select count(distinct c->>'key') = 30 from jsonb_array_elements(r->'cards') c)
  from (select wiki_pool_draw('wp:en:test', 30, 120, 3600, 'wiki') r) x));
select t_is('a full and fresh pool reads without writing', (select not (wiki_pool_draw('wp:en:test', 5, 120, 3600, 'wiki')->>'due')::boolean));
select t_is('two draws are not dealt in the same order', (select string_agg(c->>'key', ',') from jsonb_array_elements(wiki_pool_draw('wp:en:test', 50, 120, 3600, 'wiki')->'cards') c)
  <> (select string_agg(c->>'key', ',') from jsonb_array_elements(wiki_pool_draw('wp:en:test', 50, 120, 3600, 'wiki')->'cards') c));

update wiki_pools set fetched_at = now() - interval '8 hours', refill_after = now() - interval '1 minute' where pool = 'wp:en:test';
select t_is('a stale pool asks for one refill', (wiki_pool_draw('wp:en:test', 5, 120, 3600, 'wiki')->>'due')::boolean
  and not (wiki_pool_draw('wp:en:test', 5, 120, 3600, 'wiki')->>'due')::boolean);
select wiki_pool_fail('wp:en:test');
select t_is('a failed refill backs off', (select refill_after > now() + interval '30 seconds' and fails = 1 from wiki_pools where pool = 'wp:en:test'));

select wiki_pool_fill('cw:en:https://old.example/api.php', 'custom',
  (select jsonb_agg(jsonb_build_object('key', 'wiki:old:' || i, 'title', 'O' || i, 'extract', 'text')) from generate_series(1, 300) i), 300);
update wiki_pools set used_at = now() - interval '10 days' where pool = 'cw:en:https://old.example/api.php';
select wiki_pool_fill('wp:en:big', 'wiki', (select jsonb_agg(jsonb_build_object('key', 'en:B' || i, 'title', 'B' || i, 'extract', 'text')) from generate_series(1, 400) i), 400, 700);
select t_is('over the global cap, an idle custom wiki pool goes first', not exists (select 1 from wiki_pools where pool = 'cw:en:https://old.example/api.php')
  and not exists (select 1 from wiki_pool where pool = 'cw:en:https://old.example/api.php')
  and exists (select 1 from wiki_pools where pool = 'wp:en:big'));
select t_is('the rows stay bounded in total', (select count(*) <= 700 from wiki_pool));
select t_fails($$select wiki_pool_fill('x', 'wiki', '[]', 10)$$, 'BAD_POOL');
select t_is('a card too big for a pool row is turned away', wiki_pool_fill('wp:en:fat', 'wiki', jsonb_build_array(jsonb_build_object('key', 'en:Fat', 'title', 'Fat', 'extract', repeat('x', 5000)))) = 0);
select t_is('players cannot read the pools', not has_table_privilege('authenticated', 'public.wiki_pool', 'select') or not exists (
  select 1 from pg_policies where tablename in ('wiki_pool', 'wiki_pools')));
select t_is('players cannot call the pool functions', not has_function_privilege('authenticated', 'public.wiki_pool_draw(text, integer, integer, integer, text, uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.wiki_pool_fill(text, text, jsonb, integer, integer)', 'execute'));

insert into auth.users (id) values ('b0060000-0000-0000-0000-000000000001') on conflict do nothing;
select wiki_pool_fill('wp:en:mine', 'wiki', (select jsonb_agg(jsonb_build_object('key', 'en:M' || i, 'title', 'M' || i, 'extract', 'text')) from generate_series(1, 40) i), 1200);
insert into cards (user_id, article_key, title, rarity_id, price)
  select 'b0060000-0000-0000-0000-000000000001', 'en:M' || i, 'M' || i, 'common', 10 from generate_series(1, 20) i;
insert into pulls (user_id, spec_id, spec, cards) values ('b0060000-0000-0000-0000-000000000001', 'theme|t|std|5', '{"kind":"theme","cards":5}',
  (select jsonb_agg(jsonb_build_object('article', jsonb_build_object('key', 'en:M' || i), 'rarityId', 'common')) from generate_series(21, 30) i));
select t_is('a player is dealt the articles they do not hold first', (select (r->>'fresh')::int = 10
  and (select bool_and((c->>'key') in (select 'en:M' || i from generate_series(31, 40) i)) from jsonb_array_elements(r->'cards') c)
  from (select wiki_pool_draw('wp:en:mine', 10, 1, 0, 'wiki', 'b0060000-0000-0000-0000-000000000001') r) x));
select t_is('cards waiting in their draws count as held', (select (r->>'fresh')::int = 10 and jsonb_array_length(r->'cards') = 25
  and (select bool_and((c->>'key') in (select 'en:M' || i from generate_series(31, 40) i)) from (select c from jsonb_array_elements(r->'cards') with ordinality as t(c, n) where n <= 10) y)
  from (select wiki_pool_draw('wp:en:mine', 25, 1, 0, 'wiki', 'b0060000-0000-0000-0000-000000000001') r) x));
select t_is('another player sees the whole pool as new', (select (wiki_pool_draw('wp:en:mine', 40, 1, 0, 'wiki', 'b0060000-0000-0000-0000-000000000002')->>'fresh')::int = 40));
select t_is('a pool can grow past its first size for a big source', (select wiki_pool_fill('wp:en:mine', 'wiki',
  (select jsonb_agg(jsonb_build_object('key', 'en:N' || i, 'title', 'N' || i, 'extract', 'text')) from generate_series(1, 600) i), 1200) = 640));
update wiki_pools set refill_after = null, fetched_at = now() where pool = 'wp:en:mine';
select t_is('a busy pool asks to rotate when the reader says so', (wiki_pool_draw('wp:en:mine', 5, 1, 0, 'wiki', null, true)->>'due')::boolean);

update wiki_pools set asked_at = null;
select wiki_pool_fill('wp:en:capa', 'wiki', (select jsonb_agg(jsonb_build_object('key', 'en:CA' || i, 'title', 'CA' || i, 'extract', 'text')) from generate_series(1, 10) i), 300);
select wiki_pool_fill('wp:en:capb', 'wiki', (select jsonb_agg(jsonb_build_object('key', 'en:CB' || i, 'title', 'CB' || i, 'extract', 'text')) from generate_series(1, 10) i), 300);
select wiki_pool_fill('wp:en:capc', 'wiki', (select jsonb_agg(jsonb_build_object('key', 'en:CC' || i, 'title', 'CC' || i, 'extract', 'text')) from generate_series(1, 10) i), 300);
select wiki_pool_fill('wp:en:capd', 'wiki', (select jsonb_agg(jsonb_build_object('key', 'en:CD' || i, 'title', 'CD' || i, 'extract', 'text')) from generate_series(1, 3) i), 300);
update wiki_pools set fetched_at = now() - interval '8 hours', refill_after = null where pool like 'wp:en:cap%';
select t_is('a filled pool is no longer counted as refilling', not exists (select 1 from wiki_pools where pool like 'wp:en:cap%' and asked_at is not null));
select t_is('two stale pools may refill at once', (wiki_pool_draw('wp:en:capa', 5, 1, 60, 'wiki')->>'due')::boolean
  and (wiki_pool_draw('wp:en:capb', 5, 1, 60, 'wiki')->>'due')::boolean);
select t_is('a third stale pool waits its turn', not (wiki_pool_draw('wp:en:capc', 5, 1, 60, 'wiki')->>'due')::boolean
  and (select refill_after is null and asked_at is null from wiki_pools where pool = 'wp:en:capc'));
select t_is('a pool running short is refilled anyway', (wiki_pool_draw('wp:en:capd', 2, 5, 60, 'wiki')->>'due')::boolean);
select t_is('so is a pool nobody filled yet', (wiki_pool_draw('wp:en:capnew', 5, 1, 60, 'wiki')->>'due')::boolean);
select wiki_pool_fill('wp:en:capa', 'wiki', '[{"key":"en:CA1","title":"CA1","extract":"text"}]', 300);
select wiki_pool_fail('wp:en:capb');
select wiki_pool_release('wp:en:capd');
update wiki_pools set asked_at = null where pool = 'wp:en:capnew';
select t_is('once a refill lands or fails the next pool gets its turn', (wiki_pool_draw('wp:en:capc', 5, 1, 60, 'wiki')->>'due')::boolean);
update wiki_pools set asked_at = now() - interval '10 minutes' where pool = 'wp:en:capc';
update wiki_pools set fetched_at = now() - interval '8 hours', refill_after = null where pool = 'wp:en:capa';
select t_is('a refill that never reported back stops counting after a while', (wiki_pool_draw('wp:en:capa', 5, 1, 60, 'wiki')->>'due')::boolean);

update wiki_pool set at = now() - interval '1 day' where pool = 'wp:en:capc' and key = 'en:CC1';
select wiki_pool_fill('wp:en:capc', 'wiki', '[{"key":"en:CC1","title":"CC1","extract":"text"},{"key":"en:CC2","title":"CC2 new","extract":"text"}]', 300);
select t_is('a refill that brings a card back unchanged keeps it and marks it fresh', (select at = now() and card->>'title' = 'CC1' from wiki_pool where pool = 'wp:en:capc' and key = 'en:CC1'));
select t_is('a changed card is replaced', (select card->>'title' = 'CC2 new' from wiki_pool where pool = 'wp:en:capc' and key = 'en:CC2'));

select t_is('big payload columns are left out of table statistics', (select count(*) = 5 from pg_attribute
  where attstattarget = 0 and (attrelid, attname) in (('public.wiki_pool'::regclass, 'card'), ('public.pulls'::regclass, 'cards'),
    ('public.econ'::regclass, 'state'), ('public.cards'::regclass, 'data'), ('public.saves_history'::regclass, 'data'))));
select t_is('the keys the planner needs keep theirs', (select count(*) = 0 from pg_attribute
  where attstattarget = 0 and (attrelid, attname) in (('public.wiki_pool'::regclass, 'pool'), ('public.pulls'::regclass, 'user_id'),
    ('public.cards'::regclass, 'user_id'), ('public.cards'::regclass, 'article_key'))));
