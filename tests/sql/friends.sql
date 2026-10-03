reset role;
select t_is('without a storage schema the friend pictures block is skipped and the rest still loads',
  to_regclass('storage.buckets') is null and to_regprocedure('public.friend_pictures_writer()') is not null
  and to_regprocedure('public.admin_special_check(jsonb, boolean)') is not null);

create table if not exists public.admins (id uuid primary key references auth.users on delete cascade, note text, granted_at timestamptz not null default now());
insert into auth.users (id) values
  ('fc000000-0000-0000-0000-000000000001'), ('fc000000-0000-0000-0000-000000000002'),
  ('fc000000-0000-0000-0000-000000000003'), ('fc000000-0000-0000-0000-000000000004');
insert into profiles (id, username) values
  ('fc000000-0000-0000-0000-000000000001', 'fc_gabe'), ('fc000000-0000-0000-0000-000000000002', 'fc_robin'),
  ('fc000000-0000-0000-0000-000000000003', 'fc_olga'), ('fc000000-0000-0000-0000-000000000004', 'fc_bea');
insert into admins (id) values ('fc000000-0000-0000-0000-000000000001') on conflict do nothing;
drop table if exists fc_got;
create table fc_got (n integer primary key, j jsonb);
grant all on fc_got to authenticated, anon;

create or replace function public.fc_as(p_user text, p_control boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user, ''), false);
  perform set_config('request.headers', case when p_control then '{"x-wikster-control":"1"}' else '{}' end, false);
end $$;
grant execute on function public.fc_as(text, boolean) to authenticated, anon;

create or replace function public.fc_full() returns jsonb language sql immutable as $$
  select '{
    "name": "  Robin ", "message": "Made for you, Robin.", "extra": "dropped",
    "cards": [
      {"article": {"key": "en:Tetris", "title": "Tetris", "lang": "en", "description": "A game", "extract": "A long read.",
        "url": "https://en.wikipedia.org/wiki/Tetris", "thumbnail": "https://upload.wikimedia.org/hk.jpg", "junk": 1}, "rarityId": "legendary"},
      {"article": {"key": "special:robin:the-laugh", "title": "The Laugh", "lang": "en", "extract": "Only Robin laughs like that.",
        "picture": {"url": "https://example.supabase.co/storage/v1/object/public/friend-pictures/ROBIN/a.png", "credit": "Gabriel", "license": "CC BY 4.0", "link": "https://example.org/a", "x": 2}},
       "rarityId": "special", "count": 9}
    ],
    "booster": {"name": "Robin''s booster", "accent": "#3B82F6", "accent2": "#0b2a6b", "cards": [
      {"article": {"key": "en:Ada_Lovelace", "title": "Ada Lovelace"}, "rarityId": "epic"},
      {"article": {"key": "en:Alan_Turing", "title": "Alan Turing"}}
    ], "foil": "nope"},
    "theme": {"name": "Robin Blue", "base": "rire", "accent": "#3B82F6", "blurb": "dropped"},
    "badge": {"name": "Robin''s badge", "emblem": "laugh", "color": "#3b82f6"}
  }'::jsonb
$$;

select t_is('a full special is accepted and normalized', (select
    j->>'name' = 'Robin' and j->>'message' = 'Made for you, Robin.' and not (j ? 'extra')
    and jsonb_array_length(j->'cards') = 2
    and j->'cards'->0 = '{"article": {"key": "en:Tetris", "title": "Tetris", "lang": "en", "description": "A game", "extract": "A long read.", "url": "https://en.wikipedia.org/wiki/Tetris", "thumbnail": "https://upload.wikimedia.org/hk.jpg"}, "rarityId": "legendary"}'::jsonb
    and j->'cards'->1->>'rarityId' = 'special'
    and j->'cards'->1->'article'->'picture' = '{"source": "upload", "url": "https://example.supabase.co/storage/v1/object/public/friend-pictures/ROBIN/a.png", "credit": "Gabriel", "license": "CC BY 4.0", "link": "https://example.org/a"}'::jsonb
    and j->'cards'->1->'article'->>'thumbnail' = 'https://example.supabase.co/storage/v1/object/public/friend-pictures/ROBIN/a.png'
    and j->'booster' = '{"name": "Robin''s booster", "accent": "#3b82f6", "accent2": "#0b2a6b", "cards": [{"article": {"key": "en:Ada_Lovelace", "title": "Ada Lovelace", "lang": "en"}, "rarityId": "epic"}, {"article": {"key": "en:Alan_Turing", "title": "Alan Turing", "lang": "en"}, "rarityId": "common"}]}'::jsonb
    and j->'theme' = '{"name": "Robin Blue", "base": "rire", "accent": "#3b82f6"}'::jsonb
    and j->'badge' = '{"name": "Robin''s badge", "emblem": "laugh", "color": "#3b82f6"}'::jsonb
  from (select admin_special_check(fc_full()) j) x));
