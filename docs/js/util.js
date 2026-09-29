// Small shared helpers: DOM, escaping, ids, dates, numbers and unit formatting.
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

function uid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round1 = n => Math.round(n * 10) / 10;
const sum = (list, fn = x => x) => list.reduce((total, item) => total + (Number(fn(item)) || 0), 0);
const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;

/** Trim trailing zeros: 12.50 -> "12.5", 20.0 -> "20". */
function fmtNum(n, decimals = 1) {
  if (!Number.isFinite(n)) return '0';
  return String(Number(n.toFixed(decimals)));
}

// ---------------------------------------------------------------- dates ----

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Parse "YYYY-MM-DD" at noon so DST changes never shift the day. */
function parseDate(key) { return new Date(key + 'T12:00:00'); }
function addDays(d, n) { const copy = new Date(d); copy.setDate(copy.getDate() + n); return copy; }
function todayKey() { return dateKey(new Date()); }
function isValidDateKey(x) {
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(parseDate(x).getTime()) && dateKey(parseDate(x)) === x;
}

/** First day of the week containing d, honouring the week-start setting (1 = Monday, 0 = Sunday). */
function startOfWeek(d, weekStart = state.settings.weekStart) {
  const copy = new Date(d);
  copy.setHours(12, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() - weekStart + 7) % 7));
  return copy;
}
function weekKeyOf(d) { return dateKey(startOfWeek(d)); }

const shortDate = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const weekdayShort = d => d.toLocaleDateString(undefined, { weekday: 'short' });
const longDate = d => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const dateTime = iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** m:ss clock for timers. */
function formatClock(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
/** Human duration: "45 sec", "12 min", "1 h 5 min". */
function fmtDuration(seconds) {
  const n = Math.round(seconds || 0);
  if (n < 60) return `${n} sec`;
  const minutes = Math.round(n / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ' ' + (minutes % 60) + ' min' : ''}`;
}

// ---------------------------------------------------------------- units ----
// Weights are stored in kg and distances in metres; only the display converts.

const KG_PER_LB = 0.45359237;
const M_PER_MI = 1609.344;
const imperial = () => state.settings.units === 'imperial';
const weightUnit = () => (imperial() ? 'lb' : 'kg');
const distanceUnit = () => (imperial() ? 'mi' : 'km');

function kgToDisplay(kg) { return imperial() ? kg / KG_PER_LB : kg; }
function displayToKg(v) { return imperial() ? v * KG_PER_LB : v; }
function mToDisplay(m) { return imperial() ? m / M_PER_MI : m / 1000; }
function displayToM(v) { return Math.round(imperial() ? v * M_PER_MI : v * 1000); }

function fmtWeight(kg) { return `${fmtNum(kgToDisplay(kg), 1)} ${weightUnit()}`; }
function fmtDistance(m) {
  if (!imperial() && m < 1000) return `${Math.round(m)} m`;
  return `${fmtNum(mToDisplay(m), 2)} ${distanceUnit()}`;
}
/** Pace as m:ss per km/mi. */
function fmtPace(seconds, metres) {
  if (!seconds || !metres) return '';
  return `${formatClock(seconds / mToDisplay(metres))} /${distanceUnit()}`;
}
