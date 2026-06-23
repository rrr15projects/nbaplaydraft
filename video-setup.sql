-- Basketball Draft: video and image upload with big-screen playback add-on
--
-- Run your existing setup.sql FIRST.
-- Then run this file once in Supabase SQL Editor.
--
-- This is an additive migration. It does not remove players, teams, or picks.

create extension if not exists pgcrypto;

create table if not exists public.draft_videos (
  id bigint generated always as identity primary key,
  name text not null,
  storage_path text not null unique,
  mime_type text not null default 'video/mp4',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.draft_settings
  add column if not exists active_video_id bigint,
  add column if not exists video_playing boolean not null default false,
  add column if not exists video_started_at timestamptz,
  add column if not exists video_play_token uuid,
  add column if not exists video_muted boolean not null default false;

do $$
begin
  alter table public.draft_settings
    add constraint draft_settings_active_video_fk
    foreign key (active_video_id)
    references public.draft_videos(id)
    on delete set null;
exception
  when duplicate_object then null;
end;
$$;

alter table public.draft_videos enable row level security;

revoke all on table public.draft_videos from anon, authenticated;
grant usage, select on sequence public.draft_videos_id_seq to anon, authenticated;

-- Create a public bucket for MP4 and WebM files.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'draft-videos',
  'draft-videos',
  true,
  104857600,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public viewing plus browser uploads/deletes for this one bucket.
-- The commissioner password still protects the database controls.
drop policy if exists "Draft videos public read" on storage.objects;
create policy "Draft videos public read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'draft-videos');

drop policy if exists "Draft videos upload" on storage.objects;
create policy "Draft videos upload"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'draft-videos');

drop policy if exists "Draft videos delete" on storage.objects;
create policy "Draft videos delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'draft-videos');

create or replace function public.admin_add_video(
  p_password text,
  p_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  if not public.is_commissioner(p_password) then
    raise exception 'Wrong commissioner password.';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Type a media name.';
  end if;

  if coalesce(trim(p_storage_path), '') = '' then
    raise exception 'Missing media storage path.';
  end if;

  if coalesce(p_mime_type, '') not in (
    'video/mp4', 'video/webm',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif'
  ) then
    raise exception 'Supported files: MP4, WebM, JPG, PNG, WebP, and GIF.';
  end if;

  if coalesce(p_size_bytes, 0) <= 0 or p_size_bytes > 104857600 then
    raise exception 'The media file must be 100 MB or smaller.';
  end if;

  insert into public.draft_videos (
    name,
    storage_path,
    mime_type,
    size_bytes
  )
  values (
    trim(p_name),
    trim(p_storage_path),
    p_mime_type,
    p_size_bytes
  )
  returning id into new_id;

  update public.draft_settings
  set updated_at = now()
  where id = 1;

  return new_id;
end;
$$;

create or replace function public.admin_list_videos(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if not public.is_commissioner(p_password) then
    raise exception 'Wrong commissioner password.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'storage_path', storage_path,
        'mime_type', mime_type,
        'size_bytes', size_bytes,
        'created_at', created_at
      )
      order by created_at desc, id desc
    ),
    '[]'::jsonb
  )
  into result
  from public.draft_videos;

  return result;
end;
$$;

create or replace function public.admin_play_video(
  p_password text,
  p_video_id bigint,
  p_muted boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token uuid := gen_random_uuid();
begin
  if not public.is_commissioner(p_password) then
    raise exception 'Wrong commissioner password.';
  end if;

  if not exists (
    select 1 from public.draft_videos where id = p_video_id
  ) then
    raise exception 'Video not found.';
  end if;

  update public.draft_settings
  set active_video_id = p_video_id,
      video_playing = true,
      video_started_at = now(),
      video_play_token = new_token,
      video_muted = coalesce(p_muted, false),
      display_message = '',
      display_message_on = false,
      updated_at = now()
  where id = 1;

  return new_token;
end;
$$;

create or replace function public.admin_stop_video(p_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then
    raise exception 'Wrong commissioner password.';
  end if;

  update public.draft_settings
  set active_video_id = null,
      video_playing = false,
      video_started_at = null,
      video_play_token = gen_random_uuid(),
      video_muted = false,
      updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.admin_delete_video(
  p_password text,
  p_video_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_commissioner(p_password) then
    raise exception 'Wrong commissioner password.';
  end if;

  update public.draft_settings
  set active_video_id = null,
      video_playing = false,
      video_started_at = null,
      video_play_token = gen_random_uuid(),
      video_muted = false,
      updated_at = now()
  where id = 1
    and active_video_id = p_video_id;

  delete from public.draft_videos
  where id = p_video_id;

  if not found then
    raise exception 'Video not found.';
  end if;
end;
$$;

create or replace function public.get_active_video()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when s.video_playing and v.id is not null then
      jsonb_build_object(
        'id', v.id,
        'name', v.name,
        'storage_path', v.storage_path,
        'mime_type', v.mime_type,
        'size_bytes', v.size_bytes,
        'started_at', s.video_started_at,
        'play_token', s.video_play_token,
        'muted', s.video_muted
      )
    else null
  end
  from public.draft_settings s
  left join public.draft_videos v
    on v.id = s.active_video_id
  where s.id = 1;
$$;

create or replace function public.public_video_finished(
  p_video_id bigint,
  p_play_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.draft_settings
  set active_video_id = null,
      video_playing = false,
      video_started_at = null,
      video_play_token = gen_random_uuid(),
      video_muted = false,
      updated_at = now()
  where id = 1
    and video_playing = true
    and active_video_id = p_video_id
    and video_play_token = p_play_token;
end;
$$;

revoke execute on function public.admin_add_video(text, text, text, text, bigint) from public;
revoke execute on function public.admin_list_videos(text) from public;
revoke execute on function public.admin_play_video(text, bigint, boolean) from public;
revoke execute on function public.admin_stop_video(text) from public;
revoke execute on function public.admin_delete_video(text, bigint) from public;
revoke execute on function public.get_active_video() from public;
revoke execute on function public.public_video_finished(bigint, uuid) from public;

grant execute on function public.admin_add_video(text, text, text, text, bigint) to anon;
grant execute on function public.admin_list_videos(text) to anon;
grant execute on function public.admin_play_video(text, bigint, boolean) to anon;
grant execute on function public.admin_stop_video(text) to anon;
grant execute on function public.admin_delete_video(text, bigint) to anon;
grant execute on function public.get_active_video() to anon;
grant execute on function public.public_video_finished(bigint, uuid) to anon;

do $$
begin
  begin
    alter publication supabase_realtime add table public.draft_videos;
  exception
    when duplicate_object then null;
  end;
end;
$$;
