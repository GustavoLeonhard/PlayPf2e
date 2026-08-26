import { Injectable, computed, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { PartyNote } from '../models/party.model';
import { AuthService } from './auth.service';

/**
 * Las notas compartidas de la mesa.
 *
 * Mismo patrón que el chat: se traen todas y Realtime avisa los cambios. La
 * diferencia es que acá los cambios pisan algo que podés estar editando, así
 * que la ventana de la nota decide qué hacer con lo que llega — este servicio
 * solo lo trae.
 */
@Injectable({ providedIn: 'root' })
export class PartyNotesService {
  private auth = inject(AuthService);
  private get client() {
    return this.auth.client;
  }

  private readonly notas = signal<PartyNote[]>([]);
  /** Notas aún no publicadas: viven solo mientras la mesa está abierta. */
  private readonly borradoresNuevos = signal<PartyNote[]>([]);
  private readonly publicadosDesdeBorrador = new Map<string, string>();
  readonly cargando = signal(false);

  /** Las notas de la mesa, la más tocada primero. */
  readonly lista = computed(() =>
    [...this.notas()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  );

  una = (id: string) => {
    const real = this.publicadosDesdeBorrador.get(id) ?? id;
    return this.notas().find((n) => n.id === real) ?? this.borradoresNuevos().find((n) => n.id === id) ?? null;
  };
  readonly borradores = computed(() => this.borradoresNuevos());

  private canal: RealtimeChannel | null = null;
  private partyId: string | null = null;
  /** Mismo cuidado que en el chat: abrir es asíncrono y puede reentrar. */
  private abriendo: string | null = null;

  async abrir(partyId: string): Promise<void> {
    if (!this.client) return;
    if (this.abriendo === partyId) return;
    if (this.partyId === partyId && this.canal) return;

    this.abriendo = partyId;
    await this.cerrar();
    this.partyId = partyId;
    this.cargando.set(true);

    try {
      const { data, error } = await this.client.from('party_notes').select('*').eq('party_id', partyId);
      if (error) throw error;
      this.notas.set((data ?? []) as PartyNote[]);
    } finally {
      this.cargando.set(false);
    }

    this.canal = this.client
      .channel(`party-notes:${partyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_notes', filter: `party_id=eq.${partyId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const viejo = payload.old as { id: string };
            this.notas.update((ns) => ns.filter((n) => n.id !== viejo.id));
            return;
          }

          const nota = payload.new as PartyNote;
          this.notas.update((ns) => {
            const at = ns.findIndex((n) => n.id === nota.id);
            if (at < 0) return [...ns, nota];

            /*
             * Un evento viejo no pisa uno nuevo.
             *
             * Al crear una nota y escribir enseguida, el INSERT puede llegar
             * DESPUÉS del UPDATE que acabás de hacer: el payload del insert
             * trae el cuerpo vacío y borraría de la vista lo que escribiste.
             */
            if (nota.updated_at < ns[at].updated_at) return ns;

            const copia = [...ns];
            copia[at] = nota;
            return copia;
          });
        },
      )
      .subscribe();

    this.abriendo = null;
  }

  async cerrar(): Promise<void> {
    if (this.canal && this.client) await this.client.removeChannel(this.canal);
    this.canal = null;
    this.partyId = null;
    this.notas.set([]);
    this.borradoresNuevos.set([]);
    this.publicadosDesdeBorrador.clear();
  }

  async crearBorrador(partyId: string): Promise<PartyNote | null> {
    const autor = this.auth.userId();
    if (!autor) return null;
    const ahora = new Date().toISOString();
    const borrador: PartyNote = { id: `borrador:${crypto.randomUUID()}`, party_id: partyId, author_id: autor, title: 'Nota nueva', body: '', created_at: ahora, updated_at: ahora };
    this.borradoresNuevos.update((notas) => [...notas, borrador]);
    return borrador;
  }

  esBorradorNuevo(id: string) { return id.startsWith('borrador:') && !this.publicadosDesdeBorrador.has(id); }

  async publicarBorrador(id: string, cambios: { title?: string; body?: string }): Promise<PartyNote | null> {
    const borrador = this.borradoresNuevos().find((nota) => nota.id === id);
    if (!borrador || !this.client) return null;
    const { data, error } = await this.client.from('party_notes').insert({ party_id: borrador.party_id, author_id: borrador.author_id, title: cambios.title ?? borrador.title, body: cambios.body ?? borrador.body }).select().single();
    if (error) throw error;
    const nota = data as PartyNote;
    this.notas.update((notas) => [...notas, nota]);
    this.borradoresNuevos.update((notas) => notas.filter((nota) => nota.id !== id));
    this.publicadosDesdeBorrador.set(id, nota.id);
    return nota;
  }

  async crear(partyId: string, title = 'Nota nueva'): Promise<PartyNote | null> {
    const autor = this.auth.userId();
    if (!this.client || !autor) return null;

    const { data, error } = await this.client
      .from('party_notes')
      .insert({ party_id: partyId, author_id: autor, title })
      .select()
      .single();
    if (error) throw error;

    const nota = data as PartyNote;
    // Se agrega ya: el Realtime del propio insert puede tardar y la ventana
    // tiene que poder abrirse en el acto.
    this.notas.update((ns) => (ns.some((n) => n.id === nota.id) ? ns : [...ns, nota]));
    return nota;
  }

  /**
   * Guarda solo si nadie la tocó desde que la leíste.
   *
   * `desde` es el `updated_at` que tenías. Si en la base hay otro, el update no
   * afecta ninguna fila y se devuelve `false`: hubo choque.
   *
   * Comparar acá y no en el cliente es lo que hace que funcione de verdad. La
   * primera versión avisaba mirando los eventos de Realtime, y eso solo cubría
   * los milisegundos entre que dejabas de escribir y se guardaba: dos personas
   * editando la misma nota durante un minuto se pisaban sin enterarse.
   */
  async guardar(id: string, cambios: { title?: string; body?: string }, desde?: string | null): Promise<boolean> {
    if (!this.client) return false;

    if (this.esBorradorNuevo(id)) return !!(await this.publicarBorrador(id, cambios));
    id = this.publicadosDesdeBorrador.get(id) ?? id;

    let consulta = this.client.from('party_notes').update(cambios).eq('id', id);
    if (desde) consulta = consulta.eq('updated_at', desde);

    const { data, error } = await consulta.select();
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  /** Guardar pisando lo del otro, cuando el jugador lo decide. */
  forzar(id: string, cambios: { title?: string; body?: string }): Promise<boolean> {
    return this.guardar(id, cambios);
  }

  async borrar(id: string): Promise<void> {
    if (this.esBorradorNuevo(id)) {
      this.borradoresNuevos.update((notas) => notas.filter((nota) => nota.id !== id));
      return;
    }
    id = this.publicadosDesdeBorrador.get(id) ?? id;
    if (!this.client) return;
    const { error } = await this.client.from('party_notes').delete().eq('id', id);
    if (error) throw error;
    this.notas.update((ns) => ns.filter((n) => n.id !== id));
  }
}
