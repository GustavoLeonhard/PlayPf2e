import type { Ability, ProficiencyRank } from './content.model';

/**
 * El personaje se guarda como LISTA DE ELECCIONES, no como hoja calculada.
 * La hoja se recalcula siempre desde aca (ver rules/character.engine.ts), asi
 * un arreglo de calculo o una correccion del dataset arregla los PJ existentes
 * sin migrarlos.
 */

export type ChoiceSlot =
  | 'classFeat'
  | 'ancestryFeat'
  | 'generalFeat'
  | 'skillFeat'
  | 'skillIncrease'
  | 'classFeature'
  | 'bonusFeat';

export interface Choice {
  level: number;
  slot: ChoiceSlot;
  /** id del feat/feature elegido; para skillIncrease se usa `skill`. */
  id?: string;
  skill?: string;
  /** Para `classFeature`: id del rasgo que abrio la eleccion (ej. Gunslinger's Way). */
  source?: string;
  /** indice dentro del mismo nivel cuando hay mas de un slot del mismo tipo */
  index?: number;
}

export interface AbilityBoosts {
  /** Elecciones libres de ancestria (cuando el set tiene 6 opciones). */
  ancestry: Ability[];
  background: Ability[];
  /** Key ability de clase (una eleccion si la clase ofrece varias). */
  class: Ability[];
  /** 4 boosts libres de nivel 1 y luego en 5, 10, 15, 20. */
  level1: Ability[];
  level5: Ability[];
  level10: Ability[];
  level15: Ability[];
  level20: Ability[];
}

export interface Favorite {
  kind: 'strike' | 'skill' | 'spell';
  /** strike: nombre del arma · skill: slug · spell: id del hechizo */
  ref: string;
  label: string;
}

/**
 * Un ataque natural: garras, colmillos, púas que se disparan… No es un objeto de
 * la mochila (no pesa, no se compra ni se vende, no se "equipa"), así que vive
 * aparte del inventario. Usa la proficiencia unarmed, igual que el puño.
 */
export interface NaturalWeapon {
  id: string;
  name: string;
  ranged: boolean;
  damageDice: number;
  damageDie: string;
  damageType: string;
  /** Traits libres: agile, finesse, reach, sweep… (sin fatal/deadly, que van aparte) */
  traits: string[];
  fatal?: string | null;
  deadly?: string | null;
  bonusAttack?: number;
  bonusDamage?: number;
  notes?: string;
}

export interface InventoryItem {
  id: string;
  quantity: number;
  equipped: boolean;
  invested?: boolean;
  /** Modificaciones del máster sobre esta arma. Ver CustomItem. */
  custom?: CustomItem;
  /**
   * Id del rasgo que te dio este objeto (el Clan Dagger de los enanos).
   *
   * Sirve para dos cosas: mostrarlo como otorgado en vez de comprado, y poder
   * cambiarlo si cambiás la elección, sin tocar lo que compraste vos.
   */
  grantedBy?: string;
}

/**
 * Modificaciones sobre un objeto, o un objeto inventado entero.
 *
 * Sirve para dos cosas:
 *  1. Cambiar algo de un objeto del dataset (un arma con dados distintos).
 *  2. Inventar uno que no existe ahi (la cuerda elfica que te dio el master): en ese
 *     caso el item del inventario no apunta a ningun id valido y todo sale de aca.
 *
 * Vive dentro del personaje porque una hoja quiere una foto de lo que tiene, no un
 * enlace que pueda cambiar por debajo. Lo que no se puede calcular va en `notes`.
 */
export interface CustomItem {
  name?: string;
  /** Para objetos inventados: cuanto pesa y cuanto vale (en cobre). */
  bulk?: number;
  priceCp?: number;
  damageDice?: number;
  damageDie?: string;
  damageType?: string;
  /**
   * Dado de crítico. Antes solo se podían tocar metiendo "fatal-d10" a mano en
   * el campo de traits; ahora son un campo propio, como el resto de las armas.
   */
  fatal?: string | null;
  deadly?: string | null;

  /**
   * Armadura y escudos. Mismo criterio que las armas: lo que el máster cambió
   * sobre el objeto del catálogo, o los valores enteros de uno inventado.
   */
  acBonus?: number;
  dexCap?: number;
  checkPenalty?: number;
  speedPenalty?: number;
  /** Fuerza requerida para ignorar la penalidad de chequeos. */
  strength?: number;
  hardness?: number;
  maxHp?: number;
  /** Entran al pipeline como bonus de objeto, igual que una runa de potencia. */
  bonusAttack?: number;
  bonusDamage?: number;
  traits?: string[];
  notes?: string;

