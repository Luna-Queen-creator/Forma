// Wiring: global event delegation, start-up and the optional in-browser agent tools.
'use strict';

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action],[data-view]');
  if (!el || el.disabled) return;
  if (el.dataset.view && !el.dataset.action) { ev.preventDefault(); go(el.dataset.view); return; }
  const handler = actions[el.dataset.action];
  if (handler) { ev.preventDefault(); handler(el, ev); }
});

document.addEventListener('keydown', ev => {
  // Rows that act like buttons (e.g. in tables) respond to Enter.
  if ((ev.key === 'Enter' || (ev.key === ' ' && ev.target.matches?.('g[data-action]'))) && ev.target.matches?.('tr[data-action], g[role=button][data-action]')) {
    ev.preventDefault(); actions[ev.target.dataset.action]?.(ev.target, ev); return;
  }
  if (!session || $('#modal').open || $('#picker').open) return;
  const typing = ev.target.closest?.('input,textarea,select,button,summary');
  if (typing) return;
  if (ev.key === ' ') { ev.preventDefault(); toggleTimer(); }
  if (ev.key === 'Enter') { ev.preventDefault(); advance(false); }
});

document.addEventListener('submit', ev => {
  const handler = forms[ev.target.id];
  if (!handler) return;
  ev.preventDefault();
  handler(ev.target, new FormData(ev.target));
});

function onInput(ev) {
  const el = ev.target;
  if (editorInput(ev)) return;
  if (el.dataset?.log && session?.pending) { setPending(el.dataset.log, el.value); return; }
  const key = el.dataset?.bind || el.id;
  // Text fields react while typing; everything else on change.
  const live = el.type === 'search' || el.type === 'text';
  if (binds[key] && (ev.type === 'change' ? !live : live)) binds[key](el, ev);
}
document.addEventListener('input', onInput);
document.addEventListener('change', onInput);

// <details> toggles do not bubble, so listen in the capture phase.
document.addEventListener('toggle', ev => {
  const d = ev.target;
  if (d.matches?.('details[data-open-id]')) { if (d.open) editorOpen.add(d.dataset.openId); else editorOpen.delete(d.dataset.openId); }
  if (d.matches?.('details.how-to')) howToOpen = d.open;
}, true);

// Chart tooltips: hover on desktop, tap or focus on touch and keyboard.
document.addEventListener('pointerover', ev => { const col = ev.target.closest?.('.chart .col'); if (col) showChartTip(col); });
document.addEventListener('pointerout', ev => { const col = ev.target.closest?.('.chart .col'); if (col && !col.contains(ev.relatedTarget)) hideChartTip(col.closest('.chart-wrap')); });
document.addEventListener('focusin', ev => { if (ev.target.matches?.('.chart .col')) showChartTip(ev.target); });
document.addEventListener('focusout', ev => { if (ev.target.matches?.('.chart .col')) hideChartTip(ev.target.closest('.chart-wrap')); });

// Dialogs: clicking the backdrop or pressing Escape closes, but never silently drops editor changes.
for (const id of ['modal', 'picker']) {
  const dlg = document.getElementById(id);
  dlg.addEventListener('click', ev => {
    if (ev.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    const outside = ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
    if (!outside) return;
    if (id === 'picker') actions['close-picker']();
    else actions.close();
  });
  dlg.addEventListener('cancel', ev => {
    if (id === 'modal' && (guardEditorClose() || guardMeasureClose())) ev.preventDefault();
    if (id === 'picker') { ev.preventDefault(); actions['close-picker'](); }
  });
}

$('#backup-file').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (file) await handleBackupFile(file);
});

window.addEventListener('pagehide', pauseForBackground);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForBackground();
  else if (session) { if (session.running) accountTime(); initAudio(); renderSession(); }
  updateWakeLock();
});
// Any tap during a session counts as permission to (re)start the sound.
document.addEventListener('pointerdown', () => { if (session) initAudio(); }, { capture: true, passive: true });
// Opening or closing any dialog may change what the phone's back button should do.
for (const id of ['modal', 'picker']) new MutationObserver(syncBackGuard).observe(document.getElementById(id), { attributes: true, attributeFilter: ['open'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

// ---------------------------------------------------------------- start ----

loadState();
applyTheme();
const recovered = loadSession();
if (recovered) resumeSession(recovered);
const sharedText = takeShareFromURL();   // a routine or exercise someone sent (#share=…)
view = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'week';
if (storageProblem === 'migrated') save();   // write the upgraded copy; the old key is left untouched
render();
handleLaunchAction();
initPWA();
if (firstRun) { save(); showWelcome(); }   // saved straight away, so the welcome only ever shows once
if (sharedText) {
  if ($('#modal').open) $('#modal').addEventListener('close', () => openIncomingShare(sharedText), { once: true });
  else openIncomingShare(sharedText);
}

// --------------------------------------- tools for in-browser AI agents ----
// Browsers that support WebMCP can let an assistant read the plan and schedule routines.

if (document.modelContext?.registerTool) {
  const controller = new AbortController();
  const register = tool => Promise.resolve(document.modelContext.registerTool(tool, { signal: controller.signal })).catch(() => {});
  register({
    name: 'read_movement_plan',
    description: 'Read saved routines, planned sessions and recent history in this browser.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => ({
      routines: structuredClone(state.routines), schedule: structuredClone(state.schedule),
      recentHistory: structuredClone(state.history.slice(-30)),
    }),
  });
  register({
    name: 'schedule_routine',
    description: 'Add an existing routine to a date in the weekly planner.',
    inputSchema: { type: 'object', properties: { routineId: { type: 'string' }, date: { type: 'string' }, repeatWeekly: { type: 'boolean' } }, required: ['routineId', 'date'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: input => {
      if (session) throw new Error('Finish the current session first.');
      if (!input || typeof input.routineId !== 'string' || !routine(input.routineId) || !isValidDateKey(input.date)
        || (input.repeatWeekly !== undefined && typeof input.repeatWeekly !== 'boolean')) throw new Error('Choose an existing routine and a valid YYYY-MM-DD date.');
      const plan = { id: uid(), routineId: input.routineId, date: input.date, repeat: input.repeatWeekly === true, time: '', skip: [], until: '' };
      state.schedule.push(plan);
      save(); weekOffset = 0; go('week');
      return { id: plan.id, date: plan.date, savedToBrowser: storageOK };
    },
  });
  window.addEventListener('pagehide', () => controller.abort(), { once: true });
}
