# Spec: Contrato de retorno mínimo del ejecutor de plan-executor

## Purpose

En plan-executor el orquestador corre todo el DAG en una sola sesión que solo
crece. Hoy el subagente ejecutor devuelve al orquestador el código completo de
cada tarea (ficheros de test + implementación) además de la evidencia, pero el
orquestador **nunca usa ese fuente**: verifica el verde re-corriendo el test
desde disco vía `complete`, y el código ya queda en disco y commiteado. Ese
fuente es lastre de contexto que se multiplica por cada tarea del plan. Esta
spec cambia el **contrato de retorno** del ejecutor para que en el path feliz
devuelva solo evidencia mínima, sin pérdida de comportamiento, reduciendo la
huella de contexto por tarea del orquestador.

## Scope

**In scope:**
- Redefinir qué devuelve el subagente ejecutor al orquestador en el path feliz
  (éxito): un objeto compacto de evidencia, sin cuerpos de fichero.
- Preservar la fidelidad de la evidencia de rojo (extracto corto) para poder
  auditar la incidencia "sin evidencia de rojo".
- Que los paths de no-happy (ambigüedad rebotada, incidencia `no-red`) conserven
  su prosa: el recorte aplica solo al path feliz.
- Blindar el contrato como invariante machine-checkable (rule-anchor + test) y
  no regresar el flujo determinista existente.

**Out of scope (non-goals):**
- Palanca #2: checkpointear por batch y soltar contexto con `/clear` + resume
  entre batches. Se difiere a una spec futura.
- Cambiar la lógica de `exec-tools.mjs` / `scripts/exec/` (validación, batching,
  verify-by-rerun, git, estado, budget): siguen igual.
- Cambiar lo que persiste `execution_state.json` (ya es compacto).
- El brief de **entrada** del ejecutor (esa es `executor-minimal-brief`).

## Functional Requirements

### R1 — Retorno mínimo del ejecutor

Depende de: —

El subagente ejecutor, cuando completa una tarea en verde, MUST devolver al
orquestador únicamente un objeto de evidencia compacto —`task_id`, lista de
rutas de fichero tocadas, comando exacto de re-ejecución del test, flag de rojo,
flag de verde, extracto de rojo, tokens consumidos— y MUST NOT incluir el
contenido de los ficheros de test ni el código de implementación. El recorte
aplica solo al path feliz; el contrato queda blindado por anclas verbatim que un
test verifica.

#### R1.S1 — Éxito: solo evidencia, sin fuente
- GIVEN una tarea que el ejecutor lleva a verde por el ciclo TDD
- WHEN el ejecutor retorna al orquestador
- THEN el retorno contiene exactamente los campos `task_id`, ficheros tocados
  (rutas), test-cmd, flag rojo, flag verde, extracto de rojo y tokens
- AND el retorno NO contiene el cuerpo de ningún fichero creado/editado (ni test
  ni implementación) — esos viven solo en disco
- AND las anclas del contrato están en `assets/rule-anchors.json` y
  `test/exec/rule-anchors.test.mjs` las exige

#### R1.S2 — Extracto de rojo para auditar el "no-red"
- GIVEN el ejecutor reporta `rojo=fail` y `verde=pass`
- WHEN construye el objeto de evidencia
- THEN incluye un `extracto de rojo` de ≤3 líneas con la aserción real que falló
  (citando el `ref`/ID del escenario cuando aplique), no un booleano solo

#### R1.S3 — Los paths de no-happy conservan su prosa
- GIVEN una tarea que rebota una ambigüedad, o una incidencia `no-red`
- WHEN el ejecutor retorna
- THEN ese retorno mantiene la explicación/trade-off (o el extracto de la
  incidencia) íntegra: el recorte del contrato aplica SOLO al path feliz

### R-E2E — Ejecución completa sin regresión

Depende de: R1

El sistema SHALL ejecutar un plan de extremo a extremo produciendo el mismo
resultado (todas las tareas commiteadas en verde en la rama del plan) mientras
el contrato documentado obliga al ejecutor a retornar solo evidencia mínima, sin
regresar el flujo determinista.

#### R-E2E.S1 — E2E verde y verify desde disco
- GIVEN el fixture e2e de plan-executor con el brief actualizado
- WHEN se ejecuta el plan a completitud
- THEN los tests `test/exec/` (incl. `rule-anchors.test.mjs` y `e2e*.test.mjs`)
  quedan en verde de punta a punta
- AND `complete` sigue verificando el verde re-corriendo el test desde disco y
  produciendo `{ status: "done", commit, deviation }`, sin leer ningún cuerpo de
  fichero del retorno del ejecutor

## Technical Requirements

- **Stack / framework:** Node ESM; tests en `test/exec/` (runner `test/run.mjs`). Sin red.
- **Integraciones:** N/A (cambio interno a la skill plan-executor).
- **Rendimiento:** el ahorro real de tokens lo materializa el subagente vivo al
  obedecer el brief; no es unit-testeable con fixtures. Los AC verifican el
  **contrato/instrucción y la no-regresión**, no el ahorro en vivo (ver Assumptions).
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** `execution_state.json` sin cambios de forma.
- **Restricciones adicionales:** `execution_plan.json` inmutable; `exec-tools.mjs`
  / `scripts/exec/` sin cambios de lógica.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — sonda: el contrato documentado en el brief enumera
  exactamente {task_id, ficheros, test-cmd, rojo, verde, extracto-rojo, tokens} y
  prohíbe devolver cuerpos de fichero/fuente; ancla presente y exigida por
  `rule-anchors.test.mjs`
- [ ] AC2 → R1.S2 [auto] — sonda: el brief exige un extracto de rojo ≤3 líneas con
  la aserción que falló cuando `rojo=fail` (ancla presente)
- [ ] AC3 → R1.S3 [auto] — sonda: el brief acota el recorte al path feliz; los retornos
  de ambigüedad rebotada e incidencia `no-red` conservan su prosa (ancla presente)
- [ ] AC-E2E → R-E2E.S1 [auto] — sonda: la suite `test/exec/` completa (incl.
  `rule-anchors` y `e2e*`) pasa en verde de punta a punta con el brief actualizado;
  `complete` re-corre desde disco y el commit + `deviation` por tarea no cambian

## Assumptions & Open Questions

- El ahorro de contexto lo realiza el subagente vivo al obedecer el brief; no es
  medible de forma determinista con fixtures. Por eso los AC son todos `[auto]`
  pero verifican el **contrato/instrucción y la no-regresión**, no el ahorro en
  vivo. Asumido y aceptado por el usuario (modo Lite).
- El commit subject que hoy puede pasar el orquestador a `complete` se deriva de
  las `instructions` de la tarea (metadata del plan), no del fuente devuelto, así
  que el recorte no lo afecta. Asumido.
- Palanca #2 (corte por batch + resume entre batches) queda fuera; si tras esta
  mejora el orquestador sigue acumulando demasiado, se abrirá spec propia.
- Coordinada con `executor-minimal-brief`: ambas adelgazan el orquestador
  persistente empujando lo transitorio al subagente desechable; esta la salida,
  la otra la entrada. Reusan el patrón rule-anchors + guard-test ya vivo en el repo
  (introducido en `sdd-kit-token-reduction`).
