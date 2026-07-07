# Spec: markvault

## Purpose

Empaquetar en un plugin un flujo **determinista, offline y de coste ~0 tokens**
para extraer el texto de un documento a un archivo Markdown. El motivo de existir
es un guardarraíl de privacidad estricto: el contenido del documento **jamás** debe
viajar fuera del equipo (p. ej. a servidores del proveedor del modelo) sin
consentimiento expreso. El trabajo pesado lo hace un script local; la skill solo
lo invoca y reporta metadatos, de modo que ninguna palabra del documento entra en
el contexto del modelo por defecto. Reutiliza la arquitectura anti-fuga de red ya
probada en el proyecto `ia/` (`red_guard` + extracción con Poppler/Tesseract) y
la generaliza con estrategias de extracción intercambiables comparables por un
benchmark. **v1 solo procesa PDF**; la identidad de marca no atada a PDF (`markvault`) y el
contrato de estrategias son deliberados para admitir otros formatos (xlsx, docx,
pptx, odt vía `markitdown`) en el futuro **como adición no rotura**, sin
rediseñar.

## Scope

**In scope:**
- Un comando local `markvault` que convierte **un** documento en **un** archivo
  `.md`. En **v1 el único formato soportado es PDF** (el corpus, los AC y el
  benchmark son de PDFs).
- Un contrato de estrategia **agnóstico de formato**: cada estrategia recibe una
  ruta de entrada y declara qué formatos soporta (`supports(path)`), de modo que el
  registro pueda enrutar por capacidad. En v1 todas las estrategias soportan solo
  PDF; añadir un formato futuro es registrar una estrategia que lo soporte, sin
  tocar el contrato ni el CLI.
- Estrategias de extracción intercambiables tras una interfaz común; en v1:
  `pymupdf4llm` (Markdown estructurado), `pdftotext`→OCR (texto plano de `ia/`) y
  `markitdown` (Microsoft, path base local `pdfminer.six`+`pdfplumber`, sin red).
- Selección de estrategia configurable y una **cadena de fallback** automática
  (estructurado → texto plano → OCR).
- Guardarraíl anti-fuga de red **fail-closed**: cualquier intento de conexión
  aborta la ejecución; ejecución 100% offline verificable con un test de no-egress.
- Skill fina que invoca el comando y devuelve al modelo **solo ruta + estadísticas**,
  nunca el contenido extraído (gate de consentimiento / 0 tokens).
- Comando de benchmark que compara estrategias por: tiempo, determinismo (hash de
  2 ejecuciones), estructura detectada (headings/tablas/listas) y diff contra
  golden files de un corpus de prueba.

**Out of scope (non-goals):**
- Anonimización / saneado de PII (Presidio, spaCy, `identidad.local.json`): queda
  como plugin/fase futura.
- Procesamiento por lotes o de carpetas (más allá del corpus interno del benchmark).
- La estrategia `marker` (deep learning, ~2-3 GB de modelos): solo se documenta
  como estrategia futura, no se implementa en v1.
- Devolver el contenido del PDF al contexto del modelo (solo bajo petición
  explícita del usuario, fuera del flujo por defecto).
- Reconstrucción perfecta de maquetación compleja (multi-columna exótica, fórmulas).
- **Soporte de formatos no-PDF** (xlsx, docx, pptx, odt…): NO se implementa en v1.
  La arquitectura queda **preparada** para admitirlos (contrato de estrategia con
  `supports()` + registro por capacidad + identidad no atada a PDF `markvault`), pero
  detección de formato, corpus multi-formato y cadenas `auto` por formato son fase
  futura.

## Functional Requirements

### R1 — Interfaz de estrategias de extracción

Depende de: —

The system SHALL exponer una interfaz común de extracción **agnóstica de formato**
tal que cada estrategia reciba una ruta de entrada, exponga `supports(path) -> bool`
(qué formatos acepta) y devuelva texto/Markdown; el registro SHALL poder resolver
estrategias por nombre y por capacidad. En v1 todas las estrategias declaran
soportar únicamente PDF. SHALL incluir en v1 al menos tres estrategias concretas
seleccionables: una que produce Markdown estructurado
(`pymupdf4llm`), una de texto plano basada en `pdftotext` con recurso a OCR, y
`markitdown` (path base 100% local; se usa **solo** su extractor PDF por defecto,
`pdfminer.six`+`pdfplumber`, quedando **excluidos** su OCR por LLM Vision y el path
Azure Document Intelligence por violar el guardarraíl de red/0-tokens).

