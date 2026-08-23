import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { emptyBuild, type CharacterBuild } from '../../core/models/character.model';
import type {
  Ability,
  Deity,
  Spell,
  Ancestry,
  Background,
  ClassFeature,
  Equipment,
  Feat,
  Heritage,
  Pf2Class,
} from '../../core/models/content.model';
import { archetypeFeatAvailable, isArchetypeFeat } from '../../core/rules/archetypes';
import { COMMON_LANGUAGES, UNCOMMON_LANGUAGES, languageLabel, languageSlots } from '../../core/rules/languages';
import { STARTING_MONEY_CP, formatCp, priceToCp } from '../../core/rules/money';
import { CASTERS, cantripsKnownFor, spellSlots, spellbookSize } from '../../core/rules/spellcasting';
import { featureChoicesAt } from '../../core/rules/progression';
import { ABILITIES, ABILITY_NAMES, ALIGNMENTS, ALIGNMENT_NAMES } from '../../core/models/content.model';
import { CharacterService } from '../../core/services/character.service';
import { PartyService } from '../../core/services/party.service';
import { ContentService } from '../../core/services/content.service';
import { SKILLS, abilityMod, applyBoost } from '../../core/rules/tables';
import { OptionPickerComponent, type PickerOption } from '../../shared/option-picker.component';

type StepId =
  | 'ancestry'
  | 'heritage'
  | 'background'
  | 'class'
  | 'deity'
  | 'abilities'
  | 'skills'
  | 'languages'
  | 'feats'
  | 'spells'
  | 'gear'
  | 'name';

interface Step {
  id: StepId;
  label: string;
}

const STEPS: Step[] = [
  { id: 'ancestry', label: 'Ancestría' },
  { id: 'heritage', label: 'Herencia' },
  { id: 'background', label: 'Trasfondo' },
  { id: 'class', label: 'Clase' },
  { id: 'deity', label: 'Deidad' },
  { id: 'abilities', label: 'Atributos' },
  { id: 'skills', label: 'Habilidades' },
  { id: 'languages', label: 'Idiomas' },
  { id: 'feats', label: 'Dotes' },
  { id: 'spells', label: 'Conjuros' },
  { id: 'gear', label: 'Equipo' },
  { id: 'name', label: 'Nombre' },
];

@Component({
  selector: 'app-wizard',
  imports: [FormsModule, RouterLink, OptionPickerComponent],
  templateUrl: './wizard.component.html',
  styleUrl: './wizard.component.scss',
})
export class WizardComponent {
  private content = inject(ContentService);
  private characters = inject(CharacterService);
  private parties = inject(PartyService);
  private router = inject(Router);

  readonly stepIndex = signal(0);
  /** El paso de conjuros solo aparece si la clase lanza. */
  readonly steps = computed(() => STEPS.filter((s) => s.id !== 'spells' || this.isCaster()));
  readonly step = computed(() => this.steps()[Math.min(this.stepIndex(), this.steps().length - 1)]);
  readonly saving = signal(false);

  readonly build = signal<CharacterBuild>(emptyBuild());

  // --- contenido
  readonly ancestries = signal<Ancestry[]>([]);
  readonly heritages = signal<Heritage[]>([]);
  readonly backgrounds = signal<Background[]>([]);
  readonly classes = signal<Pf2Class[]>([]);
  readonly feats = signal<Feat[]>([]);
  readonly equipment = signal<Equipment[]>([]);
  readonly classFeatures = signal<ClassFeature[]>([]);
  readonly spells = signal<Spell[]>([]);
  readonly deities = signal<Deity[]>([]);
  readonly alignments = ALIGNMENTS;
  readonly alignmentNames = ALIGNMENT_NAMES;

  readonly abilityList = ABILITIES;
  readonly abilityNames = ABILITY_NAMES;
  readonly skillList = SKILLS;

  constructor() {
    void this.load();
  }

