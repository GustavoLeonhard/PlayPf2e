import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  Ancestry,
  Background,
  ClassFeature,
  Equipment,
  Feat,
  Heritage,
  Deity,
  Pf2Class,
  Spell,
} from '../models/content.model';
import type { Effect } from '../rules/efectos';
import type { ContentIndex } from '../rules/character.engine';

export interface ConditionText {
  id: string;
  name: string;
  source: string;
  text: string;
}

/**
 * Carga el contenido de reglas desde `public/data/` (JSON estatico generado por
 * tools/import). Es read-only y publico, asi que no pasa por Supabase.
 *
 * Cada pack se baja una sola vez y bajo demanda: equipment y spells son los
 * pesados y solo hacen falta en sus pasos del wizard.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private http = inject(HttpClient);
  private cache = new Map<string, Promise<unknown[]>>();

  readonly loading = signal(false);

  private load<T>(pack: string): Promise<T[]> {
    if (!this.cache.has(pack)) {
      this.loading.set(true);
      const promise = firstValueFrom(this.http.get<T[]>(`data/${pack}.json`)).finally(() =>
        this.loading.set(false),
      );
      this.cache.set(pack, promise as Promise<unknown[]>);
    }
    return this.cache.get(pack) as Promise<T[]>;
  }

  classes = () => this.load<Pf2Class>('classes');
  ancestries = () => this.load<Ancestry>('ancestries');
  heritages = () => this.load<Heritage>('heritages');
  backgrounds = () => this.load<Background>('backgrounds');
  classFeatures = () => this.load<ClassFeature>('class-features');
  ancestryFeatures = () => this.load<ClassFeature>('ancestry-features');
  feats = () => this.load<Feat>('feats');
  equipment = () => this.load<Equipment>('equipment');
  spells = () => this.load<Spell>('spells');
  actions = () => this.load<ClassFeature>('actions');
  deities = () => this.load<Deity>('deities');
  /** Efectos activables: rabia, garbo, heroism… Ver rules/efectos.ts. */
  effects = () => this.load<Effect>('effects');
  /** Texto oficial de las condiciones (importado de AoN legacy, no del dataset Foundry). */
  conditions = () => this.load<ConditionText>('conditions');

  /** Todo lo que el motor de calculo necesita para resolver referencias. */
  async index(): Promise<ContentIndex> {
    const [
      classes,
      ancestries,
      heritages,
      backgrounds,
      features,
      ancestryFeatures,
      feats,
      equipment,
      actions,
      deities,
      effects,
    ] =
      await Promise.all([
        this.classes(),
        this.ancestries(),
        this.heritages(),
        this.backgrounds(),
        this.classFeatures(),
        this.ancestryFeatures(),
        this.feats(),
        this.equipment(),
        this.actions(),
        this.deities(),
        this.effects(),
      ]);

    return {
      classBySlug: new Map(classes.map((c) => [c.slug, c])),
      ancestryBySlug: new Map(ancestries.map((a) => [a.slug, a])),
      heritageById: new Map(heritages.map((h) => [h.id, h])),
      backgroundBySlug: new Map(backgrounds.map((b) => [b.slug, b])),
      featById: new Map(feats.map((f) => [f.id, f])),
      featureById: new Map([...features, ...ancestryFeatures].map((f) => [f.id, f])),
      equipmentById: new Map(equipment.map((e) => [e.id, e])),
      actionById: new Map(actions.map((a) => [a.id, a])),
      featNames: new Set(feats.map((f) => f.name.toLowerCase())),
      deityById: new Map(deities.map((d) => [d.id, d])),
      effectById: new Map(effects.map((e) => [e.id, e])),
    };
  }
}
