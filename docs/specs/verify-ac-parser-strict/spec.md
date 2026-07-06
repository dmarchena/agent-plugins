# Spec: verify — parser estricto del checklist de Acceptance Criteria

## Purpose

Hoy `verify` parsea la sección `## Acceptance Criteria` de un `spec.md` con un
regex estricto y, cuando una línea empieza por `- ` pero no lo matchea, la
**descarta en silencio**: no cuenta como green ni como not-green, simplemente no
existe para la verificación. Eso permite que una spec se archive con un AG
realmente sin comprobar (`allGreen` puede salir `true` sin verlo). Esta feature
hace que sea **imposible** que un AC del checklist markdown desaparezca sin
avisar: ante cualquier línea AC mal formada, o cualquier AC que el plan dice
cubrir pero que no aparece en el checklist, `verify` aborta ruidosamente en
lugar de continuar. Dirigido a quien corre la fase verify de sdd-kit.

## Scope

**In scope:**
- Fallo ruidoso al parsear una línea bajo `## Acceptance Criteria` que empieza
  por `- ` pero no matchea el formato de AC esperado.
- Cruce de conjuntos entre el checklist parseado y `plan.coverage.acs`: fallo si
  algún `ac_id` que el plan declara cubrir no aparece en el checklist.

**Out of scope (non-goals):**
- Relajar el formato de la referencia para aceptar refs descriptivas no
  `R<n>.S<m>` (p. ej. `R7-catálogos`). El formato estricto es intencionado; el
  arreglo es avisar, no aceptar el formato libre.
- Soportar sub-viñetas o continuaciones de descripción que empiecen por `- `:
  bajo la sección de ACs, una línea que empieza por `- ` se considera un AC (bien
  o mal formado), nunca continuación.
- El cruce inverso (un AC presente en el checklist pero ausente de
  `plan.coverage.acs`): ese caso ya lo maneja la verificación de cobertura
  incompleta en el reporte.
- Cambiar cómo se reportan o archivan los AC bien formados (comportamiento
  actual intacto para specs válidas).

## Functional Requirements

### R1 — Fallo ruidoso ante línea AC mal formada

Depende de: —

Al parsear la sección de Acceptance Criteria de un `spec.md`, el sistema MUST
abortar con un error de entrada explícito en cuanto encuentra una línea que,
estando dentro de esa sección, empieza por `- ` (tras recortar espacios) y no
matchea el formato de AC esperado, en lugar de descartarla. El error MUST
identificar la línea ofensora (su contenido).

#### R1.S1 — Línea AC con referencia no estándar
- GIVEN un `spec.md` cuya sección `## Acceptance Criteria` contiene la línea
  `- [ ] AC25 → R7-catálogos [manual] — revisar catálogos semilla`
- WHEN se carga el SPECDIR (que dispara el parseo del checklist)
- THEN la carga lanza un error de entrada (la clase de error de entrada ya
  existente en el módulo, la misma que ante un fichero faltante)
- AND el mensaje del error contiene el texto de la línea ofensora (`AC25 →
  R7-catálogos`)

#### R1.S2 — Specs válidas siguen parseando igual (regresión)
- GIVEN un `spec.md` cuya sección de ACs contiene solo líneas AC bien formadas,
  una de ellas con la descripción continuada en la línea siguiente (línea que NO
  empieza por `-`)
- WHEN se carga el SPECDIR
- THEN no se lanza ningún error
- AND el checklist resultante contiene un item por cada AC, con la descripción
  continuada plegada en un solo string (comportamiento actual sin cambios)

### R2 — Cruce del checklist contra la cobertura del plan

Depende de: R1

Tras parsear el checklist, el sistema MUST comparar el conjunto de `ac_id`
declarados en `plan.coverage.acs` contra los `ac_id` presentes en el checklist
parseado, y MUST abortar con un error de entrada si algún `ac_id` del plan no
aparece en el checklist. El error MUST enumerar los `ac_id` ausentes.

