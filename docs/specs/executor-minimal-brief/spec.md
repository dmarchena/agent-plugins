# Spec: Brief de entrada mínimo del ejecutor de plan-executor

## Purpose

Hermano de `executor-minimal-return` en la dirección de entrada. Hoy, cuando una
tarea no trae `test_contract` (`test_contract: null`), el orquestador **lee de
`spec.md` los escenarios/AC referenciados y cita su texto íntegro dentro del
brief** del ejecutor, para que este no explore (`task-brief-detail.md:20`). Eso
carga contexto persistente en el orquestador dos veces: al **leer** esos bloques
y al **arrastrarlos**, brief tras brief — el driver 97% cache_read que la
medición señaló en plan-executor. Esta spec mueve ese texto fuera del
orquestador: el brief pasa solo los **IDs** y un **comando de extracción
determinista**; el ejecutor —desechable— corre el comando y obtiene el texto él
mismo. El orquestador ni lee ni retiene los cuerpos de escenario.

## Scope

**In scope:**
- Un comando determinista que extrae de `SPECDIR/spec.md` el texto verbatim de
  los bloques de escenario (`R<n>.S<m>`) y de AC (`AC<n>`/`AC-E2E`) nombrados por
  su ID, reutilizando las regex de cabecera ya existentes en el repo.
- Cambiar el brief del caso `test_contract: null`: pasa IDs + comando de
  extracción en vez del texto citado; el ejecutor extrae, y rebota si un ID falta.
- Conservar sin cambios el path con `test_contract` no nulo y la exigencia de que
  los tests derivados citen los IDs de escenario/AC.
- Blindar el contrato del brief como invariante machine-checkable (rule-anchor +
  test) y cubrir el extractor con tests unitarios, sin regresar el flujo existente.

**Out of scope (non-goals):**
- El contrato de **retorno** del ejecutor (esa es `executor-minimal-return`).
- El caso en que la tarea **sí** trae `test_contract`: ese array vive en el plan,
  que el orquestador ya tiene en contexto; no se toca su fuente.
- Palanca #2 (corte por batch + resume entre batches).
- Cambiar la lógica de validación/batching/verify/git/estado/budget.

## Functional Requirements

### R1 — Extractor determinista de bloques por ID

Depende de: —

El sistema MUST ofrecer un comando que, dado `SPECDIR` y una lista de IDs de
escenario/AC, imprima el texto verbatim de cada bloque nombrado desde
`SPECDIR/spec.md`, y falle de forma clara ante un ID inexistente.

#### R1.S1 — Extrae los bloques pedidos
- GIVEN un `spec.md` con `#### R2.S1 — …` (con sus bullets Given/When/Then) y una
  línea de checklist `- [ ] AC3 → R… [auto] — …`
- WHEN se corre el comando de extracción con los IDs `R2.S1 AC3`
- THEN imprime, para `R2.S1`, el bloque del escenario completo (cabecera + sus
  bullets hasta el siguiente encabezado) y, para `AC3`, su línea de checklist
- AND sale con código 0

#### R1.S2 — ID inexistente falla nombrándolo
- GIVEN un `spec.md` que no contiene el ID `R9.S9`
- WHEN se corre el comando con `R9.S9`
- THEN sale con código ≠ 0 y el mensaje nombra el ID que no encontró (no imprime
  un bloque vacío ni lo inventa)

### R2 — El brief pasa IDs, no texto; el ejecutor extrae

Depende de: R1

Para una tarea `test_contract: null`, el brief del orquestador MUST pasar los IDs
de escenario/AC (`source_ids` / `satisfies_acs`) y el comando de extracción, y
MUST NOT incluir el texto verbatim de esos escenarios; el ejecutor corre el
comando y rebota si un ID falta. El path con `test_contract` no nulo y la
exigencia de citar IDs en los tests derivados quedan sin cambios, blindados por
anclas verbatim que un test verifica.

#### R2.S1 — Brief con IDs + comando, sin texto citado
- GIVEN una tarea con `test_contract: null` y `source_ids`/`satisfies_acs`
- WHEN el orquestador construye el brief
- THEN el brief contiene esos IDs y el comando de extracción, y NO contiene los
  bullets Given/When/Then verbatim de esos escenarios
- AND la instrucción del ejecutor es correr el comando para obtener el contrato y
  derivar los tests
- AND las anclas del contrato están en `assets/rule-anchors.json` y
  `test/exec/rule-anchors.test.mjs` las exige

