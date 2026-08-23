# Roadmap

Qué anda y qué falta, para poder retomar el proyecto sin releer el código.

El **por qué** de cada decisión —las reglas verificadas, los bugs y qué los
causaba— está en [BITACORA.md](BITACORA.md). Acá va solo el estado.

---

## Qué anda hoy

### El personaje

- **Creación de nivel 1 a 20** para todas las clases marciales, los lanzadores
  espontáneos (Sorcerer, Bard) y los preparados (Wizard, Cleric, Druid), con
  arquetipos y multiclase.
- **La hoja** con el desglose de cada número, tiradas de chequeo y de ataque
  —con daño y crítico—, condiciones y efectos activos.
- **Todo se corrige desde la hoja**, no solo al crear: nivel, atributos y sus
  boosts, nombre, deidad, habilidades de clase, lores escritos a mano, rangos de
  proficiencia, armas y armaduras personalizadas, ataques naturales, retrato.
- **Reglas que calcula**: runas (potencia, striking, resilient, elementales),
  entrenamiento repetido, elecciones que abren los rasgos, la furia del bárbaro,
  el garbo del swashbuckler, carga con el alivio de los contenedores.
- **El importador** trae el dataset Legacy completo, incluidos los 1418 efectos.

### La mesa

- **Partidas**: crear, invitar por link con token, sentarse con un personaje.
- **La mesa** (`/parties/:id/mesa`): chat en vivo con las tiradas de todos, y un
  lienzo con ventanas flotantes —personaje, dados, notas— que se arrastran, se
  redimensionan y se sacan a su propia pestaña.
- **Las tiradas de la hoja llegan solas** a la mesa donde está ese personaje,
  desde donde sea que la tengas abierta, con la visibilidad que elijas.
- **Notas compartidas**, cada una con su icono, y con aviso cuando dos personas
  editan la misma.

### Perfil y despliegue

Nombre y avatar por usuario. Netlify sirve los archivos; Supabase hace de base,
auth y Realtime. No hay servidor propio.

---

## Qué falta

Dos listas distintas: **funcionalidad** (lo que la app todavía no hace) y
**escalabilidad** (lo que va a hacer que agregar esa funcionalidad cueste caro).
Si vas a encarar varias cosas de la primera lista, conviene hacer antes E1 y E2.

### 1. El máster ve las hojas

Lo más pedido de lo que queda, y **el cambio más delicado del proyecto**: hoy la
policy de `characters` es `auth.uid() = user_id` y nada más. Abrirla al máster
de la mesa donde está sentado ese personaje toca la privacidad de todos.

- [ ] Policy de lectura para el máster
- [ ] Vista de solo lectura de la hoja
- [ ] **Verificar con dos cuentas reales** que un jugador no ve la hoja de otro

Conviene escribir la policy, probarla y recién después usarla.

### 2. Voz y video

- [ ] WebRTC entre navegadores, con Supabase Broadcast como señalización
- [ ] **Necesita un servidor TURN**, que no es gratis: sin él, dos jugadores
      detrás de ciertos routers no se conectan. Alternativa: LiveKit, Daily o Jitsi
- [ ] En malla directa aguanta 4 o 5 personas; más pide un servidor que mezcle

### 3. Deudas de reglas

Cosas que la hoja hoy no calcula, o calcula sin haber confirmado la fuente.

- **Condiciones con efecto numérico que salen como "solo texto"**: blinded
  (−4 a Percepción), encumbered (clumsy 1 y −10 pies), confused (flat-footed),
  dying/wounded. La de encumbered se avisa pero no se aplica.
- **Tope de skill increase por nivel** (experto desde 3, maestro desde 7,
  legendario desde 15): se avisa, no se bloquea.
- **Runas de propiedad con bonus pasivo** (Shadow, Slick, Fortification y unas
  30 más). Las 10 elementales sí se calculan; el resto se listan. Cada una es un
  efecto distinto: hace falta una tabla escrita a mano, no una regla general.
- **Stances**: unas 90 en el pack, todas como "solo texto". Foundry las resuelve
  en código, así que van a `rules/efectos-a-mano.ts` de a una y con la regla
  confirmada.
- **`MartialProficiency` con predicado** (Fighter Weapon Mastery sobre el grupo
  elegido).
