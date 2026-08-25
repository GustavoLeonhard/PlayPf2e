# PlayPf2e (Legacy)

Creador y mantenedor de personajes de **Pathfinder 2e, reglas Legacy** (pre-remaster), con una mesa de
juego para jugar en grupo. Proyecto personal, al estilo de pathbuilder2e.com.

Si venís a tocar el código, empezá por [Arquitectura](#arquitectura): explica de dónde salen los datos,
cuándo se generan, qué agregamos nosotros arriba y cuánto dura cada cosa.

## Arranque rápido

```bash
npm install
npm run import   # genera public/data/ desde el dataset (ver abajo)
npm start
```

Sin configurar nada, la app entra en **modo local**: el login acepta cualquier mail y contraseña, y los
personajes se guardan en `localStorage`. Para usar la nube, creá un proyecto en Supabase, corré
`supabase/schema.sql` en su SQL Editor y pegá las credenciales en `src/environments/environment.ts`.

## Arquitectura

### Las cuatro capas, y por qué están separadas en el tiempo

La separación importante de este proyecto no es entre carpetas: es entre **momentos**. Cada capa corre
en un momento distinto, y esa es la razón de que el resto funcione como funciona.

| Capa | Cuándo corre | Dónde vive | Quién la ejecuta |
|---|---|---|---|
| 1. Dataset fuente | Una vez, al clonar | `.data-source/` (fuera de git) | Vos, a mano |
| 2. Importador | Cuando cambia el dataset o el importador | `tools/import/` | `npm run import` |
| 3. Contenido generado | Se sirve estático, sin proceso | `public/data/` (**sí** en git) | El navegador |
| 4. App | En cada render | `src/app/` | Angular |

Nada de la capa 1 ni de la 2 forma parte de la aplicación. El importador es Node puro, no importa una
sola línea de Angular, y podés borrar `.data-source/` después de correrlo: la app arranca igual porque
lo generado está versionado. Esa es la única razón de que `npm install && npm start` funcione recién
clonado, sin bajar el módulo de Foundry.

### 1. De dónde salen los datos

**El grueso: [`dogstarrb/pf2e-legacy-content`](https://github.com/dogstarrb/pf2e-legacy-content).** Un
módulo de Foundry VTT que congela el contenido pre-remaster (sistema PF2e 5.9) con el source JSON
versionado, un archivo por ítem, en `packs/*-legacy/`.

```bash
git clone --depth 1 https://github.com/dogstarrb/pf2e-legacy-content.git .data-source
```

Se eligió sobre Archives of Nethys porque trae la **mecánica estructurada, no prosa**: la progresión de
cada clase viene como arrays (`classFeatLevels`, `skillIncreaseLevels`, …), así que "qué me toca elegir
al subir a nivel 7" es un `filter` y no una tabla escrita a mano. Y sobre todo trae los *rule elements*
de Foundry (`FlatModifier`, `GrantItem`, `ChoiceSet`, `ActiveEffectLike`), que son las reglas en forma
de dato: el motor las lee y las aplica sin que nosotros escribamos una línea por dote.

**Las condiciones: Archives of Nethys.** Las 42 condiciones no están en el dataset de Foundry
(verificado: el texto de *Grabbed* no aparece en ningún pack). `tools/import/conditions.mjs` las baja
una vez de AoN y quedan versionadas en `public/data/conditions.json`. El script **aborta** si una
página no trae el banner *"Legacy Content"*, para que no se cuele texto remasterizado. El procedimiento
para consultar AoN a mano está más abajo, en
[Consultar reglas en la web](#consultar-reglas-en-la-web-siempre-confirmar-que-sea-legacy).

**En tiempo de ejecución la app no consulta ninguna web de reglas.** Las URLs de AoN que aparecen en
`core/rules/*.ts` son citas de la fuente en los comentarios, no llamadas. Lo único que sale a la red
mientras usás la app es Supabase, y los propios JSON de `public/data/`.

### 2. Qué hace el importador

`tools/import/import.mjs` (`npm run import`) lee `.data-source/packs/*-legacy/`, normaliza y escribe
`public/data/`. No es una copia: es una traducción.

- **Aplana el modelo de Foundry** a lo que la hoja necesita: precio a cobre, `usage` a manos, `bulk` a
  número, `system.runes` a runas de verdad.
- **Resuelve los templates de Foundry a texto plano.** `@UUID[...]{Power Attack}` → `Power Attack`,
  `@Damage[1d6[bleed]]` → `1d6 bleed`. Los corchetes **anidan**, y ese detalle costó bugs reales: un
  patrón que corta en el primer `]` deja el otro suelto, que es por qué la runa Wounding decía "deal an
  extra ] damage".
- **Conserva los rule elements** tal cual, incluidos sus `predicate`. Es lo que el motor interpreta
  después.
- **Parte las descripciones.** Los cuatro packs pesados (`equipment`, `feats`, `spells`, `effects`)
  emiten dos archivos: `<pack>.json` con la mecánica y `<pack>-desc.json` con el texto, un objeto
  `{ id: html }`. El texto es más de la mitad del peso total.
- **Emite `manifest.json`** con la fecha de generación y el conteo y tamaño de cada pack. Es lo que
  permite ver de un vistazo si lo generado corresponde al dataset actual.

Lo generado hoy: **13.687 ítems** en 18 archivos.

| Pack | Ítems | Mecánica | Texto aparte |
|---|---:|---:|---:|
| equipment | 4.563 | 2,7 MB | 3,5 MB |
| feats | 4.238 | 1,6 MB | 2,0 MB |
| spells | 1.520 | 671 KB | 1,3 MB |
| effects | 1.418 | 599 KB | 530 KB |
| class-features | 553 | 672 KB | — |
| backgrounds | 389 | 451 KB | — |
| actions | 361 | 329 KB | — |
| deities | 275 | 435 KB | — |
| heritages | 230 | 144 KB | — |
| ancestries · ancestry-features · classes · conditions | 140 | 138 KB | — |

Una regla de trabajo que salió de la experiencia y conviene tener presente antes de tocar nada: **casi
siempre el dato ya estaba y no lo estábamos leyendo.** Runas, habilidades de herencia, dotes otorgadas,
capacidad de los contenedores, 116 modificadores de dotes y 355 reglas de proficiencia se "arreglaron"
corrigiendo el importador, no agregando datos.

### 3. Cómo la app toma los datos

Todo pasa por `core/services/content.service.ts`. Es un `HttpClient` con dos niveles de pereza.

**Nivel 1 — el pack.** `load(pack)` guarda la *promesa* en un `Map`, no el resultado. Dos componentes
que piden `equipment` a la vez comparten una sola descarga, y el pack se baja **una vez por sesión**.
Nunca se invalida: es contenido inmutable, cambia solo cuando vos volvés a correr el importador.

**Nivel 2 — el texto.** `asegurarDescripciones(pack)` baja `<pack>-desc.json` y **le pega el texto a los
objetos que ya están en memoria**, después sube un contador (`descripcionesListas`) que hace correr de
nuevo a los `computed` que lo usan. Se hizo así, y no cambiando los trece lugares que leen
`.description`, porque el que lee no tiene por qué saber que el texto viaja aparte.

Es deliberadamente *fire-and-forget*: nadie espera esa promesa. Abrir una ficha en el primer segundo
muestra los datos técnicos al instante y el texto entra encima cuando llega. Esa asincronía tiene una
trampa que ya nos mordió dos veces y conviene conocer:

> Si algo solo se muestra **cuando ya tiene texto**, y el texto solo se baja **cuando alguien lo abre**,
> entonces nunca se muestra y nunca se baja. Huevo y gallina. Por eso la ficha de un ítem existe si
> tiene *datos técnicos* **o** texto, y por eso la ficha abierta guarda la **clave**, no el objeto: si
> guardara el objeto, quedaría congelada en el instante del clic.

**El índice.** `index()` espera los once packs que el motor necesita y devuelve un `ContentIndex`: un
puñado de `Map` por id y por slug (`featById`, `equipmentById`, `featureById`, `actionById`, …). Se
arma una vez y el motor resuelve referencias en O(1) en vez de recorrer 4.563 objetos por consulta.

### 4. Cómo se busca en el dataset

`core/rules/buscar.ts`, cuarenta y nueve líneas, sin índice invertido ni librería. Un `filter` sobre el
array ya cargado alcanza y sobra para 4.563 ítems.

Busca **por nombre y por descripción**, con el nombre pesando más: los que coinciden por nombre van
primero y los que coinciden solo por texto después. Buscar solo por nombre obliga a saber cómo se llama
lo que buscás — escribir "firearm" y no encontrar nada, cuando hay treinta dotes que hablan de armas de
fuego, es la diferencia entre un catálogo y un índice. `coincidePorTexto` marca en la interfaz los que
entraron por el texto, para que se entienda por qué aparecieron.

**Consecuencia directa del punto anterior**: buscar por descripción solo funciona si el texto ya se
bajó. Quien ofrezca un buscador tiene que llamar antes a `asegurarDescripciones` de su pack.

### 5. Qué ponemos nosotros arriba de los datos

El dataset trae mecánica, pero no toda. Foundry resuelve una parte **en código**, no en los datos: de
los 1.418 efectos, 1.001 no traen ningún número. Eso que falta es nuestra capa propia, y hoy vive en
TypeScript dentro de `core/rules/`:

| Archivo | Qué agrega | Por qué no sale del pack |
|---|---|---|
| `runas.ts` | Potency, Striking, Resilient y el resumen de las de propiedad | El pack trae la runa, no su efecto |
| `rabia.ts` | +2 daño fijo, −1 CA sin tipo, HP temporales | El `Effect: Rage` solo trae los HP temporales |
| `panache.ts` | Garbo y su progresión | Los rule elements vienen con `value: null` |
| `efectos-a-mano.ts` | Los pocos efectos vacíos que sí sabemos calcular | Foundry los resuelve en código |
| `conditions.ts` | El efecto numérico de las condiciones | El texto viene de AoN; el número, de ningún lado |
| `spellcasting.ts` | Tablas de slots por clase | Progresiones que el pack no expresa |
| `prerequisites.ts` | Reconoce los patrones frecuentes de un texto libre | Los prerrequisitos son prosa |
| `tiradas.ts` | MAP, crítico, fatal, deadly | Reglas de tirada, no datos de ítem |

Y hay una segunda categoría, más chica: lo que **no existe en ningún pack**. Las descripciones de las
16 habilidades, la dureza y los HP de las armaduras, las estadísticas del Puño, el vínculo entre el
tipo de dragón y su daño.

Dos reglas de higiene sobre esta capa, y no son negociables:

1. **Cada número lleva su fuente citada en el comentario**, con fecha. Un efecto mal calculado es peor
   que uno no calculado, porque el número se ve igual de cierto.
2. **Crece de a uno.** Se agrega una regla cuando está confirmada contra la fuente Legacy del proyecto,
   no cuando parece obvia.

El plan a mediano plazo (ver [ROADMAP.md](ROADMAP.md), E3) es mover lo que es **dato** —tablas, valores,
descripciones faltantes— a un `overlay/` que el importador funda con el pack al generar `public/data/`,
y dejar en TypeScript solo lo que es **comportamiento**. Forkear el dataset entero está descartado: nos
casaría con mantener 13.000 ítems para agregarle campos a cincuenta.

### 6. El motor de cálculo

Una sola función pura, en `core/rules/character.engine.ts`:

```
computeCharacter(build, state, content) → CharacterSheet
```

Sin efectos de lado, sin servicios inyectados, sin `async`. Todo lo que la hoja muestra sale de ahí, y
por eso se puede testear contra el JSON real importado en vez de contra fixtures.

Se apoya en las dos decisiones detalladas más abajo: el personaje se guarda como **lista de elecciones**
y no como hoja calculada, y cada valor es una **lista de modificadores tipados** y no un entero.

Es también el punto caliente del proyecto: 1.974 líneas, con `computeCharacter` ocupando 1.049. Partirlo
es el ítem E1 del roadmap.

### 7. Tiempos de vida: qué dura cuánto, y dónde

Esto es lo que más confunde al entrar al código, porque hay seis duraciones distintas conviviendo.

| Qué | Dura | Dónde vive | Notas |
|---|---|---|---|
| **Contenido de reglas** | Para siempre | `public/data/`, en git | Cambia solo con `npm run import` |
| **Packs cargados** | La sesión del navegador | `Map` de promesas en `ContentService` | Una descarga por pack |
| **`build`** | Para siempre | `characters.build` (jsonb, `"v": 1`) | Ancestría, clase, boosts, dotes, inventario |
| **`state`** | Entre partidas | `characters.state` (jsonb) | HP, condiciones, efectos, slots, monedas, escudo |
| **Preferencias de interfaz** | Por navegador | `localStorage` | Acordeones y ventanas de la mesa, por PJ y por partida |
| **Estado de turno** | Hasta recargar | Signals del componente | La maniobra elegida (#1/#2/#3), la ficha abierta, la última tirada |

La línea entre `build` y `state` es la que más se piensa al agregar algo: **¿esto lo elegís una vez, o
cambia durante una aventura?** Los conjuros preparados van en `state` aunque parezcan una elección,
porque se rearman en cada descanso diario. El garbo va en `state` porque se pierde al terminar el
encuentro. La habilidad que promete una herencia va en `build`, y aparte de `trainedSkills`, porque hay
que recordar de dónde vino para subirla a experta en nivel 5.

Que `build` sea permanente es lo que hace que arreglar un bug de cálculo **arregle todos los personajes
existentes sin migrarlos**. Nada guarda un número calculado, así que nada queda viejo.

Lo efímero de turno no se persiste a propósito. Que la maniobra vuelva a #1 al recargar es correcto: es
información de un turno que ya terminó.

### 8. Persistencia y multijugador

Supabase guarda **seis tablas** y nada más: `characters`, `profiles`, `parties`, `party_members`,
`party_messages`, `party_notes`. El contenido de reglas nunca entra ahí — son ítems read-only que no se
consultan por SQL, y meterlos en una base solo agregaría latencia.

- **RLS en todo**, con funciones `security definer` (`is_party_member`, `is_party_gm`) para cortar la
  recursión de políticas que se miran entre sí.
- **Realtime** (`postgres_changes`) para el chat y las notas de la mesa.
- **Concurrencia optimista** en las notas: el update lleva `.eq('updated_at', <la que leíste>)`. Si
  nadie la tocó, afecta una fila; si alguien se adelantó, afecta cero y se avisa sin pisar nada. La
  primera versión comparaba en el cliente mirando eventos de Realtime, y eso solo cubría los
  milisegundos del debounce: dos personas editando un minuto se pisaban sin enterarse.
- **Modo local sin Supabase**: si no hay credenciales, el login acepta cualquier cosa y todo va a
  `localStorage`. Sirve para probar sin infraestructura.

### 9. El árbol de archivos

```
pf2e-builder/
├── tools/import/
│   ├── import.mjs            Node puro. Dataset Foundry → public/data/
│   └── conditions.mjs        Las 42 condiciones, desde AoN Legacy
├── public/data/              18 JSON generados y versionados. 13.687 ítems
├── supabase/schema.sql       6 tablas, RLS, funciones y triggers
└── src/app/
    ├── core/
    │   ├── models/           Los tipos: character, content, party
    │   ├── rules/            21 archivos de reglas + 2 de tests. El motor y la capa propia
    │   ├── services/         8 servicios: content, auth, character, party×3, profile, ventanas
    │   └── guards/
    ├── pages/
    │   ├── wizard/           Crear personaje
    │   ├── sheet/            La hoja. El otro punto caliente: 2.284 líneas
    │   ├── level-up/         Subir de nivel
    │   ├── mesa/             La mesa de juego: chat, PJ, dados, notas, ventanas
    │   ├── party/ party-list/ join/
    │   └── character-list/ login/ profile/
    └── shared/               Acordeón, selector de rango, ventana flotante, option-picker
```

### 10. Qué esperar al tocar cada cosa

- **Cambiar una regla de cálculo** → `core/rules/`, y un test en `character.engine.spec.ts` contra el
  JSON real. Los tests **no usan fixtures**: cargan `public/data/` de verdad, así que un cambio en el
  importador que rompa una suposición aparece como test rojo.
- **Un ítem sale mal** → mirá el importador antes que el dataset. Casi siempre el dato ya estaba.
- **Agregar un número que el pack no trae** → la capa propia, con la fuente citada y la fecha.
- **Agregar algo a la hoja** → decidí primero si es `build` o `state`. Es la decisión que después no se
  puede deshacer barato.

### 11. Cambiar el front (o reemplazarlo)

Hay dos cosas distintas acá, y conviene no mezclarlas.

#### Re-pintar: cambiar colores y proporciones

**Todo el color sale de tokens.** Hoy son 341 usos de `var(--…)` y **cero** colores
escritos a mano en componentes. Cambiando el bloque `:root` de
[`src/styles.scss`](src/styles.scss) se repinta la aplicación entera:

| Token | Qué es |
|---|---|
| `--bg` · `--surface` · `--surface-2` | Fondo, tarjetas, y el fondo de lo hundido |
| `--border` | Todos los marcos |
| `--text` · `--muted` | Texto normal y secundario |
| `--accent` · `--accent-strong` | Lo destacado y su estado activo |
| `--sobre-acento` | Texto **encima** del acento |
| `--danger` · `--ok` | Error y confirmación |
| `--favorito` | La estrella de favorito |
| `--sombra` | Sombra de lo que flota |
| `--radius` | Redondeo |

`--sobre-acento` y `--sombra` existen por un motivo concreto: si pintás el acento
de un color claro, un texto oscuro fijo encima queda ilegible, y una sombra negra
al 67% arruina un tema claro. Los dos eran hex fijos hasta que se tokenizaron.

**El tamaño general** lo manda una sola línea: el `font-size` de `body` en
`styles.scss`. Casi todo lo demás está en `rem`, así que ese número escala la app
completa.

Lo que **todavía no** es tema: tipografía y espaciado no tienen escala propia. La
familia tipográfica está en `body` y los espaciados son `rem` sueltos en cada
componente. Cambiar la fuente es una línea; cambiar el ritmo vertical, no.

#### Reemplazar el front entero

Acá está la buena noticia, y es de diseño, no de suerte:

| Capa | Líneas | ¿Sirve en otro framework? |
|---|---:|---|
| `core/rules/` | 6.956 | **Sí, tal cual.** Cero imports de Angular |
| `core/models/` | 732 | **Sí, tal cual.** Solo tipos |
| `core/services/` | 1.627 | No: usan `inject` y `signal`. Son finos (HTTP y Supabase) |
| `pages/` + `shared/` | 7.590 | No: son los componentes |

O sea que **el motor de reglas de PF2e —el trabajo difícil— ya es portable**.
`computeCharacter(build, state, content)` es una función pura sin dependencias:
se copia a un proyecto React, Vue o Svelte y anda. Lo mismo el dado, los
prerrequisitos, las runas y los efectos.

Lo que habría que reescribir son los servicios (finos) y los componentes, que es
justamente lo que un fork que quiere otro front va a reescribir igual.

#### Dónde está el HTML y el CSS

De los 20 componentes, **3 tienen plantilla y estilos en archivos aparte**
—`sheet`, `wizard` y `level-up`, que son los grandes— y **17 los llevan adentro
del `.ts`**, que son los chicos (los paneles de la mesa y los widgets
compartidos).

No está separado por vagancia: en un componente de 60 líneas, partirlo en tres
archivos hace más difícil leerlo, no más fácil. Si vas a reescribir el front, la
plantilla la vas a tirar igual; si vas a re-pintar, los tokens alcanzan sin abrir
un solo `.ts`.

## Dos decisiones que explican todo lo demás

**1. El personaje se guarda como lista de elecciones, no como hoja calculada.**
`build` (jsonb, versionado con `"v": 1`) tiene ancestría, clase, boosts y feats elegidos; la hoja se
recalcula siempre desde ahí. Si arreglás un bug de cálculo, todos los personajes existentes se arreglan
solos. `state` va aparte (HP actual, condiciones, hero points) porque cambia round a round.

**2. El motor devuelve listas de modificadores tipados, no enteros.**
Cada valor es `{ total, breakdown: [{ source, value, type }] }`. Eso da gratis el tooltip de "¿de dónde
sale este +11?", las reglas de stacking de PF2e (status/circumstance/item no acumulan: se toma el mayor
de cada tipo) y aplicar una condición como un modificador más.

## Validación: guiada pero permisiva

El sistema te dice qué elecciones te tocan en cada nivel, pero **no bloquea**. Lo que sí es determinista
se calcula siempre: HP, CA, salvaciones, percepción, habilidades, ataques y CD de clase.

Los prerrequisitos vienen como texto libre (`"Trained in Athletics"`), así que no se pueden evaluar en
general. Lo que sí se hace (`core/rules/prerequisites.ts`) es reconocer los patrones frecuentes:

| Patrón | Ejemplo |
|---|---|
| Proficiencia en skill o percepción | `Trained in Crafting`, `Expert in Perception` |
| Proficiencia en un Lore concreto | `Trained in Hunting Lore` |
| Valor de atributo | `Strength 14` |
| Nivel | `level 5` |
| Nombre de otra dote | `Power Attack` |

Cada advertencia queda en uno de tres estados: **cumplido** (no se muestra), **no se cumple** o **sin
verificar** (el texto no se reconoció). Las dos últimas se muestran, y el usuario puede marcarlas como
resueltas: eso se guarda en `build.acknowledgedWarnings` y se puede revertir.

## Alcance actual

Las 23 clases pre-remaster están importadas y se pueden elegir. El builder está pensado en tres olas:

- **Ola 1 (hecha)** — marciales: Fighter, Barbarian, Rogue, Monk, Ranger, Champion, Gunslinger.
- **Ola 2 (hecha)** — 10 de las 11 clases lanzadoras: Sorcerer, Bard, Oracle y Psychic
  (espontáneas) más Wizard, Cleric, Druid, Witch y Magus (preparadas).
- **Ola 3** — Summoner (necesita el eidolon), Alchemist y Kineticist. Los focus spells ya están.

Desde entonces se sumó **la mesa**: partidas, chat con tiradas en vivo, ventanas y notas
compartidas. Ver [ROADMAP.md](ROADMAP.md).

### Conjuros

Hay dos ejes, y las clases combinan uno de cada uno:

| Eje | Valores |
|---|---|
| Cómo se llena el slot | **espontáneo** (Sorcerer, Bard, Oracle, Psychic) · **preparado** (Wizard, Cleric, Druid, Witch, Magus) |
| De dónde salen los hechizos | **repertorio** fijo · **libro** propio (Wizard, Witch, Magus) · **toda la lista** (Cleric, Druid) |
| Cuántos slots por rango | **limited** 2 (Magus, Psychic) · **standard** 3 · **sorcerer** 4 |

El repertorio y el libro son permanentes y viven en `build`. Lo que se prepara cada día vive en
`state.preparedSpells`, y el botón de descanso diario lo vacía y recupera los slots.

Común a todos: cantrips, ataque y CD de conjuro, consumo de slots, y tirada que muestra
ataque + daño + cuánto sería el crítico.

La tradición sale del dato: el Bard es siempre occult y el Sorcerer la hereda del linaje, que la declara
en su prosa (`Spell List arcane`) y el importador extrae — los 17 linajes matchean.

**La tabla de slots es la única regla hardcodeada de todo el proyecto** (`core/rules/spellcasting.ts`).
Foundry la calcula en el código de su sistema, no en los datos: el campo `spellcasting` de la clase es
apenas un flag. Bard 2→3 slots por rango, Sorcerer 3→4, rango 10 recién a nivel 19 y con un solo slot.

El daño escala con el `heightening` del dataset: Fireball lanzado a rango 5 tira 10d6.

**Signature spells**: un lanzador espontáneo tiene el repertorio clavado — un hechizo se lanza al rango
con el que lo aprendiste. La excepción son los signature spells, uno por rango, que se pueden heightear
a cualquier rango que puedas pagar. El rasgo llega a **nivel 3** (sale del dataset, no está hardcodeado),
y hasta entonces la hoja no ofrece elegirlos. Se marcan con la estrella en la lista de conjuros, y los
botones de rango que aparecen al lado lanzan a ese rango.

## Consultar reglas en la web: siempre confirmar que sea Legacy

Archives of Nethys **redirige al Remaster por defecto**. Para la versión Legacy hay que usar el sufijo
`&NoRedirect=1` y confirmar que la página muestre el banner *"Legacy Content"* y cite el **Core
Rulebook** (no Player Core):

| Página | URL Legacy |
|---|---|
| Sorcerer | `2e.aonprd.com/Classes.aspx?ID=11&NoRedirect=1` |
| Bard | `2e.aonprd.com/Classes.aspx?ID=3&NoRedirect=1` |
| Condiciones | `2e.aonprd.com/Conditions.aspx?ID=<n>&NoRedirect=1` |

Así se verificaron la tabla de slots y las 13 condiciones de `core/rules/conditions.ts`, punto por punto.

**Ojo con los nombres**: varios términos cambiaron en el Remaster. El más común es
*flat-footed* (Legacy) → *off-guard* (Remaster). Este proyecto usa los nombres Legacy.

### Condiciones

Las condiciones **no están en el dataset de Foundry** (verificado: el texto de Grabbed no aparece en
ningún pack). Se bajan de AoN con `npm run import:conditions`, que guarda las 42 del Core Rulebook con
su texto oficial en `public/data/conditions.json`. El script **aborta** si alguna página no trae el
banner *"Legacy Content"*, así no se cuela texto remasterizado.

Están separadas en dos capas:

- **El texto oficial** viene del import y es lo que se muestra en la hoja.
- **El efecto mecánico** (a qué números afecta) está escrito a mano en `core/rules/conditions.ts`, y
  solo cubre las que mueven números. Las otras se pueden marcar igual y aparecen con la etiqueta
  *"solo texto"*.

Un test verifica que los ids de las dos capas coincidan.

### Iniciativa

No hay un "modificador de iniciativa": se tira **Percepción** con su modificador completo, o
**cualquier habilidad** si lo que venías haciendo lo justifica — es lista abierta y la decide el
máster. La hoja tiene un selector con Percepción, las 16 habilidades y tus Lores.

Los bonus **generales** a la iniciativa se aplican siempre; los que dicen *"Perception checks for
initiative"* solo cuando tirás con Percepción. Esa diferencia sale del `predicate` del dataset.

Y como es un chequeo, las condiciones que penalizan tiradas también le pegan.

### Armadura y escudo

La **armadura** aporta su bonus a la CA, con el tope de Destreza que corresponda; la penalidad de
chequeos solo se aplica si no llegás al requisito de Fuerza, y la de velocidad se descuenta.

El **escudo** es aparte: su bonus a la CA solo cuenta mientras esté **alzado** (Raise a Shield es una
acción), y entra como bonus de **circunstancia**, no de objeto. Se le trackean los HP: **Shield Block**
absorbe daño hasta su *hardness* y el resto se lo llevan el escudo y vos. Cuando los HP bajan al
**Broken Threshold** (la mitad), queda roto y deja de dar CA aunque siga alzado.

`hardness` y `HP` salen del dataset (Steel Shield: +2, hardness 5, 20 HP, BT 10 — coincide con la
tabla que el propio dataset trae en la descripción).

### Inventario

Se maneja desde la hoja, no solo al crear: agregar, quitar, cantidad, equipar, comprar (descuenta de
la bolsa), agregar sin pagar y vender a mitad de precio. El **bulk** se suma y se compara contra el
límite de carga —hasta 5 + Fuerza sin penalidad, máximo 10 + Fuerza— verificado en
[AoN Legacy](https://2e.aonprd.com/Rules.aspx?ID=188&NoRedirect=1).

También se pueden agregar **objetos que no existen en el catálogo** (la cuerda élfica que te dio tu
máster): nombre, bulk y notas. Internamente son un item con id `inventado:<uuid>` cuyo contenido sale
enteramente del propio personaje. Es el mismo mecanismo que las armas personalizadas.

**Dónde vive**: el inventario está en `build`, junto a las elecciones, porque **define números** —la
CA sale de la armadura equipada y los ataques de las armas—. `build` es "lo que define la hoja", no
"lo que nunca cambia"; los recursos que se gastan (HP, monedas, slots) viven en `state`.

### Dinero

Al crear el personaje hay un presupuesto de **15 gp** y el paso de equipo muestra cuánto llevás
gastado y cuánto te queda. Lo que sobra pasa a ser la bolsa del personaje, que después se ajusta a
mano desde la hoja (comprar en juego no descuenta solo).

Todo se calcula en cobre para no arrastrar redondeos, y se muestra sin platino: en la mesa nadie
dice "1 pp 5 gp", dice "15 gp".

**Nota de verificación**: los 15 gp salen de [Step 8: Buy Equipment](https://2e.aonprd.com/Rules.aspx?ID=2038),
que es la página del Remaster. No encontré una equivalente con banner Legacy; el valor no cambió
entre ediciones, pero es el único número del proyecto sin fuente marcada como Legacy.

### Idiomas

Cupo = modificador de Inteligencia (si es positivo) más los extra de la ancestría; los que da la
ancestría no ocupan cupo. La lista Legacy (11 comunes + 11 poco comunes) está verificada en
[AoN Legacy](https://2e.aonprd.com/Rules.aspx?ID=131&NoRedirect=1) — **no sale del dataset**, que
solo declara los idiomas que otorga cada ancestría.

Se puede **escribir un idioma inventado por el máster**: se guarda tal cual, ocupa un cupo y en la
hoja aparece junto a los demás. No hay lista cerrada.

### Focus spells

Van en su propio bloque, **independiente de los slots**: un Monk o un Champion tienen focus spells
sin lanzar conjuros comunes.

El pool es la cantidad que conocés con tope de 3; lanzar cuesta un punto, Refocus devuelve uno y el
descanso diario los devuelve todos. Se heightean solos a la mitad del nivel.

**En el dataset ninguna fuente los otorga estructuradamente** (ningún `GrantItem` resuelve a un
hechizo). Los linajes de sorcerer sí los nombran en su texto, y el importador los extrae para
sugerirlos con ★; el resto se elige a mano de los focus spells de tu clase.

### Elecciones de rasgos, resueltas con datos

La vía del Gunslinger, el instinct del Barbarian, el racket del Rogue y la doctrine del Cleric son todas
el mismo mecanismo: el rasgo declara un `ChoiceSet` con un filtro por tag (`item:tag:gunslinger-way`) y
las opciones son los items que llevan ese tag. No hay ninguna tabla escrita a mano, así que las ~90
elecciones del dataset funcionan sin código nuevo por clase.

Lo que la elección otorga (`GrantItem`) se resuelve contra rasgos, dotes **y acciones** — los deeds de las
vías viven en el pack de acciones.

### Arquetipos y multiclase

Una **dedication** se toma por el slot de dote de clase y trae consigo lo que otorga: Alchemist
Dedication, por ejemplo, agrega Infused Reagents (rasgo de clase), Alchemical Crafting (dote) y la
proficiencia en bombas alquímicas.

El dataset no tiene un campo "a qué arquetipo pertenece esta dote": la pertenencia está en el
prerrequisito, que nombra la dedication. Con eso alcanza para filtrar — las dedications siempre se
ofrecen, y las ~1150 dotes de arquetipo solo aparecen si ya tenés la dedication que piden.

Lo que **no** se aplica es la regla de "no podés tomar otra dedication hasta tener dos dotes más de este
arquetipo": es una restricción, y el diseño es permisivo.

### Deidad y alineamiento

El **alineamiento** es una lista fija de 9: es una regla universal de Legacy, y el Remaster la
eliminó. El personaje lo elige en el wizard.

La **deidad** sale del dataset (275 importadas). Cleric y Champion la necesitan; para el resto es
opcional. El efecto mecánico que ya funciona: un Cleric queda **entrenado en el arma favorita de
su deidad**, porque la clase declara `otherAttackProficiency: "Deity's favored weapon"` y esa
clave se resuelve a `weapon:<slug>` recién cuando hay deidad elegida.

**Ojo con el dato**: las deidades del pack "legacy" están *parcialmente remasterizadas* — traen
`sanctification` (holy/unholy, concepto del Remaster) y no el alineamiento Legacy de cada deidad.
Por eso el alineamiento del personaje se maneja aparte, como lista fija.

### Armas: 779 del dataset, más las del máster

El dataset trae **779 armas** (254 simples, 467 marciales, 55 avanzadas, 3 desarmadas) en 17 grupos,
con dados y tipo de daño, traits, alcance, recarga, precio y bulk. También 143 escudos y 134 armaduras.
No hay que cargar nada a mano.

Para el homebrew, una arma personalizada **no es un arma nueva**: son las diferencias respecto de una
del dataset, guardadas en el item del inventario (`build.inventory[].custom`). Se puede cambiar nombre,
dados, tipo de daño, bonus de ataque y daño, y traits; más un campo de **notas libres**.

Tres decisiones detrás de eso:

- **Vive en el personaje, no en una biblioteca aparte.** Es una elección suya, como cualquier otra del
  `build`; y una hoja quiere una foto de lo que tiene, no un enlace que el máster pueda cambiar por
  debajo tres sesiones después.
- **Los bonus entran al pipeline como bonus de objeto**, igual que una runa de potencia: aparecen en el
  breakdown con el nombre del arma y respetan el stacking.
- **`notes` es la válvula de escape.** Lo que la app no puede calcular ("una vez por día, deslumbra al
  impactar") se escribe ahí y se muestra en la hoja. No se calcula, pero no se pierde.

El `custom` guarda además una **foto del arma base**, así el arma sobrevive aunque se pierda la
referencia al dataset (por ejemplo, si una reimportación cambia los ids).

### Críticos: fatal y deadly

Los dados que cambian en un crítico **no son un campo aparte: son traits del arma**, y el dataset ya
los trae (67 armas con `fatal`, 76 con `deadly`). Por eso el editor de armas personalizadas no tiene
un campo propio: se escriben en el campo de traits, igual que `finesse` o `reach`.

Texto verificado en la lista **Legacy** de weapon traits (Roll20 compendium, *Weapon Traits (Legacy)*,
Free Basic Rules — AoN no publica los traits de arma en sus páginas Legacy):

- **deadly dX** — en un crítico se suma un dado de dX, tirado *después* de duplicar el daño.
- **fatal dX** — en un crítico el dado del arma pasa a dX y se suma un dado extra de dX.

En los dos casos el dado extra **no se duplica**. Al tirar un arma, la hoja muestra el daño normal y
el que sería crítico, con la cuenta desglosada:

```
FLINTLOCK PISTOL  20   d20 (8) +12
5 de daño piercing   (1d4 (4) +1 · crítico con fatal d8: (5+1) ×2 + 8 del dado extra)
crítico: 20
```

**No modelado**: `deadly` sube a dos o tres dados con runas *greater/major striking*, y las runas no
están implementadas. `fatal-aim` se trata como `fatal` (la diferencia es empuñar el arma a dos manos).

Lo que **no** se puede hacer: crear un arma desde cero sin partir de una existente, ni efectos
activables, cargas diarias o runas propias. Eso sería un motor de reglas homebrew.

### Limitaciones conocidas

La lista viva está en [ROADMAP.md](ROADMAP.md). Las que más se notan al usar la app:

- **Proficiencia por grupo de arma elegido.** El rule element `MartialProficiency` con predicado —el que
  usa Fighter Weapon Mastery para subir solo el grupo que elegiste— no se modela. Las proficiencias con
  nombre propio del dataset (`simple-firearms-crossbows` del Gunslinger) **sí** funcionan.
- El crítico duplica el daño entero. En PF2e el daño de salpicadura (Acid Splash) no se duplica.
- Lanzar **no descuenta el slot automáticamente**: el consumo es manual, con el botón "gastar".
- El heightening que **no es daño** no se modela: Magic Missile agrega proyectiles y el dataset no lo
  expresa como fórmula, así que su daño no cambia al subirlo de rango.
- Hay **72 elecciones** que el pack describe con un filtro sobre otro pack entero ("una dote general de
  nivel 7 o menos"): se avisan, pero la app todavía no puede ofrecer la lista.
- Las **stances** y las runas de propiedad con bonus pasivo se listan pero no se calculan.


## Comandos

```bash
npm start        # dev server en :4200
npm test         # vitest
npm run build    # build de producción
npm run import   # regenera public/data/ desde .data-source/
```
