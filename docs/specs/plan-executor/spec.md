# Spec: plan-executor (sdd-kit, fase exec)

## Purpose

Tercera fase del flujo sdd-kit (spec → plan → **exec** → verify): una skill que ejecuta el
`execution_plan.json` producido por plan-writer, tarea a tarea, delegando en los subagentes y
modelos que el plan asigna. Su rasgo diferencial es la economía de tokens: sustituye el patrón
caro "subagente desarrollador + subagente revisor por tarea" (~30K tokens por agente) por un
ciclo TDD con verificación determinista — el contrato del test viene de fuera del implementador
y el orquestador comprueba el verde re-corriendo el test, no pagando un revisor.

## Scope

**In scope:**
- Cargar y validar el `execution_plan.json` y ejecutar su DAG de tareas hasta completarlo,
  bloquearse o pausarse.
- Ciclo TDD por tarea con un único subagente ejecutor (test → rojo → implementación → verde).
- Verificación barata por tarea: evidencia rojo→verde + re-ejecución determinista del test por
  el orquestador.
- Paralelización de tareas independientes y secuenciación de dependientes según el DAG.
- Estado de ejecución persistente y reanudable, con registro de consumo real por tarea.
- Rama git propia por plan y commit por tarea verde.

**Out of scope (non-goals):**
- Generar o modificar el plan: si el plan es inválido o insuficiente, se para y se remite a
  plan-writer; no se re-planifica sobre la marcha.
- La verificación final de la feature (checklist de aceptación completo del spec): eso es la
  fase verify. Esta skill garantiza el nivel tarea (tests TDD en verde).
- Gestión de PR/merge: la skill commitea en su rama, pero no abre PR ni mergea.
- Planes en otros formatos: solo consume `execution_plan.json` conforme al schema de
  plan-writer.

## Functional Requirements

### R1 — Carga y validación del plan

Depende de: —

The system MUST validar el `execution_plan.json` (conformidad con su schema y cobertura
completa de requisitos/ACs) antes de ejecutar nada, y SHALL negarse a ejecutar un plan
inválido.

#### R1.S1 — Plan válido
- GIVEN un directorio `docs/specs/<slug>/` con `spec.md` y un `execution_plan.json` que valida
  contra el schema de plan-writer
- WHEN se invoca la skill sobre ese plan
- THEN la skill identifica las tareas sin dependencias pendientes como ejecutables y comienza
  la ejecución
- AND anuncia el plan de tandas (qué tareas van en paralelo y cuáles esperan)

#### R1.S2 — Plan inválido
- GIVEN un `execution_plan.json` que no valida contra el schema o cuya sección `coverage` deja
  requisitos o ACs sin tarea asignada
- WHEN se invoca la skill
- THEN la skill se detiene sin crear rama, estado ni lanzar subagentes
- AND el mensaje final nombra el error concreto (campo/tarea que no valida, o el ID de
  requisito/AC sin cubrir) y remite a plan-writer para corregirlo

### R2 — Ciclo TDD por tarea con ejecutor único

Depende de: R1

The system SHALL ejecutar cada tarea mediante un único subagente (el `subagent`/`model` que
fija el plan) que sigue el ciclo TDD: escribir el test desde un contrato externo, comprobar que
falla, implementar, y comprobar que pasa. El contrato del test nunca lo inventa el
implementador: viene del plan o, en su defecto, de los escenarios del spec.

#### R2.S1 — Tarea con contrato de test en el plan
- GIVEN una tarea ejecutable cuyas `instructions` incluyen un contrato de test (casos y
  aserciones observables)
- WHEN el orquestador delega la tarea
- THEN el subagente entrega: fichero(s) de test nuevos que materializan el contrato,
  la implementación, la salida del test fallando ANTES de implementar y pasando DESPUÉS,
  el comando exacto para re-correr el test, y su consumo de tokens

