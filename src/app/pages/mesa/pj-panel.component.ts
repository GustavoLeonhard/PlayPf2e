import { Component, computed, effect, inject, input, signal } from '@angular/core';

import type { CharacterRecord } from '../../core/models/character.model';
import { computeCharacter, type ContentIndex, type StrikeSheet } from '../../core/rules/character.engine';
import { signed } from '../../core/rules/modifiers';
import { splitCp } from '../../core/rules/money';
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
 * No es la hoja recortada por espacio: es lo que se consulta o se toca DURANTE
 * una sesión. Arriba lo que se mira todo el tiempo —vida, defensas, iniciativa
 * con su combo, los atributos en crudo y los puntos de héroe—; abajo, en orden,
 * lo que tira dados y lo que llevás encima.
 *
 * Lo que se decide una vez y no se vuelve a tocar en la mesa —dotes, boosts,
 * comprar equipo, aprender conjuros, los slots— vive en la hoja completa, que
 * está a un botón de distancia.
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

        <div class="cabecera">
        <div class="izquierda">
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

          <!--
            Iniciativa con su combo, como en la hoja: no hay un modificador
            propio, se tira con Percepcion salvo que lo que venias haciendo
            justifique otra (Stealth si te escondias). Lo decide el master, asi
            que la lista es abierta y se elige en el momento.
          -->
          <div class="vital ini">
            <span class="muted small">Iniciativa</span>
            <span class="ini-fila">
              @if (opcionDeIniciativa(); as ini) {
                <button class="ini-tirar tirable" title="Tirar iniciativa" (click)="tirarIniciativa()">
                  {{ signo(ini.stat.total) }}
                </button>
              }
              <select
                class="ini-select"
                title="Con qué se tira"
                (change)="iniciativaCon.set($any($event.target).value)"
              >
                @for (o of s.initiative.options; track o.key) {
                  <option [value]="o.key" [selected]="o.key === iniciativaCon()">{{ o.label }}</option>
                }
              </select>
            </span>
          </div>
        </div>

        <div class="salvaciones">
          @for (sv of salvaciones; track sv.key) {
            <button class="tirable" (click)="tirar(sv.label, s.saves[sv.key])">
              <span class="muted small">{{ sv.label }}</span>
              <strong>{{ signo(s.saves[sv.key].total) }}</strong>
            </button>
          }
        </div>
        </div>

        <aside class="derecha">
          <!--
            Los atributos van en crudo y en una linea: en la mesa se consultan
            para un chequeo suelto que pide el master ("tirame Fuerza"), no para
            planificar. El numero es clickeable y tira ese chequeo.
          -->
          <div class="attrs">
            @for (ab of atributos; track ab.key) {
              <button class="attr tirable" [title]="ab.label" (click)="tirar(ab.label, s.abilityChecks[ab.key])">
                <span class="muted small">{{ ab.corto }}</span>
                <strong>{{ signo(s.abilityMods[ab.key]) }}</strong>
              </button>
            }
          </div>

          <!--
            Los puntos de heroe se gastan en la mesa, no se planifican: por eso
            estan aca y no en la hoja completa nada mas.
          -->
          <div class="heroe">
            <span class="muted small">Puntos de héroe</span>
            <span class="puntos">
              @for (n of [1, 2, 3]; track n) {
                <button
                  class="punto"
                  [class.on]="(record()?.state?.heroPoints ?? 0) >= n"
                  [title]="n + ''"
                  (click)="setHeroPoints(n)"
                >
                  ◆
                </button>
              }
              <button class="punto cero" title="Ninguno" (click)="setHeroPoints(0)">×</button>
            </span>
          </div>
        </aside>
        </div>

        <h4 class="muted">Habilidades</h4>
        <div class="skills">
          @for (sk of todasLasSkills(); track sk.slug) {
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

        <!-- Lo que tira dados: golpes y conjuros. -->
        <h4 class="muted">Ataques</h4>
        @for (st of s.strikes; track st.name) {
          <div class="ataque">
            <span class="nombre">{{ st.name }}</span>
            <span class="tres">
              @for (n of [1, 2, 3]; track n) {
                <button class="chip" [title]="n + 'º ataque del turno'" (click)="atacar(st, n)">
                  {{ signo(st.attack.total + map(st, n)) }}
                </button>
              }
            </span>
            <span class="muted small dmg">
              {{ st.damageDice }}{{ st.damage.total !== 0 ? signo(st.damage.total) : '' }} {{ st.damageType }}
            </span>
          </div>
        }

        @if (s.spellcasting; as sc) {
          <h4 class="muted">Conjuros</h4>
          <div class="conjuros">
            <button class="chip" (click)="tirar('Ataque de conjuro', sc.attack)">
              Ataque <strong>{{ signo(sc.attack.total) }}</strong>
            </button>
            <span class="chip estatico">CD <strong>{{ sc.dc.total }}</strong></span>
          </div>
          <p class="muted small nota">Los slots y la lista completa, en la hoja.</p>
        }

        <!--
          El foco va aparte de los conjuros: el Monje y el Champion tienen pool
          sin ser lanzadores, y adentro del bloque de conjuros no lo verian.
        -->
        @if (s.focus; as focus) {
          @if (focus.pool) {
            <div class="conjuros">
              <span class="chip estatico">
                Foco <strong>{{ record()?.state?.focusPoints ?? 0 }}/{{ focus.pool }}</strong>
              </span>
            </div>
          }
        }

        <h4 class="muted">Inventario</h4>
        @if (bolsa(); as b) {
          <div class="bolsa">
            @for (m of monedas; track m.key) {
              <span class="moneda"><strong>{{ b[m.key] }}</strong> {{ m.key }}</span>
            }
          </div>
        }
        <div class="inventario">
          @for (it of inventario(); track $index) {
            <span class="chip estatico" [class.equipado]="it.equipado">
              {{ it.nombre }}@if (it.cantidad > 1) {<span class="muted"> ×{{ it.cantidad }}</span>}
            </span>
          } @empty {
            <span class="muted small">La mochila está vacía.</span>
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

    /*
      Vitales a la izquierda, atributos y heroe a la derecha. Se apila solo
      cuando la ventana es angosta: la ventana de la mesa se redimensiona a
      mano y puede quedar en cualquier ancho.
    */
    .cabecera {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .izquierda {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      /* 13 + 9 = 22rem: entra al lado en la ventana por defecto, que nace en 640px. */
      flex: 1 1 13rem;
    }

    .derecha {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      flex: 1 1 9rem;
      padding: 0.4rem 0.5rem;
      border: 1px solid var(--border);
      border-radius: 6px;
    }

    .attrs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.25rem;
    }

    .attr {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: none;
      border: 1px solid transparent;
      border-radius: 4px;
      color: inherit;
      font: inherit;
      padding: 0.1rem;
    }

    .attr:hover {
      border-color: var(--accent);
    }

    .heroe {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
    }

    .puntos {
      display: flex;
      gap: 0.1rem;
    }

    .punto {
      background: none;
      border: none;
      color: var(--border);
      font-size: 1rem;
      line-height: 1;
      padding: 0 0.05rem;
      cursor: pointer;
    }

    .punto.on {
      color: var(--accent);
    }

    .punto.cero {
      color: var(--muted);
      font-size: 0.8rem;
    }

    /* La iniciativa es la unica que ademas de un numero lleva un "con que". */
    .ini-fila {
      display: flex;
      align-items: baseline;
      gap: 0.15rem;
    }

    .ini-tirar {
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      font-weight: 700;
      padding: 0;
    }

    .ini-select {
      appearance: none;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      color: var(--muted);
      font: inherit;
      font-size: 0.7rem;
      max-width: 5.5rem;
      cursor: pointer;
    }

    .ini-select:hover,
    .ini-select:focus {
      border-color: var(--border);
      color: var(--text);
    }

    .ini-select option {
      background: var(--surface);
      color: var(--text);
    }

    .conjuros,
    .bolsa,
    .inventario {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    /* Lo que no se tira no se ve como boton: no invita a clickear en vano. */
    .chip.estatico {
      cursor: default;
      opacity: 0.9;
    }

    .chip.equipado {
      border-color: var(--accent);
    }

    .moneda {
      font-size: 0.78rem;
      color: var(--muted);
    }

    .nota {
      margin: 0;
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

  /** Los seis, en el orden del manual y con la sigla que se usa en la mesa. */
  readonly atributos = [
    { key: 'str' as const, corto: 'STR', label: 'Fuerza' },
    { key: 'dex' as const, corto: 'DEX', label: 'Destreza' },
    { key: 'con' as const, corto: 'CON', label: 'Constitución' },
    { key: 'int' as const, corto: 'INT', label: 'Inteligencia' },
    { key: 'wis' as const, corto: 'WIS', label: 'Sabiduría' },
    { key: 'cha' as const, corto: 'CHA', label: 'Carisma' },
  ];

  /** Con qué se tira la iniciativa. Percepción salvo que elijas otra cosa. */
  readonly iniciativaCon = signal('perception');

  readonly opcionDeIniciativa = computed(() => {
    const opciones = this.hoja()?.initiative.options ?? [];
    return opciones.find((o) => o.key === this.iniciativaCon()) ?? opciones[0] ?? null;
  });

  tirarIniciativa() {
    const o = this.opcionDeIniciativa();
    if (o) this.tirar(`Iniciativa (${o.label})`, o.stat);
  }

  /**
   * Los puntos de héroe se ponen apretando el que querés, no con un + y un −.
   *
   * Son tres como máximo y se mira de reojo: tocar el segundo diamante para
   * tener dos es más rápido que contar clics.
   */
  async setHeroPoints(n: number) {
    const record = this.record();
    if (!record) return;
    // Tocar el que ya está prendido lo apaga: así se baja de dos a uno.
    record.state.heroPoints = record.state.heroPoints === n ? n - 1 : n;
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /**
   * El inventario, en versión de mesa: qué tenés y cuánto pesa lo que llevás.
   *
   * Sin precios ni botones de comprar: eso es de la hoja completa. Acá importa
   * si tenés la cuerda cuando el master pregunta si alguien tiene una cuerda.
   */
  readonly inventario = computed(() => {
    const record = this.record();
    const index = this.index();
    if (!record || !index) return [];
    return record.build.inventory.map((item) => ({
      nombre: item.custom?.name ?? index.equipmentById.get(item.id)?.name ?? 'Objeto sin nombre',
      cantidad: item.quantity,
      equipado: item.equipped,
    }));
  });

  /** La bolsa como la tenés en la mano. Los PJ viejos no la traen repartida. */
  readonly bolsa = computed(() => {
    const state = this.record()?.state;
    if (!state) return null;
    return state.purse ?? splitCp(state.coins ?? 0);
  });

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

  /**
   * TODAS las habilidades, no solo las entrenadas.
   *
   * En la mesa el master pide tiradas de lo que sea, y una habilidad sin
   * entrenar igual se tira: te falta la proficiencia, no la habilidad. Antes se
   * escondían y había que abrir la hoja completa para tirar Trepar sin entrenar.
   *
   * Las entrenadas van primero: son las que buscás la mayoría de las veces.
   */
  readonly todasLasSkills = computed(() => {
    const s = this.hoja();
    if (!s) return [];
    const skills = [...s.skills, ...s.lores];
    return [...skills.filter((x) => x.rank > 0), ...skills.filter((x) => x.rank === 0)];
  });

  readonly monedas = [
    { key: 'pp' as const },
    { key: 'gp' as const },
    { key: 'sp' as const },
    { key: 'cp' as const },
  ];

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
