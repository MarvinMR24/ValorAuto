# Prompts de evaluación por sprint — ValorAuto

**Curso:** Taller de Sistemas Inteligentes — LAB_01
**Fuente de criterios:** [`contexto_proyecto.md`](contexto_proyecto.md)

Un prompt por sprint (0–6), pensado para pegarse en Claude Code (u otro evaluador humano) **al cierre de cada sprint**, antes de darlo por terminado o de mover las tareas a "Done" en ClickUp. Cada prompt pide auditar el estado real del repo/ClickUp contra los criterios de aceptación de ese sprint — no aceptar autoevaluación sin evidencia.

Regla común a todos los prompts: el evaluador debe responder por cada historia **Cumple / Parcial / No cumple**, citando evidencia concreta (ruta de archivo, comando ejecutado y su salida, captura o link de ClickUp) — nunca una afirmación sin verificar.

---

## Sprint 0 — Setup y Discovery (31 ago–13 sep)

```
Evalúa el cierre del Sprint 0 (Setup y Discovery, 31 ago–13 sep) de ValorAuto.
Verifica estas 3 historias contra su criterio de aceptación (ver docs/contexto/contexto_proyecto.md, sección "Sprint 0"):

1. Team Charter v1 — ¿existe un documento con integrantes, disponibilidad, canales,
   reglas de PR, manejo de bloqueos, integridad/uso de IA y Definition of Done?
   Revisa docs/team_charter.md y su publicación en ClickUp Docs.
2. Matriz de priorización de casos — ¿existe la matriz con ≥3 criterios, comparación
   A/B/C, decisión final y restricción principal? Revisa docs/priorizacion_casos.md.
3. Setup de repo/ClickUp/entorno — ¿el repo tiene la estructura de carpetas esperada
   (data/, model/, api/, frontend/ o equivalentes), README inicial, .gitignore y un
   requirements.txt/Dockerfile que efectivamente instala/corre? ¿Está activa la
   integración GitHub↔ClickUp?

Para cada historia: Cumple / Parcial / No cumple, con evidencia (ruta de archivo o
comando corrido). Señala si alguno de los riesgos listados en el backlog (roles poco
claros, elección de caso sin datos suficientes, falta de convención de commits) se
materializó. Cierra con un veredicto: ¿el Sprint 0 está listo para cerrarse? Si no,
qué falta exactamente.
```

---

## Sprint 1 — Datos (14–27 sep)

```
Evalúa el cierre del Sprint 1 (Datos, 14–27 sep) de ValorAuto.
Verifica estas 4 historias contra su criterio de aceptación (ver
docs/contexto/contexto_proyecto.md, sección "Sprint 1"):

1. Descarga/exploración del Craigslist Vehicles Dataset — ¿está el dataset en
   data/raw/? ¿Existe un notebook de EDA con nulos, tipos y distribuciones de
   precio/marca/modelo/año/odómetro?
2. Datasets complementarios (Cars.com, US Used Cars) — ¿hay al menos un dataset
   adicional evaluado y una decisión documentada (se incorpora o no, y por qué) en
   el README de data/?
3. Limpieza y unificación — ¿existe el dataset limpio en data/processed/ y están las
   reglas de limpieza documentadas?
4. Versionado del dataset final — ¿tiene una versión/tag identificable (fecha o DVC)
   y está referenciado desde el repo?

Para cada historia: Cumple / Parcial / No cumple, con evidencia (ruta de archivo,
commit/tag). Verifica que la cadena de dependencias se respetó (4→5→6→7, ver
"Cadena de dependencias" en contexto_proyecto.md) — si #6 se hizo sin que #5 estuviera
resuelto, señálalo. Señala si el riesgo de "poca cobertura de marcas/modelos comunes
en Bolivia" o el de "limpieza demasiado agresiva" se materializó (compara cobertura de
marca/modelo antes y después de la limpieza). Cierra con un veredicto: ¿el Sprint 1
está listo para cerrarse? Si no, qué falta.
```

---

## Sprint 2 — Modelo de Precio (28 sep–11 oct)

