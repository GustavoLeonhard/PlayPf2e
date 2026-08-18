/**
 * Importador de las condiciones de PF2e **Legacy** desde Archives of Nethys.
 *
 * Las condiciones NO estan en el dataset de Foundry legacy (verificado: el texto de
 * Grabbed no aparece en ningun pack), asi que su texto oficial se baja de AoN una vez
 * y queda versionado en `public/data/conditions.json`.
 *
 * CLAVE: el sufijo `&NoRedirect=1` es lo que evita que AoN redirija al Remaster.
 * El script ABORTA si una pagina no trae el banner "Legacy Content", para que no se
 * cuele texto remasterizado (ahi flat-footed pasa a llamarse off-guard).
 *
 * Se corre a mano:  npm run import:conditions
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'data');
const LAST_ID = 45;

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** El texto viene con enlaces a otras condiciones; se dejan como texto plano. */
const stripHtml = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function fetchCondition(id) {
  const res = await fetch(`https://2e.aonprd.com/Conditions.aspx?ID=${id}&NoRedirect=1`);
  if (!res.ok) return null;
  const html = await res.text();

  const name = html.match(/<h1 class="title"><a href="Conditions\.aspx\?ID=\d+">([^<]+)<\/a><\/h1>/)?.[1];
  if (!name) return null;

  if (!html.includes('legacy-content-warning')) {
    throw new Error(`La pagina de "${name}" (ID ${id}) NO es Legacy. Abortando para no mezclar ediciones.`);
  }

  const source = stripHtml(html.match(/<b>Source<\/b>.*?<i>([^<]+)<\/i>/s)?.[1] ?? '');
  const body = html.match(/<b>Source<\/b>.*?<br\s*\/?>(.*?)<\/span>/s)?.[1] ?? '';

  return { id: slugify(name), name, source, text: stripHtml(body) };
}

async function main() {
  const conditions = [];

  for (let id = 1; id <= LAST_ID; id++) {
    const condition = await fetchCondition(id);
    if (condition) {
      conditions.push(condition);
      console.log(`  ${String(id).padStart(2)}  ${condition.name.padEnd(20)} ${condition.source}`);
    }
    await new Promise((r) => setTimeout(r, 250)); // no martillar el sitio
  }

  // Las de Kingmaker son condiciones de ejercito (guerra masiva), no de personaje.
  const crb = conditions.filter((c) => c.source.startsWith('Core Rulebook'));
  crb.sort((a, b) => a.name.localeCompare(b.name));
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'conditions.json'), JSON.stringify(crb));
  console.log(`\n${crb.length} condiciones del CRB -> public/data/conditions.json`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
