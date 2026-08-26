import { Component, inject, input, signal } from '@angular/core';

import { rollFormula } from '../../core/rules/dice';
import { PartyChatService } from '../../core/services/party-chat.service';
import { mensajeDeError } from '../../core/services/party.service';

/**
 * El tirador de dados suelto: para lo que no sale de la hoja.
 *
 * Tirar un d20 a secas, un d6 de daño que decidió el máster, una tabla de
 * botín. Va directo al chat con la misma visibilidad que el resto.
 */
@Component({
  selector: 'app-dados-panel',
  template: `
    <div class="dados">
      <div class="lista-dados">
        @for (c of caras; track c) {
          <label class="dado">
            <span>d{{ c }}</span>
            <input type="number" min="0" max="99" step="1" inputmode="numeric" [value]="cantidadDe(c)" (input)="cambiarCantidad(c, $any($event.target).value)" aria-label="Cantidad de d{{ c }} (de 0 a 99)" />
          </label>
        }
      </div>

      <label class="modificador">
        <span>Modificador</span>
        <input #modificador type="number" value="0" step="1" inputmode="numeric" aria-label="Modificador de la tirada" />
      </label>

      <div class="acciones">
        <button class="btn tirar" type="button" (click)="tirarSeleccion(modificador.value)">Tirar dados</button>
        <button class="btn secundario" type="button" (click)="limpiar(modificador)">Limpiar</button>
      </div>

      <label class="quien">
        <span class="muted small">La ven</span>
        <select [value]="visibilidad()" (change)="visibilidad.set($any($event.target).value)">
          <option value="todos">Todos</option>
          <option value="master">Solo el máster</option>
          <option value="yo">Solo yo</option>
        </select>
      </label>

      @if (ultima(); as u) {
        <p class="ultima">
          <strong>{{ u.total }}</strong>
          <small class="muted">{{ u.detail }}</small>
        </p>
      }
      @if (error(); as e) {
        <p class="error small">{{ e }}</p>
      }
    </div>
  `,
  styles: `
    /*
      La ventana de dados es la mas chica de la mesa y comparte pantalla con el
      chat y el PJ: todo va un escalon abajo del tamano del resto de la app.
    */
    .dados {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.78rem;
    }

    .lista-dados {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
    }

    .dado {
      display: grid;
      /* Dos cifras alcanzan para una tirada normal; no hace falta que el
         selector de cantidad estire cada columna. */
      grid-template-columns: 2.2rem 4.2rem;
      align-items: center;
      gap: 0.25rem;
    }

    .dado span {
      font-weight: 700;
    }

    .dado input {
      width: 4.2rem;
    }

    .modificador input {
      min-width: 0;
      width: 100%;
    }

    .acciones {
      display: flex;
      gap: 0.4rem;
    }

    .tirar {
      flex: 1 1 auto;
    }

    .secundario {
      flex: 0 0 auto;
    }

    .modificador {
      display: grid;
      grid-template-columns: 1fr 5rem;
      align-items: center;
      gap: 0.4rem;
    }

    .quien {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .ultima {
      margin: 0;
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
    }

    .ultima {
      flex-wrap: wrap;
    }

    /* Grande, pero no tanto: antes el total solo ocupaba mas alto que la
       botonera entera. */
    .ultima strong {
      font-size: 1.15rem;
    }

    .ultima small {
      font-size: 0.72rem;
    }

    .formula input,
    .quien select {
      padding: 0.1rem 0.25rem;
      font: inherit;
    }

    .formula .btn {
      padding: 0.1rem 0.5rem;
      font-size: 0.78rem;
    }

    .error {
      color: var(--danger);
      margin: 0;
    }
  `,
})
export class DadosPanelComponent {
  readonly partyId = input.required<string>();

  private chat = inject(PartyChatService);

  readonly caras = [4, 6, 8, 10, 12, 20, 100];
  readonly seleccion = signal<Record<number, number>>({});
  readonly visibilidad = signal<'todos' | 'master' | 'yo'>('todos');
  readonly ultima = signal<{ total: number; detail: string } | null>(null);
  readonly error = signal<string | null>(null);

  tirar(formula: string) {
    const r = rollFormula(formula);
    this.ultima.set({ total: r.total, detail: r.detail });

    // Sin dado de ataque: el chat la muestra como total y desglose.
    void this.chat
      .publicarTirada(
        this.partyId(),
        { label: formula, die: 0, modifier: 0, total: r.total, crit: null, detalle: r.detail },
        this.visibilidad(),
      )
      .catch((e) => this.error.set(mensajeDeError(e)));
  }

  cantidadDe(caras: number) {
    return this.seleccion()[caras] ?? 0;
  }

  cambiarCantidad(caras: number, cantidad: string) {
    // Se puede escribir o pegar cualquier cantidad, pero nunca sale del rango
    // razonable de 0 a 99 ni admite fracciones o texto.
    const numero = Number(cantidad);
    const normalizado = Number.isInteger(numero) && numero >= 0 ? Math.min(99, numero) : 0;
    this.seleccion.update((actual) => ({ ...actual, [caras]: normalizado }));
  }

  limpiar(modificador: HTMLInputElement) {
    this.seleccion.set({});
    modificador.value = '0';
    this.error.set(null);
  }

  tirarSeleccion(modificador: string) {
    const bono = Number(modificador);
    const dados = this.caras
      .map((caras) => ({ caras, cantidad: this.cantidadDe(caras) }))
      .filter(({ cantidad }) => Number.isInteger(cantidad) && cantidad > 0);
    if (!dados.length || !Number.isFinite(bono)) {
      this.error.set('Elegí al menos un dado y escribí un modificador numérico.');
      return;
    }

    this.error.set(null);
    const formula = `${dados.map(({ caras, cantidad }) => `${cantidad}d${caras}`).join('+')}${bono > 0 ? '+' : ''}${bono || ''}`;
    this.tirar(formula);
  }
}
