-- Estado compartido del reproductor de la mesa.
create table if not exists public.party_audio_state (
  party_id uuid primary key references public.parties(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  audio_id uuid references public.party_audio_files(id) on delete set null,
  playing boolean not null default false,
  position_seconds double precision not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.party_audio_state enable row level security;
drop policy if exists "estado de audio de mi mesa" on public.party_audio_state;
create policy "estado de audio de mi mesa" on public.party_audio_state for select to authenticated using (public.is_party_member(party_id));
create policy "el gm controla audio" on public.party_audio_state for insert to authenticated with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm actualiza audio" on public.party_audio_state for update to authenticated using (public.is_party_gm(party_id)) with check (public.is_party_gm(party_id) and author_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.party_audio_state; exception when duplicate_object then null; end $$;
