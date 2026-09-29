// Routines: the list, templates, the routine editor and the exercise picker.
'use strict';

let templateFilter = 'All';
const chipHandlers = {};
actions.chip = el => chipHandlers[el.dataset.chip]?.(el.dataset.value, el);

function routineCard(r, template = false) {
  const moves = routineMoves(r);
  const last = template ? 0 : lastDoneTime(r);
  const buttons = template
    ? `<button class="btn light" data-action="use-template" data-id="${r.id}">Make it mine ＋</button>
       <button class="text-btn" data-action="preview-template" data-id="${r.id}">Preview</button>`
    : `<button class="btn" data-action="start" data-id="${r.id}">Start</button>
       <button class="btn light" data-action="edit-routine" data-id="${r.id}">Edit</button>
       <button class="text-btn" data-action="schedule-routine" data-id="${r.id}">Schedule</button>
       <button class="text-btn" data-action="duplicate-routine" data-id="${r.id}">Duplicate</button>`;
  return `<article class="card">
    <div class="card-band cat-${catClass(r.category)}"><span class="category">${esc(r.category)}</span><span class="activity-symbol" aria-hidden="true">${catIcon(r.category)}</span></div>
    <div class="card-content">
      <span class="muted small">${plural(moves.length, 'exercise')} · about ${duration(r)} min${last ? ' · last done ' + shortDate(new Date(last)) : ''}</span>
      <h3>${esc(r.name)}</h3>
      <p class="muted">${esc(r.description || 'Your own combination of movement and rest.')}</p>
      <div class="row card-actions">${buttons}</div>
    </div></article>`;
}

renderers.routines = () => {
  const cats = ['All', ...CATEGORIES.filter(c => TEMPLATES.some(t => t.category === c))];
  const shown = TEMPLATES.filter(t => templateFilter === 'All' || t.category === templateFilter);
  app().innerHTML = heading('Made for your rhythm.', 'Mix any activities into one routine. Every step is yours to change.',
    `<button class="btn" data-action="new-routine">${icon('plus')} New routine</button>`)
    + (state.routines.length
      ? `<section class="cards">${state.routines.map(r => routineCard(r)).join('')}</section>`
      : emptyState('Your routines will live here', 'Start from scratch or make one of the templates below your own.', '<button class="btn" data-action="new-routine">Create your first routine</button>'))
    + `<div class="section-head"><h2>Templates</h2><span class="pill">Fully editable</span></div>
      <p class="muted">Starting points for gym days, conditioning, running, mobility and calm. Adapt weights, reps and timing to you.</p>
      ${chips('template-filter', cats, templateFilter)}
      <section class="cards">${shown.map(t => routineCard(t, true)).join('')}</section>`;
};
chipHandlers['template-filter'] = v => { templateFilter = v; render(); };

actions['preview-template'] = el => {
  const t = TEMPLATES.find(x => x.id === el.dataset.id);
  showModal(modalHead(t.name, `${esc(t.category)} · about ${duration(t)} min · ${plural(countSets(t), 'set')}`)
    + `<p>${esc(t.description)}</p><ol class="plan-preview">${t.steps.map(b => `<li>${esc(blockSummary(b))}</li>`).join('')}</ol>
    <div class="modal-actions"><button class="btn light" data-action="start-template" data-id="${t.id}">Try it now</button>
    <button class="btn" data-action="use-template" data-id="${t.id}">Make it mine ＋</button></div>`);
};
actions['start-template'] = el => startSession(TEMPLATES.find(x => x.id === el.dataset.id));
actions['use-template'] = el => editRoutine(null, el.dataset.id);
actions['new-routine'] = () => editRoutine();
actions['edit-routine'] = el => editRoutine(el.dataset.id);
actions['duplicate-routine'] = el => {
  const r = routine(el.dataset.id);
  state.routines.push({ ...structuredClone(r), id: uid(), name: (r.name + ' (copy)').slice(0, 90), steps: freshIds(r.steps) });
  save(); render(); toast('Routine duplicated.');
};
actions['delete-routine'] = el => {
  const r = routine(el.dataset.id);
  const plans = state.schedule.filter(s => s.routineId === r.id).length;
  confirmDialog({
    title: 'Delete this routine?', yes: 'Delete routine',
    body: `<p>“${esc(r.name)}”${plans ? ` and ${plural(plans, 'planned session')}` : ''} will be removed. Your history stays.</p>`,
    onYes: () => {
      state.routines = state.routines.filter(x => x.id !== r.id);
      state.schedule = state.schedule.filter(s => s.routineId !== r.id);
      draft = null; draftDirty = false;
      save(); render(); toast('Routine deleted.');
    },
    onNo: () => renderEditor(false),
  });
};

