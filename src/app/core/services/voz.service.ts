import { Injectable, inject, signal } from '@angular/core';
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';

import { AuthService } from './auth.service';

/**
 * El canal de voz y video de la mesa.
 *
 * Usa Daily en modo **call object**, no su interfaz prefabricada. La
 * prefabricada es un iframe monolítico con su propia grilla de caras, y acá las
 * caras van en una ventana flotante cada una: hace falta el track crudo de cada
 * participante para colgarlo del `<video>` que nosotros dibujamos.
 *
 * ES UN SINGLETON Y TIENE QUE SERLO. Una pestaña se une UNA vez: la cámara no
 * se captura dos veces, y cada unión cuenta como un participante más en la
 * factura. Por eso el `DailyCall` vive acá y no en el componente que lo muestra.
 */
export interface Cara {
  /** El id de sesión de Daily, no el de Supabase. */
  sessionId: string;
  /** Lo que pusimos en `userName` al unirnos: el id de usuario de Supabase. */
  userId: string;
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  hablando: boolean;
}

export type EstadoDelCanal = 'fuera' | 'entrando' | 'adentro' | 'error';

@Injectable({ providedIn: 'root' })
export class VozService {
  private call: DailyCall | null = null;

  readonly estado = signal<EstadoDelCanal>('fuera');
  readonly error = signal<string | null>(null);

  /** Los que están en la llamada, incluido vos. Clave: el id de Supabase. */
  readonly caras = signal<Map<string, Cara>>(new Map());

  readonly micAbierto = signal(false);
  readonly camaraAbierta = signal(false);

  /** En qué partida está el canal abierto, para no reentrar en otra. */
  private partyId: string | null = null;

  private auth = inject(AuthService);

  /**
   * La URL de la sala de una partida.
   *
   * Sale del token de invitación y no del id: es el mismo secreto que ya
   * protege el link para entrar a la mesa, y así no hace falta guardar la sala
   * en ningún lado. Tiene que dar igual que `tools/daily/sala.mjs`.
   */
  static salaDe(inviteToken: string): string {
    return `https://pf2e.daily.co/pf2e-${inviteToken}`;
  }

  /**
   * Entrar al canal.
   *
   * `userId` viaja como `userName` porque es la única forma de saber qué cara
   * de Daily corresponde a qué miembro de la partida: los ids de sesión de
   * Daily son nuevos en cada unión y no se parecen a los nuestros.
   */
  async entrar(partyId: string, inviteToken: string, userId: string): Promise<void> {
    if (this.estado() === 'entrando') return;
    if (this.call && this.partyId === partyId) return;

    // Cambiar de mesa sin salir de la anterior dejaría dos llamadas vivas.
    await this.salir();

    this.estado.set('entrando');
    this.error.set(null);
    this.partyId = partyId;

    try {
      // La carga es diferida a propósito: son ~300 kB que solo hacen falta si
      // alguien entra al canal, y la mayoría de las sesiones son solo chat.
      const { default: Daily } = await import('@daily-co/daily-js');

      const call = Daily.createCallObject({
        // Entrás mudo y sin cámara: nadie quiere aparecer de golpe en la mesa.
        audioSource: false,
        videoSource: false,
      });
      this.call = call;

      call
        .on('participant-joined', () => this.refrescar())
        .on('participant-updated', () => this.refrescar())
        .on('participant-left', () => this.refrescar())
        .on('active-speaker-change', () => this.refrescar())
        .on('error', (e) => {
          this.error.set(e?.errorMsg ?? 'Se cortó el canal');
          this.estado.set('error');
        });

      const { url, token } = await this.sala(partyId, inviteToken);
      await call.join({ url, ...(token ? { token } : {}), userName: userId });

      this.estado.set('adentro');
      this.refrescar();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'No se pudo entrar al canal');
      this.estado.set('error');
      await this.salir();
    }
  }

  /**
   * De dónde sacar la sala.
   *
   * Primero se le pregunta a la Edge Function, que crea la sala si no existe y
   * devuelve un token: esa es la forma buena, porque la sala es privada y sin
   * token no entra nadie. Si todavía no está desplegada, se cae a la sala
   * pública que dejó `tools/daily/sala.mjs`.
   *
   * El fallback es a propósito y no un descuido: la función necesita un deploy
   * a mano, y hasta que exista es mejor que el canal ande a que no ande. Cuando
   * la despliegues, este método empieza a usarla sin tocar una línea.
   */
  private async sala(partyId: string, inviteToken: string): Promise<{ url: string; token?: string }> {
    try {
      const { data, error } = await this.auth.client!.functions.invoke('daily-sala', {
        body: { partyId },
      });
      if (!error && data?.url) return { url: data.url, token: data.token };
    } catch {
      // Sin desplegar: se sigue por el camino viejo.
    }
    return { url: VozService.salaDe(inviteToken) };
  }

  async salir(): Promise<void> {
    const call = this.call;
    this.call = null;
    this.partyId = null;
    this.caras.set(new Map());
    this.micAbierto.set(false);
    this.camaraAbierta.set(false);
    if (this.estado() !== 'error') this.estado.set('fuera');

    if (call) {
      await call.leave().catch(() => undefined);
      // Sin destroy quedan los tracks y el peer connection vivos: la lucecita
      // de la cámara sigue prendida aunque hayas salido.
      call.destroy();
    }
  }

  toggleMic(): void {
    if (!this.call) return;
    const nuevo = !this.micAbierto();
    this.call.setLocalAudio(nuevo);
    this.micAbierto.set(nuevo);
  }

  toggleCamara(): void {
    if (!this.call) return;
    const nuevo = !this.camaraAbierta();
    this.call.setLocalVideo(nuevo);
    this.camaraAbierta.set(nuevo);
  }

  /** La cara de un miembro, por su id de Supabase. */
  cara = (userId: string): Cara | null => this.caras().get(userId) ?? null;

  /**
   * Rearma el mapa de caras desde lo que dice Daily.
   *
   * Se reconstruye entero en vez de parchear el que había: los eventos de
   * participante llegan de a muchos y desordenados, y aplicar diffs sobre un
   * mapa mutable es la forma más rápida de terminar con una cara fantasma.
   */
  private refrescar(): void {
    if (!this.call) return;

    const participantes = Object.values(this.call.participants()) as DailyParticipant[];
    const mapa = new Map<string, Cara>();

    for (const p of participantes) {
      // `user_name` es el id de Supabase que mandamos al unirnos. Sin él no
      // sabemos de quién es esta cara, así que no se muestra.
      const userId = p.user_name;
      if (!userId) continue;

      mapa.set(userId, {
        sessionId: p.session_id,
        userId,
        video: p.tracks.video?.state === 'playable' ? (p.tracks.video.persistentTrack ?? null) : null,
        audio: p.tracks.audio?.state === 'playable' ? (p.tracks.audio.persistentTrack ?? null) : null,
        hablando: !!p.tracks.audio && p.session_id === this.call.getActiveSpeaker?.()?.peerId,
      });
    }

    this.caras.set(mapa);
  }
}
