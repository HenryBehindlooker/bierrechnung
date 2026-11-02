'use strict';

/* ------------------------------------------------------------------
 * Zirbenstube – Getränkeliste
 * Strichliste, Abrechnung mit Zahlungen, Bestand und Statistik.
 * Oberfläche im SwiftUI-/iOS-Stil. Alle Daten liegen im localStorage.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'zirbenstube-getraenkeliste-v1'; // nie ändern – sonst sind die Daten weg
const META_KEY = 'zirbenstube-meta-v1';
const DAY = 86400000;
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const TABS = {
  liste: 'Strichliste', abrechnung: 'Abrechnung', bestand: 'Bestand',
  statistik: 'Statistik', einstellungen: 'Einstellungen',
};
const TAB_ICONS = { liste: 'tally', abrechnung: 'euro', bestand: 'box', statistik: 'chart', einstellungen: 'sliders' };

const COLORS = {
  red: '#ff3b30', orange: '#ff9500', yellow: '#ffcc00', green: '#34c759', mint: '#00c7be', teal: '#30b0c7',
  blue: '#007aff', indigo: '#5856d6', purple: '#af52de', pink: '#ff2d55', brown: '#a2845e', gray: '#8e8e93',
};
const COLOR_LABELS = {
  red: 'Rot', orange: 'Orange', yellow: 'Gelb', green: 'Grün', mint: 'Mint', teal: 'Türkis',
  blue: 'Blau', indigo: 'Indigo', purple: 'Lila', pink: 'Pink', brown: 'Braun', gray: 'Grau',
};
const PERSON_CYCLE = ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'indigo', 'red', 'mint', 'brown'];
const DRINK_EMOJIS = ['🍺', '🍻', '🍋', '🥤', '🧃', '🍷', '🥂', '🍾', '🥃', '🍸', '🍹', '🧉',
  '🧋', '☕️', '🍵', '🥛', '💧', '🍊', '🍎', '🥥', '🍶', '⚡️', '🧊', '🍫'];

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round(n * 100) / 100;
const parsePrice = (s) => {
  const v = parseFloat(String(s).trim().replace('€', '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? round2(v) : null;
};
const parseCount = (s) => {
  const t = String(s).trim();
  if (!/^-?\d+$/.test(t)) return null;
  return parseInt(t, 10);
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', d.getFullYear() === new Date().getFullYear()
    ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
const monthLabelOf = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

/* ----------------------- Symbole (SF-Symbol-artig) ----------------------- */

const ICONS = {
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  xmark: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  tally: '<path d="M6 5v14M10 5v14M14 5v14M18 5v14M3.5 15.5l17-7"/>',
  euro: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.6a4.2 4.2 0 1 0 0 6.8M7.5 10.6h6M7.5 13.4h6"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
  chart: '<path d="M4 20h16"/><rect x="5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="6" width="3" height="11" rx="1"/><rect x="16" y="9" width="3" height="8" rx="1"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  printer: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2"/>',
  download: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  upload: '<path d="M12 14V3M8 7l4-4 4 4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  grip: '<path d="M5 8h14M5 12h14M5 16h14"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  cart: '<path d="M3 4h2l2.4 10.5a2 2 0 0 0 2 1.5h7.2a2 2 0 0 0 2-1.5L20 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  pencil: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.9-1.4-.9-2.4 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mug: '<path d="M6 9h10v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M5.5 9c0-2 1.6-3.2 3.2-2.7.9-1.5 3.4-1.5 4.3 0 1.6-.5 3.5.7 3.5 2.7"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
};
const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------------------- Farben, Avatare, Kacheln ---------------------- */

function fgFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1c1c1e' : '#ffffff';
}
const initials = (name) => {
  const w = String(name).trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length > 1 ? [...w[0]][0] + [...w[1]][0] : [...w[0]][0]).toUpperCase();
};
const avatar = (p, size = '') => {
  const c = COLORS[p.color] || COLORS.gray;
  return `<span class="avatar ${size}" style="--c:${c};color:${fgFor(c)}" aria-hidden="true">${esc(initials(p.name))}</span>`;
};
const drinkTile = (d, size = '') =>
  `<span class="tile ${size}" style="--c:${COLORS[d.color] || COLORS.gray}" aria-hidden="true">${esc(d.emoji || '🥤')}</span>`;

function guessDrink(name, i) {
  const n = String(name).toLowerCase();
  const rules = [
    [/radler|bier|pils|weizen|helles|export|dunkel|lager/, '🍺', 'orange'],
    [/limo|zitron/, '🍋', 'yellow'],
    [/spezi|cola|mezzo/, '🥤', 'brown'],
    [/wasser|sprudel/, '💧', 'blue'],
    [/sekt|prosecco|champ/, '🥂', 'yellow'],
    [/wein/, '🍷', 'red'],
    [/schnaps|obstler|whisk|korn|likör|gin|rum/, '🥃', 'brown'],
    [/kaffee|espresso/, '☕️', 'brown'],
    [/tee/, '🍵', 'green'],
    [/saft|schorle/, '🧃', 'orange'],
    [/mate/, '🧉', 'green'],
    [/energy|red bull/, '⚡️', 'blue'],
  ];
  for (const [re, emoji, color] of rules) if (re.test(n)) return { emoji, color };
  return { emoji: '🥤', color: PERSON_CYCLE[i % PERSON_CYCLE.length] };
}

/* ---------------------------- Zustand ---------------------------- */

function defaultState() {
  return migrate({
    version: 2,
    persons: [['Leo', 'blue'], ['Max', 'green'], ['Jonas', 'purple'], ['Gast 1', 'orange'], ['Gast 2', 'pink']]
      .map(([name, color]) => ({ id: uid(), name, color, archived: false })),
    drinks: [['Limo', 1.5, 12], ['Bier', 1.8, 20], ['Spezi', 1.8, 12]]
      .map(([name, price, perCrate]) => ({ id: uid(), name, price, perCrate, archived: false })),
    months: {},
    payments: [],
    purchases: [],
    settings: { paypal: '', note: '' },
  });
}

function isValidState(s) {
  return !!s && Array.isArray(s.persons) && Array.isArray(s.drinks)
    && !!s.months && typeof s.months === 'object';
}

/** Bringt ältere Datenstände (v1) auf den aktuellen Stand – nichts geht verloren. */
function migrate(s) {
  s.persons.forEach((p, i) => {
    if (!COLORS[p.color]) p.color = PERSON_CYCLE[i % PERSON_CYCLE.length];
    p.archived = !!p.archived;
  });
  s.drinks.forEach((d, i) => {
    const guess = guessDrink(d.name, i);
    if (!d.emoji) d.emoji = guess.emoji;
    if (!COLORS[d.color]) d.color = guess.color;
    if (typeof d.stock !== 'number') d.stock = null;
    if (!(d.perCrate > 0)) d.perCrate = /bier/i.test(d.name) ? 20 : 12;
    if (typeof d.crateCost !== 'number') d.crateCost = null;
    if (typeof d.minStock !== 'number') d.minStock = null;
    d.archived = !!d.archived;
  });
  s.payments = Array.isArray(s.payments) ? s.payments : [];
  s.purchases = Array.isArray(s.purchases) ? s.purchases : [];
  s.settings = { paypal: '', note: '', ...(s.settings || {}) };
  // v1: „bezahlt“-Haken pro Monat → Zahlungen in Höhe des Monatsbetrags
  for (const key of Object.keys(s.months).sort()) {
    const m = s.months[key];
    m.prices ||= {};
    m.counts ||= {};
    if (m.paid) {
      for (const pid of Object.keys(m.paid)) {
        if (!m.paid[pid]) continue;
        const amount = charge(key, pid, s);
        if (amount > 0) s.payments.push({ id: uid(), pid, month: key, amount, date: null });
      }
      delete m.paid;
    }
  }
  s.version = 2;
  return s;
}

let loadedNeedsSave = false;
function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* kein Speicher verfügbar */ }
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (isValidState(s)) {
        loadedNeedsSave = s.version !== 2;
        return migrate(s);
      }
    } catch (e) {
      console.error('Daten konnten nicht gelesen werden', e);
    }
    // Niemals überschreiben, was wir nicht lesen konnten: Rohdaten aufbewahren
    try { localStorage.setItem(`${STORAGE_KEY}-unlesbar-${Date.now()}`, raw); } catch { /* egal */ }
  }
  return defaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    hud('Speichern fehlgeschlagen – bitte Sicherung exportieren', 'warn');
  }
}

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; }
}
function saveMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* egal */ }
}

/* Rückgängig: Schnappschuss vor jeder Änderung */
let undoSnap = null;
const checkpoint = () => { undoSnap = JSON.stringify(state); };
function undo() {
  if (!undoSnap) return;
  state = migrate(JSON.parse(undoSnap));
  undoSnap = null;
  saveState();
  render();
  hud('Rückgängig gemacht', 'undo');
}

const now = new Date();
const ui = {
  year: now.getFullYear(),
  month: now.getMonth(),
  week: Math.ceil(now.getDate() / 7),
  tab: TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'liste',
  statsYear: now.getFullYear(),
  editing: false,
  openWeeks: new Set(),
  sheet: null, // { kind, id }
};

/* ------------------------- Kalender-Helfer ------------------------ */

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const weekCount = (y, m) => Math.ceil(daysIn(y, m) / 7);
const weekRange = (y, m, w) => `${(w - 1) * 7 + 1}.–${Math.min(w * 7, daysIn(y, m))}.`;
const keyOf = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
const monthKey = () => keyOf(ui.year, ui.month);
const monthLabel = () => `${MONTH_NAMES[ui.month]} ${ui.year}`;
const isThisMonth = () => {
  const d = new Date();
  return d.getFullYear() === ui.year && d.getMonth() === ui.month;
};
const todayWeek = () => (isThisMonth() ? Math.ceil(new Date().getDate() / 7) : 0);

/* ------------------------- Daten-Helfer -------------------------- */

const findPerson = (id) => state.persons.find((p) => p.id === id);
const findDrink = (id) => state.drinks.find((d) => d.id === id);

function getMonth(create = false) {
  const k = monthKey();
  let m = state.months[k];
  if (!m && create) {
    m = state.months[k] = { prices: {}, counts: {} };
    state.drinks.filter((d) => !d.archived).forEach((d) => { m.prices[d.id] = d.price; });
  }
  return m;
}

const priceOf = (m, d) => (typeof m?.prices?.[d.id] === 'number' ? m.prices[d.id] : d.price);
const count = (m, w, pid, did) => m?.counts?.[w]?.[pid]?.[did] || 0;

function monthTotal(m, pid, did) {
  let n = 0;
  for (const w in (m?.counts || {})) n += m.counts[w]?.[pid]?.[did] || 0;
  return n;
}
const drinkMonthQty = (m, did) => state.persons.reduce((s, p) => s + monthTotal(m, p.id, did), 0);

function setCount(w, pid, did, value) {
  const m = getMonth(true);
  if (m.prices[did] === undefined) {
    const d = findDrink(did);
    if (d) m.prices[did] = d.price;
  }
  const week = (m.counts[w] ??= {});
  const pc = (week[pid] ??= {});
  if (value > 0) pc[did] = value; else delete pc[did];
  if (!Object.keys(pc).length) delete week[pid];
  if (!Object.keys(week).length) delete m.counts[w];
}

/** Gestrichene Flaschen zurück ins Lager buchen (beim Leeren). */
function restock(counts) {
  for (const pc of Object.values(counts || {})) {
    for (const [did, n] of Object.entries(pc || {})) {
      const d = findDrink(did);
      if (d && typeof d.stock === 'number') d.stock += n;
    }
  }
}

function usedAnywhere(kind, id) {
  return Object.values(state.months).some((m) => Object.values(m.counts || {}).some((week) =>
    kind === 'person'
      ? Object.keys(week[id] || {}).length > 0
      : Object.values(week).some((pc) => (pc[id] || 0) > 0)))
    || (kind === 'person' && state.payments.some((x) => x.pid === id));
}

