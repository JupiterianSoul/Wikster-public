insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

select econ_apply('11111111-1111-1111-1111-111111111111', '{"coins":500,"claims":["starter"],"state":{"started":true,"rev":1},"rev":0,"kind":"starter"}');
select t_is('the starter lands', (select coins from wallets) = 500);
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"claims":["starter"]}')$q$, 'ALREADY_CLAIMED');
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"coins":-600}')$q$, 'INSUFFICIENT_FUNDS');
select t_is('a refused change leaves the wallet alone', (select coins from wallets) = 500);
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"state":{"rev":2},"rev":0}')$q$, 'CONFLICT');

select econ_apply('11111111-1111-1111-1111-111111111111', '{"add":[{"key":"a","title":"A","rarityId":"common","price":10,"data":{"x":1}},{"key":"s","title":"S","rarityId":"special","data":{"special":"creator"}}]}');
select econ_apply('11111111-1111-1111-1111-111111111111', '{"add":[{"key":"a","title":"A","rarityId":"rare","price":90,"data":{"y":2}}]}');
select t_is('a better pull upgrades the card and keeps its data', (select rarity_id = 'rare' and price = 90 and copies = 2 and data = '{"x":1,"y":2}'::jsonb from cards where article_key = 'a'));
select econ_apply('11111111-1111-1111-1111-111111111111', '{"add":[{"key":"a","title":"A","rarityId":"common","price":5,"reprice":120}]}');
select t_is('a lesser pull only reprices', (select rarity_id = 'rare' and price = 120 and copies = 3 from cards where article_key = 'a'));
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"remove":[{"key":"s"}]}')$q$, 'LOCKED');
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"remove":[{"key":"a","copies":4}]}')$q$, 'NOT_OWNED');
select t_is('a forced take removes a locked card', (econ_apply('11111111-1111-1111-1111-111111111111', '{"remove":[{"key":"s","force":true}]}')->'removed'->0->>'key') = 's');

select econ_apply('11111111-1111-1111-1111-111111111111', '{"inventory":[{"spec_id":"x","spec":{"kind":"open"},"delta":2}]}');
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"inventory":[{"spec_id":"x","delta":-3}]}')$q$, 'NOT_HELD');
select econ_apply('11111111-1111-1111-1111-111111111111', '{"inventory":[{"spec_id":"x","delta":-2}]}');
select t_is('an emptied slot is removed', not exists (select 1 from inventory));

