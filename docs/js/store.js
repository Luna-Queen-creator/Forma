// State, persistence, migration from the first version, validation and backups.
'use strict';

const STORAGE_KEY = 'forma-v2';
const SESSION_KEY = 'forma-v2-session';
const LEGACY_KEY = 'forma-v1';

/** Colour themes: id, name, and the two colours shown on the swatch. */
const PALETTES = [
  { id: 'forest', name: 'Forest', a: '#123c39', b: '#d5f580' },
  { id: 'rose', name: 'Rose', a: '#8a1d4e', b: '#ffc9de' },
  { id: 'lavender', name: 'Lavender', a: '#45318c', b: '#dccfff' },
  { id: 'ocean', name: 'Ocean', a: '#0f4c75', b: '#a9e8ff' },
  { id: 'kitty', name: 'Kitty', a: '#ff8fbd', b: '#ffd6e7' },
];

const DEFAULT_SETTINGS = {
  units: 'metric',        // metric | imperial
  weekStart: 1,           // 1 = Monday, 0 = Sunday
  theme: 'system',        // system | light | dark
  palette: 'forest',      // colour theme, see PALETTES
  sounds: true,           // bell at the end of timed steps
  countdown: true,        // short beeps for the last three seconds
  wakeLock: true,         // keep the screen on while a session runs
  defaultRest: 60,        // rest between sets for newly added strength moves
  gear: [...DEFAULT_GEAR],
  onlyMyGear: false,
  lastBackupAt: '',       // when a backup was last exported or shared
};

/** Body tracking: which spots to measure, preferences, and one entry per measured day. */
function freshBody() {
  return {
    spots: [...DEFAULT_BODY_SPOTS],   // measured spots, built-in ids and custom ids
    sides: {},                       // paired spot id -> 'both' | 'right' | 'left'
    custom: [],                      // your own spots: { id, name, paired }
    figure: 'curvy',                 // 'curvy' | 'straight'
    fat: false,                      // also track body fat %
    photos: true,                    // offer progress photos
    blur: false,                     // blur photos until tapped
    backupPhotos: true,              // put photos into backups
    days: [],                        // weekdays (0 = Sunday) shown as measuring days on My week
    entries: [],                     // { date, weight (kg), fat (%), m: { key: cm }, photos: { pose: id }, note }
  };
}

function freshState() {
  return { version: 2, settings: structuredClone(DEFAULT_SETTINGS), exercises: [], routines: [], schedule: [], history: [], body: freshBody() };
}

let state = freshState();
let storageOK = true;
let storageProblem = '';

// ---------------------------------------------------------- validation ----

class BackupError extends Error {}

/**
 * Validate anything that came from storage or a backup file and bring it up to the current
 * version. Throws BackupError with a readable reason when something is wrong.
 * Accepts version 1 (the original Forma) and version 2.
 */