const visiblePersons = (m) => state.persons.filter((p) =>
  !p.archived || state.drinks.some((d) => monthTotal(m, p.id, d.id) > 0));
const visibleDrinks = (m) => state.drinks.filter((d) =>
  !d.archived || state.persons.some((p) => monthTotal(m, p.id, d.id) > 0));

const personWeekAmount = (m, w, pid, drinks) =>
  round2(drinks.reduce((s, d) => s + count(m, w, pid, d.id) * priceOf(m, d), 0));

/** Betrag einer Person in einem Monat (alle Getränke). */
function charge(key, pid, st = state) {
  const m = st.months[key];
  if (!m) return 0;
  return round2(st.drinks.reduce((s, d) => s + monthTotal(m, pid, d.id) * priceOf(m, d), 0));
}

/**
 * Konto einer Person aus Sicht eines Monats. Zahlungen werden der Reihe nach
 * auf die ältesten offenen Monate angerechnet; Überschuss ist Guthaben.
 */
function account(pid, key = monthKey()) {
  let before = 0;
  let all = 0;
  for (const k of Object.keys(state.months)) {
    const c = charge(k, pid);
    all += c;
    if (k < key) before += c;
  }
  const c = charge(key, pid);
  const mine = state.payments.filter((x) => x.pid === pid);
  const paid = mine.reduce((s, x) => s + x.amount, 0);
  const paidThis = mine.filter((x) => x.month === key).reduce((s, x) => s + x.amount, 0);
  const due = round2(Math.max(0, before + c - paid));
  return {
    charge: c,
    carry: round2(Math.max(0, before - paid)),
    covered: round2(Math.min(c, Math.max(0, paid - before))),
    openThis: round2(c - Math.min(c, Math.max(0, paid - before))),
    due,
    credit: round2(Math.max(0, paid - all)),
    paidThis: round2(paidThis),
    settled: due < 0.005,
    relevant: c > 0 || due > 0 || paidThis > 0,
  };
}

const unitCost = (d) => (d.crateCost != null && d.perCrate > 0 ? d.crateCost / d.perCrate : null);
const isLow = (d) => typeof d.stock === 'number' && d.minStock != null && d.stock <= d.minStock;
function stockText(d) {
  const s = d.stock;
  if (typeof s !== 'number') return 'Bestand nicht erfasst';
  if (s <= 0) return s === 0 ? 'Leer' : `${s} Flaschen (Bestand prüfen)`;
  const crates = Math.floor(s / d.perCrate);
  const rest = s % d.perCrate;
  if (!crates) return plural(rest, 'Flasche', 'Flaschen');
  return `${plural(crates, 'Kiste', 'Kisten')}${rest ? ` + ${rest} Fl.` : ''}`;
}

/* --------------------- Daten laden (nach allen Helfern!) --------------------- */

let state = loadState();
if (loadedNeedsSave) saveState();
const meta = loadMeta();
if (!meta.firstUse) { meta.firstUse = Date.now(); saveMeta(); }

/* ---------------------------- DOM ---------------------------- */

const $ = (sel) => document.querySelector(sel);
const els = {
  navbar: $('#navbar'),
  navLeading: $('#navLeading'),
  navTitle: $('#navTitle'),
  navTrailing: $('#navTrailing'),
  largeTitle: $('#largeTitle'),
  largeSubtitle: $('#largeSubtitle'),
  content: $('#content'),
  tabbar: $('#tabbar'),
  sheetRoot: $('#sheet-root'),
  sheet: $('#sheet-root .sheet'),
  sheetTitle: $('#sheetTitle'),
  sheetBody: $('#sheetBody'),
  menuRoot: $('#menu-root'),
  hud: $('#hud'),
};

els.tabbar.innerHTML = Object.entries(TABS).map(([key, label]) =>
  `<button type="button" role="tab" data-tab="${key}">${icon(TAB_ICONS[key])}<span>${label}</span><i class="badge" hidden></i></button>`).join('');

/* Fokus über Neuzeichnen hinweg erhalten (Tastatur & Screenreader) */
function focusSelector(el) {
  if (!el || el === document.body || !Object.keys(el.dataset || {}).length) return null;
  return Object.entries(el.dataset)
    .map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(v)}"]`)
    .join('');
}
function restoreFocus(sel) {
  if (!sel) return;
  let el = document.querySelector(sel);
  if (el?.disabled && el.dataset.act) {
    el = document.querySelector(`[data-act="inc"][data-p="${el.dataset.p}"][data-d="${el.dataset.d}"]`);
  }
  if (el && !el.disabled) el.focus({ preventScroll: true });
}

/* ---------------------------- Rendering --------------------------- */

function render() {
  const sel = focusSelector(document.activeElement);
  renderChrome();
  renderMain();
  renderSheet();
  restoreFocus(sel);
  onScroll();
}

function renderChrome() {
  const title = TABS[ui.tab];
  let sub = monthLabel();
  if (ui.tab === 'einstellungen') sub = '';
  if (ui.tab === 'statistik') sub = String(ui.statsYear);

  document.title = `${title} – Zirbenstube`;
  els.largeTitle.textContent = title;
  els.largeSubtitle.textContent = sub;
  els.largeSubtitle.hidden = !sub;
  els.navTitle.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;

  const pair = (prev, next, label) => `<div class="glass glass-group" role="group" aria-label="${label}">
      <button type="button" data-nav="${prev}" aria-label="Zurück">${icon('chevronLeft')}</button>
      <button type="button" data-nav="${next}" aria-label="Weiter">${icon('chevronRight')}</button>
    </div>`;

  if (ui.tab === 'einstellungen') {
    els.navLeading.innerHTML = '';
    els.navTrailing.innerHTML = ui.editing
      ? '<button type="button" class="glass-btn text prominent" data-nav="edit">Fertig</button>'
      : '<button type="button" class="glass glass-btn text" data-nav="edit">Bearbeiten</button>';
  } else if (ui.tab === 'statistik') {
    els.navLeading.innerHTML = ui.statsYear === new Date().getFullYear()
      ? '' : '<button type="button" class="glass glass-btn text" data-nav="thisYear">Heute</button>';
    els.navTrailing.innerHTML = pair('prevYear', 'nextYear', 'Jahr wechseln');
  } else {
    els.navLeading.innerHTML = isThisMonth()
      ? '' : '<button type="button" class="glass glass-btn text" data-nav="today">Heute</button>';
    els.navTrailing.innerHTML = pair('prev', 'next', 'Monat wechseln');
  }

  const low = state.drinks.some((d) => !d.archived && isLow(d));
  els.tabbar.querySelectorAll('[data-tab]').forEach((b) => {
    b.setAttribute('aria-selected', b.dataset.tab === ui.tab);
    const badge = b.querySelector('.badge');
    badge.hidden = !(b.dataset.tab === 'bestand' && low);
    b.setAttribute('aria-label', `${TABS[b.dataset.tab]}${!badge.hidden ? ', Bestand niedrig' : ''}`);
  });
}

function renderMain() {
  const views = {
    liste: renderListe, abrechnung: renderAbrechnung, bestand: renderBestand,
    statistik: renderStatistik, einstellungen: renderEinstellungen,
  };
  els.content.innerHTML = views[ui.tab]();
}

function emptyState(title = 'Noch nichts angelegt', text = 'Lege in den Einstellungen Personen und Getränke an.', button = true) {
  return `<div class="empty">
    <div class="empty-icon">${icon('mug')}</div>
    <h2>${title}</h2>
    <p>${text}</p>
    ${button ? '<button type="button" class="glass-btn text prominent" data-goto="einstellungen">Zu den Einstellungen</button>' : ''}
  </div>`;
}

/* ----- Sicherungs-Erinnerung ----- */

function needsBackup() {
  if (!Object.keys(state.months).length) return false;
  const ref = meta.lastBackup || meta.firstUse;
  return Date.now() - ref > 30 * DAY && Date.now() > (meta.snoozeUntil || 0);
}
function backupAgeText() {
  if (!meta.lastBackup) return 'Noch keine Sicherung erstellt';
  const days = Math.floor((Date.now() - meta.lastBackup) / DAY);
  if (days === 0) return 'Letzte Sicherung: heute';
  if (days === 1) return 'Letzte Sicherung: gestern';
  return `Letzte Sicherung: vor ${days} Tagen`;
}
function backupBanner() {
  if (!needsBackup()) return '';
  return `<section class="list-section banner-section"><div class="list banner">
      <div class="row">
        <span class="tile" style="--c:${COLORS.orange}">${icon('download')}</span>
        <div class="row-text"><span class="title">Zeit für eine Sicherung</span><span class="subtitle">${backupAgeText()}</span></div>
      </div>
      <div class="banner-actions">
        <button type="button" class="glass-btn text small" data-action="snooze">Später</button>
        <button type="button" class="glass-btn text small prominent" data-action="export">Jetzt sichern</button>
      </div>
    </div></section>`;
}

/* ----- Strichliste ----- */

function renderListe() {
  const wc = weekCount(ui.year, ui.month);
  if (ui.week > wc) ui.week = wc;
  const tw = todayWeek();
  let seg = `<div class="seg-wrap"><div class="segmented" role="radiogroup" aria-label="Woche"
    style="--n:${wc};--i:${ui.week - 1}"><span class="seg-thumb" aria-hidden="true"></span>`;
  for (let w = 1; w <= wc; w++) {
    const on = w === ui.week;
    seg += `<button type="button" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}"
      data-week="${w}" class="${w === tw ? 'today' : ''}">Woche ${w}</button>`;
  }
  seg += '</div></div>';
  return `${backupBanner()}${seg}<div id="weekBody">${renderWeekBody()}</div>`;
}

function renderWeekBody() {
  const m = getMonth();
  const persons = visiblePersons(m);
  const drinks = visibleDrinks(m);
  const caption = `${weekRange(ui.year, ui.month, ui.week)} ${MONTH_NAMES[ui.month]}`
    + (ui.week === todayWeek() ? ' · diese Woche' : '');
  let h = `<p class="seg-caption">${caption}</p>`;
  if (!persons.length || !drinks.length) return h + emptyState();

  h += '<div class="sections-grid">';
  for (const p of persons) {
    const wk = personWeekAmount(m, ui.week, p.id, drinks);
    h += `<section class="list-section">
      <h2 class="section-header prominent person-head" data-menu="week:${p.id}" tabindex="0"
        aria-label="${esc(p.name)}, gedrückt halten für Optionen">${avatar(p)}<span>${esc(p.name)}</span>${p.archived ? '<small>ausgeblendet</small>' : ''}</h2>
      <div class="list tiles">`;
    for (const d of drinks) {
      const n = count(m, ui.week, p.id, d.id);
      h += `<div class="row tall">
        ${drinkTile(d)}
        <div class="row-text"><span class="title">${esc(d.name)}</span><span class="subtitle">${eur.format(priceOf(m, d))}</span></div>
        <span class="count${n ? '' : ' zero'}" data-count="${p.id}-${d.id}" aria-hidden="true">${n}</span>
        <div class="stepper" role="group" aria-label="${esc(d.name)} für ${esc(p.name)}: ${n}">
          <button type="button" data-act="dec" data-p="${p.id}" data-d="${d.id}" ${n === 0 ? 'disabled' : ''}
            aria-label="Ein ${esc(d.name)} weniger für ${esc(p.name)}">${icon('minus')}</button>
          <span class="stepper-div" aria-hidden="true"></span>
          <button type="button" data-act="inc" data-p="${p.id}" data-d="${d.id}"
            aria-label="Ein ${esc(d.name)} mehr für ${esc(p.name)}">${icon('plus')}</button>
        </div>
      </div>`;
    }
    h += `</div>
      <p class="section-footer">Woche ${ui.week}: ${eur.format(wk)} · Monat: ${eur.format(charge(monthKey(), p.id))}</p>
    </section>`;
  }
  return h + '</div>';
}

