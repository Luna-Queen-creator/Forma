// The exercise library, exercise details (with your own history) and custom exercises.
// The search / filter / sort controls here are shared with the exercise picker in the routine editor.
'use strict';

const FILTER_DEFAULTS = { query: '', category: 'All', muscle: 'All muscles', gear: 'Any equipment', level: 'Any level', sort: 'suggested' };
const filters = { library: { ...FILTER_DEFAULTS }, picker: { ...FILTER_DEFAULTS } };
const filterPanelOpen = { library: window.innerWidth > 760, picker: false };
const SORTS = { suggested: 'Suggested', az: 'A to Z', used: 'Most used by you', recent: 'Recently done', muscle: 'By main muscle' };
const listLimits = { library: 60, picker: 60 };

/** How many sessions included each exercise, and when it was last done. */
function exerciseUsage() {
  const usage = new Map();
  for (const h of state.history) {
    for (const t of h.steps) {
      if (!t.exerciseId) continue;
      const u = usage.get(t.exerciseId) || { sessions: new Set(), last: 0 };
      u.sessions.add(h.id);
      u.last = Math.max(u.last, Date.parse(h.at));
      usage.set(t.exerciseId, u);
    }
  }
  return usage;
}
const usedCount = (usage, e) => usage.get(e.id)?.sessions.size || 0;

function activeFilterCount(f) {
  return [f.muscle !== 'All muscles', f.gear !== 'Any equipment', f.level !== 'Any level', state.settings.onlyMyGear].filter(Boolean).length;
}

/** Filter and sort the exercises. `groupOf` (or null) names the section heading for each. */
function filterExercises(f, usage = exerciseUsage()) {
  let list = allExercises().filter(e => exerciseMatches(e, f.query)
    && (f.category === 'All' || (f.category === 'Yours' ? e.custom : e.category === f.category))
    && (f.muscle === 'All muscles' || e.primary.includes(f.muscle) || e.secondary.includes(f.muscle))
    && (f.gear === 'Any equipment' || (f.gear === 'No equipment' ? !(e.gear || []).length : (e.gear || []).some(g => g.split('|').includes(f.gear))))
    && (f.level === 'Any level' || (e.level || 'General') === f.level)
    && (!state.settings.onlyMyGear || gearOk(e)));
  const byName = (a, b) => a.name.localeCompare(b.name);
  const tried = e => (usage.has(e.id) ? 'Done before' : 'Not tried yet');
  let groupOf = null;
  if (f.sort === 'az') { list.sort(byName); groupOf = e => e.name[0].toUpperCase(); }
  else if (f.sort === 'used') { list.sort((a, b) => usedCount(usage, b) - usedCount(usage, a) || byName(a, b)); groupOf = tried; }
  else if (f.sort === 'recent') { list.sort((a, b) => (usage.get(b.id)?.last || 0) - (usage.get(a.id)?.last || 0) || byName(a, b)); groupOf = tried; }
  else if (f.sort === 'muscle') {
    const rank = e => (e.primary.length ? MUSCLES.indexOf(e.primary[0]) : MUSCLES.length);
    list.sort((a, b) => rank(a) - rank(b) || byName(a, b));
    groupOf = e => e.primary[0] || 'Breath & whole body';
  } else {
    list = libraryOrder(list);
    if (f.query.trim()) list = rankByQuery(list, f.query);
    else if (f.category === 'All') groupOf = e => (e.custom ? 'Your exercises' : e.category);
  }
  return { list, groupOf };
}

