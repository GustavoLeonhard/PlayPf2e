/**
 * Importador del dataset PF2e Legacy (pre-remaster).
 *
 * Lee los JSON de `.data-source/packs/*-legacy/` (repo dogstarrb/pf2e-legacy-content,
 * snapshot del sistema Foundry PF2e 5.9) y emite JSON normalizado en `public/data/`.
 *
 * Se corre a mano, no es parte de la app:  npm run import
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKS = join(ROOT, '.data-source', 'packs');
const OUT = join(ROOT, 'public', 'data');

// ---------------------------------------------------------------- utilidades

/** El id de Foundry va como sufijo del filename: `Power_Attack_2xk4jdwcCfmasYfT.json` */
const idFromFile = (file) => basename(file, '.json').split('_').pop();

/** `Compendium.pf2e.feats-srd.Item.W6Gl9ePmItfDHji0` -> `W6Gl9ePmItfDHji0` */
const idFromUuid = (uuid) => (typeof uuid === 'string' ? uuid.split('.').pop() : null);

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Limpia el HTML de descripcion: resuelve los enlaces propios de Foundry a texto
 * plano para que se pueda renderizar sin su motor de templates.
 *   @UUID[Compendium...Item.abc]{Power Attack} -> Power Attack
 *   [[/r 1d6]]{1d6}                            -> 1d6
 */
function cleanDescription(html) {
  if (!html) return '';
  return html
    .replace(/@UUID\[[^\]]+\]\{([^}]*)\}/g, '$1')
    .replace(/@UUID\[[^\]]+\]/g, '')
    .replace(/@(Check|Damage|Template|Localize)\[[^\]]+\]\{([^}]*)\}/g, '$2')
    .replace(/@(Check|Damage|Template|Localize)\[[^\]]+\]/g, '')
    .replace(/\[\[[^\]]+\]\]\{([^}]*)\}/g, '$1')
    .replace(/\[\[\/[^\]]+\]\]/g, '')
    .trim();
}

const traitsOf = (sys) => sys?.traits?.value ?? [];
const rarityOf = (sys) => sys?.traits?.rarity ?? 'common';
const sourceOf = (sys) => sys?.publication?.title ?? sys?.source?.value ?? '';

/** Los boosts vienen como objeto indexado ({"0": {...}, "1": {...}}), no como array. */
function boostSets(raw) {
  if (!raw) return [];
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => raw[k]?.value ?? [])
    .filter((v) => v.length > 0);
}

/** `items` de clases/ancestrias/backgrounds: mapa de features otorgados. */
function grantedItems(raw) {
  if (!raw) return [];
  return Object.values(raw).map((it) => ({
    name: it.name,
    level: it.level ?? 1,
    id: idFromUuid(it.uuid),
  }));
}

/**
 * Los Rule Elements que nos interesan para el builder. Guardamos solo los que
 * el motor de calculo o el wizard van a consumir; el resto es ruido de Foundry.
 *  - ChoiceSet        -> el feature abre una eleccion
 *  - GrantItem        -> otorga otro item
 *  - FlatModifier     -> modificador tipado, entra directo al pipeline de calculo
 *  - ActiveEffectLike -> sube rangos de proficiencia via path dotted
 *                        (system.proficiencies.defenses.heavy.rank = 2). Es como el
 *                        dataset codifica TODA la progresion de proficiencias por nivel.
 */
const PROFICIENCY_PATH = /^system\.(proficiencies\.|saves\.|perception)/;

function relevantRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .filter(
      (r) =>
        ['ChoiceSet', 'GrantItem', 'FlatModifier'].includes(r.key) ||
        (r.key === 'ActiveEffectLike' && typeof r.path === 'string' && PROFICIENCY_PATH.test(r.path)),
    )
    .map((r) => {
      if (r.key === 'ActiveEffectLike') {
        return {
          key: 'Proficiency',
          path: r.path.replace(/^system\./, '').replace(/\.rank$/, ''),
          mode: r.mode ?? 'upgrade',
          value: typeof r.value === 'number' ? r.value : null,
        };
      }
      if (r.key === 'ChoiceSet') {
        const choices = Array.isArray(r.choices)
          ? r.choices.map((c) => ({ label: c.label ?? c.value, id: idFromUuid(c.uuid) ?? c.value }))
          : null;
        // Las elecciones dinamicas (instinct, way, racket...) no traen lista: traen
        // un filtro por tag, tipo "item:tag:gunslinger-way". Con eso se resuelven
        // contra los otherTags de los demas items, sin tablas escritas a mano.
        const rawFilter =
          r.choices && !Array.isArray(r.choices) && Array.isArray(r.choices.filter) ? r.choices.filter : [];
        const filterTags = rawFilter
          .filter((f) => typeof f === 'string' && f.startsWith('item:tag:'))
          .map((f) => f.replace('item:tag:', ''));

        return {
          key: 'ChoiceSet',
          prompt: r.prompt ?? '',
          flag: r.flag ?? null,
          choices,
          filterTags: filterTags.length ? filterTags : null,
        };
      }
      if (r.key === 'GrantItem') return { key: 'GrantItem', id: idFromUuid(r.uuid) };
      return {
        key: 'FlatModifier',
        selector: r.selector,
        type: r.type ?? 'untyped',
        value: typeof r.value === 'number' ? r.value : null,
        label: r.label ?? null,
        // El predicado dice CUANDO aplica. Para la iniciativa importa mucho:
        // ["perception"] significa que el bonus solo cuenta si tiras iniciativa
        // con Percepcion, y se pierde si la tiras con una habilidad.
        predicate: Array.isArray(r.predicate) ? r.predicate.filter((p) => typeof p === 'string') : [],
      };
    });
}

