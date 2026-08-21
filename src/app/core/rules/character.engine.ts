import type { AbilityBoosts, CharacterBuild, CharacterState, CustomItem } from '../models/character.model';
import type {
  Ability,
  Ancestry,
  Background,
  ClassFeature,
  Equipment,
  Feat,
  Heritage,
  Deity,
  Pf2Class,
  ProficiencyRank,
  RuleElement,
} from '../models/content.model';
import { ABILITIES, ABILITY_NAMES, PROFICIENCY_NAMES } from '../models/content.model';
import { conditionModifiers } from './conditions';
import { effectModifiers, type Effect } from './efectos';
import { eleccionesAbiertasDe, eleccionesDe, textoDeEleccion, type EleccionDeRasgo } from './elecciones';
import { RAGE_SLUG, rageDamage, rageSheet, type RageSheet } from './rabia';
import { buildStat, mod, type Modifier, type Stat } from './modifiers';
import { evaluatePrerequisite, type PrerequisiteStatus } from './prerequisites';
import {
  CASTERS,
  cantripRank,
  cantripsKnownFor,
  maxSpellRank,
  spellSlots,
  spellbookSize,
  type CasterConfig,
  type SpellcastingEntry,
} from './spellcasting';
import { languageSlots } from './languages';
import { PANACHE_SPEED_BONUS, preciseStrike, vivaciousSpeed } from './panache';
import { pendingSlots } from './progression';
import { STARTING_MONEY_CP, formatCp, priceToCp } from './money';
import {
  SIN_RUNAS,
  bonosCondicionalesDeRunas,
  dadosPorStriking,
  danoCondicionalDeRunas,
  danoDeRunas,
  resumenDeRunas,
} from './runas';
import { PROFICIENCY_BONUS, SKILLS, abilityMod, applyBoost } from './tables';

/**
 * El primer objeto equipado que cumpla el filtro, con las modificaciones del
 * master ya aplicadas encima.
 *
 * Existe porque la armadura y el escudo se buscaban directo en el catálogo y se
 * perdía todo lo que el master hubiera cambiado.
 */
function equipadoConCustom(
  build: CharacterBuild,
  content: ContentIndex,
  filtro: (eq: Equipment) => boolean,
): { equipment: Equipment; custom: CustomItem | undefined; inventoryIndex: number } | null {
  for (const [inventoryIndex, item] of build.inventory.entries()) {
    if (!item.equipped) continue;

    const base = content.equipmentById.get(item.id);
    const snapshot = item.custom?.base;
    if (!base && !snapshot) continue;

    const equipment: Equipment = base
      ? { ...base }
      : ({
          ...VACIO,
          id: item.id,
          name: snapshot!.name,
          traits: [...snapshot!.traits],
          damage: snapshot!.damage,
          range: snapshot!.range,
          category: snapshot!.category,
          group: snapshot!.group,
          acBonus: snapshot!.acBonus ?? null,
          dexCap: snapshot!.dexCap ?? null,
          checkPenalty: snapshot!.checkPenalty ?? null,
          speedPenalty: snapshot!.speedPenalty ?? null,
          strength: snapshot!.strength ?? null,
          hardness: snapshot!.hardness ?? null,
          maxHp: snapshot!.maxHp ?? null,
          type: snapshot!.category === 'shield' ? 'shield' : 'armor',
          runes: SIN_RUNAS,
      material: null,
    } as Equipment);

    const custom = item.custom;
    if (custom) {
      if (custom.name) equipment.name = custom.name;
      if (custom.traits?.length) equipment.traits = [...equipment.traits, ...custom.traits];
      // Un 0 es un valor válido (una armadura sin penalidad), así que se compara
      // contra undefined y no por truthiness.
      if (custom.acBonus !== undefined) equipment.acBonus = custom.acBonus;
      if (custom.dexCap !== undefined) equipment.dexCap = custom.dexCap;
      if (custom.checkPenalty !== undefined) equipment.checkPenalty = custom.checkPenalty;
      if (custom.speedPenalty !== undefined) equipment.speedPenalty = custom.speedPenalty;
      if (custom.strength !== undefined) equipment.strength = custom.strength;
      if (custom.hardness !== undefined) equipment.hardness = custom.hardness;
      if (custom.maxHp !== undefined) equipment.maxHp = custom.maxHp;
    }

    if (!filtro(equipment)) continue;
    return { equipment, custom, inventoryIndex };
  }
  return null;
}

/** Molde de un objeto vacío, para armar uno inventado sin repetir 20 nulls. */
const VACIO = {
  id: '',
  slug: '',
  name: '',
  traits: [] as string[],
  tags: [] as string[],
  rarity: 'common',
  source: 'Personalizada',
  description: '',
  type: 'armor',
  level: 0,
  price: null,
  bulk: 0,
  usage: '',
  damage: null,
  range: null,
  reload: null,
  category: null,
  group: null,
  acBonus: null,
  dexCap: null,
  strength: null,
  checkPenalty: null,
  speedPenalty: null,
  hardness: null,
  maxHp: null,
};

/**
 * Lo que el garbo le suma a la velocidad.
 *
 * Vivacious Speed **reemplaza** el +5 base, no se suma: a nivel 3 son +10 con
 * garbo, no +15. Y sin garbo queda la mitad, que es el único bonus que se aplica
 * cuando el interruptor está apagado.
 */
function bonusDeGarbo(panache: CharacterSheet['panache']): Modifier[] {
  if (!panache) return [];

  if (panache.vivacious) {
    const valor = panache.active ? panache.vivacious.conGarbo : panache.vivacious.sinGarbo;
    return valor ? [mod(panache.active ? 'Vivacious Speed (con garbo)' : 'Vivacious Speed', valor, 'status')] : [];
  }

  return panache.active ? [mod('Garbo', PANACHE_SPEED_BONUS, 'status')] : [];
}

/** Contenido ya indexado que el motor necesita para resolver referencias. */
export interface ContentIndex {
  classBySlug: Map<string, Pf2Class>;
  ancestryBySlug: Map<string, Ancestry>;
  heritageById: Map<string, Heritage>;
  backgroundBySlug: Map<string, Background>;
  featById: Map<string, Feat>;
  featureById: Map<string, ClassFeature>;
  equipmentById: Map<string, Equipment>;
  /** Efectos activables (rabia, garbo, conjuros con duracion). Ver rules/efectos.ts. */
  effectById: Map<string, Effect>;
  /** Acciones: los deeds que otorgan las vías del Gunslinger viven acá. */
  actionById: Map<string, ClassFeature>;
  /** Nombres de todas las dotes en minúscula; se usa para evaluar prerrequisitos. */
  featNames: Set<string>;
  deityById: Map<string, Deity>;
}

export interface Proficiencies {
  perception: ProficiencyRank;
  saves: Record<'fortitude' | 'reflex' | 'will', ProficiencyRank>;
  /**
   * Mapa abierto, no cuatro casillas fijas: el dataset usa claves con nombre propio
   * como `simple-firearms-crossbows` (Gunslinger) ademas de simple/martial/advanced/unarmed.
   */
  attacks: Record<string, ProficiencyRank>;
  defenses: Record<'unarmored' | 'light' | 'medium' | 'heavy', ProficiencyRank>;
  skills: Record<string, ProficiencyRank>;
  /** Habilidades libres que se deben por entrenamiento repetido. */
  skillsLibres?: SkillLibre[];
  /** Skills que entrena algo FIJO (clase, trasfondo, herencia), y de dónde. */
  skillsFijas?: Record<string, string>;
  /** Aumentos repetidos de experto o mas, que se pierden. */
  skillsRedundantes?: string[];
  /** Lores: clave `lore:<slug>`, con su nombre para mostrar. */
  lores: Record<string, { name: string; rank: ProficiencyRank }>;
  classDC: ProficiencyRank;
  /** Proficiencia de conjuro; el dataset la sube con el path proficiencies.spellcasting. */
  spellcasting: ProficiencyRank;
}

export interface StrikeSheet {
  name: string;
  /**
   * Dados que cambian el critico. Verificado en la lista LEGACY de weapon traits
   * (Roll20 compendium, "Weapon Traits (Legacy)"):
   *   fatal dX  — en un critico el dado del arma pasa a dX y se suma un dado extra de dX
   *   deadly dX — en un critico se suma un dado de dX, tirado DESPUES de duplicar
   * En los dos casos el dado extra NO se duplica.
   */
  fatal: string | null;
  deadly: string | null;
  /** Posicion en build.inventory: la UI la usa para editar el arma. -1 si es el puño. */
  inventoryIndex: number;
  /** Si es un ataque natural (garras, colmillos…), su id en build.naturalWeapons. */
  naturalId: string | null;
  /** La hoja separa melee y ranged en dos secciones. */
  ranged: boolean;
  unarmed: boolean;
  /** Notas del master que la app no calcula, solo muestra. */
  notes: string | null;
  custom: boolean;
  attack: Stat;
  /** Dados fijos del arma (1d8, 2d6…); los modificadores van en `damage`. */
  damageDice: string;
  damage: Stat;
  damageType: string;
  proficiency: ProficiencyRank;
  /** Daño de runas que aplica siempre: va aparte, no se suma al dado del arma. */
  extraDamage: { formula: string; type: string; source: string }[];
  /** Daño que solo vale contra cierto objetivo: se muestra, no se suma. */
  conditionalDamage: { formula: string; type: string; contra: string; source: string }[];
  /** Bonus de runa que la hoja no puede evaluar sola (Slick, Antimagic…). */
  runeNotes: { source: string; texto: string }[];
  /** "+1 striking flaming", para mostrar de dónde salen los números. */
  runas: string;
  /** Clave con la que se pisa el rango a mano (ver proficiencyOverrides). */
  profKey: string;
  traits: string[];
}

/**
 * Una habilidad libre que el personaje se ganó porque algo lo entrenó en una
 * que ya tenía. `elegida` es null mientras no la resuelva.
 */
export interface SkillLibre {
  clave: string;
  motivo: string;
  elegida?: string;
}

