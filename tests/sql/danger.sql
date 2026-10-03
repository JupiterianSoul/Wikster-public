reset role;
insert into auth.users (id) values
  ('da000000-0000-0000-0000-000000000001'), ('da000000-0000-0000-0000-000000000002'), ('da000000-0000-0000-0000-000000000003'),
  ('da000000-0000-0000-0000-000000000004'), ('da000000-0000-0000-0000-000000000005'), ('da000000-0000-0000-0000-000000000006');
create temp table dz as select
  'da000000-0000-0000-0000-000000000001'::uuid p, 'da000000-0000-0000-0000-000000000002'::uuid f,
  'da000000-0000-0000-0000-000000000003'::uuid g, 'da000000-0000-0000-0000-000000000004'::uuid b,
  'da000000-0000-0000-0000-000000000005'::uuid d, 'da000000-0000-0000-0000-000000000006'::uuid s;
grant select on dz to public;
insert into profiles (id, username) values
  ((select p from dz), 'danger_p'), ((select f from dz), 'danger_f'), ((select g from dz), 'danger_g'),
  ((select b from dz), 'danger_b'), ((select d from dz), 'danger_d'), ((select s from dz), 'danger_s');
insert into friendships (requester, addressee, status) values
  ((select p from dz), (select f from dz), 'accepted'), ((select d from dz), (select f from dz), 'accepted');

select econ_apply((select p from dz), '{"coins":5000,"ink":20,"add":[{"key":"en:A","title":"A","rarityId":"rare","price":100,"copies":3},{"key":"en:Spec","title":"S","rarityId":"special","data":{"special":"creator"}}],"inventory":[{"spec_id":"open|x","spec":{"kind":"open"},"delta":2},{"spec_id":"code|y","spec":{"kind":"code","codeId":"y"},"delta":1}],"state":{"progress":{"level":4,"xp":10},"achievements":{"pack-1":1},"owned":{"supporter":["contributor"],"themes":["folio","noir"]}}}');
select econ_apply((select f from dz), '{"coins":1000,"add":[{"key":"en:F1","title":"F1","rarityId":"common","price":10},{"key":"en:F2","title":"F2","rarityId":"common","price":10}]}');
select econ_apply((select b from dz), '{"coins":1000}');
insert into pulls (user_id, spec_id, spec, cards) values
  ((select p from dz), 'open|x', '{"kind":"open"}', '[]'), ((select p from dz), 'code|y', '{"kind":"code","codeId":"y"}', '[]');

select econ_auction_create((select p from dz), 'en:A', 50, 60);
select econ_auction_bid((select b from dz), (select id from auctions where seller = (select p from dz)), 100);
select econ_auction_create((select f from dz), 'en:F1', 20, 60);
select econ_auction_bid((select p from dz), (select id from auctions where seller = (select f from dz)), 40);
select econ_apply((select f from dz), '{"add":[{"key":"en:F9","title":"F9","rarityId":"common","price":10}]}');
select econ_apply((select g from dz), '{"coins":500}');
select econ_auction_create((select f from dz), 'en:F9', 20, 60);
select econ_auction_bid((select p from dz), (select id from auctions where card->>'key' = 'en:F9'), 25);
select econ_auction_bid((select g from dz), (select id from auctions where card->>'key' = 'en:F9'), 40);
select econ_trade_propose((select p from dz), (select f from dz), '["en:A"]', '[]');
select econ_trade_propose((select f from dz), (select p from dz), '["en:F2"]', '[]');
insert into deliveries (sender, recipient, kind, payload) values ((select f from dz), (select p from dz), 'card', '{"key":"en:Gift","title":"Gift"}');
insert into save_keys (user_id, key, value, stamp) values ((select p from dz), 'wikster.theme', 'noir', 1), ((select p from dz), 'wikster.language', 'fr', 1), ((select p from dz), 'wikster.profile.v1', '{"tour":1}', 1);
delete from realtime.messages;

create temp table dg (n int, j jsonb);
grant all on dg to public;
insert into dg values (1, econ_erase((select p from dz), 'cards', 'wipecards:7', 1500));
select t_is('removing the cards answers ok with its scope', (select j->>'ok' = 'true' and j->>'scope' = 'cards' from dg where n = 1));
select t_is('only the special card stays', (select array_agg(article_key) = array['en:Spec'] from cards where user_id = (select p from dz)));
select t_is('only the code booster stays', (select array_agg(spec_id) = array['code|y'] from inventory where user_id = (select p from dz)));
select t_is('waiting draws go, except the code one', (select array_agg(spec_id) = array['code|y'] from pulls where user_id = (select p from dz) and claimed_at is null));
select t_is('the Buckarooz go back to the start and the Ink stays', (select coins = 1500 and ink = 20 from wallets where user_id = (select p from dz)));
select t_is('the level and achievements stay', (select state->'progress'->>'level' = '4' and state->'achievements' ? 'pack-1' from econ where user_id = (select p from dz)));
select t_is('the state carries the wipe for other devices', (select state->'wiped'->>'scope' = 'cards' and (state->'wiped'->>'at')::bigint > 0 from econ where user_id = (select p from dz)));
select t_is('the lot is pulled from the auction house', (select status = 'cancelled' from auctions where seller = (select p from dz)));
select t_is('and its bidder gets the bid back in the wallet at once', (select coins = 1000 from wallets where user_id = (select b from dz))
  and exists (select 1 from ledger where user_id = (select b from dz) and kind = 'market' and reason = 'refund' and coins = 100));