function normalizeState(raw) {
  const fail = why => { throw new BackupError('This is not a valid Forma backup: ' + why + '.'); };
  const str = (x, n = 5000) => typeof x === 'string' && x.length <= n;
  const num = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
  const int = (x, min, max) => num(x, min, max) && Number.isInteger(x);
  const idOk = x => str(x, 100) && /^[a-zA-Z0-9_-]+$/.test(x);
  const bool = x => typeof x === 'boolean';
  const optional = (x, test) => x === undefined || x === null || test(x);

  if (!raw || typeof raw !== 'object') fail('the file is empty or unreadable');
  if (raw.version !== 1 && raw.version !== 2) fail('unknown version');
  for (const key of ['exercises', 'routines', 'schedule', 'history']) {
    if (!Array.isArray(raw[key]) || raw[key].length > 20000) fail(`the ${key} list is missing or too long`);
  }
  const s = structuredClone(raw);
  const out = freshState();

  // Settings (v2 only). Unknown or invalid values fall back to defaults instead of failing.
  const st = s.settings || {};
  const pick = (key, ok) => (ok(st[key]) ? st[key] : DEFAULT_SETTINGS[key]);
  out.settings = {
    units: pick('units', x => ['metric', 'imperial'].includes(x)),
    weekStart: pick('weekStart', x => x === 0 || x === 1),
    theme: pick('theme', x => ['system', 'light', 'dark'].includes(x)),
    palette: pick('palette', x => PALETTES.some(p => p.id === x)),
    sounds: pick('sounds', bool), countdown: pick('countdown', bool), wakeLock: pick('wakeLock', bool),
    defaultRest: pick('defaultRest', x => int(x, 0, 600)),
    gear: Array.isArray(st.gear) ? st.gear.filter(g => GEAR.includes(g)) : [...DEFAULT_GEAR],
    onlyMyGear: pick('onlyMyGear', bool),
    lastBackupAt: pick('lastBackupAt', x => typeof x === 'string' && x.length <= 40),
  };

  // Custom exercises.
  const ids = new Set(BUILTIN_EXERCISES.map(e => e.id));
  const checkExercise = (e, where) => {
    if (!e || !idOk(e.id) || !str(e.name, 90) || !e.name.trim()) fail(`${where} has an invalid name or id`);
    if (!CATEGORIES.includes(e.category)) fail(`${where} (“${e.name}”) has an unknown activity`);
    if (!MODES.includes(e.mode) || !num(e.value, 1, e.mode === 'distance' ? 1e6 : 7200)) fail(`“${e.name}” has an invalid default value`);
    if (!Array.isArray(e.primary) || !Array.isArray(e.secondary || []) || ![...e.primary, ...(e.secondary || [])].every(m => MUSCLES.includes(m))) fail(`“${e.name}” lists an unknown muscle`);
    if (!Array.isArray(e.instructions) || e.instructions.length > 100 || !e.instructions.every(x => str(x))) fail(`“${e.name}” has invalid instructions`);
    if (!str(e.equipment ?? '', 100)) fail(`“${e.name}” has invalid equipment`);
    if (!optional(e.gear, g => Array.isArray(g) && g.every(x => str(x, 200)))) fail(`“${e.name}” has invalid equipment tags`);
    if ((e.image && !safeURL(e.image)) || (e.video && !safeURL(e.video))) fail(`“${e.name}” has a non-HTTPS link`);
  };
  for (const e of s.exercises) {
    checkExercise(e, 'A custom exercise');
    if (ids.has(e.id)) fail(`the exercise id “${e.id}” is used twice`);
    ids.add(e.id);
    out.exercises.push({
      id: e.id, name: e.name.trim(), category: e.category, mode: e.mode, value: e.value,
      primary: e.primary, secondary: e.secondary || [], instructions: e.instructions,
      equipment: e.equipment || '', gear: (e.gear || []).filter(g => g.split('|').every(x => GEAR.includes(x))),
      level: e.level === 'Advanced' ? 'Advanced' : 'General', bilateral: e.bilateral === true,
      image: e.image || '', video: e.video || '', basedOn: str(e.basedOn, 100) ? e.basedOn : undefined, custom: true,
    });
  }

  // Look exercises up in the data being loaded, not in whatever is currently open.
  const lookup = id => BUILTIN_BY_ID.get(id) || out.exercises.find(x => x.id === id);
  const lookupName = name => {
    const lower = String(name || '').toLowerCase();
    return out.exercises.find(x => x.name.toLowerCase() === lower) || BUILTIN_EXERCISES.find(x => x.name.toLowerCase() === lower);
  };

  // Routines.
  const checkBlocks = (list, depth, name) => {
    if (!Array.isArray(list) || list.length > 200) fail(`routine “${name}” has an invalid sequence`);
    for (const t of list) {
      if (!t || typeof t !== 'object') fail(`routine “${name}” has an empty block`);
      if (t.id !== undefined && !idOk(t.id)) fail(`routine “${name}” has a block with an invalid id`);
      if (!t.id) t.id = uid();
      if (t.kind === 'group') {
        if (depth || !int(t.rounds, 1, 50) || !optional(t.name, x => str(x, 60))) fail(`routine “${name}” has an invalid repeat group`);
        checkBlocks(t.steps, depth + 1, name);
        continue;
      }
      if (t.kind === 'rest') {
        if (!int(t.value, 1, 3600)) fail(`routine “${name}” has an invalid break`);
        continue;
      }
      const mode = t.mode ?? lookup(t.exerciseId)?.mode;
      const ok = ids.has(t.exerciseId) && int(t.sets, 1, 50)
        && int(t.value, 1, mode === 'distance' ? 1e6 : 7200) && int(t.rest, 0, 3600) && num(t.weight ?? 0, 0, 1000)
        && SECTIONS.includes(t.section) && [...SIDES, ...LEGACY_SIDES].includes(t.side)
        && optional(t.mode, x => MODES.includes(x)) && optional(t.transition, x => int(x, 0, 600))
        && optional(t.sideSwitch, x => int(x, 0, 120)) && optional(t.firstSide, x => ['Left', 'Right'].includes(x))
        && optional(t.waitReady, bool) && optional(t.note, x => str(x, 200));
      if (!ok) fail(`routine “${name}” has an invalid exercise step`);
    }
  };
  const routineIds = new Set();
  for (const r of s.routines) {
    if (!idOk(r.id) || routineIds.has(r.id) || !str(r.name, 90) || !r.name.trim() || !str(r.description ?? '', 200)
      || !CATEGORIES.includes(r.category) || !optional(r.transition, x => int(x, 0, 600))) fail('a routine has an invalid name, id or activity');
    routineIds.add(r.id);
    checkBlocks(r.steps, 0, r.name);
    if (!optional(r.nextNote, x => str(x, 2000))) fail(`routine “${r.name}” has an invalid note`);
    out.routines.push({ id: r.id, name: r.name, description: r.description || '', category: r.category, nextNote: r.nextNote || '',
      transition: r.transition ?? 10, steps: r.steps.map(b => normalizeBlock(b, lookup)), createdAt: str(r.createdAt, 50) ? r.createdAt : undefined });
  }

  // Schedule.
  const scheduleIds = new Set();
  for (const p of s.schedule) {
    const ok = idOk(p.id) && !scheduleIds.has(p.id) && routineIds.has(p.routineId) && isValidDateKey(p.date)
      && bool(p.repeat) && str(p.time ?? '', 5) && (!p.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time))
      && optional(p.skip, x => Array.isArray(x) && x.every(isValidDateKey)) && optional(p.until, x => x === '' || isValidDateKey(x));
    if (!ok) fail('a planned session is invalid');
    scheduleIds.add(p.id);
    out.schedule.push({ id: p.id, routineId: p.routineId, date: p.date, time: p.time || '', repeat: p.repeat, skip: p.skip || [], until: p.until || '' });
  }

  // History. Version 1 stored only the planned values; they become the "actual" values here.
  const checkSet = t => {
    const ok = str(t.name, 90) && MODES.includes(t.mode) && num(t.value, 0, 1e6) && num(t.weight ?? 0, 0, 1000)
      && str(t.side ?? '', 30) && num(t.set ?? 1, 1, 50) && optional(t.actualSeconds, x => num(x, 0, 1e9))
      && optional(t.roundLabel, x => str(x, 100)) && optional(t.reps, x => num(x, 0, 10000))
      && optional(t.distance, x => num(x, 0, 1e7)) && optional(t.exerciseId, idOk);
    if (!ok) fail('a recorded set is invalid');
    const e = (t.exerciseId && lookup(t.exerciseId)) || lookupName(t.name);
    return {
      exerciseId: e?.id || t.exerciseId, name: t.name, category: t.category || e?.category || 'Other', mode: t.mode,
      value: t.value, reps: t.reps ?? (t.mode === 'reps' ? t.value : undefined), weight: t.weight ?? 0,
      distance: t.distance ?? (t.mode === 'distance' ? t.value : undefined), side: t.side || 'Not applicable',
      set: t.set ?? 1, sets: t.sets, actualSeconds: t.actualSeconds, roundLabel: t.roundLabel || '', queueIndex: t.queueIndex,
    };
  };
  const categoryFor = h => {
    if (CATEGORIES.includes(h.category) || ACTIVITY_ONLY_CATEGORIES.includes(h.category)) return h.category;
    const r = out.routines.find(x => x.id === h.routineId) || out.routines.find(x => x.name === h.name);
    if (r) return r.category;
    if (/meditation/i.test(h.name)) return 'Meditation';
    return 'Other';
  };
  const historyIds = new Set();
  for (const h of s.history) {
    const ok = idOk(h.id) && !historyIds.has(h.id) && str(h.name, 90) && str(h.at, 50) && Number.isFinite(Date.parse(h.at))
      && num(h.seconds, 0, 1e7) && num(h.skipped ?? 0, 0, 10000) && Array.isArray(h.steps ?? []) && (h.steps ?? []).length <= MAX_QUEUE
      && optional(h.type, x => ['session', 'activity'].includes(x)) && optional(h.effort, x => int(x, 1, 10))
      && optional(h.note, x => str(x, 2000)) && optional(h.distance, x => num(x, 0, 1e7)) && optional(h.kind, x => str(x, 60))
      && optional(h.routineId, x => str(x, 100));
    if (!ok) fail('a history entry is invalid');
    historyIds.add(h.id);
    out.history.push({
      id: h.id, type: h.type || 'session', name: h.name, at: h.at, seconds: h.seconds, skipped: h.skipped || 0,
      category: categoryFor(h), routineId: h.routineId || out.routines.find(x => x.name === h.name)?.id,
      steps: (h.steps || []).map(checkSet), effort: h.effort, note: h.note || '', kind: h.kind, distance: h.distance,
      manual: h.manual === true,
    });
  }
  out.history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // Body measurements (added in 0.7; older backups simply have none).
  if (s.body !== undefined) out.body = normalizeBody(s.body, fail);

  // An unfinished session (backups include one; version 1 kept it inside the state).
  if (s.activeSession) out.activeSession = normalizeSession(s.activeSession, checkExercise, checkSet, fail);
  return out;
}

