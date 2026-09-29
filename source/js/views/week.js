// "My week": today's plan, the weekly calendar, scheduling and marking sessions done.
'use strict';

let weekOffset = 0;

function weekDays() {
  const start = addDays(startOfWeek(new Date()), weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Planned sessions on a day, including weekly repeats, earliest first. */
function plansOn(d) {
  const key = dateKey(d);
  return state.schedule
      .filter(s => (s.date === key && !s.skip.includes(key)) || (s.repeat && key > s.date && (!s.until || key <= s.until)
      && parseDate(s.date).getDay() === d.getDay() && !s.skip.includes(key)))
    .map(plan => ({ plan, routine: routine(plan.routineId), date: key }))
    .filter(x => x.routine)
    .sort((a, b) => (a.plan.time || '99').localeCompare(b.plan.time || '99'));
}

/** Plans (with their done entry, if any) plus anything logged that day that was not planned. */
function dayItems(d) {
  const key = dateKey(d);
  const used = new Set();
  const plans = plansOn(d).map(p => {
    const done = state.history.find(h => !used.has(h.id) && entryDay(h) === key && h.type === 'session'
      && (h.routineId ? h.routineId === p.plan.routineId : h.name === p.routine.name));
    if (done) used.add(done.id);
    return { ...p, done };
  });
  const logged = entriesOn(key).filter(h => !used.has(h.id));
  return { plans, logged };
}

function progressRing(fraction, big, small) {
  const r = 52, c = 2 * Math.PI * r;
  return `<div class="hero-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="${r}"/>
    <circle class="ring-fg" cx="60" cy="60" r="${r}" stroke-dasharray="${(clamp(fraction, 0, 1) * c).toFixed(1)} ${c.toFixed(1)}"/></svg>
    <div class="ring-label"><strong>${big}</strong><span>${small}</span></div></div>`;
}

function todayPanel() {
  const today = new Date();
  const { plans, logged } = dayItems(today);
  const open = plans.filter(p => !p.done);
  const title = plans.length && !open.length ? 'All done for today. Nicely done.'
    : open.length ? `${plural(open.length, 'session')} planned`
      : logged.length ? 'You moved today.' : 'Nothing planned yet.';
  const items = [
    ...plans.map(p => `<div class="today-item ${p.done ? 'done' : ''}">
      <div><strong>${esc(p.routine.name)}</strong><small>${[p.plan.time, `about ${duration(p.routine)} min`, p.routine.category].filter(Boolean).map(esc).join(' · ')}</small></div>
      ${p.done ? `<button class="done-badge" data-action="history-detail" data-id="${p.done.id}">${icon('check')} Done</button>`
        : `<button class="btn lime" data-action="start" data-id="${p.routine.id}">Start</button>`}</div>`),
    ...logged.map(h => `<div class="today-item done"><div><strong>${esc(h.name)}</strong><small>${fmtDuration(h.seconds)} · ${esc(h.category)}</small></div>
      <button class="done-badge" data-action="history-detail" data-id="${h.id}">${icon('check')} Logged</button></div>`),
  ].join('');

  // The ring covers the current calendar week.
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today), i));
  let planned = 0, done = 0;
  days.forEach(d => { const x = dayItems(d); planned += x.plans.length; done += x.plans.filter(p => p.done).length; });
  const minutes = Math.round(sum(state.history.filter(h => weekKeyOf(new Date(h.at)) === dateKey(days[0])), entryMinutes));
  const ring = planned ? progressRing(done / planned, `${done}/${planned}`, 'planned sessions<br>done this week')
    : progressRing(minutes ? 1 : 0, minutes, 'minutes<br>this week');

  return `<section class="hero today"><div class="today-main">
    <p class="eyebrow">TODAY · ${esc(longDate(today).toUpperCase())}</p>
    <h2>${title}</h2>
    ${items ? `<div class="today-list">${items}</div>` : '<p class="hero-sub">Pick a routine, start something quick, or log what you did elsewhere.</p>'}
    <div class="row hero-actions">
      ${open.length ? '' : `<button class="btn lime" data-view="quick">Quick start</button>`}
      <button class="btn on-dark" data-action="schedule" data-date="${todayKey()}">${icon('plus')} Plan</button>
      <button class="btn on-dark" data-action="log-activity">${icon('plus')} Log activity</button>
    </div></div>${ring}</section>`;
}

