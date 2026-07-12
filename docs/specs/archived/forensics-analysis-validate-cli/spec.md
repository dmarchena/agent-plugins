# Spec: forensics-analysis-validate CLI entry point + signal-anchoring multi-línea

## Purpose

`scripts/forensics-analysis-validate.mjs` solo exporta la función
`validateForensicsAnalysis(mdText, forensicsJson)` — no tiene entry point
CLI. Cada run de la skill `spec-forensics` obliga al agente a redactar un
wrapper `node -e` ad-hoc para invocarla, gastando tokens y a veces
iteraciones hasta acertar el wrapper. Además, el matching de nombres de
signal en los hallazgos de juicio solo examina la primera línea de cada
bullet, por lo que hallazgos legítimos que citan el signal en una línea de
continuación (2ª/3ª línea del mismo bullet) fallan la validación sin
motivo. Este spec añade el CLI que faltaba (reutilizando el envelope
canónico y el patrón ya usado en `scripts/forensics.mjs`) y corrige el
matching para que cubra el bullet completo.

Change type: feat

## Scope

**In scope:**
- Entry point CLI en `scripts/forensics-analysis-validate.mjs` (además de
  seguir exportando `validateForensicsAnalysis` para uso directo/tests).
- Actualizar la sección "Validating the written doc" de
  `skills/spec-forensics/SKILL.md` para invocar el CLI en vez del import
  directo.
- Corregir el signal-anchoring para matchear sobre el texto completo del
  bullet (líneas de continuación incluidas), no solo su primera línea.
- Actualizar la aserción existente en
  `test/exec/spec-forensics-skill-doc.test.mjs` (AC4) que hace regex sobre
  `validateForensicsAnalysis` en el texto de SKILL.md, para que siga en
  verde con la redacción nueva.

**Out of scope (non-goals):**
- No se toca `scripts/forensics.mjs` ni `scripts/lib/cli.mjs` — se
  reutilizan tal cual (`emitSuccess`/`emitError`/`parseFlags` existentes).
- No se cambian las reglas de validación existentes (secciones
  deterministas/juicio, cifras ancla, caso degradado) — solo el bug de
  matching multi-línea y el wrapper CLI.
- No se generaliza el patrón de CLI a otros scripts del plugin que aún no
  tengan entry point — solo `forensics-analysis-validate.mjs`.

## Functional Requirements

### R1 — Entry point CLI para forensics-analysis-validate

Depende de: —

The system SHALL expose a CLI entry point in
`scripts/forensics-analysis-validate.mjs` that, given a SPECDIR path, reads
`SPECDIR/forensics-analysis.md` and `SPECDIR/forensics.json`, runs
`validateForensicsAnalysis` sobre ambos, y emite el envelope canónico
`{ok,data}` por stdout.

#### R1.S1 — Happy path
- GIVEN un SPECDIR con `forensics-analysis.md` y `forensics.json` que
  reconcilian (ninguna invariante violada)
- WHEN se ejecuta `node forensics-analysis-validate.mjs <SPECDIR>`
- THEN stdout es exactamente una línea JSON compacta
  `{"ok":true,"data":{"ok":true,"errors":[]}}` y el proceso sale con
  código 0

#### R1.S2 — Errores de validación son dato, no fallo de proceso
- GIVEN un SPECDIR cuyo `forensics-analysis.md` viola alguna invariante del
  validador (p. ej. desajuste de la cifra ancla Total USD)
- WHEN se ejecuta el CLI
- THEN stdout es `{"ok":true,"data":{"ok":false,"errors":["...anchor
  mismatch..."]}}` (los errores de validación viven dentro de `data`, el
  `ok` de envelope se mantiene `true`) y el proceso sigue saliendo con
  código 0

### R2 — SKILL.md apunta al CLI, no al import directo

Depende de: R1

The system SHALL document, en la sección "Validating the written doc" de
`skills/spec-forensics/SKILL.md`, la invocación del CLI
(`node ${CLAUDE_PLUGIN_ROOT}/scripts/forensics-analysis-validate.mjs
SPECDIR`) en vez de importar `validateForensicsAnalysis` como función.

#### R2.S1 — Happy path
- GIVEN la sección "Validating the written doc" de SKILL.md
- WHEN se lee su contenido
- THEN instruye invocar el CLI con el SPECDIR y leer `data.ok`/`data.errors`
  de su envelope de stdout, y ya no instruye importar
  `validateForensicsAnalysis` como llamada a función

### R3 — Signal-anchoring sobre el bullet multi-línea completo

Depende de: —

The system SHALL match el nombre de signal citado por un hallazgo de
juicio contra el texto completo de su list item (línea inicial + líneas de
continuación), no solo su primera línea.

