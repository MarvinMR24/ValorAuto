# App

Interfaz de usuario de ValorAuto: app móvil en **React Native + Expo** (ver [ADR-0002](../docs/adr/0002-frontend-react-native-expo.md)). Sube una foto (cámara o galería) + kilometraje y muestra el precio estimado devuelto por [`src/api`](../src/api/).

## Estructura

- `App.tsx` / `index.ts` — entrypoint de Expo.
- `src/screens/TasacionScreen.tsx` — pantalla única del MVP: selector de foto, campo de kilometraje, botón "Tasar Auto", estado de carga y resultado. Cubre las historias #20 y #21 de `docs/contexto/contexto_proyecto.md`.
- `src/services/api.ts` — cliente HTTP del endpoint `POST /tasacion`, con los códigos de error del contrato en `openspec/changes/endpoint-tasacion-mvp/specs/tasacion/spec.md`.
- `app.json` — configuración de Expo, incluye los textos de permiso de cámara/galería (iOS y Android) que pide `expo-image-picker`.

## Cómo correrla

```bash
cd app
npm install
cp .env.example .env   # ajustar EXPO_PUBLIC_API_URL cuando exista src/api corriendo
npx expo start
```

Escaneá el QR con **Expo Go** en tu teléfono, o presioná `a`/`i` para abrir un emulador Android/iOS. Mientras `src/api` no exista todavía (Sprint 4 del backlog), el botón "Tasar Auto" va a mostrar el mensaje de error de conexión — es esperado.

## Pendiente

- Conectar contra `src/api` real una vez implementado.
- Reemplazar los íconos generados por defecto (`assets/`) por el ícono real de ValorAuto antes de un build de producción.