#### R1.S1 — Selección explícita de estrategia
- GIVEN un PDF electrónico con texto embebido
- WHEN se invoca el comando con `--strategy pymupdf4llm`
- THEN se produce el `.md` usando esa estrategia
- AND la salida a stderr nombra la estrategia efectiva usada (`strategy=pymupdf4llm`)

#### R1.S2 — Estrategia inexistente
- GIVEN cualquier PDF
- WHEN se invoca con `--strategy noexiste`
- THEN el comando sale con código ≠ 0 y stderr contiene `estrategia desconocida: noexiste`
- AND lista las estrategias válidas disponibles

#### R1.S3 — Selección de markitdown
- GIVEN un PDF electrónico con texto embebido
- WHEN se invoca el comando con `--strategy markitdown`
- THEN se produce el `.md` usando el extractor PDF base de markitdown (sin red)
- AND la salida a stderr nombra la estrategia efectiva usada (`strategy=markitdown`)

### R2 — Extracción de un PDF a Markdown

Depende de: R1

The system SHALL, dado un PDF de entrada, escribir un archivo `.md` con el texto
extraído de forma **determinista** (dos ejecuciones con la misma entrada y
estrategia producen bytes idénticos) y **sin realizar ninguna conexión de red**.

#### R2.S1 — Happy path electrónico
- GIVEN un PDF con texto embebido y sin `--out`
- WHEN se invoca `markvault documento.pdf`
- THEN se crea `documento.md` junto al PDF con el texto extraído (longitud > 0)
- AND stderr reporta `caracteres=<N>` y `strategy=<nombre>`
- AND el código de salida es 0

#### R2.S2 — Ruta de salida explícita
- GIVEN un PDF válido
- WHEN se invoca con `--out /ruta/salida.md`
- THEN el `.md` se escribe exactamente en `/ruta/salida.md`

#### R2.S3 — PDF inexistente o corrupto
- GIVEN una ruta que no es un PDF legible
- WHEN se invoca el comando sobre ella
- THEN sale con código ≠ 0 y stderr contiene `no se pudo leer el PDF` (sin volcar contenido)
- AND no se crea ningún `.md`

### R3 — Cadena de fallback automática

Depende de: R1

The system SHALL, en modo `--strategy auto` (por defecto), intentar la estrategia
de Markdown estructurado y, si esta falla o produce texto por debajo de un umbral
mínimo, recurrir a `pdftotext` y, si aún así el resultado es insuficiente, a OCR;
la estrategia que finalmente produce la salida SHALL quedar reportada. `markitdown`
NO forma parte de la cadena `auto` por defecto (para mantenerla simple y
determinista): es una estrategia **seleccionable explícitamente** y participante del
benchmark, no un eslabón del fallback automático.

#### R3.S1 — Estructurado exitoso
- GIVEN un PDF electrónico legible en modo `auto`
- WHEN se ejecuta el comando
- THEN la salida se produce con la estrategia estructurada
- AND stderr reporta `strategy=pymupdf4llm fallback=no`

#### R3.S2 — Fallback a OCR en PDF imagen
- GIVEN un PDF que es imagen escaneada (sin texto embebido) en modo `auto`
- WHEN se ejecuta el comando
- THEN el resultado insuficiente de las estrategias de texto dispara OCR
- AND stderr reporta la cadena recorrida terminando en `strategy=ocr fallback=yes`
- AND el `.md` resultante tiene longitud > 0

### R4 — Guardarraíl anti-fuga de red (fail-closed)

Depende de: —

The system SHALL activar, antes de cualquier extracción, una barrera que
intercepta la apertura de sockets de red en el proceso, tal que cualquier intento
de conexión **aborta la ejecución** con error, y SHALL forzar variables de entorno
de modo offline para librerías de modelos; la extracción legítima (Poppler,
Tesseract, PyMuPDF) NO realiza red y por tanto no dispara la barrera.

#### R4.S1 — Extracción normal no dispara la barrera
- GIVEN la barrera activada y un PDF válido
- WHEN se ejecuta una extracción real (cualquier estrategia v1)
- THEN la extracción completa con código 0 sin ningún error de red

#### R4.S2 — Intento de conexión aborta (fail-closed)
- GIVEN la barrera activada
- WHEN el código intenta abrir una conexión de red (`socket.connect`/`create_connection`)
- THEN se lanza un error de bloqueo y el proceso sale con código ≠ 0
- AND stderr contiene un mensaje que identifica el bloqueo de red (p. ej. `BLOQUEADO: intento de conexión`)

#### R4.S3 — Modo offline forzado
- GIVEN la barrera activada
- WHEN se inspecciona el entorno del proceso
- THEN `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE` y `HF_DATASETS_OFFLINE` valen `1`

### R5 — Gate de privacidad / 0 tokens en la skill

Depende de: R2

