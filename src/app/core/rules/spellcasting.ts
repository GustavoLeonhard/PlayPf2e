import type { Ability, ProficiencyRank, Spell } from '../models/content.model';

/**
 * Reglas de conjuro para lanzadores espontáneos (Sorcerer y Bard).
 *
 * OJO: esta es la única parte del proyecto que NO sale del dataset. Foundry calcula
 * los slots en el código de su sistema, no en los datos: el campo `spellcasting` de
 * la clase es apenas un flag ("1").
 *
 * FUENTE — verificada, y verificada como LEGACY (no Remaster):
 *   Sorcerer: https://2e.aonprd.com/Classes.aspx?ID=11&NoRedirect=1
 *   Bard:     https://2e.aonprd.com/Classes.aspx?ID=3&NoRedirect=1
 *
 * Las dos paginas llevan el banner "Legacy Content" y citan el Core Rulebook.
 * IMPORTANTE: en Archives of Nethys el sufijo `&NoRedirect=1` es lo que evita que te
 * redirija a la version remasterizada. La misma URL sin ese parametro sirve Player
 * Core, que para este proyecto es otro juego. Cualquier consulta de reglas en la web
 * tiene que confirmarse como Legacy antes de usarse.
 *
 * Verificado punto por punto:
 *   Sorcerer  nv1 = 3 slots de rango 1 | nv2 = 4 | nv3 = 4/3 | nv4 = 4/4
 *   Bard      nv1 = 2 | nv2 = 3 | nv3 = 3/2 | nv4 = 3/3
 *   Ambos: 5 cantrips, y un unico slot de rango 10 desde nivel 19.
 */

/**
 * Cuántos slots por rango llega a tener la clase:
 *   limited 2 (Magus, Psychic) · standard 3 (la mayoría) · sorcerer 4
 */
export type CasterKind = 'limited' | 'standard' | 'sorcerer';

/** Cómo se decide qué hechizo va en cada slot. */
export type Preparation = 'spontaneous' | 'prepared';

/**
 * De dónde salen los hechizos que se pueden usar:
 *  - repertoire: lista fija y permanente (Sorcerer, Bard)
 *  - spellbook:  libro propio del que se prepara cada día (Wizard)
 *  - list:       toda la lista de la tradición (Cleric, Druid)
 */
export type SpellSource = 'repertoire' | 'spellbook' | 'list';

export interface CasterConfig {
  kind: CasterKind;
  preparation: Preparation;
  source: SpellSource;
  /** Fija salvo en Sorcerer, que la hereda del linaje. */
  tradition: string | null;
  /** Cleric: slots extra de heal/harm al rango más alto (1 + mod de Carisma). */
  divineFont?: boolean;
  /** Wizard, Witch y Magus: el libro (o el familiar) arranca con esto y suma 2 por nivel. */
  spellbookStart?: { cantrips: number; spells: number };
  /** El Psychic conoce 3 cantrips, no 5. */
  cantrips?: number;
  /** Wizard: la escuela arcana da un slot extra por rango. */
  arcaneSchool?: boolean;
}

/**
 * Clases lanzadoras implementadas. Verificado en las páginas Legacy de AoN:
 *   Sorcerer https://2e.aonprd.com/Classes.aspx?ID=11&NoRedirect=1  (3->4 slots)
 *   Bard     https://2e.aonprd.com/Classes.aspx?ID=3&NoRedirect=1   (2->3)
 *   Wizard   https://2e.aonprd.com/Classes.aspx?ID=12&NoRedirect=1  (2->3, libro 10 cantrips + 5 de rango 1)
 *   Cleric   https://2e.aonprd.com/Classes.aspx?ID=5&NoRedirect=1   (2->3, divine font = 1 + Cha)
 */
export const CASTERS: Record<string, CasterConfig> = {
  sorcerer: { kind: 'sorcerer', preparation: 'spontaneous', source: 'repertoire', tradition: null },
  bard: { kind: 'standard', preparation: 'spontaneous', source: 'repertoire', tradition: 'occult' },
  wizard: {
    kind: 'standard',
    preparation: 'prepared',
    source: 'spellbook',
    tradition: 'arcane',
    spellbookStart: { cantrips: 10, spells: 5 },
    arcaneSchool: true,
  },
  cleric: { kind: 'standard', preparation: 'prepared', source: 'list', tradition: 'divine', divineFont: true },
  druid: { kind: 'standard', preparation: 'prepared', source: 'list', tradition: 'primal' },

  // Verificadas también en AoN Legacy (Classes.aspx?ID=<n>&NoRedirect=1):
  //   Oracle 14 · Witch 16 · Magus 17 · Psychic 21
  oracle: { kind: 'standard', preparation: 'spontaneous', source: 'repertoire', tradition: 'divine' },
  witch: {
    // La tradición la define el patrón elegido, igual que el linaje en el Sorcerer.
    // Los hechizos los sabe el familiar, pero mecánicamente funciona como un libro.
    kind: 'standard',
    preparation: 'prepared',
    source: 'spellbook',
    tradition: null,
    spellbookStart: { cantrips: 10, spells: 5 },
  },
  magus: {
    kind: 'limited',
    preparation: 'prepared',
    source: 'spellbook',
    tradition: 'arcane',
    spellbookStart: { cantrips: 8, spells: 4 },
  },
  psychic: { kind: 'limited', preparation: 'spontaneous', source: 'repertoire', tradition: 'occult', cantrips: 3 },
};

