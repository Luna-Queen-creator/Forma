// The session player: timing, logging actual sets, sounds, wake lock and the breathing guide.
'use strict';

let session = null;
let timerHandle = null;
let lastPersistSecond = -1;
let howToOpen = window.innerWidth > 760;

const current = () => session.queue[session.index];
const isTimed = q => q.kind !== 'move' || q.mode === 'time';
const isWeighted = q => q.kind === 'move' && q.mode !== 'distance' && q.mode !== 'manual'
  && (['Strength', 'HIIT'].includes(q.exercise.category) || q.weight > 0);

function startSession(r, { meditation = false, bell = true, autoStart = false } = {}) {
  if (session) { toast('Finish your current session first.'); return; }
  let queue;
  try { queue = compileRoutine(r); } catch (err) { toast(err.message); return; }
  if (!queue.some(q => q.kind === 'move')) { toast('Add an exercise to this routine first.'); return; }
  closeDialogs();
  initAudio();
  session = {
    id: uid(), name: r.name, routineId: r.id && routine(r.id) ? r.id : undefined, category: r.category || 'Other',
    queue, index: 0, remaining: 0, running: false, deadline: 0, elapsed: 0, lastTick: Date.now(), stepElapsed: 0,
    skippedIdx: [], skipped: 0, completed: [], bell, meditation, started: new Date().toISOString(),
    recovered: false, isDemo: !!r.isDemo, pending: null,
  };
  enterStep(false);
  armTimer();
  window.scrollTo(0, 0);
  if (autoStart) toggleTimer();
}

function resumeSession(snapshot) {
  session = structuredClone(snapshot);
  session.running = false;
  session.recovered = true;
  session.lastTick = Date.now();
  session.skippedIdx ??= [];
  // Sessions saved by the first version of Forma did not record their routine.
  if (!session.category) {
    const r = state.routines.find(x => x.name === session.name);
    session.routineId ??= r?.id;
    session.category = r?.category || (session.meditation ? 'Meditation' : 'Other');
  }
  if (!session.pending) prefill();
  armTimer();
}

function sessionSnapshot() {
  return structuredClone({ ...session, running: false, recovered: true, deadline: 0, lastTick: 0 });
}

function armTimer() { clearInterval(timerHandle); timerHandle = setInterval(tick, 200); }

/** Prepare the current step: reset its clock and pre-fill what will be logged. */
function enterStep(autoRun) {
  const s = session, q = current();
  s.remaining = isTimed(q) ? q.value : 0;
  s.stepElapsed = 0;
  s.lastBeep = null;
  s.running = autoRun && !(q.kind === 'move' && q.waitReady);
  s.recovered = false;
  s.deadline = Date.now() + s.remaining * 1000;
  s.lastTick = Date.now();
  prefill();
  saveSession();
  render();
  updateWakeLock();
}

/** The most relevant set from last time: same set number and side if possible. */
function lastSetFor(q) {
  const last = lastPerformance(q.exercise);
  if (!last) return null;
  return last.sets.find(t => t.set === q.set && t.side === q.side) || last.sets.find(t => t.set === q.set) || last.sets.at(-1);
}

function prefill() {
  const q = current();
  if (q.kind !== 'move') { session.pending = null; return; }
  const last = lastSetFor(q);
  const useLast = !q.weight && last?.weight > 0 && isWeighted(q);
  session.pending = {
    reps: q.mode === 'reps' ? q.value : undefined,
    weight: useLast ? last.weight : q.weight || 0,
    distance: q.mode === 'distance' ? q.value : undefined,
    weightFromLast: useLast,
  };
}

function accountTime(now = Date.now()) {
  if (!session?.running) return;
  const delta = Math.max(0, (now - session.lastTick) / 1000);
  session.elapsed += delta;
  session.stepElapsed = (session.stepElapsed || 0) + delta;
  session.lastTick = now;
  if (isTimed(current())) session.remaining = Math.max(0, (session.deadline - now) / 1000);
}

