# Laguna de Bay Water Quality Map

An interactive web map of the Laguna Lake Development Authority (LLDA) water quality monitoring stations in Laguna de Bay and the rivers that flow into it. It covers 53 stations, 9 parameters and 12 consecutive months, July 2025 to June 2026.

WITM 101 Advanced Web Design and Programming, final examination.

---

## 1. What the app does

| Exam requirement | How it is met |
|---|---|
| Show the Laguna Lake boundary | Real base maps (OpenStreetMap street map and Esri satellite imagery) show the actual shoreline, Talim Island and surrounding towns. An overlay draws the lake boundary itself on top: OpenStreetMap relation 79348 as GeoJSON, 29 rings counting the islands. |
| Show monitoring stations around the lake | 16 lake stations (black ring) and 37 river stations (thin outline), placed by georeferencing the station map printed in each report. The selected station is ringed and pulses, orange in the lake and blue on the rivers. |
| Zoom, pan and click on markers | Leaflet zoom and pan, a scale bar, and a switcher for Street map, Satellite (with place names) and Light. Clicking a marker opens a popup and the station panel. |
| At least 4–6 water quality parameters per station | 9 parameters: DO, BOD, pH, nitrate, phosphate, ammonia, TSS, chloride and fecal coliform. |
| Visualise the data with charts and map layers | Markers are coloured by the selected parameter and month, with a legend. The **Ranking** view lists every station from worst to best, with bars and the Class C limit marked. The **Station** view has a 12-month trend chart (Chart.js) compared with the average of similar stations, plus a table of all parameters showing pass or fail. |
| JSON data handling | The app loads `data/stations.json` and `data/laguna-lake.geojson` with `fetch()`, then filters, sorts and classifies them in the browser. |
| Responsive and accessible interface | Two columns on desktop, stacked on phones with a collapsible legend. Every map action can also be done from the keyboard: the month and station dropdowns, the ranking buttons and tabs that support the arrow keys. Escape clears a selection. Labels are announced to screen readers, focus outlines are visible, and colours come from ColorBrewer. Pass/fail is shown as text, not only by colour. |
| Environmental monitoring awareness | Each value is judged against the DENR Class C criteria LLDA uses. An "About the data" dialog explains the source, the standard and the limitations. |

The current view is stored in the URL, so a link can be shared or bookmarked. For example, `#param=bod&month=2026-01&station=2` opens BOD for January 2026 with Bagumbayan River selected.

---

## 2. Run it locally

The browser blocks `fetch()` from files opened directly (`file://`), so the app has to be served over HTTP:

```bash
cd laguna-lake-wq-map
npx serve          # or: python3 -m http.server 8000
```

Any static server works, including the VS Code Live Server extension. No build step or API key is needed: Leaflet and Chart.js are included in `vendor/`, and the map tiles are free services that need no account.

## 3. Deploy to Vercel

This is a plain static site, so Vercel needs no configuration.

**Option A: from GitHub**
1. Push this folder to a GitHub repository.
2. On vercel.com, choose **Add New → Project** and import the repository.
3. Framework preset: **Other**. Leave the build command empty and set the output directory to the project root.
4. Click **Deploy**.

**Option B: from the command line**
```bash
npm i -g vercel
cd laguna-lake-wq-map
vercel        # first run asks a few questions; accept the defaults
vercel --prod
```

---

## 4. Project structure

```
laguna-lake-wq-map/
├── index.html              Page structure, controls, panels, About dialog
├── css/styles.css          All styling; responsive breakpoints at 900, 760 and 420 px
├── js/
│   ├── main.js             Entry point: loads data, builds controls, links everything together
│   ├── state.js            Small shared store (publish/subscribe) and URL hash sync
│   ├── data.js             Loads the JSON files; value, month and label helpers
│   ├── scale.js            Colour classes, number formatting, Class C pass/fail
│   ├── map.js              Leaflet map: base maps, markers, popups, legend, outline, selection pulse
│   └── panel.js            Ranking list, station trend chart (Chart.js) and table
├── data/
│   ├── stations.json       53 stations with values per parameter and month, plus metadata
│   └── laguna-lake.geojson Lake shoreline and islands, from OpenStreetMap
├── vendor/                 Leaflet 1.9.4 and Chart.js 4.6.1 (with their licences)
└── scripts/                Scripts that produced the data (not used by the site)
    ├── fetch_lake.mjs           Fetches the real shoreline from OpenStreetMap
    ├── fit_station_map.mjs      Georeferences a report's station map against that shoreline
    ├── find_station_dots.mjs    Finds the station dots on that map
    ├── build_quarterly_data.mjs Writes data/stations.json from the transcribed tables
    ├── parse_awqr.py            2009–2012 pipeline: extracts tables from the annual PDF
    ├── trace_lake.py            2009–2012 pipeline: traces the lake from the report map
    ├── build_app_data.py        2009–2012 pipeline: wrote the previous stations.json
    └── source/quarterly/        Transcribed CSVs, station names, coordinates, georeference
```