function normalizeBody(b, fail) {
  const str = (x, n) => typeof x === 'string' && x.length <= n;
  const num = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
  const idOk = x => str(x, 100) && /^[a-zA-Z0-9_-]+$/.test(x);
  const bool = (x, d) => (typeof x === 'boolean' ? x : d);
  if (!b || typeof b !== 'object') fail('the body measurements are invalid');
  const out = freshBody();
  const custom = Array.isArray(b.custom) ? b.custom : [];
  if (custom.length > 40) fail('there are too many custom body spots');
  for (const c of custom) {
    if (!c || !idOk(c.id) || !c.id.startsWith('c-') || !str(c.name, 40) || !c.name.trim() || out.custom.some(x => x.id === c.id)) fail('a custom body spot is invalid');
    out.custom.push({ id: c.id, name: c.name.trim(), paired: c.paired === true });
  }
  const known = new Set([...BODY_SPOT_IDS, ...out.custom.map(c => c.id)]);
  if (Array.isArray(b.spots)) out.spots = [...new Set(b.spots.filter(id => known.has(id)))];
  const pairedIds = [...BODY_SPOTS.filter(s => s.paired).map(s => s.id), ...out.custom.filter(c => c.paired).map(c => c.id)];
  for (const id of pairedIds) if (['both', 'right', 'left'].includes(b.sides?.[id])) out.sides[id] = b.sides[id];
  out.figure = b.figure === 'straight' ? 'straight' : 'curvy';
  out.fat = bool(b.fat, false); out.photos = bool(b.photos, true); out.blur = bool(b.blur, false); out.backupPhotos = bool(b.backupPhotos, true);
  out.days = Array.isArray(b.days) ? [...new Set(b.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const entries = Array.isArray(b.entries) ? b.entries : [];
  if (entries.length > 20000) fail('there are too many body measurements');
  const dates = new Set();
  for (const e of entries) {
    if (!e || !isValidDateKey(e.date) || dates.has(e.date)) fail('a body measurement has an invalid or repeated date');
    dates.add(e.date);
    const entry = { date: e.date, m: {} };
    if (e.weight !== undefined && e.weight !== null) { if (!num(e.weight, 20, 400)) fail(`the weight on ${e.date} is out of range`); entry.weight = e.weight; }
    if (e.fat !== undefined && e.fat !== null) { if (!num(e.fat, 1, 75)) fail(`the body fat on ${e.date} is out of range`); entry.fat = e.fat; }
    const m = e.m ?? {};
    if (typeof m !== 'object' || Array.isArray(m) || Object.keys(m).length > 200) fail(`the measurements on ${e.date} are invalid`);
    for (const [k, v] of Object.entries(m)) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(k) || !num(v, 3, 400)) fail(`a measurement on ${e.date} is invalid`);
      entry.m[k] = v;
    }
    if (e.photos !== undefined && e.photos !== null) {
      if (typeof e.photos !== 'object' || !Object.entries(e.photos).every(([p, id]) => PHOTO_POSES.includes(p) && idOk(id))) fail(`the photos on ${e.date} are invalid`);
      if (Object.keys(e.photos).length) entry.photos = { ...e.photos };
    }
    if (e.note !== undefined && e.note !== null) { if (!str(e.note, 1000)) fail(`the note on ${e.date} is too long`); if (e.note.trim()) entry.note = e.note.trim(); }
    out.entries.push(entry);
  }
  out.entries.sort((x, y) => x.date.localeCompare(y.date));
  return out;
}

