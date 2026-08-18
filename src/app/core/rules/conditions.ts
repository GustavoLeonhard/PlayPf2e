import type { CharacterState } from '../models/character.model';
import { mod, type Modifier } from './modifiers';

/**
 * Efecto mecanico de las condiciones de PF2e.
 *
 * Acá vive SOLO lo que el motor sabe calcular. El texto oficial de las 42 condiciones
 * se baja aparte de Archives of Nethys y vive en `public/data/conditions.json`
 * (ver tools/import/conditions.mjs): la app muestra ese texto, no estas descripciones.
 *
 * La lista de abajo es más corta a propósito: son las condiciones con efecto numérico.
 * Las demás (grabbed, fleeing, dazzled…) se pueden marcar igual en la hoja y se
 * muestran con su texto, pero no mueven ningún número.
 *
 * Cada una declara a que selectores afecta; el motor las inyecta como un
 * modificador mas en el pipeline. Sin esto habria que meter condiciones a mano
 * dentro de cada formula.
 *
 * FUENTE: Archives of Nethys, paginas LEGACY (banner "Legacy Content", Core Rulebook).
 * El sufijo `&NoRedirect=1` es lo que evita el redirect al Remaster:
 *   Stupefied   https://2e.aonprd.com/Conditions.aspx?ID=37&NoRedirect=1  (CRB pg. 622)
 *   Drained     https://2e.aonprd.com/Conditions.aspx?ID=10&NoRedirect=1  (CRB pg. 619)
 *   Flat-Footed https://2e.aonprd.com/Conditions.aspx?ID=16&NoRedirect=1
 * OJO con el nombre: en Legacy es "flat-footed"; "off-guard" es el nombre del Remaster.
 *
 * Los selectores son los mismos nombres que usa el motor: 'ac', 'perception',
 * 'fortitude', 'reflex', 'will', 'attack', 'skill:<slug>', y los comodines
 * 'dex-based', 'str-based', 'con-based', 'int-based', 'wis-based', 'cha-based',
 * 'all-checks'.
 */

export interface ConditionDef {
  id: string;
  name: string;
  /** Tiene valor numerico (clumsy 2, frightened 1...). */
  valued: boolean;
  description: string;
  /** Devuelve los modificadores que aplica al valor indicado. */
  selectors: string[];
  /** El penalizador es -valor salvo casos especiales. */
  penaltyFor?: (value: number) => number;
}

export const CONDITIONS: ConditionDef[] = [
  {
    id: 'clumsy',
    name: 'Clumsy',
    valued: true,
    description: 'Penalidad de estado a chequeos y CA basados en Destreza.',
    selectors: ['dex-based', 'ac'],
  },
  {
    id: 'enfeebled',
    name: 'Enfeebled',
    valued: true,
    description: 'Penalidad de estado a chequeos y danio basados en Fuerza.',
    selectors: ['str-based'],
  },
  {
    id: 'drained',
    name: 'Drained',
    valued: true,
    description: 'Penalidad a chequeos de Fortaleza y Constitucion; reduce los HP maximos.',
    selectors: ['con-based', 'fortitude'],
  },
  {
    id: 'stupefied',
    name: 'Stupefied',
    valued: true,
    description:
      'Penalidad de estado a chequeos y CD basados en Inteligencia, Sabiduría y Carisma, ' +
      'incluidos el ataque y la CD de conjuro.',
    selectors: ['int-based', 'wis-based', 'cha-based'],
  },
  {
    id: 'frightened',
    name: 'Frightened',
    valued: true,
    description: 'Penalidad de estado a TODOS los chequeos y CD. Baja 1 al final de cada turno.',
    selectors: ['all-checks', 'ac'],
  },
  {
    id: 'sickened',
    name: 'Sickened',
    valued: true,
    description: 'Penalidad de estado a todos los chequeos y CD. No podes ingerir nada.',
    selectors: ['all-checks', 'ac'],
  },
  {
    id: 'doomed',
    name: 'Doomed',
    valued: true,
    description: 'El valor de moribundo con el que morís se reduce. Baja 1 por descanso diario.',
    selectors: [],
  },
  {
    id: 'prone',
    name: 'Prone',
    valued: false,
    // Estar tumbado te deja flat-footed, asi que ademas del -2 al ataque va el -2 a la CA.
    description: 'Penalidad de circunstancia -2 a los ataques, y quedás flat-footed (-2 a la CA).',
    selectors: ['attack', 'ac'],
    penaltyFor: () => -2,
  },
  {
    id: 'flat-footed',
    name: 'Flat-Footed',
    valued: false,
    description: 'Penalidad de circunstancia -2 a la CA. En el Remaster esta condición se llama Off-Guard.',
    selectors: ['ac'],
    penaltyFor: () => -2,
  },
  {
    id: 'stunned',
    name: 'Stunned',
    valued: true,
    description: 'Perdés esa cantidad de acciones en tu próximo turno. Sin efecto numérico en la hoja.',
    selectors: [],
  },
  {
    id: 'slowed',
    name: 'Slowed',
    valued: true,
    description: 'Perdés esa cantidad de acciones cada turno. Sin efecto numérico en la hoja.',
    selectors: [],
  },
  {
    id: 'blinded',
    name: 'Blinded',
    valued: false,
    description: 'No podés ver: todo terreno es difícil y fallás chequeos que requieran vista.',
    selectors: [],
  },
  {
    id: 'fatigued',
    name: 'Fatigued',
    valued: false,
    description: 'Penalidad de estado -1 a la CA y a las salvaciones.',
    selectors: ['ac', 'fortitude', 'reflex', 'will'],
    penaltyFor: () => -1,
  },
];

export const CONDITION_BY_ID = new Map(CONDITIONS.map((c) => [c.id, c]));

/**
 * Devuelve los modificadores que las condiciones activas aplican a un selector.
 * `aliases` incluye los comodines que corresponden al valor calculado
 * (ej. para Acrobatics: ['skill:acrobatics', 'dex-based', 'all-checks']).
 */
export function conditionModifiers(state: CharacterState | null, aliases: string[]): Modifier[] {
  if (!state?.conditions?.length) return [];
  const out: Modifier[] = [];

  for (const active of state.conditions) {
    const def = CONDITION_BY_ID.get(active.id);
    if (!def || !def.selectors.some((s) => aliases.includes(s))) continue;

    const value = active.value ?? 1;
    const penalty = def.penaltyFor ? def.penaltyFor(value) : -value;
    if (penalty === 0) continue;

    const label = def.valued ? `${def.name} ${value}` : def.name;
    const type = def.id === 'prone' || def.id === 'flat-footed' ? 'circumstance' : 'status';
    out.push(mod(label, penalty, type));
  }

  return out;
}