#### R2.S2 — Tarea sin contrato de test (fallback al spec)
- GIVEN una tarea ejecutable sin contrato de test en sus `instructions`
- WHEN el orquestador delega la tarea
- THEN el brief del subagente le indica derivar el contrato de los escenarios del `spec.md`
  referenciados por sus `source_ids`/`satisfies_acs`
- AND el test entregado referencia esos IDs de escenario/AC en su descripción

#### R2.S3 — El test no falla en rojo
- GIVEN un subagente que escribe el test y este pasa sin haber implementado nada
- WHEN reporta el resultado
- THEN la tarea no se da por verde: queda registrada con incidencia "sin evidencia de rojo"
  (el test no prueba comportamiento nuevo o el comportamiento ya existía) para decisión del
  usuario

### R3 — Verificación determinista por el orquestador

Depende de: R2

The system MUST verificar cada tarea sin lanzar un subagente revisor: exigiendo la evidencia
rojo→verde del ciclo TDD y re-corriendo el comando de test el propio orquestador.

#### R3.S1 — Verde confirmado
- GIVEN un subagente que reporta su tarea completada con evidencia rojo→verde y comando de test
- WHEN el orquestador re-corre ese comando y sale verde
- THEN la tarea se marca completada en el estado
- AND se crea un commit propio de la tarea (test + implementación) en la rama del plan

#### R3.S2 — El re-run contradice al subagente
- GIVEN un subagente que reporta verde
- WHEN el orquestador re-corre el comando de test y falla
- THEN la tarea NO se marca completada y el resultado cuenta como intento fallido (ver R6)
- AND la salida del test fallido queda registrada en el estado

### R4 — Orquestación del DAG y git

Depende de: R1

The system SHALL ejecutar en paralelo las tareas independientes (máximo 3 simultáneas),
secuenciar las dependientes según el DAG, y trabajar en una rama git propia del plan.

#### R4.S1 — Tandas paralelas
- GIVEN un plan con varias tareas sin dependencias pendientes entre sí
- WHEN el orquestador lanza una tanda
- THEN las lanza en una única acción (no una por turno), sin exceder 3 simultáneas
- AND ninguna tarea se lanza antes de que TODAS sus `dependencies` estén completadas

#### R4.S2 — Rama propia
- GIVEN la invocación de la skill con el repo en la rama principal
- WHEN comienza la ejecución (plan ya validado)
- THEN crea (o reutiliza, si existe de una ejecución previa) la rama `ia/<slug>` y todos los
  commits de tareas van a esa rama

### R5 — Estado persistente y registro de consumo

Depende de: R2, R3

The system MUST mantener el estado de ejecución en un fichero propio
(`docs/specs/<slug>/execution_state.json`) actualizado en cada frontera de tarea, y MUST NOT
modificar el `execution_plan.json`.

#### R5.S1 — Estado tras cada tarea
- GIVEN una ejecución en curso
- WHEN una tarea termina (completada, fallida o bloqueada)
- THEN `execution_state.json` refleja para esa tarea: status, `actual_tokens`, `deviation`
  frente a `estimated_tokens`, el comando de test, y (si aplica) la incidencia
- AND el `execution_plan.json` permanece byte-idéntico al original
- AND ninguna tarea a medias figura nunca como completada (el estado solo se escribe en
  fronteras)

### R6 — Fallos y presupuesto

Depende de: R3, R5

The system SHALL contener el coste de los fallos: un único reintento informado por tarea, corte
de la rama del DAG afectada sin detener las sanas, y pausa por desviación acumulada de
presupuesto.

#### R6.S1 — Tarea que no llega a verde
- GIVEN una tarea cuyo primer intento no consigue el verde
- WHEN el orquestador la reintenta una única vez incluyendo el diagnóstico del fallo en el
  brief y ese reintento también falla
- THEN la tarea queda marcada `blocked` en el estado, sus dependientes (directas y
  transitivas) quedan `skipped`, y las ramas del DAG que no dependen de ella continúan
