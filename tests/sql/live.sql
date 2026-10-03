insert into auth.users (id) values
  ('ffffffff-0000-0000-0000-000000000001'), ('ffffffff-0000-0000-0000-000000000002'), ('ffffffff-0000-0000-0000-000000000003');
insert into friendships (requester, addressee, status) values ('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'accepted');
select t_is('a friendship reaches both players', (select count(*) = 2 from realtime.messages where event = 'friendship'
  and topic in ('user:ffffffff-0000-0000-0000-000000000001', 'user:ffffffff-0000-0000-0000-000000000002') and private));
delete from realtime.messages;

insert into messages (sender, recipient, body) values
  ('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'one'),
  ('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'two');
select t_is('a message goes to the recipient only', (select count(*) = 2 from realtime.messages where event = 'message' and topic = 'user:ffffffff-0000-0000-0000-000000000002')
  and not exists (select 1 from realtime.messages where topic = 'user:ffffffff-0000-0000-0000-000000000001'));
select t_is('with its row', (select bool_and(payload->>'type' = 'INSERT' and payload->'row'->>'body' in ('one', 'two')) from realtime.messages where event = 'message'));
delete from realtime.messages;
update messages set read_at = now() where recipient = 'ffffffff-0000-0000-0000-000000000002' and read_at is null;
select t_is('reading two messages sends one receipt to the sender', (select count(*) = 1 from realtime.messages where event = 'read' and topic = 'user:ffffffff-0000-0000-0000-000000000001'));
select t_is('the receipt carries the read time', (select payload->'row'->>'read_at' is not null from realtime.messages where event = 'read'));
delete from realtime.messages;
update messages set read_at = now() where recipient = 'ffffffff-0000-0000-0000-000000000002';
select t_is('reading again sends nothing', not exists (select 1 from realtime.messages));

insert into trades (proposer, recipient, offer, ask) values ('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', '["en:Cat"]', '["en:Dog"]');
select t_is('a trade reaches both sides without the cards', (select count(*) = 2 and bool_and(not (payload->'row' ? 'offer') and not (payload->'row' ? 'ask')) from realtime.messages where event = 'trade'));
delete from realtime.messages;

insert into challenges (kind, challenger, opponent, payload, reply, result, status) values
  ('clash', 'ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', '{"cards":[1,2,3]}', '{"cards":[4]}', '{"winner":"challenger","scores":{"challenger":5}}', 'done');
select t_is('a challenge keeps only the winner', (select count(*) = 2 and bool_and(payload->'row'->'result' = '{"winner":"challenger"}'::jsonb
  and not (payload->'row' ? 'payload') and not (payload->'row' ? 'reply')) from realtime.messages where event = 'challenge'));
delete from realtime.messages;

insert into deliveries (sender, recipient, kind, payload) values ('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'card', '{"title":"Cat","thumbnail":"x.jpg","extract":"long words"}');
select t_is('a delivery carries only its title', (select payload->'row'->'payload' = '{"title":"Cat"}'::jsonb from realtime.messages where event = 'delivery' and topic = 'user:ffffffff-0000-0000-0000-000000000002'));
delete from realtime.messages;

insert into guilds (id, name, tag, owner) values ('ffffffff-0000-0000-0000-00000000000f', 'Live Owls', 'LIVE', 'ffffffff-0000-0000-0000-000000000001');
insert into guild_members (user_id, guild_id) values ('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-00000000000f');
select t_is('a new member tells the guild', exists (select 1 from realtime.messages where event = 'member' and topic = 'guild:ffffffff-0000-0000-0000-00000000000f'));
insert into guild_messages (guild_id, sender, sender_name, body) values ('ffffffff-0000-0000-0000-00000000000f', 'ffffffff-0000-0000-0000-000000000001', 'ada', 'owls');
select t_is('a guild line goes to the guild topic', exists (select 1 from realtime.messages where event = 'message' and topic = 'guild:ffffffff-0000-0000-0000-00000000000f' and payload->'row'->>'body' = 'owls'));

drop table if exists live_seen;
create table live_seen (who text, topic text, n int);
grant insert on live_seen to authenticated;
do $$
declare who text; t text;
begin
  foreach who in array array['ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002'] loop
    foreach t in array array['user:ffffffff-0000-0000-0000-000000000001', 'user:ffffffff-0000-0000-0000-000000000002', 'guild:ffffffff-0000-0000-0000-00000000000f', 'market', 'presence:lobby'] loop
      perform set_config('request.jwt.claim.sub', who, true);
      perform set_config('realtime.topic', t, true);
      set local role authenticated;
      insert into live_seen select who, t, count(*) from realtime.messages;
      reset role;
    end loop;
  end loop;
end $$;
select t_is('A may listen on their own topic', (select n > 0 from live_seen where who like '%1' and topic like 'user:%1'));
select t_is('A may not listen on B''s', (select n = 0 from live_seen where who like '%1' and topic like 'user:%2'));
select t_is('B may listen on their own', (select n > 0 from live_seen where who like '%2' and topic like 'user:%2'));
select t_is('a member may listen on the guild', (select n > 0 from live_seen where who like '%1' and topic like 'guild:%'));
select t_is('an outsider may not', (select n = 0 from live_seen where who like '%2' and topic like 'guild:%'));
select t_is('anyone signed in may listen on the market', (select bool_and(n > 0) from live_seen where topic = 'market'));
select t_is('no other topic is open', (select bool_and(n = 0) from live_seen where topic = 'presence:lobby'));
drop table live_seen;

delete from guild_members where guild_id = 'ffffffff-0000-0000-0000-00000000000f';
delete from guilds where id = 'ffffffff-0000-0000-0000-00000000000f';
select t_is('the board tables are off the publication', not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and tablename in ('leaderboard_daily', 'guild_weekly', 'showcase_kudos', 'guild_matches')));
alter publication supabase_realtime add table public.leaderboard_daily, public.guild_season;
select public.live_unpublish(array['leaderboard_daily', 'guild_season', 'guild_weekly']);
select t_is('unpublishing drops what is there and skips what is not', not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and tablename in ('leaderboard_daily', 'guild_season', 'guild_weekly')));
select public.live_phase2();
select t_is('phase two empties the publication of the live tables', not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
  and tablename in ('messages', 'auctions', 'challenges')));
select t_is('players cannot send on the live topics themselves', not has_function_privilege('authenticated', 'public.live_send(text, text, jsonb)', 'execute'));