function selectWeek(w) {
  if (w === ui.week) return;
  ui.week = w;
  const seg = els.content.querySelector('.segmented');
  if (!seg) return render();
  seg.style.setProperty('--i', w - 1);
  seg.querySelectorAll('[data-week]').forEach((b) => {
    const on = Number(b.dataset.week) === w;
    b.setAttribute('aria-checked', on);
    b.tabIndex = on ? 0 : -1;
  });
  $('#weekBody').innerHTML = renderWeekBody();
}

function tally(pid, did, delta) {
  const cur = count(getMonth(), ui.week, pid, did);
  const next = Math.max(0, cur + delta);
  if (next === cur) return;
  checkpoint();
  setCount(ui.week, pid, did, next);
  const p = findPerson(pid);
  const d = findDrink(did);
  const wasLow = isLow(d);
  if (typeof d.stock === 'number') d.stock -= next - cur;
  saveState();
  if (delta > 0) navigator.vibrate?.(10);

  const sel = focusSelector(document.activeElement);
  $('#weekBody').innerHTML = renderWeekBody();
  renderChrome();
  restoreFocus(sel);
  document.querySelector(`[data-count="${pid}-${did}"]`)?.classList.add(delta > 0 ? 'bump-up' : 'bump-down');

  if (!wasLow && isLow(d)) {
    hud(`${d.name}: nur noch ${plural(d.stock, 'Flasche', 'Flaschen')}`, 'warn', { undo: true });
  } else {
    hud(`${p.name} · ${delta > 0 ? '+1' : '−1'} ${d.name}`, delta > 0 ? 'plus' : 'minus', { undo: true });
  }
}

/* ----- Abrechnung ----- */

function billPersons(key) {
  return state.persons.filter((p) => !p.archived || charge(key, p.id) > 0 || account(p.id, key).due > 0);
}

