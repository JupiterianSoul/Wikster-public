select wiki_find_put('en|zelda', '{"query":"zelda","results":[{"apiUrl":"https://zelda.fandom.com/api.php","articles":11976}]}');
select t_is('a finder search is kept for the next player', (wiki_find_get('en|zelda')->'results'->0->>'articles')::integer = 11976);
select wiki_find_put('en|zelda', '{"query":"zelda","results":[]}');
select t_is('and a newer search replaces it', jsonb_array_length(wiki_find_get('en|zelda')->'results') = 0);
update wiki_finds set at = now() - interval '8 days' where key = 'en|zelda';
select t_is('a week old search is searched again', wiki_find_get('en|zelda') is null);
select wiki_find_put('en|bad', '[1,2]');
select t_is('a search that is not an object is not kept', not exists (select 1 from wiki_finds where key = 'en|bad'));

select wiki_site_put('https://minecraft.wiki/api.php', '{"sitename":"Minecraft Wiki","articles":18100}');
select wiki_site_put('https://gone.example.org/api.php', null);
select t_is('a wiki reached is kept with its numbers', (wiki_site_get('https://minecraft.wiki/api.php')->'info'->>'articles')::integer = 18100);
select t_is('a wiki that did not answer is kept as nothing', wiki_site_get('https://gone.example.org/api.php') = '{"info":null}'::jsonb);
update wiki_sites set at = now() - interval '2 days' where api_url = 'https://gone.example.org/api.php';
select t_is('and asked again a day later', wiki_site_get('https://gone.example.org/api.php') is null);
select wiki_site_put('http://plain.example.org/api.php', '{}');
select wiki_site_put('https://bad.example.org/index.php', '{}');
select t_is('only https api.php addresses are kept', not exists (select 1 from wiki_sites where api_url like '%plain%' or api_url like '%index.php'));

select t_is('pictures take their rows', pictures_put('[
  {"key":"en.wikipedia.org|Pine tree","image":"https://upload.wikimedia.org/a.jpg","source":"linked","extra":{"from":"Pine"}},
  {"key":"zelda.fandom.com|Goselle","image":null,"source":"text"},
  {"key":"en.wikipedia.org|Bad","image":"javascript:alert(1)","source":"openverse"},
  {"key":"en.wikipedia.org|Odd","image":"https://x.org/a.jpg","source":"somewhere"}
]') = 2);
select t_is('a picture is found once for everyone', (select count(*) = 2 from jsonb_array_elements(pictures_get(array['en.wikipedia.org|Pine tree', 'zelda.fandom.com|Goselle', 'en.wikipedia.org|Bad']))));
select t_is('with where it came from', (select r->'extra'->>'from' = 'Pine' from jsonb_array_elements(pictures_get(array['en.wikipedia.org|Pine tree'])) r));
select pictures_put('[{"key":"zelda.fandom.com|Goselle","image":"https://static.wikia.nocookie.net/g.png","source":"openverse","license":"CC BY 2.0","credit":"Someone"}]');
select t_is('a later find replaces a text card', (select r->>'source' = 'openverse' and r->>'license' = 'CC BY 2.0' from jsonb_array_elements(pictures_get(array['zelda.fandom.com|Goselle'])) r));
select t_is('players cannot read the caches themselves', (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('public.card_pictures'::regclass, 'public.wiki_finds'::regclass, 'public.wiki_sites'::regclass))
  and not exists (select 1 from pg_policies where tablename in ('card_pictures', 'wiki_finds', 'wiki_sites'))
  and not has_function_privilege('authenticated', 'public.pictures_put(jsonb)', 'execute') and not has_function_privilege('anon', 'public.wiki_find_get(text)', 'execute'));
