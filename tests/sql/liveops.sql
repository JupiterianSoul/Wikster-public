reset role;
create table if not exists public.admins (id uuid primary key, note text, granted_at timestamptz not null default now());
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    execute $f$create function public.is_admin() returns boolean language sql stable security definer set search_path = public as
      'select exists (select 1 from public.admins a where a.id = auth.uid())'$f$;
  end if;
end $$;
grant execute on function public.is_admin() to authenticated;

insert into auth.users (id) values ('0a0a0a0a-0000-0000-0000-000000000001'), ('0a0a0a0a-0000-0000-0000-000000000002'), ('0a0a0a0a-0000-0000-0000-000000000003');
insert into public.admins (id) values ('0a0a0a0a-0000-0000-0000-000000000001') on conflict do nothing;
insert into profiles (id, username, level) values ('0a0a0a0a-0000-0000-0000-000000000002', 'lotte_live', 12), ('0a0a0a0a-0000-0000-0000-000000000003', 'lars_live', 3);
delete from realtime.messages;

select t_is('every admin rpc runs as definer with a pinned search path', (select count(*) = 19 and bool_and(p.prosecdef and p.proconfig @> array['search_path=public'])
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_event_upsert', 'admin_event_delete', 'admin_events',
    'admin_code_create', 'admin_code_update', 'admin_codes', 'admin_code_uses', 'admin_tuning', 'admin_tuning_set', 'admin_tuning_reset',
    'admin_pack_upsert', 'admin_pack_delete', 'admin_packs', 'admin_card_override_upsert', 'admin_card_override_delete', 'admin_card_overrides',
    'admin_push_preview', 'admin_push', 'admin_undo_row')));
select t_is('signed-in accounts may call them, the anonymous may not', has_function_privilege('authenticated', 'public.admin_tuning_set(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.admin_tuning_set(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.admin_push(jsonb, text, text, text)', 'execute'));
select t_is('the server side helpers are the service role''s alone', not has_function_privilege('authenticated', 'public.econ_code_take(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.econ_stock_take(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.econ_load_live(uuid, text, integer, text[], uuid, timestamptz, integer)', 'execute')
  and has_function_privilege('service_role', 'public.econ_code_take(uuid, text)', 'execute'));
select t_is('anyone may read the live state', has_function_privilege('anon', 'public.live_state()', 'execute')
  and has_function_privilege('anon', 'public.live_events_active()', 'execute') and has_function_privilege('anon', 'public.packs_live()', 'execute'));

set role authenticated;
select set_config('request.jwt.claim.sub', '0a0a0a0a-0000-0000-0000-000000000002', false);
select t_fails($$select public.admin_tuning_set('xp.mult', '2')$$, 'FORBIDDEN');
select t_fails($$select public.admin_event_upsert('{"name":"x","kind":"xp","params":{"mult":2},"ends_at":"2099-01-01"}')$$, 'FORBIDDEN');
select t_fails($$select public.admin_code_create('{"items":[{"kind":"coins","amount":5}]}')$$, 'FORBIDDEN');
select t_fails($$select public.admin_pack_upsert('{"id":"x1","name":"X","source":{"type":"search","value":"x"}}')$$, 'FORBIDDEN');
select t_fails($$select public.admin_push('{"all":true}', 'Hi', 'There')$$, 'FORBIDDEN');
select t_fails($$select public.admin_undo_row('{"op":"delete_row","table":"tuning","key":{"key":"xp.mult"}}')$$, 'FORBIDDEN');
select t_fails($$select public.admin_codes()$$, 'FORBIDDEN');
select t_is('a player reads the live state', (select public.live_state() ?& array['tuning', 'events', 'packs', 'stock']));
reset role;
select t_is('the tables behind it are closed to players', (select count(*) = 10 and bool_and(c.relrowsecurity) from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname in ('live_events', 'tuning', 'tuning_keys', 'redeem_codes', 'redeem_uses',
    'admin_packs', 'card_overrides', 'live_stock', 'push_broadcasts', 'admin_log'))
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('live_events', 'tuning', 'tuning_keys', 'redeem_codes',
    'redeem_uses', 'admin_packs', 'card_overrides', 'live_stock', 'push_broadcasts')));
