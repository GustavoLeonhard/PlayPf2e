import { Component, input, output } from '@angular/core';

import { PROFICIENCY_NAMES, type ProficiencyRank } from '../core/models/content.model';

/**
 * El rango de proficiencia, editable en el lugar donde se muestra.
 *
 * Se usa igual en habilidades, ataques y armadura. Mientras el valor sea el que
 * calculó el motor se ve como texto al ras del resto de la fila; el botón de
 * deshacer aparece solo si hay un valor puesto a mano, para no meter un ícono
 * en cada una de las dieciséis habilidades.
 */
@Component({
  selector: 'app-rank-select',
  template: `
    <span class="rank-edit" [class.manual]="manual()">
      <!--
        La selección va en la opción, no en el select: un [value] en el select se
        aplica antes de que el @for haya creado las opciones, y se pierde.
      -->
      <select title="Proficiencia" (change)="cambiar($any($event.target).value)">
        @for (nombre of nombres; track $index) {
          <option [value]="$index" [selected]="$index === rank()">{{ nombre }}</option>
        }
      </select>
      @if (manual()) {
        <button class="undo" type="button" title="Restablecer" (click)="restablecer.emit()">↺</button>
      }
    </span>
  `,
  styles: `
    .rank-edit {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
    }

    select {
      /* Al ras del texto que reemplaza: el marco aparece al pasar por encima. */
      appearance: none;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      color: var(--muted);
      font: inherit;
      padding: 0 0.2rem;
      cursor: pointer;
      max-width: 7.5rem;
    }

    select:hover,
    select:focus {
      border-color: var(--border);
      color: var(--text);
    }

    .manual select {
      color: var(--accent);
    }

    /*
      La lista desplegada la pinta el sistema operativo, no la página: hereda el
      "background: transparent" del select y el texto quedaba del color del fondo,
      ilegible. Las opciones necesitan su propio par color/fondo, explícito.
    */
    option {
      background: var(--surface);
      color: var(--text);
    }

    .undo {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 0.95em;
      line-height: 1;
      padding: 0;
    }

    .undo:hover {
      color: var(--text);
    }
  `,
})
export class RankSelectComponent {
  readonly rank = input.required<ProficiencyRank>();
  /** Si el rango está puesto a mano: pinta el valor y muestra el deshacer. */
  readonly manual = input(false);

  readonly rankChange = output<ProficiencyRank>();
  readonly restablecer = output<void>();

  readonly nombres = PROFICIENCY_NAMES;

  cambiar(valor: string) {
    this.rankChange.emit(Number(valor) as ProficiencyRank);
  }
}