The three `.py` scripts belong to the previous version of this project, which used the 2009–2012 annual report. They are kept because they document how that data was made, but the site no longer uses what they produce.

## 5. How the code works

**State-driven rendering.** `state.js` holds one object: the selected parameter, month, filters, selected station and tab. Every control calls `setState()`. One `render()` function in `main.js` subscribes to changes and redraws the map, ranking and station panel from that state. This keeps the map, the list and the charts in agreement, because none of them stores its own copy of the selection.

```
user action ──► setState() ──► render() ──► map.update()
                                         ├─► renderRanking()
                                         ├─► renderStation()
                                         └─► writeHash()  (URL)
```

**Colour classes** (`scale.js`). For each parameter, values from all twelve months are split into five quantile classes, so a colour means the same thing when the month changes. Coliform counts range from under a thousand to nearly 50 million, so they use a log scale. Dissolved oxygen uses a reversed palette, because low oxygen is bad. pH uses a neutral blue palette, because higher is not simply worse.

**Pass/fail** (`judge()` in `scale.js`) uses the Class C criteria: a maximum (BOD ≤ 7 mg/L), a minimum (DO ≥ 5 mg/L) or a range (pH 6.5–8.5). Parameters without a Class C limit show "No limit" and are not marked as failing.

**Ranking** sorts stations from worst to best. Worst means the highest value, or the lowest for DO, or the furthest from neutral for pH. Stations not sampled that month are listed separately instead of being dropped.

**Below the detection limit.** 273 readings are printed in the reports as `<0.1` or `<0.002`. A chart needs a number, so the charts use the limit itself, which is the honest upper bound and judges conservatively in both directions: DO `<0.1` fails the 5 mg/L minimum, phosphate `<0.01` meets the 0.05 maximum. The station table shows what the report actually printed.

**Map** (`map.js`). Leaflet draws the base maps from free tile services (OpenStreetMap, Esri, CARTO), so no API key or billing account is needed. Each station is a Leaflet `circleMarker`, restyled on each update instead of being recreated. Station numbers appear at zoom 11 and above to reduce clutter. If map tiles fail to load (for example, offline), a status message appears while the stations, ranking and charts keep working.

## 6. Data and how it was prepared

**Source:** LLDA Environmental Laboratory and Research Division, *Quarterly Water Quality Report on Laguna Lake and Tributary Rivers* — four reports covering July 2025 to June 2026. Values are monthly; fecal coliform is that month's geometric mean.

These reports are scans. Unlike the 2009–2012 annual report, which had a text layer that could be parsed, every page here is a JPEG with no machine-readable text at all. So the pipeline is different:

1. **Extract the pages.** The page images are pulled straight out of each PDF, by walking the page tree rather than taking images in file order, which mislabels them. Some are a bare JPEG stream, some are zlib-wrapped with a non-standard window size, and a few prose pages are 1-bit CCITT fax.
2. **Straighten each table.** Every scan is skewed, from −0.25° to −1.75°. The angle is found by rotating until the dark pixels pile into the sharpest rows. This matters: at 90° instead of 88.6°, the station labels on one table drift about half a row against their own values by the right-hand edge.
3. **Transcribe.** The eight table pages were read by eye into CSVs, 4,275 values. A small expander turns a table written the way it is read — one line per station, three months grouped per parameter — into long-format CSV, refusing anything with the wrong number of groups or months.
4. **Place the stations** (`fit_station_map.mjs`, `find_station_dots.mjs`). Each report opens with a labelled plan of the watershed. The lake it draws is isolated by colour and matched against the OpenStreetMap polygon by searching scale and offset for maximum overlap: IoU 0.9662, about 43 m per pixel. Station dots are found by colour and shape — the printed labels use the same two colours as the dots, so a dot is distinguished by being round and solidly filled. Labels were read off the map.
5. **Build the app data** (`build_quarterly_data.mjs`). Attaches the Class C criteria and descriptions, keeps below-detection-limit readings as text alongside their numeric bound, and refuses to build if a station has values but no coordinates, or a name that does not match.

