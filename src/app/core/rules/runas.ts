/**
 * Runas de arma y armadura.
 *
 * Reglas verificadas contra la fuente Legacy del proyecto (Notebook LM,
 * 2026-08-20):
 *
 * - **Potency** (+1/+2/+3): bonus de OBJETO a las tiradas de ataque. No suma
 *   daño. En armadura, sube el bonus de objeto a la CA que ya da la armadura.
 * - **Striking**: multiplica los DADOS del arma — Striking 2, Greater 3, Major
 *   4 — del mismo tamaño que el original. No toca los modificadores planos
 *   (Fuerza, dotes, Weapon Specialization), que quedan igual.
 * - **Resilient**: bonus de objeto a las TRES salvaciones (+1/+2/+3).
 *
 * Los efectos de las runas de propiedad salen del texto del propio pack, no de
 * memoria: cada `resumen` de acá abajo es un resumen de la descripción que trae
 * el dataset.
 *
 * LO IMPORTANTE DE LA TABLA: casi ninguna runa de propiedad es un bonus plano
 * que se pueda sumar al total. El +2 de Slick es solo para Escapar y Colarse;
 * el +1 de Antimagic es solo contra efectos mágicos; el 1d6 de Disrupting es
 * solo contra no-muertos. Sumarlas al total de la hoja daría números inflados
 * en todas las tiradas que NO cumplen la condición. Por eso se clasifican, y
 * solo las incondicionales entran al cálculo.
 */

export interface Runes {
  potency: number;
  striking: number;
  resilient: number;
  property: string[];
}

/** Daño que suma una runa. `contra` vacío = siempre; con texto = solo contra eso. */
export interface DanoDeRuna {
  formula: string;
  type: string;
  contra?: string;
}

export interface DatosRuna {
  nombre: string;
  /** Qué hace, en un renglón. */
  resumen: string;
  /** Daño extra. El que no tiene `contra` entra al cálculo; el resto se muestra. */
  dano?: DanoDeRuna[];
  /**
   * Bonus que la hoja NO aplica porque depende de algo que no puede evaluar
   * ("solo para Escapar", "solo contra magia"). Se muestra, no se suma.
   */
  bonoCondicional?: string;
}

/**
 * Las 44 runas de propiedad que aparecen en el pack.
 *
 * Cerrar la lista es a propósito: si mañana el pack trae una runa nueva, se ve
 * enseguida como "sin ficha" en vez de desaparecer sin ruido.
 */
