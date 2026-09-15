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
import re
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
    """Convierte a número aunque la celda venga formateada como moneda
    (ej. "$1.234", "CLP 1.234,56") — Sheets entrega el valor ya
    formateado como texto cuando la celda tiene formato de moneda, no
    el número "crudo"."""
    if valor is None or valor == "":
        return 0
    if isinstance(valor, (int, float)):
        return tipo(valor)
    texto = re.sub(r"[^0-9,.\-]", "", str(valor))  # saca "$", "CLP", espacios, etc.
    if not texto:
        return 0
    if "," in texto:
        # coma = separador decimal, punto = separador de miles
        texto = texto.replace(".", "").replace(",", ".")
    else:
        # sin coma: los puntos se asumen separadores de miles (montos en
        # CLP no llevan decimales)
        texto = texto.replace(".", "")
    try:
        return tipo(texto)
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

    registros = ws.get_all_records(expected_headers=list(COLUMNAS.values()))

    filas = []
    omitidas = 0
    for r in registros:
        fecha = normalizar_fecha(r.get(COLUMNAS["fecha"]))
        marca = str(r.get(COLUMNAS["marca"]) or "").strip()
        if not fecha or not marca:
            omitidas += 1
            continue
        filas.append({
            "marca": marca,
            "fecha": fecha,
            "campaignName": str(r.get(COLUMNAS["campaignName"]) or "").strip(),
            "campaignId": str(r.get(COLUMNAS["campaignId"]) or "").strip(),
            "view": int(a_numero(r.get(COLUMNAS["view"]), int)),
            "click": int(a_numero(r.get(COLUMNAS["click"]), int)),
            "addToCart": int(a_numero(r.get(COLUMNAS["addToCart"]), int)),
            "purchase": int(a_numero(r.get(COLUMNAS["purchase"]), int)),
            "ingresos": a_numero(r.get(COLUMNAS["ingresos"]), float),
        })

    filas.sort(key=lambda f: (f["fecha"], f["marca"], f["campaignName"]))

    salida = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rows": filas,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH) or ".", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)

    print(f"OK: {len(filas)} filas escritas en {OUTPUT_PATH} ({omitidas} filas omitidas por falta de marca/fecha).")


if __name__ == "__main__":
    main()
