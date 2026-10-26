"""
Evalúa el componente de visión (Gemini vía POST /identificar) contra el golden set (R21).

    docker compose up -d api
    docker compose --profile tools run --rm test-ml python tests/golden_set/evaluar_golden_set.py

Por defecto apunta a http://host.docker.internal:3000 (el API desde dentro del
contenedor); se cambia con API_URL. Escribe docs/evidence/golden-set-vision.md y
tests/golden_set/resultados.json.

"Acierto" se mide con la misma normalización que usa el backend para buscar el precio
(normalizar_modelo / model_base, ADR-0010): un acierto de marca+modelo significa que la
tasación habría encontrado la fila correcta de precalc.db.
"""
import csv
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))
from src.model.features import normalizar_modelo  # noqa: E402

DIR = Path(__file__).resolve().parent
API = os.getenv("API_URL", "http://host.docker.internal:3000").rstrip("/")
PAUSA_S = float(os.getenv("PAUSA_S", "6.5"))  # el API limita /identificar a 10 req/min por IP
UMBRAL = float(os.getenv("UMBRAL_CONFIANZA", "0.6"))
ALIAS_MARCA = {"chevy": "chevrolet", "vw": "volkswagen", "mercedes": "mercedes-benz"}


def identificar(foto: Path):
    limite = f"----valorauto{uuid.uuid4().hex}"
    cuerpo = (
        f"--{limite}\r\nContent-Disposition: form-data; name=\"imagen\"; filename=\"{foto.name}\"\r\n"
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode() + foto.read_bytes() + f"\r\n--{limite}--\r\n".encode()
    req = urllib.request.Request(
        f"{API}/identificar", data=cuerpo, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={limite}"},
    )
    inicio = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            codigo, datos = r.status, json.load(r)
    except urllib.error.HTTPError as e:
        codigo, datos = e.code, json.loads(e.read() or b"{}")
    return codigo, datos, round(time.perf_counter() - inicio, 2)


def marca_norm(m):
    m = (m or "").strip().lower()
    return ALIAS_MARCA.get(m, m)


def evaluar():
    filas = list(csv.DictReader((DIR / "golden_set.csv").open(encoding="utf-8")))
    resultados = []
    for i, f in enumerate(filas):
        if i:
            time.sleep(PAUSA_S)
        codigo, datos, seg = identificar(DIR / "fotos" / f["archivo"])
        if codigo == 429:  # límite de tasa: esperar la ventana y reintentar una vez
            time.sleep(61)
            codigo, datos, seg = identificar(DIR / "fotos" / f["archivo"])
        r = {"archivo": f["archivo"], "esperado": f"{f['marca']} {f['modelo']} {f['anio']}", "http": codigo, "segundos": seg}
        if codigo == 200:
            marca_ok = marca_norm(datos["marca"]) == f["marca"]
            modelo_ok = normalizar_modelo(datos["modelo"], datos["marca"]) == f["modelo"]
            dif = abs(int(datos["anio"]) - int(f["anio"]))
            r.update(
                obtenido=f"{datos['marca']} {datos['modelo']} {datos['anio']}", confianza=datos["confianza"],
                marca_ok=marca_ok, modelo_ok=marca_ok and modelo_ok, anio_dif=dif,
                clave_ok=marca_ok and modelo_ok and dif <= 1,
            )
        else:
            r["error"] = datos.get("error")
        resultados.append(r)
        print(f"{r['archivo']:36s} HTTP {codigo} {r.get('obtenido', r.get('error', ''))!s:32s} {seg}s")
    return resultados


def pct(n, d):
    return f"{(100 * n / d):.1f} %" if d else "—"


def resumen(res):
    n = len(res)
    ok = [r for r in res if r["http"] == 200]
    lat = sorted(r["segundos"] for r in ok)
    conf_bien = [r["confianza"] for r in ok if r["clave_ok"]]
    conf_mal = [r["confianza"] for r in ok if not r["clave_ok"]]
    return {
        "fecha": date.today().isoformat(),
        "api": API,
        "n": n,
        "http_200": len(ok),
        "http_422": sum(r["http"] == 422 for r in res),
        "http_503": sum(r["http"] == 503 for r in res),
        "otros_errores": sum(r["http"] not in (200, 422, 503) for r in res),
        "marca": sum(r["marca_ok"] for r in ok),
        "marca_modelo": sum(r["modelo_ok"] for r in ok),
        "anio_exacto": sum(r["modelo_ok"] and r["anio_dif"] == 0 for r in ok),
        "anio_pm1": sum(r["modelo_ok"] and r["anio_dif"] <= 1 for r in ok),
        "anio_pm2": sum(r["modelo_ok"] and r["anio_dif"] <= 2 for r in ok),
        "clave_completa": sum(r["clave_ok"] for r in ok),
        "confianza_media_aciertos": round(statistics.mean(conf_bien), 3) if conf_bien else None,
        "confianza_media_fallos": round(statistics.mean(conf_mal), 3) if conf_mal else None,
        "fallos_con_confianza_sobre_umbral": sum(1 for c in conf_mal if c >= UMBRAL),
        "latencia_p50_s": round(statistics.median(lat), 2) if lat else None,
        "latencia_p95_s": lat[min(len(lat) - 1, int(0.95 * len(lat)))] if lat else None,
    }


def escribir_reporte(res, s):
    n = s["n"]
    lineas = [
        "# Evaluación del componente de visión — golden set",
        "",
        f"**Fecha:** {s['fecha']} · **Endpoint:** `POST /identificar` (Gemini con modelo de respaldo, imagen optimizada a 800 px) · "
        f"**Golden set:** {n} fotos de Wikimedia Commons con licencia libre, una por cada uno de los modelos más publicados del "
        "dataset, etiquetadas por el año-modelo del título y revisadas a ojo "
        "([`tests/golden_set/golden_set.csv`](../../tests/golden_set/golden_set.csv)). Responde al riesgo R21.",
        "",
        "Reproducir: `docker compose --profile tools run --rm test-ml python tests/golden_set/evaluar_golden_set.py`",
        "",
        "## Métricas",
        "",
        "| Métrica | Resultado | Qué significa |",
        "|---|---|---|",
        f"| Respuestas 200 | {s['http_200']}/{n} ({pct(s['http_200'], n)}) | Gemini respondió con un vehículo sobre el umbral de confianza |",
        f"| 422 (no identificado) | {s['http_422']}/{n} | Confianza < {UMBRAL} o respuesta fuera de esquema |",
        f"| 503 (Gemini no disponible) | {s['http_503']}/{n} | Saturación aun con el modelo de respaldo |",
        f"| **Marca correcta** | {s['marca']}/{n} ({pct(s['marca'], n)}) | |",
        f"| **Marca + modelo correctos** | {s['marca_modelo']}/{n} ({pct(s['marca_modelo'], n)}) | Con la misma normalización que la búsqueda de precio (`model_base`) |",
        f"| Año exacto (con marca+modelo ok) | {s['anio_exacto']}/{n} ({pct(s['anio_exacto'], n)}) | |",
        f"| Año ±1 | {s['anio_pm1']}/{n} ({pct(s['anio_pm1'], n)}) | Misma generación en casi todos los casos |",
        f"| Año ±2 | {s['anio_pm2']}/{n} ({pct(s['anio_pm2'], n)}) | |",
        f"| **Clave de tasación correcta** (marca + modelo + año ±1) | {s['clave_completa']}/{n} ({pct(s['clave_completa'], n)}) | El precio habría salido de la fila correcta sin que el usuario corrija nada |",
        f"| Confianza media en aciertos / fallos | {s['confianza_media_aciertos']} / {s['confianza_media_fallos']} | ¿La confianza separa aciertos de errores? |",
        f"| Fallos con confianza ≥ {UMBRAL} | {s['fallos_con_confianza_sobre_umbral']} | Errores que el umbral no detiene: por eso el formulario es editable |",
        f"| Latencia p50 / p95 | {s['latencia_p50_s']} s / {s['latencia_p95_s']} s | Solo respuestas 200, red local |",
        "",
        "## Resultado por foto",
        "",
        "| Foto | Esperado | Obtenido | Conf. | Δ año | Clave ok | s |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in res:
        if r["http"] == 200:
            lineas.append(
                f"| `{r['archivo']}` | {r['esperado']} | {r['obtenido']} | {r['confianza']} | {r['anio_dif']} | "
                f"{'✅' if r['clave_ok'] else '❌'} | {r['segundos']} |"
            )
        else:
            lineas.append(f"| `{r['archivo']}` | {r['esperado']} | HTTP {r['http']} `{r.get('error')}` | — | — | ❌ | {r['segundos']} |")
    lineas += [
        "",
        "## Limitaciones de esta evaluación",
        "",
        f"- {n} fotos, una por modelo: sirve como referencia y para detectar regresiones, no para estimar la exactitud con precisión estadística.",
        "- Son fotos de Commons, en general bien encuadradas y del mercado de EE. UU./Europa/Asia; fotos de celular en Bolivia (ángulos, luz, modelos locales) pueden rendir peor (R2).",
        "- Gemini no es determinista: los números pueden variar algunos puntos entre corridas.",
        "- Solo evalúa la identificación por foto. La revisión de fallas (`/revision`) se controla con validación de esquema y filtro de precios (`src/api/test/seguridad.test.js`), sin métrica de calidad del contenido.",
    ]
    destino = RAIZ / "docs" / "evidence" / "golden-set-vision.md"
    destino.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    return destino


if __name__ == "__main__":
    res = evaluar()
    s = resumen(res)
    (DIR / "resultados.json").write_text(json.dumps({"resumen": s, "resultados": res}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(s, indent=2, ensure_ascii=False))
    print("Reporte:", escribir_reporte(res, s))
