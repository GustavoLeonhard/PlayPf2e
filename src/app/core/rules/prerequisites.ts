import type { Ability, ProficiencyRank } from '../models/content.model';
import { ABILITY_NAMES } from '../models/content.model';

/**
 * Evaluacion parcial de prerrequisitos.
 *
 * En el dataset los prerrequisitos son texto libre ("Trained in Athletics"), asi que
 * no se pueden evaluar en general — esa fue la decision de diseno desde el principio.
 * Pero los patrones frecuentes SI son reconocibles, y cubrirlos evita advertencias
 * falsas sobre cosas que el personaje claramente cumple.
 *
 * Lo que no se reconoce queda como `unknown` y se sigue mostrando como advertencia.
 */

export type PrerequisiteStatus = 'met' | 'unmet' | 'unknown';

export interface PrerequisiteContext {
  abilityScores: Record<Ability, number>;
  /** Rango por slug de skill, incluyendo `lore:<slug>`. */
  skillRanks: Record<string, ProficiencyRank>;
  perception: ProficiencyRank;
  /** Nombres (en minuscula) de las dotes y rasgos que ya tiene el personaje. */
  ownedNames: Set<string>;
  /** Todas las dotes del dataset: distingue "dote que te falta" de "texto que no entiendo". */
  knownFeatNames: Set<string>;
  level: number;
}

const RANKS: Record<string, ProficiencyRank> = {
  untrained: 0,
  trained: 1,
  expert: 2,
  master: 3,
  legendary: 4,
};

const ABILITY_BY_NAME = Object.entries(ABILITY_NAMES).reduce<Record<string, Ability>>((acc, [key, name]) => {
  acc[name.toLowerCase()] = key as Ability;
  return acc;
}, {});

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/\.$/, '');

export function evaluatePrerequisite(raw: string, ctx: PrerequisiteContext): PrerequisiteStatus {
  const text = normalize(raw);

  // "trained in Athletics", "expert in Perception", "master in Stealth"
  const proficiency = text.match(/^(untrained|trained|expert|master|legendary) in (.+)$/);
  if (proficiency) {
    const required = RANKS[proficiency[1]];
    const target = proficiency[2];

    // "trained in at least one skill" y variantes de cantidad: no se evaluan.
    if (/at least|any |one of|two |or /.test(target)) return 'unknown';

    if (target === 'perception') return ctx.perception >= required ? 'met' : 'unmet';

    const slug = target.replace(/[^a-z0-9]+/g, '-');
    const rank = ctx.skillRanks[slug];
    if (rank === undefined) {
      // Puede ser un Lore concreto ("trained in Hunting Lore").
      const loreMatch = target.match(/^(.+?) lore$/);
      if (loreMatch) {
        const loreRank = ctx.skillRanks[`lore:${loreMatch[1].replace(/[^a-z0-9]+/g, '-')}`];
        return loreRank === undefined ? 'unmet' : loreRank >= required ? 'met' : 'unmet';
      }
      return 'unknown';
    }
    return rank >= required ? 'met' : 'unmet';
  }

  // "Strength 14", "Dexterity 16"
  const abilityScore = text.match(/^([a-z]+) (\d+)$/);
  if (abilityScore) {
    const ability = ABILITY_BY_NAME[abilityScore[1]];
    if (ability) return ctx.abilityScores[ability] >= Number(abilityScore[2]) ? 'met' : 'unmet';
  }

  // "level 5", "5th level"
  const levelReq = text.match(/^(?:level (\d+)|(\d+)(?:st|nd|rd|th) level)$/);
  if (levelReq) {
    const required = Number(levelReq[1] ?? levelReq[2]);
    return ctx.level >= required ? 'met' : 'unmet';
  }

  // El prerrequisito es el nombre de otra dote o rasgo: sabemos si lo tiene.
  if (ctx.ownedNames.has(text)) return 'met';
  if (ctx.knownFeatNames.has(text)) return 'unmet';

  return 'unknown';
}