function renderAbrechnung() {
  const key = monthKey();
  const m = getMonth();
  const persons = billPersons(key);
  const drinks = visibleDrinks(m);
  if (!persons.length || !drinks.length) return emptyState();

  const acc = Object.fromEntries(persons.map((p) => [p.id, account(p.id, key)]));
  const sum = (f) => round2(persons.reduce((s, p) => s + acc[p.id][f], 0));
  const total = sum('charge');
  const covered = sum('covered');
  const open = sum('openThis');
  const carry = sum('carry');
  const totalQty = drinks.reduce((s, d) => s + drinkMonthQty(m, d.id), 0);
  const pct = total > 0 ? (covered / total) * 100 : 0;

  let h = `${backupBanner()}<div class="narrow">
    <section class="list-section"><div class="list summary">
      <span class="caption">Gesamt im ${MONTH_NAMES[ui.month]} · ${plural(totalQty, 'Getränk', 'Getränke')}</span>
      <div class="big">${eur.format(total)}</div>
      <div class="gauge" role="progressbar" aria-label="Anteil bezahlt" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(pct)}"><span style="width:${pct}%"></span></div>
      <div class="legend">
        <span><i class="dot green"></i>Bezahlt <b>${eur.format(covered)}</b></span>
        <span><i class="dot orange"></i>Offen <b>${eur.format(open)}</b></span>
      </div>
      ${carry > 0 ? `<p class="carry-note">${icon('warn')}Dazu ${eur.format(carry)} offen aus Vormonaten</p>` : ''}
    </div></section>

    <section class="list-section">
      <h2 class="section-header">Personen</h2>
      <div class="list avatars">`;

  for (const p of persons) {
    const a = acc[p.id];
    const items = drinks.map((d) => [monthTotal(m, p.id, d.id), d.name]).filter(([n]) => n > 0)
      .map(([n, name]) => `${n}× ${name}`).join(' · ') || 'Keine Getränke';
    let status = '';
    let cls = 'muted';
    if (!a.relevant) {
      status = a.credit > 0 ? `Guthaben ${eur.format(a.credit)}` : '';
      cls = 'green-text';
    } else if (a.settled) {
      status = a.credit > 0 ? `Bezahlt · Guthaben ${eur.format(a.credit)}` : 'Bezahlt';
      cls = 'green-text';
    } else {
      if (a.carry > 0 && a.openThis > 0) status = `Offen ${eur.format(a.due)} (inkl. Vormonate)`;
      else if (a.carry > 0) status = `Offen ${eur.format(a.due)} aus Vormonaten`;
      else status = `Offen ${eur.format(a.due)}`;
      cls = 'orange-text';
    }
    const label = a.settled ? `${p.name}: Zahlung entfernen` : `${p.name} hat ${eur.format(a.due)} bezahlt`;
    h += `<div class="row bill-row" data-menu="bill:${p.id}">
        <button type="button" class="row-main" data-open-person="${p.id}" aria-label="${esc(p.name)}: Details und Zahlungen">
          ${avatar(p)}
          <span class="row-text"><span class="title">${esc(p.name)}</span><span class="subtitle">${esc(items)}</span>
            ${status ? `<span class="status ${cls}">${status}</span>` : ''}</span>
          <span class="amount">${eur.format(a.charge)}</span>
        </button>
        <button type="button" class="check" data-paid="${p.id}" aria-pressed="${a.relevant && a.settled}"
          ${a.relevant ? '' : 'disabled'} aria-label="${esc(label)}">${icon('check')}</button>
      </div>`;
  }

  h += `</div><p class="section-footer">Kreis antippen, wenn jemand bezahlt hat. Antippen der Person zeigt Details, Teilzahlungen und Guthaben. Gedrückt halten für mehr.</p></section>

    <section class="list-section">
      <h2 class="section-header">Getränke</h2>
      <div class="list tiles">`;
  for (const d of drinks) {
    const price = priceOf(m, d);
    const qty = drinkMonthQty(m, d.id);
    h += `<div class="row">
        ${drinkTile(d)}
        <div class="row-text"><span class="title">${esc(d.name)}</span><span class="subtitle">${qty} Stk. × ${eur.format(price)}</span></div>
        <span class="amount">${eur.format(qty * price)}</span>
      </div>`;
  }

  h += `</div></section>
    <section class="list-section">
      <h2 class="section-header">Wochen</h2>
      <div class="list">`;
  for (let w = 1; w <= weekCount(ui.year, ui.month); w++) {
    let wQty = 0;
    let wAmt = 0;
    for (const p of persons) {
      for (const d of drinks) {
        const n = count(m, w, p.id, d.id);
        wQty += n;
        wAmt += n * priceOf(m, d);
      }
    }
    h += `<div class="row-group"><details data-week-details="${w}" ${ui.openWeeks.has(w) ? 'open' : ''}>
        <summary class="row">
          <div class="row-text"><span class="title">Woche ${w}</span><span class="subtitle">${weekRange(ui.year, ui.month, w)} ${MONTH_NAMES[ui.month]}</span></div>
          <span class="trailing">${wQty} Stk. · ${eur.format(round2(wAmt))}</span>
          ${icon('chevronRight', 'chev')}
        </summary>
        <div class="week-table-wrap"><table class="mini">
          <thead><tr><th scope="col"><span class="sr-only">Getränk</span></th>${persons.map((p) => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead>
          <tbody>${drinks.map((d) => `<tr><th scope="row">${esc(d.emoji)} ${esc(d.name)}</th>${persons.map((p) => {
            const n = count(m, w, p.id, d.id);
            return `<td class="${n ? '' : 'zero'}">${n || '–'}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </details></div>`;
  }

  h += `</div></section>
    <section class="list-section">
      <h2 class="section-header">Teilen &amp; Drucken</h2>
      <div class="list icons">
        <button type="button" class="row action" data-action="share-all"><span class="row-icon">${icon('share')}</span>Abrechnung an alle senden</button>
        <button type="button" class="row action" data-print="filled"><span class="row-icon">${icon('printer')}</span>Abrechnung drucken</button>
        <button type="button" class="row action" data-print="blank"><span class="row-icon">${icon('doc')}</span>Leere Vorlage drucken</button>
        <button type="button" class="row action" data-action="csv"><span class="row-icon">${icon('download')}</span>Als CSV exportieren</button>
      </div>
      ${state.settings.paypal ? '' : '<p class="section-footer">Tipp: In den Einstellungen deinen PayPal.me-Namen eintragen – dann enthält jede Abrechnung einen Bezahl-Link.</p>'}
    </section>
    <section class="list-section">
      <div class="list icons">
        <button type="button" class="row action destructive" data-action="clear-month"><span class="row-icon">${icon('trash')}</span>${monthLabel()} leeren</button>
      </div>
    </section>
  </div>`;
  return h;
}

/* ----- Bestand ----- */

function renderBestand() {
  const drinks = state.drinks.filter((d) => !d.archived);
  if (!drinks.length) return emptyState();
  const key = monthKey();
  const m = getMonth();

  let h = `<div class="narrow">
    <section class="list-section">
      <h2 class="section-header">Lager</h2>
      <div class="list tiles">`;
  for (const d of drinks) {
    const tracked = typeof d.stock === 'number';
    const low = isLow(d);
    const sub = tracked
      ? `${stockText(d)}${d.minStock != null ? ` · Warnung ab ${d.minStock}` : ''}`
      : 'Bestand nicht erfasst';
    h += `<div class="row stock-row" data-menu="stock:${d.id}">
        <button type="button" class="row-main" data-open-stock="${d.id}" aria-label="${esc(d.name)}: ${tracked ? `${d.stock} Flaschen` : 'Bestand nicht erfasst'}${low ? ', niedrig' : ''}">
          ${drinkTile(d)}
          <span class="row-text"><span class="title">${esc(d.name)}</span><span class="subtitle ${low ? 'red-text' : ''}">${low ? `${icon('warn', 'inline')} ` : ''}${sub}</span></span>
          ${tracked ? `<span class="stock-num${low ? ' low' : ''}">${d.stock}</span>` : icon('chevronRight', 'chev')}
        </button>
        ${tracked ? `<button type="button" class="pill-btn" data-buy="${d.id}" aria-label="Eine Kiste ${esc(d.name)} eingekauft">${icon('plus')}Kiste</button>` : ''}
      </div>`;
  }
  h += `</div><p class="section-footer">Jeder Strich zieht eine Flasche vom Bestand ab. „+ Kiste“ bucht einen Einkauf. Gedrückt halten für mehr.</p></section>`;

  // Kasse
  let revenue = 0;
  let cost = 0;
  let profit = 0;
  const missing = [];
  for (const d of state.drinks) {
    const qty = drinkMonthQty(m, d.id);
    if (!qty) continue;
    const price = priceOf(m, d);
    revenue += qty * price;
    const uc = unitCost(d);
    if (uc == null) missing.push(d.name);
    else {
      cost += qty * uc;
      profit += qty * (price - uc);
    }
  }
  const monthPurchases = state.purchases.filter((x) => {
    const dt = new Date(x.date);
    return keyOf(dt.getFullYear(), dt.getMonth()) === key;
  });
  const spent = monthPurchases.reduce((s, x) => s + (x.cost || 0), 0);
  const crates = monthPurchases.reduce((s, x) => s + (x.crates || 0), 0);

  h += `<section class="list-section">
      <h2 class="section-header">Kasse · ${monthLabel()}</h2>
      <div class="list">
        <div class="row"><div class="row-text"><span class="title">Einnahmen</span><span class="subtitle">Alle Striche im Monat</span></div><span class="amount">${eur.format(round2(revenue))}</span></div>
        <div class="row"><div class="row-text"><span class="title">Wareneinsatz</span><span class="subtitle">Einkaufspreis der getrunkenen Flaschen</span></div><span class="amount">${cost ? `− ${eur.format(round2(cost))}` : '–'}</span></div>
        <div class="row"><div class="row-text"><span class="title"><b>Gewinn</b></span></div><span class="amount ${profit > 0 ? 'green-text' : ''}"><b>${cost ? eur.format(round2(profit)) : '–'}</b></span></div>
        <div class="row"><div class="row-text"><span class="title">Eingekauft</span><span class="subtitle">${plural(crates, 'Kiste', 'Kisten')} im ${MONTH_NAMES[ui.month]}</span></div><span class="amount">${spent ? eur.format(round2(spent)) : '–'}</span></div>
      </div>
      <p class="section-footer">${missing.length
        ? `Ohne ${esc(missing.join(', '))} – dort fehlt noch der Kistenpreis (Getränk antippen).`
        : 'Gewinn = Verkaufspreis minus Einkaufspreis je Flasche.'}</p>
    </section>`;

  const recent = [...state.purchases].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  if (recent.length) {
    h += `<section class="list-section">
        <h2 class="section-header">Letzte Einkäufe</h2>
        <div class="list tiles">${recent.map((x) => {
          const d = findDrink(x.drinkId) || { name: 'Gelöscht', emoji: '❔', color: 'gray' };
          return `<div class="row" data-menu="purchase:${x.id}" tabindex="0" aria-label="${esc(d.name)}, ${fmtDate(x.date)}, gedrückt halten zum Löschen">
              ${drinkTile(d)}
              <div class="row-text"><span class="title">${x.crates ? plural(x.crates, 'Kiste', 'Kisten') : plural(x.bottles, 'Flasche', 'Flaschen')} ${esc(d.name)}</span>
                <span class="subtitle">${fmtDate(x.date)} · ${x.bottles} Fl.</span></div>
              <span class="trailing">${x.cost != null ? eur.format(x.cost) : ''}</span>
            </div>`;
        }).join('')}</div>
        <p class="section-footer">Gedrückt halten, um einen Einkauf zu löschen.</p>
      </section>`;
  }
  return h + '</div>';
}

function buyCrate(did, crates = 1) {
  const d = findDrink(did);
  if (!d) return;
  checkpoint();
  const bottles = d.perCrate * crates;
  d.stock = (typeof d.stock === 'number' ? d.stock : 0) + bottles;
  state.purchases.push({
    id: uid(), drinkId: d.id, date: new Date().toISOString(), crates, bottles,
    cost: d.crateCost != null ? round2(d.crateCost * crates) : null,
  });
  saveState();
  render();
  hud(`+1 Kiste ${d.name} · ${d.stock} Fl.`, 'cart', { undo: true });
}

/* ----- Statistik ----- */

function yearData(y) {
  const months = [];
  for (let i = 0; i < 12; i++) {
    const key = keyOf(y, i);
    const m = state.months[key];
    let qty = 0;
    for (const p of state.persons) for (const d of state.drinks) qty += monthTotal(m, p.id, d.id);
    months.push({ i, key, m, qty, revenue: round2(state.persons.reduce((s, p) => s + charge(key, p.id), 0)) });
  }
  return months;
}

function niceMax(v) {
  if (v <= 0) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * pow >= v) return f * pow;
  return 10 * pow;
}

function renderStatistik() {
  const y = ui.statsYear;
  const months = yearData(y);
  const totalRev = round2(months.reduce((s, x) => s + x.revenue, 0));
  const totalQty = months.reduce((s, x) => s + x.qty, 0);
  if (!totalQty) {
    return emptyState(`Keine Daten für ${y}`, 'Sobald Striche gemacht werden, erscheinen hier Umsatz, Ranglisten und der Bierkönig.', false);
  }
  const active = months.filter((x) => x.qty > 0);
  const avg = totalRev / active.length;

  const drinkStats = state.drinks.map((d) => {
    let qty = 0;
    let rev = 0;
    for (const x of months) {
      const q = drinkMonthQty(x.m, d.id);
      qty += q;
      rev += q * priceOf(x.m, d);
    }
    return { d, qty, rev: round2(rev) };
  }).filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty);

  const personStats = state.persons.map((p) => {
    let qty = 0;
    let rev = 0;
    for (const x of months) {
      for (const d of state.drinks) qty += monthTotal(x.m, p.id, d.id);
      rev += charge(x.key, p.id);
    }
    return { p, qty, rev: round2(rev) };
  }).filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty);

  // König des Monats
  const kingIdx = y === ui.year && months[ui.month].qty > 0 ? ui.month : active[active.length - 1].i;
  const km = months[kingIdx].m;
  const beer = state.drinks.find((d) => /bier/i.test(d.name) && drinkMonthQty(km, d.id) > 0);
  const scoreOf = (p) => (beer ? monthTotal(km, p.id, beer.id) : state.drinks.reduce((s, d) => s + monthTotal(km, p.id, d.id), 0));
  const ranked = state.persons.map((p) => ({ p, n: scoreOf(p) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const kings = ranked.filter((x) => x.n === ranked[0].n);
  const kingTitle = beer ? 'Bierkönig' : 'Durstigster Gast';
  const kingName = kings.map((x) => x.p.name).join(' & ');

  const max = niceMax(Math.max(...months.map((x) => x.revenue)));
  const maxIdx = months.reduce((bi, x, i) => (x.revenue > months[bi].revenue ? i : bi), 0);
  const selIdx = y === ui.year ? ui.month : -1;
  const fav = drinkStats[0];

  let h = `<div class="narrow">
    <div class="stat-grid">
      <div class="stat-tile"><span class="label">Umsatz ${y}</span><span class="value">${eur.format(totalRev)}</span></div>
      <div class="stat-tile"><span class="label">Getränke</span><span class="value">${totalQty.toLocaleString('de-DE')}</span></div>
      <div class="stat-tile"><span class="label">Ø pro Monat</span><span class="value">${eur.format(round2(avg))}</span></div>
      <div class="stat-tile"><span class="label">Beliebtestes Getränk</span><span class="value">${esc(fav.d.emoji)} ${esc(fav.d.name)}</span></div>
    </div>

    <section class="list-section">
      <div class="list king">
        <div class="king-avatars">${kings.slice(0, 3).map((x) => `<span class="crowned">${avatar(x.p, 'lg')}<span class="crown" aria-hidden="true">👑</span></span>`).join('')}</div>
        <div class="king-text">
          <span class="caption">${kingTitle} im ${MONTH_NAMES[kingIdx]}</span>
          <span class="king-name">${esc(kingName)}</span>
          <span class="subtitle">${kings[0].n}× ${beer ? esc(beer.name) : 'Getränke'}${kings.length > 1 ? ' – Gleichstand!' : ''}</span>
        </div>
      </div>
    </section>

    <section class="list-section">
      <h2 class="section-header">Umsatz pro Monat</h2>
      <div class="list chart-card">
        <div class="col-chart" role="group" aria-label="Umsatz pro Monat ${y}">
          <div class="chart-grid" aria-hidden="true">
            <span style="bottom:100%"><i>${eur0.format(max)}</i></span>
            <span style="bottom:50%"><i>${eur0.format(max / 2)}</i></span>
            <span style="bottom:0"><i>0 €</i></span>
          </div>
          <div class="cols">
            ${months.map((x) => {
              const hgt = x.revenue > 0 ? Math.max(1.5, (x.revenue / max) * 100) : 0;
              const tip = `${MONTH_NAMES[x.i]}: ${eur.format(x.revenue)} · ${plural(x.qty, 'Getränk', 'Getränke')}`;
              return `<button type="button" class="col${x.i === selIdx ? ' sel' : ''}" data-col="${x.i}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">
                <span class="bar-area"><span class="bar" style="height:${hgt}%"></span>
                  ${x.i === maxIdx && x.revenue > 0 ? `<span class="val" style="bottom:${hgt}%">${eur0.format(x.revenue)}</span>` : ''}</span>
                <span class="lbl">${MONTH_SHORT[x.i].slice(0, 1)}<span class="lbl-rest">${MONTH_SHORT[x.i].slice(1)}</span></span>
              </button>`;
            }).join('')}
          </div>
          <div class="tip" role="status" hidden></div>
        </div>
      </div>
      <p class="section-footer">Balken antippen für Details.</p>
    </section>

    <section class="list-section">
      <h2 class="section-header">Getränke ${y}</h2>
      <div class="list tiles">${drinkStats.map((x) => `<div class="row">
          ${drinkTile(x.d)}
          <div class="row-text"><span class="title">${esc(x.d.name)}</span>
            <span class="hbar" aria-hidden="true"><span style="width:${(x.qty / drinkStats[0].qty) * 100}%"></span></span></div>
          <span class="trailing stacked"><b>${x.qty} Stk.</b><small>${eur.format(x.rev)}</small></span>
        </div>`).join('')}</div>
    </section>

    <section class="list-section">
      <h2 class="section-header">Rangliste ${y}</h2>
      <div class="list avatars">${personStats.map((x, i) => `<div class="row">
          <span class="rank${i > 2 ? ' num' : ''}" aria-label="Platz ${i + 1}">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
          ${avatar(x.p)}
          <div class="row-text"><span class="title">${esc(x.p.name)}</span>
            <span class="hbar" aria-hidden="true"><span style="width:${(x.qty / personStats[0].qty) * 100}%"></span></span></div>
          <span class="trailing stacked"><b>${x.qty} Stk.</b><small>${eur.format(x.rev)}</small></span>
        </div>`).join('')}</div>
    </section>
  </div>`;
  return h;
}

function showTip(col) {
  const chart = col.closest('.col-chart');
  const tip = chart.querySelector('.tip');
  tip.textContent = col.dataset.tip;
  tip.hidden = false;
  const cr = chart.getBoundingClientRect();
  const r = col.getBoundingClientRect();
  const half = tip.offsetWidth / 2;
  const x = r.left + r.width / 2 - cr.left;
  tip.style.left = `${Math.min(Math.max(x, half), cr.width - half)}px`;
  chart.querySelectorAll('.col.hover').forEach((c) => c.classList.remove('hover'));
  col.classList.add('hover');
}
function hideTip(chart) {
  chart.querySelector('.tip').hidden = true;
  chart.querySelectorAll('.col.hover').forEach((c) => c.classList.remove('hover'));
}

/* ----- Einstellungen ----- */

function renderEinstellungen() {
  const e = ui.editing;
  const persons = state.persons.filter((p) => !p.archived);
  const archived = state.persons.filter((p) => p.archived);
  const drinks = state.drinks.filter((d) => !d.archived);
  const archivedDrinks = state.drinks.filter((d) => d.archived);

  const row = (kind, x, inner) => {
    if (e) {
      return `<div class="row edit" data-id="${x.id}">
        <button type="button" class="del-circle" data-remove-${kind}="${x.id}" aria-label="${esc(x.name)} entfernen">${icon('minus')}</button>
        ${inner}
        <span class="drag-handle" role="button" tabindex="0" data-handle="${x.id}"
          aria-label="${esc(x.name)} verschieben, Pfeiltasten hoch und runter">${icon('grip')}</span>
      </div>`;
    }
    return `<div class="row-swipe" data-id="${x.id}">
        <div class="swipe-actions"><button type="button" class="swipe-del" data-remove-${kind}="${x.id}" tabindex="-1">${icon('trash')}<span>Löschen</span></button></div>
        <div class="row edit swipe-content" data-menu="${kind}:${x.id}">${inner}</div>
      </div>`;
  };
  const restoreSection = (kind, items, title) => (items.length ? `
    <section class="list-section">
      <h2 class="section-header">${title}</h2>
      <div class="list">${items.map((x) => `<div class="row">
        <div class="row-text"><span class="title muted">${esc(x.name)}</span></div>
        <button type="button" class="text-btn" data-restore-${kind}="${x.id}">Einblenden</button>
      </div>`).join('')}</div>
      <p class="section-footer">Diese Einträge kommen in alten Abrechnungen noch vor.</p>
    </section>` : '');

  return `<div class="narrow">
    <section class="list-section">
      <h2 class="section-header">Personen</h2>
      <div class="list avatars" data-list="person">
        ${persons.map((p) => row('person', p, `
          <button type="button" class="avatar-btn" data-style-person="${p.id}" aria-label="Farbe von ${esc(p.name)} ändern">${avatar(p)}</button>
          <input class="field" value="${esc(p.name)}" data-rename-person="${p.id}" aria-label="Name" maxlength="40" autocomplete="off">`)).join('')}
        <form class="row edit add" data-form="person">
          <button class="add-circle" aria-label="Person hinzufügen">${icon('plus')}</button>
          <input class="field" name="name" placeholder="Person hinzufügen" maxlength="40" autocomplete="off" required aria-label="Name der neuen Person">
        </form>
      </div>
      <p class="section-footer">${e ? 'Zum Sortieren am Griff ziehen.' : 'Namen antippen zum Ändern, Kreis für die Farbe. Nach links wischen zum Löschen, „Bearbeiten“ zum Sortieren.'}</p>
    </section>
    ${restoreSection('person', archived, 'Ausgeblendete Personen')}

    <section class="list-section">
      <h2 class="section-header">Getränke &amp; Preise</h2>
      <div class="list tiles" data-list="drink">
        ${drinks.map((d) => row('drink', d, `
          <button type="button" class="tile-btn" data-style-drink="${d.id}" aria-label="Symbol und Farbe von ${esc(d.name)} ändern">${drinkTile(d)}</button>
          <input class="field" value="${esc(d.name)}" data-rename-drink="${d.id}" aria-label="Getränk" maxlength="30" autocomplete="off">
          <span class="price-wrap"><input class="field price" value="${num.format(d.price)}" inputmode="decimal"
            data-price-drink="${d.id}" aria-label="Preis von ${esc(d.name)} in Euro" autocomplete="off"><span class="unit">€</span></span>`)).join('')}
        <form class="row edit add" data-form="drink">
          <button class="add-circle" aria-label="Getränk hinzufügen">${icon('plus')}</button>
          <input class="field" name="name" placeholder="Getränk hinzufügen" maxlength="30" autocomplete="off" required aria-label="Name des neuen Getränks">
          <span class="price-wrap"><input class="field price" name="price" placeholder="0,00" inputmode="decimal" required
            autocomplete="off" aria-label="Preis in Euro"><span class="unit">€</span></span>
        </form>
      </div>
      <p class="section-footer">Symbol antippen zum Ändern. Neue Preise gelten ab ${monthLabel()}, frühere Monate behalten ihre Preise.</p>
    </section>
    ${restoreSection('drink', archivedDrinks, 'Ausgeblendete Getränke')}

    <section class="list-section">
      <h2 class="section-header">Bezahlen</h2>
      <div class="list">
        <label class="row edit"><span class="field-label">PayPal.me/</span>
          <input class="field" data-setting="paypal" value="${esc(state.settings.paypal)}" placeholder="deinname"
            autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40"></label>
        <label class="row edit"><span class="field-label">Zusatz</span>
          <input class="field" data-setting="note" value="${esc(state.settings.note)}" placeholder="z. B. IBAN oder „bar an Leo“"
            autocomplete="off" maxlength="120"></label>
      </div>
      <p class="section-footer">Steht in jeder verschickten Abrechnung, mit Bezahl-Link über den offenen Betrag.</p>
    </section>

    <section class="list-section">
      <h2 class="section-header">Datensicherung</h2>
      <div class="list icons">
        <button type="button" class="row action" data-action="export"><span class="row-icon">${icon('share')}</span>Sicherung teilen / speichern</button>
        <button type="button" class="row action" data-action="import"><span class="row-icon">${icon('upload')}</span>Sicherung importieren</button>
      </div>
      <p class="section-footer">${backupAgeText()}. Alle Einträge liegen nur auf diesem Gerät – über „Teilen“ kannst du die Sicherung z. B. in iCloud Drive oder einen Chat legen. Nach 30 Tagen erinnert die App dich.</p>
    </section>

    <section class="list-section">
      <div class="list icons">
        <button type="button" class="row action destructive" data-action="reset"><span class="row-icon">${icon('trash')}</span>Alle Daten zurücksetzen</button>
      </div>
    </section>
  </div>`;
}

/* ------------------------------ Sheets ----------------------------- */

let sheetPrevFocus = null;

function openSheet(kind, id, focus) {
  ui.sheet = { kind, id, focus };
  renderSheet();
}
function closeSheet() {
  ui.sheet = null;
  renderSheet();
}

function renderSheet() {
  const root = els.sheetRoot;
  if (!ui.sheet) {
    if (!root.hidden) {
      root.classList.remove('open');
      document.body.classList.remove('sheet-open');
      setTimeout(() => { if (!ui.sheet) root.hidden = true; }, 320);
      if (sheetPrevFocus && document.contains(sheetPrevFocus)) sheetPrevFocus.focus({ preventScroll: true });
      sheetPrevFocus = null;
    }
    return;
  }
  const content = sheetContent(ui.sheet);
  if (!content) {
    ui.sheet = null;
    renderSheet();
    return;
  }
  els.sheetTitle.textContent = content.title;
  els.sheetBody.innerHTML = content.body;
  if (root.hidden || !root.classList.contains('open')) {
    if (root.hidden) sheetPrevFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(() => {
      root.classList.add('open');
      const f = ui.sheet?.focus && els.sheetBody.querySelector(ui.sheet.focus);
      if (f) f.focus(); else els.sheet.focus({ preventScroll: true });
      if (ui.sheet) ui.sheet.focus = null;
    });
  }
}

function sheetContent({ kind, id }) {
  if (kind === 'person') return personSheet(id);
  if (kind === 'stock') return stockSheet(id);
  if (kind === 'styleDrink') return styleDrinkSheet(id);
  if (kind === 'stylePerson') return stylePersonSheet(id);
  return null;
}

function personSheet(pid) {
  const p = findPerson(pid);
  if (!p) return null;
  const key = monthKey();
  const m = getMonth();
  const a = account(pid, key);
  const drinks = state.drinks.filter((d) => monthTotal(m, pid, d.id) > 0);
  const payments = state.payments.filter((x) => x.pid === pid)
    .sort((x, y) => (y.date || y.month).localeCompare(x.date || x.month));

  let total;
  if (a.due > 0) total = `<span class="title"><b>Noch offen</b></span><span class="amount orange-text"><b>${eur.format(a.due)}</b></span>`;
  else if (a.credit > 0) total = `<span class="title"><b>Guthaben</b></span><span class="amount green-text"><b>${eur.format(a.credit)}</b></span>`;
  else total = `<span class="title"><b>Alles bezahlt</b></span><span class="amount green-text">${icon('check')}</span>`;

  return {
    title: p.name,
    body: `<div class="sheet-hero">${avatar(p, 'xl')}<span class="subtitle">${monthLabel()}</span></div>
      <section class="list-section">
        <div class="list">
          <div class="row"><span class="row-text"><span class="title">Getränke im ${MONTH_NAMES[ui.month]}</span></span><span class="amount">${eur.format(a.charge)}</span></div>
          ${a.carry > 0 ? `<div class="row"><span class="row-text"><span class="title">Offen aus Vormonaten</span></span><span class="amount">+ ${eur.format(a.carry)}</span></div>` : ''}
          ${a.covered > 0 ? `<div class="row"><span class="row-text"><span class="title">Schon bezahlt</span></span><span class="amount green-text">− ${eur.format(a.covered)}</span></div>` : ''}
          <div class="row total-row">${total}</div>
          ${a.credit > 0 && a.due > 0 ? `<div class="row"><span class="row-text"><span class="title">Guthaben</span></span><span class="amount green-text">${eur.format(a.credit)}</span></div>` : ''}
        </div>
      </section>
      ${drinks.length ? `<section class="list-section">
        <h2 class="section-header">Getränke</h2>
        <div class="list tiles">${drinks.map((d) => {
          const n = monthTotal(m, pid, d.id);
          return `<div class="row">${drinkTile(d)}<span class="row-text"><span class="title">${n}× ${esc(d.name)}</span>
            <span class="subtitle">je ${eur.format(priceOf(m, d))}</span></span><span class="amount">${eur.format(n * priceOf(m, d))}</span></div>`;
        }).join('')}</div>
      </section>` : ''}
      <section class="list-section">
        <h2 class="section-header">Zahlung erfassen</h2>
        <form class="list" data-form="payment" data-pid="${pid}">
          <div class="row edit">
            <span class="field-label">Betrag</span>
            <span class="price-wrap grow"><input class="field price wide" name="amount" inputmode="decimal" autocomplete="off"
              value="${a.due > 0 ? num.format(a.due) : ''}" placeholder="0,00" aria-label="Betrag in Euro" required><span class="unit">€</span></span>
            <button class="glass-btn text small prominent">Buchen</button>
          </div>
        </form>
        <p class="section-footer">Teilzahlungen sind möglich. Wer mehr zahlt, bekommt Guthaben für die nächsten Monate.</p>
      </section>
      <section class="list-section">
        <div class="list icons">
          <button type="button" class="row action" data-share-person="${pid}"><span class="row-icon">${icon('share')}</span>Abrechnung an ${esc(p.name)} senden</button>
        </div>
      </section>
      <section class="list-section">
        <h2 class="section-header">Zahlungen</h2>
        <div class="list">${payments.length ? payments.slice(0, 24).map((x) => `<div class="row">
            <span class="row-text"><span class="title">${eur.format(x.amount)}</span>
              <span class="subtitle">${x.date ? `${fmtDate(x.date)} · ` : ''}gebucht im ${monthLabelOf(x.month)}</span></span>
            <button type="button" class="icon-btn danger" data-del-payment="${x.id}" aria-label="Zahlung über ${eur.format(x.amount)} löschen">${icon('trash')}</button>
          </div>`).join('') : '<div class="row"><span class="row-text"><span class="subtitle">Noch keine Zahlungen</span></span></div>'}</div>
      </section>`,
  };
}

function stockSheet(did) {
  const d = findDrink(did);
  if (!d) return null;
  const tracked = typeof d.stock === 'number';
  const uc = unitCost(d);
  return {
    title: d.name,
    body: `<div class="sheet-hero">${drinkTile(d, 'xl')}<span class="subtitle">${tracked ? stockText(d) : 'Bestand nicht erfasst'}</span></div>
      <section class="list-section">
        <div class="list">
          <label class="row edit"><span class="row-text"><span class="title">Bestand erfassen</span></span>
            <input type="checkbox" class="switch" data-stock-track="${d.id}" ${tracked ? 'checked' : ''}></label>
          ${tracked ? `<label class="row edit"><span class="row-text"><span class="title">Flaschen im Lager</span></span>
            <input class="field num" data-stock-set="${d.id}" value="${d.stock}" inputmode="numeric" autocomplete="off" aria-label="Flaschen im Lager"></label>` : ''}
        </div>
        ${tracked ? '' : '<p class="section-footer">Schalte den Bestand ein und trage ein, wie viele Flaschen gerade da sind. Danach zieht jeder Strich eine Flasche ab.</p>'}
      </section>
      ${tracked ? `<section class="list-section">
        <div class="list icons">
          <button type="button" class="row action" data-buy="${d.id}"><span class="row-icon">${icon('cart')}</span>Kiste eingekauft (+${d.perCrate} Fl.)</button>
        </div>
      </section>` : ''}
      <section class="list-section">
        <h2 class="section-header">Kiste</h2>
        <div class="list">
          <label class="row edit"><span class="row-text"><span class="title">Flaschen pro Kiste</span></span>
            <input class="field num" data-per-crate="${d.id}" value="${d.perCrate}" inputmode="numeric" autocomplete="off" aria-label="Flaschen pro Kiste"></label>
          <label class="row edit"><span class="row-text"><span class="title">Preis pro Kiste</span></span>
            <span class="price-wrap"><input class="field price" data-crate-cost="${d.id}" value="${d.crateCost != null ? num.format(d.crateCost) : ''}"
              placeholder="0,00" inputmode="decimal" autocomplete="off" aria-label="Einkaufspreis pro Kiste in Euro"><span class="unit">€</span></span></label>
          <label class="row edit"><span class="row-text"><span class="title">Warnen ab</span></span>
            <span class="price-wrap"><input class="field num" data-min-stock="${d.id}" value="${d.minStock ?? ''}" placeholder="–"
              inputmode="numeric" autocomplete="off" aria-label="Warnen ab Flaschen"><span class="unit">Fl.</span></span></label>
        </div>
        <p class="section-footer" id="costHint">${uc != null
          ? `Einkauf je Flasche ${eur.format(uc)} · Verkauf ${eur.format(d.price)} · Gewinn je Flasche ${eur.format(d.price - uc)}`
          : 'Mit Kistenpreis zeigt der Bestand auch den Gewinn.'}</p>
      </section>`,
  };
}

function swatches(attr, selected) {
  return `<div class="swatches" role="radiogroup" aria-label="Farbe">${Object.entries(COLORS).map(([name, hex]) =>
    `<button type="button" class="swatch${name === selected ? ' on' : ''}" style="--c:${hex}" ${attr}="${name}"
      role="radio" aria-checked="${name === selected}" aria-label="${COLOR_LABELS[name]}"></button>`).join('')}</div>`;
}

function styleDrinkSheet(did) {
  const d = findDrink(did);
  if (!d) return null;
  return {
    title: d.name,
    body: `<div class="sheet-hero">${drinkTile(d, 'xl')}</div>
      <section class="list-section">
        <h2 class="section-header">Symbol</h2>
        <div class="list pad"><div class="emoji-grid" role="radiogroup" aria-label="Symbol">${DRINK_EMOJIS.map((e) =>
          `<button type="button" class="emoji${e === d.emoji ? ' on' : ''}" data-set-emoji="${e}" role="radio" aria-checked="${e === d.emoji}">${e}</button>`).join('')}</div></div>
      </section>
      <section class="list-section">
        <h2 class="section-header">Farbe</h2>
        <div class="list pad">${swatches('data-set-color', d.color)}</div>
      </section>`,
  };
}

function stylePersonSheet(pid) {
  const p = findPerson(pid);
  if (!p) return null;
  return {
    title: p.name,
    body: `<div class="sheet-hero">${avatar(p, 'xl')}</div>
      <section class="list-section">
        <h2 class="section-header">Farbe</h2>
        <div class="list pad">${swatches('data-set-color', p.color)}</div>
      </section>`,
  };
}

/* --------------------------- Kontextmenü --------------------------- */

function menuItems(spec) {
  const [kind, id] = spec.split(':');
  if (kind === 'week') {
    const p = findPerson(id);
    return p && [
      { label: 'Abrechnung senden', icon: 'share', run: () => sharePerson(id) },
      { label: `Woche ${ui.week} leeren`, icon: 'trash', role: 'destructive', run: () => clearPersonWeek(id) },
    ];
  }
  if (kind === 'bill') {
    const a = account(id);
    return [
      { label: 'Details & Zahlungen', icon: 'person', run: () => openSheet('person', id) },
      { label: 'Teilzahlung erfassen', icon: 'wallet', run: () => openSheet('person', id, '[name="amount"]') },
      { label: 'Abrechnung senden', icon: 'share', run: () => sharePerson(id) },
      a.relevant && !a.settled && { label: `Bezahlt (${eur.format(a.due)})`, icon: 'check', run: () => togglePaid(id) },
    ].filter(Boolean);
  }
  if (kind === 'person') {
    return [
      { label: 'Farbe ändern', icon: 'palette', run: () => openSheet('stylePerson', id) },
      { label: 'Entfernen', icon: 'trash', role: 'destructive', run: () => removeItem('person', id) },
    ];
  }
  if (kind === 'drink') {
    return [
      { label: 'Symbol & Farbe', icon: 'palette', run: () => openSheet('styleDrink', id) },
      { label: 'Bestand & Kiste', icon: 'box', run: () => openSheet('stock', id) },
      { label: 'Entfernen', icon: 'trash', role: 'destructive', run: () => removeItem('drink', id) },
    ];
  }
  if (kind === 'stock') {
    const d = findDrink(id);
    return d && [
      { label: `Kiste eingekauft (+${d.perCrate})`, icon: 'cart', run: () => buyCrate(id) },
      { label: 'Bestand bearbeiten', icon: 'pencil', run: () => openSheet('stock', id) },
      { label: 'Symbol & Farbe', icon: 'palette', run: () => openSheet('styleDrink', id) },
    ];
  }
  if (kind === 'purchase') {
    return [{ label: 'Einkauf löschen', icon: 'trash', role: 'destructive', run: () => deletePurchase(id) }];
  }
  return null;
}

let menuItemsOpen = null;
function openMenu(target, x, y) {
  const items = menuItems(target.dataset.menu);
  if (!items?.length || menuItemsOpen) return;
  menuItemsOpen = items;
  const prevFocus = document.activeElement;
  const root = els.menuRoot;
  root.innerHTML = `<div class="menu-backdrop"></div><div class="menu glass" role="menu">${items.map((it, i) =>
    `<button type="button" role="menuitem" class="menu-item ${it.role || ''}" data-i="${i}"><span>${esc(it.label)}</span>${icon(it.icon)}</button>`).join('')}</div>`;
  root.hidden = false;
  target.classList.add('menu-target');
  const menu = root.querySelector('.menu');
  const r = target.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let top = r.bottom + 8;
  if (top + mh > innerHeight - 96) top = Math.max(64, r.top - mh - 8);
  const left = Math.min(Math.max(12, (x || r.left + 20) - 12), innerWidth - mw - 12);
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.style.transformOrigin = top > r.top ? 'top left' : 'bottom left';
  const buttons = [...root.querySelectorAll('.menu-item')];
  buttons[0].focus({ preventScroll: true });

  const close = (run) => {
    document.removeEventListener('keydown', onKey, true);
    root.hidden = true;
    root.innerHTML = '';
    target.classList.remove('menu-target');
    menuItemsOpen = null;
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    if (run) run();
  };
  const onKey = (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  root.querySelector('.menu-backdrop').addEventListener('click', () => close());
  buttons.forEach((b) => b.addEventListener('click', () => close(items[b.dataset.i].run)));
}

/* Gedrückt halten → Menü (iOS feuert kein contextmenu) */
let lp = null;
let suppressClick = false;
const cancelLp = () => { if (lp) clearTimeout(lp.timer); lp = null; };
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('[data-menu]');
  if (!t || e.button !== 0 || e.target.closest('input, .drag-handle')) return;
  cancelLp();
  lp = {
    t, x: e.clientX, y: e.clientY,
    timer: setTimeout(() => {
      if (!lp) return;
      lp.fired = true;
      navigator.vibrate?.(15);
      openMenu(t, lp.x, lp.y);
    }, 480),
  };
});
document.addEventListener('pointermove', (e) => {
  if (lp && !lp.fired && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) cancelLp();
}, { passive: true });
document.addEventListener('pointerup', () => {
  if (lp?.fired) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 450);
  }
  cancelLp();
});
document.addEventListener('pointercancel', cancelLp);
document.addEventListener('click', (e) => {
  if (suppressClick) {
    e.preventDefault();
    e.stopPropagation();
    suppressClick = false;
  }
}, true);
document.addEventListener('contextmenu', (e) => {
  const t = e.target.closest('[data-menu]');
  if (!t || e.target.closest('input')) return;
  e.preventDefault();
  if (lp?.fired) return;
  cancelLp();
  openMenu(t, e.clientX || 0, e.clientY || 0);
});

