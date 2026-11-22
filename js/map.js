// Google Maps view: base map, station markers, info windows, legend and the
// optional traced lake outline.
import { GOOGLE_MAPS_API_KEY } from './config.js';
import { getValue, stationTitle, placeLabel, typeLabel } from './data.js';
import { colorFor, legendRows, fmtWithUnit, judge, STATUS_TEXT, criterionText } from './scale.js';

const LABEL_MIN_ZOOM = 11; // show station numbers when zoomed in this far

// Hide shops, transit and other points of interest so the stations stand out.
const QUIET_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/* ------------------------------------------------------------------ */
/* Loading the Maps JavaScript API                                     */
/* ------------------------------------------------------------------ */

let loading = null;

function loadGoogleMaps() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error('NO_KEY'));
      return;
    }
    // Google calls this if the key is wrong or not allowed on this website.
    window.gm_authFailure = () => reject(new Error('AUTH'));
    window.__initGoogleMaps = () => resolve();

    const params = new URLSearchParams({
      key: GOOGLE_MAPS_API_KEY,
      v: 'weekly',
      loading: 'async',
      callback: '__initGoogleMaps',
    });
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    s.async = true;
    s.onerror = () => reject(new Error('NETWORK'));
    document.head.append(s);
  });
  return loading;
}

const FAILURE_TEXT = {
  NO_KEY: 'Google Maps is not set up yet. Add your API key in js/config.js (see README). The ranking and station charts still work.',
  AUTH: 'Google Maps rejected the API key. Check that the Maps JavaScript API is enabled and this website is allowed for the key.',
  NETWORK: 'Google Maps could not be reached. Check your internet connection. The ranking and station charts still work.',
};

/* ------------------------------------------------------------------ */
/* Map view                                                            */
/* ------------------------------------------------------------------ */

/**
 * Creates the map. Always resolves: if Google Maps cannot load, it returns a
 * view whose methods do nothing, so the rest of the app keeps working.
 */