select t_is('with no delivery to claim', not exists (select 1 from deliveries where recipient = (select b from dz)));
select t_is('the returned lot is not kept', not exists (select 1 from cards where user_id = (select p from dz) and article_key = 'en:A'));
select t_is('the player''s own bid is withdrawn', (select bidder is null and current_bid is null and bid_count = 0 from auctions where card->>'key' = 'en:F1')
  and not exists (select 1 from auction_bids where bidder = (select p from dz)));
select t_is('and its Buckarooz came back before the reset, on the ledger', exists (select 1 from ledger where user_id = (select p from dz) and reason = 'refund' and coins = 40));
select t_is('an older, outbid bid of the player leaves the lot''s history, the leader stays', (select bidder = (select g from dz) and current_bid = 40 and bid_count = 1
  from auctions where card->>'key' = 'en:F9') and (select count(*) = 1 from auction_bids b join auctions x on x.id = b.auction where x.card->>'key' = 'en:F9'));
select t_is('the trade the player proposed is cancelled', (select status = 'cancelled' from trades where proposer = (select p from dz)));
select t_is('the trade offered to the player is declined and the card goes home', (select status = 'declined' from trades where proposer = (select f from dz))
  and exists (select 1 from cards where user_id = (select f from dz) and article_key = 'en:F2'));
select t_is('gifts waiting for the player are dropped', not exists (select 1 from deliveries where recipient = (select p from dz) and claimed_at is null));
select t_is('the theme is set back to the default in the cloud', (select value = 'aurora' from save_keys where user_id = (select p from dz) and key = 'wikster.theme'));
select t_is('the profile counts follow', (select cards = 1 and unique_cards = 1 from profiles where id = (select p from dz)));
select t_is('the player''s devices are told', exists (select 1 from realtime.messages where topic = 'user:' || (select p from dz) and event = 'wiped' and payload->>'scope' = 'cards'));
select t_is('the outbid player hears about the refund', exists (select 1 from realtime.messages where topic = 'user:' || (select b from dz) and event = 'econ'));
select econ_apply((select p from dz), '{"coins":100}');
select t_fails($q$select econ_erase((select p from dz), 'cards', 'wipecards:7', 1500)$q$, 'ALREADY_CLAIMED');
select t_is('a refused second wipe changes nothing', (select coins = 1600 from wallets where user_id = (select p from dz)));
select t_fails($q$select econ_erase((select p from dz), 'some', null, 0)$q$, 'BAD_SCOPE');
select t_fails($q$select econ_erase('da000000-0000-0000-0000-0000000000ff', 'cards', null, 0)$q$, 'NOT_FOUND');

insert into guilds (id, name, tag, owner, members) values ('dab00000-0000-0000-0000-000000000001', 'Erasers', 'ERS', (select p from dz), 2);
insert into guild_members (user_id, guild_id, joined_at) values
  ((select p from dz), 'dab00000-0000-0000-0000-000000000001', now() - interval '2 days'),
  ((select g from dz), 'dab00000-0000-0000-0000-000000000001', now() - interval '1 day');
insert into guild_bank (guild_id, donor, donor_name, card) values ('dab00000-0000-0000-0000-000000000001', (select p from dz), 'danger_p', '{"key":"en:Bank","title":"Bank"}');
insert into messages (sender, recipient, body) values ((select p from dz), (select f from dz), 'hello'), ((select f from dz), (select p from dz), 'hi');
insert into blocks (blocker, blocked) values ((select p from dz), (select b from dz));
insert into wishlists (owner, key, card) values ((select p from dz), 'en:Want', '{}');
insert into scores (user_id, game, points) values ((select p from dz), 'wikdle', 30);
insert into leaderboard_alltime (user_id, score) values ((select p from dz), 30) on conflict (user_id) do nothing;
insert into saves (user_id, data) values ((select p from dz), '{"format":"wikster-save","version":2,"data":{}}');
insert into saves_history (user_id, data) values ((select p from dz), '{}');
update profiles set play_ms = 900000, showcase = '["en:Spec"]', badges = '{"worn":["x"]}' where id = (select p from dz);
delete from realtime.messages;

