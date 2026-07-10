# Spec: token-diet — command para instalar un ruleset de ahorro de tokens

## Purpose

Los agentes (Claude Code y compatibles con AGENTS.md) no traen una política de
ahorro de tokens por defecto, y escribirla a mano en cada `CLAUDE.md` es
repetitivo y propenso a quedar desactualizado o duplicado. Esta feature entrega
un plugin nuevo, `token-diet`, para el marketplace `agent-plugins`: un **único
command de invocación explícita** (nunca autoinvocado por el LLM ni por un hook)
que, bajo demanda, analiza el fichero de instrucciones objetivo, juzga si ya
existe una política de ahorro de tokens, **recomienda** una acción (añadir /
sustituir / ampliar / actualizar / no hacer nada) y, con confirmación explícita,
inserta un resumen base "caveman" + un puntero a un documento completo (con
profiles más restrictivos) que copia al destino elegido. Dirigido a quien quiere
un ruleset de ahorro barato, opt-in y versionado, sin coste permanente en
contexto hasta que decide instalarlo.

Change type: feat

## Scope

**In scope:**
- Un plugin `token-diet` en `plugins/` registrado en `marketplace.json`,
  siguiendo la convención del repo (plugin.json, README, CHANGELOG, AGENTS.md).
- Un command de invocación explícita que resuelve el fichero objetivo
  (`./CLAUDE.md` del proyecto o `~/.claude/CLAUDE.md` del usuario, preguntando en
  runtime cuál) y analiza su contenido bajo demanda.
- Análisis semántico: determinar si el texto ya contiene una política de ahorro
  de tokens, redactada de cualquier forma, y si contiene la marca de atribución
  del propio plugin y con qué versión.
- Una recomendación entre {add, replace, extend, update, none} con su razón.
- Un documento completo de reglas (resumen base + profiles más restrictivos) que
  el command copia al destino elegido (default: proyecto→`docs/`, usuario→`~/.claude/`).
- Inserción/actualización, previa confirmación, de un resumen inline base
  (esquemático, ~6-8 líneas) + puntero al doc + marca de atribución versionada.

**Out of scope (non-goals):**
- Hooks o auto-skills: nada se ejecuta sin que el usuario invoque el command.
- Edición silenciosa: nunca se escribe ni se copia sin mostrar el cambio y
  obtener confirmación explícita.
- Monitorizar el gasto real de tokens o detectar sobrecoste de tareas: eso es
  competencia de `claude-token-debug`; aquí solo se proveen los profiles en el doc.
- Activar o aplicar profiles automáticamente: los usa el humano/agente leyendo
  el doc; el plugin no cambia de perfil por su cuenta.
- Build step: `rules.md` se distribuye tal cual dentro del plugin.

## Functional Requirements

### R1 — Analizar el fichero objetivo bajo demanda

Depende de: —

El command SHALL, al invocarse, resolver el fichero objetivo (preguntando
proyecto vs usuario cuando ambos existen) y reportar dos hechos: (a) si el texto
ya contiene alguna política de ahorro de tokens, redactada como sea, y (b) si
contiene la marca de atribución del plugin (`Produced with token-diet (vX.Y.Z)`)
y con qué versión.

#### R1.S1 — Fichero sin política ni marca
- GIVEN un `CLAUDE.md` que no menciona ahorro de tokens ni contiene la marca
- WHEN se invoca el command sobre él
- THEN reporta "sin política de ahorro de tokens detectada" y "sin marca token-diet"

#### R1.S2 — El fichero objetivo no existe
- GIVEN que el fichero objetivo resuelto no existe en disco
- WHEN se invoca el command
- THEN informa de que no existe y ofrece crearlo, sin abortar con error

### R2 — Recomendar una acción

Depende de: R1

El command SHALL emitir exactamente una recomendación de {add, replace, extend,
update, none} con una razón de una línea derivada del análisis: sin política →
`add`; política ajena o en conflicto → `replace`; política propia incompleta →
`extend`; marca presente con versión anterior a la actual → `update`; marca
presente con versión igual a la actual → `none`.

#### R2.S1 — Marca presente y versión actual (no reanalizar en bucle)
- GIVEN un fichero con la marca `Produced with token-diet (v1.0.0)` y el plugin
  instalado también en v1.0.0
- WHEN se invoca el command
- THEN recomienda `none` con la razón "ya cubierto por token-diet v1.0.0"
- AND no propone ningún cambio

#### R2.S2 — Marca presente con versión anterior
- GIVEN un fichero con la marca `Produced with token-diet (v0.9.0)` y el plugin
  en v1.0.0
- WHEN se invoca el command
- THEN recomienda `update` señalando el salto de versión (v0.9.0 → v1.0.0)

### R3 — Copiar el documento completo de reglas

Depende de: —

El command SHALL copiar el documento de reglas (resumen base + profiles) desde el
plugin al destino elegido; el default depende del objetivo (proyecto→`docs/`,
usuario→`~/.claude/`). Si el destino queda fuera del repositorio actual, avisa de
que el documento no quedará versionado y de que el puntero será una ruta absoluta.

#### R3.S1 — Destino dentro del repo
- GIVEN un objetivo de proyecto y el destino por defecto `docs/`
- WHEN el command copia el documento
- THEN el documento queda en `docs/` y el puntero que se insertará es una ruta relativa

