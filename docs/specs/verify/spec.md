# Spec: verify (sdd-kit, fase verify)

## Purpose

Cuarta y última fase del flujo sdd-kit (spec → plan → exec → **verify**): una skill que
comprueba, contra el checklist plano de Acceptance Criteria del `spec.md`, si una feature
ejecutada por plan-executor está realmente terminada, y si lo está, archiva sus artefactos
(`spec.md`, `execution_plan.json`, `execution_state.json`) fuera del camino activo de
`docs/specs/`. Resuelve un problema concreto ya observado: las specs completadas y mergeadas
del propio plugin (plan-writer, plan-writer-test-contract, plan-executor) siguen en
`docs/specs/` sin archivar porque el `git mv` a `docs/specs/archived/<slug>/` que fija
ADR 0001 nunca se hizo — hasta ahora era un paso manual que nadie ejecuta.

## Scope

**In scope:**
- Cargar `spec.md`, `execution_plan.json` y (si existe) `execution_state.json` de un
  `docs/specs/<slug>/`.
- Re-ejecución determinista (ground check) del comando de test guardado por cada tarea `done`,
  para confirmar que el AC `[auto]` que satisface sigue verde y detectar drift.
- Confirmación humana explícita, uno a uno, de cada AC marcado `[manual]` en el spec.
- Degradación de todo el checklist a confirmación manual cuando no existe
  `execution_state.json` en el `SPECDIR`.
- Detección de AC no verdes por tarea `blocked`/`skipped`/`pending` o por test roto (drift).
- Análisis de desviación de tokens (`actual_tokens` vs `estimated_tokens`) por tarea, informativo.
- Archivado (`git mv` + commit) del directorio completo a `docs/specs/archived/<slug>/` cuando
  todos los AC quedan verdes; opera en la rama actual, sin crear rama propia.
- Informe final: qué AC están verdes/pendientes y por qué, y qué tareas se desviaron en tokens.

**Out of scope (non-goals):**
- Generar o modificar `spec.md` o `execution_plan.json` (son entradas de solo lectura).
- Re-ejecutar, reintentar o reparar tareas `blocked`/`skipped`/`pending` — eso es plan-executor;
  verify solo reporta que impiden el archivado.
- Abrir PR o mergear a main — verify certifica y archiva, el merge lo decide el usuario aparte.
- Crear o exigir una rama de feature propia — verify opera sobre el working tree/rama actual,
  incluida `main`, para poder archivar retroactivamente specs ya mergeadas.

## Functional Requirements

### R1 — Carga de entradas del SPECDIR

Depende de: —

The system MUST cargar `spec.md` y `execution_plan.json` de un `docs/specs/<slug>/` dado, y
`execution_state.json` si existe en el mismo directorio, antes de evaluar nada.

#### R1.S1 — Entradas completas
- GIVEN un `docs/specs/<slug>/` con `spec.md`, `execution_plan.json` válido y
  `execution_state.json`
- WHEN se invoca verify sobre ese directorio
- THEN carga el checklist de AC del spec, el mapa `coverage.acs` del plan y el estado de cada
  tarea, y comienza la evaluación AC por AC

#### R1.S2 — Falta `execution_plan.json` o `spec.md`
- GIVEN un `docs/specs/<slug>/` sin `execution_plan.json` o sin `spec.md`
- WHEN se invoca verify
- THEN se detiene sin evaluar ni archivar nada, y el mensaje nombra el fichero concreto que
  falta

### R2 — Ground check determinista de tareas done

Depende de: R1

The system SHALL, cuando exista `execution_state.json`, re-ejecutar el comando de test guardado
de cada tarea en estado `done` cuyo `satisfies_acs` cubra un AC `[auto]`, y contar ese AC como
verde solo si el re-run sigue en verde.

#### R2.S1 — Re-run confirma verde
- GIVEN una tarea `done` en el estado, con `test_cmd` guardado, que satisface un AC `[auto]`
- WHEN verify re-ejecuta ese `test_cmd`
- THEN si el comando sale en verde, ese AC se cuenta como verde en el informe

