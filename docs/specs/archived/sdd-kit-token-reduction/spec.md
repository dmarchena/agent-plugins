# Spec: sdd-kit — reducción de consumo real de tokens

## Purpose

Ejecutar el flujo sdd-kit (spec → plan → exec → verify) cuesta más tokens de
lo necesario: el coste dominante es el **rearrastre de contexto** (en el
executor el 97% del input son cache_read), es decir nº de viajes × tamaño de
contexto por viaje. Medido sobre 30 días en este repo, plan-executor es el
sumidero (13M tok, 93k/call, 140 llamadas) y verify el mayor por llamada
(113k). Esta feature aplica tres palancas concretas para bajar el consumo
real sin cambiar lo que producen las skills: adelgazar el contexto fijo que
cargan, hacer menos viajes en el loop de ejecución y evitar que salidas
verbosas inunden el orquestador. Va dirigida al usuario que corre estas
skills a diario y quiere que cada tarea pequeña salga más barata.

## Scope

**In scope:**
- Adelgazar los `SKILL.md` de las cuatro skills (spec-writer, plan-writer,
  plan-executor, verify) moviendo detalle de referencia a `assets/` leídos
  on-demand, sin perder ninguna regla de comportamiento.
- Reducir los viajes orquestador↔script en el loop del executor cerrando un
  batch entero de tareas paralelas en una sola invocación de `complete`.
- Filtrar la salida verbosa de un re-run de test fallido antes de que llegue
  al orquestador (solo líneas de fallo, con tope duro), sin alterar el
  veredicto pass/fail.

**Out of scope (non-goals):**
- Corregir el sesgo del estimador (`estimated_tokens`) ni el umbral del
  budget pause 2×. Reducir el consumo real NO garantiza que la previsión deje
  de quedarse corta; eso es otra feature.
- Handoff / `/clear` entre etapas para no rearrastrar contexto entre skills
  (medida descartada en esta spec).
- Reasignar modelos/effort por tarea (plan-writer ya aplica austero-primero).
- Overhead de MCP, plugins de code-intelligence o CLAUDE.md: no aplican al
  runtime de este plugin.

## Functional Requirements

### R1 — Contexto fijo mínimo por skill

Depende de: —

The system SHALL reducir el cuerpo siempre-cargado de los `SKILL.md`
moviendo secciones de referencia (catálogos, procedimientos largos
específicos de una rama, ejemplos) a `assets/` referenciados desde el punto
de decisión exacto donde se necesitan, de modo que ninguna regla de
comportamiento se pierda ni deje de ser alcanzable.

#### R1.S1 — Adelgazado agregado sin regresión
- GIVEN los cuatro `SKILL.md` actuales (702 líneas sumadas: 233+203+177+89)
- WHEN se aplica el adelgazado moviendo referencia a `assets/`
- THEN la suma de líneas de los cuerpos siempre-cargados es ≤ 491 (≥30% menos)
- AND cada ancla de la lista de reglas invariantes de cada skill (capturada
  del SKILL.md antes de adelgazar) sigue presente en el cuerpo del SKILL.md o
  en un asset que este referencia por ruta

#### R1.S2 — Contenido movido sigue alcanzable
- GIVEN una sección de referencia trasladada de un `SKILL.md` a un `asset`
- WHEN se lee el `SKILL.md` en la rama de decisión que la usaba
- THEN el `SKILL.md` referencia explícitamente ese `asset` en ese punto
  (ruta del fichero), de forma que el contenido se carga cuando la rama se
  activa y no queda huérfano

### R2 — Menos viajes en el loop del executor

Depende de: —

The system SHALL cerrar un batch de tareas paralelas (≤3) con una sola
invocación de `complete` en lugar de una por tarea, manteniendo intactos el
commit y el estado atómicos de cada tarea.

#### R2.S1 — Batch cerrado en una llamada, resultado idéntico
- GIVEN un plan-fixture con un batch de N (2–3) tareas paralelas ya ejecutadas
- WHEN el orquestador cierra el batch con una única invocación de `complete`
- THEN el nº de invocaciones orquestador↔script para cerrar el batch es 1
  (estrictamente menor que las N del comportamiento actual)
- AND cada tarea queda con su propio commit y su propia entrada de estado,
  byte-idénticos a los que producía el cierre tarea-a-tarea

#### R2.S2 — Fallo de una tarea no contamina el resto del batch
- GIVEN un batch donde una de las N tareas no alcanza verde reproducible
- WHEN se cierra el batch en una sola invocación
- THEN las tareas verdes del batch se commitean y registran igualmente, y la
  fallida se reporta como `not-done` con su `incidencia`, sin revertir ni
  bloquear a las demás

### R3 — Salida verbosa acotada al orquestador

Depende de: —

The system SHALL recortar la salida de un re-run de test fallido antes de
devolverla al orquestador, conservando las líneas de fallo/aserción con un
tope duro, sin alterar nunca el veredicto pass/fail.

#### R3.S1 — Re-run fallido recortado
- GIVEN un test que falla y emite un log extenso (p.ej. >200 líneas)
- WHEN el script re-ejecuta el test y devuelve `rerun_output`
- THEN `rerun_output` contiene solo las líneas de fallo/aserción y está
  acotado a ≤ 50 líneas, preservando la línea de aserción/fallo que permite
  diagnosticar