function toggleTimer() {
  if (!session) return;
  initAudio();
  if (session.running) { accountTime(); session.running = false; }
  else {
    session.running = true;
    session.recovered = false;
    session.deadline = Date.now() + session.remaining * 1000;
    session.lastTick = Date.now();
  }
  saveSession();
  renderSession();
  updateWakeLock();
}

function tick() {
  if (!session?.running) return;
  const now = Date.now(), q = current();
  // A countdown that stalled for more than five seconds means the device slept: pause instead of skipping ahead.
  if (isTimed(q) && now - session.lastTick > 5000) {
    session.running = false;
    session.recovered = true;
    saveSession(); renderSession(); updateWakeLock();
    return;
  }
  accountTime(now);
  if (isTimed(q)) {
    const left = Math.ceil(session.remaining);
    if (state.settings.countdown && left >= 1 && left <= 3 && q.value > 5 && left !== session.lastBeep) { session.lastBeep = left; beep(); }
    if (session.remaining <= 0) {
      if (session.bell && state.settings.sounds) bell();
      advance(false);
      return;
    }
  }
  updateLiveParts();
  const second = Math.floor(now / 1000);
  if (second !== lastPersistSecond) { lastPersistSecond = second; saveSession(); }
}

function advance(skipped = false) {
  if (!session) return;
  accountTime();
  const s = session, q = current();
  if (q.kind === 'move') {
    if (skipped) s.skippedIdx.push(s.index);
    else logCurrentSet();
  }
  s.index++;
  if (s.index >= s.queue.length) { finishSession(); return; }
  enterStep(true);
}

function logCurrentSet() {
  const s = session, q = current(), p = s.pending || {};
  const entry = {
    queueIndex: s.index, exerciseId: q.exercise.id, name: q.exercise.name, category: q.exercise.category,
    mode: q.mode, value: q.value, weight: isWeighted(q) ? (p.weight ?? q.weight ?? 0) : (q.weight || 0),
    side: q.side, set: q.set, sets: q.sets, roundLabel: q.roundLabel || '', actualSeconds: Math.round(s.stepElapsed || 0),
  };
  if (q.mode === 'reps') entry.reps = p.reps ?? q.value;
  if (q.mode === 'distance') entry.distance = p.distance ?? q.value;
  s.completed.push(entry);
  // A weight changed mid-exercise usually applies to the remaining sets too.
  if (entry.weight !== q.weight) {
    for (let j = s.index + 1; j < s.queue.length; j++) {
      const x = s.queue[j];
      if (x.kind === 'move' && x.blockId && x.blockId === q.blockId) x.weight = entry.weight;
    }
  }
}

/** Step back to the previous exercise and forget what was logged from there on. */
function goBack() {
  const s = session;
  if (!s || s.index === 0) return;
  accountTime();
  let target = s.index - 1;
  while (target > 0 && s.queue[target].kind !== 'move') target--;
  s.completed = s.completed.filter(c => (c.queueIndex ?? -1) < target);
  s.skippedIdx = s.skippedIdx.filter(i => i < target);
  s.index = target;
  enterStep(false);
}

function finishSession() {
  const s = session;
  clearInterval(timerHandle);
  session = null;
  saveSession();
  updateWakeLock();
  if (s.isDemo) { render(); toast('Demo complete. Nothing was added to your history.'); return; }
  if (!s.completed.length) { render(); toast('Session ended. There were no completed exercises to record.'); return; }
  if (state.history.some(h => h.id === s.id)) { render(); return; }
  const entry = {
    id: s.id, type: 'session', name: s.name, routineId: s.routineId, category: s.category,
    at: new Date().toISOString(), seconds: Math.round(s.elapsed), skipped: s.skippedIdx.length + (s.skipped || 0),
    steps: s.completed.map(({ queueIndex, ...rest }) => rest), note: '',
  };
  addHistory(entry);
  const changes = carryOverToRoutine(s);
  render();
  summaryDialog(entry, changes);
}

