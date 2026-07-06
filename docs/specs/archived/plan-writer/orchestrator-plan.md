# Plan: plan-writer (skill de `sdd-kit`)

Plan de implementación derivado de `plan-writer-spec.md`. Orquestador fino: secuencia,
dependencias, contrato entre subplanes, reparto de modelo por tarea y trazabilidad al spec.
El detalle de diseño (esquema JSON, enum de roles, checks del validador) queda fijado aquí
para que cada subplan se ejecute sin re-interpretar el spec.

## Decisiones bloqueadas (antes de tocar nada)

1. **Empaquetado:** un único plugin `plugins/sdd-kit/` con **dos skills** bajo `skills/`
   (`spec-writer` + `plan-writer`). Se **migra** el plugin `spec-writer` existente dentro.
   Consecuencia asumida: cambia el nombre de instalación (`spec-writer@…` → `sdd-kit@…`) y las
   skills pasan a invocarse namespaced (`sdd-kit:spec-writer`, `sdd-kit:plan-writer`). Es un
   breaking change aceptable en 0.1.x; se documenta en CHANGELOG y README.
2. **Validación determinista:** script Node **stdlib, sin dependencias** (`plan-tools.mjs`) con
   subcomandos `inspect-spec` y `check-plan`. La skill lo ejecuta; CI lo corre sobre fixtures.
   Mantiene el repo Markdown-only sin npm deps. Node porque CI ya instala Node 22.
3. **Alcance del determinismo:** la **generación** (spec.md → execution_plan.json) es trabajo del
   agente guiado por `SKILL.md` — NO es testeable en CI. Lo testeable y lo que CI hace cumplir es
   la **validación** de un plan dado (esquema, aciclicidad, cobertura). El AC-E2E se verifica con
   una corrida real (dogfood), no en CI. Honestidad: los AC `[auto]` se hacen cumplir sobre planes
   fixture, no sobre la salida del LLM.

## Layout objetivo

```
plugins/sdd-kit/
  .claude-plugin/plugin.json          # name: sdd-kit, version 0.1.0, skills auto-discover
  skills/
    spec-writer/
      SKILL.md                        # movido tal cual desde plugins/spec-writer/SKILL.md
      assets/spec-template.md         # movido tal cual
    plan-writer/
      SKILL.md                        # NUEVO — instrucciones del agente
      assets/
        execution_plan.schema.json    # NUEVO — contrato publicado (R8)
        agent-roles.md                # NUEVO — enum agent_type ↔ subagent ↔ model (R4)
  scripts/
    plan-tools.mjs                    # NUEVO — validador Node stdlib (R1,R3,R7,R8…)
  test/
    fixtures/…                        # NUEVO — specs/planes buenos y malos por AC
    run.mjs                           # NUEVO — runner que asevera outcomes esperados
  AGENTS.md                           # NUEVO — doc del plugin (ambas skills)
  CHANGELOG.md                        # NUEVO — arranca en 0.1.0
scripts/validate.sh                   # EDIT — añade paso: node plugins/sdd-kit/test/run.mjs
.claude-plugin/marketplace.json       # EDIT — entrada spec-writer → sdd-kit
README.md                             # EDIT — tabla de plugins + nota de rename
plugins/spec-writer/                  # BORRAR tras migrar
```

> Se verifica en SP0 que `claude plugin validate --strict` acepta el layout multi-skill
> (`skills/<name>/SKILL.md`). Si lo rechaza, fallback documentado abajo.

## Diseño fijado (resuelve las Open Questions del spec)

### Enum `agent_type` ↔ subagent ↔ model (R4, `assets/agent-roles.md`)

Mapeo alineado con el catálogo "qué modelo para qué" del usuario (austeridad primero):

