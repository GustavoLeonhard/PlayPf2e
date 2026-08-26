-- Ejecutar si ya se aplicó 20260826_party_files.sql.
-- Reduce el audio a 5 MB por archivo y 15 MB por mesa.

alter table public.party_audio_files drop constraint if exists party_audio_files_size_bytes_check;
alter table public.party_audio_files add constraint party_audio_files_size_bytes_check check (size_bytes > 0 and size_bytes <= 5242880);

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
create trigger party_audio_files_check_quota before insert on public.party_audio_files
for each row execute function public.check_party_audio_quota();

update storage.buckets set file_size_limit = 5242880 where id = 'party-audio';
