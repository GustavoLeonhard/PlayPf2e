import { Component, computed, inject, input, signal, type OnDestroy } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { PartyAudioFile } from '../../core/models/party.model';
import { AuthService } from '../../core/services/auth.service';

type Estado = { audio_id: string | null; playing: boolean; position_seconds: number; updated_at: string };

@Component({ selector: 'app-audio-panel', template: `
  <div class="audio">
    @if (actual(); as pista) { <strong>{{ pista.title }}</strong> }
    <div class="controles">@if (esGm()) { <button class="btn" [disabled]="!actual()" (click)="alternarLocal()">{{ localReproduciendo() ? 'Pausa' : '▶' }}</button> }<input type="range" min="0" max="1" step="0.05" [value]="volumen()" (input)="cambiarVolumen($any($event.target).value)" aria-label="Volumen local" /></div>
    @if (esGm()) { <div class="gm"><label>Audio <select [value]="estado().audio_id ?? ''" (change)="elegir($any($event.target).value)"><option value="">Sin audio</option>@for (a of audios(); track a.id) { <option [value]="a.id">{{a.title}}</option> }</select></label><button class="btn ghost" [disabled]="!actual()" (click)="alternarGm()">{{ estado().playing ? 'Pausar para todos' : 'Reproducir para todos' }}</button></div> }
  </div>
`, styles: `.audio{display:flex;flex-direction:column;gap:.55rem}.controles{display:flex;gap:.45rem;align-items:center}.controles input{flex:1}.gm{display:flex;flex-direction:column;gap:.45rem}.gm label{display:flex;justify-content:space-between;gap:.4rem}.audio p{margin:0}` })
export class AudioPanelComponent implements OnDestroy {
  readonly partyId=input.required<string>(); readonly esGm=input(false); private auth=inject(AuthService); private canal:RealtimeChannel|null=null; private audio=new Audio();
  readonly audios=signal<PartyAudioFile[]>([]); readonly estado=signal<Estado>({audio_id:null,playing:false,position_seconds:0,updated_at:new Date().toISOString()}); readonly habilitado=signal(false); readonly volumen=signal(.7); readonly localReproduciendo=signal(false);
  readonly actual=computed(()=>this.audios().find(a=>a.id===this.estado().audio_id)??null); private pistaCargada: string|null=null;
  ngOnInit(){void this.cargar();}
  async cargar(){const c=this.auth.client;if(!c)return;const [audios,estado]=await Promise.all([c.from('party_audio_files').select('*').eq('party_id',this.partyId()).order('created_at'),c.from('party_audio_state').select('*').eq('party_id',this.partyId()).maybeSingle()]);this.audios.set((audios.data??[]) as PartyAudioFile[]);if(estado.data)this.aplicar(estado.data as Estado);this.canal??=c.channel(`party-audio:${this.partyId()}`).on('postgres_changes',{event:'*',schema:'public',table:'party_audio_state',filter:`party_id=eq.${this.partyId()}`},p=>this.aplicar(p.new as Estado)).subscribe();}
  async habilitar(){this.habilitado.set(true);if(this.estado().playing)await this.reproducirEstado();}
  private posicion(){const e=this.estado();return e.playing?e.position_seconds+(Date.now()-new Date(e.updated_at).getTime())/1000:e.position_seconds;}
  private async prepararPista(){const a=this.actual(),c=this.auth.client;if(!a||!c||this.pistaCargada===a.id)return;const {data}=await c.storage.from('party-audio').createSignedUrl(a.storage_path,3600);if(!data?.signedUrl)return;this.audio.src=data.signedUrl;this.audio.load();this.pistaCargada=a.id;}
  private async reproducirEstado(){if(!this.habilitado()||!this.actual())return;if(this.pistaCargada!==this.actual()!.id){void this.prepararPista();return;}this.audio.currentTime=this.posicion();this.audio.volume=this.volumen();try{await this.audio.play();this.localReproduciendo.set(true);}catch{this.localReproduciendo.set(false);}}
  private aplicar(e:Estado){const cambio=e.audio_id!==this.estado().audio_id;this.estado.set(e);if(cambio){this.audio.pause();this.audio.src='';this.pistaCargada=null;this.localReproduciendo.set(false);void this.prepararPista();}if(e.playing&&this.habilitado())void this.reproducirEstado();if(!e.playing){this.audio.pause();this.localReproduciendo.set(false);}}
  async alternarLocal(){if(!this.habilitado())this.habilitado.set(true);if(this.localReproduciendo()){this.audio.pause();this.localReproduciendo.set(false);}else await this.reproducirEstado();}
  cambiarVolumen(v:string){this.volumen.set(Number(v));this.audio.volume=Number(v);if(!this.esGm()&&!this.habilitado()){this.habilitado.set(true);void this.reproducirEstado();}}
  async elegir(id:string){await this.publicar({audio_id:id||null,playing:false,position_seconds:0});await this.prepararPista();}
  async alternarGm(){if(!this.habilitado())this.habilitado.set(true);const playing=!this.estado().playing;await this.publicar({playing,position_seconds:playing?this.audio.currentTime:this.posicion()});if(playing)await this.reproducirEstado();else{this.audio.pause();this.localReproduciendo.set(false);}}
  private async publicar(cambios:Partial<Estado>){const c=this.auth.client,u=this.auth.userId();if(!c||!u||!this.esGm())return;const e={...this.estado(),...cambios,party_id:this.partyId(),author_id:u,updated_at:new Date().toISOString()};await c.from('party_audio_state').upsert(e);this.estado.set(e);}
  ngOnDestroy(){this.audio.pause();if(this.canal&&this.auth.client)void this.auth.client.removeChannel(this.canal);}
}
