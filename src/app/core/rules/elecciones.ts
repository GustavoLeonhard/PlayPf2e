import type { Equipment, RuleElement } from '../models/content.model';
import { SKILLS } from './tables';

/**
 * Elecciones que abre un rasgo o una dote y que el jugador tiene que resolver.
 *
 * El pack las declara como `ChoiceSet`: una lista de opciones y un `flag` con
 * el que las demás reglas del MISMO ítem las referencian, sea por predicado
 * (`GrantItem` con `predicate: ["clan-pistol"]`) o por plantilla en el path
 * (`skills.{item|flags.pf2e.rulesSelections.skill}`).
 *
 * De 228 ChoiceSets del dataset, la mayoría son de sabor. Acá interesan los que
 * MUEVEN NÚMEROS: si no se resuelven, el personaje sale mal y en silencio, que
 * es exactamente lo que pasaba con la Skilled Heritage y el Clan Dagger.
 *
 * Las que se filtran por tag (la vía del gunslinger, el instinto, el linaje) no
 * entran acá: esas ya las resuelve `progression.ts` como elección de rasgo.
 */

export type TipoDeEleccion = 'objeto' | 'habilidad' | 'valor';

export interface OpcionDeEleccion {
  /** Lo que se guarda, y lo que nombran los predicados del ítem. */
  valor: string;
  etiqueta: string;
  /** Solo en las de tipo 'objeto': el objeto del catálogo que otorga. */
  itemId?: string;
}

/**
 * Una elección que la app NO sabe resolver: el pack la describe con un filtro
 * sobre otro pack ("una dote general de nivel 7 o menos"). Resolverla pide un
 * evaluador de predicados; mientras tanto se avisa, que es mucho mejor que
 * perderla en silencio.
 */
export interface EleccionAbierta {
  itemId: string;
  itemName: string;
  /** Qué hay que elegir, en palabras. */
  texto: string;
}

export interface EleccionDeRasgo {
  /** Id del rasgo o dote que abre la elección. Es la clave con la que se guarda. */
  itemId: string;
  itemName: string;
  tipo: TipoDeEleccion;
  opciones: OpcionDeEleccion[];
  elegido: string | null;
  /** Si la resolvió una dote en vez del jugador (Clan Pistol). */
  decididoPor: string | null;
}

/** Lo mínimo que hace falta de un rasgo o dote para leerle las elecciones. */
export interface ItemConReglas {
  id: string;
  name: string;
  rules?: RuleElement[];
}

/** Lo mínimo del catálogo: resolver un id a un objeto, siguiendo un salto. */
export interface BuscadorDeObjetos {
  equipo(id: string): Equipment | undefined;
  /** El objeto que otorga una dote intermedia (la pistola llega por una). */
  equipoIndirecto(id: string): Equipment | undefined;
}

/**
 * ¿Esta elección cambia algún número, o es puro sabor?
 *
 * Solo se pregunta por las que cambian algo. Preguntar por las 132 decorativas
 * sería convertir la hoja en un formulario.
 */
