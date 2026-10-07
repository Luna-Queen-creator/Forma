// Settings: units, calendar, theme, session behaviour, equipment and data.
'use strict';

const APP_VERSION = '0.8';

/** A segmented-control option bound to a setting. */
function settingRadio(name, value, label) {
  return `<label class="seg-option"><input type="radio" name="${name}" value="${value}" data-bind="setting" ${String(state.settings[name]) === String(value) ? 'checked' : ''}><span>${label}</span></label>`;
}
function palettePicker() {
  const s = state.settings;
  return `<div class="palette-picker">${availablePalettes().map(p => `<label class="palette-option"><input type="radio" name="palette" value="${p.id}" data-bind="setting" ${s.palette === p.id ? 'checked' : ''}>
    <span class="palette-swatch" style="--sa:${p.a};--sb:${p.b}">${p.id === 'kitty' ? stickerSVG('face', 'swatch-kitty') : ''}</span><span class="palette-name">${p.name}</span></label>`).join('')}</div>`;
}

renderers.settings = () => {
  const s = state.settings;
  const radio = settingRadio;
  const toggle = (name, label, hint = '') => `<label class="toggle-row"><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="switch" name="${name}" data-bind="setting" ${s[name] ? 'checked' : ''}></label>`;
  app().innerHTML = heading('Make it yours.', 'Preferences are saved on this device and included in backups.')
    + `<div class="settings-grid">
      <section class="panel"><h2>Display</h2>
        <p class="label">Units</p><div class="segmented">${radio('units', 'metric', 'Metric (kg, km)')}${radio('units', 'imperial', 'Imperial (lb, mi)')}</div>
        <p class="label">Week starts on</p><div class="segmented">${radio('weekStart', 1, 'Monday')}${radio('weekStart', 0, 'Sunday')}</div>
        <p class="label">Colours</p>
        ${palettePicker()}
        <p class="label">Light or dark</p><div class="segmented">${radio('theme', 'system', 'Match device')}${radio('theme', 'light', 'Light')}${radio('theme', 'dark', 'Dark')}</div>
      </section>

      <section class="panel"><h2>Sessions</h2>
        ${toggle('countdown', 'Countdown beeps', 'Three short beeps before a timed step ends')}
        ${toggle('sounds', 'Bell at the end of timed steps')}
        ${toggle('wakeLock', 'Keep the screen on', 'While a session is running, where the browser allows it')}
        <div class="field inline-field"><label for="set-rest">Default rest between sets (sec)</label>
          <input id="set-rest" type="number" name="defaultRest" data-bind="setting" min="0" max="600" step="5" value="${s.defaultRest}"><small>Used when you add a strength exercise to a routine.</small></div>
      </section>

      <section class="panel span-2"><h2>My equipment</h2>
        <p class="muted small">Tick what you have at home or at your gym. Turn on “Only my equipment” in the library or the exercise picker to hide anything you cannot do.</p>
        <div class="gear-grid">${GEAR.map(g => `<label class="gear-chip"><input type="checkbox" name="gear" value="${esc(g)}" data-bind="gear" ${s.gear.includes(g) ? 'checked' : ''}><span>${esc(g)}</span></label>`).join('')}</div>
        <p class="muted small" id="gear-count">${BUILTIN_EXERCISES.filter(e => gearOk(e)).length} of ${BUILTIN_EXERCISES.length} built-in exercises fit your equipment.</p>
      </section>

      ${appPanelHTML()}

      <section class="panel"><h2>About</h2>
        <p class="small"><button type="button" class="version-tap" data-action="version-tap">Forma ${APP_VERSION}</button> · a personal planner and tracker for strength, cardio, yoga, mobility, meditation and body measurements.</p>
        <p class="muted small">Exercise instructions are general guidance, not medical or personal training advice. Warm up, move within a range you control, and stop if something hurts.</p>
        <div class="stack"><button class="btn light" data-action="test-player">Try the player demo</button>
        <button class="btn danger" data-action="erase-all">Erase all data on this device</button></div>
      </section>
      ${s.dev ? devPanelHTML() : ''}
    </div>`;
};

