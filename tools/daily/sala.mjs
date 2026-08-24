/**
 * Crea (o confirma) la sala de video de una partida.
 *
 * Se corre a mano, con la clave de Daily leída de `.env`:
 *   node tools/daily/sala.mjs <invite_token de la partida>
 *
 * POR QUÉ UN SCRIPT Y NO LA APP: la clave de Daily es de servidor. Crea salas
 * y tokens y genera consumo facturable, así que no puede viajar al navegador.
 * Mientras no exista la Edge Function (ver supabase/functions/daily-token/),
 * las salas se crean desde acá, una vez por mesa.
 *
 * LA SALA ES PÚBLICA, y eso es una decisión con costo: cualquiera que conozca
 * la URL entra. El nombre sale del `invite_token` de la partida, que es un uuid
 * random, así que adivinarla es tan difícil como adivinar el link de invitación
 * — el mismo modelo de seguridad que ya tiene la mesa. La diferencia con la
 * Edge Function es que rotar el token de invitación NO echa a nadie de la sala
 * de video, porque la sala vieja sigue existiendo.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** El nombre de la sala de una partida. Tiene que dar igual acá que en el front. */
export const nombreDeSala = (inviteToken) => `pf2e-${inviteToken}`;

async function clave() {
  const env = await readFile(join(ROOT, '.env'), 'utf8');
  const found = env.match(/^DAILY_API_KEY=(.+)$/m);
  if (!found) throw new Error('Falta DAILY_API_KEY en .env (copiá .env.example)');
  return found[1].trim();
}

async function api(ruta, key, opciones = {}) {
  const r = await fetch(`https://api.daily.co/v1${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opciones.headers },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function main() {
  const token = process.argv[2];
  if (!token) {
    console.error('Uso: node tools/daily/sala.mjs <invite_token de la partida>');
    process.exit(1);
  }

  const key = await clave();
  const name = nombreDeSala(token);

  const existe = await api(`/rooms/${name}`, key);
  if (existe.status === 200) {
    console.log(`Ya existía: ${existe.body.url}`);
    return;
  }

  const creada = await api('/rooms', key, {
    method: 'POST',
    body: JSON.stringify({
      name,
      privacy: 'public',
      properties: {
        // Sin fecha de vencimiento: la mesa dura lo que dure la campaña.
        enable_chat: false, // el chat es el nuestro, no el de Daily
        enable_screenshare: true,
        start_video_off: true, // entrás con la cámara apagada y la prendés vos
        start_audio_off: false,
        // Nadie "dueño" de la sala: no hay moderación, es una mesa entre amigos.
        eject_at_room_exp: false,
      },
    }),
  });

  if (creada.status >= 300) {
    console.error('No se pudo crear:', creada.status, JSON.stringify(creada.body));
    process.exit(1);
  }
  console.log(`Creada: ${creada.body.url}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
