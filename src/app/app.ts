import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/characters">
        <span class="d20">⬢</span>
        <span>PF2e Builder <small class="muted">legacy</small></span>
      </a>

      @if (auth.isLoggedIn()) {
        <div class="user">
          @if (auth.localMode) {
            <span class="tag" title="No hay Supabase configurado: los personajes se guardan en este navegador">
              modo local
            </span>
          }
          <span class="muted email">{{ auth.email() }}</span>
          <button class="btn ghost" (click)="logout()">Salir</button>
        </div>
      }
    </header>

    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.7rem 1rem;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: Georgia, serif;
      font-size: 1.05rem;
      color: var(--accent-strong);
      text-decoration: none;
    }

    .d20 {
      color: var(--accent);
      font-size: 1.3rem;
    }

    .user {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    @media (max-width: 560px) {
      .email {
        display: none;
      }
    }
  `,
})
export class App {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  async logout() {
    await this.auth.signOut();
    void this.router.navigate(['/login']);
  }
}
