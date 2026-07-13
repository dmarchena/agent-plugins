# Extracción de PDF y Anonimización — Arquitectura y Guía

## Resumen ejecutivo

Este documento consolida cómo extraer texto de PDFs con **garantías de legibilidad y privacidad** en el contexto del proyecto de cartera (`ia/`). La arquitectura separa **dos capas ortogonales**:

1. **Extracción segura (red_guard + herramientas estándar)** — garantía anti-fuga de red por construcción
2. **Saneado de PII (Presidio + identidad local)** — pseudonimización determinista + NLP

Ambas son **100% offline**, verificables y reutilizables.

---

## 1. Filosofía: dos canales de fuga, dos raíles

El proyecto `ia/` opera bajo el principio de que **la privacidad requiere cerrar DOS canales** por los que un dato real podría salir:

### Canal A — Contexto del modelo
Lo que el código lee/imprime viaja al proveedor del modelo. Controlado por:
- **Saneado de PII** — reemplazar identificadores por alias/placeholders ANTES de imprimir
- **Niveles de sensibilidad N0–N3** — qué datos pueden entrar en el contexto
- **Pseudonimización de datos** — cifras sin nombre/IBAN/DNI

### Canal B — Red desde los scripts
El procesado **NUNCA debe** abrir una conexión con datos del titular. Controlado por:
- **`red_guard`** — parchea `socket` para bloquear egress de red
- **Aislamiento de SO** — ejecutar bajo `sandbox-exec (deny network*)`
- **Scripts certificados offline** — importar barrera anti-red al inicio

**Arquitectura:** la extracción hereda la barrera simplemente importando `extraccion.py` o `red_guard`. No hay que recordar activarla en cada script.

---

## 2. Pipeline de extracción (en detalle)

### 2.1 Punto de entrada único: `maestros/_meta/extraccion.py`

```python
# Cualquier script que toque PDFs hace esto al inicio:
import red_guard
red_guard.activar()  # parchea socket; aborta si hay egress

from extraccion import extraer_texto  # función compartida
```

**Por qué único:** el `red_guard` se activa una sola vez, y entonces toda extracción que use `extraccion.py` hereda la garantía.

### 2.2 Métodos de extracción

#### `pdftotext(path, layout=True)`
- **Herramienta:** `pdftotext` (Poppler, línea de comandos)
- **Cuándo:** PDFs con texto embebido (electrónicos, no imagen)
- **Ventaja:** rápido, exacto, cero configuración
- **Salida:** texto con disposición (columnas, márgenes) preservados si `layout=True`

```python
from extraccion import pdftotext
txt = pdftotext("documento.pdf", layout=True)
```

#### `ocr_pdf(path, tmproot=None, dpi=300, psm=6)`
- **Herramienta:** `pdf2image` (Poppler) + `tesseract` (OCR)
- **Cuándo:** PDFs imagen, glifos, ceros de baja calidad
- **Parámetros:**
  - `dpi=300` — resolución de renderizado (mayor = más lento pero más preciso)
  - `psm=6` — modo de segmentación (6 = bloque uniforme, lee fila a fila)
  - `tmproot` — raíz para temporales (por defecto `_tmp_ocr` en cwd)
- **Salida:** texto extraído

```python
from extraccion import ocr_pdf
txt = ocr_pdf("documento_imagen.pdf", dpi=300)
```

#### `extraer_texto(path, tmproot=None)` — **Usar esto por defecto**
- Intenta `pdftotext` primero
- Si el resultado es muy corto (~<20 caracteres), cae automáticamente a OCR
- Garantiza que SIEMPRE obtengas texto, incluso de glifos
- **Recomendación:** usa esta función salvo que necesites control fino

```python
from extraccion import extraer_texto
txt = extraer_texto("documento.pdf")  # inteligente: pdftotext || OCR
```

### 2.3 Gotchas y configuración

#### Temporales de OCR
**Problema:** tesseract + leptonica en sandbox no pueden usar `/tmp` directo (error "failed to open locally").

**Solución:** los temporales de OCR **DEBEN vivir en `ia/_local/_ocrtmp/`** (gitignored). `ocr_pdf()` lo crea automáticamente, pero los scripts especializados (ej. `ocr_ing.py`) lo hacen explícitamente:

```python
OCRTMP = Path("ia/_local/_ocrtmp")
# ... luego, subprocess con rutas dentro de OCRTMP
```

#### Poppler y Tesseract en PATH
En macOS, la ruta se inyecta automáticamente en `extraccion.py`:

```python
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ.get("PATH", "")
```

Si en otro SO, asegúrate de que `pdftotext`, `pdftoppm` y `tesseract` están en PATH o instálatos:

- **macOS:** `brew install poppler tesseract tesseract-lang`
- **Linux:** `apt-get install poppler-utils tesseract-ocr tesseract-ocr-spa`

#### Idioma OCR
Por defecto `tesseract` usa Spanish (`-l spa`). Parámetro no expuesto en la API; si necesitas otro, modifica `extraccion.py` o llama a tesseract directamente.

---

## 3. Barrera anti-fuga: `red_guard`

### 3.1 Cómo funciona

```python
import red_guard
red_guard.activar()  # idempotente; parcha socket.connect, socket.connect_ex, socket.create_connection
```

Parchea tres métodos de `socket`:
- `socket.connect()` → lanza `RuntimeError`
- `socket.connect_ex()` → lanza `RuntimeError`
- `socket.create_connection()` → lanza `RuntimeError`

**Resultado:** si ANY librería importada a continuación intenta abrir una conexión (descarga modelo, llama API, sync), el programa **aborta en ALTO** con un mensaje claro.

### 3.2 Variables de entorno (offline forzoso)

`red_guard.activar()` también fuerza:

```python
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"
```

Para que HuggingFace/Transformers no intenten descargar modelos en tiempo de ejecución.

### 3.3 Cuándo activarla

**SIEMPRE al inicio, ANTES de:**
- Importar `sanear_pii` (que carga spaCy + Presidio)
- Importar cualquier otra librería de NLP
- Leer un PDF

**Patrón seguro:**

```python
#!/usr/bin/env python3
import os
import sys

# 1. Barrera PRIMERO
_META = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _META)
import red_guard
red_guard.activar()

# 2. Luego, imports que podrían hacer red
from extraccion import extraer_texto
import sanear_pii

# 3. Ahora está seguro procesar
texto = extraer_texto("documento.pdf")
```

### 3.4 Subprocesos

`red_guard` solo parchea el proceso Python actual. Los binarios externos (`pdftotext`, `tesseract`, etc.) corren en subprocesos propios que no se tocan:
- **No hacen red de todos modos** (son herramientas offline)
- Si lo hicieran, `red_guard` no los detendría (pero el sandbox de SO sí: `sandbox-exec (deny network*)`)

---

## 4. Saneado de PII (capa opcional)

**Separación clara:** extracción ≠ saneado. Puedes usar extracción sin saneado si los datos ya son públicos.

### 4.1 Dos capas de saneado

#### Capa 1: Determinista (deny-list)
- Lee `ia/_local/identidad.local.json` (identificadores reales registrados)
- Reemplaza: nombre del titular, DNIs, IBANs, cuentas, email
- **Garantía:** 0 falsos negativos para datos registrados
- **Variantes OCR:** maneja también variantes del DNI corruptas por tesseract (letra de control malleída)

Ejemplo:
```python
identidad.terminos_sensibles()  # → {nombres: [], dni: [], iban: [], email: [], ...}
```

#### Capa 2: NLP (Presidio + spaCy)
- Modelo `es_core_news_lg` de spaCy
- Presidio recognizers customizados:
  - DNI/NIE español con validación de dígito de control
  - IBAN español
  - Email (regex local, **sin egress a tldextract**)
  - Teléfono español (móvil/fijo, +34 opcional, con lookarounds para no tocar importes)
  - Nº de cuenta genérico (alfanumérico, backbone de seguridad)
- **Confianza adaptativa:** DNI con dígito válido → score máximo

### 4.2 Allow-list anti-falsos-positivos

**Nunca redacta:**
- **ISIN** — información de cartera, no PII (protección específica en regex)
- **Nombres de fondos y gestoras** — auto-cargados desde maestros de TODAS las personas
- **Importes, fechas** — NO se piden a Presidio (evita ruido)
- **Ubicaciones geográficas** — no clasificadas como DOMICILIO (son distribución de cartera)
- **Vocabulario financiero estándar** — "Saldo", "Participaciones", "Divisas", "Comisión", etc.