export interface CharacterSheet {
  name: string;
  level: number;
  className: string;
  ancestryName: string;
  heritageName: string;
  backgroundName: string;
  size: string;
  speed: Stat;
  abilityScores: Record<Ability, number>;
  abilityMods: Record<Ability, number>;
  /**
   * Tirada de atributo "en crudo": solo el modificador y las condiciones.
   * No lleva nivel ni proficiencia, a diferencia de skills y salvaciones.
   */
  abilityChecks: Record<Ability, Stat>;
  maxHp: Stat;
  ac: Stat;
  /** Con qué proficiencia se está calculando la CA, y cuánto vale hoy. */
  acProficiency: { category: string; rank: ProficiencyRank };
  perception: Stat;
  saves: Record<'fortitude' | 'reflex' | 'will', Stat>;
  classDC: Stat;
  skills: { slug: string; name: string; rank: ProficiencyRank; stat: Stat }[];
  /**
   * Rasgos activos que te hacen elegir entre objetos (el Clan Dagger de los
   * enanos: daga o pistola). Cada opción otorga un objeto del catálogo.
   */
  eleccionesDeRasgos: EleccionDeRasgo[];
  /**
   * Habilidades libres ganadas por entrenamiento repetido, con el porqué.
   * Ver la regla en computeProficiencies.
   */
  skillsLibres: SkillLibre[];
  /**
   * Skills que ya entrena algo que NO podés cambiar, con su origen. Sirve para
   * avisar antes de elegir la de la herencia: si cae en una de estas, la
   * elección se desperdicia.
   */
  skillsFijas: Record<string, string>;
  /** Habilidades libres de clase: cuántas te tocan y cuántas usaste. */
  skillsDeClase: { total: number; usadas: number };
  /** Lores (Hunting Lore, Warfare Lore…): siempre basados en Inteligencia. */
  lores: { slug: string; name: string; rank: ProficiencyRank; stat: Stat }[];
  /**
   * Iniciativa. No existe un modificador propio: se tira con Percepcion por defecto,
   * o con una habilidad si lo que estabas haciendo lo justifica (Stealth si venias
   * evitando ser visto, Deception si distraias, etc.) — es lista abierta, la decide
   * el master. Se usa el modificador COMPLETO de esa estadistica.
   *
   * Los bonus "a la iniciativa" en general (Incredible Initiative) valen siempre; los
   * que dicen "Perception checks for initiative" (Battlefield Surveyor) se pierden si
   * tiras con una habilidad. El dataset distingue los dos con `predicate: ["perception"]`.
   */
  initiative: {
    options: { key: string; label: string; stat: Stat }[];
    /** Bonus con condiciones que la app no sabe evaluar: se muestran, no se aplican. */
    conditional: { source: string; value: number; predicate: string[] }[];
  };
  /** Presupuesto de creacion: lo que cuesta el equipo elegido contra los 15 gp iniciales. */
  money: { startingCp: number; spentCp: number; remainingCp: number };
  /**
   * Carga. Verificado en AoN Legacy (Bulk Limits, CRB pg. 272):
   * hasta 5 + Fuerza sin penalidad, y no podes cargar mas de 10 + Fuerza.
   * Los objetos "L" (livianos) valen 0.1 cada uno, como los trae el dataset.
   */
  bulk: { carried: number; encumberedAt: number; max: number; encumbered: boolean; ignorado: boolean };
  /** Vision de la ancestria: normal, low-light-vision o darkvision. */
  vision: string;
  /**
   * Garbo del Swashbuckler, o null si el personaje no lo tiene. Es un estado
   * binario: cambia el daño de Precise Strike y la velocidad.
   */
  panache: {
    active: boolean;
    preciseStrike: { flat: number; finisherDice: number } | null;
    vivacious: { conGarbo: number; sinGarbo: number } | null;
  } | null;
  /** La furia del bárbaro, si está activa. Ver rules/rabia.ts. */
  rage: RageSheet | null;
  /**
   * Armadura equipada, con las modificaciones del master ya aplicadas. Se expone
   * entera (y no solo su efecto en la CA) porque la hoja la deja editar.
   */
  armor: {
    name: string;
    inventoryIndex: number;
    custom: boolean;
    category: string;
    acBonus: number;
    dexCap: number | null;
    checkPenalty: number;
    speedPenalty: number;
    strength: number | null;
    notes: string | null;
  } | null;
  /**
   * Escudo equipado. El bonus a la CA solo cuenta si esta ALZADO (Raise a Shield es
   * una accion), y no cuenta si esta roto. Verificado en la pagina de Shields de AoN:
   * "grants the shield's bonus to AC as a circumstance bonus until their next turn
   * starts" y "reduce the damage you take by an amount equal to the shield's Hardness.
   * Both you and the shield then take any remaining damage".
   * El Broken Threshold es la mitad de los HP.
   */
  shield: {
    name: string;
    inventoryIndex: number;
    custom: boolean;
    notes: string | null;
    acBonus: number;
    hardness: number;
    maxHp: number;
    brokenThreshold: number;
    currentHp: number;
    raised: boolean;
    broken: boolean;
  } | null;
  age: string;
  appearance: string;
  languages: {
    /** Los que da la ancestria: no se eligen. */
    fromAncestry: string[];
    chosen: string[];
    /** Cuantos puede elegir: modificador de Inteligencia + los extra de la ancestria. */
    slots: number;
  };
  strikes: StrikeSheet[];
  proficiencies: Proficiencies;
  /** Rasgos activos al nivel actual, con su origen para agruparlos en la hoja. */
  features: { name: string; level: number; id: string | null; source: FeatSource }[];
  feats: { name: string; level: number; slot: string; id: string; source: FeatSource }[];
  /** null si la clase no lanza conjuros. */
  spellcasting: SpellcastingSheet | null;
  /** Focus spells: existen aunque la clase no tenga slots (Monk, Champion). */
  focus: FocusSheet | null;
  /**
   * Focus spells que nombra el rasgo elegido (el linaje, por ejemplo). Va fuera de
   * `focus` a proposito: hacen falta justo cuando todavia no tenes ninguno.
   */
  focusSuggestions: string[];
  deity: Deity | null;
  alignment: string | null;
  /** Problemas detectados: slots sin elegir, prerequisitos no cumplidos (advertencia). */
  warnings: Warning[];
}

export interface SpellcastingSheet extends SpellcastingEntry {
  attack: Stat;
  dc: Stat;
  cantripsKnown: number;
  /** El rasgo Signature Spells llega a nivel 3; antes no se puede heightear nada. */
  signatureSpells: boolean;
  config: CasterConfig;
  /** Wizard: cuántos hechizos debería tener el libro a este nivel. */
  spellbookSize: number;
  /** Cleric: slots extra de heal/harm al rango más alto (1 + mod de Carisma). */
  divineFontSlots: number;
  /** Wizard especialista: un slot extra por rango, solo de su escuela. */
  arcaneSchool: string | null;
}

/**
 * Focus spells. Reglas verificadas en la pagina LEGACY de Roll20 ("Focus Spells (Legacy)"):
 *   - El pool arranca en 1 con el primer focus spell y su maximo es la cantidad que
 *     conoces, o 3, lo que sea menor.
 *   - Refocus (10 minutos) devuelve 1 punto; la preparacion diaria los devuelve todos.
 *   - Se heightean solos a la mitad de tu nivel, redondeando arriba, como los cantrips.
 */
export interface FocusSheet {
  pool: number;
  rank: number;
  attack: Stat;
  dc: Stat;
  /** Los que nombra el linaje elegido, para ofrecerlos primero. */
  suggested: string[];
}

/** Como agrupa la hoja los rasgos y dotes. */
export type FeatSource = 'ancestry' | 'class' | 'skill' | 'general' | 'bonus' | 'background';

const FEAT_SOURCE_BY_SLOT: Record<string, FeatSource> = {
  classFeat: 'class',
  ancestryFeat: 'ancestry',
  skillFeat: 'skill',
  generalFeat: 'general',
  bonusFeat: 'bonus',
};

export interface Warning {
  /**
   * Id estable: sobrevive a recalcular la hoja, asi el usuario puede marcarla como
   * resuelta y que no vuelva a aparecer.
   */
  id: string;
  text: string;
  kind: 'prerequisite' | 'build';
  /** `unmet` = sabemos que no se cumple; `unknown` = no se pudo evaluar el texto. */
  status: PrerequisiteStatus;
  /** El usuario la marcó como resuelta. */
  acknowledged: boolean;
}

const upgrade = (current: ProficiencyRank, next: number): ProficiencyRank =>
  (next > current ? next : current) as ProficiencyRank;

/** Se exporta para que la hoja arme las mismas claves y no se desincronicen. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Claves de proficiencia que le aplican a un arma, de la mas especifica a la mas general.
 * Una pistola de chispa (simple + grupo firearm) mira `simple-firearms-crossbows`,
 * `simple-firearms` y `simple`, y se queda con el mejor rango que tenga el personaje.
 */
export function attackProficiencyKeys(weapon: Pick<Equipment, 'category' | 'group' | 'traits' | 'slug'>): string[] {
  const category = weapon.category ?? 'simple';
  const keys: string[] = [];

  if (weapon.group === 'firearm' || weapon.group === 'crossbow' || weapon.group === 'bow') {
    const family = weapon.group === 'firearm' ? 'firearms' : 'crossbows';
    keys.push(`${category}-firearms-crossbows`, `${category}-${family}`);
  }
  // El arma concreta va primero: es lo que usa "el arma favorita de tu deidad".
  keys.unshift(`weapon:${weapon.slug}`);
  keys.push(category);
  return keys;
}

const rankFor = (prof: Proficiencies, keys: string[]): ProficiencyRank =>
  keys.reduce<ProficiencyRank>((best, key) => upgrade(best, prof.attacks[key] ?? 0), 0);

/**
 * Resuelve los GrantItem de un item: lo que otorga puede vivir en cualquiera de los
 * tres packs (rasgos, acciones o dotes). Una dedication de arquetipo, por ejemplo,
 * otorga un rasgo de clase (Infused Reagents) y una dote (Alchemical Crafting).
 */
function resolveGrants(
  items: { id?: string; rules?: RuleElement[] }[],
  content: ContentIndex,
  elecciones: Record<string, string> = {},
): ClassFeature[] {
  // El pack a veces repite el mismo grant (Anvil Dwarf trae Specialty Crafting
  // dos veces): se otorga una sola.
  const vistos = new Set<string>();
  const resueltos = items.flatMap((item) =>
    (item.rules ?? [])
      .filter((r) => r.key === 'GrantItem' && r.id && cumpleEleccion(r, item, elecciones))
      .map(
        (r) =>
          content.featureById.get(r.id!) ??
          content.actionById.get(r.id!) ??
          (content.featById.get(r.id!) as unknown as ClassFeature | undefined),
      )
      .filter((f): f is ClassFeature => !!f),
  );

  return resueltos.filter((f) => {
    if (vistos.has(f.id)) return false;
    vistos.add(f.id);
    return true;
  });
}

/**
 * El arma que otorga una dote, si el grant no apunta directo al catálogo.
 *
 * Foundry encadena: el Clan Dagger otorga la dote "Clan Pistol", y ESA otorga
 * la pistola. Un solo salto alcanza para todos los casos del pack.
 */