/* ------------------------------ Druck ----------------------------- */

function printSheet(blank) {
  const key = monthKey();
  const m = blank ? undefined : getMonth();
  const persons = blank ? state.persons.filter((p) => !p.archived) : billPersons(key);
  const drinks = blank ? state.drinks.filter((d) => !d.archived) : visibleDrinks(m);
  const weeks = blank ? 5 : weekCount(ui.year, ui.month);
  const acc = blank ? {} : Object.fromEntries(persons.map((p) => [p.id, account(p.id, key)]));
  const anyCarry = !blank && persons.some((p) => acc[p.id].carry > 0);
  const head = (label) => `<tr><th>${label}</th>${persons.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr>`;

  let html = `<h1>Zirbenstube – Getränkeliste</h1>
    <p class="meta">Monat: <span class="line">${blank ? '' : MONTH_NAMES[ui.month]}</span>
      Jahr: <span class="line short">${blank ? '' : ui.year}</span></p>`;

  for (let w = 1; w <= weeks; w++) {
    html += `<table class="sheet"><thead>${head(`Woche ${w}${blank ? '' : ` <small>${weekRange(ui.year, ui.month, w)}</small>`}`)}</thead><tbody>
      ${drinks.map((d) => `<tr><th>${esc(d.name)}</th>${persons.map((p) => {
        const n = blank ? 0 : count(m, w, p.id, d.id);
        return `<td>${n || ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
  }

  html += `<h2>Monatsabrechnung – Stückzahl je Getränk${blank ? ' eintragen und Betrag berechnen' : ''}</h2>
    <table class="sheet bill-print"><thead>${head('Getränk / Preis')}</thead><tbody>
    ${drinks.map((d) => {
      const price = blank ? d.price : priceOf(m, d);
      return `<tr><th>${esc(d.name)} / ${eur.format(price)}</th>${persons.map((p) => {
        if (blank) return '<td>____ Stk. / ____ €</td>';
        const n = monthTotal(m, p.id, d.id);
        return `<td>${n} Stk. / ${eur.format(n * price)}</td>`;
      }).join('')}</tr>`;
    }).join('')}
    <tr class="total"><th>Gesamtbetrag (€)</th>${persons.map((p) =>
      `<td>${blank ? '________ €' : eur.format(acc[p.id].charge)}${!blank && acc[p.id].relevant && acc[p.id].settled ? ' ✓' : ''}</td>`).join('')}</tr>
    ${anyCarry ? `<tr><th>Aus Vormonaten</th>${persons.map((p) => `<td>${acc[p.id].carry ? eur.format(acc[p.id].carry) : ''}</td>`).join('')}</tr>
      <tr class="total"><th>Zu zahlen</th>${persons.map((p) => `<td>${eur.format(acc[p.id].due)}</td>`).join('')}</tr>` : ''}
    </tbody></table>
    <p class="hint">${blank
      ? 'Je Person: Stückzahlen aus allen Wochen addieren, mit dem jeweiligen Preis multiplizieren und unten die Beträge summieren.'
      : `Erstellt am ${new Date().toLocaleDateString('de-DE')} · ✓ = bezahlt`}</p>`;

  $('#print').innerHTML = html;
  window.print();
}

/* ---------------------------- Teilen & Export ------------------------------ */

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareText(text, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    hud('Text kopiert – in WhatsApp einfügen', 'doc');
  } catch {
    iosAlert({ title, message: text, actions: [{ label: 'OK', role: 'default', value: true }] });
  }
}

const paypalLink = (amount) => {
  const name = state.settings.paypal.trim().replace(/^.*paypal\.me\//i, '').replace(/\/.*$/, '');
  if (!name) return '';
  return `https://paypal.me/${encodeURIComponent(name)}${amount > 0 ? `/${amount.toFixed(2)}EUR` : ''}`;
};

function personText(pid) {
  const p = findPerson(pid);
  const key = monthKey();
  const m = getMonth();
  const a = account(pid, key);
  const lines = [`🍺 Zirbenstube – ${monthLabel()}`, '', `Hallo ${p.name},`, `deine Getränke im ${MONTH_NAMES[ui.month]}:`];
  const drinks = state.drinks.filter((d) => monthTotal(m, pid, d.id) > 0);
  if (drinks.length) {
    for (const d of drinks) {
      const n = monthTotal(m, pid, d.id);
      lines.push(`${d.emoji} ${n}× ${d.name} à ${eur.format(priceOf(m, d))} = ${eur.format(n * priceOf(m, d))}`);
    }
  } else {
    lines.push('keine');
  }
  lines.push(`Summe ${MONTH_NAMES[ui.month]}: ${eur.format(a.charge)}`);
  if (a.carry > 0) lines.push(`+ offen aus Vormonaten: ${eur.format(a.carry)}`);
  if (a.covered > 0) lines.push(`− schon bezahlt: ${eur.format(a.covered)}`);
  lines.push('');
  if (a.due > 0) {
    lines.push(`👉 Zu zahlen: ${eur.format(a.due)}`);
    const link = paypalLink(a.due);
    if (link) lines.push(`PayPal: ${link}`);
  } else {
    lines.push(a.credit > 0 ? `✅ Alles bezahlt – Guthaben: ${eur.format(a.credit)}` : '✅ Alles bezahlt – danke!');
  }
  if (state.settings.note.trim()) lines.push(state.settings.note.trim());
  lines.push('', 'Prost! 🍻');
  return lines.join('\n');
}

function allText() {
  const key = monthKey();
  const persons = billPersons(key).filter((p) => account(p.id, key).relevant);
  const lines = [`🍺 Zirbenstube – Abrechnung ${monthLabel()}`, ''];
  let total = 0;
  for (const p of persons) {
    const a = account(p.id, key);
    total += a.charge;
    lines.push(a.settled
      ? `✅ ${p.name}: ${eur.format(a.charge)} – bezahlt`
      : `• ${p.name}: ${eur.format(a.charge)}${a.carry > 0 ? ` (+ ${eur.format(a.carry)} Vormonate)` : ''} → offen ${eur.format(a.due)}`);
  }
  lines.push('', `Gesamt: ${eur.format(round2(total))}`);
  const link = paypalLink(0);
  if (link) lines.push(`PayPal: ${link}`);
  if (state.settings.note.trim()) lines.push(state.settings.note.trim());
  lines.push('', 'Prost! 🍻');
  return lines.join('\n');
}

const sharePerson = (pid) => shareText(personText(pid), `Abrechnung ${monthLabel()}`);

function exportCsv() {
  const key = monthKey();
  const m = getMonth();
  const persons = billPersons(key);
  const drinks = visibleDrinks(m);
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['Person', ...drinks.map((d) => `${d.name} (Stk.)`), 'Betrag Monat (€)', 'Aus Vormonaten (€)', 'Zu zahlen (€)', 'Status']];
  for (const p of persons) {
    const a = account(p.id, key);
    rows.push([p.name, ...drinks.map((d) => monthTotal(m, p.id, d.id)),
      num.format(a.charge), num.format(a.carry), num.format(a.due), a.settled ? 'bezahlt' : 'offen']);
  }
  rows.push(['Preis (€)', ...drinks.map((d) => num.format(priceOf(m, d))), '', '', '', '']);
  const csv = '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
  download(`zirbenstube-abrechnung-${key}.csv`, csv, 'text/csv;charset=utf-8');
  hud('CSV exportiert', 'check');
}

function markBackup() {
  meta.lastBackup = Date.now();
  meta.snoozeUntil = 0;
  saveMeta();
  render();
  hud('Sicherung erstellt', 'check');
}

async function exportJson() {
  const date = new Date().toISOString().slice(0, 10);
  const name = `zirbenstube-sicherung-${date}.json`;
  const json = JSON.stringify(state, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Zirbenstube Sicherung' });
      markBackup();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  download(name, json, 'application/json');
  markBackup();
}

/* ------------------------ HUD & Dialoge -------------------------- */

let hudTimer;
function hud(msg, ic, { undo: withUndo = false } = {}) {
  const h = els.hud;
  h.innerHTML = `${ic ? icon(ic) : ''}<span class="hud-text">${esc(msg)}</span>${withUndo && undoSnap
    ? '<button type="button" class="hud-action" data-undo>Rückgängig</button>' : ''}`;
  h.classList.toggle('actionable', withUndo && !!undoSnap);
  h.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => h.classList.remove('show', 'actionable'), withUndo ? 4500 : 2200);
}
els.hud.addEventListener('click', (e) => {
  if (e.target.closest('[data-undo]')) {
    els.hud.classList.remove('show', 'actionable');
    undo();
  }
});

/** Alert im iOS-Stil. Gibt den `value` der gewählten Aktion zurück. */
function iosAlert({ title, message = '', actions }) {
  return new Promise((resolve) => {
    const root = $('#alert-root');
    const prevFocus = document.activeElement;
    root.innerHTML = `<div class="alert-backdrop">
      <div class="alert" role="alertdialog" aria-modal="true" aria-labelledby="alertTitle" ${message ? 'aria-describedby="alertMsg"' : ''}>
        <h2 id="alertTitle">${esc(title)}</h2>
        ${message ? `<p id="alertMsg">${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="alert-actions">${actions.map((a, i) =>
          `<button type="button" class="alert-btn ${a.role || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>
      </div></div>`;
    root.classList.add('open');
    const buttons = [...root.querySelectorAll('.alert-btn')];

    const close = (value) => {
      document.removeEventListener('keydown', onKey, true);
      root.classList.remove('open');
      root.innerHTML = '';
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(actions.find((a) => a.role === 'cancel')?.value ?? null);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const i = buttons.indexOf(document.activeElement);
        buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
    };
    buttons.forEach((b) => b.addEventListener('click', () => close(actions[b.dataset.i].value)));
    document.addEventListener('keydown', onKey, true);
    (root.querySelector('.alert-btn.cancel') || buttons[0]).focus();
  });
}

const confirmAlert = (title, message, label, role = 'destructive') => iosAlert({
  title,
  message,
  actions: [{ label: 'Abbrechen', role: 'cancel', value: false }, { label, role, value: true }],
});

/* ---------------------------- Aktionen ---------------------------- */

function setTab(tab) {
  ui.tab = tab;
  ui.editing = false;
  history.replaceState(null, '', `#${tab}`);
  render();
  window.scrollTo(0, 0);
}

function shiftMonth(delta) {
  const d = new Date(ui.year, ui.month + delta, 1);
  ui.year = d.getFullYear();
  ui.month = d.getMonth();
  ui.week = todayWeek() || 1;
  ui.openWeeks.clear();
  render();
}

function goToday() {
  const d = new Date();
  ui.year = d.getFullYear();
  ui.month = d.getMonth();
  ui.week = Math.ceil(d.getDate() / 7);
  ui.openWeeks.clear();
  render();
}

function moveItem(list, id, dir) {
  const active = list.filter((x) => !x.archived);
  const i = active.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= active.length) return;
  const a = list.indexOf(active[i]);
  const b = list.indexOf(active[j]);
  [list[a], list[b]] = [list[b], list[a]];
}

async function removeItem(kind, id) {
  const list = kind === 'person' ? state.persons : state.drinks;
  const item = list.find((x) => x.id === id);
  if (!item) return;
  const used = usedAnywhere(kind, id);
  const ok = await confirmAlert(`„${item.name}“ entfernen?`, used
    ? `${kind === 'person' ? 'Die Person' : 'Das Getränk'} hat schon Einträge und wird nur ausgeblendet. Alte Abrechnungen bleiben erhalten.`
    : 'Du kannst das direkt danach noch rückgängig machen.', 'Entfernen');
  closeSwipe();
  if (!ok) return;
  checkpoint();
  if (used) item.archived = true;
  else list.splice(list.indexOf(item), 1);
  saveState();
  render();
  hud(`${item.name} entfernt`, 'trash', { undo: true });
}

function togglePaid(pid) {
  const key = monthKey();
  const a = account(pid, key);
  const p = findPerson(pid);
  if (!a.relevant) return;
  if (!a.settled) {
    checkpoint();
    state.payments.push({ id: uid(), pid, month: key, amount: a.due, date: new Date().toISOString() });
    saveState();
    render();
    hud(`${p.name} hat ${eur.format(a.due)} bezahlt`, 'check', { undo: true });
  } else if (a.paidThis > 0) {
    checkpoint();
    state.payments = state.payments.filter((x) => !(x.pid === pid && x.month === key));
    saveState();
    render();
    hud(`Zahlung von ${p.name} entfernt`, 'undo', { undo: true });
  } else {
    openSheet('person', pid);
  }
}

function clearPersonWeek(pid) {
  const m = getMonth();
  const counts = m?.counts?.[ui.week]?.[pid];
  if (!counts) {
    hud('In dieser Woche ist nichts eingetragen');
    return;
  }
  checkpoint();
  restock({ [pid]: counts });
  delete m.counts[ui.week][pid];
  if (!Object.keys(m.counts[ui.week]).length) delete m.counts[ui.week];
  saveState();
  render();
  hud(`Woche ${ui.week} von ${findPerson(pid).name} geleert`, 'trash', { undo: true });
}

function deletePurchase(id) {
  const x = state.purchases.find((y) => y.id === id);
  if (!x) return;
  checkpoint();
  const d = findDrink(x.drinkId);
  if (d && typeof d.stock === 'number') d.stock -= x.bottles;
  state.purchases = state.purchases.filter((y) => y.id !== id);
  saveState();
  render();
  hud('Einkauf gelöscht', 'trash', { undo: true });
}

/* ------------------------- Wischen zum Löschen ------------------------- */

let sw = null;
let openSwipeEl = null;
function closeSwipe() {
  if (!openSwipeEl) return;
  openSwipeEl.style.transform = '';
  openSwipeEl.parentElement?.classList.remove('swiped');
  openSwipeEl = null;
}
document.addEventListener('pointerdown', (e) => {
  if (openSwipeEl && !e.target.closest('.row-swipe')?.contains(openSwipeEl)) closeSwipe();
  const c = e.target.closest('.swipe-content');
  if (!c || ui.editing) return;
  sw = { c, x: e.clientX, y: e.clientY, base: c === openSwipeEl ? -96 : 0, off: 0, active: false };
});
document.addEventListener('pointermove', (e) => {
  if (!sw) return;
  const dx = e.clientX - sw.x;
  const dy = e.clientY - sw.y;
  if (!sw.active) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      sw.active = true;
      sw.c.classList.add('swiping');
      cancelLp();
      document.activeElement?.blur?.();
    } else if (Math.abs(dy) > 10) {
      sw = null;
      return;
    } else return;
  }
  sw.off = Math.min(0, Math.max(-160, sw.base + dx));
  sw.c.style.transform = `translateX(${sw.off}px)`;
});
const endSwipe = () => {
  if (!sw) return;
  const { c, active, off } = sw;
  sw = null;
  if (!active) return;
  c.classList.remove('swiping');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 300);
  if (off < -48) {
    c.style.transform = 'translateX(-96px)';
    c.parentElement.classList.add('swiped');
    openSwipeEl = c;
  } else {
    c.style.transform = '';
    c.parentElement.classList.remove('swiped');
    if (openSwipeEl === c) openSwipeEl = null;
  }
};
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', endSwipe);

/* ---------------------------- Events ------------------------------ */

els.navbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  const a = b.dataset.nav;
  if (a === 'prev') shiftMonth(-1);
  else if (a === 'next') shiftMonth(1);
  else if (a === 'today') goToday();
  else if (a === 'prevYear' || a === 'nextYear' || a === 'thisYear') {
    ui.statsYear = a === 'thisYear' ? new Date().getFullYear() : ui.statsYear + (a === 'prevYear' ? -1 : 1);
    render();
  } else if (a === 'edit') {
    ui.editing = !ui.editing;
    closeSwipe();
    render();
  }
});