- **El multiple attack penalty** (−5/−10, −4/−8 con agile) se escribió a mano y
  nunca se confirmó contra la fuente Legacy.
- **El puño** usa las estadísticas por defecto (1d4 contundente,
  agile/finesse/nonlethal): es lo único de la hoja que no sale ni del dataset ni
  de una fuente verificada.
- **Compañero animal y familiar** (Druid, Ranger, Witch).
- **Alchemist y Kineticist**: subsistemas propios, cada uno es un proyecto.

### 4. Elecciones que no sabemos ofrecer

Hay **72 ChoiceSets** que el pack describe con un filtro sobre otro pack entero
(*"una dote general de nivel 7 o menos"*). Hoy **se avisan** pero no se ofrecen;
resolverlas pide un evaluador de esos predicados.

Aparte, el **linaje dracónico** no ofrece el tipo de dragón. Ya no es porque la
lista esté embebida —eso se resuelve— sino porque ninguna regla del rasgo
referencia la elección, así que el detector la considera de sabor. El tipo de
dragón cambia el daño de los conjuros del linaje, que viven en otro lado.

### 5. Deudas de datos e infraestructura

- **El plan gratis de Supabase pausa el proyecto tras una semana sin actividad.**
  Una mesa quincenal lo va a encontrar pausado; se despausa a mano desde el
  dashboard.
- **Las habilidades no tienen descripción**: no hay `skills.json` en el pack.
  Entra en el overlay (E3).
- **`invested`** está en el modelo y no lo lee nadie: los objetos que hay que
  invertir no están modelados.
- Las descripciones viajan en `<pack>-desc.json` y se bajan bajo demanda: abrir
  una hoja son 1,2 MB comprimidos en vez de 3,1. Ver la bitácora.
- Quedan **13 descripciones** con un corchete suelto, y son corchetes reales del
  texto ("hammers [Strength]"), no un fallo del importador.

---

## Escalabilidad

Dónde va a doler agregar lo que falta, medido y no supuesto. Están en orden de
lo que más traba.

### E1. Partir `computeCharacter`

**Hoy son 1049 líneas en una sola función, con 90 `const` cruzándose.** Es el
corazón del proyecto y el lugar donde aterriza *cada* regla nueva: las runas,
la furia, los contenedores y el entrenamiento repetido entraron todos ahí. Cada
una lo dejó un poco peor.

Las costuras ya existen: dieciséis bloques marcados con comentarios (`--- CA`,
`--- skills`, `--- strikes`…). El más grande, strikes, son 257 líneas.

**El plan**: una tubería de etapas con un contexto explícito.

```
computeCharacter(build, state, content)
  → contexto base (clase, ancestría, nivel, mods, efectos)
  → etapas: defensas, skills, strikes, conjuros, carga, avisos
  → hoja
```

Cada etapa recibe el contexto y devuelve su pedazo. Lo que hoy es una variable
suelta a mitad de la función pasa a ser una entrada declarada.

**Cómo se hace sin romper nada**: de a un bloque, corriendo los tests entre
cada uno. Los 210 tests miran la salida de la hoja, no la forma de la función,
así que un refactor que preserve los números se verifica solo. Se empieza por
los independientes —dinero, carga, idiomas— y se termina por strikes, que es el
que más cosas toca.

**Se sabe que funcionó** cuando ninguna etapa pasa de 150 líneas y agregar una
regla nueva significa tocar un archivo, no buscar en mil.

### E2. Partir la hoja

**2219 líneas de TypeScript, 2223 de plantilla, 88 métodos y 54 señales** en un
solo componente. Cada sección nueva lo agranda, y ya cuesta encontrar dónde
vive algo.

Las costuras también existen y son los acordeones: Favoritos, Efectos,
Atributos, Habilidades, Rasgos y dotes, Armadura, Ataques, Inventario. Cada uno
puede ser un componente que recibe la hoja calculada y emite qué cambió.

Se gana además algo concreto: **la vista de juego de la mesa podría reusar esos
componentes** en vez de tener su propia versión reducida, que hoy es código
paralelo esperando divergir.

Empezar por Inventario o Rasgos y dotes, que son los más autónomos.

### E3. El overlay: nuestros propios datos

**No está descartado — es esto.** Y conviene separarlo de la idea de forkear:

