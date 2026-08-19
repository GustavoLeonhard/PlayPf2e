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

La armadura ya estaba completa: bonus a la CA, tope de Destreza, penalidad de chequeos (que se
ignora si cumplís el requisito de Fuerza) y penalidad de velocidad.

Pendiente: contenedores (mochilas que reducen bulk), runas aplicadas a objetos, y aplicar
automáticamente los efectos de *encumbered* (clumsy 1 y −10 pies): hoy se avisa, no se aplica.

### 4-bis. Armas personalizadas  ✅ HECHO (fuera de orden, a pedido)

- [x] `build.inventory[].custom` con nombre, dados, tipo de daño, bonus de ataque/daño, traits y notas
- [x] Los bonus entran como bonus de objeto al pipeline (aparecen en el breakdown)
- [x] Foto del arma base dentro del custom, para sobrevivir a una reimportación
- [x] Editor en la hoja, sobre cualquiera de las 779 armas

Pendiente: crear un arma de cero (hoy siempre parte de una del dataset), y las runas
(`Striking`, `Weapon Potency`) que existen como items pero no se aplican.

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
