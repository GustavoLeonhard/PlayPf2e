create table if not exists public.party_audio_state (
  party_id uuid primary key references public.parties(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  sound jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.party_audio_state enable row level security;
create policy "audio de mi mesa" on public.party_audio_state for all to authenticated using (public.is_party_member(party_id)) with check (public.is_party_member(party_id));
do $$ begin alter publication supabase_realtime add table public.party_audio_state; exception when duplicate_object then null; end $$;
