# token-diet — reglas de ahorro de tokens

Este documento tiene dos partes claramente separadas:

1. **Resumen base ("caveman")** — esquemático, ~6-8 líneas, pensado para ir
   siempre cargado (inline en `CLAUDE.md`/`AGENTS.md`).
2. **Profiles más restrictivos** — para "andar más rácanos" cuando se detecta
   sobrecoste en ciertas tareas; viven solo aquí, no se cargan inline.

## Resumen base (caveman)

- Agrupa llamadas a herramientas independientes en un solo turno; no las secuencies una a una.
- Delega trabajo mecánico (búsquedas, renombrados, checks) al modelo más barato que lo resuelva.
- No rearrastres contexto ya leído; usa `/clear` o `/compact` al cambiar de tarea.
- Prefiere un script offline determinista antes que un subagente para tareas repetibles.
- Lee solo el fragmento de fichero que necesitas, no el fichero entero si es grande.
- Antes de tocar un dato compartido, localiza de una vez todos sus lectores y arréglalos juntos.
- No cambies de modelo a media conversación; rompe la caché y sale más caro.
- Prueba entre ediciones solo si el resultado decide el siguiente paso.

## Profile: rácano (sobrecoste detectado)

Aplica cuando una tarea concreta ya ha gastado más de lo esperado y hay que
cortar el sangrado sin abandonar la tarea.

- Sustituye cualquier subagente `general-purpose` por `Explore` si la tarea es
  de localizar/inventariar, no de juzgar o modificar contenido.
- Baja el modelo delegado un escalón (Sonnet→Haiku) en toda sub-tarea mecánica
  restante del plan actual.
- Congela la exploración: deja de "mirar por si acaso" y trabaja solo sobre
  las rutas/líneas ya identificadas.
- Sustituye cualquier "continúa" tras una pausa larga por `/clear` + retomar
  desde el traspaso en disco, salvo que estés a mitad de un paso.
- Reporta en una sola pasada al final en vez de ir confirmando paso a paso.

## Profile: austero permanente (proyecto/rol de bajo presupuesto)

Aplica cuando el objetivo (repo, agente o rol) tiene, por diseño, un
presupuesto de tokens bajo de forma continuada, no solo puntual.

- Todo subagente lanzado por defecto es `haiku` salvo que la tarea exija
  juicio explícito (entonces se justifica por qué antes de subir a `sonnet`/`opus`).
- Ninguna tarea determinista pasa por un subagente: va a script offline (0 tokens)
  siempre que exista una forma reproducible de hacerlo.
- Los planes se trocean en subplanes con checkpoint commiteable obligatorio;
  no se permite una sola sesión larga para todo el trabajo.
- Se prohíbe reabrir ficheros ya leídos en la misma sesión salvo que hayan
  cambiado desde la última lectura.
- Cualquier barrido amplio (todo el repo, todo el histórico) requiere aviso y
  confirmación explícita antes de lanzarse.
