# Team Charter

**Proyecto:** Tasador de Autos con IA (foto + kilometraje -> precio de mercado instantáneo)
**Curso:** Taller de Sistemas Inteligentes — LAB_01
**Caso elegido:** ver `priorizacion_casos.md` — Caso A seleccionado sobre PromptForge (Caso B) y Predicción de precios de vivienda, zona sur de La Paz (Caso C), por tener un dataset base ya identificado y viable (Craigslist Vehicles Dataset, complementable con Cars.com / US Used Cars Dataset) y un pipeline de MLOps completo y demostrable.

## Integrantes y disponibilidad

| Integrante | Responsabilidad inicial | Disponibilidad | Restricción |
|---|---|---|---|
| Marvin Mollo | Modelo / IA — entrenamiento del modelo de precio, integración Gemini | Sáb-Dom + feriados nacionales | Prácticas preprofesionales, clases toda la semana |
| Leonardo Delgado | Ingeniería — backend Node.js/Express, job nocturno, contenedores, despliegue | Sáb-Dom + feriados nacionales | Prácticas preprofesionales, clases toda la semana |
| Samuel Villca | Datos / Producto — limpieza de dataset, backlog, interfaz | Sáb-Dom + feriados nacionales | Prácticas preprofesionales, clases toda la semana |

> [COMPLETAR] Reemplazar "Sáb-Dom" con bloques horarios exactos (ej. "Sáb 09:00-13:00") en la próxima reunión de equipo.

## Canales y tiempos de respuesta

- **ClickUp:** tareas, responsables y evidencia.
- **WhatsApp:** coordinación rápida, no decisiones finales.
- **GitHub Issues:** defectos técnicos y bloqueos reproducibles.
- **Tiempo de respuesta normal:** 24 horas.
- **Bloqueo crítico:** se etiqueta en ClickUp y se notifica al canal del equipo.

## Revisión de PR

- Ningún cambio a `main` sin PR.
- Cada PR debe incluir: objetivo, archivos modificados, prueba ejecutada y evidencia.
- Al menos 1 integrante revisa antes de fusionar.
- No se aprueban PR con secretos, credenciales, llaves de API (Gemini) o tests fallidos.
- Las decisiones de IA asistida se declaran en el PR.

## Manejo de bloqueos

```
Bloqueo: [qué impide avanzar]
Inicio: [fecha/hora]
Impacto: [qué entrega está en riesgo]
Intentos: [qué se intentó]
Siguiente acción: [qué se va a hacer]
```

**Ejemplo:**
```
Bloqueo: el dataset de Craigslist tiene demasiados valores nulos en marca/modelo/odometer.
Inicio: [fecha]
Impacto: no se puede entrenar el modelo con suficiente calidad de datos.
Intentos: dropna agresivo, revisión de datasets alternos (Cars.com, US Used Cars).
Siguiente acción: combinar Craigslist con Cars.com para ampliar cobertura y registrar la decisión en Architecture.
```

## Reglas de integridad y uso de IA

- Se permite IA para análisis, diseño, código, pruebas y documentación.
- No se ingresan datos personales, secretos, credenciales ni llaves de API en el repositorio o en la IA.
- Todo código generado debe revisarse, probarse y entenderse.
- El PR declara qué se generó con IA y qué verificaciones se ejecutaron.
- La responsabilidad final es del equipo, no de la herramienta.
- **Regla de aporte real de modelo:** el requisito de MLOps exige que el equipo entrene su propio modelo de precio (Scikit-Learn/XGBoost) sobre datos reales — Gemini se usa únicamente como componente de visión (identificación del vehículo), no como el modelo que predice el precio.

## Definition of Done inicial

Una tarea se considera terminada cuando:

- Tiene criterio de aceptación cumplido.
- Incluye evidencia enlazada en ClickUp.
- El cambio está en GitHub con commit/PR.
- No introduce secretos ni datos sensibles (incluyendo llaves de API).
- Si modifica código, ejecuta pruebas o justifica por qué no aplican.
- Si usa IA, declara uso y verificación.
- Si involucra el modelo de precio, registra el experimento (métricas de error, versión de datos, versión de modelo) en MLflow.
- Si involucra el job nocturno de precálculo, verifica que la tabla de precios se regeneró correctamente antes de dar por cerrada la tarea.
