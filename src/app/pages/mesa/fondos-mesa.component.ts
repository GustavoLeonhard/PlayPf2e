import { Component, inject, input, signal, type OnDestroy } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { PartyScene } from '../../core/models/party.model';
import { AuthService } from '../../core/services/auth.service';
import { mensajeDeError } from '../../core/services/party.service';

type EscenaVista = PartyScene & { url: string };

@Component({
  selector: 'app-fondos-mesa',
  template: `
    @if (activa(); as fondo) {
      <img class="fondo" [src]="fondo.url" [alt]="fondo.title" [style.transform]="transform()" draggable="false" (pointerdown)="empezarMover($event)" (wheel)="zoomRueda($event)" />
    }
    <div class="controles">
      @if (fondos().length > 1) { <button class="btn ghost" (click)="anterior()">‹</button><span>{{ indice() + 1 }}/{{ fondos().length }}</span><button class="btn ghost" (click)="siguiente()">›</button> }
      @if (activa()) { <button class="btn ghost" (click)="zoom(-0.15)">−</button><button class="btn ghost" (click)="zoom(0.15)">+</button><button class="btn ghost" title="Centrar imagen" (click)="centrar()">⊙</button> }
      @if (activa()) { <button class="btn ghost borrar" title="Borrar este fondo" (click)="borrar()">🗑</button> }
    </div>
    @if (error(); as e) { <p class="error">{{ e }}</p> }
  `,
  styles: `
    :host { position:absolute; inset:0; overflow:hidden; background:var(--surface); }
    .fondo { position:absolute; left:50%; top:50%; min-width:100%; min-height:100%; max-width:none; object-fit:cover; transform-origin:center; cursor:grab; user-select:none; touch-action:none; }
    .fondo:active { cursor:grabbing; }
    .controles { position:absolute; left:.5rem; bottom:.5rem; z-index:1; display:flex; align-items:center; gap:.25rem; padding:.25rem; border:1px solid var(--border); border-radius:var(--radius); background:color-mix(in srgb, var(--surface) 88%, transparent); font-size:.75rem; }
    .controles .btn { padding:.2rem .45rem; }
    .borrar:hover { color:var(--danger); border-color:var(--danger); }
    .error { position:absolute; bottom:.5rem; right:.5rem; color:var(--danger); background:var(--surface); padding:.3rem; margin:0; }
  `,
})
export class FondosMesaComponent implements OnDestroy {
  readonly partyId = input.required<string>();
  private auth = inject(AuthService);
  readonly fondos = signal<EscenaVista[]>([]);
  readonly indice = signal(0);
  readonly error = signal<string | null>(null);
  private canal: RealtimeChannel | null = null;
  private escala = signal(1); private x = signal(0); private y = signal(0); private arrastre: { x: number; y: number; px: number; py: number; movio: boolean } | null = null;
  readonly activa = () => this.fondos()[this.indice()] ?? null;
  readonly transform = () => `translate(calc(-50% + ${this.x()}px), calc(-50% + ${this.y()}px)) scale(${this.escala()})`;

  ngOnInit() { void this.cargar(); }
  async cargar() {
    const client = this.auth.client; if (!client) return;
    const { data, error } = await client.from('party_scenes').select('*').eq('party_id', this.partyId()).order('created_at');
    if (error) { this.error.set('Falta crear los fondos de la mesa en Supabase: ejecutá el bloque “Fondos compartidos de la mesa” de supabase/schema.sql.'); return; }
    const fondos = await Promise.all(((data ?? []) as PartyScene[]).map(async s => ({ ...s, url: (await client.storage.from('party-scenes').createSignedUrl(s.storage_path, 3600)).data?.signedUrl ?? '' })));
    this.fondos.set(fondos.filter(s => s.url)); this.indice.set(Math.min(this.indice(), Math.max(0, fondos.length - 1)));
    this.canal ??= client.channel(`party-scenes:${this.partyId()}`).on('postgres_changes', { event:'*', schema:'public', table:'party_scenes', filter:`party_id=eq.${this.partyId()}` }, () => void this.cargar()).subscribe();
  }
  async subir(evento: Event) {
    const input = evento.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return;
    const client = this.auth.client; const user = this.auth.userId(); if (!client || !user) return;
    if (file.size > 10 * 1024 * 1024) { this.error.set('La imagen no puede superar 10 MB.'); return; }
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${this.partyId()}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from('party-scenes').upload(path, file, { contentType:file.type }); if (error) { this.error.set(mensajeDeError(error)); return; }
    const titulo = file.name.replace(/\.[^.]+$/, '') || 'Fondo';
    const insert = await client.from('party_scenes').insert({ party_id:this.partyId(), author_id:user, title: titulo, storage_path:path });
    if (insert.error) this.error.set(mensajeDeError(insert.error)); else void this.cargar();
  }
  async borrar() {
    const escena = this.activa(); const client = this.auth.client; if (!escena || !client) return;
    if (!confirm(`¿Borrar el fondo “${escena.title}”?`)) return;
    const { error } = await client.from('party_scenes').delete().eq('id', escena.id);
    if (error) { this.error.set(mensajeDeError(error)); return; }
    await client.storage.from('party-scenes').remove([escena.storage_path]);
    this.indice.set(Math.max(0, this.indice() - 1));
    void this.cargar();
  }
  anterior() { this.indice.update(i => (i - 1 + this.fondos().length) % this.fondos().length); this.reiniciarVista(); }
  siguiente() { this.indice.update(i => (i + 1) % this.fondos().length); this.reiniciarVista(); }
  zoom(delta: number) { this.escala.update(escala => Math.max(.5, Math.min(3, escala + delta))); }
  zoomRueda(evento: WheelEvent) {
    evento.preventDefault();
    this.zoom(evento.deltaY < 0 ? 0.1 : -0.1);
  }
  empezarMover(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.arrastre = { x:e.clientX, y:e.clientY, px:this.x(), py:this.y(), movio:false };
    const move = (m: PointerEvent) => {
      const inicio = this.arrastre;
      if (!inicio || !(m.buttons & 1)) return;
      const dx = m.clientX - inicio.x; const dy = m.clientY - inicio.y;
      // Un clic normal puede moverse uno o dos píxeles: no lo tratamos como arrastre.
      if (!inicio.movio && Math.hypot(dx, dy) < 4) return;
      inicio.movio = true;
      this.x.set(inicio.px + dx); this.y.set(inicio.py + dy);
    };
    const end = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); this.arrastre = null; };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', end);
  }
  centrar() { this.reiniciarVista(); }
  private reiniciarVista() { this.escala.set(1); this.x.set(0); this.y.set(0); }
  ngOnDestroy() { if (this.canal && this.auth.client) void this.auth.client.removeChannel(this.canal); }
}
