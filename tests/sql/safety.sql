insert into auth.users (id) values
  ('cccccccc-0000-0000-0000-000000000001'), ('cccccccc-0000-0000-0000-000000000002'), ('cccccccc-0000-0000-0000-000000000003');
insert into profiles (id, username) values
  ('cccccccc-0000-0000-0000-000000000001', 'alice'), ('cccccccc-0000-0000-0000-000000000002', 'bruno'), ('cccccccc-0000-0000-0000-000000000003', 'carla');
insert into friendships (requester, addressee, status) values ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 'accepted');
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage on all sequences in schema public to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000002', false);
insert into messages (sender, recipient, body) values ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'hi alice, nice cards');
select t_fails($q$insert into messages (sender, recipient, body) values ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'send nudes')$q$, 'FILTERED');
select t_fails($q$insert into messages (sender, recipient, body) values ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'add me www.evil.com')$q$, 'FILTERED');
insert into messages (sender, recipient, body) values ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'you are a total idiot and I will find you');
select t_fails($q$update profiles set username = 'fuck_you' where id = 'cccccccc-0000-0000-0000-000000000002'$q$, 'NAME_REFUSED');
select t_fails($q$update profiles set username = 'Admin' where id = 'cccccccc-0000-0000-0000-000000000002'$q$, 'NAME_REFUSED');
update profiles set username = 'bruno_b' where id = 'cccccccc-0000-0000-0000-000000000002';
select t_is('a clean new name is kept', (select username from profiles where id = 'cccccccc-0000-0000-0000-000000000002') = 'bruno_b');
select t_is('a filtered attempt is not logged by the trigger', (select count(*) from filter_hits) = 0);
select t_is('noting a filtered message logs it', note_filtered('chat', 'send nudes') = 'WORD');
select t_is('noting clean text logs nothing', note_filtered('chat', 'hello') is null);
select note_filtered('chat', 'send nudes'), note_filtered('chat', 'send nudes'), note_filtered('chat', 'send nudes');
select t_is('four hits do not mute', not is_muted('cccccccc-0000-0000-0000-000000000002'));
select note_filtered('chat', 'go to www.bad.com');
select t_is('the fifth hit in a day mutes for a day', is_muted('cccccccc-0000-0000-0000-000000000002') and not is_suspended('cccccccc-0000-0000-0000-000000000002'));
reset role;
select t_is('the hits are kept for review', (select count(*) from filter_hits where user_id = 'cccccccc-0000-0000-0000-000000000002') = 5);
select t_is('and the mute says why', (select reason from suspensions where user_id = 'cccccccc-0000-0000-0000-000000000002') like 'auto:%');
delete from suspensions;

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', false);
select t_is('a message sent to you can be reported',
  file_report('message', (select id::text from messages where body like 'you are a total%'), null, 'threat', 'scary') > 0);
select t_is('reporting it twice keeps one report',
  file_report('message', (select id::text from messages where body like 'you are a total%'), null, 'threat', 'again') = (select max(id) from reports));
select t_fails($q$select file_report('message', (select id::text from messages where sender = 'cccccccc-0000-0000-0000-000000000001' limit 1), null, 'spam')$q$, 'NOT_FOUND');
select t_fails($q$select file_report('player', null, 'cccccccc-0000-0000-0000-000000000001', 'spam')$q$, 'NOT_FOUND');
select t_fails($q$select file_report('player', null, 'cccccccc-0000-0000-0000-000000000003', 'nonsense')$q$, 'BAD_REASON');
select t_is('a player can be reported', file_report('player', null, 'cccccccc-0000-0000-0000-000000000003', 'name', 'rude name') > 0);
select t_fails($q$insert into reports (reporter, kind, reason) values ('cccccccc-0000-0000-0000-000000000001', 'player', 'spam')$q$,
  'new row violates row-level security policy for table "reports"');
select t_is('the reporter sees their reports', (select count(*) from reports) = 2);
reset role;
select t_is('the server kept the message as evidence, with the thread around it',
  (select evidence->>'body' like 'you are a total%' and jsonb_array_length(evidence->'context') = 2 and evidence->>'username' = 'bruno_b'
     from reports where kind = 'message'));
select t_is('a threat is marked urgent', (select urgent from reports where kind = 'message'));
select t_is('a name report is not', (select not urgent from reports where kind = 'player'));
update reports set status = 'actioned', outcome = 'muted', handled_at = now() where kind = 'message';

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select t_is('nobody else sees a report', (select count(*) from reports) = 0);
update reports set status = 'dismissed';
reset role;
select t_is('nor can anyone else close it', (select status from reports where kind = 'message') = 'actioned');
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', false);
select t_is('the reporter hears back once it is handled', (select count(*) from reports_answered()) = 1);
select reports_seen();
select t_is('and only once', (select count(*) from reports_answered()) = 0);

select block_player('cccccccc-0000-0000-0000-000000000002');
select t_is('blocking ends the friendship', (select count(*) from friendships) = 0);
select t_is('and is listed for the blocker', (select count(*) from blocks) = 1);
select t_fails($q$insert into friendships (requester, addressee) values ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002')$q$,
  'new row violates row-level security policy for table "friendships"');
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000002', false);
select t_fails($q$insert into friendships (requester, addressee) values ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001')$q$,
  'new row violates row-level security policy for table "friendships"');
select t_fails($q$insert into messages (sender, recipient, body) values ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'hello?')$q$,
  'new row violates row-level security policy for table "messages"');
select t_is('the blocked player cannot see the block', (select count(*) from blocks) = 0);
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', false);
select unblock_player('cccccccc-0000-0000-0000-000000000002');
insert into friendships (requester, addressee) values ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002');
select t_is('after unblocking a request can be sent again', (select count(*) from friendships) = 1);
reset role;

select t_fails($q$insert into custom_packs (user_id, id, def) values ('cccccccc-0000-0000-0000-000000000003', 'h1', '{"name": "Hentai", "wiki": {"apiUrl": "https://x.example.org/api.php"}}')$q$, 'NAME_REFUSED');
insert into custom_packs (user_id, id, def) values ('cccccccc-0000-0000-0000-000000000003', 'h2', '{"name": "Hentai", "wiki": {"apiUrl": "https://x.example.org/api.php", "mature": true}}');
select t_is('a sexual name is kept on a mature booster', exists (select 1 from custom_packs where id = 'h2'));
select t_fails($q$insert into custom_packs (user_id, id, def) values ('cccccccc-0000-0000-0000-000000000003', 'h3', '{"name": "Faggot Wiki", "wiki": {"apiUrl": "https://x.example.org/api.php", "mature": true}}')$q$, 'NAME_REFUSED');
select t_is('the adult pack filter still refuses slurs and profanity', text_flag('fuck wiki', 'adultPack') is not null and text_flag('Wikiporno', 'adultPack') is null);
