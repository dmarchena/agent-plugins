# Spec: Canonical `{ok,data,error}` envelope for all sdd-kit CLI stdout

## Purpose

Los CLIs de sdd-kit hablan a Claude de formas inconsistentes por su stdout:
`exec-tools`/`verify-tools` duplican `die()`/`out()`/`parseFlags()`,
`plan-tools` emite JSON con `stdout.write` directo y su propio `fail()`,
`versioning-report` imprime texto plano (`⚠ versioning: …`) con exit 0 siempre,
y `budget-guard`/`forensics`/`token-cost` emiten **prosa de presentación**
(líneas de estado, resúmenes) mezclada con, o en lugar de, datos.

Esta spec establece un **único principio para todo el plugin**: el stdout de
cualquier CLI es **data-exchange**, servido como un envelope canónico
`{ ok, data, error }` desde un módulo compartido. La prosa deja de ser un
contrato: los datos ricos que un CLI necesite persistir van a **fichero** (como
`forensics.json` ya hace); cualquier resumen legible lo deriva el consumidor a
partir de `data`. Es el issue #20 llevado a su conclusión —**Nivel A (dedup) +
Nivel B (formato único), aplicado a todo el borde stdout del plugin, no sólo a
los `*-tools.mjs`**. Rompe deliberadamente el contrato de salida actual, así que
arrastra a scope a los consumidores (SKILL.md, commands) y a la suite de tests.
Para: mantenedores de sdd-kit.

Change type: refactor

## Scope

**In scope:**
- Envelope canónico único para toda salida de resultado por stdout:
  `{ ok: true, data: <payload> }` en éxito, `{ ok: false, error: { reason } }`
  en fallo operativo.
- Módulo compartido `scripts/lib/cli.mjs` que posee los helpers de I/O (emitir
  envelope de éxito, de error, `parseFlags`); sin definiciones duplicadas.
- **Todos** los CLIs del plugin cuyo stdout es un contrato con un consumidor:
  `exec-tools.mjs`, `verify-tools.mjs`, `plan-tools.mjs`, `versioning-report.mjs`,
  `token-cost.mjs`, `budget-guard.mjs`, `forensics.mjs`.
- Los artefactos de datos ricos siguen persistiéndose a fichero (`forensics.json`
  permanece); la prosa-resumen de stdout se elimina y se deriva de `data`.
- Consumidores actualizados: SKILL.md/assets de `verify`, `plan-executor`,
  `plan-writer`, `spec-forensics`, y `commands/forensics.md`.
- Suite de tests actualizada al envelope y en verde.

**Out of scope (non-goals):**
- Cambiar la lógica de dominio de cada comando (qué calcula/valida): sólo cambia
  la **envoltura** de su salida, no el contenido de `data` ni de los ficheros.
- `tokenizer.mjs`: es librería importada, no un CLI que emita a stdout.
- Añadir comandos o flags nuevos (p. ej. el modo `--json` de `token-cost` deja de
  ser necesario porque el envelope pasa a ser el único formato; retirarlo o no es
  detalle de plan, no un comando nuevo).
- Reintroducir salida en prosa como contrato en cualquier CLI.

## Functional Requirements

### R1 — Envelope canónico único en todo stdout de resultado

Depende de: —

The system SHALL emitir el resultado de todo comando de los CLIs en scope como un
único objeto JSON en stdout con la forma `{ ok, data?, error? }`, sin ninguna otra
salida de resultado por stdout (ni objetos "desnudos", ni prosa, ni líneas sueltas).

#### R1.S1 — Éxito operativo
- GIVEN un comando que hoy termina bien (exit 0) y produce un payload
- WHEN se ejecuta tras la migración
- THEN stdout contiene exactamente un objeto JSON compacto (una línea, sin
  indent, con `\n` final) con `ok: true` y el payload bajo `data`, y exit code 0

#### R1.S2 — Estado de dominio negativo sigue siendo ok:true
- GIVEN el comando de verify que reporta `status: 'not-archived'`
- WHEN se ejecuta tras la migración
- THEN stdout es `{ ok: true, data: { status: 'not-archived', ... } }`, exit 0
  (`ok` sólo refleja que el comando corrió sin fallo; el veredicto de dominio
  vive en `data`)

#### R1.S3 — Fallo operativo
- GIVEN un comando con input inválido que hoy dispara `die`/`fail`
  (p. ej. `plan-tools.mjs` con un plan.json malformado)
- WHEN se ejecuta tras la migración
- THEN stdout contiene `{ ok: false, error: { reason: "<mensaje>" } }` compacto
  (una línea), con `reason` = el mensaje de error previo, y exit code ≠ 0

### R2 — Un módulo compartido posee los helpers de I/O

Depende de: R1

The system SHALL centralizar en `scripts/lib/cli.mjs` los helpers que emiten el
envelope de éxito, el de error, y parsean flags; sin definición local duplicada
en ningún CLI en scope.

#### R2.S1 — Sin definiciones duplicadas
- GIVEN los 7 CLIs en scope
- WHEN se buscan definiciones locales de helpers de I/O
  (`function die|out|parseFlags|fail`)
