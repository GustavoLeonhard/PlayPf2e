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
      <div class="fila-dados">
        <!--
          Cuantos dados. Va ANTES de los botones y no adentro de cada uno para
          que se lea como la formula que arma: "5" "d10" es 5d10.
        -->
        <input
          class="cuantos"
          type="number"
          min="1"
          max="99"
          title="Cuántos dados"
          [value]="cuantos()"
          (input)="setCuantos($any($event.target).value)"
        />
        @for (c of caras; track c) {
          <button class="chip" [title]="cuantos() + 'd' + c" (click)="tirar(cuantos() + 'd' + c)">d{{ c }}</button>
        }
      </div>

      <form class="formula" (submit)="tirarFormula($event)">
        <input #f type="text" placeholder="2d6+3" autocomplete="off" />
        <button class="btn" type="submit">Tirar</button>
      </form>

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

    .fila-dados {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.2rem;
    }

    .fila-dados .chip {
      padding: 0.1rem 0.35rem;
      font-size: 0.78rem;
    }

    .cuantos {
      width: 2.4rem;
      padding: 0.1rem 0.2rem;
      font: inherit;
      text-align: center;
    }

    .formula {
      display: flex;
      gap: 0.3rem;
    }

    .formula input {
      flex: 1 1 auto;
      min-width: 0;
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

  /** Cuántos dados de la cara que aprietes. No se guarda: es del momento. */
  readonly cuantos = signal(1);

  setCuantos(valor: string) {
    const n = Math.round(Number(valor));
    // Cero dados no es una tirada, y noventa y nueve ya es un accidente.
    this.cuantos.set(Number.isNaN(n) ? 1 : Math.min(99, Math.max(1, n)));
  }
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

  tirarFormula(evento: Event) {
    evento.preventDefault();
    const input = (evento.target as HTMLFormElement).querySelector('input')!;
    const formula = input.value.trim();
    if (!formula) return;

    this.error.set(null);
    const r = rollFormula(formula);
    // `rollFormula` no valida: una fórmula inventada da 0 y ningún detalle.
    if (!r.detail) {
      this.error.set(`No entiendo "${formula}". Probá algo como 2d6+3.`);
      return;
    }

    this.tirar(formula);
    input.value = '';
  }
}
