import type { Modifier, ModifierType } from './modifiers';
import { mod } from './modifiers';

/**
 * Efectos activos: rabia, garbo, heroism, una poción de velocidad.
 *
 * Son lo mismo que una condición —algo que se prende un rato y mueve números—
 * salvo que estos los elegís vos. Por eso entran por el MISMO pipeline: un
 * efecto activo se traduce a modificadores y se empuja a la lista, igual que
 * hace `conditions.ts`.
 *
 * La diferencia es de dónde salen: las condiciones están escritas a mano
 * (son 42), y los efectos vienen del pack (son 1418, con sus reglas ya
 * escritas). Interpretarlas acá y no en el importador es a propósito: esto se
 * puede testear contra el pack real.
 */

/** Una regla del pack, tal como la trae el importador. */
export interface ReglaEfecto {
  key: string;
  selector?: string | string[];
  type?: string;
  value?: unknown;
  predicate?: unknown[];
  [k: string]: unknown;
}

export interface Effect {
  id: string;
  slug: string;
  name: string;
  traits: string[];
  rarity: string;
  source: string;
  description: string;
  level: number;
  duration: { value: number; unit: string };
  rules: ReglaEfecto[];
  /** Claves que la app no sabe aplicar (BattleForm, Strike…). */
  otrasReglas: string[];
}

/**
 * De los selectores de Foundry a los del motor.
 *
 * Los que no están acá se ignoran a propósito: es preferible no aplicar un
 * modificador que aplicarlo al lugar equivocado.
 */
const SELECTORES: Record<string, string[]> = {
  ac: ['ac'],
  perception: ['perception'],
  attack: ['attack'],
  'attack-roll': ['attack'],
  'strike-attack-roll': ['attack'],
  'saving-throw': ['fortitude', 'reflex', 'will'],
  fortitude: ['fortitude'],
  reflex: ['reflex'],
  will: ['will'],
  'skill-check': ['all-skills'],
  initiative: ['initiative'],
  speed: ['speed'],
  'land-speed': ['speed'],
  'strike-damage': ['damage'],
  'melee-damage': ['damage'],
  'damage-roll': ['damage'],
};

/** Las 16 habilidades: un selector con el nombre de una habilidad es esa habilidad. */
const HABILIDADES = [
  'acrobatics',
  'arcana',
  'athletics',
  'crafting',
  'deception',
  'diplomacy',
  'intimidation',
  'medicine',
  'nature',
  'occultism',
  'performance',
  'religion',
  'society',
  'stealth',
  'survival',
  'thievery',
];

const TIPOS: ModifierType[] = ['item', 'status', 'circumstance', 'untyped', 'ability', 'proficiency'];

const tipoDe = (t: unknown): ModifierType =>
  typeof t === 'string' && (TIPOS as string[]).includes(t) ? (t as ModifierType) : 'untyped';

/** Los selectores del motor a los que apunta una regla. */
export function selectoresDe(regla: ReglaEfecto): string[] {
  const crudos = ([] as string[]).concat((regla.selector as string | string[]) ?? []);
  return crudos.flatMap((s) => {
    if (SELECTORES[s]) return SELECTORES[s];
    if (HABILIDADES.includes(s)) return [`skill:${s}`];
    return [];
  });
}

/**
 * Un valor de regla resuelto a número, o null si depende de algo que no se
 * puede evaluar acá (una fórmula `@actor.level`, una tabla por rangos).
 *
 * Devolver null y NO aplicar nada es deliberado: un efecto que suma de menos
 * se nota; uno que suma cualquier cosa, no.
 */
export function valorDe(regla: ReglaEfecto): number | null {
  return typeof regla.value === 'number' ? regla.value : null;
}

/**
 * ¿Se puede aplicar esta regla sin mentir?
 *
 * Con `predicate` la regla vale solo en cierta situación ("solo si Tumble
 * Through", "solo contra no-muertos"). Misma decisión que con las runas: se
 * muestra, no se suma. De 1073 modificadores del pack, 521 tienen predicado.
 */
export function esAplicable(regla: ReglaEfecto): boolean {
  if (regla.key !== 'FlatModifier') return false;
  if (regla.predicate) return false;
  return valorDe(regla) !== null && selectoresDe(regla).length > 0;
}

/** Los modificadores que aportan los efectos activos para un selector dado. */
export function effectModifiers(activos: Effect[], selectores: string[]): Modifier[] {
  const salida: Modifier[] = [];
  for (const efecto of activos) {
    for (const regla of efecto.rules) {
      if (!esAplicable(regla)) continue;

      const propios = selectoresDe(regla);
      // 'all-skills' es el comodín de skill-check: pega en cualquier skill:<x>.
      const pega =
        propios.some((s) => selectores.includes(s)) ||
        (propios.includes('all-skills') && selectores.some((s) => s.startsWith('skill:')));
      if (!pega) continue;

      salida.push(mod(nombreCorto(efecto), valorDe(regla)!, tipoDe(regla.type)));
    }
  }
  return salida;
}

/**
 * Lo que el efecto hace pero la hoja NO calcula: reglas con predicado, valores
 * por fórmula, y claves enteras que no sabemos leer.
 *
 * Se muestra al lado del interruptor. Un efecto a medio aplicar sin avisar es
 * peor que uno no aplicado.
 */
export function avisosDe(efecto: Effect): string[] {
  const avisos: string[] = [];

  for (const regla of efecto.rules) {
    if (regla.key !== 'FlatModifier') continue;
    if (regla.predicate) avisos.push('tiene bonus que dependen de la situación');
    else if (valorDe(regla) === null) avisos.push('tiene un bonus que varía según el nivel');
  }

  const otras = efecto.rules.filter((r) => r.key !== 'FlatModifier').map((r) => r.key);
  for (const clave of [...new Set([...otras, ...efecto.otrasReglas])].filter((k) => !PLOMERIA.has(k))) {
    avisos.push(`incluye ${NOMBRES_DE_REGLA[clave] ?? clave}, que la hoja no calcula`);
  }

  return [...new Set(avisos)];
}

/**
 * Cableado interno de Foundry: no es un efecto que el jugador tenga que saber.
 * `RollOption` marca una opción para otras reglas, `ActiveEffectLike` guarda un
 * valor intermedio. Avisar de estos sería ruido en cada efecto.
 */
const PLOMERIA = new Set(['RollOption', 'ActiveEffectLike', 'GrantItem', 'TokenImage', 'TokenLight', 'CriticalSpecialization']);

const NOMBRES_DE_REGLA: Record<string, string> = {
  TempHP: 'HP temporales',
  DamageDice: 'dados de daño extra',
  BaseSpeed: 'un cambio de velocidad base',
  Resistance: 'resistencias',
  Weakness: 'debilidades',
  Sense: 'un sentido nuevo',
  Note: 'una nota de tirada',
  BattleForm: 'una forma de batalla',
  Strike: 'un ataque nuevo',
  ChoiceSet: 'una elección',
};

/** "Effect: Rage" -> "Rage". El prefijo lo repite cada efecto y no aporta. */
export function nombreCorto(efecto: { name: string }): string {
  return efecto.name.replace(/^(Spell |Aura |Stance )?Effect:\s*/i, '').trim();
}
