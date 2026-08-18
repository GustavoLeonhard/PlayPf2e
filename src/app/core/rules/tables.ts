import type { Ability, ProficiencyRank } from '../models/content.model';

export interface SkillDef {
  slug: string;
  name: string;
  ability: Ability;
  /** Sufre penalizacion de armadura (armor check penalty). */
  armorPenalty: boolean;
}

/** Las 16 skills del CRB (Legacy: incluye Lore como caso aparte). */
export const SKILLS: SkillDef[] = [
  { slug: 'acrobatics', name: 'Acrobatics', ability: 'dex', armorPenalty: true },
  { slug: 'arcana', name: 'Arcana', ability: 'int', armorPenalty: false },
  { slug: 'athletics', name: 'Athletics', ability: 'str', armorPenalty: true },
  { slug: 'crafting', name: 'Crafting', ability: 'int', armorPenalty: false },
  { slug: 'deception', name: 'Deception', ability: 'cha', armorPenalty: false },
  { slug: 'diplomacy', name: 'Diplomacy', ability: 'cha', armorPenalty: false },
  { slug: 'intimidation', name: 'Intimidation', ability: 'cha', armorPenalty: false },
  { slug: 'medicine', name: 'Medicine', ability: 'wis', armorPenalty: false },
  { slug: 'nature', name: 'Nature', ability: 'wis', armorPenalty: false },
  { slug: 'occultism', name: 'Occultism', ability: 'int', armorPenalty: false },
  { slug: 'performance', name: 'Performance', ability: 'cha', armorPenalty: false },
  { slug: 'religion', name: 'Religion', ability: 'wis', armorPenalty: false },
  { slug: 'society', name: 'Society', ability: 'int', armorPenalty: false },
  { slug: 'stealth', name: 'Stealth', ability: 'dex', armorPenalty: true },
  { slug: 'survival', name: 'Survival', ability: 'wis', armorPenalty: false },
  { slug: 'thievery', name: 'Thievery', ability: 'dex', armorPenalty: true },
];

export const SKILL_BY_SLUG = new Map(SKILLS.map((s) => [s.slug, s]));

/** Bonus de proficiencia: untrained 0, luego 2/4/6/8 (mas el nivel si esta entrenado). */
export const PROFICIENCY_BONUS: Record<ProficiencyRank, number> = { 0: 0, 1: 2, 2: 4, 3: 6, 4: 8 };

/** Niveles en los que TODO personaje recibe 4 boosts de atributo. */
export const BOOST_LEVELS = [1, 5, 10, 15, 20] as const;

/**
 * Aplica un boost a un score: +2, o +1 si ya esta en 18 o mas.
 * (Regla Legacy de ability scores, no la de attribute modifiers del remaster.)
 */
export function applyBoost(score: number): number {
  return score >= 18 ? score + 1 : score + 2;
}

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);
