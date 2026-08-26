-- Fondo activo compartido: solo el GM lo elige, todos lo ven.
create table if not exists public.party_scene_state (
  party_id uuid primary key references public.parties(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  scene_id uuid references public.party_scenes(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.party_scene_state enable row level security;
create policy "estado de fondo de mi mesa" on public.party_scene_state for select to authenticated using (public.is_party_member(party_id));
create policy "el gm controla fondo" on public.party_scene_state for insert to authenticated with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm actualiza fondo" on public.party_scene_state for update to authenticated using (public.is_party_gm(party_id)) with check (public.is_party_gm(party_id) and author_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.party_scene_state; exception when duplicate_object then null; end $$;
