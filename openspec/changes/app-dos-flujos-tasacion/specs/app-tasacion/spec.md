## Purpose

Define los flujos de la app de ValorAuto y los endpoints que los soportan, además de `POST /tasacion` (spec `tasacion`).

## ADDED Requirements

### Requirement: Inicio con dos formas de tasar
La app SHALL abrir en una pantalla de inicio con exactamente dos opciones, "Ingresar datos" y "Usar una foto", que llevan al mismo formulario en el modo correspondiente.

#### Scenario: Elegir ingresar datos
- **WHEN** el usuario toca "Ingresar datos"
- **THEN** la app muestra el formulario vacío con marca, modelo, año y kilometraje

### Requirement: Catálogo para el formulario
El sistema SHALL exponer `GET /catalogo` con `{marcas, modelos, anio_min, anio_max}` tomados de `precalc.db`, con los modelos de cada marca ordenados de más a menos anuncios. La app MUST permitir además escribir una marca o modelo que no esté en la lista.

#### Scenario: Base precalculada ausente
- **WHEN** `precalc.db` no está disponible
- **THEN** `GET /catalogo` responde `503` con `error: "catalogo_no_disponible"` y la app deja escribir marca y modelo a mano

### Requirement: Identificación por foto para prellenar
El sistema SHALL exponer `POST /identificar` (multipart, campo `imagen`, mismos límites de imagen que `/tasacion`) que devuelve `{marca, modelo, anio, tipo, confianza}` sin precio. La app MUST achicar la foto a 1280 px de ancho (JPEG 0.7) antes de subirla, prellenar el formulario con el resultado y dejarlo editable.

#### Scenario: Gemini no identifica el auto
- **WHEN** `POST /identificar` responde `422` o `503`
- **THEN** la app muestra el mensaje del error y el usuario puede completar el formulario a mano

### Requirement: Tasación por datos
El sistema SHALL exponer `POST /tasacion/datos` (JSON `{marca, modelo, anio, kilometraje, tipo?}`) con el mismo contrato de respuesta 200/404 que `POST /tasacion` y sin llamar a Gemini. `kilometraje` MUST ser un entero `0..500000` (`400 kilometraje_invalido`); marca, modelo y año son obligatorios (`400 datos_invalidos` con `campo`).

#### Scenario: Tasación exitosa por datos
- **WHEN** se envía `{marca: "toyota", modelo: "corolla", anio: 2015, kilometraje: 52000}`
- **THEN** el sistema responde `200` con el precio de la fila `toyota/corolla/2015/50000` y `coincidencia: "modelo"`

### Requirement: Revisión del modelo
El sistema SHALL exponer `GET /revision?marca&modelo&anio` que devuelve `{fallas_comunes: [{titulo, detalle, severidad}], revisar_primero: [{titulo, detalle}], fuente}`, con un máximo de 5 elementos por lista y `severidad` en `alta|media|baja`. Gemini (solo texto) MUST NOT mencionar precios. El resultado MUST cachearse por marca|modelo|año.

#### Scenario: Gemini no disponible
- **WHEN** no hay `GEMINI_API_KEY`, Gemini falla o responde fuera de esquema
- **THEN** el sistema responde `200` con el checklist genérico y `fuente: "generico"`, y la app lo muestra con una nota

### Requirement: Pantalla de resultado
La app SHALL mostrar marca, modelo, año, kilometraje, precio estimado y rango; si `coincidencia` no es `"modelo"`, una nota de "precio de referencia"; y debajo las fallas comunes y lo que hay que revisar primero, cargadas después del precio. MUST tener un botón para volver, que conserva lo cargado en el formulario. El botón atrás de Android MUST volver a la pantalla anterior.

#### Scenario: Volver al formulario
- **WHEN** el usuario toca "Volver" en el resultado
- **THEN** la app vuelve al formulario con los datos que había cargado
