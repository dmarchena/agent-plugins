# Spec: Presupuesto de tokens por SKILL.md (revertir regresión + guard en CI)

## Purpose

Los 4 `SKILL.md` de sdd-kit (spec-writer, plan-writer, plan-executor, verify)
se cargan enteros en cada sesión que invoca la skill, así que su tamaño es
coste recurrente. Una spec previa (`sdd-kit-token-reduction`, archivada) los
adelgazó hasta un mínimo demostrado funcionalmente completo, pero PRs
posteriores los reinflaron **+31% en tokens** (`verify` se dobló: 1220→2607
tok-aprox) sin que nadie lo notara, porque el guard que lo vigilaba
(`skill-slimming.test.mjs`) quedó huérfano: nunca entró en la validación de
CI (`scripts/validate.sh`). Esta spec revierte esa regresión y cierra la causa
raíz enganchando el guard a la validación única, de modo que una futura
inflación falle de forma ruidosa. Para quién: mantenedores del plugin sdd-kit.

Change type: fix

## Scope

**In scope:**
- Sustituir la métrica del guard de tamaño de SKILL.md: de líneas (`wc -l`) a
  un **presupuesto de tokens por skill**, medido con un tokenizador propio.
- Un tokenizador *lightweight* stdlib-only (sin dependencias npm, sin red) que
  aproxima el recuento de tokens de un texto de forma determinista.
- Recortar los 4 SKILL.md por debajo de su presupuesto (principalmente
  `verify` y `plan-executor`), moviendo contenido a `assets/` sin perder
  ningún *rule anchor* accesible.
- Enganchar el guard a `scripts/validate.sh` para que CI y la validación local
  lo ejecuten en cada corrida.

**Out of scope (non-goals):**
- Tokenización BPE exacta (tablas de vocab/merges de un modelo real): el
  tokenizador es una **aproximación**, no reproduce el tokenizado de Claude.
- Reducir el tamaño de los ficheros `assets/` a los que se mueve contenido.
- Auditar/enganchar al CI otros tests huérfanos de `plugins/sdd-kit/test/`
  (p.ej. `exec-verify-e2e.test.mjs`): se limita a `skill-slimming`.
- Cambiar el comportamiento observable de las skills (mismos anchors, misma
  capacidad); es un refactor de tamaño, no de función.

## Functional Requirements

### R1 — Tokenizador lightweight stdlib-only

Depende de: —

The system MUST proveer una función pura `texto → entero` que estime el número
de tokens de una cadena de forma **determinista**, usando solo la stdlib de
Node (sin dependencias npm, sin acceso a red).

#### R1.S1 — Determinista y sin deps
- GIVEN la misma cadena de entrada
- WHEN se invoca el tokenizador dos veces
- THEN devuelve exactamente el mismo entero ambas veces
- AND el módulo no hace `import` de ningún paquete de `node_modules` ni abre red

#### R1.S2 — Monotonía básica
- GIVEN dos textos donde uno es superconjunto del otro (más contenido)
- WHEN se tokenizan ambos
- THEN el texto mayor obtiene un recuento estrictamente mayor (el proxy crece
  con el contenido)

### R2 — Presupuesto de tokens por skill (guard)

Depende de: R1

The system MUST verificar que el cuerpo de cada uno de los 4 SKILL.md no supera
su **techo individual de tokens**, donde el techo se **deriva**, no se
hardcodea como número suelto: `techo_skill = tokens(SKILL.md del skill en el
commit high-water-mark) × (1 + margen)`, medido con el tokenizador de R1.

#### R2.S1 — Todos bajo presupuesto → verde
- GIVEN los 4 SKILL.md con cada cuerpo por debajo de su techo
- WHEN corre el guard
- THEN termina con éxito (exit 0) y no reporta ningún skill excedido

#### R2.S2 — Un skill excede su techo → rojo y localizado
- GIVEN un SKILL.md cuyo recuento de tokens supera su techo
- WHEN corre el guard
- THEN falla (exit ≠ 0) con un mensaje que nombra el skill infractor, su
  recuento actual y su techo (p.ej. `verify: 2607 tok > techo 1300`)