let lastCarry = null;   // what the latest session changed in its routine, so it can be undone

/** Find a block anywhere in a routine by id. */
function findBlock(blocks, id) {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.kind === 'group') { const inner = findBlock(b.steps, id); if (inner) return inner; }
  }
  return null;
}

/** The reps you hit on most sets (ties go to the higher number). */
function typicalReps(list) {
  const counts = new Map();
  list.forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
  let best = list[0];
  for (const [v, c] of counts) if (c > counts.get(best) || (c === counts.get(best) && v > best)) best = v;
  return best;
}

/**
 * Progressive overload: write the weight and reps actually used back into the routine,
 * so the next session starts from there. Returns what changed.
 */
function carryOverToRoutine(s) {
  lastCarry = null;
  const r = s.routineId && routine(s.routineId);
  if (!r) return [];
  const byBlock = new Map();
  for (const c of s.completed) {
    const q = s.queue[c.queueIndex];
    if (!q?.blockId) continue;
    if (!byBlock.has(q.blockId)) byBlock.set(q.blockId, []);
    byBlock.get(q.blockId).push(c);
  }
  const changes = [];
  for (const [id, sets] of byBlock) {
    const b = findBlock(r.steps, id);
    if (!b || b.kind !== 'exercise') continue;
    const before = { weight: b.weight || 0, value: b.value };
    const last = sets.at(-1);
    if (last.weight > 0 && Math.abs(last.weight - before.weight) > 0.001) b.weight = Math.round(last.weight * 1000) / 1000;
    if (b.mode === 'reps' && sets.every(t => t.mode === 'reps')) {
      const reps = Math.round(typicalReps(sets.map(t => t.reps ?? t.value)));
      if (reps >= 1 && reps <= 7200) b.value = reps;
    }
    if (b.weight !== before.weight || b.value !== before.value) {
      changes.push({ id, name: last.name, mode: b.mode, before, after: { weight: b.weight, value: b.value } });
    }
  }
  if (changes.length) { lastCarry = { routineId: r.id, changes }; save(); }
  return changes;
}

function carryText(c) {
  const parts = [];
  if (c.before.weight !== c.after.weight) parts.push(`${fmtNum(kgToDisplay(c.before.weight), 1)} → ${fmtWeight(c.after.weight)}`);
  if (c.before.value !== c.after.value) parts.push(`${c.before.value} → ${c.after.value} reps`);
  return `${c.name}: ${parts.join(', ')}`;
}

actions['undo-carry'] = el => {
  const r = lastCarry && routine(lastCarry.routineId);
  if (!r) return;
  for (const c of lastCarry.changes) {
    const b = findBlock(r.steps, c.id);
    if (b) { b.weight = c.before.weight; b.value = c.before.value; }
  }
  lastCarry = null;
  save();
  el.closest('.carry')?.remove();
  toast('Kept your previous plan.');
};