function freshIds(blocks) {
  return blocks.map(b => ({ ...structuredClone(b), id: uid(), ...(b.kind === 'group' ? { steps: freshIds(b.steps) } : {}) }));
}

// --------------------------------------------------------------- editor ----

let draft = null;
let draftDirty = false;
const editorOpen = new Set();   // block ids whose "More options" are expanded

function editRoutine(id, templateId) {
  if (id) draft = structuredClone(routine(id));
  else if (templateId) {
    const t = TEMPLATES.find(x => x.id === templateId);
    draft = { ...structuredClone(t), id: uid(), steps: freshIds(t.steps) };
  } else draft = { id: uid(), name: '', description: '', category: 'Strength', transition: 10, steps: [] };
  draft.steps = draft.steps.map(b => normalizeBlock(b));
  draft.transition ??= 10;
  draftDirty = !!templateId;
  editorOpen.clear();
  renderEditor(false);
}

function getBlock(path) {
  const parts = path.split('.').map(Number);
  let list = draft.steps;
  for (let i = 0; i < parts.length - 1; i++) list = list[parts[i]].steps;
  return { list, index: parts.at(-1), block: list[parts.at(-1)] };
}

function draftSummary() {
  try {
    const q = compileRoutine(draft);
    return `${plural(q.filter(x => x.kind === 'move').length, 'set')} · about ${Math.max(1, Math.round(sum(q, stepSeconds) / 60))} min`;
  } catch { return 'Check your steps'; }
}

function valueField(b) {
  if (b.mode === 'distance') {
    return `<label>Distance (${distanceUnit()})<input type="number" data-field="value" data-unit="distance" min="0.01" max="1000" step="0.01" required value="${fmtNum(mToDisplay(b.value), 2)}"></label>`;
  }
  const label = b.mode === 'reps' ? 'Reps' : b.mode === 'manual' ? 'Target sec' : 'Seconds';
  return `<label>${label}<input type="number" data-field="value" min="1" max="7200" step="1" required value="${b.value}"></label>`;
}

function toolButtons(path, i, length) {
  return `<div class="step-tools">
    <button type="button" class="tiny" data-action="block-up" data-path="${path}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
    <button type="button" class="tiny" data-action="block-down" data-path="${path}" ${i === length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
    <button type="button" class="tiny" data-action="block-copy" data-path="${path}" aria-label="Duplicate" title="Duplicate">⧉</button>
    <button type="button" class="tiny remove" data-action="block-remove" data-path="${path}" aria-label="Remove">×</button></div>`;
}

