import { TitleCasePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CharacterRecord } from '../../core/models/character.model';
import { CharacterService } from '../../core/services/character.service';

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
        <div class="grid">
          @for (pj of svc.characters(); track pj.id) {
            <div class="card pj">
              <a class="pjlink" [routerLink]="['/characters', pj.id]">
                @if (pj.build.portrait; as foto) {
                  <img class="portrait" [src]="foto" [alt]="pj.build.name" />
                }
                <div>
                  <h2>{{ pj.build.name || 'Sin nombre' }}</h2>
                  <p class="muted">
                    {{ pj.build.ancestry | titlecase }} · {{ pj.build.class | titlecase }}
                  </p>
                  <span class="level">Nivel {{ pj.level }}</span>
                </div>
              </a>
              <div class="actions">
                <a class="btn" [routerLink]="['/characters', pj.id, 'level-up']">Subir nivel</a>
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

    .grid {
      display: grid;
      gap: 0.8rem;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    }

    .pj {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.8rem;
    }

    .pjlink {
      color: inherit;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.7rem;
    }

    .portrait {
      width: 56px;
      height: 56px;
      border-radius: 10px;
      object-fit: cover;
      flex: 0 0 auto;
    }

    .level {
      display: inline-block;
      margin-top: 0.4rem;
      color: var(--accent);
      font-size: 0.85rem;
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
  toDelete = signal<CharacterRecord | null>(null);

  constructor() {
    void this.svc.list();
  }

  confirmDelete(pj: CharacterRecord) {
    this.toDelete.set(pj);
  }

  async remove(pj: CharacterRecord) {
    await this.svc.remove(pj.id);
    this.toDelete.set(null);
  }
}
