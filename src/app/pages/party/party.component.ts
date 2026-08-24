import { Component, computed, inject, input, signal, type OnDestroy, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { CharacterRecord } from '../../core/models/character.model';
import type { Party, PartyMemberView } from '../../core/models/party.model';
import { AuthService } from '../../core/services/auth.service';
import { CharacterService } from '../../core/services/character.service';
import { PartyService, mensajeDeError } from '../../core/services/party.service';

/**
 * La partida.
 *
 * Por ahora es la sala de espera: quién está, con qué personaje y el link para
 * invitar. El chat, las tiradas y las notas son las fases que siguen.
 */
@Component({
  selector: 'app-party',
  imports: [RouterLink],
  template: `
    @if (party(); as p) {
      <div class="container">
        <header class="head">
          <div>
            <h1>{{ p.name }}</h1>
            <p class="muted">
              {{ soyGm() ? 'Dirigís esta mesa' : 'Jugás en esta mesa' }} ·
              {{ conectados() }} de {{ miembros().length }} conectados ahora
            </p>
          </div>
          <div class="head-acciones">
            <!--
              La sala es para acomodarse; la mesa es para jugar. Separarlas deja
              la invitación y el cambio de personaje fuera del medio mientras
              estás en partida.
            -->
            <a class="btn primary" [routerLink]="['/parties', id(), 'mesa']">Sentarse a la mesa</a>
            <a class="btn ghost" routerLink="/parties">Volver</a>
          </div>
        </header>

        @if (error(); as e) {
          <div class="card error">{{ e }}</div>
        }

        <!-- Invitación: el único modo de sumar gente es el link -->
        <section class="card invitacion">
          <h2>Invitar</h2>
          <p class="muted small">
            Cualquiera con este link entra a la mesa. Si se te escapa a donde no querías, rotalo:
            el anterior deja de servir.
          </p>
          <div class="link-row">
            <input type="text" readonly [value]="inviteUrl()" (focus)="$any($event.target).select()" />
            <button class="btn" (click)="copiar()">{{ copiado() ? '¡Copiado!' : 'Copiar' }}</button>
            @if (soyGm()) {
              <button class="btn ghost" (click)="rotar()">Rotar link</button>
            }
          </div>
        </section>

        <!--
          Con quién jugás en esta mesa se elige UNA vez. Cambiarlo no es algo de
          todos los días: es para cuando tu personaje murió o se retiró, así que
          está detrás de un paso aparte en vez de un selector siempre a mano.
        -->
        <section class="card mi-pj">
          <h2>Tu personaje en esta mesa</h2>

          @if (miMembresia()?.character_id; as pjId) {
            <p class="elegido">
              <strong>{{ miPersonaje() }}</strong>
              <a class="rank-btn" [routerLink]="['/characters', pjId]">ver hoja</a>
            </p>
          }

          @if (sinPersonaje() || cambiando()) {
            @if (cambiando()) {
              <p class="muted small aviso">
                Cambiar de personaje es para cuando el tuyo murió, se retiró o la historia lo
                pide. El anterior no se borra: sigue estando en tus personajes.
              </p>
            } @else {
              <p class="muted small">Elegí con quién vas a jugar en esta mesa.</p>
            }

            <div class="opciones">
              <select (change)="sentarse($any($event.target).value)">
                <option value="">Elegí un personaje…</option>
                @for (pj of elegibles(); track pj.id) {
                  <option [value]="pj.id">{{ pj.build.name || 'Sin nombre' }} — nivel {{ pj.level }}</option>
                }
              </select>
              <a class="btn" [routerLink]="['/characters/new']" [queryParams]="{ party: p.id }">
                + Crear uno nuevo
              </a>
              @if (cambiando()) {
                <button class="btn ghost" (click)="cambiando.set(false)">Dejarlo como está</button>
              }
            </div>
          } @else {
            <button class="w-ok" (click)="cambiando.set(true)">Cambiar de personaje</button>
          }
        </section>

        <!-- La mesa -->
        <section class="card mesa">
          <h2>En la mesa</h2>
          @for (m of miembros(); track m.user_id) {
            <div class="miembro" [class.online]="m.online">
              <span class="punto" [title]="m.online ? 'Conectado' : 'Desconectado'">●</span>
              <span class="quien">
                {{ m.displayName }}
                @if (m.role === 'gm') {
                  <span class="tag">GM</span>
                }
                @if (m.user_id === auth.userId()) {
                  <span class="tag">vos</span>
                }
              </span>
              <span class="pj muted">
                {{ m.characterName ?? (m.user_id === auth.userId() ? 'sin personaje' : '—') }}
              </span>
              @if (soyGm() && m.user_id !== auth.userId()) {
                <button class="rank-btn" (click)="echar(m)">echar</button>
              }
            </div>
          }
        </section>

        <div class="salida">
          @if (soyGm()) {
            <button class="btn ghost danger" (click)="borrar()">Borrar la partida</button>
          } @else {
            <button class="btn ghost danger" (click)="salir()">Salir de la partida</button>
          }
        </div>
      </div>
    } @else {
      <div class="container">
        <p class="muted">{{ error() ?? 'Cargando partida…' }}</p>
      </div>
    }
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .link-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .link-row input {
      flex: 1 1 22rem;
      font-size: 0.85rem;
    }

    .opciones {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .opciones select {
      flex: 1 1 16rem;
    }

    .elegido {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
    }

    .miembro {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 0.6rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid var(--border);
    }

    .punto {
      color: var(--border);
      font-size: 0.7rem;
    }

    /* Sin esto las etiquetas GM y "vos" se pegan y se leen "GMVOS". */
    .quien .tag + .tag,
    .quien .tag {
      margin-left: 0.35rem;
    }

    .miembro.online .punto {
      color: var(--ok);
    }

    .salida {
      margin-top: 1rem;
    }

    .error {
      border-color: var(--danger);
      color: var(--danger);
    }
  `,
})
export class PartyComponent implements OnInit, OnDestroy {
  private svc = inject(PartyService);
  private characters = inject(CharacterService);
  readonly auth = inject(AuthService);
  private router = inject(Router);

  /** Viene del router. */
  readonly id = input.required<string>();

  readonly party = signal<Party | null>(null);
  readonly miembros = signal<PartyMemberView[]>([]);
  readonly personajes = signal<CharacterRecord[]>([]);
  readonly error = signal<string | null>(null);
  readonly copiado = signal(false);
  /** Si está pidiendo cambiar de personaje. Arranca cerrado siempre. */
  readonly cambiando = signal(false);

  readonly soyGm = computed(() => this.party()?.gm_id === this.auth.userId());
  readonly conectados = computed(() => this.miembros().filter((m) => m.online).length);
  readonly miMembresia = computed(() => this.miembros().find((m) => m.user_id === this.auth.userId()) ?? null);
  readonly miPersonaje = computed(() => this.miMembresia()?.characterName ?? null);
  readonly sinPersonaje = computed(() => !this.miMembresia()?.character_id);

  /** Los que puede elegir: el que ya está sentado no se ofrece de nuevo. */
  readonly elegibles = computed(() => {
    const actual = this.miMembresia()?.character_id;
    return this.personajes().filter((pj) => pj.id !== actual);
  });

  readonly inviteUrl = computed(() => {
    const p = this.party();
    return p ? `${location.origin}/join/${p.invite_token}` : '';
  });

  /** El input `id` viene del router: no existe en el constructor. */
  ngOnInit() {
    void this.cargar();
  }

  ngOnDestroy() {
    void this.svc.unwatchPresence();
  }

  private async cargar() {
    try {
      const partida = await this.svc.get(this.id());
      if (!partida) {
        this.error.set('Esa partida no existe, o ya no sos parte de ella.');
        return;
      }
      this.party.set(partida);

      // La presencia primero: así los miembros ya se pintan con quién está.
      await this.svc.watchPresence(partida.id);
      await this.refrescarMiembros();
      this.personajes.set(await this.characters.list());
    } catch (e) {
      this.error.set(mensajeDeError(e));
    }
  }

  private async refrescarMiembros() {
    this.miembros.set(await this.svc.members(this.id()));
  }

  async copiar() {
    await navigator.clipboard.writeText(this.inviteUrl());
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 1500);
  }

  async rotar() {
    const token = await this.svc.rotateInvite(this.id());
    this.party.update((p) => (p ? { ...p, invite_token: token } : p));
  }

  /** Sentarse con un personaje. Elegir en el desplegable ya cierra el cambio. */
  async sentarse(characterId: string | null) {
    if (!characterId) return;
    await this.svc.setCharacter(this.id(), characterId);
    this.cambiando.set(false);
    await this.refrescarMiembros();
  }

  async echar(m: PartyMemberView) {
    await this.svc.kick(this.id(), m.user_id);
    await this.refrescarMiembros();
  }

  async salir() {
    await this.svc.leave(this.id());
    void this.router.navigate(['/parties']);
  }

  async borrar() {
    await this.svc.remove(this.id());
    void this.router.navigate(['/parties']);
  }
}