function blockHTML(b, path, i, length) {
  if (b.kind === 'rest') {
    return `<div class="step rest-block" data-path="${path}"><div class="step-head"><span class="step-number">${i + 1}</span>
      <div class="step-title"><strong>Break</strong><small>Counts down, then carries on</small></div>${toolButtons(path, i, length)}</div>
      <div class="step-main"><label>Seconds<input type="number" data-field="value" min="1" max="3600" step="1" required value="${b.value}"></label></div></div>`;
  }
  if (b.kind === 'group') {
    return `<div class="step repeat-group" data-path="${path}"><div class="step-head"><span class="step-number">${i + 1}</span>
      <div class="step-title"><strong>Repeat group</strong><small>Circuits, supersets and intervals</small></div>${toolButtons(path, i, length)}</div>
      <div class="step-main"><label class="grow">Name (optional)<input data-field="name" maxlength="60" value="${esc(b.name)}" placeholder="e.g. Circuit A"></label>
        <label>Rounds<input type="number" data-field="rounds" min="1" max="50" step="1" required value="${b.rounds}"></label></div>
      <div class="blocks">${b.steps.map((x, j) => blockHTML(x, `${path}.${j}`, j, b.steps.length)).join('') || '<p class="muted small">Empty so far. Add exercises and breaks below.</p>'}</div>
      ${addControls(path)}</div>`;
  }
  const e = exercise(b.exerciseId);
  const weighted = b.mode !== 'distance' && b.mode !== 'manual' && (['Strength', 'HIIT'].includes(e?.category) || b.weight > 0);
  const both = b.side === 'Both sides';
  return `<div class="step" data-path="${path}"><div class="step-head"><span class="step-number">${i + 1}</span>
    <div class="step-title"><strong>${esc(e?.name || 'Unavailable exercise')}</strong><small>${esc(e?.category || '')}${both ? ' · each side' : ''}${b.section !== 'Main' && b.section !== e?.category ? ' · ' + esc(b.section) : ''}</small></div>
    ${toolButtons(path, i, length)}</div>
    <div class="step-main">
      <label>Sets<input type="number" data-field="sets" min="1" max="50" step="1" required value="${b.sets}"></label>
      <span class="times" aria-hidden="true">×</span>${valueField(b)}
      ${weighted ? `<label>Weight (${weightUnit()})<input type="number" data-field="weight" data-unit="weight" min="0" max="2000" step="0.5" value="${fmtNum(kgToDisplay(b.weight), 1)}"></label>` : ''}
      <label>Rest (sec)<input type="number" data-field="rest" min="0" max="3600" step="1" required value="${b.rest}" title="Rest after each set"></label>
    </div>
    <details class="more" data-open-id="${b.id}" ${editorOpen.has(b.id) ? 'open' : ''}><summary>More options</summary>
      <div class="step-fields">
        <label>Section<select data-field="section">${options(SECTIONS, b.section)}</select></label>
        <label>Tracking<select data-field="mode" data-rerender>${options(MODES, b.mode, MODE_LABELS)}</select></label>
        <label>Sides<select data-field="side" data-rerender>${options(SIDES, b.side, { 'Both sides': 'Both sides, one after the other', 'Alternating': 'Alternating in one set' })}</select></label>
        ${both ? `<label>Start with<select data-field="firstSide">${options(['Left', 'Right'], b.firstSide)}</select></label>
          <label>Side change (sec)<input type="number" data-field="sideSwitch" min="0" max="120" step="1" required value="${b.sideSwitch}"></label>` : ''}
        <label>Setup time before (sec)<input type="number" data-field="transition" min="0" max="600" step="1" placeholder="Routine default" value="${b.transition ?? ''}"></label>
        ${weighted ? '' : `<label>Weight (${weightUnit()})<input type="number" data-field="weight" data-unit="weight" min="0" max="2000" step="0.5" value="${fmtNum(kgToDisplay(b.weight), 1)}"></label>`}
      </div>
      <label class="checkrow"><input type="checkbox" data-field="waitReady" ${b.waitReady ? 'checked' : ''}> Wait for me to tap Begin before this exercise</label>
      <label class="note-field">Note<input data-field="note" maxlength="200" value="${esc(b.note)}" placeholder="e.g. slow on the way down, blue band"></label>
    </details></div>`;
}

function addControls(parent) {
  return `<div class="block-add">
    <button type="button" class="btn light" data-action="open-picker" data-parent="${parent}">${icon('plus')} Exercises</button>
    <button type="button" class="btn light" data-action="block-add-rest" data-parent="${parent}">${icon('plus')} Break</button>
    ${parent === '' ? `<button type="button" class="btn light" data-action="block-add-group">${icon('plus')} Repeat group</button>` : ''}</div>`;
}

