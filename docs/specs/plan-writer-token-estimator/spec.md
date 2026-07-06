# Spec: plan-writer — dataset de calibración de estimated_tokens

## Purpose

El estimador `estimated_tokens` de plan-writer se desvía del coste real de forma
**inconsistente entre planes**: el mismo esquema sub/sobre-estima con signo
distinto (p. ej. `fix-commit-state-ordering` sobreestimó ~-65%, `verify`
subestimó ~+100%). No hay un multiplicador fijo que lo arregle porque la
heurística actual (aparentemente por `agent_type`) no captura la señal real. La
hipótesis a validar es que el coste escala con **cuánto contexto previo** debe
leer el ejecutor, no con la complejidad nominal de la tarea. Antes de tocar el
estimador hace falta un dataset. Esta feature entrega justo eso: una herramienta
determinista que recolecta `estimated_tokens` vs `actual_tokens` de los
`execution_state.json` ya existentes y expone la desviación histórica (con las
variables candidatas: `agent_type`, dependencias) como referencia. **No** cambia
el estimador — esa decisión se toma después, con los datos en mano. Dirigido a
quien escribe planes con plan-writer y a la spec futura del fix.

## Scope

**In scope:**
- Recolector determinista que barre los specdirs bajo `docs/specs/` (incluido
  `docs/specs/archived/`) con `execution_state.json` y produce un dataset con un
  registro por tarea que tenga `actual_tokens` numérico.
- Cada registro incluye la desviación relativa y las variables candidatas de la
  hipótesis (`agent_type`, nº de dependencias), unidas desde el
  `execution_plan.json` del mismo specdir.
- Un resumen agregado por `agent_type` (recuento y desviación mediana) que un
  autor de planes pueda consultar como referencia manual.

**Out of scope (non-goals):**
- Cambiar el estimador (multiplicador por tipo, fórmula con contexto previo, o
  cualquier recalibración). Diferido a una spec posterior que use este dataset.
- Tocar el umbral del budget pause 2× (depende de lo anterior, decisión aparte).
- Validar o refutar la hipótesis del "contexto previo": el dataset expone los
  campos, el análisis estadístico es trabajo posterior.
- Modificar plan-writer para consumir el dataset automáticamente al planificar:
  aquí solo se genera y expone como referencia.

## Functional Requirements

### R1 — Recolectar el dataset de desviación por tarea

Depende de: —

El sistema SHALL barrer los specdirs bajo `docs/specs/` (incluyendo el subárbol
`archived/`) y, por cada tarea con `actual_tokens` numérico en su
`execution_state.json`, producir un registro con al menos: `plan_id`,
`task_id`, `estimated_tokens`, `actual_tokens`, la desviación absoluta
(`actual − estimated`) y la desviación relativa (`(actual − estimated) /
estimated`). Una tarea sin `actual_tokens` numérico MUST excluirse; un specdir
sin `execution_state.json` MUST omitirse sin error.

#### R1.S1 — Recolección de un plan con actuals
- GIVEN el specdir archivado `sdd-kit-token-reduction` cuyo `execution_state.json`
  tiene 5 tareas con `actual_tokens` (p. ej. `R1-anchors`: estimated 120000,
  actual 79587)
- WHEN se ejecuta el recolector sobre `docs/specs/`
- THEN el dataset contiene 5 registros de ese `plan_id`
- AND el registro de `R1-anchors` tiene desviación relativa `-0.337` (redondeada
  a 3 decimales), calculada como `(79587 − 120000) / 120000`

#### R1.S2 — Tareas sin actual y specdirs sin estado se ignoran
- GIVEN un specdir cuyo `execution_state.json` tiene una tarea con
  `actual_tokens: null` (no completada) junto a otras con actual numérico, y otro
  specdir sin ningún `execution_state.json`
- WHEN se ejecuta el recolector
- THEN el dataset no incluye ningún registro de la tarea con `actual_tokens: null`
- AND el specdir sin `execution_state.json` no aparece en el dataset ni provoca
  error

### R2 — Enriquecer cada registro con las variables candidatas

Depende de: R1

El sistema SHALL unir cada registro de tarea, por `task_id`, con su
`execution_plan.json` del mismo specdir para añadir `agent_type` y el número de
dependencias (`dependencies.length`). Si falta el plan o la tarea en el plan,
esos campos MUST registrarse como desconocidos (`null`) sin abortar la
recolección.

#### R2.S1 — agent_type y nº dependencias presentes
- GIVEN el specdir `sdd-kit-token-reduction` con su `execution_plan.json` donde
  `R1-anchors` tiene `agent_type: "doc_writer"` y `dependencies: []`
- WHEN se ejecuta el recolector
- THEN el registro de `R1-anchors` incluye `agent_type: "doc_writer"` y número de
  dependencias `0`

#### R2.S2 — Plan ausente no rompe la recolección
- GIVEN un specdir con `execution_state.json` pero sin `execution_plan.json`
- WHEN se ejecuta el recolector
- THEN los registros de ese specdir se incluyen con `agent_type: null` y número
  de dependencias `null`