### 4.3 Reemplazo de cuentas/IBAN

**Regla especial:**
- Si una cuenta está **registrada** en `identidad.local.json` → reemplazo con su **alias** (`CTA-AHORRO`, `CTA-VALORES-ING`, etc.)
- Si **no** está registrada → reemplazo con `<CUENTA_····últimos4>` (últimos 4 dígitos)

Ejemplo:
```
Original:  "Tu IBAN ES91 2100 0418 4502 0005 1332 contiene..."
Saneado:   "Tu IBAN <CTA-VALORES> contiene..."  (si está registrada)
         o "Tu IBAN <IBAN_····1332> contiene..."  (si es desconocida)
```

### 4.4 Uso: extractor seguro CLI

```bash
# Modo normal: extrae + sanea automáticamente
python3 _tooling/extractor_seguro/extractor.py documento.pdf [--out saneado.txt]
```

**Salida:**
- Archivo de texto saneado (o stdout)
- Recuentos por tipo a stderr (NUNCA valores reales)

```
PII saneada por tipo:
  TITULAR            2
  ES_NIF             1
  IBAN_CODE          1
  CUENTA_VALORES     1
```

### 4.5 Modo auditoría (revisión local de redacciones)

```bash
python3 _tooling/extractor_seguro/extractor.py --audit CARPETA_DE_PDFS/
```

**Salida:**
- Informes HTML en `ia/_local/extractor_audit/` (gitignored, chmod 600)
- Cada HTML muestra:
  - Tabla de redacciones detectadas (tipo, score, original, reemplazo, contexto ±40)
  - Clasificación: TUS datos (identificadores del titular) vs. Genéricos (NER, posibles falsos positivos)
  - Texto saneado completo

**Garantía:** los valores reales **NUNCA salen de `ia/_local/`** (los archivos HTML quedan ahí, nunca al contexto del modelo).

---

## 5. Herramientas de línea de comandos

### 5.1 Extractor seguro: `_tooling/extractor_seguro/extractor.py`

**Uso general:**

```bash
# Extraer + sanear un PDF
python3 _tooling/extractor_seguro/extractor.py entrada.pdf

# Guardar en archivo
python3 _tooling/extractor_seguro/extractor.py entrada.pdf --out salida.txt

# Auditoría: revisar qué se tachó
python3 _tooling/extractor_seguro/extractor.py --audit CARPETA/

# Sin saneado (para PDFs públicos, ej. informes CNMV)
python3 _tooling/extractor_seguro/extractor.py entrada.pdf --no-sanear
```

**API Python:**

```python
from maestros._meta.extraccion import extraer_texto
from maestros._meta.sanear_pii import sanear, construir_analizador

# Extraer
texto = extraer_texto("documento.pdf")

# Sanear (opcional)
analizador = construir_analizador()
saneado, recuento, detalles = sanear(texto, analizador)
print(f"PII detectada: {dict(recuento)}")
```

### 5.2 OCR ING especializado: `_tooling/extraccion/posiciones/ocr_ing.py`

Ejemplo concreto de OCR con parseo de estructuras especializadas (certificados de posición ING).

**Uso:**

```bash
python3 ocr_ing.py 202606           # extrae posición ING de junio 2026
python3 ocr_ing.py 202606 --debug   # no borra temporales; emite OCR crudo
```

**Salida:** JSON con estructura

```json
{
  "mes": "2026-06",
  "ahorro_saldo": 15410.16,
  "broker_total": null,
  "holdings": [
    {"isin": "ES0118900010", "nombre_ocr": "Cobas Internacional", "titulos": 42}
  ],
  "_warnings": []
}
```

**Técnica:**
1. PDF → PNG con `pdftoppm` (300 dpi)
2. PNG → texto con `tesseract --psm 6 -l spa`
3. Regex + parseo: extract saldo, ISINs, número de títulos
4. Correcciones de glifos OCR (£ → E para ISIN corrupto)
5. Borra temporales

---

## 6. Ejemplo completo: script centralizado

Estructura de un script de extracción reutilizable:

```python
#!/usr/bin/env python3
"""Script centralizado de extracción de PDF con garantías."""

import argparse
import os
import sys
from pathlib import Path

# 1. Barrera anti-fuga — PRIMERO
_HERE = Path(__file__).parent.resolve()
_IA = _HERE.parents[2]  # ajusta según tu estructura
_META = _IA / "maestros" / "_meta"
sys.path.insert(0, str(_META))

import red_guard
red_guard.activar()

# 2. Imports seguros (ya está el socket parchado)
from extraccion import extraer_texto
import sanear_pii


def extraer_y_procesar(pdf_path: str, output_format="saneado", audit=False):
    """
    Extrae PDF con garantías de privacidad.
    
    Args:
        pdf_path: ruta al PDF
        output_format: 'saneado' | 'crudo' | 'json_recuento'
        audit: si True, genera informe HTML local
    
    Returns:
        Texto (saneado o crudo) o dict de recuentos
    """
    print(f"Extrayendo {pdf_path}...", file=sys.stderr)
    
    # Extracción (inteligente: pdftotext || OCR)
    texto = extraer_texto(pdf_path)
    print(f"  → {len(texto)} caracteres extraídos", file=sys.stderr)
    
    if output_format == "crudo":
        return texto
    
    # Saneado
    print("  → saneando PII...", file=sys.stderr)
    analizador = sanear_pii.construir_analizador()
    saneado, recuento, detalles = sanear_pii.sanear(texto, analizador)
    
    if audit:
        # Genera auditoría local (valores reales en ia/_local/)
        term_set = sanear_pii.terminos_titular()
        tuyos = [d for d in detalles
                 if sanear_pii.es_dato_titular(d["tipo"], d["original"], term_set)]
        genericos = [d for d in detalles if d not in tuyos]
        print(f"  → PII: {len(tuyos)} tuyos, {len(genericos)} genéricos (auditoría local)", 
              file=sys.stderr)
    else:
        print(f"  → PII: {dict(recuento)}", file=sys.stderr)
    
    if output_format == "saneado":
        return saneado
    elif output_format == "json_recuento":
        return {"recuento": dict(recuento), "total_caracteres": len(saneado)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extractor centralizado")
    parser.add_argument("pdf", help="Ruta a PDF")
    parser.add_argument("--format", choices=["saneado", "crudo", "json_recuento"],
                        default="saneado", help="Formato de salida")
    parser.add_argument("--audit", action="store_true", help="Generar auditoría local")
    args = parser.parse_args()
    
    resultado = extraer_y_procesar(args.pdf, output_format=args.format, audit=args.audit)
    
    if isinstance(resultado, dict):
        import json
        print(json.dumps(resultado, indent=2))
    else:
        print(resultado)
```

**Uso:**

```bash
# Saneado (defecto)
python3 extractor_centralizado.py documento.pdf

# Crudo (documentos públicos)
python3 extractor_centralizado.py documento.pdf --format crudo

# Con auditoría
python3 extractor_centralizado.py documento.pdf --audit

# JSON con recuentos
python3 extractor_centralizado.py documento.pdf --format json_recuento
```

---

## 7. Verificación y garantías

### 7.1 Pre-commit hooks

Toda sesión que toque maestros/datos termina con:

```bash
python3 maestros/_meta/maestro_check.py --all          # verde ✓
python3 maestros/_meta/privacidad_check.py --all       # verde ✓
```

`privacidad_check` escanea el árbol git contra:
- Términos de identidad local (deny-list)
- Regex genéricas de IBAN/DNI
- Números de cuenta conocidos

**Si da rojo:** algo se filtró al repo. El commit se bloquea.

### 7.2 Verificación anti-red

Para probar que un script no hace egress:

```bash
# Bajo sandbox
sandbox-exec -n 'deny network*' python3 tu_extractor.py documento.pdf

# O confía en que red_guard está activo:
python3 -c "
import sys
sys.path.insert(0, 'maestros/_meta')
import red_guard
red_guard.activar()
# Aquí, cualquier socket.connect() aborta
"
```

### 7.3 Test no-egress

El proyecto incluye `_tooling/extractor_seguro/test_no_egress.py`:

```bash
pytest _tooling/extractor_seguro/test_no_egress.py
```

Verifica que ni `sanear_pii` ni `extraccion` hacen conexiones de red.