select t_fails($$select public.admin_tuning()$$, 'FORBIDDEN');

select set_config('request.jwt.claim.sub', '0a0a0a0a-0000-0000-0000-000000000001', false);

select t_is('every tuning key starts at its default', (select count(*) = 19 and bool_and(x->'current' = 'null'::jsonb and x->'value' = x->'default')
  from jsonb_array_elements(public.admin_tuning()) x));
select public.admin_tuning_set('xp.mult', '2');
select t_is('a tuning value goes live', public.live_state()->'tuning'->'xp.mult' = '2'::jsonb);
select t_is('the change goes out on the world topic', exists (select 1 from realtime.messages where topic = 'world' and event = 'tuning' and payload->>'key' = 'xp.mult'));
select t_is('it is logged with the old value and an undo', (select detail->'old' = 'null'::jsonb and detail->'new' = '2'::jsonb
  and undo = '{"op":"delete_row","table":"tuning","key":{"key":"xp.mult"}}'::jsonb and actor = '0a0a0a0a-0000-0000-0000-000000000001'
  from admin_log where kind = 'tuning_set' order by id limit 1));
select t_fails($$select public.admin_tuning_set('xp.mult', '99')$$, 'BAD_VALUE');
select t_fails($$select public.admin_tuning_set('xp.mult', '"2"')$$, 'BAD_VALUE');
select t_fails($$select public.admin_tuning_set('fuse.copies', '2.5')$$, 'BAD_VALUE');
select t_fails($$select public.admin_tuning_set('odds.table', '{"rare":[1,2,3]}')$$, 'BAD_VALUE');
select t_fails($$select public.admin_tuning_set('odds.table', '{"rare":[0,0,0,0,0,0,0,0]}')$$, 'BAD_VALUE');
select t_fails($$select public.admin_tuning_set('shop.tierMult', '{"gold":2}')$$, 'BAD_VALUE');
select t_fails($$select public.admin_tuning_set('nope', '1')$$, 'UNKNOWN_KEY');
select public.admin_tuning_set('odds.table', '{"none":[50,20,10,8,6,3,2,1]}');
select public.admin_tuning_set('shop.tierMult', '{"rare":1.5,"plain":0.5}');
select public.admin_tuning_set('xp.mult', '3');
select t_is('a second change keeps the first as its undo', (select undo->'row'->'value' = '2'::jsonb from admin_log where kind = 'tuning_set' and detail->>'key' = 'xp.mult' order by id desc limit 1));
select public.admin_undo_row((select undo from admin_log where kind = 'tuning_set' and detail->>'key' = 'xp.mult' order by id desc limit 1));
select t_is('undo puts the old value back', public.live_state()->'tuning'->'xp.mult' = '2'::jsonb);
select public.admin_undo_row((select undo from admin_log where kind = 'tuning_set' and detail->>'key' = 'xp.mult' order by id limit 1));
select t_is('undoing the first change returns to the default', not (public.live_state()->'tuning' ? 'xp.mult'));
select public.admin_tuning_reset('shop.tierMult');
select t_is('a reset drops the override', not (public.live_state()->'tuning' ? 'shop.tierMult'));
select public.admin_undo_row((select undo from admin_log where kind = 'tuning_reset' order by id desc limit 1));
select t_is('and its undo restores it', public.live_state()->'tuning'->'shop.tierMult' = '{"rare":1.5,"plain":0.5}'::jsonb);
select t_is('admin_tuning shows current and default side by side', (select x->'current' = '{"none":[50,20,10,8,6,3,2,1]}'::jsonb and x->'default' = '{}'::jsonb
  and (x->>'min')::numeric = 0 and (x->>'max')::numeric = 100 from jsonb_array_elements(public.admin_tuning()) x where x->>'key' = 'odds.table'));
