import { Injectable, computed, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { PartyMessage, PartyMessageView, RollPayload } from '../models/party.model';
import { AuthService } from './auth.service';

/**
 * El chat de la mesa: mensajes de texto y tiradas, en el mismo hilo.
 *
 * Se suscribe a Realtime y va agregando lo que llega. Las tiradas privadas ni
 * siquiera viajan hasta acá: las corta la política de la base, así que no hay
 * nada que filtrar del lado del navegador.
 */
@Injectable({ providedIn: 'root' })
export class PartyChatService {
  private auth = inject(AuthService);
  private get client() {
    return this.auth.client;
  }

  readonly disponible = !!this.auth.client;

  private readonly mensajes = signal<PartyMessage[]>([]);
  private readonly nombres = signal<Record<string, { nombre: string; avatar: string }>>({});
  readonly cargando = signal(false);

  /** El hilo listo para pintar: con el nombre de quien escribió y si sos vos. */
  readonly hilo = computed<PartyMessageView[]>(() => {
    const yo = this.auth.userId();
    const quien = this.nombres();
    return this.mensajes().map((m) => ({
      ...m,
      authorName: quien[m.author_id]?.nombre ?? 'Alguien',
      authorAvatar: quien[m.author_id]?.avatar ?? '',
      mine: m.author_id === yo,
    }));
  });

  private canal: RealtimeChannel | null = null;
  private partyId: string | null = null;
  /*
   * Abrir es asíncrono, y entre el `await` del select y la suscripción hay una
   * ventana en la que una segunda llamada pasaba el guardia —`canal` todavía
   * era null— y terminaba agregando callbacks a un canal ya suscripto. Supabase
   * lo rechaza: "cannot add postgres_changes callbacks after subscribe()".
   * Este flag se pone ANTES del primer await, así la segunda llamada rebota.
   */
  private abriendo: string | null = null;

  /**
   * Abre el hilo de una partida: trae lo último y se queda escuchando.
   *
   * Se traen los últimos 200 y no todo: una mesa de un año tiene miles de
   * tiradas y nadie sube tanto. Si hace falta, después se pagina hacia atrás.
   */
  async abrir(partyId: string): Promise<void> {
    if (!this.client) return;
    if (this.abriendo === partyId) return;
    if (this.partyId === partyId && this.canal) return;

    this.abriendo = partyId;
    await this.cerrar();
    this.partyId = partyId;
    this.cargando.set(true);

    try {
      const { data, error } = await this.client
        .from('party_messages')
        .select('*')
        .eq('party_id', partyId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const filas = ((data ?? []) as PartyMessage[]).reverse();
      this.mensajes.set(filas);
      await this.resolverNombres(filas.map((m) => m.author_id));
    } finally {
      this.cargando.set(false);
    }

    this.canal = this.client
      .channel(`party-chat:${partyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'party_messages', filter: `party_id=eq.${partyId}` },
        (payload) => {
          const nuevo = payload.new as PartyMessage;
          // Puede llegar el propio insert por el mismo canal: no se duplica.
          if (this.mensajes().some((m) => m.id === nuevo.id)) return;
          this.mensajes.update((ms) => [...ms, nuevo]);
          void this.resolverNombres([nuevo.author_id]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'party_messages', filter: `party_id=eq.${partyId}` },
        (payload) => {
          const viejo = payload.old as { id: string };
          this.mensajes.update((ms) => ms.filter((m) => m.id !== viejo.id));
        },
      )
      .subscribe();

    this.abriendo = null;
  }

  async cerrar(): Promise<void> {
    // No se toca `abriendo`: lo maneja quien abre, y cerrar forma parte de abrir.
    if (this.canal && this.client) await this.client.removeChannel(this.canal);
    this.canal = null;
    this.partyId = null;
    this.mensajes.set([]);
  }

  async escribir(partyId: string, texto: string): Promise<void> {
    const limpio = texto.trim();
    const autor = this.auth.userId();
    if (!this.client || !limpio || !autor) return;

    const { error } = await this.client
      .from('party_messages')
      .insert({ party_id: partyId, author_id: autor, kind: 'texto', body: limpio });
    if (error) throw error;
  }

  /**
   * Publica una tirada.
   *
   * La llama la hoja, no la mesa: una tirada vale igual desde la hoja abierta
   * en el teléfono que desde la ventana de la mesa, y así hay un solo camino.
   */
  async publicarTirada(
    partyId: string,
    roll: RollPayload,
    visibility: PartyMessage['visibility'] = 'todos',
  ): Promise<void> {
    const autor = this.auth.userId();
    if (!this.client || !autor) return;

    const { error } = await this.client
      .from('party_messages')
      .insert({ party_id: partyId, author_id: autor, kind: 'tirada', body: roll.label, roll, visibility });
    if (error) throw error;
  }

  async borrar(id: string): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.from('party_messages').delete().eq('id', id);
    if (error) throw error;
    this.mensajes.update((ms) => ms.filter((m) => m.id !== id));
  }

  /**
   * Los nombres de quienes escribieron.
   *
   * Van aparte porque PostgREST no puede embeber `profiles` desde
   * `party_messages`: la clave foránea apunta a `auth.users`, no a la tabla de
   * perfiles. Ya nos pasó con los miembros de la partida.
   */
  private async resolverNombres(ids: string[]): Promise<void> {
    if (!this.client) return;
    const faltan = [...new Set(ids)].filter((id) => !this.nombres()[id]);
    if (!faltan.length) return;

    const { data } = await this.client.from('profiles').select('id, display_name, avatar').in('id', faltan);
    const nuevos = { ...this.nombres() };
    for (const fila of data ?? []) {
      nuevos[fila.id as string] = {
        nombre: (fila.display_name as string) || 'Alguien',
        avatar: (fila.avatar as string) ?? '',
      };
    }
    this.nombres.set(nuevos);
  }
}