---

## 8. Gotchas y troubleshooting

### Falsos positivos en saneado
**Problema:** el OCR marca como DNI un número que no lo es.

**Solución:** revisa con `--audit` para ver el score y contexto. Si es falso positivo, añádelo a la ALLOWLIST del reconocedor o sube el umbral de confianza en `sanear_pii.py`.

### Tesseract no encuentra idioma
```
Error: Error in pixReadMemPng: png read error ...
```

**Solución:** `brew install tesseract-lang` (en macOS) o `apt-get install tesseract-ocr-spa` (Linux).

### PDF sale vacío
```
len(txt.strip()) < 20
```

El PDF se asume imagen y cae a OCR. Si es electrónico pero sale vacío:
- Verifica que el PDF sea válido (`pdfinfo documento.pdf`)
- Prueba a extraer con `pdftotext` directamente: `pdftotext documento.pdf -`
- Si falla, es un PDF corrupto o con protección

### `red_guard` aborta ("BLOQUEADO: intento de conexión")
**Esperado** si:
- Un modelo de spaCy/Presidio intenta auto-descargarse
- Una librería intenta fetch de una API

**Solución:**
- Asegúrate de que los modelos se instalaron localmente ANTES de que `red_guard` se active
- Parchea antes de importar cualquier cosa que haga red
- Revisa el stack trace para saber qué librería violó

---

## 9. Referencia rápida

| Tarea | Comando | Notas |
|-------|---------|-------|
| Extraer PDF (auto: pdftotext \\| OCR) | `from extraccion import extraer_texto; txt = extraer_texto(ruta)` | Función recomendada |
| Extraer sin OCR | `pdftotext(ruta)` | Rápido; vacío si imagen |
| Extraer con OCR | `ocr_pdf(ruta, dpi=300)` | Más lento; funciona con glifos |
| Sanear PII | `python3 _tooling/extractor_seguro/extractor.py documento.pdf` | CLI; recuentos a stderr |
| Auditar redacciones | `python3 _tooling/extractor_seguro/extractor.py --audit CARPETA/` | HTML local (gitignored) |
| Sin saneado (público) | `--no-sanear` | Para PDFs de Públicos/ |
| Verificar no-egress | `red_guard.activar()` al inicio | Parchea socket |
| Bloquear por SO | `sandbox-exec -n 'deny network*' python3 script.py` | Capas de defensa |

---

## 10. Arquitectura mental: diagrama flujo

```
PDF (entrada)
    ↓
[red_guard activo] ← barrera anti-fuga de red
    ↓
EXTRACCION
    ├─ pdftotext (poppler)  ← rápido, texto embebido
    └─ OCR (tesseract)      ← lento, para glifos
    ↓
Texto crudo (~N1: cifras, sin PII evidente)
    ↓
[OPCIONAL] SANEADO
    ├─ Capa determinista: identidad.local.json
    │   └─ nombre/DNI/IBAN → alias/4dígitos
    ├─ Capa NLP: Presidio + spaCy es_core_news_lg
    │   └─ PERSON, EMAIL, teléfono, cuenta genérica
    └─ Allow-list anti-falsos-positivos
        └─ ISIN, fondos, gestoras, importes, fechas
    ↓
Texto saneado (~N1: cifras + alias; listo para contexto del modelo)
    ↓
Salida: stdout | archivo | JSON recuento
```

---

## 11. Recursos dentro del proyecto

- **Docs:** `maestros/SEGURIDAD.md` (política completa), `maestros/CONTRATO.md` (protocolo de maestros)
- **Código:** `maestros/_meta/` (identidad, extraccion, sanear_pii, red_guard)
- **Herramientas:** `_tooling/extractor_seguro/` (CLI), `_tooling/extraccion/` (parsers especializados)
- **Tests:** `_tooling/extractor_seguro/test_no_egress.py`, `_tooling/extraccion/`

---

## Licencia y contexto

**Proyecto:** Cartera financiera (`ia/`, Finanzas)  
**Propósito:** Extracción centralizada de PDF con garantías de privacidad offshore (Canal A + B)  
**Audiencia:** Scripts, herramientas, integración en agentes  
**Nivel sensibilidad:** N1–N2 (pseudonimizado, ningún identificador real en repo)