The system (la skill) SHALL, al procesar un PDF, invocar el comando local y
devolver al contexto del modelo **únicamente** la ruta del `.md` producido y
estadísticas (nº de caracteres, estrategia, si hubo fallback); NO SHALL leer ni
incluir el contenido extraído salvo petición explícita del usuario.

#### R5.S1 — Reporte sin contenido
- GIVEN un PDF procesado por la skill
- WHEN la skill termina
- THEN su mensaje al usuario contiene la ruta del `.md` y las estadísticas
- AND NO contiene ninguna línea del texto extraído del PDF

#### R5.S2 — Lectura de contenido solo bajo consentimiento
- GIVEN un `.md` ya generado
- WHEN el usuario pide explícitamente ver/usar su contenido
- THEN (y solo entonces) la skill lee el `.md` al contexto
- AND en el flujo por defecto (sin esa petición) el contenido nunca se lee

### R6 — Benchmark de estrategias

Depende de: R1, R2

The system SHALL ofrecer un comando de benchmark que, sobre un corpus de PDFs de
prueba con sus golden files `.md` esperados, ejecute cada estrategia y emita, por
(PDF × estrategia): tiempo de ejecución, resultado de determinismo (hash idéntico
en 2 ejecuciones), recuento de estructura detectada (headings/tablas/listas) y el
resultado del diff contra el golden file. La salida SHALL ser mecánica (sin juicio
del modelo) y no realizar red.

#### R6.S1 — Ejecución del benchmark
- GIVEN el corpus de prueba con sus golden files
- WHEN se ejecuta el comando de benchmark
- THEN emite una tabla/JSON con una fila por (PDF, estrategia) incluyendo columnas
  `tiempo_ms`, `determinista` (sí/no), `headings`, `tablas`, `listas`, `diff_ok` (sí/no)
- AND el código de salida es 0 si todas las estrategias completaron

#### R6.S2 — Regresión detectada por golden diff
- GIVEN una estrategia cuya salida difiere de su golden file esperado
- WHEN se ejecuta el benchmark
- THEN la fila correspondiente marca `diff_ok=no`
- AND el resumen final indica al menos un fallo de golden

### R-E2E — Extraer un PDF a Markdown de forma privada y verificable

Depende de: R1, R2, R3, R4, R5

The system SHALL, desde la invocación de la skill sobre un PDF, producir localmente
el `.md` mediante la cadena de estrategias, sin fuga de red, devolviendo al modelo
solo metadatos.

#### R-E2E.S1 — Recorrido integrador
- GIVEN un PDF electrónico y la skill `markvault`
- WHEN el usuario pide convertirlo a Markdown
- THEN se crea el `.md` junto al PDF con contenido (longitud > 0)
- AND la skill reporta ruta + `caracteres=<N>` + `strategy=<nombre>` sin volcar contenido
- AND una ejecución bajo bloqueo de red del mismo comando completa con código 0 (no hubo egress)

## Technical Requirements

- **Stack / framework:** Python 3 + CLI. Plugin de Claude Code (skill fina +
  comando/script). Dependencias de extracción: `pymupdf4llm` (PyMuPDF, puro local),
  `pdftotext`/`pdftoppm` (Poppler), `tesseract` (OCR, idioma configurable, por
  defecto `spa`), `pdf2image`, y `markitdown[pdf]` (`pdfminer.six`+`pdfplumber`,
  puro local). De markitdown se invoca **solo** su conversor PDF base; sus extras
  de OCR por LLM y Azure Document Intelligence NO se instalan ni se invocan.
- **Integraciones:** Ninguna red/API externa (es un requisito, no una integración).
  La skill invoca el comando vía shell; no llama a modelos.
- **Rendimiento:** No hay SLA duro. El benchmark mide `tiempo_ms` por estrategia
  como dato comparativo, no como umbral de aprobación.
- **Seguridad / privacidad:** Barrera anti-red `red_guard` portada de `ia/`
  (parcheo de `socket.connect`/`connect_ex`/`create_connection`, fail-closed) +
  variables `*_OFFLINE=1`. Los binarios externos corren en subprocesos offline;
  defensa opcional adicional `sandbox-exec -n 'deny network*'` documentada. El
  contenido del PDF nunca entra al contexto del modelo por defecto (R5). Test
  automatizado de no-egress obligatorio.
- **Datos / almacenamiento:** Entrada = un PDF; salida = un `.md` (junto al PDF o
  en `--out`). Corpus de prueba del benchmark (PDFs + golden `.md`) versionado
  dentro del plugin; debe ser contenido no sensible/público.
