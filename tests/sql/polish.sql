reset role;
insert into auth.users (id) values
  ('d8d8d8d8-0000-0000-0000-000000000001'), ('d8d8d8d8-0000-0000-0000-000000000002'),
  ('d8d8d8d8-0000-0000-0000-000000000003'), ('d8d8d8d8-0000-0000-0000-000000000004')
  on conflict do nothing;
insert into admins (id) values ('d8d8d8d8-0000-0000-0000-000000000001') on conflict do nothing;
insert into profiles (id, username, level, created_at, last_seen_at) values
  ('d8d8d8d8-0000-0000-0000-000000000001', 'boss_p', 60, now() - interval '400 days', now()),
  ('d8d8d8d8-0000-0000-0000-000000000002', 'pia_p', 21, now() - interval '3 days', now() - interval '1 hour'),
  ('d8d8d8d8-0000-0000-0000-000000000003', 'quinn_p', 22, now() - interval '200 days', now() - interval '90 days'),
  ('d8d8d8d8-0000-0000-0000-000000000004', 'rue_p', 23, now() - interval '50 days', now() - interval '20 days')
  on conflict (id) do nothing;
insert into econ (user_id, state) values
  ('d8d8d8d8-0000-0000-0000-000000000002', '{"owned": {"supporter": ["editor"]}}'),
  ('d8d8d8d8-0000-0000-0000-000000000003', '{"owned": {"supporter": []}}')
  on conflict (user_id) do update set state = excluded.state;
insert into save_keys (user_id, key, value, stamp) values ('d8d8d8d8-0000-0000-0000-000000000002', 'wikster.language', 'fr', 1)
  on conflict do nothing;
insert into push_tokens (token, user_id, platform, lang) values ('token-for-rue-polish-000000000001', 'd8d8d8d8-0000-0000-0000-000000000004', 'android', 'fr')
  on conflict do nothing;
insert into guilds (id, name, tag, owner, members) values ('d8d8d8d8-0000-0000-0000-0000000000aa', 'Polish Club', 'POL', 'd8d8d8d8-0000-0000-0000-000000000003', 1)
  on conflict do nothing;
insert into guild_members (user_id, guild_id) values ('d8d8d8d8-0000-0000-0000-000000000003', 'd8d8d8d8-0000-0000-0000-0000000000aa') on conflict do nothing;
insert into admin_packs (id, name, source, default_cards) values ('pack-polish', '{"en": "Polish", "fr": "Polish"}', '{"type": "search", "value": "polish"}', 4)
  on conflict do nothing;

drop table if exists pg_got;
create table pg_got (n integer primary key, j jsonb);
grant all on pg_got to authenticated;

select t_as('d8d8d8d8-0000-0000-0000-000000000002', true);
set role authenticated;
select t_fails($q$select admin_log_list(null, 10, '{}')$q$, 'FORBIDDEN');
select t_fails($q$select admin_grant_cancel(array[1]::bigint[])$q$, 'FORBIDDEN');
select t_fails($q$select admin_reports('open', '{}', 10, 0)$q$, 'FORBIDDEN');
select t_fails($q$select admin_names(array['d8d8d8d8-0000-0000-0000-000000000003']::uuid[])$q$, 'FORBIDDEN');
reset role;
select t_as('d8d8d8d8-0000-0000-0000-000000000001', false);
set role authenticated;
select t_fails($q$select admin_words(null, 10, 0)$q$, 'FORBIDDEN');
reset role;
select t_is('the checkers are not callable by players', not has_function_privilege('authenticated', 'public.admin_items_check(jsonb, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_spec_check(jsonb)', 'execute'));
select t_is('every new Control call is callable by Control', (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')
  and not has_function_privilege('anon', p.oid, 'execute') and p.prosecdef)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_log_list', 'admin_grant_cancel', 'admin_reports',
    'admin_report_act', 'admin_words', 'admin_word_add', 'admin_word_remove', 'admin_filter_hits', 'admin_wikis', 'admin_custom_packs',
    'admin_host_block', 'admin_host_unblock', 'admin_custom_pack_delete', 'admin_announcements', 'admin_guilds', 'admin_auctions',
    'admin_board', 'admin_names', 'admin_note_set', 'admin_auction_cancel', 'admin_auctions_cancel')));

select t_as('d8d8d8d8-0000-0000-0000-000000000001', true);

drop table if exists shapes;
create table shapes (n integer, item jsonb);
grant all on shapes to authenticated;
insert into shapes values
  (1, '{"kind": "booster", "spec": {"kind": "theme", "themeId": "cars", "cards": 1}, "count": 2}'),
  (2, '{"kind": "booster", "spec": {"kind": "open", "rarityId": "epic", "cards": 12}}'),
  (3, '{"kind": "booster", "spec": {"kind": "custom", "cards": 5, "wiki": {"apiUrl": "https://starwars.fandom.com/api.php", "sitename": "SW"}, "customName": "Star Wars"}, "count": 1}'),
  (4, '{"kind": "booster", "spec": {"kind": "theme", "themeId": "pack-polish", "rarityId": "rare", "cards": 3}}'),
  (5, '{"kind": "booster", "spec": {"kind": "today", "day": "2026-10-02", "cards": 5}}'),
  (6, '{"kind": "card", "card": {"article": {"key": "en:Otter", "title": "Otter"}, "rarityId": "rare", "count": 2}}'),
  (7, '{"kind": "card", "article": {"key": "en:Otter", "title": "Otter"}, "rarityId": "rare", "count": 2}'),
  (8, '{"kind": "owned", "bucket": "frames", "id": "metal"}'),
  (9, '{"kind": "owned", "bucket": "themes", "ids": ["aurora", "noir", "aurora"]}'),
  (10, '{"kind": "coins", "amount": 250}'),
  (11, '{"kind": "ink", "amount": 7}'),
  (12, '{"kind": "xp", "amount": 90}'),
  (13, '{"kind": "level", "value": 7}'),
  (14, '{"kind": "boostersOpened", "value": 12}');

