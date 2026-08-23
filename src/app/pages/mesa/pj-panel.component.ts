import { Component, computed, effect, inject, input, signal } from '@angular/core';

import type { CharacterRecord } from '../../core/models/character.model';
import { computeCharacter, type ContentIndex, type StrikeSheet } from '../../core/rules/character.engine';
import { signed } from '../../core/rules/modifiers';
import {
  HABILIDADES_CON_MAP,
  mapDeManiobra,
  mapPenalty,
  tirarAtaque,
  tirarChequeo,
  type Tirada,
} from '../../core/rules/tiradas';
import { CharacterService } from '../../core/services/character.service';
import { ContentService } from '../../core/services/content.service';
import { PartyChatService } from '../../core/services/party-chat.service';
import { PartyService } from '../../core/services/party.service';

/**
 * El personaje, en versión de juego.
 *
 * No es la hoja recortada por espacio: es lo que se toca en una pelea. HP,
 * defensas, ataques y habilidades. Todo lo que se decide una vez —dotes,
 * inventario, conjuros aprendidos, boosts— vive en la hoja completa, que está
 * a un botón de distancia.
 *
 * Las tiradas usan las mismas funciones que la hoja (`rules/tiradas.ts`), así
 * que no hay dos versiones del multiple attack penalty esperando separarse.
 */
@Component({
  selector: 'app-pj-panel',
  template: `
    @if (hoja(); as s) {
      <div class="pj">
        <header class="pj-head">
          <strong>{{ s.name }}</strong>
          <span class="muted small">{{ s.ancestryName }} · {{ s.className }} · nivel {{ s.level }}</span>
          <a class="btn ghost chico" [href]="'/characters/' + characterId()" target="_blank" title="Abrir la hoja completa">
            hoja completa ↗
          </a>
        </header>

        <div class="vitales">
          <label class="vital">
            <span class="muted small">HP</span>
            <span class="hp">
              <input
                type="number"
                min="0"
                [max]="s.maxHp.total"
                [value]="record()?.state?.hp?.current ?? 0"
                (change)="setHp($any($event.target).value)"
              />
              <span class="muted">/ {{ s.maxHp.total }}</span>
            </span>
          </label>
          <div class="vital">
            <span class="muted small">CA</span>
            <strong>{{ s.ac.total }}</strong>
          </div>
          <button class="vital tirable" (click)="tirar('Percepción', s.perception)">
            <span class="muted small">Percepción</span>
            <strong>{{ signo(s.perception.total) }}</strong>
          </button>
        </div>

        <div class="salvaciones">
          @for (sv of salvaciones; track sv.key) {
            <button class="tirable" (click)="tirar(sv.label, s.saves[sv.key])">
              <span class="muted small">{{ sv.label }}</span>
              <strong>{{ signo(s.saves[sv.key].total) }}</strong>
            </button>
          }
        </div>

        <h4 class="muted">Ataques</h4>
        @for (st of s.strikes; track st.name) {
          <div class="ataque">
            <span class="nombre">{{ st.name }}</span>
            <span class="tres">
              @for (n of [1, 2, 3]; track n) {
                <button class="chip" (click)="atacar(st, n)">
                  {{ signo(st.attack.total + map(st, n)) }}
                </button>
              }
            </span>
            <span class="muted small dmg">
              {{ st.damageDice }}{{ st.damage.total !== 0 ? signo(st.damage.total) : '' }} {{ st.damageType }}
            </span>
          </div>
        }

        <h4 class="muted">Habilidades</h4>
        <div class="skills">
          @for (sk of entrenadas(); track sk.slug) {
            <!--
              Athletics y Acrobatics se repiten en el turno: son las unicas dos
              con acciones de rasgo attack. El combo va pegado al chip para que
              el numero del chip siga siendo el que vas a tirar.
            -->
            @if (tieneManiobras(sk.slug)) {
              <span class="chip con-maniobra">
                <button class="nombre" (click)="tirar(sk.name, sk.stat, maniobraDe(sk.slug))">
                  {{ sk.name }}
                </button>
                <select
                  class="maniobra"
                  title="En que ataque del turno estas: la 2da paga -5 y la 3ra -10"
                  (change)="setManiobra(sk.slug, $any($event.target).value)"
                >
                  @for (n of [1, 2, 3]; track n) {
                    <option [value]="n" [selected]="n === maniobraDe(sk.slug)">
                      {{ signo(sk.stat.total + mapDeManiobra(n)) }}
                    </option>
                  }
                </select>
              </span>
            } @else {
              <button class="chip" (click)="tirar(sk.name, sk.stat)">
                {{ sk.name }} <strong>{{ signo(sk.stat.total) }}</strong>
              </button>
            }

          }
        </div>
      </div>
    } @else {
      <p class="muted small">{{ mensaje() }}</p>
    }
  `,
  styles: `
    .pj {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .pj-head {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .pj-head .chico {
      margin-left: auto;
      padding: 0.05rem 0.4rem;
      font-size: 0.75rem;
    }

    .vitales,
    .salvaciones {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    .vital,
    .salvaciones button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.1rem;
      padding: 0.3rem 0.6rem;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: inherit;
      font: inherit;
    }

    .tirable {
      cursor: pointer;
    }

    .tirable:hover {
      border-color: var(--accent);
    }

    .hp input {
      width: 3.2rem;
    }

    h4 {
      margin: 0.3rem 0 0;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .ataque {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 0.3rem 0.5rem;
      padding: 0.25rem 0;
      border-bottom: 1px solid var(--border);
    }

    .nombre {
      font-weight: 600;
      font-size: 0.85rem;
    }

    .tres {
      display: flex;
      gap: 0.2rem;
    }

    .dmg {
      grid-column: 1 / -1;
    }

    .skills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    /* El chip con combo sigue siendo un chip: el select vive adentro del marco. */
    .skills .chip.con-maniobra {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
    }

    .skills .con-maniobra .nombre {
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      padding: 0;
      cursor: pointer;
    }

    /* El combo hace de numero del chip, con las tres opciones ya calculadas. */
    .skills .maniobra {
      appearance: none;
      background: transparent;
      border: none;
      color: inherit;
      font: inherit;
      font-weight: 700;
      padding: 0;
      cursor: pointer;
    }

    .skills .maniobra option {
      background: var(--surface);
      color: var(--text);
    }

    .skills .chip {
      font-size: 0.78rem;
    }
  `,
})
export class PjPanelComponent {
  readonly partyId = input.required<string>();

