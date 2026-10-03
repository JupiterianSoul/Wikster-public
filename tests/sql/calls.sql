reset role;
insert into auth.users (id) values
  ('ca110000-0000-0000-0000-000000000001'), ('ca110000-0000-0000-0000-000000000002'),
  ('ca110000-0000-0000-0000-000000000003'), ('ca110000-0000-0000-0000-000000000004');
insert into profiles (id, username, visibility) values
  ('ca110000-0000-0000-0000-000000000001', 'cally', 'public'), ('ca110000-0000-0000-0000-000000000002', 'cora', 'friends'),
  ('ca110000-0000-0000-0000-000000000003', 'cyril', 'private'), ('ca110000-0000-0000-0000-000000000004', 'cosmo', 'public');
insert into friendships (requester, addressee, status) values
  ('ca110000-0000-0000-0000-000000000001', 'ca110000-0000-0000-0000-000000000002', 'accepted'),
  ('ca110000-0000-0000-0000-000000000003', 'ca110000-0000-0000-0000-000000000001', 'accepted'),
  ('ca110000-0000-0000-0000-000000000004', 'ca110000-0000-0000-0000-000000000002', 'accepted');
insert into blocks (blocker, blocked) values ('ca110000-0000-0000-0000-000000000001', 'ca110000-0000-0000-0000-000000000004'),
  ('ca110000-0000-0000-0000-000000000002', 'ca110000-0000-0000-0000-000000000004');
insert into messages (sender, recipient, body) values
  ('ca110000-0000-0000-0000-000000000002', 'ca110000-0000-0000-0000-000000000001', 'hi'),
  ('ca110000-0000-0000-0000-000000000001', 'ca110000-0000-0000-0000-000000000002', 'hello');
insert into trades (proposer, recipient, offer, ask) values
  ('ca110000-0000-0000-0000-000000000002', 'ca110000-0000-0000-0000-000000000001', '[]', '[]'),
  ('ca110000-0000-0000-0000-000000000002', 'ca110000-0000-0000-0000-000000000004', '[]', '[]');
insert into deliveries (sender, recipient, kind, payload) values
  ('ca110000-0000-0000-0000-000000000002', 'ca110000-0000-0000-0000-000000000001', 'booster', '{"spec":{"kind":"open","cards":3}}');
insert into grants (user_id, kind, payload) values
  ('ca110000-0000-0000-0000-000000000001', 'coins', '{"amount":5}'), ('ca110000-0000-0000-0000-000000000002', 'coins', '{"amount":5}');
insert into wishlists (owner, key, card) values
  ('ca110000-0000-0000-0000-000000000001', 'en:Mine', '{"key":"en:Mine"}'),
  ('ca110000-0000-0000-0000-000000000002', 'en:Hers', '{"key":"en:Hers"}'),
  ('ca110000-0000-0000-0000-000000000004', 'en:Stranger', '{"key":"en:Stranger"}');
insert into guilds (id, name, tag, owner) values ('ca11a000-0000-0000-0000-000000000001', 'Callers', 'CAL', 'ca110000-0000-0000-0000-000000000001');
insert into guild_members (user_id, guild_id) values ('ca110000-0000-0000-0000-000000000001', 'ca11a000-0000-0000-0000-000000000001');
insert into announcements (title_en, body_en) values ('For all', 'everyone');
insert into announcements (title_en, body_en, target_user) values ('For cally', 'just you', 'ca110000-0000-0000-0000-000000000001');
insert into announcements (title_en, body_en, target_user) values ('For cora', 'not you', 'ca110000-0000-0000-0000-000000000002');
insert into announcements (title_en, body_en, target_guild) values ('For the guild', 'members', 'ca11a000-0000-0000-0000-000000000001');
insert into announcements (title_en, body_en, target_guild) values ('Other guild', 'nope', 'ca11a000-0000-0000-0000-000000000009');
insert into announcements (title_en, body_en, ends_at) values ('Over', 'gone', now() - interval '1 minute');
insert into suspensions (user_id, reason, muted) values ('ca110000-0000-0000-0000-000000000001', 'chatty', true);