renderers.week = () => {
  const days = weekDays(), today = todayKey();
  const calendar = days.map(d => {
    const key = dateKey(d);
    const { plans, logged } = dayItems(d);
    const events = plans.map(p => `<button class="event cat-${catClass(p.routine.category)} ${p.done ? 'done' : ''}" data-action="event" data-id="${p.plan.id}" data-date="${key}">
        ${p.done ? icon('check', 'event-check') : ''}${esc(p.routine.name)}
        <small>${[p.plan.time, duration(p.routine) + ' min', p.plan.repeat ? 'weekly' : ''].filter(Boolean).map(esc).join(' · ')}</small></button>`).join('')
      + logged.map(h => `<button class="event logged cat-${catClass(h.category)}" data-action="history-detail" data-id="${h.id}">
        ${icon('check', 'event-check')}${esc(h.name)}<small>${fmtDuration(h.seconds)}${h.distance ? ' · ' + fmtDistance(h.distance) : ''}</small></button>`).join('');
    return `<article class="day ${key === today ? 'today' : ''} ${key < today ? 'past' : ''}">
      <div class="day-label"><span>${weekdayShort(d)}</span><strong>${d.getDate()}</strong></div>
      ${events}<button class="add-day" data-action="schedule" data-date="${key}" aria-label="Plan a session on ${shortDate(d)}">＋</button></article>`;
  }).join('');

  const mine = state.routines.slice().sort((a, b) => lastDoneTime(b) - lastDoneTime(a)).slice(0, 3);
  app().innerHTML = heading('Your week, your way.', 'Plan it, do it, see it add up.',
    `<button class="btn" data-action="schedule">${icon('plus')} Plan a session</button>`)
    + todayPanel()
    + `<div class="row spread week-controls">
        <div class="row"><h2>${shortDate(days[0])} – ${shortDate(days[6])}</h2>${weekOffset ? '<button class="text-btn" data-action="this-week">Back to this week</button>' : ''}</div>
        <div class="row"><button class="icon-btn" aria-label="Previous week" data-action="prev-week">‹</button><button class="icon-btn" aria-label="Next week" data-action="next-week">›</button></div>
      </div>
      <section class="calendar" aria-label="Weekly schedule">${calendar}</section>
      <div class="section-head"><h2>${state.routines.length ? 'Ready when you are' : 'Start with a template'}</h2>
        <button class="text-btn" data-view="routines">All routines →</button></div>
      <section class="cards">${(state.routines.length ? mine : TEMPLATES.filter(t => ['tpl-fullbody', 'tpl-tabata', 'tpl-mobility'].includes(t.id))).map(r => routineCard(r, !state.routines.length)).join('')}</section>`;
};

function lastDoneTime(r) {
  for (let i = state.history.length - 1; i >= 0; i--) if (state.history[i].routineId === r.id) return Date.parse(state.history[i].at);
  return 0;
}

actions['prev-week'] = () => { weekOffset--; render(); };
actions['next-week'] = () => { weekOffset++; render(); };
actions['this-week'] = () => { weekOffset = 0; render(); };

// ----------------------------------------------------------- scheduling ----

