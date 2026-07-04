# Spec: plan-writer (skill del plugin `sdd-kit`)

## Purpose

`plan-writer` es la segunda etapa de la cadena spec → plan → exec → verify. Toma
el `spec.md` producido por `spec-writer` (formato estructurado: requisitos `R<n>`,
escenarios `R<n>.S<m>`, líneas `Depende de:` y checklist de Acceptance Criteria) y
lo traduce en un plan de ejecución determinista: un Grafo Acíclico Dirigido (DAG)
de tareas atómicas que un futuro Orquestador (`exec-runner`) ejecutará sin desviarse.
Existe para eliminar el paso ambiguo entre "requisitos" y "código": en vez de que un
agente ejecutor re-interprete la spec, recibe un mapa de tareas con dependencias,
agente asignado, instrucciones granulares y contrato de salida ya fijados. Se
empaqueta como skill dentro del plugin padre `sdd-kit`, junto a `spec-writer`.

## Scope

**In scope:**
- Leer y validar un `spec.md` en formato `spec-writer` (ingesta acoplada).
- Descomponer los requisitos/escenarios en tareas atómicas (una entrega verificable cada una).
- Derivar el DAG de dependencias a partir de las líneas `Depende de:` y garantizar aciclicidad.
- Asignar a cada tarea rol abstracto + subagente Claude Code + modelo sugerido con justificación.
- Redactar instrucciones granulares por tarea que referencian IDs del spec (sin copiar texto).
- Definir el contrato de salida (`expected_output_schema`) por tarea, enlazado a los ACs que satisface.
- Garantizar trazabilidad/cobertura: cada requisito y cada AC del spec cubierto por ≥1 tarea (criterio duro).
- Emitir una estimación orientativa de tokens por tarea y total del plan.
- Escribir `execution_plan.json` junto al `spec.md` y validarlo contra un JSON Schema publicado.

**Out of scope (non-goals):**
- Ejecutar las tareas del plan (eso es la etapa `exec-runner` posterior).
- Generar o editar el `spec.md` (eso es `spec-writer`; aquí solo se consume).
- Verificar resultados / correr los Acceptance Criteria del trabajo terminado (etapa verify).
- Registrar el consumo real de tokens y calcular la desviación (lo hace el exec; aquí solo se emite la estimación y se dejan los huecos).
- Interpretar specs en prosa sin el formato `spec-writer` (modo best-effort): si falta estructura, se falla, no se degrada.

## Functional Requirements

### R1 — Ingesta y validación del spec.md

Depende de: —

The system SHALL leer un `spec.md` en formato `spec-writer` y, si carece de los IDs
`R<n>`, de escenarios `R<n>.S<m>` o de la sección de Acceptance Criteria, detenerse
sin escribir plan alguno, reportando qué elemento estructural falta.

#### R1.S1 — Happy path
- GIVEN un `spec.md` con requisitos `R<n>`, escenarios `R<n>.S<m>` y una sección `## Acceptance Criteria`
- WHEN se invoca `plan-writer` sobre ese fichero
- THEN parsea sin error y su salida indica el conteo detectado con el texto "N requisitos, M ACs detectados" (N y M son los enteros reales)

#### R1.S2 — Edge: spec sin estructura
- GIVEN un `spec.md` al que le falta la sección de Acceptance Criteria (o no contiene ningún ID `R<n>`)
- WHEN se invoca `plan-writer`
- THEN NO se crea el fichero `execution_plan.json`
- AND el mensaje de salida nombra explícitamente el elemento ausente (p.ej. "falta la sección Acceptance Criteria" o "no se encontraron IDs R<n>")

### R2 — Descomposición en tareas atómicas

Depende de: R1

The system SHALL derivar del spec una o más tareas por requisito/escenario, de modo
que cada tarea represente una única entrega verificable y lleve un `task_id` único.

#### R2.S1 — Happy path
- GIVEN un `spec.md` válido con K requisitos
- WHEN `plan-writer` descompone el trabajo
- THEN el plan contiene ≥ K tareas, cada una con `task_id` único (sin duplicados)
- AND cada tarea referencia al menos un ID de requisito o escenario del spec

#### R2.S2 — Edge: requisito con escenarios independientes
- GIVEN un requisito con varios escenarios que representan entregas independientes entre sí
- WHEN `plan-writer` descompone ese requisito
- THEN produce tareas separadas, de forma que cada tarea tenga exactamente un `expected_output_schema` (una sola entrega) y ninguna agrupe entregas verificables independientes

### R3 — Derivación del DAG de dependencias

Depende de: R2

