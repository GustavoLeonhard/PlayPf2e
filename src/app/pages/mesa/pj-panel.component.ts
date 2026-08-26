import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';

import type { CharacterRecord } from '../../core/models/character.model';
import { computeCharacter, type ContentIndex, type StrikeSheet } from '../../core/rules/character.engine';
import { signed } from '../../core/rules/modifiers';
import { priceToCp, splitCp } from '../../core/rules/money';
import {
  MONEDAS,
  alternarCondicion,
  alternarEfecto,
  aplicarPuenteDeEfecto,
  cambiarCantidad,
  cambiarValorDeCondicion,
  conMoneda,
  efectoActivo,
  escudoCon,
  alternarEquipado,
  quitarDelInventario,
} from '../../core/rules/estado';
import { CONDITION_BY_ID } from '../../core/rules/conditions';
import type { ConditionText } from '../../core/services/content.service';
import type { Effect } from '../../core/rules/efectos';
import type { Equipment } from '../../core/models/content.model';
import { buscar, sinHtml } from '../../core/rules/buscar';
import { datosDeEquipo } from '../../core/rules/fichas';
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
  imports: [NgTemplateOutlet],
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
          <!--
            La velocidad cierra el primer renglon: es un dato que se consulta
            igual de seguido que la CA —cuantos pies me muevo— y no se tira.
          -->
          <div class="vital">
            <span class="muted small">Velocidad</span>
            <strong>{{ s.speed.total }}<small class="pies"> ft</small></strong>
          </div>
        </div>

        <!--
          Segundo renglon: las dos que se tiran al empezar un encuentro.
        -->
        <div class="vitales">
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
                <button
                  class="info"
                  [class.puesto]="fichaAbierta() === 'skill:' + sk.slug"
                  title="De dónde sale el número"
                  (click)="verFicha('skill:' + sk.slug)"
                >
                  ⓘ
                </button>
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
              <span class="chip">
                <button
                  class="info"
                  [class.puesto]="fichaAbierta() === 'skill:' + sk.slug"
                  title="De dónde sale el número"
                  (click)="verFicha('skill:' + sk.slug)"
                >
                  ⓘ
                </button>
                <button class="nombre" (click)="tirar(sk.name, sk.stat)">
                  {{ sk.name }} <strong>{{ signo(sk.stat.total) }}</strong>
                </button>
              </span>
            }

          }
        </div>
        <!--
          La ficha de habilidad va debajo de la tira entera y no dentro de su
          chip: los chips van en flex y uno crecido rompe el renglon.
        -->
        @if (fichaAbierta()?.startsWith('skill:') && ficha(); as f) {
          <div class="ficha">
            <ng-container [ngTemplateOutlet]="cuerpoDeFicha" [ngTemplateOutletContext]="{ $implicit: f }" />
          </div>
        }

        <!-- Lo que tira dados: golpes y conjuros. -->
        <h4 class="muted">Ataques</h4>
        @for (st of s.strikes; track st.name) {
          <div class="ataque">
            @if (st.inventoryIndex >= 0) {
              <button
                class="info"
                [class.puesto]="fichaAbierta() === 'strike:' + st.inventoryIndex"
                title="Ver el arma"
                (click)="verFicha('strike:' + st.inventoryIndex)"
              >
                ⓘ
              </button>
            } @else {
              <!-- El puño y las armas naturales no son un objeto del catalogo. -->
              <span class="info hueco"></span>
            }
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
          @if (fichaAbierta() === 'strike:' + st.inventoryIndex && ficha(); as f) {
            <div class="ficha">
              <ng-container [ngTemplateOutlet]="cuerpoDeFicha" [ngTemplateOutletContext]="{ $implicit: f }" />
            </div>
          }
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

        <!--
          Equipar y guardar NO estan aca: viven en la fila del inventario, con
          las mismas palabras que en la hoja completa. Cambiar la forma de uso
          segun la pantalla obliga al jugador a reaprender la app a la mitad.

          Lo que si vive aca es lo que la hoja no tiene tan a mano y en la mesa
          se toca todo el tiempo: el escudo se alza cada turno y se rompe de a
          poco durante la aventura.
        -->
        @if (s.shield; as esc) {
          <h4 class="muted">Escudo</h4>
          <div class="escudo">
              <button
                class="chip"
                [class.puesto]="esc.raised"
                [title]="esc.raised ? 'Bajarlo' : 'Alzarlo: +' + esc.acBonus + ' a la CA hasta tu próximo turno'"
                (click)="alternarAlzado()"
              >
                {{ esc.raised ? 'alzado' : 'alzar' }} +{{ esc.acBonus }}
              </button>

              <label class="aguante" [class.roto]="esc.broken" title="Puntos que le quedan">
                <input
                  type="number"
                  min="0"
                  [max]="esc.maxHp"
                  [value]="esc.currentHp"
                  (change)="setHpDeEscudo($any($event.target).value)"
                />
                <span class="muted">/ {{ esc.maxHp }}</span>
              </label>

              <span class="muted small">dureza {{ esc.hardness }}</span>
              @if (esc.broken) {
                <span class="tag roto-tag" [title]="'Debajo de ' + esc.brokenThreshold + ' no da bonus'">roto</span>
              }
            @if (esc.currentHp < esc.maxHp) {
              <button class="chip" title="Dejarlo como nuevo" (click)="repararEscudo()">reparar</button>
            }
          </div>
        }

        <!--
          Condiciones y efectos: lo que se prende y se apaga en cada pelea. Es
          la mitad de lo que se toca en una sesion, y hasta ahora habia que
          abrir la hoja completa para hacerlo.
        -->
        <h4 class="muted">Condiciones</h4>
        <div class="lista-estado">
          @for (c of condicionesPuestas(); track c.id) {
            <!--
              La descripción va en el tooltip y no detrás de un ⓘ: sumar un
              icono cambiaría lo que hace el clic en un chip que ya tiene tres
              botones adentro. Leer no deberia costar un clic.
            -->
            <span class="chip puesto" [title]="c.texto">
              {{ c.nombre }}
              @if (c.valor) {
                <button class="paso" title="Bajar" (click)="cambiarValor(c.id, -1)">−</button>
                <strong>{{ c.valor }}</strong>
                <button class="paso" title="Subir" (click)="cambiarValor(c.id, 1)">+</button>
              }
              <button class="quitar" title="Sacar" (click)="alternarCondicion(c.id)">×</button>
            </span>
          } @empty {
            <span class="muted small">Ninguna.</span>
          }
        </div>
        <div class="buscador">
          <input
            type="search"
            placeholder="Agregar condición…"
            [value]="buscarCondicion()"
            (input)="buscarCondicion.set($any($event.target).value)"
          />
          @for (c of resultadosDeCondicion(); track c.id) {
            <button class="chip" (click)="alternarCondicion(c.id)">+ {{ c.name }}</button>
          }
        </div>

        <!--
          La seccion se ve SIEMPRE, aunque no tengas ninguno. Escondida cuando
          esta vacia parece que la mesa no sabe de efectos, y el jugador no
          descubre que se agregan desde la hoja.
        -->
        <h4 class="muted">Efectos</h4>
        <div class="lista-estado">
          @for (x of efectosEnLista(); track x.efecto.id) {
            <button
              class="chip"
              [class.puesto]="x.activo"
              [title]="tooltipDeEfecto(x)"
              (click)="alternarEfecto(x.efecto.id)"
            >
              {{ x.efecto.name }}
            </button>
          } @empty {
            <span class="muted small">
              Ninguno a mano. Se agregan desde la hoja completa; acá se prenden y se apagan.
            </span>
          }
        </div>

        <h4 class="muted">Inventario</h4>
        <!-- Las monedas se editan acá: en la mesa se paga y se cobra todo el tiempo. -->
        @if (bolsa(); as b) {
          <div class="bolsa">
            @for (m of monedas; track m.key) {
              <label class="moneda" [title]="m.name">
                <input
                  type="number"
                  min="0"
                  [value]="b[m.key]"
                  (change)="setMoneda(m.key, $any($event.target).value)"
                />
                <span class="muted">{{ m.key }}</span>
              </label>
            }
          </div>
        }

        <!-- Un objeto por fila, como en la hoja: con cuántos tenés y el quitar. -->
        <div class="inventario">
          @for (it of inventario(); track $index) {
            <div class="inv-fila" [class.equipado]="it.equipado">
              <!--
                El ⓘ va SIEMPRE a la izquierda del nombre, en las tres listas.
                A la derecha quedaba a distinta distancia segun cuantos botones
                tuviera cada fila, y el ojo lo tenia que ir a buscar.
              -->
              @if (it.tieneFicha) {
                <button
                  class="info"
                  [class.puesto]="fichaAbierta() === 'item:' + $index"
                  title="Ver la descripción"
                  (click)="verFicha('item:' + $index)"
                >
                  ⓘ
                </button>
              } @else {
                <span class="info hueco"></span>
              }
              <span class="inv-nombre">{{ it.nombre }}</span>
              <!--
                La cantidad se ve SIEMPRE, aunque tengas uno: si apareciera
                recien a partir de dos, no habria donde apretar para pasar de
                uno a dos. Se gastan flechas y municiones todo el tiempo.
              -->
              <label class="cantidad" title="Cuántos">
                <span class="muted">×</span>
                <input
                  type="number"
                  min="1"
                  [value]="it.cantidad"
                  (change)="setCantidad($index, $any($event.target).value)"
                />
              </label>
              @if (it.equipable) {
                <button class="chip" [class.puesto]="it.equipado" (click)="alternarEquipado($index)">
                  {{ it.equipado ? 'guardar' : 'equipar' }}
                </button>
              }
              <!--
                Dice "eliminar" y no una cruz por dos motivos: es la palabra que
                usa la hoja completa, y la fila ya tiene un "×" —el de la
                cantidad—, asi que dos cruces seguidas se confunden.
              -->
              <button class="chip borrar" title="Sacar de la mochila" (click)="quitarItem($index)">eliminar</button>
            </div>

            <!--
              La ficha se despliega DEBAJO de su fila, no en un cartel encima:
              en una ventana de 300px un toast tapa justo lo que estabas
              mirando, y ademas el chat ya ocupa ese rincon.
            -->
            @if (fichaAbierta() === 'item:' + $index && ficha(); as f) {
              <div class="ficha">
                <ng-container [ngTemplateOutlet]="cuerpoDeFicha" [ngTemplateOutletContext]="{ $implicit: f }" />
              </div>
            }
          } @empty {
            <p class="muted small vacio">La mochila está vacía.</p>
          }
        </div>
        <div class="buscador">
          <input
            type="search"
            placeholder="Agregar objeto…"
            [value]="buscarItem()"
            (input)="buscarItem.set($any($event.target).value)"
          />
          @for (e of resultadosDeEquipo(); track e.id) {
            <button class="chip" (click)="agregarItem(e.id)">+ {{ e.name }}</button>
          }
        </div>
      </div>
    } @else {
      <p class="muted small">{{ mensaje() }}</p>
    }

    <!--
      El cuerpo de una ficha, una sola vez para las tres listas. Objetos y armas
      traen datos del catalogo; las habilidades, el desglose del modificador.
    -->
    <ng-template #cuerpoDeFicha let-f>
      @if (f.datos.length) {
        <dl class="ficha-datos">
          @for (d of f.datos; track d.etiqueta) {
            <div><dt>{{ d.etiqueta }}</dt><dd>{{ d.valor }}</dd></div>
          }
        </dl>
      }
      @if (f.cuerpo) {
        <div class="ficha-cuerpo" [innerHTML]="f.cuerpo"></div>
      } @else {
        <p class="muted small sin-texto">{{ f.sinTexto ?? 'Sin descripción en el pack.' }}</p>
      }
    </ng-template>
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
      /*
        Angosto: el nombre largo se corta con puntos suspensivos y se lee
        entero al desplegarlo. Con 5.5rem, Percepcion e Iniciativa no entraban
        juntas en el renglon cuando la columna se angosta.
      */
      max-width: 4rem;
      text-overflow: ellipsis;
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
    .lista-estado,
    .buscador {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }

    /* Un objeto por fila, no chips: la fila deja lugar al quitar sin apretar. */
    .inventario {
      display: flex;
      flex-direction: column;
    }

    .inv-fila {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      padding: 0.15rem 0;
      border-bottom: 1px solid var(--border);
    }

    .inv-nombre {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .inv-fila.equipado .inv-nombre {
      color: var(--accent);
    }

    /* Prendido se ve marcado; apagado, al ras. Es el mismo interruptor. */
    .chip.puesto {
      border-color: var(--accent);
      color: var(--accent);
    }

    .paso,
    .quitar {
      background: none;
      border: none;
      color: var(--muted);
      font: inherit;
      line-height: 1;
      padding: 0 0.15rem;
      cursor: pointer;
    }

    .quitar:hover,
    .chip.borrar:hover {
      color: var(--danger);
      border-color: var(--danger);
    }

    .paso:hover {
      color: var(--text);
    }

    .buscador input {
      flex: 1 1 8rem;
      min-width: 0;
      padding: 0.1rem 0.25rem;
      font: inherit;
      font-size: 0.78rem;
    }

    .escudo {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0.15rem 0;
    }

    .escudo {
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.3rem;
    }

    .aguante {
      display: inline-flex;
      align-items: baseline;
      gap: 0.15rem;
      font-size: 0.78rem;
    }

    .aguante input {
      width: 2.8rem;
      padding: 0.05rem 0.2rem;
      font: inherit;
      text-align: right;
    }

    /* Roto no es un detalle: por debajo del umbral el escudo deja de dar CA. */
    .aguante.roto input,
    .roto-tag {
      color: var(--danger);
      border-color: var(--danger);
    }

    .info {
      background: none;
      border: none;
      color: var(--muted);
      font: inherit;
      font-size: 0.85rem;
      line-height: 1;
      padding: 0 0.1rem;
      cursor: pointer;
    }

    .info:hover,
    .info.puesto {
      color: var(--accent);
    }

    /* Sin ficha no hay icono, pero el lugar se reserva: si no, el nombre de esa
       fila arranca corrido y la columna deja de leerse derecha. */
    .info.hueco {
      display: inline-block;
      width: 1ch;
    }

    .sin-texto {
      margin: 0;
    }

    /* Desplegada bajo su fila, hundida para que se lea como parte de ella. */
    .ficha {
      padding: 0.3rem 0.5rem 0.4rem;
      margin-bottom: 0.2rem;
      background: var(--surface-2);
      border-radius: 0 0 6px 6px;
      font-size: 0.75rem;
    }

    .ficha-datos {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0 0.5rem;
      margin: 0 0 0.3rem;
    }

    .ficha-datos > div {
      display: contents;
    }

    .ficha-datos dt {
      color: var(--muted);
    }

    .ficha-datos dd {
      margin: 0;
    }

    /* El texto del pack trae parrafos y listas: que no se desarmen ni desborden. */
    .ficha-cuerpo {
      max-height: 12rem;
      overflow-y: auto;
      line-height: 1.45;
    }

    .ficha-cuerpo :first-child {
      margin-top: 0;
    }

    .inv-fila .cantidad {
      display: inline-flex;
      align-items: baseline;
      gap: 0.1rem;
      font-size: 0.78rem;
    }

    .inv-fila .cantidad input {
      width: 2.6rem;
      padding: 0.05rem 0.2rem;
      font: inherit;
      text-align: right;
    }

    .bolsa input {
      width: 3rem;
      padding: 0.1rem 0.2rem;
      font: inherit;
      font-size: 0.78rem;
      text-align: right;
    }

    .vacio {
      margin: 0.2rem 0;
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
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      font-size: 0.78rem;
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
      /*
        Angostas a proposito: HP, CA y Velocidad tienen que entrar en un solo
        renglon tambien cuando el bloque de atributos se pone al lado y le come
        ancho a esta columna. Con 0.6rem de padding se partian justo ahi.
      */
      padding: 0.3rem 0.4rem;
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
      /* El control numérico reserva espacio para sus flechas: con 3.2rem el
         segundo dígito de HP podía quedar tapado al achicar la ventana. */
      width: 4.2rem;
      min-width: 4.2rem;
    }

    .hp {
      display: flex;
      align-items: center;
      white-space: nowrap;
      width: 2.7rem;
    }

    /* La unidad no compite con el numero: es contexto, no dato. */
    .pies {
      font-size: 0.6em;
      font-weight: 400;
      color: var(--muted);
    }

    h4 {
      margin: 0.3rem 0 0;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .ataque {
      display: grid;
      /* ⓘ · nombre (se estira) · los tres ataques */
      grid-template-columns: auto 1fr auto;
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

    .skills .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
    }

    .skills .nombre,
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
    return record.build.inventory.map((item) => {
      const base = index.equipmentById.get(item.id);
      return {
        nombre: item.custom?.name ?? base?.name ?? 'Objeto sin nombre',
        cantidad: item.quantity,
        equipado: item.equipped,
        // Mismo criterio que la hoja: lo inventado se puede equipar por las dudas.
        equipable: !base || ['weapon', 'armor', 'shield'].includes(base.type),
        /*
         * Hay ficha si CONOCEMOS el objeto, no si ya llegó su texto. El texto
         * viaja aparte y se pide al abrir el ⓘ; si el ⓘ esperara a tenerlo,
         * nunca se pintaría y nadie podría dispararlo. Ya nos pasó con las
         * dotes otorgadas.
         */
        tieneFicha: !!base,
      };
    });
  });

  /** La bolsa como la tenés en la mano. Los PJ viejos no la traen repartida. */
  readonly bolsa = computed(() => {
    const state = this.record()?.state;
    if (!state) return null;
    return state.purse ?? splitCp(state.coins ?? 0);
  });

  readonly monedas = MONEDAS;

  async setMoneda(moneda: 'pp' | 'gp' | 'sp' | 'cp', valor: string) {
    const record = this.record();
    const bolsa = this.bolsa();
    if (!record || !bolsa) return;

    const nueva = conMoneda(bolsa, moneda, Number(valor));
    record.state.purse = nueva;
    // `coins` sigue siendo la verdad en cobre: es con lo que se compra.
    record.state.coins = priceToCp(nueva);
    await this.guardar(record);
  }

  // ------------------------------------------------------ armadura y escudo

  async alternarEquipado(indice: number) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = alternarEquipado(record.build.inventory, indice);
    await this.guardar(record);
  }

  /** Raise a Shield: dura hasta el inicio de tu próximo turno, por eso se baja a mano. */
  async alternarAlzado() {
    const record = this.record();
    const escudo = this.hoja()?.shield;
    if (!record || !escudo) return;
    record.state.shield = escudoCon(record.state.shield, { raised: !escudo.raised }, escudo.maxHp);
    await this.guardar(record);
  }

  /** Los puntos que le quedan al escudo. Se escriben: el daño lo canta el máster. */
  async setHpDeEscudo(valor: string) {
    const record = this.record();
    const escudo = this.hoja()?.shield;
    if (!record || !escudo) return;
    record.state.shield = escudoCon(record.state.shield, { hp: Number(valor) }, escudo.maxHp);
    await this.guardar(record);
  }

  async repararEscudo() {
    const record = this.record();
    const escudo = this.hoja()?.shield;
    if (!record || !escudo) return;
    record.state.shield = escudoCon(record.state.shield, { hp: escudo.maxHp }, escudo.maxHp);
    await this.guardar(record);
  }

  // ----------------------------------------------------------- ficha

  /**
   * Qué tiene la ficha abierta. Una por vez: la ventana es chica.
   *
   * La clave lleva prefijo porque conviven mundos distintos —`item:3`,
   * `skill:athletics`— y un índice suelto no diría de qué lista es.
   */
  readonly fichaAbierta = signal<string | null>(null);

  verFicha(clave: string) {
    /*
     * El texto del equipo viaja aparte y se pide recién cuando hace falta.
     * `strike:` también apunta al catálogo —un ataque es un arma de la mochila—,
     * y pedirlo solo para `item:` dejaba la ficha del arma sin su descripción.
     */
    if (clave.startsWith('item:') || clave.startsWith('strike:')) {
      this.content.asegurarDescripciones('equipment');
    }
    this.fichaAbierta.update((abierta) => (abierta === clave ? null : clave));
  }

  /**
   * La ficha abierta: datos técnicos y texto.
   *
   * Depende de `descripcionesListas` para que el cuerpo aparezca solo cuando el
   * archivo llega, sin volver a apretar.
   */
  readonly ficha = computed(() => {
    this.content.descripcionesListas();

    const clave = this.fichaAbierta();
    const record = this.record();
    const index = this.index();
    const s = this.hoja();
    if (!clave || !record || !index || !s) return null;

    const [tipo, resto] = [clave.slice(0, clave.indexOf(':')), clave.slice(clave.indexOf(':') + 1)];

    if (tipo === 'item' || tipo === 'strike') {
      const item = record.build.inventory[Number(resto)];
      const base = item ? index.equipmentById.get(item.id) : undefined;
      if (!base) return null;
      return { titulo: base.name, datos: datosDeEquipo(base), cuerpo: (base.description ?? '').trim() };
    }

    /*
     * Las habilidades NO tienen descripción: no hay `skills.json` en el pack, y
     * está anotado como deuda del overlay. Pero sí tenemos algo que contestar,
     * y es la pregunta que uno se hace en la mesa mirando el número: de dónde
     * sale este +7. Eso lo sabe el motor y hasta ahora solo se veía en la hoja.
     */
    const hab = [...s.skills, ...s.lores].find((x) => x.slug === resto);
    if (!hab) return null;
    return {
      titulo: hab.name,
      datos: hab.stat.breakdown.map((m) => ({ etiqueta: m.source, valor: signed(m.value) })),
      cuerpo: '',
      sinTexto: 'El pack no trae descripción de las habilidades. Esto es de dónde sale el número.',
    };
  });

  async setCantidad(indice: number, valor: string) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = cambiarCantidad(record.build.inventory, indice, Number(valor));
    await this.guardar(record);
  }

  async quitarItem(indice: number) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = quitarDelInventario(record.build.inventory, indice);
    await this.guardar(record);
  }

  async agregarItem(id: string) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = [...record.build.inventory, { id, quantity: 1, equipped: false }];
    this.buscarItem.set('');
    await this.guardar(record);
  }

  // ------------------------------------------------------ buscar equipo

  readonly buscarItem = signal('');
  private readonly equipo = signal<Equipment[]>([]);

  /**
   * Solo con dos letras escritas: son 4.563 objetos y listarlos todos en una
   * ventana de la mesa no ayuda a nadie.
   */
  readonly resultadosDeEquipo = computed(() => {
    const q = this.buscarItem().trim();
    if (q.length < 2) return [];
    return buscar(this.equipo(), q).slice(0, 8);
  });

  // ---------------------------------------------------------- condiciones

  private readonly condiciones = signal<ConditionText[]>([]);

  /** Las que tenés puestas ahora, con su texto. */
  readonly condicionesPuestas = computed(() => {
    const puestas = this.record()?.state.conditions ?? [];
    const porId = new Map(this.condiciones().map((c) => [c.id, c]));
    return puestas.map((c) => ({
      id: c.id,
      valor: c.value,
      nombre: porId.get(c.id)?.name ?? c.id,
      // El texto oficial va de tooltip: se lee sin cambiar lo que hace el clic.
      texto: porId.get(c.id)?.text ?? '',
    }));
  });

  readonly buscarCondicion = signal('');

  readonly resultadosDeCondicion = computed(() => {
    const q = this.buscarCondicion().trim().toLowerCase();
    if (!q) return [];
    const puestas = new Set((this.record()?.state.conditions ?? []).map((c) => c.id));
    return this.condiciones()
      .filter((c) => !puestas.has(c.id) && c.name.toLowerCase().includes(q))
      .slice(0, 8);
  });

  conValor = (id: string) => CONDITION_BY_ID.get(id)?.valued ?? false;

  async alternarCondicion(id: string) {
    const record = this.record();
    if (!record) return;
    record.state.conditions = alternarCondicion(record.state.conditions, id, this.conValor(id));
    this.buscarCondicion.set('');
    await this.guardar(record);
  }

  async cambiarValor(id: string, delta: number) {
    const record = this.record();
    if (!record) return;
    record.state.conditions = cambiarValorDeCondicion(record.state.conditions, id, delta);
    await this.guardar(record);
  }

  // -------------------------------------------------------------- efectos

  private readonly efectos = signal<Effect[]>([]);

  /**
   * Lo que tenés A MANO, prendido o no.
   *
   * En la mesa no se agregan efectos nuevos —eso es buscar entre 1.418 y se
   * hace una vez, en la hoja—: lo que se hace mil veces es prender la furia al
   * empezar la pelea y apagarla al terminar.
   */
  readonly efectosEnLista = computed(() => {
    // Que llegue el texto vuelve a correr esto y los tooltips se llenan solos.
    this.content.descripcionesListas();

    const porId = new Map(this.efectos().map((e) => [e.id, e]));
    return (this.record()?.state.effects ?? [])
      .map((e) => ({ efecto: porId.get(e.id), activo: e.active !== false }))
      .filter((x): x is { efecto: Effect; activo: boolean } => !!x.efecto)
      .map((x) => ({ ...x, texto: sinHtml(x.efecto.description ?? '') }));
  });

  /**
   * Qué hace el clic, y después qué es el efecto.
   *
   * En ese orden porque el chip ES un interruptor: lo primero que uno necesita
   * saber al apuntarle es si lo va a prender o apagar. La descripción va abajo,
   * separada, para el que se queda leyendo.
   */
  tooltipDeEfecto(x: { activo: boolean; texto: string }) {
    const accion = x.activo ? 'Apagar' : 'Prender';
    return x.texto ? `${accion}

${x.texto}` : accion;
  }

  async alternarEfecto(id: string) {
    const record = this.record();
    const s = this.hoja();
    if (!record || !s) return;

    const prendiendo = !efectoActivo(record.state.effects, id);
    record.state.effects = alternarEfecto(record.state.effects, id);

    // El mismo puente que la hoja: sin esto, prender la furia desde la mesa no
    // daría los HP temporales y el número quedaría mintiendo.
    const slug = this.efectos().find((e) => e.id === id)?.slug ?? '';
    aplicarPuenteDeEfecto(record.state, slug, prendiendo, {
      nivel: s.level,
      modCon: s.abilityMods.con,
      tempHpDeFuria: s.rage?.tempHp,
    });

    await this.guardar(record);
  }

  /** Un solo camino para persistir: la hoja se recalcula sola desde el record. */
  private async guardar(record: CharacterRecord) {
    this.record.set({ ...record });
    await this.characters.save(record);
  }

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
    void this.content.conditions().then((c) => this.condiciones.set(c));
    void this.content.effects().then((e) => this.efectos.set(e));
    void this.content.equipment().then((e) => this.equipo.set(e));

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

    /*
     * El texto de los efectos son 530 kB y solo sirve para los tooltips, así
     * que se pide únicamente si este personaje tiene alguno a mano. La mayoría
     * de las mesas no lo baja nunca.
     */
    if (record.state.effects?.length) this.content.asegurarDescripciones('effects');
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
