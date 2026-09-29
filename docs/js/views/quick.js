// Quick start: repeat recent routines, interval timer, meditation & breathing, logging outside activities.
'use strict';

const INTERVAL_PRESETS = [
  { label: 'Tabata 20/10 × 8', work: 20, rest: 10, rounds: 8 },
  { label: '30/30 × 10', work: 30, rest: 30, rounds: 10 },
  { label: '40/20 × 10', work: 40, rest: 20, rounds: 10 },
  { label: '45/15 × 12', work: 45, rest: 15, rounds: 12 },
  { label: '1 min on / 1 off × 8', work: 60, rest: 60, rounds: 8 },
];
const MEDITATION_GUIDES = [
  { id: 'breath', label: 'Silent, with a bell' },
  { id: 'x-box-breathing', label: 'Box breathing (4-4-4-4)' },
  { id: 'x-coherent-breathing', label: 'Coherent breathing (5-5)' },
  { id: 'x-478-breathing', label: '4-7-8 breathing' },
  { id: 'lib-body-scan', label: 'Body scan' },
  { id: 'lib-loving-kindness-meditation', label: 'Loving-kindness' },
];

renderers.quick = () => {
  const recentIds = [];
  for (let i = state.history.length - 1; i >= 0 && recentIds.length < 4; i--) {
    const id = state.history[i].routineId;
    if (id && routine(id) && !recentIds.includes(id)) recentIds.push(id);
  }
  app().innerHTML = heading('Just start.', 'Timers and quick sessions when you do not want to plan.')
    + (recentIds.length ? `<div class="section-head first"><h2>Do it again</h2></div><div class="recent-list">${recentIds.map(id => {
      const r = routine(id);
      return `<div class="recent-item"><span class="dot cat-${catClass(r.category)}"></span><div><strong>${esc(r.name)}</strong><small>about ${duration(r)} min · last ${shortDate(new Date(lastDoneTime(r)))}</small></div>
        <button class="btn" data-action="start" data-id="${r.id}">Start</button></div>`;
    }).join('')}</div>` : '')
    + `<div class="quick-grid">
      <section class="panel"><span class="category">HIIT · INTERVALS</span><h2>Interval timer</h2>
        <p class="muted small">Work, rest, repeat. Beeps count you into every change.</p>
        <div class="chips">${INTERVAL_PRESETS.map((p, i) => `<button type="button" class="chip" data-action="interval-preset" data-index="${i}">${p.label}</button>`).join('')}</div>
        <form id="interval-form">
          <div class="form-grid three"><div class="field"><label for="iv-work">Work (sec)</label><input id="iv-work" name="work" type="number" min="5" max="3600" required value="20"></div>
          <div class="field"><label for="iv-rest">Rest (sec)</label><input id="iv-rest" name="rest" type="number" min="0" max="3600" required value="10"></div>
          <div class="field"><label for="iv-rounds">Rounds</label><input id="iv-rounds" name="rounds" type="number" min="1" max="50" required value="8"></div></div>
          <label class="checkrow"><input type="checkbox" name="keep"> Also save it as a routine</label>
          <button class="btn">Start timer</button>
        </form></section>

      <section class="panel"><span class="category">MEDITATION · BREATH</span><h2>A moment to come back</h2>
        <p class="muted small">No score, no perfect technique. Guided patterns show a breathing circle to follow.</p>
        <form id="meditate-form">
          <div class="form-grid"><div class="field"><label for="med-guide">Guide</label><select id="med-guide" name="guide">${MEDITATION_GUIDES.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="med-minutes">Minutes</label><input id="med-minutes" name="minutes" type="number" min="1" max="120" required value="5"></div></div>
          <label class="checkrow"><input type="checkbox" name="bell" checked> Sound a bell when finished</label>
          <button class="btn">Begin</button>
        </form></section>

      <section class="panel"><span class="category">ANYTHING ELSE</span><h2>Log an activity</h2>
        <p class="muted small">Ran, climbed, played football, took a class? Log it so your week and progress show everything in one place.</p>
        <button class="btn" data-action="log-activity">${icon('plus')} Log activity</button></section>

      <section class="panel"><span class="category">JUST CURIOUS</span><h2>Player demo</h2>
        <p class="muted small">A one-minute run-through of sides, breaks and rounds. No movement needed and nothing is saved.</p>
        <button class="btn light" data-action="test-player">Try the demo</button></section>
    </div>`;
};

actions['interval-preset'] = el => {
  const p = INTERVAL_PRESETS[Number(el.dataset.index)];
  const f = $('#interval-form');
  f.elements.work.value = p.work; f.elements.rest.value = p.rest; f.elements.rounds.value = p.rounds;
};