async function readPack(pack) {
  const dir = join(PACKS, pack);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const file of files) {
    const json = JSON.parse(await readFile(join(dir, file), 'utf8'));
    out.push({ ...json, __id: idFromFile(file) });
  }
  return out;
}

const base = (doc) => ({
  id: doc.__id,
  slug: doc.system?.slug ?? slugify(doc.name),
  name: doc.name,
  traits: traitsOf(doc.system),
  // Los tags son lo que resuelve las elecciones dinamicas (ver relevantRules).
  tags: doc.system?.traits?.otherTags ?? [],
  rarity: rarityOf(doc.system),
  source: sourceOf(doc.system),
  description: cleanDescription(doc.system?.description?.value),
});

// ------------------------------------------------------------- mapeadores

const mapClass = (d) => ({
  ...base(d),
  hp: d.system.hp,
  keyAbility: d.system.keyAbility?.value ?? [],
  perception: d.system.perception,
  savingThrows: d.system.savingThrows,
  // `other` es la proficiencia con nombre propio de algunas clases
  // (ej. Gunslinger: "Simple Firearms, Martial Firearms" a rango experto).
  attacks: d.system.attacks,
  otherAttackProficiency: d.system.attacks?.other?.name
    ? { name: d.system.attacks.other.name, rank: d.system.attacks.other.rank ?? 0 }
    : null,
  defenses: d.system.defenses,
  trainedSkills: {
    fixed: d.system.trainedSkills?.value ?? [],
    additional: d.system.trainedSkills?.additional ?? 0,
  },
  featLevels: {
    ancestry: d.system.ancestryFeatLevels?.value ?? [],
    class: d.system.classFeatLevels?.value ?? [],
    general: d.system.generalFeatLevels?.value ?? [],
    skill: d.system.skillFeatLevels?.value ?? [],
  },
  skillIncreaseLevels: d.system.skillIncreaseLevels?.value ?? [],
  spellcasting: d.system.spellcasting ?? 0,
  features: grantedItems(d.system.items),
});

const mapAncestry = (d) => ({
  ...base(d),
  hp: d.system.hp,
  size: d.system.size,
  speed: d.system.speed,
  boosts: boostSets(d.system.boosts),
  flaws: boostSets(d.system.flaws),
  languages: d.system.languages?.value ?? [],
  additionalLanguages: d.system.additionalLanguages?.count ?? 0,
  vision: d.system.vision ?? 'normal',
  features: grantedItems(d.system.items),
});

const mapHeritage = (d) => ({
  ...base(d),
  ancestry: d.system.ancestry?.slug ?? null,
  rules: relevantRules(d.system.rules),
});

const mapBackground = (d) => ({
  ...base(d),
  boosts: boostSets(d.system.boosts),
  trainedSkills: d.system.trainedSkills?.value ?? [],
  lore: d.system.trainedSkills?.lore ?? [],
  grantedFeats: grantedItems(d.system.items),
});

const mapFeat = (d) => ({
  ...base(d),
  level: d.system.level?.value ?? 1,
  category: d.system.category ?? 'general',
  actionType: d.system.actionType?.value ?? 'passive',
  actions: d.system.actions?.value ?? null,
  // Texto libre: se muestra como advertencia, no se evalua (decision de diseno).
  prerequisites: (d.system.prerequisites?.value ?? []).map((p) => p.value ?? p),
  onlyLevel1: d.system.onlyLevel1 ?? false,
  maxTakable: d.system.maxTakable ?? 1,
  rules: relevantRules(d.system.rules),
});