select t_is('a nested card and a flat card come out the same',
  admin_item_check((select item from shapes where n = 6), 'grant') = admin_item_check((select item from shapes where n = 7), 'code'));
select t_is('a booster spec is filled in the same way everywhere',
  admin_item_check((select item from shapes where n = 1), 'grant')->'spec' = '{"kind": "theme", "themeId": "cars", "rarityId": null, "cards": 1}'::jsonb
  and admin_item_check((select item from shapes where n = 1), 'code') = admin_item_check((select item from shapes where n = 1), 'grant'));
select t_is('a custom booster keeps its wiki and name', (select x->'spec' = '{"kind": "custom", "themeId": null, "rarityId": null, "cards": 5,
  "wiki": {"apiUrl": "https://starwars.fandom.com/api.php", "sitename": "SW"}, "customName": "Star Wars"}'::jsonb
  from admin_item_check((select item from shapes where n = 3), 'grant') x));
select t_is('a custom booster from the wiki finder keeps its topic, language and mature mark', admin_spec_check('{"kind": "custom", "cards": 4,
  "wiki": {"apiUrl": "https://en.wikipedia.org/w/api.php", "sitename": "Wikipedia", "topic": "Volcano", "lang": "en", "mature": true, "server": "https://en.wikipedia.org"},
  "customName": "Volcano", "customTagline": "Wikipedia · Volcano", "icon": "wand", "accent": "#a78bfa", "accent2": "#4c1d95"}')
  = '{"kind": "custom", "themeId": null, "rarityId": null, "cards": 4, "wiki": {"apiUrl": "https://en.wikipedia.org/w/api.php", "sitename": "Wikipedia",
  "topic": "Volcano", "lang": "en", "mature": true}, "customName": "Volcano", "customTagline": "Wikipedia · Volcano", "icon": "wand", "accent": "#a78bfa", "accent2": "#4c1d95"}'::jsonb);
