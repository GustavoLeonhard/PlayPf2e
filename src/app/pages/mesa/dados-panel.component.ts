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
        @for (c of caras; track c) {
          <button class="chip" (click)="tirar('1d' + c)">d{{ c }}</button>
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
    .dados {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .fila-dados {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
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

    .ultima strong {
      font-size: 1.5rem;
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
