'use strict';

/* ------------------------------------------------------------------
 * Zirbenstube – Getränkeliste
 * Strichliste pro Woche + automatische Monatsabrechnung.
 * Alle Daten liegen im localStorage dieses Geräts.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'zirbenstube-getraenkeliste-v1';
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];
const TABS = ['liste', 'abrechnung', 'einstellungen'];

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
    toast('Speichern fehlgeschlagen – bitte Daten exportieren!');
  }
}

let state = loadState();

const now = new Date();
const ui = {
  year: now.getFullYear(),
  month: now.getMonth(),
  week: Math.ceil(now.getDate() / 7),
  tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'liste',
};

/* ------------------------- Kalender-Helfer ------------------------ */

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const weekCount = (y, m) => Math.ceil(daysIn(y, m) / 7);
const weekRange = (y, m, w) => `${(w - 1) * 7 + 1}.–${Math.min(w * 7, daysIn(y, m))}.`;
const monthKey = () => `${ui.year}-${String(ui.month + 1).padStart(2, '0')}`;
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

function usedAnywhere(field, id) {
  return Object.values(state.months).some((m) => Object.values(m.counts || {}).some((week) =>
    field === 'person'
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

/* ---------------------------- Rendering --------------------------- */

const view = document.getElementById('view');

function render() {
  document.getElementById('monthLabel').textContent = `${MONTH_NAMES[ui.month]} ${ui.year}`;
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => {
    const active = b.dataset.tab === ui.tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
  });

  // Fokus nach dem Neuzeichnen wiederherstellen (Tastaturbedienung)
  const a = document.activeElement;
  const focusSel = a && view.contains(a) && a.dataset.act
    ? `[data-act="${a.dataset.act}"][data-p="${a.dataset.p}"][data-d="${a.dataset.d}"]`
    : a && view.contains(a) && a.dataset.week ? `[data-week="${a.dataset.week}"]` : null;

  if (ui.tab === 'liste') view.innerHTML = renderListe();
  else if (ui.tab === 'abrechnung') view.innerHTML = renderAbrechnung();
  else view.innerHTML = renderEinstellungen();

  if (focusSel) {
    const el = view.querySelector(focusSel);
    if (el && !el.disabled) el.focus({ preventScroll: true });
    else if (el) el.parentElement.querySelector('.plus')?.focus({ preventScroll: true });
  }
}

function renderEmpty() {
  return `<div class="card empty">
    <p>Noch keine Personen oder Getränke angelegt.</p>
    <button type="button" class="btn primary" data-goto="einstellungen">Zu den Einstellungen</button>
  </div>`;
}

function renderListe() {
  const m = getMonth();
  const persons = visiblePersons(m);
  const drinks = visibleDrinks(m);
  const wc = weekCount(ui.year, ui.month);
  if (ui.week > wc) ui.week = wc;
  const tw = todayWeek();

  let html = '<div class="weeks" role="group" aria-label="Woche wählen">';
  for (let w = 1; w <= wc; w++) {
    html += `<button type="button" class="chip${w === ui.week ? ' active' : ''}${w === tw ? ' today' : ''}"
      data-week="${w}" aria-pressed="${w === ui.week}">
      <b>Woche ${w}</b><small>${weekRange(ui.year, ui.month, w)}${w === tw ? ' · heute' : ''}</small></button>`;
  }
  html += '</div>';

  if (!persons.length || !drinks.length) return html + renderEmpty();

  html += '<div class="grid">';
  for (const p of persons) {
    html += `<article class="card person${p.archived ? ' archived' : ''}">
      <header><h3>${esc(p.name)}</h3></header>`;
    for (const d of drinks) {
      const n = count(m, ui.week, p.id, d.id);
      html += `<div class="drink-row">
        <div class="drink-label"><span>${esc(d.name)}</span><small>${eur.format(priceOf(m, d))}</small></div>
        <div class="stepper">
          <button type="button" class="step minus" data-act="dec" data-p="${p.id}" data-d="${d.id}"
            ${n === 0 ? 'disabled' : ''} aria-label="Ein ${esc(d.name)} bei ${esc(p.name)} abziehen">−</button>
          <output class="${n ? 'has' : ''}" aria-label="${esc(d.name)} ${esc(p.name)}">${n}</output>
          <button type="button" class="step plus" data-act="inc" data-p="${p.id}" data-d="${d.id}"
            aria-label="Ein ${esc(d.name)} für ${esc(p.name)} eintragen">+</button>
        </div>
      </div>`;
    }
    html += `<footer>
        <span>Woche ${ui.week}: <b>${eur.format(personWeekAmount(m, ui.week, p.id, drinks))}</b></span>
        <span>Monat: <b>${eur.format(personAmount(m, p.id, drinks))}</b></span>
      </footer>
    </article>`;
  }
  html += '</div>';
  return html;
}

function renderAbrechnung() {
  const m = getMonth();
  const persons = visiblePersons(m);
  const drinks = visibleDrinks(m);
  if (!persons.length || !drinks.length) return renderEmpty();

  const amounts = Object.fromEntries(persons.map((p) => [p.id, personAmount(m, p.id, drinks)]));
  const grand = round2(Object.values(amounts).reduce((a, b) => a + b, 0));
  const paidSum = round2(persons.reduce((s, p) => s + (m?.paid?.[p.id] ? amounts[p.id] : 0), 0));
  const totalQty = persons.reduce((s, p) => s + drinks.reduce((t, d) => t + monthTotal(m, p.id, d.id), 0), 0);

  let html = `<div class="stats">
      <div class="card stat"><span class="label">Getränke im ${MONTH_NAMES[ui.month]}</span><span class="value">${totalQty} Stk.</span></div>
      <div class="card stat"><span class="label">Gesamtbetrag</span><span class="value">${eur.format(grand)}</span></div>
      <div class="card stat"><span class="label">Bezahlt</span><span class="value ok">${eur.format(paidSum)}</span></div>
      <div class="card stat"><span class="label">Noch offen</span><span class="value${grand - paidSum > 0 ? ' warn' : ''}">${eur.format(round2(grand - paidSum))}</span></div>
    </div>
    <div class="toolbar">
      <button type="button" class="btn primary" data-print="filled">Abrechnung drucken</button>
      <button type="button" class="btn" data-print="blank">Leere Vorlage drucken</button>
      <button type="button" class="btn" data-action="csv">CSV exportieren</button>
    </div>
    <h2>Monatsabrechnung</h2>
    <div class="table-wrap"><table class="data bill">
      <thead><tr><th scope="col">Getränk / Preis</th>
        ${persons.map((p) => `<th scope="col">${esc(p.name)}</th>`).join('')}
        <th scope="col">Summe</th></tr></thead>
      <tbody>`;

  for (const d of drinks) {
    const price = priceOf(m, d);
    let rowQty = 0;
    html += `<tr><th scope="row">${esc(d.name)}<small>${eur.format(price)}</small></th>`;
    for (const p of persons) {
      const n = monthTotal(m, p.id, d.id);
      rowQty += n;
      html += `<td class="${n ? '' : 'zero'}"><span class="qty">${n} Stk.</span><span class="amt">${eur.format(n * price)}</span></td>`;
    }
    html += `<td class="sum"><span class="qty">${rowQty} Stk.</span><span class="amt">${eur.format(rowQty * price)}</span></td></tr>`;
  }

  html += `</tbody><tfoot>
      <tr class="total"><th scope="row">Gesamtbetrag</th>
        ${persons.map((p) => `<td>${eur.format(amounts[p.id])}</td>`).join('')}
        <td>${eur.format(grand)}</td></tr>
      <tr class="paid-row"><th scope="row">Bezahlt</th>
        ${persons.map((p) => {
          const paid = !!m?.paid?.[p.id];
          if (!paid && amounts[p.id] === 0) return '<td class="zero">–</td>';
          return `<td><label class="paid${paid ? ' is-paid' : ''}">
            <input type="checkbox" data-paid="${p.id}" ${paid ? 'checked' : ''}>
            <span>${paid ? 'bezahlt' : 'offen'}</span></label></td>`;
        }).join('')}
        <td>${persons.filter((p) => m?.paid?.[p.id]).length}/${persons.filter((p) => amounts[p.id] > 0).length}</td></tr>
    </tfoot></table></div>`;

  // Wochenübersicht wie auf der Papiervorlage
  html += '<h2>Wochenübersicht</h2><div class="weeks-overview">';
  for (let w = 1; w <= weekCount(ui.year, ui.month); w++) {
    html += `<div class="table-wrap"><table class="data compact">
      <thead><tr><th scope="col">Woche ${w} <small>${weekRange(ui.year, ui.month, w)}</small></th>
        ${persons.map((p) => `<th scope="col">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
      ${drinks.map((d) => `<tr><th scope="row">${esc(d.name)}</th>
        ${persons.map((p) => {
          const n = count(m, w, p.id, d.id);
          return `<td class="${n ? '' : 'zero'}">${n || '–'}</td>`;
        }).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }
  html += '</div>';
  return html;
}

function renderEinstellungen() {
  const active = state.persons.filter((p) => !p.archived);
  const archived = state.persons.filter((p) => p.archived);
  const drinks = state.drinks.filter((d) => !d.archived);
  const archivedDrinks = state.drinks.filter((d) => d.archived);

  return `<div class="settings">
    <section class="card">
      <h2>Personen</h2>
      ${active.map((p, i) => `<div class="edit-row">
        <input class="text" value="${esc(p.name)}" data-rename-person="${p.id}" aria-label="Name" maxlength="40">
        <button type="button" class="icon-btn small" data-move-person="${p.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
        <button type="button" class="icon-btn small" data-move-person="${p.id}" data-dir="1" ${i === active.length - 1 ? 'disabled' : ''} aria-label="Nach unten">↓</button>
        <button type="button" class="btn ghost danger" data-remove-person="${p.id}">Entfernen</button>
      </div>`).join('') || '<p class="muted">Keine Personen.</p>'}
      <form class="edit-row add" data-form="person">
        <input class="text" name="name" placeholder="Neue Person" required maxlength="40" aria-label="Name der neuen Person">
        <button class="btn primary">Hinzufügen</button>
      </form>
      ${archived.length ? `<h3>Ehemalige</h3>${archived.map((p) => `<div class="edit-row">
        <span class="text-static">${esc(p.name)}</span>
        <button type="button" class="btn ghost" data-restore-person="${p.id}">Wiederherstellen</button>
      </div>`).join('')}` : ''}
    </section>

    <section class="card">
      <h2>Getränke &amp; Preise</h2>
      ${drinks.map((d) => `<div class="edit-row">
        <input class="text" value="${esc(d.name)}" data-rename-drink="${d.id}" aria-label="Getränk" maxlength="30">
        <span class="price-field"><input class="text price" value="${num.format(d.price)}" inputmode="decimal" data-price-drink="${d.id}" aria-label="Preis von ${esc(d.name)} in Euro"><span>€</span></span>
        <button type="button" class="btn ghost danger" data-remove-drink="${d.id}">Entfernen</button>
      </div>`).join('') || '<p class="muted">Keine Getränke.</p>'}
      <form class="edit-row add" data-form="drink">
        <input class="text" name="name" placeholder="Neues Getränk" required maxlength="30" aria-label="Name des neuen Getränks">
        <span class="price-field"><input class="text price" name="price" placeholder="0,00" inputmode="decimal" required aria-label="Preis in Euro"><span>€</span></span>
        <button class="btn primary">Hinzufügen</button>
      </form>
      <p class="hint">Preisänderungen gelten für den angezeigten Monat (${MONTH_NAMES[ui.month]} ${ui.year}) und alle neuen Monate. Frühere Monate behalten ihre Preise.</p>
      ${archivedDrinks.length ? `<h3>Ehemalige</h3>${archivedDrinks.map((d) => `<div class="edit-row">
        <span class="text-static">${esc(d.name)}</span>
        <button type="button" class="btn ghost" data-restore-drink="${d.id}">Wiederherstellen</button>
      </div>`).join('')}` : ''}
    </section>

    <section class="card">
      <h2>Daten</h2>
      <p class="hint">Alle Einträge werden nur auf diesem Gerät im Browser gespeichert. Mach ab und zu eine Sicherung – damit kannst du die Daten auch auf ein anderes Gerät übertragen.</p>
      <div class="toolbar">
        <button type="button" class="btn primary" data-action="export">Sicherung herunterladen</button>
        <button type="button" class="btn" data-action="import">Sicherung laden</button>
      </div>
      <div class="toolbar">
        <button type="button" class="btn danger" data-action="clear-month">${MONTH_NAMES[ui.month]} ${ui.year} leeren</button>
        <button type="button" class="btn danger" data-action="reset">Alles zurücksetzen</button>
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

  document.getElementById('print').innerHTML = html;
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
}

function exportJson() {
  const date = new Date().toISOString().slice(0, 10);
  download(`zirbenstube-sicherung-${date}.json`, JSON.stringify(state, null, 2), 'application/json');
  toast('Sicherung heruntergeladen');
}

/* ----------------------------- Toast ------------------------------ */

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------------------------- Events ------------------------------ */

function setTab(tab) {
  ui.tab = tab;
  history.replaceState(null, '', `#${tab}`);
  render();
}

function shiftMonth(delta) {
  const d = new Date(ui.year, ui.month + delta, 1);
  ui.year = d.getFullYear();
  ui.month = d.getMonth();
  ui.week = todayWeek() || 1;
  render();
}

document.getElementById('prevMonth').addEventListener('click', () => shiftMonth(-1));
document.getElementById('nextMonth').addEventListener('click', () => shiftMonth(1));
document.getElementById('monthLabel').addEventListener('click', () => {
  const d = new Date();
  ui.year = d.getFullYear();
  ui.month = d.getMonth();
  ui.week = Math.ceil(d.getDate() / 7);
  render();
});
document.querySelectorAll('.tabs [data-tab]').forEach((b) =>
  b.addEventListener('click', () => setTab(b.dataset.tab)));

function moveItem(list, id, dir) {
  const active = list.filter((x) => !x.archived);
  const i = active.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= active.length) return;
  const a = list.indexOf(active[i]);
  const b = list.indexOf(active[j]);
  [list[a], list[b]] = [list[b], list[a]];
}

function removeItem(kind, id) {
  const list = kind === 'person' ? state.persons : state.drinks;
  const item = list.find((x) => x.id === id);
  if (!item) return;
  if (!confirm(`„${item.name}“ entfernen?`)) return;
  if (usedAnywhere(kind, id)) {
    item.archived = true; // Historie bleibt in alten Abrechnungen erhalten
  } else {
    list.splice(list.indexOf(item), 1);
  }
  saveState();
  render();
}

view.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-week]');
  if (!t || t.disabled) return;
  const ds = t.dataset;

  if (ds.act) {
    const cur = count(getMonth(), ui.week, ds.p, ds.d);
    setCount(ui.week, ds.p, ds.d, ds.act === 'inc' ? cur + 1 : Math.max(0, cur - 1));
    if (ds.act === 'inc') navigator.vibrate?.(15);
    render();
  } else if (ds.week) {
    ui.week = Number(ds.week);
    render();
  } else if (ds.goto) {
    setTab(ds.goto);
  } else if (ds.print) {
    printSheet(ds.print === 'blank');
  } else if (ds.movePerson) {
    moveItem(state.persons, ds.movePerson, Number(ds.dir));
    saveState(); render();
  } else if (ds.removePerson) {
    removeItem('person', ds.removePerson);
  } else if (ds.removeDrink) {
    removeItem('drink', ds.removeDrink);
  } else if (ds.restorePerson || ds.restoreDrink) {
    const item = ds.restorePerson
      ? state.persons.find((p) => p.id === ds.restorePerson)
      : state.drinks.find((d) => d.id === ds.restoreDrink);
    if (item) item.archived = false;
    saveState(); render();
  } else if (ds.action === 'csv') {
    exportCsv();
  } else if (ds.action === 'export') {
    exportJson();
  } else if (ds.action === 'import') {
    document.getElementById('importFile').click();
  } else if (ds.action === 'clear-month') {
    if (confirm(`Alle Striche für ${MONTH_NAMES[ui.month]} ${ui.year} löschen?`)) {
      delete state.months[monthKey()];
      saveState(); render(); toast('Monat geleert');
    }
  } else if (ds.action === 'reset') {
    if (confirm('Wirklich ALLE Daten löschen und mit der Standardliste neu beginnen?')) {
      state = defaultState();
      saveState(); render(); toast('Zurückgesetzt');
    }
  }
});

view.addEventListener('change', (e) => {
  const t = e.target;
  const ds = t.dataset;
  if (ds.paid) {
    const m = getMonth(true);
    if (t.checked) m.paid[ds.paid] = true; else delete m.paid[ds.paid];
    saveState(); render();
  } else if (ds.renamePerson || ds.renameDrink) {
    const item = ds.renamePerson
      ? state.persons.find((p) => p.id === ds.renamePerson)
      : state.drinks.find((d) => d.id === ds.renameDrink);
    const name = t.value.trim();
    if (item && name) { item.name = name; saveState(); }
    render();
  } else if (ds.priceDrink) {
    const d = state.drinks.find((x) => x.id === ds.priceDrink);
    const price = parsePrice(t.value);
    if (d && price !== null) {
      d.price = price;
      const m = getMonth();
      if (m) m.prices[d.id] = price;
      saveState();
      toast(`${d.name}: ${eur.format(price)}`);
    } else {
      toast('Ungültiger Preis');
    }
    render();
  }
});

view.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const name = f.elements.name.value.trim();
  if (!name) return;
  if (f.dataset.form === 'person') {
    state.persons.push({ id: uid(), name, archived: false });
  } else if (f.dataset.form === 'drink') {
    const price = parsePrice(f.elements.price.value);
    if (price === null) { toast('Ungültiger Preis'); return; }
    const d = { id: uid(), name, price, archived: false };
    state.drinks.push(d);
    const m = getMonth();
    if (m) m.prices[d.id] = price;
  }
  saveState();
  render();
  view.querySelector(`form[data-form="${f.dataset.form}"] input[name="name"]`)?.focus();
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!isValidState(data)) throw new Error('invalid');
    if (!confirm('Aktuelle Daten durch die Sicherung ersetzen?')) return;
    state = data;
    saveState(); render(); toast('Sicherung geladen');
  } catch {
    toast('Datei ist keine gültige Sicherung');
  }
});

// Mehrere offene Tabs synchron halten
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { state = loadState(); render(); }
});

window.addEventListener('hashchange', () => {
  const tab = location.hash.slice(1);
  if (TABS.includes(tab) && tab !== ui.tab) { ui.tab = tab; render(); }
});

/* ------------------------------ Start ----------------------------- */

render();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