forms['interval-form'] = (f, fd) => {
  const work = Number(fd.get('work')), rest = Number(fd.get('rest')), rounds = Number(fd.get('rounds'));
  const r = {
    id: uid(), name: `Intervals ${work}/${rest} × ${rounds}`, category: 'HIIT', transition: 0,
    description: `${rounds} rounds of ${work} seconds work and ${rest} seconds rest.`,
    steps: [tplGroup(rounds, [tplStep('x-work-interval', 'Main', { value: work }), ...(rest ? [tplRest(rest)] : [])], 'Intervals')],
  };
  if (fd.has('keep')) { state.routines.push({ ...r, createdAt: new Date().toISOString() }); save(); }
  startSession(r);
};

forms['meditate-form'] = (f, fd) => {
  const guide = fd.get('guide');
  const e = exercise(guide) || exercise('breath');
  const seconds = Number(fd.get('minutes')) * 60;
  startSession({ id: '', name: e.id === 'breath' ? 'Quiet meditation' : e.name, category: 'Meditation', transition: 0,
    steps: [tplStep(e.id, 'Main', { value: seconds })] }, { meditation: true, bell: fd.has('bell'), autoStart: true });
};

actions['test-player'] = () => startSession({
  name: 'Player demo', category: 'Other', transition: 5, isDemo: true,
  steps: [tplStep('mountain', 'Main', { value: 5, side: 'Both sides', sideSwitch: 5 }), tplRest(5),
    tplGroup(2, [tplStep('mountain', 'Main', { value: 5 }), tplRest(5)]), tplStep('mountain', 'Main', { value: 1, mode: 'reps' })],
});

// ------------------------------------------------------- log activity ----

actions['log-activity'] = () => activityForm();
function activityForm(entry) {
  const e = entry || { kind: 'Run', name: '', at: new Date().toISOString(), seconds: 1800 };
  const d = new Date(e.at);
  const type = ACTIVITY_TYPES.find(t => t.name === e.kind) || ACTIVITY_TYPES[0];
  showModal(modalHead(entry ? 'Edit activity' : 'Log an activity', 'Anything you did outside the player.') + `<form id="activity-form" data-id="${entry?.id || ''}">
    <div class="form-grid"><div class="field"><label for="act-kind">Type</label><select id="act-kind" name="kind" data-bind="activity-kind">${options(ACTIVITY_TYPES.map(t => t.name), type.name)}</select></div>
      <div class="field"><label for="act-name">Name (optional)</label><input id="act-name" name="name" maxlength="90" value="${esc(entry && entry.name !== entry.kind ? entry.name : '')}" placeholder="e.g. Bouldering with Sam"></div></div>
    <div class="form-grid three"><div class="field"><label for="act-date">Date</label><input id="act-date" name="date" type="date" required value="${dateKey(d)}"></div>
      <div class="field"><label for="act-time">Start time</label><input id="act-time" name="time" type="time" value="${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}"></div>
      <div class="field"><label for="act-min">Minutes</label><input id="act-min" name="minutes" type="number" min="1" max="1440" required value="${Math.round(e.seconds / 60)}"></div></div>
    <div class="field distance-field" ${type.distance ? '' : 'hidden'}><label for="act-dist">Distance (${distanceUnit()}, optional)</label><input id="act-dist" name="distance" type="number" min="0" max="10000" step="0.01" value="${e.distance ? fmtNum(mToDisplay(e.distance), 2) : ''}"></div>
    <div class="field"><label>Effort (optional)</label>${effortPicker(e.effort)}</div>
    <div class="field"><label for="act-note">Note (optional)</label><textarea id="act-note" name="note" maxlength="2000" placeholder="How did it feel?">${esc(e.note || '')}</textarea></div>
    <div class="modal-actions"><button type="button" class="btn light" data-action="close">Cancel</button><button class="btn">Save</button></div></form>`);
}
binds['activity-kind'] = el => {
  const type = ACTIVITY_TYPES.find(t => t.name === el.value);
  el.form.querySelector('.distance-field').hidden = !type?.distance;
};
forms['activity-form'] = (f, fd) => {
  const type = ACTIVITY_TYPES.find(t => t.name === fd.get('kind')) || ACTIVITY_TYPES.at(-1);
  if (!isValidDateKey(fd.get('date'))) { toast('Choose a date.'); return; }
  const at = new Date(`${fd.get('date')}T${fd.get('time') || '12:00'}:00`);
  const dist = Number(fd.get('distance'));
  const entry = {
    id: f.dataset.id || uid(), type: 'activity', kind: type.name, name: fd.get('name').trim() || type.name,
    category: type.category, at: at.toISOString(), seconds: Number(fd.get('minutes')) * 60, skipped: 0, steps: [],
    distance: type.distance && dist > 0 ? displayToM(dist) : undefined, effort: readEffort(fd), note: fd.get('note').trim(),
  };
  state.history = state.history.filter(h => h.id !== entry.id);
  addHistory(entry);
  closeModal(); render();
  toast(f.dataset.id ? 'Activity updated.' : 'Logged. Nice work.');
};