#### R3.S1 — Regresión: signal citado en línea de continuación
- GIVEN un hallazgo de juicio cuya primera línea no menciona ningún nombre
  de signal, pero una línea de continuación (2ª/3ª línea, indentada, mismo
  list item) sí menciona un nombre de signal real de `forensics.json`
- WHEN corre `validateForensicsAnalysis`
- THEN no se produce ningún error "cites no known signal" para ese hallazgo

#### R3.S2 — Edge: ningún signal citado en ninguna línea
- GIVEN un hallazgo de juicio cuyo bullet (primera línea y todas las de
  continuación) no menciona ningún nombre de signal real
- WHEN corre `validateForensicsAnalysis`
- THEN se sigue produciendo un error "cites no known signal" para ese
  hallazgo (comportamiento negativo existente preservado)

### R-E2E — CLI end-to-end sobre un SPECDIR real con hallazgo multi-línea

Depende de: R1, R2, R3

The system SHALL validate end-to-end, vía el CLI, un SPECDIR cuyo
`forensics-analysis.md` contiene un hallazgo de juicio multi-línea que cita
su signal solo en una línea de continuación, reportando éxito.

#### R-E2E.S1 — Recorrido integrador
- GIVEN un SPECDIR con un `forensics.json` (con un signal real, p. ej.
  `orchestrator_share`) y un `forensics-analysis.md` cuyo hallazgo de
  juicio cita ese signal solo en su segunda línea
- WHEN se ejecuta `node forensics-analysis-validate.mjs <SPECDIR>`
- THEN stdout es `{"ok":true,"data":{"ok":true,"errors":[]}}` y el proceso
  sale con código 0

## Technical Requirements

- **Stack / framework:** Node.js ESM (`.mjs`), sin nueva dependencia;
  reutiliza `scripts/lib/cli.mjs` (`emitSuccess`/`emitError`) y el export
  existente `validateForensicsAnalysis`, mismo patrón que el wrapper CLI de
  `scripts/forensics.mjs`.
- **Integraciones:** N/A
- **Rendimiento:** N/A
- **Seguridad / privacidad:** N/A
- **Datos / almacenamiento:** El CLI es de solo lectura — no escribe
  ningún fichero; solo lee `SPECDIR/forensics-analysis.md` y
  `SPECDIR/forensics.json`.
- **Restricciones adicionales:** Un SPECDIR ausente como argumento, o un
  fichero requerido ilegible/JSON inválido, son errores de proceso
  genuinos → `emitError(reason)` (exit 1 por defecto), comportamiento
  heredado de `lib/cli.mjs` y no lógica nueva a diseñar. El test existente
  `test/exec/spec-forensics-skill-doc.test.mjs` (AC4) hace regex sobre el
  literal `validateForensicsAnalysis` en el texto de SKILL.md — su
  aserción deberá actualizarse para no romperse con la redacción nueva
  (in scope, ver arriba).

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — spawn del CLI sobre un SPECDIR fixture
  "complete", se observa stdout `{"ok":true,"data":{"ok":true,"errors":[]}}\n`
  y exit code 0
- [ ] AC2 → R1.S2 [auto] — spawn del CLI sobre un SPECDIR fixture
  mutado/inválido, se observa `data.ok === false` y `data.errors` contiene
  el mensaje esperado, con exit code 0
- [ ] AC3 → R2.S1 [auto] — doc-test sobre SKILL.md: referencia el nombre
  de fichero/invocación del CLI y ya no instruye importar
  `validateForensicsAnalysis` como llamada a función
- [ ] AC4 → R3.S1 [auto] — test unitario: fixture con nombre de signal
  solo en línea de continuación pasa la validación sin error "cites no
  known signal"
- [ ] AC5 → R3.S2 [auto] — test unitario: fixture sin ningún signal citado
  en ninguna línea del bullet sigue fallando con "cites no known signal"
- [ ] AC-E2E → R-E2E.S1 [auto] — spawn del CLI end-to-end sobre un SPECDIR
  fixture real con hallazgo multi-línea, se observa envelope de éxito y
  exit code 0

## Assumptions & Open Questions

- Change type registrado como `feat` (no `chore`/`fix`) según decisión del
  usuario: el nuevo entry point CLI justifica un bump semver-minor de
  sdd-kit, empaquetando en el mismo spec el fix de signal-anchoring.
- El usuario indicó que la implementación debe aterrizar en dos commits
  (primero el entry point CLI, después el fix de signal-anchoring) — es
  detalle de la fase de plan/ejecución para que `plan-writer` lo respete,
  no una división a nivel de spec.
- La forma de `data.errors` asume que espeja verbatim el valor de retorno
  actual de `validateForensicsAnalysis` (`{ok, errors}`) anidado bajo
  `data` — sin renombrar campos.
