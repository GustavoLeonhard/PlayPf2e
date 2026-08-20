import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { emptyBuild, emptyState, type CharacterBuild, type NaturalWeapon } from '../models/character.model';
import type {
  Ancestry,
  Background,
  ClassFeature,
  Equipment,
  Feat,
  Heritage,
  Pf2Class,
  Spell,
} from '../models/content.model';
import { computeCharacter, type ContentIndex } from './character.engine';
import { buildStat, mod } from './modifiers';
import { archetypeFeatAvailable } from './archetypes';
import { CONDITIONS } from './conditions';
import { COMMON_LANGUAGES, UNCOMMON_LANGUAGES } from './languages';
import { formatCp, priceToCp } from './money';
import { cantripRank, scaledDamage, spellSlots } from './spellcasting';
import { evaluatePrerequisite } from './prerequisites';
import { slotsForLevel } from './progression';
import { applyBoost } from './tables';

// Se testea contra el dataset real importado, no contra fixtures inventados:
// si el importador rompe algo, estos tests lo agarran.
const DATA = join(process.cwd(), 'public', 'data');
const load = <T>(file: string): T[] => JSON.parse(readFileSync(join(DATA, `${file}.json`), 'utf8'));

const classes = load<Pf2Class>('classes');
const ancestries = load<Ancestry>('ancestries');
const heritages = load<Heritage>('heritages');
const backgrounds = load<Background>('backgrounds');
const features = load<ClassFeature>('class-features');
const feats = load<Feat>('feats');
const equipment = load<Equipment>('equipment');
const actions = load<ClassFeature>('actions');
const spells = load<Spell>('spells');
const deities = load<{ id: string; name: string; favoredWeapons: string[] }>('deities');
const conditionTexts = load<{ id: string; name: string; source: string; text: string }>('conditions');

const content: ContentIndex = {
  classBySlug: new Map(classes.map((c) => [c.slug, c])),
  ancestryBySlug: new Map(ancestries.map((a) => [a.slug, a])),
  heritageById: new Map(heritages.map((h) => [h.id, h])),
  backgroundBySlug: new Map(backgrounds.map((b) => [b.slug, b])),
  featById: new Map(feats.map((f) => [f.id, f])),
  featureById: new Map(features.map((f) => [f.id, f])),
  equipmentById: new Map(equipment.map((e) => [e.id, e])),
  actionById: new Map(actions.map((a) => [a.id, a])),
  featNames: new Set(feats.map((f) => f.name.toLowerCase())),
  deityById: new Map(deities.map((d) => [d.id, d as never])),
};

const fighter = content.classBySlug.get('fighter')!;

/** Humano guerrero: str 18, dex 12, con 14 al nivel 1. */
function humanFighter(level = 1): CharacterBuild {
  const build = emptyBuild();
  build.name = 'Valeros';
  build.level = level;
  build.ancestry = 'human';
  build.class = 'fighter';
  build.background = backgrounds.find((b) => b.trainedSkills.includes('athletics'))!.slug;
  build.abilityBoosts.ancestry = ['str', 'con'];
  build.abilityBoosts.background = ['str', 'dex'];
  build.abilityBoosts.class = ['str'];
  build.abilityBoosts.level1 = ['str', 'dex', 'con', 'wis'];
  build.trainedSkills = ['athletics', 'acrobatics', 'intimidation'];
  return build;
}

describe('pipeline de modificadores', () => {
  it('acumula los tipos que acumulan', () => {
    const stat = buildStat([mod('Str', 4, 'ability'), mod('Trained', 2, 'proficiency'), mod('Level', 5, 'level')]);
    expect(stat.total).toBe(11);
    expect(stat.suppressed).toHaveLength(0);
  });

  it('aplica solo el mayor bonus de un tipo que no acumula', () => {
    const stat = buildStat([mod('Base', 10, 'untyped'), mod('Bendición', 1, 'status'), mod('Heroísmo', 2, 'status')]);
    expect(stat.total).toBe(12);
    expect(stat.suppressed.map((m) => m.source)).toEqual(['Bendición']);
  });

  it('aplica la peor penalidad y el mejor bonus del mismo tipo a la vez', () => {
    const stat = buildStat([
      mod('Base', 10, 'untyped'),
      mod('Heroísmo', 2, 'status'),
      mod('Frightened 1', -1, 'status'),
      mod('Sickened 2', -2, 'status'),
    ]);
    // +2 del mejor bonus, -2 de la peor penalidad: los dos aplican, entre si no compiten.
    expect(stat.total).toBe(10);
    expect(stat.suppressed.map((m) => m.source)).toEqual(['Frightened 1']);
  });

  it('boost de +2, o +1 si ya llegaste a 18', () => {
    expect(applyBoost(10)).toBe(12);
    expect(applyBoost(16)).toBe(18);
    expect(applyBoost(18)).toBe(19);
  });
});

describe('guerrero humano de nivel 1', () => {
  const sheet = computeCharacter(humanFighter(), emptyState(), content);

  it('calcula los ability scores acumulando boosts', () => {
    expect(sheet.abilityScores.str).toBe(18); // 10 +2 ancestría +2 trasfondo +2 clase +2 libre
    expect(sheet.abilityMods.str).toBe(4);
    expect(sheet.abilityScores.con).toBe(14);
    expect(sheet.abilityScores.dex).toBe(14);
  });

  it('calcula HP como ancestría + (clase + con) × nivel', () => {
    expect(sheet.maxHp.total).toBe(8 + 10 + 2); // humano 8, fighter 10/nivel, con +2
  });

  it('suma el nivel a la proficiencia solo si está entrenado', () => {
    // Perception del fighter es expert (rank 2): 10... es 1 + 4 + 2 = 7 con wis 12
    expect(sheet.perception.total).toBe(1 + 4 + 1); // wis +1, expert +4, nivel +1
    const untrained = sheet.skills.find((s) => s.slug === 'arcana')!;
    expect(untrained.rank).toBe(0);
    expect(untrained.stat.breakdown.some((m) => m.type === 'level')).toBe(false);
  });

  it('marca las skills entrenadas por clase y trasfondo', () => {
    const athletics = sheet.skills.find((s) => s.slug === 'athletics')!;
    expect(athletics.rank).toBe(1);
    expect(athletics.stat.total).toBe(4 + 2 + 1); // str +4, trained +2, nivel +1
  });

  it('CD de clase = 10 + nivel + entrenado + atributo clave', () => {
    expect(sheet.classDC.total).toBe(10 + 4 + 2 + 1);
  });
});

describe('progresión por nivel', () => {
  it('sabe qué toca elegir en el nivel 7 de un fighter', () => {
    const slots = slotsForLevel(fighter, 7).map((s) => s.slot);
    expect(slots).toContain('generalFeat');
    expect(slots).toContain('skillIncrease');
    expect(slots).not.toContain('classFeat'); // el fighter tiene class feats en pares
  });

  it('sube las proficiencias con los class features del dataset', () => {
    const l1 = computeCharacter(humanFighter(1), null, content);
    const l5 = computeCharacter(humanFighter(5), null, content);
    const l7 = computeCharacter(humanFighter(7), null, content);
    const l9 = computeCharacter(humanFighter(9), null, content);
    const l11 = computeCharacter(humanFighter(11), null, content);

    // LIMITACION CONOCIDA v1: Fighter Weapon Mastery (nivel 5) sube el rango solo
    // del grupo de armas elegido (rule element MartialProficiency, con predicado),
    // no la proficiencia marcial general. No se modela todavia: el valor general
    // queda en experto y el bonus del grupo elegido no se aplica al strike.
    expect(l1.proficiencies.attacks['martial']).toBe(2);
    expect(l5.proficiencies.attacks['martial']).toBe(2);
    // Battlefield Surveyor (nivel 7) -> perception a maestro
    expect(l1.proficiencies.perception).toBe(2);
    expect(l7.proficiencies.perception).toBe(3);
    // Juggernaut (nivel 9) -> fortaleza a maestro
    expect(l7.proficiencies.saves.fortitude).toBe(2);
    expect(l9.proficiencies.saves.fortitude).toBe(3);
    // Armor Expertise (nivel 11) -> defensas a experto
    expect(l9.proficiencies.defenses.light).toBe(1);
    expect(l11.proficiencies.defenses.light).toBe(2);
  });
});

