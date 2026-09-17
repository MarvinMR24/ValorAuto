# Architecture Decision Records — ValorAuto

Registro de decisiones técnicas del proyecto, con las alternativas descartadas y por qué (regla de EC01: "toda técnica seleccionada debe justificarse frente a otras alternativas descartadas").

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-backend-nodejs-express.md) | Backend en Node.js + Express (no FastAPI) | Aceptada |
| [0002](0002-frontend-react-native-expo.md) | Frontend en React Native + Expo (no Streamlit) | Aceptada |
| [0003](0003-precalculo-nocturno-vs-tiempo-real.md) | Precálculo nocturno de precios (no cálculo en vivo) | Aceptada |
| [0004](0004-gemini-vision-vs-modelo-propio.md) | Gemini solo como componente de visión (no como modelo de precio) | Aceptada |
| [0005](0005-mlflow-tracking-model-registry.md) | MLflow para tracking de experimentos y Model Registry | Aceptada |
| [0006](0006-dvc-dagshub-versionamiento-datos.md) | DVC + DagsHub para versionamiento del dataset | Aceptada |
| [0007](0007-sqlite-lectura-rapida.md) | SQLite como base de lectura rápida del precálculo (no Redis, por ahora) | Aceptada |
| [0008](0008-separacion-componentes-notebooks-delgados.md) | Separación código/orquestación: componentes en `src/`, notebooks delgados en `notebooks/` | Aceptada |
| [0009](0009-features-condition-cylinders-size.md) | Agregar `condition`, `cylinders` y `size` como features del modelo (validado empíricamente) | Aceptada |
