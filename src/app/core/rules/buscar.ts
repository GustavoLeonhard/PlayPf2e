/**
 * Búsqueda por nombre Y por descripción.
 *
 * Buscar solo por nombre obliga a saber cómo se llama lo que buscás. Escribir
 * "firearm" y no encontrar nada, cuando hay treinta dotes que hablan de armas
 * de fuego, es la diferencia entre un catálogo y un índice.
 *
 * El nombre pesa más que la descripción: si escribís "fleet" querés la dote
 * Fleet primero, no las quince que la mencionan de pasada.
 */

/** Un ítem buscable: alcanza con que tenga nombre, y ojalá descripción. */
export interface Buscable {
  name: string;
  description?: string;
}

/**
 * El texto del pack sin sus etiquetas, en una sola línea.
 *
 * Se exporta porque además de buscar, sirve para mostrarlo donde no entra HTML:
 * el tooltip de una condición o de un efecto es texto plano y nada más.
 */
export const sinHtml = (texto: string) =>
  texto
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Filtra y ordena: primero los que coinciden por nombre, después por texto.
 *
 * Devuelve la lista entera cuando no hay término, para que el que llama decida
 * si recorta.
 */
export function buscar<T extends Buscable>(items: T[], termino: string): T[] {
  const q = termino.trim().toLowerCase();
  if (!q) return items;

  const porNombre: T[] = [];
  const porTexto: T[] = [];

  for (const item of items) {
    if (item.name.toLowerCase().includes(q)) {
      porNombre.push(item);
    } else if (item.description && sinHtml(item.description).toLowerCase().includes(q)) {
      porTexto.push(item);
    }
  }

  return [...porNombre, ...porTexto];
}

/** Si el ítem entró por su descripción y no por su nombre. */
export const coincidePorTexto = (item: Buscable, termino: string): boolean => {
  const q = termino.trim().toLowerCase();
  if (!q || item.name.toLowerCase().includes(q)) return false;
  return !!item.description && sinHtml(item.description).toLowerCase().includes(q);
};
