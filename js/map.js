// Leaflet map with free, key-less base maps (OpenStreetMap street map and
// Esri satellite imagery), station markers, popups, legend and the optional
// traced lake outline.
import { getValue, stationTitle, placeLabel, typeLabel } from './data.js';
import { colorFor, legendRows, fmtWithUnit, judge, STATUS_TEXT, criterionText } from './scale.js';

const LABEL_MIN_ZOOM = 11; // show station numbers when zoomed in this far

export async function createMap(el, data, { onSelect, onStatus }) {
  const map = L.map(el, { zoomControl: true, minZoom: 8, maxZoom: 18, zoomSnap: 0.25 });

  // ---- Base maps (no API key needed) ----
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
  });
  // Place names drawn over the satellite imagery ("hybrid" view).
  const placeLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, pane: 'overlayPane',
  });
  const hybrid = L.layerGroup([satellite, placeLabels]);
  const light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  });
  street.addTo(map);

  let tileErrorShown = false;
  for (const layer of [street, satellite, placeLabels, light]) {
    layer.on('tileerror', () => {
      if (tileErrorShown) return;
      tileErrorShown = true;
      onStatus?.('Map tiles could not load. Check your internet connection. The stations and charts still work.');
    });
  }

  // ---- Traced LLDA lake outline (optional, off by default) ----
  const outline = L.geoJSON(data.lake, {
    style: { color: '#1f4e79', weight: 1.5, fillColor: '#1f4e79', fillOpacity: 0.06 },
    interactive: false,
  });

  // ---- Stations ----
  const lakeGroup = L.layerGroup().addTo(map);
  const tribGroup = L.layerGroup().addTo(map);
  const markers = new Map();

  for (const st of data.stations) {
    const m = L.circleMarker([st.lat, st.lon], { radius: 7, weight: 1.5 });
    m.bindTooltip(st.id, {
      permanent: true, direction: 'right', offset: [7, 0], className: 'station-label',
    });
    m.bindPopup(() => popupHtml(st), { maxWidth: 260 });
    m.on('click', () => onSelect(st.id, { fromMap: true }));
    m.on('popupopen', (e) => {
      const btn = e.popup.getElement().querySelector('[data-detail]');
      btn?.addEventListener('click', () => onSelect(st.id, { showDetail: true }));
    });
    (st.type === 'lake' ? lakeGroup : tribGroup).addLayer(m);
    markers.set(st.id, m);
  }

  // Base map switcher. Station and outline visibility live in the sidebar so
  // the map, ranking list and checkboxes always agree.
  L.control.layers(
    { 'Street map': street, 'Satellite': hybrid, 'Light': light },
    {},
    { collapsed: false, position: 'topright' },
  ).addTo(map);
  L.control.scale({ metric: true, imperial: false }).addTo(map);

  // Fit to all stations; refit on resize until the user moves the map.
  const bounds = L.latLngBounds(data.stations.map((s) => [s.lat, s.lon]));
  const fit = () => map.fitBounds(bounds, { padding: [16, 16] });
  fit();
  let userMoved = false;
  el.addEventListener('pointerdown', () => { userMoved = true; }, { passive: true });
  el.addEventListener('wheel', () => { userMoved = true; }, { passive: true });
  el.addEventListener('keydown', () => { userMoved = true; });
  new ResizeObserver(() => {
    map.invalidateSize();
    if (!userMoved) fit();
  }).observe(el);

  // ---- Legend ----
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(map);

  // Station numbers only when zoomed in, to avoid clutter.
  const toggleLabels = () => {
    const show = map.getZoom() >= LABEL_MIN_ZOOM;
    markers.forEach((m) => (show ? m.openTooltip() : m.closeTooltip()));
  };
  map.on('zoomend', toggleLabels);

  // Popup content uses the current state, so it is built when opened.
  let current = null;
  function popupHtml(st) {
    const { state } = current;
    const p = data.paramByKey[state.param];
    const v = getValue(st, p.key, state.year);
    const status = judge(p, v);
    return `
      <div class="popup-title">${stationTitle(st)}</div>
      <div class="popup-sub">${typeLabel(st)} · ${placeLabel(st)}</div>
      <div class="popup-val"><strong>${p.label} (${state.year}):</strong> ${fmtWithUnit(v, p)}</div>
      <div><span class="status ${status}">${STATUS_TEXT[status]}</span>
        <small>Class C: ${criterionText(p)}</small></div>
      <div class="popup-more"><button type="button" data-detail>View station details</button></div>`;
  }

  function update(state, breaks) {
    current = { state, breaks };
    const p = data.paramByKey[state.param];

    for (const st of data.stations) {
      const m = markers.get(st.id);
      const v = getValue(st, p.key, state.year);
      const color = colorFor(p.key, v, breaks);
      const selected = st.id === state.stationId;
      m.setStyle({
        radius: selected ? 10 : st.type === 'lake' ? 8 : 6.5,
        color: selected ? '#1f4e79' : '#1c1c1c',
        weight: selected ? 3 : st.type === 'lake' ? 2.5 : 1,
        fillColor: color || '#ffffff',
        fillOpacity: color ? 0.95 : 0.7,
        dashArray: color ? null : '2 2',
      });
      if (selected) m.bringToFront();
    }

    state.showLake ? lakeGroup.addTo(map) : lakeGroup.remove();
    state.showTrib ? tribGroup.addTo(map) : tribGroup.remove();
    state.showOutline ? outline.addTo(map) : outline.remove();
    toggleLabels();

    // Legend
    const rows = legendRows(p, breaks)
      .map((r) => `<div class="row"><span class="sw" style="background:${r.color}"></span>${r.label}</div>`)
      .join('');
    const unit = p.unit === 'units' ? '' : ` (${p.unit})`;
    const box = legend.getContainer();
    const wasOpen = box.querySelector('details')?.open ?? !window.matchMedia('(max-width: 760px)').matches;
    box.innerHTML = `<details ${wasOpen ? 'open' : ''}>
      <summary>${p.short}${unit}, ${state.year}</summary>
      ${rows}
      <div class="row"><span class="sw empty"></span>Not sampled</div>
      <div class="gap"></div>
      <div class="row"><span class="sw ring" style="background:#fff"></span>Lake station</div>
      <div class="row"><span class="sw" style="background:#fff;width:11px;height:11px;margin:0 1.5px"></span>River station</div>
      </details>`;
  }

  function focusStation(id, { openPopup = false } = {}) {
    const m = markers.get(id);
    if (!m) return;
    const ll = m.getLatLng();
    if (!map.getBounds().pad(-0.15).contains(ll)) map.panTo(ll);
    if (openPopup) m.openPopup();
  }

  return { update, focusStation };
}
