insert into auth.users (id) values
  ('b0050000-0000-0000-0000-000000000001'), ('b0050000-0000-0000-0000-000000000002'), ('b0050000-0000-0000-0000-000000000003');
insert into profiles (id, username) values
  ('b0050000-0000-0000-0000-000000000001', 'beatrix'), ('b0050000-0000-0000-0000-000000000002', 'bobby'), ('b0050000-0000-0000-0000-000000000003', 'bixby');
insert into friendships (requester, addressee, status) values ('b0050000-0000-0000-0000-000000000001', 'b0050000-0000-0000-0000-000000000002', 'accepted');
create temp table bu as select 'b0050000-0000-0000-0000-000000000001'::uuid a, 'b0050000-0000-0000-0000-000000000002'::uuid b, 'b0050000-0000-0000-0000-000000000003'::uuid c;
grant select on bu to public;

select econ_apply((select a from bu), '{"inventory":[{"spec_id":"theme|t|std|5","spec":{"kind":"theme","cards":5},"delta":2}]}');
insert into pulls (nonce, user_id, spec_id, spec, cards) values
  ('b0050000-1111-4000-8000-000000000001', (select a from bu), 'theme|t|std|5', '{"kind":"theme","cards":5}', '[{"article":{"key":"en:A"},"rarityId":"common"}]'),
  ('b0050000-1111-4000-8000-000000000002', (select a from bu), 'theme|t|std|5', '{"kind":"theme","cards":5}', '[{"article":{"key":"en:B"},"rarityId":"common"}]');
select econ_apply((select a from bu), '{"pull":"b0050000-1111-4000-8000-000000000002","pullCards":[{"article":{"key":"en:B"},"rarityId":"legendary"}],"kind":"open","inventory":[{"spec_id":"theme|t|std|5","delta":-1}],"add":[{"key":"en:B","title":"B","rarityId":"legendary","price":420}]}');
select t_is('a draw opens out of order by its nonce', (select claimed_at is not null from pulls where nonce = 'b0050000-1111-4000-8000-000000000002')
  and (select claimed_at is null from pulls where nonce = 'b0050000-1111-4000-8000-000000000001'));
select t_is('the claim keeps the cards that were filed, pity included', (select cards->0->>'rarityId' = 'legendary' from pulls where nonce = 'b0050000-1111-4000-8000-000000000002'));
select t_fails($$select econ_apply((select a from bu), '{"pull":"b0050000-1111-4000-8000-000000000002","inventory":[{"spec_id":"theme|t|std|5","delta":-1}],"add":[{"key":"en:B","title":"B","rarityId":"legendary","price":420}]}')$$, 'NO_PULL');
select t_is('a claim cannot land twice, so the booster and the cards stay counted once', (select count = 1 from inventory where user_id = (select a from bu) and spec_id = 'theme|t|std|5')
  and (select copies = 1 from cards where user_id = (select a from bu) and article_key = 'en:B'));
select t_fails($$select econ_apply((select b from bu), '{"pull":"b0050000-1111-4000-8000-000000000001"}')$$, 'NO_PULL');

select econ_apply((select a from bu), '{"inventory":[{"spec_id":"timed|1|std|6","spec":{"kind":"timed","cards":6,"timedSlots":2},"delta":1}]}');
insert into pulls (nonce, user_id, spec_id, spec, cards) values
  ('b0050000-2222-4000-8000-000000000001', (select a from bu), 'timed|1|std|3', '{"kind":"timed","cards":3}', '[]'),
  ('b0050000-2222-4000-8000-000000000002', (select a from bu), 'timed|1|std|3', '{"kind":"timed","cards":3}', '[]'),
  ('b0050000-2222-4000-8000-0000000000aa', (select a from bu), 'timed|1|std|6', '{"kind":"timed","cards":6,"timedSlots":2}', '[]');
select t_fails($$select econ_apply((select a from bu), '{"pull":"b0050000-2222-4000-8000-0000000000aa","consume":["b0050000-2222-4000-8000-000000000001","b0050000-0000-4000-8000-00000000dead"],"inventory":[{"spec_id":"timed|1|std|6","delta":-1}]}')$$, 'NO_PULL');
select t_is('a merge that misses a part changes nothing', (select count(*) = 3 from pulls where user_id = (select a from bu) and spec_id like 'timed%' and claimed_at is null));
select econ_apply((select a from bu), '{"pull":"b0050000-2222-4000-8000-0000000000aa","consume":["b0050000-2222-4000-8000-000000000001","b0050000-2222-4000-8000-000000000002"],"inventory":[{"spec_id":"timed|1|std|6","delta":-1}]}');
select t_is('a merged free booster spends its parts with it', (select count(*) = 0 from pulls where user_id = (select a from bu) and spec_id like 'timed%' and claimed_at is null));

