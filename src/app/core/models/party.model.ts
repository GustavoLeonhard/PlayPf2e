/**
 * La partida es un grupo, no una sesión de juego.
 *
 * No existe "empezar": el GM la crea, comparte el link y cada uno entra cuando
 * quiere. Quién está jugando ahora mismo lo dice la presencia de Realtime, que
 * es efímera y no se guarda en ningún lado.
 */

export interface Party {
  id: string;
  name: string;
  gm_id: string;
  /** El token del link de invitación. Solo lo ve quien ya está en la mesa. */
  invite_token: string;
  created_at?: string;
}

export type PartyRole = 'gm' | 'player';

export interface PartyMember {
  party_id: string;
  user_id: string;
  role: PartyRole;
  /** Con qué personaje se sentó. Null si todavía no eligió. */
  character_id: string | null;
  joined_at?: string;
}

/** Un miembro con lo que hace falta para mostrarlo: su nombre y el de su PJ. */
export interface PartyMemberView extends PartyMember {
  displayName: string;
  /** Data URL del avatar del perfil, o '' si no cargó ninguno. */
  avatar: string;
  characterName: string | null;
  /** Conectado ahora mismo, según la presencia. No se persiste. */
  online: boolean;
}

export interface Profile {
  id: string;
  display_name: string;
  /** Data URL, o '' si no cargó ninguno. Es público entre autenticados. */
  avatar: string;
}

/**
 * Un mensaje de la mesa.
 *
 * El chat y las tiradas son lo mismo con distinto contenido: van en la misma
 * tabla para que queden ordenados entre sí sin cruzar dos consultas.
 */
export interface PartyMessage {
  id: string;
  party_id: string;
  author_id: string;
  kind: 'texto' | 'tirada';
  body: string;
  /** El RollResult completo, para poder pintarlo igual que en la hoja. */
  roll: RollPayload | null;
  visibility: 'todos' | 'master' | 'yo';
  created_at: string;
}

/**
 * La tirada tal como se guarda.
 *
 * Es una copia del RollResult de la hoja, no una referencia: si mañana cambia
 * el cálculo, lo que quedó en el historial tiene que seguir diciendo lo que
 * dijo esa noche.
 */
export interface RollPayload {
  /**
   * Con qué personaje se tiró.
   *
   * Va COPIADO en la tirada y no se busca al pintar. No es solo por coherencia
   * con el resto del payload: la política de `characters` es de lectura propia,
   * así que el nombre del PJ de otro jugador es ilegible desde tu sesión. Si el
   * chat lo resolviera al mostrar, verías el tuyo y de los demás nada.
   */
  pj?: string;
  label: string;
  die: number;
  modifier: number;
  total: number;
  crit: 'success' | 'failure' | null;
  damage?: { detail: string; total: number; critical: number; criticalDetail: string; type: string };
  dc?: number;
  save?: string;
  /**
   * El desglose de una tirada suelta (un d20 pelado, un 2d6+3).
   *
   * Va aparte de `save`: meterlo ahí "porque el hueco estaba libre" hacía que
   * el chat la tratara como una salvación y no mostrara el total.
   */
  detalle?: string;
}

/** Un mensaje con quién lo escribió, listo para mostrar. */
export interface PartyMessageView extends PartyMessage {
  authorName: string;
  authorAvatar: string;
  mine: boolean;
}

/**
 * Una nota de la mesa.
 *
 * Compartida: la ve y la edita cualquiera de la partida. El título es para
 * encontrarla —va en el tooltip de su icono— y el cuerpo es texto libre.
 */
export interface PartyNote {
  id: string;
  party_id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** Un fondo compartido de la mesa; el archivo vive en Storage, no en la fila. */
export interface PartyScene {
  id: string;
  party_id: string;
  author_id: string;
  title: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
}

/** Un archivo de audio que el GM dejó disponible para su mesa. */
export interface PartyAudioFile {
  id: string;
  party_id: string;
  author_id: string;
  title: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
}
