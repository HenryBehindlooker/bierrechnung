'use strict';

/* ------------------------------------------------------------------
 * Zirbenstube – Getränkeliste
 * Strichliste pro Woche + automatische Monatsabrechnung.
 * Oberfläche im SwiftUI-/iOS-Stil. Alle Daten liegen im localStorage.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'zirbenstube-getraenkeliste-v1';
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];
const TABS = { liste: 'Strichliste', abrechnung: 'Abrechnung', einstellungen: 'Einstellungen' };
const TAB_ICONS = { liste: 'tally', abrechnung: 'euro', einstellungen: 'sliders' };

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round(n * 100) / 100;
const parsePrice = (s) => {
  const v = parseFloat(String(s).trim().replace('€', '').replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? round2(v) : null;
};

/* ----------------------- Symbole (SF-Symbol-artig) ----------------------- */

const ICONS = {
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  tally: '<path d="M6 5v14M10 5v14M14 5v14M18 5v14M3.5 15.5l17-7"/>',
  euro: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.6a4.2 4.2 0 1 0 0 6.8M7.5 10.6h6M7.5 13.4h6"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  printer: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2"/>',
  download: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  upload: '<path d="M12 14V3M8 7l4-4 4 4"/><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  grip: '<path d="M5 8h14M5 12h14M5 16h14"/>',
  mug: '<path d="M6 9h10v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M5.5 9c0-2 1.6-3.2 3.2-2.7.9-1.5 3.4-1.5 4.3 0 1.6-.5 3.5.7 3.5 2.7"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
};
const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------------------------- Zustand ---------------------------- */

function defaultState() {
  return {
    version: 1,
    persons: ['Leo', 'Max', 'Jonas', 'Gast 1', 'Gast 2']
      .map((name) => ({ id: uid(), name, archived: false })),
    drinks: [['Limo', 1.5], ['Bier', 1.8], ['Spezi', 1.8]]
      .map(([name, price]) => ({ id: uid(), name, price, archived: false })),
    // months["2026-10"] = { prices: {drinkId: €}, counts: {woche: {personId: {drinkId: n}}}, paid: {personId: true} }
    months: {},
  };
}

function isValidState(s) {
  return !!s && Array.isArray(s.persons) && Array.isArray(s.drinks)
    && !!s.months && typeof s.months === 'object';
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (isValidState(s)) return s;
    }
  } catch (e) { /* ignorieren – Standard verwenden */ }
  return defaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    hud('Speichern fehlgeschlagen – bitte Sicherung exportieren', 'warn');
  }
}

let state = loadState();

const now = new Date();
const ui = {
  year: now.getFullYear(),
  month: now.getMonth(),
  week: Math.ceil(now.getDate() / 7),
  tab: TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'liste',
  editing: false,
  openWeeks: new Set(),
};

/* ------------------------- Kalender-Helfer ------------------------ */

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const weekCount = (y, m) => Math.ceil(daysIn(y, m) / 7);
const weekRange = (y, m, w) => `${(w - 1) * 7 + 1}.–${Math.min(w * 7, daysIn(y, m))}.`;
const monthKey = () => `${ui.year}-${String(ui.month + 1).padStart(2, '0')}`;
const monthLabel = () => `${MONTH_NAMES[ui.month]} ${ui.year}`;
const isThisMonth = () => {
  const d = new Date();
  return d.getFullYear() === ui.year && d.getMonth() === ui.month;
};
const todayWeek = () => (isThisMonth() ? Math.ceil(new Date().getDate() / 7) : 0);

/* ------------------------- Daten-Helfer -------------------------- */