function renderEditor(keepScroll = true) {
  // Remember which "More options" panels are open right now, so a re-render keeps them open.
  $$('#routine-form details[data-open-id]').forEach(d => (d.open ? editorOpen.add(d.dataset.openId) : editorOpen.delete(d.dataset.openId)));
  const isNew = !routine(draft.id);
  showModal(modalHead(isNew ? 'Build your routine' : 'Edit routine') + `<form id="routine-form" novalidate>
    <div class="form-grid wide-first"><div class="field"><label for="routine-name">Name</label>
      <input id="routine-name" data-draft="name" required maxlength="90" value="${esc(draft.name)}" placeholder="e.g. Push day, Sunday flow"></div>
      <div class="field"><label for="routine-category">Main activity</label><select id="routine-category" data-draft="category">${options(CATEGORIES, draft.category)}</select></div></div>
    <div class="field"><label for="routine-desc">Note to yourself (optional)</label><input id="routine-desc" data-draft="description" maxlength="200" value="${esc(draft.description)}"></div>
    <details class="more routine-settings"><summary>Routine settings</summary>
      <div class="field"><label for="default-transition">Setup time between exercises (seconds)</label>
      <input id="default-transition" type="number" data-draft="transition" required min="0" max="600" step="1" value="${draft.transition}">
      <small>Time to get into position before the next exercise. A break replaces it. Use 0 for back-to-back intervals.</small></div></details>
    <div class="section-head"><h3>Your sequence</h3><span class="pill" id="draft-summary">${draftSummary()}</span></div>
    <div class="blocks">${draft.steps.map((b, i) => blockHTML(b, String(i), i, draft.steps.length)).join('') || '<p class="muted empty-seq">Add exercises, breaks or a repeat group to begin.</p>'}</div>
    ${addControls('')}
    <div class="modal-actions spread">
      ${isNew ? '<span></span>' : `<button type="button" class="btn danger" data-action="delete-routine" data-id="${draft.id}">Delete</button>`}
      <div class="row"><button type="button" class="btn light" data-action="close">Cancel</button><button class="btn">Save routine</button></div>
    </div></form>`, { wide: true, keepScroll });
}

/** Read an editor input, converting display units back to kg / metres. */
function readField(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'number') {
    if (input.value === '') return input.dataset.field === 'transition' ? null : undefined;
    const v = Number(input.value);
    if (!Number.isFinite(v)) return undefined;
    if (input.dataset.unit === 'weight') return Math.round(displayToKg(v) * 1000) / 1000;
    if (input.dataset.unit === 'distance') return displayToM(v);
    return v;
  }
  return input.value;
}

/** Live-binds editor inputs to the draft. Returns true when it handled the event. */
function editorInput(ev) {
  const input = ev.target;
  if (!draft || !input.closest?.('#routine-form')) return false;
  if (input.dataset.draft) {
    const key = input.dataset.draft;
    const v = readField(input);
    if (v !== undefined) draft[key] = v;
  } else if (input.dataset.field) {
    const holder = input.closest('[data-path]');
    const { block } = getBlock(holder.dataset.path);
    const v = readField(input);
    if (v !== undefined) block[input.dataset.field] = v;
    if (ev.type === 'change' && input.hasAttribute('data-rerender')) {
      if (input.dataset.field === 'mode') block.value = exercise(block.exerciseId)?.mode === block.mode ? exercise(block.exerciseId).value : defaultValueFor(block.mode);
      draftDirty = true;
      renderEditor();
      return true;
    }
  } else return false;
  draftDirty = true;
  const summary = $('#draft-summary');
  if (summary) summary.textContent = draftSummary();
  return true;
}
const defaultValueFor = mode => ({ reps: 10, time: 30, manual: 30, distance: 1000 }[mode]);

