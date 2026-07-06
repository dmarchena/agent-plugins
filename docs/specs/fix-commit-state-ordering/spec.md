# Spec: sdd-kit — el commit de una tarea debe incluir su propio estado

## Purpose

En `plugins/sdd-kit/scripts/exec-tools.mjs`, `completeOne()` comitea el
trabajo de una tarea (`commitTask`, que hace `git add -A` + `git commit`)
**antes** de que el estado de esa misma tarea se persista a disco
(`persist(p.state, state)` ocurre fuera de `completeOne`, en el llamador,
después). El resultado es que cada commit de tarea captura el
`execution_state.json` de la tarea **anterior**, no el propio: el flip a
`done` (o `pending`+incidencia) de la tarea actual queda sin commitear hasta
que otra operación de git lo arrastre. Para la última tarea de un plan (o el
último entry de un batch) no hay una operación posterior que lo arrastre, así
que ese flip queda huérfano en el working tree — se descubrió porque el
`git mv` de archivado de `verify` se llevó el contenido ya comprometido en
HEAD, perdiendo el estado real de la última tarea del plan
`sdd-kit-token-reduction` hasta una corrección manual. Esto va dirigido a
quien confía en el historial de commits de `plan-executor` para auditar qué
pasó tarea a tarea.

## Scope

**In scope:**
- Corregir el orden en `completeOne`/`cmdComplete`/`cmdCompleteBatch` para
  que el commit de una tarea ya incluya su propio `execution_state.json`.
- Fijar como invariante que `commitTask` solo se invoca desde `completeOne`
  (auditoría de `cmdBlock`, `cmdResume`, `budget.mjs`, `resume.mjs` — ninguno
  comitea hoy) con un guard test que detecte una regresión futura.

**Out of scope (non-goals):**
- Retro-reparar `execution_state.json` de specs ya archivadas (el de
  `docs/specs/archived/sdd-kit-token-reduction/` ya se corrigió a mano).
- Bump de versión o entrada de changelog del plugin `sdd-kit` (empaquetado,
  se hace aparte al mergear).

## Functional Requirements

### R1 — El commit de una tarea incluye su propio estado

Depende de: —

The system SHALL comitear cada tarea (single-task o dentro de un batch) de
forma que el commit resultante ya contenga el `execution_state.json` con
`status`/`actual_tokens`/`test_cmd` de esa misma tarea (los datos sustantivos
de auditoría), y SHALL dejar esos mismos campos sin cambios pendientes para
ninguna tarea una vez cerrada la última tarea de la invocación.

> **Nota de alcance (post-implementación):** el campo `commit` NO forma parte
> de esta garantía. Un commit no puede contener el hash de sí mismo — es
> matemáticamente imposible (el contenido determina el hash; para embeberlo
> haría falta que el hash se predijera a sí mismo, lo cual solo es viable por
> fuerza bruta, no por diseño). `commit` es además redundante con lo que ya
> da `git log` (el mensaje de cada commit incluye el `task_id`), así que no
> es dato sustantivo de auditoría — es una caché de conveniencia. Se
> mantiene el comportamiento previo a este fix para ese campo específico
> (se persiste tras conocer el hash, pudiendo quedar pendiente de commitear
> hasta la siguiente operación git, u orphan si es la última tarea) porque
> intentar resolverlo exactamente forzaba una mecánica extra (commit+amend)
> sin beneficio real. AC1/AC2 abajo reflejan esto.

#### R1.S1 — El commit de una tarea en verde refleja su propio estado
- GIVEN una tarea (single-task vía `cmdComplete`, o un entry de un batch vía
  `cmdCompleteBatch`) cuya evidencia TDD es verde
- WHEN `completeOne` la comitea
- THEN leer `execution_state.json` en la revisión de ESE commit ya muestra,
  para esa tarea, `status: "done"`, su `actual_tokens` y su `test_cmd` — no
  los valores de la tarea anterior (el campo `commit` no está cubierto por
  esta garantía; ver nota de alcance arriba)

#### R1.S2 — Sin diff pendiente en los campos sustantivos tras la última tarea
- GIVEN un plan (o un batch) donde la última tarea cierra en verde
- WHEN el comando `complete` termina (single-task o `--batch`)
- THEN comparar el `execution_state.json` en disco contra el de HEAD muestra,
  para TODAS las tareas, `status`/`actual_tokens`/`test_cmd` ya commiteados
  (sin diferencia); el campo `commit` de la última tarea puede seguir
  pendiente de commitear (ver nota de alcance)

### R2 — commitTask solo se invoca desde completeOne

Depende de: —