#### R3.S2 — El filtrado no cambia el veredicto
- GIVEN el mismo re-run fallido con log extenso
- WHEN se aplica el recorte de `rerun_output`
- THEN el `status`/veredicto devuelto sigue siendo `not-done`
  (`rerun-failed`), idéntico al que se daría sin recorte; un test que pasa
  sigue reportándose como verde

### R-E2E — El flujo exec corre más barato sin cambiar su resultado

Depende de: R1, R2, R3

The system SHALL ejecutar un plan de extremo a extremo con las tres palancas
activas produciendo el mismo resultado verde y committeado que hoy, con
menos viajes y menos volumen de salida.

#### R-E2E.S1 — Ejecución completa con las tres palancas
- GIVEN un plan-fixture con varios batches (incluido uno con un fallo que
  reintenta) sobre los `SKILL.md` ya adelgazados
- WHEN el executor lo corre hasta `complete`
- THEN todas las tareas quedan verdes y committeadas igual que en el
  comportamiento actual, el total de invocaciones orquestador↔script es
  estrictamente menor que el baseline y ningún `rerun_output` supera el tope
  de 50 líneas

## Technical Requirements

- **Stack / framework:** Node.js ESM; scripts `.mjs` bajo `scripts/` y
  `scripts/exec/`; tests con `node --test` vía `test/run.mjs`.
- **Integraciones:** N/A (sin red; todo local).
- **Rendimiento:** el objetivo es tokens, no latencia; medible como líneas de
  SKILL.md (R1), nº de invocaciones script en un fixture (R2, R-E2E) y
  longitud de `rerun_output` (R3).
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** `execution_plan.json` permanece inmutable y
  byte-idéntico a la salida de plan-writer; `execution_state.json` conserva
  su esquema (`assets/execution_state.schema.json`). R2 no altera el
  contenido del commit ni del estado, solo cómo se agrupan las llamadas.
- **Restricciones adicionales:** no tocar la semántica de los subcomandos
  existentes más allá de lo que exigen R2/R3; los AC de auto se verifican con
  el harness `node --test` ya presente.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — sumar las líneas de los cuerpos de los 4 SKILL.md da ≤ 491
- [ ] AC2 → R1.S1 [auto] — inventario de reglas: una lista fija de anclas de comportamiento por skill (capturada del SKILL.md antes de adelgazar) sigue apareciendo, cada una, en el cuerpo del SKILL.md o en un asset que este referencia por ruta
- [ ] AC3 → R1.S2 [auto] — cada asset creado a partir de contenido movido aparece referenciado por ruta en su SKILL.md de origen
- [ ] AC4 → R2.S1 [auto] — fixture: cerrar un batch de N tareas hace 1 invocación de `complete`; commits y entradas de estado byte-idénticos al cierre tarea-a-tarea
- [ ] AC5 → R2.S2 [auto] — fixture con 1 tarea fallida en el batch: las verdes se commitean, la fallida vuelve `not-done` con incidencia, sin revertir las demás
- [ ] AC6 → R3.S1 [auto] — fixture con log >200 líneas: `rerun_output` ≤ 50 líneas y contiene la línea de aserción/fallo
- [ ] AC7 → R3.S2 [auto] — mismo fixture: veredicto `not-done`/`rerun-failed` idéntico con y sin recorte; un test verde sigue verde
- [ ] AC-E2E → R-E2E.S1 [auto] — fixture multi-batch: termina `complete` con todas verdes/committeadas, total de invocaciones script < baseline y ningún `rerun_output` > 50 líneas

## Assumptions & Open Questions

- Se asume que mover secciones de referencia a `assets/` no degrada el
  triggering ni el comportamiento de las skills mientras el `SKILL.md`
  mantenga el esqueleto de decisión y referencie cada asset en su rama. El
  gate mecánico es AC2: la lista de anclas invariantes por skill se captura
  del SKILL.md ANTES de adelgazar (parte del cambio) y el test verifica que
  ninguna se pierde. Es un proxy anti-borrado, no una prueba de equivalencia
  semántica.
- El objetivo de reducción de R1 es agregado (≥30% sobre 702) para permitir
  recortar más donde es seguro y menos donde comprometería la ejecución; si
  alcanzar el agregado obligara a eliminar una instrucción esencial, manda la
  no-regresión (AC2) y se acepta menos recorte en esa skill.
- **Diferido a spec futura (4ª palanca):** el catálogo `agent-roles.md`
  ruta 4 de 6 roles a `general-purpose` (el subagente caro), que domina el
  consumo histórico. Como Claude Code no ofrece un escritor ligero (solo
  `Explore`, read-only), la reforma se limita a rutar tareas read-only a
  `Explore` y usar `haiku` para escrituras mecánicas, con verificación floja
  (validador de tripletas de catálogo). Payoff modesto → se aborda en su
  propia spec, fuera de esta.
- Baseline de viajes de R2/R-E2E = el nº de invocaciones script del
  comportamiento actual sobre el mismo fixture, capturado antes de aplicar el
  cambio.
