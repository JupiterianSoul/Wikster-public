insert into auth.users (id) values
  ('a0c70000-0000-0000-0000-000000000001'), ('a0c70000-0000-0000-0000-000000000002'), ('a0c70000-0000-0000-0000-000000000003'),
  ('a0c70000-0000-0000-0000-000000000004');
insert into profiles (id, username) values
  ('a0c70000-0000-0000-0000-000000000001', 'seller_sam'), ('a0c70000-0000-0000-0000-000000000002', 'bidder_bea'),
  ('a0c70000-0000-0000-0000-000000000003', 'bidder_cal'), ('a0c70000-0000-0000-0000-000000000004', 'gone_gus');
create temp table mu as select 'a0c70000-0000-0000-0000-000000000001'::uuid s, 'a0c70000-0000-0000-0000-000000000002'::uuid b,
  'a0c70000-0000-0000-0000-000000000003'::uuid c, 'a0c70000-0000-0000-0000-000000000004'::uuid g;
grant select on mu to public;
create temp table mg (n integer primary key, j jsonb);
grant all on mg to public;

select econ_apply((select s from mu), '{"add":[{"key":"en:Heron","title":"Grey heron","rarityId":"legendary","price":800,"copies":4,"packId":"theme|animals","prints":{"common":1,"rare":2,"legendary":1},"data":{"thumbnail":"h.jpg","extract":"A long text"}},{"key":"en:Lone","title":"Lone","rarityId":"epic","price":500,"packId":"theme|space"},{"key":"en:Pin","title":"Pin","rarityId":"rare","price":120,"copies":3},{"key":"en:Seal","title":"Seal","rarityId":"special","data":{"special":"creator"}}]}');
select econ_apply((select b from mu), '{"coins":10000}');
select econ_apply((select c from mu), '{"coins":10000}');
select econ_apply((select g from mu), '{"coins":5000}');

select t_is('the fee is a live tuning key, 5% by default', exists (select 1 from tuning_keys where key = 'market.fee' and def = '5'::jsonb and lo = 0 and hi = 25)
  and public.market_tune('market.fee', 99) = 5);
select t_is('so are the raise and the lot cap', public.market_tune('market.step', 99) = 5 and public.market_tune('market.maxLots', 99) = 20);

select t_fails($q$select econ_market_list((select s from mu), 'en:Heron', 'rare', 100, null, 45)$q$, 'BAD_DURATION');
select t_fails($q$select econ_market_list((select s from mu), 'en:Heron', 'rare', 0, null, 60)$q$, 'BAD_PRICE');
select t_fails($q$select econ_market_list((select s from mu), 'en:Heron', 'rare', 100, 50, 60)$q$, 'BAD_BUYOUT');
select t_fails($q$select econ_market_list((select s from mu), 'en:Heron', 'legendary', 100, null, 60)$q$, 'NOT_OWNED');
select t_fails($q$select econ_market_list((select s from mu), 'en:Heron', 'epic', 100, null, 60)$q$, 'NOT_OWNED');
select t_fails($q$select econ_market_list((select s from mu), 'en:Seal', null, 100, null, 60)$q$, 'LOCKED');
select t_is('a refused listing keeps every print', (select copies = 4 and prints = '{"common":1,"rare":2,"legendary":1}'::jsonb from cards where user_id = (select s from mu) and article_key = 'en:Heron'));

insert into mg values (1, econ_market_list((select s from mu), 'en:Heron', 'rare', 100, 400, 60));
select t_is('listing escrows the exact print asked for', (select copies = 3 and prints = '{"common":1,"rare":1,"legendary":1}'::jsonb and rarity_id = 'legendary'
  from cards where user_id = (select s from mu) and article_key = 'en:Heron'));
select t_is('the lot holds that print at its print price', (select a.card->>'rarityId' = 'rare' and a.rarity = 'rare' and (a.card->>'price')::int = 305
  and a.card->>'thumbnail' = 'h.jpg' and a.theme = 'animals' and a.title = 'Grey heron' and a.buyout = 400 and a.minutes = 60 and a.fee_pct = 5
  from auctions a where a.id = (select (j->'lot'->>'id')::uuid from mg where n = 1)));
select t_is('the lot it answers is lean and knows it is mine', (select j->'lot'->>'mine' = 'true' and not (j->'lot'->'card') ? 'extract' and (j->'lot'->>'floor')::int = 100 from mg where n = 1));
insert into mg values (2, econ_market_list((select s from mu), 'en:Heron', null, 50, null, 360));
select t_is('without a rarity the lowest spare goes', (select a.rarity = 'common' from auctions a where a.id = (select (j->'lot'->>'id')::uuid from mg where n = 2))
  and (select prints = '{"rare":1,"legendary":1}'::jsonb from cards where user_id = (select s from mu) and article_key = 'en:Heron'));
