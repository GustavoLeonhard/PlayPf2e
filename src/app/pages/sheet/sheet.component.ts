import { Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  emptyState,
  type CharacterRecord,
  type Choice,
  type ChoiceSlot,
  type CustomItem,
  type Favorite,
  type NaturalWeapon,
} from '../../core/models/character.model';
import { ABILITIES, ABILITY_NAMES, PROFICIENCY_NAMES } from '../../core/models/content.model';
import type { Ability, Equipment, Feat, ProficiencyRank, Spell } from '../../core/models/content.model';
import { archetypeFeatAvailable, isArchetypeFeat, ownedDedications } from '../../core/rules/archetypes';
import { CONDITION_BY_ID } from '../../core/rules/conditions';
import { criticalTotal, rollFormula, type DiceRoll } from '../../core/rules/dice';
import { COMMON_LANGUAGES, UNCOMMON_LANGUAGES, languageLabel } from '../../core/rules/languages';
import { datosDeConjuro, datosDeDote, datosDeEfecto, datosDeEquipo, type Dato } from '../../core/rules/fichas';
import { recorteCuadrado } from '../../core/rules/imagen';
import { formatCp, priceToCp, splitCp } from '../../core/rules/money';
import { castableRanks, scaledDamage } from '../../core/rules/spellcasting';
import { SKILLS } from '../../core/rules/tables';
import { computeCharacter, type ContentIndex, type FeatSource, type StrikeSheet } from '../../core/rules/character.engine';
import { avisosDe, esAplicable, nombreCorto, selectoresDe, valorDe, type Effect } from '../../core/rules/efectos';
import { efectoAMano, seCalcula } from '../../core/rules/efectos-a-mano';
import { RAGE_SLUG, rageSheet } from '../../core/rules/rabia';
import { signed, type Stat } from '../../core/rules/modifiers';
import { CharacterService } from '../../core/services/character.service';
import { AccordionComponent } from '../../shared/accordion.component';
import { AccordionStateService } from '../../shared/accordion-state.service';
import { RankSelectComponent } from '../../shared/rank-select.component';
import { ContentService, type ConditionText } from '../../core/services/content.service';

/** Un favorito ya resuelto contra la hoja de ahora. Ver `favorites`. */
export interface FavoritoResuelto {
  fav: Favorite;
  kind: Favorite['kind'];
  label: string;
  strike?: StrikeSheet;
  stat?: Stat;
  spell?: Spell;
  /** Rango al que se lanza el conjuro hoy; 0 para armas y habilidades. */
  rank: number;
  detalle: string;
  disponible: boolean;
  /** Por qué no se puede usar: "no equipada", "no preparado"… */
  motivo: string;
}

export interface RollResult {
  label: string;
  die: number;
  modifier: number;
  total: number;
  crit: 'success' | 'failure' | null;
  /** Daño ya tirado junto con el ataque, más el total si fuese crítico. */
  damage?: { detail: string; total: number; critical: number; type: string };
  /** Para conjuros de salvación: no hay ataque, se muestra la CD. */
  dc?: number;
  save?: string;
}

/** Lo que muestra el ⓘ: los datos del manual y el texto de la descripción. */
interface Ficha {
  titulo: string;
  cuerpo: string;
  datos: Dato[];
}

/** Los tres lugares donde el rango se puede pisar a mano. */
type GrupoProf = 'skills' | 'strikes' | 'defenses';

@Component({
  selector: 'app-sheet',
  imports: [RouterLink, NgTemplateOutlet, AccordionComponent, RankSelectComponent],
  templateUrl: './sheet.component.html',
  styleUrl: './sheet.component.scss',
})
export class SheetComponent implements OnInit {
  private content = inject(ContentService);
  private accordionState = inject(AccordionStateService);
  private characters = inject(CharacterService);

  /** Viene del router (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly record = signal<CharacterRecord | null>(null);
  readonly spellList = signal<Spell[]>([]);
  readonly index = signal<ContentIndex | null>(null);
  readonly abilityList = ABILITIES;
  readonly abilityNames = ABILITY_NAMES;
  readonly proficiencyNames = PROFICIENCY_NAMES;
  /** Las 42 del CRB con su texto oficial; solo algunas mueven números. */
  readonly conditionList = signal<ConditionText[]>([]);

  readonly openBreakdown = signal<string | null>(null);
  readonly showAcknowledged = signal(false);
  readonly lastRoll = signal<RollResult | null>(null);
  readonly showConditions = signal(false);
  /** Las advertencias arrancan abiertas, pero se pueden plegar y sacarlas del medio. */
  readonly showWarnings = signal(true);

  readonly sheet = computed(() => {
    const record = this.record();
    const index = this.index();
    if (!record || !index) return null;
    return computeCharacter(record.build, record.state, index);
  });

  readonly openWarnings = computed(() => this.sheet()?.warnings.filter((w) => !w.acknowledged) ?? []);
  readonly acknowledgedWarnings = computed(() => this.sheet()?.warnings.filter((w) => w.acknowledged) ?? []);