  private async load() {
    const [ancestries, heritages, backgrounds, classes] = await Promise.all([
      this.content.ancestries(),
      this.content.heritages(),
      this.content.backgrounds(),
      this.content.classes(),
    ]);
    this.ancestries.set(ancestries);
    this.heritages.set(heritages);
    this.backgrounds.set(backgrounds);
    this.classes.set(classes);
    // feats y equipment son los packs pesados: se cargan cuando hacen falta
    void this.content.feats().then((f) => this.feats.set(f));
    void this.content.equipment().then((e) => this.equipment.set(e));
    void this.content.classFeatures().then((f) => this.classFeatures.set(f));
    void this.content.spells().then((s) => this.spells.set(s));
    void this.content.deities().then((d) => this.deities.set(d));

    /*
     * El asistente SÍ muestra el texto de casi todo lo que ofrece —el panel de
     * la derecha describe la ancestría, la dote, el objeto— así que acá se pide
     * de entrada. Es lo contrario de la hoja, donde solo hace falta al abrir
     * un ⓘ, y por eso el pedido es explícito y no automático.
     */
    this.content.asegurarDescripciones('feats', 'equipment', 'spells');
  }

  // --------------------------------------------------------------- deidad

  /** Cleric y Champion la necesitan; para el resto es opcional (y sabor). */
  readonly needsDeity = computed(() => ['cleric', 'champion'].includes(this.build().class ?? ''));

  readonly deityOptions = computed<PickerOption[]>(() =>
    this.deities().map((d) => this.toOption({ ...d, traits: [...d.traits, ...d.domains] })),
  );

  readonly deity = computed(() => this.deities().find((d) => d.id === this.build().deity));

  setDeity(id: string | null) {
    this.patch((b) => (b.deity = id));
  }

  setAlignment(alignment: string) {
    this.patch((b) => (b.alignment = b.alignment === alignment ? null : alignment));
  }

  // ------------------------------------------------------------- conjuros

  readonly caster = computed(() => CASTERS[this.build().class ?? ''] ?? null);
  readonly isCaster = computed(() => this.caster() !== null);

  /** Casi todas la tienen fija; el Sorcerer la hereda del linaje elegido. */
  readonly tradition = computed(() => {
    const fija = this.caster()?.tradition;
    if (fija) return fija;
    for (const choice of this.build().choices.filter((c) => c.slot === 'classFeature')) {
      const feature = this.classFeatures().find((f) => f.id === choice.id);
      if (feature?.tradition) return feature.tradition;
    }
    return null;
  });

  /**
   * Qué hechizos se eligen al crear el personaje depende del tipo de lanzador:
   *  - espontáneo (Sorcerer, Bard): cantrips + repertorio por rango
   *  - libro (Wizard): 10 cantrips + los hechizos del libro
   *  - lista (Cleric, Druid): solo cantrips; los demás se preparan cada día
   */
  readonly spellGroups = computed(() => {
    const config = this.caster();
    if (!config) return [];

    const level = this.build().level;
    const groups: { key: string; label: string; rank: number; limit: number }[] = [
      { key: 'cantrips', label: 'Cantrips', rank: 0, limit: cantripsKnownFor(config) },
    ];

    if (config.source === 'repertoire') {
      for (const { rank, slots } of spellSlots(config.kind, level)) {
        groups.push({ key: String(rank), label: `Rango ${rank}`, rank, limit: slots });
      }
    }

    if (config.source === 'spellbook') {
      groups.push({
        key: 'spellbook',
        label: 'Libro de hechizos (rango 1)',
        rank: 1,
        limit: spellbookSize(config, level),
      });
    }

    return groups;
  });

  /** Cleric y Druid preparan de toda la lista: no eligen nada al crear el PJ. */
  readonly preparesFromList = computed(() => this.caster()?.source === 'list');

  spellOptions(rank: number): PickerOption[] {
    const tradition = this.tradition();
    return this.spells()
      .filter((s) => (rank === 0 ? s.traits.includes('cantrip') : s.level === rank && !s.traits.includes('cantrip')))
      .filter((s) => !s.traits.includes('focus'))
      .filter((s) => !tradition || s.traditions.includes(tradition))
      .map((s) => this.toOption(s));
  }

  chosenSpells(key: string): string[] {
    const sc = this.build().spellcasting;
    if (key === 'cantrips') return sc.cantrips;
    if (key === 'spellbook') return sc.spellbook ?? [];
    return sc.repertoire[key] ?? [];
  }

  spellName = (id: string) => this.spells().find((s) => s.id === id)?.name ?? id;

