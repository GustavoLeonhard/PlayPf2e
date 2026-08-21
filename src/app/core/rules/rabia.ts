/**
 * La furia del bárbaro.
 *
 * Va escrita a mano y no sale del pack: el `Effect: Rage` de Foundry trae solo
 * los HP temporales, y el resto —el daño, la penalidad a la CA, la mitad si el
 * arma es agile— lo tiene en código, no en los datos. Ver `efectos.ts` para lo
 * que sí es automático.
 *
 * Reglas confirmadas con la fuente Legacy del proyecto (Notebook LM, 2026-08-21):
 *
 * - **+2 al daño** con armas cuerpo a cuerpo y ataques desarmados. Es FIJO: no
 *   sube con el nivel. Se reduce a la mitad si el arma es agile.
 * - **−1 a la CA**, SIN TIPO. Al no tener tipo acumula con todo, que es lo que
 *   corresponde: no compite con un bonus de objeto ni de estado.
 * - **HP temporales** = nivel + modificador de Constitución. Se fijan al entrar
 *   en furia; no se recalculan si subís de nivel en el medio, porque no se sube
 *   de nivel entre acciones de una aventura.
 * - Al salir de la furia se pierden los HP temporales que queden.
 */

/** El slug del efecto del pack con el que se prende. */
export const RAGE_SLUG = 'effect-rage';

export interface RageSheet {
  /** Daño extra con un arma normal. */
  damageBonus: number;
  /** Con un arma agile va la mitad. */
  agileDamageBonus: number;
  /** Penalidad a la CA. Sin tipo. */
  acPenalty: number;
  /** HP temporales al entrar en furia. */
  tempHp: number;
  /** Lo que la hoja no puede impedir por vos. */
  avisos: string[];
}

export function rageSheet(level: number, conMod: number): RageSheet {
  return {
    // Fijo toda la carrera. Weapon Specialization y las dotes van aparte y no
    // lo tocan; esto no escala.
    damageBonus: 2,
    agileDamageBonus: 1,
    acPenalty: -1,
    // Puede dar 0 o menos con Constitución baja a nivel 1; no se fuerza a un
    // mínimo porque la regla no lo dice.
    tempHp: level + conMod,
    avisos: [
      'no podés usar acciones con el rasgo concentrate, salvo que también tengan el rasgo rage',
      'no podés dejar de estar furioso voluntariamente',
      'al salir de la furia perdés los HP temporales que queden',
    ],
  };
}

/**
 * El daño extra que aporta la furia a un golpe.
 *
 * Solo cuerpo a cuerpo y desarmado: un arco no recibe nada. Un arma agile
 * recibe la mitad, que es la contrapartida de poder atacar más veces.
 */
export function rageDamage(rage: RageSheet | null, ranged: boolean, agile: boolean): number {
  if (!rage || ranged) return 0;
  return agile ? rage.agileDamageBonus : rage.damageBonus;
}
