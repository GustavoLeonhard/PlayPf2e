import type { StrikeSheet } from './character.engine';
import { rollFormula } from './dice';
import { signed, type Stat } from './modifiers';

/**
 * Cómo se arma una tirada.
 *
 * Vive acá y no en la hoja porque hay dos lugares que tiran lo mismo: la hoja
 * completa y la vista de juego de la mesa. Duplicar el multiple attack penalty
 * o el cálculo del crítico en dos componentes es pedir que se separen.
 */
export interface Tirada {
  label: string;
  die: number;
  modifier: number;
  total: number;
  crit: 'success' | 'failure' | null;
  damage?: { detail: string; total: number; critical: number; criticalDetail: string; type: string };
  dc?: number;
  save?: string;
}

const d20 = () => 1 + Math.floor(Math.random() * 20);

/** Una tirada de chequeo: habilidad, salvación, percepción. */
export function tirarChequeo(label: string, stat: Stat): Tirada {
  const die = d20();
  return {
    label,
    die,
    modifier: stat.total,
    total: die + stat.total,
    crit: die === 20 ? 'success' : die === 1 ? 'failure' : null,
  };
}

/**
 * El multiple attack penalty: −5 al segundo ataque y −10 al tercero, la mitad
 * si el arma es agile.
 */
export function mapPenalty(strike: StrikeSheet, ataque: number): number {
  if (ataque <= 1) return 0;
  const agil = strike.traits.includes('agile');
  return ataque === 2 ? (agil ? -4 : -5) : agil ? -8 : -10;
}

/**
 * Un ataque con su daño y su crítico, todo tirado de una.
 *
 * El crítico se calcula aparte del normal porque no es el mismo cálculo: fatal
 * cambia el tamaño del dado y deadly suma uno extra.
 */
export function tirarAtaque(strike: StrikeSheet, ataque = 1): Tirada {
  const map = mapPenalty(strike, ataque);
  const die = d20();
  const dados = strike.damageDice.match(/^(\d+)d(\d+)$/);
  const mods = strike.damage.total;

  const normal = dados ? rollFormula(strike.damageDice) : { total: 0, detail: '', formula: '' };
  const totalNormal = normal.total + mods;

  let critico = totalNormal * 2;
  let detalleCritico = `(${normal.detail}${mods ? ' ' + signed(mods) : ''}) ×2`;

  if (strike.fatal && dados) {
    // Se vuelve a tirar con el dado grande: es lo que hace fatal.
    const conFatal = rollFormula(`${dados[1]}${strike.fatal}`);
    const extra = rollFormula(`1${strike.fatal}`);
    critico = (conFatal.total + mods) * 2 + extra.total;
    detalleCritico = `fatal ${strike.fatal}: (${conFatal.detail}${mods ? ' ' + signed(mods) : ''}) ×2 + ${extra.detail} del dado extra`;
  } else if (strike.deadly) {
    const extra = rollFormula(`1${strike.deadly}`);
    critico += extra.total;
    detalleCritico = `(${normal.detail}${mods ? ' ' + signed(mods) : ''}) ×2 + ${extra.detail} de deadly ${strike.deadly}`;
  }

  return {
    label: ataque > 1 ? `${strike.name} (${ataque}º ataque, MAP ${map})` : strike.name,
    die,
    modifier: strike.attack.total + map,
    total: die + strike.attack.total + map,
    crit: die === 20 ? 'success' : die === 1 ? 'failure' : null,
    damage: {
      detail: `${normal.detail}${mods ? ' ' + signed(mods) : ''}`,
      total: totalNormal,
      critical: critico,
      criticalDetail: detalleCritico,
      type: strike.damageType,
    },
  };
}
