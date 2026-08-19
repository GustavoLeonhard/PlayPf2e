/**
 * Garbo (panache), el recurso del Swashbuckler.
 *
 * FUENTE: consulta al Notebook LM del proyecto (PF2e Legacy), 2026-08-19. Los
 * números NO salen del dataset: `Precise Strike` y `Vivacious Speed` traen sus
 * rule elements con `value: null`, porque son progresiones por nivel y la
 * importación solo pudo quedarse con el selector y el predicado.
 *
 * Lo que define todo lo demás: **el garbo es binario**. No es un pool como los
 * focus points — lo tenés o no lo tenés. Por eso vive en el estado como un
 * booleano y no como un contador.
 *
 * Se gana con un éxito (no hace falta crítico) en Tumble Through o en la acción
 * de habilidad del estilo elegido. Se pierde al usar un finisher, o cuando
 * termina el encuentro. Entre turnos se mantiene.
 */

/** Bonus de estado a la velocidad por tener garbo, antes de Vivacious Speed. */
export const PANACHE_SPEED_BONUS = 5;

export interface PreciseStrikeDamage {
  /** Daño de precisión plano en un Strike normal. */
  flat: number;
  /** Cantidad de d6 de precisión si el Strike es parte de un finisher. */
  finisherDice: number;
}

/**
 * Precise Strike: +2 y 2d6 de base, y sube de a uno en los niveles 5, 9, 13 y 17.
 *
 *   nivel 1-4   +2   2d6
 *   nivel 5-8   +3   3d6
 *   nivel 9-12  +4   4d6
 *   nivel 13-16 +5   5d6
 *   nivel 17-20 +6   6d6
 *
 * Solo cuenta con armas cuerpo a cuerpo (o ataques desarmados) que sean agile
 * o finesse, y solo mientras tengas garbo.
 */
export function preciseStrike(level: number): PreciseStrikeDamage {
  const escalon = 2 + Math.floor((Math.max(1, level) - 1) / 4);
  return { flat: escalon, finisherDice: escalon };
}

export interface VivaciousSpeed {
  conGarbo: number;
  sinGarbo: number;
}

/**
 * Vivacious Speed (nivel 3): **reemplaza** el +5 del garbo, no se suma.
 *
 * Sube 5 pies en los niveles 7, 11, 15 y 19. Sin garbo te queda la mitad,
 * redondeada hacia abajo al incremento de 5 pies más cercano:
 *
 *   nivel 3   +10 con garbo   +5  sin
 *   nivel 7   +15             +5   (7,5 redondea a 5)
 *   nivel 11  +20             +10
 *   nivel 15  +25             +10  (12,5 redondea a 10)
 *   nivel 19  +30             +15
 */
export function vivaciousSpeed(level: number): VivaciousSpeed {
  const conGarbo = 10 + 5 * Math.floor((Math.max(3, level) - 3) / 4);
  return { conGarbo, sinGarbo: Math.floor(conGarbo / 2 / 5) * 5 };
}
