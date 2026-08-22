# PF2e Builder (Legacy)

Creador y mantenedor de personajes de **Pathfinder 2e, reglas Legacy** (pre-remaster).
Proyecto personal, al estilo de pathbuilder2e.com pero acotado a crear un personaje y subirlo de nivel.

## Arranque rápido

```bash
npm install
npm run import   # genera public/data/ desde el dataset (ver abajo)
npm start
```

Sin configurar nada, la app entra en **modo local**: el login acepta cualquier mail y contraseña, y los
personajes se guardan en `localStorage`. Para usar la nube, creá un proyecto en Supabase, corré
`supabase/schema.sql` en su SQL Editor y pegá las credenciales en `src/environments/environment.ts`.

## Cómo está armado

Tres piezas separadas **en el tiempo**, no solo en el código:

1. **Importador** (`tools/import/import.mjs`) — se corre a mano. Lee el dataset Legacy y emite JSON
   normalizado en `public/data/`. No es parte de la app.
2. **Contenido de reglas** — JSON estático servido desde `public/data/`. Son ~11.000 items read-only
   que nunca se consultan por SQL, así que no viven en la base.
3. **App Angular** — todo el cálculo pasa acá. Supabase solo guarda usuarios y personajes.

### El dataset

Sale de [`dogstarrb/pf2e-legacy-content`](https://github.com/dogstarrb/pf2e-legacy-content), un módulo de
Foundry VTT que congela el contenido pre-remaster (sistema PF2e 5.9) con el **source JSON versionado**.
Se clona como `.data-source/` (ignorado por git):

```bash
git clone --depth 1 https://github.com/dogstarrb/pf2e-legacy-content.git .data-source
```

Se eligió sobre Archives of Nethys porque trae la mecánica estructurada, no prosa: la progresión de cada
clase viene como arrays (`classFeatLevels`, `skillIncreaseLevels`, …), así que "qué me toca elegir al
subir a nivel 7" es un `filter`, no una tabla escrita a mano.

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
