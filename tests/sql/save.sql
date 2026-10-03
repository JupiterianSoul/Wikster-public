reset role;
insert into auth.users (id) values
  ('5a5e0000-0000-0000-0000-000000000001'), ('5a5e0000-0000-0000-0000-000000000002'), ('5a5e0000-0000-0000-0000-000000000003');
insert into profiles (id, username) values
  ('5a5e0000-0000-0000-0000-000000000001', 'sasha'), ('5a5e0000-0000-0000-0000-000000000002', 'sacha'), ('5a5e0000-0000-0000-0000-000000000003', 'sven');
insert into friendships (requester, addressee, status) values ('5a5e0000-0000-0000-0000-000000000001', '5a5e0000-0000-0000-0000-000000000002', 'accepted');
insert into saves (user_id, data) values ('5a5e0000-0000-0000-0000-000000000001', jsonb_build_object(
  'format', 'wikster-save', 'version', 2, 'at', 1000, 'build', jsonb_build_object('sha', 'old', 'at', 100),
  'data', jsonb_build_object(
    'wikster.profile.v1', '{"playMs":0,"started":true}',
    'wikster.theme', 'paper',
    'wikster.collection.v3', '{"entries":{"en:Stale":{"key":"en:Stale","title":"Stale"}}}'),
  'stamps', jsonb_build_object('wikster.profile.v1', 100, 'wikster.collection.v3', 100)));
create temp table said (n integer primary key, j jsonb);
grant all on said to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000001', false);
insert into said values (1, sync_me('{"wikster.theme":{"value":"noir","stamp":5000}}', null, null, '{"sha":"new","at":200}'));
reset role;
select t_is('a player the economy does not hold yet is told so', (select j = '{"live":false}' from said where n = 1));
select t_is('and nothing is written for them', not exists (select 1 from save_keys) and not exists (select 1 from save_meta));

insert into econ (user_id, state) values ('5a5e0000-0000-0000-0000-000000000001', '{"imported":true}');
insert into cards (user_id, article_key, title, rarity_id, price, copies, lang, pack_id, data, favorite) values
  ('5a5e0000-0000-0000-0000-000000000001', 'en:Otter', 'Otter', 'rare', 300, 2, 'en', 'theme|animals', '{"views":120,"thumbnail":"https://x/otter.jpg"}', true);

set role authenticated;
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000001', false);
insert into said values (2, sync_me('{}', null, null, '{"sha":"new","at":200}'));
reset role;
select t_is('the first call seeds the keys from the old save', (select count(*) = 2 from save_keys where user_id = '5a5e0000-0000-0000-0000-000000000001'));
select t_is('a key keeps the stamp it had', (select stamp = 100 from save_keys where key = 'wikster.profile.v1'));
select t_is('a key without a stamp takes the save time', (select stamp = 1000 and value = 'paper' from save_keys where key = 'wikster.theme'));
select t_is('the collection stays with the economy', not exists (select 1 from save_keys where key = 'wikster.collection.v3'));
select t_is('every key comes back on a first call', (select jsonb_array_length(j->'rows') = 2 and (j->>'live')::boolean from said where n = 2));
select t_is('the old save build is kept', (select build->>'sha' = 'old' from save_meta where user_id = '5a5e0000-0000-0000-0000-000000000001'));
select t_is('reading alone writes no backup and no build', (select backup_at is null from save_meta) and (select data->'build'->>'sha' = 'old' from saves where user_id = '5a5e0000-0000-0000-0000-000000000001'));

set role authenticated;
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000001', false);
insert into said values (3, sync_me('{"wikster.theme":{"value":"noir","stamp":5000},"wikster.profile.v1":{"value":"{\"playMs\":1}","stamp":100}}',
  (select (j->>'now')::timestamptz from said where n = 2), '{"playMs":1800000,"showcase":["a","b","c","d","e","f","g","h","i","j","k"]}', '{"sha":"new","at":200}'));
reset role;
select t_is('a newer stamp wins', (select value = 'noir' and stamp = 5000 from save_keys where key = 'wikster.theme'));
select t_is('a tie goes to the server', (select value = '{"playMs":0,"started":true}' from save_keys where key = 'wikster.profile.v1'));
select t_is('and the server copy comes back to the device', (select j->'rows' @> '[{"key":"wikster.profile.v1","stamp":100}]' from said where n = 3));
select t_is('what the device just wrote is not sent back', not (select j->'rows' @> '[{"key":"wikster.theme"}]' from said where n = 3));
select t_is('the first change files a backup of what was there', (select count(*) = 1 from saves_history h where h.user_id = '5a5e0000-0000-0000-0000-000000000001'
  and h.data->>'format' = 'wikster-save' and h.data->'data'->>'wikster.theme' = 'paper' and h.data->'stamps'->>'wikster.theme' = '1000'));
select t_is('the build moves on once something is written', (select build->>'sha' = 'new' from save_meta where user_id = '5a5e0000-0000-0000-0000-000000000001'));
select t_is('and the old save learns it quietly', (select data->'build'->>'sha' = 'new' and data->'data'->>'wikster.theme' = 'paper' from saves where user_id = '5a5e0000-0000-0000-0000-000000000001'));
select t_is('play time and the showcase reach the profile', (select play_ms = 1800000 and jsonb_array_length(showcase) = 10 from profiles where id = '5a5e0000-0000-0000-0000-000000000001'));

set role authenticated;
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000001', false);
insert into said values (4, sync_me('{"wikster.theme":{"value":"mint","stamp":6000}}',
  (select (j->>'now')::timestamptz from said where n = 3), null, '{"sha":"new","at":200}'));