insert into dg values (2, econ_erase((select p from dz), 'all', 'wipe:7', 0));
select t_is('erasing everything answers ok', (select j->>'ok' = 'true' and j->>'scope' = 'all' from dg where n = 2));
select t_is('no card, booster, coin or Ink is left', not exists (select 1 from cards where user_id = (select p from dz))
  and not exists (select 1 from inventory where user_id = (select p from dz))
  and (select coins = 0 and ink = 0 from wallets where user_id = (select p from dz)));
select t_is('the progress is gone but the paid supporter perks stay', (select not (state ? 'progress') and state->'owned'->'supporter' = '["contributor"]'
  and state->'owned'->'themes' = '["folio"]' and state->>'imported' = 'true' and state->'wiped'->>'scope' = 'all' from econ where user_id = (select p from dz)));
select t_is('the guild passes to the next member', (select owner = (select g from dz) and members = 1 from guilds where id = 'dab00000-0000-0000-0000-000000000001')
  and not exists (select 1 from guild_members where user_id = (select p from dz)));
select t_is('and the cards given to the guild bank stay in it', exists (select 1 from guild_bank where guild_id = 'dab00000-0000-0000-0000-000000000001'));
select t_is('the new owner is told', exists (select 1 from realtime.messages where topic = 'user:' || (select g from dz) and event = 'guild'));
select t_is('friends and messages are gone', not exists (select 1 from friendships where (select p from dz) in (requester, addressee))
  and not exists (select 1 from messages where (select p from dz) in (sender, recipient)));
select t_is('the friend''s open chat drops those messages', exists (select 1 from realtime.messages where topic = 'user:' || (select f from dz) and event = 'removed'
  and jsonb_array_length(payload->'ids') = 2));
select t_is('scores, leaderboard and wishlist are gone', not exists (select 1 from scores where user_id = (select p from dz))
  and not exists (select 1 from leaderboard_alltime where user_id = (select p from dz)) and not exists (select 1 from wishlists where owner = (select p from dz)));
select t_is('the old cloud save and its backups are gone', not exists (select 1 from saves where user_id = (select p from dz))
  and not exists (select 1 from saves_history where user_id = (select p from dz)));
select t_is('the profile and theme keys are gone, the language stays', (select array_agg(key) = array['wikster.language'] from save_keys where user_id = (select p from dz)));
select t_is('the public profile starts over', (select level = 1 and play_ms = 0 and showcase = '[]' and badges = '[]' and cards = 0 from profiles where id = (select p from dz)));
select t_is('the player name and blocks stay', (select username = 'danger_p' from profiles where id = (select p from dz))
  and exists (select 1 from blocks where blocker = (select p from dz)));
select t_is('and so does the account', exists (select 1 from auth.users where id = (select p from dz)));
select t_is('the starter can be claimed again', not exists (select 1 from claims where user_id = (select p from dz) and key = 'starter'));
select t_fails($q$select econ_erase((select p from dz), 'all', 'wipe:7', 0)$q$, 'ALREADY_CLAIMED');

insert into save_keys (user_id, key, value, stamp) values ((select p from dz), 'wikster.profile.v1', '{"old":true}', 5);
select t_is('a device that missed the wipe cannot push the old profile back', not exists (select 1 from save_keys where user_id = (select p from dz) and key = 'wikster.profile.v1'));
set role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000001', false);
select sync_me(jsonb_build_object('wikster.profile.v1', jsonb_build_object('value', '{"old":true}', 'stamp', 10)), null, null, null);
reset role;
select t_is('not even through sync_me', not exists (select 1 from save_keys where user_id = (select p from dz) and key = 'wikster.profile.v1'));
insert into save_keys (user_id, key, value, stamp) values ((select p from dz), 'wikster.profile.v1', '{"fresh":true}', floor(extract(epoch from clock_timestamp()) * 1000)::bigint + 1000);
select t_is('but the fresh start syncs', exists (select 1 from save_keys where user_id = (select p from dz) and key = 'wikster.profile.v1'));

select econ_apply((select d from dz), '{"coins":2000,"add":[{"key":"en:D1","title":"D1","rarityId":"rare","price":100,"copies":3}]}');
insert into guilds (id, name, tag, owner, members) values ('dab00000-0000-0000-0000-000000000002', 'Leavers', 'LVR', (select d from dz), 2);
insert into guild_members (user_id, guild_id, joined_at) values
  ((select d from dz), 'dab00000-0000-0000-0000-000000000002', now() - interval '2 days'),
  ((select s from dz), 'dab00000-0000-0000-0000-000000000002', now() - interval '1 day');
