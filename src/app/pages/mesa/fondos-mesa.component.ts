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
    <div class="controles" [style.transform]="transformControles()">
      <button class="agarre" title="Arrastrar controles" aria-label="Arrastrar controles" (pointerdown)="empezarMoverControles($event)">⠿</button>
      @if (puedeGestionar() && activa(); as fondo) {
        <div class="selector-fondos" [class.abierto]="selectorAbierto()" (mouseenter)="abrirSelector()" (mouseleave)="cerrarSelector()">
          <button class="btn ghost nombre-activo" title="Elegir fondo">🖼 {{ fondo.title }}</button>
          <div class="lista-fondos">
            @for (escena of fondos(); track escena.id; let i = $index) {
              <button [class.seleccionado]="i === indice()" (click)="elegir(i)">{{ escena.title }}</button>
            }
          </div>
        </div>
      }
      @if (activa()) { <button class="btn ghost" (click)="zoom(-0.15)">−</button><button class="btn ghost" (click)="zoom(0.15)">+</button><button class="btn ghost" title="Centrar imagen" (click)="centrar()">⊙</button> }
      @if (activa() && puedeGestionar()) { <button class="btn ghost borrar" title="Borrar este fondo" (click)="borrar()">🗑</button> }
    </div>
    @if (error(); as e) { <p class="error">{{ e }}</p> }
  `,
  styles: `
    :host { position:absolute; inset:0; overflow:hidden; background:var(--surface); }
    /* Muestra el arte completo —incluido uno vertical— sin recortar extremos. */
    .fondo { position:absolute; left:50%; top:50%; width:100%; height:100%; max-width:none; object-fit:contain; transform-origin:center; cursor:grab; user-select:none; touch-action:none; }
    .fondo:active { cursor:grabbing; }
    .controles { position:absolute; left:.5rem; bottom:.5rem; z-index:1; display:flex; align-items:center; gap:.25rem; padding:.25rem; border:1px solid var(--border); border-radius:var(--radius); background:color-mix(in srgb, var(--surface) 88%, transparent); font-size:.75rem; }
    .controles .btn { padding:.2rem .45rem; }
    .agarre { align-self:stretch; border:0; border-right:1px solid var(--border); padding:0 .25rem; background:transparent; color:var(--muted); cursor:grab; touch-action:none; }
    .agarre:active { cursor:grabbing; }
    .selector-fondos { position:relative; min-width:0; }
    .nombre-activo { max-width:14rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lista-fondos { position:absolute; left:0; bottom:100%; display:none; flex-direction:column; min-width:min(18rem, calc(100vw - 2rem)); max-height:15rem; overflow-y:auto; padding:.25rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); box-shadow:0 .35rem 1rem var(--sombra); }
    .selector-fondos.abierto .lista-fondos { display:flex; }
    .lista-fondos button { border:0; border-radius:4px; padding:.4rem .5rem; background:transparent; color:var(--text); text-align:left; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .lista-fondos button:hover, .lista-fondos button.seleccionado { background:var(--surface-2); color:var(--accent-strong); }
    .borrar:hover { color:var(--danger); border-color:var(--danger); }
    .error { position:absolute; bottom:.5rem; right:.5rem; color:var(--danger); background:var(--surface); padding:.3rem; margin:0; }
  `,
})
export class FondosMesaComponent implements OnDestroy {
  readonly partyId = input.required<string>();
  readonly puedeGestionar = input(false);
  private auth = inject(AuthService);
  readonly fondos = signal<EscenaVista[]>([]);
  readonly indice = signal(0);
  readonly error = signal<string | null>(null);
  readonly selectorAbierto = signal(false);
  private canal: RealtimeChannel | null = null; private canalEstado: RealtimeChannel | null = null;
  private escala = signal(1); private x = signal(0); private y = signal(0); private arrastre: { x: number; y: number; px: number; py: number; movio: boolean } | null = null;
  private controlesX = signal(0); private controlesY = signal(0);
  readonly activa = () => this.fondos()[this.indice()] ?? null;
  readonly transform = () => `translate(calc(-50% + ${this.x()}px), calc(-50% + ${this.y()}px)) scale(${this.escala()})`;
  readonly transformControles = () => `translate(${this.controlesX()}px, ${this.controlesY()}px)`;

  ngOnInit() { void this.cargar(); }
  async cargar() {
    const client = this.auth.client; if (!client) return;
    const [escenas, estado] = await Promise.all([client.from('party_scenes').select('*').eq('party_id', this.partyId()).order('created_at'), client.from('party_scene_state').select('scene_id').eq('party_id', this.partyId()).maybeSingle()]);
    const { data, error } = escenas;
    if (error) { this.error.set('Falta crear los fondos de la mesa en Supabase: ejecutá el bloque “Fondos compartidos de la mesa” de supabase/schema.sql.'); return; }
    const fondos = await Promise.all(((data ?? []) as PartyScene[]).map(async s => ({ ...s, url: (await client.storage.from('party-scenes').createSignedUrl(s.storage_path, 3600)).data?.signedUrl ?? '' })));
    this.fondos.set(fondos.filter(s => s.url));
    const activo = estado.data?.scene_id as string | undefined;
    const indiceActivo = activo ? fondos.findIndex((f) => f.id === activo) : -1;
    this.indice.set(indiceActivo >= 0 ? indiceActivo : Math.min(this.indice(), Math.max(0, fondos.length - 1)));
    this.canal ??= client.channel(`party-scenes:${this.partyId()}`).on('postgres_changes', { event:'*', schema:'public', table:'party_scenes', filter:`party_id=eq.${this.partyId()}` }, () => void this.cargar()).subscribe();
    this.canalEstado ??= client.channel(`party-scene-state:${this.partyId()}`).on('postgres_changes', { event:'*', schema:'public', table:'party_scene_state', filter:`party_id=eq.${this.partyId()}` }, payload => this.seleccionarId((payload.new as { scene_id?: string }).scene_id)).subscribe();
  }
  async subir(evento: Event) {
    const input = evento.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file || !this.puedeGestionar()) return;
    if (file.type.startsWith('audio/')) { await this.subirAudio(file); return; }
    await this.subirImagen(file);
  }
  private async subirImagen(file: File) {
    if (file.size > 1024 * 1024) { this.error.set(`“${file.name}” pesa ${(file.size / 1024 / 1024).toFixed(2)} MB. Una imagen no puede superar 1 MB.`); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const ancho = bitmap.width; const alto = bitmap.height; bitmap.close();
      if (Math.min(ancho, alto) < 600 || Math.max(ancho, alto) < 800) { this.error.set(`“${file.name}” mide ${ancho} × ${alto} px. Para el tablero usá al menos 800 × 600 px.`); return; }
    } catch { this.error.set('No se pudo leer la resolución de la imagen.'); return; }
    const client = this.auth.client; const user = this.auth.userId(); if (!client || !user) return;
    const { data } = await client.from('party_scenes').select('size_bytes').eq('party_id', this.partyId());
    const usado = (data ?? []).reduce((total, escena) => total + Number(escena.size_bytes ?? 0), 0);
    if (usado + file.size > 10 * 1024 * 1024) { this.error.set(`No hay espacio suficiente: quedan ${((10 * 1024 * 1024 - usado) / 1024 / 1024).toFixed(2)} MB de imágenes.`); return; }
    this.error.set(null);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${this.partyId()}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('party-scenes').upload(path, file, { contentType: file.type });
    if (uploadError) { this.error.set(mensajeDeError(uploadError)); return; }
    const titulo = file.name.replace(/\.[^.]+$/, '') || 'Fondo';
    const { error: insertError } = await client.from('party_scenes').insert({ party_id: this.partyId(), author_id: user, title: titulo, storage_path: path, size_bytes: file.size });
    if (insertError) { await client.storage.from('party-scenes').remove([path]); this.error.set(mensajeDeError(insertError)); return; }
    await this.cargar();
  }
  private async subirAudio(file: File) {
    if (file.size > 5 * 1024 * 1024) { this.error.set(`“${file.name}” pesa ${(file.size / 1024 / 1024).toFixed(2)} MB. Un audio no puede superar 5 MB.`); return; }
    const client = this.auth.client; const user = this.auth.userId(); if (!client || !user) return;
    const { data } = await client.from('party_audio_files').select('size_bytes').eq('party_id', this.partyId());
    const usado = (data ?? []).reduce((total, audio) => total + Number(audio.size_bytes ?? 0), 0);
    if (usado + file.size > 15 * 1024 * 1024) { this.error.set(`No hay espacio suficiente: quedan ${((15 * 1024 * 1024 - usado) / 1024 / 1024).toFixed(2)} MB de audio.`); return; }
    this.error.set(null);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const path = `${this.partyId()}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('party-audio').upload(path, file, { contentType: file.type });
    if (uploadError) { this.error.set(mensajeDeError(uploadError)); return; }
    const title = file.name.replace(/\.[^.]+$/, '') || 'Audio';
    const { error: insertError } = await client.from('party_audio_files').insert({ party_id: this.partyId(), author_id: user, title, storage_path: path, size_bytes: file.size, mime_type: file.type || 'audio/mpeg' });
    if (insertError) { await client.storage.from('party-audio').remove([path]); this.error.set(mensajeDeError(insertError)); }
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
  abrirSelector() { this.selectorAbierto.set(true); }
  cerrarSelector() { this.selectorAbierto.set(false); }
  async elegir(indice: number) {
    const escena = this.fondos()[indice]; const client = this.auth.client; const user = this.auth.userId();
    if (!escena || !client || !user || !this.puedeGestionar()) return;
    const { error } = await client.from('party_scene_state').upsert({ party_id: this.partyId(), author_id: user, scene_id: escena.id });
    if (error) { this.error.set(mensajeDeError(error)); return; }
    this.seleccionarId(escena.id);
  }
  private seleccionarId(id?: string) { const indice = this.fondos().findIndex((f) => f.id === id); if (indice >= 0) { this.indice.set(indice); this.selectorAbierto.set(false); this.reiniciarVista(); } }
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
  empezarMoverControles(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const inicioX = e.clientX; const inicioY = e.clientY;
    const baseX = this.controlesX(); const baseY = this.controlesY();
    const mover = (movimiento: PointerEvent) => {
      if (!(movimiento.buttons & 1)) return;
      this.controlesX.set(baseX + movimiento.clientX - inicioX);
      this.controlesY.set(baseY + movimiento.clientY - inicioY);
    };
    const soltar = () => { document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar); };
    document.addEventListener('pointermove', mover); document.addEventListener('pointerup', soltar);
  }
  centrar() { this.reiniciarVista(); }
  private reiniciarVista() { this.escala.set(1); this.x.set(0); this.y.set(0); }
  ngOnDestroy() { if (this.canal && this.auth.client) void this.auth.client.removeChannel(this.canal); if (this.canalEstado && this.auth.client) void this.auth.client.removeChannel(this.canalEstado); }
}
