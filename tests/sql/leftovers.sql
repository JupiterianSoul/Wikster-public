reset role;
insert into auth.users (id) values ('dddddddd-0000-0000-0000-000000000001'), ('dddddddd-0000-0000-0000-000000000002');
insert into profiles (id, username) values ('dddddddd-0000-0000-0000-000000000001', 'dora'), ('dddddddd-0000-0000-0000-000000000002', 'dimitri');
insert into friendships (requester, addressee, status) values ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'accepted');

insert into pulls (user_id, spec_id, spec, cards) values ('dddddddd-0000-0000-0000-000000000001', 'open|any|std|2', '{}', '[]');
select econ_apply('dddddddd-0000-0000-0000-000000000001', jsonb_build_object(
  'pull', (select nonce from pulls where user_id = 'dddddddd-0000-0000-0000-000000000001'),
  'add', '[{"key":"en:Otter","title":"Otter","rarityId":"rare","price":300,"lang":"en","packId":"open|any|std|2","data":{"views":120000,"thumbnail":"https://x/otter.jpg"}},
           {"key":"custom:Yoda","title":"Yoda","rarityId":"epic","price":900,"packId":"custom|starwars.fandom.com|std|5","data":{}}]'::jsonb,
  'state', '{"progress":{"level":7,"xp":0},"boostersOpened":3,"rarityCounts":{"rare":1,"epic":1,"common":4}}'::jsonb,
  'score', '{"game":"quiz","points":600,"day":"2026-09-23"}'::jsonb));
select t_is('an opening writes its cards into the index', (select title = 'Otter' and rarity = 'rare' and price = 300 and views = 120000 and found_by = 'dddddddd-0000-0000-0000-000000000001' from codex where key = 'en:Otter'));
select t_is('but not the cards from a custom wiki', not exists (select 1 from codex where key = 'custom:Yoda'));
select econ_apply('dddddddd-0000-0000-0000-000000000001', '{"add":[{"key":"en:Heron","title":"Heron","rarityId":"common","price":10}]}');
select t_is('a card that was not pulled stays out of the index', not exists (select 1 from codex where key = 'en:Heron'));

select t_is('the server scores the quiz', (select points from scores where user_id = 'dddddddd-0000-0000-0000-000000000001' and game = 'quiz') = 600);
select t_is('and it reaches the daily board', (select score from leaderboard_daily where user_id = 'dddddddd-0000-0000-0000-000000000001') = 600);
select econ_apply('dddddddd-0000-0000-0000-000000000001', '{"score":{"game":"quiz","points":1000,"day":"2026-09-23"}}');
select t_is('a better quiz replaces the day''s score without counting both', (select score from leaderboard_daily where user_id = 'dddddddd-0000-0000-0000-000000000001') = 1000);
select econ_apply('dddddddd-0000-0000-0000-000000000001', '{"score":{"game":"duel","points":99999,"day":"2026-09-23"}}');
select t_is('a score is capped at the game''s maximum', (select points from scores where user_id = 'dddddddd-0000-0000-0000-000000000001' and game = 'duel') = 3100);
select econ_apply('dddddddd-0000-0000-0000-000000000001', '{"score":{"game":"slots","points":500}}');
select t_is('a game the server does not score is ignored', not exists (select 1 from scores where game = 'slots'));

select t_is('the profile counts the cards the server holds', (select cards = 3 and unique_cards = 3 and collection_value = 1210 from profiles where id = 'dddddddd-0000-0000-0000-000000000001'));
select t_is('and takes level, boosters and best rarity from the server', (select level = 7 and boosters_opened = 3 and best_rarity = 'epic' from profiles where id = 'dddddddd-0000-0000-0000-000000000001'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000001', false);
update profiles set level = 500, cards = 99999, collection_value = 999999999, boosters_opened = 9000, best_rarity = 'prismatic' where id = 'dddddddd-0000-0000-0000-000000000001';
select t_is('a player cannot write their own stats any more', (select level = 7 and cards = 3 and collection_value = 1210 and boosters_opened = 3 and best_rarity = 'epic' from profiles where id = 'dddddddd-0000-0000-0000-000000000001'));
select t_fails($q$select submit_score('wikdle', 1400, '2026-09-23')$q$, 'this game is not scored by the client');
select t_fails($q$insert into codex (key, title, found_by) values ('en:Fake', 'Fake', 'dddddddd-0000-0000-0000-000000000001')$q$, 'new row violates row-level security policy for table "codex"');

do $$ begin
  for i in 1..20 loop
    insert into messages (sender, recipient, body) values ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'hello ' || i);
  end loop;
end $$;
select t_fails($q$insert into messages (sender, recipient, body) values ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'one too many')$q$, 'SLOW_DOWN');
select t_is('twenty messages a minute go through', (select count(*) from messages where sender = 'dddddddd-0000-0000-0000-000000000001') = 20);
update profiles set username = 'dora_a' where id = 'dddddddd-0000-0000-0000-000000000001';
update profiles set username = 'dora_b' where id = 'dddddddd-0000-0000-0000-000000000001';
update profiles set username = 'dora_c' where id = 'dddddddd-0000-0000-0000-000000000001';
select t_fails($q$update profiles set username = 'dora_d' where id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'SLOW_DOWN');
update profiles set play_ms = 5000 where id = 'dddddddd-0000-0000-0000-000000000001';
select t_is('other profile updates are not counted as renames', (select play_ms from profiles where id = 'dddddddd-0000-0000-0000-000000000001') = 5000);
select t_fails($q$select rate_limit('dddddddd-0000-0000-0000-000000000001', 'economy', 1, 60)$q$, 'permission denied for function rate_limit');
select t_is('a player cannot read the blocked wiki list', (select count(*) from blocked_hosts) = 0);

