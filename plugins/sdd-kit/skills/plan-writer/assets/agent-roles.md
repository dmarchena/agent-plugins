# Catálogo de roles de agente

`plan-writer` asigna a cada tarea del `execution_plan.json` el rol más austero que la resuelva
con garantías: Haiku para trabajo mecánico, Sonnet para implementación acotada con criterios de
aceptación claros, y Opus para juicio, revisión crítica o diseño con trade-offs. `agent_type` es
un rol **abstracto y portable** (no depende de la herramienta de ejecución); `subagent` es su
mapeo **concreto a Claude Code**, es decir, el subagente real que se invoca para llevar a cabo
la tarea.

| `agent_type`        | `subagent`        | `model`  | Cuándo |
|---------------------|-------------------|----------|--------|
| `researcher`        | `Explore`         | `haiku`  | localizar / inventariar / extraer (solo lectura) |
| `terminal_operator` | `general-purpose` | `haiku`  | correr checks/tests, ediciones mecánicas, renombrados |
| `code_writer`       | `general-purpose` | `sonnet` | implementar con criterios de aceptación claros |
| `doc_writer`        | `general-purpose` | `sonnet` | redactar docs siguiendo un esquema |
| `reviewer`          | `general-purpose` | `opus`   | revisión crítica / juicio |
| `architect`         | `Plan`            | `opus`   | diseño / decisiones con trade-offs |
| `verifier`          | `general-purpose` | `haiku`  | correr la suite ya existente y confirmar verde (sin código, sin fase roja) — la tarea que respalda el `R-E2E`/`AC-E2E` que todo spec exige |

## Coste real de un subagente: turnos, no prompt fijo

Medido sobre invocaciones reales de `general-purpose` en este repo: el coste es casi todo
`cache_read` por turnos acumulados dentro de la propia tarea, no el prompt de sistema del agente
(identity + tools ronda 4-5k tokens fijos, ~0,4-2% del total observado — ahí no hay ahorro real;
un "agente más ligero" con menos tools no mueve la aguja). La palanca que sí funciona es la
granularidad de la tarea: mantener cada nodo del plan acotado a **una entrega verificable** (ver
*Planificación* en las instrucciones generales) para que el subagente cierre en pocos turnos. Si
una tarea previsiblemente necesita muchos turnos (>15-20), particionarla en el propio
`execution_plan.json` en vez de esperar que un rol/modelo distinto lo arregle.
