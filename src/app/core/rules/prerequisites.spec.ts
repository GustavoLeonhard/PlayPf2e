import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluatePrerequisite, type PrerequisiteContext } from './prerequisites';
import type { ProficiencyRank } from '../models/content.model';

/**
 * Cuánto de los prerrequisitos REALES sabemos leer.
 *
 * No es una métrica de vanidad: el filtro de "requisitos cumplidos" de la
 * pantalla de dotes vale lo que valga este número. Si baja, el filtro empieza a
 * mandar dotes al cajón de "no sé" y deja de servir.
 *
 * Corre contra `public/data/` de verdad, como el resto de los tests.
 */
const leer = <T>(archivo: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'public/data/', archivo), 'utf8')) as T;

describe('cobertura de prerrequisitos', () => {
  const feats = leer<{ name: string; prerequisites: string[] }[]>('feats.json');
  const rasgos = [
    ...leer<{ name: string }[]>('class-features.json'),
    ...leer<{ name: string }[]>('ancestry-features.json'),
  ];

  const skills = [
    'acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 'diplomacy',
    'intimidation', 'medicine', 'nature', 'occultism', 'performance', 'religion',
    'society', 'stealth', 'survival', 'thievery',
  ];

  /** Un personaje que cumple todo lo cuantitativo: así lo único que queda sin
      resolver es lo que de verdad no sabemos leer, no lo que no alcanza. */
  const ctx: PrerequisiteContext = {
    abilityScores: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 },
    skillRanks: Object.fromEntries(skills.map((s) => [s, 4 as ProficiencyRank])),
    perception: 4,
    ownedNames: new Set(),
    knownNames: new Set([...feats, ...rasgos].map((f) => f.name.toLowerCase())),
    level: 20,
    alignment: 'LG',
    vision: 'normal',
  };

  const lineas = feats.flatMap((f) => f.prerequisites ?? []);

  it('lee al menos tres de cada cuatro prerrequisitos del dataset', () => {
    const sinLeer = lineas.filter((p) => evaluatePrerequisite(p, ctx) === 'unknown');
    const cobertura = 1 - sinLeer.length / lineas.length;

    /*
     * 0.75 es un piso, no una meta. Al escribirlo estaba en 0.78; el margen es
     * para no romper el build por un cambio del dataset, no para aflojar el
     * parser. Si sube, subí el piso.
     */
    expect(cobertura).toBeGreaterThan(0.75);
  });

  it('resuelve los patrones que mueven la aguja', () => {
    const con = (extra: Partial<PrerequisiteContext>) => ({ ...ctx, ...extra });

    // Proficiencia: el caso más común de todos.
    expect(evaluatePrerequisite('trained in Crafting', ctx)).toBe('met');
    expect(
      evaluatePrerequisite('master in Crafting', con({ skillRanks: { crafting: 1 } })),
    ).toBe('unmet');

    // Un rasgo de clase, no una dote: mirando solo las dotes daba 'unknown'.
    expect(evaluatePrerequisite('Spellstrike', ctx)).toBe('unmet');
    expect(evaluatePrerequisite('Spellstrike', con({ ownedNames: new Set(['spellstrike']) }))).toBe('met');

    // Alternativas: alcanza con cumplir una.
    expect(
      evaluatePrerequisite('Druid Dedication or Wizard Dedication', con({ ownedNames: new Set(['wizard dedication']) })),
    ).toBe('met');

    /*
     * Visión. El enano la tiene por ancestría y no como rasgo listado, así que
     * antes de esto salía "no cumplís darkvision" teniéndola.
     */
    expect(evaluatePrerequisite('darkvision', con({ vision: 'darkvision' }))).toBe('met');
    expect(evaluatePrerequisite('darkvision', con({ vision: 'low-light-vision' }))).toBe('unmet');
    // Ver en la oscuridad implica ver en penumbra.
    expect(evaluatePrerequisite('low-light vision', con({ vision: 'darkvision' }))).toBe('met');
    expect(evaluatePrerequisite('low-light vision', con({ vision: 'normal' }))).toBe('unmet');

    // Alineamiento, incluidos los tenets de Champion.
    expect(evaluatePrerequisite('tenets of good', ctx)).toBe('met');
    expect(evaluatePrerequisite('tenets of evil', ctx)).toBe('unmet');
    expect(evaluatePrerequisite('evil alignment', con({ alignment: 'NE' }))).toBe('met');
    // Sin alineamiento elegido no se inventa una respuesta.
    expect(evaluatePrerequisite('tenets of good', con({ alignment: null }))).toBe('unknown');
  });

  it('no dice "no cumplís" cuando en realidad no entendió', () => {
    // Lo narrativo queda como desconocido, nunca como incumplido: marcar en rojo
    // algo que el jugador sí puede cumplir es peor que no opinar.
    expect(evaluatePrerequisite('Member of the Grey Gardeners', ctx)).toBe('unknown');
    expect(evaluatePrerequisite('trained in at least one skill', ctx)).toBe('unknown');
    // Y una alternativa donde una parte no se entiende tampoco se da por perdida.
    expect(evaluatePrerequisite('Power Attack or member of a secret lodge', ctx)).toBe('unknown');
  });
});