- THEN el conteo en esos ficheros es 0 y cada uno importa de `scripts/lib/cli.mjs`

#### R2.S2 — Convención documentada en un solo sitio
- GIVEN `scripts/lib/cli.mjs`
- WHEN se inspecciona su cabecera
- THEN contiene un comentario que describe el envelope, el uso de stdout para
  data-exchange (nunca prosa), la serialización **compacta** (una línea), y el
  mapeo `ok:true ⇔ exit 0` / `ok:false ⇔ exit ≠ 0`

### R3 — CLIs de reporte migrados sin salida en prosa

Depende de: R1

The system SHALL migrar los CLIs que hoy emiten prosa (`versioning-report`,
`token-cost`, `budget-guard`, `forensics`) para que su stdout sea el envelope,
preservando su exit-code-como-señal donde aplique y sus artefactos de fichero.

#### R3.S1 — versioning-report en envelope
- GIVEN un repo con avisos de versioning y política activa
- WHEN se ejecuta `versioning-report.mjs`
- THEN stdout es `{ ok: true, data: { warnings: [ { message, ... } ] } }`, sin
  líneas `⚠ versioning: …`
- AND con política desactivada/ausente es `{ ok: true, data: { warnings: [] } }`, exit 0

#### R3.S2 — budget-guard: envelope + gate preservado
- GIVEN una medición donde un skill excede su techo de tokens
- WHEN se ejecuta `budget-guard.mjs`
- THEN stdout es `{ ok: true, data: { results: [ { skill, count, ceiling, over } ], withinBudget: false } }`
  (data reconstruye lo que antes eran las líneas de texto)
- AND el proceso mantiene exit code ≠ 0 como gate (desacoplado de `ok`, que es true
  porque el comando corrió sin fallo)

#### R3.S3 — forensics: envelope en stdout, artefacto en fichero
- GIVEN un `SPECDIR` válido con estado de ejecución
- WHEN se ejecuta `forensics.mjs`
- THEN sigue escribiendo `forensics.json` con los datos completos, Y su stdout es
  `{ ok: true, data: { ... } }` (los mismos datos u/o un puntero al fichero), sin
  el resumen en prosa `outcome.lines`

#### R3.S4 — token-cost en envelope
- GIVEN una invocación de `token-cost.mjs` que hoy renderiza un reporte
- WHEN se ejecuta tras la migración
- THEN stdout es `{ ok: true, data: <reporte estructurado> }`, sin la variante en
  prosa como contrato

### R4 — Consumidores leen el envelope

Depende de: R1, R3

The system SHALL actualizar los SKILL.md/assets y commands que parsean estas
salidas para que lean el envelope (`data`/`ok`/`error`) y deriven cualquier
resumen legible de `data`, en vez del formato antiguo o la prosa.

#### R4.S1 — Consumidores en scope actualizados
- GIVEN los assets/SKILL.md de `verify`, `plan-executor`, `plan-writer`,
  `spec-forensics` y `commands/forensics.md`
- WHEN se revisan tras la migración
- THEN ninguno instruye leer el formato antiguo ni parsear prosa de stdout; todos
  referencian el envelope (`.data`, `.ok`, `.error.reason`)

### R5 — Suite de tests migrada y verde

Depende de: R1, R2, R3, R4

The system SHALL actualizar los tests que parsean salida de CLIs al envelope,
dejando la suite completa en verde.

#### R5.S1 — Suite verde
- GIVEN la suite `node --test` sobre `plugins/sdd-kit/test/`
- WHEN se ejecuta tras la migración
- THEN todos los tests pasan

#### R5.S2 — Aserciones sobre el envelope
- GIVEN los tests que antes parseaban objetos desnudos o comprobaban prosa
  (`⚠ versioning:`, líneas `skill: … OK`, resúmenes de forensics)
- WHEN se inspeccionan tras la migración
- THEN asertan sobre el envelope (`parsed.ok`, `parsed.data...`,
  `parsed.error.reason`), no sobre el formato/prosa antiguos

### R-E2E — Recorrido completo con envelope de extremo a extremo

Depende de: R1, R2, R3, R4, R5

The system SHALL soportar un flujo real de sdd-kit (un comando de cada CLI
consumido como lo haría su skill/command) hablando exclusivamente el envelope,
sin regresión de dominio.

#### R-E2E.S1 — Flujo integrador
- GIVEN un repo/spec de fixture que atraviesa plan → exec → verify → versioning →
  forensics
- WHEN se ejecuta un comando representativo de cada CLI y se interpreta su salida
  como el consumidor correspondiente (leyendo `data`/`ok`/`error`)
- THEN cada salida es un envelope válido, los valores de dominio bajo `data` (y los
  ficheros como `forensics.json`) coinciden con el comportamiento previo, y la
  suite `node --test` queda en verde

## Technical Requirements