function getMonth(create = false) {
  const k = monthKey();
  let m = state.months[k];
  if (!m && create) {
    m = state.months[k] = { prices: {}, counts: {}, paid: {} };
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

function setCount(w, pid, did, value) {
  const m = getMonth(true);
  if (m.prices[did] === undefined) {
    const d = state.drinks.find((x) => x.id === did);
    if (d) m.prices[did] = d.price;
  }
  const week = (m.counts[w] ??= {});
  const pc = (week[pid] ??= {});
  if (value > 0) pc[did] = value; else delete pc[did];
  if (!Object.keys(pc).length) delete week[pid];
  if (!Object.keys(week).length) delete m.counts[w];
  saveState();
}

function usedAnywhere(kind, id) {
  return Object.values(state.months).some((m) => Object.values(m.counts || {}).some((week) =>
    kind === 'person'
      ? Object.keys(week[id] || {}).length > 0
      : Object.values(week).some((pc) => (pc[id] || 0) > 0)));
}

const visiblePersons = (m) => state.persons.filter((p) =>
  !p.archived || state.drinks.some((d) => monthTotal(m, p.id, d.id) > 0));
const visibleDrinks = (m) => state.drinks.filter((d) =>
  !d.archived || state.persons.some((p) => monthTotal(m, p.id, d.id) > 0));

const personAmount = (m, pid, drinks) =>
  round2(drinks.reduce((s, d) => s + monthTotal(m, pid, d.id) * priceOf(m, d), 0));
const personWeekAmount = (m, w, pid, drinks) =>
  round2(drinks.reduce((s, d) => s + count(m, w, pid, d.id) * priceOf(m, d), 0));

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
};

els.tabbar.innerHTML = Object.entries(TABS).map(([key, label]) =>
  `<button type="button" role="tab" data-tab="${key}">${icon(TAB_ICONS[key])}<span>${label}</span></button>`).join('');

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
  const title = TABS[ui.tab];
  const sub = ui.tab === 'einstellungen' ? '' : monthLabel();

  document.title = `${title} – Zirbenstube`;
  els.largeTitle.textContent = title;
  els.largeSubtitle.textContent = sub;
  els.largeSubtitle.hidden = !sub;
  els.navTitle.innerHTML = `<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}`;

  if (ui.tab === 'einstellungen') {
    els.navLeading.innerHTML = '';
    els.navTrailing.innerHTML = ui.editing
      ? '<button type="button" class="glass-btn text prominent" data-nav="edit">Fertig</button>'
      : '<button type="button" class="glass glass-btn text" data-nav="edit">Bearbeiten</button>';
  } else {
    els.navLeading.innerHTML = isThisMonth()
      ? '' : '<button type="button" class="glass glass-btn text" data-nav="today">Heute</button>';
    els.navTrailing.innerHTML = `<div class="glass glass-group" role="group" aria-label="Monat wechseln">
        <button type="button" data-nav="prev" aria-label="Vorheriger Monat">${icon('chevronLeft')}</button>
        <button type="button" data-nav="next" aria-label="Nächster Monat">${icon('chevronRight')}</button>
      </div>`;
  }

  els.tabbar.querySelectorAll('[data-tab]').forEach((b) =>
    b.setAttribute('aria-selected', b.dataset.tab === ui.tab));

  if (ui.tab === 'liste') els.content.innerHTML = renderListe();
  else if (ui.tab === 'abrechnung') els.content.innerHTML = renderAbrechnung();
  else els.content.innerHTML = renderEinstellungen();

  restoreFocus(sel);
  onScroll();
}