insert into mg values (3, econ_market_list((select s from mu), 'en:Lone', 'epic', 300, null, 1440));
select t_is('a single copy can go, best print and all', not exists (select 1 from cards where user_id = (select s from mu) and article_key = 'en:Lone'));
select t_is('listing writes the ledger', (select count(*) = 3 from ledger where user_id = (select s from mu) and kind = 'market' and reason = 'list'));

select t_fails(format('select econ_market_bid(%L, %L, 200)', (select s from mu), (select j->'lot'->>'id' from mg where n = 1)), 'OWN_AUCTION');
select t_is('a bid under the start is refused with the lot', (select econ_market_bid((select b from mu), (select (j->'lot'->>'id')::uuid from mg where n = 1), 99)->>'error' = 'TOO_LOW'));
select t_fails(format('select econ_market_bid(%L, %L, 100)', (select g from mu), gen_random_uuid()), 'NOT_FOUND');
select econ_apply((select g from mu), '{"coins":-4950}');
select t_fails(format('select econ_market_bid(%L, %L, 100)', (select g from mu), (select j->'lot'->>'id' from mg where n = 1)), 'INSUFFICIENT_FUNDS');
select t_is('a refused bid takes nothing', (select coins = 50 from wallets where user_id = (select g from mu)));

insert into mg values (10, econ_market_bid((select b from mu), (select (j->'lot'->>'id')::uuid from mg where n = 1), 100));
select t_is('a bid is held from the wallet', (select coins = 9900 from wallets where user_id = (select b from mu)));
select t_is('and leads the lot', (select j->'lot'->>'leading' = 'true' and (j->'lot'->>'current_bid')::int = 100 and (j->'lot'->>'floor')::int = 105 from mg where n = 10));
select t_is('the bid is in the history', exists (select 1 from auction_bids where bidder = (select b from mu) and amount = 100 and bidder_name = 'bidder_bea'));
select t_fails(format('select econ_market_bid(%L, %L, 200)', (select b from mu), (select j->'lot'->>'id' from mg where n = 1)), 'LEADING');
select t_is('the floor rises by the step', (select econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 1), 104)->>'error' = 'TOO_LOW'));
delete from realtime.messages;
insert into mg values (11, econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 1), 105));
select t_is('an outbid bidder is refunded at once, to the coin', (select coins = 10000 from wallets where user_id = (select b from mu))
  and (select coins = 9895 from wallets where user_id = (select c from mu)));
select t_is('with a ledger row for the refund', exists (select 1 from ledger where user_id = (select b from mu) and kind = 'market' and reason = 'refund' and coins = 100));
select t_is('the outbid bidder hears it on their own topic', exists (select 1 from realtime.messages where topic = 'user:' || (select b from mu)
  and event = 'lot' and payload->>'kind' = 'outbid' and (payload->>'amount')::int = 105));
select t_is('and the market hears the new price', exists (select 1 from realtime.messages where topic = 'market' and event = 'auction'
  and (payload->'row'->>'current_bid')::int = 105 and not (payload->'row'->'card') ? 'extract'));
select t_fails(format('select econ_market_cancel(%L, %L)', (select s from mu), (select j->'lot'->>'id' from mg where n = 1)), 'HAS_BIDS');
select t_fails(format('select econ_market_cancel(%L, %L)', (select b from mu), (select j->'lot'->>'id' from mg where n = 2)), 'NOT_YOURS');

update auctions set ends_at = now() + interval '20 seconds' where id = (select (j->'lot'->>'id')::uuid from mg where n = 1);
insert into mg values (12, econ_market_bid((select b from mu), (select (j->'lot'->>'id')::uuid from mg where n = 1), 200));
select t_is('a late bid winds the clock up to a minute', (select ends_at > now() + interval '55 seconds' from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 1)));
select t_is('a bid at or over the buyout buys it at the buyout', (select (econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 1), 900))->>'bought' = 'true'));
select t_is('the buyer pays the buyout, not the bid', (select coins = 10000 - 400 from wallets where user_id = (select c from mu))
  and (select coins = 10000 from wallets where user_id = (select b from mu)));