#### R2.S1 — AC del plan ausente del checklist
- GIVEN un SPECDIR cuyo `execution_plan.json` tiene `coverage.acs` con la clave
  `AC25`, pero el `spec.md` no contiene ninguna línea AC con id `AC25` (la línea
  se omitió por completo)
- WHEN se carga el SPECDIR
- THEN la carga lanza un error de entrada
- AND el mensaje del error nombra `AC25` como ausente del checklist

#### R2.S2 — Cobertura completa no falla (regresión)
- GIVEN un SPECDIR donde todos los `ac_id` de `plan.coverage.acs` aparecen como
  líneas AC bien formadas en el `spec.md`
- WHEN se carga el SPECDIR
- THEN no se lanza ningún error
- AND la carga devuelve el checklist, el mapa de cobertura y el estado por tarea
  como hasta ahora

### R-E2E — Un AC ya no puede desaparecer sin avisar

Depende de: R1, R2

El sistema SHALL, ante un SPECDIR en el que un AC se perdería (por línea mal
formada o por ausencia respecto a la cobertura del plan), abortar la carga con
un error de entrada que detalla el problema, en vez de proceder a una posible
verificación en verde y archivado.

#### R-E2E.S1 — SPECDIR con AC perdido aborta la verificación
- GIVEN un SPECDIR cuyo `spec.md` tiene una línea AC mal formada (empieza por
  `- ` y no matchea el formato) que hoy se descartaría en silencio
- WHEN se ejecuta la carga del SPECDIR que precede a la verificación
- THEN la carga lanza un error de entrada nombrando la línea ofensora
- AND no se produce ningún reporte ni archivado a partir de ese SPECDIR

## Technical Requirements

- **Stack / framework:** Node.js ESM (`.mjs`), sin dependencias externas nuevas;
  reutiliza la clase de error de entrada ya existente en `verify-tools.mjs`.
- **Integraciones:** N/A (módulo interno de sdd-kit).
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** Lee `spec.md` y `execution_plan.json` del SPECDIR;
  no escribe nada nuevo. El fallo ocurre en la fase de carga, antes de cualquier
  reporte o archivado.
- **Restricciones adicionales:** Los errores deben surgir por el mismo canal que
  los actuales de entrada faltante (misma clase de error), para que el
  orquestador los trate igual. Tests con `node:test` y fixtures en disco, como el
  resto de la suite de verify.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — con un `spec.md` cuya sección de ACs tiene la línea `- [ ] AC25 → R7-catálogos [manual] — ...`, cargar el SPECDIR lanza el error de entrada y su mensaje contiene `AC25 → R7-catálogos`
- [ ] AC2 → R1.S2 [auto] — con un `spec.md` de solo ACs bien formados (uno con descripción continuada en línea sin `-`), cargar el SPECDIR no lanza error y el checklist tiene un item por AC con la descripción plegada
- [ ] AC3 → R2.S1 [auto] — con `coverage.acs` que incluye `AC25` y un `spec.md` sin línea `AC25`, cargar el SPECDIR lanza el error de entrada y el mensaje nombra `AC25`
- [ ] AC4 → R2.S2 [auto] — con todos los `ac_id` de `coverage.acs` presentes como líneas AC válidas, cargar el SPECDIR no lanza error y devuelve checklist + cobertura + estado por tarea
- [ ] AC-E2E → R-E2E.S1 [auto] — con un SPECDIR cuyo `spec.md` tiene una línea AC mal formada, la carga previa a la verificación lanza el error nombrando la línea y no se genera reporte ni archivado

## Assumptions & Open Questions

- Se asume que bajo `## Acceptance Criteria` toda línea que empieza por `- ` es
  un intento de AC; se descarta el caso legítimo de sub-viñetas de descripción
  que empiecen por `-` (ver non-goals).
- Se asume que `plan.coverage.acs` usa el `ac_id` canónico (`AC25`) con
  independencia del formato de la ref, tal como lo rellena plan-writer.
- Orden de disparo cuando concurren R1 y R2: R1 (durante el parseo) precede a R2
  (tras parsear y cargar el plan); si hay línea mal formada, aborta R1 primero.