select econ_bank_donate((select d from dz), 'en:D1');
select econ_auction_create((select d from dz), 'en:D1', 50, 60);
select econ_auction_bid((select b from dz), (select id from auctions where seller = (select d from dz) and status = 'open'), 60);
select econ_auction_create((select f from dz), 'en:F2', 20, 60);
select econ_auction_bid((select d from dz), (select id from auctions where seller = (select f from dz) and card->>'key' = 'en:F2'), 30);
select econ_trade_propose((select d from dz), (select f from dz), '["en:D1"]', '[]');
select econ_apply((select f from dz), '{"add":[{"key":"en:F3","title":"F3","rarityId":"common","price":10}]}');
select econ_trade_propose((select f from dz), (select d from dz), '["en:F3"]', '[]');
insert into deliveries (sender, recipient, kind, payload) values ((select d from dz), (select f from dz), 'card', '{"key":"en:FromD","title":"From D"}');
insert into messages (sender, recipient, body) values ((select d from dz), (select f from dz), 'bye');
insert into cards_gone (user_id, article_key) values ((select d from dz), 'en:Old');
delete from realtime.messages;

insert into dg values (3, delete_account((select d from dz)));
select t_is('deleting the account answers ok', (select j->>'ok' = 'true' and j->>'auth' = 'true' from dg where n = 3));
select t_is('the sign-in is gone', not exists (select 1 from auth.users where id = (select d from dz)));
select t_is('the bidder on the deleted player''s lot is refunded in the wallet', (select coins = 1000 from wallets where user_id = (select b from dz)));
select t_is('the deleted player''s bid is withdrawn, not left dangling', (select bidder is null and current_bid is null and bid_count = 0 from auctions where seller = (select f from dz) and card->>'key' = 'en:F2'));
select t_is('a trade offered to the deleted player goes back to its owner', exists (select 1 from cards where user_id = (select f from dz) and article_key = 'en:F3'));
select t_is('a gift the deleted player sent still waits for the friend', exists (select 1 from deliveries where recipient = (select f from dz) and payload->>'key' = 'en:FromD'));
select t_is('the guild survives with a new owner', (select owner = (select s from dz) and members = 1 from guilds where id = 'dab00000-0000-0000-0000-000000000002'));
select t_is('and keeps the bank card, without a donor', exists (select 1 from guild_bank where guild_id = 'dab00000-0000-0000-0000-000000000002' and donor is null));
select t_is('the other devices are told to sign out', exists (select 1 from realtime.messages where topic = 'user:' || (select d from dz) and event = 'gone'));
select t_is('the friend''s chat drops the messages', exists (select 1 from realtime.messages where topic = 'user:' || (select f from dz) and event = 'removed'));
select t_is('nothing is left behind', not exists (select 1 from profiles where id = (select d from dz))
  and not exists (select 1 from cards where user_id = (select d from dz)) and not exists (select 1 from wallets where user_id = (select d from dz))
  and not exists (select 1 from econ where user_id = (select d from dz)) and not exists (select 1 from cards_gone where user_id = (select d from dz))
  and not exists (select 1 from deliveries where (select d from dz) in (sender, recipient)) and not exists (select 1 from trades where (select d from dz) in (proposer, recipient))
  and not exists (select 1 from auctions where seller = (select d from dz)) and not exists (select 1 from guild_members where user_id = (select d from dz))
  and not exists (select 1 from friendships where (select d from dz) in (requester, addressee)) and not exists (select 1 from messages where (select d from dz) in (sender, recipient)));
insert into dg values (4, delete_account((select d from dz)));
select t_is('a retry after it is gone is fine', (select j->>'gone' = 'true' from dg where n = 4));

select econ_apply((select s from dz), '{"add":[{"key":"en:S1","title":"S1","rarityId":"rare","price":100,"copies":2}]}');
select econ_bank_donate((select s from dz), 'en:S1');
insert into dg values (5, delete_account((select s from dz), false));
select t_is('the cleanup alone keeps the sign-in for the auth call', exists (select 1 from auth.users where id = (select s from dz)));
select t_is('the last member closes the guild', not exists (select 1 from guilds where id = 'dab00000-0000-0000-0000-000000000002'));
delete from auth.users where id = (select s from dz);
select t_is('and the auth delete leaves no orphans', not exists (select 1 from cards where user_id = (select s from dz))
  and not exists (select 1 from cards_gone where user_id = (select s from dz)) and not exists (select 1 from profiles where id = (select s from dz)));

set role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-0000-0000-000000000001', false);
select t_fails($q$select econ_erase('da000000-0000-0000-0000-000000000002', 'all', null, 0)$q$, 'permission denied for function econ_erase');
select t_fails($q$select delete_account('da000000-0000-0000-0000-000000000002')$q$, 'permission denied for function delete_account');
select t_fails($q$select danger_market_out('da000000-0000-0000-0000-000000000002')$q$, 'permission denied for function danger_market_out');
reset role;
