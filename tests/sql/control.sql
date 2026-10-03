reset role;
create table if not exists public.admins (id uuid primary key references auth.users on delete cascade, note text, granted_at timestamptz not null default now());
insert into auth.users (id) values
  ('c7c7c7c7-0000-0000-0000-000000000001'), ('c7c7c7c7-0000-0000-0000-000000000002'),
  ('c7c7c7c7-0000-0000-0000-000000000003'), ('c7c7c7c7-0000-0000-0000-000000000004');
insert into profiles (id, username, level, last_seen_at) values
  ('c7c7c7c7-0000-0000-0000-000000000001', 'creator_c', 50, now()),
  ('c7c7c7c7-0000-0000-0000-000000000002', 'ada_c', 12, now() - interval '30 seconds'),
  ('c7c7c7c7-0000-0000-0000-000000000003', 'bob_c', 3, now() - interval '3 days'),
  ('c7c7c7c7-0000-0000-0000-000000000004', 'cyd_c', 30, now() - interval '40 days');
insert into admins (id) values ('c7c7c7c7-0000-0000-0000-000000000001');
insert into friendships (requester, addressee, status) values ('c7c7c7c7-0000-0000-0000-000000000002', 'c7c7c7c7-0000-0000-0000-000000000003', 'accepted');
drop table if exists got;
create table got (n integer primary key, j jsonb);
grant all on got to authenticated, anon;

create or replace function public.t_as(p_user text, p_control boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), false);
  perform set_config('request.headers', case when p_control then '{"x-wikster-control":"1"}' else '{}' end, false);
end $$;
grant execute on function public.t_as(text, boolean) to authenticated, anon;

