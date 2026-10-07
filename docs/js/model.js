// Domain constants, exercise lookup, templates and the routine compiler.
'use strict';

const MUSCLES = ['Shoulders', 'Chest', 'Arms', 'Core', 'Back', 'Glutes', 'Quadriceps', 'Hamstrings', 'Calves',
  'Adductors', 'Hip flexors', 'Forearms', 'Neck'];

const CATEGORIES = ['Strength', 'HIIT', 'Endurance', 'Yoga', 'Flexibility', 'Mobility', 'Warm-up', 'Balance',
  'Meditation', 'Advanced flexibility'];

/** Extra categories that only exist on logged activities. */
const ACTIVITY_ONLY_CATEGORIES = ['Sport', 'Other'];

const CATEGORY_META = {
  'Strength': { cls: 'strength', icon: '↗' },
  'HIIT': { cls: 'hiit', icon: '≋' },
  'Endurance': { cls: 'endurance', icon: '→' },
  'Yoga': { cls: 'yoga', icon: '◌' },
  'Flexibility': { cls: 'flexibility', icon: '↔' },
  'Mobility': { cls: 'mobility', icon: '↻' },
  'Warm-up': { cls: 'warmup', icon: '◔' },
  'Balance': { cls: 'balance', icon: '⊥' },
  'Meditation': { cls: 'meditation', icon: '◯' },
  'Advanced flexibility': { cls: 'advflex', icon: '⟷' },
  'Sport': { cls: 'sport', icon: '◈' },
  'Other': { cls: 'other', icon: '◈' },
};
const catClass = c => CATEGORY_META[c]?.cls || 'other';
const catIcon = c => CATEGORY_META[c]?.icon || '◈';
const isStretch = c => c === 'Flexibility' || c === 'Advanced flexibility';

/** Coarse groups used for charts so a stacked bar never needs more than five colours. */
const STAT_GROUPS = ['Strength', 'Cardio', 'Yoga & mobility', 'Mind', 'Sport & other'];
function statGroup(category) {
  if (category === 'Strength') return 'Strength';
  if (category === 'HIIT' || category === 'Endurance') return 'Cardio';
  if (category === 'Meditation') return 'Mind';
  if (['Yoga', 'Flexibility', 'Mobility', 'Warm-up', 'Balance', 'Advanced flexibility'].includes(category)) return 'Yoga & mobility';
  return 'Sport & other';
}

const GEAR = ['Mat', 'Chair or bench', 'Wall or support', 'Yoga props', 'Dumbbells', 'Kettlebell', 'Barbell',
  'Squat rack', 'Weight bench', 'Resistance band', 'Pull-up bar', 'Dip bars', 'Rings / suspension',
  'Cable / machines', 'Cardio machine', 'Bike', 'Pool', 'Box or step', 'Jump rope', 'Battle ropes'];
const DEFAULT_GEAR = ['Mat', 'Chair or bench', 'Wall or support'];

/**
 * Body measurement spots. Paired spots are stored per side as "<id>-r" and "<id>-l".
 * `col` is the side of the figure a centre spot's label sits on.
 */
