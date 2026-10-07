// Installable-app support: offline service worker, update notice, install button, storage protection.
// None of this runs when Forma is opened as a local file; the app works the same without it.
'use strict';

const pwa = {
  installPrompt: null,     // Chrome/Samsung Internet's deferred "Install app" prompt
  waitingWorker: null,     // a downloaded update waiting to take over
  persisted: null,         // true when the browser promised not to clear our storage
};

const isServed = () => location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function initPWA() {
  window.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();               // show our own button instead of the browser's mini-bar
    pwa.installPrompt = ev;
    if (view === 'settings' && !session) render();
  });
  window.addEventListener('appinstalled', () => {
    pwa.installPrompt = null;
    toast('Forma is installed. Open it from your home screen.');
    protectStorage();
    if (view === 'settings' && !session) render();
  });

  navigator.storage?.persisted?.().then(v => { pwa.persisted = v; }).catch(() => {});
  if (!isServed() || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const offer = worker => { pwa.waitingWorker = worker; $('#update-bar').hidden = false; };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        // Only an *update* needs a prompt; the very first install just starts working.
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    // Check for a new release when the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      if (session) { accountTime(); saveSession(); }
      location.reload();
    });
  } catch { /* offline support is a bonus; the app works without it */ }
  if (isInstalled()) protectStorage();
}

/** Ask the browser to keep Forma's saved data even when the device is low on space. */
async function protectStorage() {
  try {
    if (!navigator.storage?.persist) return;
    pwa.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch { pwa.persisted = null; }
}

actions['apply-update'] = () => {
  $('#update-bar').hidden = true;
  if (pwa.waitingWorker) pwa.waitingWorker.postMessage('SKIP_WAITING');
  else location.reload();
};
actions['dismiss-update'] = () => { $('#update-bar').hidden = true; };

actions['install-app'] = async () => {
  if (!pwa.installPrompt) return;
  pwa.installPrompt.prompt();
  const choice = await pwa.installPrompt.userChoice.catch(() => null);
  pwa.installPrompt = null;
  if (choice?.outcome === 'accepted') protectStorage();
  render();
};
actions['protect-storage'] = async () => {
  await protectStorage();
  toast(pwa.persisted ? 'Your data is protected from automatic clean-up.' : 'The browser did not allow it yet. Installing Forma usually does.');
  render();
};
actions['share-backup'] = () => shareBackup();

/** Settings panel describing install state, storage protection and backups. */
function appPanelHTML() {
  const installed = isInstalled();
  const last = state.settings.lastBackupAt;
  const days = last ? Math.floor((Date.now() - Date.parse(last)) / 864e5) : null;
  const lastText = !last ? 'Never' : days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
  let install;
  if (installed) install = `<p class="status-line good-text">${icon('check')} Installed on this device</p>`;
  else if (pwa.installPrompt) install = `<button class="btn" data-action="install-app">Install Forma on this device</button>`;
  else if (!isServed()) install = '<p class="muted small">You opened Forma as a file. To install it as an app, open it from its web address instead.</p>';
  else install = `<p class="muted small">In Chrome or Samsung Internet, open the browser menu and choose <strong>Install app</strong> or <strong>Add to home screen</strong>. On iPhone: Share → Add to Home Screen.</p>`;
  return `<section class="panel"><h2>App & backups</h2>
    ${install}
    <p class="small">Data protection: ${pwa.persisted === true ? '<strong class="good-text">on</strong>, the browser will not clear Forma’s data by itself.'
      : `<strong>not confirmed</strong>. <button class="link" data-action="protect-storage">Ask the browser to protect it</button>`}</p>
    <p class="small">Last backup: <strong class="${days === null || days > 30 ? 'warn-text' : ''}">${lastText}</strong></p>
    <div class="stack">
      ${canShareFiles() ? '<button class="btn" data-action="share-backup">Share backup (Drive, email…)</button>' : ''}
      <button class="btn ${canShareFiles() ? 'light' : ''}" data-action="export">↓ Download backup</button>
      <button class="btn light" data-action="import">↑ Restore backup</button>
      <button class="btn light" data-action="open-shared-file">Open a shared routine file</button>
      <button class="btn light" data-action="export-csv">Export history as CSV</button>
    </div>
    <p class="muted small">Your data lives only in this browser on this device. Nobody else can see it, including whoever hosts the app. A backup is also how you move it to another device.</p>
  </section>`;
}

/** Home-screen shortcuts open straight into an action, e.g. ?open=log. */
function handleLaunchAction() {
  const params = new URLSearchParams(location.search);
  const open = params.get('open');
  if (!open) return;
  history.replaceState(null, '', location.pathname + location.hash);
  if (open === 'log' && !session) activityForm();
}
