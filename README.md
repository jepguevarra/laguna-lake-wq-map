# Laguna de Bay Water Quality Map

An interactive web map of the Laguna Lake Development Authority (LLDA) water quality monitoring stations in Laguna de Bay and the rivers that flow into it. It covers 43 stations, 14 parameters and the years 2009–2012.

WITM 101 Advanced Web Design and Programming, final examination.

---

## 1. What the app does

| Exam requirement | How it is met |
|---|---|
| Show the Laguna Lake boundary | The base map is Google Maps, so the real shoreline, Talim Island and surrounding towns come from Google. An optional overlay draws the LLDA lake outline (traced from the report, GeoJSON) on top. |
| Show monitoring stations around the lake | 9 lake stations (black ring) and 34 river stations (thin outline), placed from the LLDA station map. |
| Zoom, pan and click on markers | Google Maps controls (zoom, full screen, Map/Satellite/Terrain). Clicking a marker opens an info window and the station panel. |
| At least 4–6 water quality parameters per station | 14 parameters per station: DO, BOD, COD, pH, temperature, turbidity, nitrate, phosphate, ammonia, TSS, oil and grease, chloride, total coliform and fecal coliform. |
| Visualise the data with charts and map layers | Markers are coloured by the selected parameter and year, with a legend. The **Ranking** view lists every station from worst to best, with bars and the Class C limit marked. The **Station** view has a 2009–2012 trend chart (Chart.js) compared with the average of similar stations, plus a table of all parameters showing pass or fail. |
| JSON data handling | The app loads `data/stations.json` and `data/laguna-lake.geojson` with `fetch()`, then filters, sorts and classifies them in the browser. |
| Responsive and accessible interface | Two columns on desktop, stacked on phones with a collapsible legend. Every map action can also be done from the keyboard: the station dropdown, the ranking buttons and tabs that support the arrow keys. Labels are announced to screen readers, focus outlines are visible, and colours come from ColorBrewer. Pass/fail is shown as text, not only by colour. |
| Environmental monitoring awareness | Each value is judged against the DENR DAO 34 Class C criteria that LLDA uses. An "About the data" dialog explains the source, the standard and the limitations. |

The current view is stored in the URL, so a link can be shared or bookmarked. For example, `#param=bod&year=2012&station=5` opens BOD for 2012 with the Tunasan River station selected.

---

## 2. Run it locally

The browser blocks `fetch()` from files opened directly (`file://`), so the app has to be served over HTTP:

```bash
cd laguna-lake-wq-map
python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works, for example `npx serve` or the VS Code Live Server extension. No build step or `npm install` is needed: Chart.js is already included in `vendor/`, and Google Maps is loaded from Google.

Without an API key the page still opens, and the ranking and charts work, but the map area shows a setup message. See the next section.

## 3. Google Maps API key

The map uses the **Google Maps JavaScript API**, which needs a key.

1. Go to the [Google Cloud console](https://console.cloud.google.com/google/maps-apis), create a project and enable **Maps JavaScript API**. Google requires a billing account, but a class project stays inside the monthly free usage.
2. Under **Credentials**, create an API key.
3. Restrict the key, because it is visible to anyone who views the page source:
   - **Application restrictions → Websites:** add `http://localhost:8000/*` and `https://<your-project>.vercel.app/*`.
   - **API restrictions:** allow only *Maps JavaScript API*.
4. Paste the key into `js/config.js`:
   ```js
   export const GOOGLE_MAPS_API_KEY = 'AIza...';
   ```

If the key is missing, wrong or not allowed for the current website, the map area shows a message explaining which of these it is.

## 4. Deploy to Vercel

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

## 5. Project structure

```
laguna-lake-wq-map/
├── index.html              Page structure, controls, panels, About dialog
├── css/styles.css          All styling; responsive breakpoints at 900, 760 and 420 px
├── js/
│   ├── config.js           Google Maps API key (fill this in)
│   ├── main.js             Entry point: loads data, builds controls, links everything together
│   ├── state.js            Small shared store (publish/subscribe) and URL hash sync
│   ├── data.js             Loads the JSON files; value and label helpers
│   ├── scale.js            Colour classes, number formatting, Class C pass/fail
│   ├── map.js              Google Map: loader, station data layer, info windows, legend, outline
│   └── panel.js            Ranking list, station trend chart (Chart.js) and table
├── data/
│   ├── stations.json       43 stations with values per parameter and year, plus metadata
│   └── laguna-lake.geojson Lake boundary polygon
├── vendor/                 Chart.js 4.4 (with its licence)
└── scripts/                Python scripts that produced the data (not used by the site)
    ├── parse_awqr.py       Extracts the tables from the LLDA PDF
    ├── trace_lake.py       Traces the lake outline from the report map
    ├── build_app_data.py   Writes data/stations.json and data/laguna-lake.geojson
    └── source/             The extracted CSV files and the traced outline
```

