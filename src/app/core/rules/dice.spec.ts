import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { criticalTotal, rollFormula } from './dice';
import { castableRanks } from './spellcasting';
import { HABILIDADES_CON_MAP, mapDeManiobra, tirarChequeo } from './tiradas';

/** Las acciones reales del dataset, no un fixture: la regla sale de ahi. */
const acciones: { name: string; traits: string[]; description?: string }[] = JSON.parse(
  readFileSync(join(process.cwd(), 'public/data/actions.json'), 'utf8'),
);

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

describe('multiple attack penalty de maniobras', () => {
  it('solo Athletics y Acrobatics gastan ataque', () => {
    /*
     * La lista no es de gusto: son las unicas dos habilidades que aparecen en
     * una accion con rasgo `attack`. Si el dataset algun dia trae una tercera,
     * este test la delata en vez de dejarla pasar sin boton.
     */
    const conAtaque = acciones.filter((a) => a.traits.includes('attack'));
    const deHabilidad = new Set<string>();
    for (const a of conAtaque) {
      const texto = (a.description ?? '').replace(/<[^>]+>/g, ' ');
      for (const sk of ['Athletics', 'Acrobatics']) if (texto.includes(sk)) deHabilidad.add(sk.toLowerCase());
    }
    expect([...deHabilidad].sort()).toEqual(['acrobatics', 'athletics']);
    expect([...HABILIDADES_CON_MAP].sort()).toEqual(['acrobatics', 'athletics']);
  });

  it('resta -5 a la segunda y -10 a la tercera, sin mitad por agile', () => {
    expect(mapDeManiobra(1)).toBe(0);
    expect(mapDeManiobra(2)).toBe(-5);
    expect(mapDeManiobra(3)).toBe(-10);
  });

  it('la tirada aplica el MAP al modificador y lo dice en la etiqueta', () => {
    const stat = { total: 12, breakdown: [] } as unknown as Parameters<typeof tirarChequeo>[1];
    const t = tirarChequeo('Athletics', stat, 2);
    expect(t.modifier).toBe(7);
    expect(t.total).toBe(t.die + 7);
    expect(t.label).toContain('MAP -5');
    expect(tirarChequeo('Athletics', stat).modifier).toBe(12);
  });
});
