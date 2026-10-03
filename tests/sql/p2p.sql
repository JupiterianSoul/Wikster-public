insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'), ('aaaaaaaa-0000-0000-0000-000000000002'), ('aaaaaaaa-0000-0000-0000-000000000003');
insert into friendships (requester, addressee, status) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'accepted');
create temp table u as select 'aaaaaaaa-0000-0000-0000-000000000001'::uuid a, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid b, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid c;
grant select on u to public;

select econ_apply((select a from u), '{"coins":1000,"add":[{"key":"en:Cat","title":"Cat","rarityId":"rare","price":300,"copies":3,"data":{"thumbnail":"t.jpg"}},{"key":"en:Lock","title":"L","rarityId":"special","data":{"special":"creator"}}],"inventory":[{"spec_id":"open|x","spec":{"kind":"open"},"delta":1}]}');
select econ_apply((select b from u), '{"coins":500,"add":[{"key":"en:Dog","title":"Dog","rarityId":"epic","price":900}]}');

select econ_gift((select a from u), (select b from u), 'card', 'en:Cat', 'for you');
select t_is('a gift takes one copy from the sender', (select copies from cards where user_id = (select a from u) and article_key = 'en:Cat') = 2);
select t_is('and holds it in the delivery with its picture', (select payload->>'thumbnail' = 't.jpg' and payload->>'title' = 'Cat' from deliveries where kind = 'card'));
select econ_gift((select a from u), (select b from u), 'booster', 'open|x');
select t_is('a booster gift empties the slot', not exists (select 1 from inventory where user_id = (select a from u)));
select t_fails($q$select econ_gift((select a from u), (select c from u), 'card', 'en:Cat')$q$, 'NOT_FRIENDS');
select t_fails($q$select econ_gift((select a from u), (select b from u), 'card', 'en:Lock')$q$, 'LOCKED');
select t_fails($q$select econ_gift((select a from u), (select b from u), 'card', 'en:Nope')$q$, 'NOT_OWNED');
select t_fails($q$select econ_gift((select a from u), (select b from u), 'booster', 'open|x')$q$, 'NOT_HELD');
select t_is('the recipient sees both waiting', jsonb_array_length(econ_facts((select b from u), 'deliveries')) = 2);

select econ_trade_propose((select a from u), (select b from u), '["en:Cat"]', '[{"key":"en:Dog","title":"Dog","rarityId":"epic"}]');
select t_is('a proposed trade holds the offered card', (select copies from cards where user_id = (select a from u) and article_key = 'en:Cat') = 1);
select t_fails($q$select econ_trade_answer((select a from u), (select id from trades limit 1), true)$q$, 'GONE');
select econ_trade_answer((select b from u), (select id from trades limit 1), true);
select t_is('accepting gives the offer to the recipient', exists (select 1 from cards where user_id = (select b from u) and article_key = 'en:Cat'));
select t_is('and takes what was asked', not exists (select 1 from cards where user_id = (select b from u) and article_key = 'en:Dog'));
select t_is('and sends it back to the proposer', exists (select 1 from deliveries where kind = 'trade-return' and recipient = (select a from u) and payload->'cards'->0->>'key' = 'en:Dog'));
select t_fails($q$select econ_trade_answer((select b from u), (select id from trades limit 1), true)$q$, 'SETTLED');

select econ_trade_propose((select a from u), (select b from u), '["en:Cat"]', '[{"key":"en:Missing"}]');
select t_fails($q$select econ_trade_answer((select b from u), (select id from trades where status = 'pending'), true)$q$, 'NOT_OWNED');
select t_is('a failed accept changes nothing', (select status from trades where status = 'pending') = 'pending' and not exists (select 1 from cards where user_id = (select a from u) and article_key = 'en:Cat'));
select econ_trade_answer((select b from u), (select id from trades where status = 'pending'), false);
select t_is('declining returns the offer to the proposer', (select copies from cards where user_id = (select a from u) and article_key = 'en:Cat') = 1);
select econ_trade_propose((select a from u), (select b from u), '["en:Cat"]', '[]');
select econ_trade_cancel((select a from u), (select id from trades where status = 'pending'));
select t_is('cancelling returns it too', (select copies from cards where user_id = (select a from u) and article_key = 'en:Cat') = 1);