  addSpell(key: string, limit: number, id: string | null) {
    if (!id) return;
    this.patch((b) => {
      const list =
        key === 'cantrips'
          ? b.spellcasting.cantrips
          : key === 'spellbook'
            ? (b.spellcasting.spellbook ??= [])
            : (b.spellcasting.repertoire[key] ??= []);
      if (list.includes(id) || list.length >= limit) return;
      list.push(id);
    });
  }

  removeSpell(key: string, id: string) {
    this.patch((b) => {
      const quitar = (list: string[]) => list.filter((x) => x !== id);
      if (key === 'cantrips') b.spellcasting.cantrips = quitar(b.spellcasting.cantrips);
      else if (key === 'spellbook') b.spellcasting.spellbook = quitar(b.spellcasting.spellbook ?? []);
      else b.spellcasting.repertoire[key] = quitar(b.spellcasting.repertoire[key] ?? []);
    });
  }

  // ------------------------------------------------------------ selecciones

  readonly ancestry = computed(() => this.ancestries().find((a) => a.slug === this.build().ancestry));
  readonly pf2class = computed(() => this.classes().find((c) => c.slug === this.build().class));
  readonly background = computed(() => this.backgrounds().find((b) => b.slug === this.build().background));

  private patch(fn: (b: CharacterBuild) => void) {
    this.build.update((b) => {
      const next = structuredClone(b);
      fn(next);
      return next;
    });
  }

  // --- opciones para el picker
  private toOption = (x: { id: string; name: string; traits?: string[]; rarity?: string; description?: string; source?: string; level?: number; prerequisites?: string[] }): PickerOption => x;

  readonly ancestryOptions = computed<PickerOption[]>(() =>
    this.ancestries().map((a) => this.toOption({ ...a, id: a.slug })),
  );

  readonly heritageOptions = computed<PickerOption[]>(() => {
    const slug = this.build().ancestry;
    return this.heritages()
      .filter((h) => !slug || h.ancestry === slug || h.traits.includes(slug))
      .map((h) => this.toOption(h));
  });

  readonly backgroundOptions = computed<PickerOption[]>(() =>
    this.backgrounds().map((b) => this.toOption({ ...b, id: b.slug })),
  );

  readonly classOptions = computed<PickerOption[]>(() => this.classes().map((c) => this.toOption({ ...c, id: c.slug })));

  readonly equipmentOptions = computed<PickerOption[]>(() =>
    this.equipment()
      .filter((e) => e.level <= 1)
      .map((e) => this.toOption(e)),
  );

  /** Dotes de nivel 1 disponibles para el slot indicado. */
  featOptions(category: 'class' | 'ancestry'): PickerOption[] {
    const build = this.build();
    const trait = category === 'class' ? build.class : build.ancestry;
    return this.feats()
      .filter((f) => f.category === category && f.level <= 1)
      .filter((f) => (!trait || f.traits.includes(trait)) || (category === 'class' && isArchetypeFeat(f)))
      .filter((f) => !isArchetypeFeat(f) || archetypeFeatAvailable(f, new Set()))
      .map((f) => this.toOption(f));
  }

  // --- setters de cada paso
  setAncestry(slug: string | null) {
    this.patch((b) => {
      b.ancestry = slug;
      b.heritage = null;
      b.abilityBoosts.ancestry = [];
    });
  }

  setHeritage(id: string | null) {
    this.patch((b) => {
      b.heritage = id;
      // Cambiar de herencia tira la skill elegida: la promete la herencia, no vos.
      b.heritageSkill = null;
    });
  }

  /**
   * La skill que promete la herencia, si la promete.
   *
   * Sale de la regla del pack (`skills.{elegida}`), no de una lista escrita a
   * mano: hoy son Skilled Heritage y Ancient Ash, y si mañana el pack trae otra
   * aparece sola.
   */
  readonly heritageSkillChoices = computed<{ id: string; label: string }[]>(() => {
    const heritage = this.heritages().find((h) => h.id === this.build().heritage);
    if (!heritage?.rules.some((r) => r.key === 'Proficiency' && r.elegida)) return [];

    const choiceSet = heritage.rules.find((r) => r.key === 'ChoiceSet');
    return (choiceSet?.choices ?? []).map((c) => ({
      id: c.id,
      label: SKILLS.find((s) => s.slug === c.id)?.name ?? c.id,
    }));
  });

