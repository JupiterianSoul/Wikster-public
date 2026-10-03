reset role;
grant select, update on public.profiles to authenticated;
grant select on public.friendships to authenticated;
insert into auth.users (id) values ('ab000000-0000-0000-0000-000000000001'), ('ab000000-0000-0000-0000-000000000002'), ('ab000000-0000-0000-0000-000000000003');
insert into profiles (id, username) values
  ('ab000000-0000-0000-0000-000000000001', 'look_owner'), ('ab000000-0000-0000-0000-000000000002', 'look_poor'), ('ab000000-0000-0000-0000-000000000003', 'look_legacy');
select econ_apply('ab000000-0000-0000-0000-000000000001', '{"coins":10,"state":{"owned":{"themes":["custom","arcade","matrix"],"fx":["legendary:moltengold"]},"codesRedeemed":{"pixeltest":1},"codeDefs":{"pixeltest":{"id":"pixeltest","theme":"pixel"}},"seasonUnlocks":{"themes":["frost"],"badges":[]}}}');
select econ_apply('ab000000-0000-0000-0000-000000000002', '{"coins":10,"state":{"owned":{"themes":["paper"],"fx":[]}}}');

select t_is('aurora is everyone''s', theme_owned('{}'::jsonb, 'aurora'));
select t_is('a bought theme is owned', theme_owned('{"owned":{"themes":["matrix"]}}', 'matrix'));
select t_is('a theme not bought is not', not theme_owned('{"owned":{"themes":["matrix"]}}', 'arcade'));
select t_is('a code theme follows its redeemed code', theme_owned('{"codesRedeemed":{"pixeltest":1},"codeDefs":{"pixeltest":{"id":"pixeltest","theme":"pixel"}}}', 'pixel')
  and not theme_owned('{"codesRedeemed":{"pixeltest":1}}', 'pixel') and not theme_owned('{"codesRedeemed":{"pixeltest":0},"codeDefs":{"pixeltest":{"id":"pixeltest","theme":"pixel"}}}', 'pixel') and not theme_owned('{"owned":{"themes":["pixel"]}}', 'pixel'));
select t_is('a season theme follows the season unlocks', theme_owned('{"seasonUnlocks":{"themes":["frost"]}}', 'frost') and not theme_owned('{"owned":{"themes":["frost"]}}', 'frost'));
select t_is('the custom theme is its own purchase', theme_owned('{"owned":{"themes":["custom"]}}', 'custom') and not theme_owned('{}'::jsonb, 'custom'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000001', false);
update profiles set appearance = '{"v":1,"theme":"custom","fx":{"legendary":"moltengold","rare":"neonsign","common":"classic"},"custom":{"palette":{"bg":"#1A0B2E","ink":"#ffffff","accent":"#ff00aa80","line":"red","warning":"#12"},"layers":{"sound":"arcade","font":"matrix","shape":"arcade","scene":"pixel","special":"arcade","extra":"x"},"veil":140}}'
  where id = 'ab000000-0000-0000-0000-000000000001';
reset role;
select t_is('the owner keeps the custom theme they bought', (select appearance->>'theme' = 'custom' from profiles where id = 'ab000000-0000-0000-0000-000000000001'));
select t_is('effects they own stay, the others and classic go', (select appearance->'fx' = '{"legendary":"moltengold"}'::jsonb from profiles where id = 'ab000000-0000-0000-0000-000000000001'));
select t_is('good colours stay, lowercased, bad ones go', (select appearance->'custom'->'palette' = '{"bg":"#1a0b2e","ink":"#ffffff","accent":"#ff00aa80"}'::jsonb from profiles where id = 'ab000000-0000-0000-0000-000000000001'));
select t_is('layers from owned themes stay, a code theme they redeemed too', (select appearance->'custom'->'layers' = '{"sound":"arcade","font":"matrix","shape":"arcade","scene":"pixel","special":"arcade"}'::jsonb from profiles where id = 'ab000000-0000-0000-0000-000000000001'));
select t_is('the veil is held to its range', (select (appearance->'custom'->>'veil')::int = 90 from profiles where id = 'ab000000-0000-0000-0000-000000000001'));

set role authenticated;
update profiles set appearance = '{"theme":"custom","custom":{"palette":{},"layers":{"shape":"noir","scene":"hellfire","sound":"custom","special":"matrix"}}}'
  where id = 'ab000000-0000-0000-0000-000000000001';
reset role;
select t_is('a layer from a theme not owned is dropped', (select appearance->'custom'->'layers' = '{}'::jsonb from profiles where id = 'ab000000-0000-0000-0000-000000000001'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', false);
update profiles set appearance = '{"theme":"custom","custom":{"palette":{"ink":"#000000"},"layers":{"shape":"paper"}}}' where id = 'ab000000-0000-0000-0000-000000000002';
reset role;
select t_is('without the purchase a custom theme falls back to aurora', (select appearance = '{"v":1,"theme":"aurora","fx":{}}'::jsonb from profiles where id = 'ab000000-0000-0000-0000-000000000002'));

set role authenticated;
update profiles set appearance = '{"theme":"paper","fx":{"epic":"geode"}}' where id = 'ab000000-0000-0000-0000-000000000002';
reset role;
select t_is('a bought theme is published as it is', (select appearance->>'theme' = 'paper' and appearance->'fx' = '{}'::jsonb from profiles where id = 'ab000000-0000-0000-0000-000000000002'));

set role authenticated;
update profiles set appearance = '{"theme":"apotheosis"}' where id = 'ab000000-0000-0000-0000-000000000002';
reset role;
select t_is('the creator''s theme cannot be borrowed', (select appearance->>'theme' = 'aurora' from profiles where id = 'ab000000-0000-0000-0000-000000000002'));

set role authenticated;
update profiles set appearance = jsonb_build_object('theme', 'paper', 'pad', repeat('x', 5000)) where id = 'ab000000-0000-0000-0000-000000000002';
reset role;
select t_is('an oversized appearance is refused', (select appearance is null from profiles where id = 'ab000000-0000-0000-0000-000000000002'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000003', false);
update profiles set appearance = '{"theme":"matrix","fx":{"rare":"neonsign"}}' where id = 'ab000000-0000-0000-0000-000000000003';
reset role;
select t_is('a player with no server economy is shaped but not checked', (select appearance = '{"v":1,"theme":"matrix","fx":{"rare":"neonsign"}}'::jsonb from profiles where id = 'ab000000-0000-0000-0000-000000000003'));

update profiles set level = level where id = 'ab000000-0000-0000-0000-000000000001';
select t_is('other profile writes leave the appearance alone', (select appearance->>'theme' = 'custom' from profiles where id = 'ab000000-0000-0000-0000-000000000001'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'ab000000-0000-0000-0000-000000000002', false);
select t_is('anyone signed in reads a public appearance', (select appearance->>'theme' = 'custom' from profiles where id = 'ab000000-0000-0000-0000-000000000001'));
reset role;
