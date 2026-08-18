import type { Feat } from '../models/content.model';

/**
 * Arquetipos y multiclase.
 *
 * En el dataset no hay un campo "a que arquetipo pertenece esta dote": la pertenencia
 * se expresa en el prerrequisito, que nombra la dedication ("Alchemist Dedication").
 * Con eso alcanza, porque sabemos que dotes tiene el personaje.
 */

export const isDedication = (feat: Feat) => feat.traits.includes('dedication');
export const isArchetypeFeat = (feat: Feat) => feat.traits.includes('archetype');

/** Dedications que el personaje ya tomó, en minúscula. */
export function ownedDedications(feats: Feat[]): Set<string> {
  return new Set(feats.filter(isDedication).map((f) => f.name.toLowerCase()));
}

/**
 * ¿Se puede ofrecer esta dote de arquetipo?
 *
 * Las dedications siempre se ofrecen. El resto solo si ya tenés la dedication que
 * piden: sin este filtro la lista de dotes de clase se llena con las ~1150 dotes de
 * arquetipo del dataset y se vuelve inusable.
 */
export function archetypeFeatAvailable(feat: Feat, owned: Set<string>): boolean {
  if (isDedication(feat)) return true;
  const required = feat.prerequisites.filter((p) => /dedication/i.test(p));
  if (!required.length) return true;
  return required.some((p) => owned.has(p.toLowerCase().trim().replace(/[.]$/, '')));
}