/** Photos inside a backup file: { id: "data:image/jpeg;base64,…" }. Invalid ones are dropped. */
function backupPhotosFrom(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, url] of Object.entries(raw).slice(0, 5000)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || typeof url !== 'string' || url.length > 20e6) continue;
    const head = /^data:image\/(jpeg|png|webp);base64,/.exec(url);
    if (head && /^[A-Za-z0-9+/]+={0,2}$/.test(url.slice(head[0].length))) out[id] = url;
  }
  return out;
}

function normalizeSession(a, checkExercise, checkSet, fail) {
  const str = (x, n) => typeof x === 'string' && x.length <= n;
  const num = (x, min, max) => Number.isFinite(x) && x >= min && x <= max;
  const int = (x, min, max) => num(x, min, max) && Number.isInteger(x);
  const ok = str(a.id, 100) && str(a.name, 90) && Array.isArray(a.queue) && a.queue.length && a.queue.length <= MAX_QUEUE
    && int(a.index, 0, a.queue.length - 1) && num(a.remaining, 0, 86400) && num(a.elapsed, 0, 1e9)
    && num(a.stepElapsed ?? 0, 0, 1e9) && Array.isArray(a.completed) && a.completed.length <= MAX_QUEUE;
  if (!ok) fail('the unfinished session is invalid');
  for (const q of a.queue) {
    if (!['move', 'rest', 'switch', 'transition'].includes(q.kind) || !num(q.value, 0, 1e6) || !str(q.section || '', 30) || !str(q.roundLabel || '', 100)) fail('the unfinished session has an invalid step');
    if (q.kind === 'move') {
      checkExercise(q.exercise, 'An exercise in the unfinished session');
      if (!MODES.includes(q.mode) || !int(q.set, 1, 50) || !int(q.sets, 1, 50) || !str(q.side, 30) || !num(q.weight ?? 0, 0, 1000)) fail('the unfinished session has an invalid exercise');
    }
    if (q.kind === 'switch' && !['Left', 'Right'].includes(q.nextSide)) fail('the unfinished session has an invalid side change');
  }
  return {
    ...a, completed: a.completed.map(checkSet), stepElapsed: a.stepElapsed || 0,
    skippedIdx: Array.isArray(a.skippedIdx) ? a.skippedIdx.filter(Number.isInteger) : [],
    skipped: Number.isInteger(a.skipped) ? a.skipped : 0,
    running: false, recovered: true, deadline: 0, lastTick: 0, pending: null,
  };
}

