import { Injectable, computed, signal } from '@angular/core';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

const LOCAL_USER_KEY = 'pf2e.localUser';

/**
 * Auth con Supabase (mail + password, sin validacion ni confirmacion de mail).
 *
 * Si no hay credenciales configuradas en environment.ts, cae a un "modo local":
 * la sesion vive en localStorage y los personajes tambien. Sirve para usar la
 * app entera sin crear cuenta de Supabase.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly client: SupabaseClient | null =
    environment.supabaseUrl && environment.supabaseAnonKey
      ? createClient(environment.supabaseUrl, environment.supabaseAnonKey)
      : null;

  /** true cuando no hay Supabase configurado y persistimos en el navegador. */
  readonly localMode = !this.client;

  private readonly _email = signal<string | null>(null);
  private readonly _userId = signal<string | null>(null);
  readonly ready = signal(false);

  readonly email = this._email.asReadonly();
  readonly userId = this._userId.asReadonly();
  readonly isLoggedIn = computed(() => this._userId() !== null);

  constructor() {
    void this.restore();
  }

  private async restore() {
    if (this.client) {
      const { data } = await this.client.auth.getSession();
      this.setUser(data.session?.user ?? null);
      this.client.auth.onAuthStateChange((_event, session) => this.setUser(session?.user ?? null));
    } else {
      const saved = localStorage.getItem(LOCAL_USER_KEY);
      if (saved) {
        const { email, id } = JSON.parse(saved);
        this._email.set(email);
        this._userId.set(id);
      }
    }
    this.ready.set(true);
  }

  private setUser(user: User | null) {
    this._email.set(user?.email ?? null);
    this._userId.set(user?.id ?? null);
  }

  async signUp(email: string, password: string): Promise<string | null> {
    if (!this.client) return this.localSignIn(email);
    const { error } = await this.client.auth.signUp({ email, password });
    return error?.message ?? null;
  }

  async signIn(email: string, password: string): Promise<string | null> {
    if (!this.client) return this.localSignIn(email);
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async signOut() {
    if (this.client) await this.client.auth.signOut();
    else localStorage.removeItem(LOCAL_USER_KEY);
    this._email.set(null);
    this._userId.set(null);
  }

  /** Modo local: cualquier mail entra, el id se deriva del mail. */
  private localSignIn(email: string): null {
    const id = `local:${email.toLowerCase().trim()}`;
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify({ email, id }));
    this._email.set(email);
    this._userId.set(id);
    return null;
  }
}
