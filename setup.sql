-- OPTIONAL: Run this once in Supabase SQL Editor for live syncing across devices.
-- WARNING: This replaces any older version of these draft tables.

create extension if not exists pgcrypto;

-- Remove old objects from earlier demo versions.
drop table if exists public.picks cascade;
drop table if exists public.players cascade;
drop table if exists public.team_secrets cascade;
drop table if exists public.teams cascade;
drop table if exists public.app_secrets cascade;
drop table if exists public.draft_settings cascade;

create table public.draft_settings (
  id integer primary key default 1 check (id = 1),
  draft_name text not null default 'Basketball Draft',
  status text not null default 'setup' check (status in ('setup','waiting','live','paused','complete')),
  current_pick_number integer not null default 1,
  timer_duration integer not null default 120,
  timer_end_at timestamptz,
  timer_paused_remaining integer,
  display_message text not null default '',
  display_message_on boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.app_secrets (
  id integer primary key default 1 check (id = 1),
  owner_password text not null,
  commissioner_password text not null,
  display_password text not null
);

create table public.teams (
  id bigint generated always as identity primary key,
  name text not null,
  display_order integer not null,
  created_at timestamptz not null default now()
);

create table public.team_secrets (
  team_id bigint primary key references public.teams(id) on delete cascade,
  access_code text not null
);

create table public.players (
  id bigint generated always as identity primary key,
  name text not null,
  drafted boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.picks (
  id bigint generated always as identity primary key,
  round_number integer not null,
  pick_number integer not null unique,
  team_id bigint not null references public.teams(id) on delete cascade,
  player_id bigint references public.players(id) on delete set null,
  status text not null default 'pending',
  selected_at timestamptz
);

insert into public.draft_settings (id) values (1);
insert into public.app_secrets (id, owner_password, commissioner_password, display_password)
values (1, 'owner', 'commissioner', 'display');

alter table public.draft_settings enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.picks enable row level security;
alter table public.app_secrets enable row level security;
alter table public.team_secrets enable row level security;

create policy "read settings" on public.draft_settings for select to anon using (true);
create policy "read teams" on public.teams for select to anon using (true);
create policy "read players" on public.players for select to anon using (true);
create policy "read picks" on public.picks for select to anon using (true);

grant select on public.draft_settings, public.teams, public.players, public.picks to anon;

create or replace function public.touch_settings()
returns void
language sql
security definer
set search_path = public
as $$
  update public.draft_settings set updated_at = now() where id = 1;
$$;

create or replace function public.is_owner(p_password text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from public.app_secrets where id = 1 and owner_password = p_password);
$$;

create or replace function public.is_commissioner(p_password text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(select 1 from public.app_secrets where id = 1 and commissioner_password = p_password);
$$;

create or replace function public.validate_owner_password(p_password text)
returns boolean language sql security definer set search_path = public stable
as $$ select public.is_owner(p_password); $$;

create or replace function public.validate_commissioner_password(p_password text)
returns boolean language sql security definer set search_path = public stable
as $$ select public.is_commissioner(p_password); $$;

create or replace function public.validate_display_password(p_password text)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists(select 1 from public.app_secrets where id = 1 and display_password = p_password);
$$;

create or replace function public.validate_team_password(p_team_id bigint, p_team_password text)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists(select 1 from public.team_secrets where team_id = p_team_id and access_code = p_team_password);
$$;

create or replace function public.owner_set_passwords(
  p_owner_password text,
  p_new_owner_password text,
  p_new_commissioner_password text,
  p_new_display_password text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_owner_password) then raise exception 'Wrong owner password.'; end if;
  if coalesce(trim(p_new_owner_password),'') = '' and coalesce(trim(p_new_commissioner_password),'') = '' and coalesce(trim(p_new_display_password),'') = '' then
    raise exception 'Type at least one new password.';
  end if;
  update public.app_secrets
  set owner_password = coalesce(nullif(trim(p_new_owner_password),''), owner_password),
      commissioner_password = coalesce(nullif(trim(p_new_commissioner_password),''), commissioner_password),
      display_password = coalesce(nullif(trim(p_new_display_password),''), display_password)
  where id = 1;
end;
$$;

create or replace function public.owner_set_team_password(p_owner_password text, p_team_id bigint, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_owner_password) then raise exception 'Wrong owner password.'; end if;
  if coalesce(trim(p_new_password),'') = '' then raise exception 'Team password cannot be empty.'; end if;
  update public.team_secrets set access_code = p_new_password where team_id = p_team_id;
  if not found then raise exception 'Team not found.'; end if;
end;
$$;

create or replace function public.owner_list_team_passwords(p_owner_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_owner(p_owner_password) then raise exception 'Wrong owner password.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'access_code', s.access_code) order by t.display_order), '[]'::jsonb)
  into result
  from public.teams t join public.team_secrets s on s.team_id = t.id;
  return result;
end;
$$;

create or replace function public.owner_reset_everything(p_owner_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_owner_password) then raise exception 'Wrong owner password.'; end if;
  truncate table public.picks, public.players, public.team_secrets, public.teams restart identity cascade;
  update public.draft_settings set
    status = 'setup', current_pick_number = 1, timer_end_at = null,
    timer_paused_remaining = null, display_message = '', display_message_on = false,
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.admin_add_player(p_password text, p_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare new_id bigint;
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Type a player name.'; end if;
  insert into public.players(name) values (trim(p_name)) returning id into new_id;
  perform public.touch_settings();
  return new_id;
end;
$$;

create or replace function public.admin_delete_player(p_password text, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  if exists(select 1 from public.players where id = p_player_id and drafted) then raise exception 'Undo that pick first.'; end if;
  delete from public.players where id = p_player_id;
  perform public.touch_settings();
end;
$$;

create or replace function public.admin_add_team(p_password text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare new_id bigint; new_code text; next_order integer;
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Type a team name.'; end if;
  select coalesce(max(display_order),0) + 1 into next_order from public.teams;
  new_code := floor(random() * 9000 + 1000)::integer::text;
  insert into public.teams(name, display_order) values (trim(p_name), next_order) returning id into new_id;
  insert into public.team_secrets(team_id, access_code) values (new_id, new_code);
  delete from public.picks;
  update public.draft_settings set status = 'setup', current_pick_number = 1, updated_at = now() where id = 1;
  return jsonb_build_object('id', new_id, 'code', new_code);
end;
$$;

create or replace function public.admin_delete_team(p_password text, p_team_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  delete from public.teams where id = p_team_id;
  with ranked as (select id, row_number() over(order by display_order, id) rn from public.teams)
  update public.teams t set display_order = ranked.rn from ranked where ranked.id = t.id;
  delete from public.picks;
  update public.draft_settings set status = 'setup', current_pick_number = 1, updated_at = now() where id = 1;
end;
$$;

create or replace function public.admin_move_team(p_password text, p_team_id bigint, p_direction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_order integer; other_id bigint; other_order integer;
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  select display_order into current_order from public.teams where id = p_team_id;
  if p_direction = 'up' then
    select id, display_order into other_id, other_order from public.teams where display_order < current_order order by display_order desc limit 1;
  else
    select id, display_order into other_id, other_order from public.teams where display_order > current_order order by display_order limit 1;
  end if;
  if other_id is not null then
    update public.teams set display_order = -1 where id = p_team_id;
    update public.teams set display_order = current_order where id = other_id;
    update public.teams set display_order = other_order where id = p_team_id;
  end if;
  delete from public.picks;
  update public.draft_settings set status = 'setup', current_pick_number = 1, updated_at = now() where id = 1;
end;
$$;

create or replace function public.admin_generate_order(p_password text, p_rounds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r integer; t record; n integer := 1;
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  if p_rounds < 1 or p_rounds > 20 then raise exception 'Rounds must be from 1 to 20.'; end if;
  if not exists(select 1 from public.players) then raise exception 'Add at least one player.'; end if;
  if not exists(select 1 from public.teams) then raise exception 'Add at least one team.'; end if;
  delete from public.picks;
  update public.players set drafted = false;
  for r in 1..p_rounds loop
    for t in select id from public.teams order by display_order loop
      insert into public.picks(round_number, pick_number, team_id) values (r, n, t.id);
      n := n + 1;
    end loop;
  end loop;
  update public.draft_settings set status = 'waiting', current_pick_number = 1, timer_end_at = null,
    timer_paused_remaining = null, updated_at = now() where id = 1;
end;
$$;

create or replace function public.admin_set_timer_duration(p_password text, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  update public.draft_settings set timer_duration = greatest(10, least(p_seconds, 3600)), updated_at = now() where id = 1;
end;
$$;

create or replace function public.admin_start_pick(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_status text;
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  select status into current_status from public.draft_settings where id = 1;
  if not exists(select 1 from public.picks where player_id is null) then
    update public.draft_settings set status = 'complete', updated_at = now() where id = 1;
    raise exception 'The draft is finished.';
  end if;
  if current_status not in ('waiting','setup') then raise exception 'This pick is already running or paused.'; end if;
  update public.draft_settings set status = 'live', timer_end_at = now() + make_interval(secs => timer_duration),
    timer_paused_remaining = null, updated_at = now() where id = 1;
end;
$$;

create or replace function public.admin_pause_pick(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  update public.draft_settings set
    timer_paused_remaining = greatest(0, ceil(extract(epoch from (timer_end_at - now())))::integer),
    timer_end_at = null, status = 'paused', updated_at = now()
  where id = 1 and status = 'live';
end;
$$;

create or replace function public.admin_resume_pick(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  update public.draft_settings set status = 'live',
    timer_end_at = now() + make_interval(secs => coalesce(timer_paused_remaining, timer_duration)),
    timer_paused_remaining = null, updated_at = now()
  where id = 1 and status = 'paused';
end;
$$;

create or replace function public.admin_reset_timer(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  update public.draft_settings set
    timer_end_at = case when status = 'live' then now() + make_interval(secs => timer_duration) else null end,
    timer_paused_remaining = case when status = 'paused' then timer_duration else null end,
    updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.finish_pick(p_player_id bigint, p_expected_team_id bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.draft_settings%rowtype; p public.picks%rowtype; next_number integer;
begin
  select * into s from public.draft_settings where id = 1 for update;
  if s.status <> 'live' then raise exception 'The commissioner must press START first.'; end if;
  select * into p from public.picks where pick_number = s.current_pick_number for update;
  if p.id is null then raise exception 'There is no current pick.'; end if;
  if p.player_id is not null then raise exception 'This pick is already done.'; end if;
  if p_expected_team_id is not null and p.team_id <> p_expected_team_id then raise exception 'It is not your turn yet.'; end if;
  if not exists(select 1 from public.players where id = p_player_id and drafted = false) then raise exception 'That player is not available.'; end if;

  update public.players set drafted = true where id = p_player_id;
  update public.picks set player_id = p_player_id, status = 'selected', selected_at = now() where id = p.id;
  select min(pick_number) into next_number from public.picks where pick_number > p.pick_number and player_id is null;
  if next_number is null then
    update public.draft_settings set status = 'complete', timer_end_at = null, timer_paused_remaining = null, updated_at = now() where id = 1;
  else
    update public.draft_settings set current_pick_number = next_number, status = 'waiting', timer_end_at = null,
      timer_paused_remaining = null, updated_at = now() where id = 1;
  end if;
end;
$$;

create or replace function public.admin_make_pick(p_password text, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  perform public.finish_pick(p_player_id, null);
end;
$$;

create or replace function public.team_make_pick(p_team_id bigint, p_team_password text, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.validate_team_password(p_team_id, p_team_password) then raise exception 'Wrong team password.'; end if;
  perform public.finish_pick(p_player_id, p_team_id);
end;
$$;

create or replace function public.admin_undo_last_pick(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare last_pick public.picks%rowtype;
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  select * into last_pick from public.picks where player_id is not null order by pick_number desc limit 1;
  if last_pick.id is null then raise exception 'There is no pick to undo.'; end if;
  update public.players set drafted = false where id = last_pick.player_id;
  update public.picks set player_id = null, status = 'pending', selected_at = null where id = last_pick.id;
  update public.draft_settings set current_pick_number = last_pick.pick_number, status = 'waiting', timer_end_at = null,
    timer_paused_remaining = null, updated_at = now() where id = 1;
end;
$$;

create or replace function public.admin_set_display_message(p_password text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  if coalesce(trim(p_message),'') = '' then raise exception 'Type a message first.'; end if;
  update public.draft_settings set display_message = p_message, display_message_on = true, updated_at = now() where id = 1;
end;
$$;

create or replace function public.admin_clear_display_message(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then raise exception 'Wrong commissioner password.'; end if;
  update public.draft_settings set display_message = '', display_message_on = false, updated_at = now() where id = 1;
end;
$$;

revoke execute on function public.touch_settings() from public;
revoke execute on function public.is_owner(text) from public;
revoke execute on function public.is_commissioner(text) from public;
revoke execute on function public.finish_pick(bigint, bigint) from public;

grant execute on function public.validate_owner_password(text) to anon;
grant execute on function public.validate_commissioner_password(text) to anon;
grant execute on function public.validate_display_password(text) to anon;
grant execute on function public.validate_team_password(bigint, text) to anon;
grant execute on function public.owner_set_passwords(text, text, text, text) to anon;
grant execute on function public.owner_set_team_password(text, bigint, text) to anon;
grant execute on function public.owner_list_team_passwords(text) to anon;
grant execute on function public.owner_reset_everything(text) to anon;
grant execute on function public.admin_add_player(text, text) to anon;
grant execute on function public.admin_delete_player(text, bigint) to anon;
grant execute on function public.admin_add_team(text, text) to anon;
grant execute on function public.admin_delete_team(text, bigint) to anon;
grant execute on function public.admin_move_team(text, bigint, text) to anon;
grant execute on function public.admin_generate_order(text, integer) to anon;
grant execute on function public.admin_set_timer_duration(text, integer) to anon;
grant execute on function public.admin_start_pick(text) to anon;
grant execute on function public.admin_pause_pick(text) to anon;
grant execute on function public.admin_resume_pick(text) to anon;
grant execute on function public.admin_reset_timer(text) to anon;
grant execute on function public.admin_make_pick(text, bigint) to anon;
grant execute on function public.team_make_pick(bigint, text, bigint) to anon;
grant execute on function public.admin_undo_last_pick(text) to anon;
grant execute on function public.admin_set_display_message(text, text) to anon;
grant execute on function public.admin_clear_display_message(text) to anon;

-- Add public tables to Supabase Realtime when available.
do $$
begin
  begin alter publication supabase_realtime add table public.draft_settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.teams; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.picks; exception when duplicate_object then null; end;
end $$;
