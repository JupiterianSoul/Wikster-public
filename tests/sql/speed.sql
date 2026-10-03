reset role;
insert into auth.users (id) values ('5bee0000-0000-0000-0000-000000000001'), ('5bee0000-0000-0000-0000-000000000002');
insert into profiles (id, username) values ('5bee0000-0000-0000-0000-000000000001', 'fern'), ('5bee0000-0000-0000-0000-000000000002', 'felix');
insert into friendships (requester, addressee, status) values ('5bee0000-0000-0000-0000-000000000001', '5bee0000-0000-0000-0000-000000000002', 'accepted');

select econ_apply('5bee0000-0000-0000-0000-000000000001', '{"add":[{"key":"k1","title":"K1","rarityId":"rare","price":100,"copies":2},{"key":"k2","title":"K2","price":5}]}');
update wallets set updated_at = now() - interval '1 hour' where user_id = '5bee0000-0000-0000-0000-000000000001';
select econ_apply('5bee0000-0000-0000-0000-000000000001', '{"state":{"y":1}}');
select t_is('a change with no coins leaves the wallet alone', (select updated_at < now() - interval '30 minutes' from wallets where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('the economy keeps card totals', (select n_cards = 3 and n_unique = 2 and n_value = 205 from econ where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('and the profile follows them', (select cards = 3 and unique_cards = 2 and collection_value = 205 from profiles where id = '5bee0000-0000-0000-0000-000000000001'));

select econ_apply('5bee0000-0000-0000-0000-000000000001', '{"add":[{"key":"k1","title":"K1","rarityId":"epic","price":400}],"remove":[{"key":"k2"}]}');
select t_is('an upgrade and a removal move the totals, spares keep their own print', (select n_cards = 3 and n_unique = 1 and n_value = 934 from econ where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('a card that is gone is noted', exists (select 1 from cards_gone where user_id = '5bee0000-0000-0000-0000-000000000001' and article_key = 'k2'));
select econ_apply('5bee0000-0000-0000-0000-000000000001', '{"remove":[{"key":"k1"}]}');
select t_is('a card with copies left is not', not exists (select 1 from cards_gone where article_key = 'k1'));
update cards set last_at = now() - interval '1 hour' where user_id = '5bee0000-0000-0000-0000-000000000001';
select econ_apply('5bee0000-0000-0000-0000-000000000001', '{"patch":[{"key":"k1","favorite":true}]}');
select t_is('a patch marks the card changed', (select last_at > now() - interval '1 minute' from cards where article_key = 'k1'));
select t_is('and leaves the totals alone', (select n_cards = 2 and n_value = 667 from econ where user_id = '5bee0000-0000-0000-0000-000000000001'));

insert into pulls (user_id, spec_id, spec, cards) values ('5bee0000-0000-0000-0000-000000000001', 's', '{}', '[]');
select econ_apply('5bee0000-0000-0000-0000-000000000001', jsonb_build_object('pull', (select nonce from pulls where user_id = '5bee0000-0000-0000-0000-000000000001'),
  'kind', 'open', 'add', '[{"key":"k3","title":"K3","price":7}]'::jsonb, 'state', '{"boostersOpened":1,"progress":{"level":2,"xp":0}}'::jsonb));
select t_is('opening a booster writes no ledger row', not exists (select 1 from ledger where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('but reaches the profile', (select boosters_opened = 1 and level = 2 and cards = 3 from profiles where id = '5bee0000-0000-0000-0000-000000000001'));
select econ_apply('5bee0000-0000-0000-0000-000000000001', '{"coins":50,"kind":"stipend"}');
select t_is('a payment still does', (select count(*) = 1 and sum(coins) = 50 from ledger where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('and moves the wallet', (select coins = 50 and updated_at > now() - interval '1 minute' from wallets where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('a change without coins reports the wallet', (econ_apply('5bee0000-0000-0000-0000-000000000001', '{"state":{"x":1}}')->>'coins')::integer = 50);

update econ set n_cards = 77 where user_id = '5bee0000-0000-0000-0000-000000000001';
update profiles set play_ms = 10 where id = '5bee0000-0000-0000-0000-000000000001';
select t_is('a profile write that leaves the stats alone does not recount', (select cards from profiles where id = '5bee0000-0000-0000-0000-000000000001') = 3);
update profiles set cards = 0 where id = '5bee0000-0000-0000-0000-000000000001';
select t_is('a stats write reads the server totals', (select cards from profiles where id = '5bee0000-0000-0000-0000-000000000001') = 77);
select econ_recount('5bee0000-0000-0000-0000-000000000001');
select t_is('a recount puts the totals right', (select n_cards = 3 and n_unique = 2 and n_value = 674 from econ where user_id = '5bee0000-0000-0000-0000-000000000001')
  and (select cards = 3 from profiles where id = '5bee0000-0000-0000-0000-000000000001'));

select econ_gift('5bee0000-0000-0000-0000-000000000001', '5bee0000-0000-0000-0000-000000000002', 'card', 'k3');
select t_is('a gift counts out of the sender', (select n_cards = 2 and n_unique = 1 and n_value = 667 from econ where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('and the sender''s profile', (select cards = 2 from profiles where id = '5bee0000-0000-0000-0000-000000000001'));
select econ_apply('5bee0000-0000-0000-0000-000000000002', jsonb_build_object('add', jsonb_build_array(
  (select payload from deliveries where recipient = '5bee0000-0000-0000-0000-000000000002' and kind = 'card') || '{"copies":1}'::jsonb),
  'marks', jsonb_build_array(jsonb_build_object('kind', 'delivery', 'id', (select id from deliveries where recipient = '5bee0000-0000-0000-0000-000000000002')))));
select t_is('and lands with the friend', (select n_cards = 1 and n_unique = 1 from econ where user_id = '5bee0000-0000-0000-0000-000000000002'));
select econ_trade_propose('5bee0000-0000-0000-0000-000000000001', '5bee0000-0000-0000-0000-000000000002', '["k1"]', '[]');
select t_is('a trade offer takes the card out of the totals', (select n_cards = 1 and n_value = 400 from econ where user_id = '5bee0000-0000-0000-0000-000000000001'));
select econ_trade_cancel('5bee0000-0000-0000-0000-000000000001', (select id from trades where proposer = '5bee0000-0000-0000-0000-000000000001'));
select t_is('and a cancelled trade puts it back', (select n_cards = 2 and n_value = 667 from econ where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('the totals match the cards after every path', (select bool_and(e.n_cards = coalesce(s.n, 0) and e.n_unique = coalesce(s.u, 0) and e.n_value = coalesce(s.v, 0))
  from econ e left join (select user_id, sum(copies) n, count(*) u, sum(card_value(price, rarity_id, copies, prints)) v from cards group by user_id) s on s.user_id = e.user_id
  where e.user_id in ('5bee0000-0000-0000-0000-000000000001', '5bee0000-0000-0000-0000-000000000002')));

select econ_wipe('5bee0000-0000-0000-0000-000000000001', 'all');
select t_is('erasing everything zeroes the totals', (select n_cards = 0 and n_unique = 0 and n_value = 0 from econ where user_id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('and the profile', (select cards = 0 and unique_cards = 0 and collection_value = 0 from profiles where id = '5bee0000-0000-0000-0000-000000000001'));
select t_is('and notes every card as gone', exists (select 1 from cards_gone where user_id = '5bee0000-0000-0000-0000-000000000001' and article_key = 'k1'));
delete from auth.users where id = '5bee0000-0000-0000-0000-000000000002';
select t_is('deleting an account leaves no gone cards behind', not exists (select 1 from cards_gone where user_id = '5bee0000-0000-0000-0000-000000000002'));

insert into auth.users (id) values ('5bee0000-0000-0000-0000-000000000003');
select econ_apply('5bee0000-0000-0000-0000-000000000003', '{"add":[{"key":"a1","title":"A1","price":3},{"key":"a2","title":"A2","price":4}],"inventory":[{"spec_id":"sp","spec":{"kind":"open"},"delta":2}]}');
insert into pulls (user_id, spec_id, spec, cards, at) values
  ('5bee0000-0000-0000-0000-000000000003', 'sp', '{"kind":"open"}', '[{"article":{"key":"a1"}},{"article":{"key":"new"}}]', now() - interval '1 minute'),
  ('5bee0000-0000-0000-0000-000000000003', 'sp', '{"kind":"open"}', '[{"article":{"key":"a2"}}]', now());
select t_is('a load brings the cards asked for', (select jsonb_array_length(d->'cards') = 1 and d->'keys' = '["a2"]'::jsonb
  from (select econ_load('5bee0000-0000-0000-0000-000000000003', p_keys => array['a2']) d) x));
select t_is('a load brings the draw, its cards and the first one waiting', (select d->'pull'->>'spec_id' = 'sp' and d->'pull'->>'first' = d->'pull'->>'nonce'
  and jsonb_array_length(d->'cards') = 1 and d->'keys' = '["a1","new"]'::jsonb and not (d->'pull'->>'claimed')::boolean
  from (select econ_load('5bee0000-0000-0000-0000-000000000003', p_pull => (select nonce from pulls where user_id = '5bee0000-0000-0000-0000-000000000003' order by at limit 1)) d) x));
select t_is('the second draw knows it is not first', (select d->'pull'->>'first' <> d->'pull'->>'nonce'
  from (select econ_load('5bee0000-0000-0000-0000-000000000003', p_pull => (select nonce from pulls where user_id = '5bee0000-0000-0000-0000-000000000003' order by at desc limit 1)) d) x));
select t_is('a draw that is not yours is not found', (select d ? 'pull' and d->'pull' = 'null'::jsonb
  from (select econ_load('5bee0000-0000-0000-0000-000000000001', p_pull => (select nonce from pulls where user_id = '5bee0000-0000-0000-0000-000000000003' limit 1)) d) x));
update cards set last_at = now() - interval '2 hours' where user_id = '5bee0000-0000-0000-0000-000000000003';
select econ_apply('5bee0000-0000-0000-0000-000000000003', '{"remove":[{"key":"a1"}],"patch":[{"key":"a2","favorite":true}]}');
select t_is('a load since a moment brings only what changed and what is gone', (select jsonb_array_length(d->'since'->'cards') = 1
  and d->'since'->'cards'->0->>'article_key' = 'a2' and d->'since'->'gone' = '["a1"]'::jsonb
  from (select econ_load('5bee0000-0000-0000-0000-000000000003', p_since => now() - interval '1 hour') d) x));
select econ_apply('5bee0000-0000-0000-0000-000000000003', '{"add":[{"key":"a1","title":"A1","price":3}]}');
select t_is('a card that came back is not listed as gone', (select d->'since'->'gone' = '[]'::jsonb and jsonb_array_length(d->'since'->'cards') = 2
  from (select econ_load('5bee0000-0000-0000-0000-000000000003', p_since => now() - interval '1 hour') d) x));
select econ_load('5bee0000-0000-0000-0000-000000000003', 'batch-test', 5, p_weight => 4);
select t_fails($q$select econ_load('5bee0000-0000-0000-0000-000000000003', 'batch-test', 5, p_weight => 2)$q$, 'SLOW_DOWN');
select t_is('row policies read the caller once per query, not once per row', not exists (
  select 1 from pg_policies where schemaname = 'public'
    and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~* 'auth\.uid\(\)'));
select t_is('a load carries the card totals the phone checks itself against', (select (d->'totals'->>'cards')::bigint = (select sum(copies) from cards where user_id = '5bee0000-0000-0000-0000-000000000003')
  and (d->'totals'->>'unique')::integer = (select count(*) from cards where user_id = '5bee0000-0000-0000-0000-000000000003')
  from (select econ_load('5bee0000-0000-0000-0000-000000000003') d) x));
create temp table t_totals as select econ_apply('5bee0000-0000-0000-0000-000000000003', '{"add":[{"key":"t9","title":"T9","price":3,"copies":2}]}') d;
select t_is('and so does every change, with the totals after it', (select (d->'totals'->>'cards')::bigint = (select sum(copies) from cards where user_id = '5bee0000-0000-0000-0000-000000000003')
  and (d->'totals'->>'unique')::integer = (select count(*) from cards where user_id = '5bee0000-0000-0000-0000-000000000003')
  from t_totals));
drop table t_totals;
