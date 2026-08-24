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
  /** El alineamiento del personaje en dos letras ("LG", "NE"), o null. */
  alignment?: string | null;
  /** `normal`, `low-light-vision` o `darkvision`. */
  vision?: string;
  /**
   * Todo lo nombrable del dataset —dotes y rasgos—: distingue "algo del juego
   * que te falta" de "texto que no entiendo".
   */
  knownNames: Set<string>;
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

  /*
   * "Druid Dedication or Wizard Dedication", "harmful font or healing font".
   *
   * Alcanza con cumplir una. Si ninguna se cumple pero alguna no se entiende,
   * el resultado es 'unknown' y no 'unmet': decir que no cumplís algo que no
   * supiste leer es peor que no decir nada.
   */
  if (/ or /.test(text) && !/^(untrained|trained|expert|master|legendary) in /.test(text)) {
    const partes = text.split(/ or /).map((p) => evaluatePrerequisite(p, ctx));
    if (partes.includes('met')) return 'met';
    return partes.includes('unknown') ? 'unknown' : 'unmet';
  }

  /*
   * Visión.
   *
   * Va antes de la búsqueda por nombre y no después: "Darkvision" TAMBIÉN es un
   * rasgo de ancestría con nombre propio, así que un enano —que la tiene por
   * ancestría, no como rasgo listado— salía como que no la cumple. Un falso
   * "no cumplís" es el peor resultado posible acá: manda al jugador a buscar
   * algo que ya tiene.
   */
  if (text === 'darkvision' || text === 'low-light vision') {
    const propia = ctx.vision ?? 'normal';
    if (propia === 'darkvision') return 'met'; // la oscuridad cubre a la penumbra
    if (text === 'low-light vision') return propia === 'low-light-vision' ? 'met' : 'unmet';
    return 'unmet';
  }

  /*
   * Alineamiento: "evil alignment", "chaotic good alignment", y los tenets de
   * Champion, que son el alineamiento con otro nombre.
   */
  const alineamiento = text.match(/^(?:tenets of (\w+)|([\w\s]+?) alignment)$/);
  if (alineamiento) {
    if (!ctx.alignment) return 'unknown';
    const pedido = (alineamiento[1] ?? alineamiento[2]).trim();
    const letras = ctx.alignment.toUpperCase();
    const INICIALES: Record<string, string> = {
      lawful: 'L', chaotic: 'C', good: 'G', evil: 'E', neutral: 'N',
    };
    const partes = pedido.split(' ');
    // Todas las palabras pedidas tienen que estar en las letras del PJ.
    const ok = partes.every((palabra) => {
      const inicial = INICIALES[palabra];
      if (!inicial) return false;
      // "neutral" puede ser cualquiera de las dos posiciones.
      return letras.includes(inicial);
    });
    if (partes.some((p) => !INICIALES[p])) return 'unknown';
    return ok ? 'met' : 'unmet';
  }

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
  if (ctx.knownNames.has(text)) return 'unmet';

  return 'unknown';
}
