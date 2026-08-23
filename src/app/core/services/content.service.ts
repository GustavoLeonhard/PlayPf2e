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

  /*
   * Las descripciones viven en `<pack>-desc.json` y se bajan aparte.
   *
   * Son más de la mitad del peso y solo hacen falta al abrir un ⓘ o al buscar
   * por texto: abrir una hoja no tiene por qué bajar el texto de las 4563
   * piezas de equipo.
   *
   * Cuando llegan se le pegan al objeto que ya está en memoria y se avisa con
   * una señal. Se hace así, y no cambiando los trece lugares que leen
   * `.description`, porque el que las lee no tiene por qué saber que viajan
   * aparte — y el que las necesita ya las pidió.
   */
  private static readonly CON_TEXTO_APARTE = ['equipment', 'feats', 'spells', 'effects'] as const;

  /** Sube cada vez que llega un lote de texto: los computed vuelven a correr. */
  readonly descripcionesListas = signal(0);
  private textoPedido = new Set<string>();

  /**
   * Pide el texto de esos packs si todavía no se pidió.
   *
   * No se espera el resultado a propósito: quien la llama quiere que el texto
   * aparezca cuando llegue, no quedarse bloqueado. Un ⓘ abierto en el primer
   * segundo se completa solo.
   */
  asegurarDescripciones(...packs: string[]): void {
    for (const pack of packs) {
      if (!ContentService.CON_TEXTO_APARTE.includes(pack as never)) continue;
      if (this.textoPedido.has(pack)) continue;
      this.textoPedido.add(pack);

      void firstValueFrom(this.http.get<Record<string, string>>(`data/${pack}-desc.json`))
        .then(async (textos) => {
          const items = (await this.load<{ id: string; description: string }>(pack)) ?? [];
          for (const item of items) {
            const texto = textos[item.id];
            if (texto) item.description = texto;
          }
          this.descripcionesListas.update((n) => n + 1);
        })
        .catch(() => {
          // Sin el texto la app funciona: se ven los números y no la prosa.
          this.textoPedido.delete(pack);
        });
    }
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
