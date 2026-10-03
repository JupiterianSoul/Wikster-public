reset role;
insert into auth.users (id) values ('cd000000-0000-0000-0000-000000000001'), ('cd000000-0000-0000-0000-000000000002'), ('cd000000-0000-0000-0000-000000000003');
insert into profiles (id, username) values
  ('cd000000-0000-0000-0000-000000000001', 'cd_new'), ('cd000000-0000-0000-0000-000000000002', 'cd_old'), ('cd000000-0000-0000-0000-000000000003', 'cd_none');
insert into redeem_codes (code, items, per_user, note, legacy) values
  ('R0T0RT3ST', '[]'::jsonb, 1, 'fixture', '{"id":"rotortest","theme":"wankel","skin":"rotor","name":{"en":"Rotortest Booster"},"cards":[{"en":"Engine"}],"badge":{"id":"special-rotortest","motif":"rotor","foil":["#ccd2ff","#0000ff","#00003d"],"name":{"en":"Rotortest Badge","fr":"Badge Rotortest"}}}'),
  ('F1R3T3ST', '[]'::jsonb, 1, 'fixture', '{"id":"firetest","theme":"hellfire","frame":"hellfire","badge":{"id":"special-firetest","motif":"hellfire","live":"fire","foil":["#ffe4de","#fa8072","#5b1717"],"name":{"en":"Firetest Badge"}}}')
on conflict (code) do update set legacy = excluded.legacy;

select t_is('a code keeps its definition in its own column', (select legacy->>'id' = 'rotortest' and special is null from redeem_codes where code = 'R0T0RT3ST'));
select t_is('taking a code hands its definition to the server', (select econ_code_take('cd000000-0000-0000-0000-000000000001', 'r0t0r t3st')->'legacy'->>'theme' = 'wankel'));
select t_fails($$select econ_code_take('cd000000-0000-0000-0000-000000000001', 'R0T0RT3ST')$$, 'ALREADY_CLAIMED');

select econ_apply('cd000000-0000-0000-0000-000000000002', '{"coins":1,"state":{"codesRedeemed":{"rotortest":1,"firetest":0}}}');
select econ_apply('cd000000-0000-0000-0000-000000000003', '{"coins":1,"state":{}}');
select t_is('a player who redeemed before the move gets the definition back', (select jsonb_array_length(econ_code_defs('cd000000-0000-0000-0000-000000000002', array['rotortest','firetest'])) = 1
  and econ_code_defs('cd000000-0000-0000-0000-000000000002', array['rotortest'])->0->>'id' = 'rotortest'));
select t_is('a player who never redeemed it gets nothing', econ_code_defs('cd000000-0000-0000-0000-000000000003', array['rotortest','firetest']) = '[]'::jsonb
  and econ_code_defs(null, array['rotortest']) = '[]'::jsonb);
select t_is('only the service role may ask for definitions', not has_function_privilege('authenticated', 'public.econ_code_defs(uuid, text[])', 'execute')
  and not has_function_privilege('anon', 'public.econ_code_defs(uuid, text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.econ_code_take(uuid, text)', 'execute'));
select t_is('no client can read the codes table', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'redeem_codes' and 'anon' = any(roles))
  and (select relrowsecurity from pg_class where oid = 'public.redeem_codes'::regclass));

select econ_apply('cd000000-0000-0000-0000-000000000002', '{"coins":1,"state":{"codeDefs":{"rotortest":{"id":"rotortest","theme":"wankel","badge":{"id":"special-rotortest","motif":"rotor","foil":["#ccd2ff","#0000ff","#00003d"],"name":{"en":"Rotortest Badge","fr":"Badge Rotortest"}}},"firetest":{"id":"firetest","badge":{"id":"special-firetest","motif":"hellfire","foil":["#ffe4de","#fa8072","#5b1717"],"name":{"en":"Firetest Badge"}}}}}}');
drop table if exists cd_got;
create table cd_got as select badges_clean('cd000000-0000-0000-0000-000000000002',
  '{"worn":["special-rotortest","special-firetest","ripper"],"earned":[{"id":"special-rotortest","rank":1,"look":{"name":{"en":"Forged"},"motif":"seal","foil":["#000000","#000000","#000000"]}},{"id":"special-firetest","rank":1},{"id":"special-nobody","rank":1,"look":{"name":"x"}},{"id":"ripper","rank":2}]}'::jsonb) as b;
select t_is('a code badge is rebuilt from the definition the player redeemed', (select b->'earned'->0->'look' = '{"name":{"en":"Rotortest Badge","fr":"Badge Rotortest"},"motif":"rotor","foil":["#ccd2ff","#0000ff","#00003d"]}'::jsonb from cd_got));
select t_is('a definition not redeemed and a badge without one are dropped, other badges stay', (select jsonb_array_length(b->'earned') = 2 and b->'earned'->1->>'id' = 'ripper'
  and b->'worn' = '["special-rotortest","ripper"]'::jsonb from cd_got));
select t_is('the theme follows the redeemed definition', theme_owned((select state from econ where user_id = 'cd000000-0000-0000-0000-000000000002'), 'wankel')
  and not theme_owned((select state from econ where user_id = 'cd000000-0000-0000-0000-000000000002'), 'hellfire'));
select t_is('no friend name is left in the schema', position('"rire":"' in pg_get_functiondef('public.theme_owned(jsonb, text)'::regprocedure)) = 0);
delete from redeem_uses where code in ('R0T0RT3ST', 'F1R3T3ST');
delete from redeem_codes where code in ('R0T0RT3ST', 'F1R3T3ST');
drop table if exists cd_got;
insert into adult_wikis (api, names) values ('https://grownups.example.test/api.php', array['porn', 'Fixture Grown Ups']) on conflict (api) do nothing;
select t_is('the adult wiki list has no policy, so no player can read it', not exists (select 1 from pg_policies where tablename = 'adult_wikis')
  and (select relrowsecurity from pg_class where oid = 'public.adult_wikis'::regclass) and has_table_privilege('service_role', 'public.adult_wikis', 'select'));
set role authenticated;
select t_is('a signed in player sees none of it', (select count(*) = 0 from adult_wikis));
reset role;
select t_fails($$insert into adult_wikis (api) values ('javascript:alert(1)')$$, 'new row for relation "adult_wikis" violates check constraint "adult_wikis_api_check"');
delete from adult_wikis where api = 'https://grownups.example.test/api.php';
