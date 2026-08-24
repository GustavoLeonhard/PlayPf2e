import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Cuelga un track de media de un `<video>` o un `<audio>`.
 *
 * Existe porque `srcObject` no es un atributo: no se puede escribir desde una
 * plantilla con `[srcObject]`, hay que asignarlo sobre el elemento. Y porque
 * el track cambia solo —Daily lo reemplaza cuando alguien apaga y prende la
 * cámara—, así que hace falta un efecto que lo vuelva a colgar.
 *
 * Cada track va en su propio MediaStream nuevo. Reusar el stream anterior y
 * cambiarle las pistas adentro deja al elemento mostrando el cuadro congelado
 * del track viejo.
 */
@Directive({
  selector: 'video[appTrack], audio[appTrack]',
})
export class TrackDirective {
  readonly appTrack = input<MediaStreamTrack | null>(null);

  private el = inject<ElementRef<HTMLMediaElement>>(ElementRef);

  constructor() {
    effect(() => {
      const track = this.appTrack();
      const nodo = this.el.nativeElement;

      if (!track) {
        nodo.srcObject = null;
        return;
      }

      nodo.srcObject = new MediaStream([track]);
      /*
       * `play()` rechaza si el navegador considera que no hubo gesto del
       * usuario. Se traga el error a propósito: el video queda pausado, que es
       * mucho mejor que una excepción sin manejar en cada cara de la mesa.
       */
      void nodo.play().catch(() => undefined);
    });
  }
}
