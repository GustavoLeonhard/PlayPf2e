import { Component, computed, effect, inject, input, signal } from '@angular/core';

import { PartyNotesService } from '../../core/services/party-notes.service';
import { mensajeDeError } from '../../core/services/party.service';
import { AuthService } from '../../core/services/auth.service';

/** Lo que se guarda en el navegador mientras la nota no se publica. */
interface Borrador {
  title: string | null;
  body: string | null;
  /**
   * El `updated_at` que tenía la nota cuando empezaste a escribir.
   *
   * Va con el borrador y no se recalcula al recargar: si al volver tomáramos
   * la versión de ahora como base, publicar pisaría en silencio lo que otro
   * escribió mientras no estabas.
   */
  base: string | null;
}

const PREFIJO = 'pf2e.borrador.';

/**
 * Una nota de la mesa, abierta para leer y editar.
 *
 * **No se guarda sola.** Lo que escribís es tuyo hasta que apretás Guardar:
 * nadie más ve un párrafo a medio escribir, y podés dejar una nota empezada sin
 * publicar nada.
 *
 * Para que eso no signifique perder trabajo, el borrador se guarda en ESTE
 * navegador en cada tecla. Cerrar la ventana, la pestaña o el navegador entero
 * no lo borra; solo publicarlo o descartarlo a mano.
 *
 * Lo delicado sigue siendo que la nota es compartida: mientras vos escribís,
 * otro puede guardar. La regla no cambió — **nunca se pisa lo que estás
 * escribiendo**; si al publicar alguien se adelantó, se avisa y decidís vos.
 */
@Component({
  selector: 'app-nota-panel',
  template: `
    @if (nota(); as n) {
      <div class="nota">
        <input
          class="titulo"
          type="text"
          placeholder="Título"
          [value]="tituloLocal() ?? n.title"
          (input)="tituloLocal.set($any($event.target).value); anotarBorrador()"
        />

        @if (choque()) {
          <p class="aviso choque">
            Alguien más la cambió: no se publicó lo tuyo para no pisarlo.
            <button class="btn ghost chico" (click)="traerLaDeEllos()">Descartar lo mío</button>
            <button class="btn ghost chico" (click)="pisar()">Publicar igual</button>
          </p>
        } @else if (cambioAfuera()) {
          <!--
            Aviso temprano, antes de que aprietes Guardar.
            Con guardado manual podés estar veinte minutos sobre un borrador; que
            recién al publicar te enteres de que la nota cambió abajo tuyo es
            tarde para decidir bien.
          -->
          <p class="aviso">
            Alguien la cambió mientras escribías. Al publicar vas a poder elegir qué queda.
          </p>
        }

        <textarea
          class="cuerpo"
          placeholder="Escribí lo que quieras…"
          [value]="cuerpoLocal() ?? n.body"
          (input)="cuerpoLocal.set($any($event.target).value); anotarBorrador()"
        ></textarea>

        <footer class="pie">
          <button class="btn" [disabled]="!hayCambios() || guardando()" (click)="guardar()">
            {{ guardando() ? 'Guardando…' : 'Guardar' }}
          </button>
          @if (hayCambios()) {
            <button class="btn ghost chico" (click)="descartar()">Descartar</button>
          }
          <span class="muted small estado" [class.pendiente]="hayCambios()">{{ estadoDeGuardado() }}</span>
          <button class="btn ghost chico borrar" (click)="borrar()">Borrar nota</button>
        </footer>

        @if (error(); as e) {
          <p class="error small">{{ e }}</p>
        }
      </div>
    } @else {
      <p class="muted small">Esta nota ya no está.</p>
    }
  `,
  styles: `
    .nota {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      height: 100%;
    }

    .titulo {
      font-weight: 600;
    }

    .cuerpo {
      flex: 1 1 auto;
      min-height: 6rem;
      resize: none;
      font: inherit;
      line-height: 1.5;
    }

    .pie {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* El estado empuja al borrar hasta la derecha: publicar y borrar no pueden
       quedar pegados, son de distinto peso. */
    .estado {
      margin-left: auto;
    }

    .estado.pendiente {
      color: var(--accent);
    }

    .chico {
      padding: 0.05rem 0.4rem;
      font-size: 0.75rem;
    }

    .borrar:hover {
      color: var(--danger);
      border-color: var(--danger);
    }

    /* Los avisos interrumpen: si pasan desapercibidos, no sirven. */
    .aviso {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin: 0;
      padding: 0.35rem 0.5rem;
      border-left: 3px solid var(--accent);
      background: var(--surface-2);
      font-size: 0.8rem;
    }

    .aviso.choque {
      border-left-color: var(--danger);
    }

    .error {
      color: var(--danger);
      margin: 0;
    }
  `,
})
export class NotaPanelComponent {
  readonly notaId = input.required<string>();

  private notas = inject(PartyNotesService);
  private auth = inject(AuthService);

  readonly nota = computed(() => this.notas.una(this.notaId()));

  /** Lo que tenés escrito sin publicar. `null` = no tocaste nada. */
  readonly tituloLocal = signal<string | null>(null);
  readonly cuerpoLocal = signal<string | null>(null);