- AND el informe final lista las bloqueadas/omitidas con su motivo

#### R6.S2 — Umbral acumulado de tokens
- GIVEN un consumo real acumulado que supera 2× la suma de `estimated_tokens` de las tareas ya
  ejecutadas
- WHEN el orquestador llega a la siguiente frontera de tarea (nunca a mitad de una)
- THEN pausa antes de lanzar más tareas, anota el motivo y las cifras (real vs estimado) en el
  estado, y pregunta al usuario si refinar el plan o continuar

### R7 — Reanudación

Depende de: R5

The system SHALL poder reanudar una ejecución a medias (tras pausa, bloqueo o cierre de sesión)
a partir del estado en disco, verificando antes que el terreno sigue siendo válido.

#### R7.S1 — Reanudar y continuar
- GIVEN un `execution_state.json` con tareas completadas y pendientes
- WHEN se invoca la skill de nuevo sobre el mismo plan
- THEN re-corre los comandos de test de las tareas completadas y, si todos siguen verdes,
  continúa ejecutando solo las pendientes según el DAG

#### R7.S2 — El terreno cambió
- GIVEN un estado con tareas completadas cuyo árbol de trabajo fue modificado después
- WHEN al reanudar el re-run de algún test completado falla
- THEN la skill se detiene antes de lanzar tareas nuevas y reporta qué tarea/test rompió,
  dejando la decisión al usuario

### R-E2E — Ejecución completa de un plan

Depende de: R1, R2, R3, R4, R5, R6, R7

The system SHALL ejecutar de principio a fin un plan válido de varias tareas con dependencias
mixtas, dejando código testeado, historia git por tarea, estado completo y un informe final.

#### R-E2E.S1 — Recorrido integrador
- GIVEN un `docs/specs/<slug>/` con spec y un plan válido de 3 tareas: dos independientes y una
  que depende de ambas, con el repo en la rama principal
- WHEN se invoca la skill y se deja terminar
- THEN existe la rama `ia/<slug>` con exactamente 3 commits de tarea (test + implementación
  cada uno), las dos independientes se lanzaron en la misma tanda y la dependiente después,
  `execution_state.json` marca las 3 completadas con `actual_tokens`/`deviation` rellenos,
  todos los tests pasan en un re-run final
- AND el mensaje final incluye: tareas completadas/bloqueadas, tokens reales vs estimados
  (total y por tarea) y los ACs del spec que las tareas declaran satisfacer

## Technical Requirements

- **Stack / framework:** skill de Claude Code (`SKILL.md`) dentro del plugin sdd-kit, con
  comando atajo `/sdd-kit:exec` siguiendo el patrón de `:spec` y `:plan`.
- **Integraciones:** consume `execution_plan.json` (schema de plan-writer) y `spec.md`
  (formato spec-writer) del mismo `docs/specs/<slug>/`; git local. Sin servicios externos.
- **Rendimiento:** el coste objetivo por tarea es el de UN subagente ejecutor (sin revisor);
  la verificación del orquestador es determinista (re-run de tests, ~0 tokens de subagente).
  Umbral de pausa: acumulado real > 2× estimado ejecutado. Paralelismo máximo: 3.
- **Seguridad / privacidad:** N/A (sin red; no escribe fuera del repo y su `docs/specs/`).
- **Datos / almacenamiento:** `execution_state.json` junto al plan en `docs/specs/<slug>/`;
  el plan es inmutable para esta skill. El estado registra por tarea: status
  (`pending|running|done|blocked|skipped`), `actual_tokens`, `deviation`, comando de test,
  incidencias y motivo de pausa si lo hay.
- **Restricciones adicionales:** los `subagent`/`model` por tarea son los que fija el plan (la
  skill no los re-decide); commits sin pedir confirmación en la rama `ia/<slug>`.

## Acceptance Criteria

