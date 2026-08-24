/**
 * Da la sala de video de una partida, y un token para entrar.
 *
 * POR QUÉ EXISTE: la clave de Daily crea salas y tokens y genera consumo
 * facturable. Si viviera en el front, cualquiera que abriera el inspector
 * podría crear salas en la cuenta. Así que vive acá, como secreto del proyecto
 * (`supabase secrets set DAILY_API_KEY=...`), y el navegador nunca la ve.
 *
 * QUÉ AGREGA sobre el script `tools/daily/sala.mjs`:
 *
 * 1. La sala es **privada**. Sin token no se entra, así que conocer la URL ya
 *    no alcanza. Con el script, la sala es pública y quien tenga el link entra
 *    para siempre, aunque rotes el token de invitación de la mesa.
 * 2. La sala **se crea sola** la primera vez que alguien de esa mesa entra al
 *    canal. Con el script hay que correr un comando por mesa nueva.
 *
 * QUIÉN PUEDE PEDIRLA: se usa el JWT de quien llama para consultar `parties`
 * con SUS permisos. Si la política `veo mis partidas` no lo deja leer la fila,
 * no es de la mesa y no hay token. La autorización es la misma RLS que ya
 * gobierna todo lo demás; no se reimplementa acá.
 *
 * Desplegar:
 *   npx supabase login
 *   npx supabase link --project-ref qciklhvsjhjyypihodwo
 *   npx supabase secrets set DAILY_API_KEY=<la clave>
 *   npx supabase functions deploy daily-sala
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DAILY = 'https://api.daily.co/v1';

/*
 * `supabase-js` no manda solo el Authorization: agrega `apikey` y
 * `x-client-info` en cada llamada. Si el preflight no los permite, el navegador
 * corta la request antes de que salga y `functions.invoke` falla sin decir por
 * qué. Cuesta ver porque el error aparece del lado del cliente, no en los logs
 * de la función: la función nunca se enteró de que la llamaron.
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** El nombre de la sala. Tiene que dar igual que en `tools/daily/sala.mjs`. */
const nombreDeSala = (inviteToken: string) => `pf2e-${inviteToken}`;

async function daily(ruta: string, key: string, init: RequestInit = {}) {
  const r = await fetch(`${DAILY}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const key = Deno.env.get('DAILY_API_KEY');
  if (!key) return json({ error: 'Falta el secreto DAILY_API_KEY' }, 500);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Sin credenciales' }, 401);

  const { partyId } = await req.json().catch(() => ({ partyId: null }));
  if (!partyId) return json({ error: 'Falta partyId' }, 400);

  /*
   * Con el JWT del que llama, NO con la service role: así la consulta pasa por
   * RLS y la respuesta misma es la autorización. Usar la service role acá
   * obligaría a reescribir a mano quién puede entrar a qué mesa, y esa regla ya
   * está escrita una vez en las políticas.
   */
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: usuario } = await supabase.auth.getUser();
  const userId = usuario?.user?.id;
  if (!userId) return json({ error: 'Sesión inválida' }, 401);

  const { data: party } = await supabase
    .from('parties')
    .select('id, invite_token')
    .eq('id', partyId)
    .maybeSingle();

  // Sin fila no hay diferencia entre "no existe" y "no sos de esta mesa", y
  // está bien que no la haya: no queremos confirmarle a nadie qué mesas hay.
  if (!party) return json({ error: 'No sos de esta mesa' }, 403);

  const name = nombreDeSala(party.invite_token);

  const propiedades = {
    enable_chat: false, // el chat es el nuestro
    enable_screenshare: true,
    start_video_off: true,
    start_audio_off: true,
  };

  let sala = await daily(`/rooms/${name}`, key);

  if (sala.status === 404) {
    sala = await daily('/rooms', key, {
      method: 'POST',
      body: JSON.stringify({ name, privacy: 'private', properties: propiedades }),
    });
  } else if (sala.status === 200 && sala.body.privacy !== 'private') {
    /*
     * La sala existía pública: la crearon con `tools/daily/sala.mjs`, que es el
     * camino de antes de que existiera esta función. Se cierra acá y no en una
     * migración a mano porque si no, una mesa vieja se queda pública para
     * siempre y nadie se entera: la función devuelve token igual y todo parece
     * en orden.
     */
    sala = await daily(`/rooms/${name}`, key, {
      method: 'POST',
      body: JSON.stringify({ privacy: 'private' }),
    });
  }

  if (sala.status >= 300) return json({ error: 'No se pudo preparar la sala' }, 502);

  /*
   * El token dura cuatro horas: una sesión de juego larga entra entera, y si se
   * filtra deja de servir esa misma noche. `user_name` es el id de Supabase
   * porque es como el front sabe qué cara corresponde a qué miembro.
   */
  const token = await daily('/meeting-tokens', key, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: name,
        user_name: userId,
        exp: Math.floor(Date.now() / 1000) + 4 * 60 * 60,
      },
    }),
  });
  if (token.status >= 300) return json({ error: 'No se pudo firmar el token' }, 502);

  return json({ url: sala.body.url, token: token.body.token });
});