| `agent_type`        | `subagent`        | `model`  | Cuándo |
|---------------------|-------------------|----------|--------|
| `researcher`        | `Explore`         | `haiku`  | localizar / inventariar / extraer (solo lectura) |
| `terminal_operator` | `general-purpose` | `haiku`  | correr checks/tests, ediciones mecánicas, renombrados |
| `code_writer`       | `general-purpose` | `sonnet` | implementar con criterios de aceptación claros |
| `doc_writer`        | `general-purpose` | `sonnet` | redactar docs siguiendo un esquema |
| `reviewer`          | `general-purpose` | `opus`   | revisión crítica / juicio |
| `architect`         | `Plan`            | `opus`   | diseño / decisiones con trade-offs |

`model` enum: `haiku | sonnet | opus`. La skill elige el rol más austero que cumpla y escribe
`justification` de una línea (R4.S1). AC9 (coherencia de austeridad) queda `[manual]`.

### Esquema del `execution_plan.json` (R8, campos requeridos)

```
plan_id            string
project_name       string
global_objective   string
source_spec        string  (ruta al spec.md de origen)
confidence         enum "low"        # R9.S2: marca la estimación como orientativa
estimated_tokens_total  integer
tasks[]:
  task_id                string  (único)                         # R2
  source_ids             string[] (≥1, IDs R<n>/R<n>.S<m>)       # R2.S1
  dependencies           string[] (task_ids; [] si independiente)# R3
  agent_type             enum (tabla arriba)                     # R4
  subagent               string (no vacío)                       # R4
  model                  enum haiku|sonnet|opus                  # R4
  justification          string (no vacío)                       # R4
  instructions           string (≥1 ref R<n>/AC<n>; nombra el    # R5
                                  task_id previo si hay deps)
  expected_output_schema string (no vacío)                       # R6
  satisfies_acs          string[] (≥1 AC<n>)                     # R6/R7
  estimated_tokens       integer                                 # R9
  actual_tokens          null                                    # R9 (hueco exec)
  deviation              null                                    # R9 (hueco exec)
coverage:                                                        # R7 (sección de evidencia)
  requirements  { "R1": ["task_id…"], … }   # cada R<n> del spec → tareas que lo cubren
  acs           { "AC1": ["task_id…"], … }  # cada AC<n> del spec → tareas que lo satisfacen
```

**Enlace AC↔tarea (Open Question resuelta):** `expected_output_schema` es un **string** (describe el
artefacto) y el enlace máquina-checkable va en el campo hermano `satisfies_acs[]`. La cobertura (R7)
se calcula como la unión de `source_ids` (raíces R<n>) y la unión de `satisfies_acs` sobre todas las
tareas, materializada en `coverage`.

### Checks del validador `plan-tools.mjs`

`inspect-spec <spec.md>` (usado en ingesta, R1):
- Detecta IDs `R<n>`, escenarios `R<n>.S<m>` y la sección `## Acceptance Criteria`.
- Si falta alguno → exit≠0 nombrando el elemento ausente (R1.S2 → AC2).
- Si OK → imprime `"N requisitos, M ACs detectados"` con los enteros reales (R1.S1 → AC1).

`check-plan <spec.md> <plan.json>` (usado antes de escribir, R8):
- JSON parseable + campos requeridos del esquema presentes/tipados → si no, exit≠0 con campo (AC16).
- `task_id` únicos; cada tarea con ≥1 `source_id` (AC3).
- `dependencies` referencian task_ids existentes; **DAG acíclico** (DFS/topo-sort) → si ciclo, exit≠0
  reportando los IDs implicados (AC6/AC16).
- `agent_type|subagent|model|justification` no vacíos (AC8).
- `instructions` con ≥1 patrón `R<n>`/`AC<n>`; nombra un task_id de `dependencies` cuando las hay;
  NO referencia task_ids cuando `dependencies: []` (AC10/AC11).
- `expected_output_schema` no vacío y `satisfies_acs` ≥1 (AC12).
- **Cobertura dura:** cada `R<n>` y cada `AC<n>` del spec cubierto por ≥1 tarea; si falta uno →
  exit≠0 con el ID exacto sin cubrir (AC13/AC14).
- `estimated_tokens` entero; `estimated_tokens_total` presente; `actual_tokens`/`deviation` `=== null`;
  `confidence` presente (AC17/AC18).
- ≥2 tareas con `dependencies: []` cuando el spec tiene ≥2 requisitos independientes (AC7).

