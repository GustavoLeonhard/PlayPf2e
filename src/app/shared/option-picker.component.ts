import { Component, computed, input, model, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { ContentService } from '../core/services/content.service';

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
  /**
   * Si el personaje cumple los prerrequisitos, cuando se pudo evaluar.
   *
   * `undefined` = la pantalla no lo calculó (el asistente de creación, donde
   * todavía no hay personaje contra el cual medir). Ahí el filtro no aparece.
   */
  requisitos?: 'met' | 'unmet' | 'unknown';
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

        <!--
          El filtro solo aparece si la pantalla evaluó los requisitos. Un filtro
          que no puede filtrar nada es peor que no tenerlo.
        -->
        @if (evaluado()) {
          <div class="filtro-req">
            @for (f of FILTROS; track f.valor) {
              <button
                type="button"
                class="chip-filtro"
                [class.on]="filtro() === f.valor"
                [title]="f.ayuda"
                (click)="filtro.set(f.valor)"
              >
                {{ f.rotulo }} <span class="cuenta">{{ cuentaDe(f.valor) }}</span>
              </button>
            }
          </div>
        }

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
                @if (opt.requisitos && opt.requisitos !== 'met') {
                  <span
                    class="marca"
                    [class.dudosa]="opt.requisitos === 'unknown'"
                    [title]="opt.requisitos === 'unmet' ? 'No cumplís los requisitos' : 'No se pudieron verificar'"
                  >{{ opt.requisitos === 'unmet' ? '✗' : '?' }}</span>
                }
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

    .filtro-req {
      display: flex;
      gap: 0.3rem;
      margin-top: 0.5rem;
    }

    .chip-filtro {
      flex: 1;
      background: none;
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      font: inherit;
      font-size: 0.72rem;
      padding: 0.15rem 0.3rem;
      cursor: pointer;
      white-space: nowrap;
    }

    .chip-filtro:hover {
      color: var(--text);
    }

    .chip-filtro.on {
      border-color: var(--accent);
      color: var(--accent);
    }

    /* La cuenta es el dato que decide si vale la pena apretar el filtro. */
    .chip-filtro .cuenta {
      opacity: 0.65;
    }

    /* La marca va ANTES del nombre: leyendo la lista de arriba abajo, se ve
       cuáles descartar sin tener que llegar al final del renglón. */
    .marca {
      color: var(--danger);
      font-size: 0.8em;
      margin-right: 0.25rem;
    }

    .marca.dudosa {
      color: var(--muted);
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
  private content = inject(ContentService);
  private sanitizer = inject(DomSanitizer);

  readonly options = input.required<PickerOption[]>();
  readonly selectedId = model<string | null>(null);

  readonly query = signal('');

  /** Qué mostrar según los requisitos. */
  readonly filtro = signal<'todos' | 'met' | 'unmet'>('todos');

  readonly FILTROS = [
    { valor: 'todos' as const, rotulo: 'Todas', ayuda: 'Sin filtrar por requisitos' },
    { valor: 'met' as const, rotulo: 'Cumplo', ayuda: 'Solo las que cumplís' },
    {
      valor: 'unmet' as const,
      rotulo: 'No cumplo',
      ayuda: 'Las que no cumplís. Las que no se pudieron verificar quedan acá, marcadas con ?',
    },
  ];

  /** Si la pantalla evaluó los requisitos. Sin eso, el filtro no se muestra. */
  readonly evaluado = computed(() => this.options().some((o) => o.requisitos !== undefined));

  /**
   * Lo que no se pudo verificar cuenta como "no cumplo", pero marcado aparte.
   *
   * Es la decisión importante del filtro: 22% de los prerrequisitos del dataset
   * no se pueden leer (ver prerequisites.spec.ts). Si esos cayeran en "cumplo",
   * el filtro mentiría; en un cajón propio nadie lo miraría. Van con las que no
   * cumplís, con un "?" que dice que ahí decidís vos.
   */
  private pasa(o: PickerOption, filtro: 'todos' | 'met' | 'unmet'): boolean {
    if (filtro === 'todos' || o.requisitos === undefined) return true;
    return filtro === 'met' ? o.requisitos === 'met' : o.requisitos !== 'met';
  }

  cuentaDe = (filtro: 'todos' | 'met' | 'unmet') => this.options().filter((o) => this.pasa(o, filtro)).length;

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    const filtro = this.filtro();
    const all = this.options().filter((o) => this.pasa(o, filtro));
    if (!q) return all.slice(0, 300);
    return all.filter((o) => o.name.toLowerCase().includes(q) || o.traits?.some((t) => t.includes(q))).slice(0, 300);
  });

  readonly selected = computed(() => this.options().find((o) => o.id === this.selectedId()) ?? null);

  /**
   * El dataset trae HTML de Paizo ya limpiado por el importador.
   *
   * Depende de `descripcionesListas` porque el texto llega DESPUÉS que la
   * lista: se le pega al objeto ya cargado, y mutar un objeto no despierta a
   * un computed. Esa señal es la que avisa.
   */
  readonly safeDescription = computed(() => {
    this.content.descripcionesListas();
    return this.sanitizer.bypassSecurityTrustHtml(this.selected()?.description ?? '');
  });
}