const BODY_SPOTS = [
  { id: 'neck', name: 'Neck', group: 'Upper body', col: 'r', hint: 'Around the middle of the neck, tape level, without pressing.' },
  { id: 'shoulders', name: 'Shoulders', group: 'Upper body', col: 'l', hint: 'Around the widest part of both shoulders, arms relaxed at your sides.' },
  { id: 'chest', name: 'Chest / bust', group: 'Upper body', col: 'r', hint: 'Around the fullest part of the chest, tape level under the arms. Breathe normally.' },
  { id: 'underbust', name: 'Under-bust', group: 'Upper body', col: 'l', hint: 'Snug, directly under the chest, where a bra band sits.' },
  { id: 'arm', name: 'Upper arm', group: 'Arms', paired: true, hint: 'Halfway between shoulder and elbow, arm hanging relaxed.' },
  { id: 'forearm', name: 'Forearm', group: 'Arms', paired: true, hint: 'The widest part, just below the elbow, arm relaxed.' },
  { id: 'waist', name: 'Waist', group: 'Middle', col: 'r', hint: 'The narrowest point, usually a little above the belly button. Breathe out normally, don’t pull in.' },
  { id: 'belly', name: 'Belly', group: 'Middle', col: 'l', hint: 'Around the belly button, standing relaxed, after a normal breath out.' },
  { id: 'hips', name: 'Hips & glutes', group: 'Middle', col: 'r', hint: 'The widest point of the glutes, feet together.' },
  { id: 'thigh', name: 'Upper thigh', group: 'Legs', paired: true, hint: 'Just below the glute fold, standing with weight on both legs.' },
  { id: 'midthigh', name: 'Mid thigh', group: 'Legs', paired: true, hint: 'Halfway between the hip crease and the top of the kneecap.' },
  { id: 'calf', name: 'Calf', group: 'Legs', paired: true, hint: 'The widest part of the calf, standing with weight on both feet.' },
];
const BODY_SPOT_IDS = BODY_SPOTS.map(s => s.id);
const DEFAULT_BODY_SPOTS = ['chest', 'arm', 'waist', 'belly', 'hips', 'thigh', 'calf'];
const PHOTO_POSES = ['front', 'side', 'back'];

const SECTIONS = ['Warm-up', 'Main', 'Cool-down'];
const SIDES = ['Not applicable', 'Both sides', 'Alternating', 'Left', 'Right'];
const LEGACY_SIDES = ['Both / alternating'];
const MODES = ['reps', 'time', 'manual', 'distance'];
const MODE_LABELS = { reps: 'Repetitions', time: 'Timed', manual: 'Open hold (tap to finish)', distance: 'Distance' };

/** Types offered when logging something done outside the app. */
const ACTIVITY_TYPES = [
  { name: 'Run', category: 'Endurance', distance: true },
  { name: 'Walk', category: 'Endurance', distance: true },
  { name: 'Hike', category: 'Endurance', distance: true },
  { name: 'Cycling', category: 'Endurance', distance: true },
  { name: 'Swim', category: 'Endurance', distance: true },
  { name: 'Rowing', category: 'Endurance', distance: true },
  { name: 'Gym session', category: 'Strength' },
  { name: 'Class or group workout', category: 'HIIT' },
  { name: 'Yoga class', category: 'Yoga' },
  { name: 'Pilates', category: 'Mobility' },
  { name: 'Stretching', category: 'Flexibility' },
  { name: 'Meditation', category: 'Meditation' },
  { name: 'Climbing', category: 'Sport' },
  { name: 'Team sport', category: 'Sport' },
  { name: 'Racket sport', category: 'Sport' },
  { name: 'Martial arts', category: 'Sport' },
  { name: 'Dance', category: 'Sport' },
  { name: 'Other', category: 'Other' },
];

// ------------------------------------------------------------ exercises ----

const BUILTIN_BY_ID = new Map(BUILTIN_EXERCISES.map(e => [e.id, e]));

function allExercises() { return [...BUILTIN_EXERCISES, ...state.exercises]; }
function exercise(id) { return BUILTIN_BY_ID.get(id) || state.exercises.find(x => x.id === id); }
function exerciseByName(name) {
  const lower = String(name || '').toLowerCase();
  return state.exercises.find(x => x.name.toLowerCase() === lower) || BUILTIN_EXERCISES.find(x => x.name.toLowerCase() === lower);
}

/** True when every required piece of equipment (or one of its alternatives) is owned. */
function gearOk(e, owned = state.settings.gear) {
  return (e.gear || []).every(g => g.split('|').some(alt => owned.includes(alt)));
}
const gearLabel = g => g.split('|').join(' or ');

/** A fresh editor block for an exercise, using sensible defaults for its type. */
function newMove(e) {
  const strength = (e.category === 'Strength' || e.category === 'HIIT') && e.mode === 'reps';
  return {
    id: uid(), kind: 'exercise', exerciseId: e.id,
    section: e.category === 'Warm-up' ? 'Warm-up' : 'Main',
    mode: e.mode, sets: strength ? 3 : 1, value: e.value,
    rest: strength ? state.settings.defaultRest : 0, weight: 0,
    side: e.bilateral ? 'Both sides' : 'Not applicable', firstSide: 'Left', sideSwitch: 10,
    transition: null, waitReady: e.level === 'Advanced', note: '',
  };
}