select t_is('the buyer gets the exact print', (select copies = 1 and prints = '{"rare":1}'::jsonb and rarity_id = 'rare' from cards where user_id = (select c from mu) and article_key = 'en:Heron'));
select t_is('the seller is paid the price less 5%', (select coins = 400 - 20 from wallets where user_id = (select s from mu))
  and exists (select 1 from ledger where user_id = (select s from mu) and reason = 'sale' and coins = 380 and (detail->>'fee')::int = 20));
select t_is('the lot is closed as bought', (select status = 'settled' and outcome = 'bought' and fee = 20 and paid = 380 and ends_at <= now()
  from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 1)));
select t_is('every coin is accounted for', (select sum(coins) = 380 + 10000 + 9600 + 50 from wallets where user_id in (select s from mu union select b from mu union select c from mu union select g from mu)));
select t_is('a closed lot refuses bids with its state', (select econ_market_bid((select b from mu), (select (j->'lot'->>'id')::uuid from mg where n = 1), 9000)->>'error' = 'ENDED'));

insert into mg values (20, econ_market_bid((select b from mu), (select (j->'lot'->>'id')::uuid from mg where n = 3), 300));
insert into mg values (21, econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 3), 400));
insert into mg values (22, econ_market_bid((select b from mu), (select (j->'lot'->>'id')::uuid from mg where n = 3), 1000));
update auctions set ends_at = now() - interval '1 second' where id = (select (j->'lot'->>'id')::uuid from mg where n = 3);
delete from realtime.messages;
select t_is('a lot past its end refuses bids and settles there and then', (select econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 3), 5000)->>'error' = 'ENDED'));
select t_is('the winner gets the card', exists (select 1 from cards where user_id = (select b from mu) and article_key = 'en:Lone' and rarity_id = 'epic'));
select t_is('and keeps paying only the winning bid', (select coins = 9000 from wallets where user_id = (select b from mu)) and (select coins = 9600 from wallets where user_id = (select c from mu)));
select t_is('the seller gets 950 of 1000', (select coins = 380 + 950 from wallets where user_id = (select s from mu)));
select t_is('winner and seller both hear it', exists (select 1 from realtime.messages where topic = 'user:' || (select b from mu) and payload->>'kind' = 'won')
  and exists (select 1 from realtime.messages where topic = 'user:' || (select s from mu) and payload->>'kind' = 'sold' and (payload->>'paid')::int = 950));

update auctions set ends_at = now() - interval '1 second' where id = (select (j->'lot'->>'id')::uuid from mg where n = 2);
select t_is('the sweep settles what is over', public.market_sweep(50) >= 1);
select t_is('an unsold lot goes back to the seller with its print', (select outcome = 'unsold' from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 2))
  and (select copies = 3 and prints = '{"common":1,"rare":1,"legendary":1}'::jsonb from cards where user_id = (select s from mu) and article_key = 'en:Heron'));
select t_is('and the sweep has nothing left to do', public.market_sweep(50) = 0);

insert into mg values (30, econ_market_list((select s from mu), 'en:Pin', null, 10, null, 4320));
select t_is('three days is a duration', (select ends_at > now() + interval '71 hours' from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 30)));
insert into mg values (31, econ_market_cancel((select s from mu), (select (j->'lot'->>'id')::uuid from mg where n = 30)));
select t_is('a lot without bids is withdrawn for free', (select j->'lot'->>'outcome' = 'cancelled' from mg where n = 31)
  and (select copies = 3 from cards where user_id = (select s from mu) and article_key = 'en:Pin'));
select t_is('and only once', (select econ_market_cancel((select s from mu), (select (j->'lot'->>'id')::uuid from mg where n = 30))->>'error' = 'ENDED'));

insert into mg values (40, econ_market_list((select s from mu), 'en:Pin', null, 10, 30, 60));
select t_fails(format('select econ_market_bid(%L, %L, null, true)', (select s from mu), (select j->'lot'->>'id' from mg where n = 40)), 'OWN_AUCTION');
insert into mg values (41, econ_market_bid((select b from mu), (select (j->'lot'->>'id')::uuid from mg where n = 40), null, true));
select t_is('buying out takes the buyout price', (select j->>'bought' = 'true' and (j->>'paid')::int = 30 from mg where n = 41)
  and (select coins = 9000 - 30 from wallets where user_id = (select b from mu)));
select t_is('a bought lot cannot be bought twice', (select econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 40), null, true)->>'error' = 'ENDED'));
select t_is('the fee rounds up to a whole coin', (select fee = 2 and paid = 28 from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 40)));