function emptyState() {
  return `<div class="empty">
    <div class="empty-icon">${icon('mug')}</div>
    <h2>Noch nichts angelegt</h2>
    <p>Lege in den Einstellungen Personen und Getränke an.</p>
    <button type="button" class="glass-btn text prominent" data-goto="einstellungen">Zu den Einstellungen</button>
  </div>`;
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
  return `${seg}<div id="weekBody">${renderWeekBody()}</div>`;
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
    h += `<section class="list-section">
      <h2 class="section-header prominent">${esc(p.name)}${p.archived ? ' <small>ausgeblendet</small>' : ''}</h2>
      <div class="list">`;
    for (const d of drinks) {
      const n = count(m, ui.week, p.id, d.id);
      h += `<div class="row tall">
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
      <p class="section-footer">Woche ${ui.week}: ${eur.format(personWeekAmount(m, ui.week, p.id, drinks))}
        · Monat: ${eur.format(personAmount(m, p.id, drinks))}</p>
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
  setCount(ui.week, pid, did, next);
  if (delta > 0) navigator.vibrate?.(10);

  const sel = focusSelector(document.activeElement);
  $('#weekBody').innerHTML = renderWeekBody();
  restoreFocus(sel);
  document.querySelector(`[data-count="${pid}-${did}"]`)?.classList.add(delta > 0 ? 'bump-up' : 'bump-down');

  const p = state.persons.find((x) => x.id === pid);
  const d = state.drinks.find((x) => x.id === did);
  announce(`${p?.name}: ${next} ${d?.name}`);
}

/* ----- Abrechnung ----- */

function renderAbrechnung() {
  const m = getMonth();
  const persons = visiblePersons(m);
  const drinks = visibleDrinks(m);
  if (!persons.length || !drinks.length) return emptyState();

  const amounts = Object.fromEntries(persons.map((p) => [p.id, personAmount(m, p.id, drinks)]));
  const grand = round2(Object.values(amounts).reduce((a, b) => a + b, 0));
  const paidSum = round2(persons.reduce((s, p) => s + (m?.paid?.[p.id] ? amounts[p.id] : 0), 0));
  const open = round2(grand - paidSum);
  const totalQty = persons.reduce((s, p) => s + drinks.reduce((t, d) => t + monthTotal(m, p.id, d.id), 0), 0);
  const pct = grand > 0 ? (paidSum / grand) * 100 : 0;

  let h = `<div class="narrow">
    <section class="list-section"><div class="list summary">
      <span class="caption">Gesamt im ${MONTH_NAMES[ui.month]}</span>
      <div class="big">${eur.format(grand)}</div>
      <div class="gauge" role="progressbar" aria-label="Anteil bezahlt" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(pct)}"><span style="width:${pct}%"></span></div>
      <div class="legend">
        <span><i class="dot green"></i>Bezahlt <b class="green-text">${eur.format(paidSum)}</b></span>
        <span><i class="dot orange"></i>Offen <b class="${open > 0 ? 'orange-text' : ''}">${eur.format(open)}</b></span>
        <span class="muted">${totalQty} Getränke</span>
      </div>
    </div></section>

    <section class="list-section">
      <h2 class="section-header">Personen</h2>
      <div class="list checks">`;

  for (const p of persons) {
    const amount = amounts[p.id];
    const paid = !!m?.paid?.[p.id];
    const items = drinks.map((d) => [monthTotal(m, p.id, d.id), d.name]).filter(([n]) => n > 0)
      .map(([n, name]) => `${n}× ${name}`).join(' · ') || 'Keine Getränke';
    h += `<div class="row">
        <button type="button" class="check" data-paid="${p.id}" aria-pressed="${paid}"
          ${!paid && amount === 0 ? 'disabled' : ''} aria-label="${esc(p.name)} hat bezahlt">${icon('check')}</button>
        <div class="row-text"><span class="title">${esc(p.name)}</span><span class="subtitle">${esc(items)}</span></div>
        <span class="amount${paid ? ' paid' : ''}">${eur.format(amount)}</span>
      </div>`;
  }

  h += `</div><p class="section-footer">Tippe auf den Kreis, sobald jemand bezahlt hat.</p></section>

    <section class="list-section">
      <h2 class="section-header">Getränke</h2>
      <div class="list">`;
  for (const d of drinks) {
    const price = priceOf(m, d);
    const qty = persons.reduce((s, p) => s + monthTotal(m, p.id, d.id), 0);
    h += `<div class="row">
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
          <tbody>${drinks.map((d) => `<tr><th scope="row">${esc(d.name)}</th>${persons.map((p) => {
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
        <button type="button" class="row action" data-print="filled"><span class="row-icon">${icon('printer')}</span>Abrechnung drucken</button>
        <button type="button" class="row action" data-print="blank"><span class="row-icon">${icon('doc')}</span>Leere Vorlage drucken</button>
        <button type="button" class="row action" data-action="csv"><span class="row-icon">${icon('share')}</span>Als CSV exportieren</button>
      </div>
    </section>
    <section class="list-section">
      <div class="list icons">
        <button type="button" class="row action destructive" data-action="clear-month"><span class="row-icon">${icon('trash')}</span>${monthLabel()} leeren</button>
      </div>
    </section>
  </div>`;
  return h;
}

/* ----- Einstellungen ----- */

function renderEinstellungen() {
  const e = ui.editing;
  const persons = state.persons.filter((p) => !p.archived);
  const archived = state.persons.filter((p) => p.archived);
  const drinks = state.drinks.filter((d) => !d.archived);
  const archivedDrinks = state.drinks.filter((d) => d.archived);

  const del = (kind, x) => (e ? `<button type="button" class="del-circle" data-remove-${kind}="${x.id}"
    aria-label="${esc(x.name)} entfernen">${icon('minus')}</button>` : '');
  const handle = (x) => (e ? `<span class="drag-handle" role="button" tabindex="0" data-handle="${x.id}"
    aria-label="${esc(x.name)} verschieben, Pfeiltasten hoch und runter">${icon('grip')}</span>` : '');
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
      <div class="list" data-list="person">
        ${persons.map((p) => `<div class="row edit" data-id="${p.id}">
          ${del('person', p)}
          <input class="field" value="${esc(p.name)}" data-rename-person="${p.id}" aria-label="Name" maxlength="40" autocomplete="off">
          ${handle(p)}
        </div>`).join('')}
        <form class="row edit add" data-form="person">
          <button class="add-circle" aria-label="Person hinzufügen">${icon('plus')}</button>
          <input class="field" name="name" placeholder="Person hinzufügen" maxlength="40" autocomplete="off" required aria-label="Name der neuen Person">
        </form>
      </div>
      <p class="section-footer">${e ? 'Zum Sortieren am Griff ziehen.' : 'Tippe auf einen Namen, um ihn zu ändern. Mit „Bearbeiten“ kannst du sortieren und löschen.'}</p>
    </section>
    ${restoreSection('person', archived, 'Ausgeblendete Personen')}

    <section class="list-section">
      <h2 class="section-header">Getränke &amp; Preise</h2>
      <div class="list" data-list="drink">
        ${drinks.map((d) => `<div class="row edit" data-id="${d.id}">
          ${del('drink', d)}
          <input class="field" value="${esc(d.name)}" data-rename-drink="${d.id}" aria-label="Getränk" maxlength="30" autocomplete="off">
          <span class="price-wrap"><input class="field price" value="${num.format(d.price)}" inputmode="decimal"
            data-price-drink="${d.id}" aria-label="Preis von ${esc(d.name)} in Euro" autocomplete="off"><span class="unit">€</span></span>
          ${handle(d)}
        </div>`).join('')}
        <form class="row edit add" data-form="drink">
          <button class="add-circle" aria-label="Getränk hinzufügen">${icon('plus')}</button>
          <input class="field" name="name" placeholder="Getränk hinzufügen" maxlength="30" autocomplete="off" required aria-label="Name des neuen Getränks">
          <span class="price-wrap"><input class="field price" name="price" placeholder="0,00" inputmode="decimal" required
            autocomplete="off" aria-label="Preis in Euro"><span class="unit">€</span></span>
        </form>
      </div>
      <p class="section-footer">Neue Preise gelten ab ${monthLabel()}. Frühere Monate behalten ihre Preise.</p>
    </section>
    ${restoreSection('drink', archivedDrinks, 'Ausgeblendete Getränke')}

    <section class="list-section">
      <h2 class="section-header">Datensicherung</h2>
      <div class="list icons">
        <button type="button" class="row action" data-action="export"><span class="row-icon">${icon('download')}</span>Sicherung exportieren</button>
        <button type="button" class="row action" data-action="import"><span class="row-icon">${icon('upload')}</span>Sicherung importieren</button>
      </div>
      <p class="section-footer">Alle Einträge werden nur auf diesem Gerät gespeichert. Mit einer Sicherung kannst du sie auf ein anderes Gerät übertragen.</p>
    </section>

    <section class="list-section">
      <div class="list icons">
        <button type="button" class="row action destructive" data-action="reset"><span class="row-icon">${icon('trash')}</span>Alle Daten zurücksetzen</button>
      </div>
    </section>
  </div>`;
}

/* ------------------------------ Druck ----------------------------- */

function printSheet(blank) {
  const m = blank ? undefined : getMonth();
  const persons = blank ? state.persons.filter((p) => !p.archived) : visiblePersons(m);
  const drinks = blank ? state.drinks.filter((d) => !d.archived) : visibleDrinks(m);
  const weeks = blank ? 5 : weekCount(ui.year, ui.month);
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
      `<td>${blank ? '________ €' : eur.format(personAmount(m, p.id, drinks))}${!blank && m?.paid?.[p.id] ? ' ✓' : ''}</td>`).join('')}</tr>
    </tbody></table>
    <p class="hint">${blank
      ? 'Je Person: Stückzahlen aus allen Wochen addieren, mit dem jeweiligen Preis multiplizieren und unten die Beträge summieren.'
      : `Erstellt am ${new Date().toLocaleDateString('de-DE')} · ✓ = bezahlt`}</p>`;

  $('#print').innerHTML = html;
  window.print();
}

/* ---------------------------- Export ------------------------------ */

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  const m = getMonth();
  const persons = visiblePersons(m);
  const drinks = visibleDrinks(m);
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [['Person', ...drinks.map((d) => `${d.name} (Stk.)`), 'Betrag (€)', 'Bezahlt']];
  for (const p of persons) {
    rows.push([p.name, ...drinks.map((d) => monthTotal(m, p.id, d.id)),
      num.format(personAmount(m, p.id, drinks)), m?.paid?.[p.id] ? 'ja' : 'nein']);
  }
  rows.push(['Preis (€)', ...drinks.map((d) => num.format(priceOf(m, d))), '', '']);
  const csv = '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
  download(`zirbenstube-abrechnung-${monthKey()}.csv`, csv, 'text/csv;charset=utf-8');
  hud('CSV exportiert', 'check');
}

function exportJson() {
  const date = new Date().toISOString().slice(0, 10);
  download(`zirbenstube-sicherung-${date}.json`, JSON.stringify(state, null, 2), 'application/json');
  hud('Sicherung exportiert', 'check');
}

/* ------------------------ HUD & Dialoge -------------------------- */

let hudTimer;
function hud(msg, ic) {
  const h = $('#hud');
  h.innerHTML = `${ic ? icon(ic) : ''}<span>${esc(msg)}</span>`;
  h.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => h.classList.remove('show'), 2000);
}

