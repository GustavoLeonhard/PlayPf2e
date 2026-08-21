import type { Equipment, Feat, Spell } from '../models/content.model';
import { formatCp, priceToCp } from './money';
import { avisosDe, esAplicable, selectoresDe, valorDe, type Effect } from './efectos';
import { efectoAMano } from './efectos-a-mano';
import { dadosPorStriking, fichaDeRuna, resumenDeRunas } from './runas';

/** Una línea de la ficha: "Daño — 1d8 slashing". */
export interface Dato {
  etiqueta: string;
  valor: string;
}

/**
 * Los datos técnicos que el manual imprime arriba de la descripción.
 *
 * La descripción sola no alcanza para decidir en la mesa: el texto de la
 * espada larga habla de la hoja, no dice que hace 1d8 ni que ocupa una mano.
 *
 * Se omite lo que está vacío en vez de mostrar un guion: una lista de veinte
 * renglones donde quince dicen "—" es peor que una de cinco.
 */

const TIPOS: Record<string, string> = {
  weapon: 'Arma',
  armor: 'Armadura',
  shield: 'Escudo',
  equipment: 'Equipo',
  consumable: 'Consumible',
  treasure: 'Tesoro',
  backpack: 'Contenedor',
  kit: 'Kit',
};

const CATEGORIAS: Record<string, string> = {
  simple: 'Simple',
  martial: 'Marcial',
  advanced: 'Avanzada',
  unarmed: 'Desarmada',
  unarmored: 'Sin armadura',
  light: 'Ligera',
  medium: 'Media',
  heavy: 'Pesada',
};

/** El dataset guarda las manos dentro del `usage`, no en un campo aparte. */
const USOS: Record<string, string> = {
  'held-in-one-hand': '1 mano',
  'held-in-two-hands': '2 manos',
  'held-in-one-plus': '1 mano (2 para algunos usos)',
  'worn-armor': 'Vestida',
  worn: 'Llevada encima',
  'worn-gloves': 'Guantes',
  'worn-backpack': 'A la espalda',
  bulwark: 'Bulwark',
};

const RAREZAS: Record<string, string> = {
  common: 'Común',
  uncommon: 'Poco común',
  rare: 'Rara',
  unique: 'Única',
};

/** "versatile-p" -> "versatile p". Los rasgos del dataset vienen en slug. */
const legible = (t: string) => t.replace(/-/g, ' ');

/**
 * El bulk se guarda en números: 0.1 es un objeto liviano ("L" en la mesa) y 0
 * es algo que no pesa nada, no un dato faltante.
 */
export function formatBulk(bulk: number | null | undefined): string | null {
  if (bulk == null) return null;
  if (bulk === 0) return '—';
  if (bulk < 1) return 'L';
  return String(bulk);
}

export function datosDeEquipo(item: Equipment): Dato[] {
  const datos: Dato[] = [];
  const push = (etiqueta: string, valor: string | number | null | undefined) => {
    if (valor !== null && valor !== undefined && valor !== '') datos.push({ etiqueta, valor: String(valor) });
  };

  push('Tipo', TIPOS[item.type] ?? item.type);
  if (item.level > 0) push('Nivel', item.level);
  // Un artefacto no tiene precio: "0 gp" diría que es gratis.
  const cp = priceToCp(item.price);
  push('Precio', cp > 0 ? formatCp(cp) : null);
  push('Volumen', formatBulk(item.bulk));
  push('Manos', USOS[item.usage] ?? (item.usage ? legible(item.usage) : null));
  push('Categoría', item.category ? (CATEGORIAS[item.category] ?? item.category) : null);
  push('Grupo', item.group ? legible(item.group) : null);

  // Arma. Con striking se muestran los dados que se tiran de verdad, porque
  // "1d8" al lado de "greater striking" se lee como una contradicción.
  const dados = item.damage ? item.damage.dice * dadosPorStriking(item.runes?.striking ?? 0) : 0;
  const base = item.damage && dados !== item.damage.dice ? ` (base ${item.damage.dice}${item.damage.die})` : '';
  push('Daño', item.damage ? `${dados}${item.damage.die} ${item.damage.damageType}${base}` : null);
  push('Alcance', item.range ? `${item.range} pies` : null);
  // El pack usa "-" para "no se recarga"; no es un número de acciones.
  const recarga = item.reload && item.reload !== '-' && item.reload !== '0' ? item.reload : null;
  push('Recarga', recarga ? `${recarga} ${recarga === '1' ? 'acción' : 'acciones'}` : null);

  // Armadura y escudo
  push('Bonus a la CA', item.acBonus != null ? `+${item.acBonus}` : null);
  push('Máx. Destreza', item.dexCap != null ? `+${item.dexCap}` : null);
  push('Penalidad de chequeos', item.checkPenalty || null);
  push('Penalidad de velocidad', item.speedPenalty ? `${item.speedPenalty} pies` : null);
  push('Requisito de Fuerza', item.strength ? `Fue ${item.strength}` : null);
  /*
   * Dureza y PV vienen en cero para TODA la armadura, y NO es culpa del
   * importador: el pack de origen los trae en cero (Foundry los deriva del
   * material en tiempo de ejecución). Los escudos sí los traen, y se muestran.
   * Un "Dureza 0" sería peor que no mostrar nada, porque parece un dato.
   */
  push('Dureza', item.hardness || null);
  push('PV', item.maxHp || null);

  push('Runas', resumenDeRunas(item.runes));
  // Cada runa de propiedad con lo que hace, en un renglón: el resumen
  // ("+1 striking flaming") dice cuáles tenés, no qué hacen.
  for (const r of item.runes?.property ?? []) {
    const ficha = fichaDeRuna(r);
    datos.push({ etiqueta: ficha.nombre, valor: ficha.resumen });
  }
  push('Material', item.material ? [item.material.grade, item.material.type].filter(Boolean).join(' ') : null);
  push('Rasgos', item.traits.length ? item.traits.map(legible).join(', ') : null);
  if (item.rarity && item.rarity !== 'common') push('Rareza', RAREZAS[item.rarity] ?? item.rarity);
  push('Fuente', item.source);

  return datos;
}

