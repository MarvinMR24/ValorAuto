# ADR-0010 — `model_base` como feature y clave de búsqueda del precálculo

**Estado:** Aceptada
**Fecha:** 2026-10-26
**Relacionado:** `src/model/features.py`, `src/model/config.py`, `src/pipeline/combinations.py`, `src/pipeline/precalculo.py`, `src/api/services/sqlite.service.js`, `src/api/utils/normalizer.js`, [ADR-0003](0003-precalculo-nocturno-vs-tiempo-real.md), [ADR-0007](0007-sqlite-lectura-rapida.md), [ADR-0009](0009-features-condition-cylinders-size.md), spec `openspec/changes/endpoint-tasacion-mvp/specs/tasacion/spec.md`

## Contexto

La verificación de punta a punta del 2026-10-26 encontró que el modelo del auto que identifica Gemini **no influía en el precio**:

1. `model` no era feature del modelo de precio, y `precalc.db` no tenía columna de modelo.
2. Para cada `(manufacturer, year, type, odometer)` había en promedio 15 filas (máximo 84), una por combinación de `fuel`/`transmission`/`drive`, y el backend tomaba una cualquiera con `LIMIT 1` sin `ORDER BY`. Ejemplo: toyota 2015 sedan 50k km tenía 9 filas entre 15.726 y 24.595 USD.

Resultado: un Corolla y un Camry 2015 recibían el mismo precio, y ese precio dependía del orden físico de las filas.

## Decisión

1. **Feature `model_base`.** `model` es texto libre de Craigslist (20.439 valores distintos). Se normaliza a su modelo base con `features.normalizar_modelo()`: primer token, sin la marca si viene al inicio, con dos tokens para prefijos como `grand`/`santa`/`model`, y alias como `f150 → f-150`. Así quedan unas 2.200 categorías. Las que tienen menos de 20 filas se agrupan como "infrecuentes" en el one-hot, que pasa a salida dispersa para no ocupar varios GB.
2. **Una fila representativa por clave de búsqueda.** `combinations.generar_combinaciones()` guarda, para cada `(manufacturer, model_base, year, type)`, solo la configuración `fuel`/`transmission`/`drive` más frecuente del dataset, con su cantidad de anuncios en `n_anuncios`, multiplicada por los 5 escalones de km. Queda en 80.520 filas, casi el mismo tamaño que antes (78.915).
3. **Búsqueda en tres niveles en el backend**, informados en `coincidencia`: `modelo`, después `marca_anio_tipo` (promedio ponderado por `n_anuncios`) y por último `marca_anio`. Los tres siguen saliendo del precálculo (ADR-0003); ninguno hace inferencia en vivo.
4. **Piso de precio.** `precalculo.calcular_precios()` recorta las predicciones a `PRICE_MIN` (500 USD), el mismo mínimo con el que se limpió el target. XGBoost extrapolaba precios negativos en combinaciones raras (4 filas, por ejemplo fiat 1991 con 200k km: −1.537 USD).

La regla de normalización vive duplicada a propósito en Python (`src/model/config.py`) y JS (`src/api/utils/normalizer.js`), con tests en ambos lados. Si se cambia una, hay que cambiar la otra.

### Resultado del experimento (XGBoost v3: 150 árboles, profundidad 9, lr 0.08; mismo split y semilla)

| Set de features | RMSE | MAE | R² |
|---|---|---|---|
| 10 features (ADR-0009) | 5.798 | 3.563 | 0.8320 |
| **11 features (+ `model_base`)** | **5.301** | **3.243** | **0.8596** |

## Alternativas consideradas

- **Solo agregar `model_base` a la tabla sin usarlo como feature:** se descartó. El precio de un Corolla y de un Camry con la misma configuración seguiría siendo idéntico; el modelo solo influiría a través de la configuración típica.
- **Guardar todas las configuraciones y promediar en el backend:** pondera igual una variante con 1 anuncio que una con 128, y además agranda la tabla.
- **`model` crudo como feature:** 20.000 categorías, la mayoría con 1 a 3 filas; es puro ruido.

## Consecuencias

- El `Production` del Model Registry (v4) fue entrenado sin `model_base`. Notebook 03 lo sigue pudiendo usar (el `ColumnTransformer` ignora la columna extra), pero ese precálculo no distinguiría modelos. El `precalc.db` actual se generó con `scripts/recalc_precalc_db.py`. Para registrar el modelo nuevo hay que correr el notebook 02 o `train_new_models.py`, que lo suben al MLflow de DagsHub.
- El MAE usado para el rango `precio_min`/`precio_max` pasa a 3.243 USD (`BASELINE_MAE`).
