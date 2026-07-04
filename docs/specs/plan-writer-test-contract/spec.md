# Spec: plan-writer — contrato de test por tarea y semántica de los huecos de consumo

## Purpose

Dos ajustes a plan-writer que deja pendientes la spec de plan-executor
(`docs/specs/plan-executor/spec.md`): (1) que cada tarea que produce código lleve en el plan un
contrato de test explícito — la fuente externa de la que el ejecutor TDD materializa sus tests,
que es lo que hace innecesario un subagente revisor por tarea; (2) corregir la semántica
documentada de `actual_tokens`/`deviation`: el consumo real vive en `execution_state.json`, el
plan es inmutable para la fase exec.

## Scope

**In scope:**
- Nuevo campo `test_contract` por tarea en `execution_plan.json`: schema, validador
  (`check-plan`) y generación por la skill plan-writer.
- Corrección de las descripciones (schema y SKILL.md de plan-writer) sobre los huecos
  `actual_tokens`/`deviation`.

**Out of scope (non-goals):**
- Cambios en plan-executor: su spec ya contempla planes con y sin contrato (fallback al spec).
- Regenerar planes existentes: los planes pre-cambio dejan de validar y se regeneran solo si
  van a ejecutarse.
- Escribir código de test en el plan: el contrato son casos y aserciones, nunca código.

## Functional Requirements

### R1 — Contrato de test por tarea

Depende de: —

The system SHALL incluir en cada tarea del plan una clave `test_contract`: para tareas
`code_writer`, una lista no vacía de casos donde cada caso referencia un ID del spec
(`R<n>.S<m>` o `AC<n>`) y enuncia una aserción observable, sin código; para el resto de
`agent_type`, `null`. El validador `check-plan` MUST imponer esta regla.

#### R1.S1 — Plan generado con contratos
- GIVEN un `spec.md` válido cuyo plan derivará al menos una tarea `code_writer`
- WHEN plan-writer genera el `execution_plan.json`
- THEN toda tarea `code_writer` lleva `test_contract` con ≥1 caso, cada caso con una
  referencia a un ID existente del spec y una aserción observable (sin nombres de ficheros de
  test ni código)
- AND toda tarea de otro `agent_type` lleva `test_contract: null`

#### R1.S2 — El validador rechaza contratos mal puestos
- GIVEN un plan con una tarea `code_writer` cuyo `test_contract` es `null` o vacío, o una
  tarea no-`code_writer` con contrato no nulo, o un caso que referencia un ID inexistente en
  el spec
- WHEN se ejecuta `plan-tools.mjs check-plan` sobre ese plan
- THEN sale con código ≠ 0 y el error nombra el `task_id` y la regla incumplida concreta

### R2 — Semántica correcta de los huecos de consumo

Depende de: —

The system SHALL documentar que `actual_tokens` y `deviation` permanecen `null` en
`execution_plan.json` de forma permanente y que el consumo real se registra en el
`execution_state.json` de la fase exec.

#### R2.S1 — Descripciones corregidas
- GIVEN el schema del plan y el SKILL.md de plan-writer tras el cambio
- WHEN se leen sus descripciones de `actual_tokens`/`deviation`
- THEN ninguna afirma que "la fase exec los rellenará" en el plan; ambas indican que el plan
  es inmutable y que el consumo real vive en `execution_state.json`

### R-E2E — Regeneración de un plan real

Depende de: R1, R2

The system SHALL producir, desde un spec real ya existente, un plan que valide con las nuevas
reglas y cuyos contratos tracen al spec.

#### R-E2E.S1 — Dogfood sobre un spec del repo
- GIVEN el spec `docs/specs/plan-executor/spec.md` (u otro spec real en formato spec-writer)
- WHEN se invoca plan-writer sobre él y termina
- THEN el `execution_plan.json` resultante pasa `check-plan` con exit 0, sus tareas
  `code_writer` llevan contratos cuyos IDs existen todos en ese spec, y las demás llevan
  `null`

## Technical Requirements

- **Stack / framework:** plugin sdd-kit — `execution_plan.schema.json`,
  `scripts/plan-tools.mjs` (check-plan) y `SKILL.md` de plan-writer.
- **Integraciones:** N/A (todo local al plugin).
- **Rendimiento:** el contrato añade pocas líneas por tarea; no debe duplicar texto del spec
  (referencia por ID, coherente con la regla existente de instructions).
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** `test_contract` es clave requerida en toda tarea (como
  `actual_tokens`), con `null` permitido; no-null obligatorio y exclusivo de `code_writer`.
  La forma exacta del sub-schema de cada caso la fija la fase de plan.
- **Restricciones adicionales:** los planes generados antes del cambio dejan de validar
  (ruptura aceptada); versionar el plugin sdd-kit al publicar.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — plan generado desde un spec fixture con tarea de código: toda tarea
  `code_writer` tiene `test_contract` con ≥1 caso `{referencia a ID del spec, aserción}` y las
  demás tienen `null`.
- [ ] AC2 → R1.S2 [auto] — tres planes manipulados (code_writer sin contrato, researcher con
  contrato, caso con ID inexistente): `check-plan` devuelve ≠ 0 en los tres, nombrando
  `task_id` y regla.
- [ ] AC3 → R2.S1 [auto] — en schema y SKILL.md no queda ninguna mención a que exec rellene los
  huecos en el plan, y ambos mencionan `execution_state.json` como destino del consumo real.
- [ ] AC-E2E → R-E2E.S1 [auto] — plan regenerado desde `docs/specs/plan-executor/spec.md`: exit
  0 de `check-plan` y todos los IDs referenciados por los contratos existen en ese spec.

## Assumptions & Open Questions

- El fallback de plan-executor (derivar el contrato del spec cuando falta) sigue siendo válido
  para planes de terceros o degradados; su AC3 se probará con un plan sin contrato construido
  a mano.
- El único plan real del repo (el de la feature plan-writer) ya fue ejecutado; no se regenera.
- La redacción concreta de la instrucción en SKILL.md (cómo pedir a plan-writer que derive los
  casos desde los escenarios) se decide en la fase de plan de este cambio.
