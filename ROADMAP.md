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
  Haría falta importarlas de Archives of Nethys.
- **`invested`** está en el modelo y no lo lee nadie: los objetos que hay que
  invertir no están modelados.
- Quedan **13 descripciones** con un corchete suelto, y son corchetes reales del
  texto ("hammers [Strength]"), no un fallo del importador.

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