**Seguridad de escritura (R8.S2):** la skill genera el candidato en `execution_plan.json.tmp` en el
mismo directorio, corre `check-plan`; si pasa → `mv` al nombre final; si falla → borra el tmp y reporta.
Nunca queda un fichero inválido en su sitio.

## Subplanes (cada uno cierra en checkpoint commiteable + verificable)

Convención por tarea: `[modelo] descripción — done-check`. Reparto según catálogo del usuario;
Opus retiene diseño/integración/revisión, delega lo acotado en Sonnet y lo mecánico en Haiku.

### SP0 — Migración a `sdd-kit` (estructura). *Primero; desbloquea todo.*
- **T0.1 [haiku]** `grep` de todas las referencias a `spec-writer` (marketplace, README, rutas) —
  inventario para el rename en un solo lote. *done:* lista de ficheros/líneas.
- **T0.2 [sonnet]** Crear `plugins/sdd-kit/` y mover `SKILL.md` + `assets/spec-template.md` a
  `skills/spec-writer/`; escribir `plugin.json` (name `sdd-kit`, version `0.1.0`, skills
  auto-discover); actualizar `marketplace.json` y la tabla del README + nota de rename; borrar
  `plugins/spec-writer/`. *done:* árbol como el layout objetivo.
- **T0.3 [haiku]** `bash scripts/validate.sh`. *done:* `claude plugin validate --strict` verde y
  ambas skills descubiertas; si el layout multi-skill se rechaza → **parar** y aplicar fallback.
- **Checkpoint:** commit `sdd-kit: migrar spec-writer a plugin multi-skill`.

### SP1 — Contratos: esquema + roles. *Depende de SP0.*
- **T1.1 [sonnet]** Escribir `assets/execution_plan.schema.json` según "Esquema" arriba (JSON Schema
  draft con `required`, `enum`, tipos). *done:* JSON válido, refleja todos los campos.
- **T1.2 [sonnet]** Escribir `assets/agent-roles.md` con la tabla de mapeo. *done:* tabla completa.
- **Checkpoint:** commit `plan-writer: esquema execution_plan + tabla de roles`.

### SP2 — Validador `plan-tools.mjs`. *Depende de SP1 (enforce del esquema).* Backbone.
- **T2.1 [sonnet]** Implementar `inspect-spec` (parseo de spec + conteos + fallo estructural R1).
  *done:* sobre un spec válido imprime los conteos; sobre uno sin `## Acceptance Criteria` falla
  nombrándolo.
- **T2.2 [sonnet]** Implementar `check-plan` con toda la lista de checks (incluye topo-sort de ciclos
  y cobertura cruzada spec↔plan). *done:* sobre un plan válido a mano pasa; sobre uno cíclico falla
  con los IDs del ciclo.
- **Checkpoint:** commit `plan-writer: validador determinista (inspect-spec, check-plan)`.

### SP3 — Fixtures + CI. *Depende de SP1+SP2.* Hace reales los AC `[auto]`. // paralelizable con SP4
- **T3.1 [sonnet]** Crear fixtures por escenario: `valid/`, `cyclic/`, `missing-ac-section/`,
  `no-r-ids/`, `uncovered-id/`, `invalid-schema/`, `bad-instructions/` (cada uno spec.md + plan.json
  donde aplique). *done:* un fixture por AminC automatizable.
- **T3.2 [sonnet]** `test/run.mjs`: corre `plan-tools.mjs` sobre cada fixture y asevera exit code +
  fragmento de mensaje esperado. *done:* runner verde en local.
- **T3.3 [haiku]** Extender `scripts/validate.sh` con `node plugins/sdd-kit/test/run.mjs`. *done:*
  `bash scripts/validate.sh` corre manifiestos + fixtures, todo verde.
- **Checkpoint:** commit `plan-writer: fixtures + wiring CI`.