- **Forkear** el pack (copiar los 15 MB y editarlos) queda descartado: perdés
  las correcciones de aguas arriba y mantenés todo el repo para cambiar 200
  entradas.
- **El overlay** es un archivo nuestro, chico, que el importador aplica encima
  del pack. Eso sí va.

**Y ya existe**: `runas.ts`, `efectos-a-mano.ts`, `rabia.ts`, `panache.ts` y
`conditions.ts` son el dataset propio, solo que escrito en TypeScript. E3 no es
construirlo, es **mudarlo a datos** cuando el volumen lo justifique.

#### Qué entra

Dos grupos, por razones distintas:

**1. Lo que Foundry resuelve en código** y por eso no está como dato en ningún
lado. Es el grueso: ~90 stances, ~34 runas de propiedad con bonus pasivo, la
furia, el MAP.

**2. Lo que no existe en ningún pack.** Más chico pero igual de real:

- Las descripciones de las 16 habilidades: no hay `skills.json`, habría que
  traerlas de Archives of Nethys.
- La dureza y los PV de la armadura: el pack los trae en cero porque Foundry los
  deriva del material en tiempo de ejecución. Los escudos sí los traen.
- Las estadísticas del puño, hoy lo único de la hoja sin fuente verificada.
- El tipo de dragón del linaje dracónico, que define el daño de sus conjuros y
  no está enlazado en el dato.

#### Qué NO entra

El **comportamiento**. Que la furia dé la mitad con un arma agile, que striking
multiplique dados, que el crítico con fatal cambie el tamaño del dado: eso son
funciones, no filas. Las tablas se mudan; la lógica se queda en `rules/`.

#### Cómo se enchufa

Un archivo por tipo en `overlay/`, aplicado por el importador después de mapear
el pack y antes de escribir el JSON. Con eso:

- el overlay se ve en un diff, separado de los 15 MB del pack;
- se valida contra un esquema, así una entrada mal escrita falla al importar y
  no en la mesa;
- se puede citar la fuente de cada regla en el propio dato, que es lo que hoy
  vive suelto en un comentario.

#### Cuándo

**Después de E1.** El lugar donde el overlay se enchufa —dónde el motor lee una
regla— es justamente lo que E1 ordena; hacerlo antes es mudar código dos veces.

Y se arranca por **una sola stance de tu mesa**, no por las 90: que el formato
lo decida un caso real y no una tabla vacía. Con la primera hecha, las demás son
copiar la fila.

### E4. Partir el spec

**2350 líneas**, y crece con el motor. Se parte siguiendo a E1: un spec por
etapa. Sin esto, cada regla nueva es más difícil de ubicar en el archivo que de
escribir.

### Lo que NO hay que hacer todavía

- **Un backend para el dataset.** Hoy el dato es de solo lectura, va versionado
  con la app y anda sin conexión. Un backend cambia búsqueda local instantánea
  por una ida y vuelta por consulta y agrega una pieza móvil a un proyecto que
  no tiene servidor propio. Cuando aparezca una razón real —compartir el
  dataset con otra app, o editarlo sin desplegar— se reevalúa.
- **Reescribir el importador.** Anda, está probado y los bugs que tuvo eran de
  a una línea. No confundir "le encontramos seis fallos" con "está mal hecho":
  los seis eran filtros de más, no arquitectura.

---

## Cómo se trabaja acá

1. **El dataset manda.** Antes de escribir una regla, buscarla en
   `.data-source/packs/`. Casi siempre el dato está y lo que falta es leerlo:
   pasó con las runas, las skills de herencia, `grantedFeats`, los contenedores
   y 116 modificadores de dotes.
2. Si de verdad no está, se consulta la fuente Legacy del proyecto **antes** de
   escribir el número. Nunca de memoria.
3. **Los tests van contra el JSON importado**, no contra fixtures inventados: si
   el importador rompe algo, tienen que agarrarlo.
4. **Un cálculo que no se puede hacer bien no se hace**: se avisa. Un número
   inventado se ve igual de cierto que uno correcto.
5. Lo que se decide una vez al crear el personaje va **detrás de un botón**; lo
   que se usa jugando queda a la vista.

## Migraciones pendientes de correr

Ninguna. `supabase/schema.sql` está aplicado hasta las notas de la mesa.