binds.setting = el => {
  const key = el.name;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (key === 'weekStart') value = Number(value);
  if (key === 'defaultRest') {
    value = Number(value);
    if (!Number.isInteger(value) || value < 0 || value > 600) return;
  }
  if (key === 'palette' && !availablePalettes().some(x => x.id === value)) return;
  state.settings[key] = value;
  save();
  if (key === 'theme' || key === 'palette') applyTheme();
  if (el.type === 'radio') { render(); toast('Saved.'); }
};
binds.gear = () => {
  state.settings.gear = $$('input[data-bind="gear"]').filter(x => x.checked).map(x => x.value);
  save();
  const count = $('#gear-count');
  if (count) count.textContent = `${BUILTIN_EXERCISES.filter(e => gearOk(e)).length} of ${BUILTIN_EXERCISES.length} built-in exercises fit your equipment.`;
};

actions.export = () => exportBackup();
actions.import = () => {
  if (session) { toast('End your current session before restoring a backup.'); return; }
  $('#backup-file').click();
};

let pendingBackup = null;
let pendingPhotos = {};
async function handleBackupFile(file) {
  try {
    if (file.size > 300e6) throw new Error('Choose a backup smaller than 300 MB.');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('This file is not a Forma backup (it is not JSON).'); }
    if (parsed?.type === SHARE_FILE_KIND) { showIncomingFile(parsed); return; }
    if (session) throw new Error('End your current session before restoring a backup.');
    pendingBackup = normalizeState(parsed);
    pendingPhotos = backupPhotosFrom(parsed.photos);
    const b = pendingBackup;
    const photos = Object.keys(pendingPhotos).length;
    const body = b.body.entries.length ? `, ${plural(b.body.entries.length, 'body check-in')}${photos ? ` with ${plural(photos, 'photo')}` : ''}` : '';
    showModal(modalHead('Restore this backup?') + `<p>It contains ${plural(b.routines.length, 'routine')}, ${plural(b.exercises.length, 'custom exercise')}, ${plural(b.schedule.length, 'plan')}, ${plural(b.history.length, 'history entry', 'history entries')}${body}${b.activeSession ? ', plus an unfinished session you can resume' : ''}.</p>
      <p class="note warning">Restoring replaces everything currently saved in this browser. Export first if you want to keep it.</p>
      <div class="modal-actions"><button class="btn light" data-action="export">Export current data</button><button class="btn danger" data-action="confirm-restore">Replace with backup</button></div>`);
  } catch (err) { toast(err.message || 'Could not read this backup.'); }
}
actions['confirm-restore'] = async () => {
  if (!pendingBackup) return;
  const b = pendingBackup, photos = pendingPhotos;
  pendingBackup = null; pendingPhotos = {};
  const snapshot = b.activeSession;
  delete b.activeSession;
  state = b;
  storageProblem = '';
  save();
  applyTheme();
  if (snapshot) { resumeSession(snapshot); saveSession(); }
  closeModal(); render(); toast('Backup restored.');
  try { await restorePhotos(photos); render(); }
  catch { if (Object.keys(photos).length) toast('Backup restored, but its photos could not be stored on this device.'); }
};

