// The exercise library, exercise details (with your own history) and custom exercises.
'use strict';

const libraryFilter = { query: '', category: 'All', muscle: 'All muscles', gear: 'Any equipment', level: 'Any level' };

renderers.library = () => {
  const f = libraryFilter;
  app().innerHTML = heading('Find your next move.', `${allExercises().length} exercises: strength, cardio, stillness and everything in between.`,
    `<button class="btn" data-action="new-exercise">${icon('plus')} Custom exercise</button>`)
    + `<div class="toolbar"><input id="search" type="search" aria-label="Search exercises" placeholder="Search by name, muscle or equipment…" value="${esc(f.query)}" autocomplete="off"></div>
    ${chips('library-cat', ['All', 'Yours', ...CATEGORIES], f.category)}
    <div class="toolbar filters">
      <select data-bind="library-muscle" aria-label="Filter by muscle">${options(['All muscles', ...MUSCLES], f.muscle)}</select>
      <select data-bind="library-gear" aria-label="Filter by equipment">${options(['Any equipment', 'No equipment', ...GEAR], f.gear)}</select>
      <select data-bind="library-level" aria-label="Filter by level">${options(['Any level', 'General', 'Advanced'], f.level)}</select>
      <label class="checkrow"><input type="checkbox" data-bind="library-mygear" ${state.settings.onlyMyGear ? 'checked' : ''}> Only my equipment</label>
    </div>
    <div id="exercise-results"></div>
    <p class="note">Body maps show approximate target areas, not exact muscle activation. Instructions are general guidance, not a personal programme: warm up, move within a range you control, and stop if something hurts. Set up your equipment in <button class="link" data-view="settings">Settings</button>.</p>`;
  renderExerciseResults();
};

let libraryLimit = 60;

function filteredExercises() {
  const f = libraryFilter;
  return rankByQuery(libraryOrder(allExercises()), f.query).filter(e => exerciseMatches(e, f.query)
    && (f.category === 'All' || (f.category === 'Yours' ? e.custom : e.category === f.category))
    && (f.muscle === 'All muscles' || e.primary.includes(f.muscle) || e.secondary.includes(f.muscle))
    && (f.gear === 'Any equipment' || (f.gear === 'No equipment' ? !(e.gear || []).length : (e.gear || []).some(g => g.split('|').includes(f.gear))))
    && (f.level === 'Any level' || (e.level || 'General') === f.level)
    && (!state.settings.onlyMyGear || gearOk(e)));
}

function renderExerciseResults() {
  const all = filteredExercises();
  const list = all.slice(0, libraryLimit);
  const logged = new Set(state.history.flatMap(h => h.steps.map(t => t.exerciseId)));
  $('#exercise-results').innerHTML = `<p class="muted small">${plural(all.length, 'exercise')}</p>
    <div class="exercise-grid">${list.map(e => `<button class="exercise-card" data-action="detail" data-id="${e.id}">${bodymap(e)}
      <div><span class="category">${esc(e.category)}${e.custom ? ' · YOURS' : e.level === 'Advanced' ? ' · ADVANCED' : ''}</span>
      <h3>${esc(e.name)}</h3><p>${esc(e.primary.join(' · ') || 'Breath and awareness')}</p>
      <p class="gear-line">${esc((e.gear || []).map(gearLabel).join(', ') || 'No equipment')}${logged.has(e.id) ? ' · <span class="logged-mark">logged</span>' : ''}</p></div></button>`).join('')}</div>
    ${all.length > list.length ? `<div class="center row more-row"><button class="btn light" data-action="more-exercises">Show ${Math.min(60, all.length - list.length)} more of ${all.length - list.length}</button></div>` : ''}
    ${all.length ? '' : emptyState('No exercises match', 'Try another filter, or create your own exercise.', '<button class="btn light" data-action="clear-filters">Clear filters</button>')}`;
}

actions['more-exercises'] = () => { libraryLimit += 60; renderExerciseResults(); };
const refilter = () => { libraryLimit = 60; renderExerciseResults(); };
binds.search = el => { libraryFilter.query = el.value; refilter(); };
chipHandlers['library-cat'] = v => { libraryFilter.category = v; $$('[data-chip="library-cat"]').forEach(b => { b.classList.toggle('on', b.dataset.value === v); b.setAttribute('aria-pressed', b.dataset.value === v); }); refilter(); };
binds['library-muscle'] = el => { libraryFilter.muscle = el.value; refilter(); };
binds['library-gear'] = el => { libraryFilter.gear = el.value; refilter(); };
binds['library-level'] = el => { libraryFilter.level = el.value; refilter(); };
binds['library-mygear'] = el => { state.settings.onlyMyGear = el.checked; save(); refilter(); };
actions['clear-filters'] = () => {
  Object.assign(libraryFilter, { query: '', category: 'All', muscle: 'All muscles', gear: 'Any equipment', level: 'Any level' });
  state.settings.onlyMyGear = false; save(); render();
};

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
function exerciseDetail(id) {
  const e = exercise(id);
  if (!e) return;
  const related = e.family ? BUILTIN_EXERCISES.filter(x => x.id !== e.id && x.family === e.family) : [];
  const stretch = isStretch(e.category);
  showModal(modalHead(e.name) + `<div class="detail-grid">
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
    ${related.length ? `<h3 class="related-title">Related variations</h3><div class="row">${related.map(x => `<button class="btn light small" data-action="detail" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    <div class="modal-actions spread"><div class="row">
      ${e.custom ? `<button class="btn light" data-action="edit-exercise" data-id="${e.id}">Edit</button><button class="btn danger" data-action="delete-exercise" data-id="${e.id}">Delete</button>`
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
