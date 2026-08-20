import { Component, computed, input, model, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { inject } from '@angular/core';

/** Forma minima que necesita el picker; sirve para clases, feats, ancestrias, etc. */
export interface PickerOption {
  id: string;
  name: string;
  level?: number;
  traits?: string[];
  rarity?: string;
  description?: string;
  /** Texto libre del dataset: se muestra como advertencia, nunca bloquea. */
  prerequisites?: string[];
  source?: string;
  /**
   * No se puede elegir, pero se muestra igual con el motivo. Sacarla de la
   * lista sin más deja al jugador buscando algo que nunca va a aparecer.
   */
  deshabilitada?: boolean;
  motivo?: string;
}

/**
 * Lista filtrable a la izquierda, detalle del item seleccionado a la derecha.
 * Es el patron que se repite en todo el wizard, asi que vive una sola vez.
 */
@Component({
  selector: 'app-option-picker',
  template: `
    <div class="picker">
      <div class="list-side">
        <input
          type="search"
          [placeholder]="'Buscar en ' + options().length + ' opciones…'"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />

        <ul class="list">
          @for (opt of filtered(); track opt.id) {
            <li>
              <button
                class="row"
                [class.active]="opt.id === selectedId()"
                [class.deshabilitada]="opt.deshabilitada"
                [disabled]="opt.deshabilitada"
                [title]="opt.motivo ?? ''"
                type="button"
                (click)="selectedId.set(opt.id)"
              >
                <span class="name">{{ opt.name }}</span>
                @if (opt.motivo) {
                  <span class="motivo">{{ opt.motivo }}</span>
                }
                @if (opt.level !== undefined) {
                  <span class="lvl muted">{{ opt.level }}</span>
                }
                @if (opt.rarity && opt.rarity !== 'common') {
                  <span class="rarity">{{ opt.rarity }}</span>
                }
              </button>
            </li>
          } @empty {
            <li class="muted pad">Sin resultados para “{{ query() }}”.</li>
          }
        </ul>
      </div>

      <div class="detail-side card">
        @if (selected(); as opt) {
          <h3>{{ opt.name }}</h3>

          <div class="meta">
            @if (opt.level !== undefined) {
              <span class="tag">Nivel {{ opt.level }}</span>
            }
            @for (t of opt.traits ?? []; track t) {
              <span class="tag">{{ t }}</span>
            }
          </div>

          @if (opt.prerequisites?.length) {
            <p class="prereq">
              <strong>Prerrequisitos:</strong> {{ opt.prerequisites!.join('; ') }}
              <span class="muted">— no se valida automáticamente, revisalo vos.</span>
            </p>
          }

          <div class="rule-text" [innerHTML]="safeDescription()"></div>

          @if (opt.source) {
            <p class="muted src">{{ opt.source }}</p>
          }
        } @else {
          <p class="muted">Elegí una opción de la lista para ver su descripción.</p>
        }
      </div>
    </div>
  `,
  styles: `
    .picker {
      display: grid;
      grid-template-columns: minmax(200px, 300px) 1fr;
      gap: 1rem;
      align-items: start;
    }

    @media (max-width: 720px) {
      .picker {
        grid-template-columns: 1fr;
      }
    }

    .list {
      list-style: none;
      margin: 0.6rem 0 0;
      padding: 0;
      max-height: 60vh;
      overflow-y: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    .row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      text-align: left;
      padding: 0.5rem 0.7rem;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--border);
      color: var(--text);

      &:hover {
        background: var(--surface-2);
      }

      &.active {
        background: var(--surface-2);
        box-shadow: inset 3px 0 0 var(--accent);
      }
    }

    .name {
      flex: 1;
    }

    .row.deshabilitada {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .motivo {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--accent);
    }

    .lvl {
      font-size: 0.8rem;
    }

    .rarity {
      font-size: 0.7rem;
      text-transform: uppercase;
      color: var(--accent);
    }

    .detail-side {
      max-height: 66vh;
      overflow-y: auto;
    }

    .meta {
      margin-bottom: 0.7rem;
    }

    .prereq {
      background: var(--surface-2);
      border-left: 3px solid var(--accent);
      padding: 0.5rem 0.7rem;
      border-radius: 4px;
      font-size: 0.87rem;
    }

    .pad {
      padding: 0.7rem;
    }

    .src {
      font-size: 0.78rem;
      margin-top: 1rem;
      border-top: 1px solid var(--border);
      padding-top: 0.5rem;
    }
  `,
})
export class OptionPickerComponent {
  private sanitizer = inject(DomSanitizer);

  readonly options = input.required<PickerOption[]>();
  readonly selectedId = model<string | null>(null);

  readonly query = signal('');

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    const all = this.options();
    if (!q) return all.slice(0, 300);
    return all.filter((o) => o.name.toLowerCase().includes(q) || o.traits?.some((t) => t.includes(q))).slice(0, 300);
  });

  readonly selected = computed(() => this.options().find((o) => o.id === this.selectedId()) ?? null);

  /** El dataset trae HTML de Paizo ya limpiado por el importador. */
  readonly safeDescription = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.selected()?.description ?? ''),
  );
}