/** @deprecated se mantiene para no romper llamadas viejas; usar CASTERS. */
export const CASTER_KIND: Record<string, CasterKind> = Object.fromEntries(
  Object.entries(CASTERS).map(([slug, c]) => [slug, c.kind]),
);

/** El libro del Wizard suma 2 hechizos por nivel además de los iniciales. */
export const spellbookSize = (config: CasterConfig, level: number) =>
  config.spellbookStart ? config.spellbookStart.spells + (level - 1) * 2 : 0;

export const cantripsKnownFor = (config: CasterConfig) =>
  config.spellbookStart?.cantrips ?? config.cantrips ?? CANTRIPS_KNOWN;

/** Cuántos cantrips se pueden tener listos por día (el libro guarda más de los que preparás). */
export const cantripsPerDay = (config: CasterConfig) => config.cantrips ?? CANTRIPS_KNOWN;

/** Todo caster completo conoce 5 cantrips. */
export const CANTRIPS_KNOWN = 5;

export const MAX_SPELL_RANK = 10;

export interface SpellSlot {
  rank: number;
  slots: number;
}

/**
 * Slots por rango a un nivel dado.
 *
 * El patrón es uniforme: el rango R se desbloquea al nivel 2R-1 con un slot menos
 * del máximo, y llega al máximo al nivel siguiente. El rango 10 es la excepción:
 * un único slot, y recién a nivel 19.
 *   Bard:     2 -> 3     Sorcerer: 3 -> 4
 */
export function spellSlots(kind: CasterKind, level: number): SpellSlot[] {
  const full = kind === 'sorcerer' ? 4 : kind === 'limited' ? 2 : 3;
  const out: SpellSlot[] = [];

  for (let rank = 1; rank <= 9; rank++) {
    const unlockedAt = rank * 2 - 1;
    if (level < unlockedAt) break;
    out.push({ rank, slots: level > unlockedAt ? full : full - 1 });
  }

  // El rango 10 es de casters completos: Magus y Psychic no llegan.
  if (level >= 19 && kind !== 'limited') out.push({ rank: 10, slots: 1 });
  return out;
}

/**
 * El repertorio de un espontáneo crece a la par de los slots: cada slot nuevo trae
 * un hechizo nuevo al repertorio.
 */
export const repertoireSize = (kind: CasterKind, level: number): SpellSlot[] => spellSlots(kind, level);

export const maxSpellRank = (kind: CasterKind, level: number): number =>
  spellSlots(kind, level).reduce((max, s) => Math.max(max, s.rank), 0);

/** Los cantrips se lanzan siempre al rango de la mitad de tu nivel, redondeando arriba. */
export const cantripRank = (level: number): number => Math.max(1, Math.ceil(level / 2));

// ------------------------------------------------------------------- daño

export interface ScaledDamage {
  /** Fórmula ya escalada al rango con el que se lanza: "8d6". */
  formula: string;
  type: string;
}

/** Suma dos fórmulas del mismo dado: 6d6 + 2d6 -> 8d6. Si no coinciden, las concatena. */
function addDice(base: string, extra: string, times: number): string {
  if (times <= 0) return base;
  const b = base.match(/^(\d+)d(\d+)$/);
  const e = extra.match(/^(\d+)d(\d+)$/);
  if (b && e && b[2] === e[2]) return `${Number(b[1]) + Number(e[1]) * times}d${b[2]}`;
  return `${base} + ${times}×(${extra})`;
}

/**
 * Daño de un hechizo lanzado a un rango dado, aplicando su heightening.
 * `interval`: suma el bloque cada N rangos por encima del rango base.
 * `fixed`: el dataset lista el daño rango por rango.
 */
export function scaledDamage(spell: Spell, castRank: number): ScaledDamage[] {
  const baseRank = spell.traits.includes('cantrip') ? 1 : spell.level;
  const steps = Math.max(0, castRank - baseRank);
  const heightening = spell.heightening;

  return spell.damage.map((d, index) => {
    if (!heightening) return { formula: d.formula, type: d.type };

    if (heightening.type === 'interval' && heightening.interval) {
      const extra = heightening.damage?.[String(index)];
      const times = Math.floor(steps / heightening.interval);
      return { formula: extra ? addDice(d.formula, extra, times) : d.formula, type: d.type };
    }

    // Los cantrips escalan por nivel, no por rango elegido, pero el dataset los
    // modela igual con un intervalo de 1.
    return { formula: d.formula, type: d.type };
  });
}

// --------------------------------------------------------------- proficiencia

export interface SpellcastingEntry {
  className: string;
  tradition: string | null;
  kind: CasterKind;
  keyAbility: Ability;
  proficiency: ProficiencyRank;
  slots: SpellSlot[];
  maxRank: number;
  cantripRank: number;
}

/**
 * ¿A qué rangos se puede lanzar este hechizo?
 *
 * Un lanzador espontáneo tiene el repertorio clavado: un hechizo se lanza al rango
 * con el que lo aprendiste. La excepción son los signature spells (uno por rango,
 * desde nivel 3), que se pueden heightear a cualquier rango que puedas pagar.
 */
export function castableRanks(options: {
  spellRank: number;
  isCantrip: boolean;
  isSignature: boolean;
  maxRank: number;
  cantripRank: number;
}): number[] {
  if (options.isCantrip) return [options.cantripRank];
  if (!options.isSignature) return [options.spellRank];

  const ranks: number[] = [];
  for (let rank = options.spellRank; rank <= options.maxRank; rank++) ranks.push(rank);
  return ranks;
}