The system SHALL construir el array `dependencies` de cada tarea a partir de las
líneas `Depende de:` del spec, garantizar la ausencia de ciclos y dejar sin
dependencias (`[]`) las tareas derivadas de requisitos independientes.

#### R3.S1 — Happy path
- GIVEN requisitos con líneas `Depende de: R<x>`
- WHEN `plan-writer` construye el grafo
- THEN el array `dependencies` de cada tarea contiene los `task_id` correspondientes a esas dependencias
- AND las tareas derivadas de requisitos sin `Depende de:` tienen `dependencies: []`

#### R3.S2 — Edge: ciclo de dependencias
- GIVEN un `spec.md` cuyas líneas `Depende de:` formarían un ciclo (p.ej. R-x depende de R-y y R-y depende de R-x)
- WHEN `plan-writer` construye el grafo
- THEN detecta el ciclo, NO escribe `execution_plan.json`
- AND reporta los IDs concretos implicados en el ciclo

#### R3.S3 — Paralelizables
- GIVEN un spec con ≥2 requisitos mutuamente independientes
- WHEN `plan-writer` construye el grafo
- THEN existen ≥2 tareas con `dependencies: []` (paralelizables sin orden entre sí)

### R4 — Asignación de agente por tarea

Depende de: R2

The system SHALL asignar a cada tarea un rol abstracto (`agent_type`), un subagente
concreto de Claude Code (`subagent`) y un modelo sugerido (`model`), con una
justificación de una línea, aplicando el criterio del modelo más austero que cumpla.

#### R4.S1 — Happy path
- GIVEN una tarea de escribir código con criterios de aceptación claros
- WHEN `plan-writer` asigna el agente
- THEN la tarea incluye `agent_type` (rol abstracto, p.ej. `code_writer`), `subagent` (p.ej. `general-purpose`), `model` (p.ej. `sonnet`) y `justification` (texto no vacío), todos presentes y no vacíos

#### R4.S2 — Edge: austeridad según tipo
- GIVEN una tarea mecánica de bajo juicio (búsqueda/inventario/extracción) y otra de diseño/decisión
- WHEN `plan-writer` asigna el modelo
- THEN la tarea mecánica recibe `model: haiku` y la de diseño/decisión recibe `model: opus`, cada una con su `justification`

### R5 — Instrucciones granulares

Depende de: R2, R3

The system SHALL redactar para cada tarea un campo `instructions` que referencie los
IDs del spec (`R<n>.S<m>`, `AC<n>`) en lugar de copiar su texto, e indique qué output
de tareas previas (`task_id`) debe consumir cuando existan dependencias.

#### R5.S1 — Happy path
- GIVEN una tarea derivada de un escenario con dependencias
- WHEN `plan-writer` redacta `instructions`
- THEN el texto referencia al menos un ID del spec (patrón `R<n>` o `AC<n>`) sin reproducir el texto del escenario
- AND nombra el `task_id` de la tarea previa cuyo output debe consumir

#### R5.S2 — Edge: tarea sin dependencias
- GIVEN una tarea derivada de un requisito con `dependencies: []`
- WHEN `plan-writer` redacta `instructions`
- THEN no referencia ningún `task_id` como contexto previo (no inventa dependencias inexistentes)

### R6 — Contrato de salida por tarea

Depende de: R2

The system SHALL definir para cada tarea un `expected_output_schema` que describa el
formato o artefacto exacto de salida y liste los `AC<n>` del spec que esa salida satisface.

#### R6.S1 — Happy path
- GIVEN una tarea del plan
- WHEN `plan-writer` define su contrato de salida
- THEN `expected_output_schema` es un texto no vacío que describe el artefacto/formato producido
- AND lista al menos un `AC<n>` que la salida de esa tarea satisface

#### R6.S2 — Edge: cobertura de cada AC
- GIVEN un AC concreto del spec
- WHEN el plan está completo
- THEN ese AC aparece referenciado en el `expected_output_schema` de al menos una tarea

### R7 — Trazabilidad / cobertura (criterio duro)

Depende de: R2

The system SHALL garantizar que cada requisito `R<n>` y cada `AC<n>` del spec queda
cubierto por al menos una tarea; si algún ID quedaría sin cubrir, SHALL detenerse y
reportarlo en lugar de escribir un plan incompleto.

#### R7.S1 — Happy path
- GIVEN un spec con requisitos `R1..Rk` y criterios `AC1..ACn`
- WHEN `plan-writer` genera el plan
- THEN cada `Rx` y cada `ACn` aparece referenciado en ≥1 tarea
- AND el plan incluye un resumen/sección de cobertura que lo evidencia

