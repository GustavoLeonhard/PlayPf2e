import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';

const LOCAL_KEY = 'pf2e.perfil.';

export interface Profile {
  displayName: string;
  /** Data URL del avatar, o '' si no cargó ninguno. */
  avatar: string;
}

/**
 * El nombre y el avatar con los que te ven los demás en una partida.
 *
 * El nombre por defecto es la parte del mail antes del arroba: lo pone el
 * trigger de la base al registrarse, y acá se repite el mismo criterio para el
 * modo local y para las cuentas viejas que se quedaron sin fila.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private auth = inject(AuthService);

  private readonly _profile = signal<Profile | null>(null);
  readonly profile = this._profile.asReadonly();

  /** Lo que se muestra en la barra: el nombre, o el mail si todavía no cargó. */
  readonly nombre = computed(() => this._profile()?.displayName || nombrePorDefecto(this.auth.email()));
  readonly avatar = computed(() => this._profile()?.avatar || '');

  async cargar(): Promise<void> {
    const id = this.auth.userId();
    if (!id) return;

    if (!this.auth.client) {
      const crudo = localStorage.getItem(LOCAL_KEY + id);
      this._profile.set(crudo ? JSON.parse(crudo) : vacio(this.auth.email()));
      return;
    }

    const { data } = await this.auth.client
      .from('profiles')
      .select('display_name, avatar')
      .eq('id', id)
      .maybeSingle();

    this._profile.set({
      displayName: data?.display_name || nombrePorDefecto(this.auth.email()),
      avatar: data?.avatar ?? '',
    });
  }

  async guardar(cambios: Partial<Profile>): Promise<void> {
    const id = this.auth.userId();
    if (!id) return;

    const nuevo: Profile = { ...(this._profile() ?? vacio(this.auth.email())), ...cambios };
    this._profile.set(nuevo);

    if (!this.auth.client) {
      localStorage.setItem(LOCAL_KEY + id, JSON.stringify(nuevo));
      return;
    }

    // upsert y no update: una cuenta creada antes del trigger no tiene fila.
    const { error } = await this.auth.client
      .from('profiles')
      .upsert({ id, display_name: nuevo.displayName, avatar: nuevo.avatar });
    if (error) throw error;
  }
}

/** "geramarenco@gmail.com" -> "geramarenco". */
export function nombrePorDefecto(email: string | null): string {
  return (email ?? '').split('@')[0] || 'Sin nombre';
}

const vacio = (email: string | null): Profile => ({ displayName: nombrePorDefecto(email), avatar: '' });
