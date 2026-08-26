import { TitleCasePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { Party, PartyRow } from '../../core/models/party.model';
import { ContentService } from '../../core/services/content.service';
import { PartyService, mensajeDeError } from '../../core/services/party.service';

@Component({
  selector: 'app-party-list',
  imports: [RouterLink, TitleCasePipe],
  template: `
    <div class="container">
      <div class="head">
        <h1>Mis partidas</h1>
        @if (svc.disponible) {
          <button class="btn primary" (click)="creando.set(!creando())">
            {{ creando() ? 'Cancelar' : '+ Nueva partida' }}
          </button>
        }
      </div>

      @if (!svc.disponible) {
        <div class="card empty">
          <p>Las partidas necesitan una cuenta en la nube.</p>
          <p class="muted">
            Estás en modo local: los personajes se guardan en este navegador y no hay con quién
            compartir una mesa.
          </p>
        </div>
      } @else {
        @if (creando()) {
          <div class="card nueva">
            <label>
              Nombre de la partida
              <input
                #nombre
                type="text"
                placeholder="La maldición del trono carmesí"
                (keydown.enter)="crear(nombre.value)"
              />
            </label>
            <button class="btn primary" [disabled]="guardando()" (click)="crear(nombre.value)">
              {{ guardando() ? 'Creando…' : 'Crear' }}
            </button>
          </div>
        }

        @if (error(); as e) {
          <div class="card error">{{ e }}</div>
        }

        @if (svc.loading()) {
          <p class="muted">Cargando…</p>
        } @else if (error()) {
          <!-- Con un error arriba, "no tenés partidas" es ruido: no se sabe si es cierto. -->
        } @else if (svc.parties().length === 0) {
          <div class="card empty">
            <p>Todavía no estás en ninguna partida.</p>
            <p class="muted">
              Creá una y compartí el link, o pedile el link a quien dirige la tuya.
            </p>
          </div>
        } @else {
          <!--
            Una fila grande por partida, como en la lista de personajes: se lee
            el rol, la mesa y con qué PJ jugás de un vistazo, sin encabezados.
          -->
          <div class="lista">
            @for (p of svc.parties(); track p.id) {
              <a class="card fila" [routerLink]="['/parties', p.id]">
                @if (p.characterPortrait; as foto) {
                  <img class="portrait" [src]="foto" [alt]="p.characterName ?? ''" />
                }

                <div class="datos">
                  <h2>{{ p.name }}</h2>
                  <!--
                    Máster y personaje son excluyentes: el que dirige no lleva PJ.
                    Se dice con palabras en vez de dejar la línea vacía, que se
                    leería como un dato que falta.
                  -->
                  @if (p.soyGm) {
                    <p class="muted">Sos el máster de esta mesa</p>
                  } @else if (p.characterName) {
                    <!-- Mismo formato que en la lista de personajes: se leen igual. -->
                    <p class="muted">
                      <span class="pj">{{ p.characterName }}</span> ·
                      {{ p.characterAncestry | titlecase }}
                      @if (herencia(p); as h) {
                        ({{ h }})
                      }
                      · {{ p.characterClass | titlecase }} ·
                      <span class="level">Nivel {{ p.characterLevel }}</span>
                    </p>
                  } @else {
                    <p class="muted">Máster: {{ p.gmName }} · todavía sin personaje</p>
                  }
                </div>

                <span class="rol" [class.gm]="p.soyGm">{{ p.soyGm ? 'Dirigís' : 'Jugás' }}</span>
              </a>
            }
          </div>
        }
      }
    </div>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    /* Cada partida ocupa la fila entera: se leen en vertical de un vistazo. */
    .lista {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .fila {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
      color: inherit;
      text-decoration: none;
      transition: border-color 0.15s;
    }

    .fila:hover {
      border-color: var(--accent);
    }

    /* Mismo retrato que en la lista de personajes. */
    .portrait {
      width: 56px;
      height: 56px;
      border-radius: 10px;
      object-fit: cover;
      flex: 0 0 auto;
    }

    /* Si dirigís o jugás se dice con una etiqueta propia, no con el color del nombre. */
    .rol {
      flex: 0 0 auto;
      margin-left: auto;
      padding: 0.3rem 0.7rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .rol.gm {
      border-color: var(--accent);
      color: var(--accent);
    }

    .datos {
      flex: 1 1 14rem;
      min-width: 0;
    }

    .datos h2 {
      margin: 0;
    }

    .datos p {
      margin: 0.15rem 0 0;
    }

    .pj {
      color: var(--text);
    }

    .level {
      color: var(--accent);
    }

    .nueva {
      display: flex;
      align-items: flex-end;
      gap: 0.8rem;
      flex-wrap: wrap;
      margin-bottom: 0.8rem;
    }

    .nueva label {
      flex: 1 1 18rem;
    }

    .empty {
      text-align: center;
      padding: 2.5rem 1rem;
    }

    .error {
      border-color: var(--danger);
      color: var(--danger);
    }
  `,
})
export class PartyListComponent {
  readonly svc = inject(PartyService);
  private content = inject(ContentService);
  private router = inject(Router);

  readonly creando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * id de herencia -> nombre. La herencia se guarda por id opaco, no por slug
   * como la ascendencia y la clase: sin esto la fila mostraba el id crudo.
   */
  private readonly herencias = signal<Map<string, string>>(new Map());

  constructor() {
    if (this.svc.disponible) void this.cargar();
  }

  private async cargar() {
    try {
      await this.svc.list();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }

    try {
      const hs = await this.content.heritages();
      this.herencias.set(new Map(hs.map((h) => [h.id, h.name])));
    } catch {
      // Sin el dataset la fila se lee igual, solo sin el paréntesis.
    }
  }

  /** El nombre de la herencia, o null si todavía no cargó o el id no existe. */
  herencia(p: PartyRow): string | null {
    return p.characterHeritage ? (this.herencias().get(p.characterHeritage) ?? null) : null;
  }


  async crear(nombre: string) {
    if (this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const partida = await this.svc.create(nombre);
      void this.router.navigate(['/parties', partida.id]);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

}