select econ_apply((select a from bu), '{"add":[{"key":"en:P","title":"P","rarityId":"rare","price":160,"copies":2,"data":{"thumbnail":"p.jpg"}}]}');
select econ_apply((select a from bu), '{"add":[{"key":"en:P","title":"P","rarityId":"epic","price":240}]}');
select t_is('a better pull shows as the best print and keeps the spares', (select rarity_id = 'epic' and price = 240 and copies = 3 and prints = '{"rare":2,"epic":1}'::jsonb
  from cards where user_id = (select a from bu) and article_key = 'en:P'));
select t_is('a spare is worth its own print', print_price(240, 'epic', 'rare') = 160 and card_value(240, 'epic', 3, '{"rare":2,"epic":1}') = 560);
select t_is('the totals sum prints at their own price', (select n_value = (select sum(card_value(price, rarity_id, copies, prints)) from cards where user_id = (select a from bu)) from econ where user_id = (select a from bu)));
select t_is('the row read back carries its prints', (select econ_card_json(c)->'prints' = '{"rare":2,"epic":1}'::jsonb from cards c where user_id = (select a from bu) and article_key = 'en:P'));

select t_is('removing a copy takes the lowest spare', (econ_apply((select a from bu), '{"remove":[{"key":"en:P"}]}')->'removed'->0->>'rarityId') = 'rare');
select t_is('and leaves the best print', (select rarity_id = 'epic' and copies = 2 and prints = '{"rare":1,"epic":1}'::jsonb from cards where user_id = (select a from bu) and article_key = 'en:P'));
select t_fails($$select econ_apply((select a from bu), '{"remove":[{"key":"en:P","copies":2,"rarityId":"rare"}]}')$$, 'NOT_OWNED');
select t_fails($$select econ_apply((select a from bu), '{"remove":[{"key":"en:P","rarityId":"epic"}]}')$$, 'NOT_OWNED');

select econ_gift((select a from bu), (select b from bu), 'card', 'en:P', null);
select t_is('a gift sends the spare at its rarity and price', (select payload->>'rarityId' = 'rare' and (payload->>'price')::integer = 160 from deliveries where sender = (select a from bu) and kind = 'card'));
select t_is('the last copy goes at its best print', (econ_take_card((select a from bu), 'en:P', 1)->>'rarityId') = 'epic');
select t_is('and the card is gone', not exists (select 1 from cards where user_id = (select a from bu) and article_key = 'en:P'));

insert into cards (user_id, article_key, title, rarity_id, price, copies) values ((select a from bu), 'en:Old', 'Old', 'legendary', 420, 3);
select econ_recount((select a from bu));
select t_is('a row from before prints counts every copy at its rarity', card_value(420, 'legendary', 3, null) = 1260);
select econ_trade_propose((select a from bu), (select b from bu), '["en:Old"]', '[]');
select t_is('a trade offer of an old row takes a copy at its single rarity', (select offer->0->>'rarityId' = 'legendary' and (offer->0->>'price')::integer = 420 from trades where proposer = (select a from bu)));
select t_is('and the old row gets its prints written', (select copies = 2 and prints = '{"legendary":2}'::jsonb from cards where user_id = (select a from bu) and article_key = 'en:Old'));
select econ_apply((select a from bu), '{"add":[{"key":"en:Old","title":"Old","rarityId":"common","price":20}]}');
select econ_trade_cancel((select a from bu), (select id from trades where proposer = (select a from bu)));
select t_is('a cancelled trade gives the legendary back next to the new common', (select copies = 4 and rarity_id = 'legendary' and prints = '{"common":1,"legendary":3}'::jsonb from cards where user_id = (select a from bu) and article_key = 'en:Old'));
select econ_auction_create((select a from bu), 'en:Old', 50, 60);
select t_is('an auction lists the lowest spare', (select card->>'rarityId' = 'common' and (card->>'price')::integer = 100 from auctions where seller = (select a from bu)));
select econ_auction_cancel((select a from bu), (select id from auctions where seller = (select a from bu)));
select t_is('and a cancelled auction returns that spare', (select copies = 4 and prints = '{"common":1,"legendary":3}'::jsonb from cards where user_id = (select a from bu) and article_key = 'en:Old'));

