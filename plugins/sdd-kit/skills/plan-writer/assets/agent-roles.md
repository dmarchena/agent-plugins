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
