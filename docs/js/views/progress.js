// Progress: headline numbers, minutes per week, personal records and the full history.
'use strict';

let historyFilter = 'All';
let historyLimit = 30;
let showAllRecords = false;

renderers.progress = () => {
  if (!state.history.length) {
    app().innerHTML = heading('Every bit counts.', 'Your sessions, records and trends will build up here.')
      + emptyState('A fresh start', 'Finish a routine, use a timer or log an activity, and it will show up here.',
        '<div class="row center"><button class="btn" data-view="routines">Find a routine</button><button class="btn light" data-action="log-activity">Log an activity</button></div>')
      + importHint();
    return;
  }
  app().innerHTML = heading('Every bit counts.', 'What you have done, how it adds up, and where you are getting stronger.',
    `<button class="btn light" data-action="log-activity">${icon('plus')} Log activity</button>`)
    + statTiles()
    + `<section class="panel chart-panel"><div class="panel-head"><h2>Minutes per week</h2><span class="muted small">Last 12 weeks</span></div>${weeklyChart()}</section>`
    + recordsSection()
    + historySection();
};

function importHint() {
  return '<p class="muted small center">Coming from the previous Forma? Restore your backup in <button class="link" data-view="settings">Settings</button>.</p>';
}

function statTiles() {
  const weeks = weeklyTotals(2);
  const [last, now] = weeks;
  const diff = Math.round(now.total - last.total);
  const totalHours = sum(state.history, h => h.seconds) / 3600;
  const streak = weekStreak();
  const tile = (label, value, sub = '') => `<div class="stat"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;
  return `<section class="stats">
    ${tile('Minutes this week', Math.round(now.total), last.total || now.total ? `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} vs last week` : '')}
    ${tile('Sessions this week', now.sessions, `${last.sessions} last week`)}
    ${tile('Weekly streak', streak, streak === 1 ? 'week in a row' : 'weeks in a row')}
    ${tile('All time', state.history.length, `${fmtNum(totalHours, 1)} hours in total`)}</section>`;
}

// ---------------------------------------------------------------- chart ----

/** A clean axis: a round step (15, 30, 60 … minutes) and a top that is a multiple of it. */
function niceScale(v) {
  const step = [15, 30, 60, 120, 180, 300, 600].find(s => Math.max(v, 1) / s <= 4) || Math.ceil(v / 4 / 600) * 600;
  return { step, max: Math.max(step, Math.ceil(v / step) * step) };
}

/** Stacked columns of minutes per week, by activity group. Legend, hover tooltips and a table view. */
function weeklyChart() {
  const weeks = weeklyTotals(12);
  const { step, max } = niceScale(Math.max(...weeks.map(w => w.total)));
  const W = clamp(($('#app')?.clientWidth || 640) - 48, 300, 760), H = W < 480 ? 220 : 250, left = 40, right = 12, top = 18, bottom = 28;
  const plotW = W - left - right, plotH = H - top - bottom;
  const band = plotW / weeks.length, barW = Math.min(24, band * 0.6);
  const y = v => top + plotH - (v / max) * plotH;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const grid = ticks.map(t => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`).join('');
  const bars = weeks.map((w, i) => {
    const x = left + i * band + (band - barW) / 2;
    let base = top + plotH;
    const present = STAT_GROUPS.filter(g => w.groups[g] > 0);
    const segs = present.map((g, j) => {
      const h = (w.groups[g] / max) * plotH;
      const gap = j < present.length - 1 ? 2 : 0;   // 2px surface gap between stacked segments
      const segH = Math.max(0, h - gap);
      const yTop = base - h + gap;
      base -= h;
      const isTop = j === present.length - 1;
      const r = isTop ? Math.min(4, segH) : 0;
      const d = r
        ? `M${x} ${yTop + segH} V${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} H${x + barW - r} Q${x + barW} ${yTop} ${x + barW} ${yTop + r} V${yTop + segH} Z`
        : `M${x} ${yTop + segH} V${yTop} H${x + barW} V${yTop + segH} Z`;
      return `<path class="seg s${STAT_GROUPS.indexOf(g) + 1}" d="${d}"/>`;
    }).join('');
    const every = W < 480 ? 3 : 2;
    const label = (weeks.length - 1 - i) % every === 0 ? `<text class="tick" x="${x + barW / 2}" y="${H - 8}" text-anchor="middle">${esc(shortDate(w.start))}</text>` : '';
    const latest = i === weeks.length - 1 && w.total ? `<text class="bar-value" x="${x + barW / 2}" y="${y(w.total) - 6}" text-anchor="middle">${Math.round(w.total)}</text>` : '';
    const tip = `Week of ${shortDate(w.start)}|${Math.round(w.total)} min in total|` + present.map(g => `${g}: ${Math.round(w.groups[g])} min`).join('|');
    return `<g class="col" data-tip="${esc(tip)}" tabindex="0" role="img" aria-label="${esc(tip.replace(/\|/g, ', '))}"><rect class="hit" x="${left + i * band}" y="${top}" width="${band}" height="${plotH}"/>${segs}${label}${latest}</g>`;
  }).join('');
  const legend = STAT_GROUPS.map((g, i) => `<span class="legend-item"><i class="key s${i + 1}"></i>${g}</span>`).join('');
  const table = `<details class="table-view"><summary>Show as table</summary><div class="table-scroll"><table><thead><tr><th>Week of</th>${STAT_GROUPS.map(g => `<th>${g}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${weeks.slice().reverse().map(w => `<tr><td>${shortDate(w.start)}</td>${STAT_GROUPS.map(g => `<td>${Math.round(w.groups[g])}</td>`).join('')}<td><strong>${Math.round(w.total)}</strong></td></tr>`).join('')}</tbody></table></div></details>`;
  return `<div class="viz"><div class="legend-row">${legend}</div>
    <div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Minutes per week for the last 12 weeks, stacked by activity">
      ${grid}<line class="axis" x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}"/>${bars}</svg>
      <div class="chart-tip" hidden></div></div>${table}</div>`;
}

function showChartTip(col) {
  const wrap = col.closest('.chart-wrap');
  const tip = $('.chart-tip', wrap);
  const [title, total, ...rows] = col.dataset.tip.split('|');
  tip.innerHTML = `<strong>${esc(title)}</strong><span>${esc(total)}</span>${rows.map(r => {
    const g = r.split(':')[0];
    return `<span><i class="key s${STAT_GROUPS.indexOf(g) + 1}"></i>${esc(r)}</span>`;
  }).join('')}`;
  tip.hidden = false;
  const box = col.getBoundingClientRect(), outer = wrap.getBoundingClientRect();
  const x = box.left - outer.left + box.width / 2;
  tip.style.left = `${clamp(x, 90, outer.width - 90)}px`;
  $$('.col', wrap).forEach(c => c.classList.toggle('dim', c !== col));
}
function hideChartTip(wrap) {
  const tip = $('.chart-tip', wrap);
  if (tip) tip.hidden = true;
  $$('.col', wrap).forEach(c => c.classList.remove('dim'));
}

// -------------------------------------------------------------- records ----

function recordsSection() {
  const records = allRecords().filter(({ best }) => best.weight || best.reps || best.distance || best.seconds);
  if (!records.length) return '';
  const shown = showAllRecords ? records : records.slice(0, 8);
  const rows = shown.map(({ e, best }) => {
    const main = best.weight ? setText(best.weight) : best.distance ? fmtDistance(best.distance) : best.reps ? `${best.reps} reps` : fmtDuration(best.seconds);
    const extra = best.e1rm ? `≈ ${fmtWeight(best.e1rm)} 1RM` : best.fastest ? fmtPace(best.fastest.seconds, best.fastest.distance) : '';
    return `<tr ${e.id && exercise(e.id) ? `data-action="detail" data-id="${e.id}" tabindex="0" class="clickable"` : ''}>
      <td><strong>${esc(e.name)}</strong><small class="muted">${esc(e.category || '')}</small></td><td>${esc(main)}</td><td class="muted">${esc(extra)}</td>
      <td class="muted">${best.sessions}</td><td class="muted">${best.last ? shortDate(new Date(best.last)) : ''}</td></tr>`;
  }).join('');
  return `<section class="panel"><div class="panel-head"><h2>Personal bests</h2><span class="muted small">Tap an exercise for its history</span></div>
    <div class="table-scroll"><table class="records"><thead><tr><th>Exercise</th><th>Best</th><th>Estimate / pace</th><th>Sessions</th><th>Last</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${records.length > 8 ? `<button class="text-btn" data-action="toggle-records">${showAllRecords ? 'Show fewer' : `Show all ${records.length}`}</button>` : ''}</section>`;
}
actions['toggle-records'] = () => { showAllRecords = !showAllRecords; render(); };

// -------------------------------------------------------------- history ----

function historySection() {
  const list = state.history.filter(h => historyFilter === 'All' || (historyFilter === 'Workouts' ? h.type === 'session' : h.type === 'activity')).slice().reverse();
  let month = '';
  const rows = list.slice(0, historyLimit).map(h => {
    const d = new Date(h.at);
    const m = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const head = m !== month ? `<h3 class="month">${esc(m)}</h3>` : '';
    month = m;
    const facts = [fmtDuration(h.seconds)];
    if (h.steps.length) facts.push(plural(h.steps.length, 'set'));
    const vol = entryVolume(h);
    if (vol) facts.push(`${Math.round(kgToDisplay(vol)).toLocaleString()} ${weightUnit()} lifted`);
    const dist = entryDistance(h);
    if (dist) facts.push(fmtDistance(dist));
    if (h.effort) facts.push(`effort ${h.effort}/10`);
    if (h.skipped) facts.push(`${h.skipped} skipped`);
    return `${head}<button class="history-row" data-action="history-detail" data-id="${h.id}">
      <span class="dot cat-${catClass(h.category)}" aria-hidden="true"></span>
      <span class="history-main"><strong>${esc(h.name)}</strong><small>${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · ${facts.map(esc).join(' · ')}</small></span>
      <span class="history-kind">${h.type === 'activity' ? 'Activity' : h.manual ? 'Marked done' : esc(h.category)}</span></button>`;
  }).join('');
  return `<section class="history-section"><div class="section-head"><h2>History</h2><button class="text-btn" data-action="export-csv">Export as spreadsheet (CSV)</button></div>
    ${chips('history-filter', ['All', 'Workouts', 'Activities'], historyFilter)}
    <div class="history-list">${rows || '<p class="muted">Nothing here yet.</p>'}</div>
    ${list.length > historyLimit ? `<button class="btn light" data-action="more-history">Show more</button>` : ''}</section>`;
}
chipHandlers['history-filter'] = v => { historyFilter = v; historyLimit = 30; render(); };
actions['more-history'] = () => { historyLimit += 30; render(); };
actions['export-csv'] = () => exportCSV();

actions['history-detail'] = el => historyDetail(el.dataset.id);
function historyDetail(id) {
  const h = state.history.find(x => x.id === id);
  if (!h) return;
  const d = new Date(h.at);
  const records = h.type === 'session' ? newRecords(h) : [];
  const rows = h.steps.map(t => `<tr><td><strong>${esc(t.name)}</strong><small class="muted">${[t.roundLabel, t.side !== 'Not applicable' ? t.side : '', t.sets > 1 || t.set > 1 ? `set ${t.set}` : ''].filter(Boolean).map(esc).join(' · ')}</small></td>
    <td>${esc(setText(t))}</td><td class="muted">${t.mode === 'reps' && t.reps !== undefined && t.reps !== t.value ? `planned ${t.value}` : t.mode === 'time' ? `planned ${fmtDuration(t.value)}` : ''}</td></tr>`).join('');
  const facts = [fmtDuration(h.seconds), h.category, h.distance ? fmtDistance(h.distance) : '', h.distance && h.seconds ? fmtPace(h.seconds, h.distance) : '', h.effort ? `effort ${h.effort}/10` : ''].filter(Boolean);
  showModal(modalHead(h.name, esc(`${dateTime(h.at)} · ${facts.join(' · ')}`)) + `
    ${records.length ? `<div class="note good"><strong>New personal best${records.length > 1 ? 's' : ''}</strong><ul>${records.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${h.note ? `<p class="entry-note">${esc(h.note)}</p>` : ''}
    ${rows ? `<div class="table-scroll"><table class="sets"><tbody>${rows}</tbody></table></div>` : `<p class="muted">${h.type === 'activity' ? esc(h.kind || 'Activity') + ', logged manually.' : 'Marked as done without the player, so there are no set details.'}</p>`}
    ${h.skipped ? `<p class="muted small">${plural(h.skipped, 'step')} skipped.</p>` : ''}
    <div class="modal-actions spread"><button class="btn danger" data-action="delete-entry" data-id="${h.id}">Delete</button>
      <div class="row"><button class="btn light" data-action="edit-entry" data-id="${h.id}">Edit</button><button class="btn" data-action="close">Done</button></div></div>`);
}

