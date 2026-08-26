-- Archivos adjuntos de una partida. Ejecutar una vez en el SQL Editor.
-- Solo el GM puede administrarlos; los miembros pueden leerlos para usarlos
-- dentro de la mesa.

alter table public.party_scenes add column if not exists size_bytes bigint not null default 0;

update public.party_scenes s
set size_bytes = coalesce((o.metadata->>'size')::bigint, 0)
from storage.objects o
where o.bucket_id = 'party-scenes' and o.name = s.storage_path and s.size_bytes = 0;

create or replace function public.check_party_scene_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare usado bigint;
begin
  if new.size_bytes < 1 or new.size_bytes > 1048576 then
    raise exception 'cada imagen debe pesar como máximo 1 MB';
  end if;
  select coalesce(sum(size_bytes), 0) into usado from public.party_scenes where party_id = new.party_id;
  if usado + new.size_bytes > 10485760 then
    raise exception 'la mesa alcanzó el límite total de 10 MB de imágenes';
  end if;
  return new;
end $$;

drop trigger if exists party_scenes_check_quota on public.party_scenes;
create trigger party_scenes_check_quota before insert on public.party_scenes
for each row execute function public.check_party_scene_quota();

drop policy if exists "escenas de mi mesa" on public.party_scenes;
create policy "escenas de mi mesa" on public.party_scenes for select to authenticated
  using (public.is_party_member(party_id));
create policy "el gm administra escenas" on public.party_scenes for insert to authenticated
  with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm edita escenas" on public.party_scenes for update to authenticated
  using (public.is_party_gm(party_id)) with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm borra escenas" on public.party_scenes for delete to authenticated
  using (public.is_party_gm(party_id));

update storage.buckets set file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'party-scenes';

drop policy if exists "fondos: subir a mi mesa" on storage.objects;
drop policy if exists "fondos: borrar los de mi mesa" on storage.objects;
create policy "fondos: subir el gm" on storage.objects for insert to authenticated
  with check (bucket_id = 'party-scenes' and owner_id = auth.uid()::text and public.is_party_gm((storage.foldername(name))[1]::uuid));
create policy "fondos: borrar el gm" on storage.objects for delete to authenticated
  using (bucket_id = 'party-scenes' and public.is_party_gm((storage.foldername(name))[1]::uuid));

create table if not exists public.party_audio_files (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  mime_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists party_audio_files_party_idx on public.party_audio_files(party_id, created_at);
create or replace function public.check_party_audio_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare usado bigint;
begin
  if new.size_bytes < 1 or new.size_bytes > 5242880 then raise exception 'cada audio debe pesar como máximo 5 MB'; end if;
  select coalesce(sum(size_bytes), 0) into usado from public.party_audio_files where party_id = new.party_id;
  if usado + new.size_bytes > 15728640 then raise exception 'la mesa alcanzó el límite total de 15 MB de audio'; end if;
  return new;
end $$;
create trigger party_audio_files_check_quota before insert on public.party_audio_files for each row execute function public.check_party_audio_quota();
alter table public.party_audio_files enable row level security;
create policy "audio de mi mesa" on public.party_audio_files for select to authenticated
  using (public.is_party_member(party_id));
create policy "el gm administra audio" on public.party_audio_files for insert to authenticated
  with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm edita audio" on public.party_audio_files for update to authenticated
  using (public.is_party_gm(party_id)) with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm borra audio" on public.party_audio_files for delete to authenticated
  using (public.is_party_gm(party_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('party-audio', 'party-audio', false, 5242880, array['audio/mpeg','audio/ogg','audio/wav','audio/x-wav','audio/webm'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "audio: leer los de mi mesa" on storage.objects for select to authenticated
  using (bucket_id = 'party-audio' and public.is_party_member((storage.foldername(name))[1]::uuid));
create policy "audio: subir el gm" on storage.objects for insert to authenticated
  with check (bucket_id = 'party-audio' and owner_id = auth.uid()::text and public.is_party_gm((storage.foldername(name))[1]::uuid));
create policy "audio: borrar el gm" on storage.objects for delete to authenticated
  using (bucket_id = 'party-audio' and public.is_party_gm((storage.foldername(name))[1]::uuid));