#### R3.S2 — Destino fuera del repo
- GIVEN un destino elegido que está fuera del árbol del repositorio actual
- WHEN el command copia el documento
- THEN avisa de que no quedará versionado y de que el puntero será una ruta absoluta

### R4 — Aplicar con confirmación e idempotencia por marca

Depende de: R2, R3

El command SHALL, solo tras confirmación explícita del usuario, aplicar la acción
recomendada (o la que el usuario elija) escribiendo en el fichero objetivo el
resumen inline base + el puntero al doc + la marca de atribución versionada; sin
confirmación NO modifica el fichero ni copia nada. Al actualizar un bloque propio
ya existente, lo reemplaza en lugar de duplicarlo.

#### R4.S1 — Confirmar un add y no duplicar en la segunda pasada
- GIVEN un fichero sin política y el usuario confirma la recomendación `add`
- WHEN el command aplica el cambio
- THEN el fichero contiene el resumen base, el puntero al doc y la marca
  `Produced with token-diet (vX.Y.Z)`
- AND una segunda invocación con la misma versión recomienda `none` y no añade un segundo bloque

#### R4.S2 — Rechazo del usuario
- GIVEN cualquier recomendación mostrada con su diff
- WHEN el usuario la rechaza
- THEN ni el fichero objetivo ni el destino de copia cambian

### R-E2E — Instalar el ruleset de principio a fin

Depende de: R1, R2, R3, R4

El command SHALL cubrir el recorrido completo: analizar un fichero sin política,
recomendar y confirmar la instalación, copiar el doc y dejar el fichero marcado,
de forma que una segunda ejecución sea idempotente.

#### R-E2E.S1 — Instalación y reejecución idempotente
- GIVEN un `CLAUDE.md` de proyecto sin política de ahorro de tokens
- WHEN se invoca el command, recomienda `add`, el usuario confirma con destino `docs/`,
  y después se vuelve a invocar el command
- THEN tras la primera pasada `docs/` contiene el documento de reglas y el
  `CLAUDE.md` contiene el resumen base + puntero + marca `Produced with token-diet (vX.Y.Z)`
- AND la segunda pasada recomienda `none` y no modifica el fichero

## Technical Requirements

- **Stack / framework:** N/A — plugin Markdown para agent-plugins (un command +
  documento en `assets/`).
- **Integraciones:** N/A — opera solo sobre ficheros locales (`CLAUDE.md`/`AGENTS.md` y destino de copia).
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** ninguna escritura ni copia sin confirmación
  explícita; nunca edita ficheros fuera del objetivo y el destino confirmados.
- **Datos / almacenamiento:** documento de reglas versionado dentro del plugin;
  la marca de atribución (`Produced with token-diet (vX.Y.Z)`) es el único literal buscado en el fichero objetivo.
- **Restricciones adicionales:** debe seguir la convención de `agent-plugins`
  (plugin.json, README, CHANGELOG, AGENTS.md) y registrarse en `marketplace.json`.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — sobre un CLAUDE.md sin ahorro de tokens ni marca, la salida indica "sin política" y "sin marca"
- [ ] AC2 → R1.S2 [auto] — con objetivo inexistente, la salida ofrece crearlo y el command no falla
- [ ] AC3 → R2.S1 [auto] — con marca v1.0.0 y plugin v1.0.0, la recomendación es exactamente `none`
- [ ] AC4 → R2.S2 [auto] — con marca v0.9.0 y plugin v1.0.0, la recomendación es `update` y nombra v0.9.0→v1.0.0
- [ ] AC5 → R3.S1 [auto] — con destino `docs/` intra-repo, el doc queda en `docs/` y el puntero propuesto es ruta relativa
- [ ] AC6 → R3.S2 [auto] — con destino fuera del repo, la salida contiene el aviso de "no versionado" y puntero absoluto
- [ ] AC7 → R4.S1 [auto] — tras confirmar `add`, el fichero contiene resumen+puntero+marca; una 2ª pasada no añade un segundo bloque
- [ ] AC8 → R4.S2 [auto] — tras rechazo, `git status`/mtime confirman que fichero objetivo y destino no cambiaron
- [ ] AC9 → R2 [manual] — el juicio semántico add/replace/extend (política ajena vs propia vs incompleta) es correcto para un caso de cada tipo; requiere criterio humano porque depende de interpretar texto libre
- [ ] AC-E2E → R-E2E.S1 [auto] — primera pasada deja doc en `docs/` + marca en CLAUDE.md; segunda pasada recomienda `none` sin modificar

## Assumptions & Open Questions

- El resumen inline base es esquemático ("caveman"), ~6-8 líneas, y merece estar
  siempre cargado; los profiles más restrictivos (para "andar más rácanos" o
  cuando se detecta sobrecoste en ciertas tareas) viven **solo** en el documento completo.
- El análisis de "¿hay ya política de ahorro de tokens?" es un juicio del agente
  que ejecuta el command sobre texto libre (de ahí que AC9 sea `[manual]`); el
  único literal buscado mecánicamente es la marca de atribución versionada.
- El fichero objetivo se asume `CLAUDE.md`, pero el mismo flujo aplica a
  `AGENTS.md`; se resolverá en plan si se soportan ambos en la v1.
- Nombre exacto del command, ruta de `assets/rules.md` y contenido concreto de la
  base y de los profiles se fijan en la fase de plan/implementación.
- Versión inicial del plugin y por tanto de la marca: se decide al crear plugin.json (asunción: v0.1.0 o v1.0.0).