function summaryDialog(entry, changes = []) {
  const r = entry.routineId && routine(entry.routineId);
  const records = newRecords(entry);
  const volume = entryVolume(entry), distance = entryDistance(entry);
  const tile = (label, value) => `<div class="stat small-stat"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong></div>`;
  showModal(modalHead(entry.category === 'Meditation' ? 'Nicely done.' : 'Session complete', esc(entry.name))
    + `<div class="stats compact">${tile('Time', fmtDuration(entry.seconds))}${entry.category !== 'Meditation' ? tile('Sets', entry.steps.length) : ''}
      ${volume ? tile('Lifted', `${Math.round(kgToDisplay(volume)).toLocaleString()} ${weightUnit()}`) : ''}${distance ? tile('Distance', fmtDistance(distance)) : ''}</div>
    ${records.length ? `<div class="note good"><strong>New personal best${records.length > 1 ? 's' : ''}</strong><ul>${records.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${changes.length ? `<div class="note carry"><strong>Saved for next time</strong><ul>${changes.map(c => `<li>${esc(carryText(c))}</li>`).join('')}</ul>
      <button type="button" class="link" data-action="undo-carry">Keep my previous plan instead</button></div>` : ''}
    ${entry.skipped ? `<p class="muted small">${plural(entry.skipped, 'step')} skipped.</p>` : ''}
    <form id="summary-form" data-id="${entry.id}">
      <div class="field"><label>How hard was it?</label>${effortPicker()}</div>
      ${r ? `<div class="field"><label for="sum-note">Note for next time</label><textarea id="sum-note" name="note" maxlength="2000" placeholder="e.g. increase the weight on hammer curls">${esc(r.nextNote || '')}</textarea>
        <small>Shows up before you start “${esc(r.name)}” again. Leave it empty and nothing pops up.</small></div>`
        : `<div class="field"><label for="sum-note">Note (optional)</label><textarea id="sum-note" name="note" maxlength="2000" placeholder="Anything to remember?"></textarea></div>`}
      <div class="modal-actions"><button type="button" class="btn light" data-action="close">Skip</button><button class="btn">Save</button></div></form>`);
}
forms['summary-form'] = (f, fd) => {
  const h = state.history.find(x => x.id === f.dataset.id);
  const note = fd.get('note').trim();
  if (h) {
    h.effort = readEffort(fd);
    h.note = note;
    const r = h.routineId && routine(h.routineId);
    if (r) r.nextNote = note;
    save();
  }
  closeModal(); render(); toast('Saved. A little time for you.');
};

function exitSession() {
  if (session?.running) toggleTimer();
  const done = session.completed.length;
  showModal(modalHead('Finish for now?') + `<p>${done ? `You have completed ${plural(done, 'set')}. Save them, or leave without recording anything.` : 'Nothing has been completed yet.'}</p>
    <div class="modal-actions"><button class="btn light" data-action="close">Keep going</button>
    <button class="btn danger" data-action="discard-session">Discard</button>${done ? '<button class="btn" data-action="save-partial">Save completed sets</button>' : ''}</div>`);
}

function pauseForBackground() {
  if (!session) return;
  // Countdowns pause so nothing is missed; stopwatches (reps, holds, runs) keep counting.
  if (session.running && isTimed(current())) { accountTime(); session.running = false; session.recovered = true; renderSession(); }
  else accountTime();
  saveSession();
}

// -------------------------------------------------------------- render ----

function stepTitle(q) {
  if (q.kind === 'move') return q.exercise.name;
  if (q.kind === 'switch') return `Switch to ${q.nextSide.toLowerCase()} side`;
  if (q.kind === 'transition') return 'Get ready';
  return 'Rest';
}

function logFieldsHTML(q) {
  const p = session.pending || {};
  const field = (key, label, value, step) => `<div class="log-field"><span>${label}</span><div class="stepper">
    <button type="button" data-action="adj" data-k="${key}" data-d="-${step}" aria-label="Less">−</button>
    <input type="number" inputmode="decimal" data-log="${key}" value="${value}" min="0" step="${step}" aria-label="${label}">
    <button type="button" data-action="adj" data-k="${key}" data-d="${step}" aria-label="More">+</button></div></div>`;
  const parts = [];
  if (q.mode === 'reps') parts.push(field('reps', 'Reps done', p.reps ?? q.value, 1));
  if (isWeighted(q)) parts.push(field('weight', `Weight (${weightUnit()})`, fmtNum(kgToDisplay(p.weight || 0), 1), imperial() ? 5 : 2.5));
  if (q.mode === 'distance') parts.push(field('distance', `Distance (${distanceUnit()})`, fmtNum(mToDisplay(p.distance ?? q.value), 2), 0.1));
  return parts.length ? `<div class="log-row">${parts.join('')}</div>` : '';
}

function lastTimeHTML(q) {
  const last = lastPerformance(q.exercise);
  if (!last) return '';
  const fromLast = session.pending?.weightFromLast ? ' · weight filled in from last time' : '';
  return `<p class="last-time">Last time (${shortDate(new Date(last.entry.at))}): <strong>${esc(setsSummary(last.sets))}</strong>${fromLast}</p>`;
}

function breathState(pattern, t) {
  const cycle = sum(pattern, p => p.seconds);
  const totalIn = sum(pattern.filter(p => p.phase === 'in'), p => p.seconds) || 1;
  const totalOut = sum(pattern.filter(p => p.phase === 'out'), p => p.seconds) || 1;
  let x = t % cycle, level = 0;
  for (const p of pattern) {
    if (x < p.seconds) {
      const f = x / p.seconds;
      const now = p.phase === 'in' ? level + (p.seconds / totalIn) * f : p.phase === 'out' ? level - (p.seconds / totalOut) * f : level;
      return { phase: p, left: p.seconds - x, level: clamp(now, 0, 1) };
    }
    x -= p.seconds;
    level += p.phase === 'in' ? p.seconds / totalIn : p.phase === 'out' ? -p.seconds / totalOut : 0;
  }
  return { phase: pattern[0], left: pattern[0].seconds, level: 0 };
}
const BREATH_WORDS = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out' };

function updatePacer() {
  const q = current();
  const circle = $('#pacer-circle');
  if (!circle || !q.exercise?.breath) return;
  const st = breathState(q.exercise.breath, session.stepElapsed || 0);
  circle.style.transform = `scale(${(0.5 + 0.5 * st.level).toFixed(3)})`;
  $('#pacer-label').textContent = session.running ? (st.phase.label || BREATH_WORDS[st.phase.phase]) : 'Tap Begin';
  $('#pacer-count').textContent = session.running ? Math.ceil(st.left) : '';
}

function renderSession() {
  const s = session, q = current(), move = q.kind === 'move', e = q.exercise, timed = isTimed(q);
  const upcoming = move ? null : s.queue.slice(s.index + 1).find(x => x.kind === 'move');
  const next = s.queue[s.index + 1];
  $('#breadcrumb').textContent = 'YOUR SESSION';
  $$('nav [data-view]').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });

  let visual;
  if (move && e.breath && timed) visual = '<div class="pacer" aria-hidden="true"><div class="pacer-circle" id="pacer-circle"></div><div class="pacer-text"><strong id="pacer-label"></strong><span id="pacer-count"></span></div></div>';
  else if (move && !e.primary.length) visual = `<div class="breath ${s.running ? 'running' : ''}">${e.category === 'Meditation' ? 'Simply be here' : 'Your move'}</div>`;
  else if (move) visual = bodymap(e, 'session-map');
  else if (upcoming) visual = `<div class="prepare-next"><span class="category">${q.kind === 'switch' ? 'Other side' : 'Up next'}</span><strong>${esc(upcoming.exercise.name)}</strong>
    ${['Left', 'Right'].includes(upcoming.side) ? `<span>${esc(upcoming.side)} side</span>` : ''}<span class="muted small">${esc(targetText(upcoming))}</span></div>`;
  else visual = '<div class="breath">Take your time</div>';

  let display;
  if (move && q.mode === 'reps') display = `<div class="big-target"><strong>${q.value}</strong><span>reps${q.weight ? ' · ' + fmtWeight(q.weight) : ''}</span></div><p class="set-clock muted small">Set time <span id="timer-display">${formatClock(s.stepElapsed)}</span></p>`;
  else if (move && q.mode === 'distance') display = `<p class="target-line">Target ${fmtDistance(q.value)}</p><div class="timer" id="timer-display">${formatClock(s.stepElapsed)}</div>`;
  else if (move && q.mode === 'manual') display = `<div class="timer" id="timer-display">${formatClock(s.stepElapsed)}</div><p class="muted small">Open hold. Finish whenever you choose.</p>`;
  else display = `<div class="timer" id="timer-display">${formatClock(s.remaining)}</div><div class="step-bar"><span id="step-bar" style="width:${q.value ? (100 * (1 - s.remaining / q.value)).toFixed(1) : 0}%"></span></div>`;

  const complete = move ? (q.mode === 'reps' ? `${icon('check')} Set done` : q.mode === 'time' ? `${icon('check')} Done` : `${icon('check')} Finish`)
    : q.kind === 'rest' ? 'Skip rest' : 'Ready';
  const pillText = move ? `${esc(e.category)}${q.sets > 1 ? ` · Set ${q.set} of ${q.sets}` : ''}` : q.kind === 'rest' ? 'REST' : q.kind === 'switch' ? 'CHANGE SIDES' : 'GET READY';
  const context = [q.section !== 'Main' ? q.section : '', q.groupName, q.roundLabel].filter(Boolean).map(esc).join(' · ');

  app().innerHTML = `<section class="session">
    <div class="session-top"><button class="text-btn" data-action="exit-session">End session</button>
      <span class="muted small">Step ${s.index + 1} of ${s.queue.length} · <span id="session-elapsed">${formatClock(s.elapsed)}</span></span></div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.queue.length}" aria-valuenow="${s.index}"><span style="width:${(s.index / s.queue.length) * 100}%"></span></div>
    ${s.recovered ? '<p class="note">Your session was paused. Tap Begin when you are ready; the time away was not counted.</p>' : ''}
    ${s.isDemo ? '<p class="note">Demo only: no movement needed. Watch sides, breaks and two rounds go by, then tap Set done at the last step.</p>' : ''}
    <p class="category session-name">${esc(s.name)}${context ? ' · ' + context : ''}</p>
    <div class="session-card ${move ? 'is-move' : 'is-pause'}">
      <span class="pill">${pillText}</span>
      ${visual}
      <h1 class="session-title">${esc(stepTitle(q))}</h1>
      ${move && ['Left', 'Right'].includes(q.side) ? `<p class="side-label">${q.side} side</p>` : ''}
      ${display}
      ${move ? logFieldsHTML(q) : ''}
      ${move && q.note ? `<p class="step-note">${esc(q.note)}</p>` : ''}
      ${move && q.waitReady && !s.running && !s.stepElapsed ? '<p class="muted small">Take your position, then tap Begin.</p>' : ''}
      <div class="player-controls">
        <button class="round-btn" data-action="step-back" aria-label="Previous exercise" ${s.index === 0 ? 'disabled' : ''}>‹</button>
        <button class="btn ${s.running ? 'light' : ''} main-toggle" data-action="toggle-timer">${s.running ? 'Pause' : 'Begin'}</button>
        <button class="btn lime" data-action="complete-step">${complete}</button>
        ${timed ? '<button class="btn light" data-action="add-time">+10 s</button>' : ''}
        <button class="round-btn" data-action="skip-step" aria-label="Skip this step" title="Skip">›</button>
      </div>
      ${move ? lastTimeHTML(q) : ''}
      ${move && e.instructions.length ? `<details class="how-to" ${howToOpen ? 'open' : ''}><summary>How to do it</summary><ol class="instructions">${e.instructions.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details>` : ''}
      ${!move && upcoming && upcoming === next ? '' : next ? `<p class="note up-next">Up next: <strong>${esc(stepTitle(next))}</strong>${next.kind === 'move' ? ' · ' + esc(targetText(next)) : ` · ${fmtDuration(next.value)}`}</p>` : '<p class="note up-next">Last step. Finish at your own pace.</p>'}
    </div>
  </section>`;
  updateLiveParts();
  updateSaveBadges();
}

function targetText(q) {
  const amount = q.mode === 'reps' ? `${q.value} reps` : q.mode === 'distance' ? fmtDistance(q.value) : fmtDuration(q.value);
  return amount + (q.weight ? ` · ${fmtWeight(q.weight)}` : '') + (['Left', 'Right'].includes(q.side) ? ` · ${q.side.toLowerCase()}` : '');
}

/** Cheap per-tick updates without re-rendering the card (keeps inputs focused). */
function updateLiveParts() {
  if (!session) return;
  const q = current();
  const el = $('#timer-display');
  if (el) el.textContent = formatClock(isTimed(q) ? session.remaining : session.stepElapsed);
  const bar = $('#step-bar');
  if (bar && q.value) bar.style.width = `${(100 * (1 - session.remaining / q.value)).toFixed(1)}%`;
  const total = $('#session-elapsed');
  if (total) total.textContent = formatClock(session.elapsed);
  updatePacer();
}

// ------------------------------------------------------------- actions ----

actions.start = el => startRoutine(routine(el.dataset.id));

/** Start a saved routine, first showing the note left for this session if there is one. */
function startRoutine(r) {
  if (!r) return;
  if (!r.nextNote?.trim()) { startSession(r); return; }
  showModal(modalHead('Note from last time', esc(r.name)) + `<form id="prestart-form" data-id="${r.id}">
    <textarea id="prestart-note" name="note" maxlength="2000" aria-label="Note for this session">${esc(r.nextNote)}</textarea>
    <p class="muted small">You can edit it now, or after the session.</p>
    <div class="modal-actions"><button type="button" class="btn light" data-action="prestart-clear">Clear note</button><button class="btn">Start session</button></div></form>`);
}
forms['prestart-form'] = (f, fd) => {
  const r = routine(f.dataset.id);
  if (!r) return;
  r.nextNote = fd.get('note').trim();
  save();
  startSession(r);
};
actions['prestart-clear'] = () => { const t = $('#prestart-note'); if (t) { t.value = ''; t.focus(); } };
actions['toggle-timer'] = () => toggleTimer();
actions['complete-step'] = () => advance(false);
actions['skip-step'] = () => advance(true);
actions['step-back'] = () => goBack();
actions['exit-session'] = () => exitSession();
actions['add-time'] = () => {
  if (!session) return;
  accountTime();
  session.remaining = Math.min(86400, session.remaining + 10);
  session.deadline = Date.now() + session.remaining * 1000;
  session.lastBeep = null;
  saveSession();
  updateLiveParts();
};
actions['discard-session'] = () => {
  clearInterval(timerHandle);
  session = null;
  saveSession(); updateWakeLock(); closeModal(); render();
};
actions['save-partial'] = () => { closeModal(); finishSession(); };
actions.adj = el => {
  if (!session?.pending) return;
  const key = el.dataset.k, delta = Number(el.dataset.d);
  const input = $(`[data-log="${key}"]`);
  const next = Math.max(0, Math.round((Number(input.value || 0) + delta) * 100) / 100);
  input.value = key === 'reps' ? Math.round(next) : fmtNum(next, 2);
  setPending(key, input.value);
};

function setPending(key, raw) {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return;
  if (key === 'reps') session.pending.reps = Math.min(10000, Math.round(v));
  if (key === 'weight') { session.pending.weight = Math.min(1000, displayToKg(v)); session.pending.weightFromLast = false; }
  if (key === 'distance') session.pending.distance = Math.min(1e7, displayToM(v));
  saveSession();
}

// --------------------------------------------------------------- sound ----

let audioCtx;
function initAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* no audio */ }
}
function tone(freq, length, volume) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(t + length);
  } catch { /* ignore */ }
}
const beep = () => tone(880, 0.14, 0.07);
const bell = () => tone(660, 1.2, 0.08);

// ----------------------------------------------------------- wake lock ----

let wakeLock = null, wakeBusy = false;
async function updateWakeLock() {
  const want = !!(session?.running && state.settings.wakeLock && !document.hidden && navigator.wakeLock);
  if (wakeBusy) return;
  wakeBusy = true;
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; } finally { wakeBusy = false; }
}