/**
 * El tiempo de lanzamiento viene como número pelado cuando son acciones ("2",
 * "1 to 3") y como texto cuando no ("1 minute", "reaction"). Un "2" solo no se
 * lee: hay que decir de qué son esos dos.
 */
export function tiempoDeLanzamiento(time: string): string {
  if (!time) return time;
  if (time === 'reaction') return 'Reacción';
  if (time === 'free') return 'Acción libre';
  if (/^\d+( (to|or) \d+)?$/.test(time)) return `${time} ${time === '1' ? 'acción' : 'acciones'}`;
  return time;
}

export function datosDeConjuro(spell: Spell): Dato[] {
  const datos: Dato[] = [];
  const push = (etiqueta: string, valor: string | number | null | undefined) => {
    if (valor !== null && valor !== undefined && valor !== '') datos.push({ etiqueta, valor: String(valor) });
  };

  const cantrip = spell.traits.includes('cantrip');
  push('Rango', cantrip ? `Truco (rango ${spell.level})` : spell.level);
  push('Tradiciones', spell.traditions.length ? spell.traditions.join(', ') : null);
  // El dataset guarda el tiempo de lanzamiento como un número pelado cuando son
  // acciones ("2"), y como texto cuando no ("1 minute"). Un "2" solo no se lee.
  push('Lanzamiento', tiempoDeLanzamiento(spell.time));
  push('Coste', spell.cost);
  push('Alcance', spell.range);
  push('Área', spell.area);
  push('Objetivos', spell.targets);
  push('Duración', spell.duration);
  // "basic Reflex" se lee distinto que "Reflex": el básico usa la tabla de daño
  // por grado de éxito, así que la distinción tiene que verse.
  push('Defensa', spell.defense ? `${spell.basicSave ? 'básica ' : ''}${spell.defense}` : null);
  push('Daño', spell.damage.length ? spell.damage.map((d) => `${d.formula} ${d.type}`.trim()).join(' + ') : null);
  push('Rasgos', spell.traits.length ? spell.traits.map(legible).join(', ') : null);
  if (spell.rarity && spell.rarity !== 'common') push('Rareza', RAREZAS[spell.rarity] ?? spell.rarity);
  push('Fuente', spell.source);

  return datos;
}

/** Duración y qué mueve, para el ⓘ de un efecto activo. */
export function datosDeEfecto(efecto: Effect): Dato[] {
  const datos: Dato[] = [];
  const push = (etiqueta: string, valor: string | number | null | undefined) => {
    if (valor !== null && valor !== undefined && valor !== '') datos.push({ etiqueta, valor: String(valor) });
  };

  push('Duración', duracionLegible(efecto.duration));
  if (efecto.level > 0) push('Nivel', efecto.level);

  // Lo que efectivamente mueve, resuelto: es la pregunta que trae a alguien acá.
  const mueve = efecto.rules
    .filter(esAplicable)
    .map((r) => `${signo(valorDe(r)!)} ${r.type ?? 'sin tipo'} a ${selectoresDe(r).join(', ')}`);
  push('Modifica', mueve.length ? mueve.join(' · ') : null);

  // Para los de la tabla escrita a mano mandan sus avisos: los deducidos del
  // pack dirían "la hoja no calcula X" justo de lo que la tabla sí calcula.
  const aMano = efectoAMano(efecto.slug);
  for (const aviso of aMano?.avisos ?? avisosDe(efecto)) datos.push({ etiqueta: 'Ojo', valor: aviso });

  if (efecto.traits.length) push('Rasgos', efecto.traits.map(legible).join(', '));
  push('Fuente', efecto.source);
  return datos;
}

const signo = (n: number) => (n >= 0 ? `+${n}` : String(n));

function duracionLegible(d: { value: number; unit: string }): string {
  if (!d || d.unit === 'unlimited' || d.value < 0) return 'Hasta que la apagues';
  const unidades: Record<string, string> = {
    rounds: 'asalto',
    minutes: 'minuto',
    hours: 'hora',
    days: 'día',
  };
  const nombre = unidades[d.unit] ?? d.unit;
  return `${d.value} ${nombre}${d.value === 1 ? '' : 's'}`;
}

export function datosDeDote(feat: Feat): Dato[] {
  const datos: Dato[] = [];
  const push = (etiqueta: string, valor: string | number | null | undefined) => {
    if (valor !== null && valor !== undefined && valor !== '') datos.push({ etiqueta, valor: String(valor) });
  };

  push('Nivel', feat.level);
  push('Categoría', feat.category ? legible(feat.category) : null);
  // 'passive' no es una acción: es la ausencia de una. Decirlo es ruido.
  const accion = feat.actions != null ? String(feat.actions) : feat.actionType === 'passive' ? null : feat.actionType;
  push('Acciones', accion ? legible(accion) : null);
  push('Prerrequisitos', feat.prerequisites.length ? feat.prerequisites.join('; ') : null);
  push('Rasgos', feat.traits.length ? feat.traits.map(legible).join(', ') : null);
  if (feat.rarity && feat.rarity !== 'common') push('Rareza', RAREZAS[feat.rarity] ?? feat.rarity);
  push('Fuente', feat.source);

  return datos;
}
