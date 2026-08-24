import { Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { CharacterRecord, Choice } from '../../core/models/character.model';
import type { Ability, Background, ClassFeature, Feat, Pf2Class, Spell } from '../../core/models/content.model';
import { ABILITIES, ABILITY_NAMES } from '../../core/models/content.model';
import { archetypeFeatAvailable, isArchetypeFeat, ownedDedications } from '../../core/rules/archetypes';
import { computeCharacter } from '../../core/rules/character.engine';
import type { ContentIndex } from '../../core/rules/character.engine';
import { evaluatePrerequisite } from '../../core/rules/prerequisites';
import {
  featureChoicesAt,
  featuresGainedAt,
  isBoostLevel,
  slotsForLevel,
  type PendingSlot,
} from '../../core/rules/progression';
import { CANTRIPS_KNOWN, CASTER_KIND, spellSlots } from '../../core/rules/spellcasting';
import { SKILLS } from '../../core/rules/tables';
import { CharacterService } from '../../core/services/character.service';
import { ContentService } from '../../core/services/content.service';
import { OptionPickerComponent, type PickerOption } from '../../shared/option-picker.component';

/**
 * "¿Qué me toca elegir al subir a nivel N?"
 *
 * Los slots salen de los arrays de la clase en el dataset (ver progression.ts),
 * asi que esta pantalla no tiene ninguna tabla hardcodeada.
 */
@Component({
  selector: 'app-level-up',
  imports: [RouterLink, OptionPickerComponent],
  templateUrl: './level-up.component.html',
  styleUrl: './level-up.component.scss',
})
export class LevelUpComponent implements OnInit {
  private content = inject(ContentService);
  private characters = inject(CharacterService);
  private router = inject(Router);

  readonly id = input.required<string>();

  readonly record = signal<CharacterRecord | null>(null);
  readonly classes = signal<Pf2Class[]>([]);
  readonly feats = signal<Feat[]>([]);
  readonly classFeatures = signal<ClassFeature[]>([]);
  readonly backgrounds = signal<Background[]>([]);
  readonly spells = signal<Spell[]>([]);
  /** Hechizos nuevos elegidos en esta subida: { rango: ids[] } */
  readonly newSpells = signal<Record<string, string[]>>({});
  readonly saving = signal(false);

  readonly skillList = SKILLS;
  readonly abilityList = ABILITIES;
  readonly abilityNames = ABILITY_NAMES;

  /** Elecciones de esta subida, todavia sin confirmar. */
  readonly picks = signal<Record<string, string>>({});
  readonly boostPicks = signal<Ability[]>([]);

  readonly pf2class = computed(() => this.classes().find((c) => c.slug === this.record()?.build.class));
  readonly currentLevel = computed(() => this.record()?.build.level ?? 1);
  readonly nextLevel = computed(() => this.currentLevel() + 1);
  readonly atMax = computed(() => this.currentLevel() >= 20);

  readonly slots = computed(() => slotsForLevel(this.pf2class(), this.nextLevel()));
  readonly newFeatures = computed(() => featuresGainedAt(this.pf2class(), this.nextLevel()));
  readonly needsBoosts = computed(() => isBoostLevel(this.nextLevel()));

  readonly allResolved = computed(() => {
    const picks = this.picks();
    const slotsOk = this.slots().every((s) => picks[this.slotKey(s)]);
    const featuresOk = this.featureChoices().every((c) => picks[this.featureKey(c.sourceId)]);
    const boostsOk = !this.needsBoosts() || this.boostPicks().length === 4;
    const spellsOk = this.newSpellGroups().every((g) => this.chosenNew(g.key).length === g.limit);
    return slotsOk && featuresOk && boostsOk && spellsOk;
  });

  /** El input `id` viene del router: no esta disponible en el constructor. */
  ngOnInit() {
    void this.load();
  }

  private async load() {
    const [classes, record] = await Promise.all([this.content.classes(), this.characters.get(this.id())]);
    this.classes.set(classes);
    this.record.set(record);
    void this.content.feats().then((f) => this.feats.set(f));
    void this.content.classFeatures().then((f) => this.classFeatures.set(f));
    void this.content.backgrounds().then((b) => this.backgrounds.set(b));
    void this.content.spells().then((s) => this.spells.set(s));

    /*
     * El mismo pedido que hace el asistente, y por el mismo motivo: esta
     * pantalla usa el `option-picker`, cuyo panel derecho ES la descripción de
     * lo que estás por elegir. Sin esto el texto viaja aparte y nunca se pide,
     * así que el panel salía vacío y elegías una dote a ciegas, por el nombre.
     *
     * Los prerrequisitos no dependen de esto: viajan en `feats.json` y siempre
     * se vieron.
     */
    this.content.asegurarDescripciones('feats', 'spells');

    /*
     * El índice completo, solo para poder calcular la hoja y de ahí sacar el
     * contexto con el que se evalúan los prerrequisitos. Es la misma cuenta que
     * hace la hoja para avisarte de las dotes que YA tenés; acá se aplica a las
     * candidatas.
     */
    void this.content.index().then((i) => this.index.set(i));
  }

  private readonly index = signal<ContentIndex | null>(null);

  /**
   * Con qué medir los requisitos de cada dote de la lista.
   *
   * Se calcula sobre el nivel ACTUAL, no el que estás por alcanzar: los
   * requisitos se cumplen al momento de elegir. Una dote que pide nivel 5 no la
   * podés tomar con el slot que te dio llegar a 5... salvo que el manual diga
   * lo contrario, y por eso nada de esto bloquea: solo informa.
   */
  private readonly contextoDeRequisitos = computed(() => {
    const record = this.record();
    const index = this.index();
    if (!record || !index) return null;
    return computeCharacter(record.build, record.state, index).prerequisitos;
  });

  /** Si el personaje cumple lo que pide esta dote. */
  private requisitosDe(feat: Feat): 'met' | 'unmet' | 'unknown' | undefined {
    const ctx = this.contextoDeRequisitos();
    if (!ctx) return undefined;
    if (!feat.prerequisites?.length) return 'met';

    const estados = feat.prerequisites.map((p) => evaluatePrerequisite(p, ctx));
    // Hay que cumplirlos TODOS: basta uno incumplido para no llegar.
    if (estados.includes('unmet')) return 'unmet';
    return estados.includes('unknown') ? 'unknown' : 'met';
  }

  // ------------------------------------------------------------- conjuros

  readonly casterKind = computed(() => CASTER_KIND[this.record()?.build.class ?? ''] ?? null);

  readonly tradition = computed(() => {
    const build = this.record()?.build;
    if (build?.class === 'bard') return 'occult';
    for (const choice of build?.choices ?? []) {
      const feature = this.classFeatures().find((f) => f.id === choice.id);
      if (feature?.tradition) return feature.tradition;
    }
    return null;
  });

  /** Cuántos hechizos nuevos entran al repertorio en este nivel, por rango. */
  readonly newSpellGroups = computed(() => {
    const kind = this.casterKind();
    const build = this.record()?.build;
    if (!kind || !build) return [];

    const before = new Map(spellSlots(kind, this.currentLevel()).map((s) => [s.rank, s.slots]));
    const groups: { key: string; label: string; rank: number; limit: number }[] = [];

    for (const { rank, slots } of spellSlots(kind, this.nextLevel())) {
      const nuevos = slots - (before.get(rank) ?? 0);
      if (nuevos > 0) groups.push({ key: String(rank), label: `Rango ${rank}`, rank, limit: nuevos });
    }

    // Los cantrips no crecen en cantidad, pero si faltan se pueden completar.
    const faltan = CANTRIPS_KNOWN - (build.spellcasting?.cantrips?.length ?? 0);
    if (faltan > 0) groups.unshift({ key: 'cantrips', label: 'Cantrips', rank: 0, limit: faltan });

    return groups;
  });

  spellOptions(rank: number): PickerOption[] {
    const tradition = this.tradition();
    const taken = new Set(Object.values(this.record()?.build.spellcasting?.repertoire ?? {}).flat());
    return this.spells()
      .filter((s) => (rank === 0 ? s.traits.includes('cantrip') : s.level === rank && !s.traits.includes('cantrip')))
      .filter((s) => !s.traits.includes('focus'))
      .filter((s) => !tradition || s.traditions.includes(tradition))
      .filter((s) => !taken.has(s.id));
  }

  chosenNew = (key: string) => this.newSpells()[key] ?? [];
  spellName = (id: string) => this.spells().find((s) => s.id === id)?.name ?? id;

  addSpell(key: string, limit: number, id: string | null) {
    if (!id) return;
    this.newSpells.update((map) => {
      const list = map[key] ?? [];
      if (list.includes(id) || list.length >= limit) return map;
      return { ...map, [key]: [...list, id] };
    });
  }

  removeSpell(key: string, id: string) {
    this.newSpells.update((map) => ({ ...map, [key]: (map[key] ?? []).filter((x) => x !== id) }));
  }

  /** Elecciones que abren los rasgos ganados en este nivel (vía, instinct, racket…). */
  readonly featureChoices = computed(() =>
    featureChoicesAt(this.pf2class(), this.nextLevel(), this.classFeatures()),
  );

  featureKey = (sourceId: string) => `feature:${sourceId}`;

  /** Lores que el personaje ya tiene, para poder subirlos con un skill increase. */
  readonly loreOptions = computed(() => {
    const slug = this.record()?.build.background;
    const background = this.backgrounds().find((b) => b.slug === slug);
    return (background?.lore ?? []).map((lore) => ({
      slug: `lore:${lore.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: `${lore.replace(/\s*Lore$/i, '')} Lore`,
    }));
  });

  slotKey = (slot: PendingSlot) => `${slot.level}:${slot.slot}:${slot.index}`;

  /** Opciones validas para un slot: por categoria de dote y nivel alcanzado. */
  optionsFor(slot: PendingSlot): PickerOption[] {
    if (!slot.featCategory) return [];
    const build = this.record()?.build;
    const trait = slot.featCategory === 'class' ? build?.class : build?.ancestry;
    const alreadyTaken = new Set((build?.choices ?? []).map((c) => c.id));

    // Los arquetipos entran por el slot de dote de clase: una dedication siempre se
    // puede tomar, y las dotes de un arquetipo solo si ya tenés su dedication.
    const owned = ownedDedications(
      (build?.choices ?? []).map((c) => this.feats().find((f) => f.id === c.id)).filter((f): f is Feat => !!f),
    );

    return this.feats()
      .filter((f) => f.category === slot.featCategory)
      .filter((f) => f.level <= slot.level)
      .filter((f) => !f.onlyLevel1 || slot.level === 1)
      .filter((f) => {
        if (slot.featCategory === 'general' || slot.featCategory === 'skill') return true;
        if (slot.featCategory === 'class' && isArchetypeFeat(f)) return archetypeFeatAvailable(f, owned);
        return !trait || f.traits.includes(trait);
      })
      /*
       * Las que ya tenés se muestran deshabilitadas en vez de desaparecer: si
       * una dote se toma de otra categoría (Fleet como dote adicional, por
       * ejemplo) y después la buscás acá, no aparecer sin explicación se lee
       * como que falta en el dataset.
       */
      .map((f) =>
        f.maxTakable > 1 || !alreadyTaken.has(f.id) ? f : { ...f, deshabilitada: true, motivo: 'ya la tenés' },
      )
      // Los requisitos van al final: se calculan sobre la dote, no sobre el filtro.
      .map((f) => ({ ...f, requisitos: this.requisitosDe(f as Feat) }));
  }

  pick(slot: PendingSlot, value: string | null) {
    if (!value) return;
    this.picks.update((p) => ({ ...p, [this.slotKey(slot)]: value }));
  }

  pickByKey(key: string, value: string | null) {
    if (!value) return;
    this.picks.update((p) => ({ ...p, [key]: value }));
  }

  pickedByKey = (key: string) => this.picks()[key] ?? null;

  featureOptions = (options: ClassFeature[]): PickerOption[] => options;

  picked = (slot: PendingSlot) => this.picks()[this.slotKey(slot)] ?? null;

  toggleBoost(ability: Ability) {
    this.boostPicks.update((list) => {
      const at = list.indexOf(ability);
      if (at >= 0) return list.filter((a) => a !== ability);
      return list.length < 4 ? [...list, ability] : list;
    });
  }

  async confirm() {
    const record = this.record();
    if (!record || !this.allResolved()) return;

    this.saving.set(true);
    try {
      const level = this.nextLevel();
      const newChoices: Choice[] = this.slots().map((slot) => {
        const value = this.picks()[this.slotKey(slot)];
        return slot.slot === 'skillIncrease'
          ? { level, slot: slot.slot, skill: value, index: slot.index }
          : { level, slot: slot.slot, id: value, index: slot.index };
      });

      const featureChoices: Choice[] = this.featureChoices().map((choice) => ({
        level,
        slot: 'classFeature',
        id: this.picks()[this.featureKey(choice.sourceId)],
        source: choice.sourceId,
        index: 0,
      }));

      // Los hechizos nuevos se suman al repertorio permanente.
      for (const group of this.newSpellGroups()) {
        const chosen = this.chosenNew(group.key);
        if (!chosen.length) continue;
        if (group.key === 'cantrips') {
          record.build.spellcasting.cantrips = [...(record.build.spellcasting.cantrips ?? []), ...chosen];
        } else {
          const current = record.build.spellcasting.repertoire[group.key] ?? [];
          record.build.spellcasting.repertoire = {
            ...record.build.spellcasting.repertoire,
            [group.key]: [...current, ...chosen],
          };
        }
      }

      record.build.level = level;
      record.build.choices = [...record.build.choices, ...newChoices, ...featureChoices];

      if (this.needsBoosts()) {
        const key = `level${level}` as 'level5' | 'level10' | 'level15' | 'level20';
        record.build.abilityBoosts[key] = this.boostPicks();
      }

      await this.characters.save(record);
      void this.router.navigate(['/characters', record.id]);
    } finally {
      this.saving.set(false);
    }
  }
}
