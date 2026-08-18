/**
 * Pipeline de modificadores tipados.
 *
 * Todo valor del personaje se calcula como una LISTA de modificadores, nunca como
 * un entero suelto. Eso da tres cosas gratis:
 *   1. el breakdown "de donde sale este +11" que se muestra en la hoja,
 *   2. las reglas de stacking de PF2e (status/circumstance/item NO se acumulan
 *      entre si: se aplica solo el mayor bonus y la mayor penalidad de cada tipo),
 *   3. aplicar una condicion = empujar un modificador mas a la lista.
 */

export type ModifierType = 'ability' | 'proficiency' | 'level' | 'item' | 'status' | 'circumstance' | 'untyped';

/** Tipos que no acumulan con otros del mismo tipo. */
const NON_STACKING: ModifierType[] = ['item', 'status', 'circumstance'];

export interface Modifier {
  source: string;
  value: number;
  type: ModifierType;
}

export interface Stat {
  total: number;
  breakdown: Modifier[];
  /** Modificadores descartados por stacking; se muestran tachados en el tooltip. */
  suppressed: Modifier[];
}

/**
 * Aplica las reglas de stacking y suma.
 * Untyped, ability, proficiency y level siempre acumulan.
 * Item, status y circumstance: solo el mayor bonus y la menor penalidad de cada tipo.
 */
export function buildStat(modifiers: Modifier[]): Stat {
  const applied: Modifier[] = [];
  const suppressed: Modifier[] = [];

  const stacking = modifiers.filter((m) => !NON_STACKING.includes(m.type));
  applied.push(...stacking);

  for (const type of NON_STACKING) {
    const ofType = modifiers.filter((m) => m.type === type);
    if (!ofType.length) continue;

    const bonuses = ofType.filter((m) => m.value > 0);
    const penalties = ofType.filter((m) => m.value < 0);

    if (bonuses.length) {
      const best = bonuses.reduce((a, b) => (b.value > a.value ? b : a));
      applied.push(best);
      suppressed.push(...bonuses.filter((m) => m !== best));
    }
    if (penalties.length) {
      const worst = penalties.reduce((a, b) => (b.value < a.value ? b : a));
      applied.push(worst);
      suppressed.push(...penalties.filter((m) => m !== worst));
    }
  }

  const ordered = modifiers.filter((m) => applied.includes(m));

  return {
    total: applied.reduce((sum, m) => sum + m.value, 0),
    breakdown: ordered,
    suppressed,
  };
}

export const mod = (source: string, value: number, type: ModifierType = 'untyped'): Modifier => ({
  source,
  value,
  type,
});

/** Formatea un total con signo: 11 -> "+11", -1 -> "-1" */
export const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
