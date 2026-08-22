# Bitácora

El registro de qué se hizo y **por qué se hizo así**: las decisiones de diseño,
las reglas verificadas contra la fuente, y los bugs que costaron encontrarse con
la explicación de qué los causaba.

Se lee de arriba hacia abajo en orden cronológico. No es la lista de pendientes
—esa está en [ROADMAP.md](ROADMAP.md)— sino la memoria del proyecto: sirve para
no volver a discutir algo ya resuelto, y para entender por qué una pieza está
hecha de una forma que a primera vista parece rara.

Los títulos con números romanos (4-bis, 4-ter, 4-vicies…) son el orden en que
fueron pasando las cosas, no una jerarquía.

---

## Estado actual

**Completo** para personajes marciales (Fighter, Barbarian, Rogue, Monk, Ranger, Champion,
Gunslinger, Swashbuckler, Investigator, Thaumaturge, Inventor): creación de nivel 1 a 20,
hoja con breakdown y tiradas, condiciones, arquetipos y multiclase.

**Completo** para lanzadores espontáneos: Sorcerer y Bard (repertorio, cantrips, slots,
signature spells, heightening, tirada de ataque + daño + crítico).

Ver el README para el detalle de cómo funciona cada pieza.

## Pasos siguientes, en orden

### 1. Deidad y alineamiento  ✅ HECHO

- [x] Importar deidades (275, con dominios, divine font, arma favorita, skill y attribute)
- [x] `build.deity` y `build.alignment`
- [x] Paso en el wizard (los 9 alineamientos + selector de deidad, marcado como obligatorio
      para Cleric y Champion)
- [x] Cleric entrenado en el arma favorita de su deidad
- [x] Deidad, dominios y divine font en la hoja

Cómo funciona lo del arma favorita: la clase Cleric declara
`otherAttackProficiency: { name: "Deity's favored weapon", rank: 1 }`. Esa clave no significa
nada hasta que hay deidad; con la deidad elegida se convierte en `weapon:<slug>`, y
`attackProficiencyKeys()` la busca primero, antes que la categoría del arma.

**Falta de este bloque**: la elección de dominios del Cleric (elige 1-2 de los de su deidad) y
la causa del Champion (que además depende del alineamiento).

**Ojo con los datos**: las deidades del pack legacy están *parcialmente remasterizadas* — traen
`sanctification` (holy/unholy), que es el concepto del Remaster, en vez del alineamiento Legacy.
El alineamiento del personaje se maneja como lista fija de 9; si hiciera falta el alineamiento
*de cada deidad*, hay que sacarlo de AoN legacy con un importador aparte.

### 2. Lanzadores preparados  ✅ HECHO para Wizard, Cleric y Druid

**Corrección al roadmap original**: Oracle, Psychic y Summoner NO son preparados, son
espontáneos (verificado en el dataset). Los preparados son Wizard, Cleric, Druid, Witch y Magus.

Hecho:
- [x] `CASTERS` con dos ejes: cómo se llenan los slots (`spontaneous`/`prepared`) y de dónde
      salen los hechizos (`repertoire`/`spellbook`/`list`)
- [x] Wizard: libro de hechizos en el `build` (10 cantrips + 5 de rango 1, +2 por nivel)
- [x] Cleric y Druid: preparan de toda su lista, sin repertorio ni libro
- [x] Cleric: divine font (1 + Carisma slots extra de heal/harm al rango más alto)
- [x] Preparación diaria en `state.preparedSpells` + botón de descanso diario
- [x] Lanzar desde un slot preparado

También hecho (segunda pasada), todo verificado en AoN Legacy:

| Clase | ID legacy | Tipo | Tradición | Slots | Cantrips |
|---|---|---|---|---|---|
| Oracle | 14 | espontáneo, repertorio | divina | 2→3 | 5 |
| Witch | 16 | preparado, libro del familiar | del patrón | 2→3 | 10 (libro) |
| Magus | 17 | preparado, libro | arcana | **1→2** | 8 (libro) |
| Psychic | 21 | espontáneo, repertorio | oculta | **1→2** | **3** |

- [x] Tercer tipo de lanzador: `limited` (2 slots máximo), que además **no llega al rango 10**
- [x] Divine font: los slots extra solo ofrecen *heal* o *harm*
- [x] Escuela arcana del Wizard (se elige sola por tags) y su slot extra por rango

Pendiente de este bloque:
- **Summoner**: su tradición sale del eidolon, y los eidolons son un subsistema entero
  (estadísticas propias, acciones, evolución). Es lo único que quedó afuera a propósito.
- El slot extra de la escuela arcana **se informa pero no se agrega** a la grilla de slots,
  y no filtra por escuela.
- Magus (Spellstrike) y Psychic (psi cantrips y amps) tienen mecánicas propias sin modelar.

### 3. Focus spells  ✅ HECHO

Reglas verificadas en la página **Legacy** de Roll20 (*Focus Spells (Legacy)*):

- [x] Pool = cantidad de focus spells que conocés, con **tope de 3**
- [x] Lanzar cuesta 1 punto; **Refocus** (10 min) devuelve 1; el descanso diario los devuelve todos
- [x] Se heightean solos a la mitad del nivel, redondeando arriba (igual que los cantrips)
- [x] Ataque y CD con el atributo clave y la proficiencia de conjuro
- [x] Funcionan **sin ser lanzador**: el bloque es independiente de los slots (Monk, Champion)

**Hallazgo importante**: en el dataset **ninguna fuente otorga focus spells de forma estructurada**
— ni class features ni dotes tienen un `GrantItem` que resuelva a un hechizo. Verificado. Los linajes
de sorcerer sí los nombran en su prosa (`Bloodline Spells initial: Dragon Claws , advanced: …`), y el
importador los extrae: los 17 linajes matchean. Esos aparecen primero y con ★ al elegir.

El resto se elige a mano, filtrado por el trait de la clase (61 del sorcerer, 124 del cleric…).

Pendiente: las órdenes del druida, las escuelas del wizard y las causas del champion nombran su
focus spell en prosa suelta, sin patrón parseable. Se pueden elegir igual, pero no se sugieren.

### 4. Detalles de creación

- [x] **Idiomas**, con paso propio en el wizard y visibles en la hoja. Incluye poder escribir
      **idiomas inventados por el máster**: no hay lista cerrada, ocupan cupo como cualquier otro.
      La lista Legacy (11 comunes + 11 poco comunes) salió de AoN, porque el dataset solo trae los
      que otorgan las ancestrías y faltarían Jotun, Sylvan, Undercommon y todos los poco comunes.
- [x] **Dinero inicial**: 15 gp de presupuesto en el paso de equipo, con lo gastado y lo que queda;
      el sobrante pasa a ser la bolsa del personaje, ajustable desde la hoja.
- [x] **Edad, apariencia y notas**, en el último paso del wizard y visibles en la hoja.
- [x] **Visión** (darkvision / low-light) en la hoja.

Con esto el paso 4 queda **cerrado**.

### 4-ter. Inventario en la hoja  ✅ HECHO

El inventario ya no es solo de la creación: se maneja durante la partida.

- [x] Agregar (buscando en los 4563 objetos), quitar y cambiar cantidad
- [x] **Comprar** descontando de la bolsa, con el precio a la vista y el botón deshabilitado si no
      te alcanza; **agregar sin pagar** para botines y regalos; **vender** a mitad de precio