#### R2.S2 — Drift: el re-run rompe
- GIVEN una tarea marcada `done` cuyo `test_cmd`, al re-ejecutarlo, falla
- WHEN verify evalúa el AC que esa tarea satisface
- THEN ese AC NO se cuenta como verde, y el informe nombra la tarea, el comando y la salida del
  fallo como drift (el árbol de trabajo cambió después de marcarse `done`)

### R3 — Confirmación humana de AC manual

Depende de: R1

The system MUST pedir confirmación humana explícita, uno a uno, para cada AC marcado `[manual]`
en el `spec.md`, exista o no `execution_state.json`, y MUST NOT darlo por verde sin esa
confirmación.

#### R3.S1 — AC manual confirmado
- GIVEN un AC `[manual]` del spec
- WHEN verify se lo presenta al usuario con su sonda y el usuario confirma explícitamente que
  se cumple
- THEN ese AC se cuenta como verde en el informe

#### R3.S2 — AC manual sin confirmar
- GIVEN un AC `[manual]` que el usuario no ha confirmado (lo rechaza, o la sesión termina sin
  respuesta)
- WHEN verify calcula el resultado final
- THEN ese AC no cuenta como verde y bloquea el archivado

### R4 — Degradación completa a manual sin estado

Depende de: R1

The system SHALL tratar todo el checklist de AC como pendiente de confirmación humana
(idéntico a R3) cuando el `SPECDIR` no contiene `execution_state.json`, incluidos los AC
marcados `[auto]` en el spec.

#### R4.S1 — Sin execution_state.json
- GIVEN un `docs/specs/<slug>/` con `spec.md` y `execution_plan.json` pero sin
  `execution_state.json` (p. ej. una spec completada antes de que existiera plan-executor, o
  cuyo estado se perdió)
- WHEN se invoca verify
- THEN presenta TODOS los AC del checklist (auto y manual) para confirmación humana explícita
  uno a uno, sin intentar re-ejecutar ningún test
- AND el informe deja constancia de que la verificación fue manual por falta de estado

### R5 — AC no verdes por tarea incompleta

Depende de: R1, R2

The system SHALL contar como no verde cualquier AC `[auto]` cuya(s) tarea(s) en
`coverage.acs`/`satisfies_acs` no estén todas en estado `done`.

#### R5.S1 — Tarea bloqueada u omitida
- GIVEN un AC `[auto]` cuya única tarea cobertora figura `blocked` o `skipped` en el estado
- WHEN verify evalúa ese AC
- THEN no lo cuenta como verde y el informe nombra la tarea, su estado y su incidencia (si la
  tiene)

#### R5.S2 — Tarea aún pendiente
- GIVEN un AC `[auto]` cuya tarea cobertora figura `pending` o `running`
- WHEN verify evalúa ese AC
- THEN no lo cuenta como verde y el informe indica que la ejecución del plan no ha terminado

### R6 — Informe de desviación de tokens

Depende de: R1

The system SHOULD, para cada tarea con `actual_tokens` y `estimated_tokens` registrados en el
estado, calcular su desviación y señalar en el informe (sin bloquear el archivado) las tareas
cuyo `actual_tokens` supere 2× su `estimated_tokens`, sugiriendo revisar la estimación o la
definición de esa tarea.

#### R6.S1 — Tarea dentro de rango
- GIVEN una tarea con `actual_tokens` ≤ 2× `estimated_tokens`
- WHEN verify calcula las desviaciones
- THEN esa tarea no aparece en la lista de tareas desviadas del informe

#### R6.S2 — Tarea desviada
- GIVEN una tarea con `actual_tokens` > 2× `estimated_tokens`
- WHEN verify calcula las desviaciones
- THEN el informe final la lista con sus cifras (real vs estimado) y una sugerencia explícita
  de revisar su definición/estimación
- AND esto no impide el archivado si el resto de AC están verdes

### R7 — Reporte y archivado condicional

Depende de: R2, R3, R4, R5

