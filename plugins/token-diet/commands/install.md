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
las cuatro (R1, R2, R3, R4).

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

## Fase 2 — Recomendar una acción (R2)

A partir de los dos hechos de la fase 1 (política sí/no + de quién, marca
sí/no + versión), emite **exactamente una recomendación** — nunca más de
una — de entre `{add, replace, extend, update, none}`, junto con una razón
de una línea derivada del análisis. Aplica esta lógica, en este orden:

1. **Sin política de ahorro de tokens detectada** (hecho (a) = no) →
   recomienda `add`. Razón: no hay nada que instalar sobre lo existente.
2. **Política ajena o en conflicto** (hecho (a) = sí, pero no es de
   token-diet, o choca con lo que instalaría token-diet) → recomienda
   `replace`. Razón: la política detectada no es la de token-diet y debe
   sustituirse.
3. **Política propia pero incompleta** (hecho (a) = sí y es de token-diet,
   pero le faltan partes del ruleset) → recomienda `extend`. Razón: ya hay
   base propia, falta completarla.
4. **Marca presente con versión anterior a la actual (1.0.0)** → recomienda
   `update`, señalando explícitamente el salto de versión detectado (por
   ejemplo, v0.9.0 → v1.0.0).
5. **Marca presente con versión igual a la actual (1.0.0)** → recomienda
   `none` con la razón "ya cubierto por token-diet v1.0.0" y **no propone
   ningún cambio**.

### R2.S1 — Marca presente y versión actual (no reanalizar en bucle)
Si el fichero objetivo contiene la marca `Produced with token-diet
(v1.0.0)` y el plugin instalado también está en v1.0.0: recomienda `none`
con la razón exacta "ya cubierto por token-diet v1.0.0" y no propone ningún
cambio — no hace falta seguir con las fases 3-4.

### R2.S2 — Marca presente con versión anterior
Si el fichero objetivo contiene la marca `Produced with token-diet
(v0.9.0)` y el plugin instalado está en v1.0.0: recomienda `update`
señalando el salto de versión v0.9.0 → v1.0.0.

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

## Fase 4 — Aplicar con confirmación e idempotencia por marca (R4)

Esta fase consume la recomendación de la fase 2 (R2) y el destino/puntero
resueltos en la fase 3 (R3). **SOLO se ejecuta tras confirmación explícita
del usuario** sobre la acción concreta a aplicar (la recomendada u otra que
el usuario elija de entre `{add, replace, extend, update}`; `none` nunca
aplica nada). Muestra siempre el diff propuesto antes de pedir esa
confirmación explícita.

### R4.S2 — Rechazo del usuario (comprobar primero)
Si el usuario **rechaza** la acción propuesta, o si nunca llega a dar
confirmación explícita: el command **no modifica nada**. Ni el fichero
objetivo ni el destino de copia cambian — no se escribe una sola línea en el
fichero objetivo y no se copia `assets/rules.md` a ningún sitio. Informa de
que no se aplicó ningún cambio y termina el flujo aquí.

### Aplicar (solo con confirmación explícita)

1. **Construir el bloque a insertar**, compuesto por tres partes, en este
   orden:
   - El **resumen base inline** ("caveman", ~6-8 líneas): exactamente las
     líneas del apartado "Resumen base (caveman)" de
     `${CLAUDE_PLUGIN_ROOT}/assets/rules.md`, copiadas tal cual (no las
     parafrasees).
   - El **puntero** al documento completo copiado en la fase 3: ruta
     relativa (R3.S1) o absoluta (R3.S2), según lo resuelto entonces.
   - La **marca de atribución versionada**, con el literal exacto
     `Produced with token-diet (v1.0.0)` (la versión fija del plugin, ver
     `plugins/token-diet/.claude-plugin/plugin.json`).

2. **R4.S1 — Idempotencia por marca: reemplazar, no duplicar.** Antes de
   escribir, comprueba si el fichero objetivo ya contiene un bloque propio de
   token-diet (delimitado por la marca `Produced with token-diet (v`).
   - Si **no** existe ningún bloque propio todavía: añade el bloque completo
     (resumen base + puntero + marca) al fichero objetivo.
   - Si **ya** existe un bloque propio (de esta versión o de una anterior):
     **reemplázalo en lugar de duplicarlo** — sustituye el bloque entero
     (desde su inicio hasta la línea de la marca) por el bloque nuevo. Nunca
     insertes un segundo bloque junto al existente.

3. **Copiar el documento** de reglas al destino confirmado en la fase 3
   (si aún no se había copiado).

4. **Confirmar al usuario** qué fichero se modificó, dónde quedó la copia y
   qué marca de versión quedó instalada.

### R4.S1 — Confirmar un `add` y no duplicar en la segunda pasada
- GIVEN un fichero sin política y el usuario confirma la recomendación `add`
- WHEN el command aplica el cambio
- THEN el fichero objetivo contiene el resumen base, el puntero al doc y la
  marca `Produced with token-diet (v1.0.0)`
- AND una **segunda invocación** con la misma versión del plugin (1.0.0)
  reanaliza el fichero (fase 1), encuentra la marca con versión igual a la
  actual, y por R2.S1 recomienda `none` — esa segunda pasada **no añade un
  segundo bloque**: el fichero conserva un único bloque propio de
  token-diet.

### R4.S2 — Rechazo del usuario (detalle)
- GIVEN cualquier recomendación mostrada con su diff
- WHEN el usuario la rechaza (o no confirma explícitamente)
- THEN ni el fichero objetivo ni el destino de copia cambian: sin
  confirmación explícita, el command no modifica el fichero ni copia nada.

## Resumen del contrato de salida de esta versión

Al terminar de ejecutar este command (fases 1 a 4 completas), debes haber
comunicado al usuario, en este orden:

1. Qué fichero objetivo se resolvió y cómo (proyecto/usuario, preguntado o
   único candidato existente).
2. Si el objetivo no existía, que se le ofreció crearlo y qué decidió, sin
   haber abortado con error en ningún caso.
3. Los dos hechos de R1.S1 (política sí/no, marca sí/no + versión), usando
   los literales exactos `sin política de ahorro de tokens detectada` y
   `sin marca token-diet` cuando corresponda.
4. La recomendación única (fase 2) de entre `{add, replace, extend, update,
   none}` con su razón de una línea.
5. Dónde quedó (o quedaría) copiado `assets/rules.md` y si el puntero es
   relativo (R3.S1, destino dentro del repo) o absoluto con aviso de no
   versionado (R3.S2, destino fuera del repo).
6. El resultado de la fase 4: si el usuario confirmó, qué fichero se
   modificó y con qué marca de versión quedó; si rechazó o no confirmó
   explícitamente, que no se modificó ni copió nada (R4.S2).