- AND no se lanza ningún error

### R3 — Exponer el resumen agregado por agent_type

Depende de: R1, R2

El sistema SHALL emitir, además del dataset por tarea, un resumen que agrupe los
registros por `agent_type` reportando por grupo el recuento de tareas y la
desviación relativa **mediana**, de modo consultable como referencia manual por
quien escribe un plan.

#### R3.S1 — Resumen sobre un dataset multi-plan
- GIVEN un dataset recolectado que abarca varios `plan_id` con distintos
  `agent_type`
- WHEN se genera el resumen
- THEN el resumen lista cada `agent_type` presente con su recuento de tareas y su
  desviación relativa mediana

#### R3.S2 — Dataset vacío
- GIVEN un árbol `docs/specs/` sin ningún `execution_state.json` con actuals
- WHEN se ejecuta el recolector
- THEN el dataset por tarea está vacío
- AND el resumen se emite vacío (sin grupos) sin lanzar error

### R-E2E — Recolectar y exponer la desviación histórica del repo

Depende de: R1, R2, R3

El sistema SHALL, ejecutado sobre `docs/specs/` del repo, producir el dataset por
tarea enriquecido y el resumen por `agent_type`, reflejando la evidencia real de
sesgo (p. ej. el plan `sdd-kit-token-reduction` aparece con desviaciones
relativas negativas por sistemática sobreestimación).

#### R-E2E.S1 — Ejecución sobre el repo
- GIVEN el estado actual de `docs/specs/` con al menos el specdir archivado
  `sdd-kit-token-reduction` con actuals
- WHEN se ejecuta el recolector completo
- THEN se obtiene un dataset con un registro por tarea con actual (incluyendo
  `plan_id`, `task_id`, desviación relativa, `agent_type`, nº dependencias)
- AND un resumen por `agent_type` con recuento y mediana
- AND los registros del plan `sdd-kit-token-reduction` tienen desviación relativa
  negativa

## Technical Requirements

- **Stack / framework:** Node.js ESM (`.mjs`), script determinista offline sin
  dependencias externas nuevas; ubicación coherente con el resto de utilidades de
  sdd-kit (`plugins/sdd-kit/scripts/`).
- **Integraciones:** N/A. Solo lee ficheros del repo.
- **Rendimiento:** N/A (opera sobre unos pocos specdirs locales).
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** Lee `execution_state.json` y `execution_plan.json`
  de cada specdir bajo `docs/specs/`; el dataset y el resumen son salida (a
  stdout o fichero), no se persiste estado nuevo en los specdirs. La desviación
  relativa se calcula `(actual − estimated) / estimated`.
- **Restricciones adicionales:** Determinista y reproducible (mismo árbol → misma
  salida). Tests con `node:test` y fixtures en disco, como el resto de la suite.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — sobre un árbol con el specdir `sdd-kit-token-reduction`, el recolector emite 5 registros de ese `plan_id` y el de `R1-anchors` tiene desviación relativa `-0.337`
- [ ] AC2 → R1.S2 [auto] — una tarea con `actual_tokens: null` no genera registro y un specdir sin `execution_state.json` se omite sin error
- [ ] AC3 → R2.S1 [auto] — el registro de `R1-anchors` incluye `agent_type: "doc_writer"` y nº de dependencias `0`, unidos desde su `execution_plan.json`
- [ ] AC4 → R2.S2 [auto] — un specdir con estado pero sin `execution_plan.json` produce registros con `agent_type: null` y nº dependencias `null`, sin error
- [ ] AC5 → R3.S1 [auto] — sobre un dataset multi-plan, el resumen lista cada `agent_type` con recuento y desviación relativa mediana
- [ ] AC6 → R3.S2 [auto] — sobre un árbol sin actuals, dataset por tarea y resumen salen vacíos sin error
- [ ] AC-E2E → R-E2E.S1 [auto] — ejecutado sobre `docs/specs/` del repo, produce dataset enriquecido + resumen por `agent_type`, y los registros de `sdd-kit-token-reduction` tienen desviación relativa negativa

## Assumptions & Open Questions

- Se asume que barrer `docs/specs/` (incluido `archived/`) captura toda la señal
  disponible; las specs que la issue cita (`fix-commit-state-ordering`, `verify`)
  están hoy en `docs/specs/`, no en `archived/`, y deben entrar igualmente.
- Se asume la desviación **relativa** como métrica principal por ser comparable
  entre planes de distinto tamaño; se conserva también la absoluta por registro.
- Se elige **mediana** por grupo (robusta a outliers como T07 +210%) en vez de
  media; abierto a cambiarla si el análisis posterior lo pide.
- El formato exacto de salida (JSON vs CSV, stdout vs fichero) se fija en la fase
  de plan; la spec solo exige los campos observables listados.
- Diferido explícitamente a spec futura: decidir si el fix del estimador es un
  multiplicador por tipo, una fórmula con el contexto previo como variable, o
  solo el uso manual de este histórico.
