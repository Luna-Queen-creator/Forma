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
  state.routines.push({ ...structuredClone(r), id: uid(), name: (r.name + ' (copy)').slice(0, 90), steps: freshIds(r.steps), nextNote: '' });
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

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

/** Grip to drag a step (or move it with the arrow keys), with its number. */
function dragHandle(path, i, label) {
  return `<button type="button" class="drag-handle" data-drag-handle data-path="${path}" aria-label="Move ${esc(label)}: drag, or use the arrow keys" title="Drag to reorder">${GRIP}</button>
    <span class="step-number">${i + 1}</span>`;
}

function toolButtons(path) {
  return `<div class="step-tools">
    <button type="button" class="tiny" data-action="block-copy" data-path="${path}" aria-label="Duplicate" title="Duplicate">⧉</button>
    <button type="button" class="tiny remove" data-action="block-remove" data-path="${path}" aria-label="Remove" title="Remove">×</button></div>`;
}

function blockHTML(b, path, i, length) {
  if (b.kind === 'rest') {
    return `<div class="step rest-block" data-path="${path}"><div class="step-head">${dragHandle(path, i, 'break')}
      <div class="step-title"><strong>Break</strong><small>Counts down, then carries on</small></div>${toolButtons(path)}</div>
      <div class="step-main"><label>Seconds<input type="number" data-field="value" min="1" max="3600" step="1" required value="${b.value}"></label></div></div>`;
  }
  if (b.kind === 'group') {
    return `<div class="step repeat-group" data-path="${path}"><div class="step-head">${dragHandle(path, i, b.name || 'repeat group')}
      <div class="step-title"><strong>Repeat group</strong><small>Circuits, supersets and intervals</small></div>${toolButtons(path)}</div>
      <div class="step-main"><label class="grow">Name (optional)<input data-field="name" maxlength="60" value="${esc(b.name)}" placeholder="e.g. Circuit A"></label>
        <label>Rounds<input type="number" data-field="rounds" min="1" max="50" step="1" required value="${b.rounds}"></label></div>
      <div class="blocks">${b.steps.map((x, j) => blockHTML(x, `${path}.${j}`, j, b.steps.length)).join('') || '<p class="muted small empty-group">Empty so far. Add exercises below, or drag steps in here.</p>'}</div>
      ${addControls(path)}</div>`;
  }
  const e = exercise(b.exerciseId);
  const weighted = b.mode !== 'distance' && b.mode !== 'manual' && (['Strength', 'HIIT'].includes(e?.category) || b.weight > 0);
  const both = b.side === 'Both sides';
  return `<div class="step" data-path="${path}"><div class="step-head">${dragHandle(path, i, e?.name || 'exercise')}
    <div class="step-title"><strong>${esc(e?.name || 'Unavailable exercise')}</strong><small>${esc(e?.category || '')}${both ? ' · each side' : ''}${b.section !== 'Main' && b.section !== e?.category ? ' · ' + esc(b.section) : ''}</small></div>
    ${toolButtons(path)}</div>
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
// A compact version of the library: same search, filters and sorting, details on tap,
// and a + button to add. Several exercises can be added in one go; the last add can be undone.

let pickerTarget = '';      // '' = the routine itself, otherwise the path of a repeat group
let pickerAdds = [];        // [{ blockId, exerciseId }] added during this visit, for undo and badges
let pickerScroll = 0;
let pickerDetailId = null;  // the exercise whose details are open inside the picker, if any

actions['open-picker'] = el => openPicker(el.dataset.parent ?? '');
function openPicker(parent) {
  pickerTarget = parent;
  pickerAdds = [];
  listLimits.picker = 60;
  renderPickerShell();
  const dlg = $('#picker');
  if (!dlg.open) dlg.showModal();
  if (matchMedia('(pointer: fine)').matches) $('.filter-search', dlg)?.focus();
}

function pickerTargetList() { return pickerTarget === '' ? draft.steps : getBlock(pickerTarget).block.steps; }
function pickerTargetName() {
  if (pickerTarget === '') return draft.name.trim() || 'your routine';
  return getBlock(pickerTarget).block.name || 'the repeat group';
}

function renderPickerShell() {
  pickerDetailId = null;
  $('#picker-content').innerHTML = `<div class="picker-view">
    <div class="modal-header"><div><h2>Add exercises</h2><p class="muted small">to ${esc(pickerTargetName())}</p></div>
      <button type="button" class="close" data-action="close-picker" aria-label="Close">×</button></div>
    ${filterControlsHTML('picker')}
    <div id="picker-list" class="pick-list"></div>
    ${pickerFootHTML()}</div>`;
  renderPickerList();
}

function pickerFootHTML() {
  const extra = pickerDetailId ? `<button type="button" class="btn lime" data-action="pick" data-id="${pickerDetailId}" data-back="1">${icon('plus')} Add</button>` : '';
  const last = pickerAdds.at(-1);
  const text = pickerAdds.length ? `${plural(pickerAdds.length, 'exercise')} added · last: ${esc(exercise(last.exerciseId)?.name || '')}`
    : pickerDetailId ? '' : 'Tap a name for details, ＋ to add.';
  return `<div class="picker-foot"><span id="picker-count" class="muted small">${text}</span>
    <div class="row">${pickerAdds.length ? '<button type="button" class="btn light small" data-action="picker-undo">Undo</button>' : ''}${extra}
    <button type="button" class="btn" data-action="close-picker">Done</button></div></div>`;
}
function refreshPickerFoot() {
  const foot = $('#picker .picker-foot');
  if (foot) foot.outerHTML = pickerFootHTML();
}

function pickerRow(e, usage) {
  const added = pickerAdds.filter(a => a.exerciseId === e.id).length;
  const n = usedCount(usage, e);
  const last = n ? lastPerformance(e) : null;
  const gearText = esc((e.gear || []).map(gearLabel).join(', ') || 'No equipment');
  const meta2 = last ? `${gearText} · <span class="last">last: ${esc(setsSummary(last.sets))}</span>` : gearText;
  return `<div class="pick-row rich">
    <button type="button" class="pick-info" data-action="picker-detail" data-id="${e.id}" aria-label="Details for ${esc(e.name)}">
      ${bodymap(e, 'mini')}
      <span class="pick-text"><strong>${esc(e.name)}${e.level === 'Advanced' ? ' <span class="badge">Advanced</span>' : ''}${e.custom ? ' <span class="badge">Yours</span>' : ''}</strong>
        <small><span class="dot cat-${catClass(e.category)}" aria-hidden="true"></span>${esc(e.category)} · ${esc(e.primary.slice(0, 3).join(', ') || 'Breath & awareness')}</small>
        <small class="pick-meta">${meta2}</small></span>
    </button>
    <button type="button" class="pick-add ${added ? 'on' : ''}" data-action="pick" data-id="${e.id}" aria-label="Add ${esc(e.name)}">${added ? '✓' + (added > 1 ? `<small>${added}</small>` : '') : '＋'}</button>
  </div>`;
}

function renderPickerList() {
  const box = $('#picker-list');
  if (!box) return;
  const usage = exerciseUsage();
  const { list: all, groupOf } = filterExercises(filters.picker, usage);
  const list = all.slice(0, listLimits.picker);
  const count = $('[data-count="picker"]');
  if (count) count.textContent = plural(all.length, 'exercise');
  box.innerHTML = withHeadings(list, groupOf, e => pickerRow(e, usage), g => `<h3 class="group-head">${esc(g)}</h3>`)
    + (all.length > list.length ? `<div class="center row more-row"><button type="button" class="btn light small" data-action="picker-more">Show ${Math.min(60, all.length - list.length)} more</button></div>` : '')
    + (all.length ? '' : `<div class="empty"><h3>Nothing matches</h3><p class="muted">Try fewer words, another activity or fewer filters.</p><button type="button" class="btn light small" data-action="clear-filters" data-scope="picker">Clear filters</button></div>`);
}
actions['picker-more'] = () => { listLimits.picker += 60; const top = $('#picker-list').scrollTop; renderPickerList(); $('#picker-list').scrollTop = top; };

actions['picker-detail'] = el => {
  const e = exercise(el.dataset.id);
  if (!e) return;
  if ($('#picker-list')) pickerScroll = $('#picker-list').scrollTop;
  pickerDetailId = e.id;
  $('#picker-content').innerHTML = `<div class="picker-view">
    <div class="modal-header"><button type="button" class="text-btn back-btn" data-action="picker-back">‹ All exercises</button>
      <button type="button" class="close" data-action="close-picker" aria-label="Close">×</button></div>
    <div class="picker-detail"><h2>${esc(e.name)}</h2>${exerciseInfoHTML(e, 'picker-detail')}</div>
    ${pickerFootHTML()}</div>`;
};
actions['picker-back'] = () => {
  renderPickerShell();
  const list = $('#picker-list');
  if (list) list.scrollTop = pickerScroll;
};

actions.pick = el => {
  const e = exercise(el.dataset.id);
  const list = pickerTargetList();
  if (list.length >= 200) { toast('Maximum 200 blocks per list.'); return; }
  const block = newMove(e);
  list.push(block);
  pickerAdds.push({ blockId: block.id, exerciseId: e.id });
  draftDirty = true;
  navigator.vibrate?.(8);
  renderEditor();
  if (el.dataset.back) { actions['picker-back'](); toast(`${e.name} added.`); return; }
  updatePickButtons(e.id);
  refreshPickerFoot();
};

/** Update one exercise's ＋ / ✓ button without re-rendering the list (keeps the scroll position). */
function updatePickButtons(exerciseId) {
  const added = pickerAdds.filter(a => a.exerciseId === exerciseId).length;
  $$(`#picker-list .pick-add[data-id="${exerciseId}"]`).forEach(btn => {
    btn.classList.toggle('on', added > 0);
    btn.innerHTML = added ? '✓' + (added > 1 ? `<small>${added}</small>` : '') : '＋';
    if (added) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
  });
}

