reset role;
insert into auth.users (id) values ('c1a10000-0000-0000-0000-000000000001'), ('c1a10000-0000-0000-0000-000000000002');
insert into profiles (id, username) values ('c1a10000-0000-0000-0000-000000000001', 'claimer'), ('c1a10000-0000-0000-0000-000000000002', 'other');

select econ_apply('c1a10000-0000-0000-0000-000000000001', '{"coins":100,"claims":["daily:2026-10-02"],"kind":"daily"}');
select t_fails($$select econ_apply('c1a10000-0000-0000-0000-000000000001', '{"coins":100,"claims":["daily:2026-10-02"],"kind":"daily"}')$$, 'ALREADY_CLAIMED');
select t_is('a second daily gift on the same day pays nothing', (select coins = 100 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000001'));
select econ_apply('c1a10000-0000-0000-0000-000000000001', '{"coins":100,"claims":["daily:2026-10-03"],"kind":"daily"}');
select t_is('the next day pays again', (select coins = 200 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000001'));

insert into quests (user_id, day, quest_id, target, progress, claimed, expires_at)
  values ('c1a10000-0000-0000-0000-000000000001', '2026-10-02', 'open-1', 1, 1, false, now() + interval '1 day');
select econ_apply('c1a10000-0000-0000-0000-000000000001',
  '{"coins":50,"marks":[{"kind":"quest","day":"2026-10-02","id":"open-1"}],"claims":["quest:2026-10-02:open-1"],"kind":"quest"}');
select t_is('a finished quest is paid and marked', (select claimed from quests where user_id = 'c1a10000-0000-0000-0000-000000000001' and quest_id = 'open-1')
  and (select coins = 250 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000001'));
select t_fails($$select econ_apply('c1a10000-0000-0000-0000-000000000001',
  '{"coins":50,"marks":[{"kind":"quest","day":"2026-10-02","id":"open-1"}],"claims":["quest:2026-10-02:open-1"],"kind":"quest"}')$$, 'ALREADY_CLAIMED');
update quests set claimed = false where user_id = 'c1a10000-0000-0000-0000-000000000001' and quest_id = 'open-1';
select t_fails($$select econ_apply('c1a10000-0000-0000-0000-000000000001',
  '{"coins":50,"marks":[{"kind":"quest","day":"2026-10-02","id":"open-1"}],"claims":["quest:2026-10-02:open-1"],"kind":"quest"}')$$, 'ALREADY_CLAIMED');
select t_is('a quest row reset to unclaimed still cannot be paid twice', (select coins = 250 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000001'));
update quests set claimed = true where user_id = 'c1a10000-0000-0000-0000-000000000001' and quest_id = 'open-1';
select t_fails($$select econ_apply('c1a10000-0000-0000-0000-000000000001',
  '{"coins":50,"marks":[{"kind":"quest","day":"2026-10-02","id":"open-1"}],"kind":"quest"}')$$, 'NOT_CLAIMABLE');
select econ_apply('c1a10000-0000-0000-0000-000000000002', '{"coins":50,"claims":["quest:2026-10-02:open-1"],"kind":"quest"}');
select t_is('claim keys belong to one player', (select coins = 50 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000002'));

do $$
declare k text;
begin
  foreach k in array array['ach:pack-1', 'level:5', 'medal:theme|animals:bronze', 'rung:2026-autumn:3', 'squest:2026-autumn:2026-10-02',
    'stipendh:493000', 'wikdle:en:2026-10-02', 'duel:2026-10-02:1', 'quiz:2026-10-02:1', 'versus:abc', 'guildgoal:2026-W40',
    'guildmatch:2026-W39', 'code:welcome', 'event:42', 'starter'] loop
    perform econ_apply('c1a10000-0000-0000-0000-000000000001', jsonb_build_object('coins', 10, 'claims', jsonb_build_array(k), 'kind', 'claim'));
    begin
      perform econ_apply('c1a10000-0000-0000-0000-000000000001', jsonb_build_object('coins', 10, 'claims', jsonb_build_array(k), 'kind', 'claim'));
      raise exception 'FAIL  % was paid twice', k;
    exception when others then
      if sqlerrm <> 'ALREADY_CLAIMED' then raise; end if;
    end;
  end loop;
end $$;
select t_is('every reward key pays once: achievements, levels, medals, rungs, season quests, stipend, games, versus, guild, codes, events, starter',
  (select coins = 250 + 15 * 10 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000001'));
select t_fails($$select econ_apply('c1a10000-0000-0000-0000-000000000001', '{"coins":10,"claims":["ach:new-one","ach:pack-1"],"kind":"claim"}')$$, 'ALREADY_CLAIMED');
select t_is('a batch with one claimed key pays none of it', not exists (select 1 from claims where user_id = 'c1a10000-0000-0000-0000-000000000001' and key = 'ach:new-one')
  and (select coins = 400 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000001'));

insert into grants (user_id, kind, payload) values ('c1a10000-0000-0000-0000-000000000001', 'coins', '{"amount":5}');
select econ_apply('c1a10000-0000-0000-0000-000000000001',
  jsonb_build_object('coins', 5, 'marks', jsonb_build_array(jsonb_build_object('kind', 'grant', 'id', (select max(id) from grants where user_id = 'c1a10000-0000-0000-0000-000000000001')))));
select t_fails(format($$select econ_apply('c1a10000-0000-0000-0000-000000000001', '{"coins":5,"marks":[{"kind":"grant","id":%s}]}')$$,
  (select max(id) from grants where user_id = 'c1a10000-0000-0000-0000-000000000001')), 'NOT_CLAIMABLE');
select t_is('a grant lands once', (select coins = 405 from wallets where user_id = 'c1a10000-0000-0000-0000-000000000001'));

select t_is('the stipend tuning describes the hourly window', (select def = '250'::jsonb from tuning_keys where key = 'stipend.amount')
  and (select def = '8'::jsonb and hi = 48 from tuning_keys where key = 'stipend.maxBanked'));
delete from schema_marks where id = 'stipend-hourly';
insert into tuning (key, value) values ('stipend.amount', '600'), ('stipend.maxBanked', '4')
  on conflict (key) do update set value = excluded.value;
select t_is('a tuned two hour stipend is converted once', public.claims_stipend_hourly() and not public.claims_stipend_hourly());
select t_is('to half the coins and twice the windows', (select value = '300'::jsonb from tuning where key = 'stipend.amount')
  and (select value = '8'::jsonb from tuning where key = 'stipend.maxBanked'));
delete from tuning where key in ('stipend.amount', 'stipend.maxBanked');

select t_is('a first ad is paid', record_ad_reward('claims-tx-1', 'c1a10000-0000-0000-0000-000000000002', 'coins', 2, '{"kind":"coins","payload":{"amount":20}}') = 'paid');
select t_is('the same ad is not paid twice', record_ad_reward('claims-tx-1', 'c1a10000-0000-0000-0000-000000000002', 'coins', 2, '{"kind":"coins","payload":{"amount":20}}') = 'already');
select t_is('a second ad is paid', record_ad_reward('claims-tx-2', 'c1a10000-0000-0000-0000-000000000002', 'coins', 2, '{"kind":"coins","payload":{"amount":20}}') = 'paid');
select t_is('past the daily cap ads are not paid', record_ad_reward('claims-tx-3', 'c1a10000-0000-0000-0000-000000000002', 'coins', 2, '{"kind":"coins","payload":{"amount":20}}') = 'capped');
select t_is('two grants in all', (select count(*) = 2 from grants where user_id = 'c1a10000-0000-0000-0000-000000000002'));
