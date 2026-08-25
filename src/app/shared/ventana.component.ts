import { Component, ElementRef, afterNextRender, inject, input, output, type OnDestroy } from '@angular/core';

import { VentanasService, type TipoDeVentana } from '../core/services/ventanas.service';

/**
 * Una ventana del lienzo de la mesa.
 *
 * Se arrastra de la barra de título y se redimensiona de la esquina. El
 * contenido va proyectado, así que la ventana no sabe nada de lo que muestra —
 * y el mismo panel se puede renderizar solo en su propia pestaña sin marco.
 *
 * El arrastre escucha en `document` y no en la ventana: si escuchara en sí
 * misma, mover rápido saca el puntero de la caja y el arrastre se corta.
 */
@Component({
  selector: 'app-ventana',
  template: `
    <section
      class="ventana"
      [style.left.px]="estado().x"
      [style.top.px]="estado().y"
      [style.width.px]="estado().ancho"
      [style.height.px]="estado().alto"
      [style.z-index]="ventanas.capa(tipo())"
      (pointerdown)="ventanas.alFrente(tipo())"
    >
      <header class="barra" (pointerdown)="empezarArrastre($event)">
        <span class="titulo">{{ titulo() }}</span>
        <span class="acciones">
          <button class="chico" title="Abrir en otra ventana" (click)="sacar.emit()">⧉</button>
          <button class="chico" title="Cerrar" (click)="ventanas.cerrar(tipo())">×</button>
        </span>
      </header>

      <div class="cuerpo">
        <ng-content />
      </div>

      <span class="agarre" title="Redimensionar" (pointerdown)="empezarResize($event)"></span>
    </section>
  `,
  styles: `
    .ventana {
      position: absolute;
      display: flex;
      flex-direction: column;
      min-width: 16rem;
      min-height: 8rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 6px 24px var(--sombra);
      overflow: hidden;
    }

    .barra {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.5rem;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
      cursor: grab;
      /* Sin esto, arrastrar selecciona el texto del título. */
      user-select: none;
      touch-action: none;
    }

    .barra:active {
      cursor: grabbing;
    }

    .titulo {
      font-weight: 600;
      font-size: 0.85rem;
    }

    .acciones {
      margin-left: auto;
      display: flex;
      gap: 0.1rem;
    }

    .chico {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.95rem;
      line-height: 1;
      padding: 0.1rem 0.3rem;
    }

    .chico:hover {
      color: var(--text);
    }

    .cuerpo {
      flex: 1 1 auto;
      overflow: auto;
      padding: 0.6rem;
    }

    /* Triangulito en la esquina: el agarre para redimensionar. */
    .agarre {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 1rem;
      height: 1rem;
      cursor: nwse-resize;
      touch-action: none;
      background: linear-gradient(135deg, transparent 50%, var(--border) 50%);
    }
  `,
})
export class VentanaComponent implements OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  readonly tipo = input.required<TipoDeVentana>();
  readonly titulo = input.required<string>();

  /** Sacarla afuera lo resuelve la mesa: solo ella sabe a qué URL. */
  readonly sacar = output<void>();

  readonly ventanas = inject(VentanasService);

  estado = () => this.ventanas.de(this.tipo());

  constructor() {
    /*
     * Achicarla si no entra en el lienzo.
     *
     * Los tamaños por defecto están pensados para una pantalla grande. En un
     * portátil, una ventana más ancha que el lienzo queda con la mitad
     * derecha —y el agarre para redimensionar— fuera de alcance, sin forma de
     * recuperarla.
     */
    afterNextRender(() => {
      const lienzo = this.host.nativeElement.parentElement;
      if (!lienzo) return;

      /*
       * Con un observador y no una sola vez: al primer render el grid todavía
       * no repartió el ancho, así que medir ahí da un lienzo más grande del
       * real. Y de paso cubre achicar la ventana del navegador después.
       */
      this.observador = new ResizeObserver(() => this.acomodar(lienzo));
      this.observador.observe(lienzo);
      this.acomodar(lienzo);
    });
  }

  private limpiar: (() => void) | null = null;
  private observador: ResizeObserver | null = null;

  /** La mete adentro del lienzo si no entra: si no, queda fuera de alcance. */
  private acomodar(lienzo: HTMLElement) {
    const libreAncho = lienzo.clientWidth - 16;
    const libreAlto = lienzo.clientHeight - 16;
    if (libreAncho <= 0 || libreAlto <= 0) return;

    const { ancho, alto, x, y } = this.estado();
    const nuevoAncho = Math.min(ancho, libreAncho);
    const nuevoAlto = Math.min(alto, libreAlto);
    if (nuevoAncho !== ancho || nuevoAlto !== alto) {
      this.ventanas.redimensionar(this.tipo(), nuevoAncho, nuevoAlto);
    }

    const nuevoX = Math.max(0, Math.min(x, lienzo.clientWidth - nuevoAncho));
    const nuevoY = Math.max(0, Math.min(y, lienzo.clientHeight - nuevoAlto));
    if (nuevoX !== x || nuevoY !== y) this.ventanas.mover(this.tipo(), nuevoX, nuevoY);
  }

  empezarArrastre(evento: PointerEvent) {
    // Los botones de la barra no arrastran.
    if ((evento.target as HTMLElement).closest('button')) return;

    const inicio = this.estado();
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;

    this.escuchar((e) => {
      // No se deja salir del todo por arriba ni por la izquierda: una ventana
      // que se va del lienzo no se puede volver a agarrar.
      this.ventanas.mover(this.tipo(), Math.max(0, e.clientX - dx), Math.max(0, e.clientY - dy));
    });
  }

  empezarResize(evento: PointerEvent) {
    evento.stopPropagation();
    const inicio = this.estado();
    const x0 = evento.clientX;
    const y0 = evento.clientY;

    this.escuchar((e) => {
      this.ventanas.redimensionar(
        this.tipo(),
        Math.max(260, inicio.ancho + (e.clientX - x0)),
        Math.max(140, inicio.alto + (e.clientY - y0)),
      );
    });
  }

  private escuchar(mover: (e: PointerEvent) => void) {
    const soltar = () => this.detener();
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar, { once: true });
    this.limpiar = () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
    };
  }

  private detener() {
    this.limpiar?.();
    this.limpiar = null;
  }

  ngOnDestroy(): void {
    // Si la ventana se cierra en pleno arrastre, los listeners quedarían vivos.
    this.detener();
    this.observador?.disconnect();
  }
}