/** Remove a block anywhere in the draft by id. */
function removeBlockById(blocks, id) {
  const i = blocks.findIndex(b => b.id === id);
  if (i >= 0) { blocks.splice(i, 1); return true; }
  return blocks.some(b => b.kind === 'group' && removeBlockById(b.steps, id));
}

actions['picker-undo'] = () => {
  const last = pickerAdds.pop();
  if (!last) return;
  removeBlockById(draft.steps, last.blockId);
  renderEditor();
  updatePickButtons(last.exerciseId);
  refreshPickerFoot();
  toast(`${exercise(last.exerciseId)?.name || 'Exercise'} removed again.`);
};

actions['close-picker'] = () => {
  $('#picker').close();
  if (pickerAdds.length) {
    // Bring the newest step into view in the editor.
    const added = pathOfBlock(pickerAdds.at(-1).blockId);
    $(`#routine-form [data-path="${added}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
};

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


// --------------------------------------------------------- drag & drop ----
// Pointer events cover mouse, touch and pen. The handle has touch-action: none, so dragging
// it never scrolls the page; the dialog scrolls itself when you drag near its edges.

let drag = null;

/** Path ("3" or "2.1") of a block by id in the current draft. */
function pathOfBlock(id, blocks = draft.steps, prefix = '') {
  for (let i = 0; i < blocks.length; i++) {
    const path = prefix + i;
    if (blocks[i].id === id) return path;
    if (blocks[i].kind === 'group') {
      const inner = pathOfBlock(id, blocks[i].steps, path + '.');
      if (inner) return inner;
    }
  }
  return null;
}

/** Move a block to `index` in the list at `toListPath` ('' = top level). Returns the moved block, or null. */
function moveBlockTo(fromPath, toListPath, index) {
  const from = getBlock(fromPath);
  const target = toListPath === '' ? draft.steps : getBlock(toListPath).block.steps;
  if (from.block.kind === 'group' && toListPath !== '') return null;   // groups do not nest
  if (target === from.list) {
    if (index === from.index || index === from.index + 1) return null; // dropped where it was
    if (index > from.index) index--;
  } else if (target.length >= 200) { toast('Maximum 200 blocks per list.'); return null; }
  from.list.splice(from.index, 1);
  target.splice(index, 0, from.block);
  return from.block;
}

function flashBlock(id) {
  const el = $(`#routine-form [data-path="${pathOfBlock(id)}"]`);
  if (el) { el.classList.remove('just-moved'); void el.offsetWidth; el.classList.add('just-moved'); }
}

/** Every place a dragged step could land: between the cards of each list it may enter. */
function dropSlots() {
  const form = $('#routine-form');
  const lists = [{ el: $(':scope > .blocks', form), path: '' }];
  if (!drag.isGroup) $$('.repeat-group', form).forEach(g => lists.push({ el: $(':scope > .blocks', g), path: g.dataset.path }));
  const slots = [];
  for (const { el, path } of lists) {
    if (!el) continue;
    const box = el.getBoundingClientRect();
    const cards = [...el.children].filter(c => c.matches('[data-path]'));
    if (!cards.length) { slots.push({ path, index: 0, y: box.top + box.height / 2, left: box.left, width: box.width }); continue; }
    let prevBottom = cards[0].getBoundingClientRect().top - 10;
    cards.forEach((c, k) => {
      const r = c.getBoundingClientRect();
      slots.push({ path, index: k, y: (prevBottom + r.top) / 2, left: box.left, width: box.width });
      prevBottom = r.bottom;
    });
    slots.push({ path, index: cards.length, y: prevBottom + 5, left: box.left, width: box.width });
  }
  return slots;
}

function beginDrag(handle, ev) {
  const card = handle.closest('.step');   // the whole card, not the handle (which carries the path too)
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.removeAttribute('data-path');
  $$('[data-path]', ghost).forEach(n => n.removeAttribute('data-path'));
  Object.assign(ghost.style, { width: rect.width + 'px', left: rect.left + 'px', top: rect.top + 'px' });
  const line = document.createElement('div');
  line.className = 'drop-line';
  $('#modal').append(ghost, line);
  card.classList.add('drag-source');
  document.body.classList.add('is-dragging');
  try { handle.setPointerCapture(ev.pointerId); } catch { /* older browsers */ }
  navigator.vibrate?.(12);
  drag = { path: card.dataset.path, id: getBlock(card.dataset.path).block.id, isGroup: card.classList.contains('repeat-group'),
    card, ghost, line, grab: ev.clientY - rect.top, y: ev.clientY, pointerId: ev.pointerId, target: null, raf: 0 };
  moveDrag();
  drag.raf = requestAnimationFrame(autoScroll);
}

function moveDrag() {
  const d = drag;
  d.ghost.style.top = `${d.y - d.grab}px`;
  let best = null;
  for (const slot of dropSlots()) if (!best || Math.abs(slot.y - d.y) < Math.abs(best.y - d.y)) best = slot;
  d.target = best;
  if (best) Object.assign(d.line.style, { top: `${best.y - 2}px`, left: `${best.left}px`, width: `${best.width}px` });
}

function autoScroll() {
  if (!drag) return;
  const modal = $('#modal'), r = modal.getBoundingClientRect(), edge = 90;
  let dy = 0;
  if (drag.y < r.top + edge) dy = -Math.ceil((r.top + edge - drag.y) / 5);
  else if (drag.y > r.bottom - edge) dy = Math.ceil((drag.y - (r.bottom - edge)) / 5);
  if (dy) {
    const before = modal.scrollTop;
    modal.scrollTop += dy;
    if (modal.scrollTop !== before) moveDrag();
  }
  drag.raf = requestAnimationFrame(autoScroll);
}

function endDrag(commit) {
  const d = drag;
  drag = null;
  cancelAnimationFrame(d.raf);
  d.ghost.remove();
  d.line.remove();
  d.card.classList.remove('drag-source');
  document.body.classList.remove('is-dragging');
  if (!commit || !d.target) return;
  if (moveBlockTo(d.path, d.target.path, d.target.index)) {
    draftDirty = true;
    renderEditor();
    flashBlock(d.id);
  }
}

document.addEventListener('pointerdown', ev => {
  const handle = ev.target.closest?.('[data-drag-handle]');
  if (!handle || !draft || drag || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  ev.preventDefault();
  beginDrag(handle, ev);
});
document.addEventListener('pointermove', ev => {
  if (!drag || ev.pointerId !== drag.pointerId) return;
  ev.preventDefault();
  drag.y = ev.clientY;
  moveDrag();
}, { passive: false });
document.addEventListener('pointerup', ev => { if (drag && ev.pointerId === drag.pointerId) endDrag(true); });
document.addEventListener('pointercancel', ev => { if (drag && ev.pointerId === drag.pointerId) endDrag(false); });

// Keyboard: focus a grip and press the up / down arrow keys.
document.addEventListener('keydown', ev => {
  const handle = ev.target.closest?.('[data-drag-handle]');
  if (!handle || !draft || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
  ev.preventDefault();
  const { list, index, block } = getBlock(handle.dataset.path);
  const to = index + (ev.key === 'ArrowUp' ? -1 : 1);
  if (to < 0 || to >= list.length) return;
  [list[index], list[to]] = [list[to], list[index]];
  draftDirty = true;
  renderEditor();
  $(`#routine-form [data-path="${pathOfBlock(block.id)}"] > .step-head [data-drag-handle]`)?.focus();
  flashBlock(block.id);
});

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