/** Los linajes de sorcerer declaran su tradicion en la prosa: "Spell List occult". */
function traditionFromDescription(html) {
  const text = cleanDescription(html).replace(/<[^>]+>/g, ' ');
  const match = text.match(/Spell List\s+(arcane|divine|occult|primal)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Los focus spells NO se otorgan estructuradamente en el dataset (ningun GrantItem
 * resuelve a un hechizo). Los linajes de sorcerer si los nombran con un patron fijo:
 *   "Bloodline Spells initial: Dragon Claws , advanced: Dragon Breath , greater: Dragon Wings"
 * Se extraen para poder sugerirlos; el resto se elige a mano.
 */
function focusSpellsFromDescription(html) {
  const text = cleanDescription(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const bloque = text.match(/Bloodline Spells(.{0,200}?)(?:Blood Magic|$)/i)?.[1];
  if (!bloque) return [];

  return [...bloque.matchAll(/(?:initial|advanced|greater):\s*([A-Z][A-Za-z'’\- ]+?)\s*(?:,|$)/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

const mapClassFeature = (d) => ({
  ...base(d),
  tradition: traditionFromDescription(d.system?.description?.value),
  focusSpells: focusSpellsFromDescription(d.system?.description?.value),
  level: d.system.level?.value ?? 1,
  actionType: d.system.actionType?.value ?? 'passive',
  rules: relevantRules(d.system.rules),
});

/**
 * El dano de un hechizo viene indexado ({"0": {...}}) igual que los boosts, y el
 * escalado por rango vive aparte en `heightening`.
 */
function spellDamage(raw) {
  if (!raw) return [];
  return Object.values(raw)
    .filter((d) => d?.formula)
    .map((d) => ({ formula: d.formula, type: d.type ?? '', kinds: d.kinds ?? ['damage'] }));
}

const mapSpell = (d) => ({
  ...base(d),
  level: d.system.level?.value ?? 1,
  traditions: d.system.traits?.traditions ?? [],
  time: d.system.time?.value ?? '',
  range: d.system.range?.value ?? '',
  targets: d.system.target?.value ?? '',
  duration: d.system.duration?.value ?? '',
  defense: d.system.defense?.save?.statistic ?? null,
  basicSave: d.system.defense?.save?.basic ?? false,
  damage: spellDamage(d.system.damage),
  // { type: 'interval', interval: 1, damage: { "0": "2d6" } } -> +2d6 por rango
  heightening: d.system.heightening ?? null,
  area: d.system.area ? `${d.system.area.value}-foot ${d.system.area.type}` : '',
  cost: d.system.cost?.value ?? '',
});

const mapEquipment = (d) => ({
  ...base(d),
  type: d.type,
  level: d.system.level?.value ?? 0,
  price: d.system.price?.value ?? null,
  bulk: d.system.bulk?.value ?? 0,
  usage: d.system.usage?.value ?? '',
  // datos propios de armas / armaduras (ausentes en el resto)
  damage: d.system.damage ?? null,
  // Las armas a distancia se reconocen por `range`, no por un trait: las armas de
  // fuego no llevan trait de alcance.
  range: typeof d.system.range === 'number' ? d.system.range : null,
  reload: d.system.reload?.value ?? null,
  category: d.system.category ?? null,
  group: d.system.group ?? null,
  acBonus: d.system.acBonus ?? null,
  // Escudos: cuanto absorbe (hardness) y cuanto aguanta (hp). El Broken Threshold
  // es la mitad de los HP, y el dataset lo confirma en la tabla de la descripcion.
  hardness: d.system.hardness ?? null,
  maxHp: d.system.hp?.max ?? d.system.hp?.value ?? null,
  dexCap: d.system.dexCap ?? null,
  strength: d.system.strength ?? null,
  checkPenalty: d.system.checkPenalty ?? null,
  speedPenalty: d.system.speedPenalty ?? null,
});

const mapDeity = (d) => ({
  ...base(d),
  // OJO: las deidades del pack legacy estan parcialmente remasterizadas — traen
  // `sanctification` (holy/unholy, concepto del Remaster) y no el alineamiento Legacy.
  sanctification: d.system.sanctification?.what?.join('/') ?? null,
  sanctificationModal: d.system.sanctification?.modal ?? null,
  attribute: d.system.attribute ?? [],
  domains: d.system.domains?.primary ?? [],
  alternateDomains: d.system.domains?.alternate ?? [],
  favoredWeapons: d.system.weapons ?? [],
  divineFont: d.system.font ?? [],
  skill: d.system.skill ?? null,
});

const mapAction = (d) => ({
  ...base(d),
  actionType: d.system.actionType?.value ?? 'action',
  actions: d.system.actions?.value ?? null,
});

// ------------------------------------------------------------------- main

const JOBS = [
  ['classes-legacy', 'classes', mapClass],
  ['ancestries-legacy', 'ancestries', mapAncestry],
  ['ancestry-features-legacy', 'ancestry-features', mapClassFeature],
  ['heritages-legacy', 'heritages', mapHeritage],
  ['backgrounds-legacy', 'backgrounds', mapBackground],
  ['class-features-legacy', 'class-features', mapClassFeature],
  ['feats-legacy', 'feats', mapFeat],
  ['spells-legacy', 'spells', mapSpell],
  ['equipment-legacy', 'equipment', mapEquipment],
  ['deities-legacy', 'deities', mapDeity],
  ['actions-legacy', 'actions', mapAction],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), source: 'pf2e-legacy-content', packs: {} };

  for (const [pack, name, mapper] of JOBS) {
    const docs = await readPack(pack);
    const mapped = docs.map(mapper).sort((a, b) => a.name.localeCompare(b.name));
    const file = join(OUT, `${name}.json`);
    await writeFile(file, JSON.stringify(mapped));
    const kb = Math.round(JSON.stringify(mapped).length / 1024);
    manifest.packs[name] = { count: mapped.length, kb };
    console.log(`  ${name.padEnd(18)} ${String(mapped.length).padStart(5)} items  ${String(kb).padStart(6)} KB`);
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nListo ->', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
