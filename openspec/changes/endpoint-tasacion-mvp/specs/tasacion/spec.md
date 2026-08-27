## Purpose

Define el contrato observable del endpoint de tasación de ValorAuto: qué entrada acepta, qué respuesta exitosa produce y qué error devuelve ante cada falla (imagen o kilometraje inválido, vehículo no identificable, Gemini no disponible, combinación sin precalcular).

## ADDED Requirements

### Requirement: Validación de entrada
El sistema SHALL rechazar con `400` toda solicitud a `POST /tasacion` cuya imagen no sea `jpg`/`png`, exceda 8 MB, o cuyo `kilometraje` no sea un entero en el rango `0..1000000`.

#### Scenario: Kilometraje fuera de rango
- **WHEN** el cliente envía `kilometraje = -5` o `kilometraje = 5000000`
- **THEN** el sistema responde `400` con `error: "kilometraje_invalido"`

#### Scenario: Imagen con formato o tamaño inválido
- **WHEN** el cliente envía una imagen que no es `jpg`/`png` o pesa más de 8 MB
- **THEN** el sistema responde `400` con `error: "imagen_invalida"`

### Requirement: Identificación del vehículo vía visión
El sistema SHALL enviar la imagen al componente de visión (Gemini) y SHALL exigir una respuesta con el esquema `{marca, modelo, anio, confianza}`. Si la respuesta no cumple el esquema o `confianza` es menor a 0.6, el sistema SHALL responder `422` con `error: "vehiculo_no_identificado"`.

#### Scenario: Gemini no logra identificar el vehículo
- **WHEN** la respuesta de visión tiene `confianza < 0.6` o no incluye `marca`/`modelo`/`anio`
- **THEN** el sistema responde `422` con `error: "vehiculo_no_identificado"`

### Requirement: Disponibilidad del componente de visión
El sistema SHALL aplicar un timeout de 10 segundos a la llamada al componente de visión. Ante timeout o error 5xx del proveedor, el sistema SHALL responder `503` con `error: "vision_no_disponible"`, sin reintento automático en el MVP.

#### Scenario: Gemini no responde a tiempo
- **WHEN** la llamada al componente de visión supera 10 segundos sin respuesta, o el proveedor responde con un error 5xx
- **THEN** el sistema responde `503` con `error: "vision_no_disponible"`

### Requirement: Consulta a la tabla precalculada
El sistema SHALL calcular el precio consultando únicamente la tabla precalculada por el job nocturno para la combinación `marca+modelo+anio+rango_km` identificada. Si la combinación no existe en la tabla, el sistema SHALL responder `404` con `error: "combinacion_no_precalculada"`, sin calcular el precio en vivo.

#### Scenario: Combinación no cubierta por el precálculo
- **WHEN** la combinación marca+modelo+año+rango de kilometraje identificada no existe en la tabla precalculada
- **THEN** el sistema responde `404` con `error: "combinacion_no_precalculada"`

### Requirement: Respuesta exitosa de tasación
Cuando la imagen es válida, el vehículo se identifica con confianza suficiente y la combinación existe en la tabla precalculada, el sistema SHALL responder `200` con `{marca, modelo, anio, precio_estimado, precio_min, precio_max}`, donde `precio_min`/`precio_max` se derivan del error del modelo (MAE) registrado para esa combinación.

#### Scenario: Tasación exitosa
- **WHEN** la imagen es válida, Gemini identifica el vehículo con confianza suficiente y la combinación está precalculada
- **THEN** el sistema responde `200` con `marca`, `modelo`, `anio`, `precio_estimado`, `precio_min` y `precio_max`
