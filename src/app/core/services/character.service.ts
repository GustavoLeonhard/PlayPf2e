import { Injectable, inject, signal } from '@angular/core';

import { emptyState, type CharacterBuild, type CharacterRecord } from '../models/character.model';
import { AuthService } from './auth.service';

const LOCAL_KEY = 'pf2e.characters';

/**
 * CRUD de personajes. Contra Supabase si esta configurado, contra localStorage
 * si no. La forma del registro es la misma en los dos casos.
 */
@Injectable({ providedIn: 'root' })
export class CharacterService {
  private auth = inject(AuthService);
  readonly characters = signal<CharacterRecord[]>([]);
  readonly loading = signal(false);

  async list(): Promise<CharacterRecord[]> {
    this.loading.set(true);
    try {
      const rows = this.auth.client ? await this.listRemote() : this.listLocal();
      this.characters.set(rows);
      return rows;
    } finally {
      this.loading.set(false);
    }
  }

  async get(id: string): Promise<CharacterRecord | null> {
    if (!this.auth.client) return this.listLocal().find((c) => c.id === id) ?? null;
    const { data } = await this.auth.client.from('characters').select('*').eq('id', id).single();
    return (data as CharacterRecord) ?? null;
  }

  async create(build: CharacterBuild): Promise<CharacterRecord> {
    const record: CharacterRecord = {
      id: crypto.randomUUID(),
      name: build.name,
      level: build.level,
      build,
      state: emptyState(),
      updated_at: new Date().toISOString(),
    };

    if (this.auth.client) {
      const { data, error } = await this.auth.client
        .from('characters')
        .insert({
          name: record.name,
          level: record.level,
          build: record.build,
          state: record.state,
          user_id: this.auth.userId(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as CharacterRecord;
    }

    const all = this.listLocal();
    all.push(record);
    this.saveLocal(all);
    return record;
  }

  async save(record: CharacterRecord): Promise<void> {
    record.name = record.build.name;
    record.level = record.build.level;
    record.updated_at = new Date().toISOString();

    if (this.auth.client) {
      const { error } = await this.auth.client
        .from('characters')
        .update({ name: record.name, level: record.level, build: record.build, state: record.state })
        .eq('id', record.id);
      if (error) throw error;
      return;
    }

    const all = this.listLocal().map((c) => (c.id === record.id ? record : c));
    this.saveLocal(all);
  }

  async remove(id: string): Promise<void> {
    if (this.auth.client) {
      await this.auth.client.from('characters').delete().eq('id', id);
    } else {
      this.saveLocal(this.listLocal().filter((c) => c.id !== id));
    }
    this.characters.update((cs) => cs.filter((c) => c.id !== id));
  }

  // ------------------------------------------------------------- backends

  private async listRemote(): Promise<CharacterRecord[]> {
    const { data, error } = await this.auth
      .client!.from('characters')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CharacterRecord[];
  }

  private listLocal(): CharacterRecord[] {
    const raw = localStorage.getItem(this.localKey());
    return raw ? (JSON.parse(raw) as CharacterRecord[]) : [];
  }

  private saveLocal(rows: CharacterRecord[]) {
    localStorage.setItem(this.localKey(), JSON.stringify(rows));
    this.characters.set(rows);
  }

  /** Los personajes locales se separan por usuario, igual que con RLS. */
  private localKey(): string {
    return `${LOCAL_KEY}.${this.auth.userId() ?? 'anon'}`;
  }
}
