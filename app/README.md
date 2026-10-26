# App

Interfaz de usuario de ValorAuto: app móvil en **React Native + Expo SDK 57** (ver [ADR-0002](../docs/adr/0002-frontend-react-native-expo.md)). Contrato y flujos: [`openspec/changes/app-dos-flujos-tasacion/`](../openspec/changes/app-dos-flujos-tasacion/).

## Flujos

1. **Inicio** con dos opciones:
   - **Ingresar datos:** formulario con marca, modelo (selectores con buscador desde `GET /catalogo`), año y kilometraje.
   - **Usar una foto:** cámara o galería. Gemini identifica marca, modelo y año (`POST /identificar`) y prellena el mismo formulario; el usuario lo revisa y completa el kilometraje.
2. **Resultado** (`POST /tasacion/datos`): precio estimado, rango, fallas comunes y qué revisar primero (`GET /revision`), y botón para volver.

## Estructura

- `App.tsx`: navegación con una pila simple (inicio → formulario → resultado) y el botón atrás de Android.
- `src/screens/`: `InicioScreen`, `FormularioScreen`, `ResultadoScreen`.
- `src/components/`: `Logo` (SVG rojo, el mismo trazado de los íconos), `Selector` (modal con buscador), `ui` (botones, campo, tarjeta, aviso).
- `src/services/api.ts`: cliente HTTP con los códigos de error del contrato. También achica la foto (1280 px, JPEG 0.7) antes de subirla.
- `src/theme.ts`: paleta (azules sobre beige/blanco, rojo solo para el logo y los errores).

## Cómo correrla

1. Levanta el backend con la base precalculada: `docker compose up -d api` desde la raíz. Para el flujo de foto y las fallas específicas por modelo, el `.env` de la raíz necesita `GEMINI_API_KEY`.
2. Levanta la app:

```bash
cd app
npm install
cp .env.example .env   # pon la IP de tu compu en la red local, no localhost
npx expo start
```

Escanea el QR con **Expo Go**. El teléfono y la computadora tienen que estar en la misma red Wi-Fi. En macOS, la IP sale con `ipconfig getifaddr en0`.

Si `EXPO_PUBLIC_API_URL` apunta a `localhost`, desde el teléfono vas a ver "No se pudo conectar con el servidor": `localhost` es el propio teléfono.