select econ_auction_create((select a from u), 'en:Cat', 100, 10);
select t_is('a listed card leaves the collection', not exists (select 1 from cards where user_id = (select a from u) and article_key = 'en:Cat'));
select t_fails($q$select econ_auction_bid((select a from u), (select id from auctions), 200)$q$, 'OWN_AUCTION');
select t_fails($q$select econ_auction_bid((select b from u), (select id from auctions), 50)$q$, 'TOO_LOW');
select t_fails($q$select econ_auction_bid((select b from u), (select id from auctions), 5000)$q$, 'INSUFFICIENT_FUNDS');
select t_fails($q$select econ_auction_bid((select c from u), (select id from auctions), 100)$q$, 'INSUFFICIENT_FUNDS');
select econ_auction_bid((select b from u), (select id from auctions), 100);
select t_is('a bid is held from the wallet', (select coins from wallets where user_id = (select b from u)) = 400);
select econ_apply((select c from u), '{"coins":1000}');
select econ_auction_bid((select c from u), (select id from auctions), 115);
select t_is('an outbid bidder is refunded at once', (select coins from wallets where user_id = (select b from u)) = 500);
select t_fails($q$select econ_auction_cancel((select a from u), (select id from auctions))$q$, 'HAS_BIDS');
update auctions set ends_at = now() - interval '1 second';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select settle_auction((select id from auctions));
reset role;
select t_is('settling gives the card to the winner', exists (select 1 from cards where user_id = (select c from u) and article_key = 'en:Cat'));
select t_is('and the money to the seller, less the 5% house fee', exists (select 1 from ledger where kind = 'market' and reason = 'sale' and user_id = (select a from u) and coins = 115 - 6 and (detail->>'fee')::int = 6));

insert into guilds (id, name, tag, owner) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Readers', 'RD', (select a from u));
insert into guild_members (user_id, guild_id) values ((select a from u), 'bbbbbbbb-0000-0000-0000-000000000001'), ((select b from u), 'bbbbbbbb-0000-0000-0000-000000000001');
select econ_apply((select a from u), '{"add":[{"key":"en:Owl","title":"Owl","rarityId":"common"}]}');
select econ_bank_donate((select a from u), 'en:Owl');
select t_is('a donated card goes into the bank', exists (select 1 from guild_bank where card->>'key' = 'en:Owl') and not exists (select 1 from cards where user_id = (select a from u) and article_key = 'en:Owl'));
select t_fails($q$select econ_bank_donate((select c from u), 'en:Owl')$q$, 'NOT_IN_GUILD');
select econ_bank_take((select b from u), (select id from guild_bank));
select t_is('taking it gives it to the member', exists (select 1 from cards where user_id = (select b from u) and article_key = 'en:Owl'));
select t_fails($q$select econ_bank_take((select b from u), gen_random_uuid())$q$, 'GONE');

insert into deliveries (sender, recipient, kind, payload) values ((select a from u), (select b from u), 'auction-money', '{"amount":5,"reason":"refund"}');
select t_is('collected deliveries are marked', (select count(*) from deliveries where recipient = (select b from u) and claimed_at is null) > 0);
select econ_apply((select b from u), jsonb_build_object('marks', (select jsonb_agg(jsonb_build_object('kind', 'delivery', 'id', id)) from deliveries where recipient = (select b from u) and claimed_at is null)));
select t_is('once', (select count(*) from deliveries where recipient = (select b from u) and claimed_at is null) = 0);
select t_fails(format($q$select econ_apply('%s', '{"marks":[{"kind":"delivery","id":"%s"}]}')$q$, (select b from u), (select id from deliveries where recipient = (select b from u) limit 1)), 'NOT_CLAIMABLE');

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t_fails($q$insert into deliveries (sender, recipient, kind, payload) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'card', '{"key":"forged"}')$q$,
  'new row violates row-level security policy for table "deliveries"');
select t_fails($q$insert into trades (proposer, recipient, offer, ask) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '[]', '[]')$q$,
  'new row violates row-level security policy for table "trades"');
select t_fails($q$select create_auction('{"key":"forged"}', 10, 10)$q$, 'permission denied for function create_auction');
select t_fails($q$select place_bid(gen_random_uuid(), 10)$q$, 'permission denied for function place_bid');
select t_fails($q$select guild_bank_take(gen_random_uuid())$q$, 'permission denied for function guild_bank_take');
select t_fails($q$select guild_goal_claim()$q$, 'permission denied for function guild_goal_claim');
select t_fails($q$select econ_gift('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'card', 'x')$q$, 'permission denied for function econ_gift');
reset role;
