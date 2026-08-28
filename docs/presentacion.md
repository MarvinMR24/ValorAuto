# Estructura de Presentación: ValorAuto

**Proyecto:** Tasador de Autos con IA (foto + kilometraje -> precio de mercado instantáneo)
**Equipo:** Tío Sam (Samuel), Marvin, y Leo (Leonardo)
**Metodología:** Specs-Driven-Development (SDD) con OpenSpec, ClickUp, GitHub y Claude Code

Este documento detalla la estructura sugerida para la exposición del proyecto, actualizada con las últimas integraciones del repositorio (OpenSpec, validación de requerimientos asistida por IA y el MVP del Endpoint), dividida por áreas de responsabilidad.

---

## 1. Introducción, Producto y Metodología (Responsable: Tío Sam)
*Enfoque: Negocio, Gestión de Datos y Specs-Driven-Development*

* **El Problema y la Solución (ValorAuto):**
  * **Problema:** Conocer el precio real de mercado de un auto usado de forma rápida.
  * **Solución:** Una aplicación que con solo una foto y el kilometraje da un precio estimado de mercado al instante.
* **Justificación del Caso Elegido (Priorización):**
  * Explicar por qué se priorizó ValorAuto sobre otras opciones (viabilidad de datos con Craigslist y Cars.com) y cómo permite demostrar el ciclo de vida de un modelo de ML propio.
* **Evolución de la Metodología:**
  * Gestión con **ClickUp** (Listas: Discovery, Data, Architecture, Build, QA, Deploy, Risk).
  * Implementación de **Specs-Driven-Development (SDD) utilizando OpenSpec y Claude Code**: 
    * Mostrar cómo un "requerimiento ambiguo" se somete a análisis con IA (Ej. `REQ-001`) para identificar riesgos (ej: qué pasa si la foto es borrosa, fallas de la API externa).
    * Mostrar el **Gate de Desarrollo**: El equipo valida las resoluciones antes de pasar a "Build" o escribir una línea de código.
* **Datos:**
  * El proceso de limpieza de datos (manejo de nulos en kilometraje, marca, etc.).

## 2. Inteligencia Artificial y Modelos (Responsable: Marvin)
*Enfoque: Machine Learning, MLOps y Visión Computacional*

* **Entrenamiento del Modelo Propio:**
  * Explicación del modelo tabular para predicción de precios (Scikit-Learn / XGBoost).
  * **Punto crítico:** Destacar que el equipo entrenó *su propio modelo* con datos reales, cumpliendo el requisito de MLOps de gestionar ciclos de vida (Tracking de métricas MAE/RMSE con MLflow u otros).
* **El Rol de Gemini (Visión Computacional):**
  * **Aclaración clave:** Gemini **NO predice el precio**, actúa únicamente como los "ojos" del sistema.
  * El modelo recibe la foto y extrae estrictamente un JSON con las características (`marca`, `modelo`, `anio`, `confianza`).
* **Reglas y Límites del MVP (Definidos por OpenSpec):**
  * Cómo se manejan los umbrales de confianza (ej. > 0.6) y cómo Gemini falla rápido ante formatos incorrectos para no romper el pipeline de tasación.

## 3. Ingeniería, Arquitectura y Despliegue (Responsable: Leo)
*Enfoque: API Contract, Automatización y Frontend MVP*

* **Arquitectura del Sistema y Frontend:**
  * Flujo general: Modelo -> Precálculo -> API -> Frontend MVP (`src/index.html`).
* **Especificación del Endpoint (MVP):**
  * Mostrar el contrato definido mediante OpenSpec (`openspec/changes/endpoint-tasacion-mvp`).
  * `POST /tasacion` con validaciones de imagen (≤8MB) y kilometraje válido (0 a 1,000,000).
  * Explicar los casos de error claramente definidos (`422` vehículo no identificado, `404` combinación no precalculada, `503` fallo externo).
* **Estrategia de Precálculo y Trabajos Nocturnos:**
  * Los trabajos (Cron/Airflow a las 3:00 AM) aseguran que el endpoint tenga tiempos de respuesta veloces, consultando datos precalculados sin recálculo en vivo.
* **Despliegue y Reglas de Integridad:**
  * Reglas en GitHub: Nada directo a `main`, PRs con justificación, protección estricta contra la filtración de *api keys* de Gemini.
  * Declaración de uso de IA en la generación de código y requerimientos.

---

## 💡 Consejos para la Exposición

1. **Mostrar el Sistema Funcionando:** Inicien o terminen con una demostración en vivo (con el `src/index.html`) simulando el envío de una foto para tasar.
2. **Mostrar la "Cocina" de OpenSpec + Claude:** Enseñen en pantalla cómo el archivo `REQ-001-validado.md` capturó riesgos técnicos *antes* de programar. Esto impresionará bastante en la evaluación de arquitectura.
3. **Roles Claros:** Dado que son 3, cada uno domina su parte técnica. Refuercen la división de responsabilidades descrita aquí para evidenciar un trabajo en equipo estructurado.