actions['edit-entry'] = el => {
  const h = state.history.find(x => x.id === el.dataset.id);
  if (h.type === 'activity') { activityForm(h); return; }
  showModal(modalHead('Edit session', esc(h.name)) + `<form id="entry-form" data-id="${h.id}">
    <div class="form-grid"><div class="field"><label for="entry-min">Duration (minutes)</label><input id="entry-min" name="minutes" type="number" min="1" max="1440" required value="${Math.max(1, Math.round(h.seconds / 60))}"></div>
    <div class="field"><label for="entry-date">Date</label><input id="entry-date" name="date" type="date" required value="${dateKey(new Date(h.at))}"></div></div>
    <div class="field"><label>Effort</label>${effortPicker(h.effort)}</div>
    <div class="field"><label for="entry-note">Note</label><textarea id="entry-note" name="note" maxlength="2000">${esc(h.note || '')}</textarea></div>
    <div class="modal-actions"><button type="button" class="btn light" data-action="history-detail" data-id="${h.id}">Cancel</button><button class="btn">Save</button></div></form>`);
};
forms['entry-form'] = (f, fd) => {
  const h = state.history.find(x => x.id === f.dataset.id);
  const old = new Date(h.at);
  if (!isValidDateKey(fd.get('date'))) { toast('Choose a date.'); return; }
  if (fd.get('date') !== dateKey(old)) h.at = new Date(`${fd.get('date')}T${old.toTimeString().slice(0, 8)}`).toISOString();
  h.seconds = Number(fd.get('minutes')) * 60;
  h.effort = readEffort(fd);
  h.note = fd.get('note').trim();
  state.history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  save(); render(); historyDetail(h.id); toast('Saved.');
};
actions['delete-entry'] = el => {
  const h = state.history.find(x => x.id === el.dataset.id);
  confirmDialog({
    title: 'Delete this entry?', yes: 'Delete', body: `<p>“${esc(h.name)}” on ${esc(dateTime(h.at))} will be removed from your history.</p>`,
    onYes: () => { state.history = state.history.filter(x => x.id !== h.id); save(); render(); toast('Entry deleted.'); },
    onNo: () => historyDetail(h.id),
  });
};
