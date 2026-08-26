import type { CharacterState, InventoryItem } from '../models/character.model';
import { efectoAMano } from './efectos-a-mano';
import { RAGE_SLUG, rageSheet } from './rabia';

/**
 * Los cambios que se hacen sobre un personaje DURANTE la partida.
 *
 * Prender una condición, apagar la furia, tachar una poción que te tomaste,
 * pagar veinte monedas. Todo lo que en la mesa se toca a cada rato.
 *
 * Vive acá y no en la hoja porque ahora hay DOS pantallas que hacen lo mismo:
 * la hoja completa y el panel de la mesa. Es el mismo motivo por el que el
 * multiple attack penalty vive en `tiradas.ts` — dos copias de una regla es
 * una copia esperando a quedar vieja.
 *
 * Son funciones puras: reciben lo que había y devuelven lo que queda. Quien
 * llama se encarga de guardar. Así se pueden testear sin un componente.
 */

// ------------------------------------------------------------- condiciones

type Condicion = CharacterState['conditions'][number];

/** Prende o apaga una condición. Las que llevan valor arrancan en 1. */
export function alternarCondicion(condiciones: Condicion[], id: string, conValor: boolean): Condicion[] {
  const tenia = condiciones.some((c) => c.id === id);
  if (tenia) return condiciones.filter((c) => c.id !== id);
  return [...condiciones, conValor ? { id, value: 1 } : { id }];
}

/**
 * Sube o baja el valor de una condición con grado (clumsy 2, drained 1…).
 *
 * Bajar de 1 la saca: "clumsy 0" no existe, y obligar a apagarla aparte sería
 * un clic de más en el momento en que menos ganas hay de darlo.
 */
export function cambiarValorDeCondicion(condiciones: Condicion[], id: string, delta: number): Condicion[] {
  const actual = condiciones.find((c) => c.id === id);
  if (!actual) return condiciones;

  const siguiente = (actual.value ?? 1) + delta;
  if (siguiente <= 0) return condiciones.filter((c) => c.id !== id);
  return condiciones.map((c) => (c.id === id ? { ...c, value: siguiente } : c));
}

// ----------------------------------------------------------------- efectos

type EfectoEnLista = NonNullable<CharacterState['effects']>[number];

export const efectoEnLista = (efectos: EfectoEnLista[] | undefined, id: string) =>
  !!efectos?.some((e) => e.id === id);

export const efectoActivo = (efectos: EfectoEnLista[] | undefined, id: string) =>
  !!efectos?.some((e) => e.id === id && e.active !== false);

/** Prender o apagar sin sacarlo de la lista: es lo que se hace en cada pelea. */
export function alternarEfecto(efectos: EfectoEnLista[] | undefined, id: string): EfectoEnLista[] {
  const prendiendo = !efectoActivo(efectos, id);
  return (efectos ?? []).map((e) => (e.id === id ? { ...e, active: prendiendo } : e));
}

/**
 * Lo que un efecto arrastra además de sus modificadores.
 *
 * Son dos casos: los que la hoja ya maneja por otro lado —el escudo alzado
 * tiene su propio interruptor, y sin esto se contaría dos veces— y los que
 * escriben en el estado: la furia da HP temporales, y al salir se pierden los
 * que queden.
 *
 * MUTA el estado que recibe, a diferencia del resto del módulo. Es a propósito:
 * lo que toca son tres campos sueltos de sitios distintos, y devolver un estado
 * nuevo entero obligaría a quien llama a rearmarlo sin ganar nada.
 */
export function aplicarPuenteDeEfecto(
  state: CharacterState,
  slug: string,
  prendido: boolean,
  personaje: { nivel: number; modCon: number; tempHpDeFuria?: number },
): void {
  if (efectoAMano(slug)?.puente === 'shield') {
    // Los PJ guardados antes de que existiera el escudo no traen ese estado.
    // Sin `hp`: alzar un escudo no dice nada sobre cuánto aguante le queda.
    state.shield = { ...(state.shield ?? {}), raised: prendido };
  }

  if (slug === RAGE_SLUG) {
    const porDefecto = rageSheet(personaje.nivel, personaje.modCon).tempHp;
    state.hp.temp = prendido ? (personaje.tempHpDeFuria ?? porDefecto) : 0;
  }
}

// -------------------------------------------------------------- inventario

/** Sacarlo de la mochila entero, sin importar cuántos tenías. */
export const quitarDelInventario = (inventario: InventoryItem[], indice: number): InventoryItem[] =>
  inventario.filter((_, i) => i !== indice);

/** Nunca baja de 1: cero de algo es no tenerlo, y para eso está quitar. */
export const cambiarCantidad = (inventario: InventoryItem[], indice: number, cantidad: number): InventoryItem[] =>
  inventario.map((it, i) => (i === indice ? { ...it, quantity: Math.max(1, Math.round(cantidad || 1)) } : it));

export const alternarEquipado = (inventario: InventoryItem[], indice: number): InventoryItem[] =>
  inventario.map((it, i) => (i === indice ? { ...it, equipped: !it.equipped } : it));

// ----------------------------------------------------------------- escudo

/**
 * El estado del escudo, con los HP siempre dentro de rango.
 *
 * Los PJ guardados antes de que existiera el escudo no traen este estado, y un
 * escudo recién equipado arranca entero: por eso el `?? maxHp` en vez de cero,
 * que dejaría el escudo roto de fábrica.
 */
export const escudoCon = (
  actual: CharacterState['shield'] | undefined,
  cambios: { raised?: boolean; hp?: number },
  maxHp: number,
): { raised: boolean; hp: number } => ({
  raised: cambios.raised ?? actual?.raised ?? false,
  // `?? maxHp` y no `?? 0`: un escudo del que nadie sabe nada está entero.
  hp: Math.max(0, Math.min(maxHp, Math.round(cambios.hp ?? actual?.hp ?? maxHp))),
});

// ----------------------------------------------------------------- monedas

export type Bolsa = { pp: number; gp: number; sp: number; cp: number };

export const MONEDAS = [
  { key: 'pp' as const, name: 'Platino' },
  { key: 'gp' as const, name: 'Oro' },
  { key: 'sp' as const, name: 'Plata' },
  { key: 'cp' as const, name: 'Cobre' },
];

/** Nunca negativo: deber monedas no se representa con un número en rojo. */
export const conMoneda = (bolsa: Bolsa, moneda: keyof Bolsa, cantidad: number): Bolsa => ({
  ...bolsa,
  [moneda]: Math.max(0, Math.round(cantidad || 0)),
});