function scheduleDialog(date = todayKey(), routineId) {
  if (!state.routines.length) {
    showModal(modalHead('Let’s make your first routine') + `<p>Save a routine before adding it to your week. Start from a template or build your own.</p>
      <div class="modal-actions"><button class="btn light" data-view="routines">Browse templates</button><button class="btn" data-action="new-routine">Create routine</button></div>`);
    return;
  }
  const order = [0, 1, 2, 3, 4, 5, 6].map(i => (i + state.settings.weekStart) % 7);
  const names = order.map(i => addDays(parseDate('2026-01-04'), i).toLocaleDateString(undefined, { weekday: 'short' })); // 4 Jan 2026 is a Sunday
  const day = parseDate(date).getDay();
  showModal(modalHead('Plan a session') + `<form id="schedule-form">
    <div class="field"><label for="plan-routine">Routine</label><select id="plan-routine" name="routineId">${state.routines.map(r => `<option value="${r.id}" ${routineId === r.id ? 'selected' : ''}>${esc(r.name)} · ${duration(r)} min</option>`).join('')}</select></div>
    <div class="form-grid"><div class="field"><label for="plan-date">Date</label><input id="plan-date" name="date" type="date" required value="${date}" data-bind="plan-date"></div>
      <div class="field"><label for="plan-time">Time (optional)</label><input id="plan-time" name="time" type="time"></div></div>
    <label class="checkrow"><input type="checkbox" name="repeat" data-bind="repeat-toggle"> Repeat every week</label>
    <div class="repeat-options" hidden>
      <p class="label">On</p>
      <div class="weekday-picker">${order.map((d, i) => `<label class="weekday"><input type="checkbox" name="days" value="${d}" ${d === day ? 'checked' : ''}><span>${esc(names[i])}</span></label>`).join('')}</div>
      <div class="field"><label for="plan-until">Until (optional)</label><input id="plan-until" name="until" type="date"></div>
    </div>
    <div class="modal-actions"><button class="btn light" type="button" data-action="close">Cancel</button><button class="btn">Add to my week</button></div></form>`);
}
binds['repeat-toggle'] = el => { el.form.querySelector('.repeat-options').hidden = !el.checked; };
binds['plan-date'] = el => {
  // Keep the pre-selected weekday in step with the date while repeat is still off.
  if (el.form.elements.repeat.checked || !isValidDateKey(el.value)) return;
  const day = String(parseDate(el.value).getDay());
  $$('input[name=days]', el.form).forEach(box => { box.checked = box.value === day; });
};

forms['schedule-form'] = (f, fd) => {
  const routineId = fd.get('routineId'), date = fd.get('date'), time = fd.get('time') || '';
  if (!isValidDateKey(date)) { toast('Choose a date.'); return; }
  if (fd.has('repeat')) {
    const until = fd.get('until') || '';
    if (until && until < date) { toast('The end date is before the start date.'); return; }
    const days = fd.getAll('days').map(Number);
    if (!days.length) days.push(parseDate(date).getDay());
    let added = 0;
    for (const weekday of days) {
      let d = parseDate(date);
      while (d.getDay() !== weekday) d = addDays(d, 1);
      if (until && dateKey(d) > until) continue;
      state.schedule.push({ id: uid(), routineId, date: dateKey(d), time, repeat: true, skip: [], until });
      added++;
    }
    toast(added > 1 ? `Added on ${added} days every week.` : 'Added to every week.');
  } else {
    state.schedule.push({ id: uid(), routineId, date, time, repeat: false, skip: [], until: '' });
    toast('Added to your week.');
  }
  save(); closeModal(); render();
};

actions.schedule = el => scheduleDialog(el.dataset.date || todayKey());
actions['schedule-routine'] = el => scheduleDialog(todayKey(), el.dataset.id);

actions.event = el => eventDialog(el.dataset.id, el.dataset.date);
function eventDialog(id, date) {
  const s = state.schedule.find(x => x.id === id), r = routine(s.routineId);
  const done = dayItems(parseDate(date)).plans.find(p => p.plan.id === id)?.done;
  const repeatText = s.repeat ? ` · repeats weekly${s.until ? ' until ' + shortDate(parseDate(s.until)) : ''}` : '';
  showModal(modalHead(r.name, esc(longDate(parseDate(date)) + (s.time ? ' · ' + s.time : '')))
    + `<p>${pill(esc(r.category))} <span class="muted">About ${duration(r)} min · ${plural(countSets(r), 'set')}${repeatText}</span></p>
    ${done ? `<p class="note good">${icon('check')} Done · ${fmtDuration(done.seconds)}${done.effort ? ' · effort ' + done.effort + '/10' : ''}${done.manual ? ' · marked manually' : ''}</p>` : ''}
    <ol class="plan-preview">${r.steps.map(b => `<li>${esc(blockSummary(b))}</li>`).join('')}</ol>
    <div class="modal-actions spread"><div class="row">
      <button class="btn danger" data-action="remove-event" data-id="${id}" data-date="${date}">${s.repeat ? 'Skip this day' : 'Remove'}</button>
      ${s.repeat ? `<button class="btn light" data-action="remove-series" data-id="${id}">Remove series</button>` : ''}
      <button class="btn light" data-action="reschedule" data-id="${id}" data-date="${date}">Move</button></div>
      <div class="row">${done ? '' : `<button class="btn light" data-action="mark-done" data-id="${id}" data-date="${date}">Mark as done</button>`}
      <button class="btn" data-action="start" data-id="${r.id}">Start session</button></div></div>`);
}