function announce(msg) {
  $('#sr-live').textContent = msg;
}

/** Alert im iOS-Stil. Gibt den `value` der gewählten Aktion zurück. */
function iosAlert({ title, message = '', actions }) {
  return new Promise((resolve) => {
    const root = $('#alert-root');
    const prevFocus = document.activeElement;
    root.innerHTML = `<div class="alert-backdrop">
      <div class="alert" role="alertdialog" aria-modal="true" aria-labelledby="alertTitle" ${message ? 'aria-describedby="alertMsg"' : ''}>
        <h2 id="alertTitle">${esc(title)}</h2>
        ${message ? `<p id="alertMsg">${esc(message)}</p>` : ''}
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
    : 'Das kann nicht rückgängig gemacht werden.', 'Entfernen');
  if (!ok) return;
  if (used) item.archived = true;
  else list.splice(list.indexOf(item), 1);
  saveState();
  render();
}

/* ---------------------------- Events ------------------------------ */

els.navbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nav]');
  if (!b) return;
  if (b.dataset.nav === 'prev') shiftMonth(-1);
  else if (b.dataset.nav === 'next') shiftMonth(1);
  else if (b.dataset.nav === 'today') goToday();
  else if (b.dataset.nav === 'edit') {
    ui.editing = !ui.editing;
    render();
  }
});

els.tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && b.dataset.tab !== ui.tab) setTab(b.dataset.tab);
});

els.content.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  const ds = t.dataset;

  if (ds.act) {
    tally(ds.p, ds.d, ds.act === 'inc' ? 1 : -1);
  } else if (ds.week) {
    selectWeek(Number(ds.week));
  } else if (ds.goto) {
    setTab(ds.goto);
  } else if (ds.paid) {
    const m = getMonth(true);
    const p = state.persons.find((x) => x.id === ds.paid);
    if (m.paid[ds.paid]) delete m.paid[ds.paid];
    else {
      m.paid[ds.paid] = true;
      hud(`${p?.name} hat bezahlt`, 'check');
    }
    saveState();
    render();
  } else if (ds.print) {
    printSheet(ds.print === 'blank');
  } else if (ds.removePerson) {
    removeItem('person', ds.removePerson);
  } else if (ds.removeDrink) {
    removeItem('drink', ds.removeDrink);
  } else if (ds.restorePerson || ds.restoreDrink) {
    const item = ds.restorePerson
      ? state.persons.find((p) => p.id === ds.restorePerson)
      : state.drinks.find((d) => d.id === ds.restoreDrink);
    if (item) item.archived = false;
    saveState();
    render();
  } else if (ds.action === 'csv') {
    exportCsv();
  } else if (ds.action === 'export') {
    exportJson();
  } else if (ds.action === 'import') {
    $('#importFile').click();
  } else if (ds.action === 'clear-month') {
    if (await confirmAlert(`${monthLabel()} leeren?`, 'Alle Striche und Bezahlt-Haken dieses Monats werden gelöscht.', 'Leeren')) {
      delete state.months[monthKey()];
      saveState();
      render();
      hud('Monat geleert', 'trash');
    }
  } else if (ds.action === 'reset') {
    if (await confirmAlert('Alle Daten zurücksetzen?', 'Alle Monate, Personen und Getränke werden gelöscht und die Standardliste wird wiederhergestellt.', 'Zurücksetzen')) {
      state = defaultState();
      saveState();
      ui.editing = false;
      render();
      hud('Zurückgesetzt', 'check');
    }
  }
});

els.content.addEventListener('keydown', (e) => {
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

els.content.addEventListener('change', (e) => {
  const t = e.target;
  const ds = t.dataset;
  if (ds.renamePerson || ds.renameDrink) {
    const item = ds.renamePerson
      ? state.persons.find((p) => p.id === ds.renamePerson)
      : state.drinks.find((d) => d.id === ds.renameDrink);
    const name = t.value.trim();
    if (item && name) {
      item.name = name;
      saveState();
    } else if (item) {
      t.value = item.name;
    }
  } else if (ds.priceDrink) {
    const d = state.drinks.find((x) => x.id === ds.priceDrink);
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
  }
});

els.content.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const name = f.elements.name.value.trim();
  if (!name) return;
  if (f.dataset.form === 'person') {
    state.persons.push({ id: uid(), name, archived: false });
  } else if (f.dataset.form === 'drink') {
    const price = parsePrice(f.elements.price.value);
    if (price === null) {
      hud('Ungültiger Preis', 'warn');
      return;
    }
    const d = { id: uid(), name, price, archived: false };
    state.drinks.push(d);
    const m = getMonth();
    if (m) m.prices[d.id] = price;
  }
  saveState();
  render();
  els.content.querySelector(`form[data-form="${f.dataset.form}"] input[name="name"]`)?.focus();
  hud(`${name} hinzugefügt`, 'check');
});

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
  state = data;
  saveState();
  render();
  hud('Sicherung importiert', 'check');
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