select t_is('the missing parts come back as nulls', (select j->'booster' = 'null'::jsonb and j->'theme' = 'null'::jsonb and j->'badge'->>'emblem' = 'seal'
  and j->'cards' = '[]'::jsonb from (select admin_special_check('{"name":"Ana","message":"Hi","badge":{"name":"B","emblem":"seal","color":"#ffffff"}}') j) x));
select t_fails($$select admin_special_check(fc_full() - 'name')$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(fc_full() || jsonb_build_object('message', repeat('x', 801)))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(fc_full() || '{"name": "a name that is far too long for a friend code title"}')$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{theme,accent}', '"blue"'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{theme,accent}', '"#fff"'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{theme,base}', '"custom"'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{badge,emblem}', '"nope"'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{booster,cards}', '[]'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{booster,cards}', (select jsonb_agg('{"article":{"key":"en:X"}}'::jsonb) from generate_series(1, 13))))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{cards}', (select jsonb_agg('{"article":{"key":"en:X"}}'::jsonb) from generate_series(1, 21))))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{cards,0,rarityId}', '"shiny"'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{cards,1,article,picture,url}', '"http://plain.example/a.png"'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check(jsonb_set(fc_full(), '{cards,0,article,thumbnail}', '"javascript:alert(1)"'))$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check('{"name":"Ana","message":"Hi"}')$$, 'BAD_SPECIAL');
select t_fails($$select admin_special_check('[]')$$, 'BAD_SPECIAL');
select t_is('a message alone is fine when the code also gives items', (select j->>'name' = 'Ana' from (select admin_special_check('{"name":"Ana","message":"Hi"}', true) j) x));

select fc_as('fc000000-0000-0000-0000-000000000002', true);
set role authenticated;
select t_fails($$select admin_code_create(jsonb_build_object('code', 'NOPEFC', 'special', fc_full()))$$, 'FORBIDDEN');
reset role;

select fc_as('fc000000-0000-0000-0000-000000000001', true);
set role authenticated;
insert into fc_got values (1, admin_code_create(jsonb_build_object('code', 'robin-fc', 'special', fc_full(),
  'allowed', jsonb_build_array('fc000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000002'))));
insert into fc_got values (2, admin_code_create('{"code":"PLAINFC","items":[{"kind":"coins","amount":50}],"special":{"name":"Bo","message":"Coins for Bo"}}'));
select t_fails($$select admin_code_create('{"code":"BADFC1","allowed":["not-a-uuid"],"special":{"name":"A","message":"B","badge":{"name":"B","emblem":"seal","color":"#000000"}}}')$$, 'BAD_CODE');
select t_fails($$select admin_code_create('{"code":"BADFC2","allowed":[],"items":[{"kind":"coins","amount":5}]}')$$, 'BAD_CODE');
select t_fails($$select admin_code_create('{"code":"BADFC3","special":{"name":"A","message":"B"}}')$$, 'BAD_SPECIAL');
select t_fails($$select admin_code_create('{"code":"BADFC4","items":[]}')$$, 'BAD_ITEMS');
insert into fc_got values (3, admin_codes());
reset role;
select t_is('a special code is stored with no items, its special and one allowed player', (select items = '[]'::jsonb and special->>'name' = 'Robin'
  and special->'theme'->>'base' = 'rire' and allowed = array['fc000000-0000-0000-0000-000000000002']::uuid[] from redeem_codes where code = 'ROBINFC'));
select t_is('a code can carry a special and items together', (select jsonb_array_length(items) = 1 and special->'cards' = '[]'::jsonb from redeem_codes where code = 'PLAINFC'));
select t_is('creating it is logged with an undo', exists (select 1 from admin_log where kind = 'code_create' and detail->'new'->>'code' = 'ROBINFC' and undo->>'op' = 'restore_row'));
select t_is('the list carries special, allowed and the allowed names', (select x->'special'->>'name' = 'Robin'
  and x->'allowed' = '["fc000000-0000-0000-0000-000000000002"]'::jsonb and x->'allowed_names' = '{"fc000000-0000-0000-0000-000000000002": "fc_robin"}'::jsonb
  from fc_got, jsonb_array_elements(j) x where n = 3 and x->>'code' = 'ROBINFC'));
