import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { iniciales } from './core/rules/imagen';
import { AuthService } from './core/services/auth.service';
import { ProfileService } from './core/services/profile.service';

type Tema = 'dark' | 'medium';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/characters">
        <img class="d20" src="icono.svg" alt="" width="24" height="24" />
        <span>PlayPf2e <small class="muted">legacy</small></span>
      </a>

      @if (auth.isLoggedIn()) {
        <nav class="nav">
          <a routerLink="/characters" routerLinkActive="on">Personajes</a>
          <a routerLink="/parties" routerLinkActive="on">Partidas</a>
        </nav>

        <div class="user">
          @if (auth.localMode) {
            <span class="tag" title="No hay Supabase configurado: los personajes se guardan en este navegador">
              modo local
            </span>
          }
          <!--
            El perfil es el avatar: es el lugar donde uno lo busca, y de paso el
            avatar sirve de aviso de que hay algo para configurar ahí.
          -->
          <a class="perfil-link" routerLink="/profile" routerLinkActive="on" title="Mi perfil">
            @if (perfil.avatar(); as url) {
              <img class="avatar" [src]="url" alt="" />
            } @else {
              <span class="avatar vacio">{{ iniciales(perfil.nombre()) }}</span>
            }
            <span class="muted email">{{ perfil.nombre() }}</span>
          </a>
          <button class="icono" title="Salir" aria-label="Salir" (click)="logout()">⏻</button>
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

    /* El mismo archivo que el favicon: un solo dibujo para todo el proyecto. */
    .d20 {
      display: block;
      width: 1.5rem;
      height: 1.5rem;
    }

    .nav {
      display: flex;
      gap: 1rem;
      margin-right: auto;
      margin-left: 1.5rem;
    }

    .nav a {
      color: var(--muted);
      text-decoration: none;
      padding: 0.2rem 0;
      border-bottom: 2px solid transparent;
    }

    .nav a.on {
      color: var(--accent-strong);
      border-bottom-color: var(--accent);
    }

    .user {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .perfil-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      text-decoration: none;
      color: inherit;
    }

    .perfil-link.on .email,
    .perfil-link:hover .email {
      color: var(--accent-strong);
    }

    .icono {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 1.15rem;
      line-height: 1;
      padding: 0.2rem 0.3rem;
    }

    .icono:hover {
      color: var(--danger);
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
  readonly perfil = inject(ProfileService);
  private router = inject(Router);

  readonly iniciales = iniciales;

  constructor() {
    // El perfil se carga cuando aparece la sesión: al arrancar todavía no hay
    // userId (la restauración de Supabase es asíncrona).
    effect(() => {
      if (this.auth.isLoggedIn()) void this.perfil.cargar();
    });
  }

  cambiarTema() {
    const nuevo: Tema = this.tema() === 'dark' ? 'medium' : 'dark';
    this.tema.set(nuevo);
    this.aplicarTema(nuevo);
  }

  nombreTemaSiguiente() {
    return this.tema() === 'dark' ? 'intermedio' : 'oscuro';
  }

  simboloTema() {
    return this.tema() === 'dark' ? '☾' : '◐';
  }

  private temaInicial(): Tema {
    try {
      const guardado = localStorage.getItem('playpf2e:tema');
      return guardado === 'medium' ? 'medium' : 'dark';
    } catch {
      return 'dark';
    }
  }

  private aplicarTema(tema: Tema) {
    document.documentElement.classList.toggle('dark', tema === 'dark');
    document.documentElement.classList.toggle('medium', tema === 'medium');
    try {
      localStorage.setItem('playpf2e:tema', tema);
    } catch {
      // En modo privado el tema dura hasta cerrar la pestaña.
    }
  }

  async logout() {
    await this.auth.signOut();
    void this.router.navigate(['/login']);
  }
}
