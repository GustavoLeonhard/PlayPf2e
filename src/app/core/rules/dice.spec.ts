import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { criticalTotal, rollFormula } from './dice';
import { castableRanks } from './spellcasting';

describe('tiradas de daño', () => {
  it('tira la cantidad correcta de dados y queda en rango', () => {
    for (let i = 0; i < 50; i++) {
      const roll = rollFormula('8d6');
      expect(roll.total).toBeGreaterThanOrEqual(8);
      expect(roll.total).toBeLessThanOrEqual(48);
    }
  });

  it('suma los modificadores planos', () => {
    const roll = rollFormula('1d1+3');
    expect(roll.total).toBe(4);
  });

  it('ignora los términos que no entiende en vez de romper', () => {
    expect(rollFormula('@item.level + 2d1').total).toBe(2);
  });

  it('un crítico duplica el daño ya tirado', () => {
    expect(criticalTotal({ formula: '', total: 11, detail: '' })).toBe(22);
  });
});

describe('rangos a los que se puede lanzar', () => {
  const base = { maxRank: 5, cantripRank: 3 };

  it('un cantrip se lanza solo al rango automático', () => {
    expect(castableRanks({ ...base, spellRank: 1, isCantrip: true, isSignature: false })).toEqual([3]);
  });

  it('un hechizo común queda clavado a su rango', () => {
    expect(castableRanks({ ...base, spellRank: 2, isCantrip: false, isSignature: false })).toEqual([2]);
  });

  it('un signature spell se puede heightear hasta el rango máximo', () => {
    expect(castableRanks({ ...base, spellRank: 2, isCantrip: false, isSignature: true })).toEqual([2, 3, 4, 5]);
  });
});

describe('el flag de spellcasting de la clase', () => {
  it('es un número, no un string', () => {
    // Se comparaba contra "0" (string) y siempre daba true: un Fighter quedaba
    // con proficiencia de conjuro 1.
    const classes = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'classes.json'), 'utf8'));
    const fighter = classes.find((c: { slug: string }) => c.slug === 'fighter');
    const wizard = classes.find((c: { slug: string }) => c.slug === 'wizard');
    expect(typeof fighter.spellcasting).toBe('number');
    expect(fighter.spellcasting).toBe(0);
    expect(wizard.spellcasting).toBe(1);
  });
});