#### R2.S2 — ID que falta ⇒ el ejecutor rebota, no inventa
- GIVEN el comando de extracción sale con error por un ID inexistente (R1.S2)
- WHEN el ejecutor lo detecta
- THEN rebota la tarea como ambigüedad no resuelta (regla vigente "resolves no
  open decisions") y NO inventa un contrato de test

#### R2.S3 — El path con test_contract no nulo no cambia
- GIVEN una tarea con `test_contract` no nulo
- WHEN el orquestador construye el brief
- THEN el contrato se pasa desde el plan como hoy y no interviene el extractor

#### R2.S4 — Los tests derivados siguen citando IDs
- GIVEN una tarea `test_contract: null` ejecutada con el brief nuevo
- WHEN el ejecutor materializa los tests
- THEN cada test cita en su descripción el ID de escenario/AC del que deriva
  (`R2.S1`, `AC3`), como exige la regla vigente

### R-E2E — Ejecución completa con el brief nuevo

Depende de: R1, R2

El sistema SHALL ejecutar de extremo a extremo un plan con al menos una tarea
`test_contract: null`: el ejecutor corre el extractor, deriva y cita, los tests
quedan en verde y commiteados, con el brief llevando IDs + comando y no texto, sin
regresar el flujo determinista.

#### R-E2E.S1 — E2E verde con extracción
- GIVEN el fixture e2e de plan-executor con una tarea `test_contract: null`
- WHEN se ejecuta el plan a completitud con el brief actualizado
- THEN la suite `test/exec/` completa (incl. los unit tests del extractor,
  `rule-anchors.test.mjs` y `e2e*.test.mjs`) queda en verde de punta a punta

## Technical Requirements

- **Stack / framework:** Node ESM; comando nuevo en `scripts/exec-tools.mjs` /
  `scripts/exec/`, reutilizando las regex de cabecera de `plan-tools.mjs`
  (`parseSpec`) y `verify-tools.mjs` (`parseAcChecklist`). Tests en `test/exec/`. Sin red.
- **Integraciones:** N/A (interno a la skill plan-executor).
- **Rendimiento:** el ahorro real de contexto lo materializa el subagente vivo al
  obedecer el brief; los AC auto verifican el **extractor + contrato/instrucción**
  y la no-regresión, no el ahorro en vivo (ver Assumptions).
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** `execution_plan.json` inmutable; `execution_state.json` sin cambios.
- **Restricciones adicionales:** no duplicar las regex de parseo — reutilizar las existentes.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — sonda: con `spec.md` que tiene `R2.S1` y `AC3`, el comando
  imprime el bloque de escenario completo y la línea de AC, y sale 0
- [ ] AC2 → R1.S2 [auto] — sonda: con un ID ausente, sale ≠0 y el mensaje nombra el ID
- [ ] AC3 → R2.S1 [auto] — sonda: la instrucción de brief documentada pasa IDs + comando de
  extracción y prohíbe citar el texto verbatim de los escenarios (ancla presente y exigida por el test)
- [ ] AC4 → R2.S2 [auto] — sonda: el brief documentado instruye rebotar la tarea si el
  extractor falla por un ID inexistente (ancla presente)
- [ ] AC5 → R2.S3 [auto] — sonda: el brief documentado conserva el path `test_contract` no nulo
  sin extractor (ancla presente)
- [ ] AC6 → R2.S4 [auto] — sonda: la exigencia de citar IDs de escenario/AC en los tests
  derivados sigue documentada (ancla presente)
- [ ] AC-E2E → R-E2E.S1 [auto] — sonda: la suite `test/exec/` completa (incl. extractor,
  `rule-anchors` y `e2e*`) pasa en verde de punta a punta con una tarea `test_contract: null`

## Assumptions & Open Questions

- El extractor (R1) es código determinista plenamente unit-testeable — el núcleo
  sólido de los AC. El comportamiento del brief (R2) lo obedece el subagente vivo,
  no un fichero estático, así que sus AC son anclas sobre la doc del brief
  (`task-brief-detail.md`) + el e2e, no grep de un brief en runtime. Asumido y
  aceptado (modo Lite), en línea con `executor-minimal-return`.
- El extractor delimita un bloque de escenario desde su cabecera `#### R<n>.S<m>`
  hasta la siguiente cabecera; asume el formato de la plantilla de spec-writer
  (headers estables). Si el spec no sigue la plantilla, es un fallo legítimo del
  extractor, no un caso a tolerar.
- Reutiliza el patrón rule-anchors + guard-test ya vivo en el repo (introducido en
  `sdd-kit-token-reduction`, hermano en `executor-minimal-return`).
- Coordinada con `executor-minimal-return`: ambas adelgazan el orquestador
  persistente empujando lo transitorio al subagente desechable; una la salida, esta
  la entrada. Independientes en mecanismo (pueden planificarse/ejecutarse por separado).