  /**
   * Foto del arma base. Si algun dia se pierde la referencia al dataset (por ejemplo
   * tras reimportar con ids distintos), el arma sigue existiendo en la hoja.
   */
  base?: {
    name: string;
    damage: { dice: number; die: string; damageType: string } | null;
    category: string | null;
    group: string | null;
    traits: string[];
    range: number | null;
    acBonus?: number | null;
    dexCap?: number | null;
    checkPenalty?: number | null;
    speedPenalty?: number | null;
    strength?: number | null;
    hardness?: number | null;
    maxHp?: number | null;
  };
}

/** Lo permanente del personaje. Cambia al crear y al subir de nivel. */
export interface CharacterBuild {
  v: 1;
  name: string;
  level: number;
  ancestry: string | null;
  heritage: string | null;
  /**
   * La skill que promete la herencia (Skilled Heritage, Ancient Ash).
   *
   * Va aparte de `trainedSkills` porque no es una skill entrenada más: la
   * herencia la sube a experta en nivel 5, y para eso hay que saber que vino
   * de ahí.
   */
  heritageSkill?: string | null;
  background: string | null;
  class: string | null;
  /** id de la deidad; Cleric y Champion la necesitan, el resto es opcional. */
  deity: string | null;
  alignment: string | null;
  /** Detalles que no mueven ningun numero: son del jugador, no de las reglas. */
  age: string;
  appearance: string;
  /**
   * Retrato del personaje como data URL. Se achica a 256px antes de guardarlo:
   * viaja dentro del mismo jsonb que el resto, asi que no puede pesar megas.
   */
  portrait?: string;
  /**
   * Visión: normal, low-light-vision o darkvision. Por defecto sale de la
   * ancestría; esto pisa ese valor para cuando un rasgo, una maldición o el
   * máster te la cambia (ej. Ganzi con darkvision, o quedar ciego a un ojo).
   */
  visionOverride?: string | null;
  /**
   * Lo que el jugador quiere tener a mano arriba de todo: un ataque, una habilidad
   * o un conjuro. Guarda una referencia, no una copia: si el numero cambia, el
   * favorito lo refleja.
   */
  favorites: Favorite[];
  abilityBoosts: AbilityBoosts;
  /**
   * Puntuación escrita a mano, que pisa la que sale de los boosts.
   *
   * Los boosts son la fuente normal, pero no siempre alcanzan: un personaje
   * traído de otra app, un item que sube un atributo, una bendición del máster.
   * Antes de esto, la única forma de arreglar un número era rehacer los boosts.
   */
  abilityOverrides?: Partial<Record<Ability, number>>;
  /**
   * Rangos de proficiencia escritos a mano, que pisan lo que sale de la clase,
   * el trasfondo y los feats.
   *
   * Mismo motivo que abilityOverrides: un item, un arquetipo que la app no
   * modela, o un personaje traído de otra herramienta. Un rango puesto acá
   * manda, aunque sea MENOR que el calculado (bajar algo es tan válido como
   * subirlo, y "upgrade" nunca dejaría bajarlo).
   *
   * Las claves: en skills el slug de la habilidad o `lore:x`; en strikes el id
   * del arma (dos espadas largas iguales comparten id, y comparten el ajuste);
   * en defenses la categoría de armadura (unarmored/light/medium/heavy).
   */
  proficiencyOverrides?: {
    skills?: Record<string, ProficiencyRank>;
    strikes?: Record<string, ProficiencyRank>;
    defenses?: Record<string, ProficiencyRank>;
  };
  choices: Choice[];
  /** Skills entrenadas por eleccion libre de clase (las adicionales). */
  trainedSkills: string[];
  /**
   * Lores agregados a mano, entrenados.
   *
   * Additional Lore y compañía no traen NINGUNA regla en el pack: el nombre del
   * lore es texto libre que inventa el jugador ("Circus Lore", "Underworld
   * Lore"). No hay lista de dónde elegir, así que se escriben.
   */
  extraLores?: string[];
  /**
   * Elecciones que abren los rasgos de ancestría y clase, por id del rasgo.
   *
   * El caso que la trajo: el Clan Dagger de los enanos te deja elegir entre la
   * daga y la pistola, y cada opción otorga un arma distinta.
   */
  featureChoices?: Record<string, string>;
  /**
   * Las habilidades libres que ganaste porque algo te entrenó en una que ya
   * tenías (la regla de entrenamiento repetido).
   *
   * La clave identifica de dónde salió la deuda (`religion:Acolyte`), así que
   * si cambiás de trasfondo la deuda desaparece y la elección con ella.
   */
  skillReplacements?: Record<string, string>;
  /**
   * Idiomas elegidos, ademas de los que da la ancestria. Puede haber inventados por
   * el master: se guardan tal cual se escribieron, no hay una lista cerrada.
   */
  languages: string[];
  inventory: InventoryItem[];
  /**
   * Ignorar la carga: muchas mesas no llevan la cuenta del bulk. Con esto
   * prendido la hoja deja de avisar que estás encumbered o pasado del máximo.
   */
  ignoreBulk?: boolean;
  /** Garras, colmillos, púas… ver NaturalWeapon. */
  naturalWeapons: NaturalWeapon[];
  /** Advertencias que el usuario marcó como resueltas (por id, ver Warning). */
  acknowledgedWarnings: string[];
  notes: string;
  /**
   * Repertorio de un lanzador espontáneo: es permanente, por eso vive en el build.
   * Un lanzador preparado (Wizard, Cleric) prepararía en `state`, que cambia a diario.
   */
  spellcasting: {
    cantrips: string[];
    /** ids de hechizos por rango: { "1": [...], "2": [...] } */
    repertoire: Record<string, string[]>;
    /**
     * Un signature spell por rango: { "1": "<id>" }. Solo estos se pueden heightear,
     * y solo desde nivel 3, cuando la clase gana el rasgo Signature Spells.
     */
    signature: Record<string, string>;
    /** Wizard: su libro de hechizos, del que prepara cada día. Es permanente. */
    spellbook: string[];
    /**
     * Focus spells que tiene el personaje. En el dataset ninguna fuente los otorga
     * de forma estructurada, así que se eligen a mano (el linaje sí los nombra en su
     * texto, y esos se sugieren).
     */
    focusSpells: string[];
  };
  spells: null;
}