  /** Marcar como resuelta es permanente: vive en el build, no en el estado de combate. */
  async acknowledge(id: string) {
    const record = this.record();
    if (!record) return;
    record.build.acknowledgedWarnings = [...(record.build.acknowledgedWarnings ?? []), id];
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  async unacknowledge(id: string) {
    const record = this.record();
    if (!record) return;
    record.build.acknowledgedWarnings = (record.build.acknowledgedWarnings ?? []).filter((w) => w !== id);
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /**
   * El nivel se corrige a mano: es un número, no una acción irreversible como
   * "Subir de nivel". Cambiarlo recalcula toda la hoja sola (todo sale de
   * `computeCharacter`), y si el salto deja huecos —dotes o aumentos de
   * habilidad sin elegir en algún nivel de por medio— quedan como advertencia
   * en vez de faltar en silencio.
   */
  async setLevel(valor: string) {
    const record = this.record();
    if (!record) return;
    const nivel = Math.max(1, Math.min(20, Math.round(Number(valor)) || record.build.level));
    record.build.level = nivel;
    await this.guardar(record);
  }

  /** El input `id` viene del router: no esta disponible en el constructor. */
  ngOnInit() {
    void this.load();
  }

  private async load() {
    // Antes de pintar nada: así los acordeones nacen con el plegado guardado
    // de ESTE personaje, en vez de abrirse y cerrarse a la vista.
    this.accordionState.usar(this.id());

    const [index] = await Promise.all([this.content.index()]);
    void this.content.spells().then((s) => this.spellList.set(s));
    void this.content.conditions().then((c) => this.conditionList.set(c));
    void this.content.effects().then((e) => this.effectList.set(e));
    this.index.set(index);
    const record = await this.characters.get(this.id());
    if (record) {
      // Los PJ guardados antes de tener `state` no lo traen.
      record.state ??= emptyState();
      // Los PJ guardados antes de que existieran estos campos no los traen.
      record.state.preparedSpells ??= {};
      record.state.coins ??= 0;
      record.state.spellSlotsUsed ??= {};
      record.state.shield ??= { raised: false, hp: 0 };
      record.state.effects ??= [];
      record.build.languages ??= [];
      record.build.favorites ??= [];
      record.build.inventory ??= [];
      record.build.naturalWeapons ??= [];
      record.build.acknowledgedWarnings ??= [];
      if (!record.state.hp.current) {
        const computed = computeCharacter(record.build, record.state, index);
        record.state.hp.current = computed.maxHp.total;
      }
      this.record.set(record);
    }
  }

  // --------------------------------------------------------- ataques y rasgos

  /** La hoja separa los ataques: cuerpo a cuerpo arriba, a distancia abajo. */
  /** "1 ataque", no "1 ataques": va en el encabezado de la sección. */
  ataques = (n: number) => `${n} ${n === 1 ? 'ataque' : 'ataques'}`;

  readonly meleeStrikes = computed(() => this.sheet()?.strikes.filter((s) => !s.ranged) ?? []);
  readonly rangedStrikes = computed(() => this.sheet()?.strikes.filter((s) => s.ranged) ?? []);

  /**
   * Rasgos y dotes agrupados por origen. Las cinco categorías se muestran
   * siempre, aunque estén vacías: son editables, y si se ocultan hasta tener
   * algo no hay dónde apretar "+ Agregar".
   */
  readonly featGroups = computed(() => {
    const sheet = this.sheet();
    if (!sheet) return [];

    const etiquetas = (Object.entries(SheetComponent.LABEL_DE_SOURCE) as [FeatSource, string][]).map(
      ([key, label]) => ({ key, label }),
    );

    // Mismo shape para las dos fuentes (con `slot: null` de relleno en los
    // rasgos estructurales) para no necesitar angostar un union en la plantilla:
    // el `esDote` alcanza para decidir si se puede sacar o no.
    const todos = [
      ...sheet.features.map((f) => ({ ...f, slot: null as string | null, esDote: false as const })),
      ...sheet.feats.map((f) => ({
        name: f.name,
        level: f.level,
        source: f.source,
        id: f.id as string | null,
        slot: f.slot as string | null,
        esDote: true as const,
      })),
    ];

    /*
     * Una misma dote puede llegar por dos caminos —otorgada por un rasgo y
     * además elegida a mano— y aparecía repetida. Se queda la elegida, que es
     * la que se puede sacar.
     */
    const sinRepetir = todos.filter(
      (f, i) => !f.id || todos.findIndex((otro) => otro.id === f.id && otro.esDote === true) === -1 || f.esDote,
    );

    return etiquetas.map(({ key, label }) => ({
      key,
      label,
      items: sinRepetir.filter((f) => f.source === key).sort((a, b) => a.level - b.level),
    }));
  });

  // ------------------------------------------------------------- favoritos

  /**
   * Lo que el jugador quiere tener a mano. Se guarda una referencia y se resuelve
   * cada vez contra la hoja: si sube el modificador, el favorito ya lo refleja.
   */
  /**
   * Los conjuros que se pueden lanzar AHORA, con el rango al que salen.
   *
   * No alcanza con "lo conoce": un preparado solo puede lanzar lo que preparó
   * hoy. Esto junta las mismas fuentes que ya muestra la sección de conjuros,
   * así que un favorito está disponible exactamente cuando lo estaría abajo.
   */
  private readonly conjurosDisponibles = computed(() => {
    const salida = new Map<string, { spell: Spell; rank: number; focus: boolean }>();

    const anotar = (spell: Spell | null | undefined, rank: number, focus = false) => {
      if (spell && !salida.has(spell.id)) salida.set(spell.id, { spell, rank, focus });
    };

    for (const grupo of this.spellGroups()) for (const spell of grupo.spells) anotar(spell, grupo.rank);
    for (const grupo of this.preparedSlots()) for (const slot of grupo.slots) anotar(slot.spell, grupo.rank);

    const font = this.fontSlots();
    if (font) for (const slot of font.slots) anotar(slot.spell, font.rank);

    const focus = this.sheet()?.focus;
    if (focus) for (const spell of this.focusSpells()) anotar(spell, focus.rank, true);

    return salida;
  });

  /**
   * Los favoritos, resueltos contra la hoja de ahora.
   *
   * Lo que dejó de estar disponible NO se saca de la lista: se muestra apagado
   * con el motivo. Un arma que guardaste en la mochila o un conjuro que hoy no
   * preparaste siguen siendo tus favoritos — desaparecer sin avisar haría
   * pensar que se perdieron.
   */
  readonly favorites = computed(() => {
    const sheet = this.sheet();
    const guardados = this.record()?.build.favorites ?? [];
    if (!sheet) return [];

    const porId = new Map(this.spellList().map((s) => [s.id, s]));
    const disponibles = this.conjurosDisponibles();

    /*
     * Todas las entradas tienen la misma forma aunque solo una de las tres
     * referencias venga llena: en la plantilla, angostar un union por una
     * propiedad discriminante es más ruido que un par de campos opcionales.
     */
    return guardados.map((fav): FavoritoResuelto => {
      if (fav.kind === 'strike') {
        const strike = sheet.strikes.find((s) => s.name === fav.ref);
        return {
          fav,
          kind: 'strike',
          label: strike?.name ?? fav.label,
          strike,
          rank: 0,
          detalle: strike ? signed(strike.attack.total) : '',
          disponible: !!strike,
          motivo: strike ? '' : 'no equipada',
        };
      }

      if (fav.kind === 'skill') {
        const skill = [...sheet.skills, ...sheet.lores].find((s) => s.slug === fav.ref);
        return {
          fav,
          kind: 'skill',
          label: skill?.name ?? fav.label,
          stat: skill?.stat,
          rank: 0,
          detalle: skill ? signed(skill.stat.total) : '',
          disponible: !!skill,
          motivo: skill ? '' : 'no está',
        };
      }

      const listo = disponibles.get(fav.ref);
      const spell = listo?.spell ?? porId.get(fav.ref);
      return {
        fav,
        kind: 'spell',
        label: spell?.name ?? fav.label,
        spell,
        rank: listo?.rank ?? spell?.level ?? 1,
        detalle: '',
        disponible: !!listo,
        motivo: listo ? '' : spell ? 'no preparado' : 'no encontrado',
      };
    });
  });

  isFavorite = (kind: Favorite['kind'], ref: string) =>
    (this.record()?.build.favorites ?? []).some((f) => f.kind === kind && f.ref === ref);

  async toggleFavorite(kind: Favorite['kind'], ref: string, label: string) {
    const record = this.record();
    if (!record) return;

    const actuales = record.build.favorites ?? [];
    const ya = actuales.some((f) => f.kind === kind && f.ref === ref);
    record.build.favorites = ya
      ? actuales.filter((f) => !(f.kind === kind && f.ref === ref))
      : [...actuales, { kind, ref, label }];

    await this.guardar(record);
  }

  /** Un favorito se tira como lo que sea que es: ataque, habilidad o conjuro. */
  /** Una habilidad favorita se tira desde acá; armas y conjuros usan su propia fila. */
  rollFavorite(fav: ReturnType<typeof this.favorites>[number]) {
    if (!fav.disponible) return;
    if ('stat' in fav && fav.stat) this.roll(fav.label, fav.stat);
  }

  // ---------------------------------------------------------------- idiomas

  readonly editingLanguages = signal(false);

  /** Los de la lista Legacy que no da ya la ancestría. */
  readonly languageOptions = computed(() => {
    const propios = new Set(this.sheet()?.languages.fromAncestry ?? []);
    return [...COMMON_LANGUAGES, ...UNCOMMON_LANGUAGES].filter((l) => !propios.has(l));
  });

  /** Los inventados por el máster: los que no están en ninguna lista conocida. */
  readonly customLanguages = computed(() => {
    const conocidos = new Set<string>([
      ...COMMON_LANGUAGES,
      ...UNCOMMON_LANGUAGES,
      ...(this.sheet()?.languages.fromAncestry ?? []),
    ]);
    return (this.record()?.build.languages ?? []).filter((l) => !conocidos.has(l));
  });

  /** Marcador para el editor: los inventados no están en ninguna lista. */
  readonly customLanguageCount = computed(() => {
    return this.customLanguages().length;
  });

  hasLanguage = (language: string) => (this.record()?.build.languages ?? []).includes(language);

  /**
   * El cupo (modificador de Inteligencia + los extra de la ancestría) se muestra,
   * pero no bloquea: un máster puede regalarte un idioma por la historia, igual que
   * te regala un objeto. Si te pasás, la hoja lo dice.
   */
  async toggleLanguage(language: string) {
    const record = this.record();
    if (!record) return;

    const actuales = record.build.languages ?? [];
    record.build.languages = actuales.includes(language)
      ? actuales.filter((l) => l !== language)
      : [...actuales, language];

    await this.guardar(record);
  }

  /** Cuántos elegiste de más respecto del cupo. */
  readonly extraLanguages = computed(() => {
    const sheet = this.sheet();
    if (!sheet) return 0;
    return Math.max(0, sheet.languages.chosen.length - sheet.languages.slots);
  });

  async addCustomLanguage(nombre: string) {
    const limpio = nombre.trim().toLowerCase();
    if (!limpio || this.hasLanguage(limpio)) return;
    await this.toggleLanguage(limpio);
  }

  // -------------------------------------------------------------- atributos

  /**
   * La puntuación se puede escribir a mano y pisa la que sale de los boosts.
   *
   * Cambiarla recalcula la hoja entera sola —modificador, CA, HP, salvaciones,
   * habilidades, ataques, CD— porque todo eso deriva de la puntuación dentro de
   * `computeCharacter`. Sin esto, corregir un número obligaba a rehacer los
   * boosts, que es un camino largo para algo que a veces viene de afuera (un
   * personaje traído de otra app, un item, una bendición del máster).
   */
  async setAbilityScore(ability: Ability, valor: string) {
    const record = this.record();
    if (!record) return;

    const numero = Math.max(1, Math.min(30, Math.round(Number(valor))));
    if (!Number.isFinite(numero)) return;

    record.build.abilityOverrides = { ...(record.build.abilityOverrides ?? {}), [ability]: numero };
    await this.guardar(record);
  }

  /** Volver al valor que sale de los boosts. */
  async clearAbilityOverride(ability: Ability) {
    const record = this.record();
    if (!record) return;

    const overrides = { ...(record.build.abilityOverrides ?? {}) };
    delete overrides[ability];
    record.build.abilityOverrides = overrides;
    await this.guardar(record);
  }

  esAbilityManual = (ability: Ability): boolean =>
    this.record()?.build.abilityOverrides?.[ability] !== undefined;

  // ------------------------------------------------- skill de la herencia

  /**
   * Las opciones que ofrece la herencia, si ofrece alguna.
   *
   * Sale de la regla del pack (`skills.{elegida}`), no de una lista escrita a
   * mano: hoy son Skilled Heritage y Ancient Ash.
   */
  readonly heritageSkillChoices = computed<{ id: string; label: string }[]>(() => {
    const id = this.record()?.build.heritage;
    const heritage = id ? this.index()?.heritageById.get(id) : null;
    if (!heritage?.rules.some((r) => r.key === 'Proficiency' && r.elegida)) return [];

    const choiceSet = heritage.rules.find((r) => r.key === 'ChoiceSet');
    return (choiceSet?.choices ?? []).map((c) => ({
      id: c.id,
      label: SKILLS.find((s) => s.slug === c.id)?.name ?? c.id,
    }));
  });

  async setHeritageSkill(slug: string) {
    const record = this.record();
    if (!record) return;
    record.build.heritageSkill = slug || null;
    await this.guardar(record);
  }

  // ----------------------------------------------------------- proficiencias

  /**
   * Pisar a mano el rango de una habilidad, un ataque o la armadura.
   *
   * El motor recalcula todo lo que cuelga del rango —el modificador, la CA, los
   * tres ataques del turno— porque el rango entra a computeCharacter como una
   * entrada más. No hace falta tocar nada de eso acá.
   */
  async setProficiency(grupo: GrupoProf, clave: string, rango: ProficiencyRank) {
    const record = this.record();
    if (!record) return;

    const overrides = record.build.proficiencyOverrides ?? {};
    record.build.proficiencyOverrides = { ...overrides, [grupo]: { ...overrides[grupo], [clave]: rango } };
    await this.guardar(record);
  }

  /** Volver al rango que sale de la clase, el trasfondo y los feats. */
  async clearProficiency(grupo: GrupoProf, clave: string) {
    const record = this.record();
    if (!record) return;

    const overrides = record.build.proficiencyOverrides ?? {};
    const restantes = { ...overrides[grupo] };
    delete restantes[clave];
    record.build.proficiencyOverrides = { ...overrides, [grupo]: restantes };
    await this.guardar(record);
  }

  esProfManual = (grupo: GrupoProf, clave: string): boolean =>
    this.record()?.build.proficiencyOverrides?.[grupo]?.[clave] !== undefined;

  // ------------------------------------------------------------------ visión

  /** La visión que da la ancestría sola, sin el override: para mostrarla en la opción del selector. */
  readonly ancestryVision = computed(() => {
    const slug = this.record()?.build.ancestry;
    const index = this.index();
    return (slug && index?.ancestryBySlug.get(slug)?.vision) || 'normal';
  });

  visionLabel = (v: string) => (v === 'darkvision' ? 'Darkvision' : v === 'low-light-vision' ? 'Low-light' : 'Normal');

  /**
   * Por defecto sale de la ancestría; esto la pisa. Sirve para lo que la app no
   * modela solo (Ganzi con darkvision, perder un ojo en la mesa) sin tener que
   * inventar un rasgo falso para forzar el cálculo.
   */
  async setVision(valor: string) {
    const record = this.record();
    if (!record) return;
    record.build.visionOverride = valor === 'ancestria' ? null : valor;
    await this.guardar(record);
  }

  // --------------------------------------------------------- rasgos y dotes

  /**
   * Agregar o quitar una dote fuera del subir de nivel: un tomo, un boon de
   * facción, algo que decide el máster en la mesa. Reusa el mismo criterio que
   * el asistente al ofrecer dotes (categoría, nivel, trait de clase/ancestría,
   * arquetipos), salvo en "Adicionales", que es a propósito una lista abierta.
   */
  readonly agregandoDote = signal<FeatSource | null>(null);
  readonly doteSearch = signal('');

  private static readonly SLOT_DE_SOURCE: Record<FeatSource, ChoiceSlot> = {
    ancestry: 'ancestryFeat',
    class: 'classFeat',
    skill: 'skillFeat',
    general: 'generalFeat',
    bonus: 'bonusFeat',
  };

  static readonly LABEL_DE_SOURCE: Record<FeatSource, string> = {
    ancestry: 'Ancestría',
    class: 'Clase',
    skill: 'Habilidad',
    general: 'Generales',
    bonus: 'Adicionales',
  };

  /** La plantilla solo puede leer contra la instancia, no contra la clase. */
  readonly labelDeSource = SheetComponent.LABEL_DE_SOURCE;

  /** Cuántos resultados entran en el panel chico antes de mandar a "ver todas". */
  private static readonly DOTES_EN_PANEL = 12;

  /**
   * Sin límite, para saber cuántas hay en total y decidir si hace falta el
   * botón "ver todas" — y para la lista completa dentro del modal.
   */
  private opcionesDoteSinLimite(source: FeatSource): Feat[] {
    const index = this.index();
    const build = this.record()?.build;
    if (!index || !build) return [];

    const busqueda = this.doteSearch().toLowerCase().trim();
    const owned = ownedDedications(
      build.choices.map((c) => (c.id ? index.featById.get(c.id) : undefined)).filter((f): f is Feat => !!f),
    );
    const trait = source === 'class' ? build.class : source === 'ancestry' ? build.ancestry : null;

    return [...index.featById.values()]
      .filter((f) => source === 'bonus' || f.category === source)
      .filter((f) => f.level <= build.level)
      .filter((f) => !f.onlyLevel1 || build.level === 1)
      .filter((f) => {
        if (source === 'general' || source === 'skill' || source === 'bonus') return true;
        if (source === 'class' && isArchetypeFeat(f)) return archetypeFeatAvailable(f, owned);
        return !trait || f.traits.includes(trait);
      })
      .filter((f) => !busqueda || f.name.toLowerCase().includes(busqueda))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Las que ya tenés no se sacan de la lista: se muestran sin el botón de
   * agregar. Desaparecer sin explicación se lee como que faltan en el dataset —
   * sobre todo si la tomaste desde otra categoría.
   */
  yaTenesDote(f: Feat): boolean {
    const build = this.record()?.build;
    if (!build || f.maxTakable > 1) return false;
    return build.choices.some((c) => c.id === f.id);
  }

  /** Las primeras 12, para el panel chico dentro del acordeón. */
  opcionesDote(source: FeatSource): Feat[] {
    return this.opcionesDoteSinLimite(source).slice(0, SheetComponent.DOTES_EN_PANEL);
  }

  /** Todas, para la lista dentro del modal — ahí sí hay espacio para scrollear. */
  opcionesDoteCompletas(source: FeatSource): Feat[] {
    return this.opcionesDoteSinLimite(source);
  }

  /** Si hay más de las que entran en el panel chico, vale la pena ofrecer "ver todas". */
  hayMasDotes(source: FeatSource): boolean {
    return this.opcionesDoteSinLimite(source).length > SheetComponent.DOTES_EN_PANEL;
  }

  /**
   * La lista completa se ve mejor en un modal que apretada dentro del
   * acordeón: con 30 o 40 resultados el panel chico empujaba el resto de la
   * hoja para abajo y era incómodo de recorrer.
   */
  readonly doteModal = signal<FeatSource | null>(null);

  /**
   * Qué fila de una lista de "elegir algo" tiene la descripción abierta: sirve
   * para las dotes y para el catálogo del inventario.
   *
   * Acá la descripción va INLINE debajo de la fila, no en el rincón de las
   * tiradas como el resto de las fichas: estás eligiendo entre varias y querés
   * comparar sin perder de vista la lista — y dentro de un modal, un cartel en
   * la esquina quedaría tapado. Una sola abierta a la vez, para que la lista no
   * se estire de golpe.
   */
  readonly descripcionAbierta = signal<string | null>(null);

  toggleDescripcion(id: string) {
    this.descripcionAbierta.update((abierta) => (abierta === id ? null : id));
  }

  async agregarDote(source: FeatSource, featId: string | null) {
    const record = this.record();
    if (!record || !featId) return;

    const choice: Choice = { level: record.build.level, slot: SheetComponent.SLOT_DE_SOURCE[source], id: featId };
    record.build.choices = [...record.build.choices, choice];
    this.agregandoDote.set(null);
    this.doteModal.set(null);
    this.doteSearch.set('');
    await this.guardar(record);
  }

  /** Solo se puede sacar una dote que vino de una Choice (no un rasgo estructural de la clase). */
  async quitarDote(f: { level: number; slot: string | null; id: string | null }) {
    const record = this.record();
    if (!record || !f.slot || !f.id) return;

    const at = record.build.choices.findIndex((c) => c.level === f.level && c.slot === f.slot && c.id === f.id);
    if (at < 0) return;
    record.build.choices = record.build.choices.filter((_, i) => i !== at);
    await this.guardar(record);
  }

  // ---------------------------------------------------------------- retrato

  /** El retrato viaja dentro del jsonb del personaje: se achica antes de guardar. */
  async setPortrait(input: HTMLInputElement) {
    const file = input.files?.[0];
    const record = this.record();
    if (!file || !record) return;

    record.build.portrait = await recorteCuadrado(file);
    input.value = '';
    await this.guardar(record);
  }

  async removePortrait() {
    const record = this.record();
    if (!record) return;
    delete record.build.portrait;
    await this.guardar(record);
  }

  portrait = () => this.record()?.build.portrait ?? null;

  // ------------------------------------------------------------- tiradas

  roll(label: string, stat: Stat) {
    const die = 1 + Math.floor(Math.random() * 20);
    const total = die + stat.total;
    this.lastRoll.set({
      label,
      die,
      modifier: stat.total,
      total,
      crit: die === 20 ? 'success' : die === 1 ? 'failure' : null,
    });
  }

  /**
   * Tirada de arma: ataque, dano y cuanto seria el critico.
   *
   * El critico duplica el dano ya tirado. Encima de eso:
   *   fatal dX  — los dados del arma pasan a dX (se tiran de nuevo) y se suma uno extra
   *   deadly dX — se suma un dado de dX, tirado despues de duplicar
   * El dado extra NO se duplica en ninguno de los dos casos.
   */
  /**
   * Multiple Attack Penalty: el segundo ataque del turno va a −5 y el tercero a −10;
   * con un arma **agile** es −4 y −8.
   *
   * OJO: esto es una regla escrita a mano, no sale del dataset. Falta confirmarla
   * contra la fuente Legacy del proyecto.
   */
  mapPenalty(strike: StrikeSheet, ataque: number): number {
    if (ataque <= 1) return 0;
    const agil = strike.traits.includes('agile');
    return ataque === 2 ? (agil ? -4 : -5) : agil ? -8 : -10;
  }

  rollStrike(strike: StrikeSheet, ataque = 1) {
    const map = this.mapPenalty(strike, ataque);
    const die = 1 + Math.floor(Math.random() * 20);
    const dados = strike.damageDice.match(/^(\d+)d(\d+)$/);
    const mods = strike.damage.total;

    const normal = dados ? rollFormula(strike.damageDice) : { total: 0, detail: '', formula: '' };
    const totalNormal = normal.total + mods;

    let critico = totalNormal * 2;
    const detalles: string[] = [];

    if (strike.fatal && dados) {
      // Se vuelve a tirar con el dado grande: es lo que hace fatal.
      const conFatal = rollFormula(`${dados[1]}${strike.fatal}`);
      const extra = rollFormula(`1${strike.fatal}`);
      critico = (conFatal.total + mods) * 2 + extra.total;
      detalles.push(
        `crítico con fatal ${strike.fatal}: (${conFatal.total}${mods ? signed(mods) : ''}) ×2 + ${extra.total} del dado extra`,
      );
    } else if (strike.deadly) {
      const extra = rollFormula(`1${strike.deadly}`);
      critico += extra.total;
      detalles.push(`crítico: ${totalNormal} ×2 + ${extra.total} de deadly ${strike.deadly}`);
    }

    this.lastRoll.set({
      label: ataque > 1 ? `${strike.name} (${ataque}º ataque, MAP ${map})` : strike.name,
      die,
      modifier: strike.attack.total + map,
      total: die + strike.attack.total + map,
      crit: die === 20 ? 'success' : die === 1 ? 'failure' : null,
      damage: {
        detail: [`${normal.detail}${mods ? ' ' + signed(mods) : ''}`, ...detalles].filter(Boolean).join(' · '),
        total: totalNormal,
        critical: critico,
        type: strike.damageType,
      },
    });
  }

  // ------------------------------------------------------------- conjuros

  /** Repertorio agrupado por rango, con los datos del hechizo ya resueltos. */
  readonly spellGroups = computed(() => {
    const record = this.record();
    const sheet = this.sheet();
    if (!record || !sheet?.spellcasting) return [];

    const byId = new Map(this.spellList().map((s) => [s.id, s]));
    const groups: { label: string; rank: number; slots: number; spells: Spell[]; isCantrips: boolean }[] = [];

    const cantrips = record.build.spellcasting?.cantrips ?? [];
    if (cantrips.length) {
      groups.push({
        label: `Cantrips (rango ${sheet.spellcasting.cantripRank})`,
        rank: sheet.spellcasting.cantripRank,
        slots: 0,
        spells: cantrips.map((id) => byId.get(id)).filter((s): s is Spell => !!s),
        isCantrips: true,
      });
    }

    // Los preparados no tienen repertorio: sus slots se llenan cada día (preparedSlots).
    const conRepertorio = sheet.spellcasting.config.source === 'repertoire';
    for (const { rank, slots } of conRepertorio ? sheet.spellcasting.slots : []) {
      const ids = record.build.spellcasting?.repertoire?.[String(rank)] ?? [];
      groups.push({
        label: `Rango ${rank}`,
        rank,
        slots,
        spells: ids.map((id) => byId.get(id)).filter((s): s is Spell => !!s),
        isCantrips: false,
      });
    }

    return groups;
  });

  slotsUsed = (rank: number) => this.record()?.state.spellSlotsUsed?.[String(rank)] ?? 0;

  // ------------------------------------------------- preparados (Wizard, Cleric, Druid)

  readonly isPrepared = computed(() => this.sheet()?.spellcasting?.config.preparation === 'prepared');
  readonly preparing = signal(false);

  /** Los slots del día, cada uno con el hechizo que se preparó (o vacío). */
  readonly preparedSlots = computed(() => {
    const sheet = this.sheet();
    const record = this.record();
    if (!sheet?.spellcasting || !record) return [];

    const byId = new Map(this.spellList().map((s) => [s.id, s]));
    return sheet.spellcasting.slots.map(({ rank, slots }) => {
      const prepared = record.state.preparedSpells?.[String(rank)] ?? [];
      return {
        rank,
        slots: Array.from({ length: slots }, (_, i) => ({
          index: i,
          spell: prepared[i] ? (byId.get(prepared[i]!) ?? null) : null,
        })),
      };
    });
  });

  /**
   * Los slots extra del divine font solo aceptan heal o harm: la regla lo dice
   * explícitamente, así que acá sí conviene filtrar en vez de solo avisar.
   */
  fontSpells(): Spell[] {
    return this.spellList().filter((s) => ['heal', 'harm'].includes(s.slug));
  }

  async prepareFontSpell(index: number, spellId: string | null) {
    const rank = this.sheet()?.spellcasting?.maxRank ?? 1;
    await this.prepareSpell(-rank, index, spellId);
  }

  /** Los slots del divine font se guardan aparte, con clave negativa. */
  readonly fontSlots = computed(() => {
    const sheet = this.sheet();
    const record = this.record();
    if (!sheet?.spellcasting?.divineFontSlots || !record) return null;

    const rank = sheet.spellcasting.maxRank;
    const byId = new Map(this.spellList().map((s) => [s.id, s]));
    const prepared = record.state.preparedSpells?.[String(-rank)] ?? [];

    return {
      rank,
      slots: Array.from({ length: sheet.spellcasting.divineFontSlots }, (_, i) => ({
        index: i,
        spell: prepared[i] ? (byId.get(prepared[i]!) ?? null) : null,
      })),
    };
  });

  /** De dónde puede preparar: del libro (Wizard) o de toda la tradición (Cleric, Druid). */
  preparableSpells(rank: number): Spell[] {
    const sheet = this.sheet();
    const record = this.record();
    if (!sheet?.spellcasting || !record) return [];

    const { config, tradition } = sheet.spellcasting;
    if (config.source === 'spellbook') {
      const book = new Set(record.build.spellcasting?.spellbook ?? []);
      return this.spellList().filter((s) => book.has(s.id) && s.level <= rank);
    }

    return this.spellList()
      .filter((s) => !s.traits.includes('cantrip') && !s.traits.includes('focus'))
      .filter((s) => s.level === rank)
      .filter((s) => !tradition || s.traditions.includes(tradition));
  }

  /** El slot que se está llenando ahora mismo: { rango, índice }. */
  readonly fillingSlot = signal<{ rank: number; index: number } | null>(null);

  async prepareSpell(rank: number, index: number, spellId: string | null) {
    const record = this.record();
    if (!record) return;

    const key = String(rank);
    const lista = [...(record.state.preparedSpells?.[key] ?? [])];
    lista[index] = spellId;
    record.state.preparedSpells = { ...record.state.preparedSpells, [key]: lista };

    this.record.set({ ...record });
    this.fillingSlot.set(null);
    await this.characters.save(record);
  }

  /** Descanso diario: se vacían los preparados y se recuperan los slots. */
  async restForTheDay() {
    const record = this.record();
    if (!record) return;
    record.state.preparedSpells = {};
    record.state.spellSlotsUsed = {};
    // La preparacion diaria devuelve TODOS los focus points.
    record.state.focusPoints = this.sheet()?.focus?.pool ?? 0;
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  isSignature = (spell: Spell) => this.record()?.build.spellcasting?.signature?.[String(spell.level)] === spell.id;

  /**
   * Un signature spell por rango. Marcar otro reemplaza al anterior, que es
   * exactamente como funciona la regla.
   */
  async toggleSignature(spell: Spell) {
    const record = this.record();
    if (!record || !this.sheet()?.spellcasting?.signatureSpells) return;

    const key = String(spell.level);
    const signature = { ...(record.build.spellcasting.signature ?? {}) };
    if (signature[key] === spell.id) delete signature[key];
    else signature[key] = spell.id;

    record.build.spellcasting = { ...record.build.spellcasting, signature };
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /** Rangos a los que se puede lanzar: solo los signature se pueden heightear. */
  ranksFor(spell: Spell): number[] {
    const sc = this.sheet()?.spellcasting;
    if (!sc) return [];
    return castableRanks({
      spellRank: spell.level,
      isCantrip: spell.traits.includes('cantrip'),
      isSignature: sc.signatureSpells && this.isSignature(spell),
      maxRank: sc.maxRank,
      cantripRank: sc.cantripRank,
    });
  }

  async useSlot(rank: number, delta: number) {
    const record = this.record();
    const max = this.sheet()?.spellcasting?.slots.find((s) => s.rank === rank)?.slots ?? 0;
    if (!record) return;
    const current = this.slotsUsed(rank);
    record.state.spellSlotsUsed = {
      ...record.state.spellSlotsUsed,
      [String(rank)]: Math.max(0, Math.min(max, current + delta)),
    };
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /**
   * Lanzar: tira el ataque (si el conjuro lo requiere) y el daño de una vez,
   * mostrando también cuánto sería si el ataque resultara crítico.
   */
  castSpell(spell: Spell, castRank: number) {
    const sc = this.sheet()?.spellcasting;
    if (!sc) return;

    const damageParts = scaledDamage(spell, castRank).filter((d) => d.formula);
    let damage: RollResult['damage'];
    if (damageParts.length) {
      const rolls: DiceRoll[] = damageParts.map((d) => rollFormula(d.formula));
      const total = rolls.reduce((sum, r) => sum + r.total, 0);
      damage = {
        detail: rolls.map((r) => r.detail).join(' + '),
        total,
        critical: criticalTotal({ formula: '', total, detail: '' }),
        // Un hechizo puede traer varias entradas del mismo tipo (Acid Splash trae
        // el daño principal y el de salpicadura): se muestra el tipo una sola vez.
        type: [...new Set(damageParts.map((d) => d.type).filter(Boolean))].join('/'),
      };
    }

    const isAttack = spell.traits.includes('attack');
    const die = 1 + Math.floor(Math.random() * 20);

    this.lastRoll.set({
      label: `${spell.name} (rango ${castRank})`,
      die: isAttack ? die : 0,
      modifier: isAttack ? sc.attack.total : 0,
      total: isAttack ? die + sc.attack.total : 0,
      crit: isAttack ? (die === 20 ? 'success' : die === 1 ? 'failure' : null) : null,
      damage,
      // Hay hechizos sin ataque y sin salvacion (Magic Missile impacta solo):
      // en esos no se muestra ninguna CD.
      dc: !isAttack && spell.defense ? sc.dc.total : undefined,
      save: spell.defense ?? undefined,
    });
  }

  // ------------------------------------------------------- focus spells

  readonly addingFocus = signal(false);

  /** Los focus spells del personaje, resueltos. */
  readonly focusSpells = computed(() => {
    const ids = this.record()?.build.spellcasting?.focusSpells ?? [];
    const byId = new Map(this.spellList().map((s) => [s.id, s]));
    return ids.map((id) => byId.get(id)).filter((s): s is Spell => !!s);
  });

  /**
   * Para elegir: los focus spells de tu clase. Los que nombra tu linaje van primero,
   * porque son los que te corresponden de verdad.
   */
  readonly focusOptions = computed(() => {
    const clase = this.record()?.build.class;
    const sugeridos = new Set((this.sheet()?.focusSuggestions ?? []).map((n) => n.toLowerCase()));
    const yaTiene = new Set(this.record()?.build.spellcasting?.focusSpells ?? []);

    return this.spellList()
      .filter((s) => s.traits.includes('focus') && !yaTiene.has(s.id))
      .filter((s) => !clase || s.traits.includes(clase) || sugeridos.has(s.name.toLowerCase()))
      .sort((a, b) => {
        const sa = sugeridos.has(a.name.toLowerCase()) ? 0 : 1;
        const sb = sugeridos.has(b.name.toLowerCase()) ? 0 : 1;
        return sa - sb || a.level - b.level || a.name.localeCompare(b.name);
      });
  });

  isSuggested = (spell: Spell) =>
    (this.sheet()?.focusSuggestions ?? []).some((n) => n.toLowerCase() === spell.name.toLowerCase());

  async addFocusSpell(id: string | null) {
    if (!id) return;
    const record = this.record();
    if (!record) return;

    const sc = record.build.spellcasting;
    if ((sc.focusSpells ?? []).includes(id)) return;
    record.build.spellcasting = { ...sc, focusSpells: [...(sc.focusSpells ?? []), id] };

    // El primer focus spell trae el punto del pool.
    record.state.focusPoints = Math.max(record.state.focusPoints, 1);
    this.record.set({ ...record });
    this.addingFocus.set(false);
    await this.characters.save(record);
  }

  async removeFocusSpell(id: string) {
    const record = this.record();
    if (!record) return;
    const sc = record.build.spellcasting;
    record.build.spellcasting = { ...sc, focusSpells: (sc.focusSpells ?? []).filter((x) => x !== id) };
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /** Lanzar un focus spell cuesta un punto; Refocus (10 minutos) devuelve uno. */
  async castFocusSpell(spell: Spell) {
    const record = this.record();
    const focus = this.sheet()?.focus;
    if (!record || !focus) return;
    if (record.state.focusPoints <= 0) return;

    record.state.focusPoints -= 1;
    this.record.set({ ...record });
    this.castSpell(spell, focus.rank);
    await this.characters.save(record);
  }

  async refocus() {
    const record = this.record();
    const focus = this.sheet()?.focus;
    if (!record || !focus) return;
    record.state.focusPoints = Math.min(focus.pool, record.state.focusPoints + 1);
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  // ------------------------------------------------------- iniciativa

  /** Con qué estadística se va a tirar: Percepción salvo que elijas otra cosa. */
  readonly initiativeKey = signal('perception');

  readonly initiativeOption = computed(() => {
    const opciones = this.sheet()?.initiative.options ?? [];
    return opciones.find((o) => o.key === this.initiativeKey()) ?? opciones[0] ?? null;
  });

  rollInitiative() {
    const opcion = this.initiativeOption();
    if (opcion) this.roll(`Iniciativa (${opcion.label})`, opcion.stat);
  }

  // ------------------------------------------------------------- fichas

  /**
   * La descripción del manual de cada cosa que la hoja muestra.
   *
   * Se arma una sola vez por render en vez de resolverla fila por fila: la hoja
   * tiene cerca de cien filas y cada una haría su propia búsqueda.
   *
   * La clave lleva prefijo porque conviven ids de mundos distintos: un rasgo y
   * un objeto podrían compartir id sin que eso signifique nada.
   */
  readonly fichas = computed(() => {
    const sheet = this.sheet();
    const index = this.index();
    const record = this.record();
    const salida = new Map<string, Ficha>();
    if (!sheet || !index) return salida;

    /*
     * Alcanza con que haya UNA de las dos cosas. Un arma sin texto de sabor
     * igual tiene daño, volumen y manos, que es lo que se consulta en la mesa;
     * al revés, un rasgo tiene texto y ningún dato tabulado.
     */
    const guardar = (clave: string, titulo: string, cuerpo?: string | null, datos: Dato[] = []) => {
      const limpio = (cuerpo ?? '').trim();
      if (limpio || datos.length) salida.set(clave, { titulo, cuerpo: limpio, datos });
    };

    /*
     * Un rasgo activo puede venir de cualquiera de los tres packs, no solo de
     * class-features: los deeds del Gunslinger (Covered Reload, One Shot One
     * Kill) viven en `actions`, y un GrantItem puede otorgar una dote suelta
     * (Munitions Crafter otorga Alchemical Crafting). Buscando en uno solo,
     * esos se quedaban sin descripción y por lo tanto sin el ⓘ.
     */
    const descripcionDe = (id: string) =>
      index.featureById.get(id)?.description ??
      index.actionById.get(id)?.description ??
      index.featById.get(id)?.description;

    for (const f of sheet.features) {
      if (f.id) guardar(`rasgo:${f.id}`, f.name, descripcionDe(f.id));
    }
    for (const f of sheet.feats) {
      const dote = index.featById.get(f.id);
      guardar(`dote:${f.id}`, f.name, descripcionDe(f.id), dote ? datosDeDote(dote) : []);
    }

    // Todo lo que está en la mochila, por posición: es lo que tienen a mano las
    // filas de inventario, los ataques y las defensas.
    (record?.build.inventory ?? []).forEach((item, i) => {
      const base = index.equipmentById.get(item.id);
      if (base) guardar(`item:${i}`, base.name, base.description, datosDeEquipo(base));
    });

    for (const spell of this.spellList()) {
      guardar(`conjuro:${spell.id}`, spell.name, spell.description, datosDeConjuro(spell));
    }
    for (const c of this.conditionList()) guardar(`condicion:${c.id}`, c.name, c.text);
    // Solo los que se pueden ver: son 1418 y armar la ficha de todos por render
    // costaría más que resolverlas de a una.
    for (const e of [...this.effectsActivos(), ...this.effectResults()]) {
      guardar(`efecto:${e.id}`, nombreCorto(e), e.description, datosDeEfecto(e));
    }

    return salida;
  });

  /** La ficha abierta, o null. Se muestra como el resultado de una tirada. */
  readonly ficha = signal<Ficha | null>(null);

  verFicha(clave: string) {
    const encontrada = this.fichas().get(clave);
    if (encontrada) this.ficha.set(encontrada);
  }

  // ----------------------------------------------------------- garbo

  /**
   * El garbo es binario y dura entre turnos: se prende cuando lo ganás y se
   * apaga al usar un finisher o al terminar el encuentro. Por eso es un
   * interruptor y no un contador.
   */
  async togglePanache() {
    const record = this.record();
    if (!record) return;
    record.state.panache = !record.state.panache;
    await this.guardar(record);
  }

  // ---------------------------------------------------------- escudo

  /** Raise a Shield: dura hasta el inicio de tu próximo turno, por eso se baja a mano. */
  async toggleShield() {
    const record = this.record();
    const escudo = this.sheet()?.shield;
    if (!record || !escudo) return;

    record.state.shield = {
      raised: !escudo.raised,
      hp: record.state.shield?.hp ?? escudo.maxHp,
    };
    await this.guardar(record);
  }

  /**
   * Shield Block: el escudo absorbe daño hasta su hardness, y el resto lo comen
   * los dos — vos y el escudo.
   */
  readonly lastBlock = signal<{ incoming: number; absorbed: number; toYou: number; toShield: number } | null>(null);

  async shieldBlock(incoming: number) {
    const record = this.record();
    const escudo = this.sheet()?.shield;
    if (!record || !escudo || !incoming) return;

    const absorbed = Math.min(incoming, escudo.hardness);
    const resto = incoming - absorbed;

    record.state.shield = {
      raised: escudo.raised,
      hp: Math.max(0, (record.state.shield?.hp ?? escudo.maxHp) - resto),
    };
    record.state.hp.current = Math.max(0, record.state.hp.current - resto);

    this.lastBlock.set({ incoming, absorbed, toYou: resto, toShield: resto });
    await this.guardar(record);
  }

  async repairShield() {
    const record = this.record();
    const escudo = this.sheet()?.shield;
    if (!record || !escudo) return;
    record.state.shield = { raised: escudo.raised, hp: escudo.maxHp };
    this.lastBlock.set(null);
    await this.guardar(record);
  }

  // ------------------------------------------------- armadura y escudo

  /** Qué defensa se está editando: 'armor', 'shield', o nada. */
  readonly editingDefense = signal<'armor' | 'shield' | null>(null);

  // ------------------------------------------------------- aprender conjuros

  /**
   * Un conjuro no se aprende solo al subir de nivel: un mago copia un pergamino,
   * un máster te regala uno. Desde acá se agregan y se quitan en cualquier momento.
   *
   * Qué lista se toca depende de la clase: los espontáneos tienen repertorio, el
   * mago tiene libro, y los cantrips van aparte en las dos.
   */
  readonly agregandoConjuro = signal<number | null>(null);

  /** El libro del mago, resuelto. Vacío para el resto de las clases. */
  readonly spellbook = computed(() => {
    const ids = this.record()?.build.spellcasting?.spellbook ?? [];
    const porId = new Map(this.spellList().map((s) => [s.id, s]));
    return ids
      .map((id) => porId.get(id))
      .filter((s): s is Spell => !!s)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });

  readonly usaLibro = computed(() => this.sheet()?.spellcasting?.config.source === 'spellbook');

  /** Los que puede aprender de ese rango: de su tradición y que no tenga ya. */
  aprendibles(rank: number): Spell[] {
    const sc = this.sheet()?.spellcasting;
    if (!sc) return [];

    const build = this.record()?.build.spellcasting;
    const yaTiene = new Set([
      ...(build?.cantrips ?? []),
      ...Object.values(build?.repertoire ?? {}).flat(),
      ...(build?.spellbook ?? []),
    ]);

    return this.spellList()
      .filter((s) => (rank === 0 ? s.traits.includes('cantrip') : s.level === rank && !s.traits.includes('cantrip')))
      .filter((s) => !s.traits.includes('focus'))
      .filter((s) => !sc.tradition || s.traditions.includes(sc.tradition))
      .filter((s) => !yaTiene.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async aprenderConjuro(rank: number, id: string | null) {
    const record = this.record();
    if (!record || !id) return;

    const sc = { ...record.build.spellcasting };
    if (rank === 0) {
      sc.cantrips = [...(sc.cantrips ?? []), id];
    } else if (this.usaLibro()) {
      sc.spellbook = [...(sc.spellbook ?? []), id];
    } else {
      const clave = String(rank);
      sc.repertoire = { ...sc.repertoire, [clave]: [...(sc.repertoire?.[clave] ?? []), id] };
    }

    record.build.spellcasting = sc;
    this.agregandoConjuro.set(null);
    await this.guardar(record);
  }

  async olvidarConjuro(rank: number, id: string) {
    const record = this.record();
    if (!record) return;

    const sc = { ...record.build.spellcasting };
    if (rank === 0) {
      sc.cantrips = (sc.cantrips ?? []).filter((x) => x !== id);
    } else if (this.usaLibro()) {
      sc.spellbook = (sc.spellbook ?? []).filter((x) => x !== id);
    } else {
      const clave = String(rank);
      sc.repertoire = { ...sc.repertoire, [clave]: (sc.repertoire?.[clave] ?? []).filter((x) => x !== id) };
      // Si era el signature de ese rango, deja de serlo.
      if (sc.signature?.[clave] === id) {
        const signature = { ...sc.signature };
        delete signature[clave];
        sc.signature = signature;
      }
    }

    record.build.spellcasting = sc;
    await this.guardar(record);
  }

  /**
   * Los rangos a los que se puede aprender algo.
   *
   * Un Cleric o un Druid **no aprenden conjuros**: preparan de toda su tradición,
   * así que ya los tienen todos disponibles. Lo único suyo son los cantrips. Sin
   * esta distinción, la hoja les ofrecía "aprender" algo que después nadie lee.
   */
  readonly rangosAprendibles = computed(() => {
    const sc = this.sheet()?.spellcasting;
    if (!sc || sc.config.source === 'list') return [];
    return Array.from({ length: sc.maxRank }, (_, i) => i + 1);
  });

  /** Un lanzador que prepara de toda la lista solo suma cantrips. */
  readonly soloCantrips = computed(() => this.sheet()?.spellcasting?.config.source === 'list');

  // ------------------------------------------------------- inventario

  readonly addingItem = signal(false);
  readonly itemSearch = signal('');

  /** El inventario con los datos ya resueltos: del dataset o del propio item inventado. */
  readonly inventory = computed(() => {
    const record = this.record();
    const index = this.index();
    if (!record || !index) return [];

    return record.build.inventory.map((item, i) => {
      const base = index.equipmentById.get(item.id);
      return {
        index: i,
        item,
        name: item.custom?.name ?? base?.name ?? 'Objeto sin nombre',
        bulk: base?.bulk ?? item.custom?.bulk ?? 0,
        priceCp: base ? priceToCp(base.price) : (item.custom?.priceCp ?? 0),
        notes: item.custom?.notes ?? null,
        inventado: !base,
        equipable: !base || ['weapon', 'armor', 'shield'].includes(base.type),
      };
    });
  });

  readonly searchResults = computed(() => {
    const q = this.itemSearch().toLowerCase().trim();
    if (q.length < 2) return [];
    const equipo = this.index()?.equipmentById;
    if (!equipo) return [];
    return [...equipo.values()].filter((e) => e.name.toLowerCase().includes(q)).slice(0, 25);
  });

  priceOf = (item: Equipment) => priceToCp(item.price);

  private async guardar(record: CharacterRecord) {
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /** Comprar descuenta de la bolsa; agregar sin comprar (un botín) no toca las monedas. */
  async addItem(id: string, pagar: boolean) {
    const record = this.record();
    const equipo = this.index()?.equipmentById.get(id);
    if (!record) return;

    // Comprar no valida que te alcance: la bolsa puede quedar en cero y listo.
    // En la mesa la plata entra y sale por caminos que la app no ve.
    const precio = priceToCp(equipo?.price);

    const existente = record.build.inventory.find((i) => i.id === id && !i.custom);
    if (existente) existente.quantity += 1;
    else record.build.inventory = [...record.build.inventory, { id, quantity: 1, equipped: false }];

    if (pagar) {
      record.state.coins = Math.max(0, (record.state.coins ?? 0) - precio);
      record.state.purse = splitCp(record.state.coins);
    }
    this.addingItem.set(false);
    this.itemSearch.set('');
    await this.guardar(record);
  }

  /**
   * Objeto inventado: no apunta a nada del dataset, todo sale del propio item.
   * El id lleva prefijo para que se note que no es del catálogo.
   */
  async addInventedItem(name: string, bulk: string, notes: string) {
    const record = this.record();
    if (!record || !name.trim()) return;

    record.build.inventory = [
      ...record.build.inventory,
      {
        id: `inventado:${crypto.randomUUID()}`,
        quantity: 1,
        equipped: false,
        custom: { name: name.trim(), bulk: Number(bulk) || 0, notes: notes.trim() || undefined },
      },
    ];
    this.addingItem.set(false);
    await this.guardar(record);
  }

  async changeQuantity(index: number, delta: number) {
    const record = this.record();
    if (!record) return;
    const item = record.build.inventory[index];
    if (!item) return;

    const cantidad = item.quantity + delta;
    record.build.inventory =
      cantidad <= 0
        ? record.build.inventory.filter((_, i) => i !== index)
        : record.build.inventory.map((it, i) => (i === index ? { ...it, quantity: cantidad } : it));
    await this.guardar(record);
  }

  /** La cantidad se escribe directo, en vez de tocar +/- una por una. */
  async setQuantity(index: number, valor: string) {
    const record = this.record();
    if (!record) return;
    const cantidad = Math.max(1, Math.round(Number(valor) || 1));
    record.build.inventory = record.build.inventory.map((it, i) => (i === index ? { ...it, quantity: cantidad } : it));
    await this.guardar(record);
  }

  /**
   * Ignorar la carga. El bulk se sigue mostrando —es información útil— pero
   * deja de tratarse como un problema: sin advertencia de encumbered ni de
   * pasarte del máximo.
   */
  async setIgnoreBulk(valor: boolean) {
    const record = this.record();
    if (!record) return;
    record.build.ignoreBulk = valor;
    await this.guardar(record);
  }

  /** Sacarlo de la mochila entero, sin importar cuántos tenías. */
  async removeItem(index: number) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = record.build.inventory.filter((_, i) => i !== index);
    await this.guardar(record);
  }

  async toggleEquipped(index: number) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = record.build.inventory.map((it, i) =>
      i === index ? { ...it, equipped: !it.equipped } : it,
    );
    await this.guardar(record);
  }

  // ------------------------------------------------- armas personalizadas

  /** Índice del inventario que se está editando, o null. */
  readonly editingWeapon = signal<number | null>(null);

  customOf(index: number): CustomItem {
    return this.record()?.build.inventory[index]?.custom ?? {};
  }

  /**
   * Los dos números del daño ("1" y "d8") sueltos, para las dos casillas del
   * editor. `st.damageDice` ya viene como el string armado ("1d8"); separarlo
   * acá evita tener que exponer los crudos desde el motor solo para esto.
   */
  private diceDe(st: StrikeSheet): { dice: number; die: string } | null {
    const m = st.damageDice.match(/^(\d+)(d\d+)$/);
    return m ? { dice: Number(m[1]), die: m[2] } : null;
  }

  diceCountOf = (st: StrikeSheet): number | '' => this.diceDe(st)?.dice ?? '';
  dieOf = (st: StrikeSheet): string => this.diceDe(st)?.die ?? '';

  /** El dado de crítico se escribe como "d10"; en minúscula y sin espacios. */
  normalizarDado = (valor: string): string => valor.trim().toLowerCase();

  /**
   * Guarda las diferencias respecto del arma base, y de paso una foto del arma
   * original: así el arma sobrevive aunque se pierda la referencia al dataset.
   */
  async saveCustomItem(index: number, campos: Partial<CustomItem>) {
    const record = this.record();
    const index2 = this.index();
    if (!record || !index2) return;

    const item = record.build.inventory[index];
    if (!item) return;

    const base = index2.equipmentById.get(item.id);
    const anterior = item.custom ?? {};

    const custom: CustomItem = {
      ...anterior,
      ...campos,
      base:
        anterior.base ??
        (base
          ? {
              name: base.name,
              damage: base.damage,
              category: base.category,
              group: base.group,
              traits: base.traits,
              range: base.range,
              acBonus: base.acBonus,
              dexCap: base.dexCap,
              checkPenalty: base.checkPenalty,
              speedPenalty: base.speedPenalty,
              strength: base.strength,
              hardness: base.hardness,
              maxHp: base.maxHp,
            }
          : undefined),
    };

    // Un campo vacío vuelve al valor del arma base en vez de guardar basura.
    for (const clave of [
      'name',
      'damageDice',
      'damageDie',
      'damageType',
      'bonusAttack',
      'bonusDamage',
      'notes',
      'acBonus',
      'dexCap',
      'checkPenalty',
      'speedPenalty',
      'strength',
      'hardness',
      'maxHp',
      'fatal',
      'deadly',
    ] as const) {
      const valor = custom[clave];
      if (valor === '' || valor === null || (typeof valor === 'number' && Number.isNaN(valor))) delete custom[clave];
    }

    record.build.inventory = record.build.inventory.map((it, i) => (i === index ? { ...it, custom } : it));
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  async clearCustomItem(index: number) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = record.build.inventory.map((it, i) =>
      i === index ? { id: it.id, quantity: it.quantity, equipped: it.equipped } : it,
    );
    this.record.set({ ...record });
    this.editingWeapon.set(null);
    await this.characters.save(record);
  }

  /** Los traits van como texto separado por comas. */
  traitsText = (index: number) => (this.customOf(index).traits ?? []).join(', ');

  saveTraits(index: number, texto: string) {
    const traits = texto
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    void this.saveCustomItem(index, { traits });
  }

  numero = (valor: string): number | undefined => (valor === '' ? undefined : Number(valor));

  toggleBreakdown(key: string) {
    this.openBreakdown.update((k) => (k === key ? null : key));
  }

  readonly signed = signed;
  readonly languageLabel = languageLabel;

  // -------------------------------------------------------- ataques naturales

  /**
   * Garras, colmillos, púas que se disparan: no son un objeto de la mochila, así
   * que viven en `build.naturalWeapons` en vez de en el inventario. Usan la
   * misma proficiencia unarmed que el puño.
   */
  readonly addingNatural = signal<'melee' | 'ranged' | null>(null);
  readonly editingNatural = signal<string | null>(null);

  naturalOf(id: string): NaturalWeapon | null {
    return (this.record()?.build.naturalWeapons ?? []).find((n) => n.id === id) ?? null;
  }

  async agregarAtaqueNatural(nombre: string, ranged: boolean, dados: string, dado: string, tipo: string) {
    const record = this.record();
    if (!record || !nombre.trim() || !dado.trim() || !tipo.trim()) return;

    const nuevo: NaturalWeapon = {
      id: crypto.randomUUID(),
      name: nombre.trim(),
      ranged,
      damageDice: Math.max(1, Math.round(Number(dados)) || 1),
      damageDie: dado.trim().toLowerCase(),
      damageType: tipo.trim().toLowerCase(),
      traits: [],
    };

    record.build.naturalWeapons = [...(record.build.naturalWeapons ?? []), nuevo];
    this.addingNatural.set(null);
    await this.guardar(record);
  }

  async quitarAtaqueNatural(id: string) {
    const record = this.record();
    if (!record) return;
    record.build.naturalWeapons = (record.build.naturalWeapons ?? []).filter((n) => n.id !== id);
    await this.guardar(record);
  }

  async saveNatural(id: string, campos: Partial<NaturalWeapon>) {
    const record = this.record();
    if (!record) return;
    record.build.naturalWeapons = (record.build.naturalWeapons ?? []).map((n) =>
      n.id === id ? { ...n, ...campos } : n,
    );
    await this.guardar(record);
  }

  naturalTraitsText = (id: string) => (this.naturalOf(id)?.traits ?? []).join(', ');

  saveNaturalTraits(id: string, texto: string) {
    const traits = texto
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    void this.saveNatural(id, { traits });
  }

  // ----------------------------------------------------------- estado (HP)

  /** El HP se escribe a mano: en la mesa se pierden 14 de una, no de a uno. */
  async setHp(valor: string) {
    const record = this.record();
    const sheet = this.sheet();
    if (!record || !sheet) return;
    const numero = Number(valor);
    if (Number.isNaN(numero)) return;
    record.state.hp.current = Math.max(0, Math.min(sheet.maxHp.total, Math.round(numero)));
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /** HP temporales. Van aparte: no suben el máximo y se gastan primero. */
  async setTempHp(valor: string) {
    const record = this.record();
    if (!record) return;
    const numero = Number(valor);
    if (Number.isNaN(numero)) return;
    record.state.hp.temp = Math.max(0, Math.round(numero));
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  async adjustHp(delta: number) {
    const record = this.record();
    const sheet = this.sheet();
    if (!record || !sheet) return;
    const max = sheet.maxHp.total;
    record.state.hp.current = Math.max(0, Math.min(max, record.state.hp.current + delta));
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  readonly formatCp = formatCp;

  /**
   * La bolsa como la tenés en la mano: si escribís 15 en oro, quedan 15 gp, no
   * 1 pp y 5 gp. Los personajes viejos no tienen la bolsa repartida, así que se
   * reparte su total una primera vez.
   */
  readonly purse = computed(() => {
    const state = this.record()?.state;
    return state?.purse ?? splitCp(state?.coins ?? 0);
  });

  readonly coinTypes = [
    { key: 'pp', name: 'Platino' },
    { key: 'gp', name: 'Oro' },
    { key: 'sp', name: 'Plata' },
    { key: 'cp', name: 'Cobre' },
  ] as const;

  async setCoin(moneda: 'pp' | 'gp' | 'sp' | 'cp', valor: string) {
    const record = this.record();
    if (!record) return;

    const cantidad = Math.max(0, Math.round(Number(valor) || 0));
    const bolsa = { ...this.purse(), [moneda]: cantidad };
    record.state.purse = bolsa;
    record.state.coins = priceToCp(bolsa);
    await this.guardar(record);
  }

  async setHeroPoints(value: number) {
    const record = this.record();
    if (!record) return;
    record.state.heroPoints = Math.max(0, Math.min(3, value));
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /** ¿Esta condición tiene efecto numérico en la hoja, o es solo texto? */
  // ------------------------------------------------------- efectos activos

  /**
   * Rabia, garbo, heroism… lo que se prende un rato. Son 1418 en el pack, así
   * que hay buscador: mostrarlos todos como las 42 condiciones no serviría.
   */
  readonly effectList = signal<Effect[]>([]);
  readonly effectQuery = signal('');

  /** Lo que tenés a mano, prendido o no. */
  readonly effectsEnLista = computed(() => {
    const porId = new Map(this.effectList().map((e) => [e.id, e]));
    return (this.record()?.state.effects ?? [])
      .map((e) => ({ efecto: porId.get(e.id), activo: e.active !== false }))
      .filter((x): x is { efecto: Effect; activo: boolean } => !!x.efecto);
  });

  /** Solo lo que está pasando ahora. */
  readonly effectsActivos = computed(() => this.effectsEnLista().filter((x) => x.activo).map((x) => x.efecto));

  enLista = (id: string) => !!this.record()?.state.effects?.some((e) => e.id === id);
  estaActivo = (id: string) => !!this.record()?.state.effects?.some((e) => e.id === id && e.active !== false);

  /** El buscador: hace falta escribir algo, si no serían 1418 filas. */
  readonly effectResults = computed(() => {
    const q = this.effectQuery().trim().toLowerCase();
    if (q.length < 2) return [];
    return this.effectList()
      .filter((e) => nombreCorto(e).toLowerCase().includes(q))
      .slice(0, 40);
  });

  nombreCorto = nombreCorto;
  avisosDe = avisosDe;

  /** Si mueve algún número de la hoja, o es solo un recordatorio. */
  efectoCalcula = (e: Effect) => seCalcula(e.slug, e.rules.some(esAplicable));

  /**
   * Qué hace, en un renglón. Sale de las reglas del pack cuando las trae, y de
   * la tabla escrita a mano cuando el pack lo dejó vacío (la furia, el escudo).
   */
  queHace(e: Effect): string {
    const aMano = efectoAMano(e.slug);
    if (aMano) return aMano.resumen;


    const mueve = e.rules
      .filter(esAplicable)
      .map((r) => `${valorDe(r)! >= 0 ? '+' : ''}${valorDe(r)} a ${selectoresDe(r).join(', ')}`);
    if (mueve.length) return mueve.join(' · ');

    return avisosDe(e)[0] ?? '';
  }

  readonly efectosSubtitulo = computed(() => {
    const n = this.effectsActivos().length;
    return n ? `${n} activo${n === 1 ? '' : 's'}` : '';
  });



  /** Sumar el efecto a la lista, ya prendido: lo agregás porque está pasando. */
  async addEffect(id: string) {
    const record = this.record();
    if (!record || this.enLista(id)) return;

    record.state.effects = [...(record.state.effects ?? []), { id, active: true }];
    await this.aplicarEfecto(record, id, true);
  }

  /** Sacarlo de la lista. Si estaba prendido, se apaga primero. */
  async removeEffect(id: string) {
    const record = this.record();
    if (!record) return;

    record.state.effects = (record.state.effects ?? []).filter((e) => e.id !== id);
    await this.aplicarEfecto(record, id, false);
  }

  /** Prender o apagar sin sacarlo de la lista: es lo que se hace en cada pelea. */
  async toggleEffect(id: string) {
    const record = this.record();
    if (!record) return;

    const prendiendo = !this.estaActivo(id);
    record.state.effects = (record.state.effects ?? []).map((e) =>
      e.id === id ? { ...e, active: prendiendo } : e,
    );
    await this.aplicarEfecto(record, id, prendiendo);
  }

  /**
   * Lo que un efecto arrastra además de sus modificadores.
   *
   * Son dos casos: los que la hoja ya maneja por otro lado (el escudo alzado
   * tiene su propio interruptor, y sin esto se contaría dos veces) y los que
   * escriben en el estado (la furia da HP temporales, y al salir se pierden
   * los que queden).
   */
  private async aplicarEfecto(record: CharacterRecord, id: string, prendido: boolean) {
    const slug = this.effectList().find((e) => e.id === id)?.slug ?? '';

    if (efectoAMano(slug)?.puente === 'shield') {
      // Los PJ guardados antes de que existiera el escudo no traen ese estado.
      record.state.shield = { ...(record.state.shield ?? { hp: 0 }), raised: prendido };
    }

    if (slug === RAGE_SLUG) {
      const furia = this.sheet()?.rage;
      record.state.hp.temp = prendido ? (furia?.tempHp ?? rageSheet(this.nivel(), this.conMod()).tempHp) : 0;
    }

    this.record.set({ ...record });
    await this.characters.save(record);
  }

  private nivel = () => this.sheet()?.level ?? 1;
  private conMod = () => this.sheet()?.abilityMods.con ?? 0;

  hasEffect = (id: string) => (CONDITION_BY_ID.get(id)?.selectors.length ?? 0) > 0;
  isValued = (id: string) => CONDITION_BY_ID.get(id)?.valued ?? false;

  hasCondition = (id: string) => !!this.record()?.state.conditions.some((c) => c.id === id);
  conditionValue = (id: string) => this.record()?.state.conditions.find((c) => c.id === id)?.value ?? 1;

  async toggleCondition(id: string, valued: boolean) {
    const record = this.record();
    if (!record) return;
    const at = record.state.conditions.findIndex((c) => c.id === id);
    if (at >= 0) record.state.conditions.splice(at, 1);
    else record.state.conditions.push(valued ? { id, value: 1 } : { id });
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  async changeConditionValue(id: string, delta: number) {
    const record = this.record();
    if (!record) return;
    const condition = record.state.conditions.find((c) => c.id === id);
    if (!condition) return;
    const next = (condition.value ?? 1) + delta;
    if (next <= 0) record.state.conditions = record.state.conditions.filter((c) => c.id !== id);
    else condition.value = next;
    this.record.set({ ...record });
    await this.characters.save(record);
  }
}
