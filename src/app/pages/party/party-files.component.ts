import { Component, inject, input, signal, type OnDestroy } from '@angular/core';

import type { PartyAudioFile, PartyScene } from '../../core/models/party.model';
import { AuthService } from '../../core/services/auth.service';
import { mensajeDeError } from '../../core/services/party.service';

const MB = 1024 * 1024;
const LIMITE_IMAGEN_INDIVIDUAL = MB;
const LIMITE_IMAGENES_MESA = 10 * MB;
const LIMITE_AUDIO_INDIVIDUAL = 5 * MB;
const LIMITE_AUDIOS_MESA = 15 * MB;

@Component({
  selector: 'app-party-files',
  template: `
    <section class="card archivos">
      <div class="titulo"><div><h2>Adjuntar archivos</h2><p class="muted small">Solo vos, como GM, podés agregar o quitar archivos de esta mesa.</p></div></div>
      @if (error(); as e) { <p class="error">{{ e }}</p> }

      <div class="grupo">
        <div class="grupo-head"><div><h3>Imágenes</h3><p class="muted small">Hasta 1 MB por imagen. Máximo 10 MB entre todas.</p></div><strong>{{ mb(usadoImagenes()) }} / 10 MB</strong></div>
        <div class="barra" [style.--uso.%]="porcentaje(usadoImagenes(), LIMITE_IMAGENES_MESA)"><span></span></div>
        <p class="muted small">Quedan {{ mb(restanteImagenes()) }} MB.</p>
        <div class="acciones-imagenes"><label class="btn"><input hidden type="file" multiple accept="image/jpeg,image/png,image/webp" (change)="subirImagen($event)" [disabled]="subiendo()" />{{ subiendo() ? 'Subiendo…' : 'Añadir imágenes' }}</label>@if (seleccionadas().size) { <button class="btn ghost borrar-seleccion" (click)="borrarSeleccionadas()">🗑 Borrar {{ seleccionadas().size }} seleccionada{{ seleccionadas().size === 1 ? '' : 's' }}</button> }</div>
        @for (imagen of imagenes(); track imagen.id) { <div class="archivo"><input class="selector" type="checkbox" [checked]="seleccionadas().has(imagen.id)" [attr.aria-label]="'Seleccionar ' + imagen.title" (change)="alternarSeleccion(imagen.id, $any($event.target).checked)" />@if (editandoId() === imagen.id) { <input class="nombre-editable" [value]="tituloEditado()" (input)="cambiarTitulo($any($event.target).value)" (keydown.enter)="guardarTitulo(imagen, 'party_scenes')" /><button class="icono-accion" title="Guardar nombre" (click)="guardarTitulo(imagen, 'party_scenes')">✓</button> } @else { <span>🖼 {{ imagen.title }}</span><button class="icono-accion" title="Editar nombre" (click)="editarTitulo(imagen)">✎</button> }<small>{{ mb(imagen.size_bytes) }} MB</small><button class="basurero" title="Quitar imagen" aria-label="Quitar imagen" (click)="borrarImagen(imagen)">🗑</button></div> }
      </div>

      <div class="grupo">
        <div class="grupo-head"><div><h3>Audio</h3><p class="muted small">Hasta 5 MB por archivo. Máximo 15 MB entre todos.</p></div><strong>{{ mb(usadoAudios()) }} / 15 MB</strong></div>
        <div class="barra" [style.--uso.%]="porcentaje(usadoAudios(), LIMITE_AUDIOS_MESA)"><span></span></div>
        <p class="muted small">Quedan {{ mb(restanteAudios()) }} MB.</p>
        <div class="acciones-imagenes"><label class="btn"><input hidden type="file" multiple accept="audio/*" (change)="subirAudio($event)" [disabled]="subiendo()" />{{ subiendo() ? 'Subiendo…' : 'Añadir audios' }}</label>@if (audiosSeleccionados().size) { <button class="btn ghost borrar-seleccion" (click)="borrarAudiosSeleccionados()">🗑 Borrar {{ audiosSeleccionados().size }} seleccionado{{ audiosSeleccionados().size === 1 ? '' : 's' }}</button> }</div>
        @for (audio of audios(); track audio.id) { <div class="archivo"><input class="selector" type="checkbox" [checked]="audiosSeleccionados().has(audio.id)" [attr.aria-label]="'Seleccionar ' + audio.title" (change)="alternarAudio(audio.id, $any($event.target).checked)" /><button class="preview" [class.activo]="audioEnPreview() === audio.id" [title]="audioEnPreview() === audio.id ? 'Pausar vista previa' : 'Escuchar 30 segundos'" (click)="previsualizar(audio)">{{ audioEnPreview() === audio.id ? '❚❚' : '▶' }}</button>@if (editandoId() === audio.id) { <input class="nombre-editable" [value]="tituloEditado()" (input)="cambiarTitulo($any($event.target).value)" (keydown.enter)="guardarTitulo(audio, 'party_audio_files')" /><button class="icono-accion" title="Guardar nombre" (click)="guardarTitulo(audio, 'party_audio_files')">✓</button> } @else { <span>🔊 {{ audio.title }}</span><button class="icono-accion" title="Editar nombre" (click)="editarTitulo(audio)">✎</button> }<small>{{ mb(audio.size_bytes) }} MB</small><button class="basurero" title="Quitar audio" aria-label="Quitar audio" (click)="borrarAudio(audio)">🗑</button></div> }
      </div>
    </section>
  `,
  styles: `
    .archivos{display:grid;gap:1rem}.titulo h2,.grupo h3{margin:0}.titulo p,.grupo p{margin:.25rem 0}.grupo{display:grid;gap:.45rem;padding-top:.9rem;border-top:1px solid var(--border)}.grupo-head{display:flex;justify-content:space-between;gap:1rem;align-items:start}.grupo-head strong{white-space:nowrap;font-size:.85rem}.barra{height:.45rem;border-radius:99px;background:var(--border);overflow:hidden}.barra span{display:block;width:var(--uso);height:100%;background:var(--accent)}.acciones-imagenes{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}.borrar-seleccion{color:var(--danger)}.archivo{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto auto auto;align-items:center;gap:.6rem;padding:.35rem 0;border-top:1px solid var(--border);font-size:.88rem}.archivo span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selector{width:1rem;height:1rem;accent-color:var(--accent);cursor:pointer}.preview,.icono-accion{display:grid;place-items:center;width:1.75rem;height:1.75rem;padding:0;border:1px solid var(--border);border-radius:50%;background:transparent;cursor:pointer}.preview.activo{color:var(--accent);border-color:var(--accent)}.nombre-editable{min-width:0;width:100%;padding:.25rem .4rem}.basurero{display:grid;place-items:center;width:2rem;height:2rem;padding:0;border:1px solid var(--border);border-radius:50%;background:transparent;cursor:pointer;font-size:1rem}.basurero:hover{color:var(--danger);border-color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent)}.error{color:var(--danger)}
  `,
})
export class PartyFilesComponent implements OnDestroy {
  readonly partyId = input.required<string>();
  private readonly auth = inject(AuthService);
  readonly imagenes = signal<PartyScene[]>([]);
  readonly audios = signal<PartyAudioFile[]>([]);
  readonly error = signal<string | null>(null);
  readonly subiendo = signal(false);
  readonly seleccionadas = signal<Set<string>>(new Set());
  readonly audiosSeleccionados = signal<Set<string>>(new Set());
  readonly editandoId = signal<string | null>(null);
  readonly tituloEditado = signal('');
  readonly audioEnPreview = signal<string | null>(null);
  private readonly reproductor = new Audio();
  private detenerPreview: ReturnType<typeof setTimeout> | null = null;
  readonly LIMITE_IMAGENES_MESA = LIMITE_IMAGENES_MESA;
  readonly LIMITE_AUDIOS_MESA = LIMITE_AUDIOS_MESA;

