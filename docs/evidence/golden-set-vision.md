# Evaluación del componente de visión — golden set

**Fecha:** 2026-10-26 · **Endpoint:** `POST /identificar` (Gemini con modelo de respaldo, imagen optimizada a 800 px) · **Golden set:** 28 fotos de Wikimedia Commons con licencia libre, una por cada uno de los modelos más publicados del dataset, etiquetadas por el año-modelo del título y revisadas a ojo ([`tests/golden_set/golden_set.csv`](../../tests/golden_set/golden_set.csv)). Responde al riesgo R21.

Reproducir: `docker compose --profile tools run --rm test-ml python tests/golden_set/evaluar_golden_set.py`

## Métricas

| Métrica | Resultado | Qué significa |
|---|---|---|
| Respuestas 200 | 28/28 (100.0 %) | Gemini respondió con un vehículo sobre el umbral de confianza |
| 422 (no identificado) | 0/28 | Confianza < 0.6 o respuesta fuera de esquema |
| 503 (Gemini no disponible) | 0/28 | Saturación aun con el modelo de respaldo |
| **Marca correcta** | 28/28 (100.0 %) | |
| **Marca + modelo correctos** | 28/28 (100.0 %) | Con la misma normalización que la búsqueda de precio (`model_base`) |
| Año exacto (con marca+modelo ok) | 14/28 (50.0 %) | |
| Año ±1 | 23/28 (82.1 %) | Misma generación en casi todos los casos |
| Año ±2 | 26/28 (92.9 %) | |
| **Clave de tasación correcta** (marca + modelo + año ±1) | 23/28 (82.1 %) | El precio habría salido de la fila correcta sin que el usuario corrija nada |
| Confianza media en aciertos / fallos | 0.977 / 0.968 | ¿La confianza separa aciertos de errores? |
| Fallos con confianza ≥ 0.6 | 5 | Errores que el umbral no detiene: por eso el formulario es editable |
| Latencia p50 / p95 | 6.3 s / 19.78 s | Solo respuestas 200, red local |

## Resultado por foto

| Foto | Esperado | Obtenido | Conf. | Δ año | Clave ok | s |
|---|---|---|---|---|---|---|
| `ford_f-150_2018.jpg` | ford f-150 2018 | ford f-150 2018 | 0.98 | 0 | ✅ | 13.61 |
| `chevrolet_silverado_2019.jpg` | chevrolet silverado 2019 | chevrolet silverado 2019 | 0.98 | 0 | ✅ | 11.34 |
| `jeep_wrangler_2017.jpg` | jeep wrangler 2017 | jeep wrangler 2016 | 0.98 | 1 | ✅ | 7.75 |
| `ram_1500_2019.jpg` | ram 1500 2019 | ram 1500 2019 | 0.98 | 0 | ✅ | 6.8 |
| `gmc_sierra_2019.jpg` | gmc sierra 2019 | gmc sierra 1500 denali 2019 | 0.98 | 0 | ✅ | 4.4 |
| `honda_accord_2007.jpg` | honda accord 2007 | honda accord 2006 | 0.95 | 1 | ✅ | 3.6 |
| `toyota_camry_2012.jpg` | toyota camry 2012 | toyota camry 2012 | 0.98 | 0 | ✅ | 2.93 |
| `honda_civic_2020.jpg` | honda civic 2020 | honda civic 2020 | 0.98 | 0 | ✅ | 6.65 |
| `jeep_grand-cherokee_2018.jpg` | jeep grand cherokee 2018 | jeep grand cherokee trackhawk 2020 | 0.98 | 2 | ❌ | 7.78 |
| `nissan_altima_2008.jpg` | nissan altima 2008 | nissan altima 2007 | 0.98 | 1 | ✅ | 19.78 |
| `toyota_tacoma_2005.jpg` | toyota tacoma 2005 | toyota tacoma 2008 | 0.95 | 3 | ❌ | 4.3 |
| `toyota_corolla_2018.jpg` | toyota corolla 2018 | toyota corolla 2017 | 0.98 | 1 | ✅ | 2.77 |
| `ford_explorer_2020.jpg` | ford explorer 2020 | ford explorer 2020 | 0.98 | 0 | ✅ | 4.55 |
| `ford_mustang_2018.jpg` | ford mustang 2018 | ford mustang 2018 | 0.98 | 0 | ✅ | 2.47 |
| `ford_escape_2017.jpg` | ford escape 2017 | ford escape 2017 | 1 | 0 | ✅ | 2.95 |
| `ford_fusion_2020.jpg` | ford fusion 2020 | ford fusion 2019 | 0.98 | 1 | ✅ | 12.36 |
| `toyota_tundra_2017.jpg` | toyota tundra 2017 | toyota tundra 2016 | 0.98 | 1 | ✅ | 14.38 |
| `honda_cr-v_2018.jpg` | honda cr-v 2018 | honda cr-v 2017 | 0.98 | 1 | ✅ | 1.97 |
| `hyundai_sonata_2020.jpg` | hyundai sonata 2020 | hyundai sonata 2020 | 0.98 | 0 | ✅ | 26.33 |
| `chevrolet_cruze_2015.jpg` | chevrolet cruze 2015 | chevrolet cruze 2014 | 0.95 | 1 | ✅ | 3.17 |
| `ford_focus_2018.jpg` | ford focus 2018 | ford focus 2018 | 0.98 | 0 | ✅ | 9.07 |
| `chevrolet_malibu_2006.jpg` | chevrolet malibu 2006 | chevrolet malibu 2008 | 0.95 | 2 | ❌ | 9.76 |
| `volkswagen_jetta_2011.jpg` | volkswagen jetta 2011 | volkswagen jetta 2011 | 0.98 | 0 | ✅ | 3.06 |
| `honda_odyssey_2019.jpg` | honda odyssey 2019 | honda odyssey 2018 | 0.95 | 1 | ✅ | 6.44 |
| `toyota_4runner_2017.jpg` | toyota 4runner 2017 | toyota 4runner 2020 | 0.98 | 3 | ❌ | 9.14 |
| `dodge_grand-caravan_2013.jpg` | dodge grand caravan 2013 | dodge grand caravan 2015 | 0.98 | 2 | ❌ | 1.94 |
| `subaru_outback_2020.jpg` | subaru outback 2020 | subaru outback 2020 | 0.98 | 0 | ✅ | 6.16 |
| `chevrolet_tahoe_2015.jpg` | chevrolet tahoe 2015 | chevrolet tahoe 2015 | 0.98 | 0 | ✅ | 2.16 |

## Limitaciones de esta evaluación

- 28 fotos, una por modelo: sirve como referencia y para detectar regresiones, no para estimar la exactitud con precisión estadística.
- Son fotos de Commons, en general bien encuadradas y del mercado de EE. UU./Europa/Asia; fotos de celular en Bolivia (ángulos, luz, modelos locales) pueden rendir peor (R2).
- Gemini no es determinista: los números pueden variar algunos puntos entre corridas.
- Solo evalúa la identificación por foto. La revisión de fallas (`/revision`) se controla con validación de esquema y filtro de precios (`src/api/test/seguridad.test.js`), sin métrica de calidad del contenido.
