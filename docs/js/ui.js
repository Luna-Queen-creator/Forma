// Shared UI: routing, dialogs, toasts, icons, the body map and small components.
'use strict';

/** Click handlers keyed by data-action. Each view registers its own. */
const actions = {};
/** Submit handlers keyed by form id. */
const forms = {};
/** Input/change handlers keyed by data-bind or element id. */
const binds = {};

const VIEWS = {
  week: { label: 'My week', crumb: 'MY WEEK' },
  routines: { label: 'Routines', crumb: 'ROUTINES' },
  library: { label: 'Exercises', crumb: 'EXERCISE LIBRARY' },
  quick: { label: 'Quick start', crumb: 'QUICK START' },
  progress: { label: 'Progress', crumb: 'PROGRESS' },
  settings: { label: 'Settings', crumb: 'SETTINGS' },
};
const renderers = {};
let view = 'week';

function go(name) {
  if (!VIEWS[name]) name = 'week';
  if (session) { toast('Finish or end your current session first.'); return; }
  view = name;
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  closeDialogs();
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.body.classList.toggle('in-session', !!session);
  if (session) { renderSession(); return; }
  $$('nav [data-view]').forEach(b => {
    const active = b.dataset.view === view;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = VIEWS[view].crumb;
  renderers[view]();
  if (!storageOK || storageProblem) app().insertAdjacentHTML('afterbegin', storageNotice());
  updateSaveBadges();
}

function storageNotice() {
  if (!storageOK && storageProblem === 'unreadable') return '<p class="note warning">Your saved data could not be read. A copy was kept in this browser. Restore a backup, or export before making changes.</p>';
  if (!storageOK) return '<p class="note warning">This browser is not letting Forma save. Export a backup before you leave.</p>';
  if (storageProblem === 'migrated') return '<p class="note">Welcome to the new Forma. Your routines, plans and history came across from the previous version.</p>';
  if (storageProblem === 'recovered') return '<p class="note">Your latest save could not be read, so Forma loaded the recovery copy.</p>';
  return '';
}

const app = () => $('#app');

// -------------------------------------------------------------- dialogs ----

function showModal(html, { wide = false, keepScroll = false } = {}) {
  const modal = $('#modal');
  const scroll = modal.scrollTop;
  $('#modal-content').innerHTML = `<div class="modal-inner">${html}</div>`;
  modal.classList.toggle('wide', wide);
  if (!modal.open) modal.showModal();
  modal.scrollTop = keepScroll ? scroll : 0;
}
function modalHead(title, sub = '') {
  return `<div class="modal-header"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted small">${sub}</p>` : ''}</div>
    <button type="button" class="close" data-action="close" aria-label="Close dialog">×</button></div>`;
}
function closeModal() { const m = $('#modal'); if (m.open) m.close(); }
function closeDialogs() { closeModal(); const p = $('#picker'); if (p.open) p.close(); }

/** A small confirm dialog. `onYes` is stored and run by the confirm-yes action. */
let pendingConfirm = null;
function confirmDialog({ title, body, yes = 'Confirm', danger = true, onYes, onNo }) {
  pendingConfirm = { onYes, onNo };
  showModal(modalHead(title) + `<div>${body}</div><div class="modal-actions">
    <button type="button" class="btn light" data-action="confirm-no">Cancel</button>
    <button type="button" class="btn ${danger ? 'danger' : ''}" data-action="confirm-yes">${esc(yes)}</button></div>`);
}
actions['confirm-yes'] = () => { const c = pendingConfirm; pendingConfirm = null; closeModal(); c?.onYes?.(); };
actions['confirm-no'] = () => { const c = pendingConfirm; pendingConfirm = null; closeModal(); c?.onNo?.(); };

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

// ---------------------------------------------------------- components ----

function heading(title, sub = '', action = '') {
  return `<div class="heading"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`;
}
function emptyState(title, text, button = '') {
  return `<div class="empty"><h3>${title}</h3><p class="muted">${text}</p>${button}</div>`;
}
const pill = (text, cls = '') => `<span class="pill ${cls}">${text}</span>`;
function chips(name, values, current, labels = {}) {
  return `<div class="chips" role="group">${values.map(v => `<button type="button" class="chip ${v === current ? 'on' : ''}" data-action="chip" data-chip="${esc(name)}" data-value="${esc(v)}" aria-pressed="${v === current}">${esc(labels[v] || v)}</button>`).join('')}</div>`;
}
function options(values, current, labels = {}) {
  return values.map(v => `<option value="${esc(v)}" ${String(v) === String(current) ? 'selected' : ''}>${esc(labels[v] ?? v)}</option>`).join('');
}

const ICONS = {
  week: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  routines: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.3"/><circle cx="4.8" cy="12" r="1.3"/><circle cx="4.8" cy="17.5" r="1.3"/>',
  library: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  quick: '<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.6 15.4 12l-5.2 3.4z"/>',
  progress: '<path d="M4 20V11M10 20V5M16 20v-6M2.5 20.5h19"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/** Schematic front/back body with target areas coloured. */
function bodymap(e, size = '') {
  const stretch = isStretch(e?.category);
  const cls = m => (e?.primary?.includes(m) ? (stretch ? 'muscle stretch' : 'muscle primary') : e?.secondary?.includes(m) ? 'muscle secondary' : 'muscle');
  const figure = `<circle class="base" cx="30" cy="12" r="10"/><path class="base" d="M23 24h14l9 8 9 42-8 3-8-31-2 44 6 77-10 2-6-64-5 64-10-2 8-77-2-44-7 31-8-3 9-42z"/>`;
  return `<svg class="bodymap ${size}" viewBox="0 0 140 210" role="img" aria-label="Target areas: ${esc(e?.primary?.join(', ') || 'no specific muscles')}">
  <g transform="translate(4 7)">${figure}
    <path class="${cls('Chest')}" d="M20 36h9v15h-10zm11 0h9l1 15H31z"/><path class="${cls('Shoulders')}" d="M14 32l7-3-3 13-7 2zm26-3 7 3 3 12-7-2z"/>
    <path class="${cls('Arms')}" d="m10 46 7-2-6 24-6-2zm34-2 7 2 5 20-6 2z"/><path class="${cls('Core')}" d="M21 55h17l-2 28H23z"/>
    <path class="${cls('Quadriceps')}" d="m21 93 7 2-4 36-7-1zm10 2 7-2 3 37-7 1z"/><path class="${cls('Calves')}" d="m16 139 7 1-1 20-6 1zm19 1 7-1 1 22-6-1z"/>
    <path class="${cls('Adductors')}" d="m26 101 3 0-3 25-2-1zm4 0h3l3 24-2 1z"/><path class="${cls('Hip flexors')}" d="M21 84h7v8h-8zm11 0h6l1 8h-7z"/>
    <path class="${cls('Forearms')}" d="m7 61 5 2-3 9-5-2zm43 2 5-2 3 9-5 2z"/><path class="${cls('Neck')}" d="M26 23h8v6h-8z"/>
    <text x="16" y="190">FRONT</text></g>
  <g transform="translate(76 7)">${figure}
    <path class="${cls('Back')}" d="M21 34h18l-3 44H24z"/><path class="${cls('Shoulders')}" d="m14 32 7-3-3 13-7 2zm26-3 7 3 3 12-7-2z"/>
    <path class="${cls('Glutes')}" d="M21 82h18l1 16-10 3-11-3z"/><path class="${cls('Hamstrings')}" d="m20 103 7 2-3 28-7-1zm12 2 7-2 3 29-7 1z"/>
    <path class="${cls('Calves')}" d="m16 139 7 1-1 20-6 1zm19 1 7-1 1 22-6-1z"/><path class="${cls('Forearms')}" d="m7 61 5 2-3 9-5-2zm43 2 5-2 3 9-5 2z"/>
    <text x="18" y="190">BACK</text></g></svg>`;
}

/** Tiny line chart for a series of numbers (no axes, just the trend). */
function sparkline(values, { width = 220, height = 48 } = {}) {
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [4 + (i / (values.length - 1)) * (width - 8), height - 6 - ((v - min) / span) * (height - 12)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts.at(-1);
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><path d="${d}"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5"/></svg>`;
}

// --------------------------------------------------------------- theme ----

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1917' : '#123c39');
}
