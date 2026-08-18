import type { CharacterBuild, Choice, ChoiceSlot } from '../models/character.model';
import type { ClassFeature, Pf2Class } from '../models/content.model';

/**
 * "¿Qué me toca elegir al subir a nivel 7?"
 *
 * Sale directo de los arrays que el dataset trae en cada clase
 * (classFeatLevels, ancestryFeatLevels, generalFeatLevels, skillFeatLevels,
 * skillIncreaseLevels), asi que es un filter, no una tabla hardcodeada.
 */

export interface PendingSlot {
  level: number;
  slot: ChoiceSlot;
  index: number;
  label: string;
  /** Categoria de feat a ofrecer; null para skillIncrease. */
  featCategory: 'class' | 'ancestry' | 'general' | 'skill' | null;
  chosen?: Choice;
}

const SLOT_LABEL: Record<ChoiceSlot, string> = {
  classFeat: 'Dote de clase',
  ancestryFeat: 'Dote de ancestría',
  generalFeat: 'Dote general',
  skillFeat: 'Dote de habilidad',
  skillIncrease: 'Aumento de habilidad',
  classFeature: 'Rasgo de clase',
  bonusFeat: 'Dote adicional',
};

/** Todos los slots que corresponden exactamente a ese nivel. */
export function slotsForLevel(pf2class: Pf2Class | undefined, level: number): PendingSlot[] {
  if (!pf2class) return [];
  const slots: PendingSlot[] = [];

  const add = (levels: number[], slot: ChoiceSlot, featCategory: PendingSlot['featCategory']) => {
    if (!levels.includes(level)) return;
    slots.push({ level, slot, index: 0, label: SLOT_LABEL[slot], featCategory });
  };

  add(pf2class.featLevels.class, 'classFeat', 'class');
  add(pf2class.featLevels.ancestry, 'ancestryFeat', 'ancestry');
  add(pf2class.featLevels.general, 'generalFeat', 'general');
  add(pf2class.featLevels.skill, 'skillFeat', 'skill');
  add(pf2class.skillIncreaseLevels, 'skillIncrease', null);

  return slots;
}

/** Slots de todos los niveles hasta el actual, con la eleccion ya hecha si existe. */
export function allSlots(build: CharacterBuild, pf2class: Pf2Class | undefined): PendingSlot[] {
  const out: PendingSlot[] = [];
  for (let level = 1; level <= build.level; level++) {
    for (const slot of slotsForLevel(pf2class, level)) {
      slot.chosen = build.choices.find(
        (c) => c.level === slot.level && c.slot === slot.slot && (c.index ?? 0) === slot.index,
      );
      out.push(slot);
    }
  }
  return out;
}

export const pendingSlots = (build: CharacterBuild, pf2class: Pf2Class | undefined): PendingSlot[] =>
  allSlots(build, pf2class).filter((s) => !s.chosen);

/** Rasgos de clase que se ganan automaticamente al llegar a ese nivel. */
export function featuresGainedAt(pf2class: Pf2Class | undefined, level: number) {
  return (pf2class?.features ?? []).filter((f) => f.level === level);
}

/**
 * Elecciones que abren los rasgos de clase de ese nivel: la vía del Gunslinger,
 * el instinct del Barbarian, el racket del Rogue…
 *
 * No hay tabla escrita a mano: el rasgo declara un ChoiceSet con un filtro por tag
 * (`gunslinger-way`) y las opciones son los rasgos que llevan ese tag.
 */
export interface FeatureChoice {
  level: number;
  /** id del rasgo que abre la elección (ej. Gunslinger's Way). */
  sourceId: string;
  label: string;
  options: ClassFeature[];
}

export function featureChoicesAt(
  pf2class: Pf2Class | undefined,
  level: number,
  features: ClassFeature[],
): FeatureChoice[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const out: FeatureChoice[] = [];

  for (const granted of featuresGainedAt(pf2class, level)) {
    const feature = granted.id ? byId.get(granted.id) : undefined;
    if (!feature) continue;

    for (const rule of feature.rules ?? []) {
      if (rule.key !== 'ChoiceSet' || !rule.filterTags?.length) continue;
      const options = features.filter((f) => rule.filterTags!.some((tag) => f.tags.includes(tag)));
      if (options.length) out.push({ level, sourceId: feature.id, label: feature.name, options });
    }
  }

  return out;
}

/** ¿Este nivel otorga los 4 boosts de atributo? */
export const isBoostLevel = (level: number): boolean => [1, 5, 10, 15, 20].includes(level);
