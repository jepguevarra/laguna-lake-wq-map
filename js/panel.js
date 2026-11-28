// Sidebar views: the ranking list and the station detail (chart + table).
import {
  getValue, stationTitle, placeLabel, typeLabel,
  censoredText, monthLabel, monthShort, monthRange,
} from './data.js';
import {
  colorFor, fmt, fmtWithUnit, judge, STATUS_TEXT, criterionText, severity, isLog,
} from './scale.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ */
/* Ranking                                                             */
/* ------------------------------------------------------------------ */

export function renderRanking(data, state, breaks, onSelect) {
  const p = data.paramByKey[state.param];
  const visible = data.stations.filter(
    (s) => (s.type === 'lake' ? state.showLake : state.showTrib),
  );

  const withData = [];
  const noData = [];
  for (const s of visible) {
    const v = getValue(s, p.key, state.month);
    (v === null ? noData : withData).push({ s, v });
  }
  withData.sort((a, b) => severity(p.key, b.v) - severity(p.key, a.v));

  // Bar length: share of the largest value (log scale for coliform).
  const tf = isLog(p.key) ? (x) => Math.log10(Math.max(x, 1)) : (x) => x;
  const max = Math.max(...withData.map((d) => tf(d.v)), 0) || 1;
  const limit = p.criterion && p.criterion.kind !== 'range' ? tf(p.criterion.value) : null;
  const limitPct = limit !== null && limit <= max ? (limit / max) * 100 : null;

  const fails = withData.filter((d) => judge(p, d.v) === 'fail').length;
  $('ranking-title').textContent = `${p.label}, ${monthLabel(state.month)}`;
  $('ranking-hint').textContent = p.criterion
    ? `${fails} of ${withData.length} sampled stations do not meet the Class C limit (${criterionText(p)}). Worst first.`
    : `No Class C limit is set for this parameter. Sorted from ${p.key === 'ph' ? 'furthest from neutral' : 'highest'} to lowest.`;

  const items = withData.map(({ s, v }, i) => {
    const status = judge(p, v);
    const w = Math.max(2, (tf(v) / max) * 100);
    const color = colorFor(p.key, v, breaks);
    return `
      <li>
        <button type="button" class="rank-btn" data-id="${esc(s.id)}"
          aria-current="${s.id === state.stationId}"
          aria-label="${esc(stationTitle(s))}, ${esc(placeLabel(s))}: ${esc(fmtWithUnit(v, p))}, ${STATUS_TEXT[status]}">
          <span class="rank-no">${i + 1}</span>
          <span class="rank-name">${esc(s.name)} <small>${esc(s.id)} · ${esc(s.type === 'lake' ? 'Lake' : s.municipality || 'town not stated')}</small></span>
          <span class="rank-val">${fmt(v, p.key)}<br><span class="status ${status}">${STATUS_TEXT[status]}</span></span>
          <span class="rank-bar" aria-hidden="true"><i style="width:${w}%;background:${color}"></i>${
            limitPct !== null ? `<b style="left:${limitPct}%" title="Class C limit"></b>` : ''}</span>
        </button>
      </li>`;
  });

  if (noData.length) {
    items.push(`<li class="rank-sep">Not sampled in ${monthLabel(state.month)}</li>`);
    for (const { s } of noData) {
      items.push(`
        <li><button type="button" class="rank-btn" data-id="${esc(s.id)}" aria-current="${s.id === state.stationId}">
          <span class="rank-no"></span>
          <span class="rank-name">${esc(s.name)} <small>${esc(s.id)} · ${esc(s.type === 'lake' ? 'Lake' : s.municipality || 'town not stated')}</small></span>
          <span class="rank-val">—</span>
        </button></li>`);
    }
  }

  const list = $('ranking-list');
  list.innerHTML = items.join('');
  list.querySelectorAll('.rank-btn').forEach((btn) =>
    btn.addEventListener('click', () => onSelect(btn.dataset.id, { showDetail: true })),
  );
}

/* ------------------------------------------------------------------ */
/* Station detail                                                      */
/* ------------------------------------------------------------------ */

let chart = null;

export function renderStation(data, state) {
  const st = state.stationId ? data.stationById[state.stationId] : null;
  $('station-empty').hidden = !!st;
  $('station-detail').hidden = !st;
  if (!st) return;

  const p = data.paramByKey[state.param];
  $('st-name').textContent = stationTitle(st);
  let meta = `${typeLabel(st)} · ${placeLabel(st)} · ${st.lat.toFixed(3)}° N, ${st.lon.toFixed(3)}° E`;
  if (st.movedToShore) meta += ' · placed on the simplified shoreline';
  $('st-meta').textContent = meta;

  renderTrend(data, st, p, state.month);
  renderTable(data, st, state);
}

