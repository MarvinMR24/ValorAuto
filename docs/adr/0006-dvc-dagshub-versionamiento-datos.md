# ADR-0006 — DVC + DagsHub para versionamiento del dataset

**Estado:** Aceptada
**Fecha:** Sprint 1 (`8610a75 Track dataset with DVC`, rama `Leo`)
**Relacionado:** `.dvc/config`, `data/vehicles/vehicles_clean.csv.dvc`, `data/README.md`

## Contexto

El dataset limpio (`vehicles_clean.csv`, ~348 MB) es demasiado pesado para versionar directamente en git, y el equipo necesita poder reproducir exactamente qué versión del dataset se usó para entrenar cada modelo (trazabilidad Datos → Modelo → Métrica).

## Decisión

El dataset se versiona con **DVC**. Git guarda solo el puntero (`.dvc`, con el hash del archivo); el archivo real se sincroniza con `dvc pull` / `dvc push` contra un remoto en DagsHub.

**Actualización 2026-09-17 — cambio de remoto:** el remoto original (`https://dagshub.com/LEONGO037/ValorAuto`) pertenece a Leonardo y nunca se le dio acceso de push al resto del equipo — no era solo un tema de repo privado, era una restricción de permisos real: cualquier `dvc push` del equipo fallaba con error de autenticación. Por eso ningún cambio de datos llegó nunca a ese remoto durante todo el desarrollo. Se migró a un remoto nuevo bajo cuenta propia, `https://dagshub.com/SNARF3/ValorAutoData`, al que el equipo sí tiene push inmediato. `.dvc/config` ya apunta ahí; las credenciales se configuran en `.dvc/config.local` (nunca se commitea, gitignorado automáticamente por DVC) vía `dvc remote modify origin --local auth basic/user/password`.

## Alternativas consideradas

- **Links a Google Drive en un archivo `.md`** (`data/raw/linkRaw.md`, `data/processed/linkProcessed.md`): es el enfoque que se usó primero, antes de introducir DVC. Se descarta como solución definitiva porque no es reproducible desde el repositorio (depende de que el link personal de Drive siga vivo y sea accesible), no versiona distintas iteraciones del mismo archivo, y no dice qué versión del dataset corresponde a qué modelo entrenado. Queda documentado como deuda pendiente: `data/raw/` y `data/processed/` todavía no están migrados a DVC (ver "Pendiente" en `data/README.md`).
- **Git LFS:** alternativa técnicamente válida para versionar archivos grandes en git, pero se descartó porque no viene con un backend de almacenamiento gratuito propio tan directo como DagsHub para este caso, y DVC además da comandos de pipeline (`dvc pull`/`dvc push`) que el equipo ya conocía.

## Consecuencias

- **Resuelto (2026-09-17):** el problema de acceso (ver riesgo R1) se resolvió migrando de remoto en vez de esperar a que Leonardo diera acceso — el equipo ahora tiene push directo a `SNARF3/ValorAutoData`. El repo viejo (`LEONGO037/ValorAuto`) queda como fue: no se le pidió a Leonardo hacerlo público ni generar tokens, se evitó esa dependencia por completo.
- Se corrigió `.dvc/config`: el remoto `origin` no estaba marcado como remoto por defecto (`dvc remote default origin`), lo que hacía que `dvc pull` fallara con "No remote provided and no default remote set" incluso teniendo el remoto configurado.
- `data/raw/` y `data/processed/` siguen en Google Drive por ahora (deuda técnica registrada, no bloquea el MVP porque el dataset limpio final sí está en DVC).
