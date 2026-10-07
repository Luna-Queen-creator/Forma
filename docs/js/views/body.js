// Body: measurements on a figure, weight with a trend line, and optional progress photos.
// Measurements are stored in cm, weight in kg; one entry per day in state.body.entries.
'use strict';

let bodyCompare = 'start';   // what the changes on the figure compare with: start | 90 | 30 | last
let weightRange = '90';      // days shown on the weight chart, or 'all'

const bodyEntry = date => state.body.entries.find(e => e.date === date);
const SIDE_NAMES = { r: 'Right', l: 'Left' };
const COMPARE_ORDER = ['start', '90', '30', 'last'];
const COMPARE_LABELS = { start: 'Start', 90: '3 months', 30: '1 month', last: 'Last' };
const COMPARE_CAPTION = { start: 'since start', 90: 'over 3 months', 30: 'over 1 month', last: 'since last time' };
let bodyHistoryLimit = 8;

// ------------------------------------------------------------ spots ----

function spotDef(id) { return BODY_SPOTS.find(s => s.id === id) || state.body.custom.find(c => c.id === id); }
/** Spots being measured, in figure order (built-in first, then your own). */
function activeSpots() {
  const on = new Set(state.body.spots);
  return [...BODY_SPOTS.filter(s => on.has(s.id)), ...state.body.custom.filter(c => on.has(c.id))];
}
/** Which sides of a spot are measured: ['r','l'], ['r'], ['l'] or [''] for a single number. */
function spotSides(s) {
  if (!s.paired) return [''];
  const v = state.body.sides[s.id] || 'both';
  return v === 'right' ? ['r'] : v === 'left' ? ['l'] : ['r', 'l'];
}
const spotKey = (id, side) => (side ? `${id}-${side}` : id);
function keyInfo(key) {
  const m = /^(.*)-([rl])$/.exec(key);
  const s = m && spotDef(m[1])?.paired ? spotDef(m[1]) : spotDef(key);
  return s ? { spot: s, side: m && s.paired ? m[2] : '' } : null;
}
function keyLabel(key) {
  const k = keyInfo(key);
  if (!k) return key;
  return k.side ? `${k.spot.name} (${SIDE_NAMES[k.side].toLowerCase()})` : k.spot.name;
}
/** Every value key currently measured, e.g. ['chest', 'arm-r', 'arm-l', …]. */
function activeKeys() { return activeSpots().flatMap(s => spotSides(s).map(side => spotKey(s.id, side))); }

// ----------------------------------------------------------- numbers ----

/** How a value is shown, typed and stepped, by key. */
function valueKind(key) {
  if (key === 'weight') return { unit: weightUnit(), step: imperial() ? 0.2 : 0.1, dec: 1, min: 20, max: 400, toShow: kgToDisplay, toStore: displayToKg };
  if (key === 'fat') return { unit: '%', step: 0.5, dec: 1, min: 1, max: 75, toShow: x => x, toStore: x => x };
  return { unit: lengthUnit(), step: imperial() ? 0.25 : 0.5, dec: imperial() ? 2 : 1, min: 3, max: 300, toShow: cmToDisplay, toStore: displayToCm };
}
const showNum = (key, v) => fmtNum(valueKind(key).toShow(v), valueKind(key).dec);
const showVal = (key, v) => `${showNum(key, v)} ${valueKind(key).unit}`;

function seriesOf(key) {
  return state.body.entries.filter(e => (key === 'weight' || key === 'fat' ? e[key] : e.m[key]) != null)
    .map(e => ({ d: e.date, v: key === 'weight' || key === 'fat' ? e[key] : e.m[key] }));
}
/** The point a change is measured from, following the "compare with" choice. */
function baselineOf(series) {
  if (series.length < 2) return null;
  const last = series.at(-1);
  if (bodyCompare === 'start') return series[0];
  if (bodyCompare === 'last') return series.at(-2);
  const cutoff = dateKey(addDays(parseDate(last.d), -Number(bodyCompare)));
  let base = null;
  for (const p of series) if (p.d <= cutoff) base = p;
  return base || series[0];
}
function changeText(key, diff) {
  const shown = valueKind(key).toShow(Math.abs(diff));
  if (shown < 0.05) return '±0';
  return `${diff > 0 ? '▲' : '▼'}${fmtNum(shown, valueKind(key).dec)}`;
}
/** Smoothed weight: each weigh-in pulls the trend 10% per day of gap towards it. */
function trendOf(series) {
  const out = [];
  let t = null, prev = null;
  for (const p of series) {
    if (t === null) t = p.v;
    else t += (1 - 0.9 ** Math.max(1, (parseDate(p.d) - parseDate(prev)) / 864e5)) * (p.v - t);
    prev = p.d;
    out.push({ d: p.d, v: t });
  }
  return out;
}
function previousValue(key, before) {
  const s = seriesOf(key).filter(p => p.d < before);
  return s.at(-1) || null;
}

// ------------------------------------------------------------ figure ----
// A simple front-view figure drawn from a few widths, so two body shapes are easy to offer.

const FIG_SHAPES = {
  curvy: { neck: 9, sh: 40, chest: 36, under: 31, waist: 26, belly: 31, hips: 45, thigh: 20, delt: 11, arm: 9.5, fore: 8 },
  straight: { neck: 11, sh: 46, chest: 40, under: 37, waist: 34, belly: 35, hips: 40, thigh: 19, delt: 12.5, arm: 10.5, fore: 9 },
};
const FIG_CX = 100;
const pt = p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

/** Closed smooth curve through points (Catmull-Rom turned into cubic Béziers). */
function smoothClosed(pts) {
  const n = pts.length;
  let d = `M${pt(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${pt(p2)}`;
  }
  return d + 'Z';
}

const figureCache = new Map();
function figureGeometry(shape) {
  if (figureCache.has(shape)) return figureCache.get(shape);
  const p = FIG_SHAPES[shape] || FIG_SHAPES.curvy;
  const torso = [[p.neck, 54], [p.neck, 71], [p.sh * 0.62, 79], [p.sh, 89], [p.sh - 3, 106], [p.chest, 122], [p.under, 142],
    [p.waist, 168], [p.belly, 192], [p.hips, 222], [p.hips - 1, 240]];
  const legs = [[264, p.hips / 2 - 1, p.thigh], [294, p.hips / 2 - 3.5, p.thigh - 3.5], [328, 17, 10], [360, 17.5, 11.5], [402, 17, 6]];
  const right = [...torso, ...legs.map(([y, c, w]) => [c + w, y]), [25, 416], [22, 426], [12, 426],
    ...legs.slice().reverse().map(([y, c, w]) => [c - w, y]), [0, 252]];
  const outline = [...right, ...right.map(([x, y]) => [-x, y]).reverse().slice(1)].map(([x, y]) => [FIG_CX + x, y]);
  // Arms hang slightly away from the body. Offsets are along (t) and across (w) the arm.
  const a = 13 * Math.PI / 180, u = [Math.sin(a), Math.cos(a)], n = [Math.cos(a), -Math.sin(a)], J = [p.sh - 7, 95];
  const at = (t, w) => [J[0] + u[0] * t + n[0] * w, J[1] + u[1] * t + n[1] * w];
  const rows = [[-9, p.delt - 5], [4, p.delt], [20, p.delt - 0.5], [42, p.arm], [70, p.arm - 2], [96, p.fore], [128, p.fore - 2.5], [144, p.fore - 0.5], [156, 3.5]];
  const arm = [...rows.map(([t, w]) => at(t, w)), ...rows.slice().reverse().map(([t, w]) => at(t, -w))];
  const mirror = (pts, side) => pts.map(([x, y]) => [side === 'r' ? FIG_CX - x : FIG_CX + x, y]);

  // Tapes: where each spot is measured, as a line across the body or a limb.
  const across = (y, w) => ({ a: [FIG_CX - w - 1, y], b: [FIG_CX + w + 1, y] });
  const limb = (pa, pb, side) => { const [m1, m2] = mirror([pa, pb], side); return { a: m1, b: m2 }; };
  const delt = at(8, p.delt)[0] + 1;
  const tapes = {
    neck: across(64, p.neck), shoulders: across(100, delt), chest: across(122, p.chest), underbust: across(142, p.under),
    waist: across(168, p.waist), belly: across(192, p.belly), hips: across(222, p.hips),
  };
  for (const side of ['r', 'l']) {
    tapes[`arm-${side}`] = limb(at(42, -p.arm - 1), at(42, p.arm + 1), side);
    tapes[`forearm-${side}`] = limb(at(96, -p.fore - 1), at(96, p.fore + 1), side);
    for (const [id, i] of [['thigh', 0], ['midthigh', 1], ['calf', 3]]) {
      const [y, c, w] = legs[i];
      tapes[`${id}-${side}`] = limb([c - w - 1, y], [c + w + 1, y], side);
    }
  }
  const g = { body: smoothClosed(outline), arms: { r: smoothClosed(mirror(arm, 'r')), l: smoothClosed(mirror(arm, 'l')) }, tapes };
  figureCache.set(shape, g);
  return g;
}

