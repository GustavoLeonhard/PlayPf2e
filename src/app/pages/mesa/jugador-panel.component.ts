import { Component, computed, input } from '@angular/core';

import { TrackDirective } from '../../shared/track.directive';
import type { Cara } from '../../core/services/voz.service';

import { iniciales } from '../../core/rules/imagen';
import type { PartyMemberView } from '../../core/models/party.model';

/**
 * La cara de otro jugador sentado a la mesa.
 *
 * Hoy muestra el avatar; mañana, cuando el canal esté prendido, el mismo hueco
 * lo ocupa el video. Por eso el marco es 16:9 desde ahora aunque adentro haya
 * una inicial: si el recuadro cambiara de forma al prender la cámara, se
 * movería toda la ventana.
 *
 * El avatar sale del PERFIL y no del retrato del personaje. No es una
 * preferencia: `characters` tiene una política de lectura propia
 * (`auth.uid() = user_id`), así que el retrato del PJ de otro es ilegible.
 * `profiles` sí es público entre autenticados, que es de donde el chat ya saca
 * las caritas.
 */
@Component({
  selector: 'app-jugador-panel',
  imports: [TrackDirective],
  template: `
    @if (jugador(); as j) {
      <div class="jugador">
        <div class="cara" [class.desconectado]="!j.online" [class.hablando]="hablando()">
          <!--
            Con camara prendida manda el video; si no, el avatar. Es el mismo
            hueco a proposito: la ventana no cambia de tamano cuando alguien
            prende o apaga, que seria lo mas molesto de una mesa larga.
          -->
          @if (video(); as track) {
            <video [appTrack]="track" autoplay playsinline [muted]="true"></video>
          } @else if (j.avatar) {
            <img [src]="j.avatar" [alt]="j.displayName" />
          } @else {
            <span class="inicial">{{ inicialesDe(j.displayName) }}</span>
          }

          <!--
            El audio va aparte del video y SIEMPRE, aunque la camara este
            apagada: la voz no depende de que se vea la cara. Y va oculto
            porque un <audio> con controles en cada ventana no tiene sentido.
          -->
          @if (audio(); as track) {
            <audio [appTrack]="track" autoplay></audio>
          }

          @if (enElCanal()) {
            <span class="micro" [class.mudo]="!audio()">{{ audio() ? '🔊' : '🔇' }}</span>
          }
        </div>

        <footer class="pie">
          <span class="nombre">{{ j.displayName }}</span>
          <!--
            El nombre del PJ solo si se puede leer. Para los demás jugadores
            viene null por la política de lectura propia de la tabla characters,
            y un guion en cada cara sería ruido en vez de información.
          -->
          @if (j.characterName) {
            <span class="muted small pj">{{ j.characterName }}</span>
          }
          @if (esMaster()) {
            <span class="tag">máster</span>
          }
        </footer>
      </div>
    } @else {
      <p class="muted small">Este jugador ya no está en la mesa.</p>
    }
  `,
  styles: `
    .jugador {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      height: 100%;
    }

    /* 16:9 desde ya: es la forma que va a tener el video. */
    .cara {
      position: relative;
      flex: 1 1 auto;
      display: grid;
      place-items: center;
      min-height: 0;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: 6px;
      background: var(--surface-2);
    }

    .cara img,
    .cara video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Quien habla se marca con un borde: en seis caras chicas, es lo unico
       que se ve de reojo sin dejar de mirar el chat. */
    .cara.hablando {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }

    .micro {
      position: absolute;
      right: 0.25rem;
      bottom: 0.25rem;
      font-size: 0.8rem;
      line-height: 1;
      opacity: 0.85;
    }

    /*
      Desconectado se ve apagado y no se esconde: que la cara siga ahí en gris
      dice "se le cayó la conexión", que es distinto de "se fue de la mesa".
    */
    .cara.desconectado {
      filter: grayscale(1);
      opacity: 0.45;
    }

    .inicial {
      font-family: Georgia, serif;
      font-size: 2rem;
      color: var(--muted);
    }

    .pie {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      flex-wrap: wrap;
      min-width: 0;
    }

    .nombre {
      font-weight: 600;
    }

    .pj {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class JugadorPanelComponent {
  readonly jugador = input.required<PartyMemberView | null>();
  /** Su lugar en la llamada, o null si no entró al canal. */
  readonly cara = input<Cara | null>(null);

  readonly esMaster = computed(() => this.jugador()?.role === 'gm');
  readonly enElCanal = computed(() => !!this.cara());
  readonly video = computed(() => this.cara()?.video ?? null);
  readonly audio = computed(() => this.cara()?.audio ?? null);
  readonly hablando = computed(() => !!this.cara()?.hablando);

  readonly inicialesDe = iniciales;
}
