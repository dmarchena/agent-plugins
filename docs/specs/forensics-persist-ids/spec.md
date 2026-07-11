# Spec: forensics persiste agentId/sessionId por tarea (gap de contrato)

> **BORRADOR** — pendiente de repaso en otra sesión. Ver "Assumptions & Open
> Questions" antes de pasar a plan-writer.

## Purpose

`spec-forensics` resuelve **vacío** sobre una spec ejecutada con normalidad
porque plan-executor nunca persiste el `agentId`/`sessionId` por tarea. El
mecanismo de forensics está cableado de punta a punta (el estado guarda ambos
ids, `complete` acepta los flags, forensics une por ambos) **salvo el paso que
captura los ids**: el contrato de la skill plan-executor nunca instruye al
orquestador a suministrarlos, así que `execution_state.json` almacena `null` y
el join contra los transcripts no encuentra nada. Hoy el coste real por tarea
solo se recupera editando a mano el state (a menudo ya archivado). Esta spec
cierra ese gap para que forensics vuelva a ser significativo en runs normales.
Para quién: quien opera el flujo sdd-kit y necesita el coste real por tarea.

Change type: fix

## Scope

**In scope:**
- Auto-sellar `sessionId` en `complete` / `complete --batch` desde
  `CLAUDE_CODE_SESSION_ID` cuando no se pasa session id explícito (remedy #1).
- Cablear `agentId` por el contrato documentado de plan-executor: el retorno
  compacto del executor lo declara, y la invocación `complete` lo pasa como
  `--agent-id` (y `agent_id` por entrada de batch) — remedy #2.
- Verificación E2E de que la cadena `complete`→state→forensics resuelve
  figuras reales cuando los ids llegan como prescribe el contrato actualizado.

**Out of scope (non-goals):**
- Remedy #3: fallback en `forensics.mjs` que correlacione `agentId` desde el
  transcript cuando el state no lo tenga (recuperar runs legacy). Diferido.
- Plegar estos cambios en la spec de `unify-cli-io` (#20) o editarla; esta
  spec es standalone.
- Modificar la lógica de join de `forensics.mjs` ni el envelope
  `{ok,data,error}` de #20.
- Back-fill de `execution_state.json` archivados o de runs previos.

## Functional Requirements

### R1 — Auto-default de `sessionId` desde el entorno

Depende de: —

The system MUST, al registrar una tarea vía `complete` o `complete --batch`
sin un session id explícito, sellar el `sessionId` de esa tarea con el valor de
`process.env.CLAUDE_CODE_SESSION_ID`; un session id explícito, cuando se pasa,
prevalece sobre el del entorno.

#### R1.S1 — Auto-default en el path single (happy)
- GIVEN una spec ejecutable y `CLAUDE_CODE_SESSION_ID=sess-abc` en el entorno
- WHEN se cierra una tarea con `complete SPECDIR <task_id> ...` **sin**
  `--session-id`
- THEN tras el comando, `execution_state.json` tiene
  `tasks.<task_id>.sessionId === "sess-abc"`
- AND `tasks.<task_id>.agentId` conserva el valor pasado por `--agent-id` (o
  `null` si no se pasó), sin verse afectado por este default

#### R1.S2 — Precedencia del flag y ausencia de entorno (edge)
- GIVEN `CLAUDE_CODE_SESSION_ID=sess-abc` en el entorno
- WHEN se cierra una tarea con `complete SPECDIR <task_id> --session-id sess-xyz ...`
- THEN `tasks.<task_id>.sessionId === "sess-xyz"` (el flag explícito gana)
- AND si en cambio no hay ni `--session-id` ni `CLAUDE_CODE_SESSION_ID` en el
  entorno, `complete` termina sin error y deja `tasks.<task_id>.sessionId === null`

#### R1.S3 — Auto-default en el path batch
- GIVEN `CLAUDE_CODE_SESSION_ID=sess-abc` y un `batch.json` cuya entrada para
  `<task_id>` **no** trae campo `session_id`
- WHEN se cierra con `complete SPECDIR --batch batch.json`
- THEN `tasks.<task_id>.sessionId === "sess-abc"` para esa entrada
- AND una entrada que sí trae `session_id: "sess-batch"` queda con ese valor,
  no con el del entorno

### R2 — Cablear `agentId` por el contrato de plan-executor

Depende de: —

The system (la documentación de la skill plan-executor) MUST instruir al
orquestador a capturar el `agentId` del executor y suministrarlo a `complete`,
de modo que el id quede persistido por tarea. El `sessionId` no se documenta
como flag a pasar: queda cubierto por el auto-default de R1.

#### R2.S1 — El contrato de retorno del executor declara `agentId`
- GIVEN la documentación de plan-executor (`assets/task-brief-detail.md`,
  sección "happy-path return contract")
- WHEN se inspecciona la lista de campos que el retorno compacto del executor
  DEBE contener
- THEN esa lista incluye `agentId` (junto a `task_id`, files, test-cmd, rojo,
  verde, tokens) como campo requerido del retorno

#### R2.S2 — El `complete` documentado pasa `--agent-id` / `agent_id`
- GIVEN `SKILL.md` §3 de plan-executor (forma del comando `complete`)
- WHEN se inspecciona la invocación single y la de batch documentadas
- THEN la invocación single incluye `--agent-id <id>` y la de batch describe
  `agent_id` como campo por entrada
- AND la documentación **no** reintroduce `--session-id` en esa invocación
  (queda auto por R1)

### R-E2E — forensics resuelve no-vacío tras un run que sigue el contrato

Depende de: R1, R2

The system SHALL, cuando `complete` recibe los ids como prescribe el contrato
actualizado (`agentId` por flag + `sessionId` auto desde el entorno), persistir
ambos ids en cada tarea done y permitir que `spec-forensics` resuelva figuras
reales, en lugar de reportar `incomplete_reason: "no agentId recorded for any task"`.

#### R-E2E.S1 — Cadena complete → state → forensics con fixtures
- GIVEN un plan+state de prueba con fixtures de transcript (estilo
  `test/exec/e2e-forensics.test.mjs`) para un `agentId`/`sessionId` conocidos,
  y `CLAUDE_CODE_SESSION_ID` fijado a ese session id
- WHEN se cierran las tareas con `complete` pasando `--agent-id <id>` (y sin
  `--session-id`), y luego se corre forensics sobre el state resultante
- THEN cada tarea done en `execution_state.json` tiene `agentId` y `sessionId`
  no nulos
- AND la salida de forensics no lleva el flag `incomplete` por
  `"no agentId recorded for any task"` y resuelve ≥1 tarea con sus figuras

## Technical Requirements

- **Stack / framework:** Node ESM (`.mjs`), sin dependencias externas ni red.
  Plugin en `plugins/sdd-kit/`.
- **Integraciones:** lee `process.env.CLAUDE_CODE_SESSION_ID` (presente cuando
  la CLI corre en la sesión del orquestador). N/A servicios externos.
- **Rendimiento:** N/A (cambio de una asignación por tarea + edición de docs).
- **Seguridad / privacidad:** N/A. El session id es un identificador local de
  transcript, no un secreto.
- **Datos / almacenamiento:** `execution_state.json` ya tiene campos
  `agentId`/`sessionId` por tarea (inicializados a `null`); esta spec cambia
  quién/cómo los rellena, no el esquema.
- **Restricciones adicionales:** cambio acotado a `cmdComplete` y
  `cmdCompleteBatch` en `scripts/exec-tools.mjs` (punto donde se deriva el
  session id) y a las skill-docs `skills/plan-executor/SKILL.md` (§3) +
  `assets/task-brief-detail.md` (return contract). No tocar `completeOne`,
  `recordResult`, ni el join de `forensics.mjs`.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — con `CLAUDE_CODE_SESSION_ID=sess-abc` y `complete`
      sin `--session-id`, `state.tasks.<id>.sessionId === "sess-abc"`.
- [ ] AC2 → R1.S2 [auto] — `--session-id sess-xyz` ⇒ state guarda `"sess-xyz"`;
      sin flag ni env ⇒ `sessionId === null` y exit 0.
- [ ] AC3 → R1.S3 [auto] — entrada batch sin `session_id` ⇒ `sessionId` = env;
      entrada con `session_id` ⇒ ese valor, no el del env.
- [ ] AC4 → R2.S1 [auto] — grep de la sección "return contract" en
      `task-brief-detail.md` encuentra `agentId` como campo del retorno.
- [ ] AC5 → R2.S2 [auto] — grep de `SKILL.md` §3 encuentra `--agent-id` (single)
      y `agent_id` (batch), y no encuentra `--session-id` reintroducido.
- [ ] AC-E2E → R-E2E.S1 [auto] — test de integración: tras `complete`
      (`--agent-id` sin `--session-id`, env fijado) todas las tareas done
      tienen ambos ids no nulos y forensics resuelve ≥1 tarea sin el flag
      `incomplete` de "no agentId recorded".

## Assumptions & Open Questions

- **Rama de aterrizaje.** La fontanería de forensics (forensics.mjs,
  persistencia agentId/sessionId, skill spec-forensics) existe en `main` y en
  la caché 0.6.1, **no** en `feat/token-diet`. Este spec.md vive en `main`, y la
  implementación debe aterrizar sobre `main` (o rama derivada), donde el código
  de referencia de esta spec existe.
- **Fuente del `agentId` en el orquestador.** El issue afirma que el resultado
  del tool `Agent`/`Task` ya expone el `agentId` del subagente al orquestador.
  R2 documenta que el executor lo declare en su retorno y que el orquestador lo
  pase; el mecanismo exacto (campo del resultado del tool vs auto-reporte en el
  texto del subagente) queda para plan-writer/executor. **Verificar en el
  repaso** que un subagente puede conocer/exponer su propio `agentId`.
- **Coordinación con #20 (unify-cli-io).** Standalone por decisión. El issue
  sugería plegar remedy #1 en #20 para no editar dos veces `exec-tools`; si #20
  aterriza antes, revisar solapamiento sobre `cmdComplete`/`cmdCompleteBatch`.
- **`sessionId` por tarea (no run-level).** Se asume correcto sellar el session
  actual en cada `complete`: en un resume tras `/clear`, tareas cerradas en
  sesiones distintas obtienen ids distintos, que es lo que forensics necesita.