The system MUST archivar el `SPECDIR` completo (`git mv` a `docs/specs/archived/<slug>/` +
commit en la rama actual) solo cuando todos los AC del checklist queden verdes, y MUST NOT
archivar nada en caso contrario, reportando en su lugar qué AC faltan y por qué.

#### R7.S1 — Todos los AC verdes: archiva
- GIVEN un `SPECDIR` cuyo checklist queda completamente verde (auto-confirmados por re-run o
  manual-confirmados por el usuario)
- WHEN verify termina la evaluación
- THEN mueve el directorio completo a `docs/specs/archived/<slug>/` con `git mv`, crea un
  commit en la rama actual (sea `main` u otra) y confirma la ruta final en el informe

#### R7.S2 — AC pendientes: no archiva
- GIVEN un `SPECDIR` con al menos un AC no verde
- WHEN verify termina la evaluación
- THEN no ejecuta ningún `git mv` ni commit, y el informe final lista exactamente los AC no
  verdes con su motivo (drift, tarea bloqueada/pendiente, o manual sin confirmar)

#### R7.S3 — Colisión en el destino
- GIVEN que `docs/specs/archived/<slug>/` ya existe (una ejecución previa, o un slug
  duplicado)
- WHEN verify intentaría archivar tras un checklist completamente verde
- THEN rechaza el `git mv`, no toca ni borra nada en origen ni en destino, y el informe nombra
  la colisión de rutas

### R-E2E — Recorrido completo de verificación y archivado

Depende de: R1, R2, R3, R4, R5, R6, R7

The system SHALL, sobre un `SPECDIR` real con AC mixtos (auto verdes por re-run, uno manual
confirmado por el usuario, y una tarea desviada en tokens), producir un informe completo y
archivar el directorio si corresponde.

#### R-E2E.S1 — Recorrido integrador
- GIVEN un `docs/specs/<slug>/` con spec, plan y estado de 3 tareas: dos `done` con AC
  `[auto]` (una con `test_cmd` verde, otra desviada >2× en tokens pero también verde) y un AC
  `[manual]` del spec
- WHEN se invoca verify y el usuario confirma el AC manual
- THEN el informe muestra los 2 AC auto verdes, la tarea desviada con sus cifras y sugerencia,
  y el AC manual confirmado; el checklist completo queda verde
- AND el directorio se mueve a `docs/specs/archived/<slug>/` con un commit en la rama actual

## Technical Requirements

- **Stack / framework:** skill de Claude Code (`SKILL.md`) dentro del plugin sdd-kit, con
  comando atajo `/sdd-kit:verify` siguiendo el patrón de `:spec`, `:plan` y `:exec`.
- **Integraciones:** consume `execution_plan.json` (schema de plan-writer), `spec.md` (formato
  spec-writer) y `execution_state.json` (schema de plan-executor, opcional) del mismo
  `docs/specs/<slug>/`; git local. Sin servicios externos.
- **Rendimiento:** el ground check es determinista (re-run de `test_cmd` guardado), ~0 tokens
  de subagente por tarea; el coste real es tiempo de CPU/reloj de la suite ya existente, no
  tokens. La confirmación de AC `[manual]` es interactiva (turnos de conversación), no lanza
  subagentes.
- **Seguridad / privacidad:** N/A (sin red; no escribe fuera del repo y su `docs/specs/`).
- **Datos / almacenamiento:** no crea ni modifica ningún schema nuevo; solo lee las tres
  entradas y mueve el directorio completo tal cual en el archivado (no reescribe su contenido).
- **Restricciones adicionales:** nunca modifica `execution_plan.json`, `spec.md` ni
  `execution_state.json` (son de solo lectura para esta skill, salvo el `git mv` que los
  reubica sin tocar su contenido); no crea rama propia y puede operar sobre `main`.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — con spec, plan y estado presentes y consistentes: verify carga el
  checklist, `coverage.acs` y los estados de tarea sin error.
- [ ] AC2 → R1.S2 [auto] — sin `execution_plan.json` o sin `spec.md` en el SPECDIR: verify se
  detiene y el mensaje nombra el fichero que falta; no evalúa ni archiva nada.
