import { Component, computed, inject, input, signal, type OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

import { emptyState, type CharacterRecord, type CustomItem, type Favorite } from '../../core/models/character.model';
import { ABILITIES, ABILITY_NAMES, PROFICIENCY_NAMES } from '../../core/models/content.model';
import type { Equipment, Spell } from '../../core/models/content.model';
import { CONDITION_BY_ID } from '../../core/rules/conditions';
import { criticalTotal, rollFormula, type DiceRoll } from '../../core/rules/dice';
import { COMMON_LANGUAGES, UNCOMMON_LANGUAGES, languageLabel } from '../../core/rules/languages';
import { formatCp, priceToCp, splitCp } from '../../core/rules/money';
import { castableRanks, scaledDamage } from '../../core/rules/spellcasting';
import { computeCharacter, type ContentIndex, type StrikeSheet } from '../../core/rules/character.engine';
import { signed, type Stat } from '../../core/rules/modifiers';
import { CharacterService } from '../../core/services/character.service';
import { AccordionComponent } from '../../shared/accordion.component';
import { ContentService, type ConditionText } from '../../core/services/content.service';

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

@Component({
  selector: 'app-sheet',
  imports: [RouterLink, NgTemplateOutlet, AccordionComponent],
  templateUrl: './sheet.component.html',
  styleUrl: './sheet.component.scss',
})
export class SheetComponent implements OnInit {
  private content = inject(ContentService);
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

  /** El input `id` viene del router: no esta disponible en el constructor. */
  ngOnInit() {
    void this.load();
  }

  private async load() {
    const [index] = await Promise.all([this.content.index()]);
    void this.content.spells().then((s) => this.spellList.set(s));
    void this.content.conditions().then((c) => this.conditionList.set(c));
    this.index.set(index);
    const record = await this.characters.get(this.id());
    if (record) {
      // Los PJ guardados antes de tener `state` no lo traen.
      record.state ??= emptyState();
      // Los PJ guardados antes de que existieran estos campos no los traen.
      record.state.preparedSpells ??= {};
      record.state.coins ??= 0;
      record.state.spellSlotsUsed ??= {};
      record.build.languages ??= [];
      record.build.favorites ??= [];
      record.build.inventory ??= [];
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
   * Rasgos y dotes agrupados por origen. Se muestran los grupos que tengan algo:
   * un personaje de nivel 1 no tiene dotes generales todavia.
   */
  readonly featGroups = computed(() => {
    const sheet = this.sheet();
    if (!sheet) return [];

    const etiquetas: { key: string; label: string }[] = [
      { key: 'ancestry', label: 'Ancestría' },
      { key: 'class', label: 'Clase' },
      { key: 'skill', label: 'Habilidad' },
      { key: 'general', label: 'Generales' },
      { key: 'bonus', label: 'Adicionales' },
    ];

    const todos = [
      ...sheet.features.map((f) => ({ ...f, esDote: false })),
      ...sheet.feats.map((f) => ({ name: f.name, level: f.level, source: f.source, esDote: true })),
    ];

    return etiquetas
      .map(({ key, label }) => ({
        label,
        items: todos.filter((f) => f.source === key).sort((a, b) => a.level - b.level),
      }))
      .filter((g) => g.items.length);
  });

  // ------------------------------------------------------------- favoritos

  /**
   * Lo que el jugador quiere tener a mano. Se guarda una referencia y se resuelve
   * cada vez contra la hoja: si sube el modificador, el favorito ya lo refleja.
   */
  readonly favorites = computed(() => {
    const sheet = this.sheet();
    const guardados = this.record()?.build.favorites ?? [];
    if (!sheet) return [];

    const porId = new Map(this.spellList().map((s) => [s.id, s]));

    return guardados
      .map((fav) => {
        if (fav.kind === 'strike') {
          const strike = sheet.strikes.find((s) => s.name === fav.ref);
          return strike ? { fav, label: strike.name, detail: signed(strike.attack.total), strike } : null;
        }
        if (fav.kind === 'skill') {
          const skill = [...sheet.skills, ...sheet.lores].find((s) => s.slug === fav.ref);
          return skill ? { fav, label: skill.name, detail: signed(skill.stat.total), stat: skill.stat } : null;
        }
        const spell = porId.get(fav.ref);
        return spell ? { fav, label: spell.name, detail: `rango ${spell.level}`, spell } : null;
      })
      .filter((f): f is NonNullable<typeof f> => !!f);
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
  rollFavorite(fav: ReturnType<typeof this.favorites>[number]) {
    if ('strike' in fav && fav.strike) this.rollStrike(fav.strike);
    else if ('stat' in fav && fav.stat) this.roll(fav.label, fav.stat);
    else if ('spell' in fav && fav.spell) this.castSpell(fav.spell, fav.spell.level);
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

  // ---------------------------------------------------------------- retrato

  /**
   * El retrato viaja dentro del mismo jsonb que el resto del personaje, asi que se
   * achica a 256px antes de guardarlo: una foto de camara entera no entra.
   */
  async setPortrait(input: HTMLInputElement) {
    const file = input.files?.[0];
    const record = this.record();
    if (!file || !record) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });

    const lado = 256;
    const canvas = document.createElement('canvas');
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext('2d')!;
    // Recorte cuadrado centrado: la ficha muestra un retrato, no la foto entera.
    const corte = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);

    record.build.portrait = canvas.toDataURL('image/jpeg', 0.8);
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

  /** Si no te alcanza, el botón de comprar queda deshabilitado en vez de no hacer nada. */
  canAfford = (item: Equipment) => priceToCp(item.price) <= (this.record()?.state.coins ?? 0);

  private async guardar(record: CharacterRecord) {
    this.record.set({ ...record });
    await this.characters.save(record);
  }

  /** Comprar descuenta de la bolsa; agregar sin comprar (un botín) no toca las monedas. */
  async addItem(id: string, pagar: boolean) {
    const record = this.record();
    const equipo = this.index()?.equipmentById.get(id);
    if (!record) return;

    const precio = priceToCp(equipo?.price);
    if (pagar && precio > (record.state.coins ?? 0)) return;

    const existente = record.build.inventory.find((i) => i.id === id && !i.custom);
    if (existente) existente.quantity += 1;
    else record.build.inventory = [...record.build.inventory, { id, quantity: 1, equipped: false }];

    if (pagar) {
      record.state.coins = (record.state.coins ?? 0) - precio;
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

  async toggleEquipped(index: number) {
    const record = this.record();
    if (!record) return;
    record.build.inventory = record.build.inventory.map((it, i) =>
      i === index ? { ...it, equipped: !it.equipped } : it,
    );
    await this.guardar(record);
  }

  /** En PF2e los objetos se venden a la mitad de su precio. */
  async sellItem(index: number) {
    const record = this.record();
    const fila = this.inventory()[index];
    if (!record || !fila) return;

    record.state.coins = (record.state.coins ?? 0) + Math.floor(fila.priceCp / 2);
    record.state.purse = splitCp(record.state.coins);
    record.build.inventory =
      fila.item.quantity > 1
        ? record.build.inventory.map((it, i) => (i === index ? { ...it, quantity: it.quantity - 1 } : it))
        : record.build.inventory.filter((_, i) => i !== index);
    await this.guardar(record);
  }

  // ------------------------------------------------- armas personalizadas

  /** Índice del inventario que se está editando, o null. */
  readonly editingWeapon = signal<number | null>(null);

  customOf(index: number): CustomItem {
    return this.record()?.build.inventory[index]?.custom ?? {};
  }

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
