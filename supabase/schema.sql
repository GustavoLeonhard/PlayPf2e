-- Esquema de pf2e-builder.
-- Correr en el SQL Editor de Supabase (Dashboard -> SQL -> New query).
--
-- El contenido de reglas NO vive en la base: son ~11.000 items read-only que se
-- sirven como JSON estatico desde public/data/. Aca solo van los personajes.

create table if not exists public.characters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',
  level       int  not null default 1,
  -- Elecciones del personaje (ancestria, clase, feats, boosts). Versionado con "v".
  build       jsonb not null,
  -- Estado efimero: HP actual, condiciones, hero points, focus. Ciclo de vida
  -- distinto al de build, por eso va en su propia columna.
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists characters_user_id_idx on public.characters (user_id);

-- Cada usuario ve y toca solo sus personajes.
alter table public.characters enable row level security;

drop policy if exists "own characters" on public.characters;
create policy "own characters" on public.characters
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at automatico
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists characters_touch_updated_at on public.characters;
create trigger characters_touch_updated_at
  before update on public.characters
  for each row execute function public.touch_updated_at();