- [x] Equipar y desequipar, que cambia la CA y los ataques
- [x] **Bulk** con el límite de carga (5 + Fuerza para quedar encumbered, máximo 10 + Fuerza),
      verificado en [AoN Legacy](https://2e.aonprd.com/Rules.aspx?ID=188&NoRedirect=1)
- [x] **Objetos inventados** que no existen en el catálogo, con su bulk y sus notas

### 4-quater. Escudos  ✅ HECHO

- [x] Importar **hardness** y **HP** (estaban en el dataset y se descartaban)
- [x] **Alzar escudo**: suma su bonus a la CA como **circunstancia**, solo mientras está alzado
- [x] **Broken Threshold** = la mitad de los HP; un escudo roto no da CA aunque esté alzado
- [x] **Shield Block**: absorbe daño hasta su hardness y el resto se lo llevan los dos
- [x] Reparar

La armadura tiene bonus a la CA, tope de Destreza, penalidad de chequeos y penalidad de
velocidad. **El requisito de Fuerza perdona la penalidad de VELOCIDAD, no la de chequeos**
(confirmado con Notebook LM el 2026-08-20; antes lo teníamos al revés).

**Hallazgo pendiente de resolver**: el dataset trae \`hardness\` y \`maxHp\` para las 134
armaduras (igual que para los escudos), pero **los 134 registros están en 0** — a diferencia de
los escudos, donde sí se importaron valores reales. Es casi seguro un problema del importador
(mira una ruta distinta para armadura que para escudo en el paquete de Foundry), no que el juego
diga que toda armadura tiene 0 de dureza. Como consecuencia, la app **no tiene ningún mecanismo
de HP/rotura para la armadura** (a diferencia del escudo, que sí tiene Shield Block y reparar):
armar ese mecanismo con datos en 0 no serviría de nada. Antes de construirlo hay que arreglar
\`tools/import/import.mjs\` para que traiga los valores reales, y recién ahí decidir si vale la
pena modelar el desgaste de la armadura (en la mesa se usa mucho menos que el del escudo).

Pendiente: contenedores (mochilas que reducen bulk), runas aplicadas a objetos, y aplicar
automáticamente los efectos de *encumbered* (clumsy 1 y −10 pies): hoy se avisa, no se aplica.

### 4-bis. Armas y armaduras personalizadas  ✅ HECHO (fuera de orden, a pedido)

- [x] \`build.inventory[].custom\` con nombre, dados, tipo de daño, bonus de ataque/daño, traits y
      notas para armas; bonus de CA, tope de Destreza, requisito de Fuerza, penalidad de
      chequeos y de velocidad para armadura y escudo
- [x] Los bonus entran como bonus de objeto al pipeline (aparecen en el breakdown)
- [x] Foto del objeto base dentro del custom, para sobrevivir a una reimportación
- [x] Editor en la hoja, sobre cualquiera de las 779 armas y las 134 armaduras
- [x] **Fatal y Deadly como campos propios** del editor (antes solo se podían agregar metiendo
      \`fatal-d10\` a mano en el campo de traits, sin indicación de que eso funcionaba). El campo
      pisa lo que traiga el arma del dataset, así que también sirve para homebrewear el dado de
      crítico de un arma existente, no solo para agregarlo donde no había
- [x] **Los campos del editor arrancan prellenados** con el valor actual del objeto (el de base,
      o el que ya hayas personalizado), en vez de en blanco. Antes había que retipear todos los
      stats aunque solo quisieras cambiar uno

Pendiente: crear un arma de cero (hoy siempre parte de una del dataset), y las runas
(\`Striking\`, \`Weapon Potency\`) que existen como items pero no se aplican.

### 4-quinquies. Iniciativa  ✅ HECHO

Reglas confirmadas con la fuente del proyecto (Notebook LM), no con búsquedas web:

- [x] Por defecto se tira **Percepción**, con su modificador completo (no hay un modificador de
      iniciativa propio)
- [x] Selector para tirarla con **cualquier habilidad** (lista abierta, la decide el máster): Stealth
      si venías evitando ser visto, Deception si distraías, Athletics en una pulseada pactada…
- [x] Los bonus **generales** a la iniciativa valen siempre; los que dicen *"Perception checks for
      initiative"* se pierden si tirás con una habilidad. El dataset los distingue con
      `predicate: ["perception"]`, que ahora el importador conserva
- [x] Es un **chequeo**: las condiciones que penalizan tiradas (frightened) le pegan

Caso concreto: Koh I Noor tira Stealth para iniciativa y dispara *One Shot, One Kill* (cuyo trigger
es literalmente "You roll Stealth for initiative"), y a cambio pierde el +2 de Battlefield Surveyor.

Los bonus con predicados que la app no sabe evaluar (`all-undead`, flags propios) **no se aplican
solos**: se listan debajo de la tarjeta para que decidas vos.

### 4-sexies. Hoja reordenada  ✅ HECHO

La hoja se reordenó siguiendo cómo se usa en la mesa, de arriba hacia abajo:

- [x] **Retrato** del personaje: se recorta cuadrado y se achica a 256px en el navegador antes de
      guardarlo (viaja en el mismo jsonb), y se muestra también en el selector de personajes
- [x] **Items a revisar** plegable, y solo si queda algo sin resolver
- [x] Fila de contexto: velocidad, visión, idiomas, condiciones y hero points
- [x] Fila de defensas: HP, CA, escudo (con hardness, HP y Shield Block), salvaciones y CD de clase
- [x] **Percepción e iniciativa a la izquierda de los atributos**: son las dos tiradas de todos los
      turnos, y estaban perdidas entre las defensas
- [x] Rasgos y dotes **agrupados por origen** (ancestría, clase, habilidad, generales, adicionales):
      el motor ahora guarda de dónde viene cada uno
- [x] **Favoritos**: marcás con ★ un ataque, una habilidad o un conjuro y queda arriba. Se guarda la
      referencia, no el número, así que sigue al personaje cuando sube de nivel
- [x] Ataques separados en **cuerpo a cuerpo** y **a distancia**
- [x] **Puño**: el dataset no lo trae (sus únicos items "unarmed" son mágicos), así que lo arma el
      motor y pasa por el mismo pipeline que cualquier arma

### 4-septies. Formato de escritorio  ✅ HECHO

La hoja estaba armada como una app de celular: contenedor de 1100px y las secciones apiladas en
tarjetas angostas. Ahora se usa cómoda en una pantalla de PC.

- [x] El contenedor de la hoja llega a 1720px (el resto de las pantallas sigue en 1100: un
      formulario de creación a 1700px no se lee)
- [x] `<app-accordion>` (`src/app/shared/accordion.component.ts`): cada sección es una **fila de
      ancho completo** que se pliega a una barra de un renglón, con el dato clave en el encabezado
      (el bulk cargado, la plata, cuántos ataques). Arrancan abiertas las que se usan cada turno;
      rasgos, bolsa e inventario arrancan cerradas
- [x] El contenido plegado **no se destruye**, se oculta por CSS: un editor de arma a medio llenar
      sobrevive a cerrar y abrir la sección
- [x] Adentro de cada fila el contenido se reparte en columnas con **multi-columna** (`.rejilla`),
      no con grid: así una habilidad y su breakdown, o un arma y su editor, siguen siendo hermanos
      y fluyen juntos sin envolver nada en wrappers
- [x] Sigue andando en pantalla angosta: las columnas se reducen a una sola y nada desborda

### 4-octies. Ajustes de uso en PC  ✅ HECHO

- [x] Tipografía base de 15px a **22px** (todo lo demás está en rem, así que escaló solo;
      las columnas de las secciones pasaron de px a rem para acompañar)
- [x] **HP** a la izquierda de velocidad y **editable a mano**: en la mesa te pegan 14 de una,
      no de a uno. Ya no hay botonera de ±1/±5
- [x] **Percepción e iniciativa** subieron a la fila de defensas: los atributos quedaron solos
      en su fila y respiran
- [x] **Agregar y quitar idiomas** desde la hoja, con la lista Legacy y los inventados por el
      máster. El cupo se muestra pero **no bloquea**: si te pasás, la hoja lo dice
- [x] **Segundo y tercer ataque** en cada arma, con el multiple attack penalty ya restado
- [x] Arreglado el nombre de los conjuros, que se dibujaba con el cromado gris del navegador

Dos arreglos que salieron de ahí:

- `build.languages` no existía en los personajes creados antes de esa función. El binding
  reventaba y Angular dejaba **el resto del elemento sin pintar, sin ningún error visible**:
  los botones de idioma salían vacíos. Ahora `load()` normaliza los campos que pueden faltar
  (`languages`, `favorites`, `inventory`, `acknowledgedWarnings`).
- El multiple attack penalty (−5/−10, −4/−8 con **agile**) está escrito a mano en
  `sheet.component.ts`, igual que el puño: **falta confirmarlo contra la fuente Legacy**.

### 4-nonies. Secciones, bolsa y cabecera de ataques  ✅ HECHO

- [x] Los **atributos** pasaron a ser una sección plegable más, como el resto
- [x] La **bolsa se mudó adentro del inventario**, fija arriba mientras scrolleás la lista, y
      repartida en las cuatro monedas (pp / gp / sp / cp), cada una como campo editable
- [x] Los ataques tienen **cabecera** (Arma · 1º · 2º · 3º): tres números seguidos no decían
      cuál era cuál. Dejaron de ir en multi-columna y ahora son una tabla
- [x] Los detalles del personaje (edad, apariencia, notas) salieron de la bolsa —donde no
      pintaban nada— a su propia sección

**La bolsa se guarda por denominación** (`state.purse`), no solo como total: si escribís 15 en
oro quedan 15 gp, no 1 pp y 5 gp. `state.coins` sigue siendo el total en cobre y es lo que usan
comprar y vender; después de una compra la bolsa **sí** se reacomoda, porque te dan vuelto.

### 4-decies. Aprender conjuros y editar la armadura  ✅ HECHO

Las dos cosas que solo se podían tocar al crear el personaje o al subir de nivel, y en la mesa
pasan en cualquier momento.

- [x] **Aprender y olvidar conjuros desde la hoja**: cantrips y repertorio para los espontáneos,
      libro para el mago. Un pergamino copiado o un conjuro regalado ya no obligan a esperar
      al próximo nivel
- [x] El **libro del mago** no se mostraba en ningún lado: ahora se lista y se edita
- [x] Un Cleric o un Druid **no aprenden conjuros** (preparan de toda su tradición), así que a
      ellos la hoja solo les ofrece cantrips y explica por qué
- [x] **Armadura y escudo editables** como las armas: bonus de CA, tope de Destreza, requisito
      de Fuerza, penalidades de chequeos y velocidad, hardness y HP. Todo se guarda en el
      personaje y el motor lo aplica
- [x] La foto del objeto base ahora incluye los campos de armadura, así que sobrevive a una
      reimportación igual que las armas

**Bug que destapó esto**: el requisito de Fuerza de una armadura viene del dataset como
*modificador* (los 118 valores van de 0 a 5), pero el motor lo comparaba contra la *puntuación*
(10 a 20). La condición nunca se cumplía, así que **la penalidad de chequeos por armadura no se
le aplicaba a nadie**. Corregido y con dos tests que lo fijan.

### 4-undecies. Garbo (panache) del Swashbuckler  ✅ HECHO

Reglas confirmadas con el Notebook LM del proyecto (2026-08-19), porque el dataset trae los
rule elements con `value: null`: la importación se quedó con el selector y el predicado, pero
no con las progresiones por nivel. Los números viven en `rules/panache.ts`.

- [x] **El garbo es binario**, no un pool: `state.panache` es un booleano. Es la diferencia con
      los focus points, y es lo que define todo el diseño
- [x] Interruptor en la fila de contexto, al lado de los hero points
- [x] **Precise Strike**: +2 y 2d6 en finisher, subiendo de a uno en los niveles 5, 9, 13 y 17.
      Solo con garbo y solo con armas cuerpo a cuerpo (o desarmado) *agile* o *finesse* — el
      puño califica
- [x] **Vivacious Speed reemplaza** el +5 del garbo, no se suma: a nivel 3 son +10, y sin garbo
      queda la mitad redondeada al múltiplo de 5 de abajo (+5 hasta nivel 10, +10 hasta 18, +15)
- [x] Se maneja por los **rasgos que tiene el personaje**, no por la clase: con Swashbuckler
      Dedication se gana Panache sin ser de la clase, y sin Precise Strike
- [x] Los 5 estilos ya se elegían solos: están tageados `swashbuckler-style` y los resuelve el
      mecanismo genérico de ChoiceSet

Lo que la hoja **no** calcula, porque depende de qué estés haciendo: el +1 de circunstancia a
los chequeos que dan garbo, y ganarlo o perderlo (el interruptor es a mano).

### 4-duodecies. Fichas del manual  ✅ HECHO

- [x] Un ⓘ al lado de cada rasgo, dote, conjuro, arma, armadura, escudo, objeto del inventario
      y condición, que muestra la descripción del manual
- [x] Sale **en el mismo rincón que una tirada**: hasta que exista el chat de la partida, ese
      es el lugar donde la hoja contesta. Cuando llegue la fase 2, debería postearse al chat
- [x] Las **condiciones ya no muestran el texto completo** en la lista: solo el nombre y el ⓘ.
      La lista de 42 entraba en tres pantallas
- [x] El icono **solo aparece si hay descripción**, así que nunca abre una ficha vacía

Las descripciones ya venían completas en el dataset (4238 dotes, 1520 conjuros, 553 rasgos,
4373 objetos) y sin marcado de Foundry: el importador ya había limpiado los @UUID y compañía,
así que queda HTML simple que Angular sanitiza al renderizar.

**Lo único sin ficha son las habilidades**: no hay skills.json, la lista de las 17 es una tabla
propia en rules/tables.ts y sus descripciones no están en los packs importados. Se resolvería
con un importador contra AoN Legacy, igual que se hizo con las condiciones.

### 4-terdecies. Cuatro correcciones sueltas  ✅ HECHO

- [x] **Visión editable**: antes salía fija de la ancestría. Ahora hay un selector en la fila de
      contexto (`build.visionOverride`) para lo que la app no modela sola — un Ganzi con
      darkvision, perder un ojo en la mesa. La opción "Según tu ancestría" muestra entre
      paréntesis lo que te tocaría por defecto, para no perder esa información al volverla
      editable
- [x] **Bug real en los tags-botón**: cualquier `<button class="tag">` (quitar un idioma elegido,
      elegir uno en el editor) salía con el cromado gris de sistema del navegador en vez del
      estilo oscuro de la app — mismo problema de fondo que ya habíamos arreglado en
      `.spell-name`, pero nunca se corrigió en la clase base `.tag`. Corregido ahí, así que
      cualquier botón nuevo con esa clase también queda a salvo
- [x] **Ancestría, Clase y Habilidad (y de paso Generales y Adicionales) son editables**: se
      puede agregar o quitar una dote de cualquier categoría directo desde la hoja, sin pasar
      por el asistente ni por subir de nivel — un tomo, un boon de facción, algo que decidió el
      máster en la mesa. Reusa el mismo criterio de filtrado que ya usaba el asistente al
      ofrecer dotes (categoría, nivel alcanzado, el trait de clase/ancestría, arquetipos vía
      dedication). "Adicionales" es a propósito una lista sin filtrar: es el cajón de "algo
      fuera de lo normal". Solo se puede sacar una dote que vino de una elección (no un rasgo
      estructural de la clase, que no es opcional)
- [x] **Ataques naturales** (garras, colmillos, púas que se disparan): ya no hace falta
      inventariar un objeto para pelear con el cuerpo. `build.naturalWeapons` es una lista
      aparte del inventario (no pesan, no se compran), con su propio editor (nombre, cuerpo a
      cuerpo/distancia, dados, tipo, fatal, deadly, bonus, traits, notas) y un botón para
      agregar en cada una de las dos secciones de ataques. Usan la proficiencia unarmed, igual
      que el puño, y el ataque a distancia usa Destreza automáticamente como corresponde

### 4-quaterdecies. Nivel editable y modal para listas largas  ✅ HECHO

- [x] **El nivel se corrige a mano**: un cuadro de número en la cabecera (al lado de "Subir de
      nivel"), no un botón de una sola dirección. Cambiarlo recalcula toda la hoja sola —nada
      nuevo ahí, ya salía todo de `computeCharacter()`— y sirve tanto para corregir un
      mis-click como para mirar cómo se vería el personaje en otro nivel
- [x] **Red de seguridad para cuando el salto deja huecos**: si tocás el nivel a mano y te
      saltás niveles con dotes o aumentos de habilidad sin elegir, ahora aparece como
      advertencia ("Falta elegir: Dote de clase (nivel 4)") en vez de faltar en silencio. Esto
      salió de conectar `pendingSlots()` de `progression.ts` —que ya existía, pero no la usaba
      nadie— a las advertencias del motor. De paso, esto también agarra huecos viejos: un
      personaje armado con el asistente antes de esta función y que se había saltado algo
      ahora lo va a mostrar
- [x] **Modal para listas largas de dotes**: el panel de "+ Agregar" en Rasgos y dotes mostraba
      hasta 40 resultados apretados dentro del acordeón, empujando el resto de la hoja para
      abajo. Ahora se ven las primeras 12 con un botón "Ver todas (147)" que abre un modal
      —mismo patrón de `.backdrop`/`.dialog` que ya usaba borrar un personaje— con la lista
      completa, más cómoda de recorrer y con la misma búsqueda compartida
- [x] **Descripción inline al elegir**: un ⓘ en cada fila de las listas de "elegir algo" (las
      dotes, en el panel chico y en el modal, y el catálogo del inventario). A diferencia del
      resto de las fichas, **no sale en el rincón de las tiradas sino debajo de la fila**, con
      letra más chica: estás comparando opciones y conviene leer sin perder de vista la lista —
      y dentro de un modal un cartel en la esquina quedaría tapado. Una sola abierta a la vez,
      para que la lista no se estire de golpe

**Nota sobre los `<select>` nativos**: los desplegables que quedan (aprender un conjuro, elegir
focus spell) no pueden llevar el ⓘ, porque un `<option>` de HTML solo admite texto plano. Si
hiciera falta ahí, habría que reemplazarlos por una lista como la de las dotes.

### 4-quindecies. Correcciones sobre Vevo  ✅ HECHO (menos una)

- [x] **Cantidad en el equipo del asistente**: volver a elegir el mismo objeto en la lista no
      sumaba una segunda unidad, porque el picker no vuelve a emitir si el id seleccionado no
      cambió. Ahora la mochila tiene un campo de cantidad, igual que el inventario de la hoja
- [x] **Tilde "Ignorar el peso"** al lado del título del Inventario (`build.ignoreBulk`): el
      bulk se sigue mostrando —es información útil— pero deja de avisar por encumbered ni por
      pasarse del máximo. Para eso el acordeón ahora acepta un control al costado del título
      (`[acc-extra]`), porque el encabezado era un `<button>` y no se puede meter un checkbox
      adentro de uno
- [x] **Faltaban iconos de descripción** en Covered Reload, One Shot One Kill y Alchemical
      Crafting: `fichas()` buscaba solo en `class-features`, pero un rasgo activo puede venir de
      cualquiera de los tres packs — los deeds del Gunslinger viven en `actions` y un GrantItem
      puede otorgar una dote suelta. Ahora busca en los tres
- [x] **Dote repetida**: una dote otorgada por un rasgo y además elegida a mano aparecía dos
      veces (Alchemical Crafting en Vevo). Se muestra una sola, la elegida, que es la que se
      puede sacar
- [x] **"No encuentro Fleet"**: no faltaba en el dataset — estaba tomada como *dote adicional*,
      y las dotes ya tomadas se filtraban de las listas sin decir nada. Ahora aparecen marcadas
      **"ya la tenés"** (deshabilitadas en el picker del asistente, sin botón de agregar en la
      hoja). Desaparecer sin explicación se leía como un agujero en los datos
- [x] Los avisos de slot pendiente ahora dicen **dónde** resolverlo ("se elige en Rasgos y
      dotes, o al subir de nivel")

**Descartado**: la diferencia de Constitución con pathbuilder NO era por boosts alternativos de
ancestría — esa regla no se usa en la mesa (confirmado). Ver abajo: el hilo real es la Fuerza.

**Pendiente de confirmar con Notebook LM — penalidad de velocidad de la armadura**: hoy la
penalidad de velocidad se aplica **siempre**, sin mirar el requisito de Fuerza de la armadura.
La penalidad de *chequeos* sí lo mira (se arregló antes). Falta confirmar la regla: si cumplís
el requisito de Fuerza, ¿la penalidad de velocidad se **reduce en 5 pies**, o se ignora entera?
Con Vevo no cambia el número (Fuerza +1 contra un requisito de +2, no lo cumple), pero está mal
para cualquiera que sí lo cumpla.

### 4-sexdecies. Diagnóstico sobre Vevo (velocidad y sigilo)  ✅ EXPLICADO

Las dos diferencias contra roll20 salen del **mismo lugar**: el requisito de Fuerza de la
armadura. Vevo lleva **Scale Mail** (requiere Fuerza +2, penalidad de chequeos −2, de velocidad
−5) y en nuestra hoja tiene **Fuerza +1**, así que no lo cumple:

| | acá | roll20 | por qué |
|---|---|---|---|
| Velocidad | 15 | 20 | enano 20 − 5 de la Scale Mail |
| Sigilo (nv 4) | 10 | 12 | −2 de penalidad de chequeos de la armadura |

Con Fuerza +2 los dos números coinciden con roll20. O sea que **los boosts de atributo cargados
acá no son los del personaje real** — no es un error de cálculo. Queda para el usuario comparar
y corregir.

- [x] La velocidad ahora **muestra su desglose** (¿por qué?) como el resto de las estadísticas:
      sin eso no había forma de ver que el −5 venía de la armadura y no del peso

### 4-septdecies. Atributos editables  ✅ HECHO

- [x] La **puntuación de cada atributo se escribe a mano** (`build.abilityOverrides`) y pisa la
      que sale de los boosts. Cambiarla recalcula la hoja entera sola —modificador, CA, HP,
      salvaciones, habilidades, ataques, CD— porque todo eso deriva de la puntuación dentro de
      `computeCharacter()`. Antes, corregir un número obligaba a rehacer los boosts
- [x] El valor escrito a mano se ve distinto (borde punteado, color de acento) y su desglose
      trae un **"volver a los boosts"** para deshacerlo
- [x] El **"¿por qué?"** se reemplazó por el ⓘ que ya se usa en el resto de la hoja — en los
      atributos y también en velocidad, percepción y salvaciones, para que el mismo gesto se
      vea igual en todos lados

Sirve como escape para lo que la app no modela: un personaje traído de otra app, un item que
sube un atributo, una bendición del máster.

**Confirmación del diagnóstico anterior**: probando esto sobre Vevo, subir Fuerza de 12 a 14
llevó el Sigilo de 10 a **12**, que es exactamente lo que muestra roll20 — porque con Fuerza +2
cumple el requisito de la Scale Mail y se va la penalidad de chequeos. La **velocidad siguió en
15**, que es el bug de reglas todavía sin arreglar (la penalidad de velocidad no mira el
requisito de Fuerza).

### 4-octodecies. Regla de armadura corregida y sin validación de dinero  ✅ HECHO

- [x] **El requisito de Fuerza de la armadura perdona la penalidad de velocidad, no la de
      chequeos** — estaba implementado exactamente al revés. Confirmado con Notebook LM. Ahora:
      la de chequeos (Sigilo, Acrobacias…) se aplica siempre, y la de velocidad solo si NO
      llegás al requisito. Verificado con Durin: al subirle Fuerza al requisito, la velocidad
      pasó de 15 a 20 y el Sigilo mantuvo su −2
- [x] **Fuera la validación de monedas**: no avisa más si el equipo cuesta más que los 15 gp
      iniciales, y el botón de comprar ya no se deshabilita por no tener plata. El presupuesto
      se sigue mostrando como referencia. En la mesa el equipo entra por caminos que la app no
      ve —botín, regalos, un PJ traído de otra app— y avisar por eso era ruido permanente
- [x] Orden de secciones: **Favoritos primera**, y **Habilidades antes que Rasgos y dotes**

### 4-novodecies. Favoritos por filas  ✅ HECHO

- [x] **Filas, no tarjetas**: cada favorito ocupa el ancho completo, que es lo que hace falta
      para mostrarlo como en su sección de origen
- [x] Un **arma** favorita se ve igual que en Cuerpo a cuerpo / A distancia: los tres ataques con
      su multiple attack penalty, el daño, fatal/deadly y el "personalizar". Reusa la misma
      plantilla (`strikeTpl`), así que no hay dos formatos que mantener sincronizados
- [x] Un **conjuro** se ve como en la sección de conjuros: nombre lanzable, ⓘ, rango, defensa y
      los rangos a los que se puede subir
- [x] **Los conjuros preparados y los del divine font ahora se pueden marcar** con ★. Eran los
      que faltaban: los que se eligen cada día
- [x] Lo que dejó de estar disponible **no desaparece**: se muestra apagado y tachado con el
      motivo en un tag corto (*no preparado*, *no equipada*). Verificado vaciando el slot de un
      conjuro preparado de Kyra: el favorito quedó, apagado, y volvió solo al prepararlo de nuevo

Un favorito de conjuro está disponible exactamente cuando lo estaría abajo: `conjurosDisponibles`
junta las mismas fuentes que ya muestra la sección (repertorio, cantrips, slots preparados,
divine font y focus), así que no hay dos criterios distintos de "lo puedo lanzar".

### 5. Deudas conocidas

- El ChoiceSet del tipo de dragón (linaje dracónico) trae la lista embebida en vez de
  `filterTags`, así que la resolución genérica no lo ofrece: un Sorcerer dracónico no puede
  elegir su dragón.
- Tope de skill increase por nivel (experto desde 3, maestro desde 7, legendario desde 15).
- Condiciones con efecto numérico que hoy salen como "solo texto": blinded (−4 a Percepción),
  encumbered (clumsy 1 y −10 pies), confused (flat-footed), dying/wounded.
- `MartialProficiency` con predicado (Fighter Weapon Mastery sobre el grupo elegido).
- Rule elements de velocidad (Fleet).
- Compañero animal y familiar (Druid, Ranger, Witch).
- Alchemist y Kineticist: subsistemas propios.
- El multiple attack penalty se escribió a mano (−5/−10, −4/−8 con agile), sin verificar contra
  la fuente Legacy.
- El puño usa las estadísticas por defecto (1d4 contundente, agile/finesse/nonlethal): es lo único
  de la hoja que no sale ni del dataset ni de una fuente Legacy verificada.

## Partidas multijugador (nuevo alcance)

Hasta acá la app era de un jugador solo: creás personajes y los mirás. Esto agrega la mesa —
chat, tiradas compartidas, notas y, al final, voz y video.

**Entra todo en el stack actual.** Supabase Realtime da chat en vivo, tiradas y presencia sin
agregar un servidor, así que Netlify sigue sirviendo archivos estáticos. Lo único que se sale
del molde es el video (ver fase 6).

### Decisiones ya tomadas

- **No existe "iniciar la partida".** El GM la crea y genera el link; de ahí en más cualquiera
  entra cuando quiere y el chat está siempre. Quién está jugando ahora lo dice la *presencia*,
  no una fila en la base. Se gana simpleza; se pierde poder agrupar el historial por sesión, y
  eso se cubre con separadores por fecha en el chat.
- **Invitación solo por link** con token. Sin mails, sin SMTP, sin Edge Functions.
- **Las tiradas eligen su visibilidad** al tirar: pública, solo para el GM, o solo para uno.
- **El GM lee las hojas completas** de su mesa. Entre jugadores se ve poco (nombre del jugador,
  del personaje, clase y nivel).

### Lo que hay que tener en cuenta antes de escribir la primera línea

- **La RLS de `party_members` se muerde la cola.** Una policy sobre esa tabla que pregunte
  "¿este usuario es miembro?" consultando la misma tabla entra en recursión infinita — es el
  error clásico de Supabase. Se resuelve con funciones `security definer` (`is_member(party)`,
  `is_gm(party)`) y usando esas funciones en las policies.
- **Hace falta una tabla `profiles`** aunque las invitaciones sean por link: para escribir
  "Gera tiró 18" el navegador necesita un nombre, y `auth.users` no es consultable desde el
  cliente. Con nombre visible alcanza; el mail no hace falta exponerlo.
- **Abrir la lectura de `characters` al GM es el cambio más delicado del proyecto.** Hoy la
  policy es `auth.uid() = user_id` y nada más. Conviene escribirla, probarla con dos cuentas
  reales y recién después usarla.
- **El plan gratis de Supabase pausa el proyecto tras una semana sin actividad.** Una mesa
  quincenal lo va a encontrar pausado; se despausa a mano desde el dashboard.

### Fase 1 — La partida y sus miembros  ✅ HECHO Y VERIFICADO

- [x] `profiles` (id, display_name), con trigger que la crea al registrarse y relleno
      para las cuentas que ya existían
- [x] `parties` (nombre, gm_id, invite_token) y `party_members` (rol, character_id)
- [x] `is_party_member` / `is_party_gm` en `security definer`, y las policies encima
- [x] Crear partida siembra al GM como miembro, por trigger
- [x] `join_party_by_token` y `peek_party_by_token`: entrar por link, y poder mirar a dónde
      lleva el link ANTES de entrar (quien no es miembro todavía no puede ni leer la partida)
- [x] Pantallas: lista de partidas, crear, copiar link, rotar link
- [x] Unirse por link, con el token guardado si hace falta iniciar sesión primero
- [x] Elegir personaje: uno existente o crear uno en el momento (`/characters/new?party=<id>`,
      que al terminar te sienta y te devuelve a la mesa)
- [x] **Con quién jugás se elige una vez.** Una vez sentado no hay selector: queda el personaje
      y un "Cambiar de personaje" aparte, que avisa que eso es para cuando el tuyo murió o se
      retiró. Un desplegable siempre a mano sugería que había que elegir cada vez que entrás
- [x] Miembros con presencia en vivo, echar (GM), salir, borrar la partida
- [x] SQL corrido y circuito verificado en el navegador: crear partida, GM sentado por el
      trigger, presencia, elegir personaje, link de invitación, rotar el link (el viejo deja
      de servir) y borrar la partida
- [ ] **Falta probar con dos cuentas**: que un segundo usuario entre por el link. Es lo único
      que no se puede verificar desde una sola sesión

Dos cosas que aparecieron al probar:

- **No hay clave foránea de `party_members` a `profiles`** (`user_id` apunta a `auth.users`),
  así que PostgREST no puede resolver un embed `profiles:user_id (...)`. Los nombres se piden
  en una segunda consulta. Si algún día se quiere el embed, hay que agregar esa FK.
- El detector de "faltan las tablas" era demasiado goloso: cualquier mención a *schema cache*
  caía ahí, incluida la de una relación que no existe. Ahora mira el código del error.

Detalle que va a volver a aparecer: **los errores de Supabase no son `Error`**, son objetos
planos con `message` y `code`. `String(e)` sobre eso imprime "[object Object]". Para eso está
`mensajeDeError()` en `party.service.ts`.

### Fase 2 — Chat global

- [ ] `messages` (party_id, user_id, kind text|roll|system, body, roll jsonb, visibility)
- [ ] Historial persistente, que es el punto: sobrevive a que todos se desconecten
- [ ] Suscripción por Postgres Changes; mensajes de sistema al entrar y salir
- [ ] Separadores por fecha, que reemplazan a las "sesiones"
- [ ] **Decisión de layout pendiente**: el chat tiene que estar siempre visible, así que la
      pantalla de partida es una columna de chat fija al costado. Falta definir qué va en el
      resto: ¿la hoja del personaje con el que entraste, embebida? La hoja hoy está pensada
      para ocupar 1720px de ancho, así que convive mal con una columna de chat al lado.

### Fase 3 — Tirador de dados

- [ ] Tirador libre: cantidad + tipo de dado, y modificador
- [ ] El resultado va al chat como mensaje `roll`, con el detalle de cada dado
- [ ] Selector de visibilidad en cada tirada (pública / solo GM / privada)
- [ ] **Las tiradas de la hoja se publican en el chat**: atacar, salvar, habilidades. Para eso
      la hoja necesita saber en qué mesa estás sentado — un selector de "partida activa"
- [ ] `rollFormula()` de `dice.ts` ya hace el trabajo; esto es plomería, no reglas

### Fase 4 — Notas

- [ ] `notes` (party_id, author_id, nombre, texto, visibilidad privada|mesa|gm)
- [ ] ABM simple dentro de la partida
- [ ] **Sin edición colaborativa en vivo**: si dos personas editan la misma nota, gana la
      última que guarda. La edición concurrente de verdad (CRDT) es un proyecto aparte

### Fase 5 — El GM ve las hojas

- [ ] Policy de lectura sobre `characters` para el GM de la mesa donde está sentado el PJ
- [ ] Vista de solo lectura de la hoja para el GM
- [ ] Verificación con dos cuentas reales de que un jugador NO ve la hoja de otro

### Fase 6 — Voz y video (último)

- [ ] WebRTC entre navegadores, con Supabase Broadcast como canal de señalización
- [ ] **Necesita un servidor TURN**, que no es gratis: sin él, dos jugadores detrás de ciertos
      routers domésticos no se conectan. Alternativa: un tercero (LiveKit, Daily, Jitsi)
- [ ] En malla directa aguanta 4 o 5 personas; más que eso pide un servidor que mezcle

## Cómo verificar que algo está bien

1. El dataset manda: antes de escribir una regla, buscarla en `.data-source/packs/`.
2. Si no está en el dataset, se consulta AoN **confirmando que sea Legacy** (ver README).
3. Los tests van contra el JSON importado, no contra fixtures inventados.

### 4-vicies. Rango de proficiencia editable

Las habilidades, los ataques y la armadura mostraban el rango (untrained,
trained, expert…) como texto muerto. Ahora es un combo en el mismo lugar donde
estaba el texto.

- `build.proficiencyOverrides` guarda `{ skills, strikes, defenses }`. Las claves:
  el slug de la habilidad (o `lore:x`), el id del arma, y la categoría de
  armadura.
- Se aplican **al final** de `computeProficiencies`, pisando el valor calculado.
  Va último a propósito: `upgrade()` solo sube, y hay que poder bajar también
  (que la app te dé de más es tan posible como que te dé de menos).
- Los ataques no pasan por ahí porque `rankFor` toma el máximo entre varias
  claves; el override se aplica directo en el strike, contra `weapon.id`. Dos
  espadas largas iguales comparten id, y comparten el ajuste.
- No hace falta recalcular nada a mano: el rango es una entrada de
  `computeCharacter`, así que el modificador, la CA y los tres ataques del turno
  se mueven solos.
- `app-rank-select` es el combo, compartido por los tres lugares. El botón de
  deshacer (↺, tooltip "Restablecer") aparece solo si el valor está puesto a
  mano: si no, dieciséis habilidades serían dieciséis íconos de ruido.
- Cuidado con `<select [value]>` en Angular: se aplica antes de que el `@for`
  cree las opciones y se pierde. La selección va en `<option [selected]>`.

### 4-unvicies. La ficha del ⓘ con los datos del manual

El ⓘ mostraba solo la descripción. El texto de la espada larga habla de la
hoja: no dice que hace 1d8 ni que ocupa una mano, que es lo que se consulta en
la mesa. Ahora arriba de la descripción van los datos tabulados.

- `rules/fichas.ts`: `datosDeEquipo`, `datosDeConjuro` y `datosDeDote` devuelven
  pares etiqueta/valor. Está aparte del componente para poder testearlo contra
  el pack real.
- **Se omite lo vacío** en vez de mostrar un guion: una lista de veinte
  renglones donde quince dicen "—" es peor que una de cinco.
- Dureza y PV de la armadura vienen en cero del importador (fallo conocido, ver
  pendientes). No se muestran: un "Dureza 0" es peor que nada, porque parece un
  dato.
- Una ficha ahora se guarda si tiene descripción **o** datos: un arma sin texto
  de sabor igual tiene daño y volumen.
- Normalizaciones mínimas donde el dato crudo no se lee: `usage:
  held-in-one-hand` → "1 mano", `time: "2"` → "2 acciones", `actionType:
  passive` se omite. El texto libre en inglés (alcance, objetivos) se deja como
  viene: traducirlo a medias sería peor.

### 4-duovicies. Importador, marca, perfil y plegado

**Importador.** Lo que se perdía no era la dureza de la armadura (eso ya viene
en cero desde el pack de origen; Foundry la deriva del material en tiempo de
ejecución, y los escudos sí la traen bien: 143 de 143). Lo que se perdía eran
las **runas**: 323 objetos mágicos se importaban como si fueran mundanos,
porque potency/striking/resilient no están en `damage` ni en `bonus`, están en
`system.runes`. Ahora se importan, junto con el material. **Falta aplicarlas en
el motor** — ver pendientes.

**PlayPf2e.** El título del sitio y la marca de la barra.

**Subir nivel** sale del listado de personajes: se hace desde la hoja, donde se
ve contra qué se está subiendo. En el listado era un atajo para subir a ciegas.

**Perfil** (`/profile`): nombre y avatar. El nombre por defecto es la parte del
mail antes del arroba, el mismo criterio que ya usaba el trigger de la base. El
avatar por defecto son las iniciales, no un hueco. En la barra, el perfil ES el
avatar (es donde uno lo busca) y "Salir" pasó a ser un ícono con tooltip.
Requiere correr la migración: `alter table public.profiles add column avatar`.

**Plegado por personaje.** La primera vez la hoja abre todo; después recuerda
cómo la dejaste, por personaje. Vive en localStorage y no en el registro: es
una preferencia de cómo mirás la hoja, no un dato del PJ — guardarla en la base
costaría un viaje al servidor por cada plegado y se llevaría el plegado de una
pantalla grande a un teléfono. El acordeón se registra solo por su título, así
que no hubo que tocar las diez secciones de la plantilla.

**Contraste del combo de rango.** La lista desplegada la pinta el sistema
operativo y heredaba el `background: transparent` del select, así que el texto
quedaba del color del fondo. Las `option` necesitan su propio par color/fondo.
(De paso: el componente usaba `var(--fg)`, que no existe — es `--text`.)

### 4-tervicies. Runas aplicadas

Reglas confirmadas contra la fuente Legacy (Notebook LM, 2026-08-20) y
anotadas en `rules/runas.ts`:

- **Potency**: bonus de OBJETO al ataque; no suma daño. En armadura sube el
  bonus de objeto a la CA que la armadura ya da. Entra por el pipeline, así que
  no acumula con un bonus de objeto puesto a mano — se aplica el mayor, y el
  otro se ve tachado en el breakdown.
- **Striking**: multiplica los DADOS (2/3/4 del mismo tamaño). Los planos
  —Fuerza, dotes, Weapon Specialization— quedan intactos. Un arma
  personalizada que ya declaró sus dados manda sobre la runa.
- **Resilient**: bonus de objeto a las tres salvaciones (+1/+2/+3).
- **Runas de propiedad**: las diez elementales (flaming, frost, shock,
  corrosive, thundering y sus greater) suman **una línea de daño aparte**, no
  sumada al dado del arma: las resistencias del enemigo se aplican por tipo y
  ese dado no se duplica en un crítico. Las otras 34 se listan en la ficha.

En la ficha, un arma con striking muestra los dados que se tiran de verdad
("3d8 (base 1d8)"): "1d8" al lado de "greater striking" se lee como una
contradicción.

**Pendiente**: las runas de propiedad con bonus pasivo (Shadow → +1 de objeto a
Sigilo, Slick → +1 a Acrobacias, Fortification, etc.). Son ~34 runas, cada una
con su efecto: hace falta una tabla, no una regla general.

### 4-quatervicies. Tabla de runas y descripciones rotas

**Segundo fallo del importador, más grave que el de las runas.** Los templates
de Foundry anidan corchetes (`@Damage[1d6[bleed]]`) y el patrón `\[[^\]]+\]`
cortaba en el primer `]`, dejando el otro suelto Y perdiendo el número. Por eso
la runa Wounding decía *"you deal an extra ] damage"* y los colmillos de la
anadi *"deals ] damage"*. Afectaba a **todo el dataset**, no solo a las runas.
Arreglado para `@Damage`, `@Check`, `@Template`, `@Localize`, `@Compendium` y
las tiradas en línea `[[/r (3d8+8)[healing]]]`. Quedan 13 descripciones con un
`]`, y son corchetes reales del texto ("hammers [Strength]"). Cero templates
sin resolver.

**Tabla de las 44 runas de propiedad** (`rules/runas.ts`). Los efectos salen
del texto del propio pack, no de memoria — que es justamente lo que el arreglo
de arriba hizo legible.

Lo que la tabla deja claro: **casi ninguna runa es un bonus plano que se pueda
sumar**. El +2 de Slick es solo para Escapar y Colarse; el +1 de Antimagic solo
contra magia; el 1d6 de Disrupting solo contra no-muertos. Sumarlos al total
inflaría todas las tiradas que NO cumplen la condición. Así que se clasifican:

- **Daño incondicional** (elementales, Greater Impactful, el 1d4 de fuego de
  Brilliant) → entra al cálculo, en línea aparte.
- **Daño según el objetivo** (Disrupting, Holy, Unholy, Bane, y el resto de
  Brilliant) → se muestra apagado, "(+1d6 positive vs no-muertos)".
- **Bonus situacionales** (Slick, Antimagic, Underwater) → se muestran con su
  condición escrita.
- **Efectos que se disparan en la mesa** (Keen, Speed, Returning…) → una línea
  en la ficha con lo que hacen.

Un test recorre el pack y falla si aparece una runa sin ficha, así que la tabla
no se puede quedar atrás en silencio.

### 4-quinvicies. Efectos activos (capa 1)

La furia del bárbaro, el garbo, un heroism: todo lo que se prende un rato y
mueve números. Resulta que ya lo teníamos medio resuelto —el garbo funciona
así— y lo que faltaba era generalizarlo.

**Los efectos son condiciones que elegís vos**, así que entran por el mismo
pipeline. En `computeCharacter` hay ahora un solo `situacion(selectores)` que
junta condiciones y efectos, y los 13 sitios que llamaban a
`conditionModifiers` pasan por ahí. Cada fórmula del motor los recibe sin
enterarse de cuál es cuál.

**Vienen del pack, no escritos a mano.** El importador ahora lee los cuatro
packs de efectos: **1418 efectos con sus reglas ya escritas**. El
`Effect: Panache` del pack dice literalmente lo que nosotros habíamos escrito
a mano en `panache.ts`.

Números de la cobertura: de 1073 FlatModifier, **973 tienen un selector que el
motor entiende** y **446 se aplican enteros**. Los 527 restantes no se aplican
a propósito:

- **Con predicado** (521): valen solo en cierta situación. El +1 del garbo es
  solo para Tumble Through — sumarlo a Acrobatics entero mentiría en todas las
  demás tiradas. Misma decisión que con las runas.
- **Valor por fórmula o tabla**: el de Heroism depende del rango con el que se
  lanzó. Devolver null y no aplicar nada es deliberado: un efecto que suma de
  menos se nota, uno que suma cualquier cosa no.

Todo lo que no se calcula **se avisa** al lado del interruptor ("incluye HP
temporales, que la hoja no calcula"). Se filtra el cableado interno de Foundry
(`RollOption`, `ActiveEffectLike`), que no es algo que el jugador tenga que
saber.

Verificado en vivo: Longstrider lleva a Durin de 15 a 25 ft con
`Longstrider +10` en el desglose, dos bonus de estado a velocidad no se suman
(gana el mayor), y Rage se prende avisando de los HP temporales.

**Pendiente — capa 2.** La rabia NO está en los datos: el `Effect: Rage` solo
trae los HP temporales; el +2 al daño cuerpo a cuerpo, el −1 a la CA y "mitad
si el arma es agile" Foundry los tiene en código. Van a mano en `rules/rabia.ts`,
y antes hay que confirmar por Notebook LM: si el +2 sube con el nivel, si los
HP temporales se recalculan al subir de nivel en plena furia, y si el −1 de CA
es de estado o sin tipo.

### 4-sexvicies. La furia (capa 2)

Lo que el pack no trae, escrito a mano en `rules/rabia.ts` y confirmado con la
fuente Legacy (Notebook LM, 2026-08-21):

- **+2 al daño** cuerpo a cuerpo y desarmado. **Fijo**: no sube con el nivel.
  **La mitad si el arma es agile** (+1), que es la contrapartida de poder
  atacar más veces. A distancia no suma nada.
- **−1 a la CA, SIN TIPO.** Importa: al no tener tipo acumula con todo en vez
  de competir con un bonus de objeto o de estado por el mayor.
- **HP temporales = nivel + Constitución**, fijados al entrar en furia. No se
  recalculan si sube el nivel: se asume que no se sube de nivel entre acciones
  de una aventura.

Lo que la hoja no puede impedir (no usar acciones con `concentrate`, no salir
de la furia voluntariamente, perder los HP temporales al salir) se muestra
escrito en la tarjeta.

**Se prende con el mismo `Effect: Rage` del pack**, no con un interruptor
propio: para el jugador es un efecto más de la lista, y el estado vive en un
solo lugar. La tarjeta de la hoja es un atajo para apagarla.

Verificado en vivo: CA 17 → 16, y el Puño pasa de `1d4-1` a `1d4` — **+1 y no
+2, porque el puño es agile**.

### 4-septemvicies. Efectos como pestaña, y la tabla de los escritos a mano

**Pestaña propia.** Los efectos salieron del panel apretado de arriba y son una
sección como Habilidades: una fila entera por efecto, con nombre, ⓘ, qué hace
en un renglón, y quitar. Se agregan desde el buscador de la misma sección.
Arriba queda solo el resumen (cuántos hay activos, con sus tags para apagar de
un toque). El ⓘ arma la ficha con la duración y **qué modifica ya resuelto**
(“+10 status a speed”), que es la pregunta que trae a alguien ahí.

**`rules/efectos-a-mano.ts`**: la tabla de los que el pack trae vacíos y
nosotros sí sabemos calcular. De los 1418, **1001 no traen ningún número**
porque Foundry los resuelve en código. La mayoría son narrativos de verdad,
pero unos pocos son mecánica pura y conocida. La tabla crece de a uno y solo
con reglas confirmadas: un efecto mal calculado es peor que uno no calculado,
porque el número se ve igual de cierto.

Dos formas de resolverlos:

1. **Propio**: la regla vive en su archivo de `rules/` (la furia, en `rabia.ts`).
2. **Puente**: la hoja YA lo maneja por otro lado y el efecto solo prende ese
   interruptor. **Alzar el escudo** es el caso — ya tiene su botón y su bonus de
   circunstancia; sin el puente, prenderlo desde la lista lo contaría dos veces.
   Hay un test que fija esa decisión.

**Bug encontrado al probarlo**: los personajes guardados antes de que existiera
el escudo no traen `state.shield`, y el puente reventaba con "Cannot set
properties of undefined". Blindado en el puente y normalizado en `load()`,
junto con `state.effects`.

**Próximos candidatos para la tabla** (necesitan confirmación de reglas antes):
las ~90 `Stance:` del pack, que son mecánica de clase pura y hoy quedan como
"solo texto".

### 4-duodetricies. Agregar y prender son dos cosas distintas

**La tarjeta de efectos de arriba se fue.** Todo vive en la pestaña.

**La lista es lo que tenés a mano, no lo que está pasando.** Un bárbaro deja la
furia puesta en su lista y la prende y apaga en cada pelea, sin volver a
buscarla entre mil efectos. Por eso `state.effects` pasó a
`{ id, active }`, y el motor solo cuenta los prendidos. `active` ausente
cuenta como prendido: antes estar en la lista ERA estarlo, así que los
personajes viejos siguen andando (hay test).

**El nombre es el interruptor**, con el contorno marcado cuando está prendido,
como el escudo alzado. Apagado, la fila baja de tono pero sigue ahí. `quitar`
es otra cosa: lo saca de la lista.

**Los HP temporales no se mostraban en ningún lado**, que es por qué la furia
"no subía la vida": el número se calculaba y no tenía dónde caer. Ahora el
recuadro de HP tiene su propio campo `+N temp`, editable y aparte del máximo
—no lo suben, se gastan primero—, y prender la furia lo carga con nivel + Con.
Apagarla lo pone en cero, que es la regla: al salir se pierden los que queden.

Verificado en vivo con Durin (nivel 1, Con +1): prender → CA 17→16 y **+2 temp**;
apagar → CA 17, temp 0, **y Rage sigue en la lista**; prender de nuevo → vuelve
todo; quitar → desaparece de la lista.

### 4-undetricies. HP temporales legibles, y sin tarjeta repetida

**El recuadro de HP se partía**: `9 / 21 + 2 temp` no entraba en una línea, el
`/ 21` caía abajo y "temp" quedaba cortado. Los temporales pasaron a su propio
renglón (`temporales 2`), que además los separa visualmente del máximo — que es
lo correcto, porque no lo suben.

**La tarjeta de Furia se fue.** Repetía lo que ya dice su fila en la pestaña de
efectos. Sus avisos (no usar `concentrate`, no salir voluntariamente) no se
perdieron: viven en la ficha del ⓘ.

Para eso, `EFECTOS_A_MANO` ahora lleva sus propios `avisos`, y mandan sobre los
deducidos de las reglas del pack. Si no, la ficha de Rage decía *"incluye HP
temporales, que la hoja no calcula"* — justo lo que la tabla existe para
calcular.

### 4-tricies. Las skills que da la herencia

Skilled Heritage no daba la skill que promete. La causa era el importador: el
filtro de reglas aceptaba `system.proficiencies.`, `system.saves.` y
`system.perception`, pero **no `system.skills.`**. Se descartaban **355 reglas**
en todo el dataset.

El mismo filtro explicaba el otro síntoma: Winter Orc y Battle-Ready Orc, que
entrenan una skill FIJA (Survival, Intimidation), tampoco la daban. Mismo
origen, dos formas distintas de manifestarse.

Además, **nadie leía las reglas de la herencia**: `applyRules` corría sobre los
rasgos de clase y las dotes, y la herencia quedaba afuera.

Tres piezas:

- **Importador**: `system.skills.` entra al filtro. Los paths con plantilla
  (`skills.{item|flags…rulesSelections.skill}`) se marcan como `elegida`, y los
  valores que dependen del nivel —el dataset los escribe como
  `ternary(gte(@actor.level,5),2,1)` o como brackets— se normalizan a una lista
  `porNivel` ordenada de mayor a menor, para que el motor solo busque el primer
  tramo que alcanza.
- **Motor**: aplica `skills.<slug>`, resuelve `skills.{elegida}` contra
  `build.heritageSkill`, y usa `porNivel` para el salto a experto en nivel 5.
  Siempre con `upgrade`, así que nunca baja lo que ya tenías.
- **UI**: el selector aparece en el paso de Herencia del asistente y también en
  la pestaña de Habilidades, para poder cambiarlo después. Las opciones salen
  del ChoiceSet del pack, no de una lista escrita a mano: si mañana aparece otra
  herencia así, funciona sola.

Verificado en vivo: humano + Skilled Heritage → Occultism entrenada **+3** a
nivel 1, y al poner nivel 5 pasa a experta, **+9**.

### 4-untricies. Entrenamiento repetido

La regla: si algo te entrena en una habilidad que YA tenías entrenada, elegís
otra en su lugar. Antes se perdía en silencio.

Hay **dos situaciones distintas** y se resuelven distinto, porque el jugador
tiene distinta capacidad de maniobra:

**1. Orígenes fijos** (clase + trasfondo + herencia de skill fija). No hay
ninguna perilla que tocar: un clérigo con trasfondo Acolyte recibe Religion dos
veces y no puede evitarlo. Ahí se **debe una habilidad libre**, con el porqué
escrito: *"Acolyte te entrena en religion, que ya tenías por Cleric"*. Aparece
como aviso hasta que la elegís, y el desplegable solo ofrece las que todavía no
tenés.

**2. Orígenes elegibles** (la skill de Skilled Heritage). Ahí no se debe nada:
se **avisa y se cambia la elección**, que es más directo que agregar una deuda
para compensar una decisión que se puede rehacer. El aviso va en dos lugares:
cada opción del desplegable dice *"— ya te la da Acolyte"*, y si la elegida
choca sale una advertencia en la hoja.

El aviso del desplegable sale de `sheet.skillsFijas` (skill → origen), no de
"qué skills tienen rango > 0": con lo segundo, una skill elegida por la
herencia se marcaba a sí misma, y peor, si cambiabas el trasfondo DESPUÉS de
elegirla el choque no aparecía nunca.

Las deudas se guardan en `build.skillReplacements`, con clave
`<skill>:<origen>`: si cambiás de trasfondo, la deuda desaparece y la elección
con ella, sin dejar basura.

Verificado en vivo: Human + Cleric + Acolyte → aviso de habilidad libre, se
elige Stealth y queda entrenada (+3) con el aviso apagado. Y en chuqui, elegir
Acrobatics para la herencia (que ya da Acrobat) dispara la advertencia.

### 4-duotricies. Entrenamiento repetido: dotes, y las dos mitades de la regla

La regla no da lo mismo según el rango, y eso cambia qué hace la app:

- **Repetir ENTRENADO** → ganás una habilidad entrenada libre a elección.
- **Repetir EXPERTO o superior** → **no ganás nada**: ese aumento se pierde.
  Lo único que se puede hacer es reentrenar una de las dos fuentes, así que se
  avisa nombrando a las dos.

Y un tercer caso que NO es repetición y es fácil de confundir: **subir a
experto algo que solo tenías entrenado es un aumento legítimo**. Tiene su
propio test para que no se rompa al tocar esto.

Para que las dotes entraran, las skills salieron de `applyRules` y pasaron al
pipeline de `otorgadas`, que es el único lugar donde se ve el rango de cada
otorgamiento junto con su origen. Ahora conviven ahí clase, trasfondo,
herencia, rasgos de clase y las **139 dotes** que entrenan habilidades.

Regla general que sale sola de ese diseño: *un otorgamiento de rango R es
redundante si la skill ya llegó a R o más por otro otorgamiento*. Con R = 1 se
debe una libre; con R ≥ 2 se avisa.

**Un choque consigo mismo**: al meter la herencia en el pipeline, su propia
skill elegida entraba en `skillsFijas` y se marcaba a sí misma como "ya la
tenés". Se excluye esa entrada puntual, no el mapa entero, porque una herencia
de skill FIJA (Winter Orc) sí tiene que marcar.

Verificado en vivo con un Fighter de nivel 4: dos dedications que suben
Deception a experto → queda experto una vez y sale el aviso de reentrenar; dos
dotes que entrenan Thievery → habilidad libre, se elige Arcana y queda en +6.
Los dos avisos conviven y solo desaparece el que corresponde.

### 4-tertricies. Seis huecos de edición

**Boosts de atributo.** Se elegían al crear y no se podían corregir nunca más:
un PJ que salía del asistente con boosts a medias quedaba con los atributos mal
para siempre. Dos arreglos, porque hacía falta prevenir Y curar: el asistente
**bloquea "Siguiente"** diciendo qué falta, y la pestaña de Atributos los deja
**editar**, para los que ya salieron mal. Tocar el mismo dos veces lo saca, así
no hace falta otro botón para deshacer.

**Nombre y deidad** editables desde la hoja. El nombre en el lugar; la deidad
como desplegable en la línea de la ficha.

**Clan Dagger (enanos).** Tres bugs encadenados:

1. El importador **descartaba el predicado de los GrantItem**, así que las dos
   opciones —daga y pistola— se otorgaban juntas.
2. El predicado NO siempre habla de una elección: Way of the Drifter tiene sus
   grants predicados sobre `class:gunslinger`. Enforzarlo a ciegas rompía la
   vía del gunslinger. Se mira **solo cuando el rasgo trae su propio ChoiceSet
   y el predicado nombra una de sus opciones**.
3. La pistola no apunta al arma: apunta a una DOTE que a su vez la otorga.
   Hace falta seguir **un salto** para llegar al objeto del catálogo.

El arma elegida entra al inventario de verdad, marcada con `grantedBy`, así se
equipa y tira como cualquier otra. Cambiar la elección cambia ese objeto y solo
ese.

**Additional Lore** no trae NINGUNA regla en el pack: el nombre del Lore es
texto libre que inventa el jugador. Se agrega escribiéndolo en Habilidades
(`build.extraLores`), y hay un aviso si tomaste la dote y no lo escribiste.

**La tirada** pasó a siete filas: cada número grande con su desglose justo
debajo. Antes el daño y el crítico compartían renglón con su detalle y no se
sabía qué explicaba qué. El detalle del crítico se calcula aparte, porque no es
el mismo cálculo: fatal cambia el tamaño del dado y deadly suma uno extra.

**Un fallo del banco de pruebas**, encontrado por el Clan Dagger: el
`featureById` del spec tenía solo `class-features`, mientras que la app mezcla
también `ancestry-features`. Los rasgos de ancestría eran invisibles para los
tests. Alineado.

### 4-quattuortricies. Los boosts, las elecciones y el Lore duplicado

**Boosts detrás de un botón** en la cabecera del acordeón de Atributos (el slot
`[acc-extra]` que ya existía). Son doce filas que casi nunca se tocan y
estorbaban arriba de los atributos todo el tiempo.

**Elecciones de rasgos** pasó a ser su propio acordeón, con el contador de las
que faltan en el subtítulo. Es el lugar donde van a ir las que aparezcan al
subir de nivel, en vez de repartirlas por la hoja.

**`.chip` se mudó a los estilos globales.** Vivía dentro del asistente, así que
al usarlo en la hoja salía como un botón gris del navegador. Ahora lo comparten
los dos, con las mismas reglas.

**El Lore agregado a mano se pintaba dos veces**: la fila completa —con rango,
número y favorito— y otra pelada abajo con solo el nombre. La pelada parecía
rota, porque no tenía ni el combo de rango ni el modificador. Se fue, y el
`quitar` se mudó a la fila de verdad.

El `slug()` del motor ahora se exporta y lo usa la hoja para saber qué Lore es
manual: reimplementarlo era la forma segura de que las claves se desincronizaran
con el primer nombre acentuado.

### 4-quintricies. Lo que otorgan la herencia y el trasfondo

Un enano Anvil + Deputy + Munitions Crafter destapó tres huecos, todos del
mismo tipo: **cosas prometidas por escrito que la hoja no aplicaba**.

- **`resolveGrants` nunca miraba la herencia.** Anvil Dwarf otorga Specialty
  Crafting y no aparecía en ningún lado.
- **`background.grantedFeats` no se usaba en absoluto.** Deputy da Experienced
  Tracker; el campo estaba en el modelo, importado y sin leer. Ahora los rasgos
  se agrupan también por **Trasfondo**, sin "+ Agregar": vienen con el
  trasfondo y no se sacan a mano.
- **Habilidades libres de clase.** Un gunslinger entrena 3 + Inteligencia
  además de las fijas, y si quedaban sin elegir no lo decía nadie: el personaje
  se quedaba con menos habilidades de las que le tocan, en silencio. Kaz tenía
  **4 sin usar**. Ahora hay contador y se eligen desde la hoja con un tilde,
  que es distinto de pisar el rango a mano: gasta una de las que te tocan y se
  ve en el contador.

Dos correcciones más:

- **El pack repite grants**: Anvil Dwarf trae Specialty Crafting DOS veces.
  `resolveGrants` deduplica por id.
- **El rasgo ahora dice qué elegiste**: se llamaba "Clan Dagger" aunque
  hubieras elegido la pistola, porque ese es el nombre del RASGO, no del arma.
  Pasa a leerse "Clan Dagger (Clan Pistol)", así la lista de ancestría no dice
  una cosa y el inventario otra.

### 4-sextricies. Lo que se elige, escondido; lo que se juega, a la vista

Criterio que ordena estos cambios: **lo que se decide al crear el personaje no
tiene por qué estar a la vista mientras jugás.**

- **Elecciones de habilidad detrás de un botón** en la cabecera de Habilidades,
  igual que los boosts: la de la herencia, las libres por entrenamiento
  repetido y los tildes de las libres de clase. El botón lleva un contador de
  lo que falta, para que esconderlo no sea taparlo.
- **Rasgos y dotes**: un acordeón por origen en vez de una rejilla de seis
  columnas donde no se leía nada. Cada dote ocupa la fila entera y cada grupo
  recuerda si lo dejaste abierto, porque el estado se guarda por título y los
  de adentro tienen títulos propios.

**El asistente marcaba mal las habilidades ya entrenadas.** `autoTrained` solo
miraba la clase y el trasfondo: la herencia (Anvil Dwarf → Crafting) y las
dotes (Munitions Crafter) no contaban, así que Crafting aparecía libre y se
podía gastar una elección en ella sin efecto. Ahora mira las cuatro fuentes.

**"Clan Dagger (Clan Pistol)" + "Clan Pistol" no era un duplicado**, eran dos
cosas distintas: la dote de ancestría es el *permiso* y el rasgo es lo que
recibís. Pero pedía elegir dos veces. Ahora **la dote resuelve la elección
sola** (`decididoPor`), y si el arma que te corresponde no está en la mochila
se avisa, en vez de meterla el motor por su cuenta: el motor no toca el build.

### 4-septentricies. Elecciones de rasgos, generalizadas

La auditoría del dataset: **228 ChoiceSets**, de los cuales la app resolvía dos
a mano (la habilidad de la herencia y el arma del Clan Dagger). El resto se
perdían **en silencio**, que es lo peor de esta familia de bugs: el personaje
sale mal y nadie se entera.

`rules/elecciones.ts` las detecta sola. La regla para decidir si preguntar:
**la elección tiene que mover algún número.** De las 228, la mayoría son de
sabor; preguntar por todas convertiría la hoja en un formulario. Quedan **26
ítems**: 22 de habilidad, 6 de valor y 1 de objeto.

Tres tipos, porque el pack usa la elección de tres formas distintas:

- **objeto** — el valor decide qué `GrantItem` aplica (Clan Dagger). Entra al
  inventario con `grantedBy`.
- **habilidad** — el valor va al path de un `Proficiency`
  (`skills.{item|…rulesSelections.skill}`): Skill Training, las dedications.
  Lo aplica el mismo pipeline de otorgamientos, así que **entra en la detección
  de entrenamiento repetido** sin nada extra.
- **valor** — un dato suelto que otras reglas referencian (Specialty Crafting,
  Terrain Expertise, el `keyAbility` de las dedications).

Detalles que costaron encontrarse:

- **Un predicado referencia la elección de dos formas**: nombrando una opción
  (`"clan-pistol"`) o con la plantilla `{item|flags…rulesSelections.x}`.
  Mirando solo la primera se quedaba afuera Specialty Crafting — justo la dote
  que el Anvil Dwarf del usuario tenía puesta.
- **Las etiquetas del pack son claves de i18n** (`PF2E.Skill.Acrobatics`). Se
  usa el último tramo, y si coincide con una habilidad se usa su nombre real.
  Cuando la opción otorga un objeto, gana el nombre del objeto.
- **Pocas opciones van como chips, muchas como desplegable**: las 16
  habilidades en chips ocupaban cuatro renglones por fila.

Verificado en vivo: Specialty Crafting apareció sola en el enano que ya la
tenía por Anvil Dwarf, y Skill Training pide la habilidad, avisa mientras
falta, y al elegir Occultism la deja entrenada en +3 con el aviso apagado.

### 4-duodequadragies. Las elecciones que no sabemos ofrecer

Quedaban **72 ChoiceSets** que el pack describe con un filtro sobre otro pack
entero: *"una dote general de nivel 7 o menos"*, *"una ancestría común que no
sea la tuya"*. El filtro es un mini lenguaje de predicados —`item:trait:general`,
`{lte: ["item:level", 7]}`, `{not: …}`, `{or: […]}`, con plantillas
`{actor|…}`— así que ofrecerlas pide un evaluador.

**Avisarlas no pide nada de eso.** El importador ahora marca esos ChoiceSet
como `abierta`, con el `tipoDeItem` cuando el pack lo dice, y la hoja avisa:

> *"Adopted Ancestry te hace elegir una ancestría, y la hoja todavía no sabe
> ofrecer esa lista: anotalo aparte."*

Se avisan **todas**, sin filtrar por consecuencia, al revés que las resolubles:
ahí las opciones están del otro lado del filtro y no se puede saber si mueven
números. Con la duda, mejor nombrarla.

El aviso se puede marcar como resuelto, como cualquier otro, para el que ya lo
anotó en su ficha de papel.

### 4-undequadragies. Buscar en el texto, Fleet, y la mochila

**Buscar por descripción además de por nombre** (`rules/buscar.ts`), en los tres
buscadores: dotes, objetos y efectos. Buscar solo por nombre obliga a saber cómo
se llama lo que buscás; escribir "firearm" y no encontrar nada, con treinta
dotes que hablan de armas de fuego, es la diferencia entre un catálogo y un
índice. El nombre pesa más que el texto —si escribís "fleet" querés la dote
Fleet primero— y los que entran por descripción se marcan **"en el texto"**,
porque si no parecen ruido.

**Fleet no era ni el dataset ni el importador.** La regla estaba bien
importada: `FlatModifier land-speed +5`. Lo que faltaba era que **el motor
nunca consumía los `FlatModifier` de rasgos y dotes** — solo los de condiciones
y efectos. Eran **116 modificadores perdidos**, 42 de ellos a salvaciones, 14 a
velocidad.

El arreglo reusa la maquinaria de los efectos: el pack los escribe igual y el
vocabulario de selectores es el mismo, así que `modificadoresDeReglas` sirve
para los dos. Se excluyen `damage` e `initiative`, que el motor ya resuelve por
su cuenta (uno sabe de grupos de arma, el otro del predicado de Percepción) y
si no se contarían dos veces.

**Y un bug escondido detrás**: `esAplicable` descartaba toda regla con
`predicate`, pero el importador de dotes SIEMPRE escribe `predicate: []`, y un
array vacío es truthy. Fleet quedaba descartada como si tuviera condiciones. Los
efectos no lo notaban porque su importador omite el campo cuando está vacío.

**La carga: la fórmula estaba bien, faltaba la mochila.** 5 + Fuerza y 10 +
Fuerza son los números del CRB. Lo que faltaba lo dice el propio pack en el
campo que no importábamos: `capacity: 4, ignored: 2` — *"sostiene hasta 4 de
bulk y los primeros 2 no cuentan"*. Sobre un presupuesto de 6, eso es un tercio.

No se modela QUÉ hay dentro de cada contenedor: el alivio se aplica contra lo
que llevás **guardado** (lo no equipado), que es lo que puede estar en la
mochila. La armadura puesta y el arma en la mano no reciben alivio, y una
mochila guardada no alivia nada.

## Fase 2 — la mesa

Rediseño de la interfaz de partidas, decidido en brainstorm (2026-08-22):

- **`/parties/:id`** sigue siendo la sala: invitación, quiénes están, tu
  personaje. Suma un botón **"Sentarse a la mesa"**.
- **`/parties/:id/mesa`** es donde se juega: chat fijo a la izquierda, lienzo
  con ventanas flotantes en el medio, botonera a la derecha.
- **`/parties/:id/ventana/:tipo`** será una ventana sacada afuera. No es una
  ventana especial: es el mismo componente renderizado solo, así que
  `window.open` alcanza y no hay mensajería entre ventanas.

Las ventanas —personaje, notas, dados— se arrastran y se redimensionan, y su
posición se guarda por partida en localStorage, igual que el plegado de los
acordeones: es cómo mirás vos, no un dato de la partida.

### Entrega 1: chat y tiradas

**El chat y las tiradas son la misma tabla.** `party_messages` con
`kind: texto | tirada` los ordena juntos en el tiempo sin cruzar consultas. La
tirada se guarda como el `RollResult` entero en jsonb, no como texto armado:
así el chat la pinta con el mismo formato de siete filas que la hoja, y si
mañana cambia el cálculo, lo que quedó en el historial sigue diciendo lo que
dijo esa noche.

**La visibilidad se filtra en RLS, no en el cliente.** Una tirada privada que
igual viaja al navegador del otro no es privada.

**Cuándo se publica:** si el personaje está en una mesa, siempre. Se evaluó
detectar "la mesa está abierta" con una señal en localStorage, y se descartó:
agregaba una asimetría entre la hoja normal y la sacada afuera, y no funcionaba
entre dispositivos. Una regla sola —*si el PJ está en una partida, sus tiradas
se ven*— se explica en una frase y anda igual desde el teléfono. El costo
conocido: probar tiradas fuera de sesión deja rastro en el historial. Como
publicar es **una sola función**, agregar después un "no publicar" es tocar un
lugar; al revés habría sido desarmar plomería en tres.

**El enganche es un `effect` sobre `lastRoll`**, no una llamada en cada tirada:
hay doce cosas que tiran y la trece se publicaría sola sin que nadie se entere
de que existe el chat.

### Entrega 2: el lienzo y las ventanas

**La ventana sacada afuera no es un componente aparte.** `/parties/:id/ventana/:tipo`
renderiza el mismo panel sin el marco, y la mesa hace `window.open` a esa URL.
Lo que muestre sincroniza por el servidor —igual que el chat— así que no hay
mensajería entre ventanas, y funciona igual si la abrís en otra máquina.

**Antes de escribir el panel del PJ se extrajo `rules/tiradas.ts`.** El multiple
attack penalty y el cálculo del crítico vivían dentro del componente de la
hoja; había dos lugares que iban a tirar lo mismo. Ahora los dos usan las
mismas funciones y la hoja quedó más corta.

**La vista de juego no es la hoja recortada por espacio**: es lo que se toca en
una pelea —HP, CA, percepción, salvaciones, ataques con sus tres números,
habilidades entrenadas— y un botón a la hoja completa. Lo que se decide una
sola vez no está.

En la mesa, sus tiradas van al chat y **no** se muestran en un cartel: el chat
está siempre a la vista y sería la misma cosa dos veces.

Tres cosas que aparecieron al probar:

- **Reentrancia al abrir el chat.** Entre el `await` del select y el
  `subscribe()` hay una ventana donde una segunda llamada pasaba el guardia
  —`canal` todavía era null— y terminaba agregando callbacks a un canal ya
  suscripto: *"cannot add postgres_changes callbacks after subscribe()"*. Se
  arregla con un flag puesto ANTES del primer await.
- **Ventanas fuera de alcance.** Los tamaños por defecto asumen pantalla
  grande; en un lienzo chico la mitad derecha —con el agarre para
  redimensionar— quedaba inalcanzable. Un `ResizeObserver` las mete adentro. Con
  observador y no una sola vez: al primer render el grid todavía no repartió el
  ancho, así que medir ahí da un lienzo más grande del real.
- **La tirada suelta no mostraba el total.** Mandaba el desglose en el campo
  `save` "porque el hueco estaba libre", y el chat la trataba como una
  salvación. Ahora tiene su propio `detalle`.

### Entrega 3: las notas

**Una nota, un icono.** `➕ Nota` crea y abre de una. A partir de ahí esa nota
es su propio botón en la botonera, con el título completo en el tooltip y las
primeras letras como rótulo. La columna scrollea.

**El orden por uso es de cada uno**, no de la mesa: vive en localStorage junto
con la posición de las ventanas. Que yo abra la nota del sheriff no tiene por
qué reordenarle los botones a los demás.

Cada nota es una ventana más, así que heredó arrastrar, redimensionar y sacar
afuera sin código nuevo: `VentanasService` pasó de tres tipos fijos a claves
abiertas (`nota:<id>`). Nacen escalonadas — abrir tres seguidas y que queden
apiladas obliga a mover dos antes de leer nada.

**El choque de edición se rehízo después de probarlo, y ese fue el hallazgo.**
La primera versión avisaba mirando los eventos de Realtime: si llegaba un
cambio ajeno mientras tenías texto sin guardar, no se pisaba el textarea. En la
prueba **se perdió un borrador igual**, porque esa protección solo cubría los
800 ms entre que dejabas de escribir y se guardaba. Dos personas editando la
misma nota durante un minuto se pisaban en silencio.

Ahora el choque lo detecta **la base de datos**: el update lleva
`.eq('updated_at', base)`, y si alguien se adelantó no afecta ninguna fila. Se
avisa con lo tuyo intacto en el textarea y dos salidas: *descartar lo mío* o
*guardar igual*. Pisar lo del otro lo decide el jugador, nunca la app.

Verificado forzando el solapamiento real —un PATCH directo a PostgREST mientras
el textarea tenía un borrador— porque los pasos de la automatización tardan más
que el guardado y nunca se cruzaban solos.

Dos correcciones más del camino: un evento de Realtime viejo ya no pisa una
fila más nueva (el INSERT de una nota recién creada puede llegar después de tu
primer UPDATE y traía el cuerpo vacío), y la ruta de la nota suelta recibe su
`tipo` por `data` porque el segmento de la URL lo ocupa el id.