/** A tape as two arcs: the front (solid) and the back of the body (faint, dashed). */
function tapePaths(t, cls = '') {
  const [x1, y1] = t.a, [x2, y2] = t.b;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  if (ny < 0) { nx = -nx; ny = -ny; }
  const bulge = Math.min(7, len * 0.09);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return `<path class="tape-back ${cls}" d="M${pt(t.a)} Q${pt([mx - nx * bulge, my - ny * bulge])} ${pt(t.b)}"/>
    <path class="tape ${cls}" d="M${pt(t.a)} Q${pt([mx + nx * bulge, my + ny * bulge])} ${pt(t.b)}"/>`;
}

function figureShapes(g) {
  const shapes = `<path d="${g.body}"/><path d="${g.arms.r}"/><path d="${g.arms.l}"/><ellipse cx="${FIG_CX}" cy="32" rx="19" ry="23"/>`;
  return `<g class="fig-stroke">${shapes}</g><g class="fig-fill">${shapes}</g>`;
}

/** Small figure with one spot highlighted, used in the check-in. */
function miniFigure(highlightKeys = []) {
  const g = figureGeometry(state.body.figure);
  const tapes = highlightKeys.map(k => g.tapes[k]).filter(Boolean).map(t => tapePaths(t, 'hl')).join('');
  return `<svg class="mini-figure" viewBox="20 4 160 428" aria-hidden="true">${figureShapes(g)}${tapes}</svg>`;
}

/** The big figure: every measured spot with its latest value and the change, labels on both sides. */
function bodyFigure() {
  const g = figureGeometry(state.body.figure);
  const OX = 80, GAP = 41;
  const items = [];
  for (const s of activeSpots()) {
    if (!BODY_SPOT_IDS.includes(s.id)) continue;   // your own spots are listed under the figure
    for (const side of spotSides(s)) {
      const key = spotKey(s.id, side);
      const t = g.tapes[key];
      const col = side || s.col;
      const anchor = col === 'r' ? (t.a[0] < t.b[0] ? t.a : t.b) : (t.a[0] > t.b[0] ? t.a : t.b);
      items.push({ s, side, key, t, col, ax: anchor[0] + OX, ay: anchor[1] });
    }
  }
  let H = 452;
  for (const col of ['r', 'l']) {
    const list = items.filter(i => i.col === col).sort((a, b) => a.ay - b.ay);
    list.forEach((it, i) => { it.ly = Math.max(it.ay - 8, i ? list[i - 1].ly + GAP : 14); });
    for (let i = list.length - 1; i >= 0; i--) if (i < list.length - 1) list[i].ly = Math.min(list[i].ly, list[i + 1].ly - GAP);
    if (list.length) H = Math.max(H, list.at(-1).ly + 34);
  }
  const labels = items.map(it => {
    const series = seriesOf(it.key), last = series.at(-1), base = baselineOf(series);
    const left = it.col === 'r';
    const x = left ? 4 : 356, anchor = left ? 'start' : 'end';
    const name = `${it.s.name}${it.side ? ` · ${it.side.toUpperCase()}` : ''}`;
    const value = last
      ? `<tspan class="fl-num">${showNum(it.key, last.v)}</tspan><tspan class="fl-unit"> ${lengthUnit()}</tspan>${base ? `<tspan class="fl-delta" dx="5">${changeText(it.key, last.v - base.v)}</tspan>` : ''}`
      : '<tspan class="fl-add">+ add</tspan>';
    const lx = left ? 98 : 262;
    const aria = `${name}: ${last ? showVal(it.key, last.v) + (base ? `, ${changeText(it.key, last.v - base.v)} ${COMPARE_CAPTION[bodyCompare]}` : '') : 'not measured yet'}`;
    return `<g class="fl ${last ? 'has' : ''}" role="button" tabindex="0" data-action="body-spot" data-id="${it.s.id}" aria-label="${esc(aria)}">
      <g transform="translate(${OX} 0)">${tapePaths(it.t, last ? 'has' : '')}<path class="tape-hit" d="M${pt(it.t.a)} L${pt(it.t.b)}"/></g>
      <path class="leader" d="M${lx} ${it.ly + 5} L${it.ax + (left ? -3 : 3)} ${it.ay}"/><circle class="leader-dot" cx="${it.ax}" cy="${it.ay}" r="2"/>
      <rect class="fl-hit" x="${left ? 0 : 258}" y="${it.ly - 14}" width="102" height="38" rx="8"/>
      <text class="fl-name" x="${x}" y="${it.ly}" text-anchor="${anchor}">${esc(name)}</text>
      <text class="fl-val" x="${x}" y="${it.ly + 18}" text-anchor="${anchor}">${value}</text></g>`;
  }).join('');
  return `<svg class="body-figure" viewBox="0 0 360 ${H}" role="group" aria-label="Your measurements on a body figure">
    <g transform="translate(${OX} 0)">${figureShapes(g)}</g>
    <text class="fig-side" x="${OX + 62}" y="446" text-anchor="middle">RIGHT</text><text class="fig-side" x="${OX + 138}" y="446" text-anchor="middle">LEFT</text>
    ${labels}</svg>`;
}

// ------------------------------------------------------------- view ----

renderers.body = () => {
  const b = state.body;
  const has = b.entries.length > 0;
  app().innerHTML = heading('Your body, your progress.', 'Measure once or twice a week. Small changes add up.',
    `<button class="btn light" data-action="body-customize">${icon('settings')} Customize</button><button class="btn" data-action="measure">${icon('plus')} Measure now</button>`)
    + (has ? bodyStats() : bodyIntro())
    + `<div class="body-grid"><section class="panel figure-panel">
        <div class="panel-head"><h2>Measurements</h2>${has ? `<span class="muted small">${esc(lengthUnit())} · changes ${esc(COMPARE_CAPTION[bodyCompare])}</span>` : ''}</div>
        ${has ? chips('body-compare', COMPARE_ORDER, bodyCompare, COMPARE_LABELS, 'compact') : ''}
        ${activeSpots().some(s => BODY_SPOT_IDS.includes(s.id)) ? bodyFigure() : '<p class="muted">No spots on the figure are switched on. Choose them in Customize.</p>'}
        ${customSpotsList()}
        <details class="how-measure"><summary>How to measure well</summary><ul class="small">
          <li>Use a soft tape on bare skin: snug, but not pressing in.</li>
          <li>Keep the tape level all the way around. A mirror helps.</li>
          <li>Same time of day each time, ideally in the morning before eating.</li>
          <li>Measure each spot twice. If they differ, take the average.</li>
          <li>Water, salt and your cycle can shift numbers by a centimetre or two. Watch the direction over weeks, not single days.</li></ul></details>
      </section>
      <div class="body-side">${weightPanel()}${b.photos ? photosPanel() : ''}</div></div>`
    + bodyHistory();
  hydratePhotos(app());
};
chipHandlers['body-compare'] = v => { bodyCompare = v; render(); };
chipHandlers['weight-range'] = v => { weightRange = v; render(); };

function bodyIntro() {
  return `<div class="note body-intro"><strong>How it works</strong><ul>
    <li>Tap <strong>Measure now</strong>. Forma walks you through weight and each spot, one at a time.</li>
    <li>Left and right copy each other until you type a different number for one side.</li>
    <li>Pick your spots, your own extra spots, body fat and measuring days in <strong>Customize</strong>.</li>
    <li>Everything stays on this device, photos included.</li></ul></div>`;
}

