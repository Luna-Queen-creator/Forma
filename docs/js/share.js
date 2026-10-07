// Sharing routines and your own exercises with friends.
// Everything travels inside the link itself, after the "#", which browsers never send to a
// server: nothing is uploaded, and only someone with the link can see what's in it.
'use strict';

/** Where links point when Forma was opened as a file (a file path is useless to a friend). */
const PUBLIC_URL = 'https://luna-queen-creator.github.io/Forma/';
const SHARE_PREFIX = '#share=';
const SHARE_FILE_KIND = 'forma-share';

// --------------------------------------------------------------- packing ----

const toBase64url = bytes => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function fromBase64url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('bad characters');
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/** Object -> short text for a link: "z" + compressed, or "j" + plain where compression is missing. */
async function packShare(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + toBase64url(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return 'j' + toBase64url(bytes);
}
/** The reverse, with a size limit so a strange link can't eat the phone's memory. */
async function unpackShare(text) {
  const LIMIT = 1_000_000;
  const raw = fromBase64url(text.slice(1));
  let bytes;
  if (text[0] === 'j') bytes = raw;
  else if (text[0] === 'z') {
    if (!window.DecompressionStream) throw new Error('This browser is too old to open shared links. Update it and try again.');
    const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > LIMIT) { reader.cancel(); throw new Error('too big'); }
      parts.push(value);
    }
    bytes = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { bytes.set(p, at); at += p.length; }
  } else throw new Error('unknown format');
  if (bytes.length > LIMIT) throw new Error('too big');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Check a shared payload with the same rules as a backup. Returns clean { kind, from, routine, exercises }. */
function readSharePayload(p) {
  if (!p || p.app !== 'forma' || p.v !== 1 || !['routine', 'exercise'].includes(p.kind)) throw new Error('not a Forma share');
  const exercises = Array.isArray(p.exercises) ? p.exercises.slice(0, 200) : [];
  const routines = p.kind === 'routine' ? [p.routine] : [];
  const clean = normalizeState({ version: 2, settings: {}, exercises, routines, schedule: [], history: [] });
  if (p.kind === 'routine' && !clean.routines.length) throw new Error('no routine');
  if (p.kind === 'exercise' && !clean.exercises.length) throw new Error('no exercise');
  const from = typeof p.from === 'string' ? p.from.trim().slice(0, 40) : '';
  return { kind: p.kind, from, routine: clean.routines[0] || null, exercises: clean.exercises };
}

// --------------------------------------------------------------- sending ----

/** Your own exercises a routine uses (built-in ones are in everyone's Forma already). */
function customExercisesIn(r) {
  const ids = new Set(routineMoves(r).map(b => b.exerciseId));
  return state.exercises.filter(e => ids.has(e.id));
}
const stripExercise = e => {
  const { custom, ...rest } = e;
  return rest;
};
function sharePayload(kind, id, { weights = false } = {}) {
  const from = (state.settings.shareName || '').trim();
  if (kind === 'exercise') return { app: 'forma', v: 1, kind, from, exercises: [stripExercise(exercise(id))] };
  const r = routine(id);
  const clearWeights = blocks => blocks.map(b => (b.kind === 'group' ? { ...b, steps: clearWeights(b.steps) } : b.kind === 'exercise' && !weights ? { ...b, weight: 0 } : b));
  const { nextNote, createdAt, ...rest } = structuredClone(r);   // your personal note stays with you
  return { app: 'forma', v: 1, kind, from, routine: { ...rest, steps: clearWeights(rest.steps) }, exercises: customExercisesIn(r).map(stripExercise) };
}
async function shareLink(payload) {
  const base = /^https?:$/.test(location.protocol) && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
    ? location.origin + location.pathname : PUBLIC_URL;
  return base + SHARE_PREFIX + await packShare(payload);
}

let shareTarget = null;   // { kind, id }
actions['share-routine'] = el => openShare('routine', el.dataset.id);
actions['share-exercise'] = el => openShare('exercise', el.dataset.id);

