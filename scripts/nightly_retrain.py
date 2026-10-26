#!/usr/bin/env python3
"""
Job nocturno de reentrenamiento con chequeo de cambios (Opción B, ver
docs/adr/0003-precalculo-nocturno-vs-tiempo-real.md).

En vez de reentrenar a ciegas cada noche, este script:

1. `git pull` para traer cualquier actualización del dataset (un nuevo
   puntero `.dvc`) que el equipo haya subido a DagsHub.
2. Compara el hash MD5 que guarda `data/vehicles/vehicles_clean.csv.dvc`
   contra el último hash con el que se reentrenó (`scripts/.last_dataset_hash`).
3. Si no cambió: no hace nada (log + exit 0) — evita reentrenar de más.
4. Si cambió (o es la primera corrida): `dvc pull` para traer los bytes
   reales del dataset nuevo, corre los 3 notebooks en orden (mismo patrón
   que el servicio "training" de docker-compose.yml) y actualiza el
   archivo de estado con el hash nuevo.

Uso manual:
    python3 scripts/nightly_retrain.py

Para automatizarlo con cron, agregar una línea a tu crontab (`crontab -e`)
para correr todas las noches a las 3:00 AM (ver ADR-0003):

    0 3 * * * cd /ruta/absoluta/al/repo && /usr/bin/python3 scripts/nightly_retrain.py >> scripts/nightly_retrain.log 2>&1

Nota honesta (ver ClickUp HU #15): este script cumple la lógica de
"solo reentrenar si hubo novedades reales", pero la línea de cron de
arriba solo corre si hay una máquina encendida con ese crontab activo.
Para la defensa, el script se muestra corriendo manualmente (dos veces
seguidas, para demostrar que la segunda no reentrena) en vez de afirmar
que hay un cron 24/7 en producción, que no es el caso todavía.
"""
from __future__ import annotations

import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DVC_POINTER = REPO_ROOT / "data" / "vehicles" / "vehicles_clean.csv.dvc"
STATE_FILE = Path(__file__).resolve().parent / ".last_dataset_hash"
NOTEBOOKS = [
    "notebooks/01_eda.ipynb",
    "notebooks/02_entrenamiento.ipynb",
    "notebooks/03_precalculo.ipynb",
]


def log(msg: str) -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def current_dataset_hash() -> str:
    """Lee el md5 del puntero DVC del dataset limpio.

    Se parsea con una regex simple en vez de agregar pyyaml como
    dependencia nueva: el formato de un .dvc de un solo archivo
    (outs: - md5: ...) es estable.
    """
    if not DVC_POINTER.exists():
        raise FileNotFoundError(f"No se encontró {DVC_POINTER}")
    text = DVC_POINTER.read_text()
    match = re.search(r"md5:\s*([0-9a-f]+)", text)
    if not match:
        raise ValueError(f"No se pudo leer el md5 de {DVC_POINTER}")
    return match.group(1)


def last_known_hash() -> str | None:
    if STATE_FILE.exists():
        content = STATE_FILE.read_text().strip()
        return content or None
    return None


def save_hash(h: str) -> None:
    STATE_FILE.write_text(h + "\n")


def run(cmd: list[str]) -> None:
    log(f"Ejecutando: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=REPO_ROOT, check=True)


def main() -> int:
    # 1. Traer cualquier actualización del puntero del dataset desde git.
    try:
        run(["git", "pull", "--ff-only"])
    except subprocess.CalledProcessError:
        log("Aviso: 'git pull' falló (sin red, o hay cambios locales). Se sigue con el .dvc local actual.")

    new_hash = current_dataset_hash()
    old_hash = last_known_hash()

    if old_hash == new_hash:
        log(f"Sin cambios en el dataset (hash={new_hash[:12]}...). No se reentrena.")
        return 0

    log(f"Dataset actualizado: {(old_hash[:12] + '...') if old_hash else '(ninguno, primera corrida)'} -> {new_hash[:12]}.... Reentrenando.")

    # 2. Traer los bytes reales del dataset nuevo.
    run(["dvc", "pull", "data/vehicles/vehicles_clean.csv.dvc"])

    # 3. Reentrenar: mismo patrón que docker-compose.yml (servicio "training").
    for nb in NOTEBOOKS:
        run(
            [
                sys.executable,
                "-m",
                "nbconvert",
                "--to",
                "notebook",
                "--execute",
                "--inplace",
                f"--ExecutePreprocessor.cwd={REPO_ROOT}",
                "--ExecutePreprocessor.timeout=600",
                nb,
            ]
        )

    save_hash(new_hash)
    log("Reentrenamiento completo. Estado actualizado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
