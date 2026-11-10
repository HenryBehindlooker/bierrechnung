/* ------------------------------------------------------------------
 * Zirbenstube – Rechenkern
 * Reine Logik ohne DOM: Datenmodell, Übernahme alter Stände, Abrechnung,
 * Kasse, Pfand und das Zusammenführen bei gemeinsamer Nutzung.
 * Läuft im Browser (window.Core) und in Node (Tests).
 * ------------------------------------------------------------------ */
(function (root, factory) {
  const Core = factory();
  if (typeof module === 'object' && module.exports) module.exports = Core;
  else root.Core = Core;
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const VERSION = 3;
  const DAY = 86400000;
  const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'mint', 'teal', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray'];
  const PERSON_CYCLE = ['blue', 'green', 'purple', 'orange', 'pink', 'teal', 'indigo', 'red', 'mint', 'brown'];
  const METHODS = { bar: 'Bar', paypal: 'PayPal', bank: 'Überweisung' };

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const parsePrice = (s) => {
    const v = parseFloat(String(s).trim().replace('€', '').replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? round2(v) : null;
  };
  const parseCount = (s) => {
    const t = String(s).trim();
    return /^-?\d+$/.test(t) ? parseInt(t, 10) : null;
  };
  const keyOf = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  /** Zeitpunkt, an dem ein Monat endet (Beginn des Folgemonats, lokale Zeit). */
  const monthEnd = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 1).getTime();
  };

  function guessDrink(name, i = 0) {
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

  /* ------------------------------ Modell ------------------------------ */

  function newDrink(name, price, i = 0) {
    const g = guessDrink(name, i);
    return {
      id: uid(), name, price, emoji: g.emoji, color: g.color, archived: false,
      stock: null, perCrate: /bier/i.test(name) ? 20 : 12, crateCost: null, crateDeposit: null, minStock: null,
    };
  }

  function defaultState() {
    return migrate({
      version: VERSION,
      persons: [['Leo', 'blue'], ['Max', 'green'], ['Jonas', 'purple'], ['Gast 1', 'orange'], ['Gast 2', 'pink']]
        .map(([name, color]) => ({ id: uid(), name, color, archived: false })),
      drinks: [['Bier', 1.8], ['Limo', 1.5], ['Spezi', 1.8]].map(([n, p], i) => newDrink(n, p, i)),
      settings: { bierFirst: true },
      months: {},
      payments: [],
      purchases: [],
      empties: [],
      cash: [],
    });
  }

  function isValidState(s) {
    return !!s && Array.isArray(s.persons) && Array.isArray(s.drinks)
      && !!s.months && typeof s.months === 'object' && !Array.isArray(s.months);
  }

  /* ----------------------------- Prüfung ----------------------------- */
  /* Daten kommen auch aus Sicherungsdateien und von anderen Geräten. Bevor sie
   * angezeigt oder verrechnet werden, wird jedes Feld auf Typ und Form geprüft –
   * unbekannte Felder und ungültige Einträge fallen weg. Das verhindert, dass
   * präparierte Daten Code in die Seite schleusen (XSS) oder die App zerlegen. */

  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
  const okId = (x) => typeof x === 'string' && ID_RE.test(x) && !RESERVED.has(x);
  const text = (x, max) => (typeof x === 'string' ? x : '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);
  const money = (x) => (fin(x) && x >= 0 && x < 1e7 ? round2(x) : null);
  const whole = (x, min, max) => (fin(x) && Math.round(x) >= min && Math.round(x) <= max ? Math.round(x) : null);
  const dateStr = (x) => (typeof x === 'string' && x.length <= 40 && !Number.isNaN(Date.parse(x)) ? x : null);
  const rows = (list, fn) => {
    const seen = new Set();
    const out = [];
    for (const x of Array.isArray(list) ? list : []) {
      if (!x || typeof x !== 'object' || !okId(x.id) || seen.has(x.id)) continue;
      const r = fn(x);
      if (!r) continue;
      seen.add(x.id);
      out.push(r);
    }
    return out;
  };

  /** Liefert eine geprüfte Kopie; alles Unbekannte oder Ungültige wird verworfen. */
  function sanitize(s) {
    const out = { version: fin(s.version) ? s.version : 1 };
    out.persons = rows(s.persons, (p) => ({ id: p.id, name: text(p.name, 40) || 'Ohne Namen', color: p.color, archived: !!p.archived }));
    out.drinks = rows(s.drinks, (d) => ({
      id: d.id, name: text(d.name, 30) || 'Getränk', price: money(d.price) ?? 0,
      emoji: text(d.emoji, 8), color: d.color, archived: !!d.archived,
      stock: whole(d.stock, -100000, 100000), perCrate: whole(d.perCrate, 1, 1000),
      crateCost: money(d.crateCost), crateDeposit: money(d.crateDeposit), minStock: whole(d.minStock, 0, 100000),
    }));
    out.months = {};
    for (const [key, m] of Object.entries(s.months || {})) {
      if (!MONTH_RE.test(key) || !m || typeof m !== 'object') continue;
      const month = { prices: {}, counts: {} };
      for (const [did, v] of Object.entries(m.prices || {})) if (okId(did) && money(v) != null) month.prices[did] = money(v);
      for (const [w, week] of Object.entries(m.counts || {})) {
        if (!/^[1-5]$/.test(w) || !week || typeof week !== 'object') continue;
        for (const [pid, pc] of Object.entries(week)) {
          if (!okId(pid) || !pc || typeof pc !== 'object') continue;
          for (const [did, n] of Object.entries(pc)) {
            const c = whole(n, 1, 100000);
            if (okId(did) && c) ((month.counts[w] ??= {})[pid] ??= {})[did] = c;
          }
        }
      }
      if (dateStr(m.closed)) month.closed = m.closed;
      if (m.paid && typeof m.paid === 'object') { // nur in sehr alten Ständen (v1)
        month.paid = {};
        for (const [pid, v] of Object.entries(m.paid)) if (okId(pid) && v) month.paid[pid] = true;
      }
      out.months[key] = month;
    }
    out.payments = rows(s.payments, (x) => {
      if (!okId(x.pid) || !MONTH_RE.test(x.month) || !(money(x.amount) > 0)) return null;
      const r = { id: x.id, pid: x.pid, month: x.month, amount: money(x.amount), date: dateStr(x.date) };
      if (Object.hasOwn(METHODS, x.method)) r.method = x.method;
      if (x.legacy) r.legacy = true;
      return r;
    });
    out.purchases = rows(s.purchases, (x) => {
      if (!okId(x.drinkId)) return null;
      const r = {
        id: x.id, drinkId: x.drinkId, date: dateStr(x.date) || '1970-01-01T00:00:00.000Z',
        crates: whole(x.crates, 0, 10000) ?? 0, bottles: whole(x.bottles, 0, 1000000) ?? 0, cost: money(x.cost),
      };
      if (money(x.deposit) != null) r.deposit = money(x.deposit);
      if (typeof x.fromCash === 'boolean') r.fromCash = x.fromCash;
      return r;
    });
    out.empties = rows(s.empties, (x) => (okId(x.drinkId) ? {
      id: x.id, drinkId: x.drinkId, date: dateStr(x.date) || '1970-01-01T00:00:00.000Z',
      crates: whole(x.crates, 0, 10000) ?? 0, refund: money(x.refund) ?? 0,
    } : null));
    out.cash = rows(s.cash, (x) => {
      if (!['in', 'out', 'adjust'].includes(x.kind) || !fin(x.amount) || Math.abs(x.amount) >= 1e7) return null;
      if (x.kind !== 'adjust' && x.amount < 0) return null;
      return {
        id: x.id, kind: x.kind, amount: round2(x.amount), date: dateStr(x.date) || '1970-01-01T00:00:00.000Z',
        note: text(x.note, 60), category: text(x.category, 30),
      };
    });
    const st = s.settings && typeof s.settings === 'object' ? s.settings : {};
    out.settings = {};
    if (typeof st.paypal === 'string') out.settings.paypal = text(st.paypal, 40);
    if (typeof st.note === 'string') out.settings.note = text(st.note, 120);
    if (Object.hasOwn(METHODS, st.defaultMethod)) out.settings.defaultMethod = st.defaultMethod;
    if (typeof st.purchasesFromCash === 'boolean') out.settings.purchasesFromCash = st.purchasesFromCash;
    if (st.bierFirst === true) out.settings.bierFirst = true;
    return out;
  }

  /** Prüft die Daten und bringt jeden älteren Stand (v1, v2) auf v3. Liefert den geprüften Stand. */
  function migrate(input) {
    const s = sanitize(input);
    s.persons.forEach((p, i) => {
      if (!COLOR_NAMES.includes(p.color)) p.color = PERSON_CYCLE[i % PERSON_CYCLE.length];
      p.archived = !!p.archived;
    });
    s.drinks.forEach((d, i) => {
      const g = guessDrink(d.name, i);
      if (!d.emoji) d.emoji = g.emoji;
      if (!COLOR_NAMES.includes(d.color)) d.color = g.color;
      if (typeof d.stock !== 'number') d.stock = null;
      if (!(d.perCrate > 0)) d.perCrate = /bier/i.test(d.name) ? 20 : 12;
      if (typeof d.crateCost !== 'number') d.crateCost = null;
      if (typeof d.crateDeposit !== 'number') d.crateDeposit = null;
      if (typeof d.minStock !== 'number') d.minStock = null;
      d.archived = !!d.archived;
    });
    s.payments = Array.isArray(s.payments) ? s.payments : [];
    // Zahlungen/Einkäufe aus der Zeit vor dem Kassenbuch zählen nicht zum Kassenstand
    s.payments.forEach((x) => {
      if (!METHODS[x.method]) {
        x.method = 'bar';
        x.legacy = true;
      }
    });
    s.purchases = Array.isArray(s.purchases) ? s.purchases : [];
    s.purchases.forEach((x) => {
      if (typeof x.deposit !== 'number') x.deposit = 0;
      if (typeof x.fromCash !== 'boolean') x.fromCash = false;
    });
    s.empties = Array.isArray(s.empties) ? s.empties : [];
    s.cash = Array.isArray(s.cash) ? s.cash : [];
    s.settings = { paypal: '', note: '', defaultMethod: 'bar', purchasesFromCash: true, ...(s.settings || {}) };
    // Einmalig: Bier nach oben, falls noch die ursprüngliche Reihenfolge Limo, Bier, Spezi gilt
    if (!s.settings.bierFirst) {
      const names = s.drinks.filter((d) => !d.archived).map((d) => d.name);
      if (names.join('|') === 'Limo|Bier|Spezi') {
        const bier = s.drinks.find((d) => d.name === 'Bier' && !d.archived);
        s.drinks.splice(s.drinks.indexOf(bier), 1);
        s.drinks.splice(s.drinks.indexOf(s.drinks.find((d) => d.name === 'Limo' && !d.archived)), 0, bier);
      }
      s.settings.bierFirst = true;
    }
    // v1: „bezahlt“-Haken pro Monat → Zahlungen in Höhe des Monatsbetrags
    for (const key of Object.keys(s.months).sort()) {
      const m = s.months[key];
      m.prices ||= {};
      m.counts ||= {};
      if (m.paid) {
        for (const pid of Object.keys(m.paid)) {
          if (!m.paid[pid]) continue;
          const amount = charge(s, key, pid);
          if (amount > 0) s.payments.push({ id: uid(), pid, month: key, amount, date: null, method: 'bar', legacy: true });
        }
        delete m.paid;
      }
    }
    s.version = VERSION;
    return s;
  }

  /* --------------------------- Striche & Preise --------------------------- */

  const priceOf = (m, d) => (typeof m?.prices?.[d.id] === 'number' ? m.prices[d.id] : d.price);
  const count = (m, w, pid, did) => m?.counts?.[w]?.[pid]?.[did] || 0;

  function monthTotal(m, pid, did) {
    let n = 0;
    for (const w in (m?.counts || {})) n += m.counts[w]?.[pid]?.[did] || 0;
    return n;
  }

  function ensureMonth(st, key) {
    let m = st.months[key];
    if (!m) {
      m = st.months[key] = { prices: {}, counts: {} };
      st.drinks.filter((d) => !d.archived).forEach((d) => { m.prices[d.id] = d.price; });
    }
    return m;
  }

  function setCount(st, key, w, pid, did, value) {
    const m = ensureMonth(st, key);
    if (m.prices[did] === undefined) {
      const d = st.drinks.find((x) => x.id === did);
      if (d) m.prices[did] = d.price;
    }
    const week = (m.counts[w] ??= {});
    const pc = (week[pid] ??= {});
    if (value > 0) pc[did] = value; else delete pc[did];
    if (!Object.keys(pc).length) delete week[pid];
    if (!Object.keys(week).length) delete m.counts[w];
  }

  /* ------------------------------ Abrechnung ------------------------------ */

  /** Betrag einer Person in einem Monat (alle Getränke, Monatspreise). */
  function charge(st, key, pid) {
    const m = st.months[key];
    if (!m) return 0;
    return round2(st.drinks.reduce((s, d) => s + monthTotal(m, pid, d.id) * priceOf(m, d), 0));
  }

  /**
   * Konto einer Person aus Sicht eines Monats. Zahlungen werden der Reihe nach
   * auf die ältesten offenen Monate angerechnet; Überschuss ist Guthaben.
   */
  function account(st, pid, key) {
    let before = 0;
    let all = 0;
    for (const k of Object.keys(st.months)) {
      const c = charge(st, k, pid);
      all += c;
      if (k < key) before += c;
    }
    const c = charge(st, key, pid);
    const mine = st.payments.filter((x) => x.pid === pid);
    const paid = mine.reduce((s, x) => s + x.amount, 0);
    const paidThis = mine.filter((x) => x.month === key).reduce((s, x) => s + x.amount, 0);
    const covered = Math.min(c, Math.max(0, paid - before));
    const due = round2(Math.max(0, before + c - paid));
    return {
      charge: c,
      carry: round2(Math.max(0, before - paid)),
      covered: round2(covered),
      openThis: round2(c - covered),
      due,
      credit: round2(Math.max(0, paid - all)),
      paidThis: round2(paidThis),
      settled: due < 0.005,
      relevant: c > 0 || due > 0 || paidThis > 0,
    };
  }

  /** Ältester Monat, der (nach Verrechnung aller Zahlungen) noch nicht voll bezahlt ist. */
  function oldestUnpaid(st, pid) {
    let paid = st.payments.filter((x) => x.pid === pid).reduce((s, x) => s + x.amount, 0);
    for (const k of Object.keys(st.months).sort()) {
      const c = charge(st, k, pid);
      if (c - paid > 0.004) return k;
      paid -= c;
    }
    return null;
  }

  /** Personen, deren ältester offener Monat seit mehr als `days` Tagen vorbei ist. */
  function overdue(st, now = Date.now(), days = 14) {
    const nowKey = keyOf(new Date(now).getFullYear(), new Date(now).getMonth());
    return st.persons.map((p) => {
      const k = oldestUnpaid(st, p.id);
      if (!k || monthEnd(k) + days * DAY > now) return null;
      return { person: p, since: k, due: account(st, p.id, nowKey > k ? nowKey : k).due };
    }).filter((x) => x && x.due > 0);
  }

  /* ---------------------------- Kasse & Pfand ---------------------------- */

  const dateOrMonth = (x) => x.date || `${x.month}-28T12:00:00.000Z`;

  /** Alle Bewegungen der Barkasse, neueste zuerst. */
  function cashMovements(st) {
    const out = [];
    const drinkName = (id) => st.drinks.find((d) => d.id === id)?.name || 'Getränk';
    for (const x of st.cash) {
      const sign = x.kind === 'out' ? -1 : 1;
      out.push({
        id: x.id, src: 'cash', kind: x.kind, date: x.date, amount: round2(sign * x.amount),
        label: x.note || (x.kind === 'adjust' ? 'Kasse gezählt' : x.kind === 'out' ? 'Ausgabe' : 'Einnahme'),
        category: x.category || '',
      });
    }
    for (const x of st.payments) {
      if (x.method !== 'bar' || x.legacy) continue;
      const p = st.persons.find((y) => y.id === x.pid);
      out.push({ id: x.id, src: 'payment', kind: 'in', date: dateOrMonth(x), amount: round2(x.amount), label: `Zahlung ${p?.name || ''}`.trim(), category: 'Getränke' });
    }
    for (const x of st.purchases) {
      if (!x.fromCash || x.cost == null) continue;
      out.push({
        id: x.id, src: 'purchase', kind: 'out', date: x.date, amount: -round2(x.cost + (x.deposit || 0)),
        label: `${x.crates || 0}× Kiste ${drinkName(x.drinkId)}`, category: 'Einkauf',
      });
    }
    for (const x of st.empties) {
      if (!x.refund) continue;
      out.push({ id: x.id, src: 'empties', kind: 'in', date: x.date, amount: round2(x.refund), label: `Leergut ${drinkName(x.drinkId)}`, category: 'Pfand' });
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  const cashBalance = (st) => round2(cashMovements(st).reduce((s, x) => s + x.amount, 0));

  /** Offenes Pfand je Getränk: gekaufte minus zurückgebrachte Kisten. */
  function deposits(st) {
    const rows = st.drinks.map((d) => {
      const bought = st.purchases.filter((x) => x.drinkId === d.id);
      const back = st.empties.filter((x) => x.drinkId === d.id);
      const crates = bought.reduce((s, x) => s + (x.crates || 0), 0) - back.reduce((s, x) => s + (x.crates || 0), 0);
      const value = round2(bought.reduce((s, x) => s + (x.deposit || 0), 0) - back.reduce((s, x) => s + (x.refund || 0), 0));
      return { drink: d, crates, value };
    }).filter((r) => r.crates !== 0 || r.value !== 0 || r.drink.crateDeposit != null);
    return { rows, total: round2(rows.reduce((s, r) => s + r.value, 0)) };
  }

  /* ------------------------ Zusammenführen (Sync) ------------------------ */

  function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
    return JSON.stringify(v);
  }
  const same = (a, b) => stable(a) === stable(b);

  function mergeValue(b, l, r, counter) {
    if (same(l, b)) return r;
    if (same(r, b)) return l;
    if (counter && typeof l === 'number' && typeof r === 'number') {
      const base = typeof b === 'number' ? b : 0;
      return base + (l - base) + (r - base);
    }
    return l; // echter Konflikt: dieses Gerät gewinnt
  }

  function mergeRecord(b = {}, l = {}, r = {}, counters = []) {
    const out = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
      const v = mergeValue(b[k], l[k], r[k], counters.includes(k));
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  function mergeList(b = [], l = [], r = [], counters = []) {
    const B = new Map(b.map((x) => [x.id, x]));
    const L = new Map(l.map((x) => [x.id, x]));
    const R = new Map(r.map((x) => [x.id, x]));
    // Hat dieses Gerät umsortiert? Dann zählt seine Reihenfolge, sonst die entfernte.
    const localOrder = l.map((x) => x.id).filter((id) => B.has(id));
    const baseOrder = b.map((x) => x.id).filter((id) => L.has(id));
    const primary = same(localOrder, baseOrder) ? r : l;
    const ids = [...new Set([...primary, ...r, ...l].map((x) => x.id))];
    const out = [];
    for (const id of ids) {
      const inB = B.has(id);
      const inL = L.has(id);
      const inR = R.has(id);
      if (inL && inR) out.push(mergeRecord(B.get(id), L.get(id), R.get(id), counters));
      else if (inL && !inB) out.push(L.get(id)); // hier neu
      else if (inR && !inB) out.push(R.get(id)); // dort neu
      // sonst: auf einer Seite gelöscht → bleibt gelöscht
    }
    return out;
  }

  function mergeCounts(b = {}, l = {}, r = {}) {
    const out = {};
    const weeks = new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]);
    for (const w of weeks) {
      const pids = new Set([...Object.keys(b[w] || {}), ...Object.keys(l[w] || {}), ...Object.keys(r[w] || {})]);
      for (const pid of pids) {
        const dids = new Set([...Object.keys(b[w]?.[pid] || {}), ...Object.keys(l[w]?.[pid] || {}), ...Object.keys(r[w]?.[pid] || {})]);
        for (const did of dids) {
          const vb = b[w]?.[pid]?.[did] || 0;
          const v = Math.max(0, vb + ((l[w]?.[pid]?.[did] || 0) - vb) + ((r[w]?.[pid]?.[did] || 0) - vb));
          if (v > 0) ((out[w] ??= {})[pid] ??= {})[did] = v;
        }
      }
    }
    return out;
  }

  function mergeMonths(b = {}, l = {}, r = {}) {
    const out = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
      const bm = b[k] || {};
      const lm = l[k];
      const rm = r[k];
      const counts = mergeCounts(bm.counts, lm?.counts, rm?.counts);
      let prices;
      if (lm && rm) prices = mergeRecord(bm.prices, lm.prices, rm.prices);
      else prices = { ...((lm || rm || bm).prices || {}) };
      const closed = mergeValue(bm.closed, lm?.closed, rm?.closed);
      if (!Object.keys(counts).length && !closed && (!lm || !rm)) continue;
      out[k] = { prices, counts };
      if (closed) out[k].closed = closed;
    }
    return out;
  }

  /**
   * Dreiwege-Zusammenführung: `base` ist der zuletzt gemeinsame Stand,
   * `local` dieses Gerät, `remote` der Stand in der Cloud.
   * Striche und Lagerbestand werden addiert, Listen nach id vereinigt.
   */
  function mergeState(base, local, remote) {
    if (!base) return migrate(JSON.parse(JSON.stringify(remote)));
    const b = migrate(JSON.parse(JSON.stringify(base)));
    const l = migrate(JSON.parse(JSON.stringify(local)));
    const r = migrate(JSON.parse(JSON.stringify(remote)));
    return {
      version: VERSION,
      persons: mergeList(b.persons, l.persons, r.persons),
      drinks: mergeList(b.drinks, l.drinks, r.drinks, ['stock']),
      months: mergeMonths(b.months, l.months, r.months),
      payments: mergeList(b.payments, l.payments, r.payments),
      purchases: mergeList(b.purchases, l.purchases, r.purchases),
      empties: mergeList(b.empties, l.empties, r.empties),
      cash: mergeList(b.cash, l.cash, r.cash),
      settings: mergeRecord(b.settings, l.settings, r.settings),
    };
  }

  return {
    VERSION, DAY, COLOR_NAMES, PERSON_CYCLE, METHODS,
    round2, uid, parsePrice, parseCount, keyOf, monthEnd, guessDrink, newDrink,
    defaultState, isValidState, sanitize, migrate,
    priceOf, count, monthTotal, ensureMonth, setCount,
    charge, account, oldestUnpaid, overdue,
    cashMovements, cashBalance, deposits,
    stable, same, mergeState,
  };
}));