// ------------------------------------------------------------ templates ----

/** Template step. `legacy` keeps the original templates exactly as they were. */
function tplStep(exerciseId, section = 'Main', overrides = {}) {
  const e = BUILTIN_BY_ID.get(exerciseId);
  if (!e) throw new Error('Template references unknown exercise ' + exerciseId);
  return { id: uid(), kind: 'exercise', exerciseId, section, mode: e.mode, sets: 1, value: e.value, rest: 0, weight: 0,
    side: e.bilateral ? 'Both sides' : 'Not applicable', firstSide: 'Left', sideSwitch: 5, transition: null, waitReady: false, note: '', ...overrides };
}
const tplRest = (value, section = 'Main') => ({ id: uid(), kind: 'rest', value, section });
const tplGroup = (rounds, steps, name = '') => ({ id: uid(), kind: 'group', name, rounds, steps });

function buildTemplates() {
  const legacy = (id, section, o = {}) => tplStep(id, section, { rest: 10, side: 'Not applicable', sideSwitch: 10, ...o });
  return [
    // --- The original four starter routines ---
    { id: 'tpl-strength', name: 'Strength foundations', category: 'Strength', transition: 10,
      description: 'A short, editable starting point with bodyweight movements.',
      steps: [legacy('march', 'Warm-up'), legacy('squat', 'Main', { sets: 2 }), legacy('bridge', 'Main', { sets: 2 }), legacy('wallpush', 'Main', { sets: 2 }), legacy('bird')] },
    { id: 'tpl-yoga', name: 'A little space to unwind', category: 'Yoga', transition: 10,
      description: 'A gentle sequence to slow down and move comfortably.',
      steps: [legacy('mountain'), legacy('cat'), legacy('child'), legacy('breath', 'Cool-down', { value: 60 })] },
    { id: 'tpl-flex', name: 'Warm up & ease into flexibility', category: 'Flexibility', transition: 10,
      description: 'Easy movement followed by short, adjustable stretches.',
      steps: [legacy('march', 'Warm-up', { value: 60 }), legacy('arms', 'Warm-up'), legacy('hamstring', 'Main', { side: 'Both sides', rest: 0 }), legacy('calfstretch', 'Main', { side: 'Both sides', rest: 0 })] },
    { id: 'tpl-active', name: 'Standing yoga flow', category: 'Yoga', transition: 10,
      description: 'A more active example with separate steps for each side.',
      steps: [legacy('march', 'Warm-up'), legacy('mountain'), legacy('warrior', 'Main', { side: 'Both sides', rest: 0 }), legacy('mountain', 'Cool-down')] },

    // --- Gym ---
    { id: 'tpl-fullbody', name: 'Full-body barbell', category: 'Strength', transition: 15,
      description: 'Squat, bench, row and hinge. Add a little weight when every set feels solid.',
      steps: [tplStep('x-rowing', 'Warm-up', { value: 1000 }), tplStep('x-inchworm', 'Warm-up'),
        tplStep('x-back-squat', 'Main', { sets: 3, value: 5, rest: 120 }), tplStep('x-bench-press', 'Main', { sets: 3, value: 5, rest: 120 }),
        tplStep('x-barbell-row', 'Main', { sets: 3, value: 8, rest: 90 }), tplStep('x-romanian-deadlift', 'Main', { sets: 2, value: 8, rest: 90 }),
        tplStep('x-couch-stretch', 'Cool-down', { value: 45 })] },
    { id: 'tpl-push', name: 'Push day', category: 'Strength', transition: 15,
      description: 'Chest, shoulders and triceps. Part of a push / pull / legs split.',
      steps: [tplStep('x-arm-swings', 'Warm-up'), tplStep('x-band-pull-apart', 'Warm-up', { sets: 1, rest: 0 }),
        tplStep('x-bench-press', 'Main', { sets: 4, value: 6, rest: 120 }), tplStep('x-overhead-press', 'Main', { sets: 3, value: 8, rest: 90 }),
        tplStep('x-db-incline-press', 'Main', { sets: 3, value: 10, rest: 75 }), tplStep('lib-lateral-raise', 'Main', { sets: 3, value: 12, rest: 60 }),
        tplStep('x-triceps-pushdown', 'Main', { sets: 3, value: 12, rest: 60 }), tplStep('lib-doorway-chest-stretch', 'Cool-down', { side: 'Not applicable' })] },
    { id: 'tpl-pull', name: 'Pull day', category: 'Strength', transition: 15,
      description: 'Back and biceps, with a grip finisher.',
      steps: [tplStep('x-arm-swings', 'Warm-up'), tplStep('x-deadlift', 'Main', { sets: 3, value: 5, rest: 150 }),
        tplStep('x-pull-up', 'Main', { sets: 4, value: 6, rest: 90 }), tplStep('x-cable-row', 'Main', { sets: 3, value: 10, rest: 75 }),
        tplStep('x-face-pull', 'Main', { sets: 3, value: 15, rest: 60 }), tplStep('x-hammer-curl', 'Main', { sets: 3, value: 12, rest: 60 }),
        tplStep('x-dead-hang', 'Cool-down', { value: 30 })] },
    { id: 'tpl-legs', name: 'Leg day', category: 'Strength', transition: 15,
      description: 'Squat, hinge, single-leg work and calves.',
      steps: [tplStep('x-leg-swings', 'Warm-up'), tplStep('x-back-squat', 'Main', { sets: 4, value: 6, rest: 150 }),
        tplStep('x-romanian-deadlift', 'Main', { sets: 3, value: 8, rest: 120 }), tplStep('x-bulgarian-split-squat', 'Main', { sets: 3, value: 8, rest: 90 }),
        tplStep('x-leg-curl', 'Main', { sets: 3, value: 12, rest: 60 }), tplStep('calf', 'Main', { sets: 3, value: 15, rest: 45 }),
        tplStep('x-couch-stretch', 'Cool-down', { value: 45 })] },
    { id: 'tpl-dumbbells', name: 'Home dumbbell circuit', category: 'Strength', transition: 10,
      description: 'Four moves, three rounds. Just a pair of dumbbells and a mat.',
      steps: [tplStep('x-jog-in-place', 'Warm-up'), tplStep('x-hip-circles', 'Warm-up'),
        tplGroup(3, [tplStep('x-goblet-squat', 'Main', { value: 12 }), tplStep('lib-dumbbell-floor-press', 'Main', { value: 10 }),
          tplStep('lib-dumbbell-bent-over-row', 'Main', { value: 10 }), tplStep('x-db-rdl', 'Main', { value: 10 }), tplRest(60)], 'Circuit'),
        tplStep('x-supine-twist', 'Cool-down', { value: 30 })] },
    { id: 'tpl-calisthenics', name: 'Calisthenics basics', category: 'Strength', transition: 10,
      description: 'Push, pull, legs and core with a bar and the floor.',
      steps: [tplStep('x-arm-swings', 'Warm-up'), tplStep('x-inchworm', 'Warm-up'),
        tplGroup(3, [tplStep('x-push-up', 'Main', { value: 10 }), tplStep('x-negative-pull-up', 'Main', { value: 4 }),
          tplStep('x-split-squat', 'Main', { value: 8 }), tplStep('x-hollow-hold', 'Main', { value: 20 }), tplRest(60)], 'Circuit')] },

    // --- Core (two short sessions to alternate) ---
    { id: 'tpl-core-a', name: 'Core A: front & deep core', category: 'Strength', transition: 10,
      description: 'About 15 minutes. Alternate with Core B. Progress by adding reps, seconds or a light dumbbell.',
      steps: [tplStep('cat', 'Warm-up', { value: 40 }), tplStep('x-hip-circles', 'Warm-up', { value: 30 }),
        tplGroup(3, [tplStep('lib-dead-bug', 'Main', { value: 10 }), tplStep('x-reverse-crunch', 'Main', { value: 10 }),
          tplStep('x-hollow-hold', 'Main', { value: 20 }), tplStep('x-mountain-climbers', 'Main', { value: 30 }), tplRest(40)], 'Core A'),
        tplStep('lib-sphinx-pose', 'Cool-down', { value: 30 }), tplStep('child', 'Cool-down', { value: 30 })] },
    { id: 'tpl-core-b', name: 'Core B: sides & rotation', category: 'Strength', transition: 10,
      description: 'About 15 minutes. Alternate with Core A. Obliques and anti-rotation for a strong, firm waist.',
      steps: [tplStep('cat', 'Warm-up', { value: 40 }), tplStep('x-hip-circles', 'Warm-up', { value: 30 }),
        tplGroup(3, [tplStep('x-side-plank', 'Main', { value: 20, sideSwitch: 5 }), tplStep('lib-standing-resistance-band-press-out', 'Main', { value: 8, sideSwitch: 5 }),
          tplStep('x-russian-twist', 'Main', { value: 12 }), tplStep('bird', 'Main', { value: 8 }), tplRest(30)], 'Core B'),
        tplStep('x-supine-twist', 'Cool-down', { value: 30, sideSwitch: 5 }), tplStep('child', 'Cool-down', { value: 30 })] },

    // --- Conditioning ---
    { id: 'tpl-tabata', name: 'Tabata: 4 hard minutes', category: 'HIIT', transition: 0,
      description: 'Eight rounds of 20 seconds on, 10 seconds off, alternating two moves.',
      steps: [tplStep('x-jumping-jacks', 'Warm-up', { value: 60 }), tplStep('x-high-knees', 'Warm-up', { value: 30 }), tplRest(15, 'Warm-up'),
        tplGroup(4, [tplStep('x-jump-squat', 'Main', { mode: 'time', value: 20 }), tplRest(10),
          tplStep('x-mountain-climbers', 'Main', { value: 20 }), tplRest(10)], 'Tabata'),
        tplStep('x-standing-forward-fold', 'Cool-down', { value: 45 })] },
    { id: 'tpl-run-intervals', name: 'Run–walk intervals', category: 'Endurance', transition: 0,
      description: 'Six rounds of one minute running and ninety seconds walking.',
      steps: [tplStep('x-brisk-walk', 'Warm-up', { value: 300 }),
        tplGroup(6, [tplStep('x-run-interval', 'Main', { value: 60 }), tplStep('x-brisk-walk', 'Main', { value: 90 })], 'Intervals'),
        tplStep('x-brisk-walk', 'Cool-down', { value: 300 })] },

    // --- Mobility & mind ---
    { id: 'tpl-mobility', name: 'Morning mobility', category: 'Mobility', transition: 5,
      description: 'Ten easy minutes for hips, spine and shoulders.',
      steps: [tplStep('cat'), tplStep('x-worlds-greatest', 'Main', { value: 30 }), tplStep('x-90-90'),
        tplStep('x-thread-needle'), tplStep('x-deep-squat-hold'), tplStep('x-shoulder-cars', 'Main', { value: 3 })] },
    { id: 'tpl-breathing', name: 'Wind-down breathing', category: 'Meditation', transition: 5,
      description: 'Guided box breathing followed by a body scan.',
      steps: [tplStep('x-box-breathing'), tplStep('lib-body-scan', 'Main', { value: 300 })] },
  ];
}

