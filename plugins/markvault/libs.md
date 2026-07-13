# Herramientas Locales para Convertir PDF a Markdown

Guía de opciones que funcionan 100% en tu máquina, sin enviar datos a servidores externos ni APIs de IA.

## 1. `marker` (La opción más potente en Python)
Es actualmente el estándar de código abierto para conversión local de alta calidad. Convierte PDFs (incluso con tablas complejas, fórmulas matemáticas y columnas) a Markdown limpio usando modelos de aprendizaje profundo que se ejecutan en tu propia CPU/GPU.

- **Privacidad:** 100% local. La primera vez descarga los modelos (~2-3 GB) y los guarda en tu caché local; luego funciona offline total.
- **Instalación:** Requiere Python.
  ```bash
  pip install marker-pdf
  ```
- **Uso:**
  ```bash
  marker_single tu_archivo.pdf ruta_salida/
  ```
- **Ideal para:** Documentos técnicos, científicos o con maquetación compleja donde otras herramientas fallan.

## 2. `pdf-to-markdown` (CLI Binaria de PSPDFKit)
Es una herramienta de línea de comandos independiente (no requiere Python ni Node.js una vez descargada). Utiliza un motor nativo para extraer texto y estructura.

- **Privacidad:** Totalmente local. Es un binario firmado que se ejecuta en tu máquina.
- **Instalación:** Se puede instalar vía script o descargar el binario directamente para Linux, Mac o Windows.
  ```bash
  # Ejemplo de instalación en Linux/Mac
  curl -sSL https://get.pspdfkit.com/pdf-to-markdown | bash
  ```
- **Uso:**
  ```bash
  pdf-to-markdown input.pdf output.md
  ```
- **Ideal para:** Usuarios que quieren un comando simple sin gestionar entornos de Python o dependencias pesadas.

## 3. `pdfmd` (CLI Ligera con OCR opcional)
Una herramienta de línea de comandos (generalmente basada en Go o envoltorios ligeros) diseñada para ser rápida y detectar tablas y matemáticas básicas.

- **Privacidad:** Local. Algunas versiones permiten activar OCR local (usando Tesseract) si el PDF es una imagen escaneada.
- **Instalación:**
  ```bash
  # Si tienes Go instalado
  go install github.com/M1ck4/pdfmd@latest
  # O mediante pip si está disponible como wrapper
  pip install pdfmd
  ```
- **Uso:**
  ```bash
  pdfmd documento.pdf --ocr auto
  ```

## 4. `pymupdf4llm` (Librería Python rápida)
Parte del proyecto PyMuPDF, es extremadamente rápida y ligera para convertir PDFs a Markdown.

- **Privacidad:** 100% local, sin modelos de IA pesados, usa algoritmos de extracción de texto tradicionales mejorados.
- **Instalación:**
  ```bash
  pip install pymupdf4llm
  ```
- **Uso en script Python:**
  ```python
  import pymupdf4llm
  md_text = pymupdf4llm.to_markdown("documento.pdf")
  print(md_text)
  ```

## 5. `markitdown` (Microsoft, universal a Markdown)
Conversor multi-formato de Microsoft (PDF, docx, pptx, xlsx, html, imágenes…). Para **PDF** su path base es 100% local.

- **Privacidad:** El conversor PDF base es local (`pdfminer.six` + `pdfplumber`). **Ojo:** sus extras opcionales de OCR usan **LLM Vision (GPT-4o)** y existe un path **Azure Document Intelligence** — ambos hacen **red/LLM** y quedan **prohibidos** por el guardarraíl; no instalar ni invocar.
- **Instalación:**
  ```bash
  pip install 'markitdown[pdf]'   # solo pdfminer.six + pdfplumber
  ```
- **Uso:**
  ```bash
  markitdown documento.pdf > documento.md
  ```
- **Matiz PDF:** produce texto plano (pdfminer) con tablas vía pdfplumber; **no reconstruye headings Markdown** como `marker`/`pymupdf4llm`. Su fuerza real es multi-formato, no el PDF puro.
- **Ideal para:** comparar en el benchmark y, a futuro, extender el plugin a otros formatos.

## Recomendación final

- **Máxima precisión** (tablas, fórmulas, columnas) y tienes espacio en disco: Usa **`marker`**.
- **Rápido, sencillo y sin dependencias** de Python: Usa el binario **`pdf-to-markdown`**.
- **Script Python ligero**: Usa **`pymupdf4llm`**.   