The system SHALL mantener `commitTask` como el único punto de commit de
`plan-executor`, invocado exclusivamente desde `completeOne`, de forma que
ningún otro subcomando (`cmdBlock`, `cmdResume`, budget/resume) cree commits
por su cuenta con el mismo riesgo de desfase.

#### R2.S1 — Único call site hoy
- GIVEN el código fuente de `scripts/exec-tools.mjs` y `scripts/exec/*.mjs`
- WHEN se buscan todas las invocaciones de `commitTask(`
- THEN aparece exactamente una, dentro de `completeOne`

#### R2.S2 — Guard de regresión futura
- GIVEN un guard test que fija el invariante de R2.S1
- WHEN alguien añade en el futuro una invocación de `commitTask` fuera de
  `completeOne` (o reintroduce el orden commit-antes-de-persist dentro de
  `completeOne`)
- THEN ese test falla, señalando la regresión antes de mergear

### R-E2E — Ambos modos de cierre quedan consistentes de extremo a extremo

Depende de: R1, R2

The system SHALL cerrar un plan de varias tareas, tanto en modo single-task
como en modo batch, dejando cada commit alineado con el
status/actual_tokens/test_cmd de su propia tarea y sin ningún diff pendiente
en esos campos al finalizar (ver nota de alcance en R1 sobre el campo
`commit`).

#### R-E2E.S1 — Fixture multi-tarea, ambos modos
- GIVEN un plan-fixture con al menos 2 tareas donde la segunda es la última
  del plan
- WHEN se cierra completo una vez vía `cmdComplete` (single-task) y, por
  separado, vía `cmdCompleteBatch` (batch)
- THEN en ambos modos cada commit generado contiene el
  status/actual_tokens/test_cmd de su propia tarea (no el de la anterior) y,
  al terminar, esos mismos campos en `execution_state.json` en disco
  coinciden con los de HEAD para todas las tareas (el campo `commit` de la
  última tarea puede seguir pendiente de commitear)

## Technical Requirements

- **Stack / framework:** Node.js ESM; cambio dentro de
  `plugins/sdd-kit/scripts/exec-tools.mjs` y `scripts/exec/git.mjs`; tests
  con `node --test`.
- **Integraciones:** N/A (sin red; todo local).
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** `execution_state.json` conserva su esquema
  (`assets/execution_state.schema.json`); este fix no cambia qué campos
  existen, solo cuándo se comitean.
- **Restricciones adicionales:** no cambiar la semántica de
  `cmdComplete`/`cmdCompleteBatch` más allá del orden commit/persist; el modo
  single-task y el modo batch deben seguir produciendo commits y entradas de
  estado byte-idénticos entre sí (invariante ya existente de R2-batch en la
  spec `sdd-kit-token-reduction`).

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — fixture de 2+ tareas: el commit de la tarea N,
      leído en esa revisión, tiene en `execution_state.json` el
      status/actual_tokens/test_cmd de la tarea N (no de la N-1); el campo
      `commit` queda fuera de esta garantía (ver nota de alcance en R1)
- [ ] AC2 → R1.S2 [auto] — tras cerrar la última tarea (single-task) y tras
      cerrar el último entry de un batch, `status`/`actual_tokens`/`test_cmd`
      de TODAS las tareas en el `execution_state.json` en disco coinciden con
      los de HEAD (ya commiteados); el campo `commit` de la última tarea
      puede seguir pendiente de commitear
- [ ] AC3 → R2.S1 [auto] — grep de `commitTask(` en `scripts/exec-tools.mjs`
      y `scripts/exec/*.mjs` devuelve exactamente 1 resultado, dentro de
      `completeOne`
- [ ] AC4 → R2.S2 [auto] — guard test que falla si se añade un segundo call
      site de `commitTask` o se reordena commit-antes-de-persist dentro de
      `completeOne`
- [ ] AC-E2E → R-E2E.S1 [auto] — fixture de 2+ tareas cerrado por ambos modos
      (single-task y batch): todos los commits reflejan el
      status/actual_tokens/test_cmd de su propia tarea y no queda diff
      pendiente en esos campos en ninguno de los dos (el `commit` de la
      última tarea puede seguir pendiente)

## Assumptions & Open Questions

- Se asume que `cmdBlock`, `cmdResume`, `budget.mjs` y `resume.mjs` no
  invocan `commitTask` hoy (confirmado por inspección directa del código
  antes de esta spec) — R2 lo deja fijado como invariante con guard test en
  vez de re-auditar desde cero en la fase de implementación.
- El mecanismo exacto del fix (mutar el estado en memoria y persistirlo antes
  de comitear, o pasarle a `completeOne` un callback de persistencia) queda
  abierto a la fase de plan/implementación — la spec solo fija el
  comportamiento observable (R1).