### SP4 — `SKILL.md` + docs del plugin. *Depende de SP1+SP2.* // paralelizable con SP3
- **T4.1 [opus]** Fijar el outline del método en `SKILL.md`: ingesta (correr `inspect-spec`, R1) →
  descomposición atómica (R2) → DAG (R3) → asignación de agente vía `agent-roles.md` (R4) →
  instructions con refs a IDs (R5) → contrato de salida + `satisfies_acs` (R6) → cobertura dura
  (R7) → escritura segura tmp+`check-plan`+mv (R8) → estimación de tokens `confidence:low` (R9) →
  E2E. Autónomo salvo ambigüedad no resoluble (R1/R3/R7/R8). *done:* outline aprobado.
- **T4.2 [sonnet]** Redactar el `SKILL.md` completo desde el outline (frontmatter `name: plan-writer`,
  `allowed-tools` incl. Bash para correr el validador). *done:* fichero completo, autocontenido.
- **T4.3 [sonnet]** Escribir `AGENTS.md` (ambas skills) y `CHANGELOG.md` (0.1.0); actualizar README.
  *done:* docs coherentes con el rename.
- **Checkpoint:** commit `plan-writer: SKILL.md + AGENTS + CHANGELOG`.

### SP5 — Verificación E2E + cierre. *Depende de todos.*
- **T5.1 [opus]** Dogfood: correr `plan-writer` sobre `plan-writer-spec.md` (o un spec de muestra);
  confirmar que produce `execution_plan.json` que `check-plan` valida (AC-E2E), 100% cobertura R/AC,
  DAG acíclico. *done:* plan generado pasa `check-plan`.
- **T5.2 [opus]** Revisión manual de AC4 (atomicidad de las tareas) y AC9 (austeridad de `model`) —
  los dos `[manual]` del spec. *done:* checklist manual anotada.
- **T5.3 [haiku]** `bash scripts/validate.sh` final verde. *done:* CI-equivalente en verde.
- **Cierre:** PR a `main` (hay remoto). Rama `ia/plan-writer`.

## Dependencias y paralelismo

```
SP0 → SP1 → SP2 → { SP3 ‖ SP4 } → SP5
```
SP3 y SP4 son independientes tras SP2 (fixtures no necesitan SKILL; SKILL no necesita fixtures) →
lanzar en paralelo. Todo lo demás secuencial por dependencia real.

## Trazabilidad AC del spec → dónde se verifica

| AC | Verificación |
|----|--------------|
| AC1, AC2 | fixtures `valid/`, `missing-ac-section/`, `no-r-ids/` vía `inspect-spec` (SP3) |
| AC3, AC7, AC8, AC10–13, AC15, AC17, AC18 | fixture `valid/` vía `check-plan` (SP3) |
| AC5 | fixture `valid/` (dependencies == Depende de) |
| AC6, AC16 | fixtures `cyclic/`, `invalid-schema/` (SP3) |
| AC10/AC11 (neg.) | fixture `bad-instructions/` (SP3) |
| AC14 | fixture `uncovered-id/` (SP3) |
| AC-E2E | dogfood T5.1 (no CI) |
| AC4, AC9 | revisión manual T5.2 |

## Riesgos y notas

- **[alto] Layout multi-skill** — que `claude plugin validate --strict` acepte `skills/<name>/SKILL.md`
  con auto-discovery se **verifica en T0.3 antes de construir nada encima**. Fallback si lo rechaza:
  publicar `plugins/plan-writer/` standalone (sibling de spec-writer, sin migrar), difiriendo `sdd-kit`.
- **Breaking del nombre de instalación** (`spec-writer@` → `sdd-kit@`): documentado en CHANGELOG y README.
- **Dependencia de Node** introducida en un repo antes bash+jq: CI ya tiene Node 22; los devs locales
  necesitan `node`. Aceptado; anotado en README/validate.sh.
- **La generación no es determinista** → CI valida planes fixture, no la salida del LLM. El AC-E2E vive
  en el dogfood, no en el pipeline. No se maquilla como "verde en CI".
- **`estimated_tokens` de baja confianza** (R9): heurística simple por modelo/tipo de tarea, marcada
  `confidence:low`; su valor es servir de baseline al exec, no un compromiso.