  setHeritageSkill(slug: string) {
    this.patch((b) => (b.heritageSkill = slug || null));
  }

  setBackground(slug: string | null) {
    this.patch((b) => {
      b.background = slug;
      b.abilityBoosts.background = [];
    });
  }

  setClass(slug: string | null) {
    this.patch((b) => {
      b.class = slug;
      b.abilityBoosts.class = [];
      b.trainedSkills = [];
      b.choices = [];
    });
  }

  // ------------------------------------------------------------- atributos

  /** Sets de boosts libres que el jugador tiene que resolver, por origen. */
  readonly ancestryBoostSets = computed(() => (this.ancestry()?.boosts ?? []).filter((s) => s.length > 1));
  readonly backgroundBoostSets = computed(() => (this.background()?.boosts ?? []).filter((s) => s.length > 1));
  readonly classKeyOptions = computed(() => this.pf2class()?.keyAbility ?? []);

  pickBoost(origin: 'ancestry' | 'background' | 'class' | 'level1', index: number, ability: Ability) {
    this.patch((b) => {
      const list = [...b.abilityBoosts[origin]];
      list[index] = ability;
      b.abilityBoosts[origin] = list;
    });
  }

  toggleFreeBoost(ability: Ability) {
    this.patch((b) => {
      const list = b.abilityBoosts.level1;
      const at = list.indexOf(ability);
      if (at >= 0) list.splice(at, 1);
      else if (list.length < 4) list.push(ability);
    });
  }

  /** Preview en vivo de los scores mientras se eligen los boosts. */
  readonly previewScores = computed<Record<Ability, number>>(() => {
    const scores = Object.fromEntries(ABILITIES.map((a) => [a, 10])) as Record<Ability, number>;
    const build = this.build();
    const ancestry = this.ancestry();
    const background = this.background();

    if (ancestry) {
      for (const set of ancestry.flaws) for (const flaw of set) scores[flaw] -= 2;
      let free = 0;
      for (const set of ancestry.boosts) {
        if (set.length === 1) scores[set[0]] = applyBoost(scores[set[0]]);
        else {
          const pick = build.abilityBoosts.ancestry[free++];
          if (pick) scores[pick] = applyBoost(scores[pick]);
        }
      }
    }

    if (background) {
      let free = 0;
      for (const set of background.boosts) {
        if (set.length === 1) scores[set[0]] = applyBoost(scores[set[0]]);
        else {
          const pick = build.abilityBoosts.background[free++];
          if (pick) scores[pick] = applyBoost(scores[pick]);
        }
      }
    }

    const key = build.abilityBoosts.class[0];
    if (key) scores[key] = applyBoost(scores[key]);
    for (const pick of build.abilityBoosts.level1) scores[pick] = applyBoost(scores[pick]);

    return scores;
  });

