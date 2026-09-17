# ADR-0009 — Agregar condition, cylinders y size como features del modelo

**Estado:** Aceptada
**Fecha:** Sprint 3 (después de la primera corrida real de punta a punta, ver `docs/evidence/baseline-modelo.md`)
**Relacionado:** `src/model/config.py`, `src/model/data_loading.py`, `src/pipeline/combinations.py`, [ADR-0004](0004-gemini-vision-vs-modelo-propio.md), [ADR-0008](0008-separacion-componentes-notebooks-delgados.md)

## Contexto

La primera corrida real del pipeline (ver `docs/evidence/baseline-modelo.md`) usó 7 features (`year`, `odometer`, `manufacturer`, `fuel`, `transmission`, `drive`, `type`), heredadas 1:1 de `train_baseline.ipynb`. Al revisar qué columnas del CSV crudo se estaban descartando por completo (ver ADR-0008 y la explicación dada al equipo sobre columnas eliminadas de `load_raw()`), surgió la pregunta de si `condition`, `cylinders` y `size` — descartadas hasta ahora solo porque los notebooks originales nunca las usaron, no porque se hubiera probado que no ayudan — debían incluirse: intuitivamente el estado del auto, la cantidad de cilindros (potencia) y el tamaño del vehículo son factores conocidos de precio en el mercado de autos usados.

## Decisión

Se agregan **`condition`, `cylinders` y `size`** a `FEATURES`/`CAT_FEATURES` en `src/model/config.py`, tratadas como categóricas (one-hot), igual que `manufacturer`/`fuel`/`transmission`/`drive`/`type`. La decisión se tomó **empíricamente, no por intuición sola**: se corrió un experimento controlado (mismas reglas de limpieza, misma semilla, mismo split 80/20, mismos hiperparámetros de `config.MODEL_HYPERPARAMS`) comparando el set de 7 features contra el set de 10, entrenando los 3 modelos en ambos casos.

### Resultado del experimento (XGBoost, el modelo que se promueve a Production)

| Set de features | RMSE | MAE | R² |
|---|---|---|---|
| 7 features (sin condition/cylinders/size) | 6458.02 | 4080.77 | 0.7917 |
| **10 features (con condition/cylinders/size)** | **6085.26** | **3777.90** | **0.8150** |

Mejora consistente en los 3 modelos (Linear Regression, Random Forest y XGBoost), no solo en el mejor: ~5.8% menos RMSE, ~7.4% menos MAE y +0.023 de R² en XGBoost. Con esa evidencia, se decidió mantener las 3 columnas nuevas.

También se probó `cylinders` como valor **numérico** (extraído del string, `"8 cylinders"` → `8.0`, `"other"` → nulo) en vez de categórico, siguiendo el razonamiento de que a mayor número de cilindros, mayor precio de forma más o menos monótona. Resultado: RMSE=6090.97, prácticamente idéntico al tratamiento categórico (RMSE=6085.26). Se descartó la versión numérica por no aportar mejora y por simplicidad (mismo patrón de codificación que el resto de las categóricas).

## Alternativas consideradas

- **No agregarlas y quedarse con las 7 features originales:** se descartó porque el experimento mostró una mejora real y consistente, y la regla de EC01 pide justificar decisiones frente a alternativas — mantenerlas afuera sin haber probado el efecto habría sido la opción no justificada, no al revés.
- **`cylinders` como número en vez de categoría:** se probó y se descartó por no mejorar el resultado (ver arriba).
- **Agregar también `region`, `state`, `lat`/`long`** (para ajustar precios por zona, mencionado como idea a futuro): se pospone explícitamente. La idea de usar variación geográfica de precios de EE. UU. para estimar un ajuste al mercado boliviano es interesante pero es un problema de modelado distinto (requiere decidir cómo mapear/ajustar precios entre mercados, no solo agregar una columna) y no se resolvió en este cambio; queda como mejora futura relacionada con el riesgo **R2** en `docs/risk-register.md`.

## Consecuencias

- **El flujo en vivo no puede observar `condition`/`cylinders`/`size` todavía.** El componente de visión (Gemini, [ADR-0004](0004-gemini-vision-vs-modelo-propio.md)) solo identifica marca/modelo/año/confianza a partir de la foto; no evalúa el estado del auto, el número de cilindros ni el tamaño. Esto crea una asimetría real entre lo que el modelo aprendió a usar y lo que el pipeline de precálculo puede llenar al construir la grilla de combinaciones.
- **`src/pipeline/combinations.py` resuelve esto con un valor representativo fijo:** para cada combinación de marca/modelo/año/fuel/transmission/drive/type/km (las columnas que sí se pueden establecer), se le asigna la **moda** (valor más común) de `condition`, `cylinders` y `size` en el dataset de entrenamiento — en esta corrida: `condition="good"`, `cylinders="6 cylinders"`, `size="full-size"` — en vez de expandir la grilla con su producto cruzado real, que multiplicaría varias veces el tamaño de `data/precalc.db` sin que el flujo en vivo pudiera aprovechar esa granularidad de todas formas. Esto es una simplificación explícita, documentada como riesgo **R14** en `docs/risk-register.md`, no un descuido.
- **Mejora futura natural:** si el flujo de identificación por foto (Gemini) se extiende para también estimar condición/tamaño/cilindrada — o si se agrega un campo en la app para que el usuario los indique manualmente — el precálculo podría usar esos valores reales en vez de la moda fija, cerrando la brecha entre lo que el modelo sabe usar y lo que el sistema en producción puede observar.
- `condition` (40.8% nulos), `cylinders` (41.6% nulos) y `size` (71.8% nulos) tienen tasas de nulos altas en el dataset crudo; el `SimpleImputer(strategy="most_frequent")` dentro del pipeline de sklearn las rellena con la moda durante el entrenamiento (evita data leakage: se ajusta solo con datos de train, ver `src/model/training.py`). Que la mejora de RMSE/MAE se haya dado *a pesar* de esas tasas de nulos sugiere que incluso una imputación simple con la moda deja suficiente señal real en las filas no nulas.