function tieneConsecuencia(item: ItemConReglas, valores: Set<string>): boolean {
  return (item.rules ?? []).some((r) => {
    if (r.key === 'Proficiency') return !!r.elegida || /\{/.test(r.path ?? '');

    /*
     * Un predicado referencia la elección de dos formas: nombrando una opción
     * ("clan-pistol") o con la plantilla `{item|flags…rulesSelections.x}`.
     * Specialty Crafting usa la segunda, y mirando solo la primera se quedaba
     * afuera justo la dote que abrió esta discusión.
     */
    return (r.predicate ?? []).some((p) => valores.has(p) || p.includes('{item|'));
  });
}

/** De qué tipo es la elección, según qué hacen las reglas con ella. */
function tipoDeEleccion(item: ItemConReglas, valores: Set<string>, objetos: BuscadorDeObjetos): TipoDeEleccion {
  const reglas = item.rules ?? [];

  const otorgaObjeto = reglas.some(
    (r) =>
      r.key === 'GrantItem' &&
      r.id &&
      (r.predicate ?? []).some((p) => valores.has(p)) &&
      (objetos.equipo(r.id) ?? objetos.equipoIndirecto(r.id)),
  );
  if (otorgaObjeto) return 'objeto';

  const tocaSkills = reglas.some((r) => r.key === 'Proficiency' && (r.elegida || (r.path ?? '').startsWith('skills.')));
  if (tocaSkills) return 'habilidad';

  return 'valor';
}

/**
 * "PF2E.Skill.Acrobatics" -> "Acrobatics"; "clan-dagger" -> "Clan Dagger".
 *
 * Las etiquetas del pack son claves de traducción de Foundry. Se usa el último
 * tramo, que es la parte con significado, y si coincide con una habilidad se
 * usa su nombre de verdad.
 */
export function etiquetaDeOpcion(etiqueta: string | undefined, valor: string): string {
  const skill = SKILLS.find((s) => s.slug === valor);
  if (skill) return skill.name;

  const crudo = (etiqueta ?? valor).split('.').pop() ?? valor;
  return crudo
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Las elecciones con consecuencia de un ítem, resueltas contra lo ya elegido.
 *
 * `decididoPor` sale de las dotes tomadas: "Clan Pistol" es una dote de
 * ancestría que impone la pistola, y volver a preguntar sería pedir lo mismo
 * dos veces.
 */
export function eleccionesDe(
  item: ItemConReglas,
  opciones: {
    elegidas: Record<string, string>;
    objetos: BuscadorDeObjetos;
    dotesTomadas?: ItemConReglas[];
  },
): EleccionDeRasgo[] {
  const salida: EleccionDeRasgo[] = [];

  for (const regla of item.rules ?? []) {
    if (regla.key !== 'ChoiceSet') continue;
    // Las de filtro por tag las resuelve progression.ts como elección de rasgo.
    if (!regla.choices?.length) continue;

    const valores = new Set(regla.choices.map((c) => c.id));
    if (!tieneConsecuencia(item, valores)) continue;

    const tipo = tipoDeEleccion(item, valores, opciones.objetos);
    const lista: OpcionDeEleccion[] = regla.choices.map((c) => {
      const grant = (item.rules ?? []).find(
        (r) => r.key === 'GrantItem' && r.id && (r.predicate ?? []).includes(c.id),
      );
      const objeto = grant?.id
        ? (opciones.objetos.equipo(grant.id) ?? opciones.objetos.equipoIndirecto(grant.id))
        : undefined;

      return {
        valor: c.id,
        etiqueta: objeto?.name ?? etiquetaDeOpcion(c.label, c.id),
        itemId: objeto?.id,
      };
    });

    // Una dote tomada puede imponer la respuesta.
    const porDote = (opciones.dotesTomadas ?? []).find((dote) =>
      (dote.rules ?? []).some(
        (r) => r.key === 'GrantItem' && r.id && lista.some((o) => o.itemId && o.itemId === r.id),
      ),
    );
    const impuesta = porDote
      ? lista.find((o) => (porDote.rules ?? []).some((r) => r.key === 'GrantItem' && r.id === o.itemId))
      : undefined;

    salida.push({
      itemId: item.id,
      itemName: item.name,
      tipo,
      opciones: lista,
      elegido: impuesta?.valor ?? opciones.elegidas[item.id] ?? null,
      decididoPor: impuesta ? porDote!.name : null,
    });
  }

  return salida;
}

const NOMBRE_DE_TIPO: Record<string, string> = {
  feat: 'una dote',
  ancestry: 'una ancestría',
  heritage: 'una herencia',
  action: 'una acción',
  effect: 'un efecto',
};

/**
 * Las elecciones de un ítem que la app no puede ofrecer, para avisarlas.
 *
 * Se listan TODAS las abiertas, sin filtrar por consecuencia: acá no se puede
 * saber si mueven números —las opciones están del otro lado del filtro— y con
 * la duda es mejor nombrarlas.
 */
export function eleccionesAbiertasDe(item: ItemConReglas): EleccionAbierta[] {
  return (item.rules ?? [])
    .filter((r) => r.key === 'ChoiceSet' && r.abierta)
    .map((r) => ({
      itemId: item.id,
      itemName: item.name,
      texto: `${item.name} te hace elegir ${NOMBRE_DE_TIPO[r.tipoDeItem ?? ''] ?? 'una opción'}, y la hoja todavía no sabe ofrecer esa lista: anotalo aparte.`,
    }));
}

/** Cómo se le pide al jugador, según el tipo. */
export function textoDeEleccion(eleccion: EleccionDeRasgo): string {
  switch (eleccion.tipo) {
    case 'objeto':
      return `Falta elegir el arma de ${eleccion.itemName}.`;
    case 'habilidad':
      return `Falta elegir la habilidad de ${eleccion.itemName}.`;
    default:
      return `Falta resolver la elección de ${eleccion.itemName}.`;
  }
}
