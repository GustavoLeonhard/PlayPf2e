import type { Runes } from '../rules/runas';
import type { Price } from '../rules/money';

/** Formas del contenido importado desde el dataset PF2e Legacy (ver tools/import). */

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** 0 = untrained, 1 = trained, 2 = expert, 3 = master, 4 = legendary */
export type ProficiencyRank = 0 | 1 | 2 | 3 | 4;

export const PROFICIENCY_NAMES = ['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'];

export interface ContentBase {
  id: string;
  slug: string;
  name: string;
  traits: string[];
  /** Tags internos del dataset; resuelven las elecciones dinamicas (ej. `gunslinger-way`). */
  tags: string[];
  rarity: string;
  source: string;
  description: string;
}

export interface GrantedItem {
  name: string;
  level: number;
  id: string | null;
}

export interface RuleElement {
  key: 'ChoiceSet' | 'GrantItem' | 'FlatModifier' | 'Proficiency';
  prompt?: string;
  flag?: string | null;
  choices?: { label: string; id: string }[] | null;
  /** Elecciones dinamicas: las opciones son los items que tengan estos tags. */
  filterTags?: string[] | null;
  /**
   * Elección que la app no sabe resolver: el filtro es un mini lenguaje de
   * predicados sobre otro pack entero. Se avisa, no se ofrece.
   */
  abierta?: boolean;
  /** Sobre qué se elige, cuando el pack lo dice: 'feat', 'ancestry'… */
  tipoDeItem?: string;
  /** FlatModifier: condiciones bajo las que aplica (ej. `["perception"]` en iniciativa). */
  predicate?: string[];
  /** Proficiency: path tipo `proficiencies.attacks.simple-firearms-crossbows`. */
  path?: string;
  /**
   * Rango que sube con el nivel, de mayor a menor: la Skilled Heritage entrena
   * a nivel 1 y sube a experto a nivel 5. Se usa el primer tramo que alcanzás.
   */
  porNivel?: { desde: number; value: number }[] | null;
  /** El path apunta a la skill elegida en el ChoiceSet de este mismo item. */
  elegida?: boolean;
  mode?: string;
  id?: string | null;
  selector?: string;
  type?: string;
  value?: number | null;
  label?: string | null;
}

export interface Pf2Class extends ContentBase {
  hp: number;
  keyAbility: Ability[];
  perception: ProficiencyRank;
  savingThrows: { fortitude: ProficiencyRank; reflex: ProficiencyRank; will: ProficiencyRank };
  attacks: { simple: ProficiencyRank; martial: ProficiencyRank; advanced: ProficiencyRank; unarmed: ProficiencyRank };
  /** Proficiencia con nombre propio (Gunslinger: "Simple Firearms, Martial Firearms" a experto). */
  otherAttackProficiency: { name: string; rank: ProficiencyRank } | null;
  defenses: { unarmored: ProficiencyRank; light: ProficiencyRank; medium: ProficiencyRank; heavy: ProficiencyRank };
  trainedSkills: { fixed: string[]; additional: number };
  featLevels: { ancestry: number[]; class: number[]; general: number[]; skill: number[] };
  skillIncreaseLevels: number[];
  /** 1 si la clase lanza conjuros. OJO: es número, no string. */
  spellcasting: number;
  features: GrantedItem[];
}

export interface Ancestry extends ContentBase {
  hp: number;
  size: string;
  speed: number;
  /** Cada set es una eleccion: si tiene 6 opciones es un boost libre. */
  boosts: Ability[][];
  flaws: Ability[][];
  languages: string[];
  additionalLanguages: number;
  vision: string;
  features: GrantedItem[];
}

export interface Heritage extends ContentBase {
  ancestry: string | null;
  rules: RuleElement[];
}

export interface Background extends ContentBase {
  boosts: Ability[][];
  trainedSkills: string[];
  lore: string[];
  grantedFeats: GrantedItem[];
}

export type FeatCategory = 'ancestry' | 'class' | 'general' | 'skill' | 'bonus' | 'classfeature';

export interface Feat extends ContentBase {
  level: number;
  category: FeatCategory;
  actionType: string;
  actions: number | null;
  /** Texto libre: se muestra como advertencia, no se evalua. */
  prerequisites: string[];
  onlyLevel1: boolean;
  maxTakable: number;
  rules: RuleElement[];
}

export interface ClassFeature extends ContentBase {
  /** Los linajes de sorcerer traen su tradicion (arcane/divine/occult/primal). */
  tradition?: string | null;
  /** Nombres de los focus spells que nombra el texto (linajes de sorcerer). */
  focusSpells?: string[];
  level: number;
  actionType: string;
  rules: RuleElement[];
}

export interface Equipment extends ContentBase {
  type: string;
  level: number;
  price: Price | null;
  bulk: number;
  /** Contenedores: cuánto bulk entra, y cuánto de eso no cuenta. */
  capacidad: number | null;
  bulkIgnorado: number | null;
  usage: string;
  damage: { dice: number; die: string; damageType: string } | null;
  /** Alcance en pies; si tiene valor, el arma es a distancia. */
  range: number | null;
  reload: string | null;
  category: string | null;
  group: string | null;
  acBonus: number | null;
  /** Escudos: hardness absorbe daño y maxHp define cuánto aguanta (BT = la mitad). */
  hardness: number | null;
  maxHp: number | null;
  dexCap: number | null;
  strength: number | null;
  checkPenalty: number | null;
  speedPenalty: number | null;
  /** Potency, striking, resilient y runas de propiedad. Ver rules/runas.ts. */
  runes: Runes;
  /** Adamantina, mithral… Cambian dureza y precio. */
  material: { type: string; grade: string | null } | null;
}

export interface Deity extends ContentBase {
  /** Remaster: holy/unholy. El pack legacy ya migró a esto en vez del alineamiento. */
  sanctification: string | null;
  sanctificationModal: string | null;
  attribute: string[];
  domains: string[];
  alternateDomains: string[];
  favoredWeapons: string[];
  divineFont: string[];
  skill: string[];
}

/** Los 9 alineamientos de PF2e Legacy (el Remaster los sacó). */
export const ALIGNMENTS = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

export const ALIGNMENT_NAMES: Record<Alignment, string> = {
  LG: 'Legal bueno',
  NG: 'Neutral bueno',
  CG: 'Caótico bueno',
  LN: 'Legal neutral',
  N: 'Neutral',
  CN: 'Caótico neutral',
  LE: 'Legal maligno',
  NE: 'Neutral maligno',
  CE: 'Caótico maligno',
};

export interface SpellDamage {
  formula: string;
  type: string;
  kinds: string[];
}

export interface Spell extends ContentBase {
  level: number;
  traditions: string[];
  time: string;
  range: string;
  targets: string;
  duration: string;
  /** Salvación que pide el hechizo; la tira el objetivo, no el lanzador. */
  defense: string | null;
  basicSave: boolean;
  damage: SpellDamage[];
  /** Escalado por rango: { type: 'interval', interval: 1, damage: { '0': '2d6' } } */
  heightening: { type: string; interval?: number; damage?: Record<string, string> } | null;
  area: string;
  cost: string;
}