### R3 — Revertir la regresión de tamaño

Depende de: R2

The system SHALL dejar los 4 SKILL.md por debajo de su presupuesto de R2,
recortando el contenido reinflado (sobre todo `verify` y `plan-executor`)
moviéndolo a `assets/`, **sin** perder accesibilidad de ningún rule anchor.

#### R3.S1 — Bajo presupuesto conservando anchors
- GIVEN los SKILL.md actuales, por encima de presupuesto
- WHEN se aplica el recorte
- THEN cada SKILL.md queda ≤ su techo de R2
- AND los guards de accesibilidad ya existentes (`skill-slimming` AC2/AC3:
  cada rule anchor sigue en el cuerpo o en un asset referenciado por ruta, y
  ningún asset queda huérfano) siguen en verde

### R4 — Enganchar el guard a la validación única

Depende de: R2

The system MUST hacer que `scripts/validate.sh` ejecute el guard de presupuesto
como parte de su corrida, de modo que su fallo marque la validación como
fallida (mismo camino en CI y local).

#### R4.S1 — El guard corre y puede bloquear
- GIVEN `scripts/validate.sh` invocado en el repo
- WHEN algún SKILL.md excede su presupuesto
- THEN `validate.sh` termina con exit ≠ 0 y su salida incluye el fallo del
  guard de presupuesto de tokens

## Technical Requirements

- **Stack / framework:** Node.js stdlib (ESM `.mjs`), `node:test`. Sin npm deps.
- **Integraciones:** `scripts/validate.sh` (validación única CI + local). N/A red.
- **Rendimiento:** N/A (recuento de 4 ficheros pequeños, coste despreciable).
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** contenido movido a `plugins/sdd-kit/skills/*/assets/`.
- **Restricciones adicionales:** cero dependencias npm (convención dura del
  repo); el tokenizador y el guard deben correr solo con stdlib y sin red.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — tokenizar dos veces la misma cadena da el mismo entero; el módulo no importa de node_modules ni usa red (revisable por grep + ejecución).
- [ ] AC2 → R1.S2 [auto] — `tok(texto+extra) > tok(texto)` para un caso con contenido añadido.
- [ ] AC3 → R2.S1 [auto] — con los 4 cuerpos bajo techo, el guard sale con exit 0 y `excedidos = []`.
- [ ] AC4 → R2.S2 [auto] — con un cuerpo inflado por encima del techo, el guard sale ≠0 y el mensaje nombra skill + recuento + techo.
- [ ] AC5 → R3.S1 [auto] — cada SKILL.md ≤ su techo Y los guards de accesibilidad de anchors/assets (skill-slimming AC2/AC3) verdes.
- [ ] AC-E2E → R4.S1 [auto] — `bash scripts/validate.sh` en el repo real pasa (exit 0) con los SKILL.md recortados; y tras inflar un SKILL.md por encima de su techo, vuelve a correr y sale ≠0 nombrando el guard de presupuesto.

## Assumptions & Open Questions

- **Commit high-water-mark de referencia:** `c2ca119` (491 líneas combinadas,
  las 4 skills demostradas completas con AC2/AC3 verdes). Tokens-aprox por skill
  con `chars/4` (referencia informativa; el techo real se recalculará con el
  tokenizador de R1): spec-writer ~1802, plan-writer ~1647, plan-executor ~2003,
  verify ~1220.
- **Margen de mantenimiento (open question):** default propuesto **+5%** sobre
  el HWM, para no pelear por cada token en cada PR. A confirmar: 0% (estricto),
  5% o 10%.
- **Presupuesto por-skill, no global:** techo individual por SKILL.md (evita
  que un skill invada el presupuesto de otro, como hizo `verify`). El guard
  puede seguir reportando también el total como información.
- El guard `skill-slimming.test.mjs` existente conserva sus checks de
  accesibilidad (AC2/AC3); solo se sustituye su AC1 (líneas) por el presupuesto
  de tokens.