  readonly usadoImagenes = () => this.imagenes().reduce((total, imagen) => total + (imagen.size_bytes || 0), 0);
  readonly restanteImagenes = () => Math.max(0, LIMITE_IMAGENES_MESA - this.usadoImagenes());
  readonly usadoAudios = () => this.audios().reduce((total, audio) => total + (audio.size_bytes || 0), 0);
  readonly restanteAudios = () => Math.max(0, LIMITE_AUDIOS_MESA - this.usadoAudios());

  ngOnInit() { void this.cargar(); }

  async cargar() {
    const client = this.auth.client; if (!client) return;
    const [imagenes, audios] = await Promise.all([
      client.from('party_scenes').select('*').eq('party_id', this.partyId()).order('created_at'),
      client.from('party_audio_files').select('*').eq('party_id', this.partyId()).order('created_at'),
    ]);
    if (imagenes.error || audios.error) { this.error.set(mensajeDeError(imagenes.error ?? audios.error)); return; }
    this.imagenes.set((imagenes.data ?? []) as PartyScene[]);
    this.audios.set((audios.data ?? []) as PartyAudioFile[]);
  }

  async subirImagen(evento: Event) { await this.subirVarios(evento, 'imagen'); }
  async subirAudio(evento: Event) { await this.subirVarios(evento, 'audio'); }