describe('gunslinger enano', () => {
  const pistol = equipment.find((e) => e.name === 'Flintlock Pistol')!;

  /** Enano Gunslinger con pistola equipada. */
  function dwarfGunslinger(level = 1, choices: { level: number; slot: 'classFeature'; id: string }[] = []) {
    const build = emptyBuild();
    build.name = 'Kaz';
    build.level = level;
    build.ancestry = 'dwarf';
    build.class = 'gunslinger';
    build.background = backgrounds.find((b) => b.lore.some((l) => /hunting/i.test(l)))!.slug;
    build.abilityBoosts.ancestry = ['dex'];
    build.abilityBoosts.background = ['dex', 'con'];
    build.abilityBoosts.class = ['dex'];
    build.abilityBoosts.level1 = ['dex', 'con', 'wis', 'int'];
    build.inventory = [{ id: pistol.id, quantity: 1, equipped: true }];
    build.choices = choices as never;
    return build;
  }

  it('usa la proficiencia de armas de fuego, no la de armas simples', () => {
    const sheet = computeCharacter(dwarfGunslinger(1), null, content);
    const strike = sheet.strikes.find((s) => s.name === 'Flintlock Pistol')!;

    // La clase es solo "trained" en armas simples, pero experta en armas de fuego.
    expect(sheet.proficiencies.attacks['simple']).toBe(1);
    expect(sheet.proficiencies.attacks['simple-firearms']).toBe(2);
    expect(strike.proficiency).toBe(2);
    // dex +4, experto +4, nivel 1
    expect(strike.attack.total).toBe(4 + 4 + 1);
  });

  it('sube a maestro con Gunslinger Weapon Mastery en nivel 5', () => {
    const l5 = computeCharacter(dwarfGunslinger(5), null, content);
    expect(l5.proficiencies.attacks['simple-firearms-crossbows']).toBe(3);
    expect(l5.strikes[1].proficiency).toBe(3);
  });

  it('entrena el Lore que da el trasfondo', () => {
    const sheet = computeCharacter(dwarfGunslinger(1), null, content);
    const hunting = sheet.lores.find((l) => /hunting/i.test(l.name));
    expect(hunting).toBeDefined();
    expect(hunting!.rank).toBe(1);
  });

  it('aplica la vía elegida y lo que otorga', () => {
    const way = features.find((f) => f.name === 'Way of the Sniper')!;
    const sheet = computeCharacter(
      dwarfGunslinger(1, [{ level: 1, slot: 'classFeature', id: way.id }]),
      null,
      content,
    );
    const names = sheet.features.map((f) => f.name);
    expect(names).toContain('Way of the Sniper');
    // La vía otorga su slinger's reload y su deed inicial (viven en el pack de acciones)
    expect(names).toContain('Covered Reload');
    expect(names).toContain('One Shot, One Kill');
    // …y no se listan como dotes elegidas
    expect(sheet.feats.map((f) => f.name)).not.toContain('Way of the Sniper');
  });

  it('Singular Expertise suma +1 de circunstancia al daño con armas de fuego', () => {
    const sheet = computeCharacter(dwarfGunslinger(1), null, content);
    const strike = sheet.strikes[1];
    expect(strike.damage.breakdown.some((m) => m.source === 'Singular Expertise' && m.value === 1)).toBe(true);
    expect(strike.damage.total).toBe(1); // a distancia no suma Fuerza
  });
});