- [ ] AC3 → R2.S1 [auto] — tarea `done` con `test_cmd` que re-ejecutado sale verde: el AC que
  satisface se cuenta verde en el informe.
- [ ] AC4 → R2.S2 [auto] — tarea `done` cuyo `test_cmd` re-ejecutado falla (drift): el AC no
  cuenta verde y el informe nombra la tarea, el comando y el fallo.
- [ ] AC5 → R3.S2 [manual] — un AC `[manual]` que el usuario no confirma no cuenta verde y
  bloquea el archivado; requiere juicio humano confirmar que la sonda realmente se cumple, no
  solo que se preguntó.
- [ ] AC6 → R4.S1 [auto] — SPECDIR sin `execution_state.json`: el informe presenta TODOS los AC
  (auto y manual) como pendientes de confirmación humana, ninguno se deriva de re-run.
- [ ] AC7 → R5.S1 [auto] — AC `[auto]` cuya tarea cobertora está `blocked` o `skipped`: no
  cuenta verde, informe nombra tarea/estado/incidencia.
- [ ] AC8 → R6.S2 [auto] — tarea con `actual_tokens` > 2× `estimated_tokens`: aparece en el
  informe con cifras y sugerencia de revisión, y el archivado procede igual si el resto de AC
  están verdes.
- [ ] AC9 → R7.S1 [auto] — checklist completamente verde: existe `docs/specs/archived/<slug>/`
  con el contenido íntegro del SPECDIR original, un commit propio en la rama actual, y
  `docs/specs/<slug>/` ya no existe.
- [ ] AC10 → R7.S2 [auto] — checklist con algún AC no verde: no existe ningún `git mv` ni commit
  nuevo, y el informe final lista exactamente los AC no verdes con su motivo.
- [ ] AC11 → R7.S3 [auto] — con `docs/specs/archived/<slug>/` ya existente de antemano y
  checklist verde: verify rechaza el movimiento, ambos directorios (origen y destino) quedan
  intactos, y el informe nombra la colisión.
- [ ] AC-E2E → R-E2E.S1 [auto] — sobre el fixture de 3 tareas (2 auto + 1 manual confirmado, una
  desviada en tokens): informe completo con los 9 elementos (2 auto, 1 manual, 1 desviación) y
  el directorio archivado con commit al final.

## Assumptions & Open Questions

- **Ejecutor concreto del re-run:** verify reutiliza el mismo patrón determinista que el
  `resume` de plan-executor (re-ejecutar `test_cmd` y comparar exit code); el mecanismo exacto
  (script, módulo) lo fija la fase de plan de esta feature, no esta spec.
- **Retroactividad sobre las 3 specs ya mergeadas:** plan-writer, plan-writer-test-contract y
  plan-executor no tienen `execution_state.json` en el repo — al invocar verify sobre ellas se
  activa R4 (degradación a manual): el usuario confirmará manualmente cada AC de su checklist
  ya existente para poder archivarlas. Esto no requiere reconstruir el estado perdido.
- **Verify evalúa todo el checklist antes de concluir** (no para en el primer AC no verde) para
  dar siempre un informe completo — decisión de bajo riesgo tomada por defecto, confirmable si
  se prefiere lo contrario.
- **Umbral de desviación (2×):** se reutiliza el mismo umbral que el `pause` por presupuesto de
  plan-executor (R6.S2 de su spec) por coherencia; no es parte del contrato observable y podría
  hacerse configurable sin cambiar esta spec.
- **Modelo/subagente que invoca esta skill:** verify es mayormente mecánico (re-run de tests,
  cálculo de desviación, informe, `git mv`) — encaja con el criterio de modelo barato (Haiku)
  para "ejecutar checks/tests y reportar". No es comportamiento observable (el informe y el
  archivado son los mismos con cualquier modelo), así que no es parte de esta spec: la fase de
  plan decide qué modelo/subagente ejecuta la skill al planificar la tarea que escribe su
  `SKILL.md`, con la salvedad de que la confirmación interactiva de AC `[manual]` (R3) debe
  quedar siempre en el hilo principal con el usuario, nunca resuelta en solitario por un
  subagente.
