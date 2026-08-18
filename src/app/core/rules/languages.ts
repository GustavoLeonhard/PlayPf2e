/**
 * Idiomas de PF2e Legacy.
 *
 * FUENTE verificada: https://2e.aonprd.com/Rules.aspx?ID=131&NoRedirect=1
 * (banner "Legacy Content", Core Rulebook, tablas 2-1 y 2-2).
 *
 * La lista no sale del dataset: las ancestrías solo declaran los que otorgan ellas,
 * así que faltarían Jotun, Sylvan, Undercommon y todos los poco comunes.
 */

export const COMMON_LANGUAGES = [
  'common',
  'draconic',
  'dwarven',
  'elven',
  'gnomish',
  'goblin',
  'halfling',
  'jotun',
  'orcish',
  'sylvan',
  'undercommon',
] as const;

export const UNCOMMON_LANGUAGES = [
  'abyssal',
  'aklo',
  'aquan',
  'auran',
  'celestial',
  'gnoll',
  'ignan',
  'infernal',
  'necril',
  'shadowtongue',
  'terran',
] as const;

/**
 * Cuántos idiomas puede elegir el personaje además de los que le da su ancestría:
 * el modificador de Inteligencia (si es positivo) más los que sume la ancestría.
 */
export const languageSlots = (intModifier: number, ancestryExtra: number): number =>
  Math.max(0, intModifier) + ancestryExtra;

/** Para mostrar: "shadowtongue" -> "Shadowtongue", y respeta lo que escribió el usuario. */
export const languageLabel = (language: string): string =>
  language.charAt(0).toUpperCase() + language.slice(1);
