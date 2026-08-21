import { TitleCasePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CharacterRecord } from '../../core/models/character.model';
import { CharacterService } from '../../core/services/character.service';
import { PartyService } from '../../core/services/party.service';

@Component({
  selector: 'app-character-list',
  imports: [RouterLink, TitleCasePipe],
  template: `
    <div class="container">
      <div class="head">
        <h1>Mis personajes</h1>
        <a class="btn primary" routerLink="/characters/new">+ Nuevo personaje</a>
      </div>

      @if (svc.loading()) {
        <p class="muted">Cargando…</p>
      } @else if (svc.characters().length === 0) {
        <div class="card empty">
          <p>Todavía no tenés personajes.</p>
          <a class="btn primary" routerLink="/characters/new">Crear el primero</a>
        </div>
      } @else {
        <div class="lista">
          @for (pj of svc.characters(); track pj.id) {
            <div class="card pj">
              <a class="pjlink" [routerLink]="['/characters', pj.id]">
                @if (pj.build.portrait; as foto) {
                  <img class="portrait" [src]="foto" [alt]="pj.build.name" />
                }
                <div class="datos">
                  <h2>{{ pj.build.name || 'Sin nombre' }}</h2>
                  <p class="muted">
                    {{ pj.build.ancestry | titlecase }} · {{ pj.build.class | titlecase }} ·
                    <span class="level">Nivel {{ pj.level }}</span>
                  </p>
                </div>

                <!-- En qué mesa está sentado, si es que está en alguna -->
                @if (mesas().get(pj.id); as partidas) {
                  <span class="mesas">
                    @for (nombre of partidas; track nombre) {
                      <span class="tag mesa">{{ nombre }}</span>
                    }
                  </span>
                }
              </a>

              <!--
                Subir de nivel se hace desde la hoja, donde se ve contra qué se
                está subiendo. Acá era un atajo que invitaba a subir a ciegas.
              -->
              <div class="actions">
                <button class="btn danger ghost" (click)="confirmDelete(pj)">Borrar</button>
              </div>
            </div>
          }
        </div>
      }

      @if (toDelete(); as pj) {
        <div class="backdrop" (click)="toDelete.set(null)">
          <div class="card dialog" (click)="$event.stopPropagation()">
            <h2>¿Borrar a {{ pj.build.name || 'este personaje' }}?</h2>
            <p class="muted">Esta acción no se puede deshacer.</p>
            <div class="actions">
              <button class="btn" (click)="toDelete.set(null)">Cancelar</button>
              <button class="btn danger" (click)="remove(pj)">Borrar</button>
            </div>
          </div>
        </div>
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

    /* Cada personaje ocupa la fila entera: se leen en vertical de un vistazo. */
    .lista {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .pj {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .pjlink {
      color: inherit;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.8rem;
      flex: 1 1 20rem;
      min-width: 0;
    }

    .datos h2 {
      margin: 0;
    }

    .datos p {
      margin: 0.15rem 0 0;
    }

    .mesas {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-left: auto;
      padding-left: 0.8rem;
    }

    .mesa {
      color: var(--accent);
      border-color: var(--accent);
    }

    .portrait {
      width: 56px;
      height: 56px;
      border-radius: 10px;
      object-fit: cover;
      flex: 0 0 auto;
    }

    .level {
      color: var(--accent);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .empty {
      text-align: center;
      display: grid;
      gap: 0.8rem;
      justify-items: center;
      padding: 2.5rem 1rem;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: #000a;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .dialog {
      max-width: 380px;
    }
  `,
})
export class CharacterListComponent {
  readonly svc = inject(CharacterService);
  private parties = inject(PartyService);
  toDelete = signal<CharacterRecord | null>(null);

  /** id del personaje -> nombres de las mesas donde está sentado. */
  readonly mesas = signal<Map<string, string[]>>(new Map());

  constructor() {
    void this.cargar();
  }

  private async cargar() {
    await this.svc.list();
    // Sin Supabase no hay partidas; la lista de personajes anda igual.
    if (!this.parties.disponible) return;
    try {
      this.mesas.set(await this.parties.partiesByCharacter());
    } catch {
      // Si todavía no se corrió el SQL de partidas, no es motivo para romper esta pantalla.
    }
  }

  confirmDelete(pj: CharacterRecord) {
    this.toDelete.set(pj);
  }

  async remove(pj: CharacterRecord) {
    await this.svc.remove(pj.id);
    this.toDelete.set(null);
  }
}