set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select t_fails($$select social_digest()$$, 'sign in');
select set_config('request.jwt.claim.sub', 'ca110000-0000-0000-0000-000000000001', false);
create temp table digest as select social_digest() d;
select t_is('the digest brings my own profile', (select d->'me'->>'username' = 'cally' from digest));
select t_is('the digest lists my friendships only', (select jsonb_array_length(d->'friendships') = 2 from digest));
select t_is('and the friends I may see, not a private profile', (select jsonb_array_length(d->'people') = 1 and d->'people'->0->>'username' = 'cora' from digest));
select t_is('my blocks, not other people''s', (select jsonb_array_length(d->'blocks') = 1 from digest));
select t_is('unread messages sent to me', (select jsonb_array_length(d->'unread') = 1 and d->'unread'->0->>'sender' = 'ca110000-0000-0000-0000-000000000002' from digest));
select t_is('trades I am part of', (select jsonb_array_length(d->'trades') = 1 from digest));
select t_is('counts of deliveries and grants waiting', (select (d->>'deliveries')::int = 1 and (d->>'grants')::int = 1 from digest));
select t_is('my guild', (select d->'guild'->>'tag' = 'CAL' from digest));
select t_is('notices for everyone, me and my guild', (select array_agg(n->>'title_en' order by n->>'title_en') filter (where n->>'title_en' in ('For all', 'For cally', 'For cora', 'For the guild', 'Other guild', 'Over'))
  = array['For all', 'For cally', 'For the guild'] from digest, jsonb_array_elements(d->'notices') n));
select t_is('my suspension', (select (d->'suspension'->>'muted')::boolean from digest));
select t_is('my wishes and my friends'' wishes only', (select jsonb_array_length(d->'wishes') = 1 and jsonb_array_length(d->'friendWishes') = 1
  and d->'friendWishes'->0->>'key' = 'en:Hers' from digest));
select t_is('challenges, invites and reports come as lists', (select jsonb_typeof(d->'challenges') = 'array' and jsonb_typeof(d->'invites') = 'array'
  and jsonb_typeof(d->'reports') = 'array' from digest));
select t_is('a poll asks for parts only', (select not (d ? 'guild') and not (d ? 'notices') and not (d ? 'me') and d ? 'friendships' and d ? 'unread'
  from (select social_digest(array['friends', 'social']) d) x));
select set_config('request.jwt.claim.sub', 'ca110000-0000-0000-0000-000000000002', false);
select t_is('another player sees their own world', (select jsonb_array_length(d->'friendships') = 2 and jsonb_array_length(d->'unread') = 1
  and d->'guild' = 'null'::jsonb and d->'suspension' = 'null'::jsonb
  and exists (select 1 from jsonb_array_elements(d->'notices') n where n->>'title_en' = 'For cora')
  and not exists (select 1 from jsonb_array_elements(d->'notices') n where n->>'title_en' in ('For cally', 'For the guild'))
  and jsonb_array_length(d->'trades') = 2 from (select social_digest() d) x));
select set_config('request.jwt.claim.sub', 'ca110000-0000-0000-0000-000000000004', false);
select t_is('a player with friends-only visibility shows to a friend', (select jsonb_array_length(d->'people') = 1 from (select social_digest(array['friends']) d) x));
reset role;
select set_config('request.jwt.claim.sub', '', false);
select t_fails($$set role anon; select social_digest()$$, 'permission denied for function social_digest');
reset role;

insert into quests (user_id, day, quest_id, target, progress, expires_at) values
  ('ca110000-0000-0000-0000-000000000001', '2030-01-02', 'open-1', 1, 1, now() + interval '1 day'),
  ('ca110000-0000-0000-0000-000000000001', '2030-01-01', 'open-2', 2, 0, now());
select t_is('a launch fact brings grants, deliveries and the day''s quests in one call', (select jsonb_array_length(d->'grants') = 1
  and jsonb_array_length(d->'deliveries') = 1 and jsonb_array_length(d->'quests') = 1 and d->'quests'->0->>'quest_id' = 'open-1'
  from (select econ_facts('ca110000-0000-0000-0000-000000000001', 'launch', '{"day":"2030-01-02"}') d) x));

insert into pulls (user_id, spec_id, spec, cards, claimed_at) values
  ('ca110000-0000-0000-0000-000000000001', 'sp', '{"kind":"open"}', '[{"k":"en:Slim","r":"rare","p":40}]', now());
select t_is('a claimed draw kept slim still brings its cards to a load', (select d->'keys' = '["en:Slim"]'::jsonb and (d->'pull'->>'claimed')::boolean
  from (select econ_load('ca110000-0000-0000-0000-000000000001', p_pull => (select nonce from pulls where user_id = 'ca110000-0000-0000-0000-000000000001')) d) x));

set role service_role;
select live_send('user:ca110000-0000-0000-0000-000000000001', 'ready', '{"pulls":[]}');
reset role;
select t_is('the economy can send a live event', exists (select 1 from realtime.messages where topic = 'user:ca110000-0000-0000-0000-000000000001' and event = 'ready'));