## 6. How the code works

**State-driven rendering.** `state.js` holds one object: the selected parameter, year, filters, selected station and tab. Every control calls `setState()`. One `render()` function in `main.js` subscribes to changes and redraws the map, ranking and station panel from that state. This keeps the map, the list and the charts in agreement, because none of them stores its own copy of the selection.

```
user action ──► setState() ──► render() ──► map.update()
                                         ├─► renderRanking()
                                         ├─► renderStation()
                                         └─► writeHash()  (URL)
```

**Colour classes** (`scale.js`). For each parameter, values from all four years are split into five quantile classes, so a colour means the same thing when the year changes. Coliform counts range from about 100 to 10 million, so they use a log scale. Dissolved oxygen uses a reversed palette, because low oxygen is bad. pH and temperature use a neutral blue palette, because higher is not simply worse.

**Pass/fail** (`judge()` in `scale.js`) uses the DAO 34 Class C criteria: a maximum (BOD ≤ 7 mg/L), a minimum (DO ≥ 5 mg/L) or a range (pH 6.5–8.5). Parameters without a Class C limit show "No limit" and are not marked as failing.

**Ranking** sorts stations from worst to best. Worst means the highest value, or the lowest for DO, or the furthest from neutral for pH. Stations not sampled that year are listed separately instead of being dropped.

**Map** (`map.js`). The script loads the Maps JavaScript API with the key from `config.js`, then uses `google.maps.importLibrary()` to get the classes it needs. Stations are added to a `google.maps.Data` layer as GeoJSON points. One style function sets each marker's colour, size, outline and label from the current state, so a change in parameter, year or filter only calls `setStyle()` again. Station numbers appear at zoom 11 and above. Points of interest and transit icons are hidden so the stations stand out.

The sidebar renders first and the map is added when Google Maps has loaded. If the map cannot load (no key, rejected key or no internet), `createMap()` returns a view that does nothing, so the ranking and charts keep working.

## 7. Data and how it was prepared

**Source:** LLDA Environmental Laboratory and Research Division, *2009 to 2012 Annual Water Quality Report on the Laguna de Bay and its Tributary Rivers* (102 pages). The values are annual averages of monthly samples; coliform values are annual geometric means.

1. **Extract the tables** (`parse_awqr.py`). The PDF was converted to text with `pdftotext -layout`. Each parameter's lake and river tables were then parsed, giving 2,293 values. Spot checks against the PDF matched.
2. **Locate the stations.** The report has only a picture map. It was georeferenced with an affine transform fitted on 7 river mouths with known coordinates; the average error is about ±1.5 km.
3. **Trace the lake** (`trace_lake.py`). The blue lake area on the same map was turned into a polygon with OpenCV and the same transform. The traced area is about 923 km², close to the published 911–949 km².
4. **Build the app data** (`build_app_data.py`). This step attaches DAO 34 criteria and descriptions, and flags 2009 coliform values above 10⁹ (some are printed as 10¹⁵). Flagged values are kept out of the charts.

**Towns.** A river station's municipality is the town the river is named after or where the station sits. Rivers also carry pollution from towns further upstream, so a station's value reflects the whole catchment upstream, not just one town.

## 8. Findings shown by the data

- The west-shore rivers in Metro Manila and northern Laguna are the most polluted. In 2012, Tunasan River (Muntinlupa) had BOD 141 mg/L against a limit of 7, and dissolved oxygen of 0.1 mg/L. Buli Creek and Bagumbayan River (Taguig) were next.
- BOD, ammonia and coliform rise together at the same stations, which points to untreated household sewage.
- All 9 open-lake stations met the BOD limit in 2012 (1–2 mg/L), so the lake dilutes much of the river load. However, inorganic phosphate was above 0.05 mg/L at all 43 stations in 2012, which helps explain the recurring algal blooms.
- East-side rivers (Pangil, Siniloan, Pagsanjan) are much cleaner.

## 9. Limitations

- Station positions are approximate (about ±1.5 km), so on the real Google map some river stations sit slightly inland or offshore. The traced outline overlay has the same error, which is why it is off by default. Exact station shapefiles can be requested from LLDA through foi.gov.ph.
- The data stops at 2012. LLDA publishes 2013–2023 data on llda.gov.ph, and it could be added by extending `scripts/source/water_quality_*.csv` and rerunning `build_app_data.py`.
- Some stations were added in 2011–2012, so earlier years are blank for them.

## 10. Credits and licences

- Water quality data: Laguna Lake Development Authority (LLDA).
- Map: Google Maps JavaScript API (map data © Google). Charts: [Chart.js](https://www.chartjs.org) (MIT).
- Colour palettes: ColorBrewer (Cynthia Brewer, Penn State).
