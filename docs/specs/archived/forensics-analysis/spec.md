# Spec: spec-forensics — reconstruct & persist cost/opportunity/bad-practice analysis

## Purpose

Hoy `spec-forensics` solo reporta números crudos por tarea en `forensics.json`;
la **interpretación** de esos números (reconstrucción de coste, oportunidades de
mejora, malas prácticas) vive únicamente en la sesión efímera que corrió el
forensics y se pierde al cerrarse ese contexto. Esta feature reconstruye y
**persiste** ese análisis en los artefactos de la propia spec: enriquece
`forensics.json` con un bloque `signals` determinista y emite un
`forensics-analysis.md` durable en el SPECDIR, de forma que un run (spec + plan +
análisis de rendimiento de tokens) pueda revisitarse más tarde de forma conjunta.
Para quien opera el flujo SDD y quiere aprender del gasto real, no solo verlo una
vez. Diana: `docs/specs/archived/token-diet/forensics-analysis.md` (prototipo).

Change type: feat

## Scope

**In scope:**
- Bloque `signals` determinista añadido por el script (0 tokens, reproducible):
  per-model rollup, orchestrator share + ratio de tokens orquestador/subagentes,
  desviaciones `real ÷ estimated` rankeadas, incidences, session count.
- Capa de juicio en la skill: `SPECDIR/forensics-analysis.md` con reconstrucción
  de coste (determinista), oportunidades y malas prácticas (juicio), cada hallazgo
  anclado a un signal, juicio separado de los datos.
- Persistencia: ambos ficheros viven en el SPECDIR (commiteados y archivados con
  la spec), sin dependencia de ningún doc externo del usuario.
- Emisión automática de `forensics-analysis.md` en cada run de forensics.

**Out of scope (non-goals):**
- **Modo multi-spec comparativo** (parte 3 del issue) — se difiere a una spec
  follow-up; esta cubre single-SPECDIR.
- **Recalibrar el estimador** de plan-writer — se REPORTA la desviación real÷est
  como signal, no se cambia cómo se estima.
- **Auto-generar la prosa de juicio en el script** — el `forensics-analysis.md`
  lo compone la skill (Opus) leyendo signals; se mantiene la línea determinista/juicio.
- **Tocar plan-executor / la persistencia de `agentId`/`sessionId`** (#31, ya
  cerrado) — se asume el join fiable.
- **Redefinir el envelope `{ok,data,error}`** — `signals` va dentro de `data`;
  el contrato de stdout es responsabilidad de #20/unify-cli-io.

## Functional Requirements

### R1 — Bloque `signals` determinista en el script

Depende de: —

El sistema MUST, al ejecutar el script de forensics sobre un SPECDIR, computar de
forma determinista un bloque `signals` y añadirlo tanto al `data` del envelope de
stdout como al `forensics.json` escrito, derivado del join + `execution_plan.json`
+ `execution_state.json`, conteniendo: `per_model` (por modelo: `tasks`, `tokens`,
`usd`, `share_tokens`, `share_usd`, `usd_per_1m_tokens`), `orchestrator_share`
(USD del orquestador ÷ USD total) y `orchestrator_token_ratio` (tokens orquestador
÷ tokens subagentes), `deviations` (por tarea `real ÷ estimated`, ordenadas desc),
`incidences` (ids sin `agentId`/`sessionId`, el texto `incidencia` por tarea,
tareas con `status` distinto de `done` (blocked/skipped), y los puntos de `pause`)
y `session_count` (nº de `sessionId` distintos en el join).

#### R1.S1 — Happy path: run totalmente resuelto
- GIVEN un SPECDIR cuyo `execution_state.json` tiene todas las tareas `resolved`
  con `agentId`/`sessionId` (p. ej. `docs/specs/archived/token-diet/`)
- WHEN se ejecuta el script de forensics sobre ese SPECDIR
- THEN `forensics.json` contiene un objeto `signals` con las claves `per_model`,
  `orchestrator_share`, `orchestrator_token_ratio`, `deviations`, `incidences` y
  `session_count`
- AND la suma de `per_model[*].tokens` es igual a `subagents_total.real_tokens`, y
  `orchestrator_share` es igual a `orchestrator.real_cost_usd ÷ (orchestrator +
  subagents_total).real_cost_usd` (dentro de tolerancia de coma flotante)
- AND `deviations` está ordenado de mayor a menor `real ÷ estimated`

#### R1.S2 — Edge: tareas no resueltas / run incompleto
- GIVEN un SPECDIR con al menos una tarea `resolved: false` (sin `agentId`) y, en
  el caso límite, coste total 0
- WHEN se ejecuta el script de forensics
- THEN el bloque `signals` se emite igualmente (el script sale 0 y no lanza
  excepción ni produce `NaN`)
- AND cada tarea no resuelta aparece listada en `signals.incidences` y queda
  excluida de (o marcada en) `per_model`, que se computa solo sobre lo resuelto
- AND si el coste total es 0, `orchestrator_share` es `0` (o `null`), nunca `NaN`

### R2 — `forensics-analysis.md` durable (capa de juicio)

Depende de: R1

El sistema SHALL, tras enriquecer `forensics.json`, hacer que la skill lea
`spec.md` + `execution_plan.json` + el `forensics.json` enriquecido y escriba
`SPECDIR/forensics-analysis.md`. La estructura del prototipo (Cost reconstruction
determinista / Opportunities / Bad practices / Signals used) es **orientativa** y
admite variación para mejorar la información; los invariantes duros son: una
reconstrucción de coste **determinista** derivada de `signals`, secciones de
**juicio** (oportunidades y malas prácticas) claramente separadas de la parte
determinista, y cada hallazgo de juicio anclado a un signal concreto de
`forensics.json`.

