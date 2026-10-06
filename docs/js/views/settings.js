// Settings: units, calendar, theme, session behaviour, equipment and data.
'use strict';

const APP_VERSION = '0.6';

renderers.settings = () => {
  const s = state.settings;
  const radio = (name, value, label) => `<label class="seg-option"><input type="radio" name="${name}" value="${value}" data-bind="setting" ${String(s[name]) === String(value) ? 'checked' : ''}><span>${label}</span></label>`;
  const toggle = (name, label, hint = '') => `<label class="toggle-row"><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="switch" name="${name}" data-bind="setting" ${s[name] ? 'checked' : ''}></label>`;
  app().innerHTML = heading('Make it yours.', 'Preferences are saved on this device and included in backups.')
    + `<div class="settings-grid">
      <section class="panel"><h2>Display</h2>
        <p class="label">Units</p><div class="segmented">${radio('units', 'metric', 'Metric (kg, km)')}${radio('units', 'imperial', 'Imperial (lb, mi)')}</div>
        <p class="label">Week starts on</p><div class="segmented">${radio('weekStart', 1, 'Monday')}${radio('weekStart', 0, 'Sunday')}</div>
        <p class="label">Colours</p>
        <div class="palette-picker">${PALETTES.map(p => `<label class="palette-option"><input type="radio" name="palette" value="${p.id}" data-bind="setting" ${s.palette === p.id ? 'checked' : ''}>
          <span class="palette-swatch" style="--sa:${p.a};--sb:${p.b}">${p.id === 'kitty' ? stickerSVG('face', 'swatch-kitty') : ''}</span><span class="palette-name">${p.name}</span></label>`).join('')}</div>
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
        <p class="small">Forma ${APP_VERSION} · a personal planner and tracker for strength, cardio, yoga, mobility and meditation.</p>
        <p class="muted small">Exercise instructions are general guidance, not medical or personal training advice. Warm up, move within a range you control, and stop if something hurts.</p>
        <div class="stack"><button class="btn light" data-action="test-player">Try the player demo</button>
        <button class="btn danger" data-action="erase-all">Erase all data on this device</button></div>
      </section>
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
async function handleBackupFile(file) {
  try {
    if (file.size > 20e6) throw new Error('Choose a backup smaller than 20 MB.');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('This file is not a Forma backup (it is not JSON).'); }
    pendingBackup = normalizeState(parsed);
    const b = pendingBackup;
    showModal(modalHead('Restore this backup?') + `<p>It contains ${plural(b.routines.length, 'routine')}, ${plural(b.exercises.length, 'custom exercise')}, ${plural(b.schedule.length, 'plan')} and ${plural(b.history.length, 'history entry', 'history entries')}${b.activeSession ? ', plus an unfinished session you can resume' : ''}.</p>
      <p class="note warning">Restoring replaces everything currently saved in this browser. Export first if you want to keep it.</p>
      <div class="modal-actions"><button class="btn light" data-action="export">Export current data</button><button class="btn danger" data-action="confirm-restore">Replace with backup</button></div>`);
  } catch (err) { toast(err.message || 'Could not read this backup.'); }
}
actions['confirm-restore'] = () => {
  if (!pendingBackup) return;
  const b = pendingBackup;
  pendingBackup = null;
  const snapshot = b.activeSession;
  delete b.activeSession;
  state = b;
  storageProblem = '';
  save();
  applyTheme();
  if (snapshot) { resumeSession(snapshot); saveSession(); }
  closeModal(); render(); toast('Backup restored.');
};

actions['erase-all'] = () => confirmDialog({
  title: 'Erase everything?', yes: 'Erase all data',
  body: '<p>This deletes all routines, plans, custom exercises, history and settings from this browser. It cannot be undone.</p><p class="note warning">Export a backup first if there is anything you might want back.</p>',
  onYes: () => {
    state = freshState();
    session = null;
    try { [STORAGE_KEY, STORAGE_KEY + '-recovery', SESSION_KEY, LEGACY_KEY, LEGACY_KEY + '-recovery'].forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
    save(); applyTheme(); go('week'); toast('All data erased.');
  },
});