// ------------------------------------------------------- routine engine ----

/** Fill in defaults so older saved blocks behave like new ones. */
function normalizeBlock(s, find = exercise) {
  if (s.kind === 'group') return { ...s, name: s.name || '', rounds: s.rounds ?? 2, steps: (s.steps || []).map(b => normalizeBlock(b, find)) };
  if (s.kind === 'rest') return { ...s, value: s.value ?? 30, section: s.section || 'Main' };
  return {
    ...s, kind: 'exercise',
    mode: s.mode || find(s.exerciseId)?.mode || 'reps',
    side: LEGACY_SIDES.includes(s.side) ? 'Alternating' : (s.side || 'Not applicable'),
    transition: s.transition ?? null, sideSwitch: s.sideSwitch ?? 10, firstSide: s.firstSide || 'Left',
    waitReady: s.waitReady ?? false, weight: s.weight ?? 0, rest: s.rest ?? 0, note: s.note || '',
  };
}

const MAX_QUEUE = 6000;

/**
 * Expand a routine into a flat queue of player steps:
 * move | rest | switch (change sides) | transition (setup time between exercises).
 */
function compileRoutine(r) {
  const queue = [];
  const add = q => {
    if (queue.length >= MAX_QUEUE) throw new Error('This routine expands to too many steps. Reduce its rounds or sets.');
    queue.push(q);
  };
  const expand = (blocks, roundLabel = '', groupName = '') => {
    for (const raw of blocks) {
      const s = normalizeBlock(raw);
      if (s.kind === 'group') {
        for (let round = 1; round <= s.rounds; round++) expand(s.steps, `Round ${round} of ${s.rounds}`, s.name);
        continue;
      }
      if (s.kind === 'rest') { add({ kind: 'rest', value: s.value, section: s.section, roundLabel, groupName }); continue; }
      const e = exercise(s.exerciseId);
      if (!e) throw new Error('An exercise in this routine is no longer available.');
      for (let set = 1; set <= s.sets; set++) {
        const sides = s.side === 'Both sides' ? [s.firstSide, s.firstSide === 'Left' ? 'Right' : 'Left'] : [s.side];
        sides.forEach((side, sideIndex) => {
          if (sideIndex && s.sideSwitch > 0) {
            add({ kind: 'switch', value: s.sideSwitch, section: s.section, roundLabel, groupName, nextSide: side });
          } else if (!sideIndex && queue.length && queue.at(-1).kind === 'move') {
            const seconds = s.transition ?? r.transition ?? 10;
            if (seconds > 0) add({ kind: 'transition', value: seconds, section: s.section, roundLabel, groupName });
          }
          add({ ...structuredClone(s), kind: 'move', blockId: s.id, exercise: structuredClone(e), set, side, roundLabel, groupName });
        });
        if (s.rest > 0) add({ kind: 'rest', value: s.rest, section: s.section, roundLabel, groupName });
      }
    }
  };
  expand(r.steps || []);
  return queue;
}