  readonly previewMods = computed(() => {
    const scores = this.previewScores();
    return Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])])) as Record<Ability, number>;
  });

  // ------------------------------------------------------------- idiomas

  readonly ancestryLanguages = computed(() => this.ancestry()?.languages ?? []);

  readonly languageSlots = computed(() =>
    languageSlots(this.previewMods().int, this.ancestry()?.additionalLanguages ?? 0),
  );

  /** Los de la lista Legacy, menos los que ya da la ancestria. */
  readonly languageOptions = computed(() => {
    const propios = new Set(this.ancestryLanguages());
    return [...COMMON_LANGUAGES, ...UNCOMMON_LANGUAGES].filter((l) => !propios.has(l));
  });

  readonly languageLabel = languageLabel;

  hasLanguage = (language: string) => this.build().languages.includes(language);

  toggleLanguage(language: string) {
    this.patch((b) => {
      const at = b.languages.indexOf(language);
      if (at >= 0) b.languages.splice(at, 1);
      else if (b.languages.length < this.languageSlots()) b.languages.push(language);
    });
  }

  /**
   * Idioma inventado por el master: no hay lista cerrada, se guarda lo que se escriba.
   * Ocupa un cupo como cualquier otro.
   */
  addCustomLanguage(nombre: string) {
    const limpio = nombre.trim().toLowerCase();
    if (!limpio) return;
    this.patch((b) => {
      if (!b.languages.includes(limpio) && b.languages.length < this.languageSlots()) b.languages.push(limpio);
    });
  }

  /** Los que escribio el usuario y no estan en la lista Legacy. */
  readonly customLanguages = computed(() => {
    const conocidos = new Set<string>([...COMMON_LANGUAGES, ...UNCOMMON_LANGUAGES, ...this.ancestryLanguages()]);
    return this.build().languages.filter((l) => !conocidos.has(l));
  });

  // -------------------------------------------------------------- skills

  readonly freeSkillCount = computed(() => {
    const cls = this.pf2class();
    if (!cls) return 0;
    return cls.trainedSkills.additional + abilityMod(this.previewScores().int);
  });

  /**
   * Las habilidades que YA te entrena algo, para no gastar una libre en ellas.
   *
   * No alcanza con la clase y el trasfondo: la herencia también entrena (Anvil
   * Dwarf da Crafting) y las dotes también (Munitions Crafter). Sin esto, el
   * paso mostraba solo Survival y parecía que Crafting estaba libre.
   */
  readonly autoTrained = computed(() => {
    const build = this.build();
    const deReglas = (rules: { key: string; path?: string; elegida?: boolean }[] | undefined) =>
      (rules ?? [])
        .filter((r) => r.key === 'Proficiency' && r.path?.startsWith('skills.'))
        .map((r) => (r.elegida || r.path === 'skills.{elegida}' ? build.heritageSkill : r.path!.split('.')[1]))
        .filter((s): s is string => !!s);

    const heritage = this.heritages().find((h) => h.id === build.heritage);
    const dotes = build.choices
      .filter((c) => c.id)
      .map((c) => this.feats().find((f) => f.id === c.id))
      .filter((f): f is Feat => !!f);

    return [
      ...new Set([
        ...(this.pf2class()?.trainedSkills.fixed ?? []),
        ...(this.background()?.trainedSkills ?? []),
        ...deReglas(heritage?.rules),
        ...dotes.flatMap((f) => deReglas(f.rules)),
      ]),
    ];
  });

  toggleSkill(slug: string) {
    if (this.autoTrained().includes(slug)) return;
    this.patch((b) => {
      const at = b.trainedSkills.indexOf(slug);
      if (at >= 0) b.trainedSkills.splice(at, 1);
      else if (b.trainedSkills.length < this.freeSkillCount()) b.trainedSkills.push(slug);
    });
  }

  isTrained = (slug: string) => this.autoTrained().includes(slug) || this.build().trainedSkills.includes(slug);

  // --------------------------------------------------------------- dotes

  chosenFeat(slot: 'classFeat' | 'ancestryFeat'): string | null {
    return this.build().choices.find((c) => c.slot === slot && c.level === 1)?.id ?? null;
  }

  setFeat(slot: 'classFeat' | 'ancestryFeat', id: string | null) {
    this.patch((b) => {
      b.choices = b.choices.filter((c) => !(c.slot === slot && c.level === 1));
      if (id) b.choices.push({ level: 1, slot, id, index: 0 });
    });
  }

  // --- elecciones que abren los rasgos de nivel 1 (vía, instinct, racket…)

  readonly featureChoices = computed(() => featureChoicesAt(this.pf2class(), 1, this.classFeatures()));

  featureOptions = (options: ClassFeature[]): PickerOption[] => options.map((o) => this.toOption(o));

  chosenFeature(sourceId: string): string | null {
    return this.build().choices.find((c) => c.slot === 'classFeature' && c.source === sourceId)?.id ?? null;
  }

  setFeatureChoice(sourceId: string, id: string | null) {
    this.patch((b) => {
      b.choices = b.choices.filter((c) => !(c.slot === 'classFeature' && c.source === sourceId));
      if (id) b.choices.push({ level: 1, slot: 'classFeature', id, source: sourceId, index: 0 });
    });
  }

  // --------------------------------------------------------------- equipo

  addGear(id: string | null) {
    if (!id) return;
    this.patch((b) => {
      const existing = b.inventory.find((i) => i.id === id);
      if (existing) existing.quantity++;
      else b.inventory.push({ id, quantity: 1, equipped: true });
    });
  }

  removeGear(id: string) {
    this.patch((b) => (b.inventory = b.inventory.filter((i) => i.id !== id)));
  }

  /**
   * La cantidad se escribe en la mochila.
   *
   * Volver a elegir el mismo objeto en la lista no alcanzaba: el picker no
   * vuelve a emitir si el id seleccionado no cambió, así que no había forma de
   * llevar dos antorchas.
   */
  setGearQuantity(id: string, valor: string) {
    const cantidad = Math.max(1, Math.round(Number(valor)) || 1);
    this.patch((b) => {
      const item = b.inventory.find((i) => i.id === id);
      if (item) item.quantity = cantidad;
    });
  }

  gearName = (id: string) => this.equipment().find((e) => e.id === id)?.name ?? id;

  gearPrice = (id: string) => priceToCp(this.equipment().find((e) => e.id === id)?.price);

  /** Presupuesto de creación: 15 gp contra lo que cuesta lo elegido. */
  readonly spentCp = computed(() =>
    this.build().inventory.reduce((total, item) => total + this.gearPrice(item.id) * (item.quantity || 1), 0),
  );

  readonly remainingCp = computed(() => STARTING_MONEY_CP - this.spentCp());
  readonly startingMoney = STARTING_MONEY_CP;
  readonly formatCp = formatCp;

  updateDetail(campo: 'age' | 'appearance' | 'notes', valor: string) {
    this.patch((b) => (b[campo] = valor));
  }

  // ----------------------------------------------------------- navegacion

  readonly canContinue = computed(() => {
    const b = this.build();
    switch (this.step().id) {
      case 'ancestry':
        return !!b.ancestry;
      case 'background':
        return !!b.background;
      case 'class':
        return !!b.class;
      case 'name':
        return b.name.trim().length > 0;
      case 'spells':
        return true;
      case 'abilities':
        /*
         * Se bloquea a propósito: los boosts no se podían corregir después, y
         * un personaje que salía del asistente sin elegirlos quedaba con
         * atributos mal para siempre. Ahora además se pueden editar desde la
         * hoja, pero es mejor no llegar ahí con el problema hecho.
         */
        return this.boostsPendientes().length === 0;
      default:
        return true;
    }
  });

  /** Lo que falta elegir en el paso de atributos, en palabras. */
  readonly boostsPendientes = computed<string[]>(() => {
    const b = this.build();
    const faltan: string[] = [];

    this.ancestryBoostSets().forEach((_, i) => {
      if (!b.abilityBoosts.ancestry[i]) faltan.push(`boost de ancestría ${i + 1}`);
    });
    this.backgroundBoostSets().forEach((_, i) => {
      if (!b.abilityBoosts.background[i]) faltan.push(`boost de trasfondo ${i + 1}`);
    });
    if (this.classKeyOptions().length > 1 && !b.abilityBoosts.class[0]) faltan.push('el atributo clave de la clase');

    const libres = b.abilityBoosts.level1.filter(Boolean).length;
    if (libres < 4) faltan.push(`${4 - libres} boost(s) libre(s) de nivel 1`);

    return faltan;
  });

  next() {
    if (this.stepIndex() < this.steps().length - 1) this.stepIndex.update((i) => i + 1);
  }

  back() {
    if (this.stepIndex() > 0) this.stepIndex.update((i) => i - 1);
  }

  goTo(index: number) {
    this.stepIndex.set(index);
  }

  /**
   * Si llegaste acá desde una partida (`?party=<id>`), al terminar te sentás con
   * el personaje recién creado y volvés a la mesa.
   */
  private readonly partyId = new URLSearchParams(location.search).get('party');

  async finish() {
    this.saving.set(true);
    try {
      const record = await this.characters.create(this.build());
      // Lo que no gastaste en la creación queda como tu bolsa inicial.
      record.state.coins = Math.max(0, this.remainingCp());
      await this.characters.save(record);

      if (this.partyId) {
        await this.parties.setCharacter(this.partyId, record.id);
        void this.router.navigate(['/parties', this.partyId]);
        return;
      }

      void this.router.navigate(['/characters', record.id]);
    } finally {
      this.saving.set(false);
    }
  }

  updateName(value: string) {
    this.patch((b) => (b.name = value));
  }
}
