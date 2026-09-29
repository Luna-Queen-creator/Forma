// Everything that reads the history: weekly totals, streaks, "last time", personal records.
'use strict';

const entryDay = h => dateKey(new Date(h.at));
const entryMinutes = h => h.seconds / 60;

function entryVolume(h) { return sum(h.steps, t => (t.weight && t.reps ? t.weight * t.reps : 0)); }
function entryDistance(h) { return h.distance || sum(h.steps, t => t.distance || 0); }
function entrySets(h) { return h.steps.length; }

/** Epley estimate of a one-rep max. Only meaningful for 1–12 reps with a load. */
function e1rm(weight, reps) {
  if (!weight || !reps || reps > 12) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Does a logged history entry fulfil this planned session on this date? */
function doneEntryFor(plan, date) {
  const r = routine(plan.routineId);
  return state.history.find(h => entryDay(h) === date && h.type === 'session'
    && (h.routineId ? h.routineId === plan.routineId : r && h.name === r.name));
}

function entriesOn(date) { return state.history.filter(h => entryDay(h) === date); }

/** Minutes per week for the last `count` weeks, split into chart groups. Oldest first. */
function weeklyTotals(count = 12) {
  const thisWeek = startOfWeek(new Date());
  const weeks = Array.from({ length: count }, (_, i) => {
    const start = addDays(thisWeek, (i - count + 1) * 7);
    return { start, key: dateKey(start), total: 0, sessions: 0, groups: Object.fromEntries(STAT_GROUPS.map(g => [g, 0])) };
  });
  const byKey = new Map(weeks.map(w => [w.key, w]));
  for (const h of state.history) {
    const w = byKey.get(weekKeyOf(new Date(h.at)));
    if (!w) continue;
    const minutes = entryMinutes(h);
    w.groups[statGroup(h.category)] += minutes;
    w.total += minutes;
    w.sessions++;
  }
  return weeks;
}

/** Consecutive weeks with at least one entry. The current week only counts once it has one. */
function weekStreak() {
  const active = new Set(state.history.map(h => weekKeyOf(new Date(h.at))));
  let cursor = startOfWeek(new Date());
  if (!active.has(dateKey(cursor))) cursor = addDays(cursor, -7);
  let streak = 0;
  while (active.has(dateKey(cursor))) { streak++; cursor = addDays(cursor, -7); }
  return streak;
}

const matchesExercise = (t, e) => (t.exerciseId ? t.exerciseId === e.id : t.name === e.name);

/** Every recorded set of an exercise, newest session first: [{ entry, sets: [...] }]. */
function exerciseLog(e, excludeEntryId) {
  const out = [];
  for (let i = state.history.length - 1; i >= 0; i--) {
    const h = state.history[i];
    if (h.id === excludeEntryId) continue;
    const sets = h.steps.filter(t => matchesExercise(t, e));
    if (sets.length) out.push({ entry: h, sets });
  }
  return out;
}
function lastPerformance(e, excludeEntryId) { return exerciseLog(e, excludeEntryId)[0] || null; }

/** One set as short text: "8 × 60 kg", "45 sec", "5 km in 27:10". */
function setText(t) {
  if (t.mode === 'reps') return t.weight ? `${t.reps ?? t.value} × ${fmtWeight(t.weight)}` : `${t.reps ?? t.value} reps`;
  if (t.mode === 'distance') return `${fmtDistance(t.distance ?? t.value)}${t.actualSeconds ? ' in ' + formatClock(t.actualSeconds) : ''}`;
  return t.actualSeconds !== undefined ? fmtDuration(t.actualSeconds) : fmtDuration(t.value);
}

/** Several sets compressed: "3 × 5 @ 80 kg" when identical, otherwise a list. */
function setsSummary(sets) {
  if (!sets.length) return '';
  const texts = sets.map(setText);
  if (texts.every(x => x === texts[0]) && sets.length > 1) {
    const t = sets[0];
    if (t.mode === 'reps') return t.weight ? `${sets.length} × ${t.reps ?? t.value} @ ${fmtWeight(t.weight)}` : `${sets.length} × ${t.reps ?? t.value} reps`;
    return `${sets.length} × ${texts[0]}`;
  }
  return texts.join(' · ');
}

/** Best results for one exercise across the given log. */
function bestOf(e, log = exerciseLog(e)) {
  const best = { weight: null, e1rm: 0, e1rmSet: null, reps: 0, seconds: 0, distance: 0, fastest: null, sessions: log.length, last: log[0]?.entry.at };
  for (const { sets } of log) {
    for (const t of sets) {
      if (t.mode === 'reps') {
        const reps = t.reps ?? t.value;
        if (t.weight && (!best.weight || t.weight > best.weight.weight || (t.weight === best.weight.weight && reps > (best.weight.reps ?? 0)))) best.weight = { ...t, reps };
        const est = e1rm(t.weight, reps);
        if (est > best.e1rm) { best.e1rm = est; best.e1rmSet = t; }
        if (!t.weight && reps > best.reps) best.reps = reps;
      } else if (t.mode === 'distance') {
        const d = t.distance ?? t.value;
        if (d > best.distance) best.distance = d;
        if (t.actualSeconds && d >= 1000) {
          const pace = t.actualSeconds / d;
          if (!best.fastest || pace < best.fastest.pace) best.fastest = { pace, seconds: t.actualSeconds, distance: d };
        }
      } else if ((t.actualSeconds ?? 0) > best.seconds) best.seconds = t.actualSeconds;
    }
  }
  return best;
}

/** The exercises you have logged, with their bests, most recently trained first. */
function allRecords() {
  const seen = new Map();
  for (let i = state.history.length - 1; i >= 0; i--) {
    for (const t of state.history[i].steps) {
      const key = t.exerciseId || 'name:' + t.name;
      if (!seen.has(key)) seen.set(key, exercise(t.exerciseId) || exerciseByName(t.name) || { id: t.exerciseId, name: t.name, category: t.category });
    }
  }
  return [...seen.values()].map(e => ({ e, best: bestOf(e) }));
}

/** Records beaten by a just-finished entry compared with everything before it. */
function newRecords(entry) {
  const found = [];
  const seen = new Set();
  for (const t of entry.steps) {
    const e = exercise(t.exerciseId) || exerciseByName(t.name);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    const before = exerciseLog(e, entry.id);
    if (!before.length) continue;
    const old = bestOf(e, before);
    const now = bestOf(e, [{ entry, sets: entry.steps.filter(x => matchesExercise(x, e)) }]);
    if (now.weight && old.weight && now.weight.weight > old.weight.weight) found.push(`${e.name}: heaviest set, ${setText(now.weight)}`);
    else if (now.e1rm && old.e1rm && now.e1rm > old.e1rm * 1.001) found.push(`${e.name}: best estimated max, ${fmtWeight(now.e1rm)}`);
    else if (now.reps && now.reps > old.reps && !now.weight) found.push(`${e.name}: most reps, ${now.reps}`);
    else if (now.distance > old.distance && old.distance) found.push(`${e.name}: longest distance, ${fmtDistance(now.distance)}`);
    else if (now.seconds > old.seconds && old.seconds && e.category !== 'Meditation') found.push(`${e.name}: longest hold, ${fmtDuration(now.seconds)}`);
  }
  return found;
}