#### R7.S2 — Edge: ID sin cubrir
- GIVEN un requisito o AC que ninguna tarea llegaría a cubrir
- WHEN `plan-writer` valida la cobertura
- THEN NO escribe `execution_plan.json` (o lo marca inválido) y reporta el ID exacto que quedó sin cubrir

### R8 — Escritura y validación del execution_plan.json

Depende de: R3, R4, R5, R6, R7

The system SHALL escribir `execution_plan.json` junto al `spec.md` de entrada,
validándolo contra el JSON Schema publicado (`execution_plan.schema.json`) y
verificando que el DAG es acíclico; ante un fallo de validación no SHALL dejar un
fichero inválido en su sitio.

#### R8.S1 — Happy path
- GIVEN un plan derivado de un spec válido
- WHEN `plan-writer` lo escribe
- THEN produce `execution_plan.json` en el mismo directorio que el `spec.md`, que es JSON parseable
- AND valida contra `execution_plan.schema.json` (campos requeridos: `plan_id`, `project_name`, `global_objective`, `tasks[]` con `task_id`, `dependencies`, `agent_type`, `instructions`, `expected_output_schema`)
- AND el DAG resultante es acíclico

#### R8.S2 — Edge: fallo de validación
- GIVEN un plan que no valida contra el esquema o cuyo grafo tiene un ciclo
- WHEN `plan-writer` intenta escribir
- THEN no queda un `execution_plan.json` inválido en el directorio destino
- AND reporta el error concreto (campo/regla del esquema o ciclo) que impidió la escritura

### R9 — Estimación de presupuesto de tokens

Depende de: R2, R4

The system SHALL incluir en cada tarea una estimación orientativa `estimated_tokens`
y un total del plan, marcada explícitamente como de baja confianza, dejando huecos
(`actual_tokens`, `deviation`) a `null` para que el exec los rellene después.

#### R9.S1 — Happy path
- GIVEN un plan con modelo asignado por tarea
- WHEN `plan-writer` estima el presupuesto
- THEN cada tarea lleva `estimated_tokens` (entero) y el plan un campo de total
- AND cada tarea incluye `actual_tokens` y `deviation` presentes con valor `null`

#### R9.S2 — Edge: marca de baja confianza
- GIVEN la estimación producida
- WHEN se materializa en el plan
- THEN el plan marca la estimación como orientativa mediante un campo explícito (p.ej. `confidence` o un flag equivalente), de modo que no pueda leerse como compromiso

### R-E2E — Recorrido completo: spec.md → execution_plan.json

Depende de: R1, R2, R3, R4, R5, R6, R7, R8, R9

The system SHALL, dado un `spec.md` válido y completo, producir un `execution_plan.json`
que un Orquestador pueda consumir sin datos faltantes.

#### R-E2E.S1 — Recorrido integrador
- GIVEN un `spec.md` válido en formato `spec-writer` con varios requisitos, dependencias y ACs
- WHEN se ejecuta `plan-writer` de principio a fin
- THEN produce `execution_plan.json` que: (a) parsea sin error, (b) valida contra `execution_plan.schema.json`, (c) cubre el 100% de los `R<n>` y `AC<n>` del spec, (d) tiene un DAG acíclico, y (e) cada tarea incluye `agent_type` + `subagent` + `model` + `instructions` (con referencias a IDs) + `expected_output_schema` + `estimated_tokens`

## Technical Requirements

