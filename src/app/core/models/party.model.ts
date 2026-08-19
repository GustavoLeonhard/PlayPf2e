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
  characterName: string | null;
  /** Conectado ahora mismo, según la presencia. No se persiste. */
  online: boolean;
}

export interface Profile {
  id: string;
  display_name: string;
}