select t_fails($$select public.admin_undo_row('{"op":"delete_row","table":"profiles","key":{"id":"x"}}')$$, 'BAD_UNDO');
select t_fails($$select public.admin_undo_row('{"op":"drop","table":"tuning","key":{"key":"xp.mult"}}')$$, 'BAD_UNDO');

delete from realtime.messages;
select public.admin_event_upsert('{"name":"Double XP","kind":"xp","params":{"mult":2,"title":{"en":"Double XP","fr":"XP double"}},"starts_at":"2020-01-01T00:00:00Z","ends_at":"2099-01-01T00:00:00Z"}');
select public.admin_event_upsert('{"name":"Later","kind":"price","params":{"mult":0.5},"starts_at":"2098-01-01T00:00:00Z","ends_at":"2099-01-01T00:00:00Z"}');
select public.admin_event_upsert('{"name":"Gone","kind":"drop_rate","params":{"mult":{"rare":3}},"starts_at":"2020-01-01T00:00:00Z","ends_at":"2021-01-01T00:00:00Z"}');
select public.admin_event_upsert(jsonb_build_object('name', 'Tomorrow', 'kind', 'free_packs', 'params', '{"spec":{"kind":"theme","themeId":"cars","cards":3},"count":2}'::jsonb,
  'starts_at', now() + interval '2 hours', 'ends_at', now() + interval '3 days'));
select t_is('players see what is on and what starts within a day', (select array_agg(x->>'name' order by x->>'name') = array['Double XP', 'Tomorrow']
  from jsonb_array_elements(public.live_events_active()) x));
select t_is('without the internals', (select bool_and(not (x ? 'created_by') and not (x ? 'created_at')) from jsonb_array_elements(public.live_events_active()) x));
select t_is('the creator sees everything not over', (select count(*) = 3 from jsonb_array_elements(public.admin_events(false))));
select t_is('and the past on request, marked as such', (select x->>'status' = 'past' from jsonb_array_elements(public.admin_events(true)) x where x->>'name' = 'Gone'));
select t_is('a live event is marked live', (select x->>'status' = 'live' from jsonb_array_elements(public.admin_events(false)) x where x->>'name' = 'Double XP'));
select t_is('each change tells the world', (select count(*) = 4 from realtime.messages where topic = 'world' and event = 'events'));
select t_fails($$select public.admin_event_upsert('{"name":"Bad","kind":"drop_rate","params":{},"ends_at":"2099-01-01"}')$$, 'BAD_PARAMS');
select t_fails($$select public.admin_event_upsert('{"name":"Bad","kind":"drop_rate","params":{"mult":{"gold":2}},"ends_at":"2099-01-01"}')$$, 'BAD_PARAMS');
select t_fails($$select public.admin_event_upsert('{"name":"Bad","kind":"limited_booster","params":{"spec":{"kind":"open","cards":13},"price":10},"ends_at":"2099-01-01"}')$$, 'BAD_PARAMS');
select t_fails($$select public.admin_event_upsert('{"name":"Bad","kind":"party","params":{},"ends_at":"2099-01-01"}')$$, 'BAD_PARAMS');
select t_fails($$select public.admin_event_upsert('{"name":"Bad","kind":"xp","params":{"mult":2},"starts_at":"2099-01-01","ends_at":"2098-01-01"}')$$, 'BAD_EVENT');
select public.admin_event_upsert(jsonb_build_object('id', (select id from live_events where name = 'Double XP'), 'name', 'Triple XP', 'params', '{"mult":3}'::jsonb));
select t_is('an edit keeps what it does not change', (select kind = 'xp' and params->>'mult' = '3' and ends_at = '2099-01-01T00:00:00Z' from live_events where name = 'Triple XP'));
select public.admin_undo_row((select undo from admin_log where kind = 'event_update' order by id desc limit 1));
select t_is('undoing the edit restores the event', exists (select 1 from live_events where name = 'Double XP' and params->>'mult' = '2'));
select public.admin_event_delete((select id from live_events where name = 'Later'));
select t_is('an event can be deleted', not exists (select 1 from live_events where name = 'Later'));
select public.admin_undo_row((select undo from admin_log where kind = 'event_delete' order by id desc limit 1));
select t_is('and brought back', exists (select 1 from live_events where name = 'Later'));
select public.admin_undo_row((select undo from admin_log where kind = 'event_create' and detail->'new'->>'name' = 'Gone'));
select t_is('undoing a creation removes it', not exists (select 1 from live_events where name = 'Gone'));
select t_is('a gift claim is counted per event', (select (x->>'claimed')::integer = 0 from jsonb_array_elements(public.admin_events(false)) x where x->>'name' = 'Tomorrow'));