els.tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && b.dataset.tab !== ui.tab) setTab(b.dataset.tab);
});

async function onClick(e) {
  if (e.target.closest('[data-close-sheet]')) {
    closeSheet();
    return;
  }
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  const ds = t.dataset;

  if (ds.act) tally(ds.p, ds.d, ds.act === 'inc' ? 1 : -1);
  else if (ds.week) selectWeek(Number(ds.week));
  else if (ds.col) showTip(t);
  else if (ds.goto) setTab(ds.goto);
  else if (ds.paid) togglePaid(ds.paid);
  else if (ds.openPerson) openSheet('person', ds.openPerson);
  else if (ds.openStock) openSheet('stock', ds.openStock);
  else if (ds.stylePerson) openSheet('stylePerson', ds.stylePerson);
  else if (ds.styleDrink) openSheet('styleDrink', ds.styleDrink);
  else if (ds.sharePerson) sharePerson(ds.sharePerson);
  else if (ds.buy) buyCrate(ds.buy);
  else if (ds.print) printSheet(ds.print === 'blank');
  else if (ds.removePerson) removeItem('person', ds.removePerson);
  else if (ds.removeDrink) removeItem('drink', ds.removeDrink);
  else if (ds.restorePerson || ds.restoreDrink) {
    checkpoint();
    const item = ds.restorePerson ? findPerson(ds.restorePerson) : findDrink(ds.restoreDrink);
    if (item) item.archived = false;
    saveState();
    render();
  } else if (ds.delPayment) {
    checkpoint();
    state.payments = state.payments.filter((x) => x.id !== ds.delPayment);
    saveState();
    render();
    hud('Zahlung gelöscht', 'trash', { undo: true });
  } else if (ds.setEmoji) {
    const d = findDrink(ui.sheet?.id);
    if (d) { d.emoji = ds.setEmoji; saveState(); render(); }
  } else if (ds.setColor) {
    const item = ui.sheet?.kind === 'stylePerson' ? findPerson(ui.sheet.id) : findDrink(ui.sheet?.id);
    if (item) { item.color = ds.setColor; saveState(); render(); }
  } else if (ds.action === 'csv') exportCsv();
  else if (ds.action === 'share-all') shareText(allText(), `Abrechnung ${monthLabel()}`);
  else if (ds.action === 'export') exportJson();
  else if (ds.action === 'snooze') {
    meta.snoozeUntil = Date.now() + 7 * DAY;
    saveMeta();
    render();
    hud('Erinnerung in 7 Tagen');
  } else if (ds.action === 'import') $('#importFile').click();
  else if (ds.action === 'clear-month') {
    if (await confirmAlert(`${monthLabel()} leeren?`, 'Alle Striche dieses Monats werden gelöscht. Zahlungen bleiben erhalten.', 'Leeren')) {
      checkpoint();
      for (const week of Object.values(getMonth()?.counts || {})) restock(week);
      delete state.months[monthKey()];
      saveState();
      render();
      hud('Monat geleert', 'trash', { undo: true });
    }
  } else if (ds.action === 'reset') {
    if (await confirmAlert('Alle Daten zurücksetzen?', 'Alle Monate, Zahlungen, Personen und Getränke werden gelöscht und die Standardliste wird wiederhergestellt.', 'Zurücksetzen')) {
      checkpoint();
      state = defaultState();
      saveState();
      ui.editing = false;
      render();
      hud('Zurückgesetzt', 'check', { undo: true });
    }
  }
}