actions['erase-all'] = () => confirmDialog({
  title: 'Erase everything?', yes: 'Erase all data',
  body: '<p>This deletes all routines, plans, custom exercises, history, body measurements, photos and settings from this browser. It cannot be undone.</p><p class="note warning">Export a backup first if there is anything you might want back.</p>',
  onYes: () => {
    state = freshState();
    session = null;
    try { [STORAGE_KEY, STORAGE_KEY + '-recovery', SESSION_KEY, LEGACY_KEY, LEGACY_KEY + '-recovery'].forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
    save(); applyTheme(); go('week'); toast('All data erased.');
    photoClearAll().catch(() => {});
  },
});

// ------------------------------------------------------------- welcome ----
// Shown once, the very first time Forma opens on a device (it is marked as seen right away).

function showWelcome() {
  const install = isServed() && !isInstalled()
    ? `<li>${icon('plus')}<span><strong>Install it</strong> from the browser menu: <em>Install app</em> or <em>Add to Home screen</em>. Then it opens like an app and works offline.</span></li>` : '';
  showModal(`<div class="welcome">
    <div class="welcome-head"><span class="mark">f</span><div><h2>Welcome to Forma</h2><p class="muted">Your workouts, your week and your progress, all in one place.</p></div></div>
    <ul class="welcome-list">
      <li>${icon('routines')}<span><strong>Routines</strong> for strength, cardio, yoga, mobility and more. Start from a template or build your own; a guided timer leads you through.</span></li>
      <li>${icon('progress')}<span><strong>Tracking</strong> of weights, reps and runs. Next time starts from what you did last time.</span></li>
      <li>${icon('body')}<span><strong>Body</strong>: weight and measurements over time, with photos if you like.</span></li>
      <li>${icon('lock')}<span><strong>Private</strong>: no account and no cloud. Everything stays on this phone, so make a backup now and then in Settings › App &amp; backups.</span></li>
      ${install}
    </ul>
    <p class="label">Units</p><div class="segmented">${settingRadio('units', 'metric', 'Metric (kg, cm)')}${settingRadio('units', 'imperial', 'Imperial (lb, in)')}</div>
    <p class="label">Pick your colours</p>${palettePicker()}
    <p class="muted small">You can change all of this later in Settings.</p>
    <div class="modal-actions"><button class="btn" data-action="welcome-done">Let’s go</button></div></div>`);
}
actions['welcome-done'] = () => closeModal();

// ---------------------------------------------------- developer options ----
// Tap the version number seven times, then enter the code. This hides things from curious
// friends, nothing more: the app's code is public, so it is not real security.

const DEV_CODE_HASH = '007afb91983c4c1d11ef97532c2319230d304234a402e49e3b91750934008681';
let devTaps = 0, devTapTimer = 0;
actions['version-tap'] = () => {
  if (state.settings.dev) { toast('Developer options are already on. They’re at the bottom of Settings.'); return; }
  clearTimeout(devTapTimer);
  devTapTimer = setTimeout(() => { devTaps = 0; }, 1500);
  devTaps++;
  if (devTaps >= 7) { devTaps = 0; devCodeDialog(); }
  else if (devTaps >= 4) toast(`${7 - devTaps} more…`);
};
function devCodeDialog() {
  showModal(modalHead('Developer options', 'Enter the developer code.') + `<form id="dev-form">
    <div class="field"><label for="dev-code">Code</label><input id="dev-code" name="code" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="100" required></div>
    <div class="modal-actions"><button type="button" class="btn light" data-action="close">Cancel</button><button class="btn">Unlock</button></div></form>`);
  setTimeout(() => $('#dev-code')?.focus(), 50);
}
async function sha256Hex(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
forms['dev-form'] = async (f, fd) => {
  let ok = false;
  try { ok = (await sha256Hex('forma-dev:' + String(fd.get('code')).trim().toLowerCase())) === DEV_CODE_HASH; }
  catch { toast('This browser can’t check the code here.'); return; }
  if (!ok) { toast('That’s not it.'); $('#dev-code').select(); return; }
  state.settings.dev = true;
  save(); closeModal(); render();
  toast('Developer options unlocked. The Kitty theme is yours 🐾');
};
function devPanelHTML() {
  let bytes = 0;
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('forma')) bytes += (localStorage.getItem(k) || '').length * 2; } catch { /* blocked */ }
  return `<section class="panel dev-panel"><h2>Developer options</h2>
    <p class="muted small">Only on this device. Secret themes unlocked: ${PALETTES.filter(p => p.secret).map(p => p.name).join(', ')}.</p>
    <p class="small">Saved data in this browser: about ${Math.max(1, Math.round(bytes / 1024))} KB${usedPhotoIds().length ? ` · ${plural(usedPhotoIds().length, 'progress photo')}` : ''}.</p>
    <div class="stack"><button class="btn light" data-action="dev-welcome">Show the welcome screen</button>
      <button class="btn light" data-action="dev-off">Turn off developer options</button></div></section>`;
}
actions['dev-welcome'] = () => showWelcome();
actions['dev-off'] = () => confirmDialog({
  title: 'Turn off developer options?', yes: 'Turn off', danger: false,
  body: '<p>Secret themes are hidden again (Kitty switches to Rose). Tap the version number seven times to come back.</p>',
  onYes: () => {
    state.settings.dev = false;
    if (PALETTES.some(p => p.secret && p.id === state.settings.palette)) state.settings.palette = 'rose';
    save(); applyTheme(); render(); toast('Developer options off.');
  },
});