function openShare(kind, id) {
  const item = kind === 'routine' ? routine(id) : exercise(id);
  if (!item) return;
  shareTarget = { kind, id };
  const hasWeights = kind === 'routine' && routineMoves(item).some(b => b.weight > 0);
  const mine = kind === 'routine' ? customExercisesIn(item) : [];
  showModal(modalHead(`Share “${item.name}”`, kind === 'routine' ? 'Friends open the link and can add the routine to their Forma.' : 'Friends open the link and can add the exercise to their Forma.')
    + `<form id="share-form">
      <div class="field"><label for="share-from">Your name (optional)</label><input id="share-from" type="text" maxlength="40" autocomplete="nickname" value="${esc(state.settings.shareName || '')}" placeholder="So they know who it’s from"></div>
      ${hasWeights ? '<label class="checkrow"><input type="checkbox" id="share-weights"><span>Include my weights<small class="muted share-hint">Off: they start without weights and pick their own.</small></span></label>' : ''}
      ${mine.length ? `<p class="muted small">Includes ${plural(mine.length, 'exercise')} you made: ${mine.map(e => esc(e.name)).join(', ')}.</p>` : ''}
      <p class="note small">${icon('link')} The ${kind} travels inside the link itself. Nothing is uploaded, and your notes, history and progress stay private.</p>
      <div class="modal-actions">
        <button type="button" class="btn light" data-action="share-file">Save as file</button>
        <button type="button" class="btn light" data-action="share-copy">Copy link</button>
        ${navigator.share ? '<button type="button" class="btn" data-action="share-send">Share…</button>' : ''}
      </div></form>`);
}
function shareOptions() {
  const name = ($('#share-from')?.value || '').trim().slice(0, 40);
  if (name !== (state.settings.shareName || '')) { state.settings.shareName = name; save(); }
  return { weights: !!$('#share-weights')?.checked };
}
forms['share-form'] = () => actions[navigator.share ? 'share-send' : 'share-copy']();
actions['share-send'] = async () => {
  const opts = shareOptions();
  const { kind, id } = shareTarget;
  const item = kind === 'routine' ? routine(id) : exercise(id);
  try {
    const url = await shareLink(sharePayload(kind, id, opts));
    await navigator.share({ title: `Forma: ${item.name}`, text: `Here’s my ${kind} “${item.name}” for Forma 💪`, url });
    closeModal(); toast('Shared.');
  } catch (err) { if (err?.name !== 'AbortError') toast('Sharing didn’t work here. Use Copy link instead.'); }
};
actions['share-copy'] = async () => {
  const opts = shareOptions();
  const { kind, id } = shareTarget;
  try {
    const url = await shareLink(sharePayload(kind, id, opts));
    await navigator.clipboard.writeText(url);
    closeModal(); toast('Link copied. Paste it into a message.');
  } catch { toast('Copying didn’t work here. Try Share or Save as file.'); }
};
actions['share-file'] = () => {
  const opts = shareOptions();
  const { kind, id } = shareTarget;
  const item = kind === 'routine' ? routine(id) : exercise(id);
  const data = { ...sharePayload(kind, id, opts), type: SHARE_FILE_KIND };
  const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || kind;
  download(`forma-${kind}-${slug}.json`, JSON.stringify(data, null, 2), 'application/json');
  closeModal(); toast('Saved. Send the file; they open it in Forma under Settings › App & backups.');
};
actions['open-shared-file'] = () => $('#backup-file').click();

// ------------------------------------------------------------- receiving ----

/** Take a shared link out of the address (so it doesn't linger in history) and return its data. */
function takeShareFromURL() {
  if (!location.hash.startsWith(SHARE_PREFIX)) return '';
  const data = location.hash.slice(SHARE_PREFIX.length);
  history.replaceState(history.state, '', location.pathname + location.search + '#' + (typeof view === 'string' ? view : 'week'));
  return data;
}

let incoming = null;
async function openIncomingShare(text) {
  if (!text) return;
  try { showIncoming(readSharePayload(await unpackShare(text))); }
  catch (err) { toast(err.message?.startsWith('This browser') ? err.message : 'This shared link looks broken or incomplete. Ask for it again.'); }
}
function showIncomingFile(parsed) {
  try { showIncoming(readSharePayload(parsed)); }
  catch { toast('This file is not a routine or exercise shared from Forma.'); }
}

