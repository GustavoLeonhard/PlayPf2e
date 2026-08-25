-- Ejecutar este archivo SOLO una vez en el SQL Editor de Supabase.
-- Crea los fondos compartidos sin reejecutar el schema completo.

create table if not exists public.party_scenes (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists party_scenes_party_idx on public.party_scenes(party_id, created_at);
alter table public.party_scenes enable row level security;
drop policy if exists "escenas de mi mesa" on public.party_scenes;
create policy "escenas de mi mesa" on public.party_scenes for all to authenticated
  using (public.is_party_member(party_id)) with check (public.is_party_member(party_id) and author_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('party-scenes', 'party-scenes', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "fondos: leer los de mi mesa" on storage.objects;
create policy "fondos: leer los de mi mesa" on storage.objects for select to authenticated
  using (bucket_id = 'party-scenes' and public.is_party_member((storage.foldername(name))[1]::uuid));
drop policy if exists "fondos: subir a mi mesa" on storage.objects;
create policy "fondos: subir a mi mesa" on storage.objects for insert to authenticated
  with check (bucket_id = 'party-scenes' and owner_id = auth.uid()::text and public.is_party_member((storage.foldername(name))[1]::uuid));
drop policy if exists "fondos: borrar los de mi mesa" on storage.objects;
create policy "fondos: borrar los de mi mesa" on storage.objects for delete to authenticated
  using (bucket_id = 'party-scenes' and public.is_party_member((storage.foldername(name))[1]::uuid));

do $$ begin
  alter publication supabase_realtime add table public.party_scenes;
exception when duplicate_object then null;
end $$;