function renderTrend(data, st, p, month) {
  const months = data.meta.months;
  const series = months.map((m) => getValue(st, p.key, m));
  const unit = p.unit === 'units' ? '' : ` (${p.unit})`;
  $('trend-title').textContent = `${p.label}${unit}, ${monthRange(months)}`;

  // Average of the same station type, for context.
  const peers = data.stations.filter((s) => s.type === st.type);
  const avg = months.map((y) => {
    const vals = peers.map((s) => getValue(s, p.key, y)).filter((v) => v !== null);
    if (!vals.length) return null;
    if (isLog(p.key)) return 10 ** (vals.reduce((a, v) => a + Math.log10(Math.max(v, 1)), 0) / vals.length);
    return vals.reduce((a, v) => a + v, 0) / vals.length;
  });

  const datasets = [
    {
      label: st.id + ' ' + st.name,
      data: series,
      borderColor: '#1c1c1c', backgroundColor: '#1c1c1c',
      borderWidth: 2, pointRadius: months.map((m) => (m === month ? 6 : 3.5)),
      spanGaps: false,
    },
    {
      label: st.type === 'lake' ? 'Average of lake stations' : 'Average of river stations',
      data: avg,
      borderColor: '#9a9a9a', backgroundColor: '#9a9a9a',
      borderWidth: 1.5, pointRadius: 2.5, borderDash: [4, 3],
    },
  ];

  const c = p.criterion;
  if (c) {
    const limits = c.kind === 'range' ? c.value : [c.value];
    limits.forEach((lim, i) => datasets.push({
      label: i === 0 ? `Class C limit (${criterionText(p)})` : '_limit2',
      data: months.map(() => lim),
      borderColor: '#b3261e', borderWidth: 1, borderDash: [6, 4], pointRadius: 0,
    }));
  }

  const config = {
    type: 'line',
    data: { labels: months.map(monthShort), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          type: isLog(p.key) ? 'logarithmic' : 'linear',
          beginAtZero: !isLog(p.key) && p.key !== 'ph' && p.key !== 'temperature',
          grid: { color: '#eee' },
          ticks: {
            color: '#555',
            // On a log axis, label only powers of ten to avoid crowding.
            callback: (v) => {
              const n = Number(v);
              if (isLog(p.key) && Math.abs(Math.log10(n) % 1) > 1e-9) return '';
              return fmt(n, p.key);
            },
          },
        },
        x: { grid: { display: false }, ticks: { color: '#555' } },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 18, boxHeight: 1, color: '#333', font: { size: 11 },
            filter: (item) => !item.text.startsWith('_') },
        },
        tooltip: {
          filter: (item) => !item.dataset.label.startsWith('_'),
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtWithUnit(ctx.parsed.y, p)}` },
        },
      },
    },
  };

  if (chart) chart.destroy();
  chart = new Chart($('trend-chart'), config);
  $('trend-chart').setAttribute('aria-label',
    `${p.label} at ${st.name}: ` + months.map((m, i) => `${monthLabel(m)} ${fmtWithUnit(series[i], p)}`).join(', '));

  const sampled = series.filter((v) => v !== null).length;
  const flagged = st.flaggedValues?.[p.key];
  let hint = sampled < months.length
    ? `Not sampled in ${months.filter((_, i) => series[i] === null).map(monthLabel).join(', ')}.`
    : '';
  if (flagged) hint += ` The reported ${Object.keys(flagged).join(', ')} value (${Object.values(flagged).map((v) => v.toExponential(1)).join(', ')}) is implausibly high and is left out.`;
  $('trend-hint').textContent = hint.trim();
}

function renderTable(data, st, state) {
  $('table-title').textContent = `All parameters, ${monthLabel(state.month)}`;
  const rows = data.params.map((p) => {
    const v = getValue(st, p.key, state.month);
    // Below the detection limit: show what the report printed, judge on the
    // limit, which is the worst the reading could have been.
    const below = censoredText(st, p.key, state.month);
    const status = judge(p, v);
    return `
      <tr class="${p.key === state.param ? 'is-current' : ''}">
        <th scope="row">${esc(p.label)}<br><small>${esc(p.unit)}</small></th>
        <td class="num">${below ? esc(below) : fmt(v, p.key)}</td>
        <td>${esc(criterionText(p))}</td>
        <td><span class="status ${status}">${STATUS_TEXT[status]}</span></td>
      </tr>`;
  });
  $('st-table').innerHTML = rows.join('');
}