- **Stack / framework:** Skill de Claude Code dentro del plugin padre `sdd-kit` (junto a `spec-writer`; futura skill `exec-runner`). El plugin incluye `CHANGELOG.md` (arranca en 0.1.0) y `execution_plan.schema.json`. Operación autónoma: lee el spec y escribe el plan sin interacción paso a paso; solo se detiene ante ambigüedad no resoluble o fallo estructural (R1/R3/R7/R8).
- **Integraciones:** Entrada = `spec.md` (contrato de salida de `spec-writer`). Salida = `execution_plan.json` (contrato de entrada del futuro `exec-runner`). Sin servicios externos.
- **Rendimiento:** N/A (transformación local de un documento; sin límites de latencia definidos).
- **Seguridad / privacidad:** N/A (solo ficheros locales, sin red ni credenciales).
- **Datos / almacenamiento:** Lee `spec.md` del directorio indicado; escribe `execution_plan.json` en ese mismo directorio. La forma del plan la fija `execution_plan.schema.json` publicado en el plugin.
- **Restricciones adicionales:** Ingesta acoplada al formato `spec-writer` (sin modo best-effort). Formato de salida exclusivamente JSON (no YAML). `agent_type` como rol abstracto portable acompañado de `subagent` (Claude Code) y `model`.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — con un spec.md válido, la salida contiene el texto "N requisitos, M ACs detectados" con los enteros reales
- [ ] AC2 → R1.S2 [auto] — con un spec.md sin sección de ACs o sin IDs `R<n>`: no existe `execution_plan.json` tras la corrida y el mensaje nombra el elemento ausente
- [ ] AC3 → R2.S1 [auto] — nº de tareas ≥ nº de requisitos; todos los `task_id` únicos; cada tarea referencia ≥1 ID del spec
- [ ] AC4 → R2.S2 [manual] — ninguna tarea agrupa entregas verificables independientes (juicio de atomicidad no automatizable); la parte estructural (un solo `expected_output_schema` por tarea) es comprobable, la adecuación del corte requiere lectura humana
- [ ] AC5 → R3.S1 [auto] — el `dependencies` de cada tarea equivale a los `task_id` de sus líneas `Depende de:`; las tareas sin dependencia tienen `[]`
- [ ] AC6 → R3.S2 [auto] — dado un spec con dependencias cíclicas: no se escribe `execution_plan.json` y la salida reporta los IDs del ciclo
- [ ] AC7 → R3.S3 [auto] — con requisitos independientes, existen ≥2 tareas con `dependencies: []`
- [ ] AC8 → R4.S1 [auto] — cada tarea tiene `agent_type`, `subagent`, `model` y `justification` presentes y no vacíos
- [ ] AC9 → R4.S2 [manual] — la austeridad del `model` asignado es coherente con el tipo de tarea (juicio humano)
- [ ] AC10 → R5.S1 [auto] — `instructions` contiene ≥1 referencia con patrón `R<n>` o `AC<n>`, y referencia el `task_id` previo cuando la tarea tiene dependencias
- [ ] AC11 → R5.S2 [auto] — una tarea con `dependencies: []` no referencia ningún `task_id` como contexto previo
- [ ] AC12 → R6.S1 [auto] — `expected_output_schema` es no vacío y lista ≥1 `AC<n>`
- [ ] AC13 → R7.S1 [auto] — cada `R<n>` y cada `AC<n>` del spec aparece en ≥1 tarea; el plan incluye una sección de cobertura
- [ ] AC14 → R7.S2 [auto] — con un R/AC deliberadamente no cubrible: no se escribe el plan y se reporta el ID sin cubrir
- [ ] AC15 → R8.S1 [auto] — `execution_plan.json` existe junto al spec.md, valida contra `execution_plan.schema.json` y un chequeo de aciclicidad del DAG pasa
- [ ] AC16 → R8.S2 [auto] — ante un plan inválido/cíclico no queda `execution_plan.json` inválido escrito y se reporta la regla/campo o ciclo que falló
- [ ] AC17 → R9.S1 [auto] — cada tarea tiene `estimated_tokens` entero; el plan tiene total; `actual_tokens` y `deviation` presentes con valor `null`
- [ ] AC18 → R9.S2 [auto] — el plan incluye un campo explícito que marca la estimación como orientativa (p.ej. `confidence`)
- [ ] AC-E2E → R-E2E.S1 [auto] — el `execution_plan.json` generado valida contra el esquema, cubre el 100% de `R<n>`/`AC<n>`, tiene DAG acíclico y todas las tareas llevan los campos completos (agent_type, subagent, model, instructions con IDs, expected_output_schema, estimated_tokens)

## Assumptions & Open Questions

- **Migración de `spec-writer` al plugin `sdd-kit`:** se asume que ambas skills viven bajo el mismo plugin padre; queda por decidir en la fase de plan si se mueve el plugin `spec-writer` existente o se crea el padre y se traslada. Valor por defecto si no se resuelve: crear `sdd-kit` con `plan-writer` y migrar `spec-writer` después.
- **Enum concreto de `agent_type`:** los roles abstractos (`code_writer`, `reviewer`, `researcher`, `terminal_operator`, `doc_writer`…) y su mapeo a subagentes de Claude Code se fijarán en la fase de plan; esta spec solo exige que el campo exista y sea coherente con el tipo de tarea.
- **Forma exacta del enlace AC↔tarea en el JSON:** el nombre y estructura del campo que referencia los `AC<n>` (dentro de `expected_output_schema` o campo aparte) es un detalle del esquema a fijar en la fase de plan.
- **Estimación de tokens de baja confianza:** se asume que `estimated_tokens` es orientativo y de alta varianza (lo produce quien no ejecuta la tarea); su utilidad es servir de baseline para medir desviación aguas abajo, no un compromiso.