function bodyStats() {
  const tile = (label, value, sub = '') => `<div class="stat"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;
  const tiles = [];
  const w = seriesOf('weight');
  if (w.length) {
    const base = baselineOf(w);
    tiles.push(tile('Weight', esc(showVal('weight', w.at(-1).v)), base ? `${changeText('weight', w.at(-1).v - base.v)} since ${esc(shortDate(parseDate(base.d)))}` : esc(shortDate(parseDate(w.at(-1).d)))));
    const tr = trendOf(w);
    const span = (parseDate(w.at(-1).d) - parseDate(w[0].d)) / 864e5;
    if (w.length >= 3 && span >= 13) {
      const back = dateKey(addDays(parseDate(w.at(-1).d), -28));
      const from = tr.filter(p => p.d <= back).at(-1) || tr[0];
      const weeks = Math.max(1, (parseDate(w.at(-1).d) - parseDate(from.d)) / (7 * 864e5));
      const rate = (tr.at(-1).v - from.v) / weeks;
      tiles.push(tile('Weight trend', esc(showVal('weight', tr.at(-1).v)), `${changeText('weight', rate)} ${esc(weightUnit())} a week lately`));
    }
  } else tiles.push(tile('Weight', '–', 'not weighed yet'));
  const f = seriesOf('fat');
  if (state.body.fat && f.length) {
    const base = baselineOf(f);
    tiles.push(tile('Body fat', `${fmtNum(f.at(-1).v, 1)} %`, base ? `${changeText('fat', f.at(-1).v - base.v)} since ${esc(shortDate(parseDate(base.d)))}` : ''));
  }
  const waist = seriesOf('waist').at(-1), hips = seriesOf('hips').at(-1);
  if (waist && hips) tiles.push(tile('Waist ÷ hips', (waist.v / hips.v).toFixed(2), 'lower = more waist definition'));
  const last = state.body.entries.at(-1);
  if (tiles.length < 4) tiles.push(tile('Check-ins', state.body.entries.length, `last on ${esc(shortDate(parseDate(last.date)))}`));
  return `<section class="stats body-stats">${tiles.slice(0, 4).join('')}</section>`;
}

function customSpotsList() {
  const mine = activeSpots().filter(s => !BODY_SPOT_IDS.includes(s.id));
  if (!mine.length) return '';
  return `<div class="own-spots"><h3>Your own spots</h3>${mine.map(s => {
    const parts = spotSides(s).map(side => {
      const key = spotKey(s.id, side), series = seriesOf(key), last = series.at(-1), base = baselineOf(series);
      return `<span>${side ? `<small>${side.toUpperCase()}</small> ` : ''}${last ? `<strong>${showVal(key, last.v)}</strong>${base ? ` <small class="muted">${changeText(key, last.v - base.v)}</small>` : ''}` : '<span class="muted">+ add</span>'}</span>`;
    }).join('');
    return `<button class="own-spot" data-action="body-spot" data-id="${s.id}"><span class="own-name">${esc(s.name)}</span><span class="own-vals">${parts}</span></button>`;
  }).join('')}</div>`;
}

function weightPanel() {
  const w = seriesOf('weight');
  if (!w.length) {
    return `<section class="panel"><div class="panel-head"><h2>Weight</h2></div><p class="muted">Weigh in during a check-in and your weight and its trend appear here.</p></section>`;
  }
  const days = weightRange === 'all' ? Infinity : Number(weightRange);
  const from = days === Infinity ? '' : dateKey(addDays(new Date(), -days));
  const shown = w.filter(p => p.d >= from);
  const trend = trendOf(w).filter(p => p.d >= from);
  const ranges = { 30: '1M', 90: '3M', 182: '6M', 365: '1Y', all: 'All' };
  const toShow = p => ({ d: p.d, v: kgToDisplay(p.v) });
  const chart = shown.length
    ? bodyChart({ series: [{ name: 'Weigh-in', cls: 'dots', points: shown.map(toShow) }], trend: w.length >= 2 ? trend.map(toShow) : null, unit: weightUnit(), dec: 1 })
    : '<p class="muted small">No weigh-ins in this period.</p>';
  return `<section class="panel chart-panel"><div class="panel-head"><h2>Weight</h2><span class="muted small">${esc(weightUnit())}</span></div>
    ${chips('weight-range', Object.keys(ranges), weightRange, ranges, 'compact')}
    ${w.length >= 2 ? `<div class="legend-row"><span class="legend-item"><i class="key dot-key"></i>Weigh-ins</span><span class="legend-item"><i class="key line-key"></i>Trend (smooths out daily ups and downs)</span></div>` : ''}
    ${chart}</section>`;
}

// ------------------------------------------------------------ charts ----

/** Round axis steps for any range of values. */
function niceRange(min, max) {
  if (max - min < 0.5) { min -= 0.5; max += 0.5; }
  const span = max - min, raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw);
  return { lo: Math.floor((min - span * 0.06) / step) * step, hi: Math.ceil((max + span * 0.06) / step) * step, step };
}

/** Line chart over time. Series points are { d: 'YYYY-MM-DD', v } in display units. */
function bodyChart({ series, trend = null, unit, dec = 1, width }) {
  const all = [...series.flatMap(s => s.points), ...(trend || [])];
  if (!all.length) return '';
  const W = width || clamp(($('#app')?.clientWidth || 640) > 900 ? ($('#app').clientWidth - 18) / 2 - 46 : ($('#app')?.clientWidth || 640) - 46, 280, 760);
  const H = W < 480 ? 210 : 240, left = 42, right = 14, top = 14, bottom = 28;
  const time = d => parseDate(d).getTime();
  let x0 = Math.min(...all.map(p => time(p.d))), x1 = Math.max(...all.map(p => time(p.d)));
  if (x1 - x0 < 6 * 864e5) { const mid = (x0 + x1) / 2; x0 = mid - 3 * 864e5; x1 = mid + 3 * 864e5; }
  const { lo, hi, step } = niceRange(Math.min(...all.map(p => p.v)), Math.max(...all.map(p => p.v)));
  const X = d => left + ((time(d) - x0) / (x1 - x0)) * (W - left - right);
  const Y = v => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  const tickDec = step < 1 ? (step < 0.5 ? 2 : 1) : 0;
  const yTicks = [];
  for (let v = lo; v <= hi + step / 2; v += step) yTicks.push(v);
  const grid = yTicks.map(v => `<line class="grid" x1="${left}" x2="${W - right}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="tick" x="${left - 7}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmtNum(v, tickDec)}</text>`).join('');
  // Date ticks: months for longer spans, weeks for short ones.
  const spanDays = (x1 - x0) / 864e5;
  const xt = [];
  if (spanDays > 75) {
    let d = new Date(x0); d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
    while (d.getTime() <= x1) { xt.push(new Date(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12); }
  } else {
    let d = startOfWeek(new Date(x0));
    if (d.getTime() < x0) d = addDays(d, 7);
    const every = spanDays > 35 ? 14 : 7;
    while (d.getTime() <= x1) { xt.push(d); d = addDays(d, every); }
  }
  const keep = Math.ceil(xt.length / (W < 480 ? 4 : 6));
  const multiYear = new Date(x0).getFullYear() !== new Date(x1).getFullYear();
  const xLabels = xt.filter((_, i) => i % keep === 0).map(d => {
    const label = spanDays > 75 ? d.toLocaleDateString(undefined, multiYear ? { month: 'short', year: '2-digit' } : { month: 'short' }) : shortDate(d);
    return `<text class="tick" x="${X(dateKey(d)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(label)}</text>`;
  }).join('');
  const line = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  const paths = series.map(s => `${s.cls === 'dots' ? '' : `<path class="lc ${s.cls}" d="${line(s.points)}"/>`}
    ${s.points.map(p => `<circle class="ld ${s.cls}" cx="${X(p.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${s.points.length > 60 ? 2.5 : 3.5}"/>`).join('')}`).join('');
  const trendPath = trend && trend.length > 1 ? `<path class="lc trend" d="${line(trend)}"/>` : '';
  // Hover/tap bands, one per date.
  const dates = [...new Set(all.map(p => p.d))].sort();
  const cols = dates.map((d, i) => {
    const xa = i ? (X(dates[i - 1]) + X(d)) / 2 : left, xb = i < dates.length - 1 ? (X(d) + X(dates[i + 1])) / 2 : W - right;
    const rows = series.map(s => { const p = s.points.find(q => q.d === d); return p ? `${series.length > 1 ? s.name + ': ' : ''}${fmtNum(p.v, dec)} ${unit}` : ''; }).filter(Boolean);
    const tp = trend?.find(q => q.d === d);
    if (tp) rows.push(`Trend: ${fmtNum(tp.v, dec)} ${unit}`);
    const tip = [longDate(parseDate(d)), ...rows].join('|');
    return `<g class="col" data-tip="${esc(tip)}" tabindex="0" role="img" aria-label="${esc(tip.replace(/\|/g, ', '))}"><rect class="hit" x="${xa.toFixed(1)}" y="${top}" width="${Math.max(1, xb - xa).toFixed(1)}" height="${H - top - bottom}"/><line class="hover-line" x1="${X(d).toFixed(1)}" x2="${X(d).toFixed(1)}" y1="${top}" y2="${H - bottom}"/></g>`;
  }).join('');
  return `<div class="chart-wrap"><svg class="chart line-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Chart over time">
    ${grid}<line class="axis" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>${xLabels}${trendPath}${paths}${cols}</svg>
    <div class="chart-tip" hidden></div></div>`;
}