insert into tuning (key, value) values ('market.fee', '10') on conflict (key) do update set value = excluded.value;
insert into mg values (50, econ_market_list((select s from mu), 'en:Pin', null, 100, null, 60));
delete from tuning where key = 'market.fee';
insert into mg values (51, econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 50), 100));
update auctions set ends_at = now() - interval '1 second' where id = (select (j->'lot'->>'id')::uuid from mg where n = 50);
select market_sweep(5);
select t_is('a lot keeps the fee of the day it was listed', (select fee_pct = 10 and fee = 10 and paid = 90 from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 50)));

insert into mg values (60, econ_market_list((select s from mu), 'en:Heron', 'common', 40, null, 60));
do $$
declare i integer; who uuid; lot uuid := (select (j->'lot'->>'id')::uuid from mg where n = 60); fl integer;
begin
  for i in 1..16 loop
    who := case when i % 2 = 0 then (select b from mu) else (select c from mu) end;
    fl := (select market_floor(current_bid, start_price) from auctions where id = lot);
    perform econ_market_bid(who, lot, fl);
  end loop;
end $$;
select t_is('a run of bids leaves exactly one held', (select (select coins from wallets where user_id = (select b from mu)) + (select coins from wallets where user_id = (select c from mu))
  + (select current_bid from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 60)) = 8970 + 9500));
select t_fails(format('select econ_market_bid(%L, %L, null, true)', (select c from mu), (select j->'lot'->>'id' from mg where n = 60)), 'NO_BUYOUT');
select t_is('and a history of every one', (select count(*) = 16 and count(distinct amount) = 16 from auction_bids where auction = (select (j->'lot'->>'id')::uuid from mg where n = 60)));
select t_is('the same amount twice is refused the second time', (select econ_market_bid((select c from mu), (select (j->'lot'->>'id')::uuid from mg where n = 60),
  (select current_bid from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 60)))->>'error' = 'TOO_LOW'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0c70000-0000-0000-0000-000000000002', false);
insert into mg values (70, market_browse('{"q":"grey"}', 'ending', 24, 0));
insert into mg values (71, market_browse('{"rarity":["common"],"q":"HERON"}', 'price', 24, 0));
insert into mg values (72, market_browse('{"theme":"space","q":"heron"}', 'newest', 24, 0));
insert into mg values (73, market_browse('{"buyout":true,"q":"heron"}', 'ending', 24, 0));
insert into mg values (74, market_browse('{"min":1,"max":5,"q":"heron"}', 'ending', 24, 0));
insert into mg values (75, market_lot((select (j->'lot'->>'id')::uuid from mg where n = 60)));
insert into mg values (76, market_mine('bidding', 30, 0));
insert into mg values (77, market_mine('history', 30, 0));
insert into mg values (78, market_prices('en:Heron', null));
reset role;
select t_is('browse lists the open lots with a count', (select (j->>'total')::int = 1 and jsonb_array_length(j->'rows') = 1 and j ? 'now' from mg where n = 70));
select t_is('and filters on rarity and title', (select (j->>'total')::int = 1 and j->'rows'->0->>'rarity' = 'common' from mg where n = 71));
select t_is('and on album', (select (j->>'total')::int = 0 from mg where n = 72));
select t_is('and on buyout', (select (j->>'total')::int = 0 from mg where n = 73));
select t_is('and on price', (select (j->>'total')::int = 0 from mg where n = 74));
select t_is('a lot shows its bid history, newest first, mine marked', (select jsonb_array_length(j->'bids') = 16 and j->'bids'->0->>'me' = 'true'
  and (j->'bids'->0->>'amount')::int > (j->'bids'->1->>'amount')::int and j->'card' ? 'extract' from mg where n = 75));
select t_is('and the recent sales of the card', (select jsonb_array_length(j->'sales') = 1 and (j->'sales'->0->>'price')::int = 400 from mg where n = 75));
select t_is('my bids list the lot I lead', (select (j->>'total')::int = 1 and j->'rows'->0->>'role' = 'leading' and (j->'counts'->>'leading')::int = 1 from mg where n = 76));
select t_is('my history has the won, the lost and the bought', (select (select count(*) from jsonb_array_elements(j->'rows') r where r->>'role' = 'won') = 2
  and (select count(*) from jsonb_array_elements(j->'rows') r where r->>'role' = 'lost') = 1 from mg where n = 77));
select t_is('prices know the recent sales', (select jsonb_array_length(j->'sales') = 1 and (j->>'open')::int > 0 from mg where n = 78));
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0c70000-0000-0000-0000-000000000001', false);
insert into mg values (79, market_mine('history', 30, 0));
insert into mg values (80, market_mine('selling', 30, 0));
reset role;
select t_is('the seller history has sold, expired and withdrawn', (select (select count(*) from jsonb_array_elements(j->'rows') r where r->>'role' = 'sold') = 4
  and (select count(*) from jsonb_array_elements(j->'rows') r where r->>'role' = 'expired') = 1
  and (select count(*) from jsonb_array_elements(j->'rows') r where r->>'role' = 'cancelled') = 1 from mg where n = 79));
select t_is('and selling has the open one', (select (j->>'total')::int = 1 and (j->'counts'->>'selling')::int = 1 from mg where n = 80));

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0c70000-0000-0000-0000-000000000002', false);
select t_fails($q$select econ_market_bid('a0c70000-0000-0000-0000-000000000002', gen_random_uuid(), 10)$q$, 'permission denied for function econ_market_bid');
select t_fails($q$select econ_market_list('a0c70000-0000-0000-0000-000000000002', 'en:Heron', null, 10, null, 60)$q$, 'permission denied for function econ_market_list');
select t_fails($q$select market_close(gen_random_uuid(), null)$q$, 'permission denied for function market_close');
select t_fails($q$select market_sweep(10)$q$, 'permission denied for function market_sweep');
reset role;
select t_is('bids are written by the server alone', (select relrowsecurity from pg_class where oid = 'public.auction_bids'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'auction_bids'));

insert into rate_counters (user_id, bucket, window_start, n)
  values ((select g from mu), 'market', to_timestamp(floor(extract(epoch from now()) / 60) * 60), 40)
  on conflict (user_id, bucket, window_start) do update set n = 40;
select t_fails(format('select econ_market_bid(%L, %L, 1)', (select g from mu), (select j->'lot'->>'id' from mg where n = 60)), 'SLOW_DOWN');
delete from rate_counters where user_id = (select g from mu);

insert into mg values (90, econ_market_list((select s from mu), 'en:Heron', 'rare', 10, null, 60));
insert into mg values (91, econ_market_bid((select g from mu), (select (j->'lot'->>'id')::uuid from mg where n = 90), 10));
delete from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 90);
select t_is('a lot deleted with a bid on it refunds the bidder', (select coins = 50 from wallets where user_id = (select g from mu)));

