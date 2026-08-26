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

-- ---------------------------------------------------------------- avatar
-- El avatar viaja como data URL en la misma fila del perfil, igual que el
-- retrato del personaje: son 256x256 en JPEG, unos pocos KB. Montar Storage
-- para eso seria mas piezas moviles de las que hacen falta.
alter table public.profiles add column if not exists avatar text not null default '';


-- ============================================================================
-- FASE 2: el chat de la partida
--
-- El chat y las tiradas son LA MISMA cosa: un mensaje con distinto contenido.
-- Tenerlos en una tabla los ordena juntos en el tiempo sin mezclar dos consultas.
-- ============================================================================
create table if not exists public.party_messages (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references public.parties (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'texto' check (kind in ('texto', 'tirada')),
  body       text not null default '',
  -- El RollResult entero, no un texto ya armado: asi el chat puede mostrar la
  -- tirada con el mismo formato que la hoja (total, desglose, dano, critico).
  roll       jsonb,
  -- Quien tira elige quien la ve. Se filtra ACA y no en el cliente: una tirada
  -- privada que igual viaja al navegador del otro no es privada.
  visibility text not null default 'todos' check (visibility in ('todos', 'master', 'yo')),
  created_at timestamptz not null default now()
);

create index if not exists party_messages_party_idx on public.party_messages (party_id, created_at);

alter table public.party_messages enable row level security;

-- Lectura: los de la mesa ven los publicos; los privados solo su autor, y los
-- de 'master' tambien el que dirige.
drop policy if exists "leer mensajes de mi mesa" on public.party_messages;
create policy "leer mensajes de mi mesa" on public.party_messages
  for select to authenticated
  using (
    public.is_party_member(party_id)
    and (
      visibility = 'todos'
      or author_id = auth.uid()
      or (visibility = 'master' and public.is_party_gm(party_id))
    )
  );

-- Escritura: solo en mesas donde estas, y solo a tu nombre.
drop policy if exists "escribir en mi mesa" on public.party_messages;
create policy "escribir en mi mesa" on public.party_messages
  for insert to authenticated
  with check (public.is_party_member(party_id) and author_id = auth.uid());

-- Borrar lo propio: un mensaje mandado por error. No se editan: en una mesa,
-- reescribir una tirada pasada es justo lo que no se quiere poder hacer.
drop policy if exists "borrar lo mio" on public.party_messages;
create policy "borrar lo mio" on public.party_messages
  for delete to authenticated using (author_id = auth.uid());

-- Realtime: sin esto los mensajes llegan solo al recargar.
alter publication supabase_realtime add table public.party_messages;


-- ============================================================================
-- FASE 2: las notas de la mesa
--
-- Todas compartidas por ahora. `author_id` se guarda igual desde el principio:
-- cuando queramos notas propias es una politica de RLS, no una migracion
-- adivinando quien escribio que.
-- ============================================================================
create table if not exists public.party_notes (
  id         uuid primary key default gen_random_uuid(),
  party_id   uuid not null references public.parties (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists party_notes_party_idx on public.party_notes (party_id, updated_at desc);

-- El trigger de updated_at ya existe (lo usa characters).
drop trigger if exists party_notes_touch_updated_at on public.party_notes;
create trigger party_notes_touch_updated_at
  before update on public.party_notes
  for each row execute function public.touch_updated_at();

alter table public.party_notes enable row level security;

-- Compartidas: cualquiera de la mesa lee, escribe y edita. Borrar tambien:
-- una nota de la mesa no tiene dueno, y pedirle al autor que la borre seria
-- trabarlo todo cuando esa persona no esta.
drop policy if exists "notas de mi mesa" on public.party_notes;
create policy "notas de mi mesa" on public.party_notes
  for all to authenticated
  using (public.is_party_member(party_id))
  with check (public.is_party_member(party_id));

alter publication supabase_realtime add table public.party_notes;

-- ============================================================================
-- Fondos compartidos de la mesa. Los archivos van a Storage; Postgres guarda
-- solo su ruta y permite que cualquier integrante sume escenas.
-- ============================================================================
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
alter publication supabase_realtime add table public.party_scenes;

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

-- Archivos adjuntos: una mesa puede tener hasta 10 MB de imágenes (1 MB cada
-- una); los audios no tienen cupo total, pero cada archivo pesa hasta 20 MB.
alter table public.party_scenes add column if not exists size_bytes bigint not null default 0;
create or replace function public.check_party_scene_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare usado bigint;
begin
  if new.size_bytes < 1 or new.size_bytes > 1048576 then raise exception 'cada imagen debe pesar como máximo 1 MB'; end if;
  select coalesce(sum(size_bytes), 0) into usado from public.party_scenes where party_id = new.party_id;
  if usado + new.size_bytes > 10485760 then raise exception 'la mesa alcanzó el límite total de 10 MB de imágenes'; end if;
  return new;
end $$;
drop trigger if exists party_scenes_check_quota on public.party_scenes;
create trigger party_scenes_check_quota before insert on public.party_scenes for each row execute function public.check_party_scene_quota();
drop policy if exists "escenas de mi mesa" on public.party_scenes;
create policy "escenas de mi mesa" on public.party_scenes for select to authenticated using (public.is_party_member(party_id));
create policy "el gm administra escenas" on public.party_scenes for insert to authenticated with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm edita escenas" on public.party_scenes for update to authenticated using (public.is_party_gm(party_id)) with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm borra escenas" on public.party_scenes for delete to authenticated using (public.is_party_gm(party_id));
update storage.buckets set file_size_limit = 1048576 where id = 'party-scenes';
drop policy if exists "fondos: subir a mi mesa" on storage.objects;
drop policy if exists "fondos: borrar los de mi mesa" on storage.objects;
create policy "fondos: subir el gm" on storage.objects for insert to authenticated with check (bucket_id = 'party-scenes' and owner_id = auth.uid()::text and public.is_party_gm((storage.foldername(name))[1]::uuid));
create policy "fondos: borrar el gm" on storage.objects for delete to authenticated using (bucket_id = 'party-scenes' and public.is_party_gm((storage.foldername(name))[1]::uuid));
create table if not exists public.party_audio_files (id uuid primary key default gen_random_uuid(), party_id uuid not null references public.parties(id) on delete cascade, author_id uuid not null references auth.users(id) on delete cascade, title text not null, storage_path text not null unique, size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880), mime_type text not null, created_at timestamptz not null default now());
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
drop trigger if exists party_audio_files_check_quota on public.party_audio_files;
create trigger party_audio_files_check_quota before insert on public.party_audio_files for each row execute function public.check_party_audio_quota();
alter table public.party_audio_files enable row level security;
create policy "audio de mi mesa" on public.party_audio_files for select to authenticated using (public.is_party_member(party_id));
create policy "el gm administra audio" on public.party_audio_files for insert to authenticated with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm edita audio" on public.party_audio_files for update to authenticated using (public.is_party_gm(party_id)) with check (public.is_party_gm(party_id) and author_id = auth.uid());
create policy "el gm borra audio" on public.party_audio_files for delete to authenticated using (public.is_party_gm(party_id));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('party-audio', 'party-audio', false, 5242880, array['audio/mpeg','audio/ogg','audio/wav','audio/x-wav','audio/webm']) on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "audio: leer los de mi mesa" on storage.objects for select to authenticated using (bucket_id = 'party-audio' and public.is_party_member((storage.foldername(name))[1]::uuid));
create policy "audio: subir el gm" on storage.objects for insert to authenticated with check (bucket_id = 'party-audio' and owner_id = auth.uid()::text and public.is_party_gm((storage.foldername(name))[1]::uuid));
create policy "audio: borrar el gm" on storage.objects for delete to authenticated using (bucket_id = 'party-audio' and public.is_party_gm((storage.foldername(name))[1]::uuid));
