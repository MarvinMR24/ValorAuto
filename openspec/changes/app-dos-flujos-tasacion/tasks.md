## 1. Backend

- [x] 1.1 `GET /catalogo` desde `precalc.db` (`sqliteService.getCatalog`)
- [x] 1.2 `POST /identificar` reutilizando upload + validación de imagen + `identifyVehicle`
- [x] 1.3 `POST /tasacion/datos` reutilizando `responderPrecio` (respuesta compartida con `/tasacion`)
- [x] 1.4 `GET /revision` con `generateInspectionTips` (Gemini texto, LRU 24 h) y checklist genérico de respaldo
- [x] 1.5 Tests (`src/api/test/app-endpoints.test.js`) y Swagger

## 2. App

- [x] 2.1 Tema (paleta azul + beige/blanco), logo rojo SVG, íconos de app regenerados
- [x] 2.2 Inicio con dos opciones
- [x] 2.3 Formulario único (datos / foto) con selectores de catálogo, prellenado por foto y validaciones
- [x] 2.4 Resultado con precio, rango, fallas comunes, revisar primero y volver
- [x] 2.5 Navegación con pila simple + botón atrás de Android
- [ ] 2.6 Prueba manual en Expo Go del flujo foto con `GEMINI_API_KEY` configurada

Evidencia (2026-10-26): `bun test` 44/44; `tsc --noEmit` sin errores; `expo-doctor` 21/21; `expo export` Android + iOS OK; flujo "Ingresar datos" recorrido de punta a punta en la versión web con el backend real (3/3 corridas, sin errores de JS).