reset role;
insert into blocked_hosts (host, reason) values ('badwiki.example', 'test');
select rate_limit('dddddddd-0000-0000-0000-000000000002', 'economy', 2, 60);
select rate_limit('dddddddd-0000-0000-0000-000000000002', 'economy', 2, 60);
select t_fails($q$select rate_limit('dddddddd-0000-0000-0000-000000000002', 'economy', 2, 60)$q$, 'SLOW_DOWN');

set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000001', false);
select t_is('the export holds the player''s cards, scores and messages', (select jsonb_array_length(d->'cards') = 3 and jsonb_array_length(d->'scores') = 2
  and jsonb_array_length(d->'messages') = 20 and d->'profile'->>'username' = 'dora_c' and d->'wallet' ? 'coins' from (select my_data() as d) x));
select t_is('and nobody else''s', (select not (my_data()::text like '%dddddddd-0000-0000-0000-000000000003%')));
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t_fails($q$select my_data()$q$, 'sign in');

insert into reports (reporter, target, kind, reason) values ('dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'player', 'spam');
insert into blocks (blocker, blocked) values ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002');
delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000001';
do $$
declare r record; n bigint; left_over text := '';
begin
  for r in select c.table_name, c.column_name from information_schema.columns c
             join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
            where c.table_schema = 'public' and c.data_type = 'uuid' and t.table_type = 'BASE TABLE' loop
    execute format('select count(*) from public.%I where %I = %L', r.table_name, r.column_name, 'dddddddd-0000-0000-0000-000000000001') into n;
    if n > 0 then left_over := left_over || r.table_name || '.' || r.column_name || ' '; end if;
  end loop;
  if left_over <> '' then raise exception 'FAIL  a deleted account left rows in %', left_over; end if;
  raise notice 'PASS  deleting the account leaves no row that points at it';
end $$;
select t_is('reports about them stay, without the link to them', (select count(*) from reports where reporter = 'dddddddd-0000-0000-0000-000000000002' and target is null) = 1);

reset role;
select set_config('request.jwt.claim.sub', '', false);
select t_is('one write hands back the fresh state, shelf and asked cards', (select
  (r->'fresh'->'state'->>'rev') = '1' and (r->'fresh'->'inventory'->'open|any|std|5'->>'count') = '2'
  and jsonb_array_length(r->'fresh'->'cards') = 1 and r->'fresh'->'cards'->0->>'article_key' = 'en:Lynx'
  from (select econ_apply('dddddddd-0000-0000-0000-000000000002', '{"coins":700,"state":{"rev":1},"rev":0,
    "inventory":[{"spec_id":"open|any|std|5","spec":{"kind":"open","cards":5},"delta":2}],
    "add":[{"key":"en:Lynx","title":"Lynx","rarityId":"rare","price":50}],"keys":["en:Lynx","en:Nothing"]}') as r) x));
select t_is('one load gives everything an action needs', (select
  (d->'wallet'->>'coins')::int = 700 and d->'state'->>'rev' = '1' and d->'inventory' ? 'open|any|std|5'
  and jsonb_typeof(d->'custom') = 'array' and (d->>'born') is not null and (d->>'cutover') is not null
  from (select econ_load('dddddddd-0000-0000-0000-000000000002') as d) x));
select econ_load('dddddddd-0000-0000-0000-000000000002', 'load-test', 1);
select t_fails($q$select econ_load('dddddddd-0000-0000-0000-000000000002', 'load-test', 1)$q$, 'SLOW_DOWN');
