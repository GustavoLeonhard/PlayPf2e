# Roadmap

Estado y próximos pasos. La idea es poder retomar el proyecto sin releer todo el código.

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
