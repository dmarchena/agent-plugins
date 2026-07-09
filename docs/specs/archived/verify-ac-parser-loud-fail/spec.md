# Spec: verify — fallo ruidoso ante refs no estándar en el checklist de Acceptance Criteria

## Purpose

El parser del checklist de `## Acceptance Criteria` de la skill `verify` descarta en
silencio cualquier línea de lista que no encaje en el formato esperado de un ítem AC.
En consecuencia, un AC con una referencia mal formada desaparece por completo de la
verificación: no cuenta como verde ni como no-verde, simplemente no existe, y la spec
puede archivarse (`allGreen === true`) con un criterio realmente sin verificar. Este
cambio hace que esa pérdida silenciosa sea imposible: la carga del SPECDIR debe abortar
ruidosamente cuando detecta un AC mal formado o un AC del plan que no llegó al checklist.
Dirigido a los autores de specs y a quien corre `verify` (issue #8).

Change type: fix

## Scope

**In scope:**
- Detectar líneas de lista bajo `## Acceptance Criteria` que NO encajan en el formato de
  ítem AC y abortar la carga del SPECDIR con un error que identifique la línea ofensora.
- Cruzar el conjunto de `ac_id` del checklist parseado contra las claves de
  `plan.coverage.acs` y abortar nombrando cualquier AC del plan ausente del checklist.
- Mantener intacto el parseo de checklists válidos, incluidas las líneas de continuación
  (texto envuelto que no empieza por guion).

**Out of scope (non-goals):**
- Relajar el formato de la referencia: refs descriptivas no estándar (p. ej.
  `R7-catálogos`) siguen tratándose como mal formadas, no se aceptan.
- Detectar el sentido inverso del cross-check (ACs del checklist ausentes del plan): eso
  ya lo valida `plan-executor` (check-plan), no se duplica aquí.
- Autocorregir o normalizar refs; el fix solo detecta y aborta, no reescribe el spec.

## Functional Requirements

### R1 — Fallo ruidoso ante línea AC mal formada

Depende de: —

Al cargar un SPECDIR, el sistema MUST abortar con un error de entrada cuando una línea
bajo `## Acceptance Criteria` es un ítem de lista markdown (un guion seguido de espacio)
pero no encaja en el formato de ítem AC. El error MUST identificar la(s) línea(s)
ofensora(s). Las líneas que no son ítems de lista (continuaciones de texto envuelto,
reglas horizontales `---`, líneas en blanco) no se ven afectadas.

#### R1.S1 — Checklist válido con continuación (happy path)
- GIVEN un SPECDIR cuyo `## Acceptance Criteria` tiene ítems AC bien formados, uno de
  ellos con su descripción envuelta en una segunda línea que no empieza por guion
- WHEN se carga el SPECDIR
- THEN la carga completa sin lanzar y el checklist contiene todos los ítems AC, con la
  descripción del ítem envuelto plegada en una sola cadena

#### R1.S2 — Ref no estándar en una línea de lista (edge/error)
- GIVEN un SPECDIR con la línea `- [ ] AC25 → R7-catálogos [manual] — revisar catálogos`
  bajo `## Acceptance Criteria`
- WHEN se carga el SPECDIR
- THEN la carga lanza `VerifyInputError` y el mensaje incluye el texto de la línea
  ofensora (que contiene `AC25` / `R7-catálogos`)
- AND ningún archivado ni verificación posterior llega a ejecutarse

### R2 — Cross-check del checklist contra la cobertura del plan

Depende de: —

Al cargar un SPECDIR, el sistema MUST abortar con un error de entrada cuando un `ac_id`
presente como clave en `plan.coverage.acs` no aparece en el checklist parseado. El error
MUST nombrar el/los `ac_id` ausente(s). Cuando `plan.coverage.acs` está vacío o no
existe, esta comprobación no dispara.

#### R2.S1 — Cobertura y checklist coinciden (happy path)
- GIVEN un SPECDIR donde cada `ac_id` de `plan.coverage.acs` tiene su línea correspondiente
  en el checklist
- WHEN se carga el SPECDIR
- THEN la carga completa sin lanzar y el checklist contiene un ítem por cada `ac_id` de
  la cobertura

#### R2.S2 — AC del plan ausente del checklist (edge/error)
- GIVEN un SPECDIR cuyo `plan.coverage.acs` incluye la clave `AC25` pero cuyo checklist
  no tiene ninguna línea que parsee a `ac_id === "AC25"`
- WHEN se carga el SPECDIR
- THEN la carga lanza `VerifyInputError` y el mensaje nombra `AC25`

### R-E2E — Una spec con un AC mal formado no se puede archivar en silencio

Depende de: R1, R2

El sistema SHALL impedir que el flujo de `verify` alcance el veredicto/archivado cuando el
SPECDIR contiene un AC mal formado o descolgado de la cobertura: la carga del SPECDIR
aborta ruidosamente antes de calcular cualquier `allGreen`.

#### R-E2E.S1 — Recorrido integrador
- GIVEN un SPECDIR por lo demás archivable (todas las tareas `done`, tests en verde) salvo
  que una línea del checklist tiene una ref no estándar como en R1.S2
- WHEN se ejecuta el flujo de `verify` sobre ese SPECDIR
- THEN el proceso termina con error (código de salida distinto de 0) mencionando la línea
  ofensora, y la spec NO se mueve a su destino de archivado

## Technical Requirements

- **Stack / framework:** JavaScript (ES modules), `plugins/sdd-kit/scripts/verify-tools.mjs`.
- **Integraciones:** N/A.
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** lee `spec.md` y `execution_plan.json` de un SPECDIR; no escribe.
- **Restricciones adicionales:** sin dependencias nuevas; el error de aborto usa el tipo de
  error de entrada ya existente (`VerifyInputError`); tests con `node --test` y fixtures bajo
  `plugins/sdd-kit/test/fixtures/verify/`.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — cargar un SPECDIR con checklist válido y una descripción envuelta
  no lanza y devuelve todos los ítems AC con la descripción plegada.
- [ ] AC2 → R1.S2 [auto] — cargar un SPECDIR con la línea `- [ ] AC25 → R7-catálogos [manual] — …`
  lanza `VerifyInputError` cuyo mensaje incluye el texto de esa línea.
- [ ] AC3 → R2.S1 [auto] — cargar un SPECDIR donde cobertura y checklist coinciden no lanza y
  el checklist tiene un ítem por cada `ac_id` de `plan.coverage.acs`.
- [ ] AC4 → R2.S2 [auto] — cargar un SPECDIR cuyo `plan.coverage.acs` incluye `AC25` pero el
  checklist no, lanza `VerifyInputError` cuyo mensaje nombra `AC25`.
- [ ] AC-E2E → R-E2E.S1 [auto] — correr el flujo de `verify` sobre un SPECDIR por lo demás
  archivable pero con una ref mal formada termina con exit code ≠ 0 mencionando la línea, y el
  directorio del spec no aparece en su ruta de archivado.

## Assumptions & Open Questions

- Se asume que `plan.coverage.acs` lista todo AC legítimo con su `ac_id` correcto
  independientemente del formato de la ref (lo rellena `plan-writer`), por lo que sirve de
  segunda red frente al fallo por línea mal formada.
- Se asume que bajo `## Acceptance Criteria` toda línea que empieza por guion + espacio es un
  ítem AC; una continuación de descripción legítima nunca empieza por guion (así lo asume ya
  el plegado de líneas actual).
- Ambas comprobaciones (R1 y R2) viven en la carga del SPECDIR para que cualquier subcomando
  de `verify` que cargue el directorio herede el aborto; se asume que ese es el único punto de
  entrada compartido.
