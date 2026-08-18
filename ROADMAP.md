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
- El puño usa las estadísticas por defecto (1d4 contundente, agile/finesse/nonlethal): es lo único
  de la hoja que no sale ni del dataset ni de una fuente Legacy verificada.

## Cómo verificar que algo está bien

1. El dataset manda: antes de escribir una regla, buscarla en `.data-source/packs/`.
2. Si no está en el dataset, se consulta AoN **confirmando que sea Legacy** (ver README).
3. Los tests van contra el JSON importado, no contra fixtures inventados.