function onKeydown(e) {
  const seg = e.target.closest('.segmented');
  if (seg && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const wc = seg.querySelectorAll('[data-week]').length;
    let w = ui.week + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    if (e.key === 'Home') w = 1;
    if (e.key === 'End') w = wc;
    w = Math.min(wc, Math.max(1, w));
    selectWeek(w);
    seg.querySelector(`[data-week="${w}"]`).focus();
    return;
  }
  const h = e.target.closest('.drag-handle');
  if (h && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const list = h.closest('[data-list]').dataset.list === 'person' ? state.persons : state.drinks;
    moveItem(list, h.dataset.handle, e.key === 'ArrowUp' ? -1 : 1);
    saveState();
    render();
  }
}

function onChange(e) {
  const t = e.target;
  const ds = t.dataset;
  if (ds.renamePerson || ds.renameDrink) {
    const item = ds.renamePerson ? findPerson(ds.renamePerson) : findDrink(ds.renameDrink);
    const name = t.value.trim();
    if (item && name) {
      item.name = name;
      saveState();
      const btn = t.parentElement.querySelector('.avatar-btn');
      if (btn) btn.innerHTML = avatar(item);
    } else if (item) t.value = item.name;
  } else if (ds.priceDrink) {
    const d = findDrink(ds.priceDrink);
    if (!d) return;
    const price = parsePrice(t.value);
    if (price === null) {
      t.value = num.format(d.price);
      hud('Ungültiger Preis', 'warn');
      return;
    }
    d.price = price;
    const m = getMonth();
    if (m) m.prices[d.id] = price;
    t.value = num.format(price);
    saveState();
    hud(`${d.name}: ${eur.format(price)}`, 'check');
  } else if (ds.setting) {
    state.settings[ds.setting] = t.value.trim();
    saveState();
  } else if (ds.stockTrack) {
    const d = findDrink(ds.stockTrack);
    checkpoint();
    d.stock = t.checked ? 0 : null;
    saveState();
    render();
    if (t.checked) els.sheetBody.querySelector('[data-stock-set]')?.select();
  } else if (ds.stockSet || ds.perCrate || ds.minStock) {
    const d = findDrink(ds.stockSet || ds.perCrate || ds.minStock);
    const v = parseCount(t.value);
    if (ds.minStock && t.value.trim() === '') d.minStock = null;
    else if (v === null || (ds.perCrate && v < 1) || (ds.minStock && v < 0)) {
      t.value = ds.stockSet ? d.stock : ds.perCrate ? d.perCrate : (d.minStock ?? '');
      hud('Bitte eine ganze Zahl eingeben', 'warn');
      return;
    } else if (ds.stockSet) { checkpoint(); d.stock = v; }
    else if (ds.perCrate) d.perCrate = v;
    else d.minStock = v;
    saveState();
    renderChrome();
    renderMain();
    els.sheetBody.querySelector('.sheet-hero .subtitle').textContent = stockText(d);
  } else if (ds.crateCost) {
    const d = findDrink(ds.crateCost);
    if (t.value.trim() === '') d.crateCost = null;
    else {
      const v = parsePrice(t.value);
      if (v === null) {
        t.value = d.crateCost != null ? num.format(d.crateCost) : '';
        hud('Ungültiger Preis', 'warn');
        return;
      }
      d.crateCost = v;
      t.value = num.format(v);
    }
    saveState();
    renderMain();
    const uc = unitCost(d);
    $('#costHint').textContent = uc != null
      ? `Einkauf je Flasche ${eur.format(uc)} · Verkauf ${eur.format(d.price)} · Gewinn je Flasche ${eur.format(d.price - uc)}`
      : 'Mit Kistenpreis zeigt der Bestand auch den Gewinn.';
  }
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'payment') {
    const amount = parsePrice(f.elements.amount.value);
    if (!amount) {
      hud('Bitte einen Betrag eingeben', 'warn');
      return;
    }
    const p = findPerson(f.dataset.pid);
    checkpoint();
    state.payments.push({ id: uid(), pid: p.id, month: monthKey(), amount, date: new Date().toISOString() });
    saveState();
    render();
    hud(`${eur.format(amount)} von ${p.name} gebucht`, 'check', { undo: true });
    return;
  }
  const name = f.elements.name.value.trim();
  if (!name) return;
  checkpoint();
  if (f.dataset.form === 'person') {
    state.persons.push({ id: uid(), name, color: PERSON_CYCLE[state.persons.length % PERSON_CYCLE.length], archived: false });
  } else if (f.dataset.form === 'drink') {
    const price = parsePrice(f.elements.price.value);
    if (price === null) {
      hud('Ungültiger Preis', 'warn');
      return;
    }
    const g = guessDrink(name, state.drinks.length);
    const d = {
      id: uid(), name, price, emoji: g.emoji, color: g.color, archived: false,
      stock: null, perCrate: /bier/i.test(name) ? 20 : 12, crateCost: null, minStock: null,
    };
    state.drinks.push(d);
    const m = getMonth();
    if (m) m.prices[d.id] = price;
  }
  saveState();
  render();
  els.content.querySelector(`form[data-form="${f.dataset.form}"] input[name="name"]`)?.focus();
  hud(`${name} hinzugefügt`, 'check', { undo: true });
}