/** Search, activity chips, Filters toggle, Sort and the filter panel, for `scope` = library | picker. */
function filterControlsHTML(scope) {
  const f = filters[scope], n = activeFilterCount(f), open = filterPanelOpen[scope];
  return `<div class="filter-controls" data-scope="${scope}">
    <input type="search" class="filter-search" data-bind="filter-query" data-scope="${scope}" value="${esc(f.query)}" placeholder="Search by name, muscle or equipment…" aria-label="Search exercises" autocomplete="off">
    ${chips('cat-' + scope, ['All', 'Yours', ...CATEGORIES], f.category, {}, 'scroll')}
    <div class="filter-bar">
      <button type="button" class="btn light small filter-toggle ${n ? 'has' : ''}" data-action="toggle-filters" data-scope="${scope}" aria-expanded="${open}">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
        Filters<span class="filter-count">${n ? ' · ' + n : ''}</span></button>
      <label class="sort-label"><span>Sort</span><select data-bind="filter-sort" data-scope="${scope}" aria-label="Sort exercises">${options(Object.keys(SORTS), f.sort, SORTS)}</select></label>
      <span class="muted small result-count" data-count="${scope}"></span>
    </div>
    <div class="filter-panel" data-panel="${scope}" ${open ? '' : 'hidden'}>
      <label>Muscle<select data-bind="filter-muscle" data-scope="${scope}">${options(['All muscles', ...MUSCLES], f.muscle)}</select></label>
      <label>Equipment<select data-bind="filter-gear" data-scope="${scope}">${options(['Any equipment', 'No equipment', ...GEAR], f.gear)}</select></label>
      <label>Level<select data-bind="filter-level" data-scope="${scope}">${options(['Any level', 'General', 'Advanced'], f.level)}</select></label>
      <div class="panel-foot"><label class="checkrow"><input type="checkbox" data-bind="filter-mygear" data-scope="${scope}" ${state.settings.onlyMyGear ? 'checked' : ''}> Only equipment I have</label>
      <button type="button" class="text-btn" data-action="clear-filters" data-scope="${scope}">Clear filters</button></div>
    </div></div>`;
}