- **Restricciones adicionales:** El coste en tokens del flujo por defecto debe ser
  ~0 (solo la invocación del comando). Determinismo exigido a las estrategias v1.
  Bump de versión en `plugin.json` en el mismo commit que cambie el plugin (regla
  del repo). `marker` documentado pero no implementado.
- **Arquitectura de extensibilidad:** patrones ligeros (Strategy + Registry +
  Chain of Responsibility para `auto` + interfaz agnóstica de formato), **no DDD**
  (no hay dominio con invariantes que justifique agregados/repositorios; añadiría
  ceremonia contra el objetivo de script determinista y skill fina). El contrato
  `supports(path)` es la única costura que se generaliza en v1 para no rehacer el
  diseño al añadir formatos; `markitdown` es el adapter de cobertura amplia previsto
  para esos formatos futuros.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — `--strategy pymupdf4llm` sobre PDF electrónico: `.md` creado y stderr con `strategy=pymupdf4llm`
- [ ] AC2 → R1.S2 [auto] — `--strategy noexiste`: exit ≠ 0 y stderr `estrategia desconocida: noexiste` + lista de válidas
- [ ] AC3 → R2.S1 [auto] — `markvault documento.pdf`: crea `documento.md` (len>0), stderr `caracteres=N` y `strategy=…`, exit 0
- [ ] AC4 → R2.S2 [auto] — `--out ruta.md`: el archivo existe exactamente en esa ruta
- [ ] AC5 → R2.S3 [auto] — entrada ilegible: exit ≠ 0, stderr `no se pudo leer el PDF`, sin `.md` creado
- [ ] AC6 → R3.S1 [auto] — modo `auto` sobre PDF electrónico: stderr `strategy=pymupdf4llm fallback=no`
- [ ] AC7 → R3.S2 [auto] — modo `auto` sobre PDF imagen: stderr termina en `strategy=ocr fallback=yes`, `.md` len>0
- [ ] AC8 → R4.S1 [auto] — extracción real con barrera activa: exit 0, sin error de red
- [ ] AC9 → R4.S2 [auto] — test de no-egress: un `socket.connect` con la barrera activa aborta (exit ≠ 0, mensaje de bloqueo)
- [ ] AC10 → R4.S3 [auto] — con barrera activa, las 3 env `*_OFFLINE` valen `1`
- [ ] AC11 → R5.S1 [auto] — salida de la skill contiene la ruta y `caracteres=`; grep del texto del PDF en el mensaje = 0 coincidencias
- [ ] AC12 → R5.S2 [manual] — verificar que sin petición explícita el `.md` no se lee al contexto; requiere juzgar el comportamiento conversacional de la skill, no mecanizable con un solo comando
- [ ] AC13 → R6.S1 [auto] — benchmark emite fila por (PDF, estrategia) con `tiempo_ms`, `determinista`, `headings`, `tablas`, `listas`, `diff_ok`; exit 0
- [ ] AC14 → R6.S2 [auto] — golden alterado a propósito: fila con `diff_ok=no` y resumen con ≥1 fallo
- [ ] AC15 → R1.S3 [auto] — `--strategy markitdown` sobre PDF electrónico: `.md` creado (len>0) y stderr con `strategy=markitdown`, sin red
- [ ] AC-E2E → R-E2E.S1 [auto] — skill sobre PDF electrónico: `.md` creado (len>0), reporte con ruta+stats sin contenido, y el comando bajo `sandbox-exec -n 'deny network*'` completa exit 0

## Assumptions & Open Questions

- Umbral de "texto insuficiente" que dispara el fallback: se asume ~20 caracteres
  (como en `ia/`); ajustable en el plan.
- Idioma OCR por defecto `spa`; expuesto como opción en el plan si se necesita.
- El corpus de prueba del benchmark se compone de PDFs **públicos/no sensibles**
  creados para el plugin (uno electrónico, uno imagen/escaneado como mínimo).
- Nombre del comando y de la skill: `markvault` (identidad de marca, no atada a PDF, deliberada para
  futuro multi-formato); confirmable al planificar.
- `red_guard`, `pdftotext` y `pymupdf4llm` son deterministas; se asume que Tesseract
  también lo es con parámetros fijos (a verificar en el benchmark, columna `determinista`).
- `markitdown` para PDF produce texto plano (`pdfminer.six`), con tablas vía
  `pdfplumber`; **no reconstruye headings Markdown** como `pymupdf4llm`. Se asume
  determinista (base pdfminer); se confirma en la columna `determinista` del benchmark.
  Su valor aquí es comparativo (una fila más), no superar a la estrategia estructurada.
- Cómo se reconstruye "estructura detectada" para estrategias de texto plano
  (sin headings markdown reales): se asume recuento 0/heurístico; el plan decide.
