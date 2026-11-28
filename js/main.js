// Entry point: load data, build the controls, connect map + panels to state.
import { loadData, stationTitle } from './data.js';
import { state, setState, subscribe, readHash, writeHash } from './state.js';
import { computeBreaks } from './scale.js';
import { createMap } from './map.js';
import { renderRanking, renderStation } from './panel.js';

const $ = (id) => document.getElementById(id);

async function init() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    $('map-status').textContent = 'The data could not be loaded. If you opened index.html directly, run it through a local web server instead (see README).';
    console.error(err);
    return;
  }

  // Apply a shared link (#param=...&year=...&station=...) if it is valid.
  const fromHash = readHash();
  if (fromHash.param && !data.paramByKey[fromHash.param]) delete fromHash.param;
  if (fromHash.year && !data.meta.years.includes(fromHash.year)) delete fromHash.year;
  if (fromHash.stationId && !data.stationById[fromHash.stationId]) {
    delete fromHash.stationId; delete fromHash.tab;
  }
  Object.assign(state, fromHash);

  buildControls(data);

  // Class breaks are cached per parameter (they span all years).
  const breakCache = {};
  const breaksFor = (key) => (breakCache[key] ??= computeBreaks(key, data.stations, data.meta.years));

  // The sidebar renders first; the map joins in once it has been created.
  let mapView = { update() {}, focusStation() {} };

  // Below 900px the sidebar sits under the map, so tapping a marker would
  // otherwise change a panel that is off the bottom of the screen.
  const stacked = window.matchMedia('(max-width: 900px)');

  function selectStation(id, { showDetail = false, fromMap = false } = {}) {
    setState({ stationId: id, ...(showDetail || fromMap ? { tab: 'station' } : {}) });
    if (!fromMap) mapView.focusStation(id, { openPopup: false });
    if (fromMap && stacked.matches) {
      $('panel-station').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function render() {
    const breaks = breaksFor(state.param);
    mapView.update(state, breaks);
    renderRanking(data, state, breaks, selectStation);
    renderStation(data, state);
    syncControls(data);
    writeHash();
  }

  subscribe(render);
  render();

  mapView = await createMap($('map'), data, {
    onSelect: selectStation,
    onStatus: (msg) => { $('map-status').textContent = msg; },
  });
  render();
  if (state.stationId) mapView.focusStation(state.stationId);
}

/* ---------------- Controls ---------------- */

function buildControls(data) {
  const paramSel = $('param-select');
  paramSel.innerHTML = data.params
    .map((p) => `<option value="${p.key}">${p.label}${p.short !== p.label ? ` (${p.short})` : ""}</option>`)
    .join('');
  paramSel.addEventListener('change', () => setState({ param: paramSel.value }));

  $('year-group').innerHTML = data.meta.years
    .map((y) => `<label><input type="radio" name="year" value="${y}"><span>${y}</span></label>`)
    .join('');
  $('year-group').addEventListener('change', (e) => setState({ year: Number(e.target.value) }));

  $('show-lake').addEventListener('change', (e) => setState({ showLake: e.target.checked }));
  $('show-trib').addEventListener('change', (e) => setState({ showTrib: e.target.checked }));
  $('show-outline').addEventListener('change', (e) => setState({ showOutline: e.target.checked }));

  // Station dropdown, grouped by type.
  const group = (type, label) => {
    const opts = data.stations
      .filter((s) => s.type === type)
      .map((s) => `<option value="${s.id}">${stationTitle(s)}${s.type === 'tributary' ? ' (' + s.municipality + ')' : ''}</option>`)
      .join('');
    return `<optgroup label="${label}">${opts}</optgroup>`;
  };
  const stSel = $('station-select');
  stSel.insertAdjacentHTML('beforeend', group('lake', 'Lake stations') + group('tributary', 'River stations'));
  // The blank option is a real choice, not a placeholder to ignore: it clears
  // the selection. Without it, choosing a station is a one-way door and the
  // ranking can never be seen whole again.
  stSel.addEventListener('change', () => {
    setState(stSel.value
      ? { stationId: stSel.value, tab: 'station' }
      : { stationId: null, tab: 'ranking' });
  });

  $('station-clear').addEventListener('click', () => setState({ stationId: null, tab: 'ranking' }));

  // Escape hands the selection back without hunting for a control. Open
  // dialogs use Escape themselves, so leave those to it.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !state.stationId) return;
    if (document.querySelector('dialog[open]')) return;
    setState({ stationId: null, tab: 'ranking' });
  });

  $('controls').addEventListener('submit', (e) => e.preventDefault());

  // Tabs (ARIA tab pattern with arrow-key support).
  const tabs = [$('tab-ranking'), $('tab-station')];
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setState({ tab: i === 0 ? 'ranking' : 'station' }));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = tabs[(i + 1) % 2];
      setState({ tab: next.id === 'tab-ranking' ? 'ranking' : 'station' });
      next.focus();
    });
  });

  // About dialog
  const dlg = $('about');
  $('about-open').addEventListener('click', () => dlg.showModal());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

function syncControls(data) {
  $('param-select').value = state.param;
  document.querySelectorAll('input[name="year"]').forEach((r) => { r.checked = Number(r.value) === state.year; });
  $('show-lake').checked = state.showLake;
  $('show-trib').checked = state.showTrib;
  $('show-outline').checked = state.showOutline;
  $('station-select').value = state.stationId || '';

  const p = data.paramByKey[state.param];
  $('param-note').textContent = p.note;

  const isRanking = state.tab === 'ranking';
  $('tab-ranking').setAttribute('aria-selected', isRanking);
  $('tab-station').setAttribute('aria-selected', !isRanking);
  $('tab-ranking').tabIndex = isRanking ? 0 : -1;
  $('tab-station').tabIndex = isRanking ? -1 : 0;
  $('panel-ranking').hidden = !isRanking;
  $('panel-station').hidden = isRanking;
}

init();