- [ ] AC1 → R1.S2 [auto] — con un plan fixture inválido: no existe rama nueva ni
  `execution_state.json`, y el mensaje final contiene el campo/ID concreto que falla y la
  mención a plan-writer.
- [ ] AC2 → R2.S1 [auto] — tras ejecutar una tarea con contrato: existen fichero de test e
  implementación nuevos, y el estado guarda evidencia de rojo y de verde y el comando de test.
- [ ] AC3 → R2.S2 [auto] — con una tarea sin contrato: el fichero de test generado referencia
  los IDs de escenario/AC del spec correspondientes.
- [ ] AC4 → R2.S3 [auto] — con una tarea cuyo test pasa sin implementar: el estado la registra
  con incidencia "sin evidencia de rojo" y no como completada.
- [ ] AC5 → R3.S1 [auto] — cada tarea `done` del estado tiene su commit propio en la rama y su
  comando de test sale verde al re-correrlo.
- [ ] AC6 → R3.S2 [auto] — con un reporte de verde falso (fixture): la tarea no figura `done` y
  el estado contiene la salida del test fallido.
- [ ] AC7 → R4.S1 [manual] — en la transcripción de la sesión, las tareas independientes de una
  tanda se lanzan en una única acción y nunca más de 3; requiere leer la transcripción porque
  el observable (cómo se lanzaron los subagentes) no queda en disco.
- [ ] AC8 → R4.S2 [auto] — partiendo de la rama principal: existe la rama `ia/<slug>` y la rama
  principal no recibe ningún commit de tarea.
- [ ] AC9 → R5.S1 [auto] — al terminar cualquier tarea: `execution_state.json` contiene status,
  `actual_tokens`, `deviation` y comando de test de esa tarea, y `execution_plan.json` es
  byte-idéntico al original.
- [ ] AC10 → R6.S1 [auto] — con una tarea fixture que falla dos veces: estado con esa tarea
  `blocked`, sus dependientes `skipped` y las independientes `done`.
- [ ] AC11 → R6.S2 [auto] — con un plan fixture de estimaciones minúsculas: el estado registra
  la pausa por umbral (motivo y cifras) antes de la última tanda.
- [ ] AC12 → R7.S1 [auto] — segunda invocación sobre un estado a medias: los tests de las
  tareas `done` se re-corren y solo las pendientes se ejecutan.
- [ ] AC13 → R7.S2 [auto] — tras romper manualmente un test `done` y reinvocar: la skill para
  sin lanzar tareas nuevas y nombra el test roto.
- [ ] AC-E2E → R-E2E.S1 [auto] — sobre el fixture de 3 tareas: rama con 3 commits de tarea,
  estado con las 3 `done` y consumos rellenos, re-run final de todos los tests en verde, e
  informe final con real vs estimado y ACs cubiertos.

## Assumptions & Open Questions

- **Contrato de test en plan-writer (mejora aparte):** enriquecer plan-writer para que cada
  tarea lleve un contrato de test explícito (casos y aserciones, sin código) es un cambio
  independiente con su propia spec. Hasta entonces, todas las tareas usan el fallback al spec
  (R2.S2), que funciona con los planes actuales.
- **Huecos `actual_tokens`/`deviation` del plan:** quedan `null` para siempre en
  `execution_plan.json`; el consumo real vive en `execution_state.json`. La descripción del
  schema de plan-writer ("huecos que la fase exec rellenará") debería actualizarse para
  reflejarlo — cambio menor, mismo paquete que el contrato de test.
- **Fuente de `actual_tokens`:** el consumo por tarea se toma del reporte de uso del subagente;
  el mecanismo exacto de captura lo fija la fase de plan de esta feature.
- **Valores por defecto ajustables:** umbral 2× y paralelismo 3 son defaults razonables, no
  parte del contrato; podrán hacerse configurables sin cambiar esta spec.
- **Schema del estado:** la forma exacta de `execution_state.json` (schema propio) se define en
  la fase de plan; esta spec solo fija qué información debe contener (R5.S1, Datos).