// ---------------------------------------------------------- spot detail ----

actions['body-spot'] = el => spotDetail(el.dataset.id);
function spotDetail(id) {
  const s = spotDef(id);
  if (!s) return;
  const sides = spotSides(s);
  const keys = sides.map(side => spotKey(s.id, side));
  const series = keys.map(k => seriesOf(k));
  const tile = (label, value, sub = '') => `<div class="stat small-stat"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;
  const tiles = keys.map((k, i) => {
    const sr = series[i], last = sr.at(-1), first = sr[0];
    const label = sides[i] ? SIDE_NAMES[sides[i]] : 'Latest';
    return tile(label, last ? esc(showVal(k, last.v)) : '–', last && sr.length > 1 ? `${changeText(k, last.v - first.v)} since ${esc(shortDate(parseDate(first.d)))}` : last ? esc(shortDate(parseDate(last.d))) : 'not measured yet');
  }).join('');
  const chartSeries = keys.map((k, i) => ({ name: sides[i] ? SIDE_NAMES[sides[i]] : s.name, cls: i ? 'b' : 'a', points: series[i].map(p => ({ d: p.d, v: cmToDisplay(p.v) })) })).filter(x => x.points.length);
  const chart = chartSeries.some(x => x.points.length > 1)
    ? `${chartSeries.length > 1 ? `<div class="legend-row">${chartSeries.map(x => `<span class="legend-item"><i class="key line-key ${x.cls}"></i>${esc(x.name)}</span>`).join('')}</div>` : ''}${bodyChart({ series: chartSeries, unit: lengthUnit(), dec: imperial() ? 2 : 1, width: Math.min(640, innerWidth - 72) })}`
    : '<p class="muted small">Measure this spot a couple of times to see a chart.</p>';
  const dates = [...new Set(series.flat().map(p => p.d))].sort().reverse();
  const rows = dates.slice(0, 60).map(d => `<tr><td>${esc(shortDate(parseDate(d)))} <small class="muted">${parseDate(d).getFullYear()}</small></td>${keys.map(k => {
    const v = bodyEntry(d)?.m[k];
    const prev = v != null ? previousValue(k, d) : null;
    return `<td>${v != null ? `<strong>${esc(showVal(k, v))}</strong>${prev ? ` <small class="muted">${changeText(k, v - prev.v)}</small>` : ''}` : '<span class="muted">–</span>'}</td>`;
  }).join('')}</tr>`).join('');
  const head = sides[0] ? `<thead><tr><th>Date</th>${sides.map(x => `<th>${SIDE_NAMES[x]}</th>`).join('')}</tr></thead>` : '';
  showModal(modalHead(s.name, esc(s.hint || 'Measure at the same spot and the same time of day each time.'))
    + `<div class="stats compact">${tiles}</div>${chart}
    ${rows ? `<div class="table-scroll"><table class="sets spot-table">${head}<tbody>${rows}</tbody></table></div>` : ''}
    <div class="modal-actions"><button class="btn light" data-action="close">Close</button>
      <button class="btn" data-action="measure-spot" data-id="${s.id}">${bodyEntry(todayKey())?.m[keys[0]] != null ? 'Change today’s' : 'Add today’s'}</button></div>`);
}
actions['measure-spot'] = el => openMeasure({ only: el.dataset.id });

// ----------------------------------------------------------- photos ----

function photoFrame(id, { label = '', action = '', date = '', big = false } = {}) {
  const blur = state.body.blur ? 'blurred' : '';
  const attrs = action ? `data-action="${action}" data-date="${date}"` : 'data-action="photo-reveal"';
  return `<button type="button" class="photo-frame ${blur} ${big ? 'big' : ''}" ${attrs} aria-label="${esc(label || 'Progress photo')}">
    <img class="photo-img" data-photo-id="${esc(id)}" alt="${esc(label)}"><span class="photo-veil">Tap to show</span></button>`;
}
actions['photo-reveal'] = el => el.classList.toggle('revealed');
actions['photo-open'] = el => {
  if (el.classList.contains('blurred') && !el.classList.contains('revealed')) { el.classList.add('revealed'); return; }
  openCompare(el.dataset.date);
};

function photoSets() { return state.body.entries.filter(e => e.photos && Object.keys(e.photos).length); }

function photosPanel() {
  const sets = photoSets();
  const last = sets.at(-1);
  const poseName = p => p[0].toUpperCase() + p.slice(1);
  const body = last
    ? `<p class="muted small">Latest: ${esc(longDate(parseDate(last.date)))}${sets.length > 1 ? ` · ${plural(sets.length, 'set')} so far` : ''}</p>
      <div class="photo-row">${PHOTO_POSES.filter(p => last.photos[p]).map(p => `<figure>${photoFrame(last.photos[p], { label: `${poseName(p)}, ${shortDate(parseDate(last.date))}`, action: 'photo-open', date: last.date })}<figcaption>${poseName(p)}</figcaption></figure>`).join('')}</div>
      ${sets.length > 1 ? `<div class="photo-strip">${sets.slice().reverse().map(e => `<button class="text-btn" data-action="photo-compare" data-date="${e.date}">${esc(shortDate(parseDate(e.date)))}</button>`).join('')}</div>` : ''}`
    : '<p class="muted small">Optional. Front, side and back about once a month show changes the tape can’t. They stay on this device.</p>';
  return `<section class="panel"><div class="panel-head"><h2>Progress photos</h2>
      <div class="row">${sets.length > 1 ? '<button class="btn small light" data-action="photo-compare">Compare</button>' : ''}<button class="btn small ${last ? 'light' : ''}" data-action="body-photos-add">${icon('camera')} ${last ? 'New photos' : 'Add photos'}</button></div></div>
    ${body}</section>`;
}
actions['body-photos-add'] = () => openMeasure({ only: 'photos' });
actions['photo-compare'] = el => openCompare(el.dataset.date);

let compareView = { pose: 'front', a: '', b: '' };
function openCompare(dateB) {
  const sets = photoSets();
  if (!sets.length) return;
  const poses = PHOTO_POSES.filter(p => sets.some(e => e.photos[p]));
  if (!poses.includes(compareView.pose)) compareView.pose = poses[0];
  const withPose = sets.filter(e => e.photos[compareView.pose]);
  if (dateB) compareView.b = dateB;
  if (!withPose.some(e => e.date === compareView.b)) compareView.b = withPose.at(-1).date;
  if (!withPose.some(e => e.date === compareView.a) || compareView.a === compareView.b) compareView.a = withPose[0].date === compareView.b && withPose.length > 1 ? withPose[1].date : withPose[0].date;
  renderCompare();
}
function renderCompare() {
  const sets = photoSets();
  const pose = compareView.pose;
  const withPose = sets.filter(e => e.photos[pose]);
  const poses = PHOTO_POSES.filter(p => sets.some(e => e.photos[p]));
  const col = which => {
    const e = bodyEntry(compareView[which]);
    const facts = [e.weight ? showVal('weight', e.weight) : '', e.m.waist ? `waist ${showVal('waist', e.m.waist)}` : ''].filter(Boolean).join(' · ');
    return `<div class="compare-col"><select data-bind="compare-${which}" aria-label="${which === 'a' ? 'Earlier' : 'Later'} photo date">${withPose.map(x => `<option value="${x.date}" ${x.date === e.date ? 'selected' : ''}>${esc(parseDate(x.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}</option>`).join('')}</select>
      ${photoFrame(e.photos[pose], { label: `${pose}, ${e.date}`, big: true })}<small class="muted">${esc(facts)}</small></div>`;
  };
  const labels = Object.fromEntries(PHOTO_POSES.map(p => [p, p[0].toUpperCase() + p.slice(1)]));
  showModal(modalHead('Compare photos', 'Side by side, so you can see what changed.')
    + (poses.length > 1 ? chips('compare-pose', poses, pose, labels, 'compact') : '')
    + `<div class="compare-grid">${col('a')}${col('b')}</div>
    <div class="modal-actions"><button class="btn" data-action="close">Done</button></div>`, { wide: true, keepScroll: true });
  hydratePhotos($('#modal'));
}
chipHandlers['compare-pose'] = v => { compareView.pose = v; openCompare(); };
binds['compare-a'] = el => { compareView.a = el.value; renderCompare(); };
binds['compare-b'] = el => { compareView.b = el.value; renderCompare(); };

// ----------------------------------------------------------- history ----

function bodyHistory() {
  const list = state.body.entries.slice().reverse();
  if (!list.length) return '';
  let month = '';
  const rows = list.slice(0, bodyHistoryLimit).map(e => {
    const d = parseDate(e.date);
    const m = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const head = m !== month ? `<h3 class="month">${esc(m)}</h3>` : '';
    month = m;
    const n = Object.keys(e.m).length, photos = Object.keys(e.photos || {}).length;
    const facts = [e.weight ? showVal('weight', e.weight) : '', e.fat ? `${fmtNum(e.fat, 1)} % fat` : '', n ? plural(n, 'measurement') : '', photos ? plural(photos, 'photo') : ''].filter(Boolean);
    return `${head}<button class="history-row" data-action="measure" data-date="${e.date}">
      <span class="dot body-dot" aria-hidden="true"></span>
      <span class="history-main"><strong>${esc(d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</strong><small>${facts.map(esc).join(' · ')}${e.note ? ` · “${esc(e.note.slice(0, 60))}${e.note.length > 60 ? '…' : ''}”` : ''}</small></span>
      <span class="history-kind">Edit</span></button>`;
  }).join('');
  return `<section class="history-section"><div class="section-head"><h2>Check-ins</h2><button class="text-btn" data-action="export-body-csv">Export as spreadsheet (CSV)</button></div>
    <div class="history-list compact">${rows}</div>
    ${list.length > bodyHistoryLimit ? `<button class="btn light" data-action="more-body-history">Show ${list.length - bodyHistoryLimit > 30 ? 'more' : 'all'}</button>` : ''}</section>`;
}
actions['more-body-history'] = () => { bodyHistoryLimit += 30; render(); };

// --------------------------------------------------------- check-in ----
// One step per thing to measure, so a weekly check-in is quick: weight, each spot, photos, done.

let measure = null;
/** Starting points for the +/− buttons the very first time (cm). */
const BODY_TYPICAL = { neck: 34, shoulders: 105, chest: 90, underbust: 75, arm: 28, forearm: 24, waist: 72, belly: 82, hips: 98, thigh: 56, midthigh: 48, calf: 36 };

function openMeasure({ date = todayKey(), only = null, at = null } = {}) {
  if (session) { toast('Finish or end your current session first.'); return; }
  const steps = only ? [only] : ['weight', ...activeSpots().map(s => s.id), ...(state.body.photos ? ['photos'] : []), 'done'];
  measure = { date, single: !!only, steps, i: 0, vals: {}, loaded: new Set(), linked: {}, source: {}, photos: {}, previews: {}, note: '', noteLoaded: false, dirty: false, focus: !!only };
  loadMeasureDate(date);
  if (at && steps.includes(at)) measure.i = steps.indexOf(at);
  renderMeasure();
}

/** Fill the check-in from what is already saved for that date (without overwriting typed values). */
function loadMeasureDate(date) {
  const m = measure, e = bodyEntry(date);
  m.existing = !!e;
  if (e) {
    for (const k of ['weight', 'fat']) if (e[k] != null && m.vals[k] == null) { m.vals[k] = e[k]; m.loaded.add(k); }
    for (const [k, v] of Object.entries(e.m)) if (m.vals[k] == null) { m.vals[k] = v; m.loaded.add(k); }
    for (const [p, id] of Object.entries(e.photos || {})) if (!(p in m.photos)) m.photos[p] = id;
    if (!m.note && e.note) { m.note = e.note; m.noteLoaded = true; }
  }
  for (const s of activeSpots().filter(x => x.paired)) {
    const r = m.vals[`${s.id}-r`], l = m.vals[`${s.id}-l`];
    if (r != null || l != null) m.linked[s.id] = r === l;
    else {
      const pr = previousValue(`${s.id}-r`, date), pl = previousValue(`${s.id}-l`, date);
      m.linked[s.id] = !pr || !pl || pr.d !== pl.d || Math.abs(pr.v - pl.v) < 0.01;
    }
  }
}

function stepKeys(step) {
  if (step === 'weight') return state.body.fat ? ['weight', 'fat'] : ['weight'];
  const s = spotDef(step);
  return s ? spotSides(s).map(side => spotKey(s.id, side)) : [];
}
function measureStepTitle(step) {
  if (step === 'weight') return state.body.fat ? 'Weight & body fat' : 'Weight';
  if (step === 'photos') return 'Progress photos';
  if (step === 'done') return 'All set';
  return spotDef(step)?.name || step;
}
function stepFilled(step) {
  if (step === 'photos') return PHOTO_POSES.some(p => measure.photos[p]);
  if (step === 'done') return false;
  return stepKeys(step).some(k => measure.vals[k] != null);
}

function measureField(key, label) {
  const k = valueKind(key);
  const v = measure.vals[key];
  const prev = previousValue(key, measure.date);
  return `<div class="m-field"><label class="m-label" for="m-${key}">${esc(label)}</label>
    <div class="stepper"><button type="button" data-action="m-adj" data-k="${key}" data-d="-1" aria-label="Less ${esc(label)}">−</button>
    <input id="m-${key}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next" data-bind="m-input" data-k="${key}"
      value="${v != null ? showNum(key, v) : ''}" placeholder="${prev ? showNum(key, prev.v) : ''}">
    <button type="button" data-action="m-adj" data-k="${key}" data-d="1" aria-label="More ${esc(label)}">+</button></div>
    <span class="m-unit">${esc(k.unit)}</span></div>`;
}
function lastLine(keys) {
  const prevs = keys.map(k => previousValue(k, measure.date));
  const any = prevs.find(Boolean);
  if (!any) return keys[0] === 'weight' && !state.body.entries.length ? '<p class="muted small m-last">Your first check-in! Next time, your last numbers show up here.</p>' : '';
  const same = keys.length > 1 && prevs.every(p => p && p.d === any.d && Math.abs(p.v - any.v) < 0.01);
  const parts = same ? [`${showVal(keys[0], any.v)} on both sides`]
    : keys.map((k, i) => (prevs[i] ? `${keys.length > 1 && keyInfo(k)?.side ? keyInfo(k).side.toUpperCase() + ' ' : ''}${showVal(k, prevs[i].v)}` : '')).filter(Boolean);
  return `<p class="muted small m-last">Last time (${esc(shortDate(parseDate(any.d)))}): <strong>${esc(parts.join(' · '))}</strong></p>`;
}

function stepBody(step) {
  const m = measure;
  if (step === 'weight') {
    return `<div class="m-step">
      ${m.single ? '' : `<div class="field m-date"><label for="m-date">Date</label><input id="m-date" type="date" value="${m.date}" max="${todayKey()}" data-bind="m-date"></div>`}
      ${measureField('weight', 'Weight')}${lastLine(['weight'])}
      ${state.body.fat ? measureField('fat', 'Body fat') + lastLine(['fat']) : ''}
      <p class="muted small m-hint">Weigh yourself under the same conditions each time: ideally in the morning, after the bathroom, before eating or drinking.</p></div>`;
  }
  if (step === 'photos') {
    const last = photoSets().filter(e => e.date < m.date).at(-1);
    return `<div class="m-step"><p class="muted small">Optional. Once a month is plenty. Same place, light, distance and clothes each time; a timer or a mirror helps. They stay on this device.</p>
      <div class="photo-slots">${PHOTO_POSES.map(p => photoSlot(p)).join('')}</div>
      ${last ? `<p class="muted small">Last photos: ${esc(longDate(parseDate(last.date)))}</p>` : ''}</div>`;
  }
  if (step === 'done') {
    const rows = ['weight', 'fat', ...activeKeys()].filter(k => m.vals[k] != null).map(k => {
      const prev = previousValue(k, m.date);
      return `<tr><td>${esc(k === 'weight' ? 'Weight' : k === 'fat' ? 'Body fat' : keyLabel(k))}</td><td><strong>${esc(showVal(k, m.vals[k]))}</strong></td><td class="muted">${prev ? changeText(k, m.vals[k] - prev.v) : ''}</td></tr>`;
    }).join('');
    const photos = PHOTO_POSES.filter(p => m.photos[p]).length;
    return `<div class="m-step">
      ${rows ? `<div class="table-scroll"><table class="sets"><tbody>${rows}</tbody></table></div>` : '<p class="muted">Nothing entered yet. Go back to add numbers, or save just a note.</p>'}
      ${photos ? `<p class="small">${icon('camera')} ${plural(photos, 'photo')}</p>` : ''}
      <div class="field"><label for="m-note">Note (optional)</label><textarea id="m-note" maxlength="1000" data-bind="m-note" placeholder="e.g. started Core A/B this week">${esc(m.note)}</textarea></div>
      ${m.existing ? '<button type="button" class="text-btn danger-text" data-action="m-delete">Delete this check-in</button>' : ''}</div>`;
  }
  const s = spotDef(step);
  const sides = spotSides(s);
  const keys = sides.map(side => spotKey(s.id, side));
  const fields = sides.length === 2
    ? `${measureField(keys[0], 'Right')}${linkButton(s.id)}${measureField(keys[1], 'Left')}`
    : measureField(keys[0], sides[0] ? SIDE_NAMES[sides[0]] : s.name);
  return `<div class="m-step m-spot">
    <div class="m-figure">${BODY_SPOT_IDS.includes(s.id) ? miniFigure(keys) : `<div class="own-badge">${icon('body')}</div>`}</div>
    <div class="m-main"><p class="muted small m-hint">${esc(s.hint || 'Measure at exactly the same spot each time. A pen dot on the skin the first time helps.')}</p>
      <div class="m-fields ${sides.length === 2 ? 'pair' : ''}">${fields}</div>${lastLine(keys)}</div></div>`;
}
function linkButton(id) {
  const on = measure.linked[id];
  return `<button type="button" class="m-link ${on ? 'on' : ''}" data-action="m-link" data-id="${id}" aria-pressed="${on}" title="${on ? 'Left copies right until you change it' : 'Tap to copy one side to the other again'}">
    ${icon(on ? 'link' : 'unlink')}<span>${on ? 'Same' : 'Separate'}</span></button>`;
}
function photoSlot(pose) {
  const v = measure.photos[pose];
  const label = pose[0].toUpperCase() + pose.slice(1);
  const img = v instanceof Blob ? `<img class="photo-img" src="${measure.previews[pose]}" alt="${label}">` : v ? `<img class="photo-img" data-photo-id="${esc(v)}" alt="${label}">` : '';
  return `<div class="photo-slot"><label class="photo-frame ${v ? '' : 'empty'}">
      <input type="file" accept="image/*" data-bind="m-photo" data-pose="${pose}" class="visually-hidden">
      ${img || `<span class="photo-add">${icon('camera')}<span>Add</span></span>`}</label>
    <span class="photo-pose">${label}</span>${v ? `<button type="button" class="text-btn small" data-action="m-photo-remove" data-pose="${pose}">Remove</button>` : ''}</div>`;
}

function renderMeasure() {
  const m = measure, step = m.steps[m.i];
  const last = m.i === m.steps.length - 1;
  const dots = m.single ? '' : `<div class="m-progress">${m.steps.map((s, i) => `<button type="button" class="m-dot ${i === m.i ? 'on' : ''} ${stepFilled(s) ? 'filled' : ''}" data-action="m-goto" data-i="${i}" aria-label="${esc(measureStepTitle(s))}${i === m.i ? ' (current)' : ''}"></button>`).join('')}</div>`;
  const sub = `${m.single ? '' : `Step ${m.i + 1} of ${m.steps.length} · `}${longDate(parseDate(m.date))}`;
  const back = m.i === 0 ? '<button type="button" class="btn light" data-action="close">Cancel</button>' : '<button type="button" class="btn light" data-action="m-back">Back</button>';
  const optional = stepKeys(step).length || step === 'photos';
  const next = m.single || last ? '<button class="btn" data-action="m-save-btn">Save</button>'
    : `<button class="btn">${optional && !stepFilled(step) ? 'Skip' : 'Next'}</button>`;
  showModal(modalHead(measureStepTitle(step), esc(sub)) + `<form id="measure-form" class="measure" novalidate data-step="${esc(step)}">${dots}${stepBody(step)}
    <div class="modal-actions">${m.single ? '<button type="button" class="btn light" data-action="close">Cancel</button>' : back}${next}</div></form>`);
  hydratePhotos($('#modal'));
  if (m.focus) {
    const input = $('#measure-form input[data-bind="m-input"]');
    if (input && !matchMedia('(pointer: coarse)').matches) input.focus();
    else if (input && m.i > 0) input.focus({ preventScroll: true });
  }
}

/** Check the typed numbers on the current step. Returns false (and says why) if one is off. */
function checkMeasureStep() {
  for (const input of $$('#measure-form input[data-bind="m-input"]')) {
    const key = input.dataset.k, k = valueKind(key);
    const n = parseDecimal(input.value);
    if (n === null) continue;
    const lo = k.toShow(k.min), hi = k.toShow(k.max);
    if (!Number.isFinite(n) || n < lo || n > hi) {
      toast(Number.isFinite(n) ? `That looks off. Type a number between ${fmtNum(lo, 0)} and ${fmtNum(hi, 0)} ${k.unit}.` : 'Type a number, like 72.5');
      input.focus();
      input.select?.();
      return false;
    }
  }
  return true;
}

forms['measure-form'] = () => {
  if (!measure || !checkMeasureStep()) return;
  if (measure.single || measure.i === measure.steps.length - 1) { saveMeasure(); return; }
  measure.i++;
  measure.focus = true;
  renderMeasure();
};
actions['m-save-btn'] = (el, ev) => { ev.preventDefault?.(); forms['measure-form'](); };
actions['m-back'] = () => { if (measure && measure.i > 0) { measure.i--; measure.focus = false; renderMeasure(); } };
actions['m-goto'] = el => { if (!measure || !checkMeasureStep()) return; measure.i = Number(el.dataset.i); measure.focus = false; renderMeasure(); };

/** The phone's back button steps back through the check-in before closing it. */
function measureStepBack() {
  if (!measure || measure.single || !$('#measure-form') || measure.i === 0) return false;
  actions['m-back']();
  return true;
}
function guardMeasureClose() {
  if (!measure || !$('#measure-form')) return false;
  if (!measure.dirty) { measure = null; return false; }
  confirmDialog({
    title: 'Discard this check-in?', yes: 'Discard', body: '<p>What you entered has not been saved yet.</p>',
    onYes: () => { measure = null; }, onNo: () => renderMeasure(),
  });
  return true;
}

function setMeasureValue(key, typed) {
  const n = parseDecimal(typed);
  measure.vals[key] = n === null || !Number.isFinite(n) ? undefined : Math.round(valueKind(key).toStore(n) * 100) / 100;
  measure.dirty = true;
}
/** Left and right copy each other until the copied side is changed by hand. */
function mirrorAfterInput(key) {
  const k = keyInfo(key);
  if (!k?.side || spotSides(k.spot).length < 2) return;
  const id = k.spot.id, other = k.side === 'r' ? 'l' : 'r';
  if (!measure.linked[id]) return;
  if (!measure.source[id] || measure.source[id] === k.side) {
    measure.source[id] = k.side;
    const otherKey = spotKey(id, other);
    measure.vals[otherKey] = measure.vals[key];
    const input = $(`#m-${otherKey}`);
    if (input) input.value = measure.vals[key] != null ? showNum(otherKey, measure.vals[key]) : '';
  } else {
    measure.linked[id] = false;
    const btn = $(`.m-link[data-id="${id}"]`);
    if (btn) btn.outerHTML = linkButton(id);
  }
}
binds['m-input'] = el => {
  if (!measure) return;
  setMeasureValue(el.dataset.k, el.value);
  mirrorAfterInput(el.dataset.k);
  updateMeasureDots();
};
actions['m-adj'] = el => {
  const key = el.dataset.k, input = $(`#m-${key}`);
  if (!input) return;
  const k = valueKind(key);
  const typed = parseDecimal(input.value);
  const typical = key === 'weight' ? 65 : key === 'fat' ? 25 : BODY_TYPICAL[keyInfo(key)?.spot.id] ?? 30;
  const start = Number.isFinite(typed) && typed !== null ? typed : parseDecimal(input.placeholder) ?? fmtNum(k.toShow(typical), k.dec) * 1;
  const next = clamp(Math.round((start + Number(el.dataset.d) * k.step) / k.step) * k.step, k.toShow(k.min), k.toShow(k.max));
  input.value = fmtNum(next, k.dec);
  binds['m-input'](input);
};
actions['m-link'] = el => {
  const id = el.dataset.id;
  measure.linked[id] = !measure.linked[id];
  if (measure.linked[id]) {
    const r = spotKey(id, 'r'), l = spotKey(id, 'l');
    const from = measure.vals[r] != null ? 'r' : 'l';
    measure.source[id] = from;
    const src = measure.vals[spotKey(id, from)];
    measure.vals[from === 'r' ? l : r] = src;
    measure.dirty = true;
  }
  renderMeasure();
};
binds['m-date'] = el => {
  if (!isValidDateKey(el.value) || el.value > todayKey()) { el.value = measure.date; toast('Choose today or an earlier date.'); return; }
  if (el.value === measure.date) return;
  const typed = measure.dirty;
  const keep = typed ? { vals: measure.vals, photos: measure.photos, note: measure.note } : null;
  measure.date = el.value;
  measure.vals = keep ? Object.fromEntries(Object.entries(keep.vals).filter(([k]) => !measure.loaded.has(k))) : {};
  measure.photos = keep ? Object.fromEntries(Object.entries(keep.photos).filter(([, v]) => v instanceof Blob)) : {};
  measure.note = keep && !measure.noteLoaded ? keep.note : '';
  measure.loaded = new Set();
  measure.noteLoaded = false;
  loadMeasureDate(el.value);
  renderMeasure();
};
binds['m-note'] = el => { if (measure) { measure.note = el.value; measure.dirty = true; } };
binds['m-photo'] = async el => {
  const file = el.files?.[0];
  const pose = el.dataset.pose;
  el.value = '';
  if (!file || !measure) return;
  try {
    const blob = await shrinkPhoto(file);
    if (measure.previews[pose]) URL.revokeObjectURL(measure.previews[pose]);
    measure.photos[pose] = blob;
    measure.previews[pose] = URL.createObjectURL(blob);
    measure.dirty = true;
    renderMeasure();
  } catch (err) { toast(err.message || 'This photo could not be used.'); }
};
actions['m-photo-remove'] = el => {
  const pose = el.dataset.pose;
  if (measure.previews[pose]) URL.revokeObjectURL(measure.previews[pose]);
  delete measure.previews[pose];
  measure.photos[pose] = null;
  measure.dirty = true;
  renderMeasure();
};
function updateMeasureDots() {
  const dots = $$('#measure-form .m-dot');
  measure.steps.forEach((s, i) => dots[i]?.classList.toggle('filled', stepFilled(s)));
  const step = measure.steps[measure.i];
  const btn = $('#measure-form .modal-actions .btn:not(.light):not([data-action])');
  if (btn && (stepKeys(step).length || step === 'photos')) btn.textContent = stepFilled(step) ? 'Next' : 'Skip';
}

let measureSaving = false;
async function saveMeasure() {
  if (measureSaving) return;
  measureSaving = true;
  try {
    const m = measure;
    const steps = m.steps;
    const noteEl = $('#m-note');
    if (noteEl) m.note = noteEl.value;
    const keys = steps.flatMap(stepKeys);
    let e = bodyEntry(m.date);
    if (!e) { e = { date: m.date, m: {} }; state.body.entries.push(e); }
    for (const k of keys) {
      const v = m.vals[k];
      const target = k === 'weight' || k === 'fat' ? e : e.m;
      if (v != null) target[k] = v;
      else if (m.loaded.has(k)) delete target[k];
    }
    let photoTrouble = false;
    if (steps.includes('photos')) {
      const keep = { ...(e.photos || {}) };
      const puts = {};
      for (const pose of PHOTO_POSES) {
        const v = m.photos[pose];
        if (v instanceof Blob) { const id = 'p-' + uid().replace(/[^a-zA-Z0-9-]/g, ''); puts[id] = v; keep[pose] = id; }
        else if (v === null) delete keep[pose];
      }
      try { if (Object.keys(puts).length) await photoPutMany(puts); }
      catch {
        photoTrouble = true;
        for (const [pose, id] of Object.entries(keep)) if (puts[id]) delete keep[pose];
      }
      if (Object.keys(keep).length) e.photos = keep; else delete e.photos;
    }
    if (steps.includes('done')) { if (m.note.trim()) e.note = m.note.trim().slice(0, 1000); else delete e.note; }
    if (e.weight == null && e.fat == null && !Object.keys(e.m).length && !e.photos && !e.note) state.body.entries = state.body.entries.filter(x => x !== e);
    state.body.entries.sort((a, b) => a.date.localeCompare(b.date));
    Object.values(m.previews).forEach(url => URL.revokeObjectURL(url));
    measure = null;
    save(); closeModal(); render();
    prunePhotos();
    toast(photoTrouble ? 'Saved, but the photos could not be stored on this device.' : 'Saved. Look at you, keeping track!');
  } finally { measureSaving = false; }
}
actions['m-delete'] = () => {
  const date = measure.date;
  confirmDialog({
    title: 'Delete this check-in?', yes: 'Delete', body: `<p>Everything measured on ${esc(longDate(parseDate(date)))} will be removed, photos included.</p>`,
    onYes: () => { state.body.entries = state.body.entries.filter(e => e.date !== date); measure = null; save(); render(); prunePhotos(); toast('Check-in deleted.'); },
    onNo: () => renderMeasure(),
  });
};
actions.measure = el => openMeasure({ date: el.dataset.date || todayKey() });

// --------------------------------------------------------- customize ----

function openCustomize() {
  const b = state.body;
  const on = new Set(b.spots);
  const groups = [...new Set(BODY_SPOTS.map(s => s.group))];
  const order = [0, 1, 2, 3, 4, 5, 6].map(i => (i + state.settings.weekStart) % 7);
  const dayName = i => addDays(parseDate('2026-01-04'), i).toLocaleDateString(undefined, { weekday: 'short' });   // 4 Jan 2026 is a Sunday
  const sideRow = s => {
    const v = b.sides[s.id] || 'both';
    const radio = (val, label) => `<label class="seg-option"><input type="radio" name="side-${s.id}" value="${val}" data-bind="body-side" data-id="${s.id}" ${v === val ? 'checked' : ''}><span>${label}</span></label>`;
    return `<div class="side-row"><span>${esc(s.name)}</span><div class="segmented">${radio('both', 'Both')}${radio('right', 'Right')}${radio('left', 'Left')}</div></div>`;
  };
  const toggle = (name, label, hint = '') => `<label class="toggle-row"><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="switch" data-bind="body-pref" name="${name}" ${b[name] ? 'checked' : ''}></label>`;
  const paired = [...BODY_SPOTS, ...b.custom].filter(s => s.paired && on.has(s.id));
  showModal(modalHead('Customize body tracking', 'Changes save right away. Past numbers are kept.') + `<div class="customize">
    <h3>What to measure</h3><p class="muted small">Fewer spots make check-ins quicker.</p>
    ${groups.map(g => `<p class="label">${esc(g)}</p><div class="gear-grid">${BODY_SPOTS.filter(s => s.group === g).map(s => `<label class="gear-chip"><input type="checkbox" value="${s.id}" data-bind="body-spot-toggle" ${on.has(s.id) ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('')}</div>`).join('')}
    ${paired.length ? `<p class="label">Sides</p><p class="muted small">Measure both sides, or just one if that suits your body better.</p><div class="side-rows">${paired.map(sideRow).join('')}</div>` : ''}

    <h3>Your own spots</h3>
    ${b.custom.length ? `<div class="own-list">${b.custom.map(c => `<div class="own-item"><label class="checkrow"><input type="checkbox" value="${c.id}" data-bind="body-spot-toggle" ${on.has(c.id) ? 'checked' : ''}> ${esc(c.name)}${c.paired ? ' <small class="muted">(left and right)</small>' : ''}</label>
      <button type="button" class="text-btn danger-text" data-action="body-remove-spot" data-id="${c.id}">Remove</button></div>`).join('')}</div>` : '<p class="muted small">Anything else you want to track, like knees or wrists.</p>'}
    <div class="own-add"><input id="cz-name" type="text" maxlength="40" placeholder="Name, e.g. Knee" aria-label="New spot name" data-bind="cz-name">
      <label class="checkrow"><input id="cz-paired" type="checkbox"> Left and right</label>
      <button type="button" class="btn light" data-action="body-add-spot">${icon('plus')} Add</button></div>

    <h3>Also track</h3>
    ${toggle('fat', 'Body fat %', 'For a smart scale or calipers')}
    ${toggle('photos', 'Progress photos', 'Front, side and back, about once a month')}
    ${b.photos ? toggle('blur', 'Blur photos until tapped', 'Handy if someone looks over your shoulder') + toggle('backupPhotos', 'Include photos in backups', 'Turn off for smaller backup files') : ''}

    <h3>Figure</h3>
    <div class="segmented">${['curvy', 'straight'].map(f => `<label class="seg-option"><input type="radio" name="figure" value="${f}" data-bind="body-figure" ${b.figure === f ? 'checked' : ''}><span>${f === 'curvy' ? 'Curvy' : 'Straight'}</span></label>`).join('')}</div>

    <h3>Measuring days</h3>
    <p class="muted small">They show on My week with a Measure button. Forma can’t send notifications while it’s closed.</p>
    <div class="weekday-picker">${order.map(i => `<label class="weekday"><input type="checkbox" value="${i}" data-bind="body-days" ${b.days.includes(i) ? 'checked' : ''}><span>${esc(dayName(i))}</span></label>`).join('')}</div>

    <h3>Your data</h3>
    <p class="muted small" id="photo-usage">${b.entries.length ? plural(b.entries.length, 'check-in') : 'No check-ins yet'}.</p>
    <div class="row"><button type="button" class="btn light" data-action="export-body-csv">Export as spreadsheet (CSV)</button>
      ${usedPhotoIds().length ? '<button type="button" class="btn danger" data-action="body-delete-photos">Delete all photos</button>' : ''}</div>
  </div><div class="modal-actions"><button class="btn" data-action="close">Done</button></div>`, { keepScroll: $('#modal').open && !!$('#modal .customize') });
  photoStats().then(st => {
    const el = $('#photo-usage');
    if (el && st.count) el.textContent += ` ${plural(st.count, 'photo')}, about ${st.bytes < 1e6 ? Math.max(1, Math.round(st.bytes / 1e3)) + ' KB' : fmtNum(st.bytes / 1e6, 1) + ' MB'} on this device.`;
  }).catch(() => {});
}
actions['body-customize'] = () => openCustomize();
function bodyChanged() { save(); render(); openCustomize(); }
binds['body-spot-toggle'] = el => {
  const b = state.body;
  if (el.checked && !b.spots.includes(el.value)) b.spots.push(el.value);
  if (!el.checked) b.spots = b.spots.filter(x => x !== el.value);
  bodyChanged();
};
binds['body-side'] = el => { if (el.value === 'both') delete state.body.sides[el.dataset.id]; else state.body.sides[el.dataset.id] = el.value; bodyChanged(); };
binds['body-pref'] = el => { state.body[el.name] = el.checked; bodyChanged(); };
binds['body-figure'] = el => { state.body.figure = el.value === 'straight' ? 'straight' : 'curvy'; bodyChanged(); };
binds['body-days'] = el => {
  const d = Number(el.value);
  state.body.days = el.checked ? [...new Set([...state.body.days, d])].sort() : state.body.days.filter(x => x !== d);
  bodyChanged();
};
actions['body-add-spot'] = () => {
  const name = $('#cz-name').value.trim();
  if (!name) { toast('Give the spot a name.'); $('#cz-name').focus(); return; }
  const taken = [...BODY_SPOTS, ...state.body.custom].some(s => s.name.toLowerCase() === name.toLowerCase());
  if (taken) { toast('You already have a spot with that name.'); return; }
  if (state.body.custom.length >= 40) { toast('That is the maximum number of your own spots.'); return; }
  const id = 'c-' + uid().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  state.body.custom.push({ id, name: name.slice(0, 40), paired: $('#cz-paired').checked });
  state.body.spots.push(id);
  bodyChanged();
  toast(`“${name}” added to your check-ins.`);
};
actions['body-remove-spot'] = el => {
  const c = state.body.custom.find(x => x.id === el.dataset.id);
  const n = state.body.entries.filter(e => Object.keys(e.m).some(k => k === c.id || k.startsWith(c.id + '-'))).length;
  confirmDialog({
    title: `Remove “${c.name}”?`, yes: 'Remove',
    body: `<p>${n ? `Its numbers from ${plural(n, 'check-in')} will be deleted too.` : 'It has no numbers yet.'} To only stop measuring it, untick it instead.</p>`,
    onYes: () => {
      const b = state.body;
      b.custom = b.custom.filter(x => x.id !== c.id);
      b.spots = b.spots.filter(x => x !== c.id);
      delete b.sides[c.id];
      for (const e of b.entries) for (const k of Object.keys(e.m)) if (k === c.id || k.startsWith(c.id + '-')) delete e.m[k];
      bodyChanged();
    },
    onNo: () => openCustomize(),
  });
};
actions['body-delete-photos'] = () => confirmDialog({
  title: 'Delete all progress photos?', yes: 'Delete photos',
  body: '<p>All photos are removed from this device. Your numbers stay. Backups you already made still contain their photos.</p>',
  onYes: async () => {
    for (const e of state.body.entries) delete e.photos;
    save();
    try { await photoClearAll(); } catch { /* nothing stored */ }
    render(); openCustomize(); toast('Photos deleted.');
  },
  onNo: () => openCustomize(),
});

// --------------------------------------------------------- My week ----

/** The "measuring day" line in the Today card, or the done check-in. */
function measureTodayItem() {
  const done = bodyEntry(todayKey());
  if (done) {
    const n = Object.keys(done.m).length;
    const facts = [done.weight ? showVal('weight', done.weight) : '', n ? plural(n, 'measurement') : ''].filter(Boolean).join(' · ');
    return `<div class="today-item done"><div><strong>Body check-in</strong><small>${esc(facts || 'Saved')}</small></div>
      <button class="done-badge" data-view="body">${icon('check')} Measured</button></div>`;
  }
  if (!state.body.days.includes(new Date().getDay())) return '';
  return `<div class="today-item"><div><strong>Measuring day</strong><small>Weight and measurements · about 2 min</small></div>
    <button class="btn lime" data-action="measure">Measure</button></div>`;
}
/** A small marker in the week calendar: measured, or a measuring day still to come. */
function bodyDayMark(d) {
  const key = dateKey(d);
  if (bodyEntry(key)) return `<button class="event body-mark done" data-view="body">${icon('check', 'event-check')}Measured</button>`;
  if (key >= todayKey() && state.body.days.includes(d.getDay())) {
    return `<button class="event body-mark" ${key === todayKey() ? 'data-action="measure"' : 'data-view="body"'}>${icon('body', 'event-check')}Measure</button>`;
  }
  return '';
}

// ------------------------------------------------------------ export ----

function exportBodyCSV() {
  const b = state.body;
  const known = [...BODY_SPOTS, ...b.custom].flatMap(s => (s.paired ? ['r', 'l'] : ['']).map(side => spotKey(s.id, side)));
  const used = new Set(b.entries.flatMap(e => Object.keys(e.m)));
  const keys = known.filter(k => used.has(k));
  const cell = v => { const t = String(v ?? ''); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [['date', `weight_${weightUnit()}`, 'body_fat_pct', ...keys.map(k => `${keyLabel(k)} (${lengthUnit()})`), 'photos', 'note']];
  for (const e of b.entries) {
    rows.push([e.date, e.weight ? showNum('weight', e.weight) : '', e.fat ?? '', ...keys.map(k => (e.m[k] != null ? showNum(k, e.m[k]) : '')),
      Object.keys(e.photos || {}).length || '', e.note || '']);
  }
  download(`forma-body-${todayKey()}.csv`, rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
  toast('Measurements exported as a spreadsheet file.');
}
actions['export-body-csv'] = () => exportBodyCSV();
