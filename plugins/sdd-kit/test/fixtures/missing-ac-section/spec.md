# Spec: Tienda Online Básica

## Purpose

Permitir que un usuario se autentique, consulte el catálogo de productos y añada
artículos a un carrito de compra, como base mínima de un flujo de tienda online.

## Scope

**In scope:**
- Autenticación de usuario mediante login.
- Listado de productos del catálogo.
- Añadir productos al carrito de un usuario autenticado.

**Out of scope (non-goals):**
- Pasarela de pago y checkout.
- Gestión de inventario o stock.

## Functional Requirements

### R1 — Autenticación de usuario

Depende de: —

The system SHALL permitir que un usuario se autentique con email y contraseña.

#### R1.S1 — Happy path
- GIVEN un usuario registrado con email y contraseña válidos
- WHEN envía POST /login con esas credenciales
- THEN recibe 200 y un token de sesión

#### R1.S2 — Edge: credenciales inválidas
- GIVEN un usuario con contraseña incorrecta
- WHEN envía POST /login
- THEN recibe 401 y el mensaje "credenciales inválidas"

### R2 — Listado de productos

Depende de: —

The system SHALL exponer el listado de productos del catálogo.

#### R2.S1 — Happy path
- GIVEN productos existentes en el catálogo
- WHEN se envía GET /products
- THEN recibe 200 y un array JSON con los productos disponibles

### R3 — Carrito de compra

Depende de: R1

The system SHALL permitir que un usuario autenticado añada productos a su carrito.

#### R3.S1 — Happy path
- GIVEN un usuario autenticado con un token de sesión válido
- WHEN envía POST /cart con un product_id existente
- THEN recibe 200 y el carrito actualizado incluye ese producto

### R-E2E — Recorrido completo: login → catálogo → carrito

Depende de: R1, R2, R3

The system SHALL permitir, de extremo a extremo, que un usuario se autentique,
consulte el catálogo y añada un producto a su carrito.

#### R-E2E.S1 — Recorrido integrador
- GIVEN un usuario registrado y productos en el catálogo
- WHEN se autentica, consulta GET /products y envía POST /cart con un producto del listado
- THEN el carrito final contiene ese producto y todas las respuestas HTTP son 200

## Technical Requirements

- **Stack / framework:** N/A (spec de prueba para fixtures del validador).
- **Integraciones:** N/A
- **Rendimiento:** N/A
- **Seguridad / privacidad:** N/A
- **Datos / almacenamiento:** N/A
- **Restricciones adicionales:** N/A

## Assumptions & Open Questions

- Este fichero deliberadamente NO tiene sección "## Acceptance Criteria", para
  probar que `inspect-spec` lo detecta y falla con el marcador correspondiente.