insert into pulls (user_id, spec_id, spec, cards) values ('11111111-1111-1111-1111-111111111111', 'x', '{}', '[]');
insert into pulls (user_id, spec_id, spec, cards) values ('11111111-1111-1111-1111-111111111111', 'x', '{}', '[]');
select t_is('several draws can wait for the same booster', (select count(*) from pulls where claimed_at is null) = 2);
select econ_apply('11111111-1111-1111-1111-111111111111', jsonb_build_object('pull', (select nonce from pulls order by at, nonce limit 1)));
select t_fails(format($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"pull":"%s"}')$q$, (select nonce from pulls where claimed_at is not null)), 'NO_PULL');
delete from pulls;

select t_is('an empty stock says so', (pool_take('wiki:a', 5)->>'left')::integer = 0);
select t_is('cards go into the stock once each', pool_put('wiki:a', '[{"key":"k1","title":"One"},{"key":"k2","title":"Two"},{"key":"k1","title":"Again"},{"title":"no key"}]') = 2);
select t_is('taking from the stock hands cards over and removes them', (select jsonb_array_length(r->'cards') = 1 and (r->>'left')::integer = 1 from (select pool_take('wiki:a', 1) r) x));
select t_is('another wiki has its own stock', (pool_take('wiki:b', 5)->>'left')::integer = 0 and (pool_take('wiki:a', 0)->>'left')::integer = 1);
select pool_put('wiki:c', (select jsonb_agg(jsonb_build_object('key', 'c' || i)) from generate_series(1, 100) i));
select pool_put('wiki:c', (select jsonb_agg(jsonb_build_object('key', 'd' || i)) from generate_series(1, 100) i));
select pool_put('wiki:c', (select jsonb_agg(jsonb_build_object('key', 'e' || i)) from generate_series(1, 50) i));
select t_is('a stock keeps at most 200 cards', (select count(*) from draw_pool where source = 'wiki:c') = 200);
set role authenticated;
select t_fails($q$select pool_take('wiki:a', 1)$q$, 'permission denied for function pool_take');
select t_fails($q$select * from draw_pool$q$, 'permission denied for table draw_pool');
reset role;

insert into quests (user_id, day, quest_id, target, progress, expires_at) values
  ('11111111-1111-1111-1111-111111111111', '2026-09-23', 'open-1', 1, 1, now()),
  ('11111111-1111-1111-1111-111111111111', '2026-09-23', 'open-2', 2, 1, now());
select t_is('quest facts are read', econ_facts('11111111-1111-1111-1111-111111111111', 'quest', '{"day":"2026-09-23","id":"open-1"}')->>'progress' = '1');
select econ_apply('11111111-1111-1111-1111-111111111111', '{"coins":60,"marks":[{"kind":"quest","day":"2026-09-23","id":"open-1"}]}');
select t_is('paying a quest marks it claimed', (select claimed from quests where quest_id = 'open-1'));
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"coins":60,"marks":[{"kind":"quest","day":"2026-09-23","id":"open-1"}]}')$q$, 'NOT_CLAIMABLE');
select t_fails($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"coins":60,"marks":[{"kind":"quest","day":"2026-09-23","id":"open-2"}]}')$q$, 'NOT_CLAIMABLE');
select t_is('an unfinished quest paid nothing', (select coins from wallets) = 560);

insert into grants (user_id, kind, payload) values ('11111111-1111-1111-1111-111111111111', 'coins', '{"amount":100}');
select t_is('waiting grants are listed', jsonb_array_length(econ_facts('11111111-1111-1111-1111-111111111111', 'grants')) = 1);
select econ_apply('11111111-1111-1111-1111-111111111111', jsonb_build_object('coins', 100, 'marks', jsonb_build_array(jsonb_build_object('kind', 'grant', 'id', (select id from grants)))));
select t_fails(format($q$select econ_apply('11111111-1111-1111-1111-111111111111', '{"coins":100,"marks":[{"kind":"grant","id":%s}]}')$q$, (select id from grants)), 'NOT_CLAIMABLE');
select t_is('a grant lands once', (select coins from wallets) = 660 and jsonb_array_length(econ_facts('11111111-1111-1111-1111-111111111111', 'grants')) = 0);

insert into challenges (id, kind, challenger, opponent, status, result) values
  ('33333333-3333-3333-3333-333333333333', 'clash', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'done', '{"winner":"opponent"}');
select t_is('a lost challenge reads as lost', econ_facts('11111111-1111-1111-1111-111111111111', 'challenge', '{"id":"33333333-3333-3333-3333-333333333333"}')->>'outcome' = 'lose');
select t_is('and as won for the other side', econ_facts('22222222-2222-2222-2222-222222222222', 'challenge', '{"id":"33333333-3333-3333-3333-333333333333"}')->>'outcome' = 'win');
select econ_apply('22222222-2222-2222-2222-222222222222', '{"coins":600,"marks":[{"kind":"challenge","id":"33333333-3333-3333-3333-333333333333"}]}');
select t_fails($q$select econ_apply('22222222-2222-2222-2222-222222222222', '{"coins":600,"marks":[{"kind":"challenge","id":"33333333-3333-3333-3333-333333333333"}]}')$q$, 'NOT_CLAIMABLE');
select t_is('no guild, no goal', econ_facts('11111111-1111-1111-1111-111111111111', 'guildGoal') is null);

