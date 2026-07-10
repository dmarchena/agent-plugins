---
description: Analiza el CLAUDE.md/AGENTS.md objetivo, recomienda una acción y, con confirmación, instala el ruleset de ahorro de tokens de token-diet.
argument-hint: "[ruta opcional al fichero objetivo; si se omite, pregunta proyecto vs usuario]"
---

Eres el único punto de entrada del plugin `token-diet`. Este command solo se
ejecuta por invocación explícita del usuario — nunca lo dispares tú mismo ni
lo sugieras como efecto de otra tarea; si no ha sido invocado explícitamente,
no ejecutes este flujo.

Argumentos recibidos: $ARGUMENTS

El flujo completo tiene cuatro fases. Esta versión del command implementa
las fases 1 y 3 (R1, R3); las fases 2 y 4 (R2, R4) son secciones reservadas,
señaladas más abajo, que una tarea posterior completará.

## Fase 1 — Analizar el fichero objetivo (R1)

1. **Resolver el objetivo.** Los dos candidatos posibles son el `CLAUDE.md`
   de proyecto (`./CLAUDE.md`, relativo al directorio de trabajo actual) y
   el `CLAUDE.md` de usuario (`~/.claude/CLAUDE.md`). Si se pasó una ruta
   explícita en `$ARGUMENTS`, úsala como objetivo sin preguntar. Si no:
   - Si solo uno de los dos existe, úsalo directamente.
   - Si **ambos** existen, **pregunta al usuario** (proyecto `./CLAUDE.md`
     vs usuario `~/.claude/CLAUDE.md`) antes de continuar — no asumas cuál
     quiere.
   - Si ninguno de los dos existe todavía, trata el de proyecto
     (`./CLAUDE.md`) como objetivo por defecto para el resto del flujo.

2. **R1.S2 — El fichero objetivo no existe.** Si el fichero resuelto no
   existe en disco: informa claramente de que el fichero objetivo no existe
   (`el fichero objetivo no existe / target file does not exist`) y ofrece
   crearlo (`ofrece crear un CLAUDE.md nuevo / offer to create it`) antes de
   continuar con el resto del flujo. Esto NO es un error: continúa sin
   abortar con error (`sin abortar / no aborta con error / without
   aborting`) — si el usuario acepta, créalo vacío (o con un encabezado
   mínimo) y sigue con el análisis sobre el fichero recién creado; si
   rechaza, detén el flujo aquí sin tocar nada más.

3. **R1.S1 — Analizar el contenido.** Si el fichero sí existe, léelo
   completo y determina, con tu propio juicio semántico sobre texto libre,
   dos hechos independientes:
   - **(a) ¿Ya contiene alguna política de ahorro de tokens?** — redactada
     de cualquier forma (no busques un literal fijo; juzga el contenido:
     instrucciones sobre ser conciso, evitar relecturas innecesarias,
     preferir herramientas baratas, etc. cuentan como política, venga o no
     de `token-diet`).
   - **(b) ¿Contiene la marca de atribución de token-diet?** — el único
     literal que se busca mecánicamente es `Produced with token-diet (v` (el
     patrón `Produced with token-diet (vX.Y.Z)`); si aparece, extrae la
     versión exacta entre paréntesis.
   - Si el fichero **no** menciona ninguna política de ahorro de tokens y no
     contiene la marca, repórtalo con estos dos literales exactos (no los
     parafrasees, son el contrato de salida de R1.S1):
     - `sin política de ahorro de tokens detectada`
     - `sin marca token-diet`
   - Si sí hay política y/o marca, repórtalo igual de explícitamente:
     indica si la política detectada es ajena o del propio token-diet, y si
     hay marca, con qué versión exacta.

Al terminar la fase 1 debes tener, en memoria de la conversación: el
objetivo resuelto (ruta absoluta), el hecho (a) política sí/no, y el hecho
(b) marca sí/no + versión si la hay. Esto alimenta la fase 2.

## Fase 2 — Recomendar una acción (R2) — RESERVADO, no implementado aquí