select public.admin_code_create('{"code":"spring-2026","items":[{"kind":"coins","amount":500},{"kind":"booster","spec":{"kind":"open","rarityId":"rare","cards":1},"count":1}],"max_uses":2}');
select t_is('a code is stored in the form players type it', exists (select 1 from redeem_codes where code = 'SPRING2026' and per_user = 1 and max_uses = 2));
select t_is('without a code one is made up', (select (public.admin_code_create('{"items":[{"kind":"ink","amount":5}]}')->>'code') ~ '^[A-HJ-NP-Z2-9]{10}$'));
select t_fails($$select public.admin_code_create('{"code":"SPRING2026","items":[{"kind":"coins","amount":5}]}')$$, 'CODE_TAKEN');
select t_fails($$select public.admin_code_create('{"code":"BIGPACK","items":[{"kind":"booster","spec":{"kind":"open","cards":13}}]}')$$, 'BAD_SPEC');
select t_fails($$select public.admin_code_create('{"code":"NOTHING","items":[]}')$$, 'BAD_ITEMS');
select t_fails($$select public.admin_code_create('{"code":"WEIRD","items":[{"kind":"diamonds","amount":5}]}')$$, 'BAD_KIND');
select t_fails($$select public.admin_code_create('{"code":"AB","items":[{"kind":"coins","amount":5}]}')$$, 'BAD_CODE');
select public.admin_code_create('{"code":"OLDCODE","items":[{"kind":"coins","amount":5}],"expires_at":"2020-01-01T00:00:00Z"}');
select public.admin_code_create('{"code":"SOONCODE","items":[{"kind":"coins","amount":5}],"starts_at":"2099-01-01T00:00:00Z"}');
select t_is('a code redeems with its items', (select x->>'code' = 'SPRING2026' and (x->>'n')::integer = 1 and jsonb_array_length(x->'items') = 2
  from public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000002', 'spring 2026') x));
select t_fails($$select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000002', 'SPRING2026')$$, 'ALREADY_CLAIMED');
select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000003', 'Spring2026');
select t_fails($$select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000001', 'SPRING2026')$$, 'CODE_USED_UP');
select t_fails($$select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000002', 'OLDCODE')$$, 'CODE_EXPIRED');
select t_fails($$select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000002', 'SOONCODE')$$, 'UNKNOWN_CODE');
select t_fails($$select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000002', 'NOSUCHCODE')$$, 'UNKNOWN_CODE');
select public.econ_code_release((select max(id) from redeem_uses where code = 'SPRING2026'));
select t_is('a use the economy could not grant is given back', (select count(*) = 1 from redeem_uses where code = 'SPRING2026'));
select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000003', 'SPRING2026');
select t_is('the list shows uses and status', (select (x->>'uses')::integer = 2 and x->>'status' = 'used_up' from jsonb_array_elements(public.admin_codes()) x where x->>'code' = 'SPRING2026'));
select t_is('and who used it', (select array_agg(x->>'username' order by x->>'username') = array['lars_live', 'lotte_live'] from jsonb_array_elements(public.admin_code_uses('spring2026')) x));
select public.admin_code_update('SPRING2026', '{"max_uses":5,"disabled":true}');
select t_fails($$select public.econ_code_take('0a0a0a0a-0000-0000-0000-000000000001', 'SPRING2026')$$, 'CODE_EXPIRED');
select public.admin_undo_row((select undo from admin_log where kind = 'code_update' order by id desc limit 1));
select t_is('undoing the update restores the code', exists (select 1 from redeem_codes where code = 'SPRING2026' and not disabled and max_uses = 2));
select public.admin_undo_row((select undo from admin_log where kind = 'code_create' and detail->'new'->>'code' = 'SPRING2026'));
select t_is('undoing a creation disables the code but keeps its uses', exists (select 1 from redeem_codes where code = 'SPRING2026' and disabled)
  and (select count(*) = 2 from redeem_uses where code = 'SPRING2026'));
select t_fails($$select public.admin_code_update('NOPE', '{"disabled":true}')$$, 'UNKNOWN_CODE');

delete from realtime.messages;
select public.admin_pack_upsert('{"id":"ocean","name":{"en":"Ocean","fr":"Océan"},"tagline":"Waves","source":{"type":"category","value":{"en":"Oceans","fr":"Océan"}},"default_cards":4,"visible":true,"limited_stock":2,"price":300}');
select t_is('a pack id gets its prefix', exists (select 1 from admin_packs where id = 'pack-ocean' and tagline = '{"en":"Waves","fr":"Waves"}'::jsonb));
select t_is('players see the pack without its source', (select x->>'id' = 'pack-ocean' and not (x ? 'source') and x->>'visible' = 'true' from jsonb_array_elements(public.packs_live()) x));
select t_is('the economy sees the source', (select x->'source'->>'type' = 'category' from jsonb_array_elements(
  public.econ_load_live('0a0a0a0a-0000-0000-0000-000000000002')->'live'->'packs') x where x->>'id' = 'pack-ocean'));
select t_is('the economy load still carries the wallet', public.econ_load_live('0a0a0a0a-0000-0000-0000-000000000002') ?& array['wallet', 'state', 'inventory', 'live']);
select t_is('the economy knows whether any card is overridden', jsonb_typeof(public.econ_load_live('0a0a0a0a-0000-0000-0000-000000000002')->'live'->'overrides') = 'number'
  and not (public.live_state() ? 'overrides'));
select t_is('a pack change tells the world', exists (select 1 from realtime.messages where topic = 'world' and event = 'packs'));
select t_fails($$select public.admin_pack_upsert('{"id":"bad","name":"Bad","source":{"type":"magic","value":"x"}}')$$, 'BAD_SOURCE');
select t_fails($$select public.admin_pack_upsert('{"id":"bad","name":"Bad","source":{"type":"search","value":"x"},"rarity_odds":[1,2]}')$$, 'BAD_ODDS');
select t_fails($$select public.admin_pack_upsert('{"id":"bad","name":"Bad","source":{"type":"search","value":"x"},"default_cards":13}')$$, 'BAD_PACK');
select t_fails($$select public.admin_pack_upsert('{"id":"bad","source":{"type":"search","value":"x"}}')$$, 'BAD_NAME');
select t_fails($$select public.admin_pack_upsert('{"id":"Bad Id!","name":"Bad","source":{"type":"search","value":"x"}}')$$, 'BAD_ID');
select t_is('stock sells one at a time', public.econ_stock_take('live|pack-ocean') = 1 and public.econ_stock_take('live|pack-ocean') = 2);
select t_fails($$select public.econ_stock_take('live|pack-ocean')$$, 'SOLD_OUT');
select public.econ_stock_give('live|pack-ocean');
select t_is('a sale that fails gives its slot back', (select sold = 1 from live_stock where item = 'live|pack-ocean'));
select t_is('players see what is sold', public.live_state()->'stock'->'live|pack-ocean' = '1'::jsonb);
select t_is('the creator sees it too', (select (x->>'sold')::integer = 1 and (x->>'on_sale')::boolean from jsonb_array_elements(public.admin_packs()) x where x->>'id' = 'pack-ocean'));
select public.admin_event_upsert('{"name":"Rare drop","kind":"limited_booster","params":{"spec":{"kind":"open","rarityId":"epic","cards":1},"price":100,"stock":1},"starts_at":"2020-01-01T00:00:00Z","ends_at":"2099-01-01T00:00:00Z"}');
select t_is('an event booster has its own stock', public.econ_stock_take('live|event:' || (select id from live_events where name = 'Rare drop')) = 1);
select t_fails(format($$select public.econ_stock_take('live|event:%s')$$, (select id from live_events where name = 'Rare drop')), 'SOLD_OUT');
select public.admin_pack_upsert('{"id":"pack-ocean","visible":false}');
select t_is('an edit keeps the rest of the pack', exists (select 1 from admin_packs where id = 'pack-ocean' and not visible and name->>'fr' = 'Océan' and limited_stock = 2));
select public.admin_undo_row((select undo from admin_log where kind = 'pack_update' order by id desc limit 1));
select t_is('undoing the edit shows it again', exists (select 1 from admin_packs where id = 'pack-ocean' and visible));
select public.admin_pack_delete('pack-ocean');
select public.admin_undo_row((select undo from admin_log where kind = 'pack_delete' order by id desc limit 1));
select t_is('a deleted pack comes back whole', exists (select 1 from admin_packs where id = 'pack-ocean' and visible and price = 300 and default_cards = 4));

insert into cards (user_id, article_key, title, rarity_id, price, data) values
  ('0a0a0a0a-0000-0000-0000-000000000002', 'en:Liveops_cat', 'Cat', 'rare', 100, '{"description":"A small cat","thumbnail":"https://x/cat.jpg"}'),
  ('0a0a0a0a-0000-0000-0000-000000000003', 'en:Liveops_cat', 'Cat', 'common', 20, '{}');
select t_is('an override reports the cards it touched', (public.admin_card_override_upsert('{"article_key":"en:Liveops_cat","title_override":"The Cat","image_url":"https://img/cat2.jpg"}')->>'cards')::integer = 2);
select t_is('owned copies show the new title and picture', (select bool_and(title = 'The Cat' and data->>'thumbnail' = 'https://img/cat2.jpg') from cards where article_key = 'en:Liveops_cat'));
select t_is('the description nobody changed stays', (select data->>'description' = 'A small cat' from cards where article_key = 'en:Liveops_cat' and user_id = '0a0a0a0a-0000-0000-0000-000000000002'));
select t_is('the language comes from the key', exists (select 1 from card_overrides where article_key = 'en:Liveops_cat' and lang = 'en'));
select public.admin_card_override_upsert('{"article_key":"en:Liveops_cat","rarity_override":"mythic","hidden":true}');
select t_is('a second edit keeps the first fields', exists (select 1 from card_overrides where article_key = 'en:Liveops_cat' and title_override = 'The Cat' and rarity_override = 'mythic' and hidden));
select t_is('the search finds it with its owners', (select (x->>'owners')::integer = 2 from jsonb_array_elements(public.admin_card_overrides('liveops_cat')) x));
select t_fails($$select public.admin_card_override_upsert('{"article_key":"en:Dog","image_url":"http://plain/dog.jpg"}')$$, 'BAD_OVERRIDE');
select t_fails($$select public.admin_card_override_upsert('{"article_key":"en:Dog","rarity_override":"golden"}')$$, 'BAD_OVERRIDE');
select public.admin_card_override_delete('en:Liveops_cat');
select t_is('removing it restores the cards', (select bool_and(title = 'Cat' and not (data ? 'liveOrig')) from cards where article_key = 'en:Liveops_cat'));
select t_is('down to the picture each one had', (select data->>'thumbnail' = 'https://x/cat.jpg' from cards where article_key = 'en:Liveops_cat' and user_id = '0a0a0a0a-0000-0000-0000-000000000002')
  and (select not (data ? 'thumbnail') from cards where article_key = 'en:Liveops_cat' and user_id = '0a0a0a0a-0000-0000-0000-000000000003'));
select public.admin_undo_row((select undo from admin_log where kind = 'override_delete' order by id desc limit 1));
select t_is('undo brings the override back onto the cards', (select bool_and(title = 'The Cat') from cards where article_key = 'en:Liveops_cat'));

insert into push_tokens (token, user_id, platform, lang) values
  ('token-for-lotte-phone-00000000001', '0a0a0a0a-0000-0000-0000-000000000002', 'android', 'fr'),
  ('token-for-lars-phone-000000000001', '0a0a0a0a-0000-0000-0000-000000000003', 'android', 'en');
select t_fails($$select public.admin_push_preview('{}')$$, 'EMPTY_TARGET');
select t_fails($$select public.admin_push('{"ids":[]}', 'Hi', 'There')$$, 'EMPTY_TARGET');
select t_is('everyone only when asked for', (select (x->>'users')::integer = 2 and (x->>'devices')::integer = 2 from public.admin_push_preview('{"all":true}') x));
select t_is('a level filter narrows it', (select (x->>'users')::integer = 1 from public.admin_push_preview('{"level_min":10}') x));
select t_is('so does a list of ids', (select (x->>'users')::integer = 1 from public.admin_push_preview('{"ids":["0a0a0a0a-0000-0000-0000-000000000003"]}') x));
select t_is('and a language', (select (x->>'devices')::integer = 1 from public.admin_push_preview('{"lang":"fr"}') x));
select t_fails($$select public.admin_push('{"all":true}', '', 'There')$$, 'BAD_TEXT');
select t_fails($$select public.admin_push('{"all":true}', 'Hi', 'There', 'javascript:alert(1)')$$, 'BAD_URL');
select t_is('a push goes to exactly its target', (select (x->>'users')::integer = 1 and (x->>'devices')::integer = 1
  from public.admin_push('{"lang":"fr"}', 'Bonjour', 'Un nouvel événement', '#shop') x));
select t_is('the push function reads its devices once', (select jsonb_array_length(public.push_broadcast_targets(id)->'targets') = 1
  and jsonb_array_length(public.push_broadcast_targets(id)->'targets') = 0 from push_broadcasts order by created_at desc limit 1));
select public.push_broadcast_done((select id from push_broadcasts order by created_at desc limit 1), 1);
select t_is('and records what it sent', exists (select 1 from push_broadcasts where sent = 1 and sent_at is not null));
select t_is('the push is logged', exists (select 1 from admin_log where kind = 'push' and (detail->>'users')::integer = 1 and undo is null));
select t_is('every write left an undo in a known shape', (select count(*) > 20 and bool_and(undo->>'op' in ('restore_row', 'delete_row')
  and undo->>'table' is not null and jsonb_typeof(undo->'key') = 'object') from admin_log where kind in ('event_create', 'event_update', 'event_delete',
  'code_create', 'code_update', 'tuning_set', 'tuning_reset', 'pack_create', 'pack_update', 'pack_delete', 'override_create', 'override_update', 'override_delete')));

select set_config('request.headers', '{"x-wikster-control":"1"}', false);
select public.admin_tuning_set('stipend.amount', '800');
create temp table liveops_undone as select public.admin_undo((select id from admin_log where kind = 'tuning_set' and detail->>'key' = 'stipend.amount' order by id desc limit 1)) as r;
select t_is('Control''s own undo reverts a live ops change', (select (r->>'ok')::boolean from liveops_undone) and not (public.live_state()->'tuning' ? 'stipend.amount'));
drop table liveops_undone;
select t_is('and marks it undone', (select undone_at is not null from admin_log where kind = 'tuning_set' and detail->>'key' = 'stipend.amount' order by id desc limit 1));
select set_config('request.headers', '', false);

delete from push_tokens where user_id in ('0a0a0a0a-0000-0000-0000-000000000002', '0a0a0a0a-0000-0000-0000-000000000003');
delete from cards where article_key = 'en:Liveops_cat';
delete from card_overrides;
delete from live_events;
delete from admin_packs;
delete from tuning;
delete from live_stock;
select set_config('request.jwt.claim.sub', '', false);