select t_is('a bad language and a mature mark that is not true are dropped', admin_spec_check('{"kind": "custom", "cards": 4,
  "wiki": {"apiUrl": "https://starwars.fandom.com/api.php", "lang": "EN_us", "mature": "yes"}}')->'wiki' = '{"apiUrl": "https://starwars.fandom.com/api.php"}'::jsonb);
select t_is('several cosmetics are kept once each', admin_item_check((select item from shapes where n = 9), 'code')
  = '{"kind": "owned", "bucket": "themes", "ids": ["aurora", "noir"]}'::jsonb);
select t_is('every shape passes in a grant and in a code alike', (select bool_and(admin_item_check(item, 'grant') = admin_item_check(item, 'code')) from shapes));

set role authenticated;
insert into pg_got values (1, admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', (select jsonb_agg(item order by n) from shapes), null, 'shapes'));
insert into pg_got values (2, admin_code_create(jsonb_build_object('code', 'POLISHALL', 'items', (select jsonb_agg(item order by n) from shapes))));
reset role;
select t_is('a grant takes every shape', (select (j->>'rows')::int = 14 from pg_got where n = 1));
select t_is('and returns its log at once', (select (j->>'log')::bigint = (select id from admin_log where kind = 'grant' and batch = (j->>'batch')::uuid) from pg_got where n = 1));
select t_is('the grant rows hold the checked shapes', (select count(*) = 2 from grants g where g.batch = (select (j->>'batch')::uuid from pg_got where n = 1)
  and g.kind = 'card' and g.payload = '{"article": {"key": "en:Otter", "title": "Otter"}, "rarityId": "rare", "count": 2}'::jsonb));
select t_is('level and boosters opened are patches', (select count(*) = 2 from grants g where g.batch = (select (j->>'batch')::uuid from pg_got where n = 1) and g.kind = 'profile'));
select t_is('a code takes every shape too', (select jsonb_array_length(j->'items') = 14 and (j->>'log')::bigint is not null from pg_got where n = 2));
select t_is('and stores them checked, exactly as a grant sees them', (select items = admin_items_check((select jsonb_agg(item order by n) from shapes), 'grant')
  from redeem_codes where code = 'POLISHALL'));
select t_is('the economy hands those items over as stored', (select x->'items' = (select items from redeem_codes where code = 'POLISHALL')
  from econ_code_take('d8d8d8d8-0000-0000-0000-000000000002', 'POLISHALL') x));
select t_is('the grant log keeps the checked items', (select detail->'items' = admin_items_check((select jsonb_agg(item order by n) from shapes), 'grant')
  from admin_log where id = (select (j->>'log')::bigint from pg_got where n = 1)));

set role authenticated;
insert into pg_got values (3, admin_event_upsert(jsonb_build_object('name', 'Polish gift', 'kind', 'free_packs',
  'params', jsonb_build_object('spec', (select item->'spec' from shapes where n = 3), 'count', 2), 'ends_at', now() + interval '1 day')));
insert into pg_got values (4, admin_event_upsert(jsonb_build_object('name', 'Polish shelf', 'kind', 'limited_booster',
  'params', jsonb_build_object('spec', (select item->'spec' from shapes where n = 4), 'price', 300), 'ends_at', now() + interval '1 day')));
insert into pg_got values (5, admin_event_upsert(jsonb_build_object('name', 'Polish today', 'kind', 'free_packs',
  'params', jsonb_build_object('spec', (select item->'spec' from shapes where n = 5)), 'ends_at', now() + interval '1 day')));
reset role;
select t_is('an event takes a custom booster, stored checked', (select j->'params'->'spec' = admin_spec_check((select item->'spec' from shapes where n = 3))
  and (j->>'log')::bigint is not null from pg_got where n = 3));
select t_is('and one of your own boosters', (select j->'params'->'spec' = admin_item_check((select item from shapes where n = 4), 'grant')->'spec' from pg_got where n = 4));
select t_is('and a Wikipedia Today one', (select j->'params'->'spec'->>'day' = '2026-10-02' from pg_got where n = 5));

set role authenticated;
select t_fails($q$select admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "card", "card": {"article": {"title": "No key"}}}]', null, null)$q$, 'BAD_CARD');
select t_fails($q$select admin_code_create('{"items": [{"kind": "card", "article": {"title": "No key"}}]}')$q$, 'BAD_CARD');
select t_fails($q$select admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "booster", "spec": {"kind": "theme", "themeId": "pack-nope", "cards": 3}}]', null, null)$q$, 'BAD_SPEC');
select t_fails($q$select admin_code_create('{"items": [{"kind": "booster", "spec": {"kind": "theme", "themeId": "pack-nope", "cards": 3}}]}')$q$, 'BAD_SPEC');
select t_fails($q$select admin_event_upsert('{"name": "Bad", "kind": "free_packs", "params": {"spec": {"kind": "theme", "themeId": "pack-nope", "cards": 3}}, "ends_at": "2099-01-01"}')$q$, 'BAD_PARAMS');
select t_fails($q$select admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "booster", "spec": {"kind": "custom", "cards": 3}}]', null, null)$q$, 'BAD_SPEC');
select t_fails($q$select admin_code_create('{"items": [{"kind": "booster", "spec": {"kind": "custom", "cards": 3, "wiki": {"apiUrl": "ftp://x"}}}]}')$q$, 'BAD_SPEC');
select t_fails($q$select admin_event_upsert('{"name": "Bad", "kind": "limited_booster", "params": {"spec": {"kind": "open", "cards": "3"}, "price": 5}, "ends_at": "2099-01-01"}')$q$, 'BAD_PARAMS');
select t_fails($q$select admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "booster", "spec": {"kind": "timed", "cards": 3}}]', null, null)$q$, 'BAD_SPEC');
select t_fails($q$select admin_code_create('{"items": [{"kind": "coins", "amount": -5}]}')$q$, 'BAD_AMOUNT');
select t_fails($q$select admin_code_create('{"items": [{"kind": "takeCard", "key": "en:Otter"}]}')$q$, 'BAD_KIND');
select t_fails($q$select admin_code_create('{"items": [{"kind": "revokeOwned", "bucket": "frames", "id": "metal"}]}')$q$, 'BAD_KIND');
select t_fails($q$select admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "level", "value": 501}]', null, null)$q$, 'BAD_LEVEL');
select t_fails($q$select admin_code_create('{"items": [{"kind": "level", "value": 0}]}')$q$, 'BAD_LEVEL');
select t_fails($q$select admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "owned", "bucket": "frames", "ids": []}]', null, null)$q$, 'BAD_OWNED');
select t_fails($q$select admin_code_create('{"items": [{"kind": "booster", "spec": {"kind": "open", "cards": 2}, "count": 101}]}')$q$, 'BAD_COUNT');
select t_fails($q$select admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "card", "article": {"key": "en:Otter"}, "rarityId": "golden"}]', null, null)$q$, 'BAD_CARD');
insert into pg_got values (6, admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002"]}', '[{"kind": "coins", "amount": -40}, {"kind": "takeCard", "key": "en:Otter"}, {"kind": "revokeOwned", "bucket": "frames", "id": "metal"}]', null, 'take back'));
reset role;
select t_is('a grant may still take things away', (select (j->>'rows')::int = 3 from pg_got where n = 6));

delete from realtime.messages;
set role authenticated;
insert into pg_got values (10, admin_grant('{"ids": ["d8d8d8d8-0000-0000-0000-000000000002", "d8d8d8d8-0000-0000-0000-000000000004"]}',
  '[{"kind": "coins", "amount": 11}, {"kind": "xp", "amount": 5}]', 'hello', 'for cancel'));
reset role;
update grants set claimed_at = now() where batch = (select (j->>'batch')::uuid from pg_got where n = 10)
  and user_id = 'd8d8d8d8-0000-0000-0000-000000000004' and kind = 'coins';
drop table if exists cancel_ids;
create table cancel_ids as select array_agg(id order by id) as ids from grants where batch = (select (j->>'batch')::uuid from pg_got where n = 10);
grant all on cancel_ids to authenticated;
set role authenticated;
insert into pg_got values (11, admin_grant_cancel((select ids || array[-5::bigint] from cancel_ids)));
reset role;
select t_is('take back removes only what was not claimed', (select (j->>'ok')::boolean and (j->>'cancelled')::int = 3 from pg_got where n = 11)
  and (select count(*) = 1 from grants where batch = (select (j->>'batch')::uuid from pg_got where n = 10)));
select t_is('and says why the rest stayed', (select j->'refused' @> '[{"reason": "already claimed"}, {"id": -5, "reason": "not found"}]'::jsonb
  and jsonb_array_length(j->'refused') = 2 from pg_got where n = 11));
select t_is('it is logged with an undo', (select kind = 'grant-cancel' and undo->>'op' = 'regrant' and jsonb_array_length(undo->'rows') = 3 and target is null
  from admin_log where id = (select (j->>'log')::bigint from pg_got where n = 11)));
set role authenticated;
insert into pg_got values (12, admin_grant_cancel((select ids from cancel_ids)));
reset role;
select t_is('taking back twice changes nothing and says so', (select not (j->>'ok')::boolean and (j->>'cancelled')::int = 0 and j->'log' = 'null'::jsonb from pg_got where n = 12));
delete from realtime.messages;
set role authenticated;
insert into pg_got values (13, admin_undo((select (j->>'log')::bigint from pg_got where n = 11)));
reset role;
select t_is('undoing a take back puts the gifts back', (select (j->>'ok')::boolean and (j->'detail'->>'restored')::int = 3 and (j->>'log')::bigint is not null from pg_got where n = 13)
  and (select count(*) = 4 from grants where batch = (select (j->>'batch')::uuid from pg_got where n = 10)));
select t_is('and the players hear about it', (select count(distinct topic) = 2 from realtime.messages where event = 'grant'));

set role authenticated;
insert into pg_got values (20, admin_log_list(null, 3, '{}'));
insert into pg_got values (21, admin_log_list((select (j->>'next')::bigint from pg_got where n = 20), 3, '{}'));
insert into pg_got values (22, admin_log_list(null, 50, '{"kind": "grant-cancel"}'));
insert into pg_got values (23, admin_log_list(null, 50, '{"player": "d8d8d8d8-0000-0000-0000-000000000002", "kind": "grant"}'));
insert into pg_got values (24, admin_log_list(null, 50, jsonb_build_object('from', now() + interval '1 day')));
insert into pg_got values (25, admin_log_list(null, 50, jsonb_build_object('batch', (select j->>'batch' from pg_got where n = 10))));
reset role;
select t_is('the log comes newest first, a page at a time', (select jsonb_array_length(j->'rows') = 3 and (j->>'more')::boolean
  and (j->'rows'->0->>'id')::bigint > (j->'rows'->2->>'id')::bigint and (j->>'next')::bigint = (j->'rows'->2->>'id')::bigint
  and (j->>'total')::int = (select count(*) from admin_log) from pg_got where n = 20));
select t_is('the next page starts where the last stopped', (select (a.j->'rows'->0->>'id')::bigint < (b.j->>'next')::bigint and a.j->'total' = 'null'::jsonb
  from pg_got a, pg_got b where a.n = 21 and b.n = 20));
select t_is('rows carry names and never the raw undo', (select bool_and(r ? 'actor_name' and r ? 'undoable' and r ? 'undone_at' and r ? 'batch' and not (r ? 'undo'))
  from pg_got, jsonb_array_elements(j->'rows') r where n = 20));
select t_is('filtering by kind', (select jsonb_array_length(j->'rows') = 1 and j->'rows'->0->>'kind' = 'grant-cancel' and (j->'rows'->0->>'undone_at') is not null
  and not (j->'rows'->0->>'undoable')::boolean and j->'rows'->0->>'why' = 'already undone' from pg_got where n = 22));
select t_is('by player', (select (j->>'total')::int >= 2 and bool_and(r->>'target' = 'd8d8d8d8-0000-0000-0000-000000000002' and r->>'kind' like '%grant%')
  from pg_got, jsonb_array_elements(j->'rows') r where n = 23 group by j));
select t_is('by date', (select jsonb_array_length(j->'rows') = 0 and (j->>'total')::int = 0 from pg_got where n = 24));
select t_is('and by batch', (select jsonb_array_length(j->'rows') = 1 and j->'rows'->0->>'kind' = 'grant' and (j->'rows'->0->>'undoable')::boolean from pg_got where n = 25));
update grants set claimed_at = now() where batch = (select (j->>'batch')::uuid from pg_got where n = 10) and kind = 'xp';
update grants set claimed_at = now() where batch = (select (j->>'batch')::uuid from pg_got where n = 10) and kind = 'coins';
select t_is('a grant whose coins were claimed can still be undone', (select (admin_log_undoable(l)->>'undoable')::boolean from admin_log l
  where l.batch = (select (j->>'batch')::uuid from pg_got where n = 10) and l.kind = 'grant'));
delete from grants where batch = (select (j->>'batch')::uuid from pg_got where n = 10) and kind = 'coins';
select t_is('one with only xp left says why not', (select not (x->>'undoable')::boolean and x->>'why' like 'what was claimed%'
  from admin_log l, admin_log_undoable(l) x where l.batch = (select (j->>'batch')::uuid from pg_got where n = 10) and l.kind = 'grant'));
select t_is('the player page links each gift to its log', (select bool_and((g->>'log')::bigint = (select (j->>'log')::bigint from pg_got where n = 1))
  from jsonb_array_elements(admin_player('d8d8d8d8-0000-0000-0000-000000000002')->'grants') g
  where g->>'batch' = (select j->>'batch' from pg_got where n = 1)));

set role authenticated;
insert into pg_got values (30, admin_audience('{"inactive_days": 30}'));
insert into pg_got values (31, admin_audience(jsonb_build_object('joined_after', now() - interval '10 days')));
insert into pg_got values (32, admin_audience(jsonb_build_object('joined_before', now() - interval '100 days', 'level_min', 20)));
insert into pg_got values (33, admin_audience('{"supporter": true}'));
insert into pg_got values (34, admin_audience('{"supporter": "editor"}'));
insert into pg_got values (35, admin_audience('{"supporter": false, "level_min": 21, "level_max": 23}'));
insert into pg_got values (36, admin_audience('{"lang": "fr", "level_min": 21, "level_max": 23}'));
insert into pg_got values (37, admin_audience('{"has_guild": true, "level_min": 21, "level_max": 23}'));
insert into pg_got values (38, admin_audience('{"has_guild": false, "level_min": 21, "level_max": 23}'));
insert into pg_got values (39, admin_audience('{"inactive_days": "30"}'));
insert into pg_got values (40, admin_audience('{"supporter": 1}'));
insert into pg_got values (41, admin_audience('{"lang": "de"}'));
insert into pg_got values (42, admin_audience('{"has_guild": "yes"}'));
insert into pg_got values (43, admin_audience('{"joined_after": "not a date"}'));
insert into pg_got values (44, admin_audience('{"level_min": 21, "colour": "blue"}'));
insert into pg_got values (45, admin_audience('{"inactive_days": 0}'));
insert into pg_got values (46, admin_push_preview('{"has_guild": false, "level_min": 21, "level_max": 23}'));
reset role;
select t_is('inactive days finds who has been away', (select (j->>'count')::int = (select count(*) from profiles where last_seen_at <= now() - interval '30 days')
  and j->'sample' @> '[{"username": "quinn_p"}]' from pg_got where n = 30));
select t_is('joined after finds the newcomers', (select j->'sample' @> '[{"username": "pia_p"}]' and not j->'sample' @> '[{"username": "quinn_p"}]' from pg_got where n = 31));
select t_is('joined before finds the old hands', (select (j->>'count')::int >= 1 and j->'sample' @> '[{"username": "quinn_p"}]'
  and not j->'sample' @> '[{"username": "pia_p"}]' from pg_got where n = 32));
select t_is('supporter true finds a supporter', (select j->'sample' @> '[{"username": "pia_p"}]' and not j->'sample' @> '[{"username": "quinn_p"}]' from pg_got where n = 33));
select t_is('a tier finds that tier', (select (j->>'count')::int = 1 and j->'sample'->0->>'username' = 'pia_p' from pg_got where n = 34));
select t_is('supporter false finds the rest', (select (j->>'count')::int = 2 and not j->'sample' @> '[{"username": "pia_p"}]' from pg_got where n = 35));
select t_is('lang reads the game setting, then the phone', (select (j->>'count')::int = 2 and j->'sample' @> '[{"username": "pia_p"}, {"username": "rue_p"}]' from pg_got where n = 36));
select t_is('has guild finds members', (select (j->>'count')::int = 1 and j->'sample'->0->>'username' = 'quinn_p' from pg_got where n = 37));
select t_is('and the guildless', (select (j->>'count')::int = 2 and not j->'sample' @> '[{"username": "quinn_p"}]' from pg_got where n = 38));
select t_is('a wrong type reaches nobody', (select bool_and((j->>'count')::int = 0) from pg_got where n between 39 and 45));
select t_is('the push preview understands the new conditions', (select (j->>'users')::int = 1 and (j->>'devices')::int = 1 from pg_got where n = 46));

insert into reports (reporter, target, kind, reason, note, evidence, urgent) values
  ('d8d8d8d8-0000-0000-0000-000000000002', 'd8d8d8d8-0000-0000-0000-000000000004', 'message', 'spam', 'every day',
    '{"body": "buy coins here", "username": "rue_p", "level": 23}', false),
  ('d8d8d8d8-0000-0000-0000-000000000003', 'd8d8d8d8-0000-0000-0000-000000000004', 'player', 'threat', '', '{"username": "rue_p"}', true);
set role authenticated;
insert into pg_got values (50, admin_reports('open', '{"target": "d8d8d8d8-0000-0000-0000-000000000004"}', 1, 0));
insert into pg_got values (51, admin_reports('open', '{"q": "coins"}', 10, 0));
insert into pg_got values (52, admin_reports('all', '{"urgent": true, "reason": "threat", "reporter": "d8d8d8d8-0000-0000-0000-000000000003"}', 10, 0));
reset role;
select t_is('reports are paged with names, urgent first', (select (j->>'total')::int = 2 and jsonb_array_length(j->'rows') = 1 and (j->'rows'->0->>'urgent')::boolean
  and j->'rows'->0->>'target_name' = 'rue_p' and j->'rows'->0->>'reporter_name' = 'quinn_p' and (j->>'open')::int >= 2 from pg_got where n = 50));
select t_is('and searchable', (select (j->>'total')::int = 1 and j->'rows'->0->>'reason' = 'spam' from pg_got where n = 51));
select t_is('and filtered', (select (j->>'total')::int = 1 from pg_got where n = 52));
set role authenticated;
select t_fails($q$select admin_reports('closed', '{}', 10, 0)$q$, 'BAD_STATUS');
select t_fails($q$select admin_report_act(array[1]::bigint[], 'ban', null)$q$, 'BAD_ACTION');
insert into pg_got values (53, admin_report_act((select array_agg(id) from reports where target = 'd8d8d8d8-0000-0000-0000-000000000004'), 'action', 'muted for a day'));
reset role;
select t_is('acting on reports closes them with the outcome', (select (j->>'reports')::int = 2 and (j->>'log')::bigint is not null from pg_got where n = 53)
  and (select bool_and(status = 'actioned' and outcome = 'muted for a day' and handled_by = 'd8d8d8d8-0000-0000-0000-000000000001')
    from reports where target = 'd8d8d8d8-0000-0000-0000-000000000004'));
select t_is('and the reporter is told', (select count(*) = 2 from reports where target = 'd8d8d8d8-0000-0000-0000-000000000004' and seen_at is null and status <> 'open'));
set role authenticated;
insert into pg_got values (54, admin_undo((select (j->>'log')::bigint from pg_got where n = 53)));
insert into pg_got values (55, admin_report_act((select array_agg(id) from reports where target = 'd8d8d8d8-0000-0000-0000-000000000004' and kind = 'message'), 'delete_evidence', null));
reset role;
select t_is('undo reopens them', (select (j->>'ok')::boolean from pg_got where n = 54)
  and (select bool_and(status = 'open' and outcome = '' and handled_at is null) from reports where target = 'd8d8d8d8-0000-0000-0000-000000000004'));
select t_is('deleting evidence keeps only who it was about', (select evidence = '{"username": "rue_p", "level": 23, "removed": true}'::jsonb
  from reports where target = 'd8d8d8d8-0000-0000-0000-000000000004' and kind = 'message'));
select t_is('and cannot be undone', (select undo is null and kind = 'report-evidence' from admin_log where id = (select (j->>'log')::bigint from pg_got where n = 55)));

set role authenticated;
select t_fails($q$select admin_word_add('', 'slur', 'word')$q$, 'BAD_TERM');
select t_fails($q$select admin_word_add('zorp', 'rude', 'word')$q$, 'BAD_TIER');
select t_fails($q$select admin_word_add('zorp', 'profanity', 'loose')$q$, 'BAD_MODE');
insert into pg_got values (60, admin_word_add('  Zorpword ', 'profanity', 'word'));
insert into pg_got values (61, admin_words('zorp', 10, 0));
reset role;
select t_is('a word is added in lower case and listed', (select j->>'term' = 'zorpword' and (j->>'log')::bigint is not null from pg_got where n = 60)
  and (select (j->>'total')::int = 1 and j->'rows'->0->>'tier' = 'profanity' from pg_got where n = 61));
select t_is('and the filter uses it at once', text_flag('you zorpword', 'name') is not null);
set role authenticated;
insert into pg_got values (62, admin_word_remove('zorpword'));
insert into pg_got values (63, admin_undo((select (j->>'log')::bigint from pg_got where n = 62)));
reset role;
select t_is('removing a word is undone by putting it back', (select (j->>'ok')::boolean from pg_got where n = 63) and exists (select 1 from blocked_terms where term = 'zorpword'));
set role authenticated;
insert into pg_got values (64, admin_undo((select (j->>'log')::bigint from pg_got where n = 60)));
reset role;
select t_is('and adding one by taking it out', (select (j->>'ok')::boolean from pg_got where n = 64) and not exists (select 1 from blocked_terms where term = 'zorpword'));

insert into filter_hits (user_id, scope, reason, body) values
  ('d8d8d8d8-0000-0000-0000-000000000004', 'chat', 'CONTACT', 'add me on snapchat'),
  ('d8d8d8d8-0000-0000-0000-000000000004', 'name', 'SLUR', 'something else');
set role authenticated;
insert into pg_got values (70, admin_filter_hits('snap', '{"user": "d8d8d8d8-0000-0000-0000-000000000004"}', 10, 0));
insert into pg_got values (71, admin_filter_hits(null, '{"user": "d8d8d8d8-0000-0000-0000-000000000004"}', 1, 1));
reset role;
select t_is('filter hits are searchable with names', (select (j->>'total')::int = 1 and j->'rows'->0->>'username' = 'rue_p' from pg_got where n = 70));
select t_is('and paged', (select (j->>'total')::int = 2 and jsonb_array_length(j->'rows') = 1 from pg_got where n = 71));

insert into custom_packs (user_id, id, def) values
  ('d8d8d8d8-0000-0000-0000-000000000002', 'sw', '{"name": "Star Wars", "wiki": {"apiUrl": "https://starwars.fandom.com/api.php"}}'),
  ('d8d8d8d8-0000-0000-0000-000000000004', 'sw2', '{"name": "Wookiees", "wiki": {"apiUrl": "https://starwars.fandom.com/api.php"}}');
set role authenticated;
select t_fails($q$select admin_host_block('x', null)$q$, 'BAD_HOST');
insert into pg_got values (80, admin_host_block('https://StarWars.fandom.com/wiki/Main', 'spoilers'));
insert into pg_got values (81, admin_wikis(null));
insert into pg_got values (82, admin_custom_packs('starwars.fandom.com', 10, 0));
insert into pg_got values (83, admin_custom_pack_delete('d8d8d8d8-0000-0000-0000-000000000004', 'sw2'));
reset role;
select t_is('a host is blocked from a pasted link', (select j->>'host' = 'starwars.fandom.com' from pg_got where n = 80)
  and exists (select 1 from blocked_hosts where host = 'starwars.fandom.com' and reason = 'spoilers'));
select t_is('the wiki list counts players and shows the block', (select (w->>'players')::int = 2 and (w->>'blocked')::boolean and w->'names' @> '["Star Wars"]'
  from pg_got, jsonb_array_elements(j) w where n = 81 and w->>'host' = 'starwars.fandom.com'));
select t_is('its boosters are listed with their makers', (select (j->>'total')::int = 2 and j->'rows' @> '[{"username": "rue_p", "id": "sw2"}]' from pg_got where n = 82));
select t_is('a custom booster can be deleted', not exists (select 1 from custom_packs where id = 'sw2')
  and (select (j->>'log')::bigint is not null from pg_got where n = 83));
set role authenticated;
insert into pg_got values (84, admin_undo((select (j->>'log')::bigint from pg_got where n = 83)));
insert into pg_got values (85, admin_host_unblock('starwars.fandom.com'));
reset role;
select t_is('and brought back', (select (j->>'ok')::boolean from pg_got where n = 84) and exists (select 1 from custom_packs where id = 'sw2'));
select t_is('a host is unblocked', not exists (select 1 from blocked_hosts where host = 'starwars.fandom.com') and (select (j->>'deleted')::boolean from pg_got where n = 85));
set role authenticated;
insert into pg_got values (86, admin_undo((select (j->>'log')::bigint from pg_got where n = 85)));
reset role;
select t_is('and blocked again by undo', exists (select 1 from blocked_hosts where host = 'starwars.fandom.com'));
delete from blocked_hosts where host = 'starwars.fandom.com';

insert into auctions (seller, seller_name, card, start_price, ends_at) values
  ('d8d8d8d8-0000-0000-0000-000000000002', 'pia_p', '{"key": "en:Kiwi", "title": "Kiwi", "rarityId": "rare", "price": 50}', 10, now() + interval '1 hour'),
  ('d8d8d8d8-0000-0000-0000-000000000002', 'pia_p', '{"key": "en:Emu", "title": "Emu", "rarityId": "rare", "price": 50}', 10, now() - interval '1 hour'),
  ('d8d8d8d8-0000-0000-0000-000000000004', 'rue_p', '{"key": "en:Moa", "title": "Moa", "rarityId": "rare", "price": 50}', 10, now() + interval '2 hours');
set role authenticated;
insert into pg_got values (90, admin_auctions('{"seller": "d8d8d8d8-0000-0000-0000-000000000002"}', 10, 0));
insert into pg_got values (91, admin_auctions('{"q": "moa"}', 10, 0));
insert into pg_got values (92, admin_auctions('{"expired": true, "seller": "d8d8d8d8-0000-0000-0000-000000000002"}', 10, 0));
select t_fails($q$select admin_auctions('{"status": "sold"}', 10, 0)$q$, 'BAD_STATUS');
select t_fails($q$select admin_auctions_cancel(null, false)$q$, 'NO_TARGET');
reset role;
select t_is('open lots are listed ending soonest first', (select (j->>'total')::int = 2 and j->'rows'->0->'card'->>'title' = 'Emu' from pg_got where n = 90));
select t_is('and searchable', (select (j->>'total')::int = 1 and j->'rows'->0->>'seller_name' = 'rue_p' from pg_got where n = 91));
select t_is('and filtered to the expired ones', (select (j->>'total')::int = 1 from pg_got where n = 92));
select t_as(null, false);
select econ_give_card('d8d8d8d8-0000-0000-0000-000000000004', '{"key": "en:Takahe", "title": "Takahe", "rarityId": "rare", "price": 300}');
insert into pg_got values (93, econ_auction_create('d8d8d8d8-0000-0000-0000-000000000004', 'en:Takahe', 100, 60));
select t_as('d8d8d8d8-0000-0000-0000-000000000001', true);
set role authenticated;
insert into pg_got values (94, admin_auction_cancel((select (j->>'id')::uuid from pg_got where n = 93)));
insert into pg_got values (95, admin_auction_cancel((select (j->>'id')::uuid from pg_got where n = 93)));
insert into pg_got values (96, admin_auctions_cancel('d8d8d8d8-0000-0000-0000-000000000002', true));
reset role;
select t_is('pulling a lot answers with its log', (select (j->>'ok')::boolean and (j->>'log')::bigint = (select max(id) from admin_log where kind = 'cancel-auction') from pg_got where n = 94)
  and exists (select 1 from cards where user_id = 'd8d8d8d8-0000-0000-0000-000000000004' and article_key = 'en:Takahe'));
select t_is('a lot already pulled says so', (select not (j->>'ok')::boolean and j->'log' = 'null'::jsonb from pg_got where n = 95));
select t_is('pulling stale lots counts them with a log', (select (j->>'cancelled')::int = 1 and (j->>'log')::bigint is not null from pg_got where n = 96));

insert into leaderboard_weekly (user_id, score) values ('d8d8d8d8-0000-0000-0000-000000000002', 900), ('d8d8d8d8-0000-0000-0000-000000000004', 950)
  on conflict (user_id) do update set score = excluded.score;
set role authenticated;
insert into pg_got values (100, admin_board('weekly', 1, 0));
select t_fails($q$select admin_board('yearly', 10, 0)$q$, 'BAD_BOARD');
insert into pg_got values (101, admin_guilds('pol', 10, 0));
insert into pg_got values (102, admin_announce('Polish', 'For the club.', '{"guild": "d8d8d8d8-0000-0000-0000-0000000000aa"}', null, null));
insert into pg_got values (103, admin_announcements(true, 50, 0));
insert into pg_got values (104, admin_names(array['d8d8d8d8-0000-0000-0000-000000000002', 'd8d8d8d8-0000-0000-0000-000000000004']::uuid[]));
insert into pg_got values (105, admin_note_set('d8d8d8d8-0000-0000-0000-000000000004', 'keeps asking for coins', true));
insert into pg_got values (106, admin_note_set('d8d8d8d8-0000-0000-0000-000000000004', 'all good now', false));
insert into pg_got values (107, admin_undo((select (j->>'log')::bigint from pg_got where n = 106)));
insert into pg_got values (108, admin_retire_announcement((select (j->>'id')::bigint from pg_got where n = 102)));
reset role;
select t_is('a board is paged with ranks and names', (select (j->>'total')::int >= 2 and j->'rows'->0->>'username' = 'rue_p' and (j->'rows'->0->>'rank')::int = 1
  and jsonb_array_length(j->'rows') = 1 from pg_got where n = 100));
select t_is('guilds are searchable with their owner', (select (j->>'total')::int = 1 and j->'rows'->0->>'owner_name' = 'quinn_p' from pg_got where n = 101));
select t_is('announcements list their target by name', (select r->>'guild_name' = 'Polish Club' and r->>'status' = 'live'
  from pg_got, jsonb_array_elements(j->'rows') r where n = 103 and (r->>'id')::bigint = (select (j->>'id')::bigint from pg_got where n = 102)));
select t_is('names come back for a list of ids', (select j = '{"d8d8d8d8-0000-0000-0000-000000000002": "pia_p", "d8d8d8d8-0000-0000-0000-000000000004": "rue_p"}'::jsonb from pg_got where n = 104));
select t_is('a note is saved and logged', (select (j->>'log')::bigint is not null from pg_got where n = 105));
select t_is('and its undo restores the one before', (select (j->>'ok')::boolean from pg_got where n = 107)
  and (select body = 'keeps asking for coins' and watch from player_notes where user_id = 'd8d8d8d8-0000-0000-0000-000000000004'));
select t_is('announcing and retiring answer with their logs', (select (a.j->>'log')::bigint < (b.j->>'log')::bigint from pg_got a, pg_got b where a.n = 102 and b.n = 108));

set role authenticated;
insert into pg_got values (110, admin_tuning_set('stipend.amount', '700'));
insert into pg_got values (111, admin_tuning_reset('stipend.amount'));
insert into pg_got values (112, admin_code_update('POLISHALL', '{"disabled": true}'));
insert into pg_got values (113, admin_pack_upsert('{"id": "pack-polish", "name": "Polished", "source": {"type": "search", "value": "polish"}}'));
insert into pg_got values (114, admin_card_override_upsert('{"article_key": "en:Polish_test", "title_override": "Shiny"}'));
insert into pg_got values (115, admin_card_override_delete('en:Polish_test'));
insert into pg_got values (116, admin_event_delete((select (j->>'id')::uuid from pg_got where n = 5)));
insert into pg_got values (117, admin_push('{"has_guild": false, "level_min": 21, "level_max": 23}', 'Hi', 'There'));
insert into pg_got values (118, admin_undo((select (j->>'log')::bigint from pg_got where n = 110)));
insert into pg_got values (119, admin_guild_rename('d8d8d8d8-0000-0000-0000-0000000000aa', 'Polished Club', 'PLC'));
insert into pg_got values (120, admin_delete_guild_messages('d8d8d8d8-0000-0000-0000-0000000000aa'));
insert into pg_got values (121, admin_cancel_trades('d8d8d8d8-0000-0000-0000-000000000004'));
insert into pg_got values (122, admin_wipe('d8d8d8d8-0000-0000-0000-000000000003', 'progress'));
insert into pg_got values (123, admin_delete_messages('d8d8d8d8-0000-0000-0000-000000000003'));
insert into pg_got values (124, admin_guild_transfer('d8d8d8d8-0000-0000-0000-0000000000aa', 'd8d8d8d8-0000-0000-0000-000000000003'));
insert into pg_got values (125, admin_guild_remove_member('d8d8d8d8-0000-0000-0000-0000000000aa', 'd8d8d8d8-0000-0000-0000-000000000003'));
reset role;
select t_is('every change answers with the log row it wrote', (select bool_and((j->>'log')::bigint is not null
  and exists (select 1 from admin_log l where l.id = (j->>'log')::bigint)) from pg_got where n between 110 and 125));
select t_is('an undo answers with its own log row', (select k.kind = 'undo' from pg_got g join admin_log k on k.id = (g.j->>'log')::bigint where g.n = 118));

delete from live_events where name like 'Polish%';
delete from redeem_uses where code = 'POLISHALL';
delete from redeem_codes where code = 'POLISHALL';
delete from admin_packs where id = 'pack-polish';
delete from push_tokens where user_id::text like 'd8d8d8d8-%';
select t_as(null, false);