export async function createMap(el, data, { onSelect, onStatus }) {
  const noop = { update() {}, focusStation() {}, ready: false };

  try {
    await loadGoogleMaps();
  } catch (err) {
    onStatus?.(FAILURE_TEXT[err.message] || FAILURE_TEXT.NETWORK);
    el.classList.add('map-unavailable');
    return noop;
  }

  // Google may report a bad key only after the map starts drawing.
  window.gm_authFailure = () => onStatus?.(FAILURE_TEXT.AUTH);

  const { Map, InfoWindow, Data } = await google.maps.importLibrary('maps');
  const { LatLngBounds, Point, ControlPosition } = await google.maps.importLibrary('core');
  const CIRCLE = google.maps.SymbolPath.CIRCLE;

  const map = new Map(el, {
    mapTypeId: 'roadmap',
    mapTypeControl: true,
    mapTypeControlOptions: {
      mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
      position: ControlPosition.TOP_RIGHT,
    },
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    gestureHandling: 'cooperative', // one-finger scroll moves the page on phones
    styles: QUIET_STYLE,
  });

  // ---- Traced LLDA lake outline (optional overlay, off by default) ----
  const outline = new Data();
  outline.addGeoJson(data.lake);
  outline.setStyle({
    clickable: false,
    fillColor: '#1f4e79', fillOpacity: 0.06,
    strokeColor: '#1f4e79', strokeOpacity: 0.9, strokeWeight: 1.5,
  });

  // ---- Stations as a GeoJSON data layer ----
  const stationsLayer = new Data({ map });
  for (const st of data.stations) {
    stationsLayer.add({
      id: st.id,
      geometry: { lat: st.lat, lng: st.lon },
      properties: { type: st.type },
    });
  }

  // Fit to the lake and every station. Refit on resize until the user moves the map.
  const bounds = new LatLngBounds();
  data.stations.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lon }));
  const fit = () => map.fitBounds(bounds, 24);
  fit();
  let userMoved = false;
  map.addListener('dragstart', () => { userMoved = true; });
  el.addEventListener('wheel', () => { userMoved = true; }, { passive: true });
  el.addEventListener('pointerdown', () => { userMoved = true; }, { passive: true });
  new ResizeObserver(() => { if (!userMoved) fit(); }).observe(el);

  // ---- Info window ----
  const info = new InfoWindow({ maxWidth: 260 });
  let current = null; // { state, breaks } from the latest update

  function openInfo(st) {
    const { state } = current;
    const p = data.paramByKey[state.param];
    const v = getValue(st, p.key, state.year);
    const status = judge(p, v);

    const box = document.createElement('div');
    box.className = 'popup';
    box.innerHTML = `
      <div class="popup-title">${stationTitle(st)}</div>
      <div class="popup-sub">${typeLabel(st)} · ${placeLabel(st)}</div>
      <div class="popup-val"><strong>${p.label} (${state.year}):</strong> ${fmtWithUnit(v, p)}</div>
      <div><span class="status ${status}">${STATUS_TEXT[status]}</span>
        <small>Class C: ${criterionText(p)}</small></div>
      <div class="popup-more"><button type="button">View station details</button></div>`;
    box.querySelector('button').addEventListener('click', () => onSelect(st.id, { showDetail: true }));

    info.setContent(box);
    info.setPosition({ lat: st.lat, lng: st.lon });
    info.setOptions({ pixelOffset: new google.maps.Size(0, -8) });
    info.open({ map });
  }

  stationsLayer.addListener('click', (e) => {
    const st = data.stationById[e.feature.getId()];
    onSelect(st.id, { fromMap: true });
    openInfo(st);
  });

  // ---- Legend (custom map control) ----
  const legendEl = document.createElement('div');
  legendEl.className = 'legend';
  map.controls[ControlPosition.RIGHT_BOTTOM].push(legendEl);

  // ---- Styling ----
  function styleFor(feature) {
    const { state, breaks } = current;
    const st = data.stationById[feature.getId()];
    const p = data.paramByKey[state.param];
    const v = getValue(st, p.key, state.year);
    const color = colorFor(p.key, v, breaks);
    const isLake = st.type === 'lake';
    const selected = st.id === state.stationId;
    const visible = isLake ? state.showLake : state.showTrib;
    const showLabel = selected || map.getZoom() >= LABEL_MIN_ZOOM;

    return {
      visible,
      title: `${stationTitle(st)}: ${fmtWithUnit(v, p)}`,
      zIndex: selected ? 1000 : isLake ? 500 : 100,
      icon: {
        path: CIRCLE,
        scale: selected ? 10 : isLake ? 8 : 6.5,
        fillColor: color || '#ffffff',
        fillOpacity: color ? 0.95 : 0.7,
        strokeColor: selected ? '#1f4e79' : '#1c1c1c',
        strokeWeight: selected ? 3 : isLake ? 2.5 : 1,
        labelOrigin: new Point(2.4, 0),
      },
      label: showLabel
        ? { text: st.id, color: '#1c1c1c', fontSize: '11px', fontWeight: '600' }
        : null,
    };
  }

  map.addListener('zoom_changed', () => { if (current) stationsLayer.setStyle(styleFor); });

  function update(state, breaks) {
    current = { state, breaks };
    stationsLayer.setStyle(styleFor);
    outline.setMap(state.showOutline ? map : null);
    if (!state.stationId) info.close();

    const p = data.paramByKey[state.param];
    const rows = legendRows(p, breaks)
      .map((r) => `<div class="row"><span class="sw" style="background:${r.color}"></span>${r.label}</div>`)
      .join('');
    const unit = p.unit === 'units' ? '' : ` (${p.unit})`;
    const wasOpen = legendEl.querySelector('details')?.open
      ?? !window.matchMedia('(max-width: 760px)').matches;
    legendEl.innerHTML = `<details ${wasOpen ? 'open' : ''}>
      <summary>${p.short}${unit}, ${state.year}</summary>
      ${rows}
      <div class="row"><span class="sw empty"></span>Not sampled</div>
      <div class="gap"></div>
      <div class="row"><span class="sw ring" style="background:#fff"></span>Lake station</div>
      <div class="row"><span class="sw" style="background:#fff;width:11px;height:11px;margin:0 1.5px"></span>River station</div>
      </details>`;
  }

  function focusStation(id, { openPopup = false } = {}) {
    const st = data.stationById[id];
    if (!st) return;
    const ll = { lat: st.lat, lng: st.lon };
    const b = map.getBounds();
    if (!b || !b.contains(ll)) map.panTo(ll);
    if (openPopup && current) openInfo(st);
  }

  return { update, focusStation, ready: true };
}