/** Lo efimero: cambia round a round, ciclo de vida distinto al build. */
export interface CharacterState {
  hp: { current: number; temp: number };
  heroPoints: number;
  conditions: { id: string; value?: number }[];
  /**
   * Efectos: rabia, garbo, heroism… Lo mismo que una condición, salvo que
   * estos los elegís vos. Guardan solo el id; el efecto sale del pack.
   *
   * La lista es lo que tenés A MANO, no lo que está pasando: un bárbaro deja
   * la furia puesta y la prende y apaga en cada pelea, sin volver a buscarla.
   * `active` ausente = activo, porque antes estar en la lista era estarlo.
   */
  effects?: { id: string; active?: boolean }[];
  focusPoints: number;
  /**
   * Escudo: si esta alzado (dura hasta el inicio de tu proximo turno) y como
   * esta de HP.
   *
   * `hp` es OPCIONAL, y esa es la diferencia entre "todavia no le pego nadie" y
   * "esta destruido". Guardando un cero para el primer caso, un escudo recien
   * equipado aparecia roto: cero es un valor legitimo, no un "sin dato".
   */
  shield: { raised: boolean; hp?: number };
  /**
   * Garbo (panache) del Swashbuckler. Es binario: lo tenés o no lo tenés, no se
   * acumula. Dura entre turnos y se pierde al usar un finisher o al terminar el
   * encuentro, así que se apaga a mano como el escudo alzado.
   */
  panache?: boolean;
  /** Monedas actuales, en cobre. Cambia todo el tiempo, por eso va en el estado. */
  coins: number;
  /**
   * Las mismas monedas, pero como las tenés en la mano: 15 gp son 15 gp, no
   * 1 pp y 5 gp. `coins` sigue siendo el total en cobre para comprar y vender;
   * esto es cómo está repartido. Comprar sí reacomoda la bolsa, porque te dan vuelto.
   */
  purse?: { pp: number; gp: number; sp: number; cp: number };
  spellSlotsUsed: Record<string, number>;
  /**
   * Conjuros preparados hoy, por rango: { "1": ["<id>", null] }.
   * Va en el estado y no en el build porque se rearma en cada descanso diario.
   */
  preparedSpells: Record<string, (string | null)[]>;
}

export interface CharacterRecord {
  id: string;
  user_id?: string;
  name: string;
  level: number;
  build: CharacterBuild;
  state: CharacterState;
  updated_at?: string;
}

export function emptyBuild(): CharacterBuild {
  return {
    v: 1,
    name: '',
    level: 1,
    ancestry: null,
    heritage: null,
    background: null,
    class: null,
    deity: null,
    alignment: null,
    age: '',
    appearance: '',
    favorites: [],
    abilityBoosts: {
      ancestry: [],
      background: [],
      class: [],
      level1: [],
      level5: [],
      level10: [],
      level15: [],
      level20: [],
    },
    choices: [],
    trainedSkills: [],
    languages: [],
    inventory: [],
    naturalWeapons: [],
    acknowledgedWarnings: [],
    notes: '',
    spellcasting: { cantrips: [], repertoire: {}, signature: {}, spellbook: [], focusSpells: [] },
    spells: null,
  };
}

export function emptyState(): CharacterState {
  return {
    hp: { current: 0, temp: 0 },
    heroPoints: 1,
    conditions: [],
    focusPoints: 0,
    shield: { raised: false },
    panache: false,
    coins: 0,
    purse: { pp: 0, gp: 0, sp: 0, cp: 0 },
    spellSlotsUsed: {},
    preparedSpells: {},
  };
}
