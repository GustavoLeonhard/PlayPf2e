import { Injectable, signal } from '@angular/core';

/**
 * Ventanas flotantes de verdad, con Document Picture-in-Picture.
 *
 * POR QUÉ NO ALCANZA `window.open`. Las ventanas sueltas de la mesa abren otro
 * documento que se resincroniza desde el servidor, y para el chat, las notas o
 * los dados eso es una virtud: funcionan igual en otra máquina. Pero un
 * MediaStream **no es un dato que viaje por el servidor**, es un objeto vivo en
 * un documento. La ventana nueva no está en la llamada, así que no tiene nada
 * que mostrar; y si se uniera sola entraría como un segundo participante, con
 * eco y el doble de minutos facturados.
 *
 * Document PiP resuelve justo eso: el navegador da una ventana vacía y vos le
 * **mudás los nodos que ya tenés**. Mismo documento, mismo contexto de JS, así
 * que los `<video>` se llevan su stream puesto y Angular les sigue escribiendo
 * encima sin enterarse de que se mudaron.
 *
 * No está en todos lados: Chrome y Edge desde la 130, Firefox desde la 151.
 * Safari y los móviles no lo tienen, y ahí `soportado` es false.
 */

interface Mudanza {
  elemento: HTMLElement;
  padre: Node;
  siguiente: Node | null;
  ventana: Window;
}

/** El tipo no está en lib.dom todavía. */
interface ConPip {
  documentPictureInPicture?: {
    requestWindow(opciones?: { width?: number; height?: number }): Promise<Window>;
  };
}

@Injectable({ providedIn: 'root' })
export class PipService {
  readonly soportado = typeof window !== 'undefined' && !!(window as unknown as ConPip).documentPictureInPicture;

  /** Qué está afuera ahora. Una sola: el navegador permite una ventana PiP. */
  readonly abierta = signal<string | null>(null);

  private mudanza: Mudanza | null = null;

  /**
   * Saca un elemento a una ventana flotante del sistema.
   *
   * Devuelve false si el navegador no puede: quien llama decide qué decir. No
   * se cae a `window.open` a propósito — sería abrir una ventana que se ve
   * vacía, que es peor que no abrir nada.
   */
  async sacar(clave: string, elemento: HTMLElement, tamano = { width: 360, height: 300 }): Promise<boolean> {
    const api = (window as unknown as ConPip).documentPictureInPicture;
    if (!api) return false;

    await this.devolver();

    let ventana: Window;
    try {
      ventana = await api.requestWindow(tamano);
    } catch {
      // El navegador puede negarse (sin gesto del usuario, o ya hay una).
      return false;
    }

    /*
     * La ventana nace SIN estilos: es un documento nuevo. Se le clonan los del
     * documento principal, que es donde Angular deja los de cada componente.
     */
    for (const hoja of Array.from(document.styleSheets)) {
      try {
        const reglas = Array.from(hoja.cssRules)
          .map((r) => r.cssText)
          .join('');
        const estilo = ventana.document.createElement('style');
        estilo.textContent = reglas;
        ventana.document.head.appendChild(estilo);
      } catch {
        // Hoja de otro origen: no se pueden leer sus reglas. Se ignora.
      }
    }
    for (const link of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
      ventana.document.head.appendChild(link.cloneNode(true));
    }
    // Los estilos que Angular adopta en vez de inyectar como <style>.
    (ventana.document as unknown as { adoptedStyleSheets: unknown[] }).adoptedStyleSheets = [
      ...(document as unknown as { adoptedStyleSheets: unknown[] }).adoptedStyleSheets,
    ];
    ventana.document.body.style.margin = '0';
    ventana.document.body.style.background = getComputedStyle(document.body).backgroundColor;

    /*
     * Se guarda de DÓNDE salió para poder devolverlo al mismo lugar. Angular
     * sigue siendo el dueño del nodo: si se destruye la vista mientras está
     * afuera, se lo lleva puesto, así que quien saca tiene que mantenerlo vivo.
     */
    this.mudanza = {
      elemento,
      padre: elemento.parentNode!,
      siguiente: elemento.nextSibling,
      ventana,
    };

    ventana.document.body.appendChild(elemento);
    this.abierta.set(clave);

    ventana.addEventListener('pagehide', () => void this.devolver(), { once: true });
    return true;
  }

  /** Devuelve el elemento a su lugar y cierra la ventana. */
  async devolver(): Promise<void> {
    const m = this.mudanza;
    this.mudanza = null;
    this.abierta.set(null);
    if (!m) return;

    // Al lugar exacto: si se apendea al final, la ventana cambia de orden.
    m.padre.insertBefore(m.elemento, m.siguiente);
    if (!m.ventana.closed) m.ventana.close();
  }
}