function safeURL(s) {
  if (!s) return false;
  try { return new URL(s).protocol === 'https:'; } catch { return false; }
}

// --------------------------------------------------------- persistence ----

function readStored(key) {
  const text = localStorage.getItem(key);
  return text ? { text, data: normalizeState(JSON.parse(text)) } : null;
}

/** Load in order of preference; keeps an untouched copy of anything that fails to load. */
function loadState() {
  let lastError = null;
  for (const key of [STORAGE_KEY, STORAGE_KEY + '-recovery', LEGACY_KEY, LEGACY_KEY + '-recovery']) {
    try {
      const found = readStored(key);
      if (!found) continue;
      state = found.data;
      if (key.startsWith(LEGACY_KEY)) storageProblem = 'migrated';
      if (lastError) storageProblem = 'recovered';
      return;
    } catch (err) {
      lastError = err;
      try {
        const text = localStorage.getItem(key);
        if (text && !localStorage.getItem('forma-unreadable-' + key)) localStorage.setItem('forma-unreadable-' + key, text);
      } catch { /* storage full or blocked */ }
    }
  }
  if (lastError) { storageOK = false; storageProblem = 'unreadable'; }
  else {
    try { localStorage.setItem('forma-probe', '1'); localStorage.removeItem('forma-probe'); }
    catch { storageOK = false; storageProblem = 'blocked'; }
  }
}

