"""
Build the JSON files the web app loads.

Inputs (in scripts/source/):
  water_quality_2009_2012_long.csv  - values extracted from the LLDA AWQR 2009-2012 PDF
                                      (scripts/parse_awqr.py)
  stations.csv                      - station list with approximate coordinates
  laguna_lake_traced.geojson        - lake outline traced from the report map
                                      (scripts/trace_lake.py)

Outputs (in data/):
  stations.json        - parameter metadata + one object per station
  laguna-lake.geojson  - lake boundary polygon

Run:  python3 scripts/build_app_data.py
Needs: pandas, shapely
"""
import json
from pathlib import Path

import pandas as pd
from shapely.geometry import Point, shape
from shapely.ops import nearest_points

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "source"
OUT = ROOT / "data"

# Parameters shown in the app. Criteria are the DENR DAO 34 Class C values
# quoted in the LLDA report. "kind" decides how a value is judged.
PARAMS = [
    # key, report name, label, short, unit, kind, limit, note
    ("do", "Dissolved Oxygen", "Dissolved Oxygen", "DO", "mg/L", "min", 5.0,
     "Oxygen available to fish. Low values mean organic waste is being broken down."),
    ("bod", "Biochemical Oxygen Demand", "Biochemical Oxygen Demand", "BOD", "mg/L", "max", 7.0,
     "Organic pollution, mostly from household sewage."),
    ("cod", "Chemical Oxygen Demand", "Chemical Oxygen Demand", "COD", "mg/L", None, None,
     "Total oxidisable matter, including industrial waste. No Class C limit."),
    ("ph", "pH", "pH", "pH", "units", "range", [6.5, 8.5],
     "Acidity or alkalinity of the water."),
    ("temperature", "Temperature", "Temperature", "Temp", "°C", None, None,
     "Annual average water temperature."),
    ("turbidity", "Turbidity", "Turbidity", "Turbidity", "NTU", None, None,
     "Cloudiness from silt and suspended particles. No Class C limit."),
    ("nitrate", "Nitrate", "Nitrate", "NO₃", "mg/L", "max", 10.0,
     "Nutrient from fertiliser, sewage and livestock."),
    ("phosphate", "Inorganic Phosphate", "Inorganic Phosphate", "PO₄", "mg/L", "max", 0.05,
     "Nutrient that drives algal blooms."),
    ("ammonia", "Ammonia", "Ammonia", "NH₃", "mg/L", None, None,
     "Fresh sewage and animal waste indicator. No Class C limit."),
    ("tss", "Total Suspended Solids", "Total Suspended Solids", "TSS", "mg/L", None, None,
     "Solid particles carried in the water."),
    ("oil_grease", "Oil and Grease", "Oil and Grease", "O&G", "mg/L", "max", 2.0,
     "From kitchens, garages and industry."),
    ("chloride", "Chloride", "Chloride", "Cl", "mg/L", "max", 350.0,
     "Salt content; rises with saltwater backflow and wastewater."),
    ("total_coliform", "Total Coliform", "Total Coliform", "TC", "MPN/100 mL", "max", 5000.0,
     "Bacteria count. High values point to sewage."),
    ("fecal_coliform", "Fecal Coliform", "Fecal Coliform", "FC", "MPN/100 mL", None, None,
     "Bacteria from human or animal faeces. No Class C limit."),
]
COLIFORM = {"total_coliform", "fecal_coliform"}
IMPLAUSIBLE_COLIFORM = 1e9  # report prints some 2009 values like 1.4E+15; flag them
SHORE_OFFSET_DEG = 0.004    # ~400 m: how far onto land a moved station is placed

long = pd.read_csv(SRC / "water_quality_2009_2012_long.csv")
stations = pd.read_csv(SRC / "stations.csv")
lake_fc = json.load(open(SRC / "laguna_lake_traced.geojson"))
lake = shape(lake_fc["features"][0]["geometry"])

by_report_name = {p[1]: p for p in PARAMS}
long = long[long.parameter.isin(by_report_name)]

out_stations = []
for s in stations.to_dict("records"):
    lon, lat = s["lon"], s["lat"]
    moved = False
    # Station positions and the outline both carry ±1.5 km of error, so some
    # river-mouth stations land a few hundred metres inside the lake. Push
    # those just onto the shore so they read as rivers on the map.
    if s["type"] == "tributary" and lake.contains(Point(lon, lat)):
        edge = nearest_points(lake.exterior, Point(lon, lat))[0]
        dx, dy = edge.x - lon, edge.y - lat
        n = (dx * dx + dy * dy) ** 0.5 or 1
        lon, lat = edge.x + dx / n * SHORE_OFFSET_DEG, edge.y + dy / n * SHORE_OFFSET_DEG
        moved = True

    values, flags = {}, {}
    for r in long[long.station == s["station"]].to_dict("records"):
        key = by_report_name[r["parameter"]][0]
        y = str(int(r["year"]))
        if key in COLIFORM and r["value"] >= IMPLAUSIBLE_COLIFORM:
            flags.setdefault(key, {})[y] = r["value"]
            continue
        values.setdefault(key, {})[y] = r["value"]

    out_stations.append({
        "id": s["station"],
        "name": s["name"],
        "type": s["type"],
        "municipality": s["municipality"],
        "province": s["province_region"],
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "movedToShore": moved,
        "values": values,
        "flaggedValues": flags,
    })

meta = {
    "title": "Laguna de Bay water quality, 2009–2012",
    "source": "Laguna Lake Development Authority (LLDA), 2009 to 2012 Annual Water Quality "
              "Report on the Laguna de Bay and its Tributary Rivers",
    "valueType": "Annual averages (coliform: annual geometric means). Sampled once a month.",
    "standard": "DENR Administrative Order No. 34 (1990), Class C waters",
    "years": [2009, 2010, 2011, 2012],
    "coordinateNote": "Station positions are approximate (about ±1.5 km), georeferenced from "
                      "the station map in the report.",
    "parameters": [
        {"key": k, "label": lbl, "short": sh, "unit": u,
         "criterion": None if kind is None else {"kind": kind, "value": lim},
         "note": note}
        for k, _, lbl, sh, u, kind, lim, note in PARAMS
    ],
}

OUT.mkdir(exist_ok=True)
json.dump({"meta": meta, "stations": out_stations},
          open(OUT / "stations.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(lake_fc, open(OUT / "laguna-lake.geojson", "w", encoding="utf-8"), ensure_ascii=False)
print(f"{len(out_stations)} stations, {len(PARAMS)} parameters written to {OUT}")
