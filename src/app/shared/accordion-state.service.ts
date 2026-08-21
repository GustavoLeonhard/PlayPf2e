import { Injectable, signal } from '@angular/core';

const PREFIJO = 'pf2e.acordeones.';

/**
 * Qué secciones de la hoja dejó abiertas el jugador, por personaje.
 *
 * Vive en localStorage y no en el personaje a propósito: es una preferencia de
 * cómo mirás la hoja, no un dato del PJ. Guardarla en el registro obligaría a
 * un viaje al servidor por cada plegado, y además se llevaría la preferencia de
 * una pantalla grande a un teléfono, donde no sirve.
 *
 * El acordeón se registra solo por su título, así que no hay que pasarle una
 * clave a cada una de las diez secciones de la plantilla.
 */
@Injectable({ providedIn: 'root' })
export class AccordionStateService {
  /** El personaje que se está mirando. Sin esto no se guarda nada. */
  private readonly ambito = signal<string | null>(null);
  private readonly estado = signal<Record<string, boolean>>({});

  usar(id: string | null) {
    if (this.ambito() === id) return;
    this.ambito.set(id);
    this.estado.set(id ? leer(id) : {});
  }

  /** Lo guardado para esa sección, o el valor por defecto si es la primera vez. */
  abierto(titulo: string, porDefecto: boolean): boolean {
    return this.estado()[titulo] ?? porDefecto;
  }

  guardar(titulo: string, abierto: boolean) {
    const id = this.ambito();
    if (!id) return;

    const nuevo = { ...this.estado(), [titulo]: abierto };
    this.estado.set(nuevo);
    try {
      localStorage.setItem(PREFIJO + id, JSON.stringify(nuevo));
    } catch {
      // Sin localStorage (modo privado, cuota llena) se pierde la preferencia,
      // que es lo de menos: la hoja sigue andando.
    }
  }
}

function leer(id: string): Record<string, boolean> {
  try {
    const crudo = localStorage.getItem(PREFIJO + id);
    const datos: unknown = crudo ? JSON.parse(crudo) : null;
    if (!datos || typeof datos !== 'object') return {};
    // Se filtra a booleanos: el JSON lo escribió esta app, pero lo leyó del
    // disco del usuario y puede venir editado o de una versión vieja.
    return Object.fromEntries(
      Object.entries(datos as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean'),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}
