# ADR-0002 — Frontend en React Native + Expo

**Estado:** Aceptada
**Fecha:** Sprint 0 (confirmada al mergear la rama `marwin`, ver `docs/contexto/contexto_proyecto.md`)
**Relacionado:** `app/`, `docs/architecture/C4-ValorAuto.md`

## Contexto

El Product Goal exige una app móvil que permita tomar/seleccionar una foto (cámara o galería) e ingresar el kilometraje. El curso (Taller de Sistemas Inteligentes) evalúa una demo en vivo con Expo Go o un build de desarrollo (Sprint 5, historias #20-#21 en `docs/contexto/contexto_proyecto.md`).

## Decisión

La interfaz de usuario se construye como una app móvil en **React Native + Expo**, usando `expo-image-picker` para cámara/galería.

## Alternativas consideradas

- **Streamlit:** el diagrama de secuencia original (`docs/SDD.md`) fue escrito en un momento en que se consideró Streamlit como interfaz web rápida. Se descartó porque el Product Goal pide explícitamente una experiencia móvil (cámara del celular), y Streamlit no da acceso nativo a la cámara de un dispositivo móvil sin trabajo adicional significativo.
- **HTML/JS plano (`src/index.html`):** el archivo ya existe en el repo como prueba de concepto inicial de Sprint 0, pero se descartó como interfaz final por la misma razón: no da acceso nativo y fluido a cámara/galería en un teléfono, y no se puede empaquetar como app instalable para la demo.
- **Web app responsive (React/Next.js):** permitiría reusar más código con la web, pero el acceso a cámara vía navegador móvil es menos confiable (permisos, calidad de captura) que un acceso nativo vía Expo, y el criterio de aceptación de Sprint 5 pide explícitamente probar en un dispositivo/emulador real vía Expo Go.

## Consecuencias

- El esqueleto de la app vive en `app/` (Expo + TypeScript), ver `app/README.md` para cómo correrlo.
- Se necesita Expo Go instalado en el dispositivo de demo, o un build de desarrollo, como respaldo si falla la conectividad el día de la defensa.
- `docs/SDD.md` fue corregido para reflejar React Native + Expo en vez de Streamlit (era una incoherencia entre documentos).