function loadSession() {
  let snapshot = state.activeSession;
  delete state.activeSession;
  try {
    const text = localStorage.getItem(SESSION_KEY);
    if (text) {
      const wrapped = normalizeState({ ...freshState(), exercises: state.exercises, routines: [], schedule: [], history: [], activeSession: JSON.parse(text) });
      snapshot = wrapped.activeSession;
    }
  } catch { /* an unreadable session is simply dropped */ }
  return snapshot || null;
}

function save() {
  state.lastSavedAt = new Date().toISOString();
  try {
    const data = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, data);
    storageOK = true;
    try { localStorage.setItem(STORAGE_KEY + '-recovery', data); } catch { /* recovery copy is best effort */ }
  } catch {
    storageOK = false;
    toast('Could not save on this device. Export a backup before leaving.');
  }
  updateSaveBadges();
}

/** Called about once a second during a session; only writes the small session record. */
function saveSession() {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot()));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* the main save reports storage problems */ }
}

function updateSaveBadges() {
  const text = storageOK ? 'Saved on this device' : 'Saving unavailable';
  $$('[data-save-status]').forEach(el => { el.textContent = text; el.classList.toggle('bad', !storageOK); });
}

// ------------------------------------------------------------- backups ----

/** The whole backup as text. Progress photos are added from the photo store when wanted. */
async function backupText() {
  if (session) { accountTime(); saveSession(); }
  const data = { ...state, exportedAt: new Date().toISOString(), app: 'Forma' };
  if (session && !session.isDemo) data.activeSession = sessionSnapshot();
  const ids = state.body.backupPhotos ? usedPhotoIds() : [];
  if (ids.length) {
    try { data.photos = await photosAsDataURLs(ids); } catch { toast('The photos could not be read, so this backup has none.'); }
  }
  return JSON.stringify(data, null, ids.length ? 0 : 2);
}
const backupName = () => `forma-backup-${todayKey()}.json`;

function markBackedUp() {
  state.settings.lastBackupAt = new Date().toISOString();
  save();
}

async function exportBackup() {
  download(backupName(), await backupText(), 'application/json');
  markBackedUp();
  toast('Backup downloaded. Keep it somewhere safe.');
}

/** On phones: hand the backup to the share sheet (Google Drive, email, messages…). */
function canShareFiles() {
  try { return !!navigator.canShare?.({ files: [new File(['{}'], 'test.json', { type: 'application/json' })] }); } catch { return false; }
}
async function shareBackup() {
  const file = new File([await backupText()], backupName(), { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: 'Forma backup' });
    markBackedUp();
    toast('Backup shared.');
  } catch (err) {
    if (err?.name !== 'AbortError') { toast('Sharing did not work here, so the backup was downloaded instead.'); exportBackup(); }
  }
}

function exportCSV() {
  const rows = [['date', 'time', 'session', 'type', 'category', 'duration_min', 'effort', 'exercise', 'set', 'side', 'planned', 'reps', `weight_${weightUnit()}`, 'seconds', `distance_${distanceUnit()}`, 'note']];
  const cell = v => {
    const text = String(v ?? '');
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  for (const h of state.history) {
    const d = new Date(h.at);
    const base = [dateKey(d), d.toTimeString().slice(0, 5), h.name, h.type, h.category, Math.round(h.seconds / 60), h.effort ?? ''];
    if (!h.steps.length) {
      rows.push([...base, '', '', '', '', '', '', '', h.distance ? fmtNum(mToDisplay(h.distance), 2) : '', h.note]);
      continue;
    }
    h.steps.forEach((t, i) => rows.push([...base, t.name, t.set, t.side, t.value, t.reps ?? '',
      t.weight ? fmtNum(kgToDisplay(t.weight), 1) : '', t.actualSeconds ?? '', t.distance ? fmtNum(mToDisplay(t.distance), 2) : '', i ? '' : h.note]));
  }
  download(`forma-history-${todayKey()}.csv`, rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv');
  toast('History exported as a spreadsheet file.');
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
