import { Component, inject, signal } from '@angular/core';

import { iniciales, recorteCuadrado } from '../../core/rules/imagen';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { mensajeDeError } from '../../core/services/party.service';

@Component({
  selector: 'app-profile',
  template: `
    <div class="container">
      <h1>Mi perfil</h1>

      <div class="card perfil">
        <div class="avatar-col">
          @if (perfil.avatar(); as url) {
            <img class="avatar grande" [src]="url" alt="" />
          } @else {
            <!-- Sin foto no se muestra un hueco: las iniciales ya identifican. -->
            <span class="avatar grande vacio">{{ iniciales(perfil.nombre()) }}</span>
          }

          <label class="btn ghost">
            Cambiar
            <input type="file" accept="image/*" hidden (change)="subirAvatar($event)" />
          </label>
          @if (perfil.avatar()) {
            <button class="btn ghost" (click)="quitarAvatar()">Quitar</button>
          }
        </div>

        <div class="campos">
          <label>
            Nombre
            <input
              type="text"
              [value]="perfil.nombre()"
              placeholder="Cómo te ven en la partida"
              (change)="cambiarNombre($any($event.target).value)"
            />
          </label>
          <p class="muted small">
            Es el nombre con el que te ven los demás en una partida. Por defecto es la parte de tu
            mail antes del arroba.
          </p>

          <label>
            Mail
            <input type="text" [value]="auth.email() ?? ''" disabled />
          </label>

          @if (guardado()) {
            <p class="ok small">Guardado.</p>
          }
          @if (error(); as e) {
            <p class="error small">{{ e }}</p>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .perfil {
      display: flex;
      gap: 1.5rem;
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .avatar-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
    }

    .avatar.grande {
      width: 8rem;
      height: 8rem;
      font-size: 2.4rem;
    }

    .campos {
      flex: 1 1 20rem;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .small {
      font-size: 0.8rem;
    }

    .ok {
      color: var(--ok);
    }

    .error {
      color: var(--danger);
    }
  `,
})
export class ProfileComponent {
  readonly perfil = inject(ProfileService);
  readonly auth = inject(AuthService);

  readonly guardado = signal(false);
  readonly error = signal<string | null>(null);

  readonly iniciales = iniciales;

  constructor() {
    void this.perfil.cargar();
  }

  async cambiarNombre(valor: string) {
    const limpio = valor.trim();
    // Un nombre vacío dejaría a la persona sin cómo ser nombrada en el chat.
    if (!limpio) return;
    await this.aplicar({ displayName: limpio });
  }

  async subirAvatar(evento: Event) {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const avatar = await recorteCuadrado(file, 128);
    input.value = '';
    await this.aplicar({ avatar });
  }

  async quitarAvatar() {
    await this.aplicar({ avatar: '' });
  }

  private async aplicar(cambios: Parameters<ProfileService['guardar']>[0]) {
    this.error.set(null);
    try {
      await this.perfil.guardar(cambios);
      this.guardado.set(true);
      setTimeout(() => this.guardado.set(false), 2000);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }
}
