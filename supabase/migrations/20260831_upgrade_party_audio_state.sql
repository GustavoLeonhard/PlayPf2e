-- Compatibilidad con la versión anterior de Freesound, que ya creó
-- party_audio_state con una columna `sound`.
alter table public.party_audio_state add column if not exists audio_id uuid references public.party_audio_files(id) on delete set null;
alter table public.party_audio_state add column if not exists playing boolean not null default false;
alter table public.party_audio_state add column if not exists position_seconds double precision not null default 0;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'party_audio_state' and column_name = 'sound') then
    alter table public.party_audio_state alter column sound drop not null;
  end if;
end $$;

drop policy if exists "el gm controla audio" on public.party_audio_state;
drop policy if exists "el gm actualiza audio" on public.party_audio_state;
create policy "el gm controla audio" on public.party_audio_state for insert to authenticated
  with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm actualiza audio" on public.party_audio_state for update to authenticated
  using (public.is_party_gm(party_id))
  with check (public.is_party_gm(party_id) and author_id = auth.uid());

do $$ begin alter publication supabase_realtime add table public.party_audio_state; exception when duplicate_object then null; end $$;
