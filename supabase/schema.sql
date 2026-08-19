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


-- ============================================================================
-- PARTIDAS (fase 1)
--
-- Una partida es un grupo: el GM la crea, comparte un link y los demas entran
-- cuando quieren. NO hay estado de "empezada": quien esta jugando ahora lo dice
-- la presencia de Realtime, no una fila de esta base.
-- ============================================================================

-- Perfil publico. Hace falta aunque las invitaciones sean por link: para mostrar
-- "Gera tiro 18" el navegador necesita un nombre, y auth.users no se puede
-- consultar desde el cliente. El mail no se expone.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Cualquiera autenticado puede leer los nombres (los necesita para el chat);
-- cada uno edita solo el suyo.
drop policy if exists "profiles legibles" on public.profiles;
create policy "profiles legibles" on public.profiles
  for select to authenticated using (true);

drop policy if exists "edito mi perfil" on public.profiles;
create policy "edito mi perfil" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Al registrarse, se crea el perfil con la parte del mail antes del arroba.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para las cuentas que ya existian antes de esta migracion.
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;


create table if not exists public.parties (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Partida sin nombre',
  gm_id        uuid not null references auth.users (id) on delete cascade,
  -- El token del link de invitacion. Se puede rotar si se filtra.
  invite_token uuid not null default gen_random_uuid(),
  created_at   timestamptz not null default now()
);

create index if not exists parties_gm_idx on public.parties (gm_id);
create unique index if not exists parties_invite_token_idx on public.parties (invite_token);


create table if not exists public.party_members (
  party_id     uuid not null references public.parties (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'player' check (role in ('gm', 'player')),
  -- Con que personaje entro. Puede entrar sin uno y elegirlo despues; si borra
  -- el personaje, queda en null y sigue en la mesa.
  character_id uuid references public.characters (id) on delete set null,
  joined_at    timestamptz not null default now(),
  primary key (party_id, user_id)
);

create index if not exists party_members_user_idx on public.party_members (user_id);
create index if not exists party_members_character_idx on public.party_members (character_id);


-- ----------------------------------------------------------------------------
-- Estas dos funciones existen por un motivo puntual: una policy sobre
-- party_members que pregunte "sos miembro?" consultando party_members entra en
-- RECURSION INFINITA. Con security definer la consulta corre sin RLS y se corta
-- el circulo. Es el error clasico de Supabase con tablas de membresia.
-- ----------------------------------------------------------------------------
create or replace function public.is_party_member(party uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.party_members m
    where m.party_id = party and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_party_gm(party uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.parties p
    where p.id = party and p.gm_id = auth.uid()
  );
$$;


alter table public.parties enable row level security;

drop policy if exists "veo mis partidas" on public.parties;
create policy "veo mis partidas" on public.parties
  for select to authenticated
  using (gm_id = auth.uid() or public.is_party_member(id));

drop policy if exists "creo partidas" on public.parties;
create policy "creo partidas" on public.parties
  for insert to authenticated
  with check (gm_id = auth.uid());

-- Solo el GM cambia el nombre o rota el token.
drop policy if exists "el gm edita su partida" on public.parties;
create policy "el gm edita su partida" on public.parties
  for update to authenticated
  using (gm_id = auth.uid())
  with check (gm_id = auth.uid());

drop policy if exists "el gm borra su partida" on public.parties;
create policy "el gm borra su partida" on public.parties
  for delete to authenticated
  using (gm_id = auth.uid());


alter table public.party_members enable row level security;

drop policy if exists "veo a los miembros de mi mesa" on public.party_members;
create policy "veo a los miembros de mi mesa" on public.party_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_party_member(party_id));

-- Entrar es cosa de cada uno: se suma a si mismo. El link no se valida aca sino
-- en la funcion join_party_by_token, que es la unica forma de entrar sin ser
-- miembro todavia.
drop policy if exists "me sumo yo" on public.party_members;
create policy "me sumo yo" on public.party_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_party_gm(party_id) or public.is_party_member(party_id))
  );

drop policy if exists "edito mi lugar en la mesa" on public.party_members;
create policy "edito mi lugar en la mesa" on public.party_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Cada uno se va cuando quiere; el GM ademas puede echar.
drop policy if exists "me voy o me echan" on public.party_members;
create policy "me voy o me echan" on public.party_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_party_gm(party_id));


-- Crear la partida ya sienta al GM en ella: es miembro como cualquier otro,
-- con rol distinto.
create or replace function public.seat_gm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.party_members (party_id, user_id, role)
  values (new.id, new.gm_id, 'gm')
  on conflict (party_id, user_id) do nothing;
  return new;
end $$;

drop trigger if exists parties_seat_gm on public.parties;
create trigger parties_seat_gm
  after insert on public.parties
  for each row execute function public.seat_gm();


-- ----------------------------------------------------------------------------
-- Unirse por link.
--
-- Va como funcion y no como policy porque quien entra TODAVIA no es miembro, y
-- por lo tanto no puede ni leer la partida para saber que existe. La funcion
-- valida el token con permisos elevados y suma al usuario.
-- ----------------------------------------------------------------------------
create or replace function public.join_party_by_token(token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  destino uuid;
begin
  if auth.uid() is null then
    raise exception 'hay que iniciar sesion para unirse';
  end if;

  select id into destino from public.parties where invite_token = token;
  if destino is null then
    raise exception 'ese link de invitacion no existe o fue rotado';
  end if;

  insert into public.party_members (party_id, user_id, role)
  values (destino, auth.uid(), 'player')
  on conflict (party_id, user_id) do nothing;

  return destino;
end $$;

-- Y la contracara: mirar a que partida lleva un link ANTES de entrar, para poder
-- mostrar "te invitaron a la mesa X" sin sumar a nadie todavia.
create or replace function public.peek_party_by_token(token uuid)
returns table (id uuid, name text) language sql security definer stable set search_path = public as $$
  select p.id, p.name from public.parties p where p.invite_token = token;
$$;
