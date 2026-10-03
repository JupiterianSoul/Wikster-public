reset role;
select t_is('running the schema moves old artifact cards and prints to prismatic, totals unchanged', (select c.rarity_id = 'prismatic' and c.prints = '{"common":1,"prismatic":1}'::jsonb
  and e.n_value = public.card_value(c.price, c.rarity_id, c.copies, c.prints) and e.n_cards = 2
  from cards c join econ e on e.user_id = c.user_id where c.user_id = 'b0050000-0000-0000-0000-0000000000a7' and c.article_key = 'en:Old_Artifact'));
select t_is('running the schema again keeps a market fee that was set', (select value = '7'::jsonb from tuning where key = 'market.fee'));
select t_is('and keeps every market key', (select count(*) = 3 from tuning_keys where key in ('market.fee', 'market.step', 'market.maxLots')));
select t_is('with storage the friend pictures bucket is made public, 2 MB, images only', (select public and file_size_limit = 2097152
  and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'] from storage.buckets where id = 'friend-pictures'));
select t_is('with four policies on the objects', (select count(*) = 4 from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname like '%friend pictures%'));
select t_is('nobody but Control can list the bucket, the files stay public by address', not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname like '%friend pictures%' and cmd = 'SELECT' and (roles && array['public', 'anon']::name[] or qual not like '%friend_pictures_writer%')));
select fc_as('fc000000-0000-0000-0000-000000000001', false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('friend-pictures', 'ROBINFC/a.png');
reset role;
select t_is('an admin uploads without the Control header', exists (select 1 from storage.objects where name = 'ROBINFC/a.png'));
select fc_as('fc000000-0000-0000-0000-000000000002', false);
set role authenticated;
select t_fails($$insert into storage.objects (bucket_id, name) values ('friend-pictures', 'ROBINFC/b.png')$$, 'new row violates row-level security policy for table "objects"');
delete from storage.objects where name = 'ROBINFC/a.png';
reset role;
select t_is('a player cannot remove one', exists (select 1 from storage.objects where name = 'ROBINFC/a.png'));
drop schema storage cascade;