```
Evalúa el cierre del Sprint 2 (Modelo de Precio, 28 sep–11 oct) de ValorAuto.
Verifica estas 4 historias contra su criterio de aceptación (ver
docs/contexto/contexto_proyecto.md, sección "Sprint 2"):

1. Feature engineering — ¿están codificadas marca/modelo (encoding), año (numérico)
   y odómetro (normalizado)? ¿Existe un dataset de entrenamiento (X, y) listo?
2. Modelo baseline (regresión lineal) — ¿está entrenado y con una métrica base
   (MAE/RMSE) registrada como run en MLflow (no solo impresa en el notebook)?
3. XGBoost/Scikit-Learn — ¿hay al menos 2 modelos entrenados, cada uno como run de
   MLflow (params + métricas), y una tabla comparativa de métricas (MAE, RMSE, R²)
   contra el baseline visible en el MLflow Tracking UI o exportada de él?
4. Modelo final — ¿está registrado en el MLflow Model Registry (con una versión
   identificable) además de serializado dentro de model/ (o src/model/), con métricas
   finales y justificación de la elección documentadas?

Para cada historia: Cumple / Parcial / No cumple, con evidencia (run ID de MLflow,
ruta del artefacto, valores de métricas citados textualmente del run/notebook, no
aproximados de memoria). Verifica que train/test/validation estén separados
correctamente (riesgo de overfitting) y que el modelo final elegido tenga un tiempo
de inferencia razonable para el precálculo masivo del Sprint 3 (riesgo explícito del
backlog). Cierra con un veredicto: ¿el Sprint 2 está listo para cerrarse? Si no, qué
falta.
```

---

## Sprint 3 — Motor Nocturno MLOps (12–25 oct)

```
Evalúa el cierre del Sprint 3 (Motor Nocturno MLOps, 12–25 oct) de ValorAuto.
Verifica estas 4 historias contra su criterio de aceptación (ver
docs/contexto/contexto_proyecto.md, sección "Sprint 3"):

1. Generación de combinaciones marca/modelo/año/km — ¿el script produce un
   dataframe/lista con todas las combinaciones válidas? ¿Cuántas combinaciones genera
   (para juzgar si el espacio es manejable para un job nocturno)?
2. Precálculo de precios — ¿el script carga el modelo final desde el MLflow Model
   Registry (no un .pkl copiado a mano) y recorre las combinaciones para producir una
   tabla combinación→precio sin errores sobre el dataset completo? Ejecuta o revisa el
   log de la última corrida.
3. Base de lectura rápida (SQLite/Redis) — ¿la tabla de precios está cargada, con
   índice por (marca, modelo, año, rango_km)? Corre una query de prueba y confirma
   que responde en <50ms (criterio explícito de aceptación).
4. Job nocturno automatizado (cron/Airflow, 3:00 AM) — ¿existe la definición del job
   (crontab, DAG de Airflow)? ¿Hay al menos un log de ejecución exitosa, no solo la
   configuración?

Para cada historia: Cumple / Parcial / No cumple, con evidencia (tiempo de la query
medido, ruta del cron/DAG, timestamp del log). Señala si el riesgo de "espacio de
combinaciones demasiado grande" o "fallos silenciosos del job nocturno" se
materializó — en particular, verifica que un fallo del job dispare alguna alerta o
quede registrado, no solo que "corra". Cierra con un veredicto: ¿el Sprint 3 está
listo para cerrarse? Si no, qué falta.
```

---

## Sprint 4 — Visión (Gemini) + Backend Express (Node.js) (26 oct–8 nov)