for (const el of [els.content, els.sheetRoot]) {
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKeydown);
  el.addEventListener('change', onChange);
  el.addEventListener('submit', onSubmit);
}

// Diagramm-Tooltip
els.content.addEventListener('pointerover', (e) => {
  const col = e.target.closest('.col');
  if (col && e.pointerType === 'mouse') showTip(col);
});
els.content.addEventListener('pointerout', (e) => {
  const chart = e.target.closest('.col-chart');
  if (chart && e.pointerType === 'mouse' && !chart.contains(e.relatedTarget)) hideTip(chart);
});
els.content.addEventListener('focusin', (e) => {
  const col = e.target.closest('.col');
  if (col) showTip(col);
});
els.content.addEventListener('focusout', (e) => {
  const chart = e.target.closest('.col-chart');
  if (chart && !chart.contains(e.relatedTarget)) hideTip(chart);
});

// Sheet per Escape schließen
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet && !menuItemsOpen && !$('#alert-root').classList.contains('open')) closeSheet();
});

/* Sortieren per Ziehen am Griff */
let drag = null;
els.content.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('.drag-handle');
  if (!h) return;
  e.preventDefault();
  const row = h.closest('.row');
  drag = { row, list: row.parentElement };
  row.classList.add('dragging');
  h.setPointerCapture(e.pointerId);
});
els.content.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const others = [...drag.list.querySelectorAll(':scope > .row[data-id]')].filter((r) => r !== drag.row);
  const before = others.find((r) => {
    const b = r.getBoundingClientRect();
    return e.clientY < b.top + b.height / 2;
  });
  if (before) {
    if (drag.row.nextElementSibling !== before) drag.list.insertBefore(drag.row, before);
  } else {
    const last = others[others.length - 1];
    if (last && last.nextElementSibling !== drag.row) last.after(drag.row);
  }
});
const endDrag = () => {
  if (!drag) return;
  const list = drag.list.dataset.list === 'person' ? state.persons : state.drinks;
  const order = [...drag.list.querySelectorAll(':scope > .row[data-id]')].map((r) => r.dataset.id);
  const active = order.map((id) => list.find((x) => x.id === id)).filter(Boolean);
  const rest = list.filter((x) => !order.includes(x.id));
  list.splice(0, list.length, ...active, ...rest);
  drag = null;
  saveState();
  render();
};
els.content.addEventListener('pointerup', endDrag);
els.content.addEventListener('pointercancel', endDrag);

// Zustand der aufgeklappten Wochen merken (toggle bubbelt nicht → capture)
els.content.addEventListener('toggle', (e) => {
  const w = Number(e.target.dataset?.weekDetails);
  if (!w) return;
  if (e.target.open) ui.openWeeks.add(w); else ui.openWeeks.delete(w);
}, true);

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!isValidState(data)) throw new Error('invalid');
  } catch {
    hud('Datei ist keine gültige Sicherung', 'warn');
    return;
  }
  if (!(await confirmAlert('Sicherung importieren?', 'Die aktuellen Daten auf diesem Gerät werden ersetzt.', 'Ersetzen'))) return;
  checkpoint();
  state = migrate(data);
  saveState();
  render();
  hud('Sicherung importiert', 'check', { undo: true });
});

// Große Titel: beim Scrollen kleinen Titel + Weichzeichner einblenden
function onScroll() {
  const y = window.scrollY;
  els.navbar.classList.toggle('scrolled', y > 4);
  els.navbar.classList.toggle('show-title', y > 44);
}
window.addEventListener('scroll', onScroll, { passive: true });

// Mehrere offene Tabs synchron halten
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    state = loadState();
    render();
  }
});

window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1);
  if (TABS[tab] && tab !== ui.tab) setTab(tab);
});

/* ------------------------------ Start ----------------------------- */

render();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
