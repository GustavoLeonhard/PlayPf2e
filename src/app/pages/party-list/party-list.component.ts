import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { Party } from '../../core/models/party.model';
import { AuthService } from '../../core/services/auth.service';
import { PartyService, mensajeDeError } from '../../core/services/party.service';

@Component({
  selector: 'app-party-list',
  imports: [RouterLink],
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
          <div class="grid">
            @for (p of svc.parties(); track p.id) {
              <a class="card partida" [routerLink]="['/parties', p.id]">
                <h2>{{ p.name }}</h2>
                <span class="rol" [class.gm]="esGm(p)">{{ esGm(p) ? 'Dirigís esta mesa' : 'Jugás en esta mesa' }}</span>
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

    .grid {
      display: grid;
      gap: 0.8rem;
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    }

    .partida {
      color: inherit;
      text-decoration: none;
      display: block;
    }

    .rol {
      font-size: 0.85rem;
      color: var(--muted);
    }

    .rol.gm {
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
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly creando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (this.svc.disponible) void this.cargar();
  }

  private async cargar() {
    try {
      await this.svc.list();
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }

  esGm = (p: Party) => p.gm_id === this.auth.userId();

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
