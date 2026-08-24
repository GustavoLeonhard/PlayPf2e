import { Injectable, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { Party, PartyMember, PartyMemberView, Profile } from '../models/party.model';
import { AuthService } from './auth.service';

/**
 * Partidas: crear, entrar por link, ver quién está.
 *
 * A diferencia de CharacterService, esto NO tiene modo local: una mesa con un
 * solo navegador no es una mesa. Sin Supabase configurado, la sección no anda.
 */
/**
 * Los errores de Supabase no son `Error`: son objetos planos con `message` y
 * `code`. Sin esto, la pantalla muestra "[object Object]".
 *
 * El caso más probable la primera vez es que falten las tablas, así que ese se
 * traduce a la única acción que lo arregla.
 */
export function mensajeDeError(e: unknown): string {
  const obj = (e ?? {}) as { message?: string; code?: string; details?: string };
  const texto = obj.message ?? (typeof e === 'string' ? e : '') ?? '';

  const faltanTablas =
    obj.code === '42P01' ||
    obj.code === 'PGRST205' ||
    /could not find the table|relation .* does not exist/i.test(texto);
  if (faltanTablas) {
    return 'Faltan las tablas de partidas en la base: corré supabase/schema.sql en el SQL Editor de Supabase.';
  }

  return texto || 'Algo falló y la base no dijo por qué.';
}

@Injectable({ providedIn: 'root' })
export class PartyService {
  private auth = inject(AuthService);

  readonly parties = signal<Party[]>([]);
  readonly loading = signal(false);

  /** Quién está conectado a la partida abierta, por id de usuario. */
  readonly online = signal<Set<string>>(new Set());
  private channel: RealtimeChannel | null = null;

  private get client() {
    const client = this.auth.client;
    if (!client) throw new Error('Las partidas necesitan Supabase configurado.');
    return client;
  }

  get disponible() {
    return !!this.auth.client;
  }

  async list(): Promise<Party[]> {
    this.loading.set(true);
    try {
      const { data, error } = await this.client
        .from('parties')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Party[];
      this.parties.set(rows);
      return rows;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * En qué partida está un personaje, si está en alguna.
   *
   * Un personaje se sienta en UNA mesa: es la decisión que tomamos cuando
   * dijimos que cambiarlo tenía que ser algo excepcional.
   */
  /** Con qué personaje me senté en esta mesa. */
  async myCharacterId(partyId: string): Promise<string | null> {
    const yo = this.auth.userId();
    if (!this.client || !yo) return null;
    const { data } = await this.client
      .from('party_members')
      .select('character_id')
      .eq('party_id', partyId)
      .eq('user_id', yo)
      .maybeSingle();
    return (data?.character_id as string) ?? null;
  }

  async partyOfCharacter(characterId: string): Promise<string | null> {
    if (!this.client) return null;
    const { data } = await this.client
      .from('party_members')
      .select('party_id')
      .eq('character_id', characterId)
      .maybeSingle();
    return (data?.party_id as string) ?? null;
  }

  async get(id: string): Promise<Party | null> {
    const { data } = await this.client.from('parties').select('*').eq('id', id).single();
    return (data as Party) ?? null;
  }

  async create(name: string): Promise<Party> {
    const { data, error } = await this.client
      .from('parties')
      .insert({ name: name.trim() || 'Partida sin nombre', gm_id: this.auth.userId() })
      .select()
      .single();
    if (error) throw error;
    // El trigger de la base ya sentó al GM como miembro.
    return data as Party;
  }

  async rename(id: string, name: string) {
    await this.client.from('parties').update({ name: name.trim() }).eq('id', id);
  }

  /** Si el link se filtró, rotar el token invalida el viejo sin tocar la mesa. */
  async rotateInvite(id: string): Promise<string> {
    const { data, error } = await this.client
      .from('parties')
      .update({ invite_token: crypto.randomUUID() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return (data as Party).invite_token;
  }

  async remove(id: string) {
    await this.client.from('parties').delete().eq('id', id);
    this.parties.update((ps) => ps.filter((p) => p.id !== id));
  }

  // ------------------------------------------------------------- invitaciones

  /**
   * Mirar a dónde lleva un link sin entrar todavía: sirve para poder decir
   * "te invitaron a la mesa X" antes de que el usuario acepte.
   */
  async peek(token: string): Promise<{ id: string; name: string } | null> {
    const { data, error } = await this.client.rpc('peek_party_by_token', { token });
    if (error) return null;
    const filas = (data ?? []) as { id: string; name: string }[];
    return filas[0] ?? null;
  }

  /**
   * Entrar por link. Va por una función de la base porque quien entra todavía no
   * es miembro y no puede ni leer la partida para saber que existe.
   */
  async joinByToken(token: string): Promise<string> {
    const { data, error } = await this.client.rpc('join_party_by_token', { token });
    if (error) throw error;
    return data as string;
  }

  async leave(partyId: string) {
    await this.client.from('party_members').delete().eq('party_id', partyId).eq('user_id', this.auth.userId());
  }

  async kick(partyId: string, userId: string) {
    await this.client.from('party_members').delete().eq('party_id', partyId).eq('user_id', userId);
  }

  // ----------------------------------------------------------------- miembros

  /**
   * Los miembros con su nombre y el de su personaje.
   *
   * Los nombres salen de `profiles` porque auth.users no se puede consultar desde
   * el navegador. Los personajes se piden aparte: hoy cada uno solo puede leer
   * los propios, así que de los ajenos vuelve el nombre en null hasta que exista
   * la vista del GM (fase 5).
   */
  async members(partyId: string): Promise<PartyMemberView[]> {
    const { data, error } = await this.client
      .from('party_members')
      .select('*, characters:character_id (name, level)')
      .eq('party_id', partyId)
      .order('joined_at');
    if (error) throw error;

    const filas = (data ?? []) as (PartyMember & {
      characters: { name: string; level: number } | null;
    })[];

    const perfiles = await this.perfiles(filas.map((m) => m.user_id));
    const conectados = this.online();

    return filas.map((m) => ({
      party_id: m.party_id,
      user_id: m.user_id,
      role: m.role,
      character_id: m.character_id,
      joined_at: m.joined_at,
      displayName: perfiles.get(m.user_id)?.display_name || 'Sin nombre',
      avatar: perfiles.get(m.user_id)?.avatar ?? '',
      characterName: m.characters ? `${m.characters.name} (nivel ${m.characters.level})` : null,
      online: conectados.has(m.user_id),
    }));
  }

  /**
   * El nombre y el avatar de cada uno, en una consulta aparte.
   *
   * No se pueden traer con un embed de PostgREST porque `party_members.user_id`
   * apunta a `auth.users`, no a `profiles`: sin clave foránea entre esas dos
   * tablas, no hay relación que resolver.
   *
   * El avatar viene de `profiles` y no del retrato del personaje a propósito:
   * `characters` es de lectura propia (`auth.uid() = user_id`), así que el
   * retrato del PJ de otro jugador es ilegible. El perfil sí es público entre
   * autenticados, que es de donde el chat ya saca las caritas.
   */
  private async perfiles(userIds: string[]): Promise<Map<string, Profile>> {
    const unicos = [...new Set(userIds)];
    if (!unicos.length) return new Map();

    const { data } = await this.client.from('profiles').select('id, display_name, avatar').in('id', unicos);
    return new Map(((data ?? []) as Profile[]).map((p) => [p.id, p]));
  }

  /** Sentarse con un personaje, o levantarse pasando null. */
  async setCharacter(partyId: string, characterId: string | null) {
    await this.client
      .from('party_members')
      .update({ character_id: characterId })
      .eq('party_id', partyId)
      .eq('user_id', this.auth.userId());
  }

  /**
   * En qué partida está sentado cada personaje del usuario.
   *
   * La lista de personajes lo usa para mostrar "juega en tal mesa". Va por
   * `party_members` y no al revés porque es ahí donde vive la relación.
   */
  async partiesByCharacter(): Promise<Map<string, string[]>> {
    const { data, error } = await this.client
      .from('party_members')
      .select('character_id, parties:party_id (name)')
      .eq('user_id', this.auth.userId())
      .not('character_id', 'is', null);
    if (error) throw error;

    // El tipo generado dice que el embed viene como arreglo aunque en runtime sea
    // un objeto: se normalizan las dos formas y listo.
    type Fila = { character_id: string | null; parties: { name: string } | { name: string }[] | null };

    const salida = new Map<string, string[]>();
    for (const fila of (data ?? []) as unknown as Fila[]) {
      if (!fila.character_id || !fila.parties) continue;
      const nombres = (Array.isArray(fila.parties) ? fila.parties : [fila.parties]).map((p) => p.name);
      salida.set(fila.character_id, [...(salida.get(fila.character_id) ?? []), ...nombres]);
    }
    return salida;
  }

  // ---------------------------------------------------------------- presencia

  /**
   * Quién está mirando la partida ahora. Es efímero a propósito: no se guarda
   * nada, cuando cerrás la pestaña desaparecés.
   */
  async watchPresence(partyId: string) {
    await this.unwatchPresence();
    const userId = this.auth.userId();
    if (!userId) return;

    const canal = this.client.channel(`party:${partyId}`, { config: { presence: { key: userId } } });

    canal.on('presence', { event: 'sync' }, () => {
      this.online.set(new Set(Object.keys(canal.presenceState())));
    });

    await canal.subscribe(async (estado) => {
      if (estado === 'SUBSCRIBED') await canal.track({ at: new Date().toISOString() });
    });

    this.channel = canal;
  }

  async unwatchPresence() {
    if (!this.channel) return;
    await this.client.removeChannel(this.channel);
    this.channel = null;
    this.online.set(new Set());
  }
}