describe('prerrequisitos', () => {
  const ctx = {
    abilityScores: { str: 18, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
    skillRanks: { athletics: 1 as const, crafting: 1 as const, stealth: 0 as const, 'lore:hunting': 1 as const },
    perception: 2 as const,
    ownedNames: new Set(['power attack']),
    knownFeatNames: new Set(['power attack', 'basic deduction']),
    level: 5,
  };

  it('reconoce proficiencia cumplida y no cumplida', () => {
    expect(evaluatePrerequisite('Trained in Crafting', ctx)).toBe('met');
    expect(evaluatePrerequisite('Trained in Stealth', ctx)).toBe('unmet');
    expect(evaluatePrerequisite('Expert in Athletics', ctx)).toBe('unmet');
    expect(evaluatePrerequisite('Expert in Perception', ctx)).toBe('met');
  });

  it('reconoce Lore concretos', () => {
    expect(evaluatePrerequisite('trained in Hunting Lore', ctx)).toBe('met');
    expect(evaluatePrerequisite('trained in Sailing Lore', ctx)).toBe('unmet');
  });

  it('reconoce requisitos de atributo y de nivel', () => {
    expect(evaluatePrerequisite('Strength 14', ctx)).toBe('met');
    expect(evaluatePrerequisite('Dexterity 16', ctx)).toBe('unmet');
    expect(evaluatePrerequisite('level 3', ctx)).toBe('met');
  });

  it('sabe si ya tenés la dote que se pide', () => {
    expect(evaluatePrerequisite('Power Attack', ctx)).toBe('met');
    expect(evaluatePrerequisite('Basic Deduction', ctx)).toBe('unmet');
  });

  it('deja como no verificable lo que no entiende', () => {
    expect(evaluatePrerequisite('trained in at least one skill', ctx)).toBe('unknown');
    expect(evaluatePrerequisite('member of a Pathfinder lodge', ctx)).toBe('unknown');
  });

  it('no avisa de un prerrequisito que el personaje cumple', () => {
    const build = humanFighter();
    // Intimidating Glare pide trained in Intimidation, que da el trasfondo Warrior.
    const glare = feats.find((f) => f.name === 'Intimidating Glare')!;
    build.trainedSkills = ['intimidation', 'athletics', 'acrobatics'];
    build.choices.push({ level: 1, slot: 'skillFeat', id: glare.id, index: 0 });

    const sheet = computeCharacter(build, null, content);
    expect(sheet.warnings.some((w) => w.text.includes('Intimidating Glare'))).toBe(false);
  });

  it('respeta las advertencias marcadas como resueltas', () => {
    const build = humanFighter();
    const feat = feats.find((f) => f.prerequisites.some((p) => /member|lodge|deity/i.test(p)) && f.level === 1)!;
    build.choices.push({ level: 1, slot: 'skillFeat', id: feat.id, index: 0 });

    const before = computeCharacter(build, null, content);
    const warning = before.warnings.find((w) => w.kind === 'prerequisite')!;
    expect(warning.acknowledged).toBe(false);

    build.acknowledgedWarnings = [warning.id];
    const after = computeCharacter(build, null, content);
    expect(after.warnings.find((w) => w.id === warning.id)!.acknowledged).toBe(true);
  });
});

describe('arquetipos', () => {
  const dedication = feats.find((f) => f.name === 'Alchemist Dedication')!;

  function withDedication(level = 2) {
    const build = emptyBuild();
    build.level = level;
    build.ancestry = 'dwarf';
    build.class = 'gunslinger';
    build.background = backgrounds[0].slug;
    build.abilityBoosts.class = ['dex'];
    build.choices = [{ level: 2, slot: 'classFeat', id: dedication.id, index: 0 }];
    return build;
  }

  it('la dedication otorga lo que trae consigo', () => {
    const sheet = computeCharacter(withDedication(), null, content);
    const names = sheet.features.map((f) => f.name);
    // Infused Reagents es un rasgo de clase; Alchemical Crafting es una dote.
    expect(names).toContain('Infused Reagents');
    expect(names).toContain('Alchemical Crafting');
  });

  it('aplica las proficiencias de la dedication', () => {
    const sheet = computeCharacter(withDedication(), null, content);
    expect(sheet.proficiencies.attacks['weapon-base-alchemical-bomb']).toBe(1);
  });

  it('avisa si no cumplís el prerrequisito de atributo', () => {
    const sheet = computeCharacter(withDedication(), null, content);
    // Alchemist Dedication pide Intelligence 14 y este build no la tiene.
    const warning = sheet.warnings.find((w) => w.text.includes('Alchemist Dedication'));
    expect(warning?.status).toBe('unmet');
  });

  it('solo ofrece dotes de un arquetipo si tenés su dedication', () => {
    const quickAlchemy = feats.find((f) => f.name === 'Quick Alchemy' && f.traits.includes('archetype'))!;
    expect(archetypeFeatAvailable(dedication, new Set())).toBe(true);
    expect(archetypeFeatAvailable(quickAlchemy, new Set())).toBe(false);
    expect(archetypeFeatAvailable(quickAlchemy, new Set(['alchemist dedication']))).toBe(true);
  });
});

describe('conjuros', () => {
  it('tabla de slots: el bard va 2->3 y el sorcerer 3->4', () => {
    expect(spellSlots('standard', 1)).toEqual([{ rank: 1, slots: 2 }]);
    expect(spellSlots('standard', 2)).toEqual([{ rank: 1, slots: 3 }]);
    expect(spellSlots('sorcerer', 1)).toEqual([{ rank: 1, slots: 3 }]);
    expect(spellSlots('sorcerer', 2)).toEqual([{ rank: 1, slots: 4 }]);
  });

  it('un rango nuevo se desbloquea en los niveles impares', () => {
    expect(spellSlots('standard', 3)).toEqual([
      { rank: 1, slots: 3 },
      { rank: 2, slots: 2 },
    ]);
    expect(spellSlots('standard', 4)).toEqual([
      { rank: 1, slots: 3 },
      { rank: 2, slots: 3 },
    ]);
  });

  it('el rango 10 llega a nivel 19 y es un solo slot', () => {
    expect(spellSlots('standard', 18).some((s) => s.rank === 10)).toBe(false);
    expect(spellSlots('standard', 19).find((s) => s.rank === 10)).toEqual({ rank: 10, slots: 1 });
    expect(spellSlots('sorcerer', 20).find((s) => s.rank === 10)).toEqual({ rank: 10, slots: 1 });
  });

  it('los cantrips escalan a la mitad del nivel', () => {
    expect(cantripRank(1)).toBe(1);
    expect(cantripRank(4)).toBe(2);
    expect(cantripRank(9)).toBe(5);
    expect(cantripRank(20)).toBe(10);
  });

  it('escala el daño de Fireball con su heightening', () => {
    const fireball = spells.find((s) => s.name === 'Fireball')!;
    expect(scaledDamage(fireball, 3)[0].formula).toBe('6d6');
    expect(scaledDamage(fireball, 5)[0].formula).toBe('10d6');
    expect(scaledDamage(fireball, 3)[0].type).toBe('fire');
  });

  it('calcula ataque y CD de conjuro, y la tradición sale del linaje', () => {
    const draconic = features.find((f) => f.name === 'Bloodline: Draconic')!;
    const build = emptyBuild();
    build.level = 1;
    build.ancestry = 'human';
    build.class = 'sorcerer';
    build.background = backgrounds[0].slug;
    build.abilityBoosts.class = ['cha'];
    build.abilityBoosts.ancestry = ['cha'];
    build.abilityBoosts.background = ['cha', 'con'];
    build.abilityBoosts.level1 = ['cha', 'dex', 'con', 'wis'];
    build.choices = [{ level: 1, slot: 'classFeature', id: draconic.id, source: 'x', index: 0 }];

    const sheet = computeCharacter(build, null, content);
    const sc = sheet.spellcasting!;
    expect(sc.tradition).toBe('arcane');
    expect(sc.kind).toBe('sorcerer');
    expect(sc.slots).toEqual([{ rank: 1, slots: 3 }]);
    // cha 18 (+4), entrenado (+2), nivel 1
    expect(sc.attack.total).toBe(4 + 2 + 1);
    expect(sc.dc.total).toBe(10 + 4 + 2 + 1);
  });

  it('avisa si faltan hechizos en el repertorio', () => {
    const build = emptyBuild();
    build.level = 1;
    build.class = 'bard';
    build.ancestry = 'human';
    build.background = backgrounds[0].slug;
    const sheet = computeCharacter(build, null, content);
    expect(sheet.warnings.some((w) => w.text.includes('rango 1'))).toBe(true);
    expect(sheet.warnings.some((w) => w.text.includes('cantrip'))).toBe(true);
  });

  it('las clases marciales no tienen entrada de conjuro', () => {
    expect(computeCharacter(humanFighter(), null, content).spellcasting).toBeNull();
  });
});

describe('lanzadores preparados', () => {
  function caster(clase: string, level = 1) {
    const build = emptyBuild();
    build.level = level;
    build.class = clase;
    build.ancestry = 'human';
    build.background = backgrounds[0].slug;
    build.abilityBoosts.class = [clase === 'wizard' ? 'int' : 'wis'];
    build.abilityBoosts.level1 = ['cha', 'con', 'dex', 'wis'];
    return build;
  }

  it('el wizard prepara de un libro y arranca con 10 cantrips y 5 hechizos', () => {
    const sheet = computeCharacter(caster('wizard'), null, content);
    const sc = sheet.spellcasting!;
    expect(sc.config.preparation).toBe('prepared');
    expect(sc.config.source).toBe('spellbook');
    expect(sc.tradition).toBe('arcane');
    expect(sc.cantripsKnown).toBe(10);
    expect(sc.spellbookSize).toBe(5);
    // Slots estándar, como el bard: 2 al nivel 1.
    expect(sc.slots).toEqual([{ rank: 1, slots: 2 }]);
  });

  it('el libro del wizard suma 2 hechizos por nivel', () => {
    expect(computeCharacter(caster('wizard', 3), null, content).spellcasting!.spellbookSize).toBe(9);
  });

  it('el cleric prepara de toda la lista divina y tiene divine font', () => {
    const build = caster('cleric');
    build.abilityBoosts.level1 = ['cha', 'cha' as never, 'con', 'dex'];
    const sheet = computeCharacter(caster('cleric'), null, content);
    const sc = sheet.spellcasting!;
    expect(sc.config.source).toBe('list');
    expect(sc.tradition).toBe('divine');
    // 1 + modificador de Carisma (12 -> +1)
    expect(sc.divineFontSlots).toBe(1 + sheet.abilityMods.cha);
  });

  it('el druid es primal y no tiene divine font', () => {
    const sc = computeCharacter(caster('druid'), null, content).spellcasting!;
    expect(sc.tradition).toBe('primal');
    expect(sc.divineFontSlots).toBe(0);
    expect(sc.config.source).toBe('list');
  });

  it('a un preparado no le pide repertorio, pero al wizard sí le pide el libro', () => {
    const cleric = computeCharacter(caster('cleric'), null, content);
    expect(cleric.warnings.some((w) => w.text.includes('repertorio'))).toBe(false);

    const wizard = computeCharacter(caster('wizard'), null, content);
    expect(wizard.warnings.some((w) => w.text.includes('libro de hechizos'))).toBe(true);
    expect(wizard.warnings.some((w) => w.text.includes('repertorio'))).toBe(false);
  });

  it('Magus y Psychic son lanzadores limitados: 1 slot que llega a 2', () => {
    expect(spellSlots('limited', 1)).toEqual([{ rank: 1, slots: 1 }]);
    expect(spellSlots('limited', 2)).toEqual([{ rank: 1, slots: 2 }]);
    expect(spellSlots('limited', 3)).toEqual([
      { rank: 1, slots: 2 },
      { rank: 2, slots: 1 },
    ]);
    // No llegan al rango 10, que es de casters completos.
    expect(spellSlots('limited', 20).some((s) => s.rank === 10)).toBe(false);
    expect(spellSlots('standard', 20).some((s) => s.rank === 10)).toBe(true);
  });

  it('el psychic conoce 3 cantrips, no 5', () => {
    const build = caster('psychic');
    build.abilityBoosts.class = ['cha'];
    const sc = computeCharacter(build, null, content).spellcasting!;
    expect(sc.cantripsKnown).toBe(3);
    expect(sc.tradition).toBe('occult');
    expect(sc.config.preparation).toBe('spontaneous');
  });

  it('el magus prepara de un libro de 8 cantrips y 4 hechizos', () => {
    const sc = computeCharacter(caster('magus'), null, content).spellcasting!;
    expect(sc.cantripsKnown).toBe(8);
    expect(sc.spellbookSize).toBe(4);
    expect(sc.tradition).toBe('arcane');
    expect(sc.slots).toEqual([{ rank: 1, slots: 1 }]);
  });

  it('el oracle es espontáneo divino y completo', () => {
    const sc = computeCharacter(caster('oracle'), null, content).spellcasting!;
    expect(sc.tradition).toBe('divine');
    expect(sc.config.source).toBe('repertoire');
    expect(sc.slots).toEqual([{ rank: 1, slots: 2 }]);
  });

  it('la witch saca la tradición de su patrón, como el sorcerer del linaje', () => {
    const patron = features.find((f) => f.tags.includes('witch-patron') && f.tradition)!;
    const build = caster('witch');
    build.choices = [{ level: 1, slot: 'classFeature', id: patron.id, source: 'x', index: 0 }];
    const sc = computeCharacter(build, null, content).spellcasting!;
    expect(sc.tradition).toBe(patron.tradition);
    expect(sc.config.source).toBe('spellbook');
    expect(sc.cantripsKnown).toBe(10);
  });

  it('el wizard especialista muestra su escuela', () => {
    const escuela = features.find((f) => f.tags.includes('wizard-arcane-school'))!;
    const build = caster('wizard');
    build.choices = [{ level: 1, slot: 'classFeature', id: escuela.id, source: 'x', index: 0 }];
    const sheet = computeCharacter(build, null, content);
    expect(sheet.spellcasting!.arcaneSchool).toBe(escuela.name);
    // Sin escuela elegida, no hay slot extra.
    expect(computeCharacter(caster('wizard'), null, content).spellcasting!.arcaneSchool).toBeNull();
  });

  it('el sorcerer sigue siendo espontáneo con repertorio', () => {
    const build = caster('sorcerer');
    build.abilityBoosts.class = ['cha'];
    const sc = computeCharacter(build, null, content).spellcasting!;
    expect(sc.config.preparation).toBe('spontaneous');
    expect(sc.config.source).toBe('repertoire');
    expect(sc.slots).toEqual([{ rank: 1, slots: 3 }]);
  });
});

describe('iniciativa', () => {
  /**
   * Reglas confirmadas con la fuente del proyecto (Notebook LM):
   *  - Por defecto se tira Percepcion, con su modificador completo. No hay un
   *    "modificador de iniciativa" propio.
   *  - Se puede tirar con una habilidad si lo que venias haciendo lo justifica.
   *    Es lista ABIERTA, la decide el master.
   *  - Los bonus generales "a las tiradas de iniciativa" valen siempre; los que dicen
   *    "Perception checks for initiative" se pierden si tiras con una habilidad.
   *  - Es un chequeo: las condiciones que penalizan chequeos le pegan.
   */
  const opcion = (sheet: ReturnType<typeof computeCharacter>, key: string) =>
    sheet.initiative.options.find((o) => o.key === key)!;

  it('ofrece Percepción y todas las habilidades', () => {
    const sheet = computeCharacter(humanFighter(), null, content);
    expect(opcion(sheet, 'perception')).toBeDefined();
    expect(opcion(sheet, 'skill:stealth')).toBeDefined();
    expect(opcion(sheet, 'skill:deception')).toBeDefined();
  });

  it('usa el modificador completo de la estadística elegida', () => {
    const sheet = computeCharacter(humanFighter(), null, content);
    expect(opcion(sheet, 'perception').stat.total).toBe(sheet.perception.total);
    const stealth = sheet.skills.find((s) => s.slug === 'stealth')!;
    expect(opcion(sheet, 'skill:stealth').stat.total).toBe(stealth.stat.total);
  });

  it('el +2 de Battlefield Surveyor solo cuenta si tirás con Percepción', () => {
    // A nivel 7 el fighter gana Battlefield Surveyor: "+2 a los Perception checks
    // for initiative". Si Koh I Noor tira Stealth para usar One Shot One Kill, lo pierde.
    const sheet = computeCharacter(humanFighter(7), null, content);
    const conPercepcion = opcion(sheet, 'perception');
    const conStealth = opcion(sheet, 'skill:stealth');

    expect(conPercepcion.stat.total).toBe(sheet.perception.total + 2);
    expect(conPercepcion.stat.breakdown.some((m) => m.source === 'Battlefield Surveyor')).toBe(true);

    const stealth = sheet.skills.find((s) => s.slug === 'stealth')!;
    expect(conStealth.stat.total).toBe(stealth.stat.total);
    expect(conStealth.stat.breakdown.some((m) => m.source === 'Battlefield Surveyor')).toBe(false);
  });

  it('es un chequeo: frightened le pega tires con lo que tires', () => {
    const state = emptyState();
    state.conditions = [{ id: 'frightened', value: 2 }];

    const base = computeCharacter(humanFighter(), emptyState(), content);
    const asustado = computeCharacter(humanFighter(), state, content);

    expect(opcion(asustado, 'perception').stat.total).toBe(opcion(base, 'perception').stat.total - 2);
    expect(opcion(asustado, 'skill:stealth').stat.total).toBe(opcion(base, 'skill:stealth').stat.total - 2);
  });
});

describe('escudos', () => {
  const acero = equipment.find((e) => e.name === 'Steel Shield')!;

  function conEscudo(estado?: { raised: boolean; hp: number }) {
    const build = humanFighter();
    build.inventory = [{ id: acero.id, quantity: 1, equipped: true }];
    const state = emptyState();
    if (estado) state.shield = estado;
    return { build, state };
  }

  it('trae hardness, HP y broken threshold del dataset', () => {
    const { build, state } = conEscudo();
    const escudo = computeCharacter(build, state, content).shield!;
    expect(escudo.acBonus).toBe(2);
    expect(escudo.hardness).toBe(5);
    expect(escudo.maxHp).toBe(20);
    expect(escudo.brokenThreshold).toBe(10);
  });

  it('solo suma a la CA cuando está alzado, como bonus de circunstancia', () => {
    const bajo = conEscudo({ raised: false, hp: 20 });
    const alzado = conEscudo({ raised: true, hp: 20 });

    const sinAlzar = computeCharacter(bajo.build, bajo.state, content);
    const conAlzar = computeCharacter(alzado.build, alzado.state, content);

    expect(conAlzar.ac.total).toBe(sinAlzar.ac.total + 2);
    const bonus = conAlzar.ac.breakdown.find((m) => m.source.includes('Steel Shield'));
    expect(bonus?.type).toBe('circumstance');
  });

  it('un escudo roto no da CA aunque esté alzado', () => {
    const roto = conEscudo({ raised: true, hp: 10 }); // BT = 10
    const sheet = computeCharacter(roto.build, roto.state, content);
    expect(sheet.shield!.broken).toBe(true);
    expect(sheet.ac.breakdown.some((m) => m.source.includes('Steel Shield'))).toBe(false);
  });

  it('no hay escudo si no está equipado', () => {
    const build = humanFighter();
    build.inventory = [{ id: acero.id, quantity: 1, equipped: false }];
    expect(computeCharacter(build, emptyState(), content).shield).toBeNull();
  });
});

describe('carga (bulk)', () => {
  const chainMail = equipment.find((e) => e.name === 'Chain Mail')!; // bulk 2

  it('suma el bulk de lo que llevás, por cantidad', () => {
    const build = humanFighter(); // Fuerza 18 (+4)
    build.inventory = [{ id: chainMail.id, quantity: 2, equipped: false }];
    const bulk = computeCharacter(build, null, content).bulk;
    expect(bulk.carried).toBe(4);
    expect(bulk.encumberedAt).toBe(9); // 5 + 4
    expect(bulk.max).toBe(14); // 10 + 4
    expect(bulk.encumbered).toBe(false);
  });

  it('avisa cuando pasás el límite', () => {
    const build = humanFighter();
    build.inventory = [{ id: chainMail.id, quantity: 6, equipped: false }]; // 12 de bulk
    const sheet = computeCharacter(build, null, content);
    expect(sheet.bulk.encumbered).toBe(true);
    expect(sheet.warnings.some((w) => w.text.includes('encumbered'))).toBe(true);
  });

  it('con ignoreBulk se sigue contando, pero deja de avisar', () => {
    const build = humanFighter();
    build.inventory = [{ id: chainMail.id, quantity: 6, equipped: false }]; // 12 de bulk
    build.ignoreBulk = true;
    const sheet = computeCharacter(build, null, content);

    // El peso se sigue mostrando: es información útil aunque no se penalice.
    expect(sheet.bulk.carried).toBe(12);
    expect(sheet.bulk.ignorado).toBe(true);
    expect(sheet.bulk.encumbered).toBe(false);
    expect(sheet.warnings.some((w) => w.text.includes('encumbered'))).toBe(false);
    expect(sheet.warnings.some((w) => w.text.includes('máximo'))).toBe(false);
  });

  it('un objeto inventado aporta el bulk que le pusiste', () => {
    const build = humanFighter();
    build.inventory = [
      { id: 'inventado:1', quantity: 1, equipped: false, custom: { name: 'Cuerda élfica', bulk: 0.5 } },
    ];
    expect(computeCharacter(build, null, content).bulk.carried).toBe(0.5);
  });

  it('los objetos livianos (0.1) no inflan la carga', () => {
    const daga = equipment.find((e) => e.name === 'Dagger')!;
    const build = humanFighter();
    build.inventory = [{ id: daga.id, quantity: 10, equipped: false }];
    // 10 objetos "L" = 1 de bulk
    expect(computeCharacter(build, null, content).bulk.carried).toBe(1);
  });
});

describe('dinero', () => {
  it('convierte precios a cobre y los formatea', () => {
    expect(priceToCp({ gp: 15 })).toBe(1500);
    expect(priceToCp({ gp: 1, sp: 5 })).toBe(150);
    expect(priceToCp({ pp: 1 })).toBe(1000);
    expect(priceToCp(null)).toBe(0);
    expect(formatCp(1505)).toBe('15 gp 5 cp');
    expect(formatCp(1500)).toBe('15 gp');
    expect(formatCp(0)).toBe('0 gp');
  });

  it('descuenta el equipo elegido de los 15 gp iniciales', () => {
    const espada = equipment.find((e) => e.name === 'Longsword')!; // 1 gp
    const build = humanFighter();
    build.inventory = [{ id: espada.id, quantity: 2, equipped: true }];

    const money = computeCharacter(build, null, content).money;
    expect(money.startingCp).toBe(1500);
    expect(money.spentCp).toBe(200);
    expect(money.remainingCp).toBe(1300);
  });

  /*
   * El presupuesto es una referencia, no un límite: en la mesa el equipo entra
   * por caminos que la app no ve (botín, regalos, un PJ traído de otra app).
   */
  it('pasarse del presupuesto no genera ninguna advertencia', () => {
    const caro = equipment.find((e) => priceToCp(e.price) > 1500)!;
    const build = humanFighter();
    build.inventory = [{ id: caro.id, quantity: 1, equipped: false }];

    const sheet = computeCharacter(build, null, content);
    expect(sheet.warnings.some((w) => w.text.includes('arrancás'))).toBe(false);
    // Pero la cuenta se sigue mostrando, con el rojo del caso.
    expect(sheet.money.remainingCp).toBeLessThan(0);
  });
});

describe('detalles del personaje', () => {
  it('expone visión, edad y apariencia', () => {
    const build = humanFighter();
    build.age = '27';
    build.appearance = 'Cicatriz en la ceja izquierda';
    const sheet = computeCharacter(build, null, content);
    expect(sheet.vision).toBe('normal');
    expect(sheet.age).toBe('27');
    expect(sheet.appearance).toBe('Cicatriz en la ceja izquierda');
  });

  it('un enano tiene darkvision', () => {
    const build = humanFighter();
    build.ancestry = 'dwarf';
    expect(computeCharacter(build, null, content).vision).toBe('darkvision');
  });
});

describe('idiomas', () => {
  it('la ancestria da los suyos y no ocupan cupo', () => {
    const build = humanFighter();
    const sheet = computeCharacter(build, null, content);
    expect(sheet.languages.fromAncestry).toEqual(['common']);
    expect(sheet.languages.chosen).toEqual([]);
  });

  it('el cupo es el modificador de Inteligencia mas los extra de la ancestria', () => {
    // El humano de prueba tiene Int 10 (+0) y la ancestria suma 1.
    expect(computeCharacter(humanFighter(), null, content).languages.slots).toBe(1);

    const listo = humanFighter();
    listo.abilityBoosts.level1 = ['int', 'int' as never, 'str', 'dex'];
    listo.abilityBoosts.background = ['int', 'str'];
    const conInt = computeCharacter(listo, null, content);
    expect(conInt.languages.slots).toBe(conInt.abilityMods.int + 1);
  });

  it('acepta un idioma inventado por el master', () => {
    const build = humanFighter();
    build.languages = ['tobiano antiguo'];
    const sheet = computeCharacter(build, null, content);
    expect(sheet.languages.chosen).toEqual(['tobiano antiguo']);
  });

  it('avisa si quedan idiomas por elegir', () => {
    const sheet = computeCharacter(humanFighter(), null, content);
    expect(sheet.warnings.some((w) => w.text.includes('idioma'))).toBe(true);

    const completo = humanFighter();
    completo.languages = ['draconic'];
    expect(computeCharacter(completo, null, content).warnings.some((w) => w.text.includes('idioma'))).toBe(false);
  });

  it('la lista Legacy tiene 11 comunes y 11 poco comunes', () => {
    expect(COMMON_LANGUAGES).toHaveLength(11);
    expect(UNCOMMON_LANGUAGES).toHaveLength(11);
    expect(COMMON_LANGUAGES).toContain('jotun');
    expect(UNCOMMON_LANGUAGES).toContain('aklo');
  });
});

describe('focus spells', () => {
  const dragonClaws = spells.find((s) => s.name === 'Dragon Claws')!;
  const draconic = features.find((f) => f.name === 'Bloodline: Draconic')!;

  function sorcerer(focusSpells: string[] = []) {
    const build = emptyBuild();
    build.level = 1;
    build.class = 'sorcerer';
    build.ancestry = 'human';
    build.background = backgrounds[0].slug;
    build.abilityBoosts.class = ['cha'];
    build.choices = [{ level: 1, slot: 'classFeature', id: draconic.id, source: 'x', index: 0 }];
    build.spellcasting.focusSpells = focusSpells;
    return build;
  }

  it('sin focus spells no hay bloque', () => {
    expect(computeCharacter(sorcerer(), null, content).focus).toBeNull();
  });

  it('el pool es la cantidad que conocés, con tope de 3', () => {
    const otros = spells.filter((s) => s.traits.includes('focus') && s.traits.includes('sorcerer')).slice(0, 4);
    expect(computeCharacter(sorcerer([otros[0].id]), null, content).focus!.pool).toBe(1);
    expect(computeCharacter(sorcerer(otros.slice(0, 2).map((s) => s.id)), null, content).focus!.pool).toBe(2);
    expect(computeCharacter(sorcerer(otros.map((s) => s.id)), null, content).focus!.pool).toBe(3);
  });

  it('se lanzan al rango de los cantrips: la mitad del nivel', () => {
    const build = sorcerer([dragonClaws.id]);
    expect(computeCharacter(build, null, content).focus!.rank).toBe(1);
    build.level = 5;
    expect(computeCharacter(build, null, content).focus!.rank).toBe(3);
  });

  it('el linaje sugiere sus propios focus spells', () => {
    const focus = computeCharacter(sorcerer([dragonClaws.id]), null, content).focus!;
    expect(focus.suggested).toContain('Dragon Claws');
    expect(focus.suggested).toContain('Dragon Breath');
  });

  it('usa el atributo clave y la proficiencia de conjuro', () => {
    const sheet = computeCharacter(sorcerer([dragonClaws.id]), null, content);
    const focus = sheet.focus!;
    expect(focus.dc.total).toBe(10 + sheet.abilityMods.cha + 2 + 1);
    expect(focus.attack.total).toBe(sheet.abilityMods.cha + 2 + 1);
  });

  it('avisa si tenés focus spells sin proficiencia de conjuro', () => {
    const build = humanFighter();
    build.spellcasting.focusSpells = [dragonClaws.id];
    const sheet = computeCharacter(build, null, content);
    expect(sheet.focus).not.toBeNull();
    expect(sheet.warnings.some((w) => w.text.includes('proficiencia de conjuro'))).toBe(true);
  });
});

describe('armas personalizadas', () => {
  const longsword = equipment.find((e) => e.name === 'Longsword')!;

  function conEspada(custom?: object) {
    const build = humanFighter();
    build.inventory = [{ id: longsword.id, quantity: 1, equipped: true, custom: custom as never }];
    return build;
  }

  it('sin custom, el arma sale tal cual el dataset', () => {
    const strike = computeCharacter(conEspada(), null, content).strikes[1];
    expect(strike.name).toBe('Longsword');
    expect(strike.damageDice).toBe('1d8');
    expect(strike.damageType).toBe('slashing');
    expect(strike.custom).toBe(false);
  });

  it('el master puede cambiar nombre, dados y tipo de dano', () => {
    const strike = computeCharacter(
      conEspada({ name: 'Colmillo de Sarenrae', damageDice: 2, damageType: 'fire' }),
      null,
      content,
    ).strikes[1];

    expect(strike.name).toBe('Colmillo de Sarenrae');
    expect(strike.damageDice).toBe('2d8');
    expect(strike.damageType).toBe('fire');
    expect(strike.custom).toBe(true);
  });

  it('los bonus entran al pipeline como bonus de objeto, con el nombre del arma', () => {
    const base = computeCharacter(conEspada(), null, content).strikes[1];
    const magica = computeCharacter(
      conEspada({ name: 'Espada rara', bonusAttack: 1, bonusDamage: 2 }),
      null,
      content,
    ).strikes[1];

    expect(magica.attack.total).toBe(base.attack.total + 1);
    expect(magica.damage.total).toBe(base.damage.total + 2);
    const bonus = magica.attack.breakdown.find((m) => m.source === 'Espada rara');
    expect(bonus?.type).toBe('item');
  });

  it('los traits agregados cambian el calculo: finesse pasa a usar Destreza', () => {
    // El fighter de prueba tiene Fuerza 18 (+4) y Destreza 14 (+2).
    const normal = computeCharacter(conEspada(), null, content).strikes[1];
    const agil = computeCharacter(conEspada({ traits: ['finesse'] }), null, content).strikes[1];
    expect(normal.attack.total - agil.attack.total).toBe(2);
  });

  it('detecta fatal y deadly de los traits del arma', () => {
    const pistola = equipment.find((e) => e.name === 'Flintlock Pistol')!;
    const build = humanFighter();
    build.inventory = [{ id: pistola.id, quantity: 1, equipped: true }];
    const strike = computeCharacter(build, null, content).strikes[1];
    // El dataset la trae con fatal-d8.
    expect(strike.fatal).toBe('d8');
    expect(strike.deadly).toBeNull();
  });

  it('el master puede agregar fatal a un arma personalizada', () => {
    const strike = computeCharacter(conEspada({ traits: ['deadly-d10'] }), null, content).strikes[1];
    expect(strike.deadly).toBe('d10');
  });

  /*
   * Además del truco viejo (meter "fatal-dX" en los traits), fatal y deadly son
   * ahora un campo propio del editor, igual que el resto de las armas.
   */
  it('fatal y deadly tienen su propio campo, sin pasar por los traits', () => {
    const strike = computeCharacter(conEspada({ fatal: 'd12' }), null, content).strikes[1];
    expect(strike.fatal).toBe('d12');
    expect(strike.deadly).toBeNull();
  });

  it('el campo fatal pisa el que trae el arma del dataset', () => {
    const pistola = equipment.find((e) => e.name === 'Flintlock Pistol')!;
    const build = humanFighter();
    // La pistola ya viene con fatal-d8; el master la homebrewea a fatal-d12.
    build.inventory = [{ id: pistola.id, quantity: 1, equipped: true, custom: { fatal: 'd12' } as never }];
    const strike = computeCharacter(build, null, content).strikes[1];
    expect(strike.fatal).toBe('d12');
  });

  it('las notas se muestran pero no se calculan', () => {
    const strike = computeCharacter(conEspada({ notes: 'Al critico deslumbra 1 round' }), null, content).strikes[1];
    expect(strike.notes).toBe('Al critico deslumbra 1 round');
  });

  it('si se pierde la referencia al dataset, el arma sobrevive con su foto', () => {
    const build = humanFighter();
    build.inventory = [
      {
        id: 'id-que-ya-no-existe',
        quantity: 1,
        equipped: true,
        custom: {
          name: 'Reliquia del clan',
          base: {
            name: 'Longsword',
            damage: { dice: 1, die: 'd8', damageType: 'slashing' },
            category: 'martial',
            group: 'sword',
            traits: [],
            range: null,
          },
        },
      },
    ];

    const strike = computeCharacter(build, null, content).strikes[1];
    expect(strike.name).toBe('Reliquia del clan');
    expect(strike.damageDice).toBe('1d8');
    // Sigue contando como arma marcial para la proficiencia.
    expect(strike.proficiency).toBe(2);
  });
});

describe('armadura personalizada', () => {
  const chainMail = equipment.find((e) => e.name === 'Chain Mail')!;

  function conArmadura(custom?: object) {
    const build = humanFighter();
    build.inventory = [{ id: chainMail.id, quantity: 1, equipped: true, custom: custom as never }];
    return build;
  }

  it('sin custom, la armadura sale tal cual el dataset', () => {
    const sheet = computeCharacter(conArmadura(), null, content);
    expect(sheet.armor?.name).toBe('Chain Mail');
    expect(sheet.armor?.acBonus).toBe(chainMail.acBonus);
    expect(sheet.armor?.custom).toBe(false);
  });

  it('el bonus de CA del master llega hasta la CA', () => {
    const base = computeCharacter(conArmadura(), null, content);
    const tocada = computeCharacter(conArmadura({ acBonus: (chainMail.acBonus ?? 0) + 1 }), null, content);

    expect(tocada.ac.total).toBe(base.ac.total + 1);
    expect(tocada.armor?.custom).toBe(true);
  });

  const sigilo = (s: ReturnType<typeof computeCharacter>) => s.skills.find((x) => x.slug === 'stealth')!.stat.total;

  const velocidad = (s: ReturnType<typeof computeCharacter>) => s.speed.total;

  /*
   * El requisito de Fuerza perdona la penalidad de VELOCIDAD, no la de chequeos.
   * Confirmado con la fuente Legacy del proyecto (2026-08-20) — antes estaba al
   * revés. El requisito viene del dataset como modificador (0 a 5), no como
   * puntuación: el guerrero de prueba tiene Fuerza 18 (+4).
   */
  it('la penalidad de chequeos se aplica cumplas o no el requisito de Fuerza', () => {
    const cumple = computeCharacter(conArmadura({ strength: 0 }), null, content);
    const noCumple = computeCharacter(conArmadura({ strength: 5 }), null, content);

    expect(sigilo(cumple)).toBe(sigilo(noCumple));
  });

  it('cumplir el requisito de Fuerza saca la penalidad de velocidad', () => {
    const cumple = computeCharacter(conArmadura({ strength: 0, speedPenalty: -10 }), null, content);
    const noCumple = computeCharacter(conArmadura({ strength: 5, speedPenalty: -10 }), null, content);

    expect(velocidad(cumple) - velocidad(noCumple)).toBe(10);
  });

  it('un 0 es un valor válido: una armadura sin penalidad de chequeos', () => {
    const sinPenalidad = computeCharacter(conArmadura({ checkPenalty: 0 }), null, content);
    expect(sinPenalidad.armor?.checkPenalty).toBe(0);

    const conPenalidad = computeCharacter(conArmadura(), null, content);
    expect(sigilo(sinPenalidad)).toBeGreaterThan(sigilo(conPenalidad));
  });

  it('la penalidad de velocidad del master llega a la velocidad', () => {
    // Requisito alto para que la penalidad se aplique de verdad.
    const base = computeCharacter(conArmadura({ strength: 5 }), null, content);
    const tocada = computeCharacter(conArmadura({ strength: 5, speedPenalty: -10 }), null, content);
    expect(tocada.speed.total).toBe(base.speed.total - 5);
  });
});

describe('puño', () => {
  it('todo personaje puede pegar un puñetazo, aunque no este en el dataset', () => {
    const sheet = computeCharacter(humanFighter(), null, content);
    const puño = sheet.strikes[0];

    expect(puño.name).toBe('Puño');
    expect(puño.unarmed).toBe(true);
    expect(puño.ranged).toBe(false);
    expect(puño.damageDice).toBe('1d4');
    expect(puño.damageType).toBe('bludgeoning');
    // Agile y finesse: se puede tirar con Destreza y el MAP es menor.
    expect(puño.traits).toContain('agile');
    expect(puño.traits).toContain('finesse');
    // No sale del inventario, asi que no se puede "personalizar".
    expect(puño.inventoryIndex).toBe(-1);
  });
});

describe('deidad', () => {
  const sarenrae = deities.find((d) => d.name === 'Sarenrae')!;
  const scimitar = equipment.find((e) => e.slug === 'scimitar')!;

  function cleric(deity: string | null) {
    const build = emptyBuild();
    build.level = 1;
    build.class = 'cleric';
    build.ancestry = 'human';
    build.background = backgrounds[0].slug;
    build.abilityBoosts.class = ['wis'];
    build.deity = deity;
    build.inventory = [{ id: scimitar.id, quantity: 1, equipped: true }];
    return build;
  }

  it('el cleric queda entrenado en el arma favorita de su deidad', () => {
    // Sin deidad la cimitarra es un arma marcial: el cleric no está entrenado.
    const sinDeidad = computeCharacter(cleric(null), null, content);
    expect(sinDeidad.strikes[1].proficiency).toBe(0);

    // Sarenrae tiene la cimitarra como arma favorita.
    const conDeidad = computeCharacter(cleric(sarenrae.id), null, content);
    expect(sarenrae.favoredWeapons).toContain('scimitar');
    expect(conDeidad.strikes[1].proficiency).toBe(1);
  });

  it('avisa si un cleric no eligió deidad', () => {
    const sheet = computeCharacter(cleric(null), null, content);
    expect(sheet.warnings.some((w) => w.text.includes('deidad'))).toBe(true);
    expect(computeCharacter(cleric(sarenrae.id), null, content).warnings.some((w) => w.text.includes('deidad'))).toBe(
      false,
    );
  });

  it('expone la deidad y el alineamiento en la hoja', () => {
    const build = cleric(sarenrae.id);
    build.alignment = 'NG';
    const sheet = computeCharacter(build, null, content);
    expect(sheet.deity?.name).toBe('Sarenrae');
    expect(sheet.deity?.divineFont).toContain('heal');
    expect(sheet.alignment).toBe('NG');
  });

  it('una clase que no depende de deidad no recibe el arma favorita', () => {
    const build = cleric(sarenrae.id);
    build.class = 'fighter';
    const sheet = computeCharacter(build, null, content);
    // El fighter ya es experto en marciales por su clase, no por la deidad.
    expect(sheet.proficiencies.attacks['weapon:scimitar']).toBeUndefined();
  });
});

describe('condiciones', () => {
  it('frightened penaliza todos los chequeos y la CA', () => {
    const state = emptyState();
    state.conditions = [{ id: 'frightened', value: 2 }];
    const base = computeCharacter(humanFighter(), emptyState(), content);
    const scared = computeCharacter(humanFighter(), state, content);

    expect(scared.ac.total).toBe(base.ac.total - 2);
    expect(scared.perception.total).toBe(base.perception.total - 2);
    expect(scared.saves.will.total).toBe(base.saves.will.total - 2);
    expect(scared.classDC.total).toBe(base.classDC.total - 2);
    expect(scared.perception.breakdown.some((m) => m.source === 'Frightened 2')).toBe(true);
  });

  it('clumsy afecta solo lo basado en destreza', () => {
    const state = emptyState();
    state.conditions = [{ id: 'clumsy', value: 1 }];
    const base = computeCharacter(humanFighter(), emptyState(), content);
    const clumsy = computeCharacter(humanFighter(), state, content);

    expect(clumsy.saves.reflex.total).toBe(base.saves.reflex.total - 1);
    expect(clumsy.saves.will.total).toBe(base.saves.will.total);
  });

  it('stupefied penaliza el ataque Y la CD de conjuro', () => {
    // CRB pg. 622: "...including Will saving throws, spell attack rolls, spell DCs..."
    const draconic = features.find((f) => f.name === 'Bloodline: Draconic')!;
    const build = emptyBuild();
    build.level = 1;
    build.class = 'sorcerer';
    build.ancestry = 'human';
    build.background = backgrounds[0].slug;
    build.abilityBoosts.class = ['cha'];
    build.choices = [{ level: 1, slot: 'classFeature', id: draconic.id, source: 'x', index: 0 }];

    const state = emptyState();
    state.conditions = [{ id: 'stupefied', value: 2 }];

    const base = computeCharacter(build, emptyState(), content).spellcasting!;
    const dumb = computeCharacter(build, state, content).spellcasting!;

    expect(dumb.attack.total).toBe(base.attack.total - 2);
    expect(dumb.dc.total).toBe(base.dc.total - 2);
  });

  it('prone también te deja flat-footed: -2 al ataque y -2 a la CA', () => {
    const state = emptyState();
    state.conditions = [{ id: 'prone' }];
    const base = computeCharacter(humanFighter(), emptyState(), content);
    const prone = computeCharacter(humanFighter(), state, content);
    expect(prone.ac.total).toBe(base.ac.total - 2);
  });

  it('la condición se llama flat-footed, no off-guard (eso es Remaster)', () => {
    expect(CONDITIONS.find((c) => c.id === 'flat-footed')).toBeDefined();
    expect(CONDITIONS.find((c) => c.id === 'off-guard')).toBeUndefined();
  });

  it('cada condición con mecánica existe en el texto oficial importado', () => {
    // Si un id no coincide, la hoja mostraría la condición sin efecto (o al revés)
    // sin fallar: por eso el chequeo es un test y no una comprobación en runtime.
    const oficiales = new Map(conditionTexts.map((c) => [c.id, c]));
    for (const def of CONDITIONS) {
      expect(oficiales.has(def.id), `falta "${def.id}" en conditions.json`).toBe(true);
    }
  });

  it('el texto importado es Legacy: dice flat-footed y no off-guard', () => {
    expect(conditionTexts).toHaveLength(42);
    expect(conditionTexts.every((c) => c.source.startsWith('Core Rulebook'))).toBe(true);
    const grabbed = conditionTexts.find((c) => c.id === 'grabbed')!;
    expect(grabbed.text).toContain('flat-footed');
    expect(conditionTexts.some((c) => c.id === 'off-guard')).toBe(false);
  });

  it('drained reduce los HP máximos por nivel', () => {
    const state = emptyState();
    state.conditions = [{ id: 'drained', value: 1 }];
    const drained = computeCharacter(humanFighter(3), state, content);
    const healthy = computeCharacter(humanFighter(3), emptyState(), content);
    expect(drained.maxHp.total).toBe(healthy.maxHp.total - 3);
  });
});


describe('garbo (panache)', () => {
  const rapier = equipment.find((e) => e.name === 'Rapier')!;
  const greatsword = equipment.find((e) => e.name === 'Greatsword')!;

  /** Un Swashbuckler con un arma finesse equipada. */
  function duelista(level = 1, arma = rapier) {
    const build = emptyBuild();
    build.name = 'Estoque';
    build.level = level;
    build.ancestry = 'human';
    build.class = 'swashbuckler';
    build.background = backgrounds.find((b) => b.trainedSkills.includes('acrobatics'))!.slug;
    build.abilityBoosts.ancestry = ['dex', 'cha'];
    build.abilityBoosts.background = ['dex', 'con'];
    build.abilityBoosts.class = ['dex'];
    build.abilityBoosts.level1 = ['dex', 'cha', 'con', 'wis'];
    build.trainedSkills = ['acrobatics', 'intimidation'];
    build.inventory = [{ id: arma.id, quantity: 1, equipped: true }];
    return build;
  }

  const conGarbo = { ...emptyState(), panache: true };
  const arma = (sheet: ReturnType<typeof computeCharacter>) => sheet.strikes.find((x) => !x.unarmed)!;

  it('el garbo es un estado, no un pool: se prende y se apaga', () => {
    expect(computeCharacter(duelista(), null, content).panache?.active).toBe(false);
    expect(computeCharacter(duelista(), conGarbo, content).panache?.active).toBe(true);
  });

  it('quien no es Swashbuckler no tiene garbo', () => {
    expect(computeCharacter(humanFighter(), conGarbo, content).panache).toBeNull();
  });

  it('Precise Strike suma daño de precisión solo con garbo', () => {
    const sin = computeCharacter(duelista(), null, content);
    const con = computeCharacter(duelista(), conGarbo, content);

    expect(arma(con).damage.total - arma(sin).damage.total).toBe(2);
  });

  it('Precise Strike no aplica con un arma que no es agile ni finesse', () => {
    const sin = computeCharacter(duelista(1, greatsword), null, content);
    const con = computeCharacter(duelista(1, greatsword), conGarbo, content);

    expect(arma(con).damage.total).toBe(arma(sin).damage.total);
  });

  it('el daño de precisión sube en los niveles 5, 9, 13 y 17', () => {
    const dano = (level: number) => {
      const sin = arma(computeCharacter(duelista(level), null, content)).damage.total;
      const con = arma(computeCharacter(duelista(level), conGarbo, content)).damage.total;
      return con - sin;
    };

    expect(dano(4)).toBe(2);
    expect(dano(5)).toBe(3);
    expect(dano(9)).toBe(4);
    expect(dano(13)).toBe(5);
    expect(dano(17)).toBe(6);
    expect(dano(20)).toBe(6);

    // Y los dados del finisher acompañan al daño plano.
    expect(computeCharacter(duelista(9), conGarbo, content).panache?.preciseStrike?.finisherDice).toBe(4);
  });

  it('a nivel 1 el garbo da +5 pies de velocidad', () => {
    const sin = computeCharacter(duelista(), null, content).speed.total;
    const con = computeCharacter(duelista(), conGarbo, content).speed.total;
    expect(con - sin).toBe(5);
  });

  /*
   * Vivacious Speed REEMPLAZA el +5 del garbo, no se suma: a nivel 3 son +10 con
   * garbo, y sin garbo queda la mitad redondeada al múltiplo de 5 de abajo.
   */
  it('Vivacious Speed reemplaza al bonus base y deja la mitad sin garbo', () => {
    const base = computeCharacter(duelista(1), null, content).speed.total;

    const nivel3 = computeCharacter(duelista(3), null, content).speed.total;
    const nivel3Garbo = computeCharacter(duelista(3), conGarbo, content).speed.total;
    expect(nivel3 - base).toBe(5);
    expect(nivel3Garbo - base).toBe(10);

    const nivel7Garbo = computeCharacter(duelista(7), conGarbo, content).speed.total;
    expect(nivel7Garbo - base).toBe(15);
    // 15 / 2 = 7,5 y redondea a 5, así que a nivel 7 sin garbo sigue siendo +5.
    expect(computeCharacter(duelista(7), null, content).speed.total - base).toBe(5);

    expect(computeCharacter(duelista(11), null, content).speed.total - base).toBe(10);
    expect(computeCharacter(duelista(15), null, content).speed.total - base).toBe(10);
    expect(computeCharacter(duelista(19), null, content).speed.total - base).toBe(15);
  });
});

describe('visión', () => {
  it('sale de la ancestría por defecto', () => {
    const dwarf = { ...humanFighter(), ancestry: 'dwarf' };
    expect(computeCharacter(dwarf, null, content).vision).toBe('darkvision');
  });

  it('el master la puede pisar', () => {
    const build = { ...humanFighter(), visionOverride: 'darkvision' };
    expect(computeCharacter(build, null, content).vision).toBe('darkvision');
  });
});

describe('ataques naturales', () => {
  function conGarras(armas: NaturalWeapon[]) {
    const build = humanFighter();
    build.naturalWeapons = armas;
    return build;
  }

  it('sin ataques naturales, la lista de strikes es solo el puño', () => {
    const sheet = computeCharacter(conGarras([]), null, content);
    expect(sheet.strikes).toHaveLength(1);
    expect(sheet.strikes[0].naturalId).toBeNull();
  });

  it('un ataque natural cuerpo a cuerpo entra a la lista, con proficiencia unarmed', () => {
    const build = conGarras([
      {
        id: 'garra-1',
        name: 'Garra',
        ranged: false,
        damageDice: 1,
        damageDie: 'd6',
        damageType: 'slashing',
        traits: ['agile'],
      },
    ]);
    const sheet = computeCharacter(build, null, content);
    const garra = sheet.strikes.find((s) => s.naturalId === 'garra-1')!;

    expect(garra).toBeDefined();
    expect(garra.ranged).toBe(false);
    expect(garra.unarmed).toBe(true);
    expect(garra.damageDice).toBe('1d6');
    expect(garra.damageType).toBe('slashing');
    // Trained en unarmed (igual que el puño), no en marcial.
    expect(garra.proficiency).toBe(sheet.strikes[0].proficiency);
  });

  it('uno a distancia (púas que se disparan) cae en la sección ranged', () => {
    const build = conGarras([
      {
        id: 'pua-1',
        name: 'Púa',
        ranged: true,
        damageDice: 1,
        damageDie: 'd4',
        damageType: 'piercing',
        traits: [],
      },
    ]);
    const sheet = computeCharacter(build, null, content);
    const pua = sheet.strikes.find((s) => s.naturalId === 'pua-1')!;
    expect(pua.ranged).toBe(true);
    // A distancia usa Destreza, no Fuerza: sin Fuerza sumada al daño.
    expect(pua.damage.breakdown.some((m) => m.source === 'Fuerza')).toBe(false);
  });

  it('fatal y bonus de un ataque natural entran igual que en un arma', () => {
    const build = conGarras([
      {
        id: 'colmillo-1',
        name: 'Colmillo',
        ranged: false,
        damageDice: 1,
        damageDie: 'd8',
        damageType: 'piercing',
        traits: [],
        fatal: 'd10',
        bonusAttack: 1,
        bonusDamage: 2,
      },
    ]);
    const sheet = computeCharacter(build, null, content);
    const colmillo = sheet.strikes.find((s) => s.naturalId === 'colmillo-1')!;
    expect(colmillo.fatal).toBe('d10');

    const sinExtra = computeCharacter(conGarras([{ ...build.naturalWeapons[0], bonusAttack: 0, bonusDamage: 0 }]), null, content).strikes.find((s) => s.naturalId === 'colmillo-1')!;
    expect(colmillo.attack.total - sinExtra.attack.total).toBe(1);
    expect(colmillo.damage.total - sinExtra.damage.total).toBe(2);
  });
});

describe('puntuación de atributo escrita a mano', () => {
  it('pisa el resultado de los boosts, no se le suma', () => {
    const build = humanFighter(); // Fuerza 18 por boosts
    build.abilityOverrides = { str: 12 };
    const sheet = computeCharacter(build, null, content);

    expect(sheet.abilityScores.str).toBe(12);
    expect(sheet.abilityMods.str).toBe(1);
  });

  it('arrastra todo lo que depende del atributo', () => {
    const base = computeCharacter(humanFighter(), null, content);

    const build = humanFighter();
    build.abilityOverrides = { con: 10 }; // era 14 (+2)
    const conMenos = computeCharacter(build, null, content);

    // El HP baja el modificador de Constitución por nivel.
    expect(base.maxHp.total - conMenos.maxHp.total).toBe(2);
    // Y la salvación de Fortaleza, que va con Constitución.
    expect(base.saves.fortitude.total - conMenos.saves.fortitude.total).toBe(2);
  });

  it('un atributo escrito a mano no toca a los demás', () => {
    const base = computeCharacter(humanFighter(), null, content);

    const build = humanFighter();
    build.abilityOverrides = { cha: 20 };
    const sheet = computeCharacter(build, null, content);

    expect(sheet.abilityScores.cha).toBe(20);
    expect(sheet.abilityScores.str).toBe(base.abilityScores.str);
    expect(sheet.abilityScores.dex).toBe(base.abilityScores.dex);
  });

  it('sin override, todo sigue saliendo de los boosts', () => {
    const build = humanFighter();
    build.abilityOverrides = {};
    expect(computeCharacter(build, null, content).abilityScores.str).toBe(18);
  });
});