actions['remove-event'] = el => {
  const s = state.schedule.find(x => x.id === el.dataset.id);
  if (s.repeat) s.skip.push(el.dataset.date);
  else state.schedule = state.schedule.filter(x => x.id !== s.id);
  save(); closeModal(); render();
};
actions['remove-series'] = el => {
  state.schedule = state.schedule.filter(x => x.id !== el.dataset.id);
  save(); closeModal(); render(); toast('Series removed. Past history stays.');
};
actions.reschedule = el => {
  const s = state.schedule.find(x => x.id === el.dataset.id);
  showModal(modalHead('Move this session') + `<form id="move-form" data-id="${s.id}" data-old="${el.dataset.date}">
    <div class="form-grid"><div class="field"><label for="move-date">New date</label><input id="move-date" type="date" name="date" required value="${el.dataset.date}"></div>
    <div class="field"><label for="move-time">Time</label><input id="move-time" type="time" name="time" value="${esc(s.time)}"></div></div>
    <p class="muted small">${s.repeat ? 'Only this occurrence moves; the weekly series stays as it is.' : ''}</p>
    <div class="modal-actions"><button type="button" class="btn light" data-action="close">Cancel</button><button class="btn">Move session</button></div></form>`);
};
forms['move-form'] = (f, fd) => {
  const s = state.schedule.find(x => x.id === f.dataset.id);
  if (!isValidDateKey(fd.get('date'))) { toast('Choose a date.'); return; }
  if (s.repeat) {
    s.skip.push(f.dataset.old);
    state.schedule.push({ ...s, id: uid(), date: fd.get('date'), time: fd.get('time') || '', repeat: false, skip: [], until: '' });
  } else { s.date = fd.get('date'); s.time = fd.get('time') || ''; }
  save(); closeModal(); render(); toast('Session moved.');
};

// ---------------------------------------------------- marking as done ----

actions['mark-done'] = el => {
  const s = state.schedule.find(x => x.id === el.dataset.id), r = routine(s.routineId);
  showModal(modalHead('Mark as done', esc(r.name)) + `<form id="done-form" data-routine="${r.id}" data-date="${el.dataset.date}" data-time="${esc(s.time)}">
    <p class="muted">For when you did it without the player. It counts toward your week and progress.</p>
    <div class="form-grid"><div class="field"><label for="done-min">Duration (minutes)</label><input id="done-min" name="minutes" type="number" min="1" max="1440" required value="${duration(r) === '?' ? 30 : duration(r)}"></div>
    <div class="field"><label>Effort (optional)</label>${effortPicker()}</div></div>
    <div class="field"><label for="done-note">Note (optional)</label><textarea id="done-note" name="note" maxlength="2000" placeholder="How did it go?"></textarea></div>
    <div class="modal-actions"><button type="button" class="btn light" data-action="close">Cancel</button><button class="btn">Save</button></div></form>`);
};
forms['done-form'] = (f, fd) => {
  const r = routine(f.dataset.routine), date = f.dataset.date;
  const at = date === todayKey() ? new Date() : new Date(`${date}T${f.dataset.time || '12:00'}:00`);
  addHistory({ id: uid(), type: 'session', manual: true, name: r.name, routineId: r.id, category: r.category, at: at.toISOString(),
    seconds: Number(fd.get('minutes')) * 60, skipped: 0, steps: [], effort: readEffort(fd), note: fd.get('note').trim() });
  closeModal(); render(); toast('Marked as done.');
};

/** 1–10 effort chips used by several forms. */
function effortPicker(current) {
  return `<div class="effort" role="radiogroup" aria-label="Effort from 1 (very easy) to 10 (max)">${Array.from({ length: 10 }, (_, i) => i + 1)
    .map(n => `<label><input type="radio" name="effort" value="${n}" ${current === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
    <small class="muted">1 = very easy · 10 = everything you had</small>`;
}
function readEffort(fd) { const n = Number(fd.get('effort')); return n >= 1 && n <= 10 ? n : undefined; }

/** Insert into history keeping it sorted by time. */
function addHistory(entry) {
  state.history.push(entry);
  state.history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  save();
}