select econ_apply((select a from bu), '{"remove":[{"key":"en:Old","copies":2,"rarityId":"legendary"}]}');
select t_is('spares of one rarity leave together', (select copies = 2 and rarity_id = 'legendary' and prints = '{"common":1,"legendary":1}'::jsonb from cards where user_id = (select a from bu) and article_key = 'en:Old'));
select t_fails($$select econ_apply((select a from bu), '{"remove":[{"key":"en:Old","rarityId":"legendary"}]}')$$, 'NOT_OWNED');
select econ_apply((select a from bu), '{"remove":[{"key":"en:Old"}]}');
select t_is('the best print is never taken while a spare is left', (select copies = 1 and rarity_id = 'legendary' and price = 420 from cards where user_id = (select a from bu) and article_key = 'en:Old'));
select t_is('every total still matches the cards', (select bool_and(e.n_cards = coalesce(s.n, 0) and e.n_unique = coalesce(s.u, 0) and e.n_value = coalesce(s.v, 0))
  from econ e left join (select user_id, sum(copies) n, count(*) u, sum(card_value(price, rarity_id, copies, prints)) v from cards group by user_id) s on s.user_id = e.user_id
  where e.user_id in ((select a from bu), (select b from bu))));
select t_is('the pity threshold is a tuning key', exists (select 1 from tuning_keys where key = 'pity.legendary' and def = '40'::jsonb and lo = 10 and hi = 200));
select t_is('and accepts a value in range only', liveops_tuning_ok('pity.legendary', '25') and not liveops_tuning_ok('pity.legendary', '5'));

select econ_apply((select c from bu), '{"add":[{"key":"special:treetest:wikipedia:en:Chess","title":"Chess","rarityId":"special","price":900,"copies":2,"prints":{"special":2},"packId":"code|treetest|std|6","data":{"special":"treetest","extract":"Chess","thumbnail":"data:image/svg+xml,plate","firstPulledAt":1}}]}');
select econ_apply((select c from bu), '{"patch":[{"key":"special:treetest:wikipedia:en:Chess","favorite":true}]}');
create temp table rekey_before as select n_cards, n_unique, n_value from econ where user_id = (select c from bu);
grant select on rekey_before to public;
select t_fails($$select econ_apply((select c from bu), '{"remove":[{"key":"special:treetest:wikipedia:en:Chess","copies":2}]}')$$, 'LOCKED');
select econ_apply((select c from bu), '{"remove":[{"key":"special:treetest:wikipedia:en:Chess","copies":2,"force":true}],"add":[{"key":"special:treetest:wikipedia:en:2470211","title":"Chess","rarityId":"special","price":900,"copies":2,"prints":{"special":2},"packId":"code|treetest|std|6","data":{"special":"treetest","extract":"Chess is a 2016 action role-playing game.","thumbnail":"https://upload.wikimedia.org/ds3.jpg","firstPulledAt":1}}],"patch":[{"key":"special:treetest:wikipedia:en:2470211","favorite":true}],"keys":["special:treetest:wikipedia:en:Chess","special:treetest:wikipedia:en:2470211"]}');
select t_is('a repaired special card moves to its page id key in one go', (select copies = 2 and favorite and prints = '{"special":2}'::jsonb and rarity_id = 'special' and price = 900
  and data->>'thumbnail' like 'https://%' and data->>'special' = 'treetest' and (data->>'firstPulledAt')::bigint = 1 and pack_id = 'code|treetest|std|6'
  from cards where user_id = (select c from bu) and article_key = 'special:treetest:wikipedia:en:2470211'));
select t_is('the title key is gone and noted for the other devices', not exists (select 1 from cards where user_id = (select c from bu) and article_key = 'special:treetest:wikipedia:en:Chess')
  and exists (select 1 from cards_gone where user_id = (select c from bu) and article_key = 'special:treetest:wikipedia:en:Chess'));
select t_is('and the totals did not move', (select e.n_cards = b.n_cards and e.n_unique = b.n_unique and e.n_value = b.n_value from econ e, rekey_before b where e.user_id = (select c from bu)));
reset role;
insert into auth.users (id) values ('b0050000-0000-0000-0000-0000000000a7');
insert into cards (user_id, article_key, title, rarity_id, price, copies, lang, origin, data)
  values ('b0050000-0000-0000-0000-0000000000a7', 'en:Old_Artifact', 'Old Artifact', 'artifact', 9000, 1, 'en', 'import', '{}');
select econ_recount('b0050000-0000-0000-0000-0000000000a7');
select t_is('the old artifact rarity ranks with prismatic', rarity_rank('artifact') = rarity_rank('prismatic') and rarity_rank('ARTIFACT') = 8);
select econ_give_card('b0050000-0000-0000-0000-0000000000a7', '{"key":"en:Old_Artifact","title":"Old Artifact","rarityId":"common","price":5}');
select t_is('a common copy of an old artifact card leaves it at the top grade and price', (select rarity_id in ('artifact', 'prismatic') and price = 9000 and copies = 2
  from cards where user_id = 'b0050000-0000-0000-0000-0000000000a7' and article_key = 'en:Old_Artifact'));
