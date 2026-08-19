import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { invitacionPendiente } from '../join/join.component';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <div class="card panel">
        <h1>{{ mode() === 'login' ? 'Entrar' : 'Crear cuenta' }}</h1>
        <p class="muted">Creador de personajes de Pathfinder 2e — reglas Legacy.</p>

        <form (submit)="submit($event)">
          <label>
            Email
            <input type="email" name="email" [(ngModel)]="email" autocomplete="email" required />
          </label>

          <label>
            Contraseña
            <input type="password" name="password" [(ngModel)]="password" autocomplete="current-password" required />
          </label>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <button class="btn primary full" type="submit" [disabled]="busy()">
            {{ busy() ? 'Un momento…' : mode() === 'login' ? 'Entrar' : 'Crear cuenta' }}
          </button>
        </form>

        <button class="btn ghost full" type="button" (click)="toggle()">
          {{ mode() === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Entrá' }}
        </button>

        @if (auth.localMode) {
          <p class="muted note">
            No hay Supabase configurado, así que entrás en <strong>modo local</strong>: los personajes se guardan en
            este navegador. Cargá tus credenciales en <code>src/environments/environment.ts</code> para usar la nube.
          </p>
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      display: flex;
      justify-content: center;
      padding: 3rem 1rem;
    }

    .panel {
      width: 100%;
      max-width: 380px;
    }

    form {
      display: grid;
      gap: 0.8rem;
      margin: 1.2rem 0 0.6rem;
    }

    label {
      display: grid;
      gap: 0.3rem;
      font-size: 0.85rem;
      color: var(--muted);
    }

    .full {
      width: 100%;
    }

    .error {
      color: var(--danger);
      margin: 0;
      font-size: 0.85rem;
    }

    .note {
      font-size: 0.8rem;
      margin-top: 1rem;
      border-top: 1px solid var(--border);
      padding-top: 0.8rem;
    }
  `,
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  mode = signal<'login' | 'register'>('login');
  email = '';
  password = '';
  busy = signal(false);
  error = signal<string | null>(null);

  toggle() {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
    this.error.set(null);
  }

  async submit(event: Event) {
    event.preventDefault();
    if (!this.email || !this.password) {
      this.error.set('Completá email y contraseña.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    const message =
      this.mode() === 'login'
        ? await this.auth.signIn(this.email, this.password)
        : await this.auth.signUp(this.email, this.password);
    this.busy.set(false);

    if (message) {
      this.error.set(message);
      return;
    }

    // Si venías de un link de invitación, se retoma donde quedó.
    const invitacion = invitacionPendiente();
    void this.router.navigate(invitacion ? ['/join', invitacion] : ['/characters']);
  }
}
