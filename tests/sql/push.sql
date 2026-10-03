reset role;
insert into auth.users (id) values ('eeeeeeee-0000-0000-0000-000000000001'), ('eeeeeeee-0000-0000-0000-000000000002');
insert into profiles (id, username) values ('eeeeeeee-0000-0000-0000-000000000001', 'edna'), ('eeeeeeee-0000-0000-0000-000000000002', 'emile');
insert into friendships (requester, addressee, status) values ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'accepted');

set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000002', false);
select register_push_token('token-for-emile-phone-0000000001', 'android', 'fr');
select register_push_token('token-for-emile-phone-0000000001', 'android', 'en');
reset role;
select t_is('a phone registers its push token once', (select count(*) = 1 and bool_and(lang = 'en') from push_tokens where user_id = 'eeeeeeee-0000-0000-0000-000000000002'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000001', false);
select t_is('nobody reads the tokens table directly', not exists (select 1 from push_tokens));
insert into messages (sender, recipient, body) values ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'hello');
reset role;
select t_is('a message still goes through with push not configured', exists (select 1 from messages where body = 'hello' and recipient = 'eeeeeeee-0000-0000-0000-000000000002'));
insert into push_config (id, url, secret) values (1, 'http://127.0.0.1:9/push', 'shh');
set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000001', false);
insert into messages (sender, recipient, body) values ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'again');
reset role;
select t_is('and with it configured, even where pg_net is missing', exists (select 1 from messages where body = 'again'));
select t_is('the function reads the targets', (select count(*) = 1 from push_targets('eeeeeeee-0000-0000-0000-000000000002')));

set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000001', false);
select drop_push_token('token-for-emile-phone-0000000001');
reset role;
select t_is('someone else cannot drop your token', exists (select 1 from push_tokens where token = 'token-for-emile-phone-0000000001'));
delete from auth.users where id = 'eeeeeeee-0000-0000-0000-000000000002';
select t_is('deleting the account drops its tokens', not exists (select 1 from push_tokens where token = 'token-for-emile-phone-0000000001'));

set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000001', false);
select report_errors('[{"kind":"error","message":"x is undefined","stack":"at open.js:10","build":"abc","platform":"apk","screen":"packs","fingerprint":"x is undefined@open.js:10"},{"kind":"error","message":"x is undefined","fingerprint":"x is undefined@open.js:10","count":3}]');
select t_is('a player cannot read the error log', not exists (select 1 from client_errors));
reset role;
select t_is('the same error is counted on one row', (select count(*) = 1 and sum(count) = 4 from client_errors where fingerprint = 'x is undefined@open.js:10'));
select t_is('the health check sees it', (ops_health()->>'errors_hour')::integer = 4);
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select t_fails($q$select report_errors('[]')$q$, 'UNAUTHORISED');
reset role;

insert into auth.users (id) values ('eeeeeeee-0000-0000-0000-000000000003');
select t_is('a verified purchase is recorded and queues its gifts',
  record_purchase('eeeeeeee-0000-0000-0000-000000000003', 'google', 'wikster.supporter.editor', 'GPA.1', 'tok',
    '[{"kind":"owned","payload":{"bucket":"themes","ids":["folio"]}},{"kind":"ink","payload":{"amount":800,"mode":"add"}}]') = 'granted');
select t_is('the gifts wait for the player', (select count(*) = 2 from grants where user_id = 'eeeeeeee-0000-0000-0000-000000000003' and claimed_at is null));
select t_is('the same order is never paid twice', record_purchase('eeeeeeee-0000-0000-0000-000000000003', 'google', 'wikster.supporter.editor', 'GPA.1', 'tok', '[{"kind":"ink","payload":{"amount":800}}]') = 'already');
select t_is('and cannot be claimed by someone else', record_purchase('eeeeeeee-0000-0000-0000-000000000001', 'google', 'wikster.supporter.editor', 'GPA.1', 'tok', '[]') = 'other');
select t_is('still two gifts', (select count(*) = 2 from grants where user_id = 'eeeeeeee-0000-0000-0000-000000000003'));

select record_ad_reward('tx-' || g, 'eeeeeeee-0000-0000-0000-000000000003', 'coins', 3, '{"kind":"coins","payload":{"amount":150}}') from generate_series(1, 4) g;
select t_is('ads pay up to the daily cap', (select count(*) = 3 from ad_rewards where user_id = 'eeeeeeee-0000-0000-0000-000000000003' and paid));
select t_is('the fourth is logged unpaid', (select count(*) = 1 from ad_rewards where user_id = 'eeeeeeee-0000-0000-0000-000000000003' and not paid));
select t_is('a replayed callback pays nothing', record_ad_reward('tx-1', 'eeeeeeee-0000-0000-0000-000000000003', 'coins', 99, '{"kind":"coins","payload":{"amount":150}}') = 'already');
select t_is('three coin gifts wait', (select count(*) = 3 from grants where user_id = 'eeeeeeee-0000-0000-0000-000000000003' and kind = 'coins'));