select t_is('a code open to everyone lists no allowed names', (select x->'allowed' = 'null'::jsonb and x->'allowed_names' = 'null'::jsonb
  from fc_got, jsonb_array_elements(j) x where n = 3 and x->>'code' = 'PLAINFC'));

select fc_as('fc000000-0000-0000-0000-000000000001', true);
set role authenticated;
select t_fails($$select admin_code_update('PLAINFC', '{"special": null, "items": []}')$$, 'BAD_ITEMS');
select t_fails($$select admin_code_update('ROBINFC', '{"special": null}')$$, 'BAD_ITEMS');
select t_fails($$select admin_code_update('ROBINFC', '{"special": {"name": "x"}}')$$, 'BAD_SPECIAL');
select t_fails($$select admin_code_update('ROBINFC', '{"allowed": [1, 2]}')$$, 'BAD_CODE');
insert into fc_got values (4, admin_code_update('PLAINFC', '{"special": {"name": "Bo", "message": "Only a badge now", "badge": {"name": "Bo", "emblem": "seal", "color": "#112233"}}, "items": []}'));
insert into fc_got values (5, admin_code_update('PLAINFC', '{"allowed": ["fc000000-0000-0000-0000-000000000003"]}'));
insert into fc_got values (6, admin_code_update('PLAINFC', '{"allowed": null, "note": "open again"}'));
reset role;
select t_is('an update takes a new special with no items', (select items = '[]'::jsonb and special->>'message' = 'Only a badge now' from redeem_codes where code = 'PLAINFC'));
select t_is('allowed can be set and cleared', (select (j->'allowed') = '["fc000000-0000-0000-0000-000000000003"]'::jsonb from fc_got where n = 5)
  and (select allowed is null and note = 'open again' from redeem_codes where code = 'PLAINFC'));
select fc_as('fc000000-0000-0000-0000-000000000001', true);
set role authenticated;
insert into fc_got values (7, admin_undo_row((select undo from admin_log where kind = 'code_update' and detail->'new'->>'code' = 'PLAINFC' and detail->'new'->>'note' = 'open again')));
reset role;
select t_is('undoing an update brings back the allowed list', (select allowed = array['fc000000-0000-0000-0000-000000000003']::uuid[] from redeem_codes where code = 'PLAINFC'));

select t_fails($$select econ_code_take('fc000000-0000-0000-0000-000000000003', 'ROBIN-FC')$$, 'UNKNOWN_CODE');
update redeem_codes set disabled = true where code = 'ROBINFC';
select t_fails($$select econ_code_take('fc000000-0000-0000-0000-000000000003', 'ROBINFC')$$, 'UNKNOWN_CODE');
select t_fails($$select econ_code_take('fc000000-0000-0000-0000-000000000002', 'ROBINFC')$$, 'CODE_EXPIRED');
update redeem_codes set disabled = false where code = 'ROBINFC';
insert into fc_got values (8, econ_code_take('fc000000-0000-0000-0000-000000000002', 'robin fc'));
select t_is('the allowed player takes it and gets the special with the items', (select j->>'code' = 'ROBINFC' and j->'items' = '[]'::jsonb
  and j->'special'->'badge'->>'emblem' = 'laugh' and (j->>'n')::int = 1 from fc_got where n = 8));
select t_is('a refused player left no use behind', not exists (select 1 from redeem_uses where code = 'ROBINFC' and user_id = 'fc000000-0000-0000-0000-000000000003'));

select econ_apply('fc000000-0000-0000-0000-000000000002', '{"coins":10,"state":{"owned":{"themes":["fc-robinfc"]},"friendCodes":{"ROBINFC":{"name":"Robin","theme":{"name":"Robin Blue","base":"rire","accent":"#3b82f6"},"badge":{"name":"Robin badge","emblem":"laugh","color":"#3b82f6"}}}}}');
select econ_apply('fc000000-0000-0000-0000-000000000003', '{"coins":10,"state":{"owned":{"themes":["fc-robinfc"]}}}');
select t_is('a friend theme is owned with its definition only', theme_owned((select state from econ where user_id = 'fc000000-0000-0000-0000-000000000002'), 'fc-robinfc')
  and not theme_owned((select state from econ where user_id = 'fc000000-0000-0000-0000-000000000003'), 'fc-robinfc'));