insert into mg values (92, econ_market_list((select s from mu), 'en:Pin', null, 10, null, 60));
insert into mg values (93, econ_market_bid((select g from mu), (select (j->'lot'->>'id')::uuid from mg where n = 92), 20));
insert into mg values (94, jsonb_build_object('ok', public.admin_auction_pull((select (j->'lot'->>'id')::uuid from mg where n = 92))));
select t_is('admins pull a lot, refunding the bid and returning the card', (select (j->>'ok')::boolean from mg where n = 94)
  and exists (select 1 from cards where user_id = (select s from mu) and article_key = 'en:Pin')
  and (select coins = 50 from wallets where user_id = (select g from mu))
  and (select outcome = 'pulled' and status = 'cancelled' from auctions where id = (select (j->'lot'->>'id')::uuid from mg where n = 92)));

insert into auctions (seller, seller_name, card, start_price, current_bid, bidder, bidder_name, bid_count, ends_at, created_at)
  values ((select s from mu), 'seller_sam', '{"key":"en:Oldlot","title":"Old lot","rarityId":"rare","price":90}', 50, 60, (select b from mu), 'bidder_bea', 1,
          now() - interval '1 minute', now() - interval '2 hours');
insert into mg values (96, jsonb_build_object('n', public.market_sweep(5)));
select t_is('a lot from before the rework still settles', (select (j->>'n')::int = 1 from mg where n = 96)
  and exists (select 1 from cards where user_id = (select b from mu) and article_key = 'en:Oldlot' and rarity_id = 'rare')
  and (select outcome = 'sold' and paid = 57 from auctions where card->>'key' = 'en:Oldlot'));

insert into mg values (95, econ_auction_create((select s from mu), 'en:Pin', 25, 10));
select t_is('the old create action still lists, on the nearest duration', (select (j->>'minutes')::int = 60 and j->>'status' = 'open' from mg where n = 95));
select t_fails(format('select econ_auction_bid(%L, %L, 5)', (select c from mu), (select j->>'id' from mg where n = 95)), 'TOO_LOW');
select t_is('and the old bid action bids', (select econ_auction_bid((select c from mu), (select (j->>'id')::uuid from mg where n = 95), 25)->>'bidder' = (select c from mu)::text));