  private content = inject(ContentService);
  private characters = inject(CharacterService);
  private parties = inject(PartyService);
  private chat = inject(PartyChatService);

  readonly record = signal<CharacterRecord | null>(null);
  readonly characterId = signal<string | null>(null);
  private readonly index = signal<ContentIndex | null>(null);
  readonly mensaje = signal('Cargando…');

  readonly salvaciones = [
    { key: 'fortitude' as const, label: 'Fortaleza' },
    { key: 'reflex' as const, label: 'Reflejos' },
    { key: 'will' as const, label: 'Voluntad' },
  ];

  readonly hoja = computed(() => {
    const r = this.record();
    const i = this.index();
    return r && i ? computeCharacter(r.build, r.state, i) : null;
  });

  /** Solo las que sabés hacer: las untrained ocupan lugar y no se tiran. */
  readonly entrenadas = computed(() => {
    const s = this.hoja();
    return s ? [...s.skills.filter((x) => x.rank > 0), ...s.lores] : [];
  });

  readonly signo = signed;
  readonly map = mapPenalty;

  constructor() {
    effect(() => {
      const party = this.partyId();
      if (!party) return;
      void this.cargar(party);
    });
  }

  private async cargar(partyId: string) {
    this.index.set(await this.content.index());

    const id = await this.parties.myCharacterId(partyId);
    if (!id) {
      this.mensaje.set('Todavía no elegiste con qué personaje jugás en esta mesa.');
      return;
    }

    this.characterId.set(id);
    const record = await this.characters.get(id);
    if (!record) {
      this.mensaje.set('No encontré ese personaje.');
      return;
    }
    this.record.set(record);
  }

  async setHp(valor: string) {
    const record = this.record();
    const s = this.hoja();
    const numero = Number(valor);
    if (!record || !s || Number.isNaN(numero)) return;

    record.state.hp.current = Math.max(0, Math.min(s.maxHp.total, Math.round(numero)));
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  tieneManiobras = (slug: string) => HABILIDADES_CON_MAP.has(slug);
  mapDeManiobra = mapDeManiobra;

  /** En que ataque del turno esta cada habilidad. Efimero, como en la hoja. */
  private readonly maniobras = signal<Record<string, number>>({});
  maniobraDe = (slug: string) => this.maniobras()[slug] ?? 1;
  setManiobra(slug: string, valor: string) {
    this.maniobras.update((m) => ({ ...m, [slug]: Number(valor) }));
  }

  tirar(label: string, stat: Parameters<typeof tirarChequeo>[1], ataque = 1) {
    this.publicar(tirarChequeo(label, stat, ataque));
  }

  atacar(strike: StrikeSheet, ataque: number) {
    this.publicar(tirarAtaque(strike, ataque));
  }

  /**
   * La tirada va al chat y no se muestra acá.
   *
   * Es la diferencia con la hoja: en la mesa el chat está siempre a la vista,
   * así que un cartel encima sería la misma cosa dos veces.
   */
  private publicar(t: Tirada) {
    void this.chat.publicarTirada(this.partyId(), t).catch(() => {
      // Si falla el chat, la tirada se perdió: no hay dónde mostrarla acá.
    });
  }
}