function editorAction(name, el) {
  const path = el.dataset.path;
  if (name === 'block-remove') { const { list, index } = getBlock(path); list.splice(index, 1); }
  if (name === 'block-up' || name === 'block-down') {
    const { list, index } = getBlock(path);
    const to = index + (name === 'block-up' ? -1 : 1);
    if (to >= 0 && to < list.length) [list[index], list[to]] = [list[to], list[index]];
  }
  if (name === 'block-copy') {
    const { list, index, block } = getBlock(path);
    if (list.length >= 200) { toast('Maximum 200 blocks per list.'); return; }
    list.splice(index + 1, 0, freshIds([block])[0]);
  }
  if (name === 'block-add-rest' || name === 'block-add-group') {
    const parent = el.dataset.parent ?? '';
    const list = parent === '' ? draft.steps : getBlock(parent).block.steps;
    if (list.length >= 200) { toast('Maximum 200 blocks per list.'); return; }
    if (name === 'block-add-rest') list.push({ id: uid(), kind: 'rest', value: 30, section: 'Main' });
    else list.push({ id: uid(), kind: 'group', name: '', rounds: 3, steps: [] });
  }
  draftDirty = true;
  renderEditor();
}
['block-remove', 'block-up', 'block-down', 'block-copy', 'block-add-rest', 'block-add-group'].forEach(name => {
  actions[name] = el => editorAction(name, el);
});

function emptyGroups(blocks) { return blocks.some(b => b.kind === 'group' && !b.steps.length); }

forms['routine-form'] = f => {
  const bad = f.querySelector(':invalid');
  if (bad) {
    const details = bad.closest('details');
    if (details) { details.open = true; editorOpen.add(details.dataset.openId); }
    f.reportValidity();
    return;
  }
  draft.name = draft.name.trim();
  if (!draft.name) { toast('Give your routine a name.'); $('#routine-name').focus(); return; }
  if (!routineMoves(draft).length) { toast('Add at least one exercise.'); return; }
  if (emptyGroups(draft.steps)) { toast('A repeat group is empty. Add something to it or remove it.'); return; }
  try {
    compileRoutine(draft);
    normalizeState({ ...state, routines: [...state.routines.filter(r => r.id !== draft.id), draft] });
  } catch (err) { toast(err.message.replace('This is not a valid Forma backup: ', 'Please check this routine: ')); return; }
  const i = state.routines.findIndex(r => r.id === draft.id);
  if (i < 0) state.routines.push({ ...draft, createdAt: new Date().toISOString() });
  else state.routines[i] = draft;
  draft = null; draftDirty = false;
  save(); closeModal(); render(); toast('Routine saved. Ready when you are.');
};

/** Protect unsaved edits from an accidental close. */
function guardEditorClose() {
  if (!draft || !draftDirty || !$('#routine-form')) return false;
  confirmDialog({
    title: 'Discard your changes?', yes: 'Discard', body: '<p>Your edits to this routine have not been saved.</p>',
    onYes: () => { draft = null; draftDirty = false; },
    onNo: () => renderEditor(false),
  });
  return true;
}
actions.close = () => { if (!guardEditorClose()) closeModal(); };

// --------------------------------------------------------------- picker ----

let pickerTarget = '';
let pickerQuery = '';
let pickerCategory = 'All';
let pickerAdded = 0;

actions['open-picker'] = el => openPicker(el.dataset.parent ?? '');
function openPicker(parent) {
  pickerTarget = parent;
  pickerAdded = 0;
  $('#picker-content').innerHTML = `<div class="modal-inner"><div class="modal-header"><h2>Add exercises</h2>
    <button type="button" class="close" data-action="close-picker" aria-label="Close">×</button></div>
    <input id="picker-search" type="search" placeholder="Search by name, muscle or equipment…" value="${esc(pickerQuery)}" aria-label="Search exercises" autocomplete="off">
    <div id="picker-cats"></div>
    <label class="checkrow small"><input type="checkbox" data-bind="picker-gear" ${state.settings.onlyMyGear ? 'checked' : ''}> Only exercises I have the equipment for</label>
    <div id="picker-list" class="pick-list"></div>
    <div class="picker-foot"><span id="picker-count" class="muted small">Tap to add. Add as many as you like.</span><button type="button" class="btn" data-action="close-picker">Done</button></div></div>`;
  renderPickerList();
  const dlg = $('#picker');
  if (!dlg.open) dlg.showModal();
  if (matchMedia('(pointer: fine)').matches) $('#picker-search').focus();
}

