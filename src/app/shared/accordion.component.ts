import { Component, input, linkedSignal } from '@angular/core';

/**
 * Sección plegable de la hoja.
 *
 * En una pantalla de PC la hoja entra casi entera, y lo que estorba no es el
 * espacio sino tener siempre a la vista cosas que se usan una vez por sesión
 * (el inventario, la bolsa). Cada sección es una fila de ancho completo que se
 * pliega a una barra de un renglón.
 *
 * El contenido proyectado NO se destruye al cerrar: se oculta por CSS. Así el
 * estado de lo que haya adentro (un editor de arma a medio llenar, un breakdown
 * abierto) sobrevive a plegar y desplegar.
 */
@Component({
  selector: 'app-accordion',
  template: `
    <section class="acc card" [class.cerrado]="!abierto()">
      <button class="acc-head" [attr.aria-expanded]="abierto()" (click)="abierto.set(!abierto())">
        <span class="chev">{{ abierto() ? '▾' : '▸' }}</span>
        <span class="acc-title">{{ titulo() }}</span>
        @if (subtitulo()) {
          <small class="acc-sub">{{ subtitulo() }}</small>
        }
      </button>

      <div class="acc-body">
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    /*
     * Sin overflow oculto a propósito: un ancestro con overflow distinto de visible
     * rompe el position:sticky de la bolsa dentro del inventario.
     */
    .acc {
      margin: 0;
      padding: 0;
    }

    .acc-head {
      display: flex;
      align-items: baseline;
      gap: 0.55rem;
      width: 100%;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
      padding: 0.7rem 0.9rem;
      color: inherit;
      font: inherit;
    }

    .acc-head:hover .acc-title {
      color: var(--accent);
    }

    .acc-title {
      font-family: var(--font-display, inherit);
      font-size: 1.05rem;
      font-weight: 600;
    }

    .acc-sub,
    .chev {
      color: var(--muted);
      font-size: 0.85rem;
    }

    .acc-body {
      padding: 0 0.9rem 0.9rem;
    }

    .cerrado .acc-body {
      display: none;
    }

    .cerrado .acc-head {
      padding-bottom: 0.7rem;
    }
  `,
})
export class AccordionComponent {
  readonly titulo = input.required<string>();
  /** Dato al lado del título: la tradición, el bulk cargado… */
  readonly subtitulo = input('');
  /** Si arranca abierta. Las que se usan en cada turno sí; el inventario no. */
  readonly inicial = input(true);

  /** linkedSignal: el usuario manda, pero si cambia el default lo sigue. */
  readonly abierto = linkedSignal(() => this.inicial());
}
