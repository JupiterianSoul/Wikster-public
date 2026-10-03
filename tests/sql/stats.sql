reset role;
grant select, update on public.profiles to authenticated;
insert into auth.users (id) values ('5a000000-0000-0000-0000-000000000001');
insert into profiles (id, username) values ('5a000000-0000-0000-0000-000000000001', 'stats_owner');

select t_is('a clean summary passes as it is', stats_clean('{"v":1,"at":20700,"cC":7,"cPr":[2,0,1,2,2,0,0,0],"bK":[0,20,1,9]}'::jsonb)
  = '{"v":1,"at":20700,"cC":7,"cPr":[2,0,1,2,2,0,0,0],"bK":[0,20,1,9]}'::jsonb);
select t_is('unknown keys and strings are dropped', stats_clean('{"cC":3,"title":"Alpha","cU":"x","zz":1}'::jsonb) = '{"v":1,"cC":3}'::jsonb);
select t_is('numbers are rounded, floored at zero and capped', stats_clean('{"cC":-4,"cV":2.6,"cP":5000,"cB":99,"bA":1e40}'::jsonb)
  = '{"v":1,"cC":0,"cV":3,"cP":1000,"cB":7,"bA":10000000000000}'::jsonb);
select t_is('a list too long or not all numbers is dropped', stats_clean('{"cNw":[1,1,1,1,1,1,1,1,1,1,1,1,1],"cPr":[1,"a"],"bPw":[1,2]}'::jsonb) = '{"v":1,"bPw":[1,2]}'::jsonb);
select t_is('a hidden summary keeps only its day', stats_clean('{"off":1,"at":5,"cC":3}'::jsonb) = '{"v":1,"off":1,"at":5}'::jsonb);
select t_is('an oversized summary is refused', stats_clean(jsonb_build_object('cC', 1, 'pad', repeat('x', 7000))) is null);
select t_is('not an object is refused', stats_clean('[1,2]'::jsonb) is null);

set role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-0000-0000-000000000001', false);
update profiles set stats = '{"cC":12,"eC":-3,"bR":42,"name":"<b>x</b>","cNw":[0,0,4]}' where id = '5a000000-0000-0000-0000-000000000001';
reset role;
select t_is('a player writing their own stats gets them cleaned', (select stats = '{"v":1,"cC":12,"eC":0,"bR":7,"cNw":[0,0,4]}'::jsonb from profiles where id = '5a000000-0000-0000-0000-000000000001'));
select t_is('the size check is in place', exists (select 1 from pg_constraint where conname = 'profiles_stats_size'));