/** Name matches first, then everything else that matches, each group in library order. */
function rankByQuery(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const score = e => {
    const name = e.name.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (q.split(/\s+/).every(w => name.includes(w))) return 3;
    return 4;
  };
  return list.map((e, i) => [score(e), i, e]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}

/** Library order: by activity, then alphabetical; your own exercises first. */
function libraryOrder(list) {
  const rank = c => CATEGORIES.indexOf(c);
  return list.slice().sort((a, b) => (b.custom === true) - (a.custom === true) || rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
}

function exerciseMatches(e, query) {
  if (!query) return true;
  const hay = [e.name, e.category, e.equipment, ...(e.primary || []), ...(e.secondary || []), ...(e.gear || [])].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => hay.includes(word));
}

function renderPickerList() {
  $('#picker-cats').innerHTML = chips('picker-cat', ['All', 'Yours', ...CATEGORIES], pickerCategory);
  const list = rankByQuery(libraryOrder(allExercises()), pickerQuery).filter(e => exerciseMatches(e, pickerQuery)
    && (pickerCategory === 'All' || (pickerCategory === 'Yours' ? e.custom : e.category === pickerCategory))
    && (!state.settings.onlyMyGear || gearOk(e)));
  $('#picker-list').innerHTML = list.map(e => `<button type="button" class="pick-row" data-action="pick" data-id="${e.id}">
      <span class="dot cat-${catClass(e.category)}" aria-hidden="true"></span>
      <span class="pick-text"><strong>${esc(e.name)}</strong><small>${esc([e.category, e.primary.slice(0, 2).join(', '), (e.gear || []).map(gearLabel).join(', ') || 'No equipment'].filter(Boolean).join(' · '))}</small></span>
      <span class="pick-add" aria-hidden="true">＋</span></button>`).join('')
    || '<p class="muted">Nothing matches. Try fewer words or another category.</p>';
}
chipHandlers['picker-cat'] = v => { pickerCategory = v; renderPickerList(); };
binds['picker-gear'] = el => { state.settings.onlyMyGear = el.checked; save(); renderPickerList(); };

actions.pick = el => {
  const e = exercise(el.dataset.id);
  const list = pickerTarget === '' ? draft.steps : getBlock(pickerTarget).block.steps;
  if (list.length >= 200) { toast('Maximum 200 blocks per list.'); return; }
  list.push(newMove(e));
  draftDirty = true;
  pickerAdded++;
  el.classList.remove('added'); void el.offsetWidth; el.classList.add('added');
  $('#picker-count').textContent = `${plural(pickerAdded, 'exercise')} added`;
  renderEditor();
};
actions['close-picker'] = () => {
  $('#picker').close();
  if (pickerAdded) {
    // Scroll the editor to the newest step so it is visible.
    const blocks = $$('#routine-form .step');
    blocks.at(-1)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
};

// ----------------------------------------------------- add to a routine ----

actions['add-to-routine'] = el => {
  const e = exercise(el.dataset.id);
  showModal(modalHead('Add to a routine', esc(e.name)) + (state.routines.length
    ? `<div class="pick-list">${state.routines.map(r => `<button type="button" class="pick-row" data-action="add-to" data-routine="${r.id}" data-id="${e.id}">
        <span class="dot cat-${catClass(r.category)}"></span><span class="pick-text"><strong>${esc(r.name)}</strong><small>${plural(routineMoves(r).length, 'exercise')} · about ${duration(r)} min</small></span><span class="pick-add">＋</span></button>`).join('')}</div>`
    : '<p class="muted">You have no routines yet.</p>')
    + `<div class="modal-actions"><button class="btn light" data-action="detail" data-id="${e.id}">Back</button><button class="btn" data-action="new-routine-with" data-id="${e.id}">New routine with it</button></div>`);
};
actions['add-to'] = el => {
  const r = routine(el.dataset.routine), e = exercise(el.dataset.id);
  if (r.steps.length >= 200) { toast('That routine is full.'); return; }
  r.steps.push(newMove(e));
  save(); closeModal(); render();
  toast(`Added to “${r.name}”.`);
};
actions['new-routine-with'] = el => {
  const e = exercise(el.dataset.id);
  editRoutine();
  draft.category = e.category;
  draft.steps.push(newMove(e));
  draftDirty = true;
  renderEditor(false);
};
