import { RAGE_SLUG, rageSheet } from './rabia';

/**
 * Efectos que el pack trae vacíos y nosotros sí sabemos calcular.
 *
 * De los 1418 efectos, 1001 no traen ningún número: Foundry los resuelve en
 * código, no en los datos. La mayoría son narrativos de verdad y está bien que
 * queden como recordatorio, pero unos pocos son mecánica pura y conocida —la
 * furia, alzar el escudo— y merecen calcularse.
 *
 * Esta tabla es la lista de esos pocos. Crece de a uno, y solo con reglas
 * confirmadas contra la fuente Legacy del proyecto: un efecto mal calculado es
 * peor que uno no calculado, porque el número se ve igual de cierto.
 *
 * Hay dos formas de resolverlos:
 *
 * 1. **Propio**: la regla se escribe en su archivo de `rules/` y el motor la
 *    aplica (la furia, en `rabia.ts`).
 * 2. **Puente**: la hoja YA lo maneja por otro lado y el efecto solo prende ese
 *    interruptor. Alzar el escudo es el caso: tiene su propio botón y su propio
 *    bonus de circunstancia. Sin el puente, prenderlo acá lo contaría dos veces.
 */

export interface EfectoAMano {
  /** Qué hace, en un renglón. Reemplaza al cartel de "solo texto". */
  resumen: string;
  /**
   * Lo que el efecto obliga o impide y la hoja no puede hacer cumplir.
   *
   * Reemplazan a los avisos deducidos de las reglas del pack: para un efecto
   * de esta tabla, ese aviso diría "la hoja no calcula X" cuando justamente
   * la tabla existe porque sí lo calcula.
   */
  avisos?: string[];
  /**
   * El estado de la hoja que este efecto representa, si ya existe uno. Prender
   * el efecto prende ese estado, y no se suma ningún modificador aparte.
   */
  puente?: 'shield';
}

export const RAISE_SHIELD_SLUG = 'effect-raise-a-shield';

export const EFECTOS_A_MANO: Record<string, EfectoAMano> = {
  [RAGE_SLUG]: {
    resumen: '+2 al daño cuerpo a cuerpo (la mitad si es agile), −1 a la CA y HP temporales.',
    // Los números salen de rabia.ts; acá van las reglas que no son números.
    avisos: rageSheet(1, 0).avisos,
  },
  [RAISE_SHIELD_SLUG]: {
    resumen: 'El bonus del escudo a la CA hasta el inicio de tu próximo turno.',
    avisos: ['se baja solo al inicio de tu próximo turno: acordate de apagarlo'],
    puente: 'shield',
  },
};

export const efectoAMano = (slug: string): EfectoAMano | null => EFECTOS_A_MANO[slug] ?? null;

/** Si la hoja mueve algún número por este efecto, venga del pack o de acá. */
export const seCalcula = (slug: string, traeReglas: boolean): boolean => traeReglas || !!EFECTOS_A_MANO[slug];
