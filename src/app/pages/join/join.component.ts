import { Component, inject, input, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { PartyService, mensajeDeError } from '../../core/services/party.service';

const PENDIENTE = 'pf2e.invitacionPendiente';

/**
 * Entrar a una partida por link.
 *
 * Primero se mira a dónde lleva el token sin sumar a nadie, así se puede decir
 * "te invitaron a la mesa X". Si el usuario no tiene sesión, el token queda
 * guardado y se retoma después de entrar o registrarse.
 */
@Component({
  selector: 'app-join',
  template: `
    <div class="container">
      <div class="card invite">
        @if (error(); as e) {
          <h1>No se pudo entrar</h1>
          <p class="muted">{{ e }}</p>
          <button class="btn" (click)="irAPartidas()">Ir a mis partidas</button>
        } @else if (partida(); as p) {
          <h1>Te invitaron a</h1>
          <p class="nombre">{{ p.name }}</p>
          <p class="muted">
            Unirte no arranca nada ni te compromete a nada: vas a poder elegir tu personaje
            adentro, o crear uno.
          </p>
          <button class="btn primary" [disabled]="entrando()" (click)="entrar()">
            {{ entrando() ? 'Entrando…' : 'Unirme a la partida' }}
          </button>
        } @else {
          <p class="muted">Mirando la invitación…</p>
        }
      </div>
    </div>
  `,
  styles: `
    .invite {
      max-width: 30rem;
      margin: 3rem auto;
      text-align: center;
      display: grid;
      gap: 0.8rem;
      justify-items: center;
    }

    .nombre {
      font-family: Georgia, serif;
      font-size: 1.6rem;
      color: var(--accent-strong);
      margin: 0;
    }
  `,
})
export class JoinComponent implements OnInit {
  private svc = inject(PartyService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly token = input.required<string>();

  readonly partida = signal<{ id: string; name: string } | null>(null);
  readonly error = signal<string | null>(null);
  readonly entrando = signal(false);

  ngOnInit() {
    void this.mirar();
  }

  private async mirar() {
    if (!this.svc.disponible) {
      this.error.set('Las partidas necesitan Supabase configurado.');
      return;
    }

    // Sin sesión no se puede ni mirar: se guarda el token y se manda a entrar.
    if (!this.auth.isLoggedIn()) {
      localStorage.setItem(PENDIENTE, this.token());
      void this.router.navigate(['/login']);
      return;
    }

    const destino = await this.svc.peek(this.token());
    if (!destino) {
      this.error.set('Ese link no existe o fue rotado. Pedile uno nuevo a quien te invitó.');
      return;
    }
    this.partida.set(destino);
  }

  async entrar() {
    this.entrando.set(true);
    try {
      const id = await this.svc.joinByToken(this.token());
      localStorage.removeItem(PENDIENTE);
      void this.router.navigate(['/parties', id]);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.entrando.set(false);
    }
  }

  irAPartidas() {
    void this.router.navigate(['/parties']);
  }
}

/** El token que quedó esperando a que el usuario inicie sesión. */
export function invitacionPendiente(): string | null {
  return localStorage.getItem(PENDIENTE);
}
