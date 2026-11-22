// Small shared store. Every view subscribes and re-renders from `state`.
const listeners = new Set();

export const state = {
  param: 'bod',      // selected parameter key
  year: 2012,        // selected year
  showLake: true,    // lake stations visible
  showTrib: true,    // tributary river stations visible
  showOutline: false, // traced LLDA lake outline drawn over the base map
  stationId: null,   // selected station id, or null
  tab: 'ranking',    // 'ranking' | 'station'
};

export function setState(patch) {
  const changed = Object.keys(patch).filter((k) => state[k] !== patch[k]);
  if (!changed.length) return;
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state, changed));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Keep the selection in the URL hash so a view can be shared or bookmarked,
// e.g.  #param=bod&year=2012&station=5
export function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const out = {};
  if (h.get('param')) out.param = h.get('param');
  if (h.get('year')) out.year = Number(h.get('year'));
  if (h.get('station')) { out.stationId = h.get('station'); out.tab = 'station'; }
  return out;
}

export function writeHash() {
  const h = new URLSearchParams({ param: state.param, year: state.year });
  if (state.stationId) h.set('station', state.stationId);
  history.replaceState(null, '', '#' + h.toString());
}
