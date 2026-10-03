reset role;
grant select on public.friendships, public.messages to authenticated;
insert into auth.users (id) values ('c0c0c0c0-0000-0000-0000-000000000001'), ('c0c0c0c0-0000-0000-0000-000000000002'),
  ('c0c0c0c0-0000-0000-0000-000000000003'), ('c0c0c0c0-0000-0000-0000-000000000004');
insert into friendships (requester, addressee, status) values
  ('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-0000-0000-0000-000000000002', 'accepted'),
  ('c0c0c0c0-0000-0000-0000-000000000003', 'c0c0c0c0-0000-0000-0000-000000000001', 'accepted'),
  ('c0c0c0c0-0000-0000-0000-000000000004', 'c0c0c0c0-0000-0000-0000-000000000001', 'pending');
insert into messages (sender, recipient, body, created_at) values
  ('c0c0c0c0-0000-0000-0000-000000000002', 'c0c0c0c0-0000-0000-0000-000000000001', 'old hello', now() - interval '3 hours'),
  ('c0c0c0c0-0000-0000-0000-000000000001', 'c0c0c0c0-0000-0000-0000-000000000002', 'my answer', now() - interval '2 hours'),
  ('c0c0c0c0-0000-0000-0000-000000000003', 'c0c0c0c0-0000-0000-0000-000000000001', 'one', now() - interval '20 minutes'),
  ('c0c0c0c0-0000-0000-0000-000000000003', 'c0c0c0c0-0000-0000-0000-000000000001', 'two', now() - interval '10 minutes'),
  ('c0c0c0c0-0000-0000-0000-000000000002', 'c0c0c0c0-0000-0000-0000-000000000003', 'not yours', now());
delete from realtime.messages;

set role authenticated;
select set_config('request.jwt.claim.sub', 'c0c0c0c0-0000-0000-0000-000000000001', false);
select t_is('the conversation list has one row per friend talked to', (select count(*) = 2 from my_conversations()));
select t_is('the latest conversation comes first', (select other = 'c0c0c0c0-0000-0000-0000-000000000003' and last_body = 'two' from my_conversations() limit 1));
select t_is('with its unread count', (select unread = 2 from my_conversations() where other = 'c0c0c0c0-0000-0000-0000-000000000003'));
select t_is('my own last line still counts what they left unread', (select unread = 1 and last_sender = 'c0c0c0c0-0000-0000-0000-000000000001' from my_conversations() where other = 'c0c0c0c0-0000-0000-0000-000000000002'));
select t_is('a page stops where asked', (select count(*) = 1 from my_conversations(1)));
select t_is('and the next page starts after it', (select other = 'c0c0c0c0-0000-0000-0000-000000000002' from my_conversations(30, (select last_at from my_conversations(1)))));
select t_is('other people''s lines never show', not exists (select 1 from my_conversations() where last_body = 'not yours'));
select set_config('request.jwt.claim.sub', 'c0c0c0c0-0000-0000-0000-000000000004', false);
select t_is('a pending request has no conversation', not exists (select 1 from my_conversations()));
reset role;

update messages set read_at = now() where recipient = 'c0c0c0c0-0000-0000-0000-000000000001' and sender = 'c0c0c0c0-0000-0000-0000-000000000003';
select t_is('reading tells the sender once', (select count(*) = 1 from realtime.messages where event = 'read' and topic = 'user:c0c0c0c0-0000-0000-0000-000000000003'));
select t_is('and the reader''s other devices once', (select count(*) = 1 from realtime.messages where event = 'seen' and topic = 'user:c0c0c0c0-0000-0000-0000-000000000001'
  and payload->'row'->>'sender' = 'c0c0c0c0-0000-0000-0000-000000000003'));
delete from realtime.messages;

insert into guilds (id, name, tag, owner) values ('c0c0c0c0-0000-0000-0000-00000000000f', 'Chatters', 'CHAT', 'c0c0c0c0-0000-0000-0000-000000000002');
insert into guild_invites (guild_id, inviter, invitee) values ('c0c0c0c0-0000-0000-0000-00000000000f', 'c0c0c0c0-0000-0000-0000-000000000002', 'c0c0c0c0-0000-0000-0000-000000000001');
delete from realtime.messages;
delete from guild_invites where invitee = 'c0c0c0c0-0000-0000-0000-000000000001';
select t_is('an invite that goes away tells the invitee', exists (select 1 from realtime.messages where event = 'guild-invite'
  and topic = 'user:c0c0c0c0-0000-0000-0000-000000000001' and payload->>'type' = 'DELETE'));
delete from realtime.messages;