select econ_apply('11111111-1111-1111-1111-111111111111', '{"claims":["level:2","code:x","medal:a:bronze"],"add":[{"key":"b","title":"B"}]}');
select econ_apply('11111111-1111-1111-1111-111111111111', '{"add":[{"key":"code","title":"C","rarityId":"special","data":{"special":"code"}}],"inventory":[{"spec_id":"code|x","spec":{"kind":"code"},"delta":1},{"spec_id":"open|y","spec":{"kind":"open"},"delta":1}]}');
select econ_wipe('11111111-1111-1111-1111-111111111111', 'cards', 'wipecards:1', 500);
select t_is('removing the cards keeps the special ones', (select string_agg(article_key, ',') from cards where user_id = '11111111-1111-1111-1111-111111111111') = 'code');
select t_is('and the code boosters', (select string_agg(spec_id, ',') from inventory where user_id = '11111111-1111-1111-1111-111111111111') = 'code|x');
select t_is('and resets the wallet to the starter amount', (select coins from wallets where user_id = '11111111-1111-1111-1111-111111111111') = 500);
select t_fails($q$select econ_wipe('11111111-1111-1111-1111-111111111111', 'cards', 'wipecards:1', 500)$q$, 'ALREADY_CLAIMED');
select econ_wipe('11111111-1111-1111-1111-111111111111', 'all', 'wipe:1');
select t_fails($q$select econ_wipe('11111111-1111-1111-1111-111111111111', 'all', 'wipe:1')$q$, 'ALREADY_CLAIMED');
select t_is('erasing everything empties the wallet', (select coins + ink from wallets where user_id = '11111111-1111-1111-1111-111111111111') = 0);
select t_is('and keeps only the import mark', (select state from econ where user_id = '11111111-1111-1111-1111-111111111111') - 'rev' = '{"imported":true}'::jsonb);
select t_is('the starter, levels and medals can be earned again', not exists (select 1 from claims where key in ('starter', 'level:2', 'medal:a:bronze')));
select t_is('codes stay redeemed', exists (select 1 from claims where key = 'code:x'));

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
select econ_apply('22222222-2222-2222-2222-222222222222', '{"add":[{"key":"mine","title":"Mine"}],"inventory":[{"spec_id":"y","spec":{},"delta":1}]}');
insert into pulls (user_id, spec_id, spec, cards) values ('22222222-2222-2222-2222-222222222222', 'y', '{}', '[{"secret":true}]');
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select t_fails($q$select econ_apply('22222222-2222-2222-2222-222222222222', '{"coins":1}')$q$, 'permission denied for function econ_apply');
select t_fails($q$select econ_facts('22222222-2222-2222-2222-222222222222', 'grants')$q$, 'permission denied for function econ_facts');
select t_fails($q$select econ_wipe('22222222-2222-2222-2222-222222222222', 'all')$q$, 'permission denied for function econ_wipe');
select t_fails($q$select econ_mark('22222222-2222-2222-2222-222222222222', '{"kind":"grant","id":1}')$q$, 'permission denied for function econ_mark');
select t_is('a player sees their own cards', (select count(*) from cards) = 1);
select t_is('but not the draw waiting for them', (select count(*) from pulls) = 0);
select t_is('nor anyone else''s wallet', (select count(*) from wallets) = 1);
update wallets set coins = 999999;
select t_fails($q$insert into claims (user_id, key) values ('22222222-2222-2222-2222-222222222222', 'forged')$q$,
  'new row violates row-level security policy for table "claims"');
select t_fails($q$insert into cards (user_id, article_key, title) values ('22222222-2222-2222-2222-222222222222', 'forged', 'F')$q$,
  'new row violates row-level security policy for table "cards"');
reset role;
select t_is('and a player cannot write their own wallet', (select coins from wallets where user_id = '22222222-2222-2222-2222-222222222222') = 600);