/** Rough seconds a queue step takes, for duration estimates. */
function stepSeconds(q) {
  if (q.kind !== 'move') return q.value;
  if (q.mode === 'reps') return q.value * 4;
  if (q.mode === 'distance') return (q.value / 1000) * (q.exercise.pace || 360);
  return q.value;
}
function routineSeconds(r) { return sum(compileRoutine(r), stepSeconds); }
function duration(r) {
  try { return Math.max(1, Math.round(routineSeconds(r) / 60)); } catch { return '?'; }
}
function countSets(r) {
  try { return compileRoutine(r).filter(q => q.kind === 'move').length; } catch { return 0; }
}
/** Flat list of exercise blocks inside a routine (groups expanded once). */
function routineMoves(r) {
  const list = [];
  const walk = blocks => blocks.forEach(b => (b.kind === 'group' ? walk(b.steps || []) : b.kind !== 'rest' && list.push(b)));
  walk(r.steps || []);
  return list;
}

function routine(id) { return state.routines.find(x => x.id === id); }

/** One-line description of an editor block, e.g. "Back squat — 3 × 5 · 60 kg". */
function blockSummary(b) {
  if (b.kind === 'rest') return `Break · ${fmtDuration(b.value)}`;
  if (b.kind === 'group') {
    const names = (b.steps || []).filter(x => x.kind !== 'rest').map(x => exercise(x.exerciseId)?.name).filter(Boolean);
    return `${b.name ? b.name + ': ' : ''}${b.rounds} rounds of ${names.join(', ') || 'nothing yet'}`;
  }
  const e = exercise(b.exerciseId);
  const amount = b.mode === 'reps' ? `${b.value} reps` : b.mode === 'distance' ? fmtDistance(b.value) : fmtDuration(b.value);
  const sets = b.sets > 1 ? `${b.sets} × ${amount}` : amount;
  const extras = [b.weight ? fmtWeight(b.weight) : '', b.side === 'Both sides' ? 'each side' : ''].filter(Boolean).join(' · ');
  return `${e?.name || 'Unavailable exercise'} — ${sets}${extras ? ' · ' + extras : ''}`;
}

const TEMPLATES = buildTemplates();