export const RUNAS: Record<string, DatosRuna> = {
  // --- daño elemental incondicional -------------------------------------
  flaming: { nombre: 'Flaming', resumen: '+1d6 de fuego.', dano: [{ formula: '1d6', type: 'fire' }] },
  greaterFlaming: {
    nombre: 'Greater Flaming',
    resumen: '+1d6 de fuego, y fuego persistente en un crítico.',
    dano: [{ formula: '1d6', type: 'fire' }],
  },
  frost: { nombre: 'Frost', resumen: '+1d6 de frío.', dano: [{ formula: '1d6', type: 'cold' }] },
  greaterFrost: {
    nombre: 'Greater Frost',
    resumen: '+1d6 de frío, y puede dejar al objetivo ralentizado en un crítico.',
    dano: [{ formula: '1d6', type: 'cold' }],
  },
  shock: { nombre: 'Shock', resumen: '+1d6 de electricidad.', dano: [{ formula: '1d6', type: 'electricity' }] },
  greaterShock: {
    nombre: 'Greater Shock',
    resumen: '+1d6 de electricidad, que salta a otras criaturas en un crítico.',
    dano: [{ formula: '1d6', type: 'electricity' }],
  },
  corrosive: { nombre: 'Corrosive', resumen: '+1d6 de ácido.', dano: [{ formula: '1d6', type: 'acid' }] },
  greaterCorrosive: {
    nombre: 'Greater Corrosive',
    resumen: '+1d6 de ácido, que además corroe la armadura en un crítico.',
    dano: [{ formula: '1d6', type: 'acid' }],
  },
  thundering: { nombre: 'Thundering', resumen: '+1d6 sónico.', dano: [{ formula: '1d6', type: 'sonic' }] },
  greaterThundering: {
    nombre: 'Greater Thundering',
    resumen: '+1d6 sónico, y puede ensordecer en un crítico.',
    dano: [{ formula: '1d6', type: 'sonic' }],
  },
  greaterImpactful: {
    nombre: 'Greater Impactful',
    resumen: '+1d6 de fuerza; en un crítico podés empujar 10 pies.',
    dano: [{ formula: '1d6', type: 'force' }],
  },

  // --- daño solo contra cierto objetivo ----------------------------------
  disrupting: {
    nombre: 'Disrupting',
    resumen: '+1d6 positivo contra no-muertos; en un crítico quedan enfeebled 1.',
    dano: [{ formula: '1d6', type: 'positive', contra: 'no-muertos' }],
  },
  greaterDisrupting: {
    nombre: 'Greater Disrupting',
    resumen: '+2d6 positivo contra no-muertos, con salvación de incapacitación en un crítico.',
    dano: [{ formula: '2d6', type: 'positive', contra: 'no-muertos' }],
  },
  holy: {
    nombre: 'Holy',
    resumen: '+1d6 de espíritu contra objetivos malignos. Si sos maligno, quedás enfeebled 2 al empuñarla.',
    dano: [{ formula: '1d6', type: 'spirit', contra: 'objetivos malignos' }],
  },
  unholy: {
    nombre: 'Unholy',
    resumen: '+1d6 de espíritu contra objetivos buenos. Si sos bueno, quedás enfeebled 2 al empuñarla.',
    dano: [{ formula: '1d6', type: 'spirit', contra: 'objetivos buenos' }],
  },
  bane: {
    nombre: 'Bane',
    resumen: '+1d6 del tipo de daño del arma contra el tipo de criatura elegido al forjarla.',
    dano: [{ formula: '1d6', type: 'del arma', contra: 'el tipo elegido' }],
  },
  brilliant: {
    nombre: 'Brilliant',
    resumen: '+1d4 de fuego siempre, y 1d4 más contra diablos y no-muertos. Puede cegar en un crítico.',
    dano: [
      { formula: '1d4', type: 'fire' },
      { formula: '1d4', type: 'spirit', contra: 'diablos' },
      { formula: '1d4', type: 'vitality', contra: 'no-muertos' },
    ],
  },
  greaterBrilliant: {
    nombre: 'Greater Brilliant',
    resumen: 'Como Brilliant, y el daño ignora las resistencias del objetivo.',
    dano: [
      { formula: '1d4', type: 'fire' },
      { formula: '1d4', type: 'spirit', contra: 'diablos' },
      { formula: '1d4', type: 'vitality', contra: 'no-muertos' },
    ],
  },

  // --- daño persistente al impactar ---------------------------------------
  // Va como condicional aunque no dependa del objetivo: el daño persistente no
  // se resuelve en el golpe, lo tira el objetivo al final de su turno.
  wounding: {
    nombre: 'Wounding',
    resumen: 'Al impactar, 1d6 de sangrado persistente.',
    dano: [{ formula: '1d6', type: 'bleed', contra: 'persistente, al impactar' }],
  },
  ashen: {
    nombre: 'Ashen',
    resumen: 'Al impactar, 1d4 de fuego persistente y ceniza que estorba los sentidos.',
    dano: [{ formula: '1d4', type: 'fire', contra: 'persistente, al impactar' }],
  },
  greaterAshen: {
    nombre: 'Greater Ashen',
    resumen: 'Al impactar, 1d8 de fuego persistente y ceniza que estorba los sentidos.',
    dano: [{ formula: '1d8', type: 'fire', contra: 'persistente, al impactar' }],
  },

  // --- bonus que dependen de la situación ---------------------------------
  greaterSlick: {
    nombre: 'Greater Slick',
    resumen: 'Armadura resbalosa.',
    bonoCondicional: '+2 de objeto a Acrobatics, pero solo para Escapar y Colarse',
  },
  antimagic: {
    nombre: 'Antimagic',
    resumen: 'Desplaza la energía mágica.',
    bonoCondicional: '+1 de estado a las salvaciones, pero solo contra efectos mágicos',
  },
  underwater: {
    nombre: 'Underwater',
    resumen: 'El arma funciona igual bajo el agua.',
    bonoCondicional: 'ignora las penalidades por pelear en el agua',
  },
  fireResistant: { nombre: 'Fire Resistant', resumen: 'Resistencia al fuego mientras la llevás puesta.' },
  greaterAcidResistant: { nombre: 'Greater Acid Resistant', resumen: 'Resistencia al ácido mientras la llevás puesta.' },

  // --- efectos que se disparan en la mesa ---------------------------------
  keen: { nombre: 'Keen', resumen: 'Un 19 en el dado es crítico, si además el resultado ya era un éxito.' },
  speed: { nombre: 'Speed', resumen: 'Quickened: una acción extra por turno, solo para Golpear con esta arma.' },
  returning: { nombre: 'Returning', resumen: 'Al arrojarla, vuelve a tu mano después del Golpe.' },
  ghostTouch: { nombre: 'Ghost Touch', resumen: 'Daña criaturas incorpóreas con normalidad.' },
  fearsome: { nombre: 'Fearsome', resumen: 'En un crítico, el objetivo queda frightened 1.' },
  greaterFearsome: { nombre: 'Greater Fearsome', resumen: 'En un crítico, el objetivo queda frightened 2.' },
  grievous: { nombre: 'Grievous', resumen: 'Un beneficio extra en el crítico, según el grupo del arma.' },
  shifting: { nombre: 'Shifting', resumen: 'Se transforma en otra arma cuerpo a cuerpo de las mismas manos.' },
  extending: { nombre: 'Extending', resumen: 'Un Golpe con alcance de 60 pies.' },
  greaterExtending: { nombre: 'Greater Extending', resumen: 'Un Golpe con alcance de 120 pies.' },
  dancing: { nombre: 'Dancing', resumen: 'El arma vuela y pelea sola contra tu último enemigo.' },
  spellStoring: { nombre: 'Spell-storing', resumen: 'Guarda un conjuro de rango 3 o menor para soltarlo al impactar.' },
  hopeful: { nombre: 'Hopeful', resumen: 'En un crítico, inspira a tus aliados a 30 pies.' },
  deathless: { nombre: 'Deathless', resumen: 'Una vez por día, reduce en 1 el Doomed o Wounded que ganes.' },
  fortification: {
    nombre: 'Fortification',
    resumen: 'Ante un crítico en tu contra, tirás para convertirlo en un impacto normal. Suma bulk.',
  },
  greaterFortification: {
    nombre: 'Greater Fortification',
    resumen: 'Como Fortification, con más chances de anular el crítico.',
  },
  invisibility: { nombre: 'Invisibility', resumen: 'Una vez por día, invisible 1 minuto.' },
  greaterInvisibility: { nombre: 'Greater Invisibility', resumen: 'Tres veces por día, invisible 1 minuto.' },
  glamered: { nombre: 'Glamered', resumen: 'La armadura se disfraza de ropa común. Las estadísticas no cambian.' },
};

