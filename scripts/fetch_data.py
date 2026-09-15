#!/usr/bin/env python3
"""
Descarga la hoja "GA4 Consolidado" de Google Sheets y la deja como
data/latest.json, en el formato que consume el dashboard (app.js).

Pensado para correr dentro de GitHub Actions (ver
.github/workflows/update-data.yml), pero también se puede correr en
local para probar, si tienes las variables de entorno seteadas:

    export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
    export SPREADSHEET_ID="1AbC...XYZ"
    python3 scripts/fetch_data.py

Requiere que la hoja de cálculo esté compartida (al menos como
"Lector") con el email de la cuenta de servicio (termina en
"...@...iam.gserviceaccount.com", se encuentra dentro del JSON de la
cuenta de servicio, en el campo "client_email").
"""

import json
import os
import sys
from datetime import datetime, timezone

import gspread
from google.oauth2.service_account import Credentials

SHEET_NAME = os.environ.get("SHEET_NAME", "GA4 Consolidado")
OUTPUT_PATH = os.environ.get("OUTPUT_PATH", "data/latest.json")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

# Nombres de columna esperados en la hoja (deben calzar EXACTO con el
# encabezado que escribe Codigo.gs — ENCABEZADOS).
COLUMNAS = {
    "marca": "Marca",
    "fecha": "Fecha",
    "campaignName": "emarsys_campaign_name",
    "campaignId": "emarsys_campaign_id",
    "view": "View",
    "click": "Click",
    "addToCart": "Add to cart",
    "purchase": "Purchase",
    "ingresos": "Total de ingresos",
}

# Columnas numéricas: se leen SIN formato (value_render_option
# UNFORMATTED_VALUE), o sea el número real de la celda, tal cual lo usa
# Sheets internamente — así da lo mismo si la celda está formateada como
# moneda con "$1.234", "$1,234", "1.234,00", etc. Se evita por completo
# tener que adivinar qué separador usa cada planilla.
COLUMNAS_NUMERICAS = {"view", "click", "addToCart", "purchase", "ingresos"}


def cargar_credenciales():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        sys.exit(
            "Falta la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON "
            "(el JSON completo de la cuenta de servicio)."
        )
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as e:
        sys.exit(f"GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido: {e}")
    return Credentials.from_service_account_info(info, scopes=SCOPES)


def a_numero(valor, tipo=float):
    """Último resorte por si un valor "sin formato" igual llega como
    texto (celda con apóstrofe/texto forzado, etc). Para columnas
    numéricas normales esto ni se usa: UNFORMATTED_VALUE ya entrega el
    número real."""
    if valor is None or valor == "":
        return 0
    if isinstance(valor, (int, float)):
        return tipo(valor)
    try:
        return tipo(str(valor).strip())
    except (ValueError, TypeError):
        return 0


def normalizar_fecha(valor):
    """La columna Fecha en la hoja está formateada como yyyy-mm-dd
    (ver setNumberFormat en Codigo.gs). Si por algún motivo llega en
    otro formato reconocible, se intenta convertir; si no, se deja tal
    cual para no perder la fila silenciosamente."""
    if not valor:
        return None
    valor = str(valor).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(valor, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return valor


def pad(fila, largo):
    """Sheets recorta las celdas vacías del final de cada fila — se
    rellenan con '' para que todas las filas tengan el mismo largo que
    el encabezado y así indexar por columna sea seguro."""
    if len(fila) >= largo:
        return fila
    return fila + [""] * (largo - len(fila))


def main():
    spreadsheet_id = os.environ.get("SPREADSHEET_ID")
    if not spreadsheet_id:
        sys.exit("Falta la variable de entorno SPREADSHEET_ID.")

    creds = cargar_credenciales()
    gc = gspread.authorize(creds)

    try:
        sh = gc.open_by_key(spreadsheet_id)
    except gspread.exceptions.APIError as e:
        sys.exit(f"No se pudo abrir la planilla (revisa SPREADSHEET_ID y que esté compartida con la cuenta de servicio): {e}")

    try:
        ws = sh.worksheet(SHEET_NAME)
    except gspread.exceptions.WorksheetNotFound:
        sys.exit(f"No existe una pestaña llamada '{SHEET_NAME}' en la planilla.")

    encabezado = ws.row_values(1)
    faltantes = [h for h in COLUMNAS.values() if h not in encabezado]
    if faltantes:
        sys.exit(
            "La hoja no tiene estas columnas (revisa tildes/mayúsculas/espacios "
            f"exactos en el encabezado): {faltantes}. Encabezado real: {encabezado}"
        )
    idx = {clave: encabezado.index(nombre) for clave, nombre in COLUMNAS.items()}
    ncols = len(encabezado)

    # grilla "formateada" (como se ve en pantalla) — se usa para texto y fecha
    grilla_fmt = ws.get_values()
    # grilla "cruda" (el número real, sin formato de moneda/miles) — para numéricas
    grilla_raw = ws.get_values(value_render_option="UNFORMATTED_VALUE")

    filas = []
    omitidas = 0
    total_filas_datos = max(len(grilla_fmt), len(grilla_raw)) - 1  # -1 por el encabezado
    for i in range(1, total_filas_datos + 1):
        f = pad(grilla_fmt[i] if i < len(grilla_fmt) else [], ncols)
        r = pad(grilla_raw[i] if i < len(grilla_raw) else [], ncols)

        fecha = normalizar_fecha(f[idx["fecha"]])
        marca = str(f[idx["marca"]] or "").strip()
        if not fecha or not marca:
            omitidas += 1
            continue

        filas.append({
            "marca": marca,
            "fecha": fecha,
            "campaignName": str(f[idx["campaignName"]] or "").strip(),
            "campaignId": str(f[idx["campaignId"]] or "").strip(),
            "view": int(a_numero(r[idx["view"]], int)),
            "click": int(a_numero(r[idx["click"]], int)),
            "addToCart": int(a_numero(r[idx["addToCart"]], int)),
            "purchase": int(a_numero(r[idx["purchase"]], int)),
            "ingresos": a_numero(r[idx["ingresos"]], float),
        })

    filas.sort(key=lambda f: (f["fecha"], f["marca"], f["campaignName"]))

    salida = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rows": filas,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH) or ".", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)

    campanas_unicas = {(f["marca"], f["campaignName"]) for f in filas}
    suma_ingresos = sum(f["ingresos"] for f in filas)
    print(f"DEBUG campañas únicas (marca+nombre) que calcula el script: {len(campanas_unicas)}")
    print(f"DEBUG suma total de ingresos que calcula el script: {suma_ingresos}")

    print(f"OK: {len(filas)} filas escritas en {OUTPUT_PATH} ({omitidas} filas omitidas por falta de marca/fecha).")


if __name__ == "__main__":
    main()
