# Spec: {Feature Name}

## Purpose

{1 párrafo: qué problema resuelve, por qué ahora, para quién es. Sin detalles de implementación.}

Change type: {feat|fix|chore|refactor|docs}

## Scope

**In scope:**
- {capacidad o comportamiento incluido}
- {...}

**Out of scope (non-goals):**
- {qué queda explícitamente fuera, para evitar scope creep}
- {...}

## Functional Requirements

### R1 — {Nombre del requisito}

Depende de: {R# | —}

The system {SHALL|MUST|SHOULD} {comportamiento observable, sin nombrar clases/funciones/librerías}.

#### R1.S1 — {Happy path}
- GIVEN {precondición}
- WHEN {acción}
- THEN {observable concreto: texto exacto, código de estado, artefacto producido — nunca "funciona" o "muestra un error"}
- AND {resultado adicional, opcional}

#### R1.S2 — {Edge case / error}
- GIVEN {precondición}
- WHEN {acción}
- THEN {observable concreto, incluyendo el mensaje de error exacto si aplica}

<!-- Repetir un bloque "### R<n>" por cada capacidad distinta, numeración correlativa.
     Cada requisito: al menos un happy path y, si aplica, un edge/error case.
     "Depende de" es dependencia de COMPORTAMIENTO (R3 necesita los datos que crea R1),
     no de implementación — es lo que usa el plan para paralelizar o secuenciar tareas. -->

### R-E2E — {Recorrido completo de la feature}

Depende de: {los R# que compone}

The system SHALL {comportamiento de la feature completa, de extremo a extremo}.

#### R-E2E.S1 — {Recorrido integrador}
- GIVEN {estado inicial realista}
- WHEN {secuencia que atraviesa la feature entera}
- THEN {observable final concreto}

## Technical Requirements

- **Stack / framework:** {o "N/A" si no aplica}
- **Integraciones:** {APIs, servicios externos, o "N/A"}
- **Rendimiento:** {límites medibles y cómo se medirían, o "N/A"}
- **Seguridad / privacidad:** {requisitos, o "N/A"}
- **Datos / almacenamiento:** {modelo de datos, persistencia, o "N/A"}
- **Restricciones adicionales:** {compatibilidad, dependencias existentes, o "N/A"}

## Acceptance Criteria

<!-- Un criterio por escenario, referenciado por ID — NO re-redactar el escenario.
     [auto] = comprobable mecánicamente; la sonda dice QUÉ observar (entrada → salida
     exacta), el CÓMO concreto (test, comando) lo fija la fase de plan.
     [manual] = requiere juicio humano; justificar por qué no es automatizable.
     La feature se da por satisfecha cuando todos los AC están en verde, incluido AC-E2E. -->

- [ ] AC1 → R1.S1 [auto] — {sonda: con entrada X, se observa Y}
- [ ] AC2 → R1.S2 [auto] — {...}
- [ ] AC3 → R2.S1 [manual] — {qué comprobar y por qué requiere juicio humano}
- [ ] AC-E2E → R-E2E.S1 [auto] — {sonda del recorrido completo}

## Assumptions & Open Questions

- {supuesto asumido durante la entrevista, o pregunta sin resolver y su valor por defecto si lo hay}
