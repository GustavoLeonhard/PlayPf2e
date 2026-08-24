import { Component, inject, input, signal } from '@angular/core';

import type { TipoDeVentana } from '../../core/services/ventanas.service';
import { PartyChatService } from '../../core/services/party-chat.service';
import { PartyNotesService } from '../../core/services/party-notes.service';
import { DadosPanelComponent } from './dados-panel.component';
import { NotaPanelComponent } from './nota-panel.component';
import { PjPanelComponent } from './pj-panel.component';
import { JugadorPanelComponent } from './jugador-panel.component';
import { PartyService } from '../../core/services/party.service';
import type { PartyMemberView } from '../../core/models/party.model';

/**
 * Una ventana sacada afuera: el mismo panel, sin el marco del lienzo.
 *
 * No es un componente especial. La mesa hace `window.open` a esta ruta y el
 * panel se renderiza solo. Lo que muestre se sincroniza por el servidor, así
 * que no hace falta que las dos ventanas se hablen — y funciona igual si la
 * abrís en otra máquina o en el teléfono.
 */
@Component({
  selector: 'app-ventana-suelta',
  imports: [PjPanelComponent, DadosPanelComponent, NotaPanelComponent, JugadorPanelComponent],
  template: `
    <div class="suelta">
      @switch (tipo()) {
        @case ('pj') {
          <app-pj-panel [partyId]="id()" />
        }
        @case ('dados') {
          <app-dados-panel [partyId]="id()" />
        }
        @case ('nota') {
          <app-nota-panel [notaId]="notaId()" />
        }
        @case ('jugador') {
          <app-jugador-panel [jugador]="jugador()" />
        }
        @default {
          <p class="muted">Esa ventana todavía no existe.</p>
        }
      }
    </div>
  `,
  styles: `
    .suelta {
      padding: 0.8rem;
      min-height: 100vh;
      background: var(--bg);
    }
  `,
})
export class VentanaSueltaComponent {
  readonly id = input.required<string>();
  /** `pj`, `dados` o `nota`. Sin el id: ese va en `notaId`. */
  readonly tipo = input.required<string>();
  /** Solo cuando el tipo es `nota`. */
  readonly notaId = input('');
  /** Solo cuando el tipo es `jugador`. */
  readonly userId = input('');

  /**
   * Se abre el canal del chat aunque acá no se vea.
   *
   * Sin esto, publicar una tirada anda igual —el insert no necesita canal—
   * pero el servicio queda sin la partida abierta, y prefiero que las dos
   * ventanas estén en el mismo estado por si mañana esta muestra algo del hilo.
   */
  private chat = inject(PartyChatService);
  private notas = inject(PartyNotesService);
  private parties = inject(PartyService);

  /**
   * El jugador que muestra esta ventana, cuando es de ese tipo.
   *
   * Se trae acá y no se pasa desde la mesa porque la ventana suelta es un
   * documento aparte: no comparte memoria con quien la abrió, y tiene que
   * poder resolverse sola si la recargás.
   */
  readonly jugador = signal<PartyMemberView | null>(null);

  constructor() {
    queueMicrotask(() => {
      void this.chat.abrir(this.id()).catch(() => {});
      // Las notas sí las necesita: sin el canal, la ventana suelta no sabría
      // qué dice la nota ni se enteraría de los cambios de los demás.
      void this.notas.abrir(this.id()).catch(() => {});

      if (this.tipo() === 'jugador') {
        void this.parties.watchPresence(this.id()).catch(() => {});
        void this.parties
          .members(this.id())
          .then((ms) => this.jugador.set(ms.find((m) => m.user_id === this.userId()) ?? null))
          .catch(() => {});
      }
    });
  }
}
