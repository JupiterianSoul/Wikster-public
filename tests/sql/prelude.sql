do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
drop schema if exists auth cascade;
drop schema if exists cron cascade;
drop schema if exists storage cascade;
create schema auth;
create schema cron;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table cron.job (jobid bigserial, jobname text);
create or replace function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(a bigint) returns boolean language sql as $$ select true $$;
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
drop schema if exists realtime cascade;
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text not null, extension text not null default 'broadcast', event text, payload jsonb, private boolean not null default true, inserted_at timestamptz not null default now());
alter table realtime.messages enable row level security;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.messages (topic, event, payload, private) values ($3, $2, $1, $4) $$;
create or replace function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select on realtime.messages to authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
create or replace function public.t_fails(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code then
      raise notice 'PASS  refused with %', p_code;
      return;
    end if;
    raise exception 'FAIL  expected % from %, got %', p_code, p_sql, sqlerrm;
  end;
  raise exception 'FAIL  expected % from %, it went through', p_code, p_sql;
end $$;
create or replace function public.t_is(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL  %', p_label; end if;
  raise notice 'PASS  %', p_label;
end $$;