reset role;
select t_is('a second change within ten minutes files no backup', (select count(*) = 1 from saves_history where user_id = '5a5e0000-0000-0000-0000-000000000001'));
update save_meta set backup_at = now() - interval '11 minutes' where user_id = '5a5e0000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000001', false);
insert into said values (5, sync_me('{"wikster.theme":{"value":"rose","stamp":7000},"wikster.profile.v1":{"have":100}}',
  (select (j->>'now')::timestamptz - interval '1 hour' from said where n = 4), null, '{"sha":"new","at":200}'));
reset role;
select t_is('after ten minutes the next change files one', (select count(*) = 2 from saves_history where user_id = '5a5e0000-0000-0000-0000-000000000001'));
select t_is('a key the device already holds is not sent again', (select jsonb_array_length(j->'rows') = 0 from said where n = 5));

update save_meta set build = '{"sha":"newer","at":900}' where user_id = '5a5e0000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000001', false);
insert into said values (6, sync_me('{"wikster.theme":{"value":"old-build","stamp":99999}}', null, '{"playMs":99}', '{"sha":"new","at":200}'));
reset role;
select t_is('an older build is told it is outdated', (select (j->>'outdated')::boolean from said where n = 6));
select t_is('and writes nothing', (select value = 'rose' from save_keys where key = 'wikster.theme')
  and (select play_ms = 1800000 from profiles where id = '5a5e0000-0000-0000-0000-000000000001'));

update saves set data = jsonb_set(jsonb_set(data, '{data,wikster.theme}', '"from-old-app"'), '{stamps}', '{"wikster.theme":8000,"wikster.profile.v1":50}')
  where user_id = '5a5e0000-0000-0000-0000-000000000001';
select t_is('an old app writing the save still reaches the keys when newer', (select value = 'from-old-app' and stamp = 8000 from save_keys where key = 'wikster.theme'));
select t_is('but not over a newer key', (select value = '{"playMs":0,"started":true}' and stamp = 100 from save_keys where key = 'wikster.profile.v1'));
select t_is('the old save write files no backup within ten minutes', (select count(*) = 2 from saves_history where user_id = '5a5e0000-0000-0000-0000-000000000001'));

insert into saves (user_id, data) values ('5a5e0000-0000-0000-0000-000000000003', '{"format":"wikster-save","version":2,"at":1,"data":{"wikster.theme":"a"},"stamps":{}}');
update saves set data = '{"format":"wikster-save","version":2,"at":2,"data":{"wikster.theme":"b"},"stamps":{}}' where user_id = '5a5e0000-0000-0000-0000-000000000003';
update saves set data = '{"format":"wikster-save","version":2,"at":3,"data":{"wikster.theme":"c"},"stamps":{}}' where user_id = '5a5e0000-0000-0000-0000-000000000003';
select t_is('a save written twice in ten minutes keeps one backup', (select count(*) = 1 from saves_history where user_id = '5a5e0000-0000-0000-0000-000000000003'));
select t_is('a player without keys gets none from an old save', not exists (select 1 from save_keys where user_id = '5a5e0000-0000-0000-0000-000000000003'));
select set_config('wikster.quiet', '1', false);
update saves set data = '{"format":"wikster-save","version":2,"at":4,"data":{"wikster.theme":"d"},"stamps":{}}' where user_id = '5a5e0000-0000-0000-0000-000000000003';
select set_config('wikster.quiet', '', false);
update saves_history set at = now() - interval '20 minutes' where user_id = '5a5e0000-0000-0000-0000-000000000003';
update saves set data = '{"format":"wikster-save","version":2,"at":5,"data":{"wikster.theme":"e"},"stamps":{}}' where user_id = '5a5e0000-0000-0000-0000-000000000003';
select t_is('a later write files the next backup', (select count(*) = 2 from saves_history where user_id = '5a5e0000-0000-0000-0000-000000000003'));
insert into saves_history (user_id, reason, data, at)
  select '5a5e0000-0000-0000-0000-000000000003', 'update', '{}', now() - make_interval(days => 2, mins => g) from generate_series(1, 5) g;
select t_is('the nightly pass thins old backups', thin_save_history() >= 4);
select t_is('down to one a day', (select count(*) from saves_history where user_id = '5a5e0000-0000-0000-0000-000000000003' and at < now() - interval '1 day') = 1);

set role authenticated;
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000002', false);
insert into said values (7, friend_cards('5a5e0000-0000-0000-0000-000000000001'));
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000003', false);
insert into said values (8, friend_cards('5a5e0000-0000-0000-0000-000000000001'));
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000001', false);
insert into said values (9, friend_cards('5a5e0000-0000-0000-0000-000000000002'));
select t_fails($q$insert into save_keys (user_id, key, value) values ('5a5e0000-0000-0000-0000-000000000001', 'wikster.theme', 'x')$q$, 'new row violates row-level security policy for table "save_keys"');
select t_is('a player reads their own keys', (select count(*) = 2 from save_keys));
select set_config('request.jwt.claim.sub', '5a5e0000-0000-0000-0000-000000000002', false);
select t_is('and nobody else''s', not exists (select 1 from save_keys));
reset role;
select t_is('a friend sees the cards the economy holds', (select (j->>'cards')::jsonb->'entries'->'en:Otter' @> '{"key":"en:Otter","title":"Otter","rarityId":"rare","price":300,"count":2,"lang":"en","packId":"theme|animals","favorite":true,"views":120}' from said where n = 7));
select t_is('not the stale copy in the old save', (select not ((j->>'cards')::jsonb->'entries' ? 'en:Stale') from said where n = 7));
select t_is('a stranger sees nothing', (select j = '{"allowed":false}' from said where n = 8));
select t_is('a player the economy does not hold yet still shows the old save', (select (j->>'allowed')::boolean and j->'cards' = 'null'::jsonb from said where n = 9));
