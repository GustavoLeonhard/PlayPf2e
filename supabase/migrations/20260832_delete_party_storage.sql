-- Borrado completo de una partida: además de sus filas, elimina los archivos
-- físicos de Storage que viven bajo la carpeta con su UUID.
create or replace function public.delete_party_storage_files()
returns trigger language plpgsql security definer set search_path = public, storage as $$
begin
  delete from storage.objects
  where bucket_id in ('party-scenes', 'party-audio')
    and name like old.id::text || '/%';
  return old;
end $$;

drop trigger if exists parties_delete_storage_files on public.parties;
create trigger parties_delete_storage_files
  before delete on public.parties
  for each row execute function public.delete_party_storage_files();