- **Stack / framework:** Node.js ESM (`.mjs`), sólo built-ins; sin nuevas dependencias.
- **Integraciones:** N/A (no hay APIs externas en `scripts/`).
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** stdout = único contrato de datos vía envelope;
  `error.reason` es cadena semántica, no stack trace. Los datos ricos persisten a
  fichero (p. ej. `forensics.json`), no por stdout.
- **Restricciones adicionales:** nuevo módulo `scripts/lib/cli.mjs` con import
  relativo; el envelope se serializa **compacto** (`JSON.stringify(obj)`, una
  línea, sin indent) para minimizar el peso rearrastrado en cada viaje del
  agente; `ok:true ⇔ exit 0` salvo el exit-code-gate de `budget-guard`
  (excedido ⇒ exit ≠ 0 con `ok:true`); ningún CLI en scope emite prosa por stdout
  como contrato.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — un comando de éxito emite `{ok:true,data:{...}}` JSON compacto (una línea + `\n`, sin indent), exit 0.
- [ ] AC2 → R1.S2 [auto] — verify con `not-archived` emite `{ok:true,data:{status:'not-archived',...}}`, exit 0.
- [ ] AC3 → R1.S3 [auto] — `plan-tools.mjs` con plan.json malformado emite `{ok:false,error:{reason:"…"}}` en stdout, exit ≠ 0.
- [ ] AC4 → R2.S1 [auto] — grep de `function die|out|parseFlags|fail` en los 7 CLIs devuelve 0; todos importan de `lib/cli.mjs`.
- [ ] AC5 → R2.S2 [auto] — `scripts/lib/cli.mjs` documenta el envelope + regla stdout-solo-datos + mapeo exit-code.
- [ ] AC6 → R3.S1 [auto] — `versioning-report.mjs` emite `{ok:true,data:{warnings:[...]}}` (con y sin warnings), sin `⚠ versioning:`.
- [ ] AC7 → R3.S2 [auto] — `budget-guard.mjs` con exceso emite `{ok:true,data:{results:[...],withinBudget:false}}` y exit ≠ 0.
- [ ] AC8 → R3.S3 [auto] — `forensics.mjs` escribe `forensics.json` y emite `{ok:true,data:{...}}` en stdout, sin la prosa `outcome.lines`.
- [ ] AC9 → R3.S4 [auto] — `token-cost.mjs` emite `{ok:true,data:{...}}` estructurado, sin prosa contractual.
- [ ] AC10 → R4.S1 [manual] — revisión de SKILL.md/assets/commands (verify, plan-executor, plan-writer, spec-forensics, forensics): ninguno instruye leer prosa/formato antiguo. Manual porque exige juzgar prosa de instrucciones, no comparar strings.
- [ ] AC11 → R5.S1 [auto] — `node --test` sobre `plugins/sdd-kit/test/` pasa entero.
- [ ] AC12 → R5.S2 [auto] — grep en `test/` de aserciones sobre prosa antigua (`⚠ versioning:`, `skill: … OK`, resúmenes forensics) devuelve 0 fuera de casos que asertan el envelope.
- [ ] AC-E2E → R-E2E.S1 [auto] — flujo plan→exec→verify→versioning→forensics: cada stdout parsea como envelope válido, `data` y ficheros iguales al baseline, suite verde.

## Assumptions & Open Questions

- **Nombres de export** del módulo (`emit`/`fail`/`parseFlags` vs conservar
  `out`/`die`): detalle de implementación para el plan; el contrato observable es
  el envelope, no el nombre interno.
- **Canal de error:** el envelope de error va a **stdout** (Claude siempre parsea
  stdout); stderr queda para diagnósticos no contractuales. El exit code señala el
  fallo (`ok:false ⇔ exit ≠ 0`).
- **budget-guard como gate:** conserva exit ≠ 0 al excederse un techo; ese exit
  code, no `ok`, es la señal para CI. `ok` sigue siendo true porque el comando
  corrió sin fallo operativo.
- **Error interno de versioning-report** (git no disponible): se asume que degrada
  a `{ ok: true, data: { warnings: [] } }`, exit 0 (preserva "no warning es más
  seguro que un falso positivo"). Confirmar en plan si se prefiere `ok:false`.
- **forensics stdout:** llevará el objeto de datos (mismo `output` que va al json)
  o un puntero al fichero; se decide en plan según lo que el consumidor necesite,
  pero en ningún caso vuelve a ser prosa.
- **Baseline de dominio (R-E2E):** los valores esperados bajo `data` y en ficheros
  se capturan del estado pre-migración (rama base) durante la ejecución; no se
  versionan.
- **Optimización de tokens — fase 2 (fuera de este spec):** el envelope compacto
  y el patrón "dato rico → fichero" ya recortan peso, pero el ahorro grande es
  minimizar `data` payload-por-payload (sólo los campos que cada consumidor lee).
  Requiere análisis por-CLI y **medición previa** (`token-cost`/`session-report`)
  para no recortar campos en uso. Se difiere a un spec propio (issue **#29**);
  unificar en `lib/cli.mjs` lo habilita como cambio en un solo sitio.