grant select, update on public.profiles to authenticated;
grant select on public.friendships to authenticated;
select fc_as('fc000000-0000-0000-0000-000000000002', false);
set role authenticated;
update profiles set appearance = '{"theme":"fc-robinfc","friend":{"name":"Fake","base":"apotheosis","accent":"#000000"}}', badges =
  '{"worn":["fc-robinfc","fc-fake","ripper"],"earned":[{"id":"fc-robinfc","rank":1,"look":{"name":"Forged","emblem":"seal","color":"#000000"}},{"id":"fc-fake","rank":1},{"id":"ripper","rank":2}],"ach":3}'
  where id = 'fc000000-0000-0000-0000-000000000002';
reset role;
select t_is('the published look carries the friend theme from the server state', (select appearance = '{"v":1,"theme":"fc-robinfc","fx":{},"friend":{"name":"Robin Blue","base":"rire","accent":"#3b82f6"}}'::jsonb
  from profiles where id = 'fc000000-0000-0000-0000-000000000002'));
select t_is('friend badges take their look from the server and unknown ones go', (select badges = '{"worn":["fc-robinfc","ripper"],"earned":[{"id":"fc-robinfc","rank":1,"look":{"name":"Robin badge","emblem":"laugh","color":"#3b82f6"}},{"id":"ripper","rank":2}],"ach":3}'::jsonb
  from profiles where id = 'fc000000-0000-0000-0000-000000000002'));
select fc_as('fc000000-0000-0000-0000-000000000003', false);
set role authenticated;
update profiles set appearance = '{"theme":"fc-robinfc"}' where id = 'fc000000-0000-0000-0000-000000000003';
reset role;
select t_is('a friend theme cannot be worn without its code', (select appearance->>'theme' = 'aurora' from profiles where id = 'fc000000-0000-0000-0000-000000000003'));

select fc_as('fc000000-0000-0000-0000-000000000001', true);
set role authenticated;
select admin_tuning_set('market.fee', '7');
reset role;
select t_is('a market fee is set before the schema runs again', (select value = '7'::jsonb from tuning where key = 'market.fee'));

select econ_apply('fc000000-0000-0000-0000-000000000003', '{"coins":5000,"add":[{"key":"en:Lot","title":"Lot","rarityId":"rare","price":100},{"key":"en:Kept","title":"Kept","rarityId":"rare","price":100},{"key":"special:db:X:en:S","title":"S","rarityId":"epic","data":{"special":"db:X"}}]}');
select econ_apply('fc000000-0000-0000-0000-000000000004', '{"coins":1000}');
select econ_auction_create('fc000000-0000-0000-0000-000000000003', 'en:Lot', 50, 60);
select econ_auction_bid('fc000000-0000-0000-0000-000000000004', (select id from auctions where seller = 'fc000000-0000-0000-0000-000000000003'), 120);
select fc_as('fc000000-0000-0000-0000-000000000001', true);
set role authenticated;
insert into fc_got values (9, admin_wipe('fc000000-0000-0000-0000-000000000003', 'collection'));
reset role;
select t_is('wiping the collection answers ok with its scope, log and what was settled', (select (j->>'ok')::boolean and j->>'scope' = 'collection'
  and (j->>'log')::bigint > 0 and j ? 'market' and j ? 'gifts' from fc_got where n = 9));
select t_is('the lot is pulled and the bidder refunded', (select status = 'cancelled' from auctions where seller = 'fc000000-0000-0000-0000-000000000003')
  and (select coins = 1000 from wallets where user_id = 'fc000000-0000-0000-0000-000000000004'));
select t_is('the cards go, the special card stays, the coins stay', (select array_agg(article_key order by article_key) = array['special:db:X:en:S']
  from cards where user_id = 'fc000000-0000-0000-0000-000000000003') and (select coins = 5010 from wallets where user_id = 'fc000000-0000-0000-0000-000000000003'));
select fc_as('fc000000-0000-0000-0000-000000000001', true);
set role authenticated;
insert into fc_got values (10, admin_wipe('fc000000-0000-0000-0000-000000000003', 'everything'));
reset role;
select t_is('wiping everything answers with the friends and chats it settled', (select (j->>'ok')::boolean and j->>'scope' = 'everything'
  and j ? 'friends' and j ? 'chats' and j ? 'guild' from fc_got where n = 10));

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