/** Run fn with the shared exercises temporarily known, so names and durations can be shown. */
function withExercises(list, fn) {
  const before = state.exercises;
  state.exercises = [...before, ...list.filter(e => !before.some(x => x.id === e.id))];
  try { return fn(); } finally { state.exercises = before; }
}

function showIncoming(share) {
  incoming = share;
  const who = share.from ? esc(share.from) : 'Someone';
  if (share.kind === 'routine') {
    const r = share.routine;
    const body = withExercises(share.exercises, () => `
      <p>${pill(esc(r.category))} <span class="muted">About ${duration(r)} min · ${plural(routineMoves(r).length, 'exercise')}</span></p>
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      <ol class="plan-preview">${r.steps.map(b => `<li>${esc(blockSummary(b))}</li>`).join('')}</ol>`);
    showModal(modalHead(`${who} shared a routine`, esc(r.name)) + body
      + (share.exercises.length ? `<p class="muted small">Comes with ${plural(share.exercises.length, 'exercise')} they made, which will be added to your library.</p>` : '')
      + `<div class="modal-actions"><button class="btn light" data-action="close">Not now</button><button class="btn" data-action="accept-share">Add to my routines</button></div>`);
  } else {
    const e = share.exercises[0];
    const body = withExercises(share.exercises, () => exerciseInfoHTML(e));
    showModal(modalHead(`${who} shared an exercise`, esc(e.name)) + body
      + `<div class="modal-actions"><button class="btn light" data-action="close">Not now</button><button class="btn" data-action="accept-share">Add to my exercises</button></div>`);
  }
}

const sameExercise = (a, b) => ['name', 'category', 'mode', 'value', 'equipment', 'level', 'bilateral', 'image', 'video']
  .every(k => (a[k] ?? '') === (b[k] ?? '')) && JSON.stringify(a.instructions) === JSON.stringify(b.instructions)
  && JSON.stringify(a.primary) === JSON.stringify(b.primary);
const uniqueName = (name, taken, from) => {
  if (!taken.some(n => n.toLowerCase() === name.toLowerCase())) return name;
  const tag = from ? ` (from ${from})` : ' (shared)';
  let candidate = (name.slice(0, 90 - tag.length) + tag);
  for (let i = 2; taken.some(n => n.toLowerCase() === candidate.toLowerCase()); i++) candidate = `${name.slice(0, 80)} (${i})`;
  return candidate;
};

actions['accept-share'] = () => {
  const share = incoming;
  if (!share) return;
  // Your own exercises: reuse an identical one you already have, otherwise add it with a fresh id.
  const idMap = new Map();
  const added = [];
  for (const e of share.exercises) {
    const twin = state.exercises.find(x => sameExercise(x, e));
    if (twin) { idMap.set(e.id, twin.id); continue; }
    const id = uid();
    idMap.set(e.id, id);
    added.push({ ...e, id, custom: true, name: uniqueName(e.name, [...allExercises().map(x => x.name), ...added.map(x => x.name)], share.from) });
  }
  let newRoutine = null;
  if (share.kind === 'routine') {
    const remap = blocks => blocks.map(b => (b.kind === 'group' ? { ...b, id: uid(), steps: remap(b.steps) }
      : { ...structuredClone(b), id: uid(), ...(b.kind === 'exercise' ? { exerciseId: idMap.get(b.exerciseId) || b.exerciseId } : {}) }));
    const r = share.routine;
    newRoutine = { ...structuredClone(r), id: uid(), name: uniqueName(r.name, state.routines.map(x => x.name), share.from), steps: remap(r.steps), nextNote: '', createdAt: new Date().toISOString() };
  }
  try { normalizeState({ ...state, exercises: [...state.exercises, ...added], routines: newRoutine ? [...state.routines, newRoutine] : state.routines }); }
  catch { toast('This share could not be added. Ask for it again.'); return; }
  state.exercises.push(...added);
  if (newRoutine) state.routines.push(newRoutine);
  incoming = null;
  save();
  closeModal();
  if (!session) go(newRoutine ? 'routines' : 'library');
  toast(newRoutine ? `“${newRoutine.name}” is now in your routines.` : added.length ? `“${added[0].name}” is now in your exercises.` : 'You already have this exercise.');
};