function equipoDeUnPaso(id: string, content: ContentIndex): Equipment | undefined {
  const intermedio = content.featById.get(id) ?? content.featureById.get(id);
  for (const regla of intermedio?.rules ?? []) {
    if (regla.key !== 'GrantItem' || !regla.id) continue;
    const item = content.equipmentById.get(regla.id);
    if (item) return item;
  }
  return undefined;
}

/**
 * Un GrantItem predicado se aplica solo si coincide con lo elegido en el
 * ChoiceSet del mismo rasgo.
 *
 * El Clan Dagger de los enanos trae DOS grants —la daga y la pistola— cada uno
 * predicado sobre la elección. Sin mirar el predicado se otorgaban los dos.
 * Mientras no haya elección, no se otorga ninguno: es mejor que falte a que
 * aparezcan las dos armas.
 */
function cumpleEleccion(
  regla: RuleElement,
  item: { id?: string; rules?: RuleElement[] },
  elecciones: Record<string, string>,
): boolean {
  const pred = regla.predicate ?? [];
  if (!pred.length) return true;

  /*
   * Un predicado no siempre habla de una elección: Way of the Drifter tiene sus
   * grants predicados sobre `class:gunslinger`, que no es algo que se elija. Se
   * mira SOLO cuando el rasgo trae su propio ChoiceSet y el predicado nombra una
   * de sus opciones; el resto pasa como antes.
   */
  const opciones = (item.rules ?? [])
    .filter((r) => r.key === 'ChoiceSet')
    .flatMap((r) => (r.choices ?? []).map((c) => c.id));
  const esDeLaEleccion = pred.some((p) => opciones.includes(p));
  if (!esDeLaEleccion) return true;

  const elegido = item.id ? elecciones[item.id] : undefined;
  return !!elegido && pred.includes(elegido);
}

/**
 * Modificadores de dano que los rasgos y dotes activos aplican a un arma concreta.
 * El dataset los declara con selectores tipo `firearm-weapon-group-damage`.
 */
function damageBonuses(
  features: { name: string; rules?: RuleElement[] }[],
  feats: { name: string; rules?: RuleElement[] }[],
  weapon: Equipment,
): Modifier[] {
  const selectors = new Set(['damage', 'strike-damage']);
  if (weapon.group) selectors.add(`${weapon.group}-weapon-group-damage`);

  const out: Modifier[] = [];
  for (const item of [...features, ...feats]) {
    for (const rule of item.rules ?? []) {
      if (rule.key !== 'FlatModifier' || !rule.selector || rule.value == null) continue;
      if (!selectors.has(rule.selector)) continue;
      out.push(mod(item.name, rule.value, (rule.type ?? 'untyped') as Modifier['type']));
    }
  }
  return out;
}

/**
 * Bonus de proficiencia. En PF2e solo se suma el nivel si estas al menos entrenado.
 * Devuelve dos modificadores separados para que el breakdown lo muestre desglosado.
 */
function proficiencyMods(rank: ProficiencyRank, level: number, label: string): Modifier[] {
  if (rank === 0) return [mod(`${label} (untrained)`, 0, 'proficiency')];
  return [
    mod(`${label} (${['', 'trained', 'expert', 'master', 'legendary'][rank]})`, PROFICIENCY_BONUS[rank], 'proficiency'),
    mod('Level', level, 'level'),
  ];
}

// ------------------------------------------------------------- ability scores

/**
 * Un "set" de boosts es una eleccion. Si trae un solo elemento es fijo;
 * si trae varios, el jugador elige uno (y la eleccion vive en build.abilityBoosts).
 */
function applyBoostSets(
  scores: Record<Ability, number>,
  sets: Ability[][],
  chosen: Ability[],
  warnings: string[],
  label: string,
) {
  let choiceIndex = 0;
  for (const set of sets) {
    if (set.length === 1) {
      scores[set[0]] = applyBoost(scores[set[0]]);
      continue;
    }
    const pick = chosen[choiceIndex++];
    if (!pick) {
      warnings.push(`Falta elegir un boost de ${label}.`);
      continue;
    }
    scores[pick] = applyBoost(scores[pick]);
  }
}

function computeAbilities(
  build: CharacterBuild,
  ancestry: Ancestry | undefined,
  background: Background | undefined,
  pf2class: Pf2Class | undefined,
  warnings: string[],
): Record<Ability, number> {
  const scores = Object.fromEntries(ABILITIES.map((a) => [a, 10])) as Record<Ability, number>;
  const boosts: AbilityBoosts = build.abilityBoosts;

  if (ancestry) {
    // Los flaws se aplican junto con los boosts de ancestria; primero para que
    // un boost posterior sobre el mismo atributo no se coma el -2.
    for (const set of ancestry.flaws) for (const flaw of set) scores[flaw] -= 2;
    applyBoostSets(scores, ancestry.boosts, boosts.ancestry, warnings, 'ancestría');
  }
  if (background) applyBoostSets(scores, background.boosts, boosts.background, warnings, 'trasfondo');

  if (pf2class) {
    const key = boosts.class[0] ?? (pf2class.keyAbility.length === 1 ? pf2class.keyAbility[0] : undefined);
    if (key) scores[key] = applyBoost(scores[key]);
    else warnings.push('Falta elegir el atributo clave de la clase.');
  }

  // 4 boosts libres en nivel 1 y en cada uno de 5/10/15/20.
  const freeLevels: [number, Ability[]][] = [
    [1, boosts.level1],
    [5, boosts.level5],
    [10, boosts.level10],
    [15, boosts.level15],
    [20, boosts.level20],
  ];
  for (const [lvl, picks] of freeLevels) {
    if (build.level < lvl) continue;
    for (const pick of picks) scores[pick] = applyBoost(scores[pick]);
    if (picks.length < 4) warnings.push(`Faltan ${4 - picks.length} boosts de atributo de nivel ${lvl}.`);
  }

  /*
   * Lo escrito a mano gana. Va al final para que pise el resultado de los
   * boosts, no para que los boosts se le sumen encima: si escribiste 14, querés
   * 14, no 14 más lo que traiga la ancestría.
   */
  for (const [ability, valor] of Object.entries(build.abilityOverrides ?? {})) {
    if (typeof valor === 'number' && Number.isFinite(valor)) scores[ability as Ability] = valor;
  }

  return scores;
}

// ------------------------------------------------------------- proficiencias