Placeholder: esta sección la completa una tarea posterior (`cmd-recommend`)
para implementar R2 (recomendación entre `{add, replace, extend, update,
none}` con su razón de una línea, cubriendo R2.S1 y R2.S2). No implementes
esta lógica en esta versión del command; limítate a dejar constancia de los
hechos de la fase 1 para que la fase 2 los consuma cuando se añada.

## Fase 3 — Copiar el documento completo de reglas (R3)

El documento de reglas vive en `${CLAUDE_PLUGIN_ROOT}/assets/rules.md`
(ruta dentro del plugin: `plugins/token-diet/assets/rules.md`). Esta fase
solo referencia esa ruta — no depende de que su contenido exista todavía.

1. **Elegir el destino.** Por defecto:
   - Si el objetivo resuelto en la fase 1 es el de **proyecto**
     (`./CLAUDE.md`), el destino por defecto es `docs/` (dentro del
     repositorio actual, junto a la raíz del proyecto).
   - Si el objetivo resuelto es el de **usuario**
     (`~/.claude/CLAUDE.md`), el destino por defecto es `~/.claude/`.
   - Pregunta al usuario si quiere confirmar ese destino por defecto o
     elegir otro antes de copiar.

2. **Copiar.** Copia `assets/rules.md` (el fichero completo, sin
   modificarlo) al destino elegido, con el mismo nombre de fichero salvo
   que el usuario pida otro.

3. **R3.S1 — Destino dentro del repo.** Si el destino elegido queda dentro
   del árbol del repositorio git actual (por ejemplo, el `docs/` por
   defecto para un objetivo de proyecto), el puntero que se insertará más
   adelante en el fichero objetivo (fase 4) será una **ruta relativa** desde
   el objetivo hasta el documento copiado.

4. **R3.S2 — Destino fuera del repo.** Si el destino elegido queda **fuera**
   del árbol del repositorio git actual (por ejemplo, `~/.claude/` para un
   objetivo de usuario, o cualquier ruta absoluta fuera del repo), avisa
   explícitamente de dos cosas antes de copiar:
   - que el documento copiado **no quedará versionado** (no está bajo
     control de versiones / not versioned) porque cae fuera del repo;
   - que el puntero que se insertará será una **ruta absoluta** (absolute
     path), no relativa, porque no hay una ruta relativa útil fuera del
     árbol del repo (puntero absoluto).

Al terminar la fase 3 debes tener: la ruta final del documento copiado y si
el puntero a insertar será relativo (R3.S1) o absoluto (R3.S2, con el aviso
de no-versionado ya mostrado al usuario).

## Fase 4 — Aplicar con confirmación e idempotencia por marca (R4) — RESERVADO, no implementado aquí

Placeholder: esta sección la completa una tarea posterior (`cmd-apply`) para
implementar R4 (solo tras confirmación explícita del usuario, escribir en el
fichero objetivo el resumen base inline + el puntero al doc + la marca de
atribución versionada; sin confirmación no modifica nada; al actualizar un
bloque propio ya existente lo reemplaza en lugar de duplicarlo — R4.S1 y
R4.S2). No implementes esta lógica en esta versión del command.

## Resumen del contrato de salida de esta versión

Al terminar de ejecutar este command (fases 1 y 3, sin fase 2 ni fase 4),
debes haber comunicado al usuario, en este orden:

1. Qué fichero objetivo se resolvió y cómo (proyecto/usuario, preguntado o
   único candidato existente).
2. Si el objetivo no existía, que se le ofreció crearlo y qué decidió, sin
   haber abortado con error en ningún caso.
3. Los dos hechos de R1.S1 (política sí/no, marca sí/no + versión), usando
   los literales exactos `sin política de ahorro de tokens detectada` y
   `sin marca token-diet` cuando corresponda.
4. Dónde quedó copiado `assets/rules.md` y si el futuro puntero será
   relativo (R3.S1, destino dentro del repo) o absoluto con aviso de no
   versionado (R3.S2, destino fuera del repo).
