"""
Construye el golden set de visión (R21): una foto con licencia libre de Wikimedia Commons
por cada uno de los 30 modelos más publicados del dataset, etiquetada con marca, modelo
y año a partir del título del archivo.

    python3 tests/golden_set/construir_golden_set.py

Escribe tests/golden_set/fotos/*.jpg (800 px, el tamaño al que el API reduce la foto antes de Gemini) y tests/golden_set/golden_set.csv
(etiqueta + fuente + autor + licencia). Solo usa la biblioteca estándar.
Las etiquetas salen del título que puso el autor en Commons: conviene revisarlas a ojo
(columna `revisada`).
"""
import csv
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

DIR = Path(__file__).resolve().parent
FOTOS = DIR / "fotos"
CSV = DIR / "golden_set.csv"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "ValorAuto-golden-set/1.0 (proyecto academico UCB; contacto: equipo ValorAuto)"}
LICENCIAS_OK = re.compile(r"^(CC BY(-SA)? [0-9.]+|CC0|Public domain)", re.I)

# (marca, model_base del dataset, texto de búsqueda en Commons, años preferidos)
OBJETIVOS = [
    ("ford", "f-150", "Ford F-150", range(2003, 2021)),
    ("chevrolet", "silverado", "Chevrolet Silverado", range(2003, 2021)),
    ("jeep", "wrangler", "Jeep Wrangler", range(2003, 2021)),
    ("ram", "1500", "Ram 1500", range(2003, 2021)),
    ("gmc", "sierra", "GMC Sierra", range(2003, 2021)),
    ("honda", "accord", "Honda Accord", range(2003, 2021)),
    ("toyota", "camry", "Toyota Camry", range(2003, 2021)),
    ("honda", "civic", "Honda Civic", range(2003, 2021)),
    ("jeep", "grand cherokee", "Jeep Grand Cherokee", range(2003, 2021)),
    ("nissan", "altima", "Nissan Altima", range(2003, 2021)),
    ("toyota", "tacoma", "Toyota Tacoma", range(2003, 2021)),
    ("toyota", "corolla", "Toyota Corolla", range(2003, 2021)),
    ("ford", "explorer", "Ford Explorer", range(2003, 2021)),
    ("ford", "mustang", "Ford Mustang", range(2003, 2021)),
    ("ford", "escape", "Ford Escape", range(2003, 2021)),
    ("ford", "fusion", "Ford Fusion", range(2003, 2021)),
    ("toyota", "tundra", "Toyota Tundra", range(2003, 2021)),
    ("honda", "cr-v", "Honda CR-V", range(2003, 2021)),
    ("hyundai", "sonata", "Hyundai Sonata", range(2003, 2021)),
    ("chevrolet", "cruze", "Chevrolet Cruze", range(2003, 2021)),
    ("ford", "focus", "Ford Focus", range(2003, 2021)),
    ("chevrolet", "malibu", "Chevrolet Malibu", range(2003, 2021)),
    ("chevrolet", "corvette", "Chevrolet Corvette", range(2003, 2021)),
    ("volkswagen", "jetta", "Volkswagen Jetta", range(2003, 2021)),
    ("honda", "odyssey", "Honda Odyssey", range(2003, 2021)),
    ("chevrolet", "impala", "Chevrolet Impala", range(2003, 2021)),
    ("toyota", "4runner", "Toyota 4Runner", range(2003, 2021)),
    ("dodge", "grand caravan", "Dodge Grand Caravan", range(2003, 2021)),
    ("subaru", "outback", "Subaru Outback", range(2003, 2021)),
    ("chevrolet", "tahoe", "Chevrolet Tahoe", range(2003, 2021)),
]


def api(**params):
    params.update(format="json")
    req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}", headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def limpiar(texto):
    return html.unescape(re.sub(r"<[^>]+>", "", texto or "")).strip()


def buscar(busqueda, anios):
    """Devuelve el primer archivo JPEG con licencia libre cuyo título trae un año preferido."""
    datos = api(
        action="query", generator="search", gsrnamespace=6, gsrlimit=50,
        gsrsearch=f'intitle:"{busqueda}" filetype:bitmap',
        gsrsort="relevance",
        prop="imageinfo", iiprop="url|mime|extmetadata|size", iiurlwidth=800,
    )
    candidatos = []
    for pagina in datos.get("query", {}).get("pages", {}).values():
        titulo = pagina["title"]
        info = pagina.get("imageinfo", [{}])[0]
        meta = info.get("extmetadata", {})
        licencia = limpiar(meta.get("LicenseShortName", {}).get("value"))
        # El año-modelo va al inicio del título ("2015 Toyota Corolla …"); un año suelto
        # suele ser la fecha de la foto (ej. "Honda Accord VII China 2016-04-11").
        anio = re.match(rf"File:((?:19|20)\d\d) {re.escape(busqueda)}\b", titulo, re.I)
        if (
            info.get("mime") == "image/jpeg"
            and LICENCIAS_OK.match(licencia)
            and anio and int(anio.group(1)) in anios
            and info.get("width", 0) >= 800
            and not re.search(
                r"interior|engine|motor|dashboard|screen|badge|logo|wheel|tail|rear|crash|wreck|"
                r"&| and |classic|concept|police|taxi|race|rally|modified|custom",
                titulo, re.I)
        ):
            frente = 0 if re.search(r"front|frontansicht|\bfl\b|3/4", titulo, re.I) else 1
            candidatos.append((frente, int(anio.group(1)), titulo, info, licencia, limpiar(meta.get("Artist", {}).get("value"))))
    candidatos.sort(key=lambda c: (c[0], -c[1]))
    return candidatos[0] if candidatos else None


def main():
    FOTOS.mkdir(parents=True, exist_ok=True)
    filas = []
    for marca, modelo, busqueda, anios in OBJETIVOS:
        hallado = buscar(busqueda, anios)
        if not hallado:
            print(f"SIN FOTO: {busqueda}")
            continue
        _, anio, titulo, info, licencia, autor = hallado
        archivo = f"{marca}_{modelo.replace(' ', '-')}_{anio}.jpg"
        req = urllib.request.Request(info["thumburl"], headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            (FOTOS / archivo).write_bytes(r.read())
        filas.append({
            "archivo": archivo, "marca": marca, "modelo": modelo, "anio": anio,
            "titulo_commons": titulo, "url": info["descriptionurl"], "autor": autor[:80],
            "licencia": licencia, "revisada": "no",
        })
        print(f"{archivo:40s} {licencia:14s} {titulo[:70]}")
        time.sleep(1)
    with CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(filas)
    print(f"\n{len(filas)} fotos → {CSV}")


if __name__ == "__main__":
    main()