function computeProficiencies(
  build: CharacterBuild,
  pf2class: Pf2Class | undefined,
  background: Background | undefined,
  activeFeatures: ClassFeature[],
  chosenFeats: Feat[],
  // La herencia trae reglas propias, y el nivel hace falta para los rangos que
  // suben con el (Skilled Heritage pasa a experto en 5).
  heritage: Heritage | undefined,
  level: number,
): Proficiencies {
  const skills: Record<string, ProficiencyRank> = {};
  for (const s of SKILLS) skills[s.slug] = 0;

  /** Habilidades libres que se deben por entrenamiento repetido. */
  const skillsLibres: SkillLibre[] = [];
  /** Aumentos de experto o mas que cayeron repetidos y se pierden. */
  const redundantes: string[] = [];

  const prof: Proficiencies = {
    perception: pf2class?.perception ?? 0,
    saves: {
      fortitude: pf2class?.savingThrows.fortitude ?? 0,
      reflex: pf2class?.savingThrows.reflex ?? 0,
      will: pf2class?.savingThrows.will ?? 0,
    },
    attacks: {
      simple: pf2class?.attacks.simple ?? 0,
      martial: pf2class?.attacks.martial ?? 0,
      advanced: pf2class?.attacks.advanced ?? 0,
      unarmed: pf2class?.attacks.unarmed ?? 0,
    },
    lores: {},
    defenses: {
      unarmored: pf2class?.defenses.unarmored ?? 0,
      light: pf2class?.defenses.light ?? 0,
      medium: pf2class?.defenses.medium ?? 0,
      heavy: pf2class?.defenses.heavy ?? 0,
    },
    skills,
    classDC: pf2class ? 1 : 0,
    spellcasting: pf2class?.spellcasting === 1 ? 1 : 0,
  };

  // Proficiencia con nombre propio de la clase: "Simple Firearms, Martial Firearms"
  // se vuelve las claves simple-firearms / martial-firearms.
  const other = pf2class?.otherAttackProficiency;
  if (other?.name) {
    for (const part of other.name.split(',')) {
      const key = slug(part);
      if (key) prof.attacks[key] = upgrade(prof.attacks[key] ?? 0, other.rank);
    }
  }

  // Lores del trasfondo (ej. "Hunting" -> Hunting Lore, entrenado) y los que
  // el jugador agregó a mano: Additional Lore no trae NINGUNA regla en el pack,
  // el nombre del lore es texto libre que inventa el jugador.
  for (const lore of [...(background?.lore ?? []), ...(build.extraLores ?? [])]) {
    const limpio = lore.trim();
    if (!limpio) continue;
    const key = `lore:${slug(limpio)}`;
    prof.lores[key] = { name: limpio.replace(/\s*Lore$/i, ''), rank: upgrade(prof.lores[key]?.rank ?? 0, 1) };
  }

  /*
   * Entrenamiento repetido.
   *
   * Si algo te entrena en una skill que YA tenías entrenada, la regla dice que
   * elegís otra en su lugar. Pasa todo el tiempo: un humano con Skilled
   * Heritage que eligió Religion y después toma Acolyte, que también la da.
   *
   * Se juntan primero todos los orígenes FIJOS —los que no te dejan cambiarlos—
   * y recién ahí se ve cuáles cayeron repetidos. Los que sí se pueden elegir
   * (la skill de la herencia, las libres de clase) no generan una deuda: se
   * avisa al elegirlas y se cambia ahí, que es más directo.
   */
  /** El rango de una regla, que puede depender del nivel (Skilled Heritage). */
  const rangoDe = (rule: RuleElement): number | null => {
    if (rule.porNivel?.length) {
      // Vienen de mayor a menor: el primero que alcanzás es el que vale.
      return rule.porNivel.find((tramo) => level >= tramo.desde)?.value ?? null;
    }
    return rule.value ?? null;
  };

  /** Lo que otorga cada fuente: la skill, el rango, y de dónde sale. */
  const reglasDeSkill = (item: { id?: string; name: string; rules?: RuleElement[] }, elegidaDe?: string) =>
    (item.rules ?? [])
      .filter((r) => r.key === 'Proficiency' && r.path?.startsWith('skills.'))
      .map((r) => {
        /*
         * `skills.{elegida}` = la habilidad que elegiste PARA ESTE ítem. La
         * herencia la guarda aparte por historia (`heritageSkill`); el resto
         * —Skill Training, Specialty Crafting, las dedications— sale de
         * `featureChoices`, que es la caja general.
         */
        const suya = elegidaDe ?? (item.id ? build.featureChoices?.[item.id] : undefined);
        const slug = r.elegida || r.path === 'skills.{elegida}' ? suya : r.path!.split('.')[1];
        const rank = rangoDe(r);
        return slug && rank ? { slug, rank, origen: item.name } : null;
      })
      .filter((g): g is { slug: string; rank: number; origen: string } => !!g);

  const otorgadas = [
    ...(pf2class?.trainedSkills.fixed ?? []).map((slug) => ({ slug, rank: 1, origen: pf2class?.name ?? 'Clase' })),
    ...(background?.trainedSkills ?? []).map((slug) => ({ slug, rank: 1, origen: background?.name ?? 'Trasfondo' })),
    ...(heritage ? reglasDeSkill(heritage, build.heritageSkill ?? undefined) : []),
    ...activeFeatures.flatMap((f) => reglasDeSkill(f)),
    ...chosenFeats.flatMap((f) => reglasDeSkill(f)),
  ].filter((g) => g.slug in skills);

  /** Skill -> de dónde viene. Lo usa la UI para avisar antes de elegir. */
  const vistas = new Map<string, string>();
  const rangoOtorgado = new Map<string, number>();

  for (const { slug, rank, origen } of otorgadas) {
    const yaTiene = rangoOtorgado.get(slug) ?? 0;

    if (yaTiene >= rank) {
      if (rank === 1) {
        // Entrenado repetido: la regla te da una habilidad entrenada libre.
        skillsLibres.push({
          clave: `${slug}:${origen}`,
          motivo: `${origen} te entrena en ${slug}, que ya tenías por ${vistas.get(slug)}`,
        });
      } else {
        /*
         * Experto o superior repetido: NO da nada a cambio, el beneficio se
         * pierde. Lo unico que se puede hacer es reentrenar una de las dos
         * fuentes, y para eso hay que enterarse.
         */
        redundantes.push(
          `${origen} te sube ${slug} a ${PROFICIENCY_NAMES[rank]?.toLowerCase() ?? rank}, que ya tenías por ${vistas.get(slug)}: ese aumento se pierde, conviene reentrenar una de las dos.`,
        );
      }
      continue;
    }

    vistas.set(slug, origen);
    rangoOtorgado.set(slug, rank);
    skills[slug] = upgrade(skills[slug], rank as ProficiencyRank);
  }

  // Las libres que ya elegiste para saldar esas deudas.
  for (const libre of skillsLibres) {
    const elegida = build.skillReplacements?.[libre.clave];
    if (elegida && elegida in skills) {
      skills[elegida] = upgrade(skills[elegida], 1);
      libre.elegida = elegida;
    }
  }

  for (const slug of build.trainedSkills) if (slug in skills) skills[slug] = upgrade(skills[slug], 1);

  // Skill increases: +1 rango cada vez, hasta expert antes de nivel 7, etc.
  // (La regla de tope por nivel se muestra como advertencia, no se bloquea.)
  for (const choice of build.choices) {
    if (choice.slot !== 'skillIncrease' || !choice.skill || choice.level > build.level) continue;
    if (choice.skill.startsWith('lore:')) {
      const lore = prof.lores[choice.skill];
      if (lore) lore.rank = upgrade(lore.rank, lore.rank + 1);
    } else if (choice.skill in skills) {
      skills[choice.skill] = upgrade(skills[choice.skill], skills[choice.skill] + 1);
    }
  }

  // Upgrades declarados por los class features activos y por los feats tomados.
  // El dataset los trae como { key: 'Proficiency', path, value } (ver importador).
  const applyRules = (items: { rules?: RuleElement[] }[]) => {
    for (const item of items) {
      for (const rule of item.rules ?? []) {
        if (rule.key !== 'Proficiency' || !rule.path) continue;
        const valor = rangoDe(rule);
        if (valor == null) continue;

        /*
         * `skills.{elegida}` = la skill que elegiste para este item. Hoy solo la
         * usan las herencias (Skilled Heritage, Ancient Ash), que es de donde
         * sale `heritageSkill`.
         */
        // Idem: la skill elegida de la herencia ya paso por `otorgadas`.
        if (rule.elegida || rule.path === 'skills.{elegida}') continue;

        // Las skills NO se aplican acá: pasan por el pipeline de `otorgadas`,
        // que es el unico lugar donde se puede ver si cayeron repetidas.
        const parts = rule.path.split('.');
        if (parts[0] === 'skills') continue;
        if (parts[0] === 'perception') prof.perception = upgrade(prof.perception, valor);
        else if (parts[0] === 'saves' && parts[1] in prof.saves)
          prof.saves[parts[1] as keyof typeof prof.saves] = upgrade(prof.saves[parts[1] as keyof typeof prof.saves], valor);
        else if (parts[0] === 'proficiencies') {
          const [, group, key] = parts;
          // attacks es un mapa abierto: la clave puede no existir todavia
          // (ej. `simple-firearms-crossbows` del Gunslinger a nivel 5).
          if (group === 'attacks') prof.attacks[key] = upgrade(prof.attacks[key] ?? 0, valor);
          else if (group === 'defenses' && key in prof.defenses)
            prof.defenses[key as keyof typeof prof.defenses] = upgrade(prof.defenses[key as keyof typeof prof.defenses], valor);
          else if (group === 'classDCs') prof.classDC = upgrade(prof.classDC, valor);
          else if (group === 'spellcasting' || parts[1] === undefined)
            prof.spellcasting = upgrade(prof.spellcasting, valor);
          else if (group === 'saves' && key in prof.saves)
            prof.saves[key as keyof typeof prof.saves] = upgrade(prof.saves[key as keyof typeof prof.saves], valor);
        }
      }
    }
  };

  // La herencia trae sus propias reglas (Skilled Heritage, Winter Orc) y hasta
  // ahora no las miraba nadie.
  if (heritage) applyRules([heritage]);
  applyRules(activeFeatures);
  applyRules(chosenFeats);

  /*
   * Lo último: lo escrito a mano gana. Va después de todo a propósito, porque
   * upgrade() solo sube y acá hace falta poder bajar también.
   */
  const ovr = build.proficiencyOverrides;
  for (const [clave, rango] of Object.entries(ovr?.skills ?? {})) {
    if (clave.startsWith('lore:')) {
      const lore = prof.lores[clave];
      if (lore) lore.rank = rango;
    } else if (clave in skills) {
      skills[clave] = rango;
    }
  }
  for (const [clave, rango] of Object.entries(ovr?.defenses ?? {})) {
    if (clave in prof.defenses) prof.defenses[clave as keyof typeof prof.defenses] = rango;
  }

  prof.skillsLibres = skillsLibres;
  prof.skillsFijas = Object.fromEntries(vistas);
  prof.skillsRedundantes = redundantes;
  return prof;
}

// -------------------------------------------------------------------- motor