  private async subirVarios(evento: Event, tipo: 'imagen' | 'audio') {
    const input = evento.target as HTMLInputElement;
    const files = Array.from(input.files ?? []); input.value = '';
    for (const file of files) await this.subir(file, tipo);
  }

  private async subir(file: File, tipo: 'imagen' | 'audio') {
    const limite = tipo === 'imagen' ? LIMITE_IMAGEN_INDIVIDUAL : LIMITE_AUDIO_INDIVIDUAL;
    if (file.size > limite) {
      this.error.set(`“${file.name}” pesa ${this.mb(file.size)} MB. Las ${tipo === 'imagen' ? 'imágenes' : 'pistas de audio'} no pueden superar ${tipo === 'imagen' ? '1' : '5'} MB.`);
      return;
    }
    if (tipo === 'imagen' && file.size > this.restanteImagenes()) { this.error.set(`No hay espacio para esa imagen: quedan ${this.mb(this.restanteImagenes())} MB de 10 MB.`); return; }
    if (tipo === 'audio' && file.size > this.restanteAudios()) { this.error.set(`No hay espacio para ese audio: quedan ${this.mb(this.restanteAudios())} MB de 15 MB.`); return; }
    if (tipo === 'imagen') {
      const dimensiones = await this.dimensionesDe(file);
      if (!dimensiones) { this.error.set(`No se pudo leer la resolución de “${file.name}”. Elegí una imagen JPG, PNG o WebP válida.`); return; }
      const ladoCorto = Math.min(dimensiones.ancho, dimensiones.alto);
      const ladoLargo = Math.max(dimensiones.ancho, dimensiones.alto);
      if (ladoCorto < 600 || ladoLargo < 800) {
        this.error.set(`“${file.name}” mide ${dimensiones.ancho} × ${dimensiones.alto} px y es demasiado chica para el tablero. Usá al menos 800 px en el lado largo y 600 px en el corto.`);
        return;
      }
    }
    const client = this.auth.client; const user = this.auth.userId(); if (!client || !user) return;
    this.subiendo.set(true); this.error.set(null);
    const extension = file.name.split('.').pop()?.toLowerCase() || (tipo === 'imagen' ? 'jpg' : 'mp3');
    const bucket = tipo === 'imagen' ? 'party-scenes' : 'party-audio';
    const path = `${this.partyId()}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await client.storage.from(bucket).upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const table = tipo === 'imagen' ? 'party_scenes' : 'party_audio_files';
      const row = { party_id: this.partyId(), author_id: user, title: file.name.replace(/\.[^.]+$/, '') || file.name, storage_path: path, size_bytes: file.size, ...(tipo === 'audio' ? { mime_type: file.type || 'audio/mpeg' } : {}) };
      const { error: insertError } = await client.from(table).insert(row);
      if (insertError) { await client.storage.from(bucket).remove([path]); throw insertError; }
      await this.cargar();
    } catch (e) { this.error.set(mensajeDeError(e)); }
    finally { this.subiendo.set(false); }
  }

  async borrarImagen(imagen: PartyScene) { await this.borrar('party-scenes', 'party_scenes', imagen); }
  async borrarAudio(audio: PartyAudioFile) { await this.borrar('party-audio', 'party_audio_files', audio); }
  private async borrar(bucket: string, table: string, archivo: PartyScene | PartyAudioFile, confirmar = true) {
    if (confirmar && !confirm(`¿Quitar “${archivo.title}”?`)) return;
    const client = this.auth.client; if (!client) return;
    const { error } = await client.from(table).delete().eq('id', archivo.id);
    if (error) { this.error.set(mensajeDeError(error)); return; }
    await client.storage.from(bucket).remove([archivo.storage_path]);
    await this.cargar();
    this.seleccionadas.update((ids) => { const siguiente = new Set(ids); siguiente.delete(archivo.id); return siguiente; });
  }
  alternarSeleccion(id: string, seleccionada: boolean) {
    this.seleccionadas.update((ids) => { const siguiente = new Set(ids); seleccionada ? siguiente.add(id) : siguiente.delete(id); return siguiente; });
  }
  alternarAudio(id: string, seleccionada: boolean) {
    this.audiosSeleccionados.update((ids) => { const siguiente = new Set(ids); seleccionada ? siguiente.add(id) : siguiente.delete(id); return siguiente; });
  }
  async borrarSeleccionadas() {
    const ids = this.seleccionadas();
    const imagenes = this.imagenes().filter((imagen) => ids.has(imagen.id));
    if (!imagenes.length || !confirm(`¿Borrar ${imagenes.length} imágenes seleccionadas?`)) return;
    for (const imagen of imagenes) await this.borrar('party-scenes', 'party_scenes', imagen, false);
    this.seleccionadas.set(new Set());
    await this.cargar();
  }
  async borrarAudiosSeleccionados() {
    const ids = this.audiosSeleccionados();
    const audios = this.audios().filter((audio) => ids.has(audio.id));
    if (!audios.length || !confirm(`¿Borrar ${audios.length} audios seleccionados?`)) return;
    for (const audio of audios) await this.borrar('party-audio', 'party_audio_files', audio, false);
    this.audiosSeleccionados.set(new Set());
    await this.cargar();
  }
  editarTitulo(archivo: PartyScene | PartyAudioFile) { this.error.set(null); this.editandoId.set(archivo.id); this.tituloEditado.set(archivo.title); }
  cambiarTitulo(titulo: string) { this.error.set(null); this.tituloEditado.set(titulo); }
  async guardarTitulo(archivo: PartyScene | PartyAudioFile, table: 'party_scenes' | 'party_audio_files') {
    const titulo = this.tituloEditado().trim(); const client = this.auth.client;
    if (!titulo || !client) return;
    this.error.set(null);
    const archivosDelMismoTipo = table === 'party_scenes' ? this.imagenes() : this.audios();
    const repetido = archivosDelMismoTipo.some((otro) => otro.id !== archivo.id && otro.title.trim().localeCompare(titulo, undefined, { sensitivity: 'accent' }) === 0);
    if (repetido) {
      this.error.set(`Ya existe ${table === 'party_scenes' ? 'una imagen' : 'un audio'} con el nombre “${titulo}”. Elegí otro para distinguirlos.`);
      return;
    }
    const { error } = await client.from(table).update({ title: titulo }).eq('id', archivo.id);
    if (error) { this.error.set(mensajeDeError(error)); return; }
    this.editandoId.set(null); await this.cargar();
  }
  async previsualizar(audio: PartyAudioFile) {
    if (this.audioEnPreview() === audio.id) { this.pararPreview(); return; }
    const client = this.auth.client; if (!client) return;
    this.pararPreview();
    const { data, error } = await client.storage.from('party-audio').createSignedUrl(audio.storage_path, 60);
    if (error || !data?.signedUrl) { this.error.set(mensajeDeError(error)); return; }
    this.reproductor.src = data.signedUrl; this.reproductor.currentTime = 0;
    try { await this.reproductor.play(); this.audioEnPreview.set(audio.id); this.detenerPreview = setTimeout(() => this.pararPreview(), 30_000); }
    catch { this.error.set('El navegador no pudo reproducir este audio.'); }
  }
  private pararPreview() { this.reproductor.pause(); this.reproductor.currentTime = 0; this.audioEnPreview.set(null); if (this.detenerPreview) clearTimeout(this.detenerPreview); this.detenerPreview = null; }
  ngOnDestroy() { this.pararPreview(); }
  mb(bytes: number) { return (bytes / MB).toFixed(bytes >= MB ? 1 : 2); }
  porcentaje(valor: number, limite: number) { return Math.min(100, (valor / limite) * 100); }
  private async dimensionesDe(file: File): Promise<{ ancho: number; alto: number } | null> {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensiones = { ancho: bitmap.width, alto: bitmap.height };
      bitmap.close();
      return dimensiones;
    } catch { return null; }
  }
}
