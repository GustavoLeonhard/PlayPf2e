import { Injectable, signal } from '@angular/core';

/**
 * Qué ventana es.
 *
 * Las fijas son dos; las notas son una por nota, con la clave `nota:<id>`. Por
 * eso el tipo es abierto: la botonera crece con lo que escribís, no con lo que
 * está escrito acá.
 */
export type TipoDeVentana = 'pj' | 'dados' | 'audio' | `nota:${string}` | `jugador:${string}`;

export const claveDeNota = (id: string): TipoDeVentana => `nota:${id}`;

/**
 * La ventana de otro jugador de la mesa, por su id de usuario.
 *
 * Aparece y desaparece con la presencia, no con lo que vos abras: si alguien
 * cierra la pestaña, su ventana se va sola.
 */
export const claveDeJugador = (userId: string): TipoDeVentana => `jugador:${userId}`;

export interface EstadoDeVentana {
  abierta: boolean;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

const PREFIJO = 'pf2e.ventanas.';

/** Dónde nace cada una la primera vez, para que no salgan todas encimadas. */
const POR_DEFECTO: Record<string, EstadoDeVentana> = {
  pj: { abierta: true, x: 24, y: 24, ancho: 640, alto: 560 },
  dados: { abierta: false, x: 700, y: 24, ancho: 300, alto: 320 },
  audio: { abierta: false, x: 700, y: 360, ancho: 300, alto: 160 },
};

/*
 * Las notas nacen escalonadas y no todas en el mismo punto: abrir tres seguidas
 * y que queden una encima de otra obliga a mover dos antes de leer nada.
 */
const NOTA_POR_DEFECTO: EstadoDeVentana = { abierta: false, x: 340, y: 60, ancho: 420, alto: 340 };

/*
 * Las de jugador nacen chicas y a la derecha: son caras, no documentos. El alto
 * da para el 16:9 del video mas la linea del nombre.
 */
const JUGADOR_POR_DEFECTO: EstadoDeVentana = { abierta: false, x: 980, y: 60, ancho: 280, alto: 220 };
const ESCALON = 28;

/**
 * Qué ventanas están abiertas en la mesa, dónde y de qué tamaño.
 *
 * Vive en localStorage y por partida, igual que el plegado de los acordeones:
 * es cómo acomodás vos tu escritorio, no un dato de la partida. No tiene
 * sentido que tu acomodo viaje al monitor de otro, ni que el tuyo de la compu
 * mande en el del teléfono.
 */
@Injectable({ providedIn: 'root' })
export class VentanasService {
  private readonly ambito = signal<string | null>(null);
  private readonly estado = signal<Record<string, EstadoDeVentana>>({});

  /** Cuál está adelante. No se guarda: es del momento. */
  private readonly orden = signal<TipoDeVentana[]>(['pj', 'dados']);

  /**
   * En qué orden se tocaron, para la botonera. Es TUYO: que yo abra la nota del
   * sheriff no tiene por qué reordenarle los botones a los demás.
   */
  private readonly usadas = signal<string[]>([]);

  /** Cuánto hace que la tocaste: menor es más reciente. Sin tocar, al final. */
  antiguedad = (tipo: TipoDeVentana): number => {
    const at = this.usadas().indexOf(tipo);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };

  usar(partyId: string | null) {
    if (this.ambito() === partyId) return;
    this.ambito.set(partyId);
    this.estado.set(partyId ? leer(partyId) : {});
  }

  de(tipo: TipoDeVentana): EstadoDeVentana {
    const base = POR_DEFECTO[tipo] ?? this.nacimiento(tipo);
    return { ...base, ...this.estado()[tipo] };
  }

  /**
   * Dónde nace una ventana que no tiene lugar fijo.
   *
   * Escalonadas por familia: tres notas seguidas —o tres jugadores— apiladas en
   * el mismo punto obligan a mover dos antes de leer nada. Cada familia lleva
   * su propia cuenta para que las caras no empujen a las notas.
   */
  private nacimiento(tipo: TipoDeVentana): EstadoDeVentana {
    const familia = tipo.startsWith('jugador:') ? 'jugador:' : 'nota:';
    const base = familia === 'jugador:' ? JUGADOR_POR_DEFECTO : NOTA_POR_DEFECTO;
    const abiertas = Object.keys(this.estado()).filter((k) => k.startsWith(familia) && k !== tipo).length;
    return {
      ...base,
      x: base.x + (abiertas % 6) * ESCALON,
      y: base.y + (abiertas % 6) * ESCALON,
    };
  }

  abierta = (tipo: TipoDeVentana) => this.de(tipo).abierta;

  /** Cuánto más adelante va: se usa como z-index. */
  capa = (tipo: TipoDeVentana) => this.orden().indexOf(tipo) + 1;

  alFrente(tipo: TipoDeVentana) {
    this.orden.update((o) => [...o.filter((t) => t !== tipo), tipo]);
    this.usadas.update((u) => [tipo, ...u.filter((t) => t !== tipo)]);
  }

  alternar(tipo: TipoDeVentana) {
    const actual = this.de(tipo);
    this.guardar(tipo, { abierta: !actual.abierta });
    if (!actual.abierta) this.alFrente(tipo);
  }

  cerrar(tipo: TipoDeVentana) {
    this.guardar(tipo, { abierta: false });
  }

  mover(tipo: TipoDeVentana, x: number, y: number) {
    this.guardar(tipo, { x, y });
  }

  redimensionar(tipo: TipoDeVentana, ancho: number, alto: number) {
    this.guardar(tipo, { ancho, alto });
  }

  /** Olvidar una nota borrada: su estado quedaría ocupando lugar para siempre. */
  olvidar(tipo: TipoDeVentana) {
    const nuevo = { ...this.estado() };
    delete nuevo[tipo];
    this.estado.set(nuevo);
    this.usadas.update((u) => u.filter((t) => t !== tipo));
    this.persistir(nuevo);
  }

  private guardar(tipo: TipoDeVentana, cambios: Partial<EstadoDeVentana>) {
    const nuevo = { ...this.estado(), [tipo]: { ...this.de(tipo), ...cambios } };
    this.estado.set(nuevo);
    this.persistir(nuevo);
  }

  private persistir(estado: Record<string, EstadoDeVentana>) {
    const id = this.ambito();
    if (!id) return;
    try {
      localStorage.setItem(PREFIJO + id, JSON.stringify(estado));
    } catch {
      // Sin localStorage se pierde el acomodo, que es lo de menos.
    }
  }
}

function leer(id: string): Record<string, EstadoDeVentana> {
  try {
    const crudo = localStorage.getItem(PREFIJO + id);
    const datos: unknown = crudo ? JSON.parse(crudo) : null;
    return datos && typeof datos === 'object' ? (datos as Record<string, EstadoDeVentana>) : {};
  } catch {
    return {};
  }
}