/** Cuántos dados tira el arma con esa runa: sin runa 1, Striking 2, Greater 3, Major 4. */
export function dadosPorStriking(striking: number): number {
  return striking > 0 ? striking + 1 : 1;
}

/** La ficha de una runa, o una mínima si el pack trajo una que la tabla no conoce. */
export function fichaDeRuna(runa: string): DatosRuna {
  return RUNAS[runa] ?? { nombre: nombreDeRuna(runa), resumen: 'Sin ficha todavía: ver la descripción del objeto.' };
}

/**
 * El daño que SÍ entra al cálculo: el que no depende del objetivo.
 *
 * Va en una línea aparte del dado del arma porque las resistencias y
 * debilidades se aplican por tipo de daño, y este dado no se duplica en un
 * crítico.
 */
export function danoDeRunas(property: string[]): { formula: string; type: string; source: string }[] {
  return property.flatMap((r) =>
    (RUNAS[r]?.dano ?? [])
      .filter((d) => !d.contra)
      .map((d) => ({ formula: d.formula, type: d.type, source: RUNAS[r].nombre })),
  );
}

/** El daño que depende del objetivo: se muestra, no se suma. */
export function danoCondicionalDeRunas(
  property: string[],
): { formula: string; type: string; contra: string; source: string }[] {
  return property.flatMap((r) =>
    (RUNAS[r]?.dano ?? [])
      .filter((d) => d.contra)
      .map((d) => ({ formula: d.formula, type: d.type, contra: d.contra!, source: RUNAS[r].nombre })),
  );
}

/** Los bonus que la hoja no puede evaluar sola. Se muestran como aviso. */
export function bonosCondicionalesDeRunas(property: string[]): { source: string; texto: string }[] {
  return property
    .map((r) => (RUNAS[r]?.bonoCondicional ? { source: RUNAS[r].nombre, texto: RUNAS[r].bonoCondicional! } : null))
    .filter((x): x is { source: string; texto: string } => x !== null);
}

/** "greaterFlaming" -> "Greater Flaming". El dataset las guarda en camelCase. */
export function nombreDeRuna(runa: string): string {
  return RUNAS[runa]?.nombre ?? runa.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** Las runas escritas como se leen en la mesa: "+1 striking flaming". */
export function resumenDeRunas(runes: Runes | null | undefined): string {
  if (!runes) return '';

  const partes: string[] = [];
  if (runes.potency) partes.push(`+${runes.potency}`);
  if (runes.striking) partes.push(['', 'striking', 'greater striking', 'major striking'][runes.striking] ?? 'striking');
  if (runes.resilient) partes.push(['', 'resilient', 'greater resilient', 'major resilient'][runes.resilient] ?? 'resilient');
  partes.push(...runes.property.map((r) => nombreDeRuna(r).toLowerCase()));
  return partes.join(' ');
}

/** Un arma o armadura sin runas: lo que se le pone a las sintéticas (el Puño). */
export const SIN_RUNAS: Runes = { potency: 0, striking: 0, resilient: 0, property: [] };
