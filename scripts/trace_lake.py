"""
Trace the Laguna de Bay shoreline from the station map in the LLDA report
(page iii) and convert it to a GeoJSON polygon.

Why: the only freely downloadable outline (Natural Earth 1:10m) has 82 points
and no Talim Island. The LLDA map has the real shape, and tracing it keeps the
outline in the same frame as the station positions.

Steps
  1. Render page 4 of the PDF at 150 dpi:
       pdftoppm -r 150 -png -f 4 -l 4 AWQR_2009-2012.pdf map
  2. Keep the light-blue lake pixels, then fill in gaps where station dots
     and labels were drawn on the water.
  3. Take the outer contour plus the Talim Island hole.
  4. Convert pixels to lon/lat with an affine transform fitted on 7 river
     mouths whose real coordinates are known (error about ±1.5 km).
  5. Simplify (~65 m tolerance) and save.

Run:  python3 scripts/trace_lake.py map-004.png scripts/source/laguna_lake_traced.geojson
Needs: opencv-python-headless, numpy, shapely
"""
import json
import sys

import cv2
import numpy as np
from shapely.geometry import Polygon, mapping

# Pixel position (150 dpi render) -> real (lat, lon) of known river mouths.
CONTROL_POINTS = {
    "25 Manggahan Floodway, Taytay": ((399, 347), (14.538, 121.108)),
    "12 Molawin Creek, Los Baños": ((643, 1018), (14.178, 121.236)),
    "7 Biñan River": ((338, 708), (14.343, 121.090)),
    "18 Siniloan River": ((963, 621), (14.425, 121.448)),
    "16 Pagsanjan River, Lumban": ((1000, 824), (14.297, 121.462)),
    "4 Mangangate River, Alabang": ((270, 573), (14.415, 121.050)),
    "21 Pililla River": ((732, 489), (14.483, 121.300)),
}
MAP_FRAME = (slice(152, 1078), slice(152, 1126))  # rows, cols of the map border


def fit_affine():
    P = np.array([[x, y, 1] for (x, y), _ in CONTROL_POINTS.values()], float)
    lat = np.array([ll[0] for _, ll in CONTROL_POINTS.values()])
    lon = np.array([ll[1] for _, ll in CONTROL_POINTS.values()])
    a_lat, *_ = np.linalg.lstsq(P, lat, rcond=None)
    a_lon, *_ = np.linalg.lstsq(P, lon, rcond=None)
    return lambda pts: [(float(np.array([x, y, 1]) @ a_lon), float(np.array([x, y, 1]) @ a_lat)) for x, y in pts]


def lake_mask(img):
    rgb = img[:, :, ::-1].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    blue = (b > 220) & (r < 140) & (g > 150) & (g < 210)   # lake fill
    dark = (r < 110) & (g < 110) & (b < 110)               # label text
    red = (r > 170) & (g < 80) & (b < 80)                  # lake station dots
    yellow = (r > 200) & (g > 200) & (b < 120)             # river station dots

    frame = np.zeros(blue.shape, np.uint8)
    frame[MAP_FRAME] = 1

    # Open water = largest blue component.
    n, lab, stats, _ = cv2.connectedComponentsWithStats(blue.astype(np.uint8) & frame, 8)
    core = (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)

    # Text and dots drawn on the water count as water, but not the dark
    # outlines of river-station markers sitting on the shore.
    shore_markers = cv2.dilate(yellow.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
    fill = (dark | red) & ~shore_markers
    near_water = cv2.dilate(core, np.ones((25, 25), np.uint8)).astype(bool)
    lake = (core.astype(bool) | (fill & near_water)).astype(np.uint8) * 255
    lake = cv2.morphologyEx(lake, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))

    n, lab, stats, _ = cv2.connectedComponentsWithStats(lake, 8)
    return (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8) * 255


def main(png, out_path):
    img = cv2.imread(png)
    mask = lake_mask(img)
    contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    outer = max((i for i in range(len(contours)) if hier[0][i][3] == -1),
                key=lambda i: cv2.contourArea(contours[i]))
    holes = [i for i in range(len(contours))
             if hier[0][i][3] == outer and cv2.contourArea(contours[i]) > 2000]  # Talim Island

    to_lonlat = fit_affine()
    poly = Polygon(to_lonlat(contours[outer].reshape(-1, 2)),
                   [to_lonlat(contours[i].reshape(-1, 2)) for i in holes]).buffer(0)
    poly = poly.simplify(0.0006, preserve_topology=True)

    area_km2 = poly.area * 111.0 * 107.6  # rough at 14.4° N
    print(f"{len(poly.exterior.coords)} points, {len(holes)} island(s), ~{area_km2:.0f} km²")

    fc = {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "properties": {"name": "Laguna de Bay",
                       "source": "Traced from the LLDA AWQR 2009–2012 station map (approx. ±1.5 km)"},
        "geometry": mapping(poly),
    }]}
    json.dump(fc, open(out_path, "w"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