```
Evalúa el cierre del Sprint 4 (Visión + Backend Express, 26 oct–8 nov) de ValorAuto.
Verifica estas 4 historias contra su criterio de aceptación (ver
docs/contexto/contexto_proyecto.md, sección "Sprint 4"):

1. Config de la API de Gemini — ¿la API key está en variable de entorno (grep en el
   repo para confirmar que NO está hardcodeada ni en un commit)? ¿Hay una llamada de
   prueba exitosa a gemini-1.5-flash registrada?
2. JSON estricto de Gemini — ¿el prompt fue probado con ≥5 fotos distintas? ¿El
   parser valida las claves marca/modelo/rango_de_año y maneja el caso de texto libre
   o campos faltantes (retry o fallback), no solo el caso feliz?
3. Endpoint Express (POST /tasacion o equivalente) — ¿recibe imagen + km por
   multipart/form-data (ej. `multer`), llama a Gemini, busca en la base de precios
   del Sprint 3 por (marca, modelo, año, rango_km) y responde JSON con precio o un
   error claro si la combinación no existe? Pruébalo con una llamada real.
4. Pruebas de integración Gemini+Express+base de precios — ¿existe una suite con
   ≥5 fotos reales que cubra tanto casos exitosos como de error (combinación no
   encontrada, JSON inválido de Gemini)? Ejecútala y reporta el resultado real, no
   el esperado.

Para cada historia: Cumple / Parcial / No cumple, con evidencia (comando/curl
ejecutado y su respuesta, resultado de la suite de tests). Verifica explícitamente
que NO haya secretos expuestos en el repo (riesgo crítico marcado como "Urgente" en
el backlog) y que exista un fallback definido para combinaciones no encontradas en la
tabla. Cierra con un veredicto: ¿el Sprint 4 está listo para cerrarse? Si no, qué
falta.
```

---

## Sprint 5 — App Móvil (9–15 nov)

```
Evalúa el cierre del Sprint 5 (App Móvil, 9–15 nov) de ValorAuto.
Verifica estas 3 historias contra su criterio de aceptación (ver
docs/contexto/contexto_proyecto.md, sección "Sprint 5"):

1. UI móvil (cámara/galería, campo de km, botón "Tasar Auto") — ¿existe la pantalla
   en React Native (Expo) con selector de imagen, campo numérico de km y el botón?
   ¿Hay validación básica (foto y km obligatorios)? Pruébala en un dispositivo o
   emulador real vía Expo Go, no solo en el simulador de escritorio (riesgo explícito
   del backlog).
2. App conectada a Express — ¿al presionar "Tasar Auto" se llama al endpoint real del
   Sprint 4 (no un mock)? ¿Se muestra spinner/loading durante la espera y luego el
   precio o un mensaje de error legible? Corre el flujo end-to-end al menos una vez y
   documenta el resultado.
3. Recomendaciones de problemas comunes — (prioridad Baja, no bloquea el camino
   crítico) ¿se listan 2-3 problemas comunes conocidos para la marca/modelo/año
   identificado junto al precio?

Para cada historia: Cumple / Parcial / No cumple, con evidencia (captura de pantalla
o descripción del flujo probado en dispositivo/emulador móvil real vía Expo Go, no
solo en web). Señala si la
latencia de red/Gemini se maneja visualmente o si la app da sensación de "colgada"
(riesgo explícito del backlog). La historia 3 es nice-to-have: si no está lista pero
1 y 2 sí, el sprint puede considerarse cerrado igual — indícalo así en el veredicto.
Cierra con un veredicto: ¿el Sprint 5 está listo para cerrarse? Si no, qué falta.
```

---

## Sprint 6 — Integración, Despliegue y Demo (16–22 nov)

```
Evalúa el cierre del Sprint 6 (Integración, Despliegue y Demo, 16–22 nov) de
ValorAuto.

Nota: al momento de escribir docs/contexto/contexto_proyecto.md este sprint todavía
NO tiene historias de usuario definidas en el backlog. Antes de usar este prompt para
evaluar el cierre real del sprint:
1. Confirma si ya se crearon las tareas de Sprint 6 en ClickUp. Si no existen, el
   sprint no puede evaluarse — repórtalo como bloqueo y detente ahí.
2. Si ya existen, lístalas con su criterio de aceptación (desde ClickUp) y evalúa
   cada una con el mismo formato que los sprints anteriores: Cumple / Parcial / No
   cumple, con evidencia concreta.

Como mínimo, dado que este es el sprint de integración y demo final, verifica sin
necesidad de tareas formales:
- El flujo completo foto→identificación→precio funciona end-to-end en al menos 5
  pruebas con autos y kilometrajes distintos (criterio de éxito del Product Goal,
  ver contexto_proyecto.md).
- El tiempo de respuesta end-to-end (incluyendo la llamada a Gemini) es menor a 3
  segundos, medido con al menos una prueba real, no estimado.
- La app está desplegada en un entorno accesible para la demo (no solo corriendo en
  localhost de un desarrollador).

Cierra con un veredicto: ¿el proyecto está listo para la demo en vivo? Si no, qué
falta.
```