#### R2.S1 — Happy path: análisis completo escrito y anclado
- GIVEN un `forensics.json` enriquecido con `signals` completos y su `spec.md` +
  `execution_plan.json` presentes en el SPECDIR
- WHEN corre la capa de juicio de la skill
- THEN existe `SPECDIR/forensics-analysis.md` con una reconstrucción de coste
  determinista y secciones de juicio (oportunidades y malas prácticas) claramente
  separadas de ella
- AND las cifras ancla deterministas (total USD, orchestrator share) coinciden
  con las de `forensics.json`/`signals`
- AND cada hallazgo de juicio referencia el nombre de un signal presente en
  `forensics.json`

#### R2.S2 — Edge: forensics degradado (join incompleto)
- GIVEN un `forensics.json` con tareas `resolved: false` o marcado `incomplete`
- WHEN corre la capa de juicio de la skill
- THEN `forensics-analysis.md` se escribe igualmente y la sección 1 marca qué
  tareas quedan sin resolver **sin inventar** sus cifras
- AND el documento declara explícitamente que el join fue incompleto en vez de
  fabricar números para las tareas no resueltas

### R-E2E — Run de forensics completo con análisis persistido

Depende de: R1, R2

El sistema SHALL, en un único run de forensics sobre un SPECDIR ya ejecutado,
producir el `forensics.json` enriquecido con `signals` y a continuación el
`forensics-analysis.md`, ambos persistidos en el SPECDIR y con las cifras de la
sección 1 del análisis reconciliando con `signals`.

#### R-E2E.S1 — Recorrido integrador sobre un SPECDIR real
- GIVEN el SPECDIR `docs/specs/archived/token-diet/` (run resuelto)
- WHEN se ejecuta el flujo de forensics de extremo a extremo (script + capa de juicio)
- THEN el SPECDIR contiene `forensics.json` con `signals` y `forensics-analysis.md`
  con reconstrucción determinista + secciones de juicio ancladas
- AND el total USD y el orchestrator share del `forensics-analysis.md` coinciden
  con los de `forensics.json`

## Technical Requirements

- **Stack / framework:** Node.js (ESM `.mjs`), harness de test `node --test`.
  Lógica determinista en `plugins/sdd-kit/scripts/forensics.mjs`; capa de juicio
  en `plugins/sdd-kit/skills/spec-forensics/SKILL.md`.
- **Integraciones:** ninguna externa; solo lee ficheros del SPECDIR y transcripts
  de sesión ya existentes.
- **Rendimiento:** N/A (script offline).
- **Seguridad / privacidad:** N/A (no red, no datos sensibles nuevos).
- **Datos / almacenamiento:** `signals` como sub-objeto de `data`/`forensics.json`;
  `forensics-analysis.md` como fichero markdown en el SPECDIR. Sin migración.
- **Restricciones adicionales:** el script permanece 0-token/determinista y sale 0;
  `signals` viaja dentro del envelope `{ok,data,error}` sin redefinirlo; sin nuevas
  dependencias; retro-compatible con `forensics.json` actual (solo añade `signals`).

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — Correr el script sobre `token-diet` produce `forensics.json`
  con `signals.{per_model,orchestrator_share,orchestrator_token_ratio,deviations,incidences,session_count}`; `sum(per_model.tokens) == subagents_total.real_tokens` y `orchestrator_share` == orch_usd/total_usd (tolerancia float); `deviations` ordenado desc.
- [ ] AC2 → R1.S2 [auto] — Sobre un SPECDIR fixture con una tarea sin `agentId` (y total 0), el script sale 0, emite `signals`, lista la tarea en `incidences`, la excluye de `per_model`, y `orchestrator_share` es 0/null (nunca `NaN`).
- [ ] AC3 → R2.S1 [auto] — Tras la capa de juicio existe `SPECDIR/forensics-analysis.md` con una reconstrucción de coste determinista y secciones de juicio separadas de ella; las cifras ancla (total USD, orchestrator share) coinciden con `forensics.json`; cada hallazgo de juicio cita un nombre de signal presente en `forensics.json`.
- [ ] AC4 → R2.S2 [auto] — Con un `forensics.json` degradado (tarea `resolved:false`/`incomplete`), `forensics-analysis.md` se escribe, marca las tareas no resueltas, no contiene cifras fabricadas para ellas, y declara el join incompleto.
- [ ] AC-E2E → R-E2E.S1 [auto] — Un run E2E sobre `docs/specs/archived/token-diet/` deja `forensics.json` (con `signals`) y `forensics-analysis.md` (reconstrucción determinista + juicio anclado) en el SPECDIR, con total USD y orchestrator share coincidentes entre ambos.

## Assumptions & Open Questions

- El `execution_state.json` NO persiste conteo de intentos/retries por tarea; el
  signal "attempt/retry count" del issue se sustituye por `incidencia` (texto libre)
  + `status`≠`done`. Recuperarlo requeriría ampliar plan-executor (fuera de alcance).
- `session_count` = nº de `sessionId` distintos observados en el join
  (1 ⇒ sesión única; >1 ⇒ split entre `/clear`).
- El slug del SPECDIR de esta spec es `forensics-analysis`; el prototipo diana vive
  en el SPECDIR archivado `token-diet`, no se modifica.
- Emisión de `forensics-analysis.md`: automática en cada run de forensics.
- El modo multi-spec comparativo (parte 3 del issue) se difiere a una spec follow-up.
