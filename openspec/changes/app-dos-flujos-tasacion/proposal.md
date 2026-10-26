## Why

La app del MVP (`app/`) tenía una sola pantalla de foto + kilometraje contra `POST /tasacion`: si Gemini identificaba mal el auto no había forma de corregirlo, sin Gemini no se podía tasar nada, y el resultado era solo un número. El equipo quiere una app que vaya directo a lo importante y que, además del precio, ayude a decidir la compra.

## What Changes

- Inicio con dos opciones: **Ingresar datos** (formulario) y **Usar una foto** (Gemini prellena el formulario, el usuario corrige y completa el kilometraje).
- Pantalla de **resultado** compartida: precio, rango, **fallas comunes** y **qué revisar primero** para ese modelo, y volver.
- Backend: `GET /catalogo`, `POST /identificar`, `POST /tasacion/datos`, `GET /revision`. `POST /tasacion` no cambia.
- Gemini pasa a generar también el checklist de inspección (texto), con respaldo genérico fijo (ADR-0011). Sigue sin dar precios.
- Identidad visual: paleta azul + beige/blanco, logo rojo (etiqueta de precio con un auto).

## Capabilities

### New Capabilities
- `app-tasacion`: flujos de la app y endpoints de soporte (catálogo, identificación, tasación por datos, revisión).

### Modified Capabilities
(ninguna — `tasacion` conserva su contrato)

## Impact

- **Código:** `src/api` (rutas, controllers, validaciones, `geminiService.generateInspectionTips`), `app/` (pantallas, componentes, cliente HTTP, íconos).
- **Dependencias app:** `react-native-svg`, `expo-image-manipulator`, `expo-splash-screen` (versiones del SDK 57).
- **Costo Gemini:** una llamada de texto más por modelo distinto (cacheada 24 h).
