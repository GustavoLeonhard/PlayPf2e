-- Ejecutar después de 20260826_party_files.sql si esa migración ya se aplicó.
-- Permite que el GM cambie el nombre visible de imágenes y audios.

drop policy if exists "el gm edita escenas" on public.party_scenes;
create policy "el gm edita escenas" on public.party_scenes for update to authenticated
  using (public.is_party_gm(party_id))
  with check (public.is_party_gm(party_id) and author_id = auth.uid());

drop policy if exists "el gm edita audio" on public.party_audio_files;
create policy "el gm edita audio" on public.party_audio_files for update to authenticated
  using (public.is_party_gm(party_id))
  with check (public.is_party_gm(party_id) and author_id = auth.uid());
