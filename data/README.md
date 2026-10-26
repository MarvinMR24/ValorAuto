# Data

Datos del Tasador de Autos con IA (ValorAuto). Ver [`docs/priorizacion_casos.md`](../docs/priorizacion_casos.md) para el detalle de fuentes y [ADR-0006](../docs/adr/0006-dvc-dagshub-versionamiento-datos.md) para la decisión de versionamiento.

## Fuentes

- **Craigslist Vehicles Dataset** (Kaggle, `austinreese/craigslist-carstrucks-data`, ~426,880 filas). Fuente principal, ya limpia y en uso (`data/vehicles/vehicles_clean.csv`). **Esta es la única fuente usada para entrenar el modelo.**
- **US Used Cars Dataset** y **Cars.com Used Car Listings**: datasets complementarios, evaluados solo con fines exploratorios (historia #5 del backlog, `docs/contexto/contexto_proyecto.md`). Ver EDA en `notebooks/04_eda_datasets_complementarios.ipynb`. **No se usan para entrenar el modelo** — solo para comparar distribuciones/esquema contra el dataset principal.

## Licencia y privacidad

Licencias verificadas manualmente en Kaggle (sección "Usability"/"License" de cada dataset), 2026-09-17:

- **Craigslist Vehicles Dataset**: [`CC0: Public Domain`](https://creativecommons.org/publicdomain/zero/1.0/). Sin restricciones de uso, redistribución o atribución. Es la fuente usada para entrenar — sin riesgo legal.
- **US Used Cars Dataset**: `Data files © Original Authors`. Licencia con dueño identificado pero uso restringido (no es de dominio público). Se sube a DagsHub (`data/complementary/`) para reproducibilidad del EDA del equipo, pero **no se redistribuye fuera del proyecto** ni se usa para entrenar.
- **Cars.com Used Car Listings**: en Kaggle aparece como `Other (specified in description)`, pero la descripción enlazada solo contiene texto genérico sobre el propósito del dataset (uso en investigación/modelado), sin ningún término real de licencia, redistribución o atribución. Al no poder confirmar una licencia real, se trata con la máxima cautela: se usa **solo localmente para EDA exploratorio** (gráficos/estadísticas agregadas en el notebook, que sí se commitea) y **el CSV crudo no se sube a DagsHub ni se redistribuye**. Ver nota en `docs/risk-register.md`.
- Ninguno de los 3 datasets contiene datos personales identificables (son anuncios de vehículos: marca, modelo, año, precio, kilometraje, ubicación aproximada), no de personas. No se ingresan datos personales de usuarios reales de ValorAuto en este repositorio.

## Estructura y estado de versionamiento

- [`vehicles/`](vehicles/) — dataset limpio y versionado con **DVC + DagsHub** (`vehicles_clean.csv.dvc`, remoto en `https://dagshub.com/SNARF3/ValorAutoData`). Esta es la fuente de verdad reproducible: `dvc pull` la trae a cualquier máquina del equipo con acceso.
- [`complementary/`](complementary/) — dataset **US Used Cars** versionado con DVC en el mismo remoto (uso restringido, solo EDA — ver licencia arriba). El CSV de Cars.com **no** vive acá ni en DVC: solo se usó localmente para generar el notebook de EDA.
- [`raw/`](raw/) — todavía documentado solo con un link a Google Drive (`linkRaw.md`). **Pendiente de migrar a DVC** (deuda técnica registrada en [ADR-0006](../docs/adr/0006-dvc-dagshub-versionamiento-datos.md)); mientras tanto, documentar origen y fecha de descarga si se sube un archivo nuevo.
- [`processed/`](processed/) — mismo caso que `raw/`: solo un link a Drive (`linkProcessed.md`) por ahora. `vehicles_clean.csv` ya migró a `vehicles/` con DVC; cualquier otro archivo procesado nuevo debería ir directo a DVC en vez de a Drive.

No subir datasets completos ni credenciales de descarga a este repositorio (usar `dvc add` + `dvc push`, nunca `git add` sobre archivos pesados).

## Cómo traer los datos

```bash
pip install dvc
dvc remote default origin   # si no está seteado (ver ADR-0006, este fue un bug real que se corrigió)
dvc pull data/vehicles/vehicles_clean.csv.dvc
```

**Nota de acceso (actualizado 2026-09-17):** el remoto migró de `LEONGO037/ValorAuto` (privado, sin acceso de push para el equipo) a `SNARF3/ValorAutoData` (ver [ADR-0006](../docs/adr/0006-dvc-dagshub-versionamiento-datos.md)). Para autenticarte, configurá tu propio token de DagsHub en `.dvc/config.local` (nunca se commitea):

```bash
dvc remote modify origin --local auth basic
dvc remote modify origin --local user <tu-usuario-dagshub>
dvc remote modify origin --local password <tu-token-dagshub>
```