  readonly choque = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  /** El `updated_at` que había cuando empezaste a escribir. */
  private base = signal<string | null>(null);

  readonly hayCambios = computed(() => this.tituloLocal() !== null || this.cuerpoLocal() !== null);

  /** Alguien publicó sobre esta nota desde que empezaste tu borrador. */
  readonly cambioAfuera = computed(() => {
    const n = this.nota();
    const desde = this.base();
    return !!n && !!desde && this.hayCambios() && n.updated_at !== desde;
  });

  readonly estadoDeGuardado = computed(() => {
    if (this.guardando()) return 'Publicando…';
    return this.hayCambios() ? 'Sin publicar' : 'Publicada';
  });

  /**
   * El borrador es por usuario y por nota.
   *
   * Por usuario porque es contenido, no una preferencia: dos cuentas en la
   * misma máquina no tienen por qué verse los borradores.
   */
  private clave = () => `${PREFIJO}${this.auth.userId() ?? 'anon'}.${this.notaId()}`;

  constructor() {
    /*
     * Restaurar el borrador al abrir. Corre una vez por nota, no en cada
     * cambio: `restaurada` corta el efecto para que escribir no lo vuelva a
     * disparar sobre lo que acabás de tipear.
     */
    let restaurada: string | null = null;
    effect(() => {
      const id = this.notaId();
      if (restaurada === id) return;
      restaurada = id;

      this.tituloLocal.set(null);
      this.cuerpoLocal.set(null);
      this.choque.set(false);

      const crudo = localStorage.getItem(this.clave());
      if (!crudo) return;
      try {
        const b = JSON.parse(crudo) as Borrador;
        this.tituloLocal.set(b.title);
        this.cuerpoLocal.set(b.body);
        this.base.set(b.base);
      } catch {
        localStorage.removeItem(this.clave());
      }
    });

    effect(() => {
      const n = this.nota();
      if (!n) return;

      /*
       * Sin borrador propio, lo de afuera entra sin preguntar y pasa a ser la
       * base. Con borrador NO se toca nada acá: el choque lo detecta el
       * guardado contra la base de datos, que es donde se puede saber de
       * verdad si alguien se adelantó.
       */
      if (!this.hayCambios()) this.base.set(n.updated_at);
    });
  }

  /**
   * Anota el borrador en el navegador. Se llama en cada tecla.
   *
   * Escribir en localStorage es sincrónico y local: no hay red, no hay evento
   * para nadie, y nadie más ve una letra. Es exactamente lo contrario del
   * guardado automático que había antes.
   */
  anotarBorrador() {
    // Una nota recién creada todavía no existe en la base ni en la lista: se
    // conserva solo mientras siga abierta esta mesa y se descarta al salir.
    if (this.notas.esBorradorNuevo(this.notaId())) return;
    const borrador: Borrador = {
      title: this.tituloLocal(),
      body: this.cuerpoLocal(),
      base: this.base(),
    };
    try {
      localStorage.setItem(this.clave(), JSON.stringify(borrador));
    } catch {
      // Cuota llena o modo privado: se pierde la red de seguridad, no la nota.
    }
  }

  private olvidarBorrador() {
    if (this.notas.esBorradorNuevo(this.notaId())) return;
    try {
      localStorage.removeItem(this.clave());
    } catch {
      // Nada que hacer: si no se puede borrar, el próximo guardado lo pisa.
    }
  }

  /** Publicar lo escrito. Solo desde el botón: nada se manda solo. */
  async guardar() {
    const n = this.nota();
    if (!n || !this.hayCambios()) return;

    this.guardando.set(true);
    this.error.set(null);
    try {
      const guardado = await this.notas.guardar(this.notaId(), this.cambios(), this.base());
      if (!guardado) {
        // Alguien se adelantó: lo tuyo sigue en el textarea y en el borrador.
        this.choque.set(true);
        return;
      }
      this.limpiar();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  /** Suelta lo local recién cuando el servidor confirmó: si falla, no se pierde. */
  private limpiar() {
    this.tituloLocal.set(null);
    this.cuerpoLocal.set(null);
    this.choque.set(false);
    this.olvidarBorrador();
    this.base.set(this.nota()?.updated_at ?? null);
  }

  private cambios() {
    const title = this.tituloLocal();
    const body = this.cuerpoLocal();
    return { ...(title !== null ? { title } : {}), ...(body !== null ? { body } : {}) };
  }

  /** Publicar encima de lo del otro. Lo decide el jugador, nunca la app. */
  async pisar() {
    const n = this.nota();
    if (!n) return;

    this.guardando.set(true);
    try {
      await this.notas.forzar(this.notaId(), this.cambios());
      this.limpiar();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  /** Descarta tu borrador y se queda con lo que hay publicado. */
  traerLaDeEllos() {
    this.limpiar();
  }

  descartar() {
    this.limpiar();
  }

  async borrar() {
    const n = this.nota();
    if (!n) return;
    try {
      await this.notas.borrar(this.notaId());
      this.olvidarBorrador();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }
}
