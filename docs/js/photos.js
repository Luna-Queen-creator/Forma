// Progress photos. They are too big for the main save, so they live in the browser's
// IndexedDB on this device; the saved data only keeps their ids. Nothing is uploaded.
'use strict';

const PHOTO_DB = 'forma-photos';
let photoDBPromise = null;
const photoURLs = new Map();   // id -> object URL for showing on screen

function openPhotoDB() {
  if (!photoDBPromise) {
    photoDBPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('This browser cannot store photos.')); return; }
      const req = indexedDB.open(PHOTO_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Photo storage is not available.'));
      req.onblocked = () => reject(new Error('Photo storage is busy. Close other Forma tabs and try again.'));
    });
    photoDBPromise.catch(() => { photoDBPromise = null; });
  }
  return photoDBPromise;
}
const idbDone = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
const idbResult = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

async function photoGet(id) {
  const db = await openPhotoDB();
  return idbResult(db.transaction('photos').objectStore('photos').get(id));
}
async function photoPutMany(map) {   // { id: Blob }
  const db = await openPhotoDB();
  const tx = db.transaction('photos', 'readwrite');
  for (const [id, blob] of Object.entries(map)) tx.objectStore('photos').put(blob, id);
  return idbDone(tx);
}
async function photoDeleteMany(ids) {
  if (!ids.length) return;
  const db = await openPhotoDB();
  const tx = db.transaction('photos', 'readwrite');
  for (const id of ids) { tx.objectStore('photos').delete(id); forgetPhotoURL(id); }
  return idbDone(tx);
}
async function photoKeys() {
  const db = await openPhotoDB();
  return idbResult(db.transaction('photos').objectStore('photos').getAllKeys());
}
async function photoStats() {
  const db = await openPhotoDB();
  const all = await idbResult(db.transaction('photos').objectStore('photos').getAll());
  return { count: all.length, bytes: sum(all, b => b?.size || 0) };
}
async function photoClearAll() {
  const db = await openPhotoDB();
  const tx = db.transaction('photos', 'readwrite');
  tx.objectStore('photos').clear();
  photoURLs.forEach(url => URL.revokeObjectURL(url));
  photoURLs.clear();
  return idbDone(tx);
}
function forgetPhotoURL(id) {
  const url = photoURLs.get(id);
  if (url) { URL.revokeObjectURL(url); photoURLs.delete(id); }
}

/** Every photo id the body entries refer to. */
function usedPhotoIds() {
  return [...new Set(state.body.entries.flatMap(e => Object.values(e.photos || {})))];
}

/** Remove stored photos that no entry refers to any more (after deletes and restores). */
async function prunePhotos() {
  try {
    const used = new Set(usedPhotoIds());
    await photoDeleteMany((await photoKeys()).filter(id => !used.has(id)));
  } catch { /* nothing stored, or storage unavailable */ }
}

/** Fill <img data-photo-id> elements inside root with the stored photos. */
async function hydratePhotos(root = document) {
  for (const img of $$('img[data-photo-id]', root)) {
    const id = img.dataset.photoId;
    if (img.dataset.loaded === id) continue;
    img.dataset.loaded = id;
    try {
      let url = photoURLs.get(id);
      if (!url) {
        const blob = await photoGet(id);
        if (!blob) throw new Error('missing');
        url = URL.createObjectURL(blob);
        photoURLs.set(id, url);
      }
      img.src = url;
    } catch {
      img.closest('.photo-frame')?.classList.add('missing');
      img.alt = 'Photo not on this device';
    }
  }
}

// ------------------------------------------------------------ resizing ----

/** Shrink a camera photo to at most `max` pixels on its long side as a JPEG (about 100–200 KB). */
async function shrinkPhoto(file, max = 1080, quality = 0.8) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Choose a photo.');
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This photo could not be opened.'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = source.width, h0 = source.height;
  if (!w0 || !h0) throw new Error('This photo could not be opened.');
  const scale = Math.min(1, max / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * scale);
  canvas.height = Math.round(h0 * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('This photo could not be saved.'))), 'image/jpeg', quality));
}

// ------------------------------------------------------------- backups ----

const blobToDataURL = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
function dataURLToBlob(url) {
  const comma = url.indexOf(',');
  const type = url.slice(5, url.indexOf(';'));
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
async function photosAsDataURLs(ids) {
  const out = {};
  for (const id of ids) {
    const blob = await photoGet(id);
    if (blob) out[id] = await blobToDataURL(blob);
  }
  return out;
}
/** After a restore: store the backup's photos, then drop any the restored data no longer uses. */
async function restorePhotos(map) {
  const blobs = {};
  for (const [id, url] of Object.entries(map)) blobs[id] = dataURLToBlob(url);
  if (Object.keys(blobs).length) await photoPutMany(blobs);
  await prunePhotos();
}
