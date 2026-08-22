import { Component, computed, effect, inject, input, signal, viewChild, type ElementRef, type OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';

import { iniciales } from '../../core/rules/imagen';
import type { Party } from '../../core/models/party.model';
import { VentanasService, claveDeNota, type TipoDeVentana } from '../../core/services/ventanas.service';
import { VentanaComponent } from '../../shared/ventana.component';
import { PartyNotesService } from '../../core/services/party-notes.service';
import { DadosPanelComponent } from './dados-panel.component';
import { NotaPanelComponent } from './nota-panel.component';
import { PjPanelComponent } from './pj-panel.component';
import { PartyChatService } from '../../core/services/party-chat.service';
import { PartyService, mensajeDeError } from '../../core/services/party.service';

/**
 * La mesa: donde se juega.
 *
 * Por ahora es el chat. El lienzo con las ventanas —personaje, notas, dados—
 * viene después; la ruta existe desde ya para que el chat tenga su lugar
 * definitivo y no haya que mudarlo.
 */
@Component({
  selector: 'app-mesa',
  imports: [RouterLink, VentanaComponent, PjPanelComponent, DadosPanelComponent, NotaPanelComponent],
  template: `
    <div class="mesa">
      <!-- El chat vive fijo a la izquierda: es lo único que se mira siempre. -->
      <aside class="chat">
        <header class="chat-head">
          <a class="btn ghost chico" [routerLink]="['/parties', id()]" title="Volver a la sala">←</a>
          <strong>{{ party()?.name ?? 'Mesa' }}</strong>
        </header>

        <div class="hilo" #hilo>
          @if (chat.cargando()) {
            <p class="muted small">Cargando…</p>
          }
          @for (m of chat.hilo(); track m.id) {
            <div class="msg" [class.mio]="m.mine" [class.privado]="m.visibility !== 'todos'">
              <div class="msg-head">
                @if (m.authorAvatar) {
                  <img class="avatar chico" [src]="m.authorAvatar" alt="" />
                } @else {
                  <span class="avatar chico vacio">{{ inicialesDe(m.authorName) }}</span>
                }
                <span class="quien">{{ m.authorName }}</span>
                @if (m.visibility === 'master') {
                  <span class="tag">solo el máster</span>
                } @else if (m.visibility === 'yo') {
                  <span class="tag">solo vos</span>
                }
                <span class="hora muted">{{ hora(m.created_at) }}</span>
                @if (m.mine) {
                  <button class="borrar" title="Borrar" (click)="borrar(m.id)">×</button>
                }
              </div>

              @if (m.kind === 'tirada' && m.roll; as r) {
                <!--
                  La tirada se pinta con el mismo formato que en la hoja: el
                  total grande y el desglose debajo. Por eso se guarda el
                  RollResult entero y no un texto ya armado.
                -->
                <div class="tirada" [class.crit]="r.crit === 'success'" [class.fumble]="r.crit === 'failure'">
                  <span class="t-label">{{ r.label }}</span>
                  @if (r.die) {
                    <span class="t-total">{{ r.total }}</span>
                    <span class="t-detalle muted">d20 ({{ r.die }}) {{ signo(r.modifier) }}</span>
                  } @else if (r.dc) {
                    <span class="t-total">CD {{ r.dc }}</span>
                    <span class="t-detalle muted">salvación de {{ r.save }}</span>
                  } @else {
                    <!-- Una tirada suelta: dados pelados, sin d20 ni CD. -->
                    <span class="t-total">{{ r.total }}</span>
                    <span class="t-detalle muted">{{ r.detalle }}</span>
                  }
                  @if (r.damage; as d) {
                    <span class="t-total dano">Daño: {{ d.total }}{{ d.type ? ' ' + d.type : '' }}</span>
                    <span class="t-detalle muted">{{ d.detail }}</span>
                    <span class="t-total dano critico">Daño crítico: {{ d.critical }}</span>
                    <span class="t-detalle muted">{{ d.criticalDetail }}</span>
                  }
                  @if (r.crit === 'success') {
                    <span class="t-crit">¡20 natural!</span>
                  }
                  @if (r.crit === 'failure') {
                    <span class="t-crit">1 natural…</span>
                  }
                </div>
              } @else {
                <p class="texto">{{ m.body }}</p>
              }
            </div>
          } @empty {
            @if (!chat.cargando()) {
              <p class="muted small vacio-hilo">Todavía no dijo nada nadie.</p>
            }
          }
        </div>

        @if (error(); as e) {
          <p class="error small">{{ e }}</p>
        }

        <form class="escribir" (submit)="enviar($event)">
          <input
            #entrada
            type="text"
            placeholder="Escribí algo…"
            [disabled]="enviando()"
            autocomplete="off"
          />
          <button class="btn primary" type="submit" [disabled]="enviando()">Enviar</button>
        </form>
      </aside>

<!--
        El lienzo. Las ventanas van en posición absoluta acá adentro, así que
        arrastrar no puede sacarlas de la pantalla entera, solo de este marco.
      -->
      <section class="lienzo">
        @if (ventanas.abierta('pj')) {
          <app-ventana tipo="pj" titulo="Personaje" (sacar)="sacarAfuera('pj')">
            <app-pj-panel [partyId]="id()" />
          </app-ventana>
        }
        @if (ventanas.abierta('dados')) {
          <app-ventana tipo="dados" titulo="Dados" (sacar)="sacarAfuera('dados')">
            <app-dados-panel [partyId]="id()" />
          </app-ventana>
        }

        @for (n of notasOrdenadas(); track n.id) {
          @if (ventanas.abierta(clave(n.id))) {
            <app-ventana
              [tipo]="clave(n.id)"
              [titulo]="n.title || 'Sin título'"
              (sacar)="sacarAfuera(clave(n.id))"
            >
              <app-nota-panel [notaId]="n.id" />
            </app-ventana>
          }
        }

        @if (!hayAlgoAbierto()) {
          <p class="muted vacio-lienzo">Abrí lo que necesites con los botones de la derecha.</p>
        }
      </section>

      <!-- La botonera: prende y apaga ventanas, nada más. -->
      <nav class="botonera">
        <button class="boton" [class.on]="ventanas.abierta('pj')" (click)="ventanas.alternar('pj')">
          <span class="icono">👤</span><span class="rotulo">PJ</span>
        </button>
        <button class="boton" [class.on]="ventanas.abierta('dados')" (click)="ventanas.alternar('dados')">
          <span class="icono">🎲</span><span class="rotulo">Dados</span>
        </button>

        <button class="boton" title="Crear una nota" (click)="nuevaNota()">
          <span class="icono">➕</span><span class="rotulo">Nota</span>
        </button>

        <!--
          Una nota, un icono. El rótulo son las primeras letras porque el ancho
          es el que es; el título entero va en el tooltip.
        -->
        @if (notasOrdenadas().length) {
          <hr class="separador" />
        }
        @for (n of notasOrdenadas(); track n.id) {
          <button
            class="boton"
            [class.on]="ventanas.abierta(clave(n.id))"
            [title]="n.title || 'Sin título'"
            (click)="ventanas.alternar(clave(n.id))"
          >
            <span class="icono">📄</span>
            <span class="rotulo">{{ (n.title || 'Nota').slice(0, 6) }}</span>
          </button>
        }
      </nav>
    </div>
  `,
  styles: `
    .mesa {
      display: grid;
      grid-template-columns: minmax(18rem, 24rem) 1fr auto;
      gap: 0.8rem;
      height: calc(100vh - 4rem);
      padding: 0.8rem;
    }

    .chat {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    .chat-head {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.6rem;
      border-bottom: 1px solid var(--border);
    }

    .btn.chico {
      padding: 0.1rem 0.45rem;
    }

    /* El hilo crece y scrollea; lo de arriba y lo de abajo quedan fijos. */
    .hilo {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .msg-head {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.78rem;
    }

    .quien {
      font-weight: 600;
    }

    .hora {
      margin-left: auto;
      font-size: 0.72rem;
    }

    .borrar {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 0 0.2rem;
    }

    .borrar:hover {
      color: var(--danger);
    }

    .avatar.chico {
      width: 1.3rem;
      height: 1.3rem;
      font-size: 0.6rem;
    }

    .texto {
      margin: 0.1rem 0 0 1.65rem;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Una tirada privada se ve distinta: si no, no se sabe que los demás no la ven. */
    .msg.privado .tirada,
    .msg.privado .texto {
      border-left: 2px solid var(--accent);
      padding-left: 0.5rem;
    }

    .tirada {
      display: flex;
      flex-direction: column;
      margin: 0.15rem 0 0 1.65rem;
      padding: 0.4rem 0.5rem;
      background: var(--surface-2);
      border-radius: 6px;
    }

    .t-label {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }

    .t-total {
      font-size: 1.4rem;
      font-weight: 700;
      line-height: 1.1;
    }

    .t-total.dano {
      font-size: 1rem;
      margin-top: 0.25rem;
    }

    .t-total.dano.critico {
      color: var(--accent);
    }

    .t-detalle {
      font-size: 0.76rem;
    }

    .tirada.crit {
      box-shadow: inset 0 0 0 1px var(--ok);
    }

    .tirada.fumble {
      box-shadow: inset 0 0 0 1px var(--danger);
    }

    .t-crit {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--accent);
    }

    .escribir {
      display: flex;
      gap: 0.4rem;
      padding: 0.5rem;
      border-top: 1px solid var(--border);
    }

    .escribir input {
      flex: 1 1 auto;
    }

    .lienzo {
      position: relative;
      overflow: hidden;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    .vacio-lienzo {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-align: center;
      padding: 2rem;
    }

    .botonera {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding: 0.4rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      /* Con veinte notas la columna scrollea en vez de estirar la mesa. */
      overflow-y: auto;
    }

    .separador {
      width: 100%;
      border: none;
      border-top: 1px solid var(--border);
      margin: 0.2rem 0;
    }

    .rotulo {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .boton {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.1rem;
      width: 3.4rem;
      padding: 0.4rem 0.2rem;
      background: none;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--muted);
      cursor: pointer;
      font: inherit;
    }

    .boton:hover {
      border-color: var(--border);
    }

    .boton.on {
      border-color: var(--accent);
      color: var(--accent-strong);
    }

    .icono {
      font-size: 1.1rem;
      line-height: 1;
    }

    .rotulo {
      font-size: 0.68rem;
    }

    .error {
      color: var(--danger);
      margin: 0 0.6rem;
    }

    .vacio-hilo {
      margin: auto;
    }

    @media (max-width: 800px) {
      .mesa {
        grid-template-columns: 1fr;
        height: auto;
      }

      .botonera {
        flex-direction: row;
        justify-content: center;
      }

      .lienzo {
        min-height: 12rem;
      }
    }
  `,
})
export class MesaComponent implements OnDestroy {
  readonly id = input.required<string>();

  readonly svc = inject(PartyService);
  readonly chat = inject(PartyChatService);

  readonly party = signal<Party | null>(null);
  readonly ventanas = inject(VentanasService);
  readonly notas = inject(PartyNotesService);

  readonly clave = claveDeNota;

  /**
   * Las notas en el orden en que las usaste, la última primero.
   *
   * El orden es tuyo y no de la mesa: sale de `VentanasService`, que lo guarda
   * en localStorage. Las que nunca abriste caen ordenadas por cuándo se
   * tocaron por última vez, que es lo que ya trae el servicio.
   */
  readonly notasOrdenadas = computed(() =>
    [...this.notas.lista()].sort((a, b) => this.ventanas.antiguedad(claveDeNota(a.id)) - this.ventanas.antiguedad(claveDeNota(b.id))),
  );

  readonly hayAlgoAbierto = computed(
    () =>
      this.ventanas.abierta('pj') ||
      this.ventanas.abierta('dados') ||
      this.notas.lista().some((n) => this.ventanas.abierta(claveDeNota(n.id))),
  );

  /** Crear y abrir de una: nadie crea una nota para no escribirla. */
  async nuevaNota() {
    try {
      const nota = await this.notas.crear(this.id());
      if (nota) this.ventanas.alternar(claveDeNota(nota.id));
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }

  /**
   * Sacar una ventana afuera es abrir la MISMA ventana en su propia pestaña:
   * no hay componente aparte ni mensajería entre ventanas. Lo que muestre se
   * sincroniza por el servidor, igual que el chat.
   */
  sacarAfuera(tipo: TipoDeVentana) {
    // La nota lleva su id como un segmento más: `ventana/nota/<id>`.
    const ruta = tipo.startsWith('nota:') ? `nota/${tipo.slice(5)}` : tipo;
    window.open(`/parties/${this.id()}/ventana/${ruta}`, `mesa-${tipo}`, 'width=760,height=680');
    this.ventanas.cerrar(tipo);
  }

  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);

  private readonly entrada = viewChild<ElementRef<HTMLInputElement>>('entrada');
  private readonly hilo = viewChild<ElementRef<HTMLElement>>('hilo');

  readonly inicialesDe = iniciales;

  constructor() {
    effect(() => {
      const id = this.id();
      if (!id) return;
      void this.svc
        .get(id)
        .then((p) => this.party.set(p))
        .catch((e) => this.error.set(mensajeDeError(e)));
      void this.chat.abrir(id).catch((e) => this.error.set(mensajeDeError(e)));
      void this.notas.abrir(id).catch((e) => this.error.set(mensajeDeError(e)));
      this.ventanas.usar(id);
    });

    /*
     * Bajar solo al hilo cuando llega algo. Sin esto, en plena partida los
     * mensajes nuevos quedan abajo del scroll y hay que ir a buscarlos.
     */
    effect(() => {
      this.chat.hilo().length;
      queueMicrotask(() => {
        const el = this.hilo()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngOnDestroy(): void {
    void this.chat.cerrar();
    void this.notas.cerrar();
  }

  async enviar(evento: Event) {
    evento.preventDefault();
    const input = this.entrada()?.nativeElement;
    const texto = input?.value ?? '';
    if (!texto.trim() || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.chat.escribir(this.id(), texto);
      if (input) input.value = '';
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.enviando.set(false);
      input?.focus();
    }
  }

  async borrar(id: string) {
    try {
      await this.chat.borrar(id);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }

  /** Solo la hora: la fecha ya la da el orden del hilo. */
  hora(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  signo = (n: number) => (n >= 0 ? `+${n}` : String(n));
}
