/**
 * Dinero. Todo se calcula en cobre para no arrastrar errores de redondeo.
 *
 * FUENTE: "Step 8: Buy Equipment" (https://2e.aonprd.com/Rules.aspx?ID=2038) —
 * "At 1st level, your character has 15 gold pieces (150 silver pieces) to spend".
 *
 * OJO: esa pagina de AoN es la version Remaster; no encontre una equivalente con
 * banner Legacy. El valor y la conversion no cambiaron entre ediciones, pero queda
 * anotado como el unico numero del proyecto que no pude verificar contra una fuente
 * marcada como Legacy.
 */

export interface Price {
  pp?: number;
  gp?: number;
  sp?: number;
  cp?: number;
}

/** 1 pp = 10 gp = 100 sp = 1000 cp */
const EN_COBRE = { pp: 1000, gp: 100, sp: 10, cp: 1 } as const;

export const STARTING_MONEY_CP = 15 * EN_COBRE.gp;

export function priceToCp(price: Price | null | undefined): number {
  if (!price) return 0;
  return (Object.keys(EN_COBRE) as (keyof typeof EN_COBRE)[]).reduce(
    (total, moneda) => total + (price[moneda] ?? 0) * EN_COBRE[moneda],
    0,
  );
}

/**
 * 1505 -> "15 gp 5 cp". Se omiten las monedas en cero.
 * No se usa platino al mostrar: en la mesa nadie dice "1 pp 5 gp", dice "15 gp".
 */
export function formatCp(cp: number): string {
  if (cp <= 0) return '0 gp';

  const partes: string[] = [];
  let resto = cp;
  for (const moneda of ['gp', 'sp', 'cp'] as const) {
    const cantidad = Math.floor(resto / EN_COBRE[moneda]);
    if (cantidad > 0) {
      partes.push(`${cantidad} ${moneda}`);
      resto -= cantidad * EN_COBRE[moneda];
    }
  }
  return partes.join(' ');
}

/**
 * 12345 -> { pp: 12, gp: 3, sp: 4, cp: 5 }.
 *
 * A diferencia de formatCp, acá sí se usa el platino: la bolsa del personaje muestra
 * las cuatro monedas que existen, y el jugador escribe en cada una.
 */
export function splitCp(total: number): Required<Price> {
  let resto = Math.max(0, Math.round(total));
  const bolsa = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const moneda of ['pp', 'gp', 'sp', 'cp'] as const) {
    bolsa[moneda] = Math.floor(resto / EN_COBRE[moneda]);
    resto -= bolsa[moneda] * EN_COBRE[moneda];
  }
  return bolsa;
}
