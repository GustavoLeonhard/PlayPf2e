/** Tiradas de dados. Formato de fórmula: "8d6", "1d4+1", "2d6 + 1d4". */

export interface DiceRoll {
  formula: string;
  total: number;
  /** Detalle de cada dado tirado, para mostrar el desglose. */
  detail: string;
}

const d = (faces: number) => 1 + Math.floor(Math.random() * faces);

/**
 * Tira una fórmula. Lo que no se entiende se ignora en vez de romper: el dataset
 * tiene fórmulas raras (con variables de Foundry) en una minoría de hechizos.
 */
export function rollFormula(formula: string): DiceRoll {
  let total = 0;
  const parts: string[] = [];

  for (const term of formula.replace(/\s/g, '').split('+')) {
    const dice = term.match(/^(\d+)d(\d+)$/);
    if (dice) {
      const rolls = Array.from({ length: Number(dice[1]) }, () => d(Number(dice[2])));
      total += rolls.reduce((a, b) => a + b, 0);
      /*
       * Con signo de más y no con comas: "(1 + 5 + 6)" se lee como la cuenta
       * que es, y con una coma parecía una lista de la que después había que
       * sacar el total de cabeza.
       */
      parts.push(`${term} (${rolls.join(' + ')})`);
      continue;
    }
    const flat = term.match(/^\d+$/);
    if (flat) {
      total += Number(flat[0]);
      parts.push(term);
    }
  }

  return { formula, total, detail: parts.join(' + ') };
}

/**
 * En PF2e un crítico duplica el daño total (no se tiran los dados de nuevo).
 * Se duplica el resultado ya tirado, que es la regla por defecto.
 */
export const criticalTotal = (roll: DiceRoll): number => roll.total * 2;