/** Re-render a scope's results after a filter change, and keep its controls in step. */
function filtersChanged(scope) {
  listLimits[scope] = 60;
  const f = filters[scope], n = activeFilterCount(f);
  $$(`.filter-controls[data-scope="${scope}"]`).forEach(box => {
    $('.filter-toggle', box)?.classList.toggle('has', n > 0);
    const count = $('.filter-count', box);
    if (count) count.textContent = n ? ' · ' + n : '';
    $$('.chip', box).forEach(c => { const on = c.dataset.value === f.category; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  });
  if (scope === 'library') renderExerciseResults();
  else renderPickerList();
}

const scopeOf = el => (el.dataset.scope === 'picker' ? 'picker' : 'library');
binds['filter-query'] = el => { filters[scopeOf(el)].query = el.value; filtersChanged(scopeOf(el)); };
binds['filter-sort'] = el => { filters[scopeOf(el)].sort = el.value; filtersChanged(scopeOf(el)); };
binds['filter-muscle'] = el => { filters[scopeOf(el)].muscle = el.value; filtersChanged(scopeOf(el)); };
binds['filter-gear'] = el => { filters[scopeOf(el)].gear = el.value; filtersChanged(scopeOf(el)); };
binds['filter-level'] = el => { filters[scopeOf(el)].level = el.value; filtersChanged(scopeOf(el)); };
binds['filter-mygear'] = el => { state.settings.onlyMyGear = el.checked; save(); filtersChanged(scopeOf(el)); };
chipHandlers['cat-library'] = v => { filters.library.category = v; filtersChanged('library'); };
chipHandlers['cat-picker'] = v => { filters.picker.category = v; filtersChanged('picker'); };
actions['toggle-filters'] = el => {
  const scope = scopeOf(el);
  filterPanelOpen[scope] = !filterPanelOpen[scope];
  const panel = $(`[data-panel="${scope}"]`);
  if (panel) panel.hidden = !filterPanelOpen[scope];
  el.setAttribute('aria-expanded', filterPanelOpen[scope]);
};
actions['clear-filters'] = el => {
  const scope = scopeOf(el);
  filters[scope] = { ...FILTER_DEFAULTS };
  state.settings.onlyMyGear = false;
  save();
  if (scope === 'library') render(); else renderPickerShell();
};

/** Section heading rows between groups of results. */
function withHeadings(list, groupOf, item, heading) {
  let last = null;
  return list.map(e => {
    const g = groupOf ? groupOf(e) : null;
    const head = g !== null && g !== last ? heading(g) : '';
    last = g;
    return head + item(e);
  }).join('');
}

// -------------------------------------------------------------- library ----

renderers.library = () => {
  app().innerHTML = heading('Find your next move.', `${allExercises().length} exercises: strength, cardio, stillness and everything in between.`,
    `<button class="btn" data-action="new-exercise">${icon('plus')} Custom exercise</button>`)
    + filterControlsHTML('library')
    + `<div id="exercise-results"></div>
    <p class="note">Body maps show approximate target areas, not exact muscle activation. Instructions are general guidance, not a personal programme: warm up, move within a range you control, and stop if something hurts. Set up your equipment in <button class="link" data-view="settings">Settings</button>.</p>`;
  renderExerciseResults();
};

function renderExerciseResults() {
  const usage = exerciseUsage();
  const { list: all, groupOf } = filterExercises(filters.library, usage);
  const list = all.slice(0, listLimits.library);
  const count = $('[data-count="library"]');
  if (count) count.textContent = plural(all.length, 'exercise');
  const card = e => {
    const n = usedCount(usage, e);
    return `<button class="exercise-card" data-action="detail" data-id="${e.id}">${bodymap(e)}
      <div><span class="category">${esc(e.category)}${e.custom ? ' · YOURS' : e.level === 'Advanced' ? ' · ADVANCED' : ''}</span>
      <h3>${esc(e.name)}</h3><p>${esc(e.primary.join(' · ') || 'Breath and awareness')}</p>
      <p class="gear-line">${esc((e.gear || []).map(gearLabel).join(', ') || 'No equipment')}${n ? ` · <span class="logged-mark">done ${n}×</span>` : ''}</p></div></button>`;
  };
  $('#exercise-results').innerHTML = `<div class="exercise-grid">${withHeadings(list, groupOf, card, g => `<h3 class="group-head">${esc(g)}</h3>`)}</div>
    ${all.length > list.length ? `<div class="center row more-row"><button class="btn light" data-action="more-exercises">Show ${Math.min(60, all.length - list.length)} more of ${all.length - list.length}</button></div>` : ''}
    ${all.length ? '' : emptyState('No exercises match', 'Try another filter, or create your own exercise.', '<button class="btn light" data-action="clear-filters" data-scope="library">Clear filters</button>')}`;
}
actions['more-exercises'] = () => { listLimits.library += 60; renderExerciseResults(); };

// -------------------------------------------------------------- details ----

function breathText(pattern) {
  const names = { in: 'in', hold: 'hold', out: 'out' };
  return pattern.map(p => `${p.label ? p.label.toLowerCase() : names[p.phase]} ${p.seconds}`).join(' · ');
}

function exerciseHistoryHTML(e) {
  const log = exerciseLog(e);
  if (!log.length) return '';
  const best = bestOf(e, log);
  const facts = [];
  if (best.weight) facts.push(`Heaviest: <strong>${esc(setText(best.weight))}</strong>`);
  if (best.e1rm) facts.push(`Est. 1-rep max: <strong>${fmtWeight(best.e1rm)}</strong>`);
  if (best.reps) facts.push(`Most reps: <strong>${best.reps}</strong>`);
  if (best.distance) facts.push(`Longest: <strong>${fmtDistance(best.distance)}</strong>`);
  if (best.fastest) facts.push(`Best pace: <strong>${fmtPace(best.fastest.seconds, best.fastest.distance)}</strong>`);
  if (best.seconds && !best.distance) facts.push(`Longest: <strong>${fmtDuration(best.seconds)}</strong>`);
  // Trend of the top set per session (weight, else reps, else time, else distance), oldest first.
  const trend = log.slice(0, 20).reverse().map(({ sets }) => Math.max(...sets.map(t =>
    t.weight ? e1rm(t.weight, t.reps ?? t.value) || t.weight : t.mode === 'reps' ? (t.reps ?? t.value) : t.mode === 'distance' ? (t.distance ?? t.value) : (t.actualSeconds ?? t.value))));
  return `<div class="your-history"><h3>Your history</h3>
    <p class="muted small">${plural(log.length, 'session')}${facts.length ? ' · ' + facts.join(' · ') : ''}</p>
    ${sparkline(trend)}
    <ul class="history-mini">${log.slice(0, 5).map(({ entry, sets }) => `<li><span>${shortDate(new Date(entry.at))}</span><span>${esc(setsSummary(sets))}</span></li>`).join('')}</ul></div>`;
}

actions.detail = el => exerciseDetail(el.dataset.id);

/** The body of an exercise's details. `relatedAction` decides where related variations open. */
function exerciseInfoHTML(e, relatedAction = 'detail') {
  const related = e.family ? BUILTIN_EXERCISES.filter(x => x.id !== e.id && x.family === e.family) : [];
  const stretch = isStretch(e.category);
  return `<div class="detail-grid">
    <div class="anatomy">${bodymap(e, 'large')}<div class="legend"><span><i class="swatch ${stretch ? 'stretch' : ''}"></i>${stretch ? 'Stretch' : 'Primary'}</span><span><i class="swatch secondary"></i>Secondary</span></div></div>
    <div>
      <div class="row">${pill(esc(e.category))}${e.level === 'Advanced' ? pill('Advanced', 'warn') : ''}${e.custom ? pill('Yours') : ''}${e.bilateral ? pill('Left & right') : ''}</div>
      <h3>${stretch ? 'Areas stretched' : 'Primary focus'}</h3><p>${esc(e.primary.join(', ') || 'Breath and body awareness')}${e.secondary?.length ? `<br><span class="muted small">Also: ${esc(e.secondary.join(', '))}</span>` : ''}</p>
      <p class="muted small">Equipment: ${esc(e.equipment || 'None')} · Default: ${e.mode === 'reps' ? e.value + ' reps' : e.mode === 'distance' ? fmtDistance(e.value) : fmtDuration(e.value)}</p>
      ${e.breath ? `<p class="small">Breathing pattern: <strong>${esc(breathText(e.breath))}</strong> seconds. The player shows a guide.</p>` : ''}
      ${e.instructions.length ? `<ol class="instructions">${e.instructions.map(i => `<li>${esc(i)}</li>`).join('')}</ol>` : '<p class="muted">No instructions added.</p>'}
      ${safeURL(e.image) ? `<img class="illustration" src="${esc(e.image)}" alt="Demonstration of ${esc(e.name)}" loading="lazy">` : ''}
      ${safeURL(e.video) ? `<p><a href="${esc(e.video)}" target="_blank" rel="noopener noreferrer">Watch demonstration ↗</a></p>` : ''}
    </div></div>
    ${e.level === 'Advanced' ? '<p class="note">Advanced skill: warm up first and build up through the related variations. These default to waiting for you to tap Begin.</p>' : ''}
    ${exerciseHistoryHTML(e)}
    ${related.length ? `<h3 class="related-title">Related variations</h3><div class="row">${related.map(x => `<button type="button" class="btn light small" data-action="${relatedAction}" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}`;
}

function exerciseDetail(id) {
  const e = exercise(id);
  if (!e) return;
  showModal(modalHead(e.name) + exerciseInfoHTML(e) + `
    <div class="modal-actions spread"><div class="row">
      ${e.custom ? `<button class="btn light" data-action="edit-exercise" data-id="${e.id}">Edit</button><button class="btn light" data-action="share-exercise" data-id="${e.id}">Share</button><button class="btn danger" data-action="delete-exercise" data-id="${e.id}">Delete</button>`
        : `<button class="btn light" data-action="copy-exercise" data-id="${e.id}" title="Create an editable copy with your own defaults and notes">Make my own version</button>`}</div>
      <div class="row"><button class="btn light" data-action="add-to-routine" data-id="${e.id}">Add to routine</button><button class="btn" data-action="close">Done</button></div></div>`);
}

// ----------------------------------------------------- custom exercises ----

actions['new-exercise'] = () => exerciseForm();
actions['edit-exercise'] = el => exerciseForm(el.dataset.id);
actions['copy-exercise'] = el => exerciseForm(null, el.dataset.id);

function exerciseForm(id, copyOf) {
  const source = id ? exercise(id) : copyOf ? exercise(copyOf) : null;
  const e = source ? structuredClone(source) : { name: '', category: 'Strength', mode: 'reps', value: 10, primary: [], secondary: [], equipment: '', gear: [], level: 'General', bilateral: false, instructions: [] };
  if (copyOf) e.name = `${source.name} (mine)`.slice(0, 90);
  const valueShown = e.mode === 'distance' ? fmtNum(mToDisplay(e.value), 2) : e.value;
  const muscleBoxes = (name, list) => MUSCLES.map(m => `<label class="checkrow"><input type="checkbox" name="${name}" value="${m}" ${list.includes(m) ? 'checked' : ''}>${m}</label>`).join('');
  showModal(modalHead(id ? 'Edit your exercise' : copyOf ? 'Your own version' : 'Your own exercise',
    copyOf ? 'A copy you can change freely. The original stays in the library.' : '')
    + `<form id="exercise-form" data-id="${id || ''}" data-based-on="${copyOf || source?.basedOn || ''}">
    <div class="field"><label for="ex-name">Name</label><input id="ex-name" name="name" required maxlength="90" value="${esc(e.name)}"></div>
    <div class="form-grid">
      <div class="field"><label for="ex-category">Activity</label><select id="ex-category" name="category">${options(CATEGORIES, e.category)}</select></div>
      <div class="field"><label for="ex-mode">Track by</label><select id="ex-mode" name="mode" data-bind="exercise-mode">${options(MODES, e.mode, MODE_LABELS)}</select></div>
      <div class="field"><label for="ex-value" id="ex-value-label">${valueLabelFor(e.mode)}</label><input id="ex-value" name="value" type="number" min="${e.mode === 'distance' ? 0.01 : 1}" step="${e.mode === 'distance' ? 0.01 : 1}" max="7200" required value="${valueShown}"></div>
      <div class="field"><label for="ex-level">Level</label><select id="ex-level" name="level">${options(['General', 'Advanced'], e.level || 'General')}</select></div>
    </div>
    <label class="checkrow"><input type="checkbox" name="bilateral" ${e.bilateral ? 'checked' : ''}> Done on each side separately (left and right)</label>
    <div class="field"><label for="ex-equipment">Equipment description (optional)</label><input id="ex-equipment" name="equipment" maxlength="100" value="${esc(e.equipment)}" placeholder="e.g. Kettlebell, 16 kg"></div>
    <fieldset class="field"><legend>Equipment needed (for the equipment filter)</legend><div class="checks">${GEAR.map(g => `<label class="checkrow"><input type="checkbox" name="gear" value="${esc(g)}" ${(e.gear || []).some(x => x.split('|')[0] === g) ? 'checked' : ''}>${esc(g)}</label>`).join('')}</div></fieldset>
    <fieldset class="field"><legend>Main muscles</legend><div class="checks">${muscleBoxes('primary', e.primary)}</div></fieldset>
    <fieldset class="field"><legend>Also works (optional)</legend><div class="checks">${muscleBoxes('secondary', e.secondary || [])}</div></fieldset>
    <div class="field"><label for="ex-notes">Instructions (optional, one step per line)</label><textarea id="ex-notes" name="notes" maxlength="5000">${esc(e.instructions.join('\n'))}</textarea></div>
    <div class="form-grid"><div class="field"><label for="ex-image">Picture link (optional, https)</label><input id="ex-image" name="image" type="url" value="${esc(e.image || '')}" placeholder="https://…"></div>
      <div class="field"><label for="ex-video">Video link (optional, https)</label><input id="ex-video" name="video" type="url" value="${esc(e.video || '')}" placeholder="https://…"></div></div>
    <div class="modal-actions"><button type="button" class="btn light" data-action="close">Cancel</button><button class="btn">Save exercise</button></div></form>`);
}
const valueLabelFor = mode => ({ reps: 'Default reps', time: 'Default seconds', manual: 'Reference seconds', distance: `Default distance (${distanceUnit()})` }[mode]);
binds['exercise-mode'] = el => {
  const input = $('#ex-value');
  $('#ex-value-label').textContent = valueLabelFor(el.value);
  input.step = el.value === 'distance' ? '0.01' : '1';
  input.min = el.value === 'distance' ? '0.01' : '1';
  input.value = el.value === 'distance' ? fmtNum(mToDisplay(1000), 2) : ({ reps: 10, time: 30, manual: 30 }[el.value]);
};

forms['exercise-form'] = (f, fd) => {
  const name = fd.get('name').trim();
  if (!name) { toast('Give your exercise a name.'); return; }
  if ((fd.get('image') && !safeURL(fd.get('image'))) || (fd.get('video') && !safeURL(fd.get('video')))) { toast('Use an https:// link for the picture or video.'); return; }
  const mode = fd.get('mode');
  const raw = Number(fd.get('value'));
  const primary = fd.getAll('primary');
  const e = {
    id: f.dataset.id || uid(), name, category: fd.get('category'), mode,
    value: mode === 'distance' ? displayToM(raw) : Math.round(raw),
    equipment: fd.get('equipment').trim(), gear: fd.getAll('gear'), level: fd.get('level'), bilateral: fd.has('bilateral'),
    primary, secondary: fd.getAll('secondary').filter(m => !primary.includes(m)),
    instructions: fd.get('notes').split('\n').map(x => x.trim()).filter(Boolean),
    image: fd.get('image').trim(), video: fd.get('video').trim(), custom: true,
    ...(f.dataset.basedOn ? { basedOn: f.dataset.basedOn } : {}),
  };
  try { normalizeState({ ...state, exercises: [...state.exercises.filter(x => x.id !== e.id), e] }); }
  catch (err) { toast(err.message.replace('This is not a valid Forma backup: ', 'Please check: ')); return; }
  const i = state.exercises.findIndex(x => x.id === e.id);
  if (i < 0) state.exercises.push(e); else state.exercises[i] = e;
  save(); closeModal(); render(); toast('Exercise saved.');
};

actions['delete-exercise'] = el => {
  const e = exercise(el.dataset.id);
  const users = state.routines.filter(r => routineMoves(r).some(b => b.exerciseId === e.id));
  confirmDialog({
    title: 'Delete this exercise?', yes: users.length ? 'Remove and delete' : 'Delete',
    body: `<p>“${esc(e.name)}” will be removed from your library. Past history keeps its records.</p>`
      + (users.length ? `<p class="note warning">It is used in ${plural(users.length, 'routine')}: ${users.map(r => '“' + esc(r.name) + '”').join(', ')}. It will be removed from ${users.length === 1 ? 'it' : 'them'}.</p>` : ''),
    onYes: () => {
      const strip = blocks => blocks.filter(b => b.exerciseId !== e.id).map(b => (b.kind === 'group' ? { ...b, steps: strip(b.steps) } : b))
        .filter(b => b.kind !== 'group' || b.steps.length);
      state.routines.forEach(r => { r.steps = strip(r.steps); });
      state.exercises = state.exercises.filter(x => x.id !== e.id);
      save(); render(); toast('Exercise deleted.');
    },
    onNo: () => exerciseDetail(e.id),
  });
};