**Checking a hand-read table.** The gaps are the check. Every count the transcription produced is explained by something the reports say in words: river parameters come to 107 values each while fecal coliform comes to 108, because station 25 has no July sample for anything else and the report says the station was covered with vegetation that month. Q4 2025 pH lands at 31 of 48 against a note about a broken pH meter. Q4 2025 has no December river sampling at all. None of these needed an explanation invented for it.

**Gap markers.** The reports use `*` through `*****` for no sampling, vegetation blocking the site, a broken meter and no data. All are treated as absent, never as values.

**Towns.** A river station's municipality is the town the river is named after or where the station sits. The reports name the town but not the province, and for station 29 (Saran River) not even the town, which the app says rather than leaving a gap.

## 7. Findings shown by the data

- **The lake itself is in reasonable shape; its rivers are not.** Across all twelve months, lake stations meet the BOD limit in 100% of readings and the dissolved oxygen minimum in 99%. River stations manage 58% and 47%.
- **Bagumbayan River (Taguig) is the worst station in the dataset**, reaching BOD 556 mg/L in January 2026 against a Class C limit of 7. Buli Creek hit 424 mg/L in February. Both drain dense parts of Metro Manila.
- **Phosphate fails almost everywhere.** Only 3% of lake readings and 5% of river readings meet the 0.05 mg/L limit, and just 14 of 52 reporting stations manage it in even one month. This is the nutrient load behind the lake's recurring algal blooms.
- **The lake's pH problem is the opposite of the rivers'.** Rivers meet the 6.5–8.5 range in 98% of readings, the lake in only 65% — it runs too alkaline, reaching 9.9 at Northern West Bay. Heavy algal photosynthesis strips dissolved CO₂ and drives pH up, which ties back to the phosphate finding.
- **The cleanest water is in the east and upstream.** Pagsanjan River, Tanay River at Daranak Falls and Pangil River upstream meet 83–85% of their applicable limits. The worst are Bagumbayan (36%), Buli Creek and San Cristobal (38%).

## 8. Limitations

- The values were read by eye from scanned reports. Each table was straightened first and every gap reconciles against the reports' own notes, but transcription error cannot be ruled out. The transcribed CSVs are in `scripts/source/quarterly/` so any value can be checked against the scan.
- Station positions are fitted from a printed map, not surveyed. The georeferencing is good to roughly 43 m per pixel, far tighter than the ±1.5 km of the previous version, but the dot centres are still read from an image. Exact station shapefiles can be requested from LLDA through foi.gov.ph.
- Fecal coliform is shown without a pass/fail limit. The reports clearly judge it — their cell colours change at 50, 100, 200 and 400 MPN/100 mL, which match the DENR class thresholds — but that is inferred from the colouring rather than stated in the documents, so the app does not assert it.
- Station 20 (Jala-jala River) reports nothing in any month. It was replaced by Binangonan River in June 2022 but is still listed, so it appears on the map as not sampled.
- Four stations from the 2009–2012 network (4U, 5U, 22, 22U) no longer appear, and station 22 has been split into 22A, 22B and 22C. The network is not just larger, it has changed shape.
- LLDA had not published Q3 2026 at the time of writing, so the series ends at June 2026.

## 9. Credits and licences

- Water quality data: Laguna Lake Development Authority (LLDA).
- Map library: [Leaflet](https://leafletjs.com) (BSD-2-Clause). Charts: [Chart.js](https://www.chartjs.org) (MIT).
- Base maps: © OpenStreetMap contributors; satellite imagery © Esri, Maxar, Earthstar Geographics; light map © CARTO.
- Lake boundary: OpenStreetMap relation 79348, © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/).
- Colour palettes: ColorBrewer (Cynthia Brewer, Penn State).

---

Final Examination by Guevarra, Jeffrey · Orig, Kimberly · Hernandez, Kate Hyacinth