export function computeCharacter(
  build: CharacterBuild,
  state: CharacterState | null,
  content: ContentIndex,
): CharacterSheet {
  const warnings: string[] = [];

  /*
   * Todo lo que te esta pasando ahora mismo, en un solo lugar: las condiciones
   * que te pusieron y los efectos que prendiste (rabia, garbo, heroism).
   *
   * Los dos salen por el mismo caño porque son la misma cosa —algo temporal que
   * mueve numeros—, y asi cada formula del motor los recibe sin enterarse de
   * cual es cual.
   */
  const efectosActivos = (state?.effects ?? [])
    // La lista guarda lo que tenés a mano; solo cuenta lo que está prendido.
    .filter((e) => e.active !== false)
    .map((e) => content.effectById.get(e.id))
    .filter((e): e is Effect => !!e);

  const situacion = (selectores: string[]): Modifier[] => [
    ...conditionModifiers(state, selectores),
    ...effectModifiers(efectosActivos, selectores),
  ];
  const level = build.level;

  const pf2class = build.class ? content.classBySlug.get(build.class) : undefined;
  const ancestry = build.ancestry ? content.ancestryBySlug.get(build.ancestry) : undefined;
  const heritage = build.heritage ? content.heritageById.get(build.heritage) : undefined;
  const background = build.background ? content.backgroundBySlug.get(build.background) : undefined;

  if (!pf2class) warnings.push('Falta elegir una clase.');
  if (!ancestry) warnings.push('Falta elegir una ancestría.');
  if (!background) warnings.push('Falta elegir un trasfondo.');

  /*
   * Slots de dote/aumento de habilidad sin llenar, de cualquier nivel hasta el
   * actual. Esto es lo que hace seguro poder tocar el nivel a mano: si saltás
   * de 3 a 6 sin pasar por el asistente, acá aparece cada hueco que dejaste,
   * en vez de que la hoja se quede corta en silencio.
   */
  for (const slot of pendingSlots(build, pf2class)) {
    const donde =
      slot.slot === 'skillIncrease'
        ? 'se elige al subir de nivel'
        : 'se elige en Rasgos y dotes, o al subir de nivel';
    warnings.push(`Falta elegir: ${slot.label} (nivel ${slot.level}) — ${donde}.`);
  }

  // --- features otorgados automaticamente hasta el nivel actual
  // El origen se guarda desde el principio: la hoja agrupa los rasgos por de donde
  // vienen, y una vez mezclados en una sola lista ya no se puede saber.
  const granted: { name: string; level: number; id: string | null; source: FeatSource }[] = [
    ...(pf2class?.features ?? []).map((f) => ({ ...f, source: 'class' as FeatSource })),
    ...(ancestry?.features ?? []).map((f) => ({ ...f, source: 'ancestry' as FeatSource })),
  ].filter((f) => f.level <= level);
  const activeFeatures = granted
    .map((g) => (g.id ? content.featureById.get(g.id) : undefined))
    .filter((f): f is ClassFeature => !!f);

  // Rasgos elegidos por el jugador (Gunslinger's Way, instinct, racket...) y lo que
  // cada uno otorga a su vez (GrantItem: los deeds de la vía, por ejemplo).
  const chosenFeatures = build.choices
    .filter((c) => c.slot === 'classFeature' && c.id && c.level <= level)
    .map((c) => content.featureById.get(c.id!))
    .filter((f): f is ClassFeature => !!f);

  /*
   * Lo que otorgan la HERENCIA y el TRASFONDO, que hasta ahora no miraba nadie.
   *
   * Anvil Dwarf da Specialty Crafting y Deputy da Experienced Tracker: las dos
   * son dotes prometidas por escrito que simplemente no aparecían en la hoja.
   */
  const grantedByHeritage = heritage ? resolveGrants([heritage], content, build.featureChoices ?? {}) : [];
  const featsDelTrasfondo = (background?.grantedFeats ?? [])
    .map((g) => (g.id ? content.featById.get(g.id) : undefined))
    .filter((f): f is Feat => !!f);

  const grantedByChoice = resolveGrants(chosenFeatures, content, build.featureChoices ?? {});

  activeFeatures.push(...chosenFeatures, ...grantedByChoice);
  granted.push(
    ...[...chosenFeatures, ...grantedByChoice].map((f) => ({
      name: f.name,
      level: f.level ?? 1,
      id: f.id,
      source: 'class' as FeatSource,
    })),
  );

  activeFeatures.push(...grantedByHeritage);
  granted.push(
    ...grantedByHeritage.map((f) => ({ name: f.name, level: f.level ?? 1, id: f.id, source: 'ancestry' as FeatSource })),
  );
  granted.push(
    ...featsDelTrasfondo.map((f) => ({ name: f.name, level: f.level ?? 1, id: f.id, source: 'background' as FeatSource })),
  );

  // --- feats elegidos hasta el nivel actual
  // Las elecciones de rasgo (la vía, el instinct…) se listan aparte, no como dotes.
  const chosenFeatEntries = build.choices.filter(
    (c) => c.id && c.slot !== 'skillIncrease' && c.slot !== 'classFeature' && c.level <= level,
  );
  const chosenFeats = chosenFeatEntries
    .map((c) => content.featById.get(c.id!))
    .filter((f): f is Feat => !!f);

  // Las dotes tambien pueden otorgar items: una dedication de arquetipo trae consigo
  // rasgos y dotes (Alchemist Dedication -> Infused Reagents + Alchemical Crafting).
  const grantedByFeats = resolveGrants(chosenFeats, content);
  activeFeatures.push(...grantedByFeats);
  granted.push(
    ...grantedByFeats.map((f) => ({ name: f.name, level: f.level ?? 1, id: f.id, source: 'class' as FeatSource })),
  );

  /*
   * Rasgos que hacen elegir entre objetos. El Clan Dagger de los enanos es el
   * caso: un ChoiceSet con daga o pistola, y dos GrantItem predicados sobre esa
   * elección. Las opciones salen de los grants, así que el nombre que se
   * muestra es el del objeto de verdad y no la clave de Foundry.
   */
  /*
   * Todas las elecciones con consecuencia que abren los rasgos y las dotes.
   *
   * La detección vive en `rules/elecciones.ts`: el pack tiene 228 ChoiceSets y
   * la app resolvía dos a mano (la skill de la herencia y el arma del Clan
   * Dagger). El resto se perdían en silencio, que es lo peor que puede pasar:
   * el personaje sale mal y nadie se entera.
   */
  const buscadorDeObjetos = {
    equipo: (id: string) => content.equipmentById.get(id),
    equipoIndirecto: (id: string) => equipoDeUnPaso(id, content),
  };

  const eleccionesDeRasgos = [...activeFeatures, ...chosenFeats].flatMap((item) =>
    eleccionesDe(item, {
      elegidas: build.featureChoices ?? {},
      objetos: buscadorDeObjetos,
      dotesTomadas: chosenFeats,
    }),
  );

  /*
   * Las que la app no sabe ofrecer: se avisan igual. Un ítem que promete una
   * elección y no la pide es la peor de las dos opciones — el personaje sale
   * mal y no hay ninguna señal.
   */
  for (const item of [...activeFeatures, ...chosenFeats]) {
    for (const abierta of eleccionesAbiertasDe(item)) warnings.push(abierta.texto);
  }

  for (const eleccion of eleccionesDeRasgos) {
    if (!eleccion.elegido) {
      warnings.push(textoDeEleccion(eleccion));
      continue;
    }

    if (eleccion.tipo !== 'objeto') continue;

    /*
     * Elegida pero sin el arma en la mochila. Pasa cuando la decidió una dote
     * (Clan Pistol): el jugador nunca apretó nada, así que nadie la metió al
     * inventario. Se avisa en vez de meterla sola: el motor no toca el build.
     */
    const enMochila = build.inventory.some((i) => i.grantedBy === eleccion.itemId);
    const elegida = eleccion.opciones.find((o) => o.valor === eleccion.elegido);
    if (!enMochila) {
      warnings.push(
        `${elegida?.etiqueta ?? 'El arma'} te corresponde por ${eleccion.decididoPor ?? eleccion.itemName} y no está en el inventario: tocá su opción en Elecciones de rasgos.`,
      );
    }

    /*
     * El rasgo se llama "Clan Dagger" aunque hayas elegido la pistola: es el
     * nombre del RASGO en el pack, no el del arma. Se le agrega lo elegido para
     * que la lista de ancestría no diga una cosa y el inventario otra.
     */
    if (!elegida || elegida.etiqueta === eleccion.itemName) continue;
    const fila = granted.find((g) => g.id === eleccion.itemId);
    if (fila) fila.name = `${eleccion.itemName} (${elegida.etiqueta})`;
  }

  const deity = build.deity ? (content.deityById.get(build.deity) ?? null) : null;

  // Cleric y Champion dependen de la deidad: el dataset lo dice literalmente en la
  // clase, con `otherAttackProficiency: "Deity's favored weapon"`.
  const needsDeity = pf2class?.slug === 'cleric' || pf2class?.slug === 'champion';
  if (needsDeity && !deity) warnings.push('Falta elegir deidad: define tu arma favorita y tu divine font.');

  const scores = computeAbilities(build, ancestry, background, pf2class, warnings);
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])])) as Record<Ability, number>;

  /*
   * La furia se prende con el MISMO efecto del pack que el resto (para el
   * jugador es un interruptor más), pero sus números están escritos a mano:
   * Foundry los tiene en código, no en los datos. Ver rules/rabia.ts.
   */
  const rage = efectosActivos.some((e) => e.slug === RAGE_SLUG) ? rageSheet(level, mods.con) : null;

  const prof = computeProficiencies(build, pf2class, background, activeFeatures, chosenFeats, heritage, level);

  // Entrenamiento repetido: se avisa una vez por cada habilidad libre sin usar.
  for (const libre of prof.skillsLibres ?? []) {
    if (!libre.elegida) warnings.push(`Te falta elegir una habilidad libre: ${libre.motivo}.`);
  }
  for (const aviso of prof.skillsRedundantes ?? []) warnings.push(aviso);

  /*
   * Additional Lore da un Lore a elección, pero el pack no trae ninguna lista:
   * el nombre lo inventa el jugador. Sin este aviso, tomar la dote no hacía
   * absolutamente nada visible.
   */
  /*
   * Habilidades libres de clase: el gunslinger entrena 3 + Inteligencia además
   * de las fijas. Si quedaban sin elegir no lo decía nadie, y el personaje se
   * quedaba con menos habilidades entrenadas de las que le tocan.
   */
  const libresDeClase = (pf2class?.trainedSkills.additional ?? 0) + Math.max(0, mods.int);
  const elegidasDeClase = build.trainedSkills.filter((s) => s).length;
  if (libresDeClase > elegidasDeClase) {
    warnings.push(
      `Te faltan ${libresDeClase - elegidasDeClase} habilidad(es) entrenada(s) de clase: se eligen en Habilidades.`,
    );
  }

  const dotesDeLore = chosenFeats.filter((f) => f.slug === 'additional-lore').length;
  const loresEscritos = (build.extraLores ?? []).filter((l) => l.trim()).length;
  if (dotesDeLore > loresEscritos) {
    warnings.push(
      `Tomaste Additional Lore ${dotesDeLore} vez/veces y escribiste ${loresEscritos}: agregá el Lore en Habilidades.`,
    );
  }

  /*
   * La skill de la herencia cayendo en una que ya te da algo fijo. No genera
   * una deuda —la herencia se puede cambiar, que es más directo— pero hay que
   * decirlo, porque si no la elección no hace nada.
   */
  const deLaHerencia = build.heritageSkill;
  const origenBruto = deLaHerencia ? prof.skillsFijas?.[deLaHerencia] : null;
  // La propia herencia no cuenta como choque consigo misma.
  const origenFijo = origenBruto === heritage?.name ? null : origenBruto;
  if (deLaHerencia && origenFijo) {
    warnings.push(
      `La habilidad de la herencia (${deLaHerencia}) ya te la da ${origenFijo}: elegí otra, o quedará desperdiciada.`,
    );
  }

  // "Deity's favored weapon" queda como una clave sin sentido hasta que hay deidad:
  // recién ahí se sabe qué arma es.
  if (deity && pf2class?.otherAttackProficiency?.name?.includes('favored weapon')) {
    for (const weapon of deity.favoredWeapons) {
      const key = `weapon:${weapon}`;
      prof.attacks[key] = upgrade(prof.attacks[key] ?? 0, pf2class.otherAttackProficiency.rank);
    }
  }

  // --- armadura equipada (define CA y su categoria de proficiencia)
  const armorEntry = equipadoConCustom(build, content, (eq) => eq.type === 'armor' && eq.category !== 'shield');
  const armor = armorEntry?.equipment ?? null;

  const armorSheet: CharacterSheet['armor'] = armorEntry
    ? {
        name: armor!.name,
        inventoryIndex: armorEntry.inventoryIndex,
        custom: !!armorEntry.custom,
        category: armor!.category ?? 'unarmored',
        acBonus: armor!.acBonus ?? 0,
        dexCap: armor!.dexCap,
        checkPenalty: armor!.checkPenalty ?? 0,
        speedPenalty: armor!.speedPenalty ?? 0,
        strength: armor!.strength,
        notes: armorEntry.custom?.notes ?? null,
      }
    : null;

  // --- escudo
  const shieldEntry = equipadoConCustom(build, content, (eq) => eq.type === 'shield');
  const shieldItem = shieldEntry?.equipment ?? null;

  let shieldSheet: CharacterSheet['shield'] = null;
  if (shieldItem) {
    const maxHp = shieldItem.maxHp ?? 0;
    const currentHp = state?.shield?.hp ?? maxHp;
    const brokenThreshold = Math.floor(maxHp / 2);

    shieldSheet = {
      name: shieldItem.name,
      inventoryIndex: shieldEntry!.inventoryIndex,
      custom: !!shieldEntry!.custom,
      notes: shieldEntry!.custom?.notes ?? null,
      acBonus: shieldItem.acBonus ?? 0,
      hardness: shieldItem.hardness ?? 0,
      maxHp,
      brokenThreshold,
      currentHp,
      raised: state?.shield?.raised ?? false,
      broken: currentHp <= brokenThreshold,
    };
  }

  // --- HP
  const conMod = mods.con;
  const drained = state?.conditions.find((c) => c.id === 'drained');
  const hpMods: Modifier[] = [
    mod(`${ancestry?.name ?? 'Ancestría'} (base)`, ancestry?.hp ?? 0, 'untyped'),
    mod(`${pf2class?.name ?? 'Clase'} (${pf2class?.hp ?? 0}/nivel × ${level})`, (pf2class?.hp ?? 0) * level, 'untyped'),
    mod(`Constitución (${conMod >= 0 ? '+' : ''}${conMod}/nivel × ${level})`, conMod * level, 'untyped'),
  ];
  if (drained) hpMods.push(mod(`Drained ${drained.value ?? 1}`, -(drained.value ?? 1) * level, 'untyped'));

  // --- CA
  const armorCategory = (armor?.category as keyof Proficiencies['defenses']) ?? 'unarmored';
  const dexCap = armor?.dexCap ?? null;
  const dexToAc = dexCap != null ? Math.min(mods.dex, dexCap) : mods.dex;
  const acMods: Modifier[] = [
    mod('Base', 10, 'untyped'),
    mod(dexCap != null && mods.dex > dexCap ? `Destreza (limitada a +${dexCap})` : 'Destreza', dexToAc, 'ability'),
    ...proficiencyMods(prof.defenses[armorCategory] ?? 0, level, armor ? `${armor.name}` : 'Sin armadura'),
  ];
  if (armor?.acBonus) {
    // Armor Potency sube el bonus de objeto que la armadura ya da a la CA.
    const potencia = armor.runes?.potency ?? 0;
    const etiqueta = potencia ? `${armor.name} (+${potencia})` : armor.name;
    acMods.push(mod(etiqueta, armor.acBonus + potencia, 'item'));
  }
  // El escudo suma solo mientras esté alzado, y nunca si está roto.
  if (shieldSheet && shieldSheet.raised && !shieldSheet.broken) {
    acMods.push(mod(`${shieldSheet.name} (alzado)`, shieldSheet.acBonus, 'circumstance'));
  }
  if (rage) acMods.push(mod('Rabia', rage.acPenalty, 'untyped'));
  acMods.push(...situacion(['ac']));

  const abilityChecks = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      buildStat([
        mod(ABILITY_NAMES[ability], mods[ability], 'ability'),
        ...situacion([`${ability}-based`, 'all-checks']),
      ]),
    ]),
  ) as Record<Ability, Stat>;

  // --- perception y salvaciones
  const perceptionMods = [
    mod('Sabiduría', mods.wis, 'ability'),
    ...proficiencyMods(prof.perception, level, 'Perception'),
    ...situacion(['perception', 'wis-based', 'all-checks']),
  ];

  const saveAbility = { fortitude: 'con', reflex: 'dex', will: 'wis' } as const;
  const saves = {} as Record<'fortitude' | 'reflex' | 'will', Stat>;
  for (const save of ['fortitude', 'reflex', 'will'] as const) {
    const ability = saveAbility[save];
    // Resilient da bonus de objeto a las TRES salvaciones por igual.
    const resilient = armor?.runes?.resilient ?? 0;
    saves[save] = buildStat([
      mod(ability.toUpperCase(), mods[ability], 'ability'),
      ...proficiencyMods(prof.saves[save], level, save),
      ...(resilient ? [mod(`${armor?.name} (resilient)`, resilient, 'item')] : []),
      ...situacion([save, `${ability}-based`, 'all-checks']),
    ]);
  }

  // --- CD de clase
  const keyAbility = build.abilityBoosts.class[0] ?? pf2class?.keyAbility[0] ?? 'str';
  const classDC = buildStat([
    mod('Base', 10, 'untyped'),
    mod(keyAbility.toUpperCase(), mods[keyAbility], 'ability'),
    ...proficiencyMods(prof.classDC, level, 'CD de clase'),
    // Las CD tambien reciben penalidades: frightened y sickened le pegan a todo, y
    // stupefied/clumsy/enfeebled segun el atributo del que dependa la CD.
    ...situacion(['all-checks', `${keyAbility}-based`]),
  ]);

  // --- skills
  const armorPenalty = armor?.checkPenalty ?? 0;
  const skills = SKILLS.map((def) => {
    const rank = prof.skills[def.slug] ?? 0;
    const modifiers: Modifier[] = [
      mod(def.ability.toUpperCase(), mods[def.ability], 'ability'),
      ...proficiencyMods(rank, level, def.name),
      ...situacion([`skill:${def.slug}`, `${def.ability}-based`, 'all-checks']),
    ];
    /*
     * La penalidad de chequeos se aplica SIEMPRE, cumplas o no el requisito de
     * Fuerza de la armadura: lo que el requisito perdona es la penalidad de
     * velocidad, no esta. Confirmado con la fuente Legacy del proyecto
     * (Notebook LM, 2026-08-20) — antes estaba al revés.
     */
    if (def.armorPenalty && armorPenalty) {
      modifiers.push(mod(`${armor?.name} (armadura)`, armorPenalty, 'item'));
    }
    return { slug: def.slug, name: def.name, rank, stat: buildStat(modifiers) };
  });

  // Los Lore siempre van con Inteligencia y no sufren penalidad de armadura.
  const lores = Object.entries(prof.lores).map(([key, lore]) => ({
    slug: key,
    name: `${lore.name} Lore`,
    rank: lore.rank,
    stat: buildStat([
      mod('INT', mods.int, 'ability'),
      ...proficiencyMods(lore.rank, level, `${lore.name} Lore`),
      ...situacion([`skill:${key}`, 'int-based', 'all-checks']),
    ]),
  }));

  // --- iniciativa
  //
  // Se arma una opcion por estadistica con la que se podria tirar. Cada una ya trae
  // sus propios modificadores mas los bonus de iniciativa que le correspondan.
  const initiativeRules = [...activeFeatures, ...chosenFeats].flatMap((item) =>
    (item.rules ?? [])
      .filter((r) => r.key === 'FlatModifier' && r.selector === 'initiative' && r.value != null)
      .map((r) => ({ item, rule: r })),
  );

  const initiativeConditional = initiativeRules
    .filter(({ rule }) => (rule.predicate ?? []).some((p) => p !== 'perception'))
    .map(({ item, rule }) => ({ source: item.name, value: rule.value!, predicate: rule.predicate ?? [] }));

  const initiativeBonuses = (usandoPercepcion: boolean): Modifier[] =>
    initiativeRules
      .filter(({ rule }) => {
        const pred = rule.predicate ?? [];
        if (!pred.length) return true;
        // Solo se aplican solos los que dependen de usar Percepcion.
        return pred.length === 1 && pred[0] === 'perception' && usandoPercepcion;
      })
      .map(({ item, rule }) => mod(item.name, rule.value!, (rule.type ?? 'untyped') as Modifier['type']))
      .concat(situacion(['initiative']));

  // Igual que en las skills: si esta untrained no suma el nivel.
  const conBonus = (base: Stat, usandoPercepcion: boolean): Stat =>
    buildStat([...base.breakdown, ...initiativeBonuses(usandoPercepcion)]);

  const initiativeOptions = [
    { key: 'perception', label: 'Percepción', stat: conBonus(buildStat(perceptionMods), true) },
    ...skills.map((s) => ({ key: `skill:${s.slug}`, label: s.name, stat: conBonus(s.stat, false) })),
    ...lores.map((l) => ({ key: l.slug, label: l.name, stat: conBonus(l.stat, false) })),
  ];

  /*
   * --- garbo (panache)
   *
   * Se maneja por los rasgos que tenga el personaje y no por la clase: con el
   * arquetipo Swashbuckler Dedication se gana Panache sin ser de la clase (y sin
   * Precise Strike, que no viene con la dedication).
   */
  const tieneRasgo = (nombre: string) => activeFeatures.some((f) => f.name === nombre);
  const panacheSheet: CharacterSheet['panache'] = tieneRasgo('Panache')
    ? {
        active: state?.panache ?? false,
        preciseStrike: tieneRasgo('Precise Strike') ? preciseStrike(level) : null,
        vivacious: tieneRasgo('Vivacious Speed') ? vivaciousSpeed(level) : null,
      }
    : null;

  // --- strikes: el puño primero, despues las armas equipadas
  //
  // Todo personaje puede pegar un puñetazo, pero el dataset no lo trae: sus unicos
  // items "unarmed" son magicos (handwraps y compañia). Asi que el puño se arma aca,
  // y despues pasa por el mismo pipeline que cualquier arma (proficiencia unarmed,
  // Fuerza al daño, condiciones).
  const PUÑO: Equipment = {
    id: 'builtin-fist',
    slug: 'fist',
    name: 'Puño',
    traits: ['agile', 'finesse', 'nonlethal', 'unarmed'],
    tags: [],
    rarity: 'common',
    source: 'Core Rulebook',
    description: '',
    type: 'weapon',
    level: 0,
    price: null,
    bulk: 0,
    usage: '',
    damage: { dice: 1, die: 'd4', damageType: 'bludgeoning' },
    range: null,
    reload: null,
    category: 'unarmed',
    group: 'brawling',
    acBonus: null,
    dexCap: null,
    strength: null,
    checkPenalty: null,
    speedPenalty: null,
    hardness: null,
    maxHp: null,
    runes: SIN_RUNAS,
      material: null,
    } as Equipment;


  //
  // Ataques naturales: garras, colmillos, púas que se disparan. No salen del
  // inventario (no pesan, no se compran), así que se arman con el mismo molde
  // que el puño y entran al pipeline con un CustomItem que solo trae lo que el
  // jugador cargó (bonus, fatal/deadly, notas).
  const armasNaturales = (build.naturalWeapons ?? []).map((nw, i) => {
    const weapon: Equipment = {
      id: `natural:${nw.id}`,
      slug: '',
      name: nw.name,
      // El unarmed va siempre: es lo que hace que use tu proficiencia unarmed.
      traits: [...nw.traits, 'unarmed'],
      tags: [],
      rarity: 'common',
      source: 'Ataque natural',
      description: '',
      type: 'weapon',
      level: 0,
      price: null,
      bulk: 0,
      usage: '',
      damage: { dice: nw.damageDice, die: nw.damageDie, damageType: nw.damageType },
      // El "range" solo importa acá para que el motor lo detecte como a distancia;
      // no hay UI que muestre una distancia en pies para ningún arma.
      range: nw.ranged ? 30 : null,
      reload: null,
      category: 'unarmed',
      group: null,
      acBonus: null,
      dexCap: null,
      strength: null,
      checkPenalty: null,
      speedPenalty: null,
      hardness: null,
      maxHp: null,
      runes: SIN_RUNAS,
      material: null,
    } as Equipment;

    // El tag "custom" de la hoja significa "esto difiere del catálogo", y un
    // ataque natural no tiene catálogo del que diferir. Solo se marca si de
    // verdad hay algo extra cargado (fatal, un bonus, notas).
    const extra = { fatal: nw.fatal, deadly: nw.deadly, bonusAttack: nw.bonusAttack, bonusDamage: nw.bonusDamage, notes: nw.notes };
    const custom: CustomItem | undefined = Object.values(extra).some((v) => v != null && v !== '') ? extra : undefined;

    // Índices negativos por debajo del -1 del puño: nunca chocan con el
    // inventario real (siempre >= 0) ni con el puño.
    return { weapon, custom, inventoryIndex: -2 - i, naturalId: nw.id };
  });

  //
  // Un arma personalizada es la del dataset con las diferencias del master encima.
  // Si la referencia no resuelve, se usa la foto guardada dentro del custom.
  const armasEquipadas = build.inventory
    .map((item, inventoryIndex) => ({ item, inventoryIndex }))
    .filter(({ item }) => item.equipped)
    .map(({ item, inventoryIndex }) => {
      const base = content.equipmentById.get(item.id);
      const snapshot = item.custom?.base;
      if (!base && !snapshot) return null;

      const weapon: Equipment = base
        ? { ...base }
        : ({
            id: item.id,
            slug: '',
            name: snapshot!.name,
            traits: [...snapshot!.traits],
            tags: [],
            rarity: 'common',
            source: 'Personalizada',
            description: '',
            type: 'weapon',
            level: 0,
            price: null,
            bulk: 0,
            usage: '',
            damage: snapshot!.damage,
            range: snapshot!.range,
            reload: null,
            category: snapshot!.category,
            group: snapshot!.group,
            acBonus: null,
            dexCap: null,
            strength: null,
            checkPenalty: null,
            speedPenalty: null,
            hardness: null,
            maxHp: null,
            runes: SIN_RUNAS,
      material: null,
    } as Equipment);

      const custom = item.custom;
      if (custom) {
        if (custom.name) weapon.name = custom.name;
        if (custom.traits?.length) weapon.traits = [...weapon.traits, ...custom.traits];
        if (weapon.damage) {
          weapon.damage = {
            dice: custom.damageDice ?? weapon.damage.dice,
            die: custom.damageDie ?? weapon.damage.die,
            damageType: custom.damageType ?? weapon.damage.damageType,
          };
        }
      }

      return { weapon, custom, inventoryIndex };
    })
    .filter((x): x is { weapon: Equipment; custom: CustomItem | undefined; inventoryIndex: number } => !!x)
    .filter((x) => x.weapon.type === 'weapon');

  const strikes: StrikeSheet[] = [
    { weapon: PUÑO, custom: undefined as CustomItem | undefined, inventoryIndex: -1, naturalId: null },
    ...armasNaturales,
    ...armasEquipadas.map((x) => ({ ...x, naturalId: null as string | null })),
  ]
    .map(({ weapon, custom, inventoryIndex, naturalId }) => {
      const keys = attackProficiencyKeys(weapon);
      const ajuste = build.proficiencyOverrides?.strikes?.[weapon.id];
      const rank = ajuste ?? rankFor(prof, keys);
      const etiquetaProf = ajuste != null
        ? weapon.name
        : weapon.group === 'firearm'
          ? 'Armas de fuego'
          : keys[keys.length - 1];
      const ranged = weapon.range != null || weapon.traits.some((t) => t.startsWith('range') || t === 'thrown');
      const ability: Ability = ranged || weapon.traits.includes('finesse') ? 'dex' : 'str';

      const attack = buildStat([
        mod(ability.toUpperCase(), mods[ability], 'ability'),
        ...proficiencyMods(rank, level, etiquetaProf),
        // El bonus del master entra como bonus de objeto, igual que una runa de potencia.
        // Weapon Potency: bonus de objeto al ataque. No suma daño.
        ...(weapon.runes?.potency ? [mod(`${weapon.name} (+${weapon.runes.potency})`, weapon.runes.potency, 'item')] : []),
        ...(custom?.bonusAttack ? [mod(weapon.name, custom.bonusAttack, 'item')] : []),
        ...situacion(['attack', `${ability}-based`, 'all-checks']),
      ]);

      // El dano tambien pasa por el pipeline: asi entran cosas como Singular
      // Expertise (+1 circumstance al dano con armas de fuego y arcos).
      const damageMods: Modifier[] = [];
      if (!ranged) damageMods.push(mod('Fuerza', mods.str, 'ability'));
      if (weapon.traits.includes('propulsive')) damageMods.push(mod('Propulsive', Math.floor(mods.str / 2), 'ability'));
      damageMods.push(...damageBonuses(activeFeatures, chosenFeats, weapon));

      /*
       * Precise Strike: daño de precisión solo mientras tenés garbo, y solo con
       * un arma cuerpo a cuerpo (o desarmado) agile o finesse. El dataset trae
       * el rule element pero con `value: null`, así que el número sale de la
       * tabla verificada en panache.ts.
       */
      const preciso = panacheSheet?.preciseStrike;
      const armaDePrecision = !ranged && (weapon.traits.includes('agile') || weapon.traits.includes('finesse'));
      if (preciso && panacheSheet.active && armaDePrecision) {
        damageMods.push(mod('Precise Strike (precisión)', preciso.flat, 'untyped'));
      }
      const extraDeRabia = rageDamage(rage, ranged, weapon.traits.includes('agile'));
      if (extraDeRabia) damageMods.push(mod('Rabia', extraDeRabia, 'untyped'));
      if (custom?.bonusDamage) damageMods.push(mod(weapon.name, custom.bonusDamage, 'item'));
      damageMods.push(...situacion(['damage', ...['str-based'].filter(() => !ranged)]));

      const dmg = weapon.damage;
      const dadoDeTrait = (prefijo: string) => {
        const trait = weapon.traits.find((t) => t.startsWith(prefijo));
        return trait?.match(/d\d+$/)?.[0] ?? null;
      };

      /*
        * Striking multiplica los DADOS, no los modificadores planos: la Fuerza,
        * las dotes y Weapon Specialization quedan iguales. Un arma personalizada
        * que ya declaró sus dados manda sobre esto.
        */
      const dadosBase = custom?.damageDice ?? (dmg ? dmg.dice : 0);
      const dados = custom?.damageDice ? dadosBase : dadosBase * dadosPorStriking(weapon.runes?.striking ?? 0);

      return {
        name: weapon.name,
        ranged,
        unarmed: weapon.category === 'unarmed',
        // `fatal-aim` es fatal solo si empuñás el arma a dos manos; se trata igual
        // y la diferencia queda para el jugador. El master puede pisar el dado del
        // trait (o ponerle uno a un arma que no lo tenía) desde el editor.
        fatal: custom?.fatal ?? dadoDeTrait('fatal'),
        deadly: custom?.deadly ?? dadoDeTrait('deadly'),
        inventoryIndex,
        naturalId,
        notes: custom?.notes ?? null,
        custom: !!custom,
        attack,
        damageDice: dmg ? `${dados}${dmg.die}` : '—',
        /*
         * El daño de las runas elementales va SEPARADO: las resistencias y
         * debilidades del enemigo se aplican por tipo, y este dado no se
         * duplica en un crítico.
         */
        extraDamage: danoDeRunas(weapon.runes?.property ?? []),
        /*
         * Lo que depende del objetivo NO se suma: el 1d6 de Disrupting solo
         * vale contra no-muertos, y sumarlo al total mentiría en toda pelea
         * contra cualquier otra cosa. Se muestra para que lo tires vos.
         */
        conditionalDamage: danoCondicionalDeRunas(weapon.runes?.property ?? []),
        runeNotes: bonosCondicionalesDeRunas(weapon.runes?.property ?? []),
        runas: resumenDeRunas(weapon.runes),
        damage: buildStat(damageMods),
        damageType: dmg?.damageType ?? '',
        proficiency: rank,
        /** Clave con la que se pisa el rango a mano (ver proficiencyOverrides). */
        profKey: weapon.id,
        traits: weapon.traits,
      };
    });

  // --- conjuros
  //
  // La proficiencia de conjuro la traen los class features del dataset
  // (`proficiencies.spellcasting`); los slots NO estan en los datos y salen de
  // la tabla en spellcasting.ts.
  let spellcastingSheet: SpellcastingSheet | null = null;

  if (pf2class?.spellcasting === 1 && CASTERS[pf2class.slug]) {
    const config = CASTERS[pf2class.slug];
    const kind = config.kind;
    const keyAbility = (build.abilityBoosts.class[0] ?? pf2class.keyAbility[0] ?? 'cha') as Ability;

    // Casi todas tienen tradicion fija; el Sorcerer la hereda de su linaje.
    const tradition = config.tradition ?? chosenFeatures.map((f) => f.tradition).find((t) => !!t) ?? null;

    const spellProficiency = prof.spellcasting;

    spellcastingSheet = {
      className: pf2class.name,
      tradition,
      kind,
      keyAbility,
      proficiency: spellProficiency,
      slots: spellSlots(kind, level),
      maxRank: maxSpellRank(kind, level),
      cantripRank: cantripRank(level),
      config,
      cantripsKnown: cantripsKnownFor(config),
      spellbookSize: spellbookSize(config, level),
      // El divine font da 1 + Carisma slots extra, solo para heal o harm.
      divineFontSlots: config.divineFont ? Math.max(0, 1 + mods.cha) : 0,
      // La escuela arcana la elige el wizard con el ChoiceSet de "Arcane School",
      // que ya se resuelve solo por tags. Universalist no da slot extra.
      arcaneSchool: config.arcaneSchool
        ? (chosenFeatures.find((f) => f.tags?.includes('wizard-arcane-school'))?.name ?? null)
        : null,
      // Sale del dataset: la clase otorga el rasgo "Signature Spells" a nivel 3.
      signatureSpells: granted.some((f) => f.name === 'Signature Spells'),
      attack: buildStat([
        mod(keyAbility.toUpperCase(), mods[keyAbility], 'ability'),
        ...proficiencyMods(spellProficiency, level, 'Conjuros'),
        ...situacion(['attack', `${keyAbility}-based`, 'all-checks']),
      ]),
      dc: buildStat([
        mod('Base', 10, 'untyped'),
        mod(keyAbility.toUpperCase(), mods[keyAbility], 'ability'),
        ...proficiencyMods(spellProficiency, level, 'Conjuros'),
        // stupefied dice explicitamente "spell DCs", asi que la CD de conjuro
        // necesita el alias del atributo, no solo 'all-checks'.
        ...situacion(['all-checks', `${keyAbility}-based`]),
      ]),
    };

    if (!tradition) warnings.push('Falta elegir el linaje: define la tradición de tus conjuros.');

    // Un espontaneo tiene el repertorio clavado; un preparado no tiene repertorio:
    // el Wizard tiene libro y el Cleric/Druid preparan de toda su lista.
    if (config.source === 'repertoire') {
      for (const { rank, slots } of spellcastingSheet.slots) {
        const known = build.spellcasting?.repertoire?.[String(rank)]?.length ?? 0;
        if (known < slots) warnings.push(`Faltan ${slots - known} hechizo(s) de rango ${rank} en el repertorio.`);
      }
    }

    if (config.source === 'spellbook') {
      const book = build.spellcasting?.spellbook?.length ?? 0;
      const esperados = spellcastingSheet.spellbookSize;
      if (book < esperados) warnings.push(`Al libro de hechizos le faltan ${esperados - book} hechizo(s).`);
    }

    const cantrips = build.spellcasting?.cantrips?.length ?? 0;
    const cantripsEsperados = spellcastingSheet.cantripsKnown;
    if (cantrips < cantripsEsperados) warnings.push(`Faltan ${cantripsEsperados - cantrips} cantrip(s).`);
  }

  // --- dinero
  //
  // Solo mira lo que cuesta el equipo elegido: sirve como guia al crear el personaje.
  // Las monedas que tenes en la mano viven en el estado, porque cambian todo el tiempo.
  const spentCp = build.inventory.reduce((total, item) => {
    const equipo = content.equipmentById.get(item.id);
    return total + priceToCp(equipo?.price) * (item.quantity || 1);
  }, 0);

  /*
   * El presupuesto de creación se muestra pero NO se valida: en la mesa el
   * equipo entra por mil caminos que la app no ve —botín, regalos del máster,
   * un personaje traído de otra app— y avisar por eso era ruido permanente.
   */

  // --- carga
  const carriedBulk = build.inventory.reduce((total, item) => {
    const bulkUnitario = content.equipmentById.get(item.id)?.bulk ?? item.custom?.bulk ?? 0;
    return total + bulkUnitario * (item.quantity || 1);
  }, 0);

  const encumberedAt = 5 + mods.str;
  const maxBulk = 10 + mods.str;
  // Muchas mesas no llevan la cuenta del bulk: con `ignoreBulk` se sigue
  // mostrando cuánto cargás, pero deja de tratarse como un problema.
  const ignoraBulk = build.ignoreBulk === true;
  const encumbered = !ignoraBulk && carriedBulk > encumberedAt;

  if (!ignoraBulk) {
    if (carriedBulk > maxBulk) {
      warnings.push(`Estás cargando ${Math.round(carriedBulk * 10) / 10} de bulk y tu máximo es ${maxBulk}.`);
    } else if (encumbered) {
      warnings.push(`Pasaste ${encumberedAt} de bulk: estás encumbered (clumsy 1 y −10 pies de velocidad).`);
    }
  }

  // --- idiomas
  const fromAncestry = ancestry?.languages ?? [];
  const chosenLanguages = (build.languages ?? []).filter((l) => !fromAncestry.includes(l));
  const languageSlotCount = languageSlots(mods.int, ancestry?.additionalLanguages ?? 0);

  if (chosenLanguages.length < languageSlotCount) {
    warnings.push(`Podés elegir ${languageSlotCount - chosenLanguages.length} idioma(s) más.`);
  }

  // --- focus spells
  //
  // Van aparte del bloque de conjuros porque existen sin slots: un Monk o un Champion
  // tienen focus spells y no lanzan conjuros comunes.
  const focusSpells = build.spellcasting?.focusSpells ?? [];
  let focusSheet: FocusSheet | null = null;

  if (focusSpells.length) {
    const focusAbility = (build.abilityBoosts.class[0] ?? pf2class?.keyAbility[0] ?? 'cha') as Ability;

    focusSheet = {
      // El pool es la cantidad que conoces, con tope de 3.
      pool: Math.min(3, focusSpells.length),
      rank: cantripRank(level),
      suggested: chosenFeatures.flatMap((f) => f.focusSpells ?? []),
      attack: buildStat([
        mod(focusAbility.toUpperCase(), mods[focusAbility], 'ability'),
        ...proficiencyMods(prof.spellcasting, level, 'Conjuros'),
        ...situacion(['attack', `${focusAbility}-based`, 'all-checks']),
      ]),
      dc: buildStat([
        mod('Base', 10, 'untyped'),
        mod(focusAbility.toUpperCase(), mods[focusAbility], 'ability'),
        ...proficiencyMods(prof.spellcasting, level, 'Conjuros'),
        ...situacion(['all-checks', `${focusAbility}-based`]),
      ]),
    };

    if (prof.spellcasting === 0) {
      warnings.push('Tenés focus spells pero ninguna proficiencia de conjuro: revisá de dónde salen.');
    }
  }

  // --- prerrequisitos de las dotes tomadas
  //
  // Se evalua lo que se puede (ver prerequisites.ts) y solo se avisa de lo que
  // falla o no se entiende: si el personaje claramente cumple, no molesta.
  const skillRanks: Record<string, ProficiencyRank> = { ...prof.skills };
  for (const [key, lore] of Object.entries(prof.lores)) skillRanks[key] = lore.rank;

  const ownedNames = new Set(
    [...granted.map((g) => g.name), ...chosenFeats.map((f) => f.name)].map((n) => n.toLowerCase()),
  );

  const prerequisiteContext = {
    abilityScores: scores,
    skillRanks,
    perception: prof.perception,
    ownedNames,
    knownFeatNames: content.featNames,
    level,
  };

  const acknowledged = new Set(build.acknowledgedWarnings ?? []);
  const allWarnings: Warning[] = warnings.map((text) => ({
    id: `build:${text}`,
    text,
    kind: 'build' as const,
    status: 'unmet' as const,
    acknowledged: acknowledged.has(`build:${text}`),
  }));

  for (const feat of chosenFeats) {
    for (const pre of feat.prerequisites) {
      const status = evaluatePrerequisite(pre, prerequisiteContext);
      if (status === 'met') continue;
      const id = `prereq:${feat.id}:${pre}`;
      allWarnings.push({
        id,
        text: `${feat.name}: requiere ${pre}.`,
        kind: 'prerequisite',
        status,
        acknowledged: acknowledged.has(id),
      });
    }
  }

  /*
   * --- velocidad
   *
   * Si cumplís el requisito de Fuerza de la armadura, la penalidad de velocidad
   * NO se aplica. Es al revés que la de chequeos, que se come siempre.
   * Confirmado con la fuente Legacy del proyecto (Notebook LM, 2026-08-20).
   *
   * El requisito viene del dataset como modificador (0 a 5), no como puntuación.
   */
  const requisitoFuerza = armor?.strength ?? null;
  const cumpleFuerza = requisitoFuerza != null && mods.str >= requisitoFuerza;
  const penalidadVelocidad = !cumpleFuerza && armor?.speedPenalty ? armor.speedPenalty : 0;

  const speed = buildStat([
    mod(ancestry?.name ?? 'Base', ancestry?.speed ?? 25, 'untyped'),
    ...(penalidadVelocidad ? [mod(`${armor!.name}`, penalidadVelocidad, 'untyped')] : []),
    ...bonusDeGarbo(panacheSheet),
    // Las condiciones no tocan la velocidad, pero los efectos si (Haste, Longstrider).
    ...situacion(['speed']),
  ]);

  return {
    name: build.name || 'Sin nombre',
    panache: panacheSheet,
    rage,
    level,
    className: pf2class?.name ?? '—',
    ancestryName: ancestry?.name ?? '—',
    heritageName: heritage?.name ?? '—',
    backgroundName: background?.name ?? '—',
    size: ancestry?.size ?? 'med',
    speed,
    abilityScores: scores,
    abilityMods: mods,
    abilityChecks,
    maxHp: buildStat(hpMods),
    ac: buildStat(acMods),
    acProficiency: { category: armorCategory, rank: prof.defenses[armorCategory] ?? 0 },
    perception: buildStat(perceptionMods),
    saves,
    classDC,
    spellcasting: spellcastingSheet,
    focus: focusSheet,
    focusSuggestions: chosenFeatures.flatMap((f) => f.focusSpells ?? []),
    deity,
    alignment: build.alignment,
    skills,
    eleccionesDeRasgos,
    skillsLibres: prof.skillsLibres ?? [],
    /*
     * Se saca la propia elección de la herencia: si no, la skill elegida
     * aparecería como "ya te la da la herencia" y se marcaría a sí misma.
     */
    skillsDeClase: { total: libresDeClase, usadas: elegidasDeClase },
    skillsFijas: Object.fromEntries(
      Object.entries(prof.skillsFijas ?? {}).filter(
        ([slug, origen]) => !(slug === build.heritageSkill && origen === heritage?.name),
      ),
    ),
    lores,
    initiative: { options: initiativeOptions, conditional: initiativeConditional },
    money: { startingCp: STARTING_MONEY_CP, spentCp, remainingCp: STARTING_MONEY_CP - spentCp },
    bulk: { carried: Math.round(carriedBulk * 10) / 10, encumberedAt, max: maxBulk, encumbered, ignorado: ignoraBulk },
    // El master puede pisar la visión de la ancestría (una maldición, un rasgo
    // que no está modelado, un ojo perdido en la mesa).
    vision: build.visionOverride ?? ancestry?.vision ?? 'normal',
    shield: shieldSheet,
    age: build.age ?? '',
    appearance: build.appearance ?? '',
    languages: { fromAncestry, chosen: chosenLanguages, slots: languageSlotCount },
    strikes,
    armor: armorSheet,
    proficiencies: prof,
    // Dos fuentes distintas pueden otorgar lo mismo (Munitions Crafter y Alchemist
    // Dedication otorgan Alchemical Crafting): se lista una sola vez.
    features: granted.filter(
      (f, i) => granted.findIndex((other) => (other.id ?? other.name) === (f.id ?? f.name)) === i,
    ),
    feats: chosenFeatEntries.map((c) => ({
      name: content.featById.get(c.id!)?.name ?? c.id!,
      level: c.level,
      slot: c.slot,
      id: c.id!,
      source: FEAT_SOURCE_BY_SLOT[c.slot] ?? 'class',
    })),
    warnings: allWarnings,
  };
}
