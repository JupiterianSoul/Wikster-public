create table if not exists public.profiles (
  id                uuid primary key references auth.users on delete cascade,
  username          text not null
                      check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  level             integer not null default 1,
  rank              text,
  cards             integer not null default 0,
  unique_cards      integer not null default 0,
  boosters_opened   integer not null default 0,
  collection_value  bigint  not null default 0,
  best_rarity       text,
  play_ms           bigint  not null default 0
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by signed-in players" on public.profiles;
create policy "profiles are readable by signed-in players"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "a player writes only their own profile" on public.profiles;
create policy "a player writes only their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "a player updates only their own profile" on public.profiles;
create policy "a player updates only their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create table if not exists public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references auth.users on delete cascade,
  addressee   uuid not null references auth.users on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

create index if not exists friendships_requester_idx on public.friendships (requester);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;

drop policy if exists "you see friendships you are part of" on public.friendships;
create policy "you see friendships you are part of"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) = requester or (select auth.uid()) = addressee);

drop policy if exists "you send requests as yourself" on public.friendships;
create policy "you send requests as yourself"
  on public.friendships for insert
  to authenticated
  with check ((select auth.uid()) = requester and status = 'pending');

drop policy if exists "only the addressee accepts" on public.friendships;
create policy "only the addressee accepts"
  on public.friendships for update
  to authenticated
  using ((select auth.uid()) = addressee)
  with check ((select auth.uid()) = addressee and status = 'accepted');

drop policy if exists "either side removes a friendship" on public.friendships;
create policy "either side removes a friendship"
  on public.friendships for delete
  to authenticated
  using ((select auth.uid()) = requester or (select auth.uid()) = addressee);

create table if not exists public.saves (
  user_id     uuid primary key references auth.users on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.saves enable row level security;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b)
        or (f.requester = b and f.addressee = a))
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

drop policy if exists "you read your own save, and your friends'" on public.saves;
drop policy if exists "you read only your own save" on public.saves;
create policy "you read only your own save"
  on public.saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "you delete your own save" on public.saves;
create policy "you delete your own save"
  on public.saves for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "you write only your own save" on public.saves;
create policy "you write only your own save"
  on public.saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "you update only your own save" on public.saves;
create policy "you update only your own save"
  on public.saves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.friend_cards(target uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() = target or public.are_friends(auth.uid(), target) then
      jsonb_build_object('allowed', true, 'cards', (
        select s.data -> 'data' ->> 'wikster.collection.v3'
        from public.saves s where s.user_id = target
      ))
    else jsonb_build_object('allowed', false)
  end;
$$;

revoke all on function public.friend_cards(uuid) from public;
grant execute on function public.friend_cards(uuid) to authenticated;

create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.profiles p where lower(p.username) = lower(name)
  );
$$;

revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before update on public.saves
  for each row execute function public.touch_updated_at();

create table if not exists public.saves_history (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users on delete cascade,
  at        timestamptz not null default now(),
  reason    text not null default 'update',
  cards     integer,
  coins     bigint,
  data      jsonb not null
);
create index if not exists saves_history_owner_at on public.saves_history (user_id, at desc);
alter table public.saves_history enable row level security;

drop policy if exists "you read only your own backups" on public.saves_history;
create policy "you read only your own backups"
  on public.saves_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "you file only your own backups" on public.saves_history;
create policy "you file only your own backups"
  on public.saves_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "you delete only your own backups" on public.saves_history;
create policy "you delete only your own backups"
  on public.saves_history for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.keep_save_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := case when tg_op = 'DELETE' then 'erase' else 'update' end;
  v_cards integer;
  v_coins bigint;
  v_last timestamptz;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return coalesce(new, old);
  end if;
  select max(h.at) into v_last from public.saves_history h where h.user_id = old.user_id;
  if v_reason = 'update' and v_last is not null and v_last > now() - interval '1 minute' then
    return coalesce(new, old);
  end if;
  begin
    v_cards := jsonb_object_length(((old.data->'data'->>'wikster.collection.v3')::jsonb)->'entries');
  exception when others then v_cards := null; end;
  begin
    v_coins := (old.data->'data'->>'wikster.wallet.v1')::bigint;
  exception when others then v_coins := null; end;
  insert into public.saves_history (user_id, reason, cards, coins, data)
    values (old.user_id, v_reason, v_cards, v_coins, old.data);

  delete from public.saves_history h
  using (
    select id, row_number() over (partition by bucket order by at desc) as rn
    from (
      select id, at,
        case when at > now() - interval '1 hour' then to_char(at, 'YYYYMMDDHH24MI')
             when at > now() - interval '1 day'  then to_char(at, 'YYYYMMDDHH24')
             else to_char(at, 'YYYYMMDD') end as bucket
      from public.saves_history
      where user_id = old.user_id and reason = 'update'
    ) b
  ) k
  where h.id = k.id and k.rn > 1;
  delete from public.saves_history h
  where h.user_id = old.user_id
    and h.id not in (
      select id from public.saves_history
      where user_id = old.user_id order by at desc limit 40
    );
  return coalesce(new, old);
end;
$$;

drop trigger if exists saves_history_keep on public.saves;
create trigger saves_history_keep before update or delete on public.saves
  for each row execute function public.keep_save_history();

notify pgrst, 'reload schema';

alter table public.profiles
  add column if not exists visibility text not null default 'public'
    check (visibility in ('private', 'friends', 'public')),
  add column if not exists presence text not null default 'online'
    check (presence in ('online', 'hidden')),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists avatar jsonb;

drop policy if exists "profiles are readable by signed-in players" on public.profiles;
create policy "profiles are readable by signed-in players"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) = id
    or visibility = 'public'
    or (visibility = 'friends' and exists (
      select 1 from public.friendships f
      where (f.requester = (select auth.uid()) and f.addressee = id)
         or (f.requester = id and f.addressee = (select auth.uid()))
    ))
  );

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references auth.users on delete cascade,
  recipient   uuid not null references auth.users on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (sender <> recipient)
);

create index if not exists messages_pair_idx
  on public.messages (least(sender, recipient), greatest(sender, recipient), created_at);
create index if not exists messages_recipient_unread_idx
  on public.messages (recipient) where read_at is null;

alter table public.messages enable row level security;

drop policy if exists "you read conversations you are in" on public.messages;
create policy "you read conversations you are in"
  on public.messages for select
  to authenticated
  using ((select auth.uid()) = sender or (select auth.uid()) = recipient);

drop policy if exists "you message friends as yourself" on public.messages;
create policy "you message friends as yourself"
  on public.messages for insert
  to authenticated
  with check ((select auth.uid()) = sender and public.are_friends(sender, recipient));

drop policy if exists "the recipient marks messages read" on public.messages;
create policy "the recipient marks messages read"
  on public.messages for update
  to authenticated
  using ((select auth.uid()) = recipient)
  with check ((select auth.uid()) = recipient);

create table if not exists public.deliveries (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references auth.users on delete cascade,
  recipient   uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('card', 'booster', 'trade-return')),
  payload     jsonb not null,
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);

create index if not exists deliveries_recipient_idx
  on public.deliveries (recipient) where claimed_at is null;

alter table public.deliveries enable row level security;

drop policy if exists "you see deliveries you sent or received" on public.deliveries;
create policy "you see deliveries you sent or received"
  on public.deliveries for select
  to authenticated
  using ((select auth.uid()) = sender or (select auth.uid()) = recipient);

drop policy if exists "you send deliveries as yourself to friends" on public.deliveries;
create policy "you send deliveries as yourself to friends"
  on public.deliveries for insert
  to authenticated
  with check ((select auth.uid()) = sender
    and (public.are_friends(sender, recipient) or sender = recipient));

drop policy if exists "the recipient claims a delivery" on public.deliveries;
create policy "the recipient claims a delivery"
  on public.deliveries for update
  to authenticated
  using ((select auth.uid()) = recipient)
  with check ((select auth.uid()) = recipient);

create table if not exists public.trades (
  id           uuid primary key default gen_random_uuid(),
  proposer     uuid not null references auth.users on delete cascade,
  recipient    uuid not null references auth.users on delete cascade,
  offer        jsonb not null,
  ask          jsonb not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined', 'cancelled', 'closed')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  check (proposer <> recipient)
);

create index if not exists trades_proposer_idx on public.trades (proposer);
create index if not exists trades_recipient_idx on public.trades (recipient);

alter table public.trades enable row level security;

drop policy if exists "you see trades you are part of" on public.trades;
create policy "you see trades you are part of"
  on public.trades for select
  to authenticated
  using ((select auth.uid()) = proposer or (select auth.uid()) = recipient);

drop policy if exists "you propose trades as yourself to friends" on public.trades;
create policy "you propose trades as yourself to friends"
  on public.trades for insert
  to authenticated
  with check ((select auth.uid()) = proposer
    and status = 'pending'
    and public.are_friends(proposer, recipient));

drop policy if exists "trade parties update their side" on public.trades;
create policy "trade parties update their side"
  on public.trades for update
  to authenticated
  using ((select auth.uid()) = proposer or (select auth.uid()) = recipient)
  with check ((select auth.uid()) = proposer or (select auth.uid()) = recipient);

create or replace function public.is_online(p public.profiles)
returns boolean
language sql
stable
as $$
  select p.presence = 'online' and p.last_seen_at > now() - interval '2 minutes';
$$;

notify pgrst, 'reload schema';

alter table public.deliveries drop constraint if exists deliveries_kind_check;
alter table public.deliveries add constraint deliveries_kind_check
  check (kind in ('card', 'booster', 'trade-return', 'auction-card', 'auction-money'));

create table if not exists public.auctions (
  id           uuid primary key default gen_random_uuid(),
  seller       uuid not null references auth.users on delete cascade,
  seller_name  text not null default '',
  card         jsonb not null,
  start_price  integer not null check (start_price between 1 and 1000000),
  current_bid  integer,
  bidder       uuid references auth.users on delete set null,
  bidder_name  text,
  bid_count    integer not null default 0,
  ends_at      timestamptz not null,
  status       text not null default 'open'
                 check (status in ('open', 'settled', 'cancelled')),
  created_at   timestamptz not null default now()
);

create index if not exists auctions_open_idx on public.auctions (status, ends_at);
create index if not exists auctions_seller_idx on public.auctions (seller);

alter table public.auctions enable row level security;

drop policy if exists "auctions are readable by signed-in players" on public.auctions;
create policy "auctions are readable by signed-in players"
  on public.auctions for select
  to authenticated
  using (true);

create or replace function public.auction_floor(a public.auctions)
returns integer
language sql immutable as $$
  select case when a.current_bid is null then a.start_price
              else ceil(a.current_bid * 1.15)::integer end;
$$;

create or replace function public.create_auction(card jsonb, price integer, minutes integer)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare mine integer; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  if minutes not in (10, 30, 60, 180, 360, 720, 1440) then raise exception 'BAD_DURATION'; end if;
  if price is null or price < 1 or price > 1000000 then raise exception 'BAD_PRICE'; end if;
  select count(*) into mine from auctions where seller = auth.uid() and status = 'open';
  if mine >= 10 then raise exception 'TOO_MANY'; end if;
  insert into auctions (seller, seller_name, card, start_price, ends_at)
  values (auth.uid(),
          coalesce((select username from profiles where id = auth.uid()), ''),
          card, price, now() + make_interval(mins => minutes))
  returning * into row_out;
  return row_out;
end $$;

create or replace function public.place_bid(auction uuid, amount integer)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare a public.auctions; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = auction for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status <> 'open' or now() >= a.ends_at then raise exception 'ENDED'; end if;
  if a.seller = auth.uid() then raise exception 'OWN_AUCTION'; end if;
  if amount is null or amount < auction_floor(a) then raise exception 'TOO_LOW'; end if;
  if a.bidder is not null then
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.bidder, 'auction-money',
            jsonb_build_object('amount', a.current_bid, 'reason', 'refund',
                               'title', a.card->>'title'));
  end if;
  update auctions set
    current_bid = amount,
    bidder = auth.uid(),
    bidder_name = coalesce((select username from profiles where id = auth.uid()), ''),
    bid_count = bid_count + 1,
    ends_at = case when ends_at - now() < interval '10 seconds'
                   then now() + interval '65 seconds' else ends_at end
  where id = auction
  returning * into row_out;
  return row_out;
end $$;

create or replace function public.cancel_auction(auction uuid)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare a public.auctions; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = auction for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.seller <> auth.uid() then raise exception 'NOT_YOURS'; end if;
  if a.status <> 'open' then raise exception 'ENDED'; end if;
  if a.bid_count > 0 then raise exception 'HAS_BIDS'; end if;
  update auctions set status = 'cancelled' where id = auction returning * into row_out;
  insert into deliveries (sender, recipient, kind, payload)
  values (a.seller, a.seller, 'auction-card', a.card);
  return row_out;
end $$;

create or replace function public.auction_fee(amount integer)
returns integer language sql immutable as $$ select ceil(greatest(coalesce(amount, 0), 0) * 0.05)::integer $$;

create or replace function public.settle_auction(auction uuid)
returns public.auctions
language plpgsql security definer set search_path = public as $$
declare a public.auctions; row_out public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = auction for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status <> 'open' then return a; end if;
  if now() < a.ends_at then raise exception 'NOT_OVER'; end if;
  update auctions set status = 'settled' where id = auction returning * into row_out;
  if a.bidder is null then
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.seller, 'auction-card', a.card);
  else
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.bidder, 'auction-card', a.card);
    insert into deliveries (sender, recipient, kind, payload)
    values (a.bidder, a.seller, 'auction-money',
            jsonb_build_object('amount', a.current_bid - public.auction_fee(a.current_bid), 'fee', public.auction_fee(a.current_bid),
                               'reason', 'sale', 'title', a.card->>'title'));
  end if;
  return row_out;
end $$;

grant execute on function public.create_auction(jsonb, integer, integer) to authenticated;
grant execute on function public.place_bid(uuid, integer) to authenticated;
grant execute on function public.cancel_auction(uuid) to authenticated;
grant execute on function public.settle_auction(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.auctions;
exception when others then null; end $$;

create table if not exists public.codex (
  key        text primary key,
  title      text not null check (char_length(title) <= 300),
  rarity     text,
  price      integer,
  views      bigint,
  thumbnail  text check (char_length(thumbnail) <= 2000),
  lang       text check (char_length(lang) <= 12),
  found_at   timestamptz not null default now(),
  found_by   uuid references auth.users on delete set null
);

create index if not exists codex_found_idx on public.codex (found_at desc);
create index if not exists codex_title_idx on public.codex (lower(title) text_pattern_ops);

alter table public.codex enable row level security;

drop policy if exists "the codex is readable by signed-in players" on public.codex;
create policy "the codex is readable by signed-in players"
  on public.codex for select
  to authenticated
  using (true);

drop policy if exists "discoveries are written by their finder" on public.codex;

create or replace function public.codex_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total bigint; by_rarity jsonb;
begin
  select count(*) into total from codex;
  select coalesce(jsonb_object_agg(rarity, n), '{}'::jsonb) into by_rarity
    from (select rarity, count(*) as n from codex where rarity is not null group by rarity) t;
  return jsonb_build_object('total', total, 'byRarity', by_rarity);
end $$;

grant execute on function public.codex_counts() to authenticated;

create table if not exists public.wishlists (
  owner      uuid not null references auth.users on delete cascade,
  key        text not null,
  card       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner, key)
);

alter table public.wishlists enable row level security;

drop policy if exists "a wishlist is readable by its owner and their friends" on public.wishlists;
create policy "a wishlist is readable by its owner and their friends"
  on public.wishlists for select
  to authenticated
  using ((select auth.uid()) = owner or public.are_friends(owner, (select auth.uid())));

drop policy if exists "you wish as yourself" on public.wishlists;
create policy "you wish as yourself"
  on public.wishlists for insert
  to authenticated
  with check ((select auth.uid()) = owner);

drop policy if exists "you unwish as yourself" on public.wishlists;
create policy "you unwish as yourself"
  on public.wishlists for delete
  to authenticated
  using ((select auth.uid()) = owner);

update public.codex set rarity = 'prismatic' where rarity = 'artifact';
update public.profiles set best_rarity = 'prismatic' where best_rarity = 'artifact';
update public.wishlists
  set card = jsonb_set(card, '{rarityId}', '"prismatic"')
  where card->>'rarityId' = 'artifact';
update public.auctions
  set card = jsonb_set(card, '{rarityId}', '"prismatic"')
  where card->>'rarityId' = 'artifact';
update public.trades
  set offer = (
    select coalesce(jsonb_agg(
      case when c->>'rarityId' = 'artifact' then jsonb_set(c, '{rarityId}', '"prismatic"') else c end
    ), '[]'::jsonb) from jsonb_array_elements(offer) c),
      ask = (
    select coalesce(jsonb_agg(
      case when c->>'rarityId' = 'artifact' then jsonb_set(c, '{rarityId}', '"prismatic"') else c end
    ), '[]'::jsonb) from jsonb_array_elements(ask) c)
  where status = 'pending'
    and jsonb_typeof(offer) = 'array' and jsonb_typeof(ask) = 'array'
    and (offer::text like '%"artifact"%' or ask::text like '%"artifact"%');

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  game       text not null check (game in ('slots', 'roulette', 'wikdle', 'quest', 'duel', 'reveal', 'quiz')),
  points     integer not null check (points >= 0),
  detail     jsonb,
  at         timestamptz not null default now()
);
create index if not exists scores_user_at_idx on public.scores (user_id, at desc);
create index if not exists scores_at_idx on public.scores (at desc);

alter table public.scores enable row level security;
drop policy if exists "your own scores are yours to read" on public.scores;
create policy "your own scores are yours to read"
  on public.scores for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.leaderboard_daily   (user_id uuid primary key references auth.users on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create table if not exists public.leaderboard_weekly  (user_id uuid primary key references auth.users on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create table if not exists public.leaderboard_alltime (user_id uuid primary key references auth.users on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create index if not exists leaderboard_daily_score_idx   on public.leaderboard_daily   (score desc, updated_at asc);
create index if not exists leaderboard_weekly_score_idx  on public.leaderboard_weekly  (score desc, updated_at asc);
create index if not exists leaderboard_alltime_score_idx on public.leaderboard_alltime (score desc, updated_at asc);

alter table public.leaderboard_daily   enable row level security;
alter table public.leaderboard_weekly  enable row level security;
alter table public.leaderboard_alltime enable row level security;
drop policy if exists "the board is public" on public.leaderboard_daily;
create policy "the board is public" on public.leaderboard_daily for select to authenticated using (true);
drop policy if exists "the board is public" on public.leaderboard_weekly;
create policy "the board is public" on public.leaderboard_weekly for select to authenticated using (true);
drop policy if exists "the board is public" on public.leaderboard_alltime;
create policy "the board is public" on public.leaderboard_alltime for select to authenticated using (true);

create or replace function public.scores_into_windows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into leaderboard_daily (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_daily.score + excluded.score, updated_at = now();
  insert into leaderboard_weekly (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_weekly.score + excluded.score, updated_at = now();
  insert into leaderboard_alltime (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_alltime.score + excluded.score, updated_at = now();
  return new;
end $$;
drop trigger if exists scores_into_windows on public.scores;
create trigger scores_into_windows after insert on public.scores
  for each row execute function public.scores_into_windows();

alter table public.scores drop constraint if exists scores_game_check;
alter table public.scores add constraint scores_game_check
  check (game in ('slots', 'roulette', 'wikdle', 'quest', 'duel', 'reveal', 'quiz'));

create or replace function public.submit_score(p_game text, p_points integer, p_day text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_max integer;
  v_existing integer;
begin
  if auth.uid() is null then raise exception 'sign in'; end if;
  v_max := case p_game when 'wikdle' then 1400 when 'duel' then 3100 when 'reveal' then 1600 else null end;
  if v_max is null then raise exception 'this game is not scored by the client'; end if;
  if p_points < 0 or p_points > v_max then raise exception 'points out of range'; end if;
  select points into v_existing from scores
    where user_id = auth.uid() and game = p_game and detail->>'day' = p_day
    limit 1;
  if v_existing is not null then
    if p_game = 'wikdle' or p_points <= v_existing then return; end if;
    delete from scores where user_id = auth.uid() and game = p_game and detail->>'day' = p_day;
  end if;
  insert into scores (user_id, game, points, detail) values (auth.uid(), p_game, p_points, jsonb_build_object('day', p_day));
end $$;
grant execute on function public.submit_score(text, integer, text) to authenticated;

create or replace function public.leaderboard_page(p_window text, p_page integer default 0)
returns table (rank bigint, user_id uuid, username text, score bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_window = 'daily' then
    return query select row_number() over (order by d.score desc, d.updated_at asc) as rank, d.user_id, p.username, d.score
      from leaderboard_daily d join profiles p on p.id = d.user_id
      order by d.score desc, d.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  elsif p_window = 'weekly' then
    return query select row_number() over (order by w.score desc, w.updated_at asc), w.user_id, p.username, w.score
      from leaderboard_weekly w join profiles p on p.id = w.user_id
      order by w.score desc, w.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  else
    return query select row_number() over (order by a.score desc, a.updated_at asc), a.user_id, p.username, a.score
      from leaderboard_alltime a join profiles p on p.id = a.user_id
      order by a.score desc, a.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  end if;
end $$;
grant execute on function public.leaderboard_page(text, integer) to authenticated;

create or replace function public.my_rank(p_window text)
returns table (rank bigint, score bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); my_score bigint; my_at timestamptz;
begin
  if me is null then return; end if;
  if p_window = 'daily' then
    select d.score, d.updated_at into my_score, my_at from leaderboard_daily d where d.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_daily x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_daily);
  elsif p_window = 'weekly' then
    select w.score, w.updated_at into my_score, my_at from leaderboard_weekly w where w.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_weekly x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_weekly);
  else
    select a.score, a.updated_at into my_score, my_at from leaderboard_alltime a where a.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_alltime x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_alltime);
  end if;
end $$;
grant execute on function public.my_rank(text) to authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in ('wikster-daily-flush', 'wikster-weekly-flush');
select cron.schedule('wikster-daily-flush',  '0 0 * * *', $$truncate table public.leaderboard_daily$$);
select cron.schedule('wikster-weekly-flush', '0 0 * * 0', $$truncate table public.leaderboard_weekly$$);

create table if not exists public.quests (
  user_id    uuid not null references auth.users on delete cascade,
  day        text not null,
  quest_id   text not null,
  target     integer not null,
  progress   integer not null default 0,
  claimed    boolean not null default false,
  expires_at timestamptz not null,
  primary key (user_id, day, quest_id)
);
create index if not exists quests_user_day_idx on public.quests (user_id, day);
alter table public.quests enable row level security;
drop policy if exists "your quests are yours to read" on public.quests;
create policy "your quests are yours to read"
  on public.quests for select to authenticated using ((select auth.uid()) = user_id);

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.deliveries;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.trades;
exception when others then null; end $$;
alter table public.friendships replica identity full;

alter table public.scores drop constraint if exists scores_game_check;
alter table public.scores add constraint scores_game_check
  check (game in ('slots', 'roulette', 'wikdle', 'quest', 'duel', 'reveal', 'quiz'));

create or replace function public.scores_windows_delta()
returns trigger language plpgsql security definer set search_path = public as $$
declare d integer := new.points - old.points;
begin
  if d = 0 then return new; end if;
  update leaderboard_daily   set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  update leaderboard_weekly  set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  update leaderboard_alltime set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  return new;
end $$;
drop trigger if exists scores_windows_delta on public.scores;
create trigger scores_windows_delta after update of points on public.scores
  for each row execute function public.scores_windows_delta();

create or replace function public.submit_score(p_game text, p_points integer, p_day text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_max integer;
  v_existing integer;
begin
  if auth.uid() is null then raise exception 'sign in'; end if;
  v_max := case p_game
    when 'wikdle' then 1400 when 'duel' then 3100 when 'reveal' then 1600
    when 'quiz' then 1000 else null end;
  if v_max is null then raise exception 'this game is not scored by the client'; end if;
  if p_points < 0 or p_points > v_max then raise exception 'points out of range'; end if;
  select points into v_existing from scores
    where user_id = auth.uid() and game = p_game and detail->>'day' = p_day
    limit 1;
  if v_existing is not null then
    if p_game = 'wikdle' or p_points <= v_existing then return; end if;
    update scores set points = p_points, at = now()
      where user_id = auth.uid() and game = p_game and detail->>'day' = p_day;
    return;
  end if;
  insert into scores (user_id, game, points, detail) values (auth.uid(), p_game, p_points, jsonb_build_object('day', p_day));
end $$;
grant execute on function public.submit_score(text, integer, text) to authenticated;

alter table public.profiles add column if not exists showcase jsonb not null default '[]'::jsonb;

create table if not exists public.showcase_kudos (
  owner      uuid not null references auth.users on delete cascade,
  key        text not null,
  sender     uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, key, sender),
  check (owner <> sender)
);
alter table public.showcase_kudos enable row level security;
drop policy if exists "hearts are readable by signed-in players" on public.showcase_kudos;
create policy "hearts are readable by signed-in players"
  on public.showcase_kudos for select to authenticated using (true);
drop policy if exists "you leave hearts as yourself, on friends" on public.showcase_kudos;
create policy "you leave hearts as yourself, on friends"
  on public.showcase_kudos for insert to authenticated
  with check ((select auth.uid()) = sender and exists (
    select 1 from friendships f where f.status = 'accepted'
      and ((f.requester = (select auth.uid()) and f.addressee = owner) or (f.addressee = (select auth.uid()) and f.requester = owner))));
drop policy if exists "you take back your own hearts" on public.showcase_kudos;
create policy "you take back your own hearts"
  on public.showcase_kudos for delete to authenticated using ((select auth.uid()) = sender);

create table if not exists public.guilds (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 3 and 24),
  tag        text not null check (tag ~ '^[A-Z0-9]{2,5}$'),
  about      text not null default '' check (char_length(about) <= 140),
  owner      uuid not null references auth.users on delete cascade,
  members    integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists guilds_name_lower_idx on public.guilds (lower(name));
create unique index if not exists guilds_tag_idx on public.guilds (tag);

create table if not exists public.guild_members (
  user_id   uuid primary key references auth.users on delete cascade,
  guild_id  uuid not null references public.guilds on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists guild_members_guild_idx on public.guild_members (guild_id, joined_at);

create table if not exists public.guild_daily   (guild_id uuid primary key references public.guilds on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create table if not exists public.guild_weekly  (guild_id uuid primary key references public.guilds on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create table if not exists public.guild_alltime (guild_id uuid primary key references public.guilds on delete cascade, score bigint not null default 0, updated_at timestamptz not null default now());
create index if not exists guild_daily_score_idx   on public.guild_daily   (score desc, updated_at asc);
create index if not exists guild_weekly_score_idx  on public.guild_weekly  (score desc, updated_at asc);
create index if not exists guild_alltime_score_idx on public.guild_alltime (score desc, updated_at asc);

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_daily enable row level security;
alter table public.guild_weekly enable row level security;
alter table public.guild_alltime enable row level security;
drop policy if exists "guilds are public" on public.guilds;
create policy "guilds are public" on public.guilds for select to authenticated using (true);
drop policy if exists "rosters are public" on public.guild_members;
create policy "rosters are public" on public.guild_members for select to authenticated using (true);
drop policy if exists "the guild board is public" on public.guild_daily;
create policy "the guild board is public" on public.guild_daily for select to authenticated using (true);
drop policy if exists "the guild board is public" on public.guild_weekly;
create policy "the guild board is public" on public.guild_weekly for select to authenticated using (true);
drop policy if exists "the guild board is public" on public.guild_alltime;
create policy "the guild board is public" on public.guild_alltime for select to authenticated using (true);

create or replace function public.guild_windows_add(p_user uuid, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if p_delta = 0 then return; end if;
  select guild_id into g from guild_members where user_id = p_user;
  if g is null then return; end if;
  insert into guild_daily (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_daily.score + p_delta), updated_at = now();
  insert into guild_weekly (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_weekly.score + p_delta), updated_at = now();
  insert into guild_alltime (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_alltime.score + p_delta), updated_at = now();
end $$;

create or replace function public.scores_into_windows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into leaderboard_daily (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_daily.score + excluded.score, updated_at = now();
  insert into leaderboard_weekly (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_weekly.score + excluded.score, updated_at = now();
  insert into leaderboard_alltime (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_alltime.score + excluded.score, updated_at = now();
  perform guild_windows_add(new.user_id, new.points);
  return new;
end $$;

create or replace function public.scores_windows_delta()
returns trigger language plpgsql security definer set search_path = public as $$
declare d integer := new.points - old.points;
begin
  if d = 0 then return new; end if;
  update leaderboard_daily   set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  update leaderboard_weekly  set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  update leaderboard_alltime set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  perform guild_windows_add(new.user_id, d);
  return new;
end $$;

create or replace function public.create_guild(p_name text, p_tag text, p_about text default '')
returns public.guilds language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); row_out guilds;
begin
  if me is null then raise exception 'sign in'; end if;
  if exists (select 1 from guild_members where user_id = me) then raise exception 'ALREADY_IN_GUILD'; end if;
  if exists (select 1 from guilds where lower(name) = lower(trim(p_name))) then raise exception 'NAME_TAKEN'; end if;
  if exists (select 1 from guilds where tag = upper(trim(p_tag))) then raise exception 'TAG_TAKEN'; end if;
  insert into guilds (name, tag, about, owner, members)
    values (trim(p_name), upper(trim(p_tag)), coalesce(trim(p_about), ''), me, 1)
    returning * into row_out;
  insert into guild_members (user_id, guild_id) values (me, row_out.id);
  return row_out;
end $$;

create or replace function public.join_guild(p_guild uuid)
returns public.guilds language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); row_out guilds;
begin
  if me is null then raise exception 'sign in'; end if;
  if exists (select 1 from guild_members where user_id = me) then raise exception 'ALREADY_IN_GUILD'; end if;
  select * into row_out from guilds where id = p_guild for update;
  if row_out.id is null then raise exception 'NOT_FOUND'; end if;
  if row_out.members >= 50 then raise exception 'GUILD_FULL'; end if;
  insert into guild_members (user_id, guild_id) values (me, p_guild);
  update guilds set members = members + 1 where id = p_guild returning * into row_out;
  return row_out;
end $$;

create or replace function public.leave_guild()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; heir uuid; left_n integer;
begin
  if me is null then raise exception 'sign in'; end if;
  select guild_id into g from guild_members where user_id = me;
  if g is null then return; end if;
  delete from guild_members where user_id = me;
  select count(*) into left_n from guild_members where guild_id = g;
  if left_n = 0 then
    delete from guilds where id = g;
    return;
  end if;
  update guilds set members = left_n where id = g;
  if (select owner from guilds where id = g) = me then
    select user_id into heir from guild_members where guild_id = g order by joined_at asc limit 1;
    update guilds set owner = heir where id = g;
  end if;
end $$;

create or replace function public.my_guild()
returns public.guilds language sql stable security definer set search_path = public as $$
  select g.* from guilds g join guild_members m on m.guild_id = g.id where m.user_id = auth.uid();
$$;

create or replace function public.search_guilds(p_term text)
returns setof public.guilds language sql stable security definer set search_path = public as $$
  select * from guilds
    where p_term is null or p_term = '' or name ilike '%' || p_term || '%' or tag ilike '%' || p_term || '%'
    order by members desc, created_at asc limit 20;
$$;

create or replace function public.guild_roster(p_guild uuid)
returns table (user_id uuid, username text, level integer, joined_at timestamptz, score bigint)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.username, p.level, m.joined_at, coalesce(a.score, 0)
    from guild_members m join profiles p on p.id = m.user_id
    left join leaderboard_alltime a on a.user_id = m.user_id
    where m.guild_id = p_guild order by coalesce(a.score, 0) desc, m.joined_at asc;
$$;

create or replace function public.guild_board(p_window text, p_page integer default 0)
returns table (rank bigint, guild_id uuid, name text, tag text, members integer, score bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_window = 'daily' then
    return query select row_number() over (order by d.score desc, d.updated_at asc), g.id, g.name, g.tag, g.members, d.score
      from guild_daily d join guilds g on g.id = d.guild_id order by d.score desc, d.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  elsif p_window = 'weekly' then
    return query select row_number() over (order by w.score desc, w.updated_at asc), g.id, g.name, g.tag, g.members, w.score
      from guild_weekly w join guilds g on g.id = w.guild_id order by w.score desc, w.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  else
    return query select row_number() over (order by a.score desc, a.updated_at asc), g.id, g.name, g.tag, g.members, a.score
      from guild_alltime a join guilds g on g.id = a.guild_id order by a.score desc, a.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  end if;
end $$;

create or replace function public.my_guild_rank(p_window text)
returns table (rank bigint, score bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare g uuid; my_score bigint; my_at timestamptz;
begin
  select guild_id into g from guild_members where user_id = auth.uid();
  if g is null then return; end if;
  if p_window = 'daily' then
    select d.score, d.updated_at into my_score, my_at from guild_daily d where d.guild_id = g;
    if my_score is null then return query select null::bigint, 0::bigint, (select count(*) from guild_daily); return; end if;
    return query select (select count(*) + 1 from guild_daily x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from guild_daily);
  elsif p_window = 'weekly' then
    select w.score, w.updated_at into my_score, my_at from guild_weekly w where w.guild_id = g;
    if my_score is null then return query select null::bigint, 0::bigint, (select count(*) from guild_weekly); return; end if;
    return query select (select count(*) + 1 from guild_weekly x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from guild_weekly);
  else
    select a.score, a.updated_at into my_score, my_at from guild_alltime a where a.guild_id = g;
    if my_score is null then return query select null::bigint, 0::bigint, (select count(*) from guild_alltime); return; end if;
    return query select (select count(*) + 1 from guild_alltime x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from guild_alltime);
  end if;
end $$;

grant execute on function public.create_guild(text, text, text) to authenticated;
grant execute on function public.join_guild(uuid) to authenticated;
grant execute on function public.leave_guild() to authenticated;
grant execute on function public.my_guild() to authenticated;
grant execute on function public.search_guilds(text) to authenticated;
grant execute on function public.guild_roster(uuid) to authenticated;
grant execute on function public.guild_board(text, integer) to authenticated;
grant execute on function public.my_guild_rank(text) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('wikster-daily-flush', 'wikster-weekly-flush');
select cron.schedule('wikster-daily-flush',  '0 0 * * *', $$truncate table public.leaderboard_daily; truncate table public.guild_daily$$);
select cron.schedule('wikster-weekly-flush', '0 0 * * 0', $$truncate table public.leaderboard_weekly; truncate table public.guild_weekly$$);


create table if not exists public.guild_invites (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references public.guilds on delete cascade,
  inviter    uuid not null references auth.users on delete cascade,
  invitee    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  unique (guild_id, invitee),
  check (inviter <> invitee)
);
create index if not exists guild_invites_invitee_idx on public.guild_invites (invitee, created_at desc);

alter table public.guild_invites enable row level security;
drop policy if exists "you see invitations to you or from your guild" on public.guild_invites;
create policy "you see invitations to you or from your guild"
  on public.guild_invites for select to authenticated
  using ((select auth.uid()) = invitee or (select auth.uid()) = inviter
    or exists (select 1 from guild_members m where m.user_id = (select auth.uid()) and m.guild_id = guild_invites.guild_id));

create or replace function public.invite_to_guild(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g guilds;
begin
  if me is null then raise exception 'sign in'; end if;
  if p_user is null or p_user = me then raise exception 'NOT_FOUND'; end if;
  select gu.* into g from guilds gu join guild_members m on m.guild_id = gu.id where m.user_id = me;
  if g.id is null then raise exception 'NOT_IN_GUILD'; end if;
  if g.members >= 50 then raise exception 'GUILD_FULL'; end if;
  if not public.are_friends(me, p_user) then raise exception 'NOT_FRIEND'; end if;
  if exists (select 1 from guild_members where user_id = p_user) then raise exception 'ALREADY_MEMBER'; end if;
  insert into guild_invites (guild_id, inviter, invitee) values (g.id, me, p_user)
    on conflict (guild_id, invitee) do nothing;
end $$;

create or replace function public.my_guild_invites()
returns table (id uuid, guild_id uuid, name text, tag text, about text, members integer, inviter uuid, inviter_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, g.id, g.name, g.tag, g.about, g.members, i.inviter, coalesce(p.username, '?'), i.created_at
    from guild_invites i
    join guilds g on g.id = i.guild_id
    left join profiles p on p.id = i.inviter
    where i.invitee = auth.uid()
    order by i.created_at desc
    limit 20;
$$;

create or replace function public.accept_guild_invite(p_invite uuid)
returns public.guilds language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; row_out guilds;
begin
  if me is null then raise exception 'sign in'; end if;
  if exists (select 1 from guild_members where user_id = me) then raise exception 'ALREADY_IN_GUILD'; end if;
  select guild_id into g from guild_invites where id = p_invite and invitee = me;
  if g is null then raise exception 'INVITE_GONE'; end if;
  select * into row_out from guilds where id = g for update;
  if row_out.id is null then raise exception 'NOT_FOUND'; end if;
  if row_out.members >= 50 then raise exception 'GUILD_FULL'; end if;
  insert into guild_members (user_id, guild_id) values (me, g);
  update guilds set members = members + 1 where id = g returning * into row_out;
  delete from guild_invites where invitee = me;
  return row_out;
end $$;

create or replace function public.decline_guild_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in'; end if;
  delete from guild_invites where id = p_invite and invitee = me;
end $$;

create or replace function public.delete_guild()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid;
begin
  if me is null then raise exception 'sign in'; end if;
  select guild_id into g from guild_members where user_id = me;
  if g is null then raise exception 'NOT_FOUND'; end if;
  if (select owner from guilds where id = g) <> me then raise exception 'NOT_OWNER'; end if;
  delete from guilds where id = g;
end $$;

grant execute on function public.invite_to_guild(uuid) to authenticated;
grant execute on function public.my_guild_invites() to authenticated;
grant execute on function public.accept_guild_invite(uuid) to authenticated;
grant execute on function public.decline_guild_invite(uuid) to authenticated;
grant execute on function public.delete_guild() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.guild_invites;
exception when others then null; end $$;

create or replace function public.week_key(p_at timestamptz default now())
returns text language sql immutable as $$
  select (((extract(epoch from p_at)::bigint / 86400) + 4) / 7)::text;
$$;

create or replace function public.my_guild_id()
returns uuid language sql stable security definer set search_path = public as $$
  select guild_id from guild_members where user_id = auth.uid();
$$;

create table if not exists public.guild_messages (
  id          uuid primary key default gen_random_uuid(),
  guild_id    uuid not null references public.guilds on delete cascade,
  sender      uuid not null references auth.users on delete cascade,
  sender_name text not null default '',
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists guild_messages_guild_idx on public.guild_messages (guild_id, created_at desc);
alter table public.guild_messages enable row level security;
drop policy if exists "members read their guild's room" on public.guild_messages;
create policy "members read their guild's room"
  on public.guild_messages for select to authenticated
  using (exists (select 1 from guild_members m where m.user_id = (select auth.uid()) and m.guild_id = guild_messages.guild_id));

create or replace function public.guild_say(p_body text)
returns public.guild_messages language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; row_out guild_messages;
begin
  if me is null then raise exception 'sign in'; end if;
  g := my_guild_id();
  if g is null then raise exception 'NOT_IN_GUILD'; end if;
  insert into guild_messages (guild_id, sender, sender_name, body)
    values (g, me, coalesce((select username from profiles where id = me), ''), left(trim(p_body), 500))
    returning * into row_out;
  return row_out;
end $$;

create or replace function public.guild_chat()
returns setof public.guild_messages language sql stable security definer set search_path = public as $$
  select * from (
    select m.* from guild_messages m where m.guild_id = my_guild_id() order by m.created_at desc limit 60
  ) recent order by created_at asc;
$$;

create table if not exists public.guild_goals (
  guild_id   uuid not null references public.guilds on delete cascade,
  week       text not null,
  kind       text not null check (kind in ('open', 'points', 'new', 'wikdle')),
  target     integer not null,
  progress   integer not null default 0,
  members    integer not null default 1,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  primary key (guild_id, week)
);
create table if not exists public.guild_goal_claims (
  guild_id   uuid not null,
  week       text not null,
  user_id    uuid not null references auth.users on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (guild_id, week, user_id),
  foreign key (guild_id, week) references public.guild_goals on delete cascade
);
alter table public.guild_goals enable row level security;
alter table public.guild_goal_claims enable row level security;
drop policy if exists "members read their guild's goal" on public.guild_goals;
create policy "members read their guild's goal"
  on public.guild_goals for select to authenticated
  using (exists (select 1 from guild_members m where m.user_id = (select auth.uid()) and m.guild_id = guild_goals.guild_id));
drop policy if exists "you read your own goal claims" on public.guild_goal_claims;
create policy "you read your own goal claims"
  on public.guild_goal_claims for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.guild_goal_base(p_kind text)
returns integer language sql immutable as $$
  select case p_kind when 'open' then 12 when 'points' then 1500 when 'new' then 15 when 'wikdle' then 3 else 10 end;
$$;

create or replace function public.guild_goal_ensure(p_guild uuid)
returns public.guild_goals language plpgsql security definer set search_path = public as $$
declare wk text := week_key(); row_out guild_goals; n integer; k text; kinds text[] := array['open', 'points', 'new', 'wikdle'];
begin
  select greatest(1, members) into n from guilds where id = p_guild;
  select * into row_out from guild_goals where guild_id = p_guild and week = wk;
  if row_out.guild_id is not null then
    if n > row_out.members and row_out.done_at is null then
      update guild_goals set members = n, target = greatest(progress, round(guild_goal_base(kind) * (1 + 0.5 * (n - 1)))::integer)
        where guild_id = p_guild and week = wk returning * into row_out;
    end if;
    return row_out;
  end if;
  k := kinds[1 + (abs(hashtext(p_guild::text || ':' || wk)) % 4)];
  insert into guild_goals (guild_id, week, kind, target, members)
    values (p_guild, wk, k, round(guild_goal_base(k) * (1 + 0.5 * (n - 1)))::integer, n)
    on conflict (guild_id, week) do nothing;
  select * into row_out from guild_goals where guild_id = p_guild and week = wk;
  return row_out;
end $$;

create or replace function public.guild_goal_bump(p_guild uuid, p_kind text, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
declare goal guild_goals;
begin
  if p_guild is null or p_amount is null or p_amount <= 0 then return; end if;
  goal := guild_goal_ensure(p_guild);
  if goal.kind <> p_kind or goal.done_at is not null then return; end if;
  update guild_goals set progress = least(target, progress + p_amount),
    done_at = case when progress + p_amount >= target then now() else null end
    where guild_id = p_guild and week = goal.week;
end $$;

create or replace function public.guild_goal_add(p_kind text, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in'; end if;
  if p_kind not in ('open', 'new', 'wikdle') then raise exception 'not a client kind'; end if;
  perform guild_goal_bump(my_guild_id(), p_kind, least(100, greatest(0, p_amount)));
end $$;

create or replace function public.guild_goal()
returns table (week text, kind text, target integer, progress integer, members integer, done_at timestamptz, claimed boolean, reward integer)
language plpgsql security definer set search_path = public as $$
declare g uuid := my_guild_id(); goal guild_goals;
begin
  if g is null then return; end if;
  goal := guild_goal_ensure(g);
  if goal.guild_id is null then return; end if;
  return query select goal.week, goal.kind, goal.target, goal.progress, goal.members, goal.done_at,
    exists (select 1 from guild_goal_claims c where c.guild_id = g and c.week = goal.week and c.user_id = auth.uid()),
    900;
end $$;

create or replace function public.guild_goal_claim()
returns integer language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; goal guild_goals;
begin
  if me is null then raise exception 'sign in'; end if;
  g := my_guild_id();
  if g is null then raise exception 'NOT_IN_GUILD'; end if;
  select * into goal from guild_goals where guild_id = g and week = week_key();
  if goal.guild_id is null or goal.done_at is null then raise exception 'NOT_DONE'; end if;
  if exists (select 1 from guild_goal_claims where guild_id = g and week = goal.week and user_id = me) then raise exception 'CLAIMED'; end if;
  insert into guild_goal_claims (guild_id, week, user_id) values (g, goal.week, me);
  return 900;
end $$;

create or replace function public.guild_windows_add(p_user uuid, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if p_delta = 0 then return; end if;
  select guild_id into g from guild_members where user_id = p_user;
  if g is null then return; end if;
  insert into guild_daily (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_daily.score + p_delta), updated_at = now();
  insert into guild_weekly (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_weekly.score + p_delta), updated_at = now();
  insert into guild_alltime (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_alltime.score + p_delta), updated_at = now();
  if p_delta > 0 then perform guild_goal_bump(g, 'points', p_delta); end if;
end $$;

create table if not exists public.guild_bank (
  id         uuid primary key default gen_random_uuid(),
  guild_id   uuid not null references public.guilds on delete cascade,
  donor      uuid not null references auth.users on delete cascade,
  donor_name text not null default '',
  card       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists guild_bank_guild_idx on public.guild_bank (guild_id, created_at desc);
create table if not exists public.guild_bank_takes (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  n       integer not null default 0,
  primary key (user_id, day)
);
alter table public.guild_bank enable row level security;
alter table public.guild_bank_takes enable row level security;
drop policy if exists "members see their guild's bank" on public.guild_bank;
create policy "members see their guild's bank"
  on public.guild_bank for select to authenticated
  using (exists (select 1 from guild_members m where m.user_id = (select auth.uid()) and m.guild_id = guild_bank.guild_id));
drop policy if exists "you see your own takes" on public.guild_bank_takes;
create policy "you see your own takes"
  on public.guild_bank_takes for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.guild_bank()
returns setof public.guild_bank language sql stable security definer set search_path = public as $$
  select * from guild_bank where guild_id = my_guild_id() order by created_at desc limit 200;
$$;

create or replace function public.guild_bank_donate(p_card jsonb)
returns public.guild_bank language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; row_out guild_bank;
begin
  if me is null then raise exception 'sign in'; end if;
  g := my_guild_id();
  if g is null then raise exception 'NOT_IN_GUILD'; end if;
  if p_card is null or p_card->>'key' is null or p_card->>'title' is null then raise exception 'BAD_CARD'; end if;
  if (select count(*) from guild_bank where guild_id = g) >= 200 then raise exception 'BANK_FULL'; end if;
  insert into guild_bank (guild_id, donor, donor_name, card)
    values (g, me, coalesce((select username from profiles where id = me), ''), p_card)
    returning * into row_out;
  return row_out;
end $$;

create or replace function public.guild_bank_take(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; taken guild_bank; today date := (now() at time zone 'utc')::date; n integer;
begin
  if me is null then raise exception 'sign in'; end if;
  g := my_guild_id();
  if g is null then raise exception 'NOT_IN_GUILD'; end if;
  select coalesce(t.n, 0) into n from guild_bank_takes t where t.user_id = me and t.day = today;
  if coalesce(n, 0) >= 3 then raise exception 'TAKE_LIMIT'; end if;
  delete from guild_bank where id = p_id and guild_id = g returning * into taken;
  if taken.id is null then raise exception 'GONE'; end if;
  insert into guild_bank_takes (user_id, day, n) values (me, today, 1)
    on conflict (user_id, day) do update set n = guild_bank_takes.n + 1;
  return taken.card;
end $$;

create or replace function public.guild_bank_takes_left()
returns integer language sql stable security definer set search_path = public as $$
  select 3 - coalesce((select n from guild_bank_takes where user_id = auth.uid() and day = (now() at time zone 'utc')::date), 0);
$$;

create table if not exists public.guild_matches (
  week       text not null,
  guild_a    uuid not null references public.guilds on delete cascade,
  guild_b    uuid not null references public.guilds on delete cascade,
  score_a    bigint,
  score_b    bigint,
  created_at timestamptz not null default now(),
  primary key (week, guild_a),
  unique (week, guild_b)
);
create table if not exists public.guild_match_claims (
  week       text not null,
  user_id    uuid not null references auth.users on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (week, user_id)
);
alter table public.guild_matches enable row level security;
alter table public.guild_match_claims enable row level security;
drop policy if exists "matches are public" on public.guild_matches;
create policy "matches are public" on public.guild_matches for select to authenticated using (true);
drop policy if exists "you see your own match claims" on public.guild_match_claims;
create policy "you see your own match claims"
  on public.guild_match_claims for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.guild_match()
returns table (week text, opponent_id uuid, opponent_name text, opponent_tag text, opponent_members integer,
               my_score bigint, their_score bigint,
               last_week text, last_opponent_name text, last_my_score bigint, last_their_score bigint, last_won boolean, last_claimed boolean)
language plpgsql security definer set search_path = public as $$
declare g uuid := my_guild_id(); wk text := week_key(); prev text := week_key(now() - interval '7 days');
        other uuid; m guild_matches; lm guild_matches; last_other uuid;
begin
  if g is null then return; end if;
  select * into m from guild_matches gm where gm.week = wk and (gm.guild_a = g or gm.guild_b = g);
  if m.week is null then
    select x.id into other from guilds x
      left join guild_weekly w on w.guild_id = x.id
      where x.id <> g
        and not exists (select 1 from guild_matches gm where gm.week = wk and (gm.guild_a = x.id or gm.guild_b = x.id))
      order by abs(coalesce(w.score, 0) - coalesce((select score from guild_weekly where guild_id = g), 0)) asc, x.members desc, x.created_at asc
      limit 1;
    if other is not null then
      begin
        insert into guild_matches (week, guild_a, guild_b) values (wk, g, other);
      exception when unique_violation then null; end;
      select * into m from guild_matches gm where gm.week = wk and (gm.guild_a = g or gm.guild_b = g);
    end if;
  end if;
  other := case when m.guild_a = g then m.guild_b when m.guild_b = g then m.guild_a else null end;
  select * into lm from guild_matches gm where gm.week = prev and (gm.guild_a = g or gm.guild_b = g);
  last_other := case when lm.guild_a = g then lm.guild_b when lm.guild_b = g then lm.guild_a else null end;
  return query select wk, other,
    (select name from guilds where id = other), (select tag from guilds where id = other), (select members from guilds where id = other),
    coalesce((select score from guild_weekly where guild_id = g), 0)::bigint,
    coalesce((select score from guild_weekly where guild_id = other), 0)::bigint,
    lm.week, (select name from guilds where id = last_other),
    case when lm.guild_a = g then lm.score_a else lm.score_b end,
    case when lm.guild_a = g then lm.score_b else lm.score_a end,
    case when lm.week is null or lm.score_a is null then null
         else (case when lm.guild_a = g then lm.score_a > lm.score_b else lm.score_b > lm.score_a end) end,
    exists (select 1 from guild_match_claims c where c.week = prev and c.user_id = auth.uid());
end $$;

create or replace function public.guild_match_claim()
returns integer language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; prev text := week_key(now() - interval '7 days'); lm guild_matches; won boolean;
begin
  if me is null then raise exception 'sign in'; end if;
  g := my_guild_id();
  if g is null then raise exception 'NOT_IN_GUILD'; end if;
  select * into lm from guild_matches where week = prev and (guild_a = g or guild_b = g);
  if lm.week is null or lm.score_a is null then raise exception 'NOT_DONE'; end if;
  won := case when lm.guild_a = g then lm.score_a > lm.score_b else lm.score_b > lm.score_a end;
  if not won then raise exception 'NOT_DONE'; end if;
  if exists (select 1 from guild_match_claims where week = prev and user_id = me) then raise exception 'CLAIMED'; end if;
  insert into guild_match_claims (week, user_id) values (prev, me);
  return 750;
end $$;

create or replace function public.week_turn()
returns void language plpgsql security definer set search_path = public as $$
declare ending text := week_key(now() - interval '1 hour');
begin
  update guild_matches gm set
    score_a = coalesce((select score from guild_weekly where guild_id = gm.guild_a), 0),
    score_b = coalesce((select score from guild_weekly where guild_id = gm.guild_b), 0)
    where gm.week = ending and gm.score_a is null;
  truncate table public.leaderboard_weekly;
  truncate table public.guild_weekly;
end $$;

grant execute on function public.week_key(timestamptz) to authenticated;
grant execute on function public.my_guild_id() to authenticated;
grant execute on function public.guild_say(text) to authenticated;
grant execute on function public.guild_chat() to authenticated;
grant execute on function public.guild_goal() to authenticated;
grant execute on function public.guild_goal_add(text, integer) to authenticated;
grant execute on function public.guild_goal_claim() to authenticated;
grant execute on function public.guild_bank() to authenticated;
grant execute on function public.guild_bank_donate(jsonb) to authenticated;
grant execute on function public.guild_bank_take(uuid) to authenticated;
grant execute on function public.guild_bank_takes_left() to authenticated;
grant execute on function public.guild_match() to authenticated;
grant execute on function public.guild_match_claim() to authenticated;
revoke all on function public.guild_goal_ensure(uuid) from public;
revoke all on function public.guild_goal_bump(uuid, text, integer) from public;
revoke all on function public.week_turn() from public;

select cron.unschedule(jobid) from cron.job where jobname = 'wikster-weekly-flush';
select cron.schedule('wikster-weekly-flush', '0 0 * * 0', $$select public.week_turn()$$);

do $$ begin
  alter publication supabase_realtime add table public.guild_messages;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.guild_bank;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.guild_goals;
exception when others then null; end $$;

create table if not exists public.seasons (
  id         text primary key,
  ord        integer not null,
  from_month integer not null, from_day integer not null,
  to_month   integer not null, to_day   integer not null
);
insert into public.seasons (id, ord, from_month, from_day, to_month, to_day) values
  ('frost', 1, 1, 1, 2, 1), ('hearts', 2, 2, 1, 3, 1), ('thaw', 3, 3, 1, 4, 1), ('fools', 4, 4, 1, 5, 1),
  ('bloom', 5, 5, 1, 6, 1), ('solstice', 6, 6, 1, 7, 14), ('voyage', 7, 7, 14, 9, 1), ('harvest', 8, 9, 1, 10, 1),
  ('hallows', 9, 10, 1, 11, 3), ('ember', 10, 11, 3, 12, 1), ('yule', 11, 12, 1, 1, 1)
on conflict (id) do update set ord = excluded.ord, from_month = excluded.from_month, from_day = excluded.from_day,
  to_month = excluded.to_month, to_day = excluded.to_day;
alter table public.seasons enable row level security;
drop policy if exists "the calendar is public" on public.seasons;
create policy "the calendar is public" on public.seasons for select to authenticated using (true);

create or replace function public.current_season_key()
returns text language plpgsql stable set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; y integer := extract(year from (now() at time zone 'utc'))::integer; r record;
begin
  for r in select * from seasons order by ord loop
    if r.to_month < r.from_month or (r.to_month = r.from_month and r.to_day <= r.from_day) then
      if d >= make_date(y, r.from_month, r.from_day) then return y || '-' || r.id; end if;
      if d < make_date(y, r.to_month, r.to_day) then return (y - 1) || '-' || r.id; end if;
    elsif d >= make_date(y, r.from_month, r.from_day) and d < make_date(y, r.to_month, r.to_day) then
      return y || '-' || r.id;
    end if;
  end loop;
  return y || '-none';
end $$;

create table if not exists public.leaderboard_season (
  season     text not null,
  user_id    uuid not null references auth.users on delete cascade,
  score      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season, user_id)
);
create index if not exists leaderboard_season_idx on public.leaderboard_season (season, score desc, updated_at asc);
create table if not exists public.guild_season (
  season     text not null,
  guild_id   uuid not null references public.guilds on delete cascade,
  score      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season, guild_id)
);
create index if not exists guild_season_idx on public.guild_season (season, score desc, updated_at asc);
alter table public.leaderboard_season enable row level security;
alter table public.guild_season enable row level security;
drop policy if exists "the season board is public" on public.leaderboard_season;
create policy "the season board is public" on public.leaderboard_season for select to authenticated using (true);
drop policy if exists "the guild season board is public" on public.guild_season;
create policy "the guild season board is public" on public.guild_season for select to authenticated using (true);

create or replace function public.scores_into_windows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into leaderboard_daily (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_daily.score + excluded.score, updated_at = now();
  insert into leaderboard_weekly (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_weekly.score + excluded.score, updated_at = now();
  insert into leaderboard_alltime (user_id, score) values (new.user_id, new.points)
    on conflict (user_id) do update set score = leaderboard_alltime.score + excluded.score, updated_at = now();
  insert into leaderboard_season (season, user_id, score) values (current_season_key(), new.user_id, new.points)
    on conflict (season, user_id) do update set score = leaderboard_season.score + excluded.score, updated_at = now();
  perform guild_windows_add(new.user_id, new.points);
  return new;
end $$;

create or replace function public.scores_windows_delta()
returns trigger language plpgsql security definer set search_path = public as $$
declare d integer := new.points - old.points;
begin
  if d = 0 then return new; end if;
  update leaderboard_daily   set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  update leaderboard_weekly  set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  update leaderboard_alltime set score = greatest(0, score + d), updated_at = now() where user_id = new.user_id;
  insert into leaderboard_season (season, user_id, score) values (current_season_key(), new.user_id, greatest(0, d))
    on conflict (season, user_id) do update set score = greatest(0, leaderboard_season.score + d), updated_at = now();
  perform guild_windows_add(new.user_id, d);
  return new;
end $$;

create or replace function public.guild_windows_add(p_user uuid, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if p_delta = 0 then return; end if;
  select guild_id into g from guild_members where user_id = p_user;
  if g is null then return; end if;
  insert into guild_daily (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_daily.score + p_delta), updated_at = now();
  insert into guild_weekly (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_weekly.score + p_delta), updated_at = now();
  insert into guild_alltime (guild_id, score) values (g, greatest(0, p_delta))
    on conflict (guild_id) do update set score = greatest(0, guild_alltime.score + p_delta), updated_at = now();
  insert into guild_season (season, guild_id, score) values (current_season_key(), g, greatest(0, p_delta))
    on conflict (season, guild_id) do update set score = greatest(0, guild_season.score + p_delta), updated_at = now();
  if p_delta > 0 then perform guild_goal_bump(g, 'points', p_delta); end if;
end $$;

create or replace function public.leaderboard_page(p_window text, p_page integer default 0)
returns table (rank bigint, user_id uuid, username text, score bigint)
language plpgsql stable security definer set search_path = public as $$
declare sk text := current_season_key();
begin
  if p_window = 'daily' then
    return query select row_number() over (order by d.score desc, d.updated_at asc) as rank, d.user_id, p.username, d.score
      from leaderboard_daily d join profiles p on p.id = d.user_id
      order by d.score desc, d.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  elsif p_window = 'weekly' then
    return query select row_number() over (order by w.score desc, w.updated_at asc), w.user_id, p.username, w.score
      from leaderboard_weekly w join profiles p on p.id = w.user_id
      order by w.score desc, w.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  elsif p_window = 'season' then
    return query select row_number() over (order by s.score desc, s.updated_at asc), s.user_id, p.username, s.score
      from leaderboard_season s join profiles p on p.id = s.user_id where s.season = sk
      order by s.score desc, s.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  else
    return query select row_number() over (order by a.score desc, a.updated_at asc), a.user_id, p.username, a.score
      from leaderboard_alltime a join profiles p on p.id = a.user_id
      order by a.score desc, a.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  end if;
end $$;

create or replace function public.my_rank(p_window text)
returns table (rank bigint, score bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); my_score bigint; my_at timestamptz; sk text := current_season_key();
begin
  if me is null then return; end if;
  if p_window = 'daily' then
    select d.score, d.updated_at into my_score, my_at from leaderboard_daily d where d.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_daily x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_daily);
  elsif p_window = 'weekly' then
    select w.score, w.updated_at into my_score, my_at from leaderboard_weekly w where w.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_weekly x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_weekly);
  elsif p_window = 'season' then
    select s.score, s.updated_at into my_score, my_at from leaderboard_season s where s.user_id = me and s.season = sk;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_season x where x.season = sk and (x.score > my_score or (x.score = my_score and x.updated_at < my_at))), my_score, (select count(*) from leaderboard_season x where x.season = sk);
  else
    select a.score, a.updated_at into my_score, my_at from leaderboard_alltime a where a.user_id = me;
    if my_score is null then return; end if;
    return query select (select count(*) + 1 from leaderboard_alltime x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from leaderboard_alltime);
  end if;
end $$;

create or replace function public.guild_board(p_window text, p_page integer default 0)
returns table (rank bigint, guild_id uuid, name text, tag text, members integer, score bigint)
language plpgsql stable security definer set search_path = public as $$
declare sk text := current_season_key();
begin
  if p_window = 'daily' then
    return query select row_number() over (order by d.score desc, d.updated_at asc), g.id, g.name, g.tag, g.members, d.score
      from guild_daily d join guilds g on g.id = d.guild_id order by d.score desc, d.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  elsif p_window = 'weekly' then
    return query select row_number() over (order by w.score desc, w.updated_at asc), g.id, g.name, g.tag, g.members, w.score
      from guild_weekly w join guilds g on g.id = w.guild_id order by w.score desc, w.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  elsif p_window = 'season' then
    return query select row_number() over (order by s.score desc, s.updated_at asc), g.id, g.name, g.tag, g.members, s.score
      from guild_season s join guilds g on g.id = s.guild_id where s.season = sk order by s.score desc, s.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  else
    return query select row_number() over (order by a.score desc, a.updated_at asc), g.id, g.name, g.tag, g.members, a.score
      from guild_alltime a join guilds g on g.id = a.guild_id order by a.score desc, a.updated_at asc limit 20 offset greatest(0, p_page) * 20;
  end if;
end $$;

create or replace function public.my_guild_rank(p_window text)
returns table (rank bigint, score bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare g uuid; my_score bigint; my_at timestamptz; sk text := current_season_key();
begin
  select guild_id into g from guild_members where user_id = auth.uid();
  if g is null then return; end if;
  if p_window = 'daily' then
    select d.score, d.updated_at into my_score, my_at from guild_daily d where d.guild_id = g;
    if my_score is null then return query select null::bigint, 0::bigint, (select count(*) from guild_daily); return; end if;
    return query select (select count(*) + 1 from guild_daily x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from guild_daily);
  elsif p_window = 'weekly' then
    select w.score, w.updated_at into my_score, my_at from guild_weekly w where w.guild_id = g;
    if my_score is null then return query select null::bigint, 0::bigint, (select count(*) from guild_weekly); return; end if;
    return query select (select count(*) + 1 from guild_weekly x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from guild_weekly);
  elsif p_window = 'season' then
    select s.score, s.updated_at into my_score, my_at from guild_season s where s.guild_id = g and s.season = sk;
    if my_score is null then return query select null::bigint, 0::bigint, (select count(*) from guild_season x where x.season = sk); return; end if;
    return query select (select count(*) + 1 from guild_season x where x.season = sk and (x.score > my_score or (x.score = my_score and x.updated_at < my_at))), my_score, (select count(*) from guild_season x where x.season = sk);
  else
    select a.score, a.updated_at into my_score, my_at from guild_alltime a where a.guild_id = g;
    if my_score is null then return query select null::bigint, 0::bigint, (select count(*) from guild_alltime); return; end if;
    return query select (select count(*) + 1 from guild_alltime x where x.score > my_score or (x.score = my_score and x.updated_at < my_at)), my_score, (select count(*) from guild_alltime);
  end if;
end $$;

grant execute on function public.current_season_key() to authenticated;


alter table public.profiles add column if not exists badges jsonb not null default '[]'::jsonb;

create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('clash', 'sort')),
  challenger  uuid not null references auth.users on delete cascade,
  opponent    uuid not null references auth.users on delete cascade,
  status      text not null default 'open' check (status in ('open', 'done', 'declined')),
  payload     jsonb not null default '{}'::jsonb,
  reply       jsonb,
  result      jsonb,
  claimed     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (challenger <> opponent)
);
create index if not exists challenges_opponent_idx on public.challenges (opponent, updated_at desc);
create index if not exists challenges_challenger_idx on public.challenges (challenger, updated_at desc);

alter table public.challenges enable row level security;
drop policy if exists "the two players see their challenge" on public.challenges;
create policy "the two players see their challenge"
  on public.challenges for select to authenticated
  using ((select auth.uid()) = challenger or (select auth.uid()) = opponent);

create or replace function public.challenge_send(p_user uuid, p_kind text, p_payload jsonb)
returns public.challenges language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); row_out challenges;
begin
  if me is null then raise exception 'sign in'; end if;
  if p_user is null or p_user = me then raise exception 'NOT_FOUND'; end if;
  if p_kind not in ('clash', 'sort') then raise exception 'BAD_KIND'; end if;
  if not public.are_friends(me, p_user) then raise exception 'NOT_FRIEND'; end if;
  if (select count(*) from challenges where challenger = me and opponent = p_user and status = 'open') >= 5 then raise exception 'TOO_MANY'; end if;
  if jsonb_typeof(p_payload->'cards') <> 'array' then raise exception 'BAD_HAND'; end if;
  insert into challenges (kind, challenger, opponent, payload) values (p_kind, me, p_user, p_payload) returning * into row_out;
  return row_out;
end $$;

create or replace function public.my_challenges()
returns table (id uuid, kind text, challenger uuid, opponent uuid, challenger_name text, opponent_name text,
  status text, payload jsonb, reply jsonb, result jsonb, claimed jsonb, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.challenger, c.opponent, coalesce(pc.username, '?'), coalesce(po.username, '?'),
         c.status, c.payload, c.reply, c.result, c.claimed, c.created_at, c.updated_at
    from challenges c
    left join profiles pc on pc.id = c.challenger
    left join profiles po on po.id = c.opponent
    where (c.challenger = auth.uid() or c.opponent = auth.uid())
      and (c.status = 'open' or c.updated_at > now() - interval '14 days')
    order by c.updated_at desc
    limit 40;
$$;

create or replace function public.challenge_decline(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in'; end if;
  update challenges set status = 'declined', updated_at = now()
    where id = p_id and status = 'open' and (opponent = me or challenger = me);
  if not found then raise exception 'GONE'; end if;
end $$;

create or replace function public.challenge_hand(p_cards jsonb)
returns numeric[] language sql immutable as $$
  select coalesce(array_agg(v order by v desc), '{}'::numeric[])
    from (select coalesce((c->>'views')::numeric, 0) as v from jsonb_array_elements(p_cards) c) h;
$$;

create or replace function public.challenge_sort_score(p_cards jsonb, p_order jsonb)
returns integer language sql immutable as $$
  with truth as (
    select c->>'key' as key, row_number() over (order by coalesce((c->>'views')::numeric, 0) desc) as pos
      from jsonb_array_elements(p_cards) c),
  given as (
    select value #>> '{}' as key, ordinality as pos from jsonb_array_elements(coalesce(p_order, '[]'::jsonb)) with ordinality)
  select count(*)::integer from truth t join given g on g.key = t.key and g.pos = t.pos;
$$;

create or replace function public.challenge_answer(p_id uuid, p_reply jsonb)
returns public.challenges language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges; a numeric[]; b numeric[]; sc integer := 0; so integer := 0; w text; i integer;
  cm numeric; om numeric; res jsonb;
begin
  if me is null then raise exception 'sign in'; end if;
  select * into c from challenges where id = p_id and opponent = me for update;
  if c.id is null then raise exception 'GONE'; end if;
  if c.status <> 'open' then raise exception 'SETTLED'; end if;
  if c.kind = 'clash' then
    if jsonb_typeof(p_reply->'cards') <> 'array' or jsonb_array_length(p_reply->'cards') < 1 then raise exception 'BAD_HAND'; end if;
    a := public.challenge_hand(c.payload->'cards');
    b := public.challenge_hand(p_reply->'cards');
    for i in 1..least(array_length(a, 1), 5) loop
      if i > coalesce(array_length(b, 1), 0) then sc := sc + 1;
      elsif a[i] > b[i] then sc := sc + 1;
      elsif b[i] > a[i] then so := so + 1;
      end if;
    end loop;
    w := case when sc > so then 'challenger' when so > sc then 'opponent' else 'draw' end;
    res := jsonb_build_object('winner', w, 'scores', jsonb_build_object('challenger', sc, 'opponent', so));
  else
    if jsonb_typeof(p_reply->'order') <> 'array' then raise exception 'BAD_HAND'; end if;
    sc := public.challenge_sort_score(c.payload->'cards', c.payload->'order');
    so := public.challenge_sort_score(c.payload->'cards', p_reply->'order');
    cm := coalesce((c.payload->>'ms')::numeric, 0);
    om := coalesce((p_reply->>'ms')::numeric, 0);
    w := case when sc > so then 'challenger' when so > sc then 'opponent'
              when cm < om then 'challenger' when om < cm then 'opponent' else 'draw' end;
    res := jsonb_build_object('winner', w, 'scores', jsonb_build_object('challenger', sc, 'opponent', so),
                              'ms', jsonb_build_object('challenger', cm, 'opponent', om));
  end if;
  update challenges set reply = p_reply, result = res, status = 'done', updated_at = now() where id = c.id returning * into c;
  return c;
end $$;

create or replace function public.challenge_claim(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c challenges; side text; w text; pay integer;
begin
  if me is null then raise exception 'sign in'; end if;
  select * into c from challenges where id = p_id and (challenger = me or opponent = me) for update;
  if c.id is null then raise exception 'GONE'; end if;
  if c.status <> 'done' then raise exception 'NOT_DONE'; end if;
  if c.claimed ? me::text then raise exception 'CLAIMED'; end if;
  side := case when c.challenger = me then 'challenger' else 'opponent' end;
  w := c.result->>'winner';
  pay := case when w = 'draw' then 300 when w = side then 600 else 150 end;
  update challenges set claimed = c.claimed || to_jsonb(me::text), updated_at = now() where id = c.id;
  return pay;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.challenges;
exception when others then null; end $$;

create table if not exists public.suspensions (
  user_id   uuid primary key references auth.users on delete cascade,
  reason    text not null default '',
  until     timestamptz,
  muted     boolean not null default false,
  at        timestamptz not null default now(),
  by        uuid references auth.users on delete set null
);

alter table public.suspensions enable row level security;

drop policy if exists "a player reads their own suspension" on public.suspensions;
create policy "a player reads their own suspension"
  on public.suspensions for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.suspensions to authenticated;

create or replace function public.is_muted(who uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.suspensions s
    where s.user_id = who and (s.until is null or s.until > now())
  );
$$;

create or replace function public.is_suspended(who uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.suspensions s
    where s.user_id = who and s.muted = false
      and (s.until is null or s.until > now())
  );
$$;

grant execute on function public.is_muted(uuid) to authenticated;
grant execute on function public.is_suspended(uuid) to authenticated;

create or replace function public.is_control_admin(who uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare hit boolean := false;
begin
  if who is null or to_regclass('public.admins') is null then return false; end if;
  execute 'select exists (select 1 from public.admins a where a.id = $1)' into hit using who;
  return coalesce(hit, false);
end $$;

create or replace function public.refuse_if_suspended()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_control_admin() then
    return new;
  end if;
  if tg_table_name in ('messages', 'guild_messages') then
    if public.is_muted() then
      raise exception 'this account is muted' using errcode = 'check_violation';
    end if;
  elsif public.is_suspended() then
    raise exception 'this account is suspended' using errcode = 'check_violation';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'messages', 'guild_messages', 'auctions', 'trades', 'deliveries',
    'guilds', 'guild_invites', 'showcase_kudos', 'challenges', 'scores'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists refuse_if_suspended on public.%I', t);
    execute format(
      'create trigger refuse_if_suspended before insert on public.%I
         for each row execute function public.refuse_if_suspended()', t);
  end loop;
end $$;

create table if not exists public.announcements (
  id           bigserial primary key,
  title_en     text not null default '',
  title_fr     text not null default '',
  body_en      text not null,
  body_fr      text not null default '',
  kind         text not null default 'note' check (kind in ('note', 'warning', 'gift', 'event')),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  target_user  uuid references auth.users on delete cascade,
  target_guild uuid,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users on delete set null
);

create index if not exists announcements_live_idx on public.announcements (starts_at desc);

alter table public.announcements enable row level security;

drop policy if exists "players read live announcements" on public.announcements;
create policy "players read live announcements"
  on public.announcements for select to authenticated
  using (
    starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (target_user is null or target_user = (select auth.uid()))
  );

drop policy if exists "anyone reads a live announcement meant for everyone" on public.announcements;
create policy "anyone reads a live announcement meant for everyone"
  on public.announcements for select to anon
  using (
    starts_at <= now()
    and (ends_at is null or ends_at > now())
    and target_user is null
  );

grant select on public.announcements to authenticated, anon;


create table if not exists public.grants (
  id          bigserial primary key,
  user_id     uuid not null references auth.users on delete cascade,
  at          timestamptz not null default now(),
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  note_en     text not null default '',
  note_fr     text not null default '',
  created_by  uuid references auth.users on delete set null,
  claimed_at  timestamptz
);

create index if not exists grants_waiting_idx
  on public.grants (user_id, at) where claimed_at is null;

alter table public.grants enable row level security;

drop policy if exists "you see what was given to you" on public.grants;
create policy "you see what was given to you"
  on public.grants for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "you claim what was given to you" on public.grants;
create policy "you claim what was given to you"
  on public.grants for update to authenticated
  using (user_id = (select auth.uid()) and claimed_at is null)
  with check (user_id = (select auth.uid()) and claimed_at is not null);

grant select, update on public.grants to authenticated;
grant usage, select on sequence public.grants_id_seq to authenticated;


create table if not exists public.cards (
  user_id     uuid not null references auth.users on delete cascade,
  article_key text not null,
  title       text not null,
  rarity_id   text not null,
  price       bigint not null default 0 check (price >= 0),
  copies      integer not null default 1 check (copies > 0),
  lang        text not null default 'en',
  pack_id     text,
  origin      text not null default 'pull',
  data        jsonb not null default '{}'::jsonb,
  favorite    boolean not null default false,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  primary key (user_id, article_key)
);
alter table public.cards add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.cards add column if not exists favorite boolean not null default false;
alter table public.cards drop constraint if exists cards_origin_check;
create index if not exists cards_article_idx on public.cards (article_key);

alter table public.cards enable row level security;
drop policy if exists "you read your own cards" on public.cards;
create policy "you read your own cards"
  on public.cards for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.inventory (
  user_id  uuid not null references auth.users on delete cascade,
  spec_id  text not null,
  spec     jsonb not null,
  count    integer not null default 1 check (count > 0),
  primary key (user_id, spec_id)
);

alter table public.inventory enable row level security;
drop policy if exists "you read your own inventory" on public.inventory;
create policy "you read your own inventory"
  on public.inventory for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.wallets (
  user_id    uuid primary key references auth.users on delete cascade,
  coins      bigint not null default 0 check (coins >= 0),
  ink        bigint not null default 0 check (ink >= 0),
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;
drop policy if exists "you read your own wallet" on public.wallets;
create policy "you read your own wallet"
  on public.wallets for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.ledger (
  id      bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  at      timestamptz not null default now(),
  kind    text not null,
  coins   bigint not null default 0,
  ink     bigint not null default 0,
  reason  text,
  detail  jsonb
);
create index if not exists ledger_owner_at_idx on public.ledger (user_id, at desc);
create index if not exists ledger_at_idx on public.ledger (at desc);

alter table public.ledger enable row level security;
drop policy if exists "you read your own ledger" on public.ledger;
create policy "you read your own ledger"
  on public.ledger for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.econ (
  user_id    uuid primary key references auth.users on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.econ enable row level security;
drop policy if exists "you read your own economy state" on public.econ;
create policy "you read your own economy state"
  on public.econ for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.claims (
  user_id uuid not null references auth.users on delete cascade,
  key     text not null,
  at      timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.claims enable row level security;
drop policy if exists "you read your own claims" on public.claims;
create policy "you read your own claims"
  on public.claims for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.custom_packs (
  user_id    uuid not null references auth.users on delete cascade,
  id         text not null,
  def        jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.custom_packs enable row level security;
drop policy if exists "you read your own custom boosters" on public.custom_packs;
create policy "you read your own custom boosters"
  on public.custom_packs for select to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.pulls (
  nonce      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  spec_id    text not null,
  spec       jsonb not null,
  cards      jsonb not null default '[]'::jsonb,
  at         timestamptz not null default now(),
  claimed_at timestamptz
);
alter table public.pulls add column if not exists cards jsonb not null default '[]'::jsonb;
alter table public.pulls add column if not exists claimed_at timestamptz;
drop index if exists public.pulls_one_waiting_idx;
create index if not exists pulls_waiting_idx on public.pulls (user_id, spec_id, at) where claimed_at is null;

alter table public.pulls enable row level security;
drop policy if exists "you see your own pulls" on public.pulls;

create table if not exists public.migration (
  id         boolean primary key default true check (id),
  cutover_at timestamptz not null default now(),
  note       text
);
insert into public.migration (id) values (true) on conflict (id) do nothing;
alter table public.migration enable row level security;

grant select on public.cards, public.inventory, public.wallets, public.ledger, public.econ, public.claims, public.custom_packs to authenticated;

drop function if exists public.begin_pull(text);
drop function if exists public.record_pull(uuid, jsonb);
drop function if exists public.roll_rarity(text);
drop function if exists public.price_for(numeric, text);
drop function if exists public.import_my_save();
drop function if exists public.add_card(uuid, text, text, text, bigint, text, text, text, integer);
drop function if exists public.move_funds(uuid, bigint, bigint, text, text, jsonb);
drop table if exists public.imported;

create or replace function public.rarity_rank(p_id text)
returns integer language sql immutable set search_path = public as $$
  select coalesce(array_position(
    array['common','uncommon','rare','epic','legendary','mythic','exotic','prismatic','special'],
    case lower(coalesce(p_id, '')) when 'artifact' then 'prismatic' else lower(coalesce(p_id, '')) end), 0);
$$;

create or replace function public.econ_take_card(p_user uuid, p_key text, p_copies integer default 1, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare row_c cards; n integer := greatest(1, coalesce(p_copies, 1));
begin
  select * into row_c from cards where user_id = p_user and article_key = p_key for update;
  if row_c.user_id is null or row_c.copies < n then raise exception 'NOT_OWNED'; end if;
  if coalesce(row_c.data->>'special', 'false') not in ('false', '') and not p_force then
    raise exception 'LOCKED';
  end if;
  if row_c.copies = n then
    delete from cards where user_id = p_user and article_key = row_c.article_key;
  else
    update cards set copies = copies - n where user_id = p_user and article_key = row_c.article_key;
  end if;
  return jsonb_build_object(
    'key', row_c.article_key, 'title', row_c.title, 'rarityId', row_c.rarity_id,
    'price', row_c.price, 'lang', row_c.lang, 'packId', row_c.pack_id, 'copies', n, 'data', row_c.data);
end $$;
revoke all on function public.econ_take_card(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.econ_take_card(uuid, text, integer, boolean) to service_role;

create or replace function public.econ_give_card(p_user uuid, item jsonb, p_origin text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if item->>'key' is null then raise exception 'BAD_CARD'; end if;
  insert into cards (user_id, article_key, title, rarity_id, price, copies, lang, pack_id, origin, data)
  values (p_user, item->>'key', coalesce(item->>'title', item->>'key'),
          coalesce(item->>'rarityId', 'common'), greatest(0, coalesce((item->>'price')::bigint, 0)),
          greatest(1, coalesce((item->>'copies')::integer, 1)), coalesce(item->>'lang', 'en'),
          item->>'packId', coalesce(p_origin, item->>'origin', 'pull'), coalesce(item->'data', '{}'::jsonb))
  on conflict (user_id, article_key) do update
    set copies    = cards.copies + excluded.copies,
        last_at   = now(),
        rarity_id = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then excluded.rarity_id else cards.rarity_id end,
        price     = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then excluded.price
                         when item ? 'reprice' then greatest(0, (item->>'reprice')::bigint)
                         else cards.price end,
        data      = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then cards.data || excluded.data else excluded.data || cards.data end;
end $$;
revoke all on function public.econ_give_card(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.econ_give_card(uuid, jsonb, text) to service_role;

create or replace function public.econ_mark(p_user uuid, p_item jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select guild_id into g from guild_members where user_id = p_user;
  case p_item->>'kind'
  when 'quest' then
    update quests set claimed = true
      where user_id = p_user and day = p_item->>'day' and quest_id = p_item->>'id'
        and not claimed and progress >= target;
  when 'challenge' then
    update challenges set claimed = claimed || to_jsonb(p_user::text), updated_at = now()
      where id = (p_item->>'id')::uuid and (challenger = p_user or opponent = p_user)
        and status = 'done' and not (claimed ? p_user::text);
  when 'guildGoal' then
    insert into guild_goal_claims (guild_id, week, user_id)
      select gg.guild_id, gg.week, p_user from guild_goals gg
        where gg.guild_id = g and gg.week = p_item->>'week' and gg.done_at is not null
      on conflict do nothing;
  when 'guildMatch' then
    insert into guild_match_claims (week, user_id)
      select m.week, p_user from guild_matches m
        where m.week = p_item->>'week' and (m.guild_a = g or m.guild_b = g) and m.score_a is not null
          and case when m.guild_a = g then m.score_a > m.score_b else m.score_b > m.score_a end
      on conflict do nothing;
  when 'grant' then
    update grants set claimed_at = now()
      where id = (p_item->>'id')::bigint and user_id = p_user and claimed_at is null;
  when 'delivery' then
    update deliveries set claimed_at = now()
      where id = (p_item->>'id')::uuid and recipient = p_user and claimed_at is null;
  else
    raise exception 'BAD_MARK';
  end case;
  if not found then raise exception 'NOT_CLAIMABLE'; end if;
end $$;
revoke all on function public.econ_mark(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.econ_mark(uuid, jsonb) to service_role;

create or replace function public.econ_facts(p_user uuid, p_kind text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g uuid; res jsonb; c challenges; side text; w text; prev text := week_key(now() - interval '7 days');
begin
  select guild_id into g from guild_members where user_id = p_user;
  if p_kind = 'quest' then
    select jsonb_build_object('day', q.day, 'id', q.quest_id, 'progress', q.progress, 'target', q.target, 'claimed', q.claimed)
      into res from quests q where q.user_id = p_user and q.day = p_args->>'day' and q.quest_id = p_args->>'id';
  elsif p_kind = 'challenge' then
    select * into c from challenges where id = (p_args->>'id')::uuid and (challenger = p_user or opponent = p_user);
    if c.id is not null then
      side := case when c.challenger = p_user then 'challenger' else 'opponent' end;
      w := c.result->>'winner';
      res := jsonb_build_object('status', c.status, 'claimed', c.claimed ? p_user::text,
        'outcome', case when w is null then null when w = 'draw' then 'draw' when w = side then 'win' else 'lose' end);
    end if;
  elsif p_kind = 'guildGoal' then
    if g is not null then
      select jsonb_build_object('week', gg.week, 'done', gg.done_at is not null,
          'claimed', exists (select 1 from guild_goal_claims x where x.guild_id = g and x.week = gg.week and x.user_id = p_user))
        into res from guild_goals gg where gg.guild_id = g and gg.week = week_key();
    end if;
  elsif p_kind = 'guildMatch' then
    if g is not null then
      select jsonb_build_object('week', m.week,
          'won', m.score_a is not null and case when m.guild_a = g then m.score_a > m.score_b else m.score_b > m.score_a end,
          'claimed', exists (select 1 from guild_match_claims x where x.week = m.week and x.user_id = p_user))
        into res from guild_matches m where m.week = prev and (m.guild_a = g or m.guild_b = g);
    end if;
  elsif p_kind = 'deliveries' then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'sender', r.sender, 'kind', r.kind, 'payload', r.payload,
        'note', r.note, 'at', r.created_at) order by r.created_at), '[]'::jsonb)
      into res from (select * from deliveries where recipient = p_user and claimed_at is null order by created_at limit 100) r;
  elsif p_kind = 'grants' then
    select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'payload', r.payload,
        'note_en', r.note_en, 'note_fr', r.note_fr) order by r.at), '[]'::jsonb)
      into res from (select * from grants where user_id = p_user and claimed_at is null order by at limit 100) r;
  elsif p_kind = 'launch' then
    res := jsonb_build_object(
      'grants', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'payload', r.payload,
          'note_en', r.note_en, 'note_fr', r.note_fr) order by r.at)
        from (select * from grants where user_id = p_user and claimed_at is null order by at limit 100) r), '[]'::jsonb),
      'deliveries', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'sender', r.sender, 'kind', r.kind, 'payload', r.payload,
          'note', r.note, 'at', r.created_at) order by r.created_at)
        from (select * from deliveries where recipient = p_user and claimed_at is null order by created_at limit 100) r), '[]'::jsonb),
      'quests', coalesce((select jsonb_agg(jsonb_build_object('quest_id', q.quest_id, 'target', q.target, 'progress', q.progress,
          'claimed', q.claimed, 'expires_at', q.expires_at) order by q.quest_id)
        from quests q where q.user_id = p_user and q.day = coalesce(p_args->>'day', to_char(now() at time zone 'utc', 'YYYY-MM-DD'))), '[]'::jsonb));
  end if;
  return res;
end $$;
revoke all on function public.econ_facts(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.econ_facts(uuid, text, jsonb) to service_role;

drop function if exists public.econ_wipe(uuid, text, text);
create or replace function public.econ_wipe(p_user uuid, p_scope text, p_claim text default null, p_coins bigint default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_scope not in ('cards', 'all') then raise exception 'BAD_SCOPE'; end if;
  if p_claim is not null then
    insert into claims (user_id, key) values (p_user, p_claim) on conflict do nothing;
    if not found then raise exception 'ALREADY_CLAIMED'; end if;
  end if;
  insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  if p_scope = 'all' then
    delete from cards where user_id = p_user;
    delete from inventory where user_id = p_user;
    delete from pulls where user_id = p_user and claimed_at is null;
    delete from custom_packs where user_id = p_user;
    update wallets set coins = 0, ink = 0, updated_at = now() where user_id = p_user;
    update econ set state = jsonb_build_object('imported', true, 'rev', coalesce((state->>'rev')::integer, 0) + 1),
      updated_at = now() where user_id = p_user;
    delete from claims where user_id = p_user
      and (key = 'starter' or key like 'level:%' or key like 'medal:%' or key like 'ach:%');
  else
    delete from cards where user_id = p_user and coalesce(data->>'special', 'false') in ('false', '');
    delete from inventory where user_id = p_user and coalesce(spec->>'kind', '') <> 'code';
    delete from pulls where user_id = p_user and claimed_at is null and coalesce(spec->>'kind', '') <> 'code';
    update wallets set coins = greatest(0, coalesce(p_coins, 0)), updated_at = now() where user_id = p_user;
    update econ set state = state || jsonb_build_object('rev', coalesce((state->>'rev')::integer, 0) + 1),
      updated_at = now() where user_id = p_user;
  end if;
  insert into ledger (user_id, kind, coins, ink, reason) values (p_user, 'wipe', 0, 0, p_scope);
end $$;
revoke all on function public.econ_wipe(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.econ_wipe(uuid, text, text, bigint) to service_role;

create or replace function public.econ_apply(p_user uuid, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w        wallets;
  item     jsonb;
  k        text;
  n        integer;
  cur      integer;
  removed  jsonb := '[]'::jsonb;
  d_coins  bigint := coalesce((p_ops->>'coins')::bigint, 0);
  d_ink    bigint := coalesce((p_ops->>'ink')::bigint, 0);
begin
  if p_user is null then raise exception 'AUTH'; end if;

  for k in select jsonb_array_elements_text(coalesce(p_ops->'claims', '[]'::jsonb)) loop
    insert into claims (user_id, key) values (p_user, k) on conflict do nothing;
    if not found then raise exception 'ALREADY_CLAIMED'; end if;
  end loop;

  if p_ops ? 'rev' then
    insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
    select coalesce((state->>'rev')::integer, 0) into cur from econ where user_id = p_user for update;
    if cur <> (p_ops->>'rev')::integer then raise exception 'CONFLICT'; end if;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'marks', '[]'::jsonb)) loop
    perform public.econ_mark(p_user, item);
  end loop;

  if p_ops ? 'pull' then
    update pulls set claimed_at = now()
      where nonce = (p_ops->>'pull')::uuid and user_id = p_user and claimed_at is null;
    if not found then raise exception 'NO_PULL'; end if;
  end if;

  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  begin
    update wallets set coins = coins + d_coins, ink = ink + d_ink, updated_at = now()
      where user_id = p_user returning * into w;
  exception when check_violation then
    raise exception 'INSUFFICIENT_FUNDS';
  end;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'inventory', '[]'::jsonb)) loop
    n := coalesce((item->>'delta')::integer, 0);
    if n > 0 then
      insert into inventory (user_id, spec_id, spec, count)
        values (p_user, item->>'spec_id', item->'spec', n)
        on conflict (user_id, spec_id) do update set count = inventory.count + n;
    elsif n < 0 then
      select count into cur from inventory
        where user_id = p_user and spec_id = item->>'spec_id' for update;
      if cur is null or cur < -n then raise exception 'NOT_HELD'; end if;
      if cur = -n then
        delete from inventory where user_id = p_user and spec_id = item->>'spec_id';
      else
        update inventory set count = count + n where user_id = p_user and spec_id = item->>'spec_id';
      end if;
    end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'remove', '[]'::jsonb)) loop
    removed := removed || public.econ_take_card(p_user, item->>'key', coalesce((item->>'copies')::integer, 1),
      coalesce((item->>'force')::boolean, false));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'add', '[]'::jsonb)) loop
    perform public.econ_give_card(p_user, item);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'patch', '[]'::jsonb)) loop
    update cards set
        data     = case when item ? 'data' then cards.data || (item->'data') else cards.data end,
        title    = coalesce(item->>'title', cards.title),
        favorite = coalesce((item->>'favorite')::boolean, cards.favorite)
      where user_id = p_user and article_key = item->>'key';
  end loop;

  if p_ops ? 'state' then
    insert into econ (user_id, state) values (p_user, p_ops->'state')
      on conflict (user_id) do update set state = econ.state || excluded.state, updated_at = now();
  end if;

  if p_ops ? 'pull' then
    insert into codex (key, title, rarity, price, views, thumbnail, lang, found_by)
    select a->>'key', left(coalesce(a->>'title', a->>'key'), 300), a->>'rarityId',
           case when jsonb_typeof(a->'price') = 'number' then least((a->>'price')::numeric, 2000000000)::integer end,
           case when jsonb_typeof(a->'data'->'views') = 'number' then (a->'data'->>'views')::numeric::bigint end,
           left(a->'data'->>'thumbnail', 2000), left(a->>'lang', 12), p_user
      from jsonb_array_elements(coalesce(p_ops->'add', '[]'::jsonb)) a
      where a->>'key' is not null and coalesce(a->>'packId', '') !~ '^(custom|code)\|'
    on conflict (key) do nothing;
  end if;

  if p_ops ? 'score' then
    perform public.econ_score(p_user, p_ops->'score');
  end if;

  if d_coins <> 0 or d_ink <> 0 or p_ops ? 'kind' then
    insert into ledger (user_id, kind, coins, ink, reason, detail)
      values (p_user, coalesce(p_ops->>'kind', 'change'), d_coins, d_ink, p_ops->>'reason', p_ops->'detail');
  end if;

  update profiles set updated_at = now() where id = p_user;

  return jsonb_build_object('coins', w.coins, 'ink', w.ink, 'removed', removed,
    'fresh', jsonb_build_object(
      'state', coalesce((select e.state from econ e where e.user_id = p_user), '{}'::jsonb),
      'inventory', coalesce((select jsonb_object_agg(i.spec_id, jsonb_build_object('spec', i.spec, 'count', i.count)) from inventory i where i.user_id = p_user), '{}'::jsonb),
      'cards', coalesce((select jsonb_agg(jsonb_build_object('article_key', c.article_key, 'title', c.title, 'rarity_id', c.rarity_id, 'price', c.price,
          'copies', c.copies, 'lang', c.lang, 'pack_id', c.pack_id, 'data', c.data, 'favorite', c.favorite))
        from cards c where c.user_id = p_user and c.article_key in (select jsonb_array_elements_text(coalesce(p_ops->'keys', '[]'::jsonb)))), '[]'::jsonb)));
end $$;
revoke all on function public.econ_apply(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.econ_apply(uuid, jsonb) to service_role;

create or replace function public.econ_entry_of(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(p->'data', '{}'::jsonb) || jsonb_build_object(
    'key', p->>'key', 'title', p->>'title', 'rarityId', p->>'rarityId', 'price', p->'price',
    'lang', p->>'lang', 'packId', p->'packId', 'count', coalesce((p->>'copies')::integer, 1));
$$;

create or replace function public.econ_card_of(p jsonb)
returns jsonb language sql immutable as $$
  select case when p ? 'data' then p else jsonb_build_object(
    'key', p->>'key',
    'title', coalesce(p->>'title', p->>'key'),
    'rarityId', coalesce(p->>'rarityId', 'common'),
    'price', greatest(0, round(coalesce((p->>'price')::numeric, 0)))::bigint,
    'lang', coalesce(p->>'lang', 'en'),
    'packId', p->>'packId',
    'copies', greatest(1, coalesce((p->>'count')::integer, 1)),
    'data', p - array['key', 'title', 'rarityId', 'price', 'count', 'lang', 'packId', 'favorite']) end;
$$;

create or replace function public.econ_gift(p_user uuid, p_to uuid, p_kind text, p_ref text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare payload jsonb; slot inventory; row_out deliveries; sent integer;
begin
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  if p_to is null or p_to = p_user or not public.are_friends(p_user, p_to) then raise exception 'NOT_FRIENDS'; end if;
  select count(*) into sent from deliveries
    where sender = p_user and kind in ('card', 'booster') and created_at > now() - interval '1 day';
  if sent >= 30 then raise exception 'GIFT_LIMIT'; end if;
  if p_kind = 'card' then
    payload := public.econ_entry_of(public.econ_take_card(p_user, p_ref, 1));
  elsif p_kind = 'booster' then
    select * into slot from inventory where user_id = p_user and spec_id = p_ref for update;
    if slot.user_id is null or slot.count < 1 then raise exception 'NOT_HELD'; end if;
    if slot.count = 1 then
      delete from inventory where user_id = p_user and spec_id = p_ref;
    else
      update inventory set count = count - 1 where user_id = p_user and spec_id = p_ref;
    end if;
    payload := jsonb_build_object('spec', slot.spec, 'spec_id', slot.spec_id, 'count', 1);
  else
    raise exception 'BAD_KIND';
  end if;
  insert into deliveries (sender, recipient, kind, payload, note)
    values (p_user, p_to, p_kind, payload, left(nullif(p_note, ''), 200))
    returning * into row_out;
  insert into ledger (user_id, kind, coins, ink, reason, detail)
    values (p_user, 'gift', 0, 0, p_kind, jsonb_build_object('to', p_to, 'ref', p_ref));
  return to_jsonb(row_out);
end $$;

create or replace function public.econ_trade_propose(p_user uuid, p_to uuid, p_offer jsonb, p_ask jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; a jsonb; snaps jsonb := '[]'::jsonb; asks jsonb := '[]'::jsonb; open_n integer; row_out trades;
begin
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  if p_to is null or p_to = p_user or not public.are_friends(p_user, p_to) then raise exception 'NOT_FRIENDS'; end if;
  if jsonb_typeof(p_offer) <> 'array' or jsonb_typeof(p_ask) <> 'array'
     or jsonb_array_length(p_offer) > 10 or jsonb_array_length(p_ask) > 10
     or jsonb_array_length(p_offer) + jsonb_array_length(p_ask) = 0 then
    raise exception 'BAD_TRADE';
  end if;
  select count(*) into open_n from trades where proposer = p_user and status = 'pending';
  if open_n >= 10 then raise exception 'TOO_MANY'; end if;
  for k in select distinct jsonb_array_elements_text(p_offer) loop
    snaps := snaps || public.econ_entry_of(public.econ_take_card(p_user, k, 1));
  end loop;
  for a in select * from jsonb_array_elements(p_ask) loop
    if a->>'key' is null then raise exception 'BAD_TRADE'; end if;
    asks := asks || jsonb_build_object('key', a->>'key', 'title', left(coalesce(a->>'title', a->>'key'), 300), 'rarityId', a->>'rarityId');
  end loop;
  insert into trades (proposer, recipient, offer, ask) values (p_user, p_to, snaps, asks) returning * into row_out;
  return to_jsonb(row_out);
end $$;

create or replace function public.econ_trade_answer(p_user uuid, p_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t trades; a jsonb; c jsonb; paid jsonb := '[]'::jsonb;
begin
  select * into t from trades where id = p_id and recipient = p_user for update;
  if t.id is null then raise exception 'GONE'; end if;
  if t.status <> 'pending' then raise exception 'SETTLED'; end if;
  if p_accept then
    if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
    for a in select * from jsonb_array_elements(t.ask) loop
      paid := paid || public.econ_entry_of(public.econ_take_card(p_user, a->>'key', 1));
    end loop;
    for c in select * from jsonb_array_elements(t.offer) loop
      perform public.econ_give_card(p_user, public.econ_card_of(c), 'trade');
    end loop;
    insert into deliveries (sender, recipient, kind, payload)
      values (p_user, t.proposer, 'trade-return', jsonb_build_object('cards', paid));
    update trades set status = 'accepted', resolved_at = now() where id = t.id returning * into t;
  else
    for c in select * from jsonb_array_elements(t.offer) loop
      perform public.econ_give_card(t.proposer, public.econ_card_of(c), 'trade');
    end loop;
    update trades set status = 'declined', resolved_at = now() where id = t.id returning * into t;
  end if;
  return to_jsonb(t);
end $$;

create or replace function public.econ_trade_cancel(p_user uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t trades; c jsonb;
begin
  select * into t from trades where id = p_id and proposer = p_user for update;
  if t.id is null then raise exception 'GONE'; end if;
  if t.status <> 'pending' then raise exception 'SETTLED'; end if;
  for c in select * from jsonb_array_elements(t.offer) loop
    perform public.econ_give_card(p_user, public.econ_card_of(c), 'trade');
  end loop;
  update trades set status = 'cancelled', resolved_at = now() where id = t.id returning * into t;
  return to_jsonb(t);
end $$;

create or replace function public.econ_auction_create(p_user uuid, p_key text, p_price integer, p_minutes integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare mine integer; row_out auctions;
begin
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  if p_minutes not in (10, 30, 60, 180, 360, 720, 1440) then raise exception 'BAD_DURATION'; end if;
  if p_price is null or p_price < 1 or p_price > 1000000 then raise exception 'BAD_PRICE'; end if;
  select count(*) into mine from auctions where seller = p_user and status = 'open';
  if mine >= 10 then raise exception 'TOO_MANY'; end if;
  insert into auctions (seller, seller_name, card, start_price, ends_at)
  values (p_user, coalesce((select username from profiles where id = p_user), ''),
          public.econ_entry_of(public.econ_take_card(p_user, p_key, 1)), p_price, now() + make_interval(mins => p_minutes))
  returning * into row_out;
  return to_jsonb(row_out);
end $$;

create or replace function public.econ_auction_bid(p_user uuid, p_id uuid, p_amount integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a auctions; row_out auctions;
begin
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  select * into a from auctions where id = p_id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status <> 'open' or now() >= a.ends_at then raise exception 'ENDED'; end if;
  if a.seller = p_user then raise exception 'OWN_AUCTION'; end if;
  if p_amount is null or p_amount < public.auction_floor(a) then raise exception 'TOO_LOW'; end if;
  begin
    update wallets set coins = coins - p_amount, updated_at = now() where user_id = p_user;
    if not found then raise exception 'INSUFFICIENT_FUNDS'; end if;
  exception when check_violation then
    raise exception 'INSUFFICIENT_FUNDS';
  end;
  insert into ledger (user_id, kind, coins, ink, reason, detail)
    values (p_user, 'bid', -p_amount, 0, 'escrow', jsonb_build_object('auction', a.id));
  if a.bidder is not null then
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.bidder, 'auction-money',
            jsonb_build_object('amount', a.current_bid, 'reason', 'refund', 'title', a.card->>'title'));
  end if;
  update auctions set
    current_bid = p_amount,
    bidder = p_user,
    bidder_name = coalesce((select username from profiles where id = p_user), ''),
    bid_count = bid_count + 1,
    ends_at = case when ends_at - now() < interval '10 seconds' then now() + interval '65 seconds' else ends_at end
  where id = a.id
  returning * into row_out;
  return to_jsonb(row_out);
end $$;

create or replace function public.econ_auction_cancel(p_user uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a auctions;
begin
  select * into a from auctions where id = p_id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.seller <> p_user then raise exception 'NOT_YOURS'; end if;
  if a.status <> 'open' then raise exception 'ENDED'; end if;
  if a.bid_count > 0 then raise exception 'HAS_BIDS'; end if;
  perform public.econ_give_card(p_user, public.econ_card_of(a.card), 'auction');
  update auctions set status = 'cancelled' where id = a.id returning * into a;
  return to_jsonb(a);
end $$;

create or replace function public.econ_bank_donate(p_user uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid; row_out guild_bank;
begin
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  select guild_id into g from guild_members where user_id = p_user;
  if g is null then raise exception 'NOT_IN_GUILD'; end if;
  if (select count(*) from guild_bank where guild_id = g) >= 200 then raise exception 'BANK_FULL'; end if;
  insert into guild_bank (guild_id, donor, donor_name, card)
    values (g, p_user, coalesce((select username from profiles where id = p_user), ''),
            public.econ_entry_of(public.econ_take_card(p_user, p_key, 1)))
    returning * into row_out;
  return to_jsonb(row_out);
end $$;

create or replace function public.econ_bank_take(p_user uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g uuid; taken guild_bank; today date := (now() at time zone 'utc')::date; n integer;
begin
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  select guild_id into g from guild_members where user_id = p_user;
  if g is null then raise exception 'NOT_IN_GUILD'; end if;
  select coalesce(t.n, 0) into n from guild_bank_takes t where t.user_id = p_user and t.day = today;
  if coalesce(n, 0) >= 3 then raise exception 'TAKE_LIMIT'; end if;
  delete from guild_bank where id = p_id and guild_id = g returning * into taken;
  if taken.id is null then raise exception 'GONE'; end if;
  insert into guild_bank_takes (user_id, day, n) values (p_user, today, 1)
    on conflict (user_id, day) do update set n = guild_bank_takes.n + 1;
  perform public.econ_give_card(p_user, public.econ_card_of(taken.card), 'guild');
  return taken.card;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'econ_gift(uuid, uuid, text, text, text)', 'econ_trade_propose(uuid, uuid, jsonb, jsonb)',
    'econ_trade_answer(uuid, uuid, boolean)', 'econ_trade_cancel(uuid, uuid)',
    'econ_auction_create(uuid, text, integer, integer)', 'econ_auction_bid(uuid, uuid, integer)',
    'econ_auction_cancel(uuid, uuid)', 'econ_bank_donate(uuid, text)', 'econ_bank_take(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array[
    'create_auction(jsonb, integer, integer)', 'place_bid(uuid, integer)', 'cancel_auction(uuid)',
    'guild_bank_donate(jsonb)', 'guild_bank_take(uuid)', 'guild_goal_claim()', 'guild_match_claim()',
    'challenge_claim(uuid)'
  ] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke all on function public.%s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

drop policy if exists "you send deliveries as yourself to friends" on public.deliveries;
drop policy if exists "the recipient claims a delivery" on public.deliveries;
drop policy if exists "you propose trades as yourself to friends" on public.trades;
drop policy if exists "trade parties update their side" on public.trades;

create table if not exists public.blocked_terms (
  term text primary key,
  tier text not null check (tier in ('slur', 'sexual', 'profanity', 'reserved', 'contact')),
  mode text not null check (mode in ('any', 'word', 'exact'))
);
alter table public.blocked_terms enable row level security;
drop policy if exists "control reads the word list" on public.blocked_terms;
create policy "control reads the word list" on public.blocked_terms for select to authenticated using (public.is_control_admin());
drop policy if exists "control edits the word list" on public.blocked_terms;
create policy "control edits the word list" on public.blocked_terms for all to authenticated
  using (public.is_control_admin()) with check (public.is_control_admin());

insert into public.blocked_terms (term, tier, mode) values
  ('nigger', 'slur', 'any'), ('nigga', 'slur', 'any'), ('faggot', 'slur', 'any'), ('tranny', 'slur', 'any'), ('retard', 'slur', 'any'), ('wetback', 'slur', 'any'),
  ('raghead', 'slur', 'any'), ('towelhead', 'slur', 'any'), ('shemale', 'slur', 'any'), ('kike', 'slur', 'word'), ('spic', 'slur', 'word'), ('chink', 'slur', 'word'),
  ('gook', 'slur', 'word'), ('coon', 'slur', 'word'), ('beaner', 'slur', 'word'), ('paki', 'slur', 'word'), ('dyke', 'slur', 'word'), ('fag', 'slur', 'word'),
  ('bougnoule', 'slur', 'any'), ('youpin', 'slur', 'any'), ('tarlouze', 'slur', 'any'), ('tafiole', 'slur', 'any'), ('chinetoque', 'slur', 'any'), ('niakoue', 'slur', 'any'),
  ('negre', 'slur', 'word'), ('bicot', 'slur', 'word'), ('pede', 'slur', 'word'), ('pd', 'slur', 'word'), ('tapette', 'slur', 'word'), ('gouine', 'slur', 'word'),
  ('triso', 'slur', 'exact'), ('bamboula', 'slur', 'word'), ('porn', 'sexual', 'any'), ('hentai', 'sexual', 'any'), ('blowjob', 'sexual', 'any'), ('handjob', 'sexual', 'any'),
  ('cumshot', 'sexual', 'any'), ('jizz', 'sexual', 'any'), ('dildo', 'sexual', 'any'), ('titties', 'sexual', 'any'), ('sexting', 'sexual', 'any'), ('pedophile', 'sexual', 'any'),
  ('molest', 'sexual', 'any'), ('incest', 'sexual', 'any'), ('dick', 'sexual', 'word'), ('cock', 'sexual', 'word'), ('pussy', 'sexual', 'word'), ('cunt', 'sexual', 'word'),
  ('cum', 'sexual', 'word'), ('anal', 'sexual', 'word'), ('boobs', 'sexual', 'word'), ('tits', 'sexual', 'word'), ('nudes', 'sexual', 'word'), ('rape', 'sexual', 'word'),
  ('rapist', 'sexual', 'word'), ('pedo', 'sexual', 'word'), ('horny', 'sexual', 'word'), ('milf', 'sexual', 'word'), ('nsfw', 'sexual', 'word'), ('sex', 'sexual', 'word'),
  ('branler', 'sexual', 'any'), ('branlette', 'sexual', 'any'), ('niquer', 'sexual', 'any'), ('fellation', 'sexual', 'any'), ('sodomie', 'sexual', 'any'), ('chatte', 'sexual', 'exact'),
  ('baise', 'sexual', 'word'), ('suce', 'sexual', 'word'), ('nique', 'sexual', 'word'), ('encule', 'sexual', 'word'), ('zizi', 'sexual', 'word'), ('teub', 'sexual', 'word'),
  ('viol', 'sexual', 'word'), ('violer', 'sexual', 'word'), ('fuck', 'profanity', 'any'), ('bitch', 'profanity', 'any'), ('asshole', 'profanity', 'any'), ('whore', 'profanity', 'any'),
  ('wanker', 'profanity', 'any'), ('shit', 'profanity', 'word'), ('bastard', 'profanity', 'word'), ('ass', 'profanity', 'word'), ('slut', 'profanity', 'word'), ('twat', 'profanity', 'word'),
  ('bollocks', 'profanity', 'word'), ('prick', 'profanity', 'exact'), ('fck', 'profanity', 'word'), ('wtf', 'profanity', 'word'), ('stfu', 'profanity', 'word'), ('putain', 'profanity', 'any'),
  ('connard', 'profanity', 'any'), ('connasse', 'profanity', 'any'), ('salope', 'profanity', 'any'), ('enfoire', 'profanity', 'any'), ('merde', 'profanity', 'word'), ('con', 'profanity', 'word'),
  ('conne', 'profanity', 'exact'), ('salaud', 'profanity', 'word'), ('batard', 'profanity', 'word'), ('ntm', 'profanity', 'word'), ('fdp', 'profanity', 'word'), ('pute', 'profanity', 'word'),
  ('admin', 'reserved', 'any'), ('moderator', 'reserved', 'any'), ('moderateur', 'reserved', 'any'), ('modo', 'reserved', 'word'), ('wikster', 'reserved', 'any'), ('wikipedia', 'reserved', 'any'),
  ('wikimedia', 'reserved', 'any'), ('official', 'reserved', 'any'), ('officiel', 'reserved', 'any'), ('support', 'reserved', 'any'), ('staff', 'reserved', 'word'), ('jupiterian', 'reserved', 'any'),
  ('system', 'reserved', 'exact'), ('snapchat', 'contact', 'any'), ('discord', 'contact', 'any'), ('whatsapp', 'contact', 'any'), ('instagram', 'contact', 'any'), ('onlyfans', 'contact', 'any'),
  ('snap', 'contact', 'word'), ('telegram', 'contact', 'word'), ('insta', 'contact', 'word'), ('kik', 'contact', 'word'), ('skype', 'contact', 'word'), ('wechat', 'contact', 'word')
on conflict (term) do update set tier = excluded.tier, mode = excluded.mode;

create or replace function public.text_norm(p_text text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(lower(coalesce(p_text, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ0134578@$!|', 'aaaaaaceeeeiiiinooooouuuuyyoaoieastbasii'),
    '(.)\1\1+', '\1\1', 'g');
$$;

create or replace function public.text_flag(p_text text, p_scope text default 'chat')
returns text language plpgsql stable security definer set search_path = public as $$
declare
  tiers text[] := case p_scope
    when 'name' then array['slur', 'sexual', 'profanity', 'reserved']
    when 'guild' then array['slur', 'sexual', 'profanity', 'reserved']
    when 'pack' then array['slur', 'sexual', 'profanity']
    when 'adultPack' then array['slur', 'profanity']
    else array['slur', 'sexual', 'contact'] end;
  raw text := lower(coalesce(p_text, ''));
  n text := public.text_norm(p_text);
  s text;
  hits text[];
begin
  if 'contact' = any(tiers) then
    if raw ~ '(https?://|www\.)'
       or raw ~ '[a-z0-9-]+\.(com|net|org|io|gg|fr|ru|xyz|app|ly|me|tv|co|be|de|uk|us|info|biz|link|site|online|shop)([^a-z0-9]|$)' then
      return 'LINK';
    end if;
    if raw ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or raw ~ '(\+[0-9][0-9 .-]{7,}[0-9]|0[1-9]([ .-]?[0-9]{2}){4})' then
      return 'CONTACT';
    end if;
  end if;
  s := regexp_replace(n, '(.)\1+', '\1', 'g');
  select coalesce(array_agg(distinct b.tier), '{}') into hits
    from public.blocked_terms b, (values (n, false), (s, true)) v(t, single)
    where b.tier = any(tiers)
      and (not v.single or b.term !~ '(.)\1')
      and case b.mode
        when 'any' then position(b.term in regexp_replace(v.t, '[^a-z]', '', 'g')) > 0
        else exists (
          select 1 from regexp_split_to_table(v.t, '[^a-z]+') w
          where w <> '' and (w = b.term or (b.mode = 'word' and length(b.term) >= 5 and left(w, length(b.term)) = b.term)))
      end;
  if hits && array['slur', 'sexual', 'profanity'] then return 'WORD'; end if;
  if 'reserved' = any(hits) then return 'RESERVED'; end if;
  if 'contact' = any(hits) then return 'CONTACT'; end if;
  return null;
end $$;
grant execute on function public.text_flag(text, text) to authenticated;

create table if not exists public.filter_hits (
  id       bigserial primary key,
  user_id  uuid not null references auth.users on delete cascade,
  scope    text not null,
  reason   text not null,
  body     text not null check (char_length(body) <= 500),
  at       timestamptz not null default now()
);
create index if not exists filter_hits_user_idx on public.filter_hits (user_id, at desc);
alter table public.filter_hits enable row level security;
drop policy if exists "control reads filter hits" on public.filter_hits;
create policy "control reads filter hits" on public.filter_hits for select to authenticated using (public.is_control_admin());

create or replace function public.note_filtered(p_scope text, p_text text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); flag text; recent integer;
begin
  if me is null then return null; end if;
  flag := public.text_flag(p_text, p_scope);
  if flag is null then return null; end if;
  select count(*) into recent from filter_hits where user_id = me and at > now() - interval '1 day';
  if recent >= 50 then return flag; end if;
  insert into filter_hits (user_id, scope, reason, body) values (me, left(coalesce(p_scope, ''), 20), flag, left(coalesce(p_text, ''), 500));
  if p_scope = 'chat' and recent + 1 >= 5 and not public.is_muted(me) then
    insert into suspensions (user_id, reason, until, muted)
      values (me, 'auto: repeated filtered messages', now() + interval '1 day', true)
      on conflict (user_id) do nothing;
  end if;
  return flag;
end $$;
grant execute on function public.note_filtered(text, text) to authenticated;

create or replace function public.refuse_filtered_chat()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_control_admin() then return new; end if;
  if public.text_flag(new.body, 'chat') is not null then raise exception 'FILTERED' using errcode = 'check_violation'; end if;
  return new;
end $$;

create or replace function public.refuse_filtered_name()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_control_admin() then return new; end if;
  if tg_table_name = 'profiles' then
    if public.text_flag(new.username, 'name') is not null then raise exception 'NAME_REFUSED' using errcode = 'check_violation'; end if;
  elsif tg_table_name = 'guilds' then
    if public.text_flag(new.name, 'guild') is not null or public.text_flag(new.tag, 'guild') is not null
       or public.text_flag(new.about, 'guild') is not null then
      raise exception 'NAME_REFUSED' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'custom_packs' then
    if public.text_flag(new.def->>'name', case when new.def->'wiki'->>'mature' = 'true' then 'adultPack' else 'pack' end) is not null then
      raise exception 'NAME_REFUSED' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists refuse_filtered_chat on public.messages;
create trigger refuse_filtered_chat before insert on public.messages
  for each row execute function public.refuse_filtered_chat();
drop trigger if exists refuse_filtered_chat on public.guild_messages;
create trigger refuse_filtered_chat before insert on public.guild_messages
  for each row execute function public.refuse_filtered_chat();
drop trigger if exists refuse_filtered_name on public.profiles;
create trigger refuse_filtered_name before insert on public.profiles
  for each row execute function public.refuse_filtered_name();
drop trigger if exists refuse_filtered_rename on public.profiles;
create trigger refuse_filtered_rename before update of username on public.profiles
  for each row when (old.username is distinct from new.username) execute function public.refuse_filtered_name();
drop trigger if exists refuse_filtered_name on public.guilds;
create trigger refuse_filtered_name before insert or update of name, tag, about on public.guilds
  for each row execute function public.refuse_filtered_name();
drop trigger if exists refuse_filtered_name on public.custom_packs;
create trigger refuse_filtered_name before insert or update on public.custom_packs
  for each row execute function public.refuse_filtered_name();

create table if not exists public.blocks (
  blocker    uuid not null references auth.users on delete cascade,
  blocked    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "you see who you blocked" on public.blocks;
create policy "you see who you blocked" on public.blocks for select to authenticated
  using ((select auth.uid()) = blocker or public.is_control_admin());
grant select on public.blocks to authenticated;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
revoke all on function public.is_blocked(uuid, uuid) from public;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

create or replace function public.block_player(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in'; end if;
  if p_user is null or p_user = me then raise exception 'NOT_FOUND'; end if;
  insert into blocks (blocker, blocked) values (me, p_user) on conflict do nothing;
  delete from friendships where (requester = me and addressee = p_user) or (requester = p_user and addressee = me);
  delete from guild_invites where (inviter = me and invitee = p_user) or (inviter = p_user and invitee = me);
end $$;

create or replace function public.unblock_player(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in'; end if;
  delete from blocks where blocker = auth.uid() and blocked = p_user;
end $$;
grant execute on function public.block_player(uuid) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;

drop policy if exists "you send requests as yourself" on public.friendships;
create policy "you send requests as yourself"
  on public.friendships for insert
  to authenticated
  with check ((select auth.uid()) = requester and status = 'pending' and not public.is_blocked(requester, addressee));

create table if not exists public.reports (
  id          bigserial primary key,
  reporter    uuid not null references auth.users on delete cascade,
  target      uuid references auth.users on delete set null,
  kind        text not null check (kind in ('player', 'message', 'guild_message', 'trade', 'guild', 'auction')),
  ref         text,
  reason      text not null check (reason in ('harassment', 'hate', 'sexual', 'threat', 'spam', 'scam', 'cheating', 'name', 'other')),
  note        text not null default '' check (char_length(note) <= 500),
  evidence    jsonb not null default '{}'::jsonb,
  urgent      boolean not null default false,
  status      text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  outcome     text not null default '' check (char_length(outcome) <= 500),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references auth.users on delete set null,
  seen_at     timestamptz
);
create index if not exists reports_queue_idx on public.reports (status, urgent desc, created_at);
create index if not exists reports_reporter_idx on public.reports (reporter, created_at desc);
alter table public.reports enable row level security;
drop policy if exists "you see your own reports" on public.reports;
create policy "you see your own reports" on public.reports for select to authenticated
  using ((select auth.uid()) = reporter or public.is_control_admin());
drop policy if exists "control handles reports" on public.reports;
create policy "control handles reports" on public.reports for update to authenticated
  using (public.is_control_admin()) with check (public.is_control_admin());
grant select, update on public.reports to authenticated;

create or replace function public.file_report(p_kind text, p_ref text, p_target uuid, p_reason text, p_note text default '')
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  who uuid := p_target;
  proof jsonb := '{}'::jsonb;
  existing bigint;
  out_id bigint;
  m messages; gm guild_messages; tr trades; gu guilds; au auctions; pr profiles;
begin
  if me is null then raise exception 'sign in'; end if;
  if p_reason not in ('harassment', 'hate', 'sexual', 'threat', 'spam', 'scam', 'cheating', 'name', 'other') then raise exception 'BAD_REASON'; end if;
  if (select count(*) from reports where reporter = me and created_at > now() - interval '1 day') >= 20 then raise exception 'TOO_MANY'; end if;
  if p_kind = 'message' then
    select * into m from messages where id = p_ref::uuid and recipient = me;
    if m.id is null then raise exception 'NOT_FOUND'; end if;
    who := m.sender;
    proof := jsonb_build_object('body', m.body, 'at', m.created_at,
      'context', (select coalesce(jsonb_agg(jsonb_build_object('from', x.sender, 'body', x.body, 'at', x.created_at) order by x.created_at), '[]'::jsonb)
                  from (select * from messages where ((sender = me and recipient = m.sender) or (sender = m.sender and recipient = me))
                          and created_at <= m.created_at order by created_at desc limit 10) x));
  elsif p_kind = 'guild_message' then
    select * into gm from guild_messages where id = p_ref::uuid and guild_id = public.my_guild_id();
    if gm.id is null then raise exception 'NOT_FOUND'; end if;
    who := gm.sender;
    proof := jsonb_build_object('body', gm.body, 'at', gm.created_at, 'guild', gm.guild_id, 'name', gm.sender_name);
  elsif p_kind = 'trade' then
    select * into tr from trades where id = p_ref::uuid and (proposer = me or recipient = me);
    if tr.id is null then raise exception 'NOT_FOUND'; end if;
    who := case when tr.proposer = me then tr.recipient else tr.proposer end;
    proof := jsonb_build_object('offer', tr.offer, 'ask', tr.ask, 'status', tr.status, 'at', tr.created_at);
  elsif p_kind = 'guild' then
    select * into gu from guilds where id = p_ref::uuid;
    if gu.id is null then raise exception 'NOT_FOUND'; end if;
    who := gu.owner;
    proof := jsonb_build_object('name', gu.name, 'tag', gu.tag, 'about', gu.about);
  elsif p_kind = 'auction' then
    select * into au from auctions where id = p_ref::uuid;
    if au.id is null then raise exception 'NOT_FOUND'; end if;
    who := au.seller;
    proof := jsonb_build_object('card', au.card, 'start', au.start_price, 'bid', au.current_bid, 'status', au.status);
  elsif p_kind <> 'player' then
    raise exception 'BAD_KIND';
  end if;
  if who is null or who = me then raise exception 'NOT_FOUND'; end if;
  select * into pr from profiles where id = who;
  proof := proof || jsonb_build_object('username', pr.username, 'level', pr.level);
  select id into existing from reports where reporter = me and kind = p_kind and coalesce(ref, '') = coalesce(p_ref, '')
    and target = who and status = 'open' limit 1;
  if existing is not null then return existing; end if;
  insert into reports (reporter, target, kind, ref, reason, note, evidence, urgent)
    values (me, who, p_kind, p_ref, p_reason, left(coalesce(p_note, ''), 500), proof, p_reason in ('threat', 'sexual', 'hate'))
    returning id into out_id;
  return out_id;
end $$;
grant execute on function public.file_report(text, text, uuid, text, text) to authenticated;

create or replace function public.reports_answered()
returns table (id bigint, kind text, status text, outcome text, handled_at timestamptz, username text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.status, r.outcome, r.handled_at, coalesce(r.evidence->>'username', '')
    from reports r
    where r.reporter = auth.uid() and r.status <> 'open' and r.seen_at is null
    order by r.handled_at nulls last limit 20;
$$;

create or replace function public.reports_seen()
returns void language sql security definer set search_path = public as $$
  update reports set seen_at = now() where reporter = auth.uid() and status <> 'open' and seen_at is null;
$$;
grant execute on function public.reports_answered() to authenticated;
grant execute on function public.reports_seen() to authenticated;

create or replace function public.econ_score(p_user uuid, p_score jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  g text := p_score->>'game';
  pts integer := least(greatest(coalesce((p_score->>'points')::numeric, 0), 0), 100000)::integer;
  d text := coalesce(p_score->>'day', to_char(now() at time zone 'utc', 'YYYY-MM-DD'));
  v_max integer;
  v_existing integer;
begin
  v_max := case g when 'wikdle' then 1400 when 'duel' then 3100 when 'reveal' then 1600 when 'quiz' then 1000 else null end;
  if v_max is null or pts <= 0 then return; end if;
  pts := least(pts, v_max);
  select points into v_existing from scores where user_id = p_user and game = g and detail->>'day' = d limit 1;
  if v_existing is not null then
    if g = 'wikdle' or pts <= v_existing then return; end if;
    update scores set points = pts, at = now() where user_id = p_user and game = g and detail->>'day' = d;
    return;
  end if;
  insert into scores (user_id, game, points, detail) values (p_user, g, pts, jsonb_build_object('day', d));
end $$;
revoke all on function public.econ_score(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.econ_score(uuid, jsonb) to service_role;

create or replace function public.submit_score(p_game text, p_points integer, p_day text)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'this game is not scored by the client';
end $$;
grant execute on function public.submit_score(text, integer, text) to authenticated;

create or replace function public.profile_stats_from_server()
returns trigger language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  select state into s from econ where user_id = new.id;
  if s is null then return new; end if;
  select coalesce(sum(copies), 0)::integer, count(*)::integer, coalesce(sum(price * copies), 0)::bigint
    into new.cards, new.unique_cards, new.collection_value
    from cards where user_id = new.id;
  if jsonb_typeof(s->'progress'->'level') = 'number' then
    new.level := greatest(1, (s->'progress'->>'level')::numeric::integer);
  end if;
  new.boosters_opened := case when jsonb_typeof(s->'boostersOpened') = 'number'
    then (s->>'boostersOpened')::numeric::integer else 0 end;
  new.best_rarity := (
    select r.k from jsonb_each(case when jsonb_typeof(s->'rarityCounts') = 'object' then s->'rarityCounts' else '{}'::jsonb end) as r(k, v)
      where jsonb_typeof(r.v) = 'number' and r.v::text::numeric > 0
      order by public.rarity_rank(r.k) desc limit 1);
  return new;
end $$;
drop trigger if exists profile_stats_from_server on public.profiles;
create trigger profile_stats_from_server before update on public.profiles
  for each row execute function public.profile_stats_from_server();

create table if not exists public.rate_counters (
  user_id      uuid not null references auth.users on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  n            integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_counters enable row level security;

create or replace function public.rate_limit(p_user uuid, p_bucket text, p_max integer, p_seconds integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  c integer;
begin
  if p_user is null or public.is_control_admin(p_user) then return; end if;
  insert into rate_counters (user_id, bucket, window_start, n) values (p_user, p_bucket, w, 1)
    on conflict (user_id, bucket, window_start) do update set n = rate_counters.n + 1
    returning n into c;
  if c > p_max then raise exception 'SLOW_DOWN'; end if;
end $$;
revoke all on function public.rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit(uuid, text, integer, integer) to service_role;

create or replace function public.rate_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rate_limit(auth.uid(), tg_argv[0], tg_argv[1]::integer, tg_argv[2]::integer);
  return new;
end $$;

create or replace function public.rate_guard_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rate_limit(auth.uid(), 'rename', 3, 86400);
  return new;
end $$;

do $$
declare spec text[];
begin
  foreach spec slice 1 in array array[
    array['messages', 'rate_messages_minute', 'message', '20', '60'],
    array['messages', 'rate_messages_day', 'message-day', '1500', '86400'],
    array['guild_messages', 'rate_guild_messages_minute', 'guild-message', '20', '60'],
    array['guild_messages', 'rate_guild_messages_day', 'guild-message-day', '1500', '86400'],
    array['friendships', 'rate_friend_requests', 'friend-request', '40', '86400'],
    array['guild_invites', 'rate_guild_invites', 'guild-invite', '50', '86400'],
    array['guilds', 'rate_guilds', 'guild', '3', '86400'],
    array['challenges', 'rate_challenges', 'challenge', '40', '86400'],
    array['showcase_kudos', 'rate_kudos', 'kudos', '200', '86400'],
    array['wishlists', 'rate_wishlists', 'wishlist', '120', '60']
  ] loop
    if to_regclass('public.' || spec[1]) is null then continue; end if;
    execute format('drop trigger if exists %I on public.%I', spec[2], spec[1]);
    execute format('create trigger %I before insert on public.%I for each row execute function public.rate_guard(%L, %L, %L)',
      spec[2], spec[1], spec[3], spec[4], spec[5]);
  end loop;
end $$;

drop trigger if exists rate_renames on public.profiles;
create trigger rate_renames before update of username on public.profiles
  for each row when (old.username is distinct from new.username)
  execute function public.rate_guard_rename();

select cron.unschedule(jobid) from cron.job where jobname = 'wikster-rate-sweep';
select cron.schedule('wikster-rate-sweep', '17 3 * * *', $$delete from public.rate_counters where window_start < now() - interval '2 days'$$);

create table if not exists public.blocked_hosts (
  host       text primary key check (host = lower(host) and char_length(host) between 3 and 253),
  reason     text not null default '',
  created_at timestamptz not null default now()
);
alter table public.blocked_hosts enable row level security;
drop policy if exists "control reads blocked hosts" on public.blocked_hosts;
create policy "control reads blocked hosts" on public.blocked_hosts for select to authenticated using (public.is_control_admin());
drop policy if exists "control edits blocked hosts" on public.blocked_hosts;
create policy "control edits blocked hosts" on public.blocked_hosts for all to authenticated
  using (public.is_control_admin()) with check (public.is_control_admin());
drop policy if exists "control reads custom boosters" on public.custom_packs;
create policy "control reads custom boosters" on public.custom_packs for select to authenticated using (public.is_control_admin());
drop policy if exists "control removes custom boosters" on public.custom_packs;
create policy "control removes custom boosters" on public.custom_packs for delete to authenticated using (public.is_control_admin());
grant select, insert, update, delete on public.blocked_hosts to authenticated;
grant delete on public.custom_packs to authenticated;

create or replace function public.my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from profiles p where p.id = me),
    'wallet', (select to_jsonb(w) - 'user_id' from wallets w where w.user_id = me),
    'progress', (select e.state from econ e where e.user_id = me),
    'cards', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.first_at) from cards c where c.user_id = me), '[]'),
    'boosters', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id') from inventory i where i.user_id = me), '[]'),
    'custom_boosters', coalesce((select jsonb_agg(to_jsonb(k) - 'user_id') from custom_packs k where k.user_id = me), '[]'),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l) - 'user_id' order by l.at) from ledger l where l.user_id = me), '[]'),
    'rewards_claimed', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.at) from claims c where c.user_id = me), '[]'),
    'scores', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.at) from scores s where s.user_id = me), '[]'),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from friendships f where me in (f.requester, f.addressee)), '[]'),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from messages m where me in (m.sender, m.recipient)), '[]'),
    'gifts', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from deliveries d where me in (d.sender, d.recipient)), '[]'),
    'trades', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from trades t where me in (t.proposer, t.recipient)), '[]'),
    'auctions', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from auctions a where me in (a.seller, a.bidder)), '[]'),
    'wishlist', coalesce((select jsonb_agg(to_jsonb(w) - 'owner') from wishlists w where w.owner = me), '[]'),
    'kudos_given', coalesce((select jsonb_agg(to_jsonb(k)) from showcase_kudos k where k.sender = me), '[]'),
    'guild', (select to_jsonb(gm) - 'user_id' from guild_members gm where gm.user_id = me),
    'guild_messages', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from guild_messages g where g.sender = me), '[]'),
    'challenges', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from challenges c where me in (c.challenger, c.opponent)), '[]'),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('user', b.blocked, 'at', b.created_at)) from blocks b where b.blocker = me), '[]'),
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'reason', r.reason, 'note', r.note, 'status', r.status, 'created_at', r.created_at)) from reports r where r.reporter = me), '[]'),
    'filtered_messages', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by h.at) from filter_hits h where h.user_id = me), '[]'),
    'suspension', (select to_jsonb(s) - 'by' - 'user_id' from suspensions s where s.user_id = me),
    'backups', coalesce((select jsonb_agg(jsonb_build_object('at', b.at, 'reason', b.reason, 'cards', b.cards, 'coins', b.coins)) from saves_history b where b.user_id = me), '[]'),
    'notification_devices', coalesce((select jsonb_agg(jsonb_build_object('platform', t.platform, 'lang', t.lang, 'updated_at', t.updated_at)) from push_tokens t where t.user_id = me), '[]'),
    'error_reports', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.at) from client_errors e where e.user_id = me), '[]'),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('platform', p.platform, 'product', p.product, 'order', p.order_id, 'at', p.at, 'status', p.status)) from purchases p where p.user_id = me), '[]'),
    'ad_rewards', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.at) from ad_rewards a where a.user_id = me), '[]'),
    'steam', (select jsonb_build_object('steam_id', l.steam_id, 'linked_at', l.linked_at) from steam_links l where l.user_id = me)
  );
end $$;
grant execute on function public.my_data() to authenticated;


create or replace function public.econ_load(p_user uuid, p_bucket text default null, p_max integer default 150)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then raise exception 'AUTH'; end if;
  if p_bucket is not null then perform public.rate_limit(p_user, p_bucket, p_max, 60); end if;
  return jsonb_build_object(
    'wallet', coalesce((select jsonb_build_object('coins', w.coins, 'ink', w.ink) from wallets w where w.user_id = p_user), jsonb_build_object('coins', 0, 'ink', 0)),
    'state', coalesce((select e.state from econ e where e.user_id = p_user), '{}'::jsonb),
    'inventory', coalesce((select jsonb_object_agg(i.spec_id, jsonb_build_object('spec', i.spec, 'count', i.count)) from inventory i where i.user_id = p_user), '{}'::jsonb),
    'custom', coalesce((select jsonb_agg(jsonb_build_object('def', k.def) order by k.created_at) from custom_packs k where k.user_id = p_user), '[]'::jsonb),
    'cutover', (select extract(epoch from m.cutover_at) * 1000 from migration m limit 1),
    'born', (select extract(epoch from u.created_at) * 1000 from auth.users u where u.id = p_user)
  );
end $$;
revoke all on function public.econ_load(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.econ_load(uuid, text, integer) to service_role;

create table if not exists public.draw_pool (
  source text not null,
  key    text not null,
  card   jsonb not null,
  at     timestamptz not null default now(),
  primary key (source, key)
);
alter table public.draw_pool enable row level security;

create or replace function public.pool_take(p_source text, p_n integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  taken  jsonb;
  left_n integer;
begin
  with picked as (
    select d.key from draw_pool d
    where d.source = p_source
    order by random()
    limit greatest(0, least(coalesce(p_n, 0), 50))
    for update skip locked
  ), gone as (
    delete from draw_pool d using picked p
    where d.source = p_source and d.key = p.key
    returning d.card
  )
  select coalesce(jsonb_agg(card), '[]'::jsonb) into taken from gone;
  select count(*) into left_n from draw_pool where source = p_source;
  return jsonb_build_object('cards', taken, 'left', left_n);
end $$;
revoke all on function public.pool_take(text, integer) from public, anon, authenticated;
grant execute on function public.pool_take(text, integer) to service_role;

create or replace function public.pool_put(p_source text, p_cards jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  added integer;
begin
  insert into draw_pool (source, key, card)
    select p_source, c->>'key', c
    from jsonb_array_elements(coalesce(p_cards, '[]'::jsonb)) c
    where coalesce(c->>'key', '') <> ''
    limit 100
    on conflict (source, key) do nothing;
  get diagnostics added = row_count;
  delete from draw_pool d
    where d.source = p_source
      and d.key in (select key from draw_pool where source = p_source order by at desc offset 200);
  return added;
end $$;
revoke all on function public.pool_put(text, jsonb) from public, anon, authenticated;
grant execute on function public.pool_put(text, jsonb) to service_role;

create table if not exists public.wiki_pools (
  pool         text primary key check (char_length(pool) between 3 and 300),
  kind         text not null default 'wiki',
  size         integer not null default 0,
  fetched_at   timestamptz,
  used_at      timestamptz not null default now(),
  refill_after timestamptz,
  fails        integer not null default 0
);
alter table public.wiki_pools enable row level security;

create table if not exists public.wiki_pool (
  pool text not null references public.wiki_pools (pool) on delete cascade,
  key  text not null,
  card jsonb not null,
  at   timestamptz not null default now(),
  primary key (pool, key)
);
alter table public.wiki_pool enable row level security;
create index if not exists wiki_pools_used_idx on public.wiki_pools (used_at);

drop function if exists public.wiki_pool_draw(text, integer, integer, integer, text);
create or replace function public.wiki_pool_draw(p_pool text, p_n integer, p_low integer default 120, p_stale integer default 21600, p_kind text default 'wiki',
  p_user uuid default null, p_rotate boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m     wiki_pools;
  cards jsonb;
  fresh integer := 0;
  due   boolean := false;
begin
  if p_pool is null or char_length(p_pool) not between 3 and 300 then raise exception 'BAD_POOL'; end if;
  with held as (
    select c.article_key as k from cards c
      where p_user is not null and c.user_id = p_user
        and c.article_key in (select w.key from wiki_pool w where w.pool = p_pool)
    union
    select e->'article'->>'key' from pulls p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.cards) = 'array' then p.cards else '[]'::jsonb end) e
      where p_user is not null and p.user_id = p_user and p.claimed_at is null
  ), picked as (
    select w.card, (h.k is not null) as stale
      from wiki_pool w left join held h on h.k = w.key
      where w.pool = p_pool
      order by (h.k is not null), random()
      limit greatest(0, least(coalesce(p_n, 0), 400))
  )
  select coalesce(jsonb_agg(x.card order by x.stale), '[]'::jsonb), count(*) filter (where not x.stale)
    into cards, fresh from picked x;
  select * into m from wiki_pools where pool = p_pool;
  if not found then
    insert into wiki_pools (pool, kind, refill_after) values (p_pool, coalesce(p_kind, 'wiki'), now() + interval '3 minutes')
      on conflict (pool) do nothing;
    due := found;
  elsif (coalesce(p_rotate, false) or m.size < coalesce(p_low, 0)
         or (coalesce(p_stale, 0) > 0 and (m.fetched_at is null or m.fetched_at < now() - make_interval(secs => p_stale))))
        and (m.refill_after is null or m.refill_after < now()) then
    update wiki_pools set refill_after = now() + interval '3 minutes', used_at = now()
      where pool = p_pool and (refill_after is null or refill_after < now());
    due := found;
  elsif m.used_at < now() - interval '1 hour' then
    update wiki_pools set used_at = now() where pool = p_pool;
  end if;
  return jsonb_build_object('cards', cards, 'fresh', fresh, 'size', coalesce(m.size, 0), 'due', due);
end $$;
revoke all on function public.wiki_pool_draw(text, integer, integer, integer, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.wiki_pool_draw(text, integer, integer, integer, text, uuid, boolean) to service_role;

create or replace function public.wiki_pool_fill(p_pool text, p_kind text, p_cards jsonb, p_max integer default 300, p_total integer default 20000)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n     integer;
  total integer;
  drop_pool text;
begin
  if p_pool is null or char_length(p_pool) not between 3 and 300 then raise exception 'BAD_POOL'; end if;
  insert into wiki_pools (pool, kind) values (p_pool, coalesce(p_kind, 'wiki')) on conflict (pool) do nothing;
  insert into wiki_pool (pool, key, card)
    select p_pool, c->>'key', c
      from jsonb_array_elements(case when jsonb_typeof(p_cards) = 'array' then p_cards else '[]'::jsonb end) c
      where coalesce(c->>'key', '') <> '' and char_length(c->>'key') <= 300 and octet_length(c::text) <= 4000
      limit 600
    on conflict (pool, key) do update set card = excluded.card, at = now();
  delete from wiki_pool w
    where w.pool = p_pool
      and w.key in (select key from wiki_pool where pool = p_pool order by at desc, random() offset greatest(1, least(coalesce(p_max, 300), 1500)));
  select count(*) into n from wiki_pool where pool = p_pool;
  update wiki_pools
    set refill_after = now() + case when n - size < 16 then interval '6 hours' else interval '10 minutes' end,
        size = n, fetched_at = now(), fails = 0, used_at = now()
    where pool = p_pool;
  select coalesce(sum(size), 0) into total from wiki_pools;
  while total > greatest(100, coalesce(p_total, 20000)) loop
    select pool into drop_pool from wiki_pools
      where pool <> p_pool and size > 0
      order by (kind = 'custom' and used_at < now() - interval '7 days') desc, used_at asc
      limit 1;
    exit when drop_pool is null;
    delete from wiki_pools where pool = drop_pool;
    select coalesce(sum(size), 0) into total from wiki_pools;
  end loop;
  return n;
end $$;
revoke all on function public.wiki_pool_fill(text, text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.wiki_pool_fill(text, text, jsonb, integer, integer) to service_role;

create or replace function public.wiki_pool_fail(p_pool text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update wiki_pools
    set fails = least(fails + 1, 8),
        refill_after = now() + make_interval(secs => least(3600, 60 * power(2, least(fails, 6))::integer))
    where pool = p_pool;
end $$;
revoke all on function public.wiki_pool_fail(text) from public, anon, authenticated;
grant execute on function public.wiki_pool_fail(text) to service_role;

create or replace function public.wiki_pool_release(p_pool text)
returns void language sql security definer set search_path = public as $$
  update wiki_pools set refill_after = null where pool = p_pool and refill_after > now();
$$;
revoke all on function public.wiki_pool_release(text) from public, anon, authenticated;
grant execute on function public.wiki_pool_release(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'wikster-retention';
select cron.schedule('wikster-retention', '37 3 * * *', $$
  delete from public.filter_hits where at < now() - interval '90 days';
  delete from public.reports where status <> 'open' and handled_at < now() - interval '365 days';
  delete from public.draw_pool where at < now() - interval '30 days';
  delete from public.wiki_pools where used_at < now() - case when kind = 'custom' then interval '7 days' else interval '30 days' end;
  delete from public.pulls p where p.claimed_at is null and p.at < now() - interval '30 days'
    and not exists (select 1 from public.inventory i where i.user_id = p.user_id and i.spec_id = p.spec_id);
$$);

do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net is not available here'; end $$;

create table if not exists public.push_tokens (
  token      text primary key check (char_length(token) between 20 and 4096),
  user_id    uuid not null references auth.users on delete cascade,
  platform   text not null check (platform in ('android', 'ios', 'web')),
  lang       text not null default 'en' check (lang in ('en', 'fr')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

create table if not exists public.push_config (
  id     integer primary key default 1 check (id = 1),
  url    text,
  secret text
);
alter table public.push_config enable row level security;

create or replace function public.register_push_token(p_token text, p_platform text, p_lang text default 'en')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORISED'; end if;
  perform public.rate_limit(auth.uid(), 'push-token', 20, 86400);
  insert into push_tokens (token, user_id, platform, lang, updated_at)
    values (p_token, auth.uid(), p_platform, case when p_lang = 'fr' then 'fr' else 'en' end, now())
    on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,
      lang = excluded.lang, updated_at = now();
  delete from push_tokens where user_id = auth.uid() and token not in (
    select token from push_tokens where user_id = auth.uid() order by updated_at desc limit 5);
end $$;
revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

create or replace function public.drop_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;
revoke all on function public.drop_push_token(text) from public, anon;
grant execute on function public.drop_push_token(text) to authenticated;

create or replace function public.push_notify(p_user uuid, p_kind text, p_from uuid, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare
  cfg push_config;
begin
  if p_user is null or p_user = p_from then return; end if;
  if not exists (select 1 from push_tokens where user_id = p_user) then return; end if;
  if exists (select 1 from blocks b where b.blocker = p_user and b.blocked = p_from) then return; end if;
  select * into cfg from push_config where id = 1;
  if cfg.url is null or cfg.secret is null or to_regproc('net.http_post') is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 4000)'
    using cfg.url,
          jsonb_build_object('user', p_user, 'kind', p_kind, 'from', p_from, 'ref', p_ref),
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret);
exception when others then
  raise notice 'push_notify skipped: %', sqlerrm;
end $$;
revoke all on function public.push_notify(uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.push_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  case tg_table_name
    when 'messages' then perform public.push_notify(new.recipient, 'message', new.sender, new.id::text);
    when 'friendships' then
      if new.status = 'pending' then perform public.push_notify(new.addressee, 'friend', new.requester, new.id::text); end if;
    when 'deliveries' then
      if new.kind <> 'trade-return' then perform public.push_notify(new.recipient, 'gift', new.sender, new.id::text); end if;
    when 'trades' then perform public.push_notify(new.recipient, 'trade', new.proposer, new.id::text);
    when 'guild_invites' then perform public.push_notify(new.invitee, 'guild', new.inviter, new.guild_id::text);
    else null;
  end case;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['messages', 'friendships', 'deliveries', 'trades', 'guild_invites'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists push_%1$s on public.%1$I', t);
    execute format('create trigger push_%1$s after insert on public.%1$I for each row execute function public.push_on_insert()', t);
  end loop;
end $$;

create or replace function public.push_targets(p_user uuid)
returns table (token text, platform text, lang text) language sql security definer set search_path = public as $$
  select token, platform, lang from push_tokens where user_id = p_user order by updated_at desc limit 5;
$$;
revoke all on function public.push_targets(uuid) from public, anon, authenticated;
grant execute on function public.push_targets(uuid) to service_role;

create table if not exists public.client_errors (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  user_id     uuid references auth.users on delete set null,
  kind        text not null check (kind in ('error', 'rejection', 'native', 'econ')),
  message     text not null check (char_length(message) <= 500),
  stack       text check (char_length(stack) <= 6000),
  build       text check (char_length(build) <= 60),
  platform    text check (platform in ('web', 'apk', 'pc', 'steam')),
  screen      text check (char_length(screen) <= 40),
  fingerprint text not null check (char_length(fingerprint) <= 200),
  count       integer not null default 1
);
create index if not exists client_errors_recent_idx on public.client_errors (last_at desc);
create index if not exists client_errors_print_idx on public.client_errors (fingerprint, user_id, last_at desc);
alter table public.client_errors enable row level security;
drop policy if exists "control reads the error log" on public.client_errors;
create policy "control reads the error log" on public.client_errors for select to authenticated
  using (public.is_control_admin());

create or replace function public.report_errors(p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  kept integer := 0;
  hit bigint;
  print text;
begin
  if auth.uid() is null then raise exception 'UNAUTHORISED'; end if;
  perform public.rate_limit(auth.uid(), 'error-report', 30, 3600);
  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) limit 10 loop
    print := left(coalesce(item->>'fingerprint', item->>'message', '?'), 200);
    select id into hit from client_errors
      where fingerprint = print and user_id = auth.uid() and last_at > now() - interval '1 day'
      order by last_at desc limit 1;
    if hit is not null then
      update client_errors set count = count + greatest(1, least(coalesce((item->>'count')::integer, 1), 1000)), last_at = now()
        where id = hit;
    else
      insert into client_errors (user_id, kind, message, stack, build, platform, screen, fingerprint, count)
      values (auth.uid(),
        case when item->>'kind' in ('error', 'rejection', 'native', 'econ') then item->>'kind' else 'error' end,
        left(coalesce(item->>'message', '?'), 500),
        left(item->>'stack', 6000),
        left(item->>'build', 60),
        case when item->>'platform' in ('web', 'apk', 'pc', 'steam') then item->>'platform' else 'web' end,
        left(item->>'screen', 40),
        print,
        greatest(1, least(coalesce((item->>'count')::integer, 1), 1000)));
    end if;
    kept := kept + 1;
  end loop;
  return kept;
end $$;
revoke all on function public.report_errors(jsonb) from public, anon;
grant execute on function public.report_errors(jsonb) to authenticated;

create or replace function public.ops_health()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'at', now(),
    'errors_hour', (select coalesce(sum(count), 0) from client_errors where last_at > now() - interval '1 hour'),
    'errors_day', (select coalesce(sum(count), 0) from client_errors where last_at > now() - interval '1 day'),
    'error_players_hour', (select count(distinct user_id) from client_errors where last_at > now() - interval '1 hour'),
    'top_errors', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select kind, left(message, 160) as message, sum(count) as n, count(distinct user_id) as players, max(build) as build
      from client_errors where last_at > now() - interval '1 day'
      group by kind, left(message, 160) order by sum(count) desc limit 8) t),
    'coins_minted_day', (select coalesce(sum(coins), 0) from ledger where coins > 0 and at > now() - interval '1 day'),
    'top_earner_day', (select coalesce(max(n), 0) from (select sum(coins) as n from ledger
      where coins > 0 and at > now() - interval '1 day' and kind <> 'import' group by user_id) t),
    'urgent_reports', (select count(*) from reports where status = 'open' and urgent),
    'open_reports', (select count(*) from reports where status = 'open'),
    'players_day', (select count(*) from econ where updated_at > now() - interval '1 day'),
    'signups_day', (select count(*) from auth.users where created_at > now() - interval '1 day'),
    'db_bytes', pg_database_size(current_database())
  );
$$;
revoke all on function public.ops_health() from public, anon, authenticated;
grant execute on function public.ops_health() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'wikster-error-sweep';
select cron.schedule('wikster-error-sweep', '47 3 * * *', $$delete from public.client_errors where last_at < now() - interval '30 days'$$);

create or replace function public.username_available(name text)
returns boolean language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.rate_limit(auth.uid(), 'name-check', 60, 60);
  return not exists (select 1 from public.profiles p where lower(p.username) = lower(name));
end $$;
revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

create table if not exists public.purchases (
  id        bigserial primary key,
  user_id   uuid references auth.users on delete set null,
  platform  text not null check (platform in ('google', 'apple', 'steam')),
  product   text not null,
  order_id  text not null,
  token     text,
  at        timestamptz not null default now(),
  status    text not null default 'granted' check (status in ('granted', 'refunded')),
  unique (platform, order_id)
);
create index if not exists purchases_user_idx on public.purchases (user_id, at desc);
alter table public.purchases enable row level security;
drop policy if exists "you read your own purchases" on public.purchases;
create policy "you read your own purchases" on public.purchases for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "control reads purchases" on public.purchases;
create policy "control reads purchases" on public.purchases for select to authenticated using (public.is_control_admin());

create or replace function public.record_purchase(p_user uuid, p_platform text, p_product text, p_order text, p_token text, p_grants jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
begin
  insert into purchases (user_id, platform, product, order_id, token)
    values (p_user, p_platform, p_product, p_order, p_token)
    on conflict (platform, order_id) do nothing
    returning id into new_id;
  if new_id is null then
    if exists (select 1 from purchases where platform = p_platform and order_id = p_order and user_id = p_user) then
      return 'already';
    end if;
    return 'other';
  end if;
  insert into grants (user_id, kind, payload, note_en, note_fr)
    select p_user, g->>'kind', coalesce(g->'payload', '{}'::jsonb), coalesce(g->>'note_en', ''), coalesce(g->>'note_fr', '')
    from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) g;
  insert into ledger (user_id, kind, coins, ink, reason, detail)
    values (p_user, 'purchase', 0, 0, p_product, jsonb_build_object('platform', p_platform, 'order', p_order));
  return 'granted';
end $$;
revoke all on function public.record_purchase(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_purchase(uuid, text, text, text, text, jsonb) to service_role;

create table if not exists public.ad_rewards (
  transaction_id text primary key,
  user_id        uuid not null references auth.users on delete cascade,
  reward         text not null check (reward in ('coins', 'ink', 'booster')),
  at             timestamptz not null default now(),
  paid           boolean not null default false
);
create index if not exists ad_rewards_user_day_idx on public.ad_rewards (user_id, at desc);
alter table public.ad_rewards enable row level security;
drop policy if exists "you read your own ad rewards" on public.ad_rewards;
create policy "you read your own ad rewards" on public.ad_rewards for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.record_ad_reward(p_tx text, p_user uuid, p_reward text, p_cap integer, p_grant jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  today integer;
  inserted text;
begin
  if not exists (select 1 from auth.users where id = p_user) then return 'unknown'; end if;
  select count(*) into today from ad_rewards
    where user_id = p_user and paid and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  insert into ad_rewards (transaction_id, user_id, reward, paid)
    values (p_tx, p_user, p_reward, today < p_cap)
    on conflict (transaction_id) do nothing
    returning transaction_id into inserted;
  if inserted is null then return 'already'; end if;
  if today >= p_cap then return 'capped'; end if;
  insert into grants (user_id, kind, payload, note_en, note_fr)
    values (p_user, p_grant->>'kind', coalesce(p_grant->'payload', '{}'::jsonb), coalesce(p_grant->>'note_en', ''), coalesce(p_grant->>'note_fr', ''));
  return 'paid';
end $$;
revoke all on function public.record_ad_reward(text, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.record_ad_reward(text, uuid, text, integer, jsonb) to service_role;

create or replace function public.ads_left_today(p_cap integer default 5)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, p_cap - (select count(*)::integer from ad_rewards
    where user_id = auth.uid() and paid and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'));
$$;
revoke all on function public.ads_left_today(integer) from public, anon;
grant execute on function public.ads_left_today(integer) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'wikster-ad-sweep';
select cron.schedule('wikster-ad-sweep', '57 3 * * *', $$delete from public.ad_rewards where at < now() - interval '90 days'$$);

create table if not exists public.steam_links (
  steam_id  text primary key check (steam_id ~ '^[0-9]{5,20}$'),
  user_id   uuid not null unique references auth.users on delete cascade,
  linked_at timestamptz not null default now()
);
alter table public.steam_links enable row level security;
drop policy if exists "you see your own steam link" on public.steam_links;
create policy "you see your own steam link" on public.steam_links for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.link_steam(p_user uuid, p_steam text)
returns text language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from steam_links where steam_id = p_steam;
  if owner is not null then
    return case when owner = p_user then 'already' else 'taken' end;
  end if;
  delete from steam_links where user_id = p_user;
  insert into steam_links (steam_id, user_id) values (p_steam, p_user);
  return 'linked';
end $$;
revoke all on function public.link_steam(uuid, text) from public, anon, authenticated;
grant execute on function public.link_steam(uuid, text) to service_role;

-- save sync
create table if not exists public.save_keys (
  user_id    uuid not null references auth.users on delete cascade,
  key        text not null check (key in ('wikster.profile.v1', 'wikster.language', 'wikster.ripDirection', 'wikster.theme')),
  value      text not null check (octet_length(value) <= 204800),
  stamp      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.save_keys enable row level security;
drop policy if exists "you read only your own save keys" on public.save_keys;
create policy "you read only your own save keys"
  on public.save_keys for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "you delete only your own save keys" on public.save_keys;
create policy "you delete only your own save keys"
  on public.save_keys for delete to authenticated using ((select auth.uid()) = user_id);
grant select, delete on public.save_keys to authenticated;

create table if not exists public.save_meta (
  user_id   uuid primary key references auth.users on delete cascade,
  build     jsonb,
  backup_at timestamptz,
  seeded_at timestamptz not null default now()
);
alter table public.save_meta enable row level security;
drop policy if exists "you read only your own save meta" on public.save_meta;
create policy "you read only your own save meta"
  on public.save_meta for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "you delete only your own save meta" on public.save_meta;
create policy "you delete only your own save meta"
  on public.save_meta for delete to authenticated using ((select auth.uid()) = user_id);
grant select, delete on public.save_meta to authenticated;

create or replace function public.save_blob_keys(p_blob jsonb)
returns table (key text, value text, stamp bigint)
language sql immutable set search_path = public, pg_temp as $$
  select r.k, r.v, r.s from (
    select k,
      coalesce(
        case when jsonb_typeof(p_blob->'data'->k) = 'string' then p_blob->'data'->>k end,
        case when jsonb_typeof(p_blob->'data'->('packywiki.' || substr(k, 9))) = 'string' then p_blob->'data'->>('packywiki.' || substr(k, 9)) end
      ) as v,
      coalesce(
        case when jsonb_typeof(p_blob->'stamps'->k) = 'number' and (p_blob->'stamps'->>k)::numeric > 0
          then floor((p_blob->'stamps'->>k)::numeric)::bigint end,
        case when jsonb_typeof(p_blob->'stamps'->('packywiki.' || substr(k, 9))) = 'number' and (p_blob->'stamps'->>('packywiki.' || substr(k, 9)))::numeric > 0
          then floor((p_blob->'stamps'->>('packywiki.' || substr(k, 9)))::numeric)::bigint end,
        case when jsonb_typeof(p_blob->'at') = 'number' and (p_blob->>'at')::numeric > 0 then floor((p_blob->>'at')::numeric)::bigint end,
        0
      ) as s
    from unnest(array['wikster.profile.v1', 'wikster.language', 'wikster.ripDirection', 'wikster.theme']) as k
    where p_blob->>'format' in ('wikster-save', 'wiklodo-save', 'packywiki-save')
      and jsonb_typeof(p_blob->'data') = 'object'
  ) r
  where r.v is not null and octet_length(r.v) <= 204800;
$$;

create or replace function public.saves_to_keys()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('wikster.quiet', true), '') = '1' then return null; end if;
  perform 1 from save_meta m where m.user_id = new.user_id for update;
  if not found then return null; end if;
  insert into save_keys as s (user_id, key, value, stamp, updated_at)
    select new.user_id, b.key, b.value, b.stamp, clock_timestamp() from public.save_blob_keys(new.data) b
  on conflict (user_id, key) do update
    set value = excluded.value, stamp = excluded.stamp,
        updated_at = case when s.value is distinct from excluded.value then excluded.updated_at else s.updated_at end
    where s.stamp < excluded.stamp;
  return null;
end $$;
drop trigger if exists saves_to_keys on public.saves;
create trigger saves_to_keys after insert or update on public.saves
  for each row execute function public.saves_to_keys();

create or replace function public.keep_save_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reason text := case when tg_op = 'DELETE' then 'erase' else 'update' end;
  v_coins bigint;
begin
  if coalesce(current_setting('wikster.quiet', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then return old; end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from saves_history h where h.user_id = old.user_id and h.at > now() - interval '10 minutes'
  ) then
    return new;
  end if;
  select w.coins into v_coins from wallets w where w.user_id = old.user_id;
  if v_coins is null and jsonb_typeof(old.data->'data'->'wikster.wallet.v1') = 'string' then
    begin
      v_coins := (old.data->'data'->>'wikster.wallet.v1')::bigint;
    exception when others then v_coins := null; end;
  end if;
  insert into saves_history (user_id, reason, cards, coins, data)
    values (old.user_id, v_reason, (select p.unique_cards from profiles p where p.id = old.user_id), v_coins, old.data);
  delete from saves_history h where h.id in (
    select x.id from saves_history x where x.user_id = old.user_id order by x.at desc offset 40
  );
  return coalesce(new, old);
end $$;
drop trigger if exists saves_history_keep on public.saves;
create trigger saves_history_keep before update or delete on public.saves
  for each row execute function public.keep_save_history();

create or replace function public.thin_save_history()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from saves_history h
  using (
    select b.id, row_number() over (partition by b.user_id, b.bucket order by b.at desc) as rn
    from (
      select x.id, x.user_id, x.at,
        case when x.at > now() - interval '1 day' then to_char(x.at, 'YYYYMMDDHH24')
             else to_char(x.at, 'YYYYMMDD') end as bucket
      from saves_history x
      where x.reason = 'update'
    ) b
  ) k
  where h.id = k.id and k.rn > 1;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.thin_save_history() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'wikster-save-thin';
select cron.schedule('wikster-save-thin', '27 3 * * *', $$select public.thin_save_history()$$);

create or replace function public.sync_me(
  p_patch jsonb default '{}'::jsonb,
  p_since timestamptz default null,
  p_stats jsonb default null,
  p_build jsonb default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_keys constant text[] := array['wikster.profile.v1', 'wikster.language', 'wikster.ripDirection', 'wikster.theme'];
  v_meta public.save_meta%rowtype;
  v_n integer;
  v_outdated boolean := false;
  v_blob jsonb;
  v_backup jsonb;
  v_key text;
  v_item jsonb;
  v_value text;
  v_stamp bigint;
  v_old_value text;
  v_old_stamp bigint;
  v_have jsonb := '{}'::jsonb;
  v_written text[] := '{}';
  v_lost text[] := '{}';
  v_refused text[] := '{}';
  v_play bigint;
  v_rank text;
  v_badges jsonb;
  v_showcase jsonb;
begin
  if v_me is null then raise exception 'SIGN_IN'; end if;

  select * into v_meta from save_meta where user_id = v_me for update;
  if not found then
    if not exists (select 1 from econ e where e.user_id = v_me and e.state ? 'imported') then
      return jsonb_build_object('live', false);
    end if;
    insert into save_meta (user_id) values (v_me) on conflict (user_id) do nothing;
    get diagnostics v_n = row_count;
    select * into v_meta from save_meta where user_id = v_me for update;
    if v_n > 0 then
      select s.data into v_blob from saves s where s.user_id = v_me;
      if v_blob is not null then
        insert into save_keys (user_id, key, value, stamp, updated_at)
          select v_me, b.key, b.value, b.stamp, v_now from public.save_blob_keys(v_blob) b
          on conflict (user_id, key) do nothing;
        if jsonb_typeof(v_blob->'build') = 'object' then
          update save_meta set build = v_blob->'build' where user_id = v_me;
          v_meta.build := v_blob->'build';
        end if;
      end if;
    end if;
  end if;

  if jsonb_typeof(p_build) = 'object' and jsonb_typeof(v_meta.build) = 'object'
     and coalesce(v_meta.build->>'sha', '') <> ''
     and v_meta.build->>'sha' is distinct from p_build->>'sha'
     and (case when jsonb_typeof(v_meta.build->'at') = 'number' then (v_meta.build->>'at')::numeric else 0 end)
       > (case when jsonb_typeof(p_build->'at') = 'number' then (p_build->>'at')::numeric else 0 end) then
    v_outdated := true;
  end if;

  if not v_outdated and jsonb_typeof(p_patch) = 'object' then
    if (v_meta.backup_at is null or v_meta.backup_at < v_now - interval '10 minutes')
       and exists (select 1 from jsonb_each(p_patch) e where e.key = any(v_keys) and jsonb_typeof(e.value->'value') = 'string') then
      select jsonb_build_object(
          'format', 'wikster-save', 'version', 2,
          'at', floor(extract(epoch from v_now) * 1000)::bigint,
          'build', v_meta.build,
          'data', jsonb_object_agg(k.key, k.value),
          'stamps', jsonb_object_agg(k.key, k.stamp))
        into v_backup
        from save_keys k where k.user_id = v_me
        having count(*) > 0;
    end if;

    for v_key, v_item in select e.key, e.value from jsonb_each(p_patch) e loop
      if not (v_key = any(v_keys)) or jsonb_typeof(v_item) <> 'object' then continue; end if;
      if jsonb_typeof(v_item->'value') is distinct from 'string' then
        if jsonb_typeof(v_item->'have') = 'number' then
          v_have := v_have || jsonb_build_object(v_key, floor((v_item->>'have')::numeric)::bigint);
        end if;
        continue;
      end if;
      v_value := v_item->>'value';
      if octet_length(v_value) > 204800 then
        v_refused := v_refused || v_key;
        continue;
      end if;
      v_stamp := case when jsonb_typeof(v_item->'stamp') = 'number'
        then greatest(0, floor((v_item->>'stamp')::numeric))::bigint else 0 end;
      select k.value, k.stamp into v_old_value, v_old_stamp from save_keys k where k.user_id = v_me and k.key = v_key;
      if not found then
        insert into save_keys (user_id, key, value, stamp, updated_at) values (v_me, v_key, v_value, v_stamp, v_now);
        v_written := v_written || v_key;
      elsif v_old_stamp < v_stamp then
        if v_old_value is distinct from v_value then
          update save_keys set value = v_value, stamp = v_stamp, updated_at = v_now where user_id = v_me and key = v_key;
          v_written := v_written || v_key;
        else
          update save_keys set stamp = v_stamp where user_id = v_me and key = v_key;
          v_have := v_have || jsonb_build_object(v_key, v_stamp);
        end if;
      elsif v_old_value is distinct from v_value then
        v_lost := v_lost || v_key;
      else
        v_have := v_have || jsonb_build_object(v_key, v_old_stamp);
      end if;
    end loop;

    if cardinality(v_written) > 0 then
      if v_backup is not null then
        insert into saves_history (user_id, reason, cards, coins, data)
          values (v_me, 'update',
            (select p.unique_cards from profiles p where p.id = v_me),
            (select w.coins from wallets w where w.user_id = v_me),
            v_backup);
        update save_meta set backup_at = v_now where user_id = v_me;
        delete from saves_history h where h.id in (
          select x.id from saves_history x where x.user_id = v_me order by x.at desc offset 40
        );
      end if;
      if jsonb_typeof(p_build) = 'object' and coalesce(p_build->>'sha', '') <> ''
         and (v_meta.build is null or v_meta.build->>'sha' is distinct from p_build->>'sha') then
        update save_meta set build = p_build where user_id = v_me;
        perform set_config('wikster.quiet', '1', true);
        update saves set data = jsonb_set(data, '{build}', p_build) where user_id = v_me;
        perform set_config('wikster.quiet', '', true);
      end if;
    end if;
  end if;

  if not v_outdated then
    if jsonb_typeof(p_stats->'playMs') = 'number' then
      v_play := greatest(0, floor((p_stats->>'playMs')::numeric))::bigint;
    end if;
    if jsonb_typeof(p_stats->'rank') = 'string' then v_rank := left(p_stats->>'rank', 60); end if;
    if jsonb_typeof(p_stats->'badges') = 'object' and octet_length((p_stats->'badges')::text) <= 20000 then
      v_badges := p_stats->'badges';
    end if;
    if jsonb_typeof(p_stats->'showcase') = 'array' and octet_length((p_stats->'showcase')::text) <= 20000 then
      select coalesce(jsonb_agg(t.x order by t.i), '[]'::jsonb) into v_showcase
        from jsonb_array_elements(p_stats->'showcase') with ordinality as t(x, i) where t.i <= 10;
    end if;
    update profiles p set
      play_ms = coalesce(v_play, p.play_ms),
      rank = coalesce(v_rank, p.rank),
      badges = coalesce(v_badges, p.badges),
      showcase = coalesce(v_showcase, p.showcase),
      last_seen_at = case when p.last_seen_at < v_now - interval '60 seconds' then v_now else p.last_seen_at end
    where p.id = v_me and (
      (v_play is not null and v_play is distinct from p.play_ms)
      or (v_rank is not null and v_rank is distinct from p.rank)
      or (v_badges is not null and v_badges is distinct from p.badges)
      or (v_showcase is not null and v_showcase is distinct from p.showcase)
      or p.last_seen_at < v_now - interval '60 seconds'
    );
  end if;

  return jsonb_build_object(
    'live', true,
    'outdated', v_outdated,
    'now', v_now,
    'build', v_meta.build,
    'refused', to_jsonb(v_refused),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('key', k.key, 'value', k.value, 'stamp', k.stamp))
      from save_keys k
      where k.user_id = v_me
        and not (k.key = any(v_written))
        and (
          k.key = any(v_lost)
          or ((p_since is null or k.updated_at > p_since - interval '5 seconds')
              and not (v_have ? k.key and (v_have->>k.key)::bigint = k.stamp))
        )
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.sync_me(jsonb, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.sync_me(jsonb, timestamptz, jsonb, jsonb) to authenticated;

create or replace function public.friend_cards(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not (auth.uid() = target or public.are_friends(auth.uid(), target)) then
    return jsonb_build_object('allowed', false);
  end if;
  if exists (select 1 from econ e where e.user_id = target and e.state ? 'imported') then
    return jsonb_build_object('allowed', true, 'cards', (
      select jsonb_build_object('entries', coalesce(jsonb_object_agg(c.article_key,
        c.data || jsonb_build_object(
          'key', c.article_key, 'title', c.title, 'rarityId', c.rarity_id, 'price', c.price,
          'count', c.copies, 'lang', c.lang, 'packId', c.pack_id, 'favorite', c.favorite)), '{}'::jsonb))::text
      from cards c where c.user_id = target));
  end if;
  return jsonb_build_object('allowed', true, 'cards', (
    select s.data -> 'data' ->> 'wikster.collection.v3' from saves s where s.user_id = target));
end $$;
revoke all on function public.friend_cards(uuid) from public;
grant execute on function public.friend_cards(uuid) to authenticated;

notify pgrst, 'reload schema';

-- live broadcast
create or replace function public.live_send(p_topic text, p_event text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when others then
  raise warning 'live_send % %: %', p_topic, p_event, sqlerrm;
end $$;
revoke all on function public.live_send(text, text, jsonb) from public, anon, authenticated;

create or replace function public.live_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  pay jsonb;
begin
  begin
    if tg_table_name = 'messages' then
      perform live_send('user:' || (r->>'recipient'), 'message', jsonb_build_object('type', tg_op, 'row', r));
    elsif tg_table_name = 'deliveries' then
      pay := jsonb_build_object('type', tg_op, 'row', (r - 'payload') || jsonb_build_object('payload', jsonb_strip_nulls(jsonb_build_object(
        'title', r->'payload'->'title', 'amount', r->'payload'->'amount', 'reason', r->'payload'->'reason'))));
      perform live_send('user:' || (r->>'recipient'), 'delivery', pay);
    elsif tg_table_name = 'friendships' then
      pay := jsonb_build_object('type', tg_op, 'row', r);
      perform live_send('user:' || (r->>'requester'), 'friendship', pay);
      perform live_send('user:' || (r->>'addressee'), 'friendship', pay);
    elsif tg_table_name = 'trades' then
      pay := jsonb_build_object('type', tg_op, 'row', r - 'offer' - 'ask');
      perform live_send('user:' || (r->>'proposer'), 'trade', pay);
      perform live_send('user:' || (r->>'recipient'), 'trade', pay);
    elsif tg_table_name = 'challenges' then
      pay := jsonb_build_object('type', tg_op, 'row', (r - 'payload' - 'reply' - 'result') || jsonb_build_object('result',
        case when jsonb_typeof(r->'result') = 'object' then jsonb_build_object('winner', r->'result'->'winner') else null end));
      perform live_send('user:' || (r->>'challenger'), 'challenge', pay);
      perform live_send('user:' || (r->>'opponent'), 'challenge', pay);
    elsif tg_table_name = 'guild_invites' then
      perform live_send('user:' || (r->>'invitee'), 'guild-invite', jsonb_build_object('type', tg_op, 'row', r));
    elsif tg_table_name = 'guild_messages' then
      perform live_send('guild:' || (r->>'guild_id'), 'message', jsonb_build_object('type', tg_op, 'row', r));
    elsif tg_table_name = 'guild_bank' then
      perform live_send('guild:' || (r->>'guild_id'), 'bank', jsonb_build_object('type', tg_op));
    elsif tg_table_name = 'guild_members' then
      perform live_send('guild:' || (r->>'guild_id'), 'member', jsonb_build_object('type', tg_op));
    elsif tg_table_name = 'guild_goals' then
      perform live_send('guild:' || (r->>'guild_id'), 'goal', jsonb_build_object('type', tg_op, 'row', r));
    elsif tg_table_name = 'auctions' then
      perform live_send('market', 'auction', case when tg_op = 'DELETE' then jsonb_build_object('type', tg_op)
        else jsonb_build_object('type', tg_op, 'row', r) end);
    end if;
  exception when others then
    raise warning 'live_row %: %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

create or replace function public.live_read()
returns trigger language plpgsql security definer set search_path = public as $$
declare x record;
begin
  begin
    for x in
      select f.sender, f.recipient, max(f.read_at) as read_at, max(f.created_at) as created_at,
        (array_agg(f.id order by f.created_at desc))[1] as id
      from live_fresh f join live_stale s on s.id = f.id
      where f.read_at is not null and s.read_at is null
      group by f.sender, f.recipient
    loop
      perform live_send('user:' || x.sender, 'read', jsonb_build_object('type', 'UPDATE', 'row', jsonb_build_object(
        'id', x.id, 'sender', x.sender, 'recipient', x.recipient, 'read_at', x.read_at, 'created_at', x.created_at)));
    end loop;
  exception when others then
    raise warning 'live_read: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists live_row on public.messages;
create trigger live_row after insert on public.messages for each row execute function public.live_row();
drop trigger if exists live_read on public.messages;
create trigger live_read after update on public.messages referencing old table as live_stale new table as live_fresh
  for each statement execute function public.live_read();
drop trigger if exists live_row on public.deliveries;
create trigger live_row after insert on public.deliveries for each row execute function public.live_row();
drop trigger if exists live_row on public.guild_invites;
create trigger live_row after insert on public.guild_invites for each row execute function public.live_row();
drop trigger if exists live_row on public.guild_messages;
create trigger live_row after insert on public.guild_messages for each row execute function public.live_row();
drop trigger if exists live_row on public.friendships;
create trigger live_row after insert or update or delete on public.friendships for each row execute function public.live_row();
drop trigger if exists live_row on public.trades;
create trigger live_row after insert or update or delete on public.trades for each row execute function public.live_row();
drop trigger if exists live_row on public.challenges;
create trigger live_row after insert or update or delete on public.challenges for each row execute function public.live_row();
drop trigger if exists live_row on public.guild_bank;
create trigger live_row after insert or update or delete on public.guild_bank for each row execute function public.live_row();
drop trigger if exists live_row on public.guild_members;
create trigger live_row after insert or update or delete on public.guild_members for each row execute function public.live_row();
drop trigger if exists live_row on public.guild_goals;
create trigger live_row after insert or update or delete on public.guild_goals for each row execute function public.live_row();
drop trigger if exists live_row on public.auctions;
create trigger live_row after insert or update or delete on public.auctions for each row execute function public.live_row();

do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "wikster live topics" on realtime.messages';
    execute $p$create policy "wikster live topics" on realtime.messages for select to authenticated
      using (extension = 'broadcast' and (
        (select realtime.topic()) = 'user:' || (select auth.uid())::text
        or (select realtime.topic()) = 'guild:' || (select public.my_guild_id())::text
        or (select realtime.topic()) = 'market'))$p$;
  end if;
end $$;

create or replace function public.live_unpublish(p_tables text[])
returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array p_tables loop
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
revoke all on function public.live_unpublish(text[]) from public, anon, authenticated;

do $$ begin
  perform public.live_unpublish(array['showcase_kudos', 'guild_matches',
    'leaderboard_daily', 'leaderboard_weekly', 'leaderboard_alltime', 'leaderboard_season',
    'guild_daily', 'guild_weekly', 'guild_alltime', 'guild_season']);
end $$;

create or replace function public.live_phase2()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.live_unpublish(array['messages', 'deliveries', 'friendships', 'trades', 'challenges',
    'guild_invites', 'guild_messages', 'guild_bank', 'guild_goals', 'auctions']);
end $$;
revoke all on function public.live_phase2() from public, anon, authenticated;

-- economy speed
alter table public.econ add column if not exists n_cards bigint not null default 0;
alter table public.econ add column if not exists n_unique integer not null default 0;
alter table public.econ add column if not exists n_value bigint not null default 0;

drop index if exists public.cards_owner_idx;
drop index if exists public.inventory_owner_idx;
drop index if exists public.ledger_kind_idx;
create index if not exists cards_changed_idx on public.cards (user_id, last_at);

create table if not exists public.cards_gone (
  user_id     uuid not null,
  article_key text not null,
  at          timestamptz not null default now(),
  primary key (user_id, article_key)
);
alter table public.cards_gone enable row level security;

create or replace function public.cards_note_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into cards_gone (user_id, article_key, at)
    select g.user_id, g.article_key, now() from gone g
      where exists (select 1 from auth.users u where u.id = g.user_id)
    on conflict (user_id, article_key) do update set at = excluded.at;
  return null;
end $$;
drop trigger if exists cards_note_gone on public.cards;
create trigger cards_note_gone after delete on public.cards
  referencing old table as gone for each statement execute function public.cards_note_gone();

create or replace function public.econ_recount(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n bigint; u integer; v bigint;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then return; end if;
  select coalesce(sum(copies), 0)::bigint, count(*)::integer, coalesce(sum(price * copies), 0)::bigint
    into n, u, v from cards where user_id = p_user;
  insert into econ (user_id, n_cards, n_unique, n_value) values (p_user, n, u, v)
    on conflict (user_id) do update set n_cards = excluded.n_cards, n_unique = excluded.n_unique, n_value = excluded.n_value
    where (econ.n_cards, econ.n_unique, econ.n_value) is distinct from (excluded.n_cards, excluded.n_unique, excluded.n_value);
  update profiles set cards = cards where id = p_user
    and (cards, unique_cards, collection_value) is distinct from (least(n, 2147483647)::integer, u, v);
end $$;
revoke all on function public.econ_recount(uuid) from public, anon, authenticated;
grant execute on function public.econ_recount(uuid) to service_role;

create or replace function public.econ_tally(p_user uuid, p_cards bigint, p_unique integer, p_value bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_cards, 0) = 0 and coalesce(p_unique, 0) = 0 and coalesce(p_value, 0) = 0 then return; end if;
  update econ set n_cards = n_cards + coalesce(p_cards, 0), n_unique = n_unique + coalesce(p_unique, 0),
      n_value = n_value + coalesce(p_value, 0), updated_at = now()
    where user_id = p_user;
  if not found then
    perform public.econ_recount(p_user);
    return;
  end if;
  update profiles set cards = cards where id = p_user;
end $$;
revoke all on function public.econ_tally(uuid, bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.econ_tally(uuid, bigint, integer, bigint) to service_role;

create or replace function public.econ_take_card(p_user uuid, p_key text, p_copies integer default 1, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare row_c cards; n integer := greatest(1, coalesce(p_copies, 1));
begin
  select * into row_c from cards where user_id = p_user and article_key = p_key for update;
  if row_c.user_id is null or row_c.copies < n then raise exception 'NOT_OWNED'; end if;
  if coalesce(row_c.data->>'special', 'false') not in ('false', '') and not p_force then
    raise exception 'LOCKED';
  end if;
  if row_c.copies = n then
    delete from cards where user_id = p_user and article_key = row_c.article_key;
  else
    update cards set copies = copies - n, last_at = now() where user_id = p_user and article_key = row_c.article_key;
  end if;
  if coalesce(current_setting('wikster.tally', true), '') <> 'held' then
    perform public.econ_tally(p_user, -n, case when row_c.copies = n then -1 else 0 end, -(row_c.price * n));
  end if;
  return jsonb_build_object(
    'key', row_c.article_key, 'title', row_c.title, 'rarityId', row_c.rarity_id,
    'price', row_c.price, 'lang', row_c.lang, 'packId', row_c.pack_id, 'copies', n, 'data', row_c.data);
end $$;
revoke all on function public.econ_take_card(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.econ_take_card(uuid, text, integer, boolean) to service_role;

create or replace function public.econ_give_card(p_user uuid, item jsonb, p_origin text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  held  boolean := coalesce(current_setting('wikster.tally', true), '') = 'held';
  was_c integer;
  was_p bigint;
  now_c integer;
  now_p bigint;
begin
  if item->>'key' is null then raise exception 'BAD_CARD'; end if;
  if not held then
    select copies, price into was_c, was_p from cards where user_id = p_user and article_key = item->>'key' for update;
  end if;
  insert into cards (user_id, article_key, title, rarity_id, price, copies, lang, pack_id, origin, data)
  values (p_user, item->>'key', coalesce(item->>'title', item->>'key'),
          coalesce(item->>'rarityId', 'common'), greatest(0, coalesce((item->>'price')::bigint, 0)),
          greatest(1, coalesce((item->>'copies')::integer, 1)), coalesce(item->>'lang', 'en'),
          item->>'packId', coalesce(p_origin, item->>'origin', 'pull'), coalesce(item->'data', '{}'::jsonb))
  on conflict (user_id, article_key) do update
    set copies    = cards.copies + excluded.copies,
        last_at   = now(),
        rarity_id = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then excluded.rarity_id else cards.rarity_id end,
        price     = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then excluded.price
                         when item ? 'reprice' then greatest(0, (item->>'reprice')::bigint)
                         else cards.price end,
        data      = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then cards.data || excluded.data else excluded.data || cards.data end
  returning copies, price into now_c, now_p;
  if not held then
    perform public.econ_tally(p_user, now_c - coalesce(was_c, 0), case when was_c is null then 1 else 0 end,
      now_c * now_p - coalesce(was_c * was_p, 0));
  end if;
end $$;
revoke all on function public.econ_give_card(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.econ_give_card(uuid, jsonb, text) to service_role;

create or replace function public.econ_wipe(p_user uuid, p_scope text, p_claim text default null, p_coins bigint default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_scope not in ('cards', 'all') then raise exception 'BAD_SCOPE'; end if;
  if p_claim is not null then
    insert into claims (user_id, key) values (p_user, p_claim) on conflict do nothing;
    if not found then raise exception 'ALREADY_CLAIMED'; end if;
  end if;
  insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  if p_scope = 'all' then
    delete from cards where user_id = p_user;
    delete from inventory where user_id = p_user;
    delete from pulls where user_id = p_user and claimed_at is null;
    delete from custom_packs where user_id = p_user;
    update wallets set coins = 0, ink = 0, updated_at = now() where user_id = p_user;
    update econ set state = jsonb_build_object('imported', true, 'rev', coalesce((state->>'rev')::integer, 0) + 1),
      updated_at = now() where user_id = p_user;
    delete from claims where user_id = p_user
      and (key = 'starter' or key like 'level:%' or key like 'medal:%' or key like 'ach:%');
  else
    delete from cards where user_id = p_user and coalesce(data->>'special', 'false') in ('false', '');
    delete from inventory where user_id = p_user and coalesce(spec->>'kind', '') <> 'code';
    delete from pulls where user_id = p_user and claimed_at is null and coalesce(spec->>'kind', '') <> 'code';
    update wallets set coins = greatest(0, coalesce(p_coins, 0)), updated_at = now() where user_id = p_user;
    update econ set state = state || jsonb_build_object('rev', coalesce((state->>'rev')::integer, 0) + 1),
      updated_at = now() where user_id = p_user;
  end if;
  insert into ledger (user_id, kind, coins, ink, reason) values (p_user, 'wipe', 0, 0, p_scope);
  perform public.econ_recount(p_user);
  update profiles set cards = cards where id = p_user;
end $$;
revoke all on function public.econ_wipe(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.econ_wipe(uuid, text, text, bigint) to service_role;

create or replace function public.econ_apply(p_user uuid, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w        wallets;
  item     jsonb;
  k        text;
  n        integer;
  cur      integer;
  removed  jsonb := '[]'::jsonb;
  d_coins  bigint := coalesce((p_ops->>'coins')::bigint, 0);
  d_ink    bigint := coalesce((p_ops->>'ink')::bigint, 0);
  touched  text[];
  b_n      bigint := 0;
  b_u      integer := 0;
  b_v      bigint := 0;
  a_n      bigint := 0;
  a_u      integer := 0;
  a_v      bigint := 0;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  perform set_config('wikster.tally', 'held', true);

  for k in select jsonb_array_elements_text(coalesce(p_ops->'claims', '[]'::jsonb)) loop
    insert into claims (user_id, key) values (p_user, k) on conflict do nothing;
    if not found then raise exception 'ALREADY_CLAIMED'; end if;
  end loop;

  if p_ops ? 'rev' then
    insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
    select coalesce((state->>'rev')::integer, 0) into cur from econ where user_id = p_user for update;
    if cur <> (p_ops->>'rev')::integer then raise exception 'CONFLICT'; end if;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'marks', '[]'::jsonb)) loop
    perform public.econ_mark(p_user, item);
  end loop;

  if p_ops ? 'pull' then
    update pulls set claimed_at = now()
      where nonce = (p_ops->>'pull')::uuid and user_id = p_user and claimed_at is null;
    if not found then raise exception 'NO_PULL'; end if;
  end if;

  if d_coins <> 0 or d_ink <> 0 then
    insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
    begin
      update wallets set coins = coins + d_coins, ink = ink + d_ink, updated_at = now()
        where user_id = p_user returning * into w;
    exception when check_violation then
      raise exception 'INSUFFICIENT_FUNDS';
    end;
  else
    select * into w from wallets where user_id = p_user;
    if not found then
      insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
      select * into w from wallets where user_id = p_user;
    end if;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'inventory', '[]'::jsonb)) loop
    n := coalesce((item->>'delta')::integer, 0);
    if n > 0 then
      insert into inventory (user_id, spec_id, spec, count)
        values (p_user, item->>'spec_id', item->'spec', n)
        on conflict (user_id, spec_id) do update set count = inventory.count + n;
    elsif n < 0 then
      select count into cur from inventory
        where user_id = p_user and spec_id = item->>'spec_id' for update;
      if cur is null or cur < -n then raise exception 'NOT_HELD'; end if;
      if cur = -n then
        delete from inventory where user_id = p_user and spec_id = item->>'spec_id';
      else
        update inventory set count = count + n where user_id = p_user and spec_id = item->>'spec_id';
      end if;
    end if;
  end loop;

  touched := array(
    select distinct x->>'key'
      from jsonb_array_elements(coalesce(p_ops->'remove', '[]'::jsonb) || coalesce(p_ops->'add', '[]'::jsonb)) x
      where x->>'key' is not null);
  if cardinality(touched) > 0 then
    select coalesce(sum(copies), 0)::bigint, count(*)::integer, coalesce(sum(price * copies), 0)::bigint
      into b_n, b_u, b_v from cards where user_id = p_user and article_key = any(touched);
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'remove', '[]'::jsonb)) loop
    removed := removed || public.econ_take_card(p_user, item->>'key', coalesce((item->>'copies')::integer, 1),
      coalesce((item->>'force')::boolean, false));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'add', '[]'::jsonb)) loop
    perform public.econ_give_card(p_user, item);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'patch', '[]'::jsonb)) loop
    update cards set
        data     = case when item ? 'data' then cards.data || (item->'data') else cards.data end,
        title    = coalesce(item->>'title', cards.title),
        favorite = coalesce((item->>'favorite')::boolean, cards.favorite),
        last_at  = now()
      where user_id = p_user and article_key = item->>'key';
  end loop;

  if cardinality(touched) > 0 then
    select coalesce(sum(copies), 0)::bigint, count(*)::integer, coalesce(sum(price * copies), 0)::bigint
      into a_n, a_u, a_v from cards where user_id = p_user and article_key = any(touched);
  end if;

  if p_ops ? 'state' or a_n <> b_n or a_u <> b_u or a_v <> b_v then
    insert into econ (user_id, state, n_cards, n_unique, n_value)
      values (p_user, coalesce(p_ops->'state', '{}'::jsonb), a_n - b_n, a_u - b_u, a_v - b_v)
      on conflict (user_id) do update set state = econ.state || excluded.state,
        n_cards = econ.n_cards + excluded.n_cards, n_unique = econ.n_unique + excluded.n_unique,
        n_value = econ.n_value + excluded.n_value, updated_at = now();
  end if;

  if p_ops ? 'pull' then
    insert into codex (key, title, rarity, price, views, thumbnail, lang, found_by)
    select a->>'key', left(coalesce(a->>'title', a->>'key'), 300), a->>'rarityId',
           case when jsonb_typeof(a->'price') = 'number' then least((a->>'price')::numeric, 2000000000)::integer end,
           case when jsonb_typeof(a->'data'->'views') = 'number' then (a->'data'->>'views')::numeric::bigint end,
           left(a->'data'->>'thumbnail', 2000), left(a->>'lang', 12), p_user
      from jsonb_array_elements(coalesce(p_ops->'add', '[]'::jsonb)) a
      where a->>'key' is not null and coalesce(a->>'packId', '') !~ '^(custom|code)\|'
    on conflict (key) do nothing;
  end if;

  if p_ops ? 'score' then
    perform public.econ_score(p_user, p_ops->'score');
  end if;

  if (d_coins <> 0 or d_ink <> 0 or p_ops ? 'kind')
     and not (coalesce(p_ops->>'kind', '') = 'open' and d_coins = 0 and d_ink = 0) then
    insert into ledger (user_id, kind, coins, ink, reason, detail)
      values (p_user, coalesce(p_ops->>'kind', 'change'), d_coins, d_ink, p_ops->>'reason', p_ops->'detail');
  end if;

  if a_n <> b_n or a_u <> b_u or a_v <> b_v
     or (jsonb_typeof(p_ops->'state') = 'object' and (p_ops->'state') ?| array['progress', 'boostersOpened', 'rarityCounts']) then
    update profiles set cards = cards where id = p_user;
  end if;

  perform set_config('wikster.tally', '', true);
  return jsonb_build_object('coins', coalesce(w.coins, 0), 'ink', coalesce(w.ink, 0), 'removed', removed,
    'fresh', jsonb_build_object(
      'state', coalesce((select e.state from econ e where e.user_id = p_user), '{}'::jsonb),
      'inventory', coalesce((select jsonb_object_agg(i.spec_id, jsonb_build_object('spec', i.spec, 'count', i.count)) from inventory i where i.user_id = p_user), '{}'::jsonb),
      'cards', coalesce((select jsonb_agg(jsonb_build_object('article_key', c.article_key, 'title', c.title, 'rarity_id', c.rarity_id, 'price', c.price,
          'copies', c.copies, 'lang', c.lang, 'pack_id', c.pack_id, 'data', c.data, 'favorite', c.favorite))
        from cards c where c.user_id = p_user and c.article_key in (select jsonb_array_elements_text(coalesce(p_ops->'keys', '[]'::jsonb)))), '[]'::jsonb)));
end $$;
revoke all on function public.econ_apply(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.econ_apply(uuid, jsonb) to service_role;

create or replace function public.profile_stats_from_server()
returns trigger language plpgsql security definer set search_path = public as $$
declare e econ; s jsonb;
begin
  select * into e from econ where user_id = new.id;
  if e.user_id is null then return new; end if;
  s := e.state;
  new.cards := least(e.n_cards, 2147483647)::integer;
  new.unique_cards := e.n_unique;
  new.collection_value := e.n_value;
  if jsonb_typeof(s->'progress'->'level') = 'number' then
    new.level := greatest(1, (s->'progress'->>'level')::numeric::integer);
  end if;
  new.boosters_opened := case when jsonb_typeof(s->'boostersOpened') = 'number'
    then (s->>'boostersOpened')::numeric::integer else 0 end;
  new.best_rarity := (
    select r.k from jsonb_each(case when jsonb_typeof(s->'rarityCounts') = 'object' then s->'rarityCounts' else '{}'::jsonb end) as r(k, v)
      where jsonb_typeof(r.v) = 'number' and r.v::text::numeric > 0
      order by public.rarity_rank(r.k) desc limit 1);
  return new;
end $$;
drop trigger if exists profile_stats_from_server on public.profiles;
create trigger profile_stats_from_server
  before update of level, cards, unique_cards, boosters_opened, collection_value, best_rarity on public.profiles
  for each row execute function public.profile_stats_from_server();

update public.econ e set n_cards = s.n, n_unique = s.u, n_value = s.v
  from (select c.user_id, sum(c.copies)::bigint n, count(*)::integer u, sum(c.price * c.copies)::bigint v
          from public.cards c group by c.user_id) s
  where s.user_id = e.user_id and (e.n_cards, e.n_unique, e.n_value) is distinct from (s.n, s.u, s.v);
update public.econ e set n_cards = 0, n_unique = 0, n_value = 0
  where (e.n_cards <> 0 or e.n_unique <> 0 or e.n_value <> 0)
    and not exists (select 1 from public.cards c where c.user_id = e.user_id);

select cron.unschedule(jobid) from cron.job where jobname = 'wikster-econ-tidy';
select cron.schedule('wikster-econ-tidy', '27 3 * * *', $$
  delete from public.pulls where claimed_at is not null and claimed_at < now() - interval '14 days';
  delete from public.cards_gone where at < now() - interval '30 days';
  select public.econ_recount(e.user_id) from public.econ e where e.updated_at > now() - interval '1 day';
$$);

drop function if exists public.econ_load(uuid, text, integer);
create or replace function public.econ_load(p_user uuid, p_bucket text default null, p_max integer default 150,
  p_keys text[] default null, p_pull uuid default null, p_since timestamptz default null, p_weight integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pl     pulls;
  want   text[] := coalesce(p_keys, '{}'::text[]);
  w      timestamptz;
  c      integer;
  result jsonb;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  if p_bucket is not null and not public.is_control_admin(p_user) then
    w := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
    insert into rate_counters (user_id, bucket, window_start, n)
      values (p_user, p_bucket, w, greatest(1, least(coalesce(p_weight, 1), 50)))
      on conflict (user_id, bucket, window_start) do update set n = rate_counters.n + excluded.n
      returning n into c;
    if c > p_max then raise exception 'SLOW_DOWN'; end if;
  end if;
  if p_pull is not null then
    select * into pl from pulls where nonce = p_pull and user_id = p_user;
    if pl.nonce is not null then
      want := want || array(select x->'article'->>'key' from jsonb_array_elements(pl.cards) x where x->'article'->>'key' is not null);
    end if;
  end if;
  result := jsonb_build_object(
    'wallet', coalesce((select jsonb_build_object('coins', w2.coins, 'ink', w2.ink) from wallets w2 where w2.user_id = p_user), jsonb_build_object('coins', 0, 'ink', 0)),
    'state', coalesce((select e.state from econ e where e.user_id = p_user), '{}'::jsonb),
    'inventory', coalesce((select jsonb_object_agg(i.spec_id, jsonb_build_object('spec', i.spec, 'count', i.count)) from inventory i where i.user_id = p_user), '{}'::jsonb),
    'custom', coalesce((select jsonb_agg(jsonb_build_object('def', k.def) order by k.created_at) from custom_packs k where k.user_id = p_user), '[]'::jsonb),
    'cutover', (select extract(epoch from m.cutover_at) * 1000 from migration m limit 1),
    'born', (select extract(epoch from u.created_at) * 1000 from auth.users u where u.id = p_user));
  if cardinality(want) > 0 then
    result := result || jsonb_build_object('keys', to_jsonb(want), 'cards', coalesce((select jsonb_agg(jsonb_build_object(
        'article_key', c2.article_key, 'title', c2.title, 'rarity_id', c2.rarity_id, 'price', c2.price, 'copies', c2.copies,
        'lang', c2.lang, 'pack_id', c2.pack_id, 'data', c2.data, 'favorite', c2.favorite))
      from cards c2 where c2.user_id = p_user and c2.article_key = any(want)), '[]'::jsonb));
  end if;
  if p_pull is not null then
    result := result || jsonb_build_object('pull', case when pl.nonce is null then null else jsonb_build_object(
      'nonce', pl.nonce, 'spec_id', pl.spec_id, 'spec', pl.spec, 'cards', pl.cards, 'claimed', pl.claimed_at is not null,
      'first', (select f.nonce from pulls f where f.user_id = p_user and f.spec_id = pl.spec_id and f.claimed_at is null
                  order by f.at, f.nonce limit 1)) end);
  end if;
  if p_since is not null then
    result := result || jsonb_build_object('since', jsonb_build_object(
      'cards', coalesce((select jsonb_agg(jsonb_build_object(
          'article_key', c3.article_key, 'title', c3.title, 'rarity_id', c3.rarity_id, 'price', c3.price, 'copies', c3.copies,
          'lang', c3.lang, 'pack_id', c3.pack_id, 'data', c3.data, 'favorite', c3.favorite))
        from cards c3 where c3.user_id = p_user and c3.last_at > p_since), '[]'::jsonb),
      'gone', coalesce((select jsonb_agg(g.article_key) from cards_gone g
        where g.user_id = p_user and g.at > p_since
          and not exists (select 1 from cards c4 where c4.user_id = p_user and c4.article_key = g.article_key)), '[]'::jsonb)));
  end if;
  return result;
end $$;
revoke all on function public.econ_load(uuid, text, integer, text[], uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.econ_load(uuid, text, integer, text[], uuid, timestamptz, integer) to service_role;

-- control core
create or replace function public.is_control_admin(who uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare hit boolean := false; via text := '';
begin
  if who is null or to_regclass('public.admins') is null then return false; end if;
  begin
    via := coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-wikster-control', '');
  exception when others then via := '';
  end;
  if via <> '1' then return false; end if;
  execute 'select exists (select 1 from public.admins a where a.id = $1)' into hit using who;
  return coalesce(hit, false);
end $$;

create table if not exists public.admin_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  actor    uuid not null references auth.users on delete set null,
  target   uuid references auth.users on delete set null,
  kind     text not null,
  detail   jsonb not null default '{}'::jsonb,
  reason   text,
  ok       boolean not null default true
);
alter table public.admin_log add column if not exists undo jsonb;
alter table public.admin_log add column if not exists undone_at timestamptz;
alter table public.admin_log add column if not exists batch uuid;
create index if not exists admin_log_at_idx on public.admin_log (at desc);
create index if not exists admin_log_target_idx on public.admin_log (target, at desc);
alter table public.admin_log enable row level security;
drop policy if exists "control reads the log" on public.admin_log;
create policy "control reads the log" on public.admin_log for select to authenticated using (public.is_control_admin());
grant select on public.admin_log to authenticated;

create table if not exists public.player_notes (
  user_id     uuid primary key references auth.users on delete cascade,
  body        text not null default '',
  watch       boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.player_notes enable row level security;
drop policy if exists "control keeps the notes" on public.player_notes;
create policy "control keeps the notes" on public.player_notes for all to authenticated
  using (public.is_control_admin()) with check (public.is_control_admin());
grant select, insert, update, delete on public.player_notes to authenticated;

alter table public.grants add column if not exists batch uuid;
alter table public.grants add column if not exists failed_at timestamptz;
create index if not exists grants_batch_idx on public.grants (batch) where batch is not null;
create index if not exists grants_owner_at_idx on public.grants (user_id, at desc);
create index if not exists grants_open_at_idx on public.grants (at) where claimed_at is null;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc);
create index if not exists messages_sender_idx on public.messages (sender, created_at);
create index if not exists guild_messages_sender_idx on public.guild_messages (sender);
create index if not exists reports_target_idx on public.reports (target, created_at desc);
create index if not exists client_errors_at_idx on public.client_errors (at desc);

create or replace function public.econ_mark(p_user uuid, p_item jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if p_item->>'kind' = 'grantFail' then
    update grants set claimed_at = now(), failed_at = now()
      where id = (p_item->>'id')::bigint and user_id = p_user and claimed_at is null;
    return;
  end if;
  select guild_id into g from guild_members where user_id = p_user;
  case p_item->>'kind'
  when 'quest' then
    update quests set claimed = true
      where user_id = p_user and day = p_item->>'day' and quest_id = p_item->>'id'
        and not claimed and progress >= target;
  when 'challenge' then
    update challenges set claimed = claimed || to_jsonb(p_user::text), updated_at = now()
      where id = (p_item->>'id')::uuid and (challenger = p_user or opponent = p_user)
        and status = 'done' and not (claimed ? p_user::text);
  when 'guildGoal' then
    insert into guild_goal_claims (guild_id, week, user_id)
      select gg.guild_id, gg.week, p_user from guild_goals gg
        where gg.guild_id = g and gg.week = p_item->>'week' and gg.done_at is not null
      on conflict do nothing;
  when 'guildMatch' then
    insert into guild_match_claims (week, user_id)
      select m.week, p_user from guild_matches m
        where m.week = p_item->>'week' and (m.guild_a = g or m.guild_b = g) and m.score_a is not null
          and case when m.guild_a = g then m.score_a > m.score_b else m.score_b > m.score_a end
      on conflict do nothing;
  when 'grant' then
    update grants set claimed_at = now()
      where id = (p_item->>'id')::bigint and user_id = p_user and claimed_at is null;
  when 'delivery' then
    update deliveries set claimed_at = now()
      where id = (p_item->>'id')::uuid and recipient = p_user and claimed_at is null;
  else
    raise exception 'BAD_MARK';
  end case;
  if not found then raise exception 'NOT_CLAIMABLE'; end if;
end $$;
revoke all on function public.econ_mark(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.econ_mark(uuid, jsonb) to service_role;

drop policy if exists "players read live announcements" on public.announcements;
create policy "players read live announcements"
  on public.announcements for select to authenticated
  using (
    starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (
      (target_user is null and target_guild is null)
      or target_user = (select auth.uid())
      or (target_user is null and target_guild = (select public.my_guild_id()))
    )
  );
drop policy if exists "anyone reads a live announcement meant for everyone" on public.announcements;
create policy "anyone reads a live announcement meant for everyone"
  on public.announcements for select to anon
  using (
    starts_at <= now()
    and (ends_at is null or ends_at > now())
    and target_user is null
    and target_guild is null
  );

do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "wikster live topics" on realtime.messages';
    execute $p$create policy "wikster live topics" on realtime.messages for select to authenticated
      using (extension = 'broadcast' and (
        (select realtime.topic()) = 'user:' || (select auth.uid())::text
        or (select realtime.topic()) = 'guild:' || (select public.my_guild_id())::text
        or (select realtime.topic()) = 'market'
        or (select realtime.topic()) = 'world'))$p$;
  end if;
end $$;

create or replace function public.live_grants()
returns trigger language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  begin
    for u in select distinct g.user_id from live_new_grants g where g.claimed_at is null loop
      perform live_send('user:' || u, 'grant', '{}'::jsonb);
    end loop;
  exception when others then
    raise warning 'live_grants: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists live_grants on public.grants;
create trigger live_grants after insert on public.grants referencing new table as live_new_grants
  for each statement execute function public.live_grants();

create or replace function public.live_standing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform live_send('user:' || old.user_id, 'standing', jsonb_build_object('type', 'clear'));
    else
      perform live_send('user:' || new.user_id, 'standing', jsonb_build_object(
        'type', case when new.until is not null and new.until <= now() then 'clear' when new.muted then 'mute' else 'suspend' end,
        'until', new.until, 'reason', new.reason));
    end if;
  exception when others then
    raise warning 'live_standing: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists live_standing on public.suspensions;
create trigger live_standing after insert or update or delete on public.suspensions
  for each row execute function public.live_standing();

create or replace function public.live_notice()
returns trigger language plpgsql security definer set search_path = public as $$
declare r announcements; gone boolean; pay jsonb; m uuid;
begin
  begin
    if tg_op = 'DELETE' then
      r := old; gone := true;
    else
      r := new; gone := new.ends_at is not null and new.ends_at <= now();
    end if;
    if not gone and r.starts_at > now() then return null; end if;
    pay := jsonb_build_object('id', r.id, 'retired', gone);
    if r.target_user is not null then
      perform live_send('user:' || r.target_user, 'notice', pay);
    elsif r.target_guild is not null then
      perform live_send('guild:' || r.target_guild, 'notice', pay);
      for m in select gm.user_id from guild_members gm where gm.guild_id = r.target_guild loop
        perform live_send('user:' || m, 'notice', pay);
      end loop;
    else
      perform live_send('world', 'announcement', pay);
    end if;
  exception when others then
    raise warning 'live_notice: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists live_notice on public.announcements;
create trigger live_notice after insert or update or delete on public.announcements
  for each row execute function public.live_notice();

create or replace function public.admin_gate()
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_control_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return auth.uid();
end $$;

create or replace function public.admin_note(p_kind text, p_target uuid, p_detail jsonb, p_reason text,
  p_undo jsonb default null, p_batch uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into admin_log (actor, target, kind, detail, reason, undo, batch)
    values (auth.uid(), p_target, p_kind, coalesce(p_detail, '{}'::jsonb), nullif(left(coalesce(p_reason, ''), 1000), ''), p_undo, p_batch)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_stamp()
returns bigint language sql volatile as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

create or replace function public.admin_audience_ids(p_filter jsonb)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  v_all boolean := false;
  v_ids uuid[];
  v_lmin integer;
  v_lmax integer;
  v_days numeric;
  v_guild uuid;
begin
  if f ? 'all' then
    if f->'all' <> 'true'::jsonb then return; end if;
    v_all := true;
  end if;
  begin
    if f ? 'ids' then
      if jsonb_typeof(f->'ids') <> 'array' then return; end if;
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(f->'ids') x;
      if v_ids is null then return; end if;
    end if;
    if f ? 'level_min' then
      if jsonb_typeof(f->'level_min') <> 'number' then return; end if;
      v_lmin := floor((f->>'level_min')::numeric)::integer;
    end if;
    if f ? 'level_max' then
      if jsonb_typeof(f->'level_max') <> 'number' then return; end if;
      v_lmax := floor((f->>'level_max')::numeric)::integer;
    end if;
    if f ? 'active_days' then
      if jsonb_typeof(f->'active_days') <> 'number' or (f->>'active_days')::numeric <= 0 then return; end if;
      v_days := (f->>'active_days')::numeric;
    end if;
    if f ? 'guild' then
      if jsonb_typeof(f->'guild') <> 'string' then return; end if;
      v_guild := (f->>'guild')::uuid;
    end if;
  exception when others then
    return;
  end;
  if not v_all and v_ids is null and v_lmin is null and v_lmax is null and v_days is null and v_guild is null then return; end if;
  return query
    select p.id from profiles p
    where (v_ids is null or p.id = any(v_ids))
      and (v_lmin is null or p.level >= v_lmin)
      and (v_lmax is null or p.level <= v_lmax)
      and (v_days is null or p.last_seen_at > now() - make_interval(secs => (v_days * 86400)::double precision))
      and (v_guild is null or exists (select 1 from guild_members m where m.user_id = p.id and m.guild_id = v_guild));
end $$;

create or replace function public.admin_grant_items(p_items jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  it jsonb; k text; n numeric; sp jsonb; art jsonb; src jsonb; rar text; out jsonb := '[]'::jsonb;
  num constant text := '^-?[0-9]+(\.0+)?$';
begin
  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'BAD_ITEMS';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(jsonb_typeof(it), '') <> 'object' then raise exception 'BAD_ITEM'; end if;
    k := it->>'kind';
    if k in ('coins', 'ink', 'xp') then
      if coalesce(jsonb_typeof(it->'amount'), '') <> 'number' or (it->>'amount') !~ num then raise exception 'BAD_AMOUNT'; end if;
      n := (it->>'amount')::numeric;
      if n = 0 or abs(n) > (case when k = 'coins' then 100000000 else 10000000 end) or (k = 'xp' and n < 0) then raise exception 'BAD_AMOUNT'; end if;
      out := out || jsonb_build_array(jsonb_build_object('kind', k, 'payload',
        case when k = 'xp' then jsonb_build_object('amount', n::bigint) else jsonb_build_object('amount', n::bigint, 'mode', 'add') end));
    elsif k = 'booster' then
      sp := it->'spec';
      if coalesce(jsonb_typeof(sp), '') <> 'object' or coalesce(sp->>'kind', '') not in ('theme', 'open', 'custom', 'code', 'today', 'timed') then
        raise exception 'BAD_SPEC';
      end if;
      if coalesce(jsonb_typeof(sp->'cards'), '') <> 'number' or (sp->>'cards') !~ '^[0-9]+$' or (sp->>'cards')::integer not between 1 and 12 then
        raise exception 'BAD_SPEC';
      end if;
      if sp ? 'rarityId' and jsonb_typeof(sp->'rarityId') <> 'null' and public.rarity_rank(sp->>'rarityId') = 0 then raise exception 'BAD_SPEC'; end if;
      if sp->>'kind' = 'theme' and coalesce(sp->>'themeId', '') = '' then raise exception 'BAD_SPEC'; end if;
      if sp->>'kind' = 'code' and coalesce(sp->>'codeId', '') = '' then raise exception 'BAD_SPEC'; end if;
      if sp->>'kind' = 'today' and coalesce(sp->>'day', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'BAD_SPEC'; end if;
      if sp->>'kind' = 'timed' and coalesce(jsonb_typeof(sp->'timedLevel'), '') <> 'number' then raise exception 'BAD_SPEC'; end if;
      if sp->>'kind' = 'custom' and not (
        coalesce(sp->'wiki'->>'apiUrl', '') ~ '^https?://[^/]+/'
        or (coalesce(jsonb_typeof(sp->'wiki'), 'null') = 'null' and coalesce(sp->>'customId', '') <> '')) then
        raise exception 'BAD_SPEC';
      end if;
      n := 1;
      if it ? 'count' then
        if coalesce(jsonb_typeof(it->'count'), '') <> 'number' or (it->>'count') !~ '^[0-9]+$' then raise exception 'BAD_COUNT'; end if;
        n := (it->>'count')::numeric;
      end if;
      if n not between 1 and 100 then raise exception 'BAD_COUNT'; end if;
      out := out || jsonb_build_array(jsonb_build_object('kind', 'booster', 'payload', jsonb_build_object('spec', sp, 'count', n::integer)));
    elsif k = 'card' then
      src := it->'card';
      if coalesce(jsonb_typeof(src), '') <> 'object' then raise exception 'BAD_CARD'; end if;
      art := case when jsonb_typeof(src->'article') = 'object' then src->'article' else src - 'rarityId' - 'count' end;
      if coalesce(art->>'key', '') = '' then raise exception 'BAD_CARD'; end if;
      rar := lower(coalesce(src->>'rarityId', art->>'rarityId', 'common'));
      if public.rarity_rank(rar) = 0 then raise exception 'BAD_CARD'; end if;
      n := 1;
      if coalesce(src->'count', it->'count') is not null then
        if coalesce(src->>'count', it->>'count') !~ '^[0-9]+$' then raise exception 'BAD_COUNT'; end if;
        n := coalesce(src->>'count', it->>'count')::numeric;
      end if;
      if n not between 1 and 100 then raise exception 'BAD_COUNT'; end if;
      out := out || jsonb_build_array(jsonb_build_object('kind', 'card', 'payload',
        jsonb_build_object('article', art - 'rarityId' - 'count', 'rarityId', rar, 'count', n::integer)));
    elsif k = 'takeCard' then
      if coalesce(it->>'key', '') = '' then raise exception 'BAD_CARD'; end if;
      out := out || jsonb_build_array(jsonb_build_object('kind', 'takeCard', 'payload', jsonb_build_object('key', it->>'key')));
    elsif k in ('owned', 'revokeOwned') then
      if coalesce(it->>'bucket', '') not in ('themes', 'frames', 'fx', 'looks', 'openings', 'supporter') or coalesce(it->>'id', '') = '' then
        raise exception 'BAD_OWNED';
      end if;
      out := out || jsonb_build_array(jsonb_build_object('kind', k, 'payload', jsonb_build_object('bucket', it->>'bucket', 'id', it->>'id')));
    elsif k = 'level' then
      if coalesce(jsonb_typeof(it->'value'), '') <> 'number' or (it->>'value') !~ '^[0-9]+$' or (it->>'value')::integer not between 1 and 500 then
        raise exception 'BAD_LEVEL';
      end if;
      out := out || jsonb_build_array(jsonb_build_object('kind', 'profile', 'payload',
        jsonb_build_object('patch', jsonb_build_object('progress.level', (it->>'value')::integer, 'progress.xp', 0))));
    elsif k = 'boostersOpened' then
      if coalesce(jsonb_typeof(it->'value'), '') <> 'number' or (it->>'value') !~ '^[0-9]+$' or (it->>'value')::numeric > 10000000 then
        raise exception 'BAD_VALUE';
      end if;
      out := out || jsonb_build_array(jsonb_build_object('kind', 'profile', 'payload',
        jsonb_build_object('patch', jsonb_build_object('boostersOpened', (it->>'value')::integer))));
    else
      raise exception 'BAD_KIND';
    end if;
  end loop;
  return out;
end $$;

create or replace function public.admin_dashboard()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_db jsonb := '{}'::jsonb; v_top jsonb := '[]'::jsonb; v_rel text; res jsonb;
begin
  perform public.admin_gate();
  begin
    v_db := jsonb_build_object(
      'connections', (select count(*) from pg_stat_activity),
      'max_connections', current_setting('max_connections')::integer,
      'size_bytes', pg_database_size(current_database()),
      'cache_hit_ratio', (select round(sum(d.blks_hit)::numeric / nullif(sum(d.blks_hit + d.blks_read), 0), 4)
        from pg_stat_database d where d.datname = current_database()));
  exception when others then
    v_db := jsonb_build_object('connections', null, 'max_connections', null, 'size_bytes', null, 'cache_hit_ratio', null);
  end;
  begin
    v_rel := coalesce(to_regclass('extensions.pg_stat_statements')::text, to_regclass('public.pg_stat_statements')::text);
    if v_rel is not null then
      execute format('select coalesce(jsonb_agg(jsonb_build_object(''calls'', s.calls, ''mean_ms'', round(s.mean_exec_time::numeric, 2),
          ''total_ms'', round(s.total_exec_time::numeric, 1), ''query'', left(s.query, 120))), ''[]''::jsonb)
        from (select * from %s order by total_exec_time desc limit 15) s', v_rel) into v_top;
    end if;
  exception when others then
    v_top := '[]'::jsonb;
  end;
  res := jsonb_build_object(
    'players', (select count(*) from profiles),
    'online', (select count(*) from profiles where last_seen_at > now() - interval '2 minutes'),
    'active_24h', (select count(*) from profiles where last_seen_at > now() - interval '24 hours'),
    'active_7d', (select count(*) from profiles where last_seen_at > now() - interval '7 days'),
    'grants_waiting', (select count(*) from grants where claimed_at is null),
    'grants_stuck', (select count(*) from grants where claimed_at is null and at < now() - interval '10 minutes'),
    'errors_24h', (select count(*) from client_errors where last_at > now() - interval '24 hours'),
    'reports_open', (select count(*) from reports where status = 'open'),
    'econ_actions_5m', (select count(*) from ledger where at > now() - interval '5 minutes'),
    'db', v_db,
    'top_queries', coalesce(v_top, '[]'::jsonb),
    'at', now());
  return res;
end $$;

create or replace function public.admin_search_players(p_q text default null, p_filter jsonb default '{}'::jsonb,
  p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  q text := nullif(trim(coalesce(p_q, '')), '');
  pat text;
  qid uuid;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_lmin integer; v_lmax integer; v_act numeric; v_inact numeric; v_standing text; v_note boolean;
  v_total bigint;
  v_rows jsonb;
begin
  perform public.admin_gate();
  if q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then qid := q::uuid; end if;
  pat := '%' || replace(replace(replace(lower(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  if jsonb_typeof(f->'level_min') = 'number' then v_lmin := floor((f->>'level_min')::numeric)::integer; end if;
  if jsonb_typeof(f->'level_max') = 'number' then v_lmax := floor((f->>'level_max')::numeric)::integer; end if;
  if jsonb_typeof(f->'active_days') = 'number' then v_act := (f->>'active_days')::numeric; end if;
  if jsonb_typeof(f->'inactive_days') = 'number' then v_inact := (f->>'inactive_days')::numeric; end if;
  if f->>'standing' in ('muted', 'suspended', 'clear') then v_standing := f->>'standing'; end if;
  if jsonb_typeof(f->'has_note') = 'boolean' then v_note := (f->>'has_note')::boolean; end if;

  with m as materialized (
    select p.id, p.last_seen_at as seen from profiles p
    where (q is null or p.id = qid or lower(p.username) like pat)
      and (v_lmin is null or p.level >= v_lmin)
      and (v_lmax is null or p.level <= v_lmax)
      and (v_act is null or p.last_seen_at > now() - make_interval(secs => (v_act * 86400)::double precision))
      and (v_inact is null or p.last_seen_at <= now() - make_interval(secs => (v_inact * 86400)::double precision))
      and (v_standing is null
        or (v_standing = 'muted' and exists (select 1 from suspensions s where s.user_id = p.id and s.muted and (s.until is null or s.until > now())))
        or (v_standing = 'suspended' and exists (select 1 from suspensions s where s.user_id = p.id and not s.muted and (s.until is null or s.until > now())))
        or (v_standing = 'clear' and not exists (select 1 from suspensions s where s.user_id = p.id and (s.until is null or s.until > now()))))
      and (v_note is null or v_note = exists (select 1 from player_notes n where n.user_id = p.id and n.body <> ''))
  ), pg as (
    select * from m order by seen desc nulls last, id limit lim offset off
  )
  select (select count(*) from m), coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'level', p.level,
      'coins', coalesce(w.coins, 0), 'ink', coalesce(w.ink, 0),
      'n_cards', coalesce(e.n_cards, p.cards), 'n_unique', coalesce(e.n_unique, p.unique_cards),
      'last_seen_at', p.last_seen_at, 'created_at', p.created_at,
      'standing', case when s.user_id is null or (s.until is not null and s.until <= now()) then 'clear'
                       when s.muted then 'muted' else 'suspended' end,
      'supporter', e.state->'owned'->'supporter',
      'note', nullif(n.body, '')) order by h.seen desc nulls last, h.id), '[]'::jsonb)
    into v_total, v_rows
    from pg h
    join profiles p on p.id = h.id
    left join wallets w on w.user_id = h.id
    left join econ e on e.user_id = h.id
    left join suspensions s on s.user_id = h.id
    left join player_notes n on n.user_id = h.id;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.admin_player(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_gate();
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object(
    'id', p_user,
    'profile', (select to_jsonb(p) from profiles p where p.id = p_user),
    'online', coalesce((select p.last_seen_at > now() - interval '2 minutes' from profiles p where p.id = p_user), false),
    'wallet', coalesce((select jsonb_build_object('coins', w.coins, 'ink', w.ink, 'updated_at', w.updated_at) from wallets w where w.user_id = p_user),
      jsonb_build_object('coins', 0, 'ink', 0, 'updated_at', null)),
    'econ', (select jsonb_build_object('n_cards', e.n_cards, 'n_unique', e.n_unique, 'n_value', e.n_value, 'updated_at', e.updated_at,
        'live', e.state ? 'imported',
        'state', jsonb_build_object('progress', e.state->'progress', 'boostersOpened', e.state->'boostersOpened',
          'rarityCounts', e.state->'rarityCounts', 'owned', e.state->'owned', 'daily', e.state->'daily', 'pendingLevels', e.state->'pendingLevels'))
      from econ e where e.user_id = p_user),
    'inventory', coalesce((select jsonb_agg(jsonb_build_object('spec_id', i.spec_id, 'spec', i.spec, 'count', i.count) order by i.spec_id)
      from inventory i where i.user_id = p_user), '[]'::jsonb),
    'save_live', exists (select 1 from save_meta m where m.user_id = p_user),
    'save_keys', coalesce((select jsonb_agg(jsonb_build_object('key', k.key, 'length', octet_length(k.value), 'stamp', k.stamp,
        'updated_at', k.updated_at,
        'value', case when k.key in ('wikster.language', 'wikster.theme', 'wikster.ripDirection') then k.value end) order by k.key)
      from save_keys k where k.user_id = p_user), '[]'::jsonb),
    'standing', (select to_jsonb(s) || jsonb_build_object('active', s.until is null or s.until > now(),
        'type', case when s.muted then 'mute' else 'suspend' end)
      from suspensions s where s.user_id = p_user),
    'notes', (select to_jsonb(n) from player_notes n where n.user_id = p_user),
    'grants', coalesce((select jsonb_agg(to_jsonb(g) order by g.at desc, g.id desc) from (
        select id, at, kind, payload, note_en, note_fr, claimed_at, failed_at, batch from grants
        where user_id = p_user order by at desc, id desc limit 50) g), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc, l.id desc) from (
        select id, at, kind, coins, ink, reason, detail from ledger where user_id = p_user order by at desc, id desc limit 100) l), '[]'::jsonb),
    'backups', coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc) from (
        select id, at, reason, cards, coins from saves_history where user_id = p_user order by at desc limit 20) h), '[]'::jsonb),
    'guild', (select jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'members', g.members,
        'owner', g.owner = p_user, 'joined_at', m.joined_at)
      from guild_members m join guilds g on g.id = m.guild_id where m.user_id = p_user),
    'reports_by', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select id, created_at, kind, ref, reason, note, status, target, outcome from reports
        where reporter = p_user order by created_at desc limit 20) r), '[]'::jsonb),
    'reports_against', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select id, created_at, kind, ref, reason, note, status, reporter, outcome from reports
        where target = p_user order by created_at desc limit 20) r), '[]'::jsonb),
    'open_trades', (select count(*) from trades t where t.status = 'pending' and (t.proposer = p_user or t.recipient = p_user)),
    'open_auctions', (select count(*) from auctions a where a.status = 'open' and a.seller = p_user)
  );
end $$;

create or replace function public.admin_player_cards(p_user uuid, p_q text default null, p_limit integer default 100, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(trim(coalesce(p_q, '')), '');
  pat text;
  lim integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_gate();
  pat := '%' || replace(replace(replace(lower(coalesce(q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'total', (select count(*) from cards c where c.user_id = p_user
      and (q is null or lower(c.title) like pat or lower(c.article_key) like pat)),
    'rows', coalesce((select jsonb_agg(r.j order by r.last_at desc, r.article_key) from (
      select c.last_at, c.article_key, jsonb_build_object('article_key', c.article_key, 'title', c.title, 'rarity_id', c.rarity_id,
        'price', c.price, 'copies', c.copies, 'lang', c.lang, 'pack_id', c.pack_id, 'origin', c.origin, 'favorite', c.favorite,
        'special', nullif(c.data->>'special', ''), 'thumbnail', c.data->>'thumbnail', 'first_at', c.first_at, 'last_at', c.last_at) as j
      from cards c where c.user_id = p_user
        and (q is null or lower(c.title) like pat or lower(c.article_key) like pat)
      order by c.last_at desc, c.article_key limit lim offset off) r), '[]'::jsonb));
end $$;

create or replace function public.admin_audience(p_filter jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'count', (select count(*) from public.admin_audience_ids(p_filter) x),
    'sample', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'username', s.username)) from (
      select p.id, p.username from profiles p where p.id in (select x from public.admin_audience_ids(p_filter) x)
      order by p.last_seen_at desc nulls last, p.id limit 20) s), '[]'::jsonb));
end $$;

create or replace function public.admin_grant(p_target jsonb, p_items jsonb, p_note text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_rows jsonb := public.admin_grant_items(p_items);
  v_batch uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_note text := left(coalesce(p_note, ''), 500);
  v_n integer;
  v_players integer;
  v_one uuid;
begin
  if coalesce(jsonb_typeof(p_target), '') <> 'object' then raise exception 'BAD_TARGET'; end if;
  with t as materialized (
    select distinct x as id from public.admin_audience_ids(p_target) x
  ), ins as (
    insert into grants (user_id, at, kind, payload, note_en, note_fr, created_by, batch)
      select t.id, v_now + (i.n * interval '1 microsecond'), i.x->>'kind', i.x->'payload', v_note, v_note, v_me, v_batch
      from t cross join jsonb_array_elements(v_rows) with ordinality as i(x, n)
      returning 1
  )
  select (select count(*) from t), (select count(*) from ins), (select min(t.id::text) from t)::uuid
    into v_players, v_n, v_one;
  if v_players = 0 then raise exception 'NO_PLAYERS'; end if;
  perform public.admin_note('grant', case when v_players = 1 then v_one end,
    jsonb_build_object('target', p_target, 'items', p_items, 'note', nullif(v_note, ''), 'players', v_players, 'rows', v_n),
    p_reason, jsonb_build_object('batch', v_batch), v_batch);
  return jsonb_build_object('batch', v_batch, 'players', v_players, 'rows', v_n);
end $$;

create or replace function public.admin_save_write(p_user uuid, p_key text, p_value text, p_stamp bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_value is null then
    delete from save_keys where user_id = p_user and key = p_key;
  else
    insert into save_keys (user_id, key, value, stamp, updated_at) values (p_user, p_key, p_value, p_stamp, clock_timestamp())
      on conflict (user_id, key) do update set value = excluded.value, stamp = excluded.stamp, updated_at = excluded.updated_at;
  end if;
  if not exists (select 1 from save_meta m where m.user_id = p_user) and p_value is not null then
    update saves set data = jsonb_set(jsonb_set(jsonb_set(data, array['data', p_key], to_jsonb(p_value), true),
        array['stamps'], coalesce(data->'stamps', '{}'::jsonb) || jsonb_build_object(p_key, p_stamp), true), array['at'], to_jsonb(p_stamp), true)
      where user_id = p_user and jsonb_typeof(data->'data') = 'object';
  end if;
end $$;

create or replace function public.admin_set_standing(p_user uuid, p_type text, p_until timestamptz default null,
  p_reason text default null, p_note_to_player text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_old suspensions; v_log bigint;
begin
  if p_type is null or p_type not in ('mute', 'suspend', 'clear') then raise exception 'BAD_TYPE'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  if p_type <> 'clear' and p_until is not null and p_until <= now() then raise exception 'BAD_UNTIL'; end if;
  select * into v_old from suspensions where user_id = p_user;
  if p_type = 'clear' then
    delete from suspensions where user_id = p_user;
  else
    insert into suspensions (user_id, reason, until, muted, at, by)
      values (p_user, left(coalesce(p_note_to_player, ''), 500), p_until, p_type = 'mute', now(), v_me)
      on conflict (user_id) do update set reason = excluded.reason, until = excluded.until, muted = excluded.muted, at = excluded.at, by = excluded.by;
  end if;
  v_log := public.admin_note('standing', p_user,
    jsonb_build_object('type', p_type, 'until', p_until, 'note', nullif(p_note_to_player, '')), p_reason,
    jsonb_build_object('before', case when v_old.user_id is null then null else to_jsonb(v_old) end));
  return jsonb_build_object('ok', true, 'log', v_log,
    'standing', (select to_jsonb(s) from suspensions s where s.user_id = p_user));
end $$;

create or replace function public.admin_rename(p_user uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_old text; v_name text := trim(coalesce(p_name, '')); v_log bigint;
begin
  select username into v_old from profiles where id = p_user;
  if v_old is null then raise exception 'NOT_FOUND'; end if;
  if v_name !~ '^[a-zA-Z0-9_]{3,20}$' then raise exception 'BAD_NAME'; end if;
  if public.text_flag(v_name, 'name') is not null then raise exception 'NAME_REFUSED'; end if;
  if exists (select 1 from profiles p where lower(p.username) = lower(v_name) and p.id <> p_user) then raise exception 'NAME_TAKEN'; end if;
  if v_old = v_name then return jsonb_build_object('ok', true, 'username', v_name, 'changed', false); end if;
  update profiles set username = v_name where id = p_user;
  perform live_send('user:' || p_user, 'profile', jsonb_build_object('username', v_name));
  v_log := public.admin_note('rename', p_user, jsonb_build_object('from', v_old, 'to', v_name), null, jsonb_build_object('name', v_old));
  return jsonb_build_object('ok', true, 'username', v_name, 'changed', true, 'log', v_log);
end $$;

create or replace function public.admin_cancel_trade(p_trade uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); t trades;
begin
  select * into t from trades where id = p_trade;
  if t.id is null then raise exception 'GONE'; end if;
  if t.status <> 'pending' then raise exception 'SETTLED'; end if;
  perform public.econ_trade_cancel(t.proposer, t.id);
  perform live_send('user:' || t.proposer, 'econ', jsonb_build_object('scope', 'cards'));
  perform public.admin_note('cancel-trade', t.proposer,
    jsonb_build_object('trade', t.id, 'recipient', t.recipient, 'returned', jsonb_array_length(t.offer)), null, null);
  return jsonb_build_object('ok', true, 'returned', jsonb_array_length(t.offer), 'to', t.proposer);
end $$;

create or replace function public.admin_cancel_trades(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); t trades; n integer := 0; cards integer := 0; who uuid[] := '{}'; u uuid;
begin
  for t in select * from trades where status = 'pending' and (proposer = p_user or recipient = p_user) order by created_at for update loop
    perform public.econ_trade_cancel(t.proposer, t.id);
    n := n + 1;
    cards := cards + jsonb_array_length(t.offer);
    if not (t.proposer = any(who)) then who := who || t.proposer; end if;
  end loop;
  foreach u in array who loop
    perform live_send('user:' || u, 'econ', jsonb_build_object('scope', 'cards'));
  end loop;
  perform public.admin_note('cancel-trades', p_user, jsonb_build_object('cancelled', n, 'returned', cards), null, null);
  return jsonb_build_object('ok', true, 'cancelled', n, 'returned', cards);
end $$;

create or replace function public.admin_auction_pull(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare a auctions;
begin
  select * into a from auctions where id = p_id for update;
  if a.id is null or a.status <> 'open' then return false; end if;
  if a.bidder is not null and coalesce(a.current_bid, 0) > 0 then
    insert into deliveries (sender, recipient, kind, payload)
    values (a.seller, a.bidder, 'auction-money',
            jsonb_build_object('amount', a.current_bid, 'reason', 'refund', 'title', a.card->>'title'));
    perform live_send('user:' || a.bidder, 'econ', jsonb_build_object('scope', 'wallet'));
  end if;
  perform public.econ_give_card(a.seller, public.econ_card_of(a.card), 'auction');
  update auctions set status = 'cancelled' where id = a.id;
  perform live_send('user:' || a.seller, 'econ', jsonb_build_object('scope', 'cards'));
  return true;
end $$;

create or replace function public.admin_cancel_auction(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_seller uuid; ok boolean;
begin
  select seller into v_seller from auctions where id = p_id;
  ok := public.admin_auction_pull(p_id);
  if ok then perform public.admin_note('cancel-auction', v_seller, jsonb_build_object('auction', p_id), null, null); end if;
  return ok;
end $$;

create or replace function public.admin_cancel_auctions(p_seller uuid default null, p_stale boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); lot uuid; n integer := 0;
begin
  for lot in select id from auctions where status = 'open' and (p_seller is null or seller = p_seller) and (not p_stale or ends_at < now()) loop
    if public.admin_auction_pull(lot) then n := n + 1; end if;
  end loop;
  perform public.admin_note('cancel-auctions', p_seller, jsonb_build_object('stale', p_stale, 'cancelled', n), null, null);
  return n;
end $$;

create or replace function public.admin_restore_backup(p_user uuid, p_backup bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  h saves_history;
  v_stamp bigint := public.admin_stamp();
  v_before jsonb;
  v_keys text[];
  b record;
  v_log bigint;
begin
  select * into h from saves_history where id = p_backup and user_id = p_user;
  if h.id is null then raise exception 'NOT_FOUND'; end if;
  v_keys := array(select x.key from public.save_blob_keys(h.data) x order by x.key);
  if cardinality(v_keys) = 0 then raise exception 'EMPTY_BACKUP'; end if;
  select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) into v_before from save_keys k where k.user_id = p_user;
  for b in select x.key, x.value from public.save_blob_keys(h.data) x loop
    perform public.admin_save_write(p_user, b.key, b.value, v_stamp);
  end loop;
  perform live_send('user:' || p_user, 'save', jsonb_build_object('keys', to_jsonb(v_keys)));
  v_log := public.admin_note('restore-backup', p_user, jsonb_build_object('backup', p_backup, 'at', h.at, 'keys', to_jsonb(v_keys)), null,
    jsonb_build_object('keys', v_before, 'wrote', to_jsonb(v_keys)));
  return jsonb_build_object('ok', true, 'keys', to_jsonb(v_keys), 'stamp', v_stamp, 'log', v_log);
end $$;

create or replace function public.admin_set_save_key(p_user uuid, p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_key text := case p_key when 'language' then 'wikster.language' when 'theme' then 'wikster.theme'
    when 'ripDirection' then 'wikster.ripDirection' when 'profile' then 'wikster.profile.v1' else p_key end;
  v_old text;
  v_had boolean;
  v_stamp bigint := public.admin_stamp();
  v_log bigint;
begin
  if v_key not in ('wikster.language', 'wikster.theme', 'wikster.ripDirection', 'wikster.profile.v1') then raise exception 'BAD_KEY'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  if p_value is null
     or (v_key = 'wikster.language' and p_value not in ('en', 'fr'))
     or (v_key = 'wikster.theme' and p_value !~ '^[a-zA-Z0-9_-]{1,40}$')
     or (v_key = 'wikster.ripDirection' and p_value !~ '^-?[0-9]{1,3}$')
     or octet_length(p_value) > 204800 then
    raise exception 'BAD_VALUE';
  end if;
  if v_key = 'wikster.profile.v1' then
    begin
      if jsonb_typeof(p_value::jsonb) <> 'object' then raise exception 'BAD_VALUE'; end if;
    exception when others then raise exception 'BAD_VALUE';
    end;
  end if;
  select k.value, true into v_old, v_had from save_keys k where k.user_id = p_user and k.key = v_key;
  perform public.admin_save_write(p_user, v_key, p_value, v_stamp);
  perform live_send('user:' || p_user, 'save', jsonb_build_object('keys', jsonb_build_array(v_key)));
  v_log := public.admin_note('save-key', p_user, jsonb_build_object('key', v_key, 'length', octet_length(p_value)), null,
    jsonb_build_object('key', v_key, 'value', v_old, 'had', coalesce(v_had, false)));
  return jsonb_build_object('ok', true, 'key', v_key, 'stamp', v_stamp, 'log', v_log);
end $$;

create or replace function public.admin_wipe(p_user uuid, p_scope text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_coins bigint;
  v_stamp bigint := public.admin_stamp();
begin
  if p_scope is null or p_scope not in ('progress', 'collection', 'everything') then raise exception 'BAD_SCOPE'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  if p_scope = 'collection' then
    select coins into v_coins from wallets where user_id = p_user;
    perform public.econ_wipe(p_user, 'cards', null, coalesce(v_coins, 0));
  elsif p_scope = 'progress' then
    insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
    update econ set state = (state - array['boostersOpened', 'rarityCounts', 'progress', 'pendingLevels', 'achievements',
        'cardsSold', 'fused', 'albumTiers', 'seasons', 'seasonUnlocks', 'packsBuilt'])
        || jsonb_build_object('progress', jsonb_build_object('level', 1, 'xp', 0), 'pendingLevels', '[]'::jsonb,
          'rev', coalesce((state->>'rev')::integer, 0) + 1),
      updated_at = now()
      where user_id = p_user;
    delete from claims where user_id = p_user and (key like 'level:%' or key like 'medal:%' or key like 'ach:%');
    insert into ledger (user_id, kind, coins, ink, reason) values (p_user, 'wipe', 0, 0, 'progress');
    update profiles set level = 1 where id = p_user;
  else
    perform public.econ_wipe(p_user, 'all');
    perform public.admin_save_write(p_user, 'wikster.profile.v1', '{}', v_stamp);
    perform live_send('user:' || p_user, 'save', jsonb_build_object('keys', jsonb_build_array('wikster.profile.v1')));
  end if;
  perform live_send('user:' || p_user, 'econ', jsonb_build_object('scope', p_scope));
  perform public.admin_note('wipe', p_user, jsonb_build_object('scope', p_scope), null, null);
  return jsonb_build_object('ok', true, 'scope', p_scope);
end $$;

create or replace function public.admin_guild_close(p_guild uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare b guild_bank; n integer := 0; who uuid[] := '{}'; u uuid;
begin
  for b in select * from guild_bank where guild_id = p_guild order by created_at loop
    if exists (select 1 from auth.users x where x.id = b.donor) then
      perform public.econ_give_card(b.donor, public.econ_card_of(b.card), 'guild');
      n := n + 1;
      if not (b.donor = any(who)) then who := who || b.donor; end if;
    end if;
  end loop;
  for u in select m.user_id from guild_members m where m.guild_id = p_guild loop
    perform live_send('user:' || u, 'guild', jsonb_build_object('type', 'deleted', 'guild', p_guild));
  end loop;
  delete from guilds where id = p_guild;
  foreach u in array who loop
    perform live_send('user:' || u, 'econ', jsonb_build_object('scope', 'cards'));
  end loop;
  return n;
end $$;

create or replace function public.admin_guild(p_guild uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare g guilds;
begin
  perform public.admin_gate();
  select * into g from guilds where id = p_guild;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object(
    'guild', to_jsonb(g),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', p.username, 'level', p.level,
        'joined_at', m.joined_at, 'last_seen_at', p.last_seen_at, 'owner', m.user_id = g.owner) order by m.joined_at)
      from guild_members m left join profiles p on p.id = m.user_id where m.guild_id = p_guild), '[]'::jsonb),
    'bank', jsonb_build_object('count', (select count(*) from guild_bank b where b.guild_id = p_guild),
      'rows', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from (
        select id, donor, donor_name, card->>'title' as title, card->>'rarityId' as rarity_id, created_at
        from guild_bank where guild_id = p_guild order by created_at desc limit 50) b), '[]'::jsonb)),
    'messages', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select id, sender, sender_name, body, created_at from guild_messages
        where guild_id = p_guild order by created_at desc limit 50) x), '[]'::jsonb),
    'invites', (select count(*) from guild_invites i where i.guild_id = p_guild),
    'weekly', (select score from guild_weekly w where w.guild_id = p_guild),
    'alltime', (select score from guild_alltime a where a.guild_id = p_guild));
end $$;

create or replace function public.admin_guild_remove_member(p_guild uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; left_n integer; heir uuid; v_closed boolean := false; v_back integer := 0;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  delete from guild_members where user_id = p_user and guild_id = p_guild;
  if not found then raise exception 'NOT_MEMBER'; end if;
  perform live_send('user:' || p_user, 'guild', jsonb_build_object('type', 'removed', 'guild', p_guild));
  select count(*) into left_n from guild_members where guild_id = p_guild;
  if left_n = 0 then
    v_back := public.admin_guild_close(p_guild);
    v_closed := true;
  else
    if g.owner = p_user then
      select user_id into heir from guild_members where guild_id = p_guild order by joined_at asc, user_id limit 1;
    end if;
    update guilds set members = left_n, owner = coalesce(heir, owner) where id = p_guild;
    if heir is not null then
      perform live_send('user:' || heir, 'guild', jsonb_build_object('type', 'owner', 'guild', p_guild));
    end if;
  end if;
  perform public.admin_note('guild-remove', p_user,
    jsonb_build_object('guild', p_guild, 'name', g.name, 'heir', heir, 'closed', v_closed, 'bank_returned', v_back), null, null);
  return jsonb_build_object('ok', true, 'members', left_n, 'owner', case when v_closed then null else coalesce(heir, g.owner) end,
    'closed', v_closed, 'bank_returned', v_back);
end $$;

create or replace function public.admin_guild_rename(p_guild uuid, p_name text, p_tag text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; v_name text := trim(coalesce(p_name, '')); v_tag text := upper(trim(coalesce(p_tag, ''))); u uuid;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if char_length(v_name) not between 3 and 24 or v_tag !~ '^[A-Z0-9]{2,5}$' then raise exception 'BAD_NAME'; end if;
  if public.text_flag(v_name, 'guild') is not null or public.text_flag(v_tag, 'guild') is not null then raise exception 'NAME_REFUSED'; end if;
  if exists (select 1 from guilds x where lower(x.name) = lower(v_name) and x.id <> p_guild) then raise exception 'NAME_TAKEN'; end if;
  if exists (select 1 from guilds x where x.tag = v_tag and x.id <> p_guild) then raise exception 'TAG_TAKEN'; end if;
  update guilds set name = v_name, tag = v_tag where id = p_guild;
  for u in select m.user_id from guild_members m where m.guild_id = p_guild loop
    perform live_send('user:' || u, 'guild', jsonb_build_object('type', 'renamed', 'guild', p_guild));
  end loop;
  perform public.admin_note('guild-rename', null, jsonb_build_object('guild', p_guild, 'from', jsonb_build_object('name', g.name, 'tag', g.tag),
    'to', jsonb_build_object('name', v_name, 'tag', v_tag)), null, jsonb_build_object('guild', p_guild, 'name', g.name, 'tag', g.tag));
  return jsonb_build_object('ok', true, 'name', v_name, 'tag', v_tag);
end $$;

create or replace function public.admin_guild_transfer(p_guild uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; u uuid;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from guild_members m where m.guild_id = p_guild and m.user_id = p_user) then raise exception 'NOT_MEMBER'; end if;
  update guilds set owner = p_user where id = p_guild;
  for u in select m.user_id from guild_members m where m.guild_id = p_guild loop
    perform live_send('user:' || u, 'guild', jsonb_build_object('type', 'owner', 'guild', p_guild));
  end loop;
  perform public.admin_note('guild-transfer', p_user, jsonb_build_object('guild', p_guild, 'from', g.owner, 'to', p_user), null,
    jsonb_build_object('guild', p_guild, 'owner', g.owner));
  return jsonb_build_object('ok', true, 'owner', p_user);
end $$;

create or replace function public.admin_guild_delete(p_guild uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; v_members integer; v_back integer;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  select count(*) into v_members from guild_members where guild_id = p_guild;
  v_back := public.admin_guild_close(p_guild);
  perform public.admin_note('guild-delete', null,
    jsonb_build_object('guild', p_guild, 'name', g.name, 'tag', g.tag, 'members', v_members, 'bank_returned', v_back), null, null);
  return jsonb_build_object('ok', true, 'members', v_members, 'bank_returned', v_back);
end $$;

create or replace function public.admin_removed(p_topic text, p_table text, p_ids jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare i integer := 0; n integer := coalesce(jsonb_array_length(p_ids), 0);
begin
  while i < n loop
    perform live_send(p_topic, 'removed', jsonb_build_object('table', p_table, 'ids',
      (select jsonb_agg(v order by k) from jsonb_array_elements(p_ids) with ordinality as t(v, k) where k > i and k <= i + 200)));
    i := i + 200;
  end loop;
end $$;

create or replace function public.admin_delete_messages(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); r jsonb; v_groups jsonb; n_dm integer := 0; n_guild integer := 0;
begin
  with dm as (delete from messages where sender = p_user returning id, sender, recipient),
  gm as (delete from guild_messages where sender = p_user returning id, guild_id),
  x as (
    select 'user:' || recipient as topic, 'messages' as tbl, id from dm
    union all select 'user:' || sender, 'messages', id from dm
    union all select 'guild:' || guild_id, 'guild_messages', id from gm
  )
  select (select count(*) from dm), (select count(*) from gm),
    coalesce((select jsonb_agg(jsonb_build_object('topic', y.topic, 'tbl', y.tbl, 'ids', y.ids)) from (
      select topic, tbl, jsonb_agg(id) as ids from x group by topic, tbl) y), '[]'::jsonb)
    into n_dm, n_guild, v_groups;
  for r in select * from jsonb_array_elements(v_groups) loop
    perform public.admin_removed(r->>'topic', r->>'tbl', r->'ids');
  end loop;
  perform public.admin_note('delete-messages', p_user, jsonb_build_object('messages', n_dm, 'guild_messages', n_guild), null, null);
  return jsonb_build_object('ok', true, 'messages', n_dm, 'guild_messages', n_guild);
end $$;

create or replace function public.admin_delete_guild_messages(p_guild uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_ids jsonb;
begin
  with gone as (delete from guild_messages where guild_id = p_guild returning id)
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from gone;
  perform public.admin_removed('guild:' || p_guild, 'guild_messages', v_ids);
  perform public.admin_note('delete-guild-messages', null, jsonb_build_object('guild', p_guild, 'guild_messages', jsonb_array_length(v_ids)), null, null);
  return jsonb_build_object('ok', true, 'guild_messages', jsonb_array_length(v_ids));
end $$;

create or replace function public.admin_announce(p_title text, p_body text, p_target jsonb,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  t jsonb := case when jsonb_typeof(p_target) = 'object' then p_target else '{}'::jsonb end;
  v_user uuid;
  v_guild uuid;
  v_id bigint;
  v_start timestamptz := coalesce(p_starts_at, now());
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'BAD_BODY'; end if;
  if p_ends_at is not null and p_ends_at <= v_start then raise exception 'BAD_WINDOW'; end if;
  begin
    if t = '{"all": true}'::jsonb then
      null;
    elsif (select count(*) from jsonb_object_keys(t)) = 1 and jsonb_typeof(t->'user') = 'string' then
      v_user := (t->>'user')::uuid;
    elsif (select count(*) from jsonb_object_keys(t)) = 1 and jsonb_typeof(t->'guild') = 'string' then
      v_guild := (t->>'guild')::uuid;
    else
      raise exception 'BAD_TARGET';
    end if;
  exception when others then raise exception 'BAD_TARGET';
  end;
  if v_user is not null and not exists (select 1 from auth.users u where u.id = v_user) then raise exception 'NOT_FOUND'; end if;
  if v_guild is not null and not exists (select 1 from guilds g where g.id = v_guild) then raise exception 'NOT_FOUND'; end if;
  insert into announcements (title_en, title_fr, body_en, body_fr, kind, starts_at, ends_at, target_user, target_guild, created_by)
    values (left(coalesce(p_title, ''), 200), left(coalesce(p_title, ''), 200), left(p_body, 4000), left(p_body, 4000), 'note',
      v_start, p_ends_at, v_user, v_guild, v_me)
    returning id into v_id;
  perform public.admin_note('announce', v_user, jsonb_build_object('id', v_id, 'title', p_title, 'target', t,
    'starts_at', v_start, 'ends_at', p_ends_at), null, jsonb_build_object('id', v_id));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.admin_retire_announcement(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); a announcements;
begin
  select * into a from announcements where id = p_id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.ends_at is not null and a.ends_at <= now() then return jsonb_build_object('ok', true, 'already', true); end if;
  update announcements set ends_at = now() where id = p_id;
  perform public.admin_note('retire', a.target_user, jsonb_build_object('id', p_id), null,
    jsonb_build_object('id', p_id, 'ends_at', a.ends_at));
  return jsonb_build_object('ok', true, 'already', false);
end $$;

create or replace function public.admin_undo(p_log bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  l admin_log;
  u jsonb;
  v_batch uuid;
  v_new uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_stamp bigint := public.admin_stamp();
  v_deleted integer := 0;
  v_inverse integer := 0;
  v_skipped integer := 0;
  v_detail jsonb;
  v_key text;
  v_val jsonb;
  v_keys text[];
  s jsonb;
  a announcements;
begin
  select * into l from admin_log where id = p_log for update;
  if l.id is null then raise exception 'NOT_FOUND'; end if;
  if l.undone_at is not null then
    return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'already undone', 'at', l.undone_at));
  end if;
  u := l.undo;
  if u is null then
    return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'this action cannot be undone', 'kind', l.kind));
  end if;

  if l.kind = 'grant' then
    v_batch := (u->>'batch')::uuid;
    delete from grants where batch = v_batch and claimed_at is null;
    get diagnostics v_deleted = row_count;
    select count(*) into v_skipped from grants g where g.batch = v_batch and g.claimed_at is not null and g.failed_at is null
      and not (g.kind in ('card', 'booster', 'owned', 'revokeOwned')
        or (g.kind in ('coins', 'ink') and coalesce(g.payload->>'mode', 'add') = 'add'));
    insert into grants (user_id, at, kind, payload, note_en, note_fr, created_by, batch)
      select g.user_id, v_now + (row_number() over (order by g.id, x.kind) * interval '1 microsecond'), x.kind, x.payload, '', '', v_me, v_new
      from grants g
      cross join lateral (
        select g.kind as kind, jsonb_build_object('amount', -((g.payload->>'amount')::numeric), 'mode', 'add') as payload
          where g.kind in ('coins', 'ink') and coalesce(g.payload->>'mode', 'add') = 'add'
        union all
        select 'takeCard', jsonb_build_object('key', g.payload->'article'->>'key', 'copies', coalesce((g.payload->>'count')::integer, 1))
          where g.kind = 'card' and g.payload->'article'->>'key' is not null
        union all
        select 'takeBooster', jsonb_build_object('spec', g.payload->'spec', 'count', coalesce((g.payload->>'count')::integer, 1))
          where g.kind = 'booster'
        union all
        select 'revokeOwned', jsonb_build_object('bucket', g.payload->>'bucket', 'id', i.v)
          from jsonb_array_elements_text(case when jsonb_typeof(g.payload->'ids') = 'array' then g.payload->'ids'
            else jsonb_build_array(g.payload->'id') end) as i(v)
          where g.kind = 'owned' and i.v is not null
        union all
        select 'owned', jsonb_build_object('bucket', g.payload->>'bucket', 'id', g.payload->>'id')
          where g.kind = 'revokeOwned'
      ) x
      where g.batch = v_batch and g.claimed_at is not null and g.failed_at is null;
    get diagnostics v_inverse = row_count;
    if v_deleted = 0 and v_inverse = 0 then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason',
        case when v_skipped > 0 then 'what was claimed (xp, level, boosters opened or a card taken) cannot be given back'
             else 'nothing of this grant is left to undo' end, 'skipped', v_skipped));
    end if;
    v_detail := jsonb_build_object('deleted', v_deleted, 'inverse', v_inverse, 'skipped', v_skipped,
      'batch', case when v_inverse > 0 then v_new end);
  elsif l.kind = 'standing' then
    s := u->'before';
    if s is null or jsonb_typeof(s) = 'null' then
      delete from suspensions where user_id = l.target;
    else
      insert into suspensions (user_id, reason, until, muted, at, by)
        values (l.target, coalesce(s->>'reason', ''), (s->>'until')::timestamptz, coalesce((s->>'muted')::boolean, false),
          coalesce((s->>'at')::timestamptz, now()), (s->>'by')::uuid)
        on conflict (user_id) do update set reason = excluded.reason, until = excluded.until, muted = excluded.muted, at = excluded.at, by = excluded.by;
    end if;
    v_detail := jsonb_build_object('standing', s);
  elsif l.kind = 'rename' then
    if exists (select 1 from profiles p where lower(p.username) = lower(u->>'name') and p.id <> l.target) then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the old name has been taken since'));
    end if;
    update profiles set username = u->>'name' where id = l.target;
    perform live_send('user:' || l.target, 'profile', jsonb_build_object('username', u->>'name'));
    v_detail := jsonb_build_object('username', u->>'name');
  elsif l.kind = 'announce' then
    update announcements set ends_at = now() where id = (u->>'id')::bigint and (ends_at is null or ends_at > now());
    v_detail := jsonb_build_object('retired', (u->>'id')::bigint);
  elsif l.kind = 'retire' then
    select * into a from announcements where id = (u->>'id')::bigint;
    if a.id is null then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the announcement is gone'));
    end if;
    update announcements set ends_at = (u->>'ends_at')::timestamptz where id = a.id;
    v_detail := jsonb_build_object('restored', a.id);
  elsif l.kind = 'save-key' then
    if coalesce((u->>'had')::boolean, false) then
      perform public.admin_save_write(l.target, u->>'key', u->>'value', v_stamp);
    else
      perform public.admin_save_write(l.target, u->>'key', null, v_stamp);
    end if;
    perform live_send('user:' || l.target, 'save', jsonb_build_object('keys', jsonb_build_array(u->>'key')));
    v_detail := jsonb_build_object('key', u->>'key');
  elsif l.kind = 'restore-backup' then
    v_keys := array(select jsonb_array_elements_text(u->'wrote'));
    foreach v_key in array v_keys loop
      v_val := u->'keys'->v_key;
      perform public.admin_save_write(l.target, v_key, case when v_val is null then null else v_val #>> '{}' end, v_stamp);
    end loop;
    perform live_send('user:' || l.target, 'save', jsonb_build_object('keys', u->'wrote'));
    v_detail := jsonb_build_object('keys', u->'wrote');
  elsif l.kind = 'guild-rename' then
    if exists (select 1 from guilds x where (lower(x.name) = lower(u->>'name') or x.tag = u->>'tag') and x.id <> (u->>'guild')::uuid) then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the old name or tag has been taken since'));
    end if;
    update guilds set name = u->>'name', tag = u->>'tag' where id = (u->>'guild')::uuid;
    if not found then return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the guild is gone')); end if;
    perform live_send('user:' || m.user_id, 'guild', jsonb_build_object('type', 'renamed', 'guild', m.guild_id))
      from guild_members m where m.guild_id = (u->>'guild')::uuid;
    v_detail := jsonb_build_object('name', u->>'name', 'tag', u->>'tag');
  elsif l.kind = 'guild-transfer' then
    if not exists (select 1 from guild_members m where m.guild_id = (u->>'guild')::uuid and m.user_id = (u->>'owner')::uuid) then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the old owner is no longer a member'));
    end if;
    update guilds set owner = (u->>'owner')::uuid where id = (u->>'guild')::uuid;
    perform live_send('user:' || m.user_id, 'guild', jsonb_build_object('type', 'owner', 'guild', m.guild_id))
      from guild_members m where m.guild_id = (u->>'guild')::uuid;
    v_detail := jsonb_build_object('owner', u->>'owner');
  elsif u->>'op' in ('restore_row', 'delete_row') then
    v_detail := public.admin_undo_row(u);
  else
    return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'this action cannot be undone', 'kind', l.kind));
  end if;

  update admin_log set undone_at = now() where id = l.id;
  perform public.admin_note('undo', l.target, jsonb_build_object('log', l.id, 'kind', l.kind) || v_detail, null, null,
    case when v_inverse > 0 then v_new end);
  return jsonb_build_object('ok', true, 'detail', v_detail);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_gate()', 'admin_note(text, uuid, jsonb, text, jsonb, uuid)', 'admin_stamp()', 'admin_audience_ids(jsonb)',
    'admin_grant_items(jsonb)', 'admin_save_write(uuid, text, text, bigint)', 'admin_auction_pull(uuid)',
    'admin_guild_close(uuid)', 'admin_removed(text, text, jsonb)', 'live_grants()', 'live_standing()', 'live_notice()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'admin_dashboard()', 'admin_search_players(text, jsonb, integer, integer)', 'admin_player(uuid)',
    'admin_player_cards(uuid, text, integer, integer)', 'admin_audience(jsonb)', 'admin_grant(jsonb, jsonb, text, text)',
    'admin_undo(bigint)', 'admin_set_standing(uuid, text, timestamptz, text, text)', 'admin_rename(uuid, text)',
    'admin_cancel_trade(uuid)', 'admin_cancel_trades(uuid)', 'admin_cancel_auction(uuid)', 'admin_cancel_auctions(uuid, boolean)',
    'admin_restore_backup(uuid, bigint)', 'admin_set_save_key(uuid, text, text)', 'admin_wipe(uuid, text)',
    'admin_guild(uuid)', 'admin_guild_remove_member(uuid, uuid)', 'admin_guild_rename(uuid, text, text)',
    'admin_guild_transfer(uuid, uuid)', 'admin_guild_delete(uuid)', 'admin_delete_messages(uuid)',
    'admin_delete_guild_messages(uuid)', 'admin_announce(text, text, jsonb, timestamptz, timestamptz)',
    'admin_retire_announcement(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- live ops
create table if not exists public.admin_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  actor    uuid not null references auth.users on delete set null,
  target   uuid references auth.users on delete set null,
  kind     text not null,
  detail   jsonb not null default '{}'::jsonb,
  reason   text,
  ok       boolean not null default true
);
alter table public.admin_log add column if not exists undo jsonb;
alter table public.admin_log enable row level security;

create or replace function public.liveops_actor()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  ok := public.is_control_admin(auth.uid());
  if not coalesce(ok, false) then
    begin
      ok := public.is_admin();
    exception when undefined_function then
      ok := false;
    end;
  end if;
  if not coalesce(ok, false) or auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  return auth.uid();
end $$;
revoke all on function public.liveops_actor() from public, anon, authenticated;

create or replace function public.liveops_log(p_kind text, p_detail jsonb, p_undo jsonb, p_target uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into admin_log (actor, target, kind, detail, undo)
    values (auth.uid(), p_target, p_kind, coalesce(p_detail, '{}'::jsonb), p_undo)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.liveops_log(text, jsonb, jsonb, uuid) from public, anon, authenticated;

create or replace function public.liveops_rarities()
returns text[] language sql immutable as $$
  select array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic']
$$;

create or replace function public.liveops_num(p jsonb, p_lo numeric, p_hi numeric, p_whole boolean default false)
returns boolean language plpgsql immutable as $$
declare n numeric;
begin
  if p is null or jsonb_typeof(p) <> 'number' then return false; end if;
  n := (p #>> '{}')::numeric;
  return n >= p_lo and n <= p_hi and (not p_whole or n = trunc(n));
end $$;

create or replace function public.liveops_text(p jsonb, p_max integer)
returns boolean language plpgsql immutable as $$
begin
  if p is null then return false; end if;
  if jsonb_typeof(p) = 'string' then return char_length(p #>> '{}') between 1 and p_max; end if;
  if jsonb_typeof(p) <> 'object' or not (p ? 'en' or p ? 'fr') then return false; end if;
  return not exists (select 1 from jsonb_each(p) e where e.key not in ('en', 'fr')
    or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > p_max);
end $$;

create or replace function public.liveops_spec_ok(p_spec jsonb)
returns boolean language plpgsql immutable as $$
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(p_spec) k where k not in ('kind', 'themeId', 'rarityId', 'cards')) then return false; end if;
  if coalesce(p_spec->>'kind', '') not in ('theme', 'open') then return false; end if;
  if p_spec->>'kind' = 'theme' and coalesce(p_spec->>'themeId', '') !~ '^[a-z0-9_-]{1,60}$' then return false; end if;
  if jsonb_typeof(p_spec->'rarityId') = 'string' and not (p_spec->>'rarityId' = any(public.liveops_rarities())) then return false; end if;
  if p_spec ? 'rarityId' and jsonb_typeof(p_spec->'rarityId') not in ('string', 'null') then return false; end if;
  return public.liveops_num(p_spec->'cards', 1, 12, true);
end $$;

create or replace function public.liveops_items_ok(p_items jsonb)
returns boolean language plpgsql immutable as $$
declare it jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 20 then return false; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' then return false; end if;
    case coalesce(it->>'kind', '')
      when 'coins', 'ink', 'xp' then
        if not public.liveops_num(it->'amount', 1, 10000000, true) then return false; end if;
      when 'booster' then
        if not public.liveops_spec_ok(it->'spec') then return false; end if;
        if it ? 'count' and not public.liveops_num(it->'count', 1, 50, true) then return false; end if;
      when 'card' then
        if jsonb_typeof(it->'article') <> 'object' or coalesce(it->'article'->>'key', '') = ''
           or coalesce(it->'article'->>'title', '') = '' then return false; end if;
        if it ? 'rarityId' and not (coalesce(it->>'rarityId', '') = any(public.liveops_rarities())) then return false; end if;
        if it ? 'count' and not public.liveops_num(it->'count', 1, 50, true) then return false; end if;
      when 'owned' then
        if coalesce(it->>'bucket', '') not in ('themes', 'frames', 'fx', 'looks', 'openings', 'supporter') then return false; end if;
        if not (jsonb_typeof(it->'id') = 'string' or (jsonb_typeof(it->'ids') = 'array' and jsonb_array_length(it->'ids') > 0)) then return false; end if;
      else
        return false;
    end case;
  end loop;
  return true;
end $$;

create or replace function public.liveops_event_ok(p_kind text, p_params jsonb)
returns boolean language plpgsql immutable as $$
declare e record;
begin
  if p_params is null or jsonb_typeof(p_params) <> 'object' then return false; end if;
  if p_params ? 'title' and not public.liveops_text(p_params->'title', 120) then return false; end if;
  if p_params ? 'kinds' and jsonb_typeof(p_params->'kinds') <> 'array' then return false; end if;
  if p_params ? 'themes' and jsonb_typeof(p_params->'themes') <> 'array' then return false; end if;
  if p_params ? 'sections' and jsonb_typeof(p_params->'sections') <> 'array' then return false; end if;
  if p_kind = 'drop_rate' then
    if jsonb_typeof(p_params->'mult') <> 'object' or not exists (select 1 from jsonb_object_keys(p_params->'mult')) then return false; end if;
    for e in select * from jsonb_each(p_params->'mult') loop
      if not (e.key = any(public.liveops_rarities())) or not public.liveops_num(e.value, 0, 100) then return false; end if;
    end loop;
    return true;
  elsif p_kind in ('price', 'xp') then
    return public.liveops_num(p_params->'mult', 0.1, 10);
  elsif p_kind = 'free_packs' then
    if p_params ? 'spec' and not public.liveops_spec_ok(p_params->'spec') then return false; end if;
    if p_params ? 'count' and not public.liveops_num(p_params->'count', 1, 20, true) then return false; end if;
    if p_params ? 'timed' and not public.liveops_num(p_params->'timed', 1, 50, true) then return false; end if;
    return p_params ? 'spec' or p_params ? 'timed';
  elsif p_kind = 'limited_booster' then
    if not public.liveops_spec_ok(p_params->'spec') then return false; end if;
    if not public.liveops_num(p_params->'price', 0, 10000000, true) then return false; end if;
    if p_params ? 'stock' and not public.liveops_num(p_params->'stock', 1, 10000000, true) then return false; end if;
    if p_params ? 'perPlayer' and not public.liveops_num(p_params->'perPlayer', 1, 1000, true) then return false; end if;
    return true;
  end if;
  return false;
end $$;

create table if not exists public.tuning_keys (
  key   text primary key,
  kind  text not null check (kind in ('number', 'int', 'tiers', 'odds')),
  def   jsonb not null,
  lo    numeric not null,
  hi    numeric not null,
  about text not null
);
alter table public.tuning_keys enable row level security;
insert into public.tuning_keys (key, kind, def, lo, hi, about) values
  ('shop.priceMult', 'number', '1', 0.2, 5, 'Multiplier on every booster price in the shop'),
  ('shop.tierMult', 'tiers', '{}', 0.2, 5, 'Extra shop price multiplier per booster tier: plain, uncommon, rare, epic, legendary, mythic, exotic, prismatic'),
  ('sell.mult', 'number', '1', 0, 5, 'Multiplier on what selling a card pays'),
  ('daily.coinsMult', 'number', '1', 0, 10, 'Multiplier on the coins of the daily gift'),
  ('stipend.amount', 'int', '500', 0, 20000, 'Coins paid for every two hour window'),
  ('stipend.maxBanked', 'int', '4', 0, 24, 'Stipend windows that can pile up while away'),
  ('timed.regenMult', 'number', '1', 0.1, 10, 'Multiplier on the wait between timed free packs, below 1 is faster'),
  ('timed.capBonus', 'int', '0', -6, 50, 'Timed free packs that can be held, added to the cap of each level'),
  ('xp.mult', 'number', '1', 0, 10, 'Multiplier on the XP every pulled card gives'),
  ('fuse.copies', 'int', '3', 1, 10, 'Copies a fusion consumes'),
  ('crate.basePrice', 'int', '1000', 50, 100000, 'Price of the first crate in a shop window'),
  ('starter.coins', 'int', '1500', 0, 100000, 'Coins a new player starts with'),
  ('free.slots', 'int', '2', 0, 6, 'Boosters on the free shelf'),
  ('free.cards', 'int', '3', 3, 7, 'Cards in each free shelf booster'),
  ('odds.table', 'odds', '{}', 0, 100, 'Rarity odds per booster tier (none, common ... prismatic), eight weights from common to prismatic')
on conflict (key) do update set kind = excluded.kind, def = excluded.def, lo = excluded.lo, hi = excluded.hi, about = excluded.about;

create table if not exists public.tuning (
  key        text primary key references public.tuning_keys on delete cascade,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.tuning enable row level security;

delete from public.tuning_keys where key not in ('shop.priceMult', 'shop.tierMult', 'sell.mult', 'daily.coinsMult', 'stipend.amount',
  'stipend.maxBanked', 'timed.regenMult', 'timed.capBonus', 'xp.mult', 'fuse.copies', 'crate.basePrice', 'starter.coins',
  'free.slots', 'free.cards', 'odds.table', 'pity.legendary', 'market.fee', 'market.step', 'market.maxLots');

create or replace function public.liveops_tuning_ok(p_key text, p_value jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare k tuning_keys; e record; i integer; s numeric;
begin
  select * into k from tuning_keys where key = p_key;
  if k.key is null or p_value is null then return false; end if;
  if k.kind in ('number', 'int') then return public.liveops_num(p_value, k.lo, k.hi, k.kind = 'int'); end if;
  if jsonb_typeof(p_value) <> 'object' then return false; end if;
  for e in select * from jsonb_each(p_value) loop
    if k.kind = 'tiers' then
      if e.key not in ('plain', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic')
         or not public.liveops_num(e.value, k.lo, k.hi) then return false; end if;
    else
      if not (e.key = 'none' or e.key = any(public.liveops_rarities())) or jsonb_typeof(e.value) <> 'array'
         or jsonb_array_length(e.value) <> 8 then return false; end if;
      s := 0;
      for i in 0..7 loop
        if not public.liveops_num(e.value->i, k.lo, k.hi) then return false; end if;
        s := s + (e.value->>i)::numeric;
      end loop;
      if s <= 0 then return false; end if;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.liveops_tuning_ok(text, jsonb) from public, anon, authenticated;

create table if not exists public.live_events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  kind       text not null check (kind in ('drop_rate', 'free_packs', 'limited_booster', 'price', 'xp')),
  params     jsonb not null default '{}'::jsonb,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists live_events_window_idx on public.live_events (ends_at, starts_at);
alter table public.live_events enable row level security;

create table if not exists public.redeem_codes (
  code       text primary key check (code ~ '^[A-Z0-9]{4,32}$'),
  items      jsonb not null,
  max_uses   integer check (max_uses is null or max_uses > 0),
  per_user   integer not null default 1 check (per_user between 1 and 100),
  starts_at  timestamptz,
  expires_at timestamptz,
  disabled   boolean not null default false,
  note       text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.redeem_codes enable row level security;

create table if not exists public.redeem_uses (
  id      bigserial primary key,
  code    text not null references public.redeem_codes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists redeem_uses_code_idx on public.redeem_uses (code, user_id);
alter table public.redeem_uses enable row level security;

create table if not exists public.admin_packs (
  id              text primary key check (id ~ '^pack-[a-z0-9-]{2,40}$'),
  name            jsonb not null,
  tagline         jsonb not null default '{}'::jsonb,
  icon            text check (icon is null or char_length(icon) <= 40),
  accent          text check (accent is null or accent ~ '^#[0-9a-fA-F]{3,8}$'),
  accent2         text check (accent2 is null or accent2 ~ '^#[0-9a-fA-F]{3,8}$'),
  source          jsonb not null,
  rarity_odds     jsonb,
  default_cards   integer not null default 5 check (default_cards between 1 and 12),
  price           integer check (price is null or price between 0 and 10000000),
  available_from  timestamptz,
  available_until timestamptz,
  limited_stock   integer check (limited_stock is null or limited_stock > 0),
  per_player      integer check (per_player is null or per_player > 0),
  visible         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.admin_packs enable row level security;

create table if not exists public.card_overrides (
  article_key          text primary key check (char_length(article_key) between 3 and 320),
  lang                 text not null default 'en' check (lang ~ '^[a-z-]{2,12}$'),
  title_override       text check (title_override is null or char_length(title_override) between 1 and 300),
  description_override text check (description_override is null or char_length(description_override) <= 600),
  image_url            text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2000)),
  rarity_override      text check (rarity_override is null or rarity_override in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic', 'prismatic')),
  price_override       bigint check (price_override is null or price_override between 0 and 2000000000),
  hidden               boolean not null default false,
  updated_at           timestamptz not null default now()
);
alter table public.card_overrides enable row level security;
grant select on public.card_overrides to service_role;

create table if not exists public.live_stock (
  item text primary key,
  sold integer not null default 0 check (sold >= 0)
);
alter table public.live_stock enable row level security;

create table if not exists public.push_broadcasts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  url        text,
  target     jsonb not null,
  users      uuid[] not null,
  devices    integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  sent       integer,
  sent_at    timestamptz
);
alter table public.push_broadcasts enable row level security;

create index if not exists claims_event_idx on public.claims (key) where key like 'event:%';

create or replace function public.liveops_pack_json(p admin_packs, p_full boolean)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.id, 'name', p.name, 'tagline', p.tagline, 'icon', p.icon, 'accent', p.accent,
    'accent2', p.accent2, 'rarity_odds', p.rarity_odds, 'default_cards', p.default_cards, 'price', p.price,
    'available_from', p.available_from, 'available_until', p.available_until, 'limited_stock', p.limited_stock,
    'per_player', p.per_player, 'visible', p.visible)
    || case when p_full then jsonb_build_object('source', p.source) else '{}'::jsonb end
$$;

create or replace function public.liveops_events_json()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'kind', e.kind, 'params', e.params - 'note',
      'starts_at', e.starts_at, 'ends_at', e.ends_at) order by e.starts_at, e.id), '[]'::jsonb)
    from live_events e
   where e.ends_at > now() and e.starts_at <= now() + interval '24 hours'
$$;
revoke all on function public.liveops_events_json() from public, anon, authenticated;

create or replace function public.liveops_config(p_full boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tuning', coalesce((select jsonb_object_agg(t.key, t.value) from tuning t), '{}'::jsonb),
    'events', public.liveops_events_json(),
    'packs', coalesce((select jsonb_agg(public.liveops_pack_json(p, p_full) order by p.id) from admin_packs p), '[]'::jsonb),
    'stock', coalesce((select jsonb_object_agg(s.item, s.sold) from live_stock s where s.sold > 0), '{}'::jsonb),
    'at', now())
    || case when p_full then jsonb_build_object('overrides', (select count(*) from card_overrides)) else '{}'::jsonb end
$$;
revoke all on function public.liveops_config(boolean) from public, anon, authenticated;

create or replace function public.live_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select public.liveops_config(false)
$$;
revoke all on function public.live_state() from public;
grant execute on function public.live_state() to anon, authenticated;

create or replace function public.live_events_active()
returns jsonb language sql stable security definer set search_path = public as $$
  select public.liveops_events_json()
$$;
revoke all on function public.live_events_active() from public;
grant execute on function public.live_events_active() to anon, authenticated;

create or replace function public.packs_live()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.liveops_pack_json(p, false) order by p.id), '[]'::jsonb) from admin_packs p
$$;
revoke all on function public.packs_live() from public;
grant execute on function public.packs_live() to anon, authenticated;

create or replace function public.econ_load_live(p_user uuid, p_bucket text default null, p_max integer default 150,
  p_keys text[] default null, p_pull uuid default null, p_since timestamptz default null, p_weight integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.econ_load(p_user, p_bucket, p_max, p_keys, p_pull, p_since, p_weight)
    || jsonb_build_object('live', public.liveops_config(true));
end $$;
revoke all on function public.econ_load_live(uuid, text, integer, text[], uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.econ_load_live(uuid, text, integer, text[], uuid, timestamptz, integer) to service_role;

create or replace function public.liveops_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.econ_code_take(p_user uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := public.liveops_code(p_code);
  c      redeem_codes;
  v_used integer;
  v_mine integer;
  v_id   bigint;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  perform public.rate_limit(p_user, 'redeem', 12, 600);
  select * into c from redeem_codes where code = v_code for update;
  if c.code is null or (c.starts_at is not null and now() < c.starts_at) then raise exception 'UNKNOWN_CODE'; end if;
  if c.disabled or (c.expires_at is not null and now() >= c.expires_at) then raise exception 'CODE_EXPIRED'; end if;
  select count(*), count(*) filter (where u.user_id = p_user) into v_used, v_mine from redeem_uses u where u.code = v_code;
  if v_mine >= c.per_user then raise exception 'ALREADY_CLAIMED'; end if;
  if c.max_uses is not null and v_used >= c.max_uses then raise exception 'CODE_USED_UP'; end if;
  insert into redeem_uses (code, user_id) values (v_code, p_user) returning id into v_id;
  return jsonb_build_object('code', v_code, 'items', c.items, 'use', v_id, 'n', v_mine + 1);
end $$;
revoke all on function public.econ_code_take(uuid, text) from public, anon, authenticated;
grant execute on function public.econ_code_take(uuid, text) to service_role;

create or replace function public.econ_code_release(p_use bigint)
returns void language sql security definer set search_path = public as $$
  delete from redeem_uses where id = p_use and at > now() - interval '10 minutes'
$$;
revoke all on function public.econ_code_release(bigint) from public, anon, authenticated;
grant execute on function public.econ_code_release(bigint) to service_role;

create or replace function public.liveops_stock_limit(p_item text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare v integer;
begin
  if p_item like 'live|event:%' then
    select case when public.liveops_num(e.params->'stock', 1, 10000000, true) then (e.params->>'stock')::integer end
      into v from live_events e where e.id::text = substr(p_item, 12);
  elsif p_item like 'live|pack-%' then
    select p.limited_stock into v from admin_packs p where p.id = substr(p_item, 6);
  end if;
  return v;
end $$;
revoke all on function public.liveops_stock_limit(text) from public, anon, authenticated;

create or replace function public.econ_stock_take(p_item text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_limit integer := public.liveops_stock_limit(p_item); v_sold integer;
begin
  if p_item is null or p_item !~ '^live\|' then raise exception 'NOT_IN_SHOP'; end if;
  insert into live_stock (item, sold) values (p_item, 0) on conflict (item) do nothing;
  update live_stock set sold = sold + 1 where item = p_item and (v_limit is null or sold < v_limit) returning sold into v_sold;
  if v_sold is null then raise exception 'SOLD_OUT'; end if;
  return v_sold;
end $$;
revoke all on function public.econ_stock_take(text) from public, anon, authenticated;
grant execute on function public.econ_stock_take(text) to service_role;

create or replace function public.econ_stock_give(p_item text)
returns void language sql security definer set search_path = public as $$
  update live_stock set sold = greatest(0, sold - 1) where item = p_item
$$;
revoke all on function public.econ_stock_give(text) from public, anon, authenticated;
grant execute on function public.econ_stock_give(text) to service_role;

create or replace function public.admin_event_upsert(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := public.liveops_actor();
  v_old    live_events;
  v_row    live_events;
  v_id     uuid;
  v_name   text;
  v_kind   text;
  v_params jsonb;
  v_starts timestamptz;
  v_ends   timestamptz;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'BAD_EVENT'; end if;
  v_id := nullif(p_event->>'id', '')::uuid;
  if v_id is not null then select * into v_old from live_events where id = v_id for update; end if;
  v_name := coalesce(nullif(btrim(p_event->>'name'), ''), v_old.name);
  v_kind := coalesce(p_event->>'kind', v_old.kind);
  v_params := coalesce(p_event->'params', v_old.params, '{}'::jsonb);
  v_starts := coalesce(nullif(p_event->>'starts_at', '')::timestamptz, v_old.starts_at, now());
  v_ends := coalesce(nullif(p_event->>'ends_at', '')::timestamptz, v_old.ends_at);
  if v_name is null or char_length(v_name) > 120 or v_ends is null or v_ends <= v_starts then raise exception 'BAD_EVENT'; end if;
  if v_kind is null or not public.liveops_event_ok(v_kind, v_params) then raise exception 'BAD_PARAMS'; end if;
  if v_old.id is null then
    insert into live_events (id, name, kind, params, starts_at, ends_at, created_by)
      values (coalesce(v_id, gen_random_uuid()), v_name, v_kind, v_params, v_starts, v_ends, v_me)
      returning * into v_row;
    perform public.liveops_log('event_create', jsonb_build_object('new', to_jsonb(v_row)),
      jsonb_build_object('op', 'delete_row', 'table', 'live_events', 'key', jsonb_build_object('id', v_row.id)));
  else
    update live_events set name = v_name, kind = v_kind, params = v_params, starts_at = v_starts, ends_at = v_ends
      where id = v_old.id returning * into v_row;
    perform public.liveops_log('event_update', jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row)),
      jsonb_build_object('op', 'restore_row', 'table', 'live_events', 'key', jsonb_build_object('id', v_old.id), 'row', to_jsonb(v_old)));
  end if;
  perform public.live_send('world', 'events', jsonb_build_object('type', 'UPDATE', 'id', v_row.id));
  return to_jsonb(v_row);
end $$;

create or replace function public.admin_event_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old live_events;
begin
  delete from live_events where id = p_id returning * into v_old;
  if v_old.id is null then return jsonb_build_object('deleted', false); end if;
  perform public.liveops_log('event_delete', jsonb_build_object('old', to_jsonb(v_old)),
    jsonb_build_object('op', 'restore_row', 'table', 'live_events', 'key', jsonb_build_object('id', v_old.id), 'row', to_jsonb(v_old)));
  perform public.live_send('world', 'events', jsonb_build_object('type', 'DELETE', 'id', v_old.id));
  return jsonb_build_object('deleted', true, 'event', to_jsonb(v_old));
end $$;

create or replace function public.admin_events(p_include_past boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor();
begin
  return coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object(
      'status', case when now() < e.starts_at then 'upcoming' when now() >= e.ends_at then 'past' else 'live' end,
      'claimed', (select count(*) from claims c where c.key like 'event:%' and c.key = 'event:' || e.id::text),
      'sold', coalesce((select s.sold from live_stock s where s.item = 'live|event:' || e.id::text), 0))
      order by e.starts_at desc)
    from live_events e where coalesce(p_include_past, false) or e.ends_at > now()), '[]'::jsonb);
end $$;

create or replace function public.admin_code_create(p_code jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := public.liveops_actor();
  v_code  text := public.liveops_code(p_code->>'code');
  v_row   redeem_codes;
  v_abc   text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_tries integer := 0;
begin
  if p_code is null or jsonb_typeof(p_code) <> 'object' then raise exception 'BAD_CODE'; end if;
  if not public.liveops_items_ok(p_code->'items') then raise exception 'BAD_ITEMS'; end if;
  if v_code = '' then
    loop
      v_code := (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::integer, 1), '') from generate_series(1, 10));
      exit when not exists (select 1 from redeem_codes where code = v_code);
      v_tries := v_tries + 1;
      if v_tries > 20 then raise exception 'CODE_TAKEN'; end if;
    end loop;
  end if;
  if v_code !~ '^[A-Z0-9]{4,32}$' then raise exception 'BAD_CODE'; end if;
  begin
    insert into redeem_codes (code, items, max_uses, per_user, starts_at, expires_at, disabled, note, created_by)
      values (v_code, p_code->'items', nullif(p_code->>'max_uses', '')::integer, coalesce(nullif(p_code->>'per_user', '')::integer, 1),
        nullif(p_code->>'starts_at', '')::timestamptz, nullif(p_code->>'expires_at', '')::timestamptz,
        coalesce((p_code->>'disabled')::boolean, false), left(p_code->>'note', 300), v_me)
      returning * into v_row;
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  when check_violation then
    raise exception 'BAD_CODE';
  end;
  perform public.liveops_log('code_create', jsonb_build_object('new', to_jsonb(v_row)),
    jsonb_build_object('op', 'restore_row', 'table', 'redeem_codes', 'key', jsonb_build_object('code', v_row.code),
      'row', to_jsonb(v_row) || jsonb_build_object('disabled', true)));
  return to_jsonb(v_row);
end $$;

create or replace function public.admin_code_update(p_code text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old redeem_codes; v_row redeem_codes;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'BAD_CODE'; end if;
  select * into v_old from redeem_codes where code = public.liveops_code(p_code) for update;
  if v_old.code is null then raise exception 'UNKNOWN_CODE'; end if;
  if p_patch ? 'items' and not public.liveops_items_ok(p_patch->'items') then raise exception 'BAD_ITEMS'; end if;
  begin
    update redeem_codes set
        items      = case when p_patch ? 'items' then p_patch->'items' else items end,
        max_uses   = case when p_patch ? 'max_uses' then nullif(p_patch->>'max_uses', '')::integer else max_uses end,
        per_user   = case when p_patch ? 'per_user' then coalesce(nullif(p_patch->>'per_user', '')::integer, 1) else per_user end,
        starts_at  = case when p_patch ? 'starts_at' then nullif(p_patch->>'starts_at', '')::timestamptz else starts_at end,
        expires_at = case when p_patch ? 'expires_at' then nullif(p_patch->>'expires_at', '')::timestamptz else expires_at end,
        disabled   = case when p_patch ? 'disabled' then coalesce((p_patch->>'disabled')::boolean, false) else disabled end,
        note       = case when p_patch ? 'note' then left(p_patch->>'note', 300) else note end
      where code = v_old.code returning * into v_row;
  exception when check_violation then
    raise exception 'BAD_CODE';
  end;
  perform public.liveops_log('code_update', jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row)),
    jsonb_build_object('op', 'restore_row', 'table', 'redeem_codes', 'key', jsonb_build_object('code', v_old.code), 'row', to_jsonb(v_old)));
  return to_jsonb(v_row);
end $$;

create or replace function public.admin_codes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor();
begin
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'uses', (select count(*) from redeem_uses u where u.code = c.code),
      'players', (select count(distinct u.user_id) from redeem_uses u where u.code = c.code),
      'status', case when c.disabled then 'disabled' when c.expires_at is not null and now() >= c.expires_at then 'expired'
        when c.starts_at is not null and now() < c.starts_at then 'upcoming'
        when c.max_uses is not null and (select count(*) from redeem_uses u where u.code = c.code) >= c.max_uses then 'used_up'
        else 'live' end)
      order by c.created_at desc) from redeem_codes c), '[]'::jsonb);
end $$;

create or replace function public.admin_code_uses(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'username', p.username, 'at', u.at) order by u.at desc)
    from (select * from redeem_uses where code = public.liveops_code(p_code) order by at desc limit 500) u
    left join profiles p on p.id = u.user_id), '[]'::jsonb);
end $$;

create or replace function public.admin_tuning()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('key', k.key, 'kind', k.kind, 'default', k.def, 'current', t.value,
      'value', coalesce(t.value, k.def), 'min', k.lo, 'max', k.hi, 'description', k.about,
      'updated_at', t.updated_at, 'updated_by', t.updated_by) order by k.key)
    from tuning_keys k left join tuning t on t.key = k.key), '[]'::jsonb);
end $$;

create or replace function public.admin_tuning_set(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old tuning; v_row tuning;
begin
  if not exists (select 1 from tuning_keys where key = p_key) then raise exception 'UNKNOWN_KEY'; end if;
  if not public.liveops_tuning_ok(p_key, p_value) then raise exception 'BAD_VALUE'; end if;
  select * into v_old from tuning where key = p_key for update;
  insert into tuning (key, value, updated_at, updated_by) values (p_key, p_value, now(), v_me)
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    returning * into v_row;
  perform public.liveops_log('tuning_set', jsonb_build_object('key', p_key, 'old', v_old.value, 'new', p_value),
    case when v_old.key is null then jsonb_build_object('op', 'delete_row', 'table', 'tuning', 'key', jsonb_build_object('key', p_key))
      else jsonb_build_object('op', 'restore_row', 'table', 'tuning', 'key', jsonb_build_object('key', p_key), 'row', to_jsonb(v_old)) end);
  perform public.live_send('world', 'tuning', jsonb_build_object('type', 'UPDATE', 'key', p_key));
  return jsonb_build_object('key', p_key, 'value', v_row.value, 'old', v_old.value);
end $$;

create or replace function public.admin_tuning_reset(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old tuning;
begin
  if not exists (select 1 from tuning_keys where key = p_key) then raise exception 'UNKNOWN_KEY'; end if;
  delete from tuning where key = p_key returning * into v_old;
  if v_old.key is not null then
    perform public.liveops_log('tuning_reset', jsonb_build_object('key', p_key, 'old', v_old.value),
      jsonb_build_object('op', 'restore_row', 'table', 'tuning', 'key', jsonb_build_object('key', p_key), 'row', to_jsonb(v_old)));
    perform public.live_send('world', 'tuning', jsonb_build_object('type', 'DELETE', 'key', p_key));
  end if;
  return jsonb_build_object('key', p_key, 'value', (select def from tuning_keys where key = p_key), 'old', v_old.value);
end $$;

create or replace function public.liveops_source_ok(p jsonb)
returns boolean language plpgsql immutable as $$
declare v jsonb := p->'value';
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if coalesce(p->>'type', '') not in ('category', 'search', 'titles', 'theme') then return false; end if;
  if p ? 'hero' and jsonb_typeof(p->'hero') <> 'string' then return false; end if;
  if p->>'type' = 'theme' then return jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z0-9_-]{1,60}$'; end if;
  if jsonb_typeof(v) = 'string' then return char_length(v #>> '{}') between 1 and 300; end if;
  if jsonb_typeof(v) = 'array' then return jsonb_array_length(v) between 1 and 200; end if;
  if jsonb_typeof(v) = 'object' then
    return (v ? 'en' or v ? 'fr') and not exists (select 1 from jsonb_each(v) e where e.key not in ('en', 'fr')
      or jsonb_typeof(e.value) not in ('string', 'array'));
  end if;
  return false;
end $$;

create or replace function public.liveops_odds_ok(p jsonb)
returns boolean language plpgsql immutable as $$
declare i integer; s numeric := 0;
begin
  if p is null or jsonb_typeof(p) = 'null' then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 8 then return false; end if;
  for i in 0..7 loop
    if not public.liveops_num(p->i, 0, 100) then return false; end if;
    s := s + (p->>i)::numeric;
  end loop;
  return s > 0;
end $$;

create or replace function public.admin_pack_upsert(p_pack jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.liveops_actor();
  v_id  text := lower(btrim(coalesce(p_pack->>'id', '')));
  v_old admin_packs;
  v_row admin_packs;
  v_name jsonb;
begin
  if p_pack is null or jsonb_typeof(p_pack) <> 'object' then raise exception 'BAD_PACK'; end if;
  if v_id = '' then v_id := 'pack-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  elsif v_id !~ '^pack-' then v_id := 'pack-' || v_id; end if;
  if v_id !~ '^pack-[a-z0-9-]{2,40}$' then raise exception 'BAD_ID'; end if;
  select * into v_old from admin_packs where id = v_id for update;
  v_name := case when jsonb_typeof(p_pack->'name') = 'string' then jsonb_build_object('en', p_pack->>'name', 'fr', p_pack->>'name')
    else coalesce(p_pack->'name', v_old.name) end;
  if not public.liveops_text(v_name, 60) then raise exception 'BAD_NAME'; end if;
  if p_pack ? 'tagline' and jsonb_typeof(p_pack->'tagline') <> 'null' and not public.liveops_text(p_pack->'tagline', 160) then raise exception 'BAD_PACK'; end if;
  if not public.liveops_source_ok(coalesce(p_pack->'source', v_old.source)) then raise exception 'BAD_SOURCE'; end if;
  if p_pack ? 'rarity_odds' and not public.liveops_odds_ok(p_pack->'rarity_odds') then raise exception 'BAD_ODDS'; end if;
  begin
    insert into admin_packs (id, name, tagline, icon, accent, accent2, source, rarity_odds, default_cards, price, available_from,
        available_until, limited_stock, per_player, visible, created_at, updated_at)
      values (v_id, v_name,
        case when p_pack ? 'tagline' then coalesce(case when jsonb_typeof(p_pack->'tagline') = 'string'
          then jsonb_build_object('en', p_pack->>'tagline', 'fr', p_pack->>'tagline') else nullif(p_pack->'tagline', 'null'::jsonb) end, '{}'::jsonb)
          else coalesce(v_old.tagline, '{}'::jsonb) end,
        case when p_pack ? 'icon' then nullif(p_pack->>'icon', '') else v_old.icon end,
        case when p_pack ? 'accent' then nullif(p_pack->>'accent', '') else v_old.accent end,
        case when p_pack ? 'accent2' then nullif(p_pack->>'accent2', '') else v_old.accent2 end,
        coalesce(p_pack->'source', v_old.source),
        case when p_pack ? 'rarity_odds' then nullif(p_pack->'rarity_odds', 'null'::jsonb) else v_old.rarity_odds end,
        case when p_pack ? 'default_cards' then (p_pack->>'default_cards')::integer else coalesce(v_old.default_cards, 5) end,
        case when p_pack ? 'price' then nullif(p_pack->>'price', '')::integer else v_old.price end,
        case when p_pack ? 'available_from' then nullif(p_pack->>'available_from', '')::timestamptz else v_old.available_from end,
        case when p_pack ? 'available_until' then nullif(p_pack->>'available_until', '')::timestamptz else v_old.available_until end,
        case when p_pack ? 'limited_stock' then nullif(p_pack->>'limited_stock', '')::integer else v_old.limited_stock end,
        case when p_pack ? 'per_player' then nullif(p_pack->>'per_player', '')::integer else v_old.per_player end,
        case when p_pack ? 'visible' then coalesce((p_pack->>'visible')::boolean, false) else coalesce(v_old.visible, false) end,
        coalesce(v_old.created_at, now()), now())
      on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, icon = excluded.icon, accent = excluded.accent,
        accent2 = excluded.accent2, source = excluded.source, rarity_odds = excluded.rarity_odds, default_cards = excluded.default_cards,
        price = excluded.price, available_from = excluded.available_from, available_until = excluded.available_until,
        limited_stock = excluded.limited_stock, per_player = excluded.per_player, visible = excluded.visible, updated_at = now()
      returning * into v_row;
  exception when check_violation or not_null_violation then
    raise exception 'BAD_PACK';
  end;
  if v_row.available_from is not null and v_row.available_until is not null and v_row.available_until <= v_row.available_from then
    raise exception 'BAD_WINDOW';
  end if;
  perform public.liveops_log(case when v_old.id is null then 'pack_create' else 'pack_update' end,
    jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row)),
    case when v_old.id is null then jsonb_build_object('op', 'delete_row', 'table', 'admin_packs', 'key', jsonb_build_object('id', v_id))
      else jsonb_build_object('op', 'restore_row', 'table', 'admin_packs', 'key', jsonb_build_object('id', v_id), 'row', to_jsonb(v_old)) end);
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'UPDATE', 'id', v_id));
  return to_jsonb(v_row);
end $$;

create or replace function public.admin_pack_delete(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old admin_packs;
begin
  delete from admin_packs where id = p_id returning * into v_old;
  if v_old.id is null then return jsonb_build_object('deleted', false); end if;
  perform public.liveops_log('pack_delete', jsonb_build_object('old', to_jsonb(v_old)),
    jsonb_build_object('op', 'restore_row', 'table', 'admin_packs', 'key', jsonb_build_object('id', v_old.id), 'row', to_jsonb(v_old)));
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'DELETE', 'id', v_old.id));
  return jsonb_build_object('deleted', true, 'pack', to_jsonb(v_old));
end $$;

create or replace function public.admin_packs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor();
begin
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'sold', coalesce((select s.sold from live_stock s where s.item = 'live|' || p.id), 0),
      'on_sale', p.visible and (p.available_from is null or p.available_from <= now()) and (p.available_until is null or now() < p.available_until))
      order by p.updated_at desc) from admin_packs p), '[]'::jsonb);
end $$;

create or replace function public.liveops_unpatch(p_data jsonb)
returns jsonb language plpgsql immutable as $$
declare v_orig jsonb := p_data->'liveOrig'; v_out jsonb := p_data - 'liveOrig'; f text;
begin
  if v_orig is null or jsonb_typeof(v_orig) <> 'object' then return v_out; end if;
  foreach f in array array['description', 'thumbnail'] loop
    if v_orig ? f then
      if jsonb_typeof(v_orig->f) = 'null' then v_out := v_out - f;
      else v_out := jsonb_set(v_out, array[f], v_orig->f); end if;
    end if;
  end loop;
  return v_out;
end $$;

create or replace function public.liveops_override_sync(p_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare o card_overrides; n integer := 0;
begin
  update cards set title = coalesce(data->'liveOrig'->>'title', title), data = public.liveops_unpatch(data), last_at = now()
    where article_key = p_key and data ? 'liveOrig';
  select * into o from card_overrides where article_key = p_key;
  if o.article_key is not null and (o.title_override is not null or o.description_override is not null or o.image_url is not null) then
    update cards set
        data = data || jsonb_build_object('liveOrig', jsonb_build_object('title', title,
            'description', coalesce(data->'description', 'null'::jsonb), 'thumbnail', coalesce(data->'thumbnail', 'null'::jsonb)))
          || jsonb_strip_nulls(jsonb_build_object('description', o.description_override, 'thumbnail', o.image_url)),
        title = coalesce(o.title_override, title),
        last_at = now()
      where article_key = p_key;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
revoke all on function public.liveops_override_sync(text) from public, anon, authenticated;

create or replace function public.admin_card_override_upsert(p_override jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.liveops_actor();
  v_key text := btrim(coalesce(p_override->>'article_key', p_override->>'key', ''));
  v_old card_overrides;
  v_row card_overrides;
  v_n   integer;
begin
  if p_override is null or jsonb_typeof(p_override) <> 'object' or v_key = '' then raise exception 'BAD_OVERRIDE'; end if;
  select * into v_old from card_overrides where article_key = v_key for update;
  begin
    insert into card_overrides (article_key, lang, title_override, description_override, image_url, rarity_override, price_override, hidden, updated_at)
      values (v_key,
        coalesce(nullif(p_override->>'lang', ''), v_old.lang, nullif(split_part(v_key, ':', 1), v_key), 'en'),
        case when p_override ? 'title_override' then nullif(btrim(p_override->>'title_override'), '') else v_old.title_override end,
        case when p_override ? 'description_override' then nullif(btrim(p_override->>'description_override'), '') else v_old.description_override end,
        case when p_override ? 'image_url' then nullif(btrim(p_override->>'image_url'), '') else v_old.image_url end,
        case when p_override ? 'rarity_override' then nullif(p_override->>'rarity_override', '') else v_old.rarity_override end,
        case when p_override ? 'price_override' then nullif(p_override->>'price_override', '')::bigint else v_old.price_override end,
        case when p_override ? 'hidden' then coalesce((p_override->>'hidden')::boolean, false) else coalesce(v_old.hidden, false) end,
        now())
      on conflict (article_key) do update set lang = excluded.lang, title_override = excluded.title_override,
        description_override = excluded.description_override, image_url = excluded.image_url, rarity_override = excluded.rarity_override,
        price_override = excluded.price_override, hidden = excluded.hidden, updated_at = now()
      returning * into v_row;
  exception when check_violation then
    raise exception 'BAD_OVERRIDE';
  end;
  v_n := public.liveops_override_sync(v_key);
  perform public.liveops_log(case when v_old.article_key is null then 'override_create' else 'override_update' end,
    jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row), 'cards', v_n),
    case when v_old.article_key is null then jsonb_build_object('op', 'delete_row', 'table', 'card_overrides', 'key', jsonb_build_object('article_key', v_key))
      else jsonb_build_object('op', 'restore_row', 'table', 'card_overrides', 'key', jsonb_build_object('article_key', v_key), 'row', to_jsonb(v_old)) end);
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'UPDATE', 'card', v_key));
  return to_jsonb(v_row) || jsonb_build_object('cards', v_n);
end $$;

create or replace function public.admin_card_override_delete(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old card_overrides; v_n integer;
begin
  delete from card_overrides where article_key = p_key returning * into v_old;
  if v_old.article_key is null then return jsonb_build_object('deleted', false); end if;
  v_n := public.liveops_override_sync(p_key);
  perform public.liveops_log('override_delete', jsonb_build_object('old', to_jsonb(v_old)),
    jsonb_build_object('op', 'restore_row', 'table', 'card_overrides', 'key', jsonb_build_object('article_key', p_key), 'row', to_jsonb(v_old)));
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'DELETE', 'card', p_key));
  return jsonb_build_object('deleted', true, 'override', to_jsonb(v_old));
end $$;

create or replace function public.admin_card_overrides(p_q text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  return coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object('owners', (select count(*) from cards c where c.article_key = o.article_key))
      order by o.updated_at desc)
    from (select * from card_overrides
           where v_q is null or article_key ilike '%' || v_q || '%' or coalesce(title_override, '') ilike '%' || v_q || '%'
           order by updated_at desc limit 200) o), '[]'::jsonb);
end $$;

create or replace function public.liveops_audience(p_target jsonb)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_lang text;
  v_who  jsonb;
  v_keys text[] := array['all', 'ids', 'level_min', 'level_max', 'active_days', 'guild'];
begin
  if p_target is null or jsonb_typeof(p_target) <> 'object' then raise exception 'BAD_TARGET'; end if;
  v_lang := nullif(p_target->>'lang', '');
  v_who := p_target - 'lang';
  if p_target ? 'all' and p_target->'all' <> 'true'::jsonb then v_who := v_who - 'all'; end if;
  if p_target ? 'ids' and (jsonb_typeof(p_target->'ids') <> 'array' or jsonb_array_length(p_target->'ids') = 0) then raise exception 'EMPTY_TARGET'; end if;
  if v_lang is not null and not (v_who ?| v_keys) then v_who := v_who || '{"all":true}'::jsonb; end if;
  if not (v_who ?| v_keys) then raise exception 'EMPTY_TARGET'; end if;
  return query
    select distinct t.user_id from push_tokens t
     where t.user_id in (select public.admin_audience_ids(v_who))
       and (v_lang is null or t.lang = v_lang);
end $$;
revoke all on function public.liveops_audience(jsonb) from public, anon, authenticated;

create or replace function public.admin_push_preview(p_target jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_users uuid[];
begin
  v_users := array(select public.liveops_audience(p_target));
  return jsonb_build_object('users', cardinality(v_users),
    'devices', (select count(*) from push_tokens t where t.user_id = any(v_users)
      and (nullif(p_target->>'lang', '') is null or t.lang = p_target->>'lang')));
end $$;

create or replace function public.admin_push(p_target jsonb, p_title text, p_body text, p_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := public.liveops_actor();
  v_users   uuid[];
  v_devices integer;
  v_row     push_broadcasts;
  cfg       push_config;
  v_queued  boolean := false;
begin
  if char_length(coalesce(btrim(p_title), '')) not between 1 and 80 or char_length(coalesce(btrim(p_body), '')) not between 1 and 240 then
    raise exception 'BAD_TEXT';
  end if;
  if p_url is not null and p_url <> '' and (char_length(p_url) > 300 or p_url !~ '^(https://|/|#)') then raise exception 'BAD_URL'; end if;
  v_users := array(select public.liveops_audience(p_target));
  select count(*) into v_devices from push_tokens t where t.user_id = any(v_users)
    and (nullif(p_target->>'lang', '') is null or t.lang = p_target->>'lang');
  insert into push_broadcasts (title, body, url, target, users, devices, created_by)
    values (btrim(p_title), btrim(p_body), nullif(p_url, ''), p_target, v_users, v_devices, v_me)
    returning * into v_row;
  if v_devices > 0 then
    select * into cfg from push_config where id = 1;
    if cfg.url is not null and cfg.secret is not null and to_regproc('net.http_post') is not null then
      begin
        execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 4000)'
          using cfg.url, jsonb_build_object('kind', 'broadcast', 'broadcast', v_row.id),
                jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret);
        v_queued := true;
      exception when others then
        raise notice 'admin_push not queued: %', sqlerrm;
      end;
    end if;
  end if;
  perform public.liveops_log('push', jsonb_build_object('id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'url', v_row.url,
    'target', p_target, 'users', cardinality(v_users), 'devices', v_devices, 'queued', v_queued), null);
  return jsonb_build_object('id', v_row.id, 'users', cardinality(v_users), 'devices', v_devices, 'queued', v_queued);
end $$;

create or replace function public.push_broadcast_targets(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b push_broadcasts; v_lang text;
begin
  update push_broadcasts set started_at = now() where id = p_id and started_at is null returning * into b;
  if b.id is null then return jsonb_build_object('targets', '[]'::jsonb); end if;
  v_lang := nullif(b.target->>'lang', '');
  return jsonb_build_object('title', b.title, 'body', b.body, 'url', b.url,
    'targets', coalesce((select jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform, 'lang', t.lang))
      from push_tokens t where t.user_id = any(b.users) and (v_lang is null or t.lang = v_lang)), '[]'::jsonb));
end $$;
revoke all on function public.push_broadcast_targets(uuid) from public, anon, authenticated;
grant execute on function public.push_broadcast_targets(uuid) to service_role;

create or replace function public.push_broadcast_done(p_id uuid, p_sent integer)
returns void language sql security definer set search_path = public as $$
  update push_broadcasts set sent = greatest(0, coalesce(p_sent, 0)), sent_at = now() where id = p_id
$$;
revoke all on function public.push_broadcast_done(uuid, integer) from public, anon, authenticated;
grant execute on function public.push_broadcast_done(uuid, integer) to service_role;

create or replace function public.admin_undo_row(p_undo jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := public.liveops_actor();
  v_op    text := p_undo->>'op';
  v_table text := p_undo->>'table';
  v_col   text;
  v_val   text;
  v_set   text;
begin
  if p_undo is null or jsonb_typeof(p_undo) <> 'object' or jsonb_typeof(p_undo->'key') <> 'object' then raise exception 'BAD_UNDO'; end if;
  v_col := case v_table when 'live_events' then 'id' when 'redeem_codes' then 'code' when 'tuning' then 'key'
    when 'admin_packs' then 'id' when 'card_overrides' then 'article_key' end;
  if v_col is null then raise exception 'BAD_UNDO'; end if;
  v_val := p_undo->'key'->>v_col;
  if v_val is null then raise exception 'BAD_UNDO'; end if;
  if v_op = 'delete_row' then
    if v_table = 'redeem_codes' then
      update redeem_codes set disabled = true where code = v_val;
    else
      execute format('delete from public.%I where %I::text = $1', v_table, v_col) using v_val;
    end if;
  elsif v_op = 'restore_row' then
    if jsonb_typeof(p_undo->'row') <> 'object' or (p_undo->'row'->>v_col) is distinct from v_val then raise exception 'BAD_UNDO'; end if;
    if v_table = 'tuning' and not public.liveops_tuning_ok(v_val, p_undo->'row'->'value') then raise exception 'BAD_VALUE'; end if;
    select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ') into v_set
      from pg_attribute a where a.attrelid = format('public.%I', v_table)::regclass and a.attnum > 0 and not a.attisdropped and a.attname <> v_col;
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict (%I) do update set %s',
      v_table, v_table, v_col, v_set) using p_undo->'row';
  else
    raise exception 'BAD_UNDO';
  end if;
  if v_table = 'card_overrides' then perform public.liveops_override_sync(v_val); end if;
  if v_table <> 'redeem_codes' then
    perform public.live_send('world', case v_table when 'tuning' then 'tuning' when 'live_events' then 'events' else 'packs' end,
      jsonb_build_object('type', 'UNDO', 'table', v_table, 'key', v_val));
  end if;
  perform public.liveops_log('undo_row', jsonb_build_object('undo', p_undo), null);
  return jsonb_build_object('ok', true, 'op', v_op, 'table', v_table, 'key', v_val);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_event_upsert(jsonb)', 'admin_event_delete(uuid)', 'admin_events(boolean)',
    'admin_code_create(jsonb)', 'admin_code_update(text, jsonb)', 'admin_codes()', 'admin_code_uses(text)',
    'admin_tuning()', 'admin_tuning_set(text, jsonb)', 'admin_tuning_reset(text)',
    'admin_pack_upsert(jsonb)', 'admin_pack_delete(text)', 'admin_packs()',
    'admin_card_override_upsert(jsonb)', 'admin_card_override_delete(text)', 'admin_card_overrides(text)',
    'admin_push_preview(jsonb)', 'admin_push(jsonb, text, text, text)', 'admin_undo_row(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- control polish
create index if not exists admin_log_batch_idx on public.admin_log (batch) where batch is not null;
create index if not exists admin_log_kind_idx on public.admin_log (kind, id desc);
create index if not exists filter_hits_at_idx on public.filter_hits (at desc);

create or replace function public.admin_str(p jsonb, p_max integer)
returns text language plpgsql immutable as $$
declare v text;
begin
  if p is null or jsonb_typeof(p) <> 'string' then return null; end if;
  v := btrim(p #>> '{}');
  if v = '' or char_length(v) > p_max then return null; end if;
  return v;
end $$;

create or replace function public.admin_spec_check(p_spec jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  k text;
  v_theme text;
  v_rar text;
  v_api text;
  v_out jsonb;
begin
  if coalesce(jsonb_typeof(p_spec), '') <> 'object' then raise exception 'BAD_SPEC'; end if;
  k := public.admin_str(p_spec->'kind', 20);
  if k is null or k not in ('theme', 'open', 'custom', 'today') then raise exception 'BAD_SPEC'; end if;
  if not public.liveops_num(p_spec->'cards', 1, 12, true) then raise exception 'BAD_SPEC'; end if;
  if coalesce(jsonb_typeof(p_spec->'rarityId'), 'null') <> 'null' then
    v_rar := public.admin_str(p_spec->'rarityId', 20);
    if v_rar is null or not (v_rar = any(public.liveops_rarities())) then raise exception 'BAD_SPEC'; end if;
  end if;
  v_out := jsonb_build_object('kind', k, 'themeId', null, 'rarityId', v_rar, 'cards', (p_spec->>'cards')::numeric::integer);
  if k = 'theme' then
    v_theme := public.admin_str(p_spec->'themeId', 60);
    if coalesce(v_theme, '') !~ '^[a-z0-9_-]{1,60}$' then raise exception 'BAD_SPEC'; end if;
    if v_theme like 'pack-%' and not exists (select 1 from admin_packs a where a.id = v_theme) then raise exception 'BAD_SPEC'; end if;
    v_out := v_out || jsonb_build_object('themeId', v_theme);
  elsif k = 'today' then
    if coalesce(public.admin_str(p_spec->'day', 10), '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'BAD_SPEC'; end if;
    v_out := v_out || jsonb_build_object('day', p_spec->>'day');
  elsif k = 'custom' then
    if coalesce(jsonb_typeof(p_spec->'wiki'), 'null') = 'object' then
      v_api := public.admin_str(p_spec->'wiki'->'apiUrl', 300);
      if coalesce(v_api, '') !~ '^https?://[^/[:space:]]+/' then raise exception 'BAD_SPEC'; end if;
      v_out := v_out || jsonb_build_object('wiki', jsonb_strip_nulls(jsonb_build_object('apiUrl', v_api,
        'sitename', public.admin_str(p_spec->'wiki'->'sitename', 120))));
    elsif coalesce(jsonb_typeof(p_spec->'wiki'), 'null') <> 'null' or public.admin_str(p_spec->'customId', 120) is null then
      raise exception 'BAD_SPEC';
    end if;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_object(
      'customId', public.admin_str(p_spec->'customId', 120),
      'customName', public.admin_str(p_spec->'customName', 60),
      'customTagline', public.admin_str(p_spec->'customTagline', 160),
      'icon', public.admin_str(p_spec->'icon', 40),
      'accent', case when coalesce(public.admin_str(p_spec->'accent', 9), '') ~ '^#[0-9a-fA-F]{3,8}$' then p_spec->>'accent' end,
      'accent2', case when coalesce(public.admin_str(p_spec->'accent2', 9), '') ~ '^#[0-9a-fA-F]{3,8}$' then p_spec->>'accent2' end));
  end if;
  return v_out;
end $$;

create or replace function public.admin_item_check(p_item jsonb, p_ctx text default 'grant')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  k text;
  n numeric;
  lim numeric;
  src jsonb;
  art jsonb;
  v_key text;
  v_rar text := 'common';
  v_ids jsonb;
begin
  if coalesce(jsonb_typeof(p_item), '') <> 'object' then raise exception 'BAD_ITEM'; end if;
  k := public.admin_str(p_item->'kind', 20);
  if k in ('coins', 'ink', 'xp') then
    lim := case when k = 'coins' then 100000000 else 10000000 end;
    if not public.liveops_num(p_item->'amount', -lim, lim, true) then raise exception 'BAD_AMOUNT'; end if;
    n := (p_item->>'amount')::numeric;
    if n = 0 or (n < 0 and (k = 'xp' or p_ctx <> 'grant')) then raise exception 'BAD_AMOUNT'; end if;
    return jsonb_build_object('kind', k, 'amount', n::bigint);
  elsif k = 'level' then
    if not public.liveops_num(p_item->'value', 1, 500, true) then raise exception 'BAD_LEVEL'; end if;
    return jsonb_build_object('kind', k, 'value', (p_item->>'value')::numeric::integer);
  elsif k = 'boostersOpened' then
    if not public.liveops_num(p_item->'value', 0, 10000000, true) then raise exception 'BAD_VALUE'; end if;
    return jsonb_build_object('kind', k, 'value', (p_item->>'value')::numeric::integer);
  elsif k = 'booster' then
    n := 1;
    if p_item ? 'count' then
      if not public.liveops_num(p_item->'count', 1, 100, true) then raise exception 'BAD_COUNT'; end if;
      n := (p_item->>'count')::numeric;
    end if;
    return jsonb_build_object('kind', k, 'spec', public.admin_spec_check(p_item->'spec'), 'count', n::integer);
  elsif k = 'card' then
    src := case when jsonb_typeof(p_item->'card') = 'object' then p_item->'card' else p_item end;
    art := src->'article';
    if coalesce(jsonb_typeof(art), '') <> 'object' or octet_length(art::text) > 20000 then raise exception 'BAD_CARD'; end if;
    v_key := public.admin_str(art->'key', 320);
    if v_key is null then raise exception 'BAD_CARD'; end if;
    if coalesce(jsonb_typeof(src->'rarityId'), 'null') <> 'null' then
      v_rar := public.admin_str(src->'rarityId', 20);
      if v_rar is null or not (v_rar = any(public.liveops_rarities())) then raise exception 'BAD_CARD'; end if;
    end if;
    n := 1;
    if src ? 'count' then
      if not public.liveops_num(src->'count', 1, 100, true) then raise exception 'BAD_COUNT'; end if;
      n := (src->>'count')::numeric;
    end if;
    return jsonb_build_object('kind', k, 'article', (art - 'rarityId' - 'count')
      || jsonb_build_object('key', v_key, 'title', coalesce(public.admin_str(art->'title', 300), v_key)), 'rarityId', v_rar, 'count', n::integer);
  elsif k = 'owned' or (k = 'revokeOwned' and p_ctx = 'grant') then
    if coalesce(public.admin_str(p_item->'bucket', 20), '') not in ('themes', 'frames', 'fx', 'looks', 'openings', 'supporter') then
      raise exception 'BAD_OWNED';
    end if;
    if k = 'owned' and jsonb_typeof(p_item->'ids') = 'array' then
      if jsonb_array_length(p_item->'ids') not between 1 and 50
         or exists (select 1 from jsonb_array_elements(p_item->'ids') x where public.admin_str(x, 80) is null) then
        raise exception 'BAD_OWNED';
      end if;
      select jsonb_agg(d.v order by d.first) into v_ids from (
        select btrim(x #>> '{}') as v, min(i) as first from jsonb_array_elements(p_item->'ids') with ordinality as t(x, i) group by 1) d;
      if jsonb_array_length(v_ids) > 1 then
        return jsonb_build_object('kind', k, 'bucket', p_item->>'bucket', 'ids', v_ids);
      end if;
      return jsonb_build_object('kind', k, 'bucket', p_item->>'bucket', 'id', v_ids->>0);
    end if;
    v_key := public.admin_str(p_item->'id', 80);
    if v_key is null then raise exception 'BAD_OWNED'; end if;
    return jsonb_build_object('kind', k, 'bucket', p_item->>'bucket', 'id', v_key);
  elsif k = 'takeCard' and p_ctx = 'grant' then
    v_key := public.admin_str(p_item->'key', 320);
    if v_key is null then raise exception 'BAD_CARD'; end if;
    return jsonb_build_object('kind', k, 'key', v_key);
  end if;
  raise exception 'BAD_KIND';
end $$;

create or replace function public.admin_items_check(p_items jsonb, p_ctx text default 'grant')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare it jsonb; v_out jsonb := '[]'::jsonb;
begin
  if coalesce(jsonb_typeof(p_items), '') <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'BAD_ITEMS'; end if;
  for it in select x from jsonb_array_elements(p_items) x loop
    v_out := v_out || jsonb_build_array(public.admin_item_check(it, p_ctx));
  end loop;
  return v_out;
end $$;

create or replace function public.admin_grant_items(p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare it jsonb; k text; v_out jsonb := '[]'::jsonb;
begin
  for it in select x from jsonb_array_elements(public.admin_items_check(p_items, 'grant')) x loop
    k := it->>'kind';
    v_out := v_out || jsonb_build_array(case
      when k in ('coins', 'ink') then jsonb_build_object('kind', k, 'payload', jsonb_build_object('amount', it->'amount', 'mode', 'add'))
      when k = 'xp' then jsonb_build_object('kind', k, 'payload', jsonb_build_object('amount', it->'amount'))
      when k = 'level' then jsonb_build_object('kind', 'profile', 'payload',
        jsonb_build_object('patch', jsonb_build_object('progress.level', it->'value', 'progress.xp', 0)))
      when k = 'boostersOpened' then jsonb_build_object('kind', 'profile', 'payload',
        jsonb_build_object('patch', jsonb_build_object('boostersOpened', it->'value')))
      else jsonb_build_object('kind', k, 'payload', it - 'kind') end);
  end loop;
  return v_out;
end $$;

create or replace function public.liveops_spec_ok(p_spec jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_spec_check(p_spec);
  return true;
exception when others then
  return false;
end $$;

create or replace function public.liveops_items_ok(p_items jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_items_check(p_items, 'code');
  return true;
exception when others then
  return false;
end $$;

create or replace function public.liveops_event_ok(p_kind text, p_params jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare e record;
begin
  if p_params is null or jsonb_typeof(p_params) <> 'object' then return false; end if;
  if p_params ? 'title' and not public.liveops_text(p_params->'title', 120) then return false; end if;
  if p_params ? 'kinds' and jsonb_typeof(p_params->'kinds') <> 'array' then return false; end if;
  if p_params ? 'themes' and jsonb_typeof(p_params->'themes') <> 'array' then return false; end if;
  if p_params ? 'sections' and jsonb_typeof(p_params->'sections') <> 'array' then return false; end if;
  if p_kind = 'drop_rate' then
    if jsonb_typeof(p_params->'mult') <> 'object' or not exists (select 1 from jsonb_object_keys(p_params->'mult')) then return false; end if;
    for e in select * from jsonb_each(p_params->'mult') loop
      if not (e.key = any(public.liveops_rarities())) or not public.liveops_num(e.value, 0, 100) then return false; end if;
    end loop;
    return true;
  elsif p_kind in ('price', 'xp') then
    return public.liveops_num(p_params->'mult', 0.1, 10);
  elsif p_kind = 'free_packs' then
    if p_params ? 'spec' and not public.liveops_spec_ok(p_params->'spec') then return false; end if;
    if p_params ? 'count' and not public.liveops_num(p_params->'count', 1, 20, true) then return false; end if;
    if p_params ? 'timed' and not public.liveops_num(p_params->'timed', 1, 50, true) then return false; end if;
    return p_params ? 'spec' or p_params ? 'timed';
  elsif p_kind = 'limited_booster' then
    if not public.liveops_spec_ok(p_params->'spec') then return false; end if;
    if not public.liveops_num(p_params->'price', 0, 10000000, true) then return false; end if;
    if p_params ? 'stock' and not public.liveops_num(p_params->'stock', 1, 10000000, true) then return false; end if;
    if p_params ? 'perPlayer' and not public.liveops_num(p_params->'perPlayer', 1, 1000, true) then return false; end if;
    return true;
  end if;
  return false;
end $$;

create or replace function public.admin_audience_ids(p_filter jsonb)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  v_all boolean := false;
  v_ids uuid[];
  v_lmin integer;
  v_lmax integer;
  v_days numeric;
  v_idle numeric;
  v_guild uuid;
  v_after timestamptz;
  v_before timestamptz;
  v_sup text;
  v_lang text;
  v_has_guild boolean;
begin
  if exists (select 1 from jsonb_object_keys(f) k where k not in ('all', 'ids', 'level_min', 'level_max', 'active_days', 'inactive_days',
      'guild', 'joined_after', 'joined_before', 'supporter', 'lang', 'has_guild')) then
    return;
  end if;
  begin
    if f ? 'all' then
      if f->'all' <> 'true'::jsonb then return; end if;
      v_all := true;
    end if;
    if f ? 'ids' then
      if jsonb_typeof(f->'ids') <> 'array' or exists (select 1 from jsonb_array_elements(f->'ids') x where jsonb_typeof(x) <> 'string') then return; end if;
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(f->'ids') x;
      if v_ids is null then return; end if;
    end if;
    if f ? 'level_min' then
      if jsonb_typeof(f->'level_min') <> 'number' then return; end if;
      v_lmin := floor((f->>'level_min')::numeric)::integer;
    end if;
    if f ? 'level_max' then
      if jsonb_typeof(f->'level_max') <> 'number' then return; end if;
      v_lmax := floor((f->>'level_max')::numeric)::integer;
    end if;
    if f ? 'active_days' then
      if jsonb_typeof(f->'active_days') <> 'number' or (f->>'active_days')::numeric <= 0 then return; end if;
      v_days := (f->>'active_days')::numeric;
    end if;
    if f ? 'inactive_days' then
      if jsonb_typeof(f->'inactive_days') <> 'number' or (f->>'inactive_days')::numeric <= 0 then return; end if;
      v_idle := (f->>'inactive_days')::numeric;
    end if;
    if f ? 'guild' then
      if jsonb_typeof(f->'guild') <> 'string' then return; end if;
      v_guild := (f->>'guild')::uuid;
    end if;
    if f ? 'joined_after' then
      if jsonb_typeof(f->'joined_after') <> 'string' then return; end if;
      v_after := (f->>'joined_after')::timestamptz;
    end if;
    if f ? 'joined_before' then
      if jsonb_typeof(f->'joined_before') <> 'string' then return; end if;
      v_before := (f->>'joined_before')::timestamptz;
    end if;
    if f ? 'supporter' then
      if jsonb_typeof(f->'supporter') = 'boolean' then
        v_sup := case when (f->>'supporter')::boolean then '*' else '-' end;
      elsif jsonb_typeof(f->'supporter') = 'string' and f->>'supporter' ~ '^[a-z][a-z0-9-]{1,40}$' then
        v_sup := f->>'supporter';
      else
        return;
      end if;
    end if;
    if f ? 'lang' then
      if jsonb_typeof(f->'lang') <> 'string' or f->>'lang' not in ('en', 'fr') then return; end if;
      v_lang := f->>'lang';
    end if;
    if f ? 'has_guild' then
      if jsonb_typeof(f->'has_guild') <> 'boolean' then return; end if;
      v_has_guild := (f->>'has_guild')::boolean;
    end if;
  exception when others then
    return;
  end;
  if not v_all and v_ids is null and v_lmin is null and v_lmax is null and v_days is null and v_idle is null and v_guild is null
     and v_after is null and v_before is null and v_sup is null and v_lang is null and v_has_guild is null then
    return;
  end if;
  return query
    select p.id from profiles p
    where (v_ids is null or p.id = any(v_ids))
      and (v_lmin is null or p.level >= v_lmin)
      and (v_lmax is null or p.level <= v_lmax)
      and (v_days is null or p.last_seen_at > now() - make_interval(secs => (v_days * 86400)::double precision))
      and (v_idle is null or p.last_seen_at <= now() - make_interval(secs => (v_idle * 86400)::double precision))
      and (v_guild is null or exists (select 1 from guild_members m where m.user_id = p.id and m.guild_id = v_guild))
      and (v_after is null or p.created_at >= v_after)
      and (v_before is null or p.created_at < v_before)
      and (v_has_guild is null or v_has_guild = exists (select 1 from guild_members m where m.user_id = p.id))
      and (v_sup is null or (case
        when v_sup = '*' then exists (select 1 from econ e where e.user_id = p.id and jsonb_typeof(e.state->'owned'->'supporter') = 'array'
          and jsonb_array_length(e.state->'owned'->'supporter') > 0)
        when v_sup = '-' then not exists (select 1 from econ e where e.user_id = p.id and jsonb_typeof(e.state->'owned'->'supporter') = 'array'
          and jsonb_array_length(e.state->'owned'->'supporter') > 0)
        else exists (select 1 from econ e where e.user_id = p.id and jsonb_typeof(e.state->'owned'->'supporter') = 'array'
          and e.state->'owned'->'supporter' ? v_sup) end))
      and (v_lang is null or v_lang = coalesce(
        (select btrim(k.value, '"') from save_keys k where k.user_id = p.id and k.key = 'wikster.language'),
        (select s.data->'data'->>'wikster.language' from saves s where s.user_id = p.id),
        (select t.lang from push_tokens t where t.user_id = p.id order by t.updated_at desc limit 1),
        'en'));
end $$;

create or replace function public.liveops_audience(p_target jsonb)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_lang text;
  v_who  jsonb;
  v_keys text[] := array['all', 'ids', 'level_min', 'level_max', 'active_days', 'inactive_days', 'guild', 'joined_after', 'joined_before',
    'supporter', 'has_guild'];
begin
  if p_target is null or jsonb_typeof(p_target) <> 'object' then raise exception 'BAD_TARGET'; end if;
  v_lang := nullif(p_target->>'lang', '');
  v_who := p_target - 'lang';
  if p_target ? 'all' and p_target->'all' <> 'true'::jsonb then v_who := v_who - 'all'; end if;
  if p_target ? 'ids' and (jsonb_typeof(p_target->'ids') <> 'array' or jsonb_array_length(p_target->'ids') = 0) then raise exception 'EMPTY_TARGET'; end if;
  if v_lang is not null and not (v_who ?| v_keys) then v_who := v_who || '{"all":true}'::jsonb; end if;
  if not (v_who ?| v_keys) then raise exception 'EMPTY_TARGET'; end if;
  return query
    select distinct t.user_id from push_tokens t
     where t.user_id in (select public.admin_audience_ids(v_who))
       and (v_lang is null or t.lang = v_lang);
end $$;
revoke all on function public.liveops_audience(jsonb) from public, anon, authenticated;

create or replace function public.admin_grant(p_target jsonb, p_items jsonb, p_note text default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_items jsonb := public.admin_items_check(p_items, 'grant');
  v_rows jsonb := public.admin_grant_items(v_items);
  v_batch uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_note text := left(coalesce(p_note, ''), 500);
  v_n integer;
  v_players integer;
  v_one uuid;
  v_log bigint;
begin
  if coalesce(jsonb_typeof(p_target), '') <> 'object' then raise exception 'BAD_TARGET'; end if;
  with t as materialized (
    select distinct x as id from public.admin_audience_ids(p_target) x
  ), ins as (
    insert into grants (user_id, at, kind, payload, note_en, note_fr, created_by, batch)
      select t.id, v_now + (i.n * interval '1 microsecond'), i.x->>'kind', i.x->'payload', v_note, v_note, v_me, v_batch
      from t cross join jsonb_array_elements(v_rows) with ordinality as i(x, n)
      returning 1
  )
  select (select count(*) from t), (select count(*) from ins), (select min(t.id::text) from t)::uuid
    into v_players, v_n, v_one;
  if v_players = 0 then raise exception 'NO_PLAYERS'; end if;
  v_log := public.admin_note('grant', case when v_players = 1 then v_one end,
    jsonb_build_object('target', p_target, 'items', v_items, 'note', nullif(v_note, ''), 'players', v_players, 'rows', v_n),
    p_reason, jsonb_build_object('batch', v_batch), v_batch);
  return jsonb_build_object('batch', v_batch, 'players', v_players, 'rows', v_n, 'log', v_log);
end $$;

create or replace function public.admin_cancel_trade(p_trade uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); t trades; v_log bigint;
begin
  select * into t from trades where id = p_trade;
  if t.id is null then raise exception 'GONE'; end if;
  if t.status <> 'pending' then raise exception 'SETTLED'; end if;
  perform public.econ_trade_cancel(t.proposer, t.id);
  perform live_send('user:' || t.proposer, 'econ', jsonb_build_object('scope', 'cards'));
  v_log := public.admin_note('cancel-trade', t.proposer,
    jsonb_build_object('trade', t.id, 'recipient', t.recipient, 'returned', jsonb_array_length(t.offer)), null, null);
  return jsonb_build_object('ok', true, 'returned', jsonb_array_length(t.offer), 'to', t.proposer, 'log', v_log);
end $$;

create or replace function public.admin_cancel_trades(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); t trades; n integer := 0; cards integer := 0; who uuid[] := '{}'; u uuid; v_log bigint;
begin
  for t in select * from trades where status = 'pending' and (proposer = p_user or recipient = p_user) order by created_at for update loop
    perform public.econ_trade_cancel(t.proposer, t.id);
    n := n + 1;
    cards := cards + jsonb_array_length(t.offer);
    if not (t.proposer = any(who)) then who := who || t.proposer; end if;
  end loop;
  foreach u in array who loop
    perform live_send('user:' || u, 'econ', jsonb_build_object('scope', 'cards'));
  end loop;
  v_log := public.admin_note('cancel-trades', p_user, jsonb_build_object('cancelled', n, 'returned', cards), null, null);
  return jsonb_build_object('ok', true, 'cancelled', n, 'returned', cards, 'log', v_log);
end $$;

create or replace function public.admin_auction_cancel(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); a auctions; v_ok boolean; v_log bigint;
begin
  select * into a from auctions where id = p_id;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  v_ok := public.admin_auction_pull(p_id);
  if v_ok then
    v_log := public.admin_note('cancel-auction', a.seller, jsonb_build_object('auction', p_id, 'title', a.card->>'title',
      'bid', a.current_bid, 'bidder', a.bidder), null, null);
  end if;
  return jsonb_build_object('ok', v_ok, 'cancelled', case when v_ok then 1 else 0 end, 'log', v_log);
end $$;

create or replace function public.admin_auctions_cancel(p_seller uuid default null, p_stale boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); lot uuid; n integer := 0; v_log bigint;
begin
  if p_seller is null and not coalesce(p_stale, false) then raise exception 'NO_TARGET'; end if;
  for lot in select id from auctions where status = 'open' and (p_seller is null or seller = p_seller)
      and (not coalesce(p_stale, false) or ends_at < now()) loop
    if public.admin_auction_pull(lot) then n := n + 1; end if;
  end loop;
  v_log := public.admin_note('cancel-auctions', p_seller, jsonb_build_object('stale', coalesce(p_stale, false), 'cancelled', n), null, null);
  return jsonb_build_object('ok', true, 'cancelled', n, 'log', v_log);
end $$;

create or replace function public.admin_wipe(p_user uuid, p_scope text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_coins bigint;
  v_stamp bigint := public.admin_stamp();
  v_log bigint;
begin
  if p_scope is null or p_scope not in ('progress', 'collection', 'everything') then raise exception 'BAD_SCOPE'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  if p_scope = 'collection' then
    select coins into v_coins from wallets where user_id = p_user;
    perform public.econ_wipe(p_user, 'cards', null, coalesce(v_coins, 0));
  elsif p_scope = 'progress' then
    insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
    update econ set state = (state - array['boostersOpened', 'rarityCounts', 'progress', 'pendingLevels', 'achievements',
        'cardsSold', 'fused', 'albumTiers', 'seasons', 'seasonUnlocks', 'packsBuilt'])
        || jsonb_build_object('progress', jsonb_build_object('level', 1, 'xp', 0), 'pendingLevels', '[]'::jsonb,
          'rev', coalesce((state->>'rev')::integer, 0) + 1),
      updated_at = now()
      where user_id = p_user;
    delete from claims where user_id = p_user and (key like 'level:%' or key like 'medal:%' or key like 'ach:%');
    insert into ledger (user_id, kind, coins, ink, reason) values (p_user, 'wipe', 0, 0, 'progress');
    update profiles set level = 1 where id = p_user;
  else
    perform public.econ_wipe(p_user, 'all');
    perform public.admin_save_write(p_user, 'wikster.profile.v1', '{}', v_stamp);
    perform live_send('user:' || p_user, 'save', jsonb_build_object('keys', jsonb_build_array('wikster.profile.v1')));
  end if;
  perform live_send('user:' || p_user, 'econ', jsonb_build_object('scope', p_scope));
  v_log := public.admin_note('wipe', p_user, jsonb_build_object('scope', p_scope), null, null);
  return jsonb_build_object('ok', true, 'scope', p_scope, 'log', v_log);
end $$;

create or replace function public.admin_guild_remove_member(p_guild uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; left_n integer; heir uuid; v_closed boolean := false; v_back integer := 0; v_log bigint;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  delete from guild_members where user_id = p_user and guild_id = p_guild;
  if not found then raise exception 'NOT_MEMBER'; end if;
  perform live_send('user:' || p_user, 'guild', jsonb_build_object('type', 'removed', 'guild', p_guild));
  select count(*) into left_n from guild_members where guild_id = p_guild;
  if left_n = 0 then
    v_back := public.admin_guild_close(p_guild);
    v_closed := true;
  else
    if g.owner = p_user then
      select user_id into heir from guild_members where guild_id = p_guild order by joined_at asc, user_id limit 1;
    end if;
    update guilds set members = left_n, owner = coalesce(heir, owner) where id = p_guild;
    if heir is not null then
      perform live_send('user:' || heir, 'guild', jsonb_build_object('type', 'owner', 'guild', p_guild));
    end if;
  end if;
  v_log := public.admin_note('guild-remove', p_user,
    jsonb_build_object('guild', p_guild, 'name', g.name, 'heir', heir, 'closed', v_closed, 'bank_returned', v_back), null, null);
  return jsonb_build_object('ok', true, 'members', left_n, 'owner', case when v_closed then null else coalesce(heir, g.owner) end,
    'closed', v_closed, 'bank_returned', v_back, 'log', v_log);
end $$;

create or replace function public.admin_guild_rename(p_guild uuid, p_name text, p_tag text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; v_name text := trim(coalesce(p_name, '')); v_tag text := upper(trim(coalesce(p_tag, ''))); u uuid; v_log bigint;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if char_length(v_name) not between 3 and 24 or v_tag !~ '^[A-Z0-9]{2,5}$' then raise exception 'BAD_NAME'; end if;
  if public.text_flag(v_name, 'guild') is not null or public.text_flag(v_tag, 'guild') is not null then raise exception 'NAME_REFUSED'; end if;
  if exists (select 1 from guilds x where lower(x.name) = lower(v_name) and x.id <> p_guild) then raise exception 'NAME_TAKEN'; end if;
  if exists (select 1 from guilds x where x.tag = v_tag and x.id <> p_guild) then raise exception 'TAG_TAKEN'; end if;
  update guilds set name = v_name, tag = v_tag where id = p_guild;
  for u in select m.user_id from guild_members m where m.guild_id = p_guild loop
    perform live_send('user:' || u, 'guild', jsonb_build_object('type', 'renamed', 'guild', p_guild));
  end loop;
  v_log := public.admin_note('guild-rename', null, jsonb_build_object('guild', p_guild, 'from', jsonb_build_object('name', g.name, 'tag', g.tag),
    'to', jsonb_build_object('name', v_name, 'tag', v_tag)), null, jsonb_build_object('guild', p_guild, 'name', g.name, 'tag', g.tag));
  return jsonb_build_object('ok', true, 'name', v_name, 'tag', v_tag, 'log', v_log);
end $$;

create or replace function public.admin_guild_transfer(p_guild uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; u uuid; v_log bigint;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from guild_members m where m.guild_id = p_guild and m.user_id = p_user) then raise exception 'NOT_MEMBER'; end if;
  update guilds set owner = p_user where id = p_guild;
  for u in select m.user_id from guild_members m where m.guild_id = p_guild loop
    perform live_send('user:' || u, 'guild', jsonb_build_object('type', 'owner', 'guild', p_guild));
  end loop;
  v_log := public.admin_note('guild-transfer', p_user, jsonb_build_object('guild', p_guild, 'from', g.owner, 'to', p_user), null,
    jsonb_build_object('guild', p_guild, 'owner', g.owner));
  return jsonb_build_object('ok', true, 'owner', p_user, 'log', v_log);
end $$;

create or replace function public.admin_guild_delete(p_guild uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); g guilds; v_members integer; v_back integer; v_log bigint;
begin
  select * into g from guilds where id = p_guild for update;
  if g.id is null then raise exception 'NOT_FOUND'; end if;
  select count(*) into v_members from guild_members where guild_id = p_guild;
  v_back := public.admin_guild_close(p_guild);
  v_log := public.admin_note('guild-delete', null,
    jsonb_build_object('guild', p_guild, 'name', g.name, 'tag', g.tag, 'members', v_members, 'bank_returned', v_back), null, null);
  return jsonb_build_object('ok', true, 'members', v_members, 'bank_returned', v_back, 'log', v_log);
end $$;

create or replace function public.admin_delete_messages(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); r jsonb; v_groups jsonb; n_dm integer := 0; n_guild integer := 0; v_log bigint;
begin
  with dm as (delete from messages where sender = p_user returning id, sender, recipient),
  gm as (delete from guild_messages where sender = p_user returning id, guild_id),
  x as (
    select 'user:' || recipient as topic, 'messages' as tbl, id from dm
    union all select 'user:' || sender, 'messages', id from dm
    union all select 'guild:' || guild_id, 'guild_messages', id from gm
  )
  select (select count(*) from dm), (select count(*) from gm),
    coalesce((select jsonb_agg(jsonb_build_object('topic', y.topic, 'tbl', y.tbl, 'ids', y.ids)) from (
      select topic, tbl, jsonb_agg(id) as ids from x group by topic, tbl) y), '[]'::jsonb)
    into n_dm, n_guild, v_groups;
  for r in select * from jsonb_array_elements(v_groups) loop
    perform public.admin_removed(r->>'topic', r->>'tbl', r->'ids');
  end loop;
  v_log := public.admin_note('delete-messages', p_user, jsonb_build_object('messages', n_dm, 'guild_messages', n_guild), null, null);
  return jsonb_build_object('ok', true, 'messages', n_dm, 'guild_messages', n_guild, 'log', v_log);
end $$;

create or replace function public.admin_delete_guild_messages(p_guild uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_ids jsonb; v_log bigint;
begin
  with gone as (delete from guild_messages where guild_id = p_guild returning id)
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from gone;
  perform public.admin_removed('guild:' || p_guild, 'guild_messages', v_ids);
  v_log := public.admin_note('delete-guild-messages', null, jsonb_build_object('guild', p_guild, 'guild_messages', jsonb_array_length(v_ids)), null, null);
  return jsonb_build_object('ok', true, 'guild_messages', jsonb_array_length(v_ids), 'log', v_log);
end $$;

create or replace function public.admin_announce(p_title text, p_body text, p_target jsonb,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  t jsonb := case when jsonb_typeof(p_target) = 'object' then p_target else '{}'::jsonb end;
  v_user uuid;
  v_guild uuid;
  v_id bigint;
  v_start timestamptz := coalesce(p_starts_at, now());
  v_log bigint;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'BAD_BODY'; end if;
  if p_ends_at is not null and p_ends_at <= v_start then raise exception 'BAD_WINDOW'; end if;
  begin
    if t = '{"all": true}'::jsonb then
      null;
    elsif (select count(*) from jsonb_object_keys(t)) = 1 and jsonb_typeof(t->'user') = 'string' then
      v_user := (t->>'user')::uuid;
    elsif (select count(*) from jsonb_object_keys(t)) = 1 and jsonb_typeof(t->'guild') = 'string' then
      v_guild := (t->>'guild')::uuid;
    else
      raise exception 'BAD_TARGET';
    end if;
  exception when others then raise exception 'BAD_TARGET';
  end;
  if v_user is not null and not exists (select 1 from auth.users u where u.id = v_user) then raise exception 'NOT_FOUND'; end if;
  if v_guild is not null and not exists (select 1 from guilds g where g.id = v_guild) then raise exception 'NOT_FOUND'; end if;
  insert into announcements (title_en, title_fr, body_en, body_fr, kind, starts_at, ends_at, target_user, target_guild, created_by)
    values (left(coalesce(p_title, ''), 200), left(coalesce(p_title, ''), 200), left(p_body, 4000), left(p_body, 4000), 'note',
      v_start, p_ends_at, v_user, v_guild, v_me)
    returning id into v_id;
  v_log := public.admin_note('announce', v_user, jsonb_build_object('id', v_id, 'title', p_title, 'target', t,
    'starts_at', v_start, 'ends_at', p_ends_at), null, jsonb_build_object('id', v_id));
  return jsonb_build_object('ok', true, 'id', v_id, 'log', v_log);
end $$;

create or replace function public.admin_retire_announcement(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); a announcements; v_log bigint;
begin
  select * into a from announcements where id = p_id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.ends_at is not null and a.ends_at <= now() then return jsonb_build_object('ok', true, 'already', true); end if;
  update announcements set ends_at = now() where id = p_id;
  v_log := public.admin_note('retire', a.target_user, jsonb_build_object('id', p_id, 'title', a.title_en), null,
    jsonb_build_object('id', p_id, 'ends_at', a.ends_at));
  return jsonb_build_object('ok', true, 'already', false, 'log', v_log);
end $$;

create or replace function public.admin_event_upsert(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := public.liveops_actor();
  v_old    live_events;
  v_row    live_events;
  v_id     uuid;
  v_name   text;
  v_kind   text;
  v_params jsonb;
  v_starts timestamptz;
  v_ends   timestamptz;
  v_log    bigint;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'BAD_EVENT'; end if;
  begin
    v_id := nullif(p_event->>'id', '')::uuid;
    v_starts := nullif(p_event->>'starts_at', '')::timestamptz;
    v_ends := nullif(p_event->>'ends_at', '')::timestamptz;
  exception when others then raise exception 'BAD_EVENT';
  end;
  if v_id is not null then select * into v_old from live_events where id = v_id for update; end if;
  v_name := coalesce(nullif(btrim(p_event->>'name'), ''), v_old.name);
  v_kind := coalesce(p_event->>'kind', v_old.kind);
  v_params := coalesce(p_event->'params', v_old.params, '{}'::jsonb);
  v_starts := coalesce(v_starts, v_old.starts_at, now());
  v_ends := coalesce(v_ends, v_old.ends_at);
  if v_name is null or char_length(v_name) > 120 or v_ends is null or v_ends <= v_starts then raise exception 'BAD_EVENT'; end if;
  if v_kind is null or not public.liveops_event_ok(v_kind, v_params) then raise exception 'BAD_PARAMS'; end if;
  if v_params ? 'spec' then v_params := jsonb_set(v_params, '{spec}', public.admin_spec_check(v_params->'spec')); end if;
  if v_old.id is null then
    insert into live_events (id, name, kind, params, starts_at, ends_at, created_by)
      values (coalesce(v_id, gen_random_uuid()), v_name, v_kind, v_params, v_starts, v_ends, v_me)
      returning * into v_row;
    v_log := public.liveops_log('event_create', jsonb_build_object('new', to_jsonb(v_row)),
      jsonb_build_object('op', 'delete_row', 'table', 'live_events', 'key', jsonb_build_object('id', v_row.id)));
  else
    update live_events set name = v_name, kind = v_kind, params = v_params, starts_at = v_starts, ends_at = v_ends
      where id = v_old.id returning * into v_row;
    v_log := public.liveops_log('event_update', jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row)),
      jsonb_build_object('op', 'restore_row', 'table', 'live_events', 'key', jsonb_build_object('id', v_old.id), 'row', to_jsonb(v_old)));
  end if;
  perform public.live_send('world', 'events', jsonb_build_object('type', 'UPDATE', 'id', v_row.id));
  return to_jsonb(v_row) || jsonb_build_object('log', v_log);
end $$;

create or replace function public.admin_event_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old live_events; v_log bigint;
begin
  delete from live_events where id = p_id returning * into v_old;
  if v_old.id is null then return jsonb_build_object('deleted', false); end if;
  v_log := public.liveops_log('event_delete', jsonb_build_object('old', to_jsonb(v_old)),
    jsonb_build_object('op', 'restore_row', 'table', 'live_events', 'key', jsonb_build_object('id', v_old.id), 'row', to_jsonb(v_old)));
  perform public.live_send('world', 'events', jsonb_build_object('type', 'DELETE', 'id', v_old.id));
  return jsonb_build_object('deleted', true, 'event', to_jsonb(v_old), 'log', v_log);
end $$;

create or replace function public.admin_code_create(p_code jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := public.liveops_actor();
  v_code  text := public.liveops_code(p_code->>'code');
  v_items jsonb;
  v_row   redeem_codes;
  v_abc   text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_tries integer := 0;
  v_log   bigint;
begin
  if p_code is null or jsonb_typeof(p_code) <> 'object' then raise exception 'BAD_CODE'; end if;
  v_items := public.admin_items_check(p_code->'items', 'code');
  if v_code = '' then
    loop
      v_code := (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::integer, 1), '') from generate_series(1, 10));
      exit when not exists (select 1 from redeem_codes where code = v_code);
      v_tries := v_tries + 1;
      if v_tries > 20 then raise exception 'CODE_TAKEN'; end if;
    end loop;
  end if;
  if v_code !~ '^[A-Z0-9]{4,32}$' then raise exception 'BAD_CODE'; end if;
  begin
    insert into redeem_codes (code, items, max_uses, per_user, starts_at, expires_at, disabled, note, created_by)
      values (v_code, v_items, nullif(p_code->>'max_uses', '')::integer, coalesce(nullif(p_code->>'per_user', '')::integer, 1),
        nullif(p_code->>'starts_at', '')::timestamptz, nullif(p_code->>'expires_at', '')::timestamptz,
        coalesce((p_code->>'disabled')::boolean, false), left(p_code->>'note', 300), v_me)
      returning * into v_row;
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'BAD_CODE';
  end;
  v_log := public.liveops_log('code_create', jsonb_build_object('new', to_jsonb(v_row)),
    jsonb_build_object('op', 'restore_row', 'table', 'redeem_codes', 'key', jsonb_build_object('code', v_row.code),
      'row', to_jsonb(v_row) || jsonb_build_object('disabled', true)));
  return to_jsonb(v_row) || jsonb_build_object('log', v_log);
end $$;

create or replace function public.admin_code_update(p_code text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old redeem_codes; v_row redeem_codes; v_items jsonb; v_log bigint;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'BAD_CODE'; end if;
  select * into v_old from redeem_codes where code = public.liveops_code(p_code) for update;
  if v_old.code is null then raise exception 'UNKNOWN_CODE'; end if;
  if p_patch ? 'items' then v_items := public.admin_items_check(p_patch->'items', 'code'); end if;
  begin
    update redeem_codes set
        items      = coalesce(v_items, items),
        max_uses   = case when p_patch ? 'max_uses' then nullif(p_patch->>'max_uses', '')::integer else max_uses end,
        per_user   = case when p_patch ? 'per_user' then coalesce(nullif(p_patch->>'per_user', '')::integer, 1) else per_user end,
        starts_at  = case when p_patch ? 'starts_at' then nullif(p_patch->>'starts_at', '')::timestamptz else starts_at end,
        expires_at = case when p_patch ? 'expires_at' then nullif(p_patch->>'expires_at', '')::timestamptz else expires_at end,
        disabled   = case when p_patch ? 'disabled' then coalesce((p_patch->>'disabled')::boolean, false) else disabled end,
        note       = case when p_patch ? 'note' then left(p_patch->>'note', 300) else note end
      where code = v_old.code returning * into v_row;
  exception when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'BAD_CODE';
  end;
  v_log := public.liveops_log('code_update', jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row)),
    jsonb_build_object('op', 'restore_row', 'table', 'redeem_codes', 'key', jsonb_build_object('code', v_old.code), 'row', to_jsonb(v_old)));
  return to_jsonb(v_row) || jsonb_build_object('log', v_log);
end $$;

create or replace function public.admin_tuning_set(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old tuning; v_row tuning; v_log bigint;
begin
  if not exists (select 1 from tuning_keys where key = p_key) then raise exception 'UNKNOWN_KEY'; end if;
  if not public.liveops_tuning_ok(p_key, p_value) then raise exception 'BAD_VALUE'; end if;
  select * into v_old from tuning where key = p_key for update;
  insert into tuning (key, value, updated_at, updated_by) values (p_key, p_value, now(), v_me)
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    returning * into v_row;
  v_log := public.liveops_log('tuning_set', jsonb_build_object('key', p_key, 'old', v_old.value, 'new', p_value),
    case when v_old.key is null then jsonb_build_object('op', 'delete_row', 'table', 'tuning', 'key', jsonb_build_object('key', p_key))
      else jsonb_build_object('op', 'restore_row', 'table', 'tuning', 'key', jsonb_build_object('key', p_key), 'row', to_jsonb(v_old)) end);
  perform public.live_send('world', 'tuning', jsonb_build_object('type', 'UPDATE', 'key', p_key));
  return jsonb_build_object('key', p_key, 'value', v_row.value, 'old', v_old.value, 'log', v_log);
end $$;

create or replace function public.admin_tuning_reset(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old tuning; v_log bigint;
begin
  if not exists (select 1 from tuning_keys where key = p_key) then raise exception 'UNKNOWN_KEY'; end if;
  delete from tuning where key = p_key returning * into v_old;
  if v_old.key is not null then
    v_log := public.liveops_log('tuning_reset', jsonb_build_object('key', p_key, 'old', v_old.value),
      jsonb_build_object('op', 'restore_row', 'table', 'tuning', 'key', jsonb_build_object('key', p_key), 'row', to_jsonb(v_old)));
    perform public.live_send('world', 'tuning', jsonb_build_object('type', 'DELETE', 'key', p_key));
  end if;
  return jsonb_build_object('key', p_key, 'value', (select def from tuning_keys where key = p_key), 'old', v_old.value, 'log', v_log);
end $$;

create or replace function public.admin_pack_upsert(p_pack jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.liveops_actor();
  v_id  text := lower(btrim(coalesce(p_pack->>'id', '')));
  v_old admin_packs;
  v_row admin_packs;
  v_name jsonb;
  v_log bigint;
begin
  if p_pack is null or jsonb_typeof(p_pack) <> 'object' then raise exception 'BAD_PACK'; end if;
  if v_id = '' then v_id := 'pack-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  elsif v_id !~ '^pack-' then v_id := 'pack-' || v_id; end if;
  if v_id !~ '^pack-[a-z0-9-]{2,40}$' then raise exception 'BAD_ID'; end if;
  select * into v_old from admin_packs where id = v_id for update;
  v_name := case when jsonb_typeof(p_pack->'name') = 'string' then jsonb_build_object('en', p_pack->>'name', 'fr', p_pack->>'name')
    else coalesce(p_pack->'name', v_old.name) end;
  if not public.liveops_text(v_name, 60) then raise exception 'BAD_NAME'; end if;
  if p_pack ? 'tagline' and jsonb_typeof(p_pack->'tagline') <> 'null' and not public.liveops_text(p_pack->'tagline', 160) then raise exception 'BAD_PACK'; end if;
  if not public.liveops_source_ok(coalesce(p_pack->'source', v_old.source)) then raise exception 'BAD_SOURCE'; end if;
  if p_pack ? 'rarity_odds' and not public.liveops_odds_ok(p_pack->'rarity_odds') then raise exception 'BAD_ODDS'; end if;
  begin
    insert into admin_packs (id, name, tagline, icon, accent, accent2, source, rarity_odds, default_cards, price, available_from,
        available_until, limited_stock, per_player, visible, created_at, updated_at)
      values (v_id, v_name,
        case when p_pack ? 'tagline' then coalesce(case when jsonb_typeof(p_pack->'tagline') = 'string'
          then jsonb_build_object('en', p_pack->>'tagline', 'fr', p_pack->>'tagline') else nullif(p_pack->'tagline', 'null'::jsonb) end, '{}'::jsonb)
          else coalesce(v_old.tagline, '{}'::jsonb) end,
        case when p_pack ? 'icon' then nullif(p_pack->>'icon', '') else v_old.icon end,
        case when p_pack ? 'accent' then nullif(p_pack->>'accent', '') else v_old.accent end,
        case when p_pack ? 'accent2' then nullif(p_pack->>'accent2', '') else v_old.accent2 end,
        coalesce(p_pack->'source', v_old.source),
        case when p_pack ? 'rarity_odds' then nullif(p_pack->'rarity_odds', 'null'::jsonb) else v_old.rarity_odds end,
        case when p_pack ? 'default_cards' then (p_pack->>'default_cards')::integer else coalesce(v_old.default_cards, 5) end,
        case when p_pack ? 'price' then nullif(p_pack->>'price', '')::integer else v_old.price end,
        case when p_pack ? 'available_from' then nullif(p_pack->>'available_from', '')::timestamptz else v_old.available_from end,
        case when p_pack ? 'available_until' then nullif(p_pack->>'available_until', '')::timestamptz else v_old.available_until end,
        case when p_pack ? 'limited_stock' then nullif(p_pack->>'limited_stock', '')::integer else v_old.limited_stock end,
        case when p_pack ? 'per_player' then nullif(p_pack->>'per_player', '')::integer else v_old.per_player end,
        case when p_pack ? 'visible' then coalesce((p_pack->>'visible')::boolean, false) else coalesce(v_old.visible, false) end,
        coalesce(v_old.created_at, now()), now())
      on conflict (id) do update set name = excluded.name, tagline = excluded.tagline, icon = excluded.icon, accent = excluded.accent,
        accent2 = excluded.accent2, source = excluded.source, rarity_odds = excluded.rarity_odds, default_cards = excluded.default_cards,
        price = excluded.price, available_from = excluded.available_from, available_until = excluded.available_until,
        limited_stock = excluded.limited_stock, per_player = excluded.per_player, visible = excluded.visible, updated_at = now()
      returning * into v_row;
  exception when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'BAD_PACK';
  end;
  if v_row.available_from is not null and v_row.available_until is not null and v_row.available_until <= v_row.available_from then
    raise exception 'BAD_WINDOW';
  end if;
  v_log := public.liveops_log(case when v_old.id is null then 'pack_create' else 'pack_update' end,
    jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row)),
    case when v_old.id is null then jsonb_build_object('op', 'delete_row', 'table', 'admin_packs', 'key', jsonb_build_object('id', v_id))
      else jsonb_build_object('op', 'restore_row', 'table', 'admin_packs', 'key', jsonb_build_object('id', v_id), 'row', to_jsonb(v_old)) end);
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'UPDATE', 'id', v_id));
  return to_jsonb(v_row) || jsonb_build_object('log', v_log);
end $$;

create or replace function public.admin_pack_delete(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old admin_packs; v_log bigint;
begin
  delete from admin_packs where id = p_id returning * into v_old;
  if v_old.id is null then return jsonb_build_object('deleted', false); end if;
  v_log := public.liveops_log('pack_delete', jsonb_build_object('old', to_jsonb(v_old)),
    jsonb_build_object('op', 'restore_row', 'table', 'admin_packs', 'key', jsonb_build_object('id', v_old.id), 'row', to_jsonb(v_old)));
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'DELETE', 'id', v_old.id));
  return jsonb_build_object('deleted', true, 'pack', to_jsonb(v_old), 'log', v_log);
end $$;

create or replace function public.admin_card_override_upsert(p_override jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := public.liveops_actor();
  v_key text := btrim(coalesce(p_override->>'article_key', p_override->>'key', ''));
  v_old card_overrides;
  v_row card_overrides;
  v_n   integer;
  v_log bigint;
begin
  if p_override is null or jsonb_typeof(p_override) <> 'object' or v_key = '' then raise exception 'BAD_OVERRIDE'; end if;
  select * into v_old from card_overrides where article_key = v_key for update;
  begin
    insert into card_overrides (article_key, lang, title_override, description_override, image_url, rarity_override, price_override, hidden, updated_at)
      values (v_key,
        coalesce(nullif(p_override->>'lang', ''), v_old.lang, nullif(split_part(v_key, ':', 1), v_key), 'en'),
        case when p_override ? 'title_override' then nullif(btrim(p_override->>'title_override'), '') else v_old.title_override end,
        case when p_override ? 'description_override' then nullif(btrim(p_override->>'description_override'), '') else v_old.description_override end,
        case when p_override ? 'image_url' then nullif(btrim(p_override->>'image_url'), '') else v_old.image_url end,
        case when p_override ? 'rarity_override' then nullif(p_override->>'rarity_override', '') else v_old.rarity_override end,
        case when p_override ? 'price_override' then nullif(p_override->>'price_override', '')::bigint else v_old.price_override end,
        case when p_override ? 'hidden' then coalesce((p_override->>'hidden')::boolean, false) else coalesce(v_old.hidden, false) end,
        now())
      on conflict (article_key) do update set lang = excluded.lang, title_override = excluded.title_override,
        description_override = excluded.description_override, image_url = excluded.image_url, rarity_override = excluded.rarity_override,
        price_override = excluded.price_override, hidden = excluded.hidden, updated_at = now()
      returning * into v_row;
  exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'BAD_OVERRIDE';
  end;
  v_n := public.liveops_override_sync(v_key);
  v_log := public.liveops_log(case when v_old.article_key is null then 'override_create' else 'override_update' end,
    jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row), 'cards', v_n),
    case when v_old.article_key is null then jsonb_build_object('op', 'delete_row', 'table', 'card_overrides', 'key', jsonb_build_object('article_key', v_key))
      else jsonb_build_object('op', 'restore_row', 'table', 'card_overrides', 'key', jsonb_build_object('article_key', v_key), 'row', to_jsonb(v_old)) end);
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'UPDATE', 'card', v_key));
  return to_jsonb(v_row) || jsonb_build_object('cards', v_n, 'log', v_log);
end $$;

create or replace function public.admin_card_override_delete(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor(); v_old card_overrides; v_n integer; v_log bigint;
begin
  delete from card_overrides where article_key = p_key returning * into v_old;
  if v_old.article_key is null then return jsonb_build_object('deleted', false); end if;
  v_n := public.liveops_override_sync(p_key);
  v_log := public.liveops_log('override_delete', jsonb_build_object('old', to_jsonb(v_old)),
    jsonb_build_object('op', 'restore_row', 'table', 'card_overrides', 'key', jsonb_build_object('article_key', p_key), 'row', to_jsonb(v_old)));
  perform public.live_send('world', 'packs', jsonb_build_object('type', 'DELETE', 'card', p_key));
  return jsonb_build_object('deleted', true, 'override', to_jsonb(v_old), 'log', v_log);
end $$;

create or replace function public.admin_push(p_target jsonb, p_title text, p_body text, p_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := public.liveops_actor();
  v_users   uuid[];
  v_devices integer;
  v_row     push_broadcasts;
  cfg       push_config;
  v_queued  boolean := false;
  v_log     bigint;
begin
  if char_length(coalesce(btrim(p_title), '')) not between 1 and 80 or char_length(coalesce(btrim(p_body), '')) not between 1 and 240 then
    raise exception 'BAD_TEXT';
  end if;
  if p_url is not null and p_url <> '' and (char_length(p_url) > 300 or p_url !~ '^(https://|/|#)') then raise exception 'BAD_URL'; end if;
  v_users := array(select public.liveops_audience(p_target));
  select count(*) into v_devices from push_tokens t where t.user_id = any(v_users)
    and (nullif(p_target->>'lang', '') is null or t.lang = p_target->>'lang');
  insert into push_broadcasts (title, body, url, target, users, devices, created_by)
    values (btrim(p_title), btrim(p_body), nullif(p_url, ''), p_target, v_users, v_devices, v_me)
    returning * into v_row;
  if v_devices > 0 then
    select * into cfg from push_config where id = 1;
    if cfg.url is not null and cfg.secret is not null and to_regproc('net.http_post') is not null then
      begin
        execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 4000)'
          using cfg.url, jsonb_build_object('kind', 'broadcast', 'broadcast', v_row.id),
                jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret);
        v_queued := true;
      exception when others then
        raise notice 'admin_push not queued: %', sqlerrm;
      end;
    end if;
  end if;
  v_log := public.liveops_log('push', jsonb_build_object('id', v_row.id, 'title', v_row.title, 'body', v_row.body, 'url', v_row.url,
    'target', p_target, 'users', cardinality(v_users), 'devices', v_devices, 'queued', v_queued), null);
  return jsonb_build_object('id', v_row.id, 'users', cardinality(v_users), 'devices', v_devices, 'queued', v_queued, 'log', v_log);
end $$;

create or replace function public.admin_undo_row(p_undo jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := public.liveops_actor();
  v_op    text := p_undo->>'op';
  v_table text := p_undo->>'table';
  v_col   text;
  v_val   text;
  v_set   text;
  v_log   bigint;
begin
  if p_undo is null or jsonb_typeof(p_undo) <> 'object' or jsonb_typeof(p_undo->'key') <> 'object' then raise exception 'BAD_UNDO'; end if;
  v_col := case v_table when 'live_events' then 'id' when 'redeem_codes' then 'code' when 'tuning' then 'key'
    when 'admin_packs' then 'id' when 'card_overrides' then 'article_key' when 'blocked_terms' then 'term' when 'blocked_hosts' then 'host' end;
  if v_col is null then raise exception 'BAD_UNDO'; end if;
  v_val := p_undo->'key'->>v_col;
  if v_val is null then raise exception 'BAD_UNDO'; end if;
  if v_op = 'delete_row' then
    if v_table = 'redeem_codes' then
      update redeem_codes set disabled = true where code = v_val;
    else
      execute format('delete from public.%I where %I::text = $1', v_table, v_col) using v_val;
    end if;
  elsif v_op = 'restore_row' then
    if jsonb_typeof(p_undo->'row') <> 'object' or (p_undo->'row'->>v_col) is distinct from v_val then raise exception 'BAD_UNDO'; end if;
    if v_table = 'tuning' and not public.liveops_tuning_ok(v_val, p_undo->'row'->'value') then raise exception 'BAD_VALUE'; end if;
    select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ') into v_set
      from pg_attribute a where a.attrelid = format('public.%I', v_table)::regclass and a.attnum > 0 and not a.attisdropped and a.attname <> v_col;
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict (%I) do update set %s',
      v_table, v_table, v_col, v_set) using p_undo->'row';
  else
    raise exception 'BAD_UNDO';
  end if;
  if v_table = 'card_overrides' then perform public.liveops_override_sync(v_val); end if;
  if v_table in ('live_events', 'tuning', 'admin_packs', 'card_overrides') then
    perform public.live_send('world', case v_table when 'tuning' then 'tuning' when 'live_events' then 'events' else 'packs' end,
      jsonb_build_object('type', 'UNDO', 'table', v_table, 'key', v_val));
  end if;
  v_log := public.liveops_log('undo_row', jsonb_build_object('undo', p_undo), null);
  return jsonb_build_object('ok', true, 'op', v_op, 'table', v_table, 'key', v_val, 'log', v_log);
end $$;

create or replace function public.admin_undo(p_log bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  l admin_log;
  u jsonb;
  v_batch uuid;
  v_new uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_stamp bigint := public.admin_stamp();
  v_deleted integer := 0;
  v_inverse integer := 0;
  v_skipped integer := 0;
  v_detail jsonb;
  v_key text;
  v_val jsonb;
  v_keys text[];
  v_n integer;
  v_log bigint;
  s jsonb;
  a announcements;
begin
  select * into l from admin_log where id = p_log for update;
  if l.id is null then raise exception 'NOT_FOUND'; end if;
  if l.undone_at is not null then
    return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'already undone', 'at', l.undone_at));
  end if;
  u := l.undo;
  if u is null then
    return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'this action cannot be undone', 'kind', l.kind));
  end if;

  if l.kind = 'grant' then
    v_batch := (u->>'batch')::uuid;
    delete from grants where batch = v_batch and claimed_at is null;
    get diagnostics v_deleted = row_count;
    select count(*) into v_skipped from grants g where g.batch = v_batch and g.claimed_at is not null and g.failed_at is null
      and not (g.kind in ('card', 'booster', 'owned', 'revokeOwned')
        or (g.kind in ('coins', 'ink') and coalesce(g.payload->>'mode', 'add') = 'add'));
    insert into grants (user_id, at, kind, payload, note_en, note_fr, created_by, batch)
      select g.user_id, v_now + (row_number() over (order by g.id, x.kind) * interval '1 microsecond'), x.kind, x.payload, '', '', v_me, v_new
      from grants g
      cross join lateral (
        select g.kind as kind, jsonb_build_object('amount', -((g.payload->>'amount')::numeric), 'mode', 'add') as payload
          where g.kind in ('coins', 'ink') and coalesce(g.payload->>'mode', 'add') = 'add'
        union all
        select 'takeCard', jsonb_build_object('key', g.payload->'article'->>'key', 'copies', coalesce((g.payload->>'count')::integer, 1))
          where g.kind = 'card' and g.payload->'article'->>'key' is not null
        union all
        select 'takeBooster', jsonb_build_object('spec', g.payload->'spec', 'count', coalesce((g.payload->>'count')::integer, 1))
          where g.kind = 'booster'
        union all
        select 'revokeOwned', jsonb_build_object('bucket', g.payload->>'bucket', 'id', i.v)
          from jsonb_array_elements_text(case when jsonb_typeof(g.payload->'ids') = 'array' then g.payload->'ids'
            else jsonb_build_array(g.payload->'id') end) as i(v)
          where g.kind = 'owned' and i.v is not null
        union all
        select 'owned', jsonb_build_object('bucket', g.payload->>'bucket', 'id', g.payload->>'id')
          where g.kind = 'revokeOwned'
      ) x
      where g.batch = v_batch and g.claimed_at is not null and g.failed_at is null;
    get diagnostics v_inverse = row_count;
    if v_deleted = 0 and v_inverse = 0 then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason',
        case when v_skipped > 0 then 'what was claimed (xp, level, boosters opened or a card taken) cannot be given back'
             else 'nothing of this grant is left to undo' end, 'skipped', v_skipped));
    end if;
    v_detail := jsonb_build_object('deleted', v_deleted, 'inverse', v_inverse, 'skipped', v_skipped,
      'batch', case when v_inverse > 0 then v_new end);
  elsif l.kind = 'standing' then
    s := u->'before';
    if s is null or jsonb_typeof(s) = 'null' then
      delete from suspensions where user_id = l.target;
    else
      insert into suspensions (user_id, reason, until, muted, at, by)
        values (l.target, coalesce(s->>'reason', ''), (s->>'until')::timestamptz, coalesce((s->>'muted')::boolean, false),
          coalesce((s->>'at')::timestamptz, now()), (s->>'by')::uuid)
        on conflict (user_id) do update set reason = excluded.reason, until = excluded.until, muted = excluded.muted, at = excluded.at, by = excluded.by;
    end if;
    v_detail := jsonb_build_object('standing', s);
  elsif l.kind = 'rename' then
    if exists (select 1 from profiles p where lower(p.username) = lower(u->>'name') and p.id <> l.target) then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the old name has been taken since'));
    end if;
    update profiles set username = u->>'name' where id = l.target;
    perform live_send('user:' || l.target, 'profile', jsonb_build_object('username', u->>'name'));
    v_detail := jsonb_build_object('username', u->>'name');
  elsif l.kind = 'announce' then
    update announcements set ends_at = now() where id = (u->>'id')::bigint and (ends_at is null or ends_at > now());
    v_detail := jsonb_build_object('retired', (u->>'id')::bigint);
  elsif l.kind = 'retire' then
    select * into a from announcements where id = (u->>'id')::bigint;
    if a.id is null then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the announcement is gone'));
    end if;
    update announcements set ends_at = (u->>'ends_at')::timestamptz where id = a.id;
    v_detail := jsonb_build_object('restored', a.id);
  elsif l.kind = 'save-key' then
    if coalesce((u->>'had')::boolean, false) then
      perform public.admin_save_write(l.target, u->>'key', u->>'value', v_stamp);
    else
      perform public.admin_save_write(l.target, u->>'key', null, v_stamp);
    end if;
    perform live_send('user:' || l.target, 'save', jsonb_build_object('keys', jsonb_build_array(u->>'key')));
    v_detail := jsonb_build_object('key', u->>'key');
  elsif l.kind = 'restore-backup' then
    v_keys := array(select jsonb_array_elements_text(u->'wrote'));
    foreach v_key in array v_keys loop
      v_val := u->'keys'->v_key;
      perform public.admin_save_write(l.target, v_key, case when v_val is null then null else v_val #>> '{}' end, v_stamp);
    end loop;
    perform live_send('user:' || l.target, 'save', jsonb_build_object('keys', u->'wrote'));
    v_detail := jsonb_build_object('keys', u->'wrote');
  elsif l.kind = 'guild-rename' then
    if exists (select 1 from guilds x where (lower(x.name) = lower(u->>'name') or x.tag = u->>'tag') and x.id <> (u->>'guild')::uuid) then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the old name or tag has been taken since'));
    end if;
    update guilds set name = u->>'name', tag = u->>'tag' where id = (u->>'guild')::uuid;
    if not found then return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the guild is gone')); end if;
    perform live_send('user:' || m.user_id, 'guild', jsonb_build_object('type', 'renamed', 'guild', m.guild_id))
      from guild_members m where m.guild_id = (u->>'guild')::uuid;
    v_detail := jsonb_build_object('name', u->>'name', 'tag', u->>'tag');
  elsif l.kind = 'guild-transfer' then
    if not exists (select 1 from guild_members m where m.guild_id = (u->>'guild')::uuid and m.user_id = (u->>'owner')::uuid) then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the old owner is no longer a member'));
    end if;
    update guilds set owner = (u->>'owner')::uuid where id = (u->>'guild')::uuid;
    perform live_send('user:' || m.user_id, 'guild', jsonb_build_object('type', 'owner', 'guild', m.guild_id))
      from guild_members m where m.guild_id = (u->>'guild')::uuid;
    v_detail := jsonb_build_object('owner', u->>'owner');
  elsif u->>'op' = 'regrant' then
    insert into grants select r.* from jsonb_populate_recordset(null::grants, u->'rows') r
      where exists (select 1 from auth.users x where x.id = r.user_id)
      on conflict (id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'those gifts are back already, or their players are gone'));
    end if;
    v_detail := jsonb_build_object('restored', v_n);
  elsif u->>'op' = 'reports' then
    update reports r set status = x.status, outcome = coalesce(x.outcome, ''), handled_at = x.handled_at, handled_by = x.handled_by
      from jsonb_to_recordset(u->'rows') as x(id bigint, status text, outcome text, handled_at timestamptz, handled_by uuid)
      where r.id = x.id;
    get diagnostics v_n = row_count;
    v_detail := jsonb_build_object('reports', v_n);
  elsif u->>'op' = 'note' then
    s := u->'before';
    if s is null or jsonb_typeof(s) = 'null' then
      delete from player_notes where user_id = (u->>'user')::uuid;
    else
      insert into player_notes (user_id, body, watch, updated_at)
        values ((u->>'user')::uuid, coalesce(s->>'body', ''), coalesce((s->>'watch')::boolean, false), coalesce((s->>'updated_at')::timestamptz, now()))
        on conflict (user_id) do update set body = excluded.body, watch = excluded.watch, updated_at = excluded.updated_at;
    end if;
    v_detail := jsonb_build_object('note', s);
  elsif u->>'op' = 'custom_pack' then
    if not exists (select 1 from auth.users x where x.id = (u->'row'->>'user_id')::uuid) then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the player is gone'));
    end if;
    insert into custom_packs select r.* from jsonb_populate_record(null::custom_packs, u->'row') r on conflict (user_id, id) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'the player made a booster with the same id since'));
    end if;
    v_detail := jsonb_build_object('pack', u->'row'->>'id');
  elsif u->>'op' in ('restore_row', 'delete_row') then
    v_detail := public.admin_undo_row(u);
  else
    return jsonb_build_object('ok', false, 'detail', jsonb_build_object('reason', 'this action cannot be undone', 'kind', l.kind));
  end if;

  update admin_log set undone_at = now() where id = l.id;
  v_log := public.admin_note('undo', l.target, jsonb_build_object('log', l.id, 'kind', l.kind) || v_detail, null, null,
    case when v_inverse > 0 then v_new end);
  return jsonb_build_object('ok', true, 'detail', v_detail, 'log', v_log);
end $$;

create or replace function public.admin_log_undoable(l public.admin_log)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_open integer; v_back integer; v_kept integer;
begin
  if not l.ok then return jsonb_build_object('undoable', false, 'why', 'it did not go through'); end if;
  if l.undone_at is not null then return jsonb_build_object('undoable', false, 'why', 'already undone'); end if;
  if l.undo is null then return jsonb_build_object('undoable', false, 'why', 'this action cannot be undone'); end if;
  if l.kind = 'grant' then
    select count(*) filter (where g.claimed_at is null),
           count(*) filter (where g.claimed_at is not null and g.failed_at is null and (g.kind in ('card', 'booster', 'owned', 'revokeOwned')
             or (g.kind in ('coins', 'ink') and coalesce(g.payload->>'mode', 'add') = 'add'))),
           count(*) filter (where g.claimed_at is not null and g.failed_at is null and not (g.kind in ('card', 'booster', 'owned', 'revokeOwned')
             or (g.kind in ('coins', 'ink') and coalesce(g.payload->>'mode', 'add') = 'add')))
      into v_open, v_back, v_kept
      from grants g where g.batch = (l.undo->>'batch')::uuid;
    if v_open + v_back = 0 then
      return jsonb_build_object('undoable', false, 'why', case when v_kept > 0
        then 'what was claimed (xp, level, boosters opened or a card taken) cannot be given back'
        else 'nothing of this grant is left to undo' end);
    end if;
  elsif l.kind = 'rename' then
    if exists (select 1 from profiles p where lower(p.username) = lower(l.undo->>'name') and p.id <> l.target) then
      return jsonb_build_object('undoable', false, 'why', 'the old name has been taken since');
    end if;
  elsif l.kind = 'guild-rename' then
    if not exists (select 1 from guilds g where g.id = (l.undo->>'guild')::uuid) then
      return jsonb_build_object('undoable', false, 'why', 'the guild is gone');
    end if;
  elsif l.kind = 'guild-transfer' then
    if not exists (select 1 from guild_members m where m.guild_id = (l.undo->>'guild')::uuid and m.user_id = (l.undo->>'owner')::uuid) then
      return jsonb_build_object('undoable', false, 'why', 'the old owner is no longer a member');
    end if;
  elsif l.kind = 'retire' then
    if not exists (select 1 from announcements a where a.id = (l.undo->>'id')::bigint) then
      return jsonb_build_object('undoable', false, 'why', 'the announcement is gone');
    end if;
  end if;
  return jsonb_build_object('undoable', true, 'why', null);
exception when others then
  return jsonb_build_object('undoable', true, 'why', null);
end $$;

create or replace function public.admin_log_list(p_before bigint default null, p_limit integer default 50, p_filter jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_player uuid;
  v_kind text;
  v_pat text;
  v_from timestamptz;
  v_to timestamptz;
  v_batch uuid;
  v_rows jsonb;
  v_n integer;
  v_total bigint;
begin
  perform public.admin_gate();
  begin
    if jsonb_typeof(f->'player') = 'string' then v_player := (f->>'player')::uuid; end if;
    if jsonb_typeof(f->'kind') = 'string' then v_kind := nullif(btrim(f->>'kind'), ''); end if;
    if jsonb_typeof(f->'from') = 'string' then v_from := (f->>'from')::timestamptz; end if;
    if jsonb_typeof(f->'to') = 'string' then v_to := (f->>'to')::timestamptz; end if;
    if jsonb_typeof(f->'batch') = 'string' then v_batch := (f->>'batch')::uuid; end if;
  exception when others then
    raise exception 'BAD_FILTER';
  end;
  v_pat := '%' || replace(replace(replace(lower(coalesce(v_kind, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  select coalesce(jsonb_agg(x.j order by x.id desc), '[]'::jsonb), count(*) into v_rows, v_n from (
    select l.id, jsonb_build_object('id', l.id, 'at', l.at, 'actor', l.actor, 'actor_name', pa.username, 'target', l.target,
        'target_name', pt.username, 'kind', l.kind, 'detail', l.detail, 'reason', l.reason, 'ok', l.ok, 'batch', l.batch,
        'undone_at', l.undone_at) || public.admin_log_undoable(l) as j
      from admin_log l
      left join profiles pa on pa.id = l.actor
      left join profiles pt on pt.id = l.target
      where (p_before is null or l.id < p_before)
        and (v_player is null or l.target = v_player)
        and (v_kind is null or lower(l.kind) like v_pat)
        and (v_from is null or l.at >= v_from)
        and (v_to is null or l.at < v_to)
        and (v_batch is null or l.batch = v_batch)
      order by l.id desc
      limit lim + 1) x;
  if v_n > lim then v_rows := v_rows - lim; end if;
  if p_before is null then
    select count(*) into v_total from admin_log l
      where (v_player is null or l.target = v_player)
        and (v_kind is null or lower(l.kind) like v_pat)
        and (v_from is null or l.at >= v_from)
        and (v_to is null or l.at < v_to)
        and (v_batch is null or l.batch = v_batch);
  end if;
  return jsonb_build_object('rows', v_rows, 'more', v_n > lim,
    'next', case when v_n > lim then (v_rows->(lim - 1)->>'id')::bigint end, 'total', v_total);
end $$;

create or replace function public.admin_grant_cancel(p_grant_ids bigint[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_rows jsonb;
  v_refused jsonb;
  v_n integer;
  v_users integer;
  v_one uuid;
  v_log bigint;
begin
  if p_grant_ids is null or cardinality(p_grant_ids) = 0 or cardinality(p_grant_ids) > 500 then raise exception 'BAD_IDS'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'reason', case when g.id is null then 'not found'
      when g.failed_at is not null then 'the game could not apply it' else 'already claimed' end) order by x.id), '[]'::jsonb)
    into v_refused
    from (select distinct unnest(p_grant_ids) as id) x left join grants g on g.id = x.id
    where g.id is null or g.claimed_at is not null;
  with gone as (
    delete from grants g where g.id = any(p_grant_ids) and g.claimed_at is null returning g.*
  )
  select coalesce(jsonb_agg(to_jsonb(gone) order by gone.id), '[]'::jsonb), count(*), count(distinct gone.user_id),
      (array_agg(gone.user_id))[1]
    into v_rows, v_n, v_users, v_one from gone;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'cancelled', 0, 'refused', v_refused, 'log', null);
  end if;
  v_log := public.admin_note('grant-cancel', case when v_users = 1 then v_one end,
    jsonb_build_object('grants', (select jsonb_agg(r->'id') from jsonb_array_elements(v_rows) r),
      'items', (select jsonb_agg(jsonb_build_object('kind', r->>'kind') || coalesce(r->'payload', '{}'::jsonb)) from jsonb_array_elements(v_rows) r),
      'players', v_users, 'refused', v_refused),
    null, jsonb_build_object('op', 'regrant', 'rows', v_rows));
  return jsonb_build_object('ok', true, 'cancelled', v_n, 'refused', v_refused, 'log', v_log);
end $$;

create or replace function public.admin_player(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_gate();
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object(
    'id', p_user,
    'profile', (select to_jsonb(p) from profiles p where p.id = p_user),
    'online', coalesce((select p.last_seen_at > now() - interval '2 minutes' from profiles p where p.id = p_user), false),
    'wallet', coalesce((select jsonb_build_object('coins', w.coins, 'ink', w.ink, 'updated_at', w.updated_at) from wallets w where w.user_id = p_user),
      jsonb_build_object('coins', 0, 'ink', 0, 'updated_at', null)),
    'econ', (select jsonb_build_object('n_cards', e.n_cards, 'n_unique', e.n_unique, 'n_value', e.n_value, 'updated_at', e.updated_at,
        'live', e.state ? 'imported',
        'state', jsonb_build_object('progress', e.state->'progress', 'boostersOpened', e.state->'boostersOpened',
          'rarityCounts', e.state->'rarityCounts', 'owned', e.state->'owned', 'daily', e.state->'daily', 'pendingLevels', e.state->'pendingLevels'))
      from econ e where e.user_id = p_user),
    'inventory', coalesce((select jsonb_agg(jsonb_build_object('spec_id', i.spec_id, 'spec', i.spec, 'count', i.count) order by i.spec_id)
      from inventory i where i.user_id = p_user), '[]'::jsonb),
    'save_live', exists (select 1 from save_meta m where m.user_id = p_user),
    'save_keys', coalesce((select jsonb_agg(jsonb_build_object('key', k.key, 'length', octet_length(k.value), 'stamp', k.stamp,
        'updated_at', k.updated_at,
        'value', case when k.key in ('wikster.language', 'wikster.theme', 'wikster.ripDirection') then k.value end) order by k.key)
      from save_keys k where k.user_id = p_user), '[]'::jsonb),
    'standing', (select to_jsonb(s) || jsonb_build_object('active', s.until is null or s.until > now(),
        'type', case when s.muted then 'mute' else 'suspend' end)
      from suspensions s where s.user_id = p_user),
    'notes', (select to_jsonb(n) from player_notes n where n.user_id = p_user),
    'grants', coalesce((select jsonb_agg(to_jsonb(g) order by g.at desc, g.id desc) from (
        select x.id, x.at, x.kind, x.payload, x.note_en, x.note_fr, x.claimed_at, x.failed_at, x.batch,
          (select l.id from admin_log l where l.batch = x.batch and l.kind = 'grant' order by l.id limit 1) as log
        from grants x where x.user_id = p_user order by x.at desc, x.id desc limit 50) g), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l) order by l.at desc, l.id desc) from (
        select id, at, kind, coins, ink, reason, detail from ledger where user_id = p_user order by at desc, id desc limit 100) l), '[]'::jsonb),
    'backups', coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc) from (
        select id, at, reason, cards, coins from saves_history where user_id = p_user order by at desc limit 20) h), '[]'::jsonb),
    'guild', (select jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'members', g.members,
        'owner', g.owner = p_user, 'joined_at', m.joined_at)
      from guild_members m join guilds g on g.id = m.guild_id where m.user_id = p_user),
    'reports_by', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select id, created_at, kind, ref, reason, note, status, target, outcome from reports
        where reporter = p_user order by created_at desc limit 20) r), '[]'::jsonb),
    'reports_against', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select id, created_at, kind, ref, reason, note, status, reporter, outcome from reports
        where target = p_user order by created_at desc limit 20) r), '[]'::jsonb),
    'open_trades', (select count(*) from trades t where t.status = 'pending' and (t.proposer = p_user or t.recipient = p_user)),
    'open_auctions', (select count(*) from auctions a where a.status = 'open' and a.seller = p_user)
  );
end $$;

create or replace function public.admin_like(p text)
returns text language sql immutable as $$
  select '%' || replace(replace(replace(lower(coalesce(p, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create or replace function public.admin_reports(p_status text default 'open', p_filter jsonb default '{}'::jsonb,
  p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_kind text;
  v_reason text;
  v_target uuid;
  v_reporter uuid;
  v_urgent boolean;
  v_q text;
  v_total bigint;
  v_rows jsonb;
begin
  perform public.admin_gate();
  if v_status not in ('open', 'actioned', 'dismissed', 'all') then raise exception 'BAD_STATUS'; end if;
  begin
    if jsonb_typeof(f->'kind') = 'string' then v_kind := f->>'kind'; end if;
    if jsonb_typeof(f->'reason') = 'string' then v_reason := f->>'reason'; end if;
    if jsonb_typeof(f->'target') = 'string' then v_target := (f->>'target')::uuid; end if;
    if jsonb_typeof(f->'reporter') = 'string' then v_reporter := (f->>'reporter')::uuid; end if;
    if jsonb_typeof(f->'urgent') = 'boolean' then v_urgent := (f->>'urgent')::boolean; end if;
    if jsonb_typeof(f->'q') = 'string' then v_q := nullif(btrim(f->>'q'), ''); end if;
  exception when others then
    raise exception 'BAD_FILTER';
  end;
  with m as materialized (
    select r.* from reports r
    where (v_status = 'all' or r.status = v_status)
      and (v_kind is null or r.kind = v_kind)
      and (v_reason is null or r.reason = v_reason)
      and (v_target is null or r.target = v_target)
      and (v_reporter is null or r.reporter = v_reporter)
      and (v_urgent is null or r.urgent = v_urgent)
      and (v_q is null or lower(r.note) like public.admin_like(v_q) or lower(coalesce(r.evidence->>'body', '')) like public.admin_like(v_q))
  )
  select (select count(*) from m), coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('reporter_name', pr.username, 'target_name', pt.username)
      order by x.urgent desc, x.created_at desc, x.id desc)
    from (select * from m order by m.urgent desc, m.created_at desc, m.id desc limit lim offset off) x
    left join profiles pr on pr.id = x.reporter
    left join profiles pt on pt.id = x.target), '[]'::jsonb)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows, 'open', (select count(*) from reports r where r.status = 'open'));
end $$;

create or replace function public.admin_report_act(p_ids bigint[], p_action text, p_outcome text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_before jsonb;
  v_found integer;
  v_target uuid;
  v_status text;
  v_n integer;
  v_log bigint;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then raise exception 'BAD_IDS'; end if;
  if p_action is null or p_action not in ('dismiss', 'action', 'reopen', 'delete_evidence') then raise exception 'BAD_ACTION'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'outcome', r.outcome, 'handled_at', r.handled_at,
      'handled_by', r.handled_by) order by r.id), '[]'::jsonb), count(*),
      case when count(distinct r.target) = 1 then (array_agg(r.target))[1] end
    into v_before, v_found, v_target
    from reports r where r.id = any(p_ids);
  if v_found = 0 then raise exception 'NOT_FOUND'; end if;
  if p_action = 'delete_evidence' then
    update reports set evidence = jsonb_strip_nulls(jsonb_build_object('username', evidence->'username', 'level', evidence->'level',
        'removed', true))
      where id = any(p_ids) and not coalesce((evidence->>'removed')::boolean, false);
    get diagnostics v_n = row_count;
    v_log := public.admin_note('report-evidence', v_target, jsonb_build_object('ids', to_jsonb(p_ids), 'reports', v_n), null, null);
  else
    v_status := case p_action when 'dismiss' then 'dismissed' when 'action' then 'actioned' else 'open' end;
    update reports set status = v_status,
        outcome = case when p_action = 'reopen' then '' else left(coalesce(p_outcome, ''), 500) end,
        handled_at = case when p_action = 'reopen' then null else now() end,
        handled_by = case when p_action = 'reopen' then null else v_me end,
        seen_at = null
      where id = any(p_ids);
    get diagnostics v_n = row_count;
    v_log := public.admin_note('report-' || p_action, v_target,
      jsonb_build_object('ids', to_jsonb(p_ids), 'status', v_status, 'outcome', nullif(left(coalesce(p_outcome, ''), 500), ''), 'reports', v_n),
      null, jsonb_build_object('op', 'reports', 'rows', v_before));
  end if;
  return jsonb_build_object('ok', true, 'reports', v_n, 'log', v_log);
end $$;

create or replace function public.admin_words(p_q text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(btrim(coalesce(p_q, '')), '');
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_gate();
  return jsonb_build_object(
    'total', (select count(*) from blocked_terms t where q is null or t.term like public.admin_like(q)),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.term) from (
      select t.term, t.tier, t.mode from blocked_terms t where q is null or t.term like public.admin_like(q)
      order by t.term limit lim offset off) x), '[]'::jsonb));
end $$;

create or replace function public.admin_word_add(p_term text, p_tier text, p_mode text default 'word')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_term text := lower(btrim(coalesce(p_term, '')));
  v_old blocked_terms;
  v_row blocked_terms;
  v_log bigint;
begin
  if char_length(v_term) not between 1 and 60 then raise exception 'BAD_TERM'; end if;
  if p_tier is null or p_tier not in ('slur', 'sexual', 'profanity', 'reserved', 'contact') then raise exception 'BAD_TIER'; end if;
  if coalesce(p_mode, 'word') not in ('any', 'word', 'exact') then raise exception 'BAD_MODE'; end if;
  select * into v_old from blocked_terms where term = v_term for update;
  insert into blocked_terms (term, tier, mode) values (v_term, p_tier, coalesce(p_mode, 'word'))
    on conflict (term) do update set tier = excluded.tier, mode = excluded.mode
    returning * into v_row;
  v_log := public.admin_note('word-add', null, jsonb_build_object('term', v_term, 'tier', v_row.tier, 'mode', v_row.mode,
      'old', case when v_old.term is null then null else to_jsonb(v_old) end), null,
    case when v_old.term is null then jsonb_build_object('op', 'delete_row', 'table', 'blocked_terms', 'key', jsonb_build_object('term', v_term))
      else jsonb_build_object('op', 'restore_row', 'table', 'blocked_terms', 'key', jsonb_build_object('term', v_term), 'row', to_jsonb(v_old)) end);
  return jsonb_build_object('ok', true, 'term', v_term, 'tier', v_row.tier, 'mode', v_row.mode, 'log', v_log);
end $$;

create or replace function public.admin_word_remove(p_term text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_old blocked_terms; v_log bigint;
begin
  delete from blocked_terms where term = lower(btrim(coalesce(p_term, ''))) returning * into v_old;
  if v_old.term is null then return jsonb_build_object('ok', false, 'deleted', false, 'log', null); end if;
  v_log := public.admin_note('word-remove', null, jsonb_build_object('term', v_old.term, 'tier', v_old.tier, 'mode', v_old.mode), null,
    jsonb_build_object('op', 'restore_row', 'table', 'blocked_terms', 'key', jsonb_build_object('term', v_old.term), 'row', to_jsonb(v_old)));
  return jsonb_build_object('ok', true, 'deleted', true, 'log', v_log);
end $$;

create or replace function public.admin_filter_hits(p_q text default null, p_filter jsonb default '{}'::jsonb,
  p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  q text := nullif(btrim(coalesce(p_q, '')), '');
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_user uuid;
  v_scope text;
  v_reason text;
begin
  perform public.admin_gate();
  begin
    if jsonb_typeof(f->'user') = 'string' then v_user := (f->>'user')::uuid; end if;
    if jsonb_typeof(f->'scope') = 'string' then v_scope := f->>'scope'; end if;
    if jsonb_typeof(f->'reason') = 'string' then v_reason := f->>'reason'; end if;
  exception when others then
    raise exception 'BAD_FILTER';
  end;
  return (with m as materialized (
      select h.* from filter_hits h
      where (q is null or lower(h.body) like public.admin_like(q))
        and (v_user is null or h.user_id = v_user)
        and (v_scope is null or h.scope = v_scope)
        and (v_reason is null or h.reason = v_reason))
    select jsonb_build_object('total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('username', p.username) order by x.at desc, x.id desc)
        from (select * from m order by m.at desc, m.id desc limit lim offset off) x left join profiles p on p.id = x.user_id), '[]'::jsonb)));
end $$;

create or replace function public.admin_host_of(p text)
returns text language sql immutable as $$
  select nullif(lower(substring(btrim(coalesce(p, '')) from '^(?:[a-zA-Z][a-zA-Z0-9+.-]*://)?([^/:?#[:space:]]+)')), '')
$$;

create or replace function public.admin_wikis(p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform public.admin_gate();
  return coalesce((select jsonb_agg(to_jsonb(w) order by w.players desc, w.host) from (
    with packs as (
      select public.admin_host_of(c.def->'wiki'->>'apiUrl') as host, c.user_id, c.def->>'name' as name, c.created_at
      from custom_packs c where jsonb_typeof(c.def->'wiki') = 'object'
    ), hosts as (
      select k.host, count(*) as packs, count(distinct k.user_id) as players,
        (array_agg(distinct k.name) filter (where k.name is not null))[1:4] as names, max(k.created_at) as last
      from packs k where k.host is not null group by k.host
    )
    select coalesce(h.host, b.host) as host, coalesce(h.packs, 0) as packs, coalesce(h.players, 0) as players,
      coalesce(to_jsonb(h.names), '[]'::jsonb) as names, h.last, b.host is not null as blocked, b.reason, b.created_at as blocked_at
    from hosts h full join blocked_hosts b on b.host = h.host
    where q is null or coalesce(h.host, b.host) like public.admin_like(q)
    order by coalesce(h.players, 0) desc, coalesce(h.host, b.host)
    limit 500) w), '[]'::jsonb);
end $$;

create or replace function public.admin_custom_packs(p_host text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_host text := public.admin_host_of(p_host);
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_gate();
  return (with m as materialized (
      select c.user_id, c.id, c.def->>'name' as name, c.def->'wiki'->>'apiUrl' as api, c.created_at
      from custom_packs c
      where v_host is null or public.admin_host_of(c.def->'wiki'->>'apiUrl') = v_host)
    select jsonb_build_object('total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('username', p.username) order by x.created_at desc)
        from (select * from m order by m.created_at desc limit lim offset off) x left join profiles p on p.id = x.user_id), '[]'::jsonb)));
end $$;

create or replace function public.admin_host_block(p_host text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_host text := public.admin_host_of(p_host); v_old blocked_hosts; v_log bigint;
begin
  if v_host is null or v_host !~ '^[a-z0-9.-]{3,253}$' then raise exception 'BAD_HOST'; end if;
  select * into v_old from blocked_hosts where host = v_host for update;
  insert into blocked_hosts (host, reason) values (v_host, left(coalesce(p_reason, ''), 300))
    on conflict (host) do update set reason = excluded.reason;
  v_log := public.admin_note('host-block', null, jsonb_build_object('host', v_host, 'reason', nullif(p_reason, '')), p_reason,
    case when v_old.host is null then jsonb_build_object('op', 'delete_row', 'table', 'blocked_hosts', 'key', jsonb_build_object('host', v_host))
      else jsonb_build_object('op', 'restore_row', 'table', 'blocked_hosts', 'key', jsonb_build_object('host', v_host), 'row', to_jsonb(v_old)) end);
  return jsonb_build_object('ok', true, 'host', v_host, 'log', v_log);
end $$;

create or replace function public.admin_host_unblock(p_host text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_old blocked_hosts; v_log bigint;
begin
  delete from blocked_hosts where host = public.admin_host_of(p_host) returning * into v_old;
  if v_old.host is null then return jsonb_build_object('ok', false, 'deleted', false, 'log', null); end if;
  v_log := public.admin_note('host-unblock', null, jsonb_build_object('host', v_old.host), null,
    jsonb_build_object('op', 'restore_row', 'table', 'blocked_hosts', 'key', jsonb_build_object('host', v_old.host), 'row', to_jsonb(v_old)));
  return jsonb_build_object('ok', true, 'deleted', true, 'log', v_log);
end $$;

create or replace function public.admin_custom_pack_delete(p_user uuid, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_old custom_packs; v_log bigint;
begin
  delete from custom_packs where user_id = p_user and id = p_id returning * into v_old;
  if v_old.id is null then raise exception 'NOT_FOUND'; end if;
  v_log := public.admin_note('custom-pack-delete', p_user, jsonb_build_object('id', v_old.id, 'name', v_old.def->>'name',
      'host', public.admin_host_of(v_old.def->'wiki'->>'apiUrl')), null,
    jsonb_build_object('op', 'custom_pack', 'row', to_jsonb(v_old)));
  return jsonb_build_object('ok', true, 'log', v_log);
end $$;

create or replace function public.admin_announcements(p_live boolean default false, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_gate();
  return (with m as materialized (
      select a.* from announcements a where not coalesce(p_live, false) or a.ends_at is null or a.ends_at > now())
    select jsonb_build_object('total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('target_name', p.username, 'guild_name', g.name,
          'status', case when x.ends_at is not null and x.ends_at <= now() then 'ended' when x.starts_at > now() then 'upcoming' else 'live' end)
          order by x.created_at desc, x.id desc)
        from (select * from m order by m.created_at desc, m.id desc limit lim offset off) x
        left join profiles p on p.id = x.target_user
        left join guilds g on g.id = x.target_guild), '[]'::jsonb)));
end $$;

create or replace function public.admin_guilds(p_q text default null, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := nullif(btrim(coalesce(p_q, '')), '');
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
begin
  perform public.admin_gate();
  return (with m as materialized (
      select g.* from guilds g
      where q is null or lower(g.name) like public.admin_like(q) or lower(g.tag) like public.admin_like(q) or g.id::text = q)
    select jsonb_build_object('total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'tag', x.tag, 'about', x.about, 'owner', x.owner,
          'owner_name', p.username, 'members', x.members, 'created_at', x.created_at) order by x.members desc, x.created_at, x.id)
        from (select * from m order by m.members desc, m.created_at, m.id limit lim offset off) x
        left join profiles p on p.id = x.owner), '[]'::jsonb)));
end $$;

create or replace function public.admin_auctions(p_filter jsonb default '{}'::jsonb, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_status text := 'open';
  v_seller uuid;
  v_q text;
  v_expired boolean;
begin
  perform public.admin_gate();
  begin
    if jsonb_typeof(f->'status') = 'string' then v_status := f->>'status'; end if;
    if jsonb_typeof(f->'seller') = 'string' then v_seller := (f->>'seller')::uuid; end if;
    if jsonb_typeof(f->'q') = 'string' then v_q := nullif(btrim(f->>'q'), ''); end if;
    if jsonb_typeof(f->'expired') = 'boolean' then v_expired := (f->>'expired')::boolean; end if;
  exception when others then
    raise exception 'BAD_FILTER';
  end;
  if v_status not in ('open', 'settled', 'cancelled', 'all') then raise exception 'BAD_STATUS'; end if;
  return (with m as materialized (
      select a.* from auctions a
      where (v_status = 'all' or a.status = v_status)
        and (v_seller is null or a.seller = v_seller)
        and (v_q is null or lower(coalesce(a.card->>'title', '')) like public.admin_like(v_q) or lower(a.seller_name) like public.admin_like(v_q))
        and (v_expired is null or v_expired = (a.ends_at < now())))
    select jsonb_build_object('total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'seller', x.seller, 'seller_name', x.seller_name, 'card', x.card,
          'start_price', x.start_price, 'current_bid', x.current_bid, 'bidder', x.bidder, 'bidder_name', x.bidder_name,
          'bid_count', x.bid_count, 'ends_at', x.ends_at, 'status', x.status, 'created_at', x.created_at)
          order by case when v_status = 'open' then extract(epoch from x.ends_at) else -extract(epoch from x.created_at) end, x.id)
        from (select * from m order by case when v_status = 'open' then extract(epoch from m.ends_at) else -extract(epoch from m.created_at) end, m.id
          limit lim offset off) x), '[]'::jsonb)));
end $$;

create or replace function public.admin_board(p_which text, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  perform public.admin_gate();
  if p_which is null or p_which not in ('daily', 'weekly', 'alltime') then raise exception 'BAD_BOARD'; end if;
  execute format('select (select count(*) from public.%1$I), coalesce((select jsonb_agg(jsonb_build_object(''rank'', x.rank, ''user_id'', x.user_id,
      ''username'', p.username, ''score'', x.score, ''updated_at'', x.updated_at) order by x.rank)
    from (select b.*, row_number() over (order by b.score desc, b.updated_at asc, b.user_id) as rank from public.%1$I b
      order by b.score desc, b.updated_at asc, b.user_id limit $1 offset $2) x left join public.profiles p on p.id = x.user_id), ''[]''::jsonb)',
    'leaderboard_' || p_which)
    into v_total, v_rows using lim, off;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.admin_names(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_gate();
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'::jsonb; end if;
  if cardinality(p_ids) > 500 then raise exception 'BAD_IDS'; end if;
  return coalesce((select jsonb_object_agg(p.id, p.username) from profiles p where p.id = any(p_ids)), '{}'::jsonb);
end $$;

create or replace function public.admin_note_set(p_user uuid, p_body text, p_watch boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.admin_gate(); v_old player_notes; v_row player_notes; v_log bigint;
begin
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  select * into v_old from player_notes where user_id = p_user for update;
  insert into player_notes (user_id, body, watch, updated_at) values (p_user, left(coalesce(p_body, ''), 4000), coalesce(p_watch, false), now())
    on conflict (user_id) do update set body = excluded.body, watch = excluded.watch, updated_at = excluded.updated_at
    returning * into v_row;
  v_log := public.admin_note('note', p_user, jsonb_build_object('watch', v_row.watch, 'length', char_length(v_row.body)), null,
    jsonb_build_object('op', 'note', 'user', p_user, 'before', case when v_old.user_id is null then null else to_jsonb(v_old) end));
  return jsonb_build_object('ok', true, 'note', to_jsonb(v_row), 'log', v_log);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_str(jsonb, integer)', 'admin_spec_check(jsonb)', 'admin_item_check(jsonb, text)', 'admin_items_check(jsonb, text)',
    'admin_grant_items(jsonb)', 'liveops_spec_ok(jsonb)', 'liveops_items_ok(jsonb)', 'liveops_event_ok(text, jsonb)',
    'admin_audience_ids(jsonb)', 'admin_log_undoable(public.admin_log)', 'admin_like(text)', 'admin_host_of(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'admin_grant(jsonb, jsonb, text, text)', 'admin_cancel_trade(uuid)', 'admin_cancel_trades(uuid)', 'admin_auction_cancel(uuid)',
    'admin_auctions_cancel(uuid, boolean)', 'admin_wipe(uuid, text)', 'admin_guild_remove_member(uuid, uuid)',
    'admin_guild_rename(uuid, text, text)', 'admin_guild_transfer(uuid, uuid)', 'admin_guild_delete(uuid)', 'admin_delete_messages(uuid)',
    'admin_delete_guild_messages(uuid)', 'admin_announce(text, text, jsonb, timestamptz, timestamptz)', 'admin_retire_announcement(bigint)',
    'admin_event_upsert(jsonb)', 'admin_event_delete(uuid)', 'admin_code_create(jsonb)', 'admin_code_update(text, jsonb)',
    'admin_tuning_set(text, jsonb)', 'admin_tuning_reset(text)', 'admin_pack_upsert(jsonb)', 'admin_pack_delete(text)',
    'admin_card_override_upsert(jsonb)', 'admin_card_override_delete(text)', 'admin_push(jsonb, text, text, text)',
    'admin_undo_row(jsonb)', 'admin_undo(bigint)', 'admin_log_list(bigint, integer, jsonb)', 'admin_grant_cancel(bigint[])',
    'admin_player(uuid)', 'admin_reports(text, jsonb, integer, integer)', 'admin_report_act(bigint[], text, text)',
    'admin_words(text, integer, integer)', 'admin_word_add(text, text, text)', 'admin_word_remove(text)',
    'admin_filter_hits(text, jsonb, integer, integer)', 'admin_wikis(text)', 'admin_custom_packs(text, integer, integer)',
    'admin_host_block(text, text)', 'admin_host_unblock(text)', 'admin_custom_pack_delete(uuid, text)',
    'admin_announcements(boolean, integer, integer)', 'admin_guilds(text, integer, integer)', 'admin_auctions(jsonb, integer, integer)',
    'admin_board(text, integer, integer)', 'admin_names(uuid[])', 'admin_note_set(uuid, text, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- boosters
alter table public.cards add column if not exists prints jsonb;

insert into public.tuning_keys (key, kind, def, lo, hi, about) values
  ('pity.legendary', 'int', '40', 10, 200, 'Boosters opened without a Legendary or better before one is guaranteed')
on conflict (key) do update set kind = excluded.kind, def = excluded.def, lo = excluded.lo, hi = excluded.hi, about = excluded.about;

create or replace function public.rarity_bonus(p_id text)
returns integer language sql immutable set search_path = public as $$
  select case coalesce(p_id, 'common')
    when 'uncommon' then 25 when 'rare' then 60 when 'epic' then 140 when 'legendary' then 320
    when 'mythic' then 700 when 'exotic' then 1500 when 'prismatic' then 3200 when 'artifact' then 3200
    when 'special' then 3200 else 0 end;
$$;

create or replace function public.card_prints(p_rarity text, p_copies integer, p_prints jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare e record; n integer; total integer := 0; out_p jsonb := '{}'::jsonb; r text := coalesce(p_rarity, 'common');
begin
  if jsonb_typeof(p_prints) = 'object' then
    for e in select * from jsonb_each(p_prints) loop
      if jsonb_typeof(e.value) <> 'number' then continue; end if;
      n := greatest(0, round((e.value #>> '{}')::numeric))::integer;
      if n = 0 then continue; end if;
      out_p := out_p || jsonb_build_object(e.key, coalesce((out_p->>e.key)::integer, 0) + n);
      total := total + n;
    end loop;
    if total = greatest(1, coalesce(p_copies, 1)) and coalesce((out_p->>r)::integer, 0) > 0 then return out_p; end if;
  end if;
  return jsonb_build_object(r, greatest(1, coalesce(p_copies, 1)));
end $$;

create or replace function public.prints_best(p jsonb)
returns text language sql immutable set search_path = public as $$
  select coalesce((select e.key from jsonb_each_text(coalesce(p, '{}'::jsonb)) e
    where e.value::integer > 0 order by public.rarity_rank(e.key) desc limit 1), 'common');
$$;

create or replace function public.prints_add(a jsonb, b jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
    select x.key k, sum(x.value::integer)::integer n
      from (select * from jsonb_each_text(coalesce(a, '{}'::jsonb)) union all select * from jsonb_each_text(coalesce(b, '{}'::jsonb))) x
      group by x.key having sum(x.value::integer) > 0) s;
$$;

create or replace function public.print_price(p_price bigint, p_best text, p_rarity text)
returns bigint language sql immutable set search_path = public as $$
  select case when p_best = p_rarity then greatest(0, coalesce(p_price, 0))
    else round(greatest(0, coalesce(p_price, 0))::numeric * (100 + public.rarity_bonus(p_rarity)) / (100 + public.rarity_bonus(p_best)))::bigint end;
$$;

create or replace function public.card_value(p_price bigint, p_rarity text, p_copies integer, p_prints jsonb)
returns bigint language sql immutable set search_path = public as $$
  with p as (select public.card_prints(p_rarity, p_copies, p_prints) j)
  select coalesce(sum(e.value::bigint * public.print_price(p_price, public.prints_best(p.j), e.key)), 0)::bigint
    from p, jsonb_each_text(p.j) e;
$$;

create or replace function public.econ_entry_of(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(p->'data', '{}'::jsonb) || jsonb_build_object(
    'key', p->>'key', 'title', p->>'title', 'rarityId', p->>'rarityId', 'price', p->'price',
    'lang', p->>'lang', 'packId', p->'packId', 'count', coalesce((p->>'copies')::integer, 1))
    || case when jsonb_typeof(p->'prints') = 'object' then jsonb_build_object('prints', p->'prints') else '{}'::jsonb end;
$$;

create or replace function public.econ_card_of(p jsonb)
returns jsonb language sql immutable as $$
  select case when p ? 'data' then p else jsonb_build_object(
    'key', p->>'key',
    'title', coalesce(p->>'title', p->>'key'),
    'rarityId', coalesce(p->>'rarityId', 'common'),
    'price', greatest(0, round(coalesce((p->>'price')::numeric, 0)))::bigint,
    'lang', coalesce(p->>'lang', 'en'),
    'packId', p->>'packId',
    'copies', greatest(1, coalesce((p->>'count')::integer, 1)),
    'data', p - array['key', 'title', 'rarityId', 'price', 'count', 'lang', 'packId', 'favorite', 'prints'])
    || case when jsonb_typeof(p->'prints') = 'object' then jsonb_build_object('prints', p->'prints') else '{}'::jsonb end end;
$$;

create or replace function public.econ_recount(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare n bigint; u integer; v bigint;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then return; end if;
  select coalesce(sum(copies), 0)::bigint, count(*)::integer,
         coalesce(sum(public.card_value(price, rarity_id, copies, prints)), 0)::bigint
    into n, u, v from cards where user_id = p_user;
  insert into econ (user_id, n_cards, n_unique, n_value) values (p_user, n, u, v)
    on conflict (user_id) do update set n_cards = excluded.n_cards, n_unique = excluded.n_unique, n_value = excluded.n_value
    where (econ.n_cards, econ.n_unique, econ.n_value) is distinct from (excluded.n_cards, excluded.n_unique, excluded.n_value);
  update profiles set cards = cards where id = p_user
    and (cards, unique_cards, collection_value) is distinct from (least(n, 2147483647)::integer, u, v);
end $$;
revoke all on function public.econ_recount(uuid) from public, anon, authenticated;
grant execute on function public.econ_recount(uuid) to service_role;

drop function if exists public.econ_take_card(uuid, text, integer, boolean);
create or replace function public.econ_take_card(p_user uuid, p_key text, p_copies integer default 1,
  p_force boolean default false, p_rarity text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  row_c cards;
  n integer := greatest(1, coalesce(p_copies, 1));
  pr jsonb;
  best text;
  left_best text;
  pick text;
  taken jsonb := '{}'::jsonb;
  avail integer;
  i integer;
  was_v bigint;
  out_r text;
begin
  select * into row_c from cards where user_id = p_user and article_key = p_key for update;
  if row_c.user_id is null or row_c.copies < n then raise exception 'NOT_OWNED'; end if;
  if coalesce(row_c.data->>'special', 'false') not in ('false', '') and not p_force then
    raise exception 'LOCKED';
  end if;
  pr := public.card_prints(row_c.rarity_id, row_c.copies, row_c.prints);
  best := public.prints_best(pr);
  was_v := public.card_value(row_c.price, row_c.rarity_id, row_c.copies, row_c.prints);
  if p_rarity is not null then
    avail := coalesce((pr->>p_rarity)::integer, 0) - case when p_rarity = best and row_c.copies > n then 1 else 0 end;
    if avail < n then raise exception 'NOT_OWNED'; end if;
    taken := jsonb_build_object(p_rarity, n);
    pr := public.prints_add(pr, jsonb_build_object(p_rarity, -n));
  else
    for i in 1..n loop
      select e.key into pick from jsonb_each_text(pr) e
        where e.value::integer - case when e.key = public.prints_best(pr) then 1 else 0 end > 0
        order by public.rarity_rank(e.key) asc limit 1;
      if pick is null then pick := public.prints_best(pr); end if;
      taken := public.prints_add(taken, jsonb_build_object(pick, 1));
      pr := public.prints_add(pr, jsonb_build_object(pick, -1));
      pick := null;
    end loop;
  end if;
  if row_c.copies = n then
    delete from cards where user_id = p_user and article_key = row_c.article_key;
  else
    left_best := public.prints_best(pr);
    update cards set copies = copies - n, prints = pr, last_at = now(),
        rarity_id = left_best,
        price = case when left_best = best then price else public.print_price(price, best, left_best) end
      where user_id = p_user and article_key = row_c.article_key;
  end if;
  if coalesce(current_setting('wikster.tally', true), '') <> 'held' then
    perform public.econ_tally(p_user, -n, case when row_c.copies = n then -1 else 0 end,
      coalesce((select public.card_value(c.price, c.rarity_id, c.copies, c.prints) from cards c
        where c.user_id = p_user and c.article_key = row_c.article_key), 0) - was_v);
  end if;
  out_r := case when (select count(*) from jsonb_object_keys(taken)) = 1 then (select k from jsonb_object_keys(taken) k limit 1) else best end;
  return jsonb_build_object(
    'key', row_c.article_key, 'title', row_c.title, 'rarityId', out_r,
    'price', public.print_price(row_c.price, best, out_r), 'lang', row_c.lang, 'packId', row_c.pack_id, 'copies', n, 'data', row_c.data)
    || case when (select count(*) from jsonb_object_keys(taken)) > 1 then jsonb_build_object('prints', taken) else '{}'::jsonb end;
end $$;
revoke all on function public.econ_take_card(uuid, text, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.econ_take_card(uuid, text, integer, boolean, text) to service_role;

create or replace function public.econ_give_card(p_user uuid, item jsonb, p_origin text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  held  boolean := coalesce(current_setting('wikster.tally', true), '') = 'held';
  r     text := coalesce(item->>'rarityId', 'common');
  n     integer := greatest(1, coalesce((item->>'copies')::integer, 1));
  more  jsonb;
  was_c integer;
  was_v bigint;
  now_c integer;
  now_v bigint;
begin
  if item->>'key' is null then raise exception 'BAD_CARD'; end if;
  more := public.card_prints(r, n, item->'prints');
  if not held then
    select copies, public.card_value(price, rarity_id, copies, prints) into was_c, was_v
      from cards where user_id = p_user and article_key = item->>'key' for update;
  end if;
  insert into cards (user_id, article_key, title, rarity_id, price, copies, lang, pack_id, origin, data, prints)
  values (p_user, item->>'key', coalesce(item->>'title', item->>'key'), public.prints_best(more),
          greatest(0, coalesce((item->>'price')::bigint, 0)), n, coalesce(item->>'lang', 'en'),
          item->>'packId', coalesce(p_origin, item->>'origin', 'pull'), coalesce(item->'data', '{}'::jsonb), more)
  on conflict (user_id, article_key) do update
    set copies    = cards.copies + excluded.copies,
        last_at   = now(),
        prints    = public.prints_add(public.card_prints(cards.rarity_id, cards.copies, cards.prints), excluded.prints),
        rarity_id = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then excluded.rarity_id else cards.rarity_id end,
        price     = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then excluded.price
                         when item ? 'reprice' then greatest(0, (item->>'reprice')::bigint)
                         else cards.price end,
        data      = case when public.rarity_rank(excluded.rarity_id) > public.rarity_rank(cards.rarity_id)
                         then cards.data || excluded.data else excluded.data || cards.data end
  returning copies, public.card_value(price, rarity_id, copies, prints) into now_c, now_v;
  if not held then
    perform public.econ_tally(p_user, now_c - coalesce(was_c, 0), case when was_c is null then 1 else 0 end,
      now_v - coalesce(was_v, 0));
  end if;
end $$;
revoke all on function public.econ_give_card(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.econ_give_card(uuid, jsonb, text) to service_role;

create or replace function public.econ_card_json(c cards)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('article_key', c.article_key, 'title', c.title, 'rarity_id', c.rarity_id, 'price', c.price,
    'copies', c.copies, 'lang', c.lang, 'pack_id', c.pack_id, 'data', c.data, 'favorite', c.favorite,
    'prints', public.card_prints(c.rarity_id, c.copies, c.prints));
$$;

create or replace function public.econ_apply(p_user uuid, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w        wallets;
  item     jsonb;
  k        text;
  n        integer;
  cur      integer;
  removed  jsonb := '[]'::jsonb;
  d_coins  bigint := coalesce((p_ops->>'coins')::bigint, 0);
  d_ink    bigint := coalesce((p_ops->>'ink')::bigint, 0);
  touched  text[];
  b_n      bigint := 0;
  b_u      integer := 0;
  b_v      bigint := 0;
  a_n      bigint := 0;
  a_u      integer := 0;
  a_v      bigint := 0;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  perform set_config('wikster.tally', 'held', true);

  for k in select jsonb_array_elements_text(coalesce(p_ops->'claims', '[]'::jsonb)) loop
    insert into claims (user_id, key) values (p_user, k) on conflict do nothing;
    if not found then raise exception 'ALREADY_CLAIMED'; end if;
  end loop;

  if p_ops ? 'rev' then
    insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
    select coalesce((state->>'rev')::integer, 0) into cur from econ where user_id = p_user for update;
    if cur <> (p_ops->>'rev')::integer then raise exception 'CONFLICT'; end if;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'marks', '[]'::jsonb)) loop
    perform public.econ_mark(p_user, item);
  end loop;

  if p_ops ? 'pull' then
    update pulls set claimed_at = now(),
        cards = case when jsonb_typeof(p_ops->'pullCards') = 'array' then p_ops->'pullCards' else cards end
      where nonce = (p_ops->>'pull')::uuid and user_id = p_user and claimed_at is null;
    if not found then raise exception 'NO_PULL'; end if;
  end if;

  for k in select jsonb_array_elements_text(case when jsonb_typeof(p_ops->'consume') = 'array' then p_ops->'consume' else '[]'::jsonb end) loop
    update pulls set claimed_at = now() where nonce = k::uuid and user_id = p_user and claimed_at is null;
    if not found then raise exception 'NO_PULL'; end if;
  end loop;

  if d_coins <> 0 or d_ink <> 0 then
    insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
    begin
      update wallets set coins = coins + d_coins, ink = ink + d_ink, updated_at = now()
        where user_id = p_user returning * into w;
    exception when check_violation then
      raise exception 'INSUFFICIENT_FUNDS';
    end;
  else
    select * into w from wallets where user_id = p_user;
    if not found then
      insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
      select * into w from wallets where user_id = p_user;
    end if;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'inventory', '[]'::jsonb)) loop
    n := coalesce((item->>'delta')::integer, 0);
    if n > 0 then
      insert into inventory (user_id, spec_id, spec, count)
        values (p_user, item->>'spec_id', item->'spec', n)
        on conflict (user_id, spec_id) do update set count = inventory.count + n;
    elsif n < 0 then
      select count into cur from inventory
        where user_id = p_user and spec_id = item->>'spec_id' for update;
      if cur is null or cur < -n then raise exception 'NOT_HELD'; end if;
      if cur = -n then
        delete from inventory where user_id = p_user and spec_id = item->>'spec_id';
      else
        update inventory set count = count + n where user_id = p_user and spec_id = item->>'spec_id';
      end if;
    end if;
  end loop;

  touched := array(
    select distinct x->>'key'
      from jsonb_array_elements(coalesce(p_ops->'remove', '[]'::jsonb) || coalesce(p_ops->'add', '[]'::jsonb)) x
      where x->>'key' is not null);
  if cardinality(touched) > 0 then
    select coalesce(sum(copies), 0)::bigint, count(*)::integer, coalesce(sum(public.card_value(price, rarity_id, copies, prints)), 0)::bigint
      into b_n, b_u, b_v from cards where user_id = p_user and article_key = any(touched);
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'remove', '[]'::jsonb)) loop
    removed := removed || public.econ_take_card(p_user, item->>'key', coalesce((item->>'copies')::integer, 1),
      coalesce((item->>'force')::boolean, false), nullif(item->>'rarityId', ''));
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'add', '[]'::jsonb)) loop
    perform public.econ_give_card(p_user, item);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_ops->'patch', '[]'::jsonb)) loop
    update cards set
        data     = case when item ? 'data' then cards.data || (item->'data') else cards.data end,
        title    = coalesce(item->>'title', cards.title),
        favorite = coalesce((item->>'favorite')::boolean, cards.favorite),
        last_at  = now()
      where user_id = p_user and article_key = item->>'key';
  end loop;

  if cardinality(touched) > 0 then
    select coalesce(sum(copies), 0)::bigint, count(*)::integer, coalesce(sum(public.card_value(price, rarity_id, copies, prints)), 0)::bigint
      into a_n, a_u, a_v from cards where user_id = p_user and article_key = any(touched);
  end if;

  if p_ops ? 'state' or a_n <> b_n or a_u <> b_u or a_v <> b_v then
    insert into econ (user_id, state, n_cards, n_unique, n_value)
      values (p_user, coalesce(p_ops->'state', '{}'::jsonb), a_n - b_n, a_u - b_u, a_v - b_v)
      on conflict (user_id) do update set state = econ.state || excluded.state,
        n_cards = econ.n_cards + excluded.n_cards, n_unique = econ.n_unique + excluded.n_unique,
        n_value = econ.n_value + excluded.n_value, updated_at = now();
  end if;

  if p_ops ? 'pull' then
    insert into codex (key, title, rarity, price, views, thumbnail, lang, found_by)
    select a->>'key', left(coalesce(a->>'title', a->>'key'), 300), a->>'rarityId',
           case when jsonb_typeof(a->'price') = 'number' then least((a->>'price')::numeric, 2000000000)::integer end,
           case when jsonb_typeof(a->'data'->'views') = 'number' then (a->'data'->>'views')::numeric::bigint end,
           left(a->'data'->>'thumbnail', 2000), left(a->>'lang', 12), p_user
      from jsonb_array_elements(coalesce(p_ops->'add', '[]'::jsonb)) a
      where a->>'key' is not null and coalesce(a->>'packId', '') !~ '^(custom|code)\|'
    on conflict (key) do nothing;
  end if;

  if p_ops ? 'score' then
    perform public.econ_score(p_user, p_ops->'score');
  end if;

  if (d_coins <> 0 or d_ink <> 0 or p_ops ? 'kind')
     and not (coalesce(p_ops->>'kind', '') = 'open' and d_coins = 0 and d_ink = 0) then
    insert into ledger (user_id, kind, coins, ink, reason, detail)
      values (p_user, coalesce(p_ops->>'kind', 'change'), d_coins, d_ink, p_ops->>'reason', p_ops->'detail');
  end if;

  if a_n <> b_n or a_u <> b_u or a_v <> b_v
     or (jsonb_typeof(p_ops->'state') = 'object' and (p_ops->'state') ?| array['progress', 'boostersOpened', 'rarityCounts']) then
    update profiles set cards = cards where id = p_user;
  end if;

  perform set_config('wikster.tally', '', true);
  return jsonb_build_object('coins', coalesce(w.coins, 0), 'ink', coalesce(w.ink, 0), 'removed', removed,
    'fresh', jsonb_build_object(
      'state', coalesce((select e.state from econ e where e.user_id = p_user), '{}'::jsonb),
      'inventory', coalesce((select jsonb_object_agg(i.spec_id, jsonb_build_object('spec', i.spec, 'count', i.count)) from inventory i where i.user_id = p_user), '{}'::jsonb),
      'cards', coalesce((select jsonb_agg(public.econ_card_json(c))
        from cards c where c.user_id = p_user and c.article_key in (select jsonb_array_elements_text(coalesce(p_ops->'keys', '[]'::jsonb)))), '[]'::jsonb)));
end $$;
revoke all on function public.econ_apply(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.econ_apply(uuid, jsonb) to service_role;

create or replace function public.econ_load(p_user uuid, p_bucket text default null, p_max integer default 150,
  p_keys text[] default null, p_pull uuid default null, p_since timestamptz default null, p_weight integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pl     pulls;
  want   text[] := coalesce(p_keys, '{}'::text[]);
  w      timestamptz;
  c      integer;
  result jsonb;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  if p_bucket is not null and not public.is_control_admin(p_user) then
    w := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
    insert into rate_counters (user_id, bucket, window_start, n)
      values (p_user, p_bucket, w, greatest(1, least(coalesce(p_weight, 1), 50)))
      on conflict (user_id, bucket, window_start) do update set n = rate_counters.n + excluded.n
      returning n into c;
    if c > p_max then raise exception 'SLOW_DOWN'; end if;
  end if;
  if p_pull is not null then
    select * into pl from pulls where nonce = p_pull and user_id = p_user;
    if pl.nonce is not null then
      want := want || array(select coalesce(x->'article'->>'key', x->>'k') from jsonb_array_elements(pl.cards) x
        where coalesce(x->'article'->>'key', x->>'k') is not null);
    end if;
  end if;
  result := jsonb_build_object(
    'wallet', coalesce((select jsonb_build_object('coins', w2.coins, 'ink', w2.ink) from wallets w2 where w2.user_id = p_user), jsonb_build_object('coins', 0, 'ink', 0)),
    'state', coalesce((select e.state from econ e where e.user_id = p_user), '{}'::jsonb),
    'inventory', coalesce((select jsonb_object_agg(i.spec_id, jsonb_build_object('spec', i.spec, 'count', i.count)) from inventory i where i.user_id = p_user), '{}'::jsonb),
    'custom', coalesce((select jsonb_agg(jsonb_build_object('def', k.def) order by k.created_at) from custom_packs k where k.user_id = p_user), '[]'::jsonb),
    'cutover', (select extract(epoch from m.cutover_at) * 1000 from migration m limit 1),
    'born', (select extract(epoch from u.created_at) * 1000 from auth.users u where u.id = p_user));
  if cardinality(want) > 0 then
    result := result || jsonb_build_object('keys', to_jsonb(want), 'cards', coalesce((select jsonb_agg(public.econ_card_json(c2))
      from cards c2 where c2.user_id = p_user and c2.article_key = any(want)), '[]'::jsonb));
  end if;
  if p_pull is not null then
    result := result || jsonb_build_object('pull', case when pl.nonce is null then null else jsonb_build_object(
      'nonce', pl.nonce, 'spec_id', pl.spec_id, 'spec', pl.spec, 'cards', pl.cards, 'claimed', pl.claimed_at is not null,
      'first', (select f.nonce from pulls f where f.user_id = p_user and f.spec_id = pl.spec_id and f.claimed_at is null
                  order by f.at, f.nonce limit 1)) end);
  end if;
  if p_since is not null then
    result := result || jsonb_build_object('since', jsonb_build_object(
      'cards', coalesce((select jsonb_agg(public.econ_card_json(c3))
        from cards c3 where c3.user_id = p_user and c3.last_at > p_since), '[]'::jsonb),
      'gone', coalesce((select jsonb_agg(g.article_key) from cards_gone g
        where g.user_id = p_user and g.at > p_since
          and not exists (select 1 from cards c4 where c4.user_id = p_user and c4.article_key = g.article_key)), '[]'::jsonb)));
  end if;
  return result;
end $$;
revoke all on function public.econ_load(uuid, text, integer, text[], uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.econ_load(uuid, text, integer, text[], uuid, timestamptz, integer) to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'rarity_bonus(text)', 'card_prints(text, integer, jsonb)', 'prints_best(jsonb)', 'prints_add(jsonb, jsonb)',
    'print_price(bigint, text, text)', 'card_value(bigint, text, integer, jsonb)', 'econ_card_json(cards)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

update public.econ e set n_value = s.v
  from (select c.user_id, sum(public.card_value(c.price, c.rarity_id, c.copies, c.prints))::bigint v
          from public.cards c group by c.user_id) s
  where s.user_id = e.user_id and e.n_value is distinct from s.v;

update public.cards c set
    rarity_id = case when c.rarity_id = 'artifact' then 'prismatic' else c.rarity_id end,
    prints = case when jsonb_typeof(c.prints) = 'object' and c.prints ? 'artifact'
      then (c.prints - 'artifact') || jsonb_build_object('prismatic', coalesce((c.prints->>'prismatic')::integer, 0) + coalesce((c.prints->>'artifact')::integer, 0))
      else c.prints end
  where c.rarity_id = 'artifact' or (jsonb_typeof(c.prints) = 'object' and c.prints ? 'artifact');

notify pgrst, 'reload schema';

-- claims
create table if not exists public.schema_marks (
  id text primary key,
  at timestamptz not null default now()
);
alter table public.schema_marks enable row level security;
revoke all on public.schema_marks from anon, authenticated;

create or replace function public.claims_stipend_hourly()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into schema_marks (id) values ('stipend-hourly') on conflict do nothing;
  if not found then return false; end if;
  update tuning set value = to_jsonb(greatest(0, round(((value #>> '{}')::numeric) / 2))::integer), updated_at = now()
    where key = 'stipend.amount' and (value #>> '{}') ~ '^-?[0-9.]+$';
  update tuning set value = to_jsonb(least(48, greatest(0, round(((value #>> '{}')::numeric) * 2)))::integer), updated_at = now()
    where key = 'stipend.maxBanked' and (value #>> '{}') ~ '^-?[0-9.]+$';
  return true;
end $$;
revoke all on function public.claims_stipend_hourly() from public, anon, authenticated;
select public.claims_stipend_hourly();

insert into public.tuning_keys (key, kind, def, lo, hi, about) values
  ('stipend.amount', 'int', '250', 0, 20000, 'Coins paid for every one hour shop window'),
  ('stipend.maxBanked', 'int', '8', 0, 48, 'Hourly stipend windows that can pile up while away')
on conflict (key) do update set kind = excluded.kind, def = excluded.def, lo = excluded.lo, hi = excluded.hi, about = excluded.about;

create or replace function public.record_ad_reward(p_tx text, p_user uuid, p_reward text, p_cap integer, p_grant jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  today integer;
  inserted text;
begin
  if not exists (select 1 from auth.users where id = p_user) then return 'unknown'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ad-reward:' || p_user::text, 0));
  select count(*) into today from ad_rewards
    where user_id = p_user and paid and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  insert into ad_rewards (transaction_id, user_id, reward, paid)
    values (p_tx, p_user, p_reward, today < p_cap)
    on conflict (transaction_id) do nothing
    returning transaction_id into inserted;
  if inserted is null then return 'already'; end if;
  if today >= p_cap then return 'capped'; end if;
  insert into grants (user_id, kind, payload, note_en, note_fr)
    values (p_user, p_grant->>'kind', coalesce(p_grant->'payload', '{}'::jsonb), coalesce(p_grant->>'note_en', ''), coalesce(p_grant->>'note_fr', ''));
  return 'paid';
end $$;
revoke all on function public.record_ad_reward(text, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.record_ad_reward(text, uuid, text, integer, jsonb) to service_role;

-- social
create or replace function public.my_conversations(p_limit integer default 30, p_before timestamptz default null)
returns table (other uuid, last_id uuid, last_sender uuid, last_body text, last_at timestamptz, last_read_at timestamptz, unread integer)
language sql stable security invoker set search_path = public as $$
  with me as (select auth.uid() as id),
  pals as (
    select case when f.requester = me.id then f.addressee else f.requester end as other
      from friendships f, me
      where f.status = 'accepted' and me.id in (f.requester, f.addressee)
  )
  select p.other, m.id, m.sender, m.body, m.created_at, m.read_at,
    (select count(*)::integer from messages u
      where u.recipient = (select id from me) and u.sender = p.other and u.read_at is null)
    from pals p
    cross join me
    cross join lateral (
      select x.id, x.sender, x.body, x.created_at, x.read_at from messages x
        where least(x.sender, x.recipient) = least(me.id, p.other)
          and greatest(x.sender, x.recipient) = greatest(me.id, p.other)
        order by x.created_at desc
        limit 1
    ) m
    where p_before is null or m.created_at < p_before
    order by m.created_at desc, p.other
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
revoke all on function public.my_conversations(integer, timestamptz) from public, anon;
grant execute on function public.my_conversations(integer, timestamptz) to authenticated;

create or replace function public.live_read()
returns trigger language plpgsql security definer set search_path = public as $$
declare x record; pay jsonb;
begin
  begin
    for x in
      select f.sender, f.recipient, max(f.read_at) as read_at, max(f.created_at) as created_at,
        (array_agg(f.id order by f.created_at desc))[1] as id
      from live_fresh f join live_stale s on s.id = f.id
      where f.read_at is not null and s.read_at is null
      group by f.sender, f.recipient
    loop
      pay := jsonb_build_object('type', 'UPDATE', 'row', jsonb_build_object(
        'id', x.id, 'sender', x.sender, 'recipient', x.recipient, 'read_at', x.read_at, 'created_at', x.created_at));
      perform live_send('user:' || x.sender, 'read', pay);
      perform live_send('user:' || x.recipient, 'seen', pay);
    end loop;
  exception when others then
    raise warning 'live_read: %', sqlerrm;
  end;
  return null;
end $$;

create or replace function public.live_invite_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform live_send('user:' || old.invitee, 'guild-invite', jsonb_build_object('type', 'DELETE',
      'row', jsonb_build_object('id', old.id, 'guild_id', old.guild_id, 'invitee', old.invitee)));
  exception when others then
    raise warning 'live_invite_gone: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.live_invite_gone() from public, anon, authenticated;
drop trigger if exists live_gone on public.guild_invites;
create trigger live_gone after delete on public.guild_invites for each row execute function public.live_invite_gone();

-- market
alter table public.auctions add column if not exists rarity text;
alter table public.auctions add column if not exists title text;
alter table public.auctions add column if not exists theme text;
alter table public.auctions add column if not exists buyout integer;
alter table public.auctions add column if not exists fee_pct numeric not null default 5;
alter table public.auctions add column if not exists minutes integer;
alter table public.auctions add column if not exists outcome text;
alter table public.auctions add column if not exists settled_at timestamptz;
alter table public.auctions add column if not exists fee integer;
alter table public.auctions add column if not exists paid integer;
alter table public.auctions add column if not exists updated_at timestamptz not null default now();

alter table public.auctions drop constraint if exists auctions_outcome_check;
alter table public.auctions add constraint auctions_outcome_check
  check (outcome is null or outcome in ('sold', 'bought', 'unsold', 'cancelled', 'pulled'));
alter table public.auctions drop constraint if exists auctions_buyout_check;
alter table public.auctions add constraint auctions_buyout_check check (buyout is null or buyout between 1 and 1000000);

create or replace function public.market_theme(p_pack text)
returns text language sql immutable set search_path = public as $$
  select case when split_part(coalesce(p_pack, ''), '|', 1) = 'theme' and split_part(p_pack, '|', 2) not in ('', 'any')
    then left(split_part(p_pack, '|', 2), 60) end;
$$;

update public.auctions set
    rarity = coalesce(card->>'rarityId', 'common'),
    title = left(coalesce(card->>'title', card->>'key', ''), 300),
    theme = public.market_theme(card->>'packId'),
    minutes = coalesce(minutes, greatest(1, round(extract(epoch from ends_at - created_at) / 60))::integer)
  where rarity is null;
update public.auctions set
    outcome = case when status = 'cancelled' then 'cancelled' when bidder is not null then 'sold' else 'unsold' end,
    settled_at = coalesce(settled_at, ends_at)
  where status <> 'open' and outcome is null;

create index if not exists auctions_live_idx on public.auctions (ends_at) where status = 'open';
create index if not exists auctions_bidder_idx on public.auctions (bidder);
create index if not exists auctions_sales_idx on public.auctions ((card->>'key'), settled_at desc) where outcome in ('sold', 'bought');

create table if not exists public.auction_bids (
  id          bigserial primary key,
  auction     uuid not null references public.auctions on delete cascade,
  bidder      uuid references auth.users on delete set null,
  bidder_name text not null default '',
  amount      integer not null check (amount > 0),
  buyout      boolean not null default false,
  at          timestamptz not null default now()
);
create index if not exists auction_bids_lot_idx on public.auction_bids (auction, id desc);
create index if not exists auction_bids_bidder_idx on public.auction_bids (bidder, at desc);
alter table public.auction_bids enable row level security;
revoke all on public.auction_bids from anon, authenticated;

insert into public.auction_bids (auction, bidder, bidder_name, amount, at)
  select a.id, a.bidder, coalesce(a.bidder_name, ''), a.current_bid, a.created_at from public.auctions a
  where a.status = 'open' and a.bidder is not null and coalesce(a.current_bid, 0) > 0
    and not exists (select 1 from public.auction_bids b where b.auction = a.id);

insert into public.tuning_keys (key, kind, def, lo, hi, about) values
  ('market.fee', 'number', '5', 0, 25, 'Auction House fee in percent, kept from the final price when a lot sells'),
  ('market.step', 'number', '5', 1, 50, 'Smallest raise over the current bid at the Auction House, in percent'),
  ('market.maxLots', 'int', '20', 1, 100, 'Lots one player can have open at the Auction House at once')
on conflict (key) do update set kind = excluded.kind, def = excluded.def, lo = excluded.lo, hi = excluded.hi, about = excluded.about;

create or replace function public.market_tune(p_key text, p_def numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v jsonb; k tuning_keys;
begin
  select * into k from tuning_keys where key = p_key;
  select value into v from tuning where key = p_key;
  if v is null or jsonb_typeof(v) <> 'number' then
    if k.key is not null and jsonb_typeof(k.def) = 'number' then return (k.def #>> '{}')::numeric; end if;
    return p_def;
  end if;
  return least(greatest((v #>> '{}')::numeric, coalesce(k.lo, (v #>> '{}')::numeric)), coalesce(k.hi, (v #>> '{}')::numeric));
end $$;

create or replace function public.market_floor(p_bid integer, p_start integer)
returns integer language sql stable security definer set search_path = public as $$
  select case when p_bid is null then p_start
    else p_bid + greatest(1, ceil(p_bid * public.market_tune('market.step', 5) / 100.0))::integer end;
$$;

create or replace function public.auction_floor(a public.auctions)
returns integer language sql stable security definer set search_path = public as $$
  select public.market_floor(a.current_bid, a.start_price);
$$;

create or replace function public.market_row(a public.auctions, p_me uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when a.id is null then null else jsonb_build_object(
    'id', a.id, 'seller', a.seller, 'seller_name', a.seller_name, 'card', a.card - 'extract' - 'favorite',
    'rarity', coalesce(a.rarity, a.card->>'rarityId', 'common'), 'title', coalesce(a.title, a.card->>'title'),
    'start_price', a.start_price, 'current_bid', a.current_bid, 'buyout', a.buyout,
    'bidder', a.bidder, 'bidder_name', a.bidder_name, 'bid_count', a.bid_count,
    'floor', public.market_floor(a.current_bid, a.start_price), 'fee_pct', a.fee_pct,
    'ends_at', a.ends_at, 'created_at', a.created_at, 'status', a.status, 'outcome', a.outcome,
    'settled_at', a.settled_at, 'fee', a.fee, 'paid', a.paid,
    'mine', p_me is not null and a.seller = p_me, 'leading', p_me is not null and a.bidder = p_me) end;
$$;

create or replace function public.market_pay(p_user uuid, p_amount bigint, p_reason text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or coalesce(p_amount, 0) <= 0 then return; end if;
  if not exists (select 1 from auth.users where id = p_user) then return; end if;
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  update wallets set coins = coins + p_amount, updated_at = now() where user_id = p_user;
  insert into ledger (user_id, kind, coins, ink, reason, detail) values (p_user, 'market', p_amount, 0, p_reason, p_detail);
end $$;

create or replace function public.market_tell(p_user uuid, p_kind text, a public.auctions)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  perform public.live_send('user:' || p_user, 'lot', jsonb_build_object('kind', p_kind, 'id', a.id,
    'title', coalesce(a.title, a.card->>'title'), 'rarity', coalesce(a.rarity, a.card->>'rarityId'),
    'key', a.card->>'key', 'amount', coalesce(a.current_bid, a.start_price), 'paid', a.paid, 'fee', a.fee));
  if p_kind in ('outbid', 'won', 'sold') then
    perform public.push_notify(p_user, p_kind, null, a.id::text);
  end if;
exception when others then
  raise warning 'market_tell %: %', p_kind, sqlerrm;
end $$;

create or replace function public.market_close(p_id uuid, p_outcome text default null)
returns public.auctions language plpgsql security definer set search_path = public as $$
declare a auctions; v_fee integer; v_paid integer;
begin
  select * into a from auctions where id = p_id for update;
  if a.id is null or a.status <> 'open' then return a; end if;
  if a.ends_at > now() and p_outcome is distinct from 'bought' then return a; end if;
  if a.bidder is not null and coalesce(a.current_bid, 0) > 0 then
    v_fee := least(a.current_bid, ceil(a.current_bid * coalesce(a.fee_pct, 5) / 100.0)::integer);
    v_paid := a.current_bid - v_fee;
    perform public.econ_give_card(a.bidder, public.econ_card_of(a.card), 'auction');
    perform public.market_pay(a.seller, v_paid, 'sale', jsonb_build_object('auction', a.id, 'title', a.title,
      'price', a.current_bid, 'fee', v_fee));
    update auctions set status = 'settled', outcome = coalesce(p_outcome, 'sold'), settled_at = now(),
        ends_at = least(ends_at, now()), fee = v_fee, paid = v_paid, updated_at = now()
      where id = a.id returning * into a;
    perform public.market_tell(a.bidder, 'won', a);
    perform public.market_tell(a.seller, 'sold', a);
  else
    perform public.econ_give_card(a.seller, public.econ_card_of(a.card), 'auction');
    update auctions set status = 'settled', outcome = 'unsold', settled_at = now(), fee = 0, paid = 0, updated_at = now()
      where id = a.id returning * into a;
    perform public.market_tell(a.seller, 'expired', a);
  end if;
  return a;
end $$;

create or replace function public.market_sweep(p_max integer default 50)
returns integer language plpgsql security definer set search_path = public as $$
declare lot uuid; n integer := 0;
begin
  for lot in select id from auctions where status = 'open' and ends_at <= now()
      order by ends_at limit greatest(1, least(coalesce(p_max, 50), 500)) for update skip locked loop
    perform public.market_close(lot);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.market_lock_wallets(p_users uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from wallets where user_id = any(p_users) order by user_id for update;
end $$;

create or replace function public.econ_market_list(p_user uuid, p_key text, p_rarity text, p_start integer,
  p_buyout integer default null, p_minutes integer default 1440)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n integer; v_card jsonb; a auctions;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  perform public.rate_limit(p_user, 'market', 40, 60);
  if p_minutes is null or p_minutes not in (60, 360, 1440, 4320) then raise exception 'BAD_DURATION'; end if;
  if p_start is null or p_start < 1 or p_start > 1000000 then raise exception 'BAD_PRICE'; end if;
  if p_buyout is not null and (p_buyout < p_start or p_buyout > 1000000) then raise exception 'BAD_BUYOUT'; end if;
  perform pg_advisory_xact_lock(hashtext('market:' || p_user::text));
  select count(*) into n from auctions where seller = p_user and status = 'open';
  if n >= public.market_tune('market.maxLots', 20) then raise exception 'TOO_MANY'; end if;
  v_card := public.econ_entry_of(public.econ_take_card(p_user, p_key, 1, false, nullif(btrim(coalesce(p_rarity, '')), '')));
  insert into auctions (seller, seller_name, card, start_price, buyout, ends_at, minutes, rarity, title, theme, fee_pct)
  values (p_user, coalesce((select username from profiles where id = p_user), ''), v_card, p_start, p_buyout,
          now() + make_interval(mins => p_minutes), p_minutes, coalesce(v_card->>'rarityId', 'common'),
          left(coalesce(v_card->>'title', p_key), 300), public.market_theme(v_card->>'packId'), public.market_tune('market.fee', 5))
  returning * into a;
  insert into ledger (user_id, kind, coins, ink, reason, detail)
    values (p_user, 'market', 0, 0, 'list', jsonb_build_object('auction', a.id, 'key', p_key, 'rarity', a.rarity));
  return jsonb_build_object('ok', true, 'lot', public.market_row(a, p_user));
end $$;

create or replace function public.econ_market_bid(p_user uuid, p_id uuid, p_amount integer default null, p_buyout boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a auctions; v_amount integer; v_buy boolean := false; v_prev uuid; v_prev_bid integer; v_name text;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  if public.is_suspended(p_user) then raise exception 'SUSPENDED'; end if;
  perform public.rate_limit(p_user, 'market', 40, 60);
  select * into a from auctions where id = p_id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status <> 'open' then return jsonb_build_object('error', 'ENDED', 'lot', public.market_row(a, p_user)); end if;
  if a.ends_at <= now() then
    a := public.market_close(a.id);
    return jsonb_build_object('error', 'ENDED', 'lot', public.market_row(a, p_user));
  end if;
  if a.seller = p_user then raise exception 'OWN_AUCTION'; end if;
  if a.bidder = p_user then raise exception 'LEADING'; end if;
  if coalesce(p_buyout, false) then
    if a.buyout is null or coalesce(a.current_bid, 0) >= a.buyout then raise exception 'NO_BUYOUT'; end if;
    v_amount := a.buyout;
    v_buy := true;
  else
    if p_amount is null or p_amount < public.market_floor(a.current_bid, a.start_price) then
      return jsonb_build_object('error', 'TOO_LOW', 'lot', public.market_row(a, p_user));
    end if;
    if p_amount > 1000000000 then raise exception 'BAD_AMOUNT'; end if;
    v_amount := p_amount;
    if a.buyout is not null and v_amount >= a.buyout and coalesce(a.current_bid, 0) < a.buyout then
      v_amount := a.buyout;
      v_buy := true;
    end if;
  end if;
  v_prev := a.bidder;
  v_prev_bid := a.current_bid;
  perform public.market_lock_wallets(array_remove(array[p_user, v_prev, a.seller], null));
  update wallets set coins = coins - v_amount, updated_at = now() where user_id = p_user and coins >= v_amount;
  if not found then raise exception 'INSUFFICIENT_FUNDS'; end if;
  insert into ledger (user_id, kind, coins, ink, reason, detail)
    values (p_user, 'market', -v_amount, 0, case when v_buy then 'buyout' else 'bid' end,
            jsonb_build_object('auction', a.id, 'title', a.title));
  if v_prev is not null and coalesce(v_prev_bid, 0) > 0 then
    perform public.market_pay(v_prev, v_prev_bid, 'refund', jsonb_build_object('auction', a.id, 'title', a.title));
  end if;
  v_name := coalesce((select username from profiles where id = p_user), '');
  insert into auction_bids (auction, bidder, bidder_name, amount, buyout) values (a.id, p_user, v_name, v_amount, v_buy);
  update auctions set current_bid = v_amount, bidder = p_user, bidder_name = v_name, bid_count = bid_count + 1,
      ends_at = case when not v_buy and ends_at - now() < interval '60 seconds' then now() + interval '60 seconds' else ends_at end,
      updated_at = now()
    where id = a.id returning * into a;
  if v_prev is not null then perform public.market_tell(v_prev, 'outbid', a); end if;
  if v_buy then a := public.market_close(a.id, 'bought'); end if;
  return jsonb_build_object('ok', true, 'lot', public.market_row(a, p_user), 'bought', v_buy, 'paid', v_amount);
end $$;

create or replace function public.econ_market_cancel(p_user uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a auctions;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  perform public.rate_limit(p_user, 'market', 40, 60);
  select * into a from auctions where id = p_id for update;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.seller <> p_user then raise exception 'NOT_YOURS'; end if;
  if a.status <> 'open' then return jsonb_build_object('error', 'ENDED', 'lot', public.market_row(a, p_user)); end if;
  if a.ends_at <= now() then
    a := public.market_close(a.id);
    return jsonb_build_object('error', 'ENDED', 'lot', public.market_row(a, p_user));
  end if;
  if a.bidder is not null then raise exception 'HAS_BIDS'; end if;
  perform public.econ_give_card(p_user, public.econ_card_of(a.card), 'auction');
  update auctions set status = 'cancelled', outcome = 'cancelled', settled_at = now(), updated_at = now()
    where id = a.id returning * into a;
  insert into ledger (user_id, kind, coins, ink, reason, detail)
    values (p_user, 'market', 0, 0, 'cancel', jsonb_build_object('auction', a.id, 'key', a.card->>'key'));
  return jsonb_build_object('ok', true, 'lot', public.market_row(a, p_user));
end $$;

create or replace function public.econ_auction_create(p_user uuid, p_key text, p_price integer, p_minutes integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.econ_market_list(p_user, p_key, null, p_price, null,
    case when coalesce(p_minutes, 0) <= 60 then 60 when p_minutes <= 360 then 360 when p_minutes <= 1440 then 1440 else 4320 end);
  return (select to_jsonb(a) from auctions a where a.id = (r->'lot'->>'id')::uuid);
end $$;

create or replace function public.econ_auction_bid(p_user uuid, p_id uuid, p_amount integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.econ_market_bid(p_user, p_id, p_amount, false);
  if r ? 'error' then raise exception '%', r->>'error'; end if;
  return (select to_jsonb(a) from auctions a where a.id = p_id);
end $$;

create or replace function public.econ_auction_cancel(p_user uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.econ_market_cancel(p_user, p_id);
  if r ? 'error' then raise exception '%', r->>'error'; end if;
  return (select to_jsonb(a) from auctions a where a.id = p_id);
end $$;

create or replace function public.settle_auction(auction uuid)
returns public.auctions language plpgsql security definer set search_path = public as $$
declare a public.auctions;
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = auction;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status = 'open' and now() < a.ends_at then raise exception 'NOT_OVER'; end if;
  return public.market_close(auction);
end $$;

create or replace function public.market_like(p text)
returns text language sql immutable as $$
  select '%' || replace(replace(replace(lower(coalesce(p, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create or replace function public.market_browse(p_filter jsonb default '{}'::jsonb, p_sort text default 'ending',
  p_limit integer default 24, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  lim integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_q text;
  v_rar text[];
  v_theme text;
  v_min bigint;
  v_max bigint;
  v_buy boolean := false;
  v_soon boolean := false;
  v_fresh boolean := false;
  v_others boolean := false;
  v_sort text := coalesce(p_sort, 'ending');
begin
  if me is null then raise exception 'AUTH'; end if;
  perform public.market_sweep(10);
  begin
    if jsonb_typeof(f->'q') = 'string' then v_q := nullif(left(btrim(f->>'q'), 80), ''); end if;
    if jsonb_typeof(f->'rarity') = 'string' then v_rar := array[f->>'rarity'];
    elsif jsonb_typeof(f->'rarity') = 'array' then v_rar := array(select jsonb_array_elements_text(f->'rarity'));
      if cardinality(v_rar) = 0 then v_rar := null; end if;
    end if;
    if jsonb_typeof(f->'theme') = 'string' then v_theme := nullif(f->>'theme', ''); end if;
    if jsonb_typeof(f->'min') = 'number' then v_min := (f->>'min')::numeric; end if;
    if jsonb_typeof(f->'max') = 'number' then v_max := (f->>'max')::numeric; end if;
    v_buy := coalesce((f->>'buyout')::boolean, false);
    v_soon := coalesce((f->>'soon')::boolean, false);
    v_fresh := coalesce((f->>'fresh')::boolean, false);
    v_others := coalesce((f->>'others')::boolean, false);
  exception when others then
    raise exception 'BAD_FILTER';
  end;
  if v_sort not in ('ending', 'newest', 'price', 'price_desc', 'bids') then v_sort := 'ending'; end if;
  return (with m as materialized (
      select a.* from auctions a
      where a.status = 'open' and a.ends_at > now()
        and (v_rar is null or coalesce(a.rarity, a.card->>'rarityId', 'common') = any(v_rar))
        and (v_theme is null or coalesce(a.theme, 'wild') = v_theme)
        and (v_min is null or coalesce(a.current_bid, a.start_price) >= v_min)
        and (v_max is null or coalesce(a.current_bid, a.start_price) <= v_max)
        and (not v_buy or (a.buyout is not null and coalesce(a.current_bid, 0) < a.buyout))
        and (not v_soon or a.ends_at <= now() + interval '1 hour')
        and (not v_fresh or a.created_at >= now() - interval '1 hour')
        and (not v_others or a.seller <> me)
        and (v_q is null or lower(coalesce(a.title, a.card->>'title', '')) like public.market_like(v_q)))
    select jsonb_build_object('total', (select count(*) from m), 'now', now(),
      'rows', coalesce((select jsonb_agg(public.market_row(y, me) order by x.o1, x.o2, x.id) from (
        select m.id,
          case v_sort when 'ending' then extract(epoch from m.ends_at)
            when 'newest' then -extract(epoch from m.created_at)
            when 'price' then coalesce(m.current_bid, m.start_price)::numeric
            when 'price_desc' then -coalesce(m.current_bid, m.start_price)::numeric
            else -m.bid_count::numeric end as o1,
          extract(epoch from m.ends_at) as o2
        from m order by o1, o2, m.id limit lim offset off) x join auctions y on y.id = x.id), '[]'::jsonb)));
end $$;

create or replace function public.market_lot(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a auctions;
begin
  if me is null then raise exception 'AUTH'; end if;
  select * into a from auctions where id = p_id;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  if a.status = 'open' and a.ends_at <= now() then a := public.market_close(p_id); end if;
  return public.market_row(a, me) || jsonb_build_object('card', a.card, 'now', now(),
    'bids', coalesce((select jsonb_agg(jsonb_build_object('name', b.bidder_name, 'amount', b.amount, 'buyout', b.buyout,
        'at', b.at, 'me', b.bidder = me) order by b.id desc)
      from (select * from auction_bids where auction = a.id order by id desc limit 20) b), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('price', s.current_bid, 'rarity', s.rarity, 'at', s.settled_at) order by s.settled_at desc)
      from (select * from auctions where card->>'key' = a.card->>'key' and outcome in ('sold', 'bought') and id <> a.id
        order by settled_at desc limit 5) s), '[]'::jsonb));
end $$;

create or replace function public.market_mine(p_view text default 'selling', p_limit integer default 30, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lim integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_view text := coalesce(p_view, 'selling');
begin
  if me is null then raise exception 'AUTH'; end if;
  if v_view not in ('selling', 'bidding', 'history') then raise exception 'BAD_VIEW'; end if;
  perform public.market_sweep(10);
  return (with m as materialized (
      select a.*, case
          when a.status = 'open' then case when a.seller = me then 'selling' when a.bidder = me then 'leading' else 'outbid' end
          when a.seller = me then case a.outcome when 'sold' then 'sold' when 'bought' then 'sold' when 'unsold' then 'expired'
            else coalesce(a.outcome, 'cancelled') end
          when a.bidder = me and a.outcome in ('sold', 'bought') then 'won'
          else 'lost' end as role
      from auctions a
      where case v_view
        when 'selling' then a.seller = me and a.status = 'open'
        when 'bidding' then a.status = 'open' and a.seller <> me
          and (a.bidder = me or exists (select 1 from auction_bids b where b.auction = a.id and b.bidder = me))
        else a.status <> 'open' and (a.seller = me or a.bidder = me
          or exists (select 1 from auction_bids b where b.auction = a.id and b.bidder = me)) end)
    select jsonb_build_object('total', (select count(*) from m), 'now', now(),
      'counts', jsonb_build_object(
        'selling', (select count(*) from auctions where seller = me and status = 'open'),
        'leading', (select count(*) from auctions where bidder = me and status = 'open'),
        'outbid', (select count(*) from auctions a where a.status = 'open' and a.seller <> me and a.bidder is distinct from me
          and exists (select 1 from auction_bids b where b.auction = a.id and b.bidder = me))),
      'rows', coalesce((select jsonb_agg(public.market_row(y, me) || jsonb_build_object('role', x.role) order by x.o1, x.id)
        from (select m.id, m.role, case when v_view = 'history' then -extract(epoch from coalesce(m.settled_at, m.ends_at)) else extract(epoch from m.ends_at) end as o1
          from m order by o1, m.id limit lim offset off) x join auctions y on y.id = x.id), '[]'::jsonb)));
end $$;

create or replace function public.market_prices(p_key text, p_rarity text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'AUTH'; end if;
  return jsonb_build_object(
    'sales', coalesce((select jsonb_agg(jsonb_build_object('price', s.current_bid, 'rarity', s.rarity, 'at', s.settled_at) order by s.settled_at desc)
      from (select * from auctions where card->>'key' = p_key and outcome in ('sold', 'bought')
        and settled_at > now() - interval '60 days' order by settled_at desc limit 8) s), '[]'::jsonb),
    'open', (select min(coalesce(a.current_bid, a.start_price)) from auctions a
      where a.status = 'open' and a.card->>'key' = p_key and (p_rarity is null or a.rarity = p_rarity)));
end $$;

create or replace function public.market_live()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform public.live_send('market', 'auction', jsonb_build_object('type', tg_op, 'row', jsonb_build_object('id', old.id)));
    else
      perform public.live_send('market', 'auction', jsonb_build_object('type', tg_op, 'row', public.market_row(new, null)));
    end if;
  exception when others then
    raise warning 'market_live: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists live_row on public.auctions;
drop trigger if exists market_live on public.auctions;
create trigger market_live after insert or update or delete on public.auctions for each row execute function public.market_live();

create or replace function public.market_gone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'open' and old.bidder is not null and coalesce(old.current_bid, 0) > 0 then
    perform public.market_pay(old.bidder, old.current_bid, 'refund', jsonb_build_object('auction', old.id, 'title', old.title, 'gone', true));
  end if;
  return old;
end $$;

drop trigger if exists market_gone on public.auctions;
create trigger market_gone before delete on public.auctions for each row execute function public.market_gone();

create or replace function public.admin_auction_pull(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare a auctions;
begin
  select * into a from auctions where id = p_id for update;
  if a.id is null or a.status <> 'open' then return false; end if;
  if a.bidder is not null and coalesce(a.current_bid, 0) > 0 then
    perform public.market_pay(a.bidder, a.current_bid, 'refund', jsonb_build_object('auction', a.id, 'title', a.title, 'pulled', true));
    perform public.market_tell(a.bidder, 'refund', a);
    perform live_send('user:' || a.bidder, 'econ', jsonb_build_object('scope', 'wallet'));
  end if;
  perform public.econ_give_card(a.seller, public.econ_card_of(a.card), 'auction');
  update auctions set status = 'cancelled', outcome = 'pulled', settled_at = now(), updated_at = now() where id = a.id returning * into a;
  perform public.market_tell(a.seller, 'pulled', a);
  perform live_send('user:' || a.seller, 'econ', jsonb_build_object('scope', 'cards'));
  return true;
end $$;

create or replace function public.admin_auctions(p_filter jsonb default '{}'::jsonb, p_limit integer default 25, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := case when jsonb_typeof(p_filter) = 'object' then p_filter else '{}'::jsonb end;
  lim integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  off integer := greatest(coalesce(p_offset, 0), 0);
  v_status text := 'open';
  v_seller uuid;
  v_q text;
  v_expired boolean;
begin
  perform public.admin_gate();
  begin
    if jsonb_typeof(f->'status') = 'string' then v_status := f->>'status'; end if;
    if jsonb_typeof(f->'seller') = 'string' then v_seller := (f->>'seller')::uuid; end if;
    if jsonb_typeof(f->'q') = 'string' then v_q := nullif(btrim(f->>'q'), ''); end if;
    if jsonb_typeof(f->'expired') = 'boolean' then v_expired := (f->>'expired')::boolean; end if;
  exception when others then
    raise exception 'BAD_FILTER';
  end;
  if v_status not in ('open', 'settled', 'cancelled', 'all') then raise exception 'BAD_STATUS'; end if;
  return (with m as materialized (
      select a.* from auctions a
      where (v_status = 'all' or a.status = v_status)
        and (v_seller is null or a.seller = v_seller)
        and (v_q is null or lower(coalesce(a.card->>'title', '')) like public.admin_like(v_q) or lower(a.seller_name) like public.admin_like(v_q))
        and (v_expired is null or v_expired = (a.ends_at < now())))
    select jsonb_build_object('total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'seller', x.seller, 'seller_name', x.seller_name, 'card', x.card,
          'start_price', x.start_price, 'current_bid', x.current_bid, 'bidder', x.bidder, 'bidder_name', x.bidder_name,
          'bid_count', x.bid_count, 'ends_at', x.ends_at, 'status', x.status, 'created_at', x.created_at,
          'buyout', x.buyout, 'rarity', x.rarity, 'outcome', x.outcome, 'settled_at', x.settled_at, 'fee', x.fee, 'paid', x.paid)
          order by case when v_status = 'open' then extract(epoch from x.ends_at) else -extract(epoch from x.created_at) end, x.id)
        from (select * from m order by case when v_status = 'open' then extract(epoch from m.ends_at) else -extract(epoch from m.created_at) end, m.id
          limit lim offset off) x), '[]'::jsonb)));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'market_tune(text, numeric)', 'market_floor(integer, integer)', 'market_row(auctions, uuid)', 'market_pay(uuid, bigint, text, jsonb)',
    'market_tell(uuid, text, auctions)', 'market_close(uuid, text)', 'market_sweep(integer)', 'market_lock_wallets(uuid[])',
    'econ_market_list(uuid, text, text, integer, integer, integer)', 'econ_market_bid(uuid, uuid, integer, boolean)',
    'econ_market_cancel(uuid, uuid)', 'econ_auction_create(uuid, text, integer, integer)', 'econ_auction_bid(uuid, uuid, integer)',
    'econ_auction_cancel(uuid, uuid)', 'market_live()', 'market_gone()', 'market_theme(text)', 'market_like(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array[
    'market_browse(jsonb, text, integer, integer)', 'market_lot(uuid)', 'market_mine(text, integer, integer)',
    'market_prices(text, text)', 'settle_auction(uuid)', 'auction_floor(auctions)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

select cron.schedule('wikster-market', '* * * * *', $$select public.market_sweep(200)$$);
select cron.schedule('wikster-market-tidy', '41 3 * * *', $$delete from public.auctions where status <> 'open' and coalesce(settled_at, ends_at) < now() - interval '120 days'$$);

notify pgrst, 'reload schema';

-- settings danger
alter table public.save_meta add column if not exists wiped_at bigint;

do $$
declare v_col smallint;
begin
  select attnum into v_col from pg_attribute where attrelid = 'public.guild_bank'::regclass and attname = 'donor';
  if exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'guild_bank' and column_name = 'donor' and is_nullable = 'NO') then
    alter table public.guild_bank alter column donor drop not null;
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.guild_bank'::regclass and c.contype = 'f'
      and c.conkey = array[v_col] and c.confdeltype = 'n') then
    alter table public.guild_bank drop constraint if exists guild_bank_donor_fkey;
    alter table public.guild_bank add constraint guild_bank_donor_fkey foreign key (donor) references auth.users on delete set null;
  end if;
end $$;

create or replace function public.save_keys_after_wipe()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_at bigint;
begin
  if new.key not in ('wikster.profile.v1', 'wikster.theme') then return new; end if;
  select m.wiped_at into v_at from save_meta m where m.user_id = new.user_id;
  if v_at is not null and new.stamp <= v_at then return null; end if;
  return new;
end $$;
drop trigger if exists save_keys_after_wipe on public.save_keys;
create trigger save_keys_after_wipe before insert or update on public.save_keys
  for each row execute function public.save_keys_after_wipe();

create or replace function public.danger_market_out(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  a auctions;
  n_closed integer := 0;
  n_lots integer := 0;
  n_bids integer := 0;
  n_out integer := 0;
  n_in integer := 0;
  v_left integer;
begin
  for v_id in select id from auctions where status = 'open' and ends_at <= now() and p_user in (seller, bidder) order by ends_at loop
    perform public.market_close(v_id);
    n_closed := n_closed + 1;
  end loop;
  for v_id in select id from auctions where seller = p_user and status = 'open' order by created_at loop
    if public.admin_auction_pull(v_id) then n_lots := n_lots + 1; end if;
  end loop;
  for v_id in select distinct b.auction from auction_bids b join auctions x on x.id = b.auction
      where b.bidder = p_user and x.status = 'open' loop
    select * into a from auctions where id = v_id for update;
    if a.id is null or a.status <> 'open' then continue; end if;
    delete from auction_bids where auction = a.id and bidder = p_user;
    select count(*) into v_left from auction_bids where auction = a.id;
    if a.bidder = p_user then
      perform public.market_pay(p_user, a.current_bid, 'refund', jsonb_build_object('auction', a.id, 'title', a.title, 'withdrawn', true));
      update auctions set bidder = null, bidder_name = null, current_bid = null, bid_count = v_left, updated_at = now() where id = a.id;
    else
      update auctions set bid_count = v_left, updated_at = now() where id = a.id;
    end if;
    n_bids := n_bids + 1;
  end loop;
  for v_id in select id from auctions where bidder = p_user and status = 'open' loop
    select * into a from auctions where id = v_id for update;
    perform public.market_pay(p_user, a.current_bid, 'refund', jsonb_build_object('auction', a.id, 'title', a.title, 'withdrawn', true));
    update auctions set bidder = null, bidder_name = null, current_bid = null,
        bid_count = (select count(*) from auction_bids where auction = a.id), updated_at = now() where id = a.id;
    n_bids := n_bids + 1;
  end loop;
  for v_id in select id from trades where proposer = p_user and status = 'pending' order by created_at loop
    perform public.econ_trade_cancel(p_user, v_id);
    n_out := n_out + 1;
  end loop;
  for v_id in select id from trades where recipient = p_user and status = 'pending' order by created_at loop
    perform public.econ_trade_answer(p_user, v_id, false);
    n_in := n_in + 1;
  end loop;
  return jsonb_build_object('closed', n_closed, 'lots', n_lots, 'bids', n_bids, 'trades_cancelled', n_out, 'trades_declined', n_in);
end $$;

create or replace function public.danger_guild_leave(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_guild uuid; g guilds; left_n integer; heir uuid; v_closed boolean := false;
begin
  select guild_id into v_guild from guild_members where user_id = p_user;
  if v_guild is null then return null; end if;
  select * into g from guilds where id = v_guild for update;
  delete from guild_members where user_id = p_user;
  select count(*) into left_n from guild_members where guild_id = v_guild;
  if left_n = 0 then
    perform public.admin_guild_close(v_guild);
    v_closed := true;
  else
    if g.owner = p_user then
      select user_id into heir from guild_members where guild_id = v_guild order by joined_at asc, user_id limit 1;
    end if;
    update guilds set members = left_n, owner = coalesce(heir, owner) where id = v_guild;
    if heir is not null then
      perform live_send('user:' || heir, 'guild', jsonb_build_object('type', 'owner', 'guild', v_guild));
    end if;
  end if;
  return jsonb_build_object('guild', v_guild, 'closed', v_closed, 'heir', heir);
end $$;

create or replace function public.danger_tell_chats(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_other uuid; v_ids jsonb; n integer := 0;
begin
  for v_other, v_ids in
    select case when m.sender = p_user then m.recipient else m.sender end, jsonb_agg(m.id)
      from messages m where p_user in (m.sender, m.recipient) group by 1
  loop
    perform live_send('user:' || v_other, 'removed', jsonb_build_object('table', 'messages', 'ids', v_ids));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.econ_erase(p_user uuid, p_scope text, p_claim text default null, p_coins bigint default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_at bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_was jsonb;
  v_themes jsonb;
  v_keep jsonb := '{}'::jsonb;
  v_market jsonb;
  v_guild jsonb;
  v_gifts integer := 0;
  v_friends integer := 0;
  v_chats integer := 0;
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  if p_scope is null or p_scope not in ('cards', 'all') then raise exception 'BAD_SCOPE'; end if;
  insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
  select state into v_was from econ where user_id = p_user for update;
  if p_claim is not null then
    insert into claims (user_id, key) values (p_user, p_claim) on conflict do nothing;
    if not found then raise exception 'ALREADY_CLAIMED'; end if;
  end if;

  v_market := public.danger_market_out(p_user);
  if p_scope = 'all' then v_guild := public.danger_guild_leave(p_user); end if;
  delete from deliveries where recipient = p_user and claimed_at is null;
  get diagnostics v_gifts = row_count;

  perform public.econ_wipe(p_user, p_scope, null, p_coins);

  if p_scope = 'all' then
    if jsonb_typeof(v_was->'owned'->'supporter') = 'array' and jsonb_array_length(v_was->'owned'->'supporter') > 0 then
      select coalesce(jsonb_agg(x.v), '[]'::jsonb) into v_themes
        from jsonb_array_elements_text(case when jsonb_typeof(v_was->'owned'->'themes') = 'array'
          then v_was->'owned'->'themes' else '[]'::jsonb end) as x(v)
        where x.v in ('folio', 'gilded');
      v_keep := jsonb_build_object('owned', jsonb_build_object('supporter', v_was->'owned'->'supporter', 'themes', v_themes));
    end if;
    update econ set state = state || v_keep || jsonb_build_object('wiped', jsonb_build_object('at', v_at, 'scope', p_scope)),
      updated_at = now() where user_id = p_user;

    v_chats := public.danger_tell_chats(p_user);
    delete from messages where p_user in (sender, recipient);
    delete from friendships where p_user in (requester, addressee);
    get diagnostics v_friends = row_count;
    delete from challenges where p_user in (challenger, opponent);
    delete from showcase_kudos where p_user in (owner, sender);
    delete from wishlists where owner = p_user;
    delete from guild_invites where p_user in (inviter, invitee);
    delete from guild_messages where sender = p_user;
    delete from scores where user_id = p_user;
    delete from leaderboard_daily where user_id = p_user;
    delete from leaderboard_weekly where user_id = p_user;
    delete from leaderboard_alltime where user_id = p_user;
    delete from leaderboard_season where user_id = p_user;
    delete from saves where user_id = p_user;
    delete from saves_history where user_id = p_user;
    delete from save_keys where user_id = p_user and key in ('wikster.profile.v1', 'wikster.theme');
    insert into save_meta (user_id, wiped_at) values (p_user, v_at)
      on conflict (user_id) do update set wiped_at = excluded.wiped_at, backup_at = null;
    update profiles set level = 1, rank = null, play_ms = 0, badges = '[]'::jsonb, showcase = '[]'::jsonb, avatar = null
      where id = p_user;
  else
    update econ set state = state || jsonb_build_object('wiped', jsonb_build_object('at', v_at, 'scope', p_scope)),
      updated_at = now() where user_id = p_user;
    insert into save_keys (user_id, key, value, stamp, updated_at) values (p_user, 'wikster.theme', 'aurora', v_at, now())
      on conflict (user_id, key) do update set value = excluded.value,
        stamp = greatest(save_keys.stamp + 1, excluded.stamp), updated_at = excluded.updated_at;
  end if;

  perform live_send('user:' || p_user, 'wiped', jsonb_build_object('scope', p_scope, 'at', v_at));
  return jsonb_build_object('ok', true, 'scope', p_scope, 'at', v_at, 'market', v_market, 'guild', v_guild,
    'gifts', v_gifts, 'friends', v_friends, 'chats', v_chats);
end $$;

create or replace function public.delete_account(p_user uuid, p_auth boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_market jsonb;
  v_guild jsonb;
  v_kept integer := 0;
  v_bank integer := 0;
begin
  if p_user is null then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    return jsonb_build_object('ok', true, 'gone', true);
  end if;
  perform 1 from econ where user_id = p_user for update;
  v_market := public.danger_market_out(p_user);
  v_guild := public.danger_guild_leave(p_user);
  update deliveries set sender = recipient where sender = p_user and recipient <> p_user and claimed_at is null;
  get diagnostics v_kept = row_count;
  update guild_bank set donor = null where donor = p_user;
  get diagnostics v_bank = row_count;
  perform public.danger_tell_chats(p_user);
  perform live_send('user:' || p_user, 'gone', jsonb_build_object('at', floor(extract(epoch from clock_timestamp()) * 1000)::bigint));
  if coalesce(p_auth, true) then
    delete from auth.users where id = p_user;
  end if;
  delete from cards_gone where user_id = p_user;
  return jsonb_build_object('ok', true, 'auth', coalesce(p_auth, true), 'market', v_market, 'guild', v_guild,
    'gifts_kept', v_kept, 'bank_kept', v_bank);
end $$;

create or replace function public.admin_wipe(p_user uuid, p_scope text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.admin_gate();
  v_coins bigint;
  v_log bigint;
  v_out jsonb;
begin
  if p_scope is null or p_scope not in ('progress', 'collection', 'everything') then raise exception 'BAD_SCOPE'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'NOT_FOUND'; end if;
  if p_scope = 'collection' then
    select coins into v_coins from wallets where user_id = p_user;
    v_out := public.econ_erase(p_user, 'cards', null, coalesce(v_coins, 0));
  elsif p_scope = 'progress' then
    insert into econ (user_id) values (p_user) on conflict (user_id) do nothing;
    update econ set state = (state - array['boostersOpened', 'rarityCounts', 'progress', 'pendingLevels', 'achievements',
        'cardsSold', 'fused', 'albumTiers', 'seasons', 'seasonUnlocks', 'packsBuilt'])
        || jsonb_build_object('progress', jsonb_build_object('level', 1, 'xp', 0), 'pendingLevels', '[]'::jsonb,
          'rev', coalesce((state->>'rev')::integer, 0) + 1),
      updated_at = now()
      where user_id = p_user;
    delete from claims where user_id = p_user and (key like 'level:%' or key like 'medal:%' or key like 'ach:%');
    insert into ledger (user_id, kind, coins, ink, reason) values (p_user, 'wipe', 0, 0, 'progress');
    update profiles set level = 1 where id = p_user;
  else
    v_out := public.econ_erase(p_user, 'all', null, 0);
  end if;
  perform live_send('user:' || p_user, 'econ', jsonb_build_object('scope', p_scope));
  v_log := public.admin_note('wipe', p_user, jsonb_build_object('scope', p_scope), null, null);
  return coalesce(v_out - 'ok' - 'scope', '{}'::jsonb) || jsonb_build_object('ok', true, 'scope', p_scope, 'log', v_log);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'danger_market_out(uuid)', 'danger_guild_leave(uuid)', 'danger_tell_chats(uuid)',
    'econ_erase(uuid, text, text, bigint)', 'delete_account(uuid, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['econ_erase(uuid, text, text, bigint)', 'delete_account(uuid, boolean)'] loop
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- custom
create table if not exists public.wiki_finds (
  key    text primary key,
  result jsonb not null,
  at     timestamptz not null default now()
);
alter table public.wiki_finds enable row level security;

create table if not exists public.wiki_sites (
  api_url text primary key,
  info    jsonb,
  at      timestamptz not null default now()
);
alter table public.wiki_sites enable row level security;

create table if not exists public.card_pictures (
  key     text primary key,
  image   text,
  source  text not null check (source in ('wikidata', 'linked', 'openverse', 'text')),
  license text,
  credit  text,
  link    text,
  extra   jsonb,
  at      timestamptz not null default now()
);
alter table public.card_pictures enable row level security;
alter table public.card_pictures drop constraint if exists card_pictures_source_check;
alter table public.card_pictures add constraint card_pictures_source_check check (source in ('wikidata', 'linked', 'openverse', 'text', 'page'));

revoke all on table public.wiki_finds, public.wiki_sites, public.card_pictures from public, anon, authenticated;
grant select, insert, update, delete on table public.wiki_finds, public.wiki_sites, public.card_pictures to service_role;

create or replace function public.wiki_find_get(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select f.result from wiki_finds f where f.key = left(p_key, 200) and f.at > now() - interval '7 days';
$$;

create or replace function public.wiki_find_put(p_key text, p_result jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_key, '') = '' or p_result is null or jsonb_typeof(p_result) <> 'object' or pg_column_size(p_result) > 65536 then return; end if;
  insert into wiki_finds (key, result, at) values (left(p_key, 200), p_result, now())
    on conflict (key) do update set result = excluded.result, at = excluded.at;
  if random() < 0.05 then delete from wiki_finds where at < now() - interval '30 days'; end if;
end $$;

create or replace function public.wiki_site_get(p_api text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('info', s.info) from wiki_sites s
  where s.api_url = left(p_api, 400) and s.at > now() - case when s.info is null then interval '1 day' else interval '3 days' end;
$$;

create or replace function public.wiki_site_put(p_api text, p_info jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_api, '') !~ '^https://[^/?#]+/[^?#]*api\.php$' then return; end if;
  if p_info is not null and (jsonb_typeof(p_info) <> 'object' or pg_column_size(p_info) > 8192) then return; end if;
  insert into wiki_sites (api_url, info, at) values (left(p_api, 400), p_info, now())
    on conflict (api_url) do update set info = excluded.info, at = excluded.at;
  if random() < 0.05 then delete from wiki_sites where at < now() - interval '30 days'; end if;
end $$;

create or replace function public.pictures_get(p_keys text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'image', c.image, 'source', c.source, 'license', c.license,
    'credit', c.credit, 'link', c.link, 'extra', c.extra)), '[]'::jsonb)
  from card_pictures c where c.key = any (coalesce(p_keys[1:80], '{}'::text[]));
$$;

create or replace function public.pictures_put(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  added integer;
begin
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array' then return 0; end if;
  insert into card_pictures (key, image, source, license, credit, link, extra, at)
    select left(r->>'key', 400), left(r->>'image', 1000), r->>'source', left(r->>'license', 80), left(r->>'credit', 200),
      left(r->>'link', 1000), case when jsonb_typeof(r->'extra') = 'object' then r->'extra' end, now()
    from (select value r from jsonb_array_elements(p_rows) limit 80) x
    where coalesce(r->>'key', '') <> '' and r->>'source' in ('wikidata', 'linked', 'openverse', 'text', 'page')
      and (r->>'source' = 'text' or coalesce(r->>'image', '') ~ '^https://')
    on conflict (key) do update set image = excluded.image, source = excluded.source, license = excluded.license,
      credit = excluded.credit, link = excluded.link, extra = excluded.extra, at = excluded.at;
  get diagnostics added = row_count;
  return added;
end $$;

do $$
declare f text;
begin
  foreach f in array array['wiki_find_get(text)', 'wiki_find_put(text, jsonb)', 'wiki_site_get(text)', 'wiki_site_put(text, jsonb)',
    'pictures_get(text[])', 'pictures_put(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- fewer calls
grant execute on function public.live_send(text, text, jsonb) to service_role;

create or replace function public.social_digest(p_parts text[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  every boolean := p_parts is null;
  g     uuid;
  res   jsonb;
begin
  if me is null then raise exception 'sign in'; end if;
  res := jsonb_build_object('at', now());
  if every or 'me' = any(p_parts) then
    res := res || jsonb_build_object('me', (select to_jsonb(p) from profiles p where p.id = me));
  end if;
  if every or 'friends' = any(p_parts) then
    res := res || jsonb_build_object(
      'friendships', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'requester', f.requester, 'addressee', f.addressee,
          'status', f.status, 'created_at', f.created_at))
        from friendships f where f.requester = me or f.addressee = me), '[]'::jsonb),
      'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'level', p.level, 'rank', p.rank,
          'cards', p.cards, 'unique_cards', p.unique_cards, 'boosters_opened', p.boosters_opened, 'collection_value', p.collection_value,
          'best_rarity', p.best_rarity, 'play_ms', p.play_ms, 'created_at', p.created_at, 'avatar', p.avatar, 'presence', p.presence,
          'last_seen_at', p.last_seen_at, 'visibility', p.visibility, 'showcase', p.showcase, 'badges', p.badges, 'appearance', p.appearance))
        from profiles p
        where p.id in (select case when f.requester = me then f.addressee else f.requester end
                         from friendships f where f.requester = me or f.addressee = me)
          and p.visibility in ('public', 'friends')), '[]'::jsonb));
  end if;
  if every or 'social' = any(p_parts) then
    res := res || jsonb_build_object(
      'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked', b.blocked, 'created_at', b.created_at) order by b.created_at desc)
        from blocks b where b.blocker = me), '[]'::jsonb),
      'reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports_answered() r), '[]'::jsonb),
      'invites', coalesce((select jsonb_agg(to_jsonb(i)) from public.my_guild_invites() i), '[]'::jsonb),
      'unread', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'created_at', m.created_at))
        from messages m where m.recipient = me and m.read_at is null), '[]'::jsonb),
      'trades', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'proposer', t.proposer, 'recipient', t.recipient, 'offer', t.offer,
          'ask', t.ask, 'status', t.status, 'created_at', t.created_at, 'resolved_at', t.resolved_at) order by t.created_at desc)
        from (select * from trades x where (x.proposer = me or x.recipient = me) and x.status <> 'closed'
               order by x.created_at desc limit 30) t), '[]'::jsonb),
      'challenges', coalesce((select jsonb_agg(to_jsonb(c)) from public.my_challenges() c), '[]'::jsonb),
      'deliveries', (select count(*) from deliveries d where d.recipient = me and d.claimed_at is null),
      'grants', (select count(*) from grants x where x.user_id = me and x.claimed_at is null));
  end if;
  if every or 'guild' = any(p_parts) or 'notices' = any(p_parts) then
    select m.guild_id into g from guild_members m where m.user_id = me;
  end if;
  if every or 'guild' = any(p_parts) then
    res := res || jsonb_build_object('guild', (select to_jsonb(x) from guilds x where x.id = g));
  end if;
  if every or 'notices' = any(p_parts) then
    res := res || jsonb_build_object(
      'suspension', (select jsonb_build_object('reason', s.reason, 'until', s.until, 'muted', s.muted)
        from suspensions s where s.user_id = me),
      'notices', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title_en', a.title_en, 'title_fr', a.title_fr,
          'body_en', a.body_en, 'body_fr', a.body_fr, 'kind', a.kind, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
          'target_user', a.target_user, 'target_guild', a.target_guild) order by a.starts_at desc)
        from (select * from announcements y
               where y.starts_at <= now() and (y.ends_at is null or y.ends_at > now())
                 and ((y.target_user is null and y.target_guild is null) or y.target_user = me
                      or (y.target_user is null and g is not null and y.target_guild = g))
               order by y.starts_at desc limit 10) a), '[]'::jsonb));
  end if;
  if every or 'wishes' = any(p_parts) then
    res := res || jsonb_build_object(
      'wishes', coalesce((select jsonb_agg(jsonb_build_object('key', w.key, 'card', w.card, 'created_at', w.created_at) order by w.created_at desc)
        from (select * from wishlists v where v.owner = me order by v.created_at desc limit 200) w), '[]'::jsonb),
      'friendWishes', coalesce((select jsonb_agg(jsonb_build_object('owner', w.owner, 'key', w.key))
        from (select v.owner, v.key from wishlists v
               where v.owner in (select case when f.requester = me then f.addressee else f.requester end
                                   from friendships f where (f.requester = me or f.addressee = me) and f.status = 'accepted')
               limit 1000) w), '[]'::jsonb));
  end if;
  return res;
end $$;
revoke all on function public.social_digest(text[]) from public, anon;
grant execute on function public.social_digest(text[]) to authenticated;

-- appearance

alter table public.profiles add column if not exists appearance jsonb;

create or replace function public.theme_owned(s jsonb, p_id text)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_code_themes constant text[] := array['rire','assur','pixel','tabletop','raclette','lecture','yaourt','wankel','elden','hellfire','apotheosis'];
  v_seasons constant text[] := array['frost','hearts','thaw','fools','bloom','solstice','voyage','harvest','hallows','ember','yule'];
begin
  if p_id is null then return false; end if;
  if p_id = 'aurora' then return true; end if;
  if p_id like 'fc-%' then
    return coalesce(jsonb_typeof(s->'owned'->'themes') = 'array' and (s->'owned'->'themes') ? p_id
      and jsonb_typeof(s->'friendCodes'->upper(substr(p_id, 4))->'theme') = 'object', false);
  end if;
  if p_id = any(v_code_themes) then
    return coalesce(jsonb_typeof(s->'codeDefs') = 'object' and exists (
      select 1 from jsonb_each(s->'codeDefs') d
      where jsonb_typeof(d.value) = 'object' and d.value->>'theme' = p_id
        and jsonb_typeof(s->'codesRedeemed'->d.key) = 'number' and (s->'codesRedeemed'->>d.key)::numeric > 0), false);
  end if;
  if p_id = any(v_seasons) then
    return coalesce(jsonb_typeof(s->'seasonUnlocks'->'themes') = 'array' and (s->'seasonUnlocks'->'themes') ? p_id, false);
  end if;
  return coalesce(jsonb_typeof(s->'owned'->'themes') = 'array' and (s->'owned'->'themes') ? p_id, false);
end $$;

create or replace function public.appearance_clean(p_user uuid, a jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_rarities constant text[] := array['common','uncommon','rare','epic','legendary','mythic','exotic','prismatic'];
  v_tokens constant text[] := array['bg','ink','ink-dim','ink-faint','surface','surface-2','surface-solid','line','line-strong','accent','accent-2','accent-ink','positive','negative','warning'];
  v_layers constant text[] := array['sound','font','shape','scene','special'];
  v_specials constant text[] := array['arcade','noir','pixel','assur','tabletop'];
  s jsonb;
  v_theme text;
  v_fx jsonb := '{}'::jsonb;
  v_palette jsonb := '{}'::jsonb;
  v_layer_ids jsonb := '{}'::jsonb;
  v_veil integer := 0;
  v_friend jsonb;
  k text;
  v jsonb;
  v_id text;
begin
  if jsonb_typeof(a) is distinct from 'object' or octet_length(a::text) > 4000 then return null; end if;
  select e.state into s from econ e where e.user_id = p_user;
  v_theme := case when jsonb_typeof(a->'theme') = 'string' then a->>'theme' end;
  if v_theme is null or v_theme !~ '^[a-z0-9-]{1,40}$' then v_theme := 'aurora'; end if;
  if s is not null and not public.theme_owned(s, v_theme) then v_theme := 'aurora'; end if;

  if jsonb_typeof(a->'fx') = 'object' then
    for k, v in select e.key, e.value from jsonb_each(a->'fx') e loop
      if not (k = any(v_rarities)) or jsonb_typeof(v) <> 'string' then continue; end if;
      v_id := v #>> '{}';
      if v_id = 'classic' or v_id !~ '^[a-z0-9]{1,24}$' then continue; end if;
      if s is not null and not coalesce(jsonb_typeof(s->'owned'->'fx') = 'array' and (s->'owned'->'fx') ? (k || ':' || v_id), false) then continue; end if;
      v_fx := v_fx || jsonb_build_object(k, v_id);
    end loop;
  end if;

  if v_theme = 'custom' and jsonb_typeof(a->'custom') is distinct from 'object' then v_theme := 'aurora'; end if;
  if v_theme like 'fc-%' then
    v_friend := s->'friendCodes'->upper(substr(v_theme, 4))->'theme';
    if jsonb_typeof(v_friend) is distinct from 'object' then
      v_theme := 'aurora';
    else
      return jsonb_build_object('v', 1, 'theme', v_theme, 'fx', v_fx, 'friend',
        jsonb_build_object('name', v_friend->'name', 'base', v_friend->'base', 'accent', v_friend->'accent'));
    end if;
  end if;
  if v_theme <> 'custom' then
    return jsonb_build_object('v', 1, 'theme', v_theme, 'fx', v_fx);
  end if;

  if jsonb_typeof(a->'custom'->'palette') = 'object' then
    for k, v in select e.key, e.value from jsonb_each(a->'custom'->'palette') e loop
      if k = any(v_tokens) and jsonb_typeof(v) = 'string' and lower(v #>> '{}') ~ '^#[0-9a-f]{6}([0-9a-f]{2})?$' then
        v_palette := v_palette || jsonb_build_object(k, lower(v #>> '{}'));
      end if;
    end loop;
  end if;
  if jsonb_typeof(a->'custom'->'layers') = 'object' then
    for k, v in select e.key, e.value from jsonb_each(a->'custom'->'layers') e loop
      if not (k = any(v_layers)) or jsonb_typeof(v) <> 'string' then continue; end if;
      v_id := v #>> '{}';
      if k = 'special' and v_id = 'none' then v_layer_ids := v_layer_ids || jsonb_build_object(k, v_id); continue; end if;
      if k = 'special' and not (v_id = any(v_specials)) then continue; end if;
      if v_id = 'custom' or v_id !~ '^[a-z0-9-]{1,24}$' then continue; end if;
      if s is not null and not public.theme_owned(s, v_id) then continue; end if;
      v_layer_ids := v_layer_ids || jsonb_build_object(k, v_id);
    end loop;
  end if;
  if jsonb_typeof(a->'custom'->'veil') = 'number' then
    v_veil := least(90, greatest(0, round((a->'custom'->>'veil')::numeric)))::integer;
  end if;
  return jsonb_build_object('v', 1, 'theme', 'custom', 'fx', v_fx,
    'custom', jsonb_build_object('palette', v_palette, 'layers', v_layer_ids, 'veil', v_veil));
end $$;
revoke all on function public.appearance_clean(uuid, jsonb) from public, anon, authenticated;

create or replace function public.profile_appearance_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.appearance is null then return new; end if;
  if tg_op = 'UPDATE' and new.appearance is not distinct from old.appearance then return new; end if;
  new.appearance := public.appearance_clean(new.id, new.appearance);
  return new;
end $$;
drop trigger if exists profile_appearance_guard on public.profiles;
create trigger profile_appearance_guard
  before insert or update of appearance on public.profiles
  for each row execute function public.profile_appearance_guard();

notify pgrst, 'reload schema';

-- friend codes
alter table public.redeem_codes add column if not exists special jsonb;
alter table public.redeem_codes add column if not exists allowed uuid[];
alter table public.redeem_codes add column if not exists legacy jsonb;

create table if not exists public.adult_wikis (
  api        text primary key check (api ~ '^https://[^\s]+$'),
  names      text[] not null default '{}',
  note       text,
  created_at timestamptz not null default now()
);
alter table public.adult_wikis enable row level security;
revoke all on public.adult_wikis from public, anon, authenticated;
grant select on public.adult_wikis to service_role;

create or replace function public.friend_text(p jsonb, p_max integer)
returns text language plpgsql immutable as $$
declare v text;
begin
  if p is null or jsonb_typeof(p) <> 'string' then return null; end if;
  v := left(btrim(p #>> '{}'), p_max);
  return nullif(btrim(v), '');
end $$;

create or replace function public.friend_url(p jsonb, p_max integer)
returns text language plpgsql immutable as $$
declare v text := public.admin_str(p, p_max);
begin
  if v is null or v !~ '^https://[^[:space:]<>"]+$' then return null; end if;
  return v;
end $$;

create or replace function public.friend_hex(p jsonb)
returns text language sql immutable as $$
  select case when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^#[0-9a-fA-F]{6}$' then lower(p #>> '{}') end
$$;

create or replace function public.friend_themes()
returns text[] language sql immutable as $$
  select array['aurora', 'paper', 'arcade', 'noir', 'sunset', 'meadow', 'cartoon', 'matrix', 'casino', 'horror', 'rire', 'assur',
    'pixel', 'tabletop', 'raclette', 'lecture', 'yaourt', 'wankel', 'elden', 'hellfire', 'apotheosis', 'folio', 'gilded', 'frost',
    'hearts', 'thaw', 'fools', 'bloom', 'solstice', 'voyage', 'harvest', 'hallows', 'ember', 'yule']
$$;

create or replace function public.friend_emblems()
returns text[] language sql immutable as $$
  select array['cars', 'f1', 'planes', 'video-games', 'books', 'movies', 'space', 'physics', 'nature', 'animals', 'plants', 'history',
    'philosophy', 'celebrities', 'quotes', 'art', 'cactus', 'sport', 'music', 'records', 'food', 'geography', 'technology', 'weapons',
    'weird', 'memes', 'timed', 'open', 'gem', 'laugh', 'lamassu', 'pixelheart', 'dice', 'openbook', 'pot', 'wheel', 'hellfire',
    'algorithm', 'erdtree', 'rotor', 'seal']
$$;

create or replace function public.admin_special_card(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  art jsonb;
  pic jsonb;
  v_key text;
  v_rar text := 'common';
  v_pic jsonb;
  v_thumb text;
  v_lang text;
begin
  if coalesce(jsonb_typeof(p), '') <> 'object' then raise exception 'BAD_SPECIAL'; end if;
  art := p->'article';
  if coalesce(jsonb_typeof(art), '') <> 'object' or octet_length(art::text) > 20000 then raise exception 'BAD_SPECIAL'; end if;
  v_key := public.admin_str(art->'key', 300);
  if v_key is null then raise exception 'BAD_SPECIAL'; end if;
  if coalesce(jsonb_typeof(p->'rarityId'), 'null') <> 'null' then
    v_rar := public.admin_str(p->'rarityId', 20);
    if v_rar is null or not (v_rar = any(public.liveops_rarities() || array['special'])) then raise exception 'BAD_SPECIAL'; end if;
  end if;
  pic := art->'picture';
  if coalesce(jsonb_typeof(pic), 'null') = 'object' then
    if public.friend_url(pic->'url', 1000) is null then raise exception 'BAD_SPECIAL'; end if;
    v_pic := jsonb_strip_nulls(jsonb_build_object('source', 'upload', 'url', public.friend_url(pic->'url', 1000),
      'credit', public.friend_text(pic->'credit', 200), 'license', public.friend_text(pic->'license', 120),
      'link', public.friend_url(pic->'link', 1000)));
  elsif coalesce(jsonb_typeof(pic), 'null') <> 'null' then
    raise exception 'BAD_SPECIAL';
  end if;
  if coalesce(jsonb_typeof(art->'thumbnail'), 'null') <> 'null' then
    v_thumb := public.friend_url(art->'thumbnail', 1000);
    if v_thumb is null then raise exception 'BAD_SPECIAL'; end if;
  end if;
  v_thumb := coalesce(v_pic->>'url', v_thumb);
  v_lang := coalesce(public.admin_str(art->'lang', 12), 'en');
  if v_lang !~ '^[a-z-]{2,12}$' then v_lang := 'en'; end if;
  return jsonb_build_object('article', jsonb_strip_nulls(jsonb_build_object(
      'key', v_key,
      'title', coalesce(public.friend_text(art->'title', 300), v_key),
      'lang', v_lang,
      'description', public.friend_text(art->'description', 300),
      'extract', public.friend_text(art->'extract', 1500),
      'url', public.friend_url(art->'url', 600),
      'thumbnail', v_thumb,
      'sourceName', public.friend_text(art->'sourceName', 80),
      'views', case when public.liveops_num(art->'views', 0, 1000000000000, true) then art->'views' end,
      'popularity', case when public.liveops_num(art->'popularity', 0, 1) then art->'popularity' end,
      'picture', v_pic)),
    'rarityId', v_rar);
end $$;

create or replace function public.admin_special_check(p jsonb, p_items boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_name text;
  v_msg text;
  v_cards jsonb := '[]'::jsonb;
  v_booster jsonb;
  v_theme jsonb;
  v_badge jsonb;
  v_list jsonb;
  b jsonb;
  x jsonb;
begin
  if coalesce(jsonb_typeof(p), '') <> 'object' or octet_length(p::text) > 400000 then raise exception 'BAD_SPECIAL'; end if;
  v_name := public.admin_str(p->'name', 40);
  v_msg := public.admin_str(p->'message', 800);
  if v_name is null or v_msg is null then raise exception 'BAD_SPECIAL'; end if;

  if coalesce(jsonb_typeof(p->'cards'), 'null') <> 'null' then
    if jsonb_typeof(p->'cards') <> 'array' or jsonb_array_length(p->'cards') > 20 then raise exception 'BAD_SPECIAL'; end if;
    for x in select e from jsonb_array_elements(p->'cards') e loop
      v_cards := v_cards || jsonb_build_array(public.admin_special_card(x));
    end loop;
  end if;

  b := p->'booster';
  if coalesce(jsonb_typeof(b), 'null') = 'object' then
    if public.admin_str(b->'name', 60) is null or public.friend_hex(b->'accent') is null
       or (coalesce(jsonb_typeof(b->'accent2'), 'null') <> 'null' and public.friend_hex(b->'accent2') is null)
       or jsonb_typeof(b->'cards') is distinct from 'array' or jsonb_array_length(b->'cards') not between 1 and 12 then
      raise exception 'BAD_SPECIAL';
    end if;
    v_list := '[]'::jsonb;
    for x in select e from jsonb_array_elements(b->'cards') e loop
      v_list := v_list || jsonb_build_array(public.admin_special_card(x));
    end loop;
    v_booster := jsonb_strip_nulls(jsonb_build_object('name', public.admin_str(b->'name', 60), 'accent', public.friend_hex(b->'accent'),
      'accent2', public.friend_hex(b->'accent2'))) || jsonb_build_object('cards', v_list);
  elsif coalesce(jsonb_typeof(b), 'null') <> 'null' then
    raise exception 'BAD_SPECIAL';
  end if;

  b := p->'theme';
  if coalesce(jsonb_typeof(b), 'null') = 'object' then
    if public.admin_str(b->'name', 40) is null or public.friend_hex(b->'accent') is null
       or not (coalesce(public.admin_str(b->'base', 40), '') = any(public.friend_themes())) then
      raise exception 'BAD_SPECIAL';
    end if;
    v_theme := jsonb_build_object('name', public.admin_str(b->'name', 40), 'base', public.admin_str(b->'base', 40),
      'accent', public.friend_hex(b->'accent'));
  elsif coalesce(jsonb_typeof(b), 'null') <> 'null' then
    raise exception 'BAD_SPECIAL';
  end if;

  b := p->'badge';
  if coalesce(jsonb_typeof(b), 'null') = 'object' then
    if public.admin_str(b->'name', 40) is null or public.friend_hex(b->'color') is null
       or not (coalesce(public.admin_str(b->'emblem', 40), '') = any(public.friend_emblems())) then
      raise exception 'BAD_SPECIAL';
    end if;
    v_badge := jsonb_build_object('name', public.admin_str(b->'name', 40), 'emblem', public.admin_str(b->'emblem', 40),
      'color', public.friend_hex(b->'color'));
  elsif coalesce(jsonb_typeof(b), 'null') <> 'null' then
    raise exception 'BAD_SPECIAL';
  end if;

  if jsonb_array_length(v_cards) = 0 and v_booster is null and v_theme is null and v_badge is null and not coalesce(p_items, false) then
    raise exception 'BAD_SPECIAL';
  end if;
  return jsonb_build_object('name', v_name, 'message', v_msg, 'cards', v_cards, 'booster', v_booster, 'theme', v_theme, 'badge', v_badge);
end $$;

create or replace function public.friend_allowed(p jsonb)
returns uuid[] language plpgsql immutable as $$
declare v uuid[];
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 200
     or exists (select 1 from jsonb_array_elements(p) x where jsonb_typeof(x) <> 'string'
       or (x #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'BAD_CODE';
  end if;
  select array_agg(distinct (x #>> '{}')::uuid) into v from jsonb_array_elements(p) x;
  return v;
end $$;

create or replace function public.admin_code_create(p_code jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := public.liveops_actor();
  v_code    text := public.liveops_code(p_code->>'code');
  v_items   jsonb;
  v_special jsonb;
  v_allowed uuid[];
  v_has     boolean;
  v_row     redeem_codes;
  v_abc     text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_tries   integer := 0;
  v_log     bigint;
begin
  if p_code is null or jsonb_typeof(p_code) <> 'object' then raise exception 'BAD_CODE'; end if;
  v_has := jsonb_typeof(p_code->'items') = 'array' and jsonb_array_length(p_code->'items') > 0;
  if coalesce(jsonb_typeof(p_code->'special'), 'null') <> 'null' then
    v_items := case when v_has then public.admin_items_check(p_code->'items', 'code') else '[]'::jsonb end;
    v_special := public.admin_special_check(p_code->'special', v_has);
  else
    v_items := public.admin_items_check(p_code->'items', 'code');
  end if;
  v_allowed := public.friend_allowed(p_code->'allowed');
  if v_code = '' then
    loop
      v_code := (select string_agg(substr(v_abc, 1 + floor(random() * length(v_abc))::integer, 1), '') from generate_series(1, 10));
      exit when not exists (select 1 from redeem_codes where code = v_code);
      v_tries := v_tries + 1;
      if v_tries > 20 then raise exception 'CODE_TAKEN'; end if;
    end loop;
  end if;
  if v_code !~ '^[A-Z0-9]{4,32}$' then raise exception 'BAD_CODE'; end if;
  begin
    insert into redeem_codes (code, items, max_uses, per_user, starts_at, expires_at, disabled, note, created_by, special, allowed)
      values (v_code, v_items, nullif(p_code->>'max_uses', '')::integer, coalesce(nullif(p_code->>'per_user', '')::integer, 1),
        nullif(p_code->>'starts_at', '')::timestamptz, nullif(p_code->>'expires_at', '')::timestamptz,
        coalesce((p_code->>'disabled')::boolean, false), left(p_code->>'note', 300), v_me, v_special, v_allowed)
      returning * into v_row;
  exception when unique_violation then
    raise exception 'CODE_TAKEN';
  when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'BAD_CODE';
  end;
  v_log := public.liveops_log('code_create', jsonb_build_object('new', to_jsonb(v_row)),
    jsonb_build_object('op', 'restore_row', 'table', 'redeem_codes', 'key', jsonb_build_object('code', v_row.code),
      'row', to_jsonb(v_row) || jsonb_build_object('disabled', true)));
  return to_jsonb(v_row) || jsonb_build_object('log', v_log);
end $$;

create or replace function public.admin_code_update(p_code text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := public.liveops_actor();
  v_old     redeem_codes;
  v_row     redeem_codes;
  v_items   jsonb;
  v_special jsonb;
  v_allowed uuid[];
  v_log     bigint;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'BAD_CODE'; end if;
  select * into v_old from redeem_codes where code = public.liveops_code(p_code) for update;
  if v_old.code is null then raise exception 'UNKNOWN_CODE'; end if;
  v_special := case when p_patch ? 'special' then
      case when coalesce(jsonb_typeof(p_patch->'special'), 'null') = 'null' then null else p_patch->'special' end
    else v_old.special end;
  if p_patch ? 'items' and (coalesce(jsonb_typeof(p_patch->'items'), 'null') = 'null'
     or (jsonb_typeof(p_patch->'items') = 'array' and jsonb_array_length(p_patch->'items') = 0)) then
    v_items := '[]'::jsonb;
  elsif p_patch ? 'items' then
    v_items := public.admin_items_check(p_patch->'items', 'code');
  else
    v_items := v_old.items;
  end if;
  if v_special is not null then
    v_special := public.admin_special_check(v_special, jsonb_array_length(v_items) > 0);
  elsif jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'BAD_ITEMS';
  end if;
  v_allowed := case when p_patch ? 'allowed' then public.friend_allowed(p_patch->'allowed') else v_old.allowed end;
  begin
    update redeem_codes set
        items      = v_items,
        special    = v_special,
        allowed    = v_allowed,
        max_uses   = case when p_patch ? 'max_uses' then nullif(p_patch->>'max_uses', '')::integer else max_uses end,
        per_user   = case when p_patch ? 'per_user' then coalesce(nullif(p_patch->>'per_user', '')::integer, 1) else per_user end,
        starts_at  = case when p_patch ? 'starts_at' then nullif(p_patch->>'starts_at', '')::timestamptz else starts_at end,
        expires_at = case when p_patch ? 'expires_at' then nullif(p_patch->>'expires_at', '')::timestamptz else expires_at end,
        disabled   = case when p_patch ? 'disabled' then coalesce((p_patch->>'disabled')::boolean, false) else disabled end,
        note       = case when p_patch ? 'note' then left(p_patch->>'note', 300) else note end
      where code = v_old.code returning * into v_row;
  exception when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'BAD_CODE';
  end;
  v_log := public.liveops_log('code_update', jsonb_build_object('old', to_jsonb(v_old), 'new', to_jsonb(v_row)),
    jsonb_build_object('op', 'restore_row', 'table', 'redeem_codes', 'key', jsonb_build_object('code', v_old.code), 'row', to_jsonb(v_old)));
  return to_jsonb(v_row) || jsonb_build_object('log', v_log);
end $$;

create or replace function public.admin_codes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.liveops_actor();
begin
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'uses', (select count(*) from redeem_uses u where u.code = c.code),
      'players', (select count(distinct u.user_id) from redeem_uses u where u.code = c.code),
      'allowed_names', case when c.allowed is null then null else coalesce((select jsonb_object_agg(p.id, p.username)
        from profiles p where p.id = any(c.allowed)), '{}'::jsonb) end,
      'status', case when c.disabled then 'disabled' when c.expires_at is not null and now() >= c.expires_at then 'expired'
        when c.starts_at is not null and now() < c.starts_at then 'upcoming'
        when c.max_uses is not null and (select count(*) from redeem_uses u where u.code = c.code) >= c.max_uses then 'used_up'
        else 'live' end)
      order by c.created_at desc) from redeem_codes c), '[]'::jsonb);
end $$;

create or replace function public.econ_code_take(p_user uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := public.liveops_code(p_code);
  c      redeem_codes;
  v_used integer;
  v_mine integer;
  v_id   bigint;
begin
  if p_user is null then raise exception 'AUTH'; end if;
  perform public.rate_limit(p_user, 'redeem', 12, 600);
  select * into c from redeem_codes where code = v_code for update;
  if c.code is null or (c.starts_at is not null and now() < c.starts_at) then raise exception 'UNKNOWN_CODE'; end if;
  if c.allowed is not null and not (p_user = any(c.allowed)) then raise exception 'UNKNOWN_CODE'; end if;
  if c.disabled or (c.expires_at is not null and now() >= c.expires_at) then raise exception 'CODE_EXPIRED'; end if;
  select count(*), count(*) filter (where u.user_id = p_user) into v_used, v_mine from redeem_uses u where u.code = v_code;
  if v_mine >= c.per_user then raise exception 'ALREADY_CLAIMED'; end if;
  if c.max_uses is not null and v_used >= c.max_uses then raise exception 'CODE_USED_UP'; end if;
  insert into redeem_uses (code, user_id) values (v_code, p_user) returning id into v_id;
  return jsonb_build_object('code', v_code, 'items', c.items, 'special', c.special, 'legacy', c.legacy, 'use', v_id, 'n', v_mine + 1);
end $$;

create or replace function public.econ_code_defs(p_user uuid, p_ids text[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(c.legacy order by c.code), '[]'::jsonb)
  from redeem_codes c
  join econ e on e.user_id = p_user
  where p_user is not null and c.legacy is not null and jsonb_typeof(c.legacy) = 'object'
    and (c.legacy->>'id') = any(coalesce(p_ids, '{}'::text[]))
    and jsonb_typeof(e.state->'codesRedeemed'->(c.legacy->>'id')) = 'number'
    and (e.state->'codesRedeemed'->>(c.legacy->>'id'))::numeric > 0;
$$;
revoke all on function public.econ_code_defs(uuid, text[]) from public, anon, authenticated;
grant execute on function public.econ_code_defs(uuid, text[]) to service_role;

create or replace function public.badges_clean(p_user uuid, b jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s jsonb;
  d jsonb;
  e jsonb;
  v_id text;
  v_earned jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_worn jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'earned') is distinct from 'array'
     or (position('fc-' in b::text) = 0 and position('special-' in b::text) = 0) then
    return b;
  end if;
  select x.state into s from econ x where x.user_id = p_user;
  for e in select y from jsonb_array_elements(b->'earned') y loop
    v_id := case when jsonb_typeof(e) = 'object' then e->>'id' end;
    if v_id like 'fc-%' then
      d := s->'friendCodes'->upper(substr(v_id, 4))->'badge';
      if jsonb_typeof(d) is distinct from 'object' then continue; end if;
      e := jsonb_build_object('id', v_id, 'rank', 1, 'look',
        jsonb_build_object('name', d->'name', 'emblem', d->'emblem', 'color', d->'color'));
    elsif v_id like 'special-%' then
      d := null;
      if jsonb_typeof(s->'codeDefs') = 'object' then
        select x.value->'badge' into d from jsonb_each(s->'codeDefs') x
          where jsonb_typeof(x.value) = 'object' and x.value->'badge'->>'id' = v_id
            and jsonb_typeof(s->'codesRedeemed'->x.key) = 'number' and (s->'codesRedeemed'->>x.key)::numeric > 0
          limit 1;
      end if;
      if jsonb_typeof(d) is distinct from 'object' then continue; end if;
      e := jsonb_build_object('id', v_id, 'rank', 1, 'look',
        jsonb_build_object('name', d->'name', 'motif', d->'motif', 'foil', d->'foil')
          || case when d->>'live' = 'fire' then jsonb_build_object('live', 'fire') else '{}'::jsonb end);
    end if;
    if v_id is not null then v_ids := v_ids || v_id; end if;
    v_earned := v_earned || jsonb_build_array(e);
  end loop;
  if jsonb_typeof(b->'worn') = 'array' then
    select coalesce(jsonb_agg(w), '[]'::jsonb) into v_worn from jsonb_array_elements(b->'worn') w
      where jsonb_typeof(w) <> 'string' or ((w #>> '{}') not like 'fc-%' and (w #>> '{}') not like 'special-%') or (w #>> '{}') = any(v_ids);
    return b || jsonb_build_object('earned', v_earned, 'worn', v_worn);
  end if;
  return b || jsonb_build_object('earned', v_earned);
end $$;
revoke all on function public.badges_clean(uuid, jsonb) from public, anon, authenticated;

create or replace function public.profile_badges_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.badges is null then return new; end if;
  if tg_op = 'UPDATE' and new.badges is not distinct from old.badges then return new; end if;
  new.badges := public.badges_clean(new.id, new.badges);
  return new;
end $$;
drop trigger if exists profile_badges_guard on public.profiles;
create trigger profile_badges_guard
  before insert or update of badges on public.profiles
  for each row execute function public.profile_badges_guard();

create or replace function public.friend_pictures_writer()
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare hit boolean := false;
begin
  if auth.uid() is null or to_regclass('public.admins') is null then return false; end if;
  execute 'select exists (select 1 from public.admins a where a.id = $1)' into hit using auth.uid();
  return coalesce(hit, false);
end $$;
revoke all on function public.friend_pictures_writer() from public, anon;
grant execute on function public.friend_pictures_writer() to authenticated;

do $$
declare f text;
begin
  foreach f in array array['friend_text(jsonb, integer)', 'friend_url(jsonb, integer)', 'friend_hex(jsonb)', 'friend_themes()',
    'friend_emblems()', 'admin_special_card(jsonb)', 'friend_allowed(jsonb)', 'profile_badges_guard()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['admin_special_check(jsonb, boolean)', 'admin_code_create(jsonb)', 'admin_code_update(text, jsonb)', 'admin_codes()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'no storage schema here, the friend-pictures bucket is skipped';
    return;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('friend-pictures', 'friend-pictures', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
      on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types$q$;
  else
    execute $q$insert into storage.buckets (id, name, public) values ('friend-pictures', 'friend-pictures', true)
      on conflict (id) do update set public = true$q$;
  end if;
  execute 'drop policy if exists "friend pictures are public" on storage.objects';
  execute 'drop policy if exists "control lists friend pictures" on storage.objects';
  execute 'drop policy if exists "control uploads friend pictures" on storage.objects';
  execute 'drop policy if exists "control replaces friend pictures" on storage.objects';
  execute 'drop policy if exists "control removes friend pictures" on storage.objects';
  execute $q$create policy "control lists friend pictures" on storage.objects for select to authenticated
    using (bucket_id = 'friend-pictures' and public.friend_pictures_writer())$q$;
  execute $q$create policy "control uploads friend pictures" on storage.objects for insert to authenticated
    with check (bucket_id = 'friend-pictures' and public.friend_pictures_writer())$q$;
  execute $q$create policy "control replaces friend pictures" on storage.objects for update to authenticated
    using (bucket_id = 'friend-pictures' and public.friend_pictures_writer())
    with check (bucket_id = 'friend-pictures' and public.friend_pictures_writer())$q$;
  execute $q$create policy "control removes friend pictures" on storage.objects for delete to authenticated
    using (bucket_id = 'friend-pictures' and public.friend_pictures_writer())$q$;
end $$;

notify pgrst, 'reload schema';
