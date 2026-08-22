import { Component, computed, effect, inject, input, signal } from '@angular/core';

import { PartyNotesService } from '../../core/services/party-notes.service';
import { mensajeDeError } from '../../core/services/party.service';

/**
 * Una nota de la mesa, abierta para leer y editar.
 *
 * Lo delicado acá es que la nota es compartida: mientras vos escribís, otro
 * puede guardar. La regla es que **nunca se pisa lo que estás escribiendo**;
 * si llega un cambio ajeno con vos a medio escribir, se avisa y decidís vos.
 * Perder un párrafo porque el otro guardó primero es la peor forma de fallar.
 */
@Component({
  selector: 'app-nota-panel',
  template: `
    @if (nota(); as n) {
      <div class="nota">
        <input
          class="titulo"
          type="text"
          placeholder="Título"
          [value]="tituloLocal() ?? n.title"
          (input)="tituloLocal.set($any($event.target).value); programarGuardado()"
        />

        @if (choque()) {
          <p class="choque">
            Alguien más la cambió: no se guardó lo tuyo para no pisarlo.
            <button class="btn ghost chico" (click)="traerLaDeEllos()">Descartar lo mío</button>
            <button class="btn ghost chico" (click)="pisar()">Guardar igual</button>
          </p>
        }

        <textarea
          class="cuerpo"
          placeholder="Escribí lo que quieras…"
          [value]="cuerpoLocal() ?? n.body"
          (input)="cuerpoLocal.set($any($event.target).value); programarGuardado()"
        ></textarea>

        <footer class="pie">
          <span class="muted small">{{ estadoDeGuardado() }}</span>
          <button class="btn ghost chico borrar" (click)="borrar()">Borrar nota</button>
        </footer>

        @if (error(); as e) {
          <p class="error small">{{ e }}</p>
        }
      </div>
    } @else {
      <p class="muted small">Esta nota ya no está.</p>
    }
  `,
  styles: `
    .nota {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      height: 100%;
    }

    .titulo {
      font-weight: 600;
    }

    .cuerpo {
      flex: 1 1 auto;
      min-height: 6rem;
      resize: none;
      font: inherit;
      line-height: 1.5;
    }

    .pie {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .chico {
      padding: 0.05rem 0.4rem;
      font-size: 0.75rem;
    }

    .borrar:hover {
      color: var(--danger);
      border-color: var(--danger);
    }

    /* El aviso de choque tiene que interrumpir: si pasa desapercibido, no sirve. */
    .choque {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin: 0;
      padding: 0.35rem 0.5rem;
      border-left: 3px solid var(--accent);
      background: var(--surface-2);
      font-size: 0.8rem;
    }

    .error {
      color: var(--danger);
      margin: 0;
    }
  `,
})
export class NotaPanelComponent {
  readonly notaId = input.required<string>();

  private notas = inject(PartyNotesService);

  readonly nota = computed(() => this.notas.una(this.notaId()));

  /** Lo que tenés escrito sin guardar. `null` = no tocaste nada. */
  readonly tituloLocal = signal<string | null>(null);
  readonly cuerpoLocal = signal<string | null>(null);

  readonly choque = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** El `updated_at` que había cuando empezaste a escribir. */
  private base: string | null = null;

  constructor() {
    effect(() => {
      const n = this.nota();
      if (!n) return;

      /*
       * Sin cambios propios, lo de afuera entra sin preguntar y pasa a ser la
       * base. Con cambios propios NO se toca nada acá: el choque lo detecta el
       * guardado contra la base de datos, que es donde se puede saber de
       * verdad si alguien se adelantó.
       */
      if (this.tituloLocal() === null && this.cuerpoLocal() === null) this.base = n.updated_at;
    });
  }

  readonly estadoDeGuardado = computed(() => {
    if (this.guardando()) return 'Guardando…';
    if (this.tituloLocal() !== null || this.cuerpoLocal() !== null) return 'Sin guardar';
    return 'Guardado';
  });

  /**
   * Guarda un rato después de que dejaste de escribir.
   *
   * Guardar en cada tecla haría una escritura por letra y un evento de Realtime
   * por letra para todos los demás.
   */
  programarGuardado() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.guardar(), 800);
  }

  private async guardar() {
    const n = this.nota();
    if (!n) return;

    const title = this.tituloLocal();
    const body = this.cuerpoLocal();
    if (title === null && body === null) return;

    this.guardando.set(true);
    this.error.set(null);
    try {
      const guardado = await this.notas.guardar(n.id, this.cambios(), this.base);
      if (!guardado) {
        // Alguien se adelantó: lo tuyo sigue en el textarea, intacto.
        this.choque.set(true);
        return;
      }

      // Recién ahora se sueltan los locales: si falla, no se pierde nada.
      this.tituloLocal.set(null);
      this.cuerpoLocal.set(null);
      this.choque.set(false);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  private cambios() {
    const title = this.tituloLocal();
    const body = this.cuerpoLocal();
    return { ...(title !== null ? { title } : {}), ...(body !== null ? { body } : {}) };
  }

  /** Guardar encima de lo del otro. Lo decide el jugador, nunca la app. */
  async pisar() {
    const n = this.nota();
    if (!n) return;

    this.guardando.set(true);
    try {
      await this.notas.forzar(n.id, this.cambios());
      this.tituloLocal.set(null);
      this.cuerpoLocal.set(null);
      this.choque.set(false);
      this.base = this.nota()?.updated_at ?? null;
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  /** Descarta lo tuyo y se queda con lo que guardó el otro. */
  traerLaDeEllos() {
    this.tituloLocal.set(null);
    this.cuerpoLocal.set(null);
    this.choque.set(false);
    this.base = this.nota()?.updated_at ?? null;
  }

  async borrar() {
    const n = this.nota();
    if (!n) return;
    try {
      await this.notas.borrar(n.id);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }
}