select t_as('c7c7c7c7-0000-0000-0000-000000000001', false);
select t_is('the creator playing the game is not an admin', not is_control_admin());
set role authenticated;
select t_fails('select admin_dashboard()', 'FORBIDDEN');
reset role;
select t_as('c7c7c7c7-0000-0000-0000-000000000002', true);
set role authenticated;
select t_fails('select admin_player(''c7c7c7c7-0000-0000-0000-000000000003'')', 'FORBIDDEN');
reset role;
select t_is('nothing is callable by anon', not has_function_privilege('anon', 'public.admin_grant(jsonb, jsonb, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.admin_undo(bigint)', 'execute'));
select t_is('the helpers are not callable by players', not has_function_privilege('authenticated', 'public.admin_gate()', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_audience_ids(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_save_write(uuid, text, text, bigint)', 'execute'));
select t_is('every Control call is', (select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('admin_dashboard', 'admin_search_players', 'admin_player', 'admin_player_cards',
    'admin_audience', 'admin_grant', 'admin_undo', 'admin_set_standing', 'admin_rename', 'admin_cancel_trade', 'admin_cancel_trades',
    'admin_cancel_auction', 'admin_cancel_auctions', 'admin_restore_backup', 'admin_set_save_key', 'admin_wipe', 'admin_guild',
    'admin_guild_remove_member', 'admin_guild_rename', 'admin_guild_transfer', 'admin_guild_delete', 'admin_delete_messages',
    'admin_delete_guild_messages', 'admin_announce', 'admin_retire_announcement')));

select t_as('c7c7c7c7-0000-0000-0000-000000000001', true);
select t_is('Control is an admin', is_control_admin());
set role authenticated;
insert into got values (1, admin_dashboard());
reset role;
select t_is('the dashboard counts players and who is online', (select (j->>'players')::int >= 4 and (j->>'online')::int >= 2
  and j ? 'grants_stuck' and j ? 'errors_24h' and j ? 'econ_actions_5m' and jsonb_typeof(j->'top_queries') = 'array'
  and j->'db' ? 'max_connections' from got where n = 1));

set role authenticated;
insert into got values (2, admin_audience('{}'));
insert into got values (3, admin_audience('{"all": "true"}'));
insert into got values (4, admin_audience('{"ids": "c7c7c7c7-0000-0000-0000-000000000002"}'));
insert into got values (5, admin_audience('{"all": true}'));
insert into got values (6, admin_audience('{"ids": ["c7c7c7c7-0000-0000-0000-000000000002", "c7c7c7c7-0000-0000-0000-000000000004"], "level_min": 20}'));
insert into got values (7, admin_audience('{"active_days": 1}'));
reset role;
select t_is('an empty filter reaches nobody', (select (j->>'count')::int = 0 from got where n = 2));
select t_is('all must be literally true', (select (j->>'count')::int = 0 from got where n = 3));
select t_is('ids must be a list', (select (j->>'count')::int = 0 from got where n = 4));
select t_is('all reaches every player', (select (j->>'count')::int = (select count(*) from profiles) and jsonb_array_length(j->'sample') <= 20 from got where n = 5));
select t_is('filters narrow the ids', (select (j->>'count')::int = 1 and j->'sample'->0->>'username' = 'cyd_c' from got where n = 6));
select t_is('active days uses last seen', (select (j->>'count')::int = (select count(*) from profiles where last_seen_at > now() - interval '1 day') from got where n = 7));

delete from realtime.messages;
set role authenticated;
insert into got values (10, admin_grant('{"ids": ["c7c7c7c7-0000-0000-0000-000000000002"]}',
  '[{"kind": "coins", "amount": 500}, {"kind": "booster", "spec": {"kind": "theme", "themeId": "animals", "rarityId": null, "cards": 1}, "count": 2},
    {"kind": "booster", "spec": {"kind": "open", "themeId": null, "rarityId": "epic", "cards": 2}},
    {"kind": "card", "card": {"article": {"key": "en:Gift", "title": "Gift"}, "rarityId": "mythic", "count": 2}},
    {"kind": "owned", "bucket": "themes", "id": "midnight"}, {"kind": "xp", "amount": 300},
    {"kind": "level", "value": 9}, {"kind": "boostersOpened", "value": 40}]',
  'For the outage.', 'compensation after the outage'));
reset role;
select t_is('a grant says what it did', (select (j->>'players')::int = 1 and (j->>'rows')::int = 8 and j->>'batch' is not null from got where n = 10));
select t_is('the rows share one batch', (select count(*) = 8 from grants where batch = (select (j->>'batch')::uuid from got where n = 10)));
select t_is('a 1 card booster keeps its size', exists (select 1 from grants where kind = 'booster' and payload->'spec'->>'cards' = '1' and payload->>'count' = '2'
  and user_id = 'c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('and a 2 card one too', exists (select 1 from grants where kind = 'booster' and payload->'spec' = '{"kind": "open", "themeId": null, "rarityId": "epic", "cards": 2}'::jsonb));
select t_is('the player sees the note, never the reason', (select bool_and(note_en = 'For the outage.' and note_fr = 'For the outage.') from grants
  where batch = (select (j->>'batch')::uuid from got where n = 10)));
select t_is('level and boosters opened go through the economy', (select count(*) = 2 from grants where kind = 'profile'
  and batch = (select (j->>'batch')::uuid from got where n = 10) and (payload->'patch' ? 'progress.level' or payload->'patch' ? 'boostersOpened')));
select t_is('the grant is told to its player once', (select count(*) = 1 from realtime.messages where event = 'grant' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('and to nobody else', not exists (select 1 from realtime.messages where event = 'grant' and topic <> 'user:c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('the log keeps the reason and how to undo it', (select reason = 'compensation after the outage' and undo->>'batch' = (select j->>'batch' from got where n = 10)
  and target = 'c7c7c7c7-0000-0000-0000-000000000002' and actor = 'c7c7c7c7-0000-0000-0000-000000000001' from admin_log where kind = 'grant' order by id desc limit 1));

set role authenticated;
select t_fails($q$select admin_grant('{"ids": ["c7c7c7c7-0000-0000-0000-000000000002"]}', '[{"kind": "booster", "spec": {"kind": "theme", "themeId": "animals", "cards": 13}}]', null, null)$q$, 'BAD_SPEC');
select t_fails($q$select admin_grant('{"ids": ["c7c7c7c7-0000-0000-0000-000000000002"]}', '[{"kind": "booster", "spec": {"kind": "theme", "themeId": "animals", "cards": 0}}]', null, null)$q$, 'BAD_SPEC');
select t_fails($q$select admin_grant('{}', '[{"kind": "coins", "amount": 5}]', null, null)$q$, 'NO_PLAYERS');
select t_fails($q$select admin_grant('{"ids": ["c7c7c7c7-0000-0000-0000-000000000002"]}', '[{"kind": "gold", "amount": 5}]', null, null)$q$, 'BAD_KIND');
reset role;

delete from realtime.messages;
set role authenticated;
insert into got values (11, admin_grant('{"all": true, "level_min": 10}', '[{"kind": "ink", "amount": 7}, {"kind": "coins", "amount": 20}]', null, 'weekend'));
reset role;
select t_is('an audience grant is one statement for many players', (select (j->>'players')::int = 3 and (j->>'rows')::int = 6 from got where n = 11));
select t_is('with one event per player', (select count(*) = 3 and count(distinct topic) = 3 from realtime.messages where event = 'grant'));
select t_is('and none to a player left out', not exists (select 1 from realtime.messages where topic = 'user:c7c7c7c7-0000-0000-0000-000000000003'));

select t_is('the economy sees the waiting rows', jsonb_array_length(econ_facts('c7c7c7c7-0000-0000-0000-000000000004', 'grants')) = 2);
insert into grants (user_id, kind, payload) values ('c7c7c7c7-0000-0000-0000-000000000004', 'mystery', '{}');
select econ_mark('c7c7c7c7-0000-0000-0000-000000000004', jsonb_build_object('kind', 'grantFail', 'id',
  (select id from grants where kind = 'mystery' and user_id = 'c7c7c7c7-0000-0000-0000-000000000004')));
select t_is('a grant the game cannot take is marked failed', (select claimed_at is not null and failed_at is not null from grants where kind = 'mystery'));
select t_is('and stops blocking the queue', jsonb_array_length(econ_facts('c7c7c7c7-0000-0000-0000-000000000004', 'grants')) = 2);
select econ_mark('c7c7c7c7-0000-0000-0000-000000000004', jsonb_build_object('kind', 'grantFail', 'id',
  (select id from grants where kind = 'mystery' and user_id = 'c7c7c7c7-0000-0000-0000-000000000004')));
select t_is('marking it twice is harmless', true);

update grants set claimed_at = now() where batch = (select (j->>'batch')::uuid from got where n = 10) and kind in ('coins', 'card', 'xp');
delete from realtime.messages;
set role authenticated;
insert into got values (12, admin_undo((select id from admin_log where kind = 'grant' and batch = (select (j->>'batch')::uuid from got where n = 10))));
reset role;
select t_is('undo drops what was not claimed', (select (j->>'ok')::boolean and (j->'detail'->>'deleted')::int = 5 from got where n = 12));
select t_is('and takes back what was', (select (j->'detail'->>'inverse')::int = 2 and (j->'detail'->>'skipped')::int = 1 from got where n = 12));
select t_is('coins come back negative', exists (select 1 from grants where kind = 'coins' and (payload->>'amount')::int = -500
  and batch = (select (j->'detail'->>'batch')::uuid from got where n = 12)));
select t_is('a given card is taken back by its copies', exists (select 1 from grants where kind = 'takeCard' and payload = '{"key": "en:Gift", "copies": 2}'::jsonb));
select t_is('the player hears about it', exists (select 1 from realtime.messages where event = 'grant' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000002'));
set role authenticated;
insert into got values (13, admin_undo((select id from admin_log where kind = 'grant' and batch = (select (j->>'batch')::uuid from got where n = 10))));
reset role;
select t_is('an undo happens once', (select not (j->>'ok')::boolean and j->'detail'->>'reason' = 'already undone' from got where n = 13));

delete from realtime.messages;
set role authenticated;
insert into got values (20, admin_set_standing('c7c7c7c7-0000-0000-0000-000000000002', 'mute', now() + interval '1 day', 'insults in chat', 'Please keep it kind.'));
reset role;
select t_is('a mute lands', is_muted('c7c7c7c7-0000-0000-0000-000000000002') and not is_suspended('c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('the player reads the note, not the reason', (select reason = 'Please keep it kind.' from suspensions where user_id = 'c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('and is told at once', (select payload->>'type' = 'mute' and payload->>'reason' = 'Please keep it kind.' and payload->>'until' is not null
  from realtime.messages where event = 'standing' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('nobody else is', (select count(*) = 1 from realtime.messages where event = 'standing'));
set role authenticated;
select t_fails($q$select admin_set_standing('c7c7c7c7-0000-0000-0000-000000000002', 'ban', null, null, null)$q$, 'BAD_TYPE');
insert into got values (21, admin_undo((select id from admin_log where kind = 'standing' order by id desc limit 1)));
reset role;
select t_is('undoing a mute lifts it', not is_muted('c7c7c7c7-0000-0000-0000-000000000002')
  and exists (select 1 from realtime.messages where event = 'standing' and payload->>'type' = 'clear'));

delete from realtime.messages;
set role authenticated;
select t_fails($q$select admin_rename('c7c7c7c7-0000-0000-0000-000000000002', 'bad name!')$q$, 'BAD_NAME');
select t_fails($q$select admin_rename('c7c7c7c7-0000-0000-0000-000000000002', 'BOB_C')$q$, 'NAME_TAKEN');
select t_fails($q$select admin_rename('c7c7c7c7-0000-0000-0000-000000000002', 'xX_fuck_Xx')$q$, 'NAME_REFUSED');
insert into got values (22, admin_rename('c7c7c7c7-0000-0000-0000-000000000002', 'ada_lovelace'));
reset role;
select t_is('a rename lands', (select username = 'ada_lovelace' from profiles where id = 'c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('and the player repaints their name', exists (select 1 from realtime.messages where event = 'profile' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000002'));
set role authenticated;
insert into got values (23, admin_undo((select id from admin_log where kind = 'rename' order by id desc limit 1)));
reset role;
select t_is('undo gives the old name back', (select username = 'ada_c' from profiles where id = 'c7c7c7c7-0000-0000-0000-000000000002'));

select t_as(null, false);
select econ_give_card('c7c7c7c7-0000-0000-0000-000000000002', '{"key": "en:Otter", "title": "Otter", "rarityId": "rare", "price": 300}');
select econ_give_card('c7c7c7c7-0000-0000-0000-000000000002', '{"key": "en:Lynx", "title": "Lynx", "rarityId": "epic", "price": 900}');
select econ_give_card('c7c7c7c7-0000-0000-0000-000000000002', '{"key": "en:Newt", "title": "Newt", "rarityId": "common", "price": 20}');
insert into wallets (user_id, coins) values ('c7c7c7c7-0000-0000-0000-000000000003', 1000) on conflict (user_id) do update set coins = 1000;
insert into got values (30, econ_trade_propose('c7c7c7c7-0000-0000-0000-000000000002', 'c7c7c7c7-0000-0000-0000-000000000003', '["en:Otter"]', '[]'));
insert into got values (31, econ_trade_propose('c7c7c7c7-0000-0000-0000-000000000002', 'c7c7c7c7-0000-0000-0000-000000000003', '["en:Newt"]', '[]'));
select t_is('a trade holds the card', not exists (select 1 from cards where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and article_key = 'en:Otter'));
delete from realtime.messages;
select t_as('c7c7c7c7-0000-0000-0000-000000000001', true);
set role authenticated;
insert into got values (32, admin_cancel_trade((select (j->>'id')::uuid from got where n = 30)));
reset role;
select t_is('cancelling a trade gives the card back', exists (select 1 from cards where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and article_key = 'en:Otter'));
select t_is('and closes it', (select status = 'cancelled' from trades where id = (select (j->>'id')::uuid from got where n = 30)));
select t_is('the owner hears about it', exists (select 1 from realtime.messages where event = 'econ' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000002'));
set role authenticated;
select t_fails(format('select admin_cancel_trade(%L)', (select j->>'id' from got where n = 30)), 'SETTLED');
insert into got values (33, admin_cancel_trades('c7c7c7c7-0000-0000-0000-000000000003'));
reset role;
select t_is('cancelling every trade of a player returns the cards', (select (j->>'cancelled')::int = 1 from got where n = 33)
  and exists (select 1 from cards where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and article_key = 'en:Newt'));

select t_as(null, false);
insert into got values (34, econ_auction_create('c7c7c7c7-0000-0000-0000-000000000002', 'en:Lynx', 100, 60));
select econ_auction_bid('c7c7c7c7-0000-0000-0000-000000000003', (select (j->>'id')::uuid from got where n = 34), 150);
delete from realtime.messages;
select t_as('c7c7c7c7-0000-0000-0000-000000000001', true);
set role authenticated;
insert into got values (35, jsonb_build_object('ok', admin_cancel_auction((select (j->>'id')::uuid from got where n = 34))));
reset role;
select t_is('pulling a lot returns the card', (select (j->>'ok')::boolean from got where n = 35)
  and exists (select 1 from cards where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and article_key = 'en:Lynx'));
select t_is('refunds the bid', exists (select 1 from ledger where user_id = 'c7c7c7c7-0000-0000-0000-000000000003' and kind = 'market'
  and reason = 'refund' and coins = 150));
select t_is('and tells the seller', exists (select 1 from realtime.messages where event = 'econ' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000002'));

insert into save_keys (user_id, key, value, stamp) values ('c7c7c7c7-0000-0000-0000-000000000002', 'wikster.theme', 'noir', 5);
insert into save_meta (user_id) values ('c7c7c7c7-0000-0000-0000-000000000002') on conflict do nothing;
insert into saves_history (user_id, reason, data) values ('c7c7c7c7-0000-0000-0000-000000000002', 'update',
  '{"format": "wikster-save", "version": 2, "at": 1, "data": {"wikster.theme": "paper", "wikster.language": "fr"}, "stamps": {"wikster.theme": 1}}');
delete from realtime.messages;
insert into got values (39, (select to_jsonb(max(id)) from saves_history where user_id = 'c7c7c7c7-0000-0000-0000-000000000002'));
set role authenticated;
insert into got values (40, admin_restore_backup('c7c7c7c7-0000-0000-0000-000000000002', (select (j #>> '{}')::bigint from got where n = 39)));
reset role;
select t_is('a backup comes back with fresh stamps', (select value = 'paper' and stamp > floor(extract(epoch from now()) * 1000) - 60000
  from save_keys where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and key = 'wikster.theme'));
select t_is('every key in it', exists (select 1 from save_keys where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and key = 'wikster.language' and value = 'fr'));
select t_is('the device is told which keys', (select payload->'keys' = '["wikster.language", "wikster.theme"]'::jsonb from realtime.messages where event = 'save'));
set role authenticated;
insert into got values (41, admin_undo((select id from admin_log where kind = 'restore-backup' order by id desc limit 1)));
reset role;
select t_is('undoing a restore puts the keys back', (select value = 'noir' from save_keys where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and key = 'wikster.theme')
  and not exists (select 1 from save_keys where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and key = 'wikster.language'));
set role authenticated;
select t_fails($q$select admin_set_save_key('c7c7c7c7-0000-0000-0000-000000000002', 'language', 'de')$q$, 'BAD_VALUE');
select t_fails($q$select admin_set_save_key('c7c7c7c7-0000-0000-0000-000000000002', 'wikster.collection.v3', '{}')$q$, 'BAD_KEY');
select t_fails($q$select admin_set_save_key('c7c7c7c7-0000-0000-0000-000000000002', 'profile', '[1]')$q$, 'BAD_VALUE');
insert into got values (42, admin_set_save_key('c7c7c7c7-0000-0000-0000-000000000002', 'language', 'fr'));
reset role;
select t_is('a setting is written with a fresh stamp', (select value = 'fr' and stamp = (select (j->>'stamp')::bigint from got where n = 42)
  from save_keys where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and key = 'wikster.language'));

delete from realtime.messages;
insert into wallets (user_id, coins) values ('c7c7c7c7-0000-0000-0000-000000000002', 777) on conflict (user_id) do update set coins = 777;
set role authenticated;
select t_fails($q$select admin_wipe('c7c7c7c7-0000-0000-0000-000000000002', 'all')$q$, 'BAD_SCOPE');
insert into got values (43, admin_wipe('c7c7c7c7-0000-0000-0000-000000000002', 'collection'));
reset role;
select t_is('wiping the collection removes the cards', not exists (select 1 from cards where user_id = 'c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('and keeps the coins', (select coins = 777 from wallets where user_id = 'c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('the totals follow', (select n_cards = 0 from econ where user_id = 'c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('the device is told', exists (select 1 from realtime.messages where event = 'econ' and payload->>'scope' = 'collection'));
update econ set state = state || '{"progress": {"level": 9, "xp": 5}, "boostersOpened": 40, "owned": {"themes": ["midnight"]}}' where user_id = 'c7c7c7c7-0000-0000-0000-000000000002';
set role authenticated;
insert into got values (44, admin_wipe('c7c7c7c7-0000-0000-0000-000000000002', 'progress'));
reset role;
select t_is('wiping progress resets the level and keeps what was bought', (select state->'progress'->>'level' = '1' and not (state ? 'boostersOpened')
  and state->'owned' = '{"themes": ["midnight"]}' from econ where user_id = 'c7c7c7c7-0000-0000-0000-000000000002')
  and (select level = 1 from profiles where id = 'c7c7c7c7-0000-0000-0000-000000000002'));
set role authenticated;
insert into got values (45, admin_wipe('c7c7c7c7-0000-0000-0000-000000000002', 'everything'));
reset role;
select t_is('wiping everything empties the wallet and erases the profile key, like Erase everything in the game', (select coins = 0 from wallets where user_id = 'c7c7c7c7-0000-0000-0000-000000000002')
  and not exists (select 1 from save_keys where user_id = 'c7c7c7c7-0000-0000-0000-000000000002' and key = 'wikster.profile.v1')
  and (select state->'wiped'->>'scope' = 'all' from econ where user_id = 'c7c7c7c7-0000-0000-0000-000000000002'));
set role authenticated;
insert into got values (46, admin_undo((select id from admin_log where kind = 'wipe' order by id desc limit 1)));
reset role;
select t_is('a wipe cannot be undone, and says so', (select not (j->>'ok')::boolean and j->'detail'->>'reason' is not null from got where n = 46));

select t_as(null, false);
insert into guilds (id, name, tag, owner, members) values ('c7c7c7c7-0000-0000-0000-00000000000f', 'Night Owls', 'OWLS', 'c7c7c7c7-0000-0000-0000-000000000002', 3);
insert into guild_members (user_id, guild_id, joined_at) values
  ('c7c7c7c7-0000-0000-0000-000000000002', 'c7c7c7c7-0000-0000-0000-00000000000f', now() - interval '2 hours'),
  ('c7c7c7c7-0000-0000-0000-000000000003', 'c7c7c7c7-0000-0000-0000-00000000000f', now() - interval '1 hour'),
  ('c7c7c7c7-0000-0000-0000-000000000004', 'c7c7c7c7-0000-0000-0000-00000000000f', now());
insert into guild_bank (guild_id, donor, donor_name, card) values ('c7c7c7c7-0000-0000-0000-00000000000f', 'c7c7c7c7-0000-0000-0000-000000000003', 'bob_c',
  '{"key": "en:Heron", "title": "Heron", "rarityId": "rare", "price": 200, "count": 1}');
insert into guild_messages (guild_id, sender, sender_name, body) values
  ('c7c7c7c7-0000-0000-0000-00000000000f', 'c7c7c7c7-0000-0000-0000-000000000002', 'ada_c', 'hello owls'),
  ('c7c7c7c7-0000-0000-0000-00000000000f', 'c7c7c7c7-0000-0000-0000-000000000003', 'bob_c', 'hi ada');
insert into messages (sender, recipient, body) values ('c7c7c7c7-0000-0000-0000-000000000002', 'c7c7c7c7-0000-0000-0000-000000000003', 'see you');

select t_as('c7c7c7c7-0000-0000-0000-000000000001', true);
delete from realtime.messages;
set role authenticated;
select t_fails($q$select admin_announce('Hi', 'Body', '{}', null, null)$q$, 'BAD_TARGET');
select t_fails($q$select admin_announce('Hi', 'Body', '{"all": true, "user": "c7c7c7c7-0000-0000-0000-000000000002"}', null, null)$q$, 'BAD_TARGET');
select t_fails($q$select admin_announce('Hi', 'Body', '{"all": "yes"}', null, null)$q$, 'BAD_TARGET');
insert into got values (51, admin_announce('World', 'For everyone.', '{"all": true}', null, null));
insert into got values (52, admin_announce('Owls', 'For the owls.', '{"guild": "c7c7c7c7-0000-0000-0000-00000000000f"}', null, null));
insert into got values (53, admin_announce('Ada', 'For Ada.', '{"user": "c7c7c7c7-0000-0000-0000-000000000002"}', null, null));
reset role;
select t_is('an announcement for all goes to the world topic', (select count(*) = 1 from realtime.messages where topic = 'world' and event = 'announcement'
  and payload = jsonb_build_object('id', (select (j->>'id')::bigint from got where n = 51), 'retired', false)));
select t_is('a guild one to the guild and its members', (select count(*) = 1 from realtime.messages where topic = 'guild:c7c7c7c7-0000-0000-0000-00000000000f' and event = 'notice')
  and (select count(*) = 3 from realtime.messages where event = 'notice' and topic like 'user:%' and (payload->>'id')::bigint = (select (j->>'id')::bigint from got where n = 52)));
select t_is('a personal one to that player only', (select array_agg(topic) = array['user:c7c7c7c7-0000-0000-0000-000000000002'] from realtime.messages
  where event = 'notice' and (payload->>'id')::bigint = (select (j->>'id')::bigint from got where n = 53)));
select t_is('the targets are stored', (select target_guild = 'c7c7c7c7-0000-0000-0000-00000000000f' and target_user is null from announcements where id = (select (j->>'id')::bigint from got where n = 52)));

select t_as('c7c7c7c7-0000-0000-0000-000000000003', false);
set role authenticated;
insert into got values (54, (select coalesce(jsonb_agg(id order by id), '[]') from announcements where id in (select (j->>'id')::bigint from got where n in (51, 52, 53))));
reset role;
select t_as('c7c7c7c7-0000-0000-0000-000000000001', false);
set role authenticated;
insert into got values (55, (select coalesce(jsonb_agg(id order by id), '[]') from announcements where id in (select (j->>'id')::bigint from got where n in (51, 52, 53))));
reset role;
select t_as(null, false);
set role anon;
insert into got values (56, (select coalesce(jsonb_agg(id order by id), '[]') from announcements where id in (select (j->>'id')::bigint from got where n in (51, 52, 53))));
reset role;
select t_is('a guild member reads the world and the guild notes', (select j = jsonb_build_array((select (j->>'id')::bigint from got where n = 51), (select (j->>'id')::bigint from got where n = 52)) from got where n = 54));
select t_is('the creator in the game reads only what is meant for them', (select j = jsonb_build_array((select (j->>'id')::bigint from got where n = 51)) from got where n = 55));
select t_is('a signed-out player reads only the world note', (select j = jsonb_build_array((select (j->>'id')::bigint from got where n = 51)) from got where n = 56));

drop table if exists world_seen;
create table world_seen (who text, n int);
grant insert on world_seen to authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub', 'c7c7c7c7-0000-0000-0000-000000000004', true);
  perform set_config('realtime.topic', 'world', true);
  set local role authenticated;
  insert into world_seen select 'cyd', count(*) from realtime.messages;
  reset role;
end $$;
select t_is('every signed-in player may listen on the world topic', (select n > 0 from world_seen));

select t_as('c7c7c7c7-0000-0000-0000-000000000001', true);
delete from realtime.messages;
set role authenticated;
insert into got values (57, admin_retire_announcement((select (j->>'id')::bigint from got where n = 51)));
reset role;
select t_is('retiring tells the world', exists (select 1 from realtime.messages where topic = 'world' and payload->>'retired' = 'true'));
set role authenticated;
insert into got values (58, admin_undo((select id from admin_log where kind = 'retire' order by id desc limit 1)));
reset role;
select t_is('undoing a retire brings it back', (select ends_at is null from announcements where id = (select (j->>'id')::bigint from got where n = 51)));

delete from realtime.messages;
set role authenticated;
insert into got values (60, admin_guild('c7c7c7c7-0000-0000-0000-00000000000f'));
insert into got values (61, admin_delete_messages('c7c7c7c7-0000-0000-0000-000000000002'));
reset role;
select t_is('the guild page has members, bank and chat', (select jsonb_array_length(j->'members') = 3 and (j->'bank'->>'count')::int = 1
  and jsonb_array_length(j->'messages') = 2 from got where n = 60));
select t_is('deleting a player''s lines removes them', (select (j->>'messages')::int = 1 and (j->>'guild_messages')::int = 1 from got where n = 61)
  and not exists (select 1 from messages where sender = 'c7c7c7c7-0000-0000-0000-000000000002'));
select t_is('open chats drop them', exists (select 1 from realtime.messages where event = 'removed' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000003'
  and payload->>'table' = 'messages' and jsonb_array_length(payload->'ids') = 1)
  and exists (select 1 from realtime.messages where event = 'removed' and topic = 'guild:c7c7c7c7-0000-0000-0000-00000000000f' and payload->>'table' = 'guild_messages'));
delete from realtime.messages;
set role authenticated;
insert into got values (62, admin_delete_guild_messages('c7c7c7c7-0000-0000-0000-00000000000f'));
insert into got values (63, admin_guild_remove_member('c7c7c7c7-0000-0000-0000-00000000000f', 'c7c7c7c7-0000-0000-0000-000000000002'));
reset role;
select t_is('a guild room can be cleared', (select (j->>'guild_messages')::int = 1 from got where n = 62)
  and not exists (select 1 from guild_messages where guild_id = 'c7c7c7c7-0000-0000-0000-00000000000f'));
select t_is('removing the owner hands the guild to the oldest member', (select owner = 'c7c7c7c7-0000-0000-0000-000000000003' and members = 2
  from guilds where id = 'c7c7c7c7-0000-0000-0000-00000000000f'));
select t_is('the removed player and the heir are told', exists (select 1 from realtime.messages where event = 'guild' and payload->>'type' = 'removed'
  and topic = 'user:c7c7c7c7-0000-0000-0000-000000000002')
  and exists (select 1 from realtime.messages where event = 'guild' and payload->>'type' = 'owner' and topic = 'user:c7c7c7c7-0000-0000-0000-000000000003'));
set role authenticated;
select t_fails($q$select admin_guild_rename('c7c7c7c7-0000-0000-0000-00000000000f', 'Owls', 'owl!')$q$, 'BAD_NAME');
insert into got values (64, admin_guild_rename('c7c7c7c7-0000-0000-0000-00000000000f', 'Day Owls', 'DAY'));
insert into got values (65, admin_guild_transfer('c7c7c7c7-0000-0000-0000-00000000000f', 'c7c7c7c7-0000-0000-0000-000000000004'));
reset role;
select t_is('rename and transfer land', (select name = 'Day Owls' and tag = 'DAY' and owner = 'c7c7c7c7-0000-0000-0000-000000000004'
  from guilds where id = 'c7c7c7c7-0000-0000-0000-00000000000f'));
set role authenticated;
insert into got values (66, admin_undo((select id from admin_log where kind = 'guild-rename' order by id desc limit 1)));
insert into got values (67, admin_guild_delete('c7c7c7c7-0000-0000-0000-00000000000f'));
reset role;
select t_is('undoing a guild rename restores it', (select (j->>'ok')::boolean from got where n = 66));
select t_is('deleting a guild gives the bank back to the donors', (select (j->>'bank_returned')::int = 1 from got where n = 67)
  and exists (select 1 from cards where user_id = 'c7c7c7c7-0000-0000-0000-000000000003' and article_key = 'en:Heron'));
select t_is('and tells every member', (select count(*) = 2 from realtime.messages where event = 'guild' and payload->>'type' = 'deleted')
  and not exists (select 1 from guilds where id = 'c7c7c7c7-0000-0000-0000-00000000000f'));

insert into player_notes (user_id, body) values ('c7c7c7c7-0000-0000-0000-000000000003', 'watch the trades');
set role authenticated;
insert into got values (70, admin_search_players('BOB', '{}', 10, 0));
insert into got values (71, admin_search_players(null, '{"has_note": true}', 10, 0));
insert into got values (72, admin_search_players('_c', '{"inactive_days": 30}', 10, 0));
insert into got values (73, admin_search_players(null, '{}', 2, 0));
insert into got values (74, admin_player('c7c7c7c7-0000-0000-0000-000000000003'));
insert into got values (75, admin_player_cards('c7c7c7c7-0000-0000-0000-000000000003', 'her', 10, 0));
reset role;
select t_is('search finds a name', (select (j->>'total')::int = 1 and j->'rows'->0->>'username' = 'bob_c' and j->'rows'->0->>'note' = 'watch the trades' from got where n = 70));
select t_is('and filters on notes', (select (j->>'total')::int = 1 from got where n = 71));
select t_is('and on how long they have been away', (select (j->>'total')::int = 1 and j->'rows'->0->>'username' = 'cyd_c' from got where n = 72));
select t_is('pages are ordered by last seen', (select jsonb_array_length(j->'rows') = 2 and (j->>'total')::int >= 4
  and (j->'rows'->0->>'last_seen_at')::timestamptz >= (j->'rows'->1->>'last_seen_at')::timestamptz from got where n = 73));
select t_is('a player page has everything in one call', (select j ? 'profile' and j ? 'wallet' and j ? 'inventory' and j ? 'save_keys' and j ? 'grants'
  and j ? 'ledger' and j ? 'backups' and j ? 'reports_by' and j ? 'reports_against' and j ? 'online' and (j->'wallet'->>'coins')::int = 1000 from got where n = 74));
select t_is('cards are paged and searchable', (select (j->>'total')::int = 1 and j->'rows'->0->>'article_key' = 'en:Heron' from got where n = 75));

select t_as(null, false);
select t_fails($q$insert into messages (sender, recipient, body) values ('c7c7c7c7-0000-0000-0000-000000000001', 'c7c7c7c7-0000-0000-0000-000000000002', 'send nudes')$q$, 'FILTERED');
select t_as('c7c7c7c7-0000-0000-0000-000000000001', false);
select t_fails($q$insert into messages (sender, recipient, body) values ('c7c7c7c7-0000-0000-0000-000000000001', 'c7c7c7c7-0000-0000-0000-000000000002', 'send nudes')$q$, 'FILTERED');
select t_as(null, false);
