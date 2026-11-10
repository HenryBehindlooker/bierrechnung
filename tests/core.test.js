// Tests für den Rechenkern – ausführen mit:  npm test   (oder: node --test tests/)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

/** Kleiner Datenstand mit festen ids. */
function fixture() {
  return Core.migrate({
    version: 3,
    persons: [{ id: 'leo', name: 'Leo' }, { id: 'max', name: 'Max' }],
    drinks: [
      { id: 'limo', name: 'Limo', price: 1.5 },
      { id: 'bier', name: 'Bier', price: 1.8 },
    ],
    months: {},
    payments: [],
  });
}
const tally = (st, key, w, pid, did, n) =>
  Core.setCount(st, key, w, pid, did, Core.count(st.months[key], w, pid, did) + n);
const clone = (x) => JSON.parse(JSON.stringify(x));

test('Betrag pro Monat nutzt die Monatspreise', () => {
  const st = fixture();
  tally(st, '2026-10', 1, 'leo', 'bier', 3);
  tally(st, '2026-10', 5, 'leo', 'limo', 1);
  assert.equal(Core.charge(st, '2026-10', 'leo'), 6.9);
  // Preiserhöhung später ändert den alten Monat nicht
  st.drinks[1].price = 2.1;
  assert.equal(Core.charge(st, '2026-10', 'leo'), 6.9);
  tally(st, '2026-11', 1, 'leo', 'bier', 1);
  assert.equal(Core.charge(st, '2026-11', 'leo'), 2.1);
});

test('Gleitkomma: 3 × 1,10 € ergibt genau 3,30 €', () => {
  const st = fixture();
  st.drinks[0].price = 1.1;
  tally(st, '2026-10', 1, 'leo', 'limo', 3);
  assert.equal(Core.charge(st, '2026-10', 'leo'), 3.3);
  assert.equal(Core.account(st, 'leo', '2026-10').due, 3.3);
});

test('Offene Beträge werden in den Folgemonat übernommen', () => {
  const st = fixture();
  tally(st, '2026-09', 1, 'max', 'bier', 2); // 3,60
  tally(st, '2026-10', 1, 'max', 'limo', 2); // 3,00
  const a = Core.account(st, 'max', '2026-10');
  assert.equal(a.charge, 3);
  assert.equal(a.carry, 3.6);
  assert.equal(a.due, 6.6);
  assert.equal(a.settled, false);
});

test('Zahlungen werden auf die ältesten Monate angerechnet', () => {
  const st = fixture();
  tally(st, '2026-09', 1, 'max', 'bier', 2); // 3,60
  tally(st, '2026-10', 1, 'max', 'limo', 2); // 3,00
  st.payments.push({ id: 'p1', pid: 'max', month: '2026-10', amount: 5, method: 'bar' });
  const sep = Core.account(st, 'max', '2026-09');
  const oct = Core.account(st, 'max', '2026-10');
  assert.equal(sep.settled, true, 'September ist durch die Zahlung gedeckt');
  assert.equal(oct.carry, 0);
  assert.equal(oct.covered, 1.4);
  assert.equal(oct.due, 1.6);
  assert.equal(Core.oldestUnpaid(st, 'max'), '2026-10');
});

test('Überzahlung wird zu Guthaben', () => {
  const st = fixture();
  tally(st, '2026-10', 1, 'leo', 'bier', 1); // 1,80
  st.payments.push({ id: 'p1', pid: 'leo', month: '2026-10', amount: 10, method: 'bar' });
  const a = Core.account(st, 'leo', '2026-10');
  assert.equal(a.settled, true);
  assert.equal(a.credit, 8.2);
  tally(st, '2026-11', 1, 'leo', 'bier', 2); // 3,60 im November, durch Guthaben gedeckt
  assert.equal(Core.account(st, 'leo', '2026-11').due, 0);
  assert.equal(Core.account(st, 'leo', '2026-11').credit, 4.6);
});

test('Überfällig: ältester offener Monat seit über 14 Tagen vorbei', () => {
  const st = fixture();
  tally(st, '2026-09', 1, 'max', 'bier', 1);
  tally(st, '2026-10', 3, 'leo', 'bier', 1);
  const nov10 = new Date(2026, 10, 10).getTime();
  const list = Core.overdue(st, nov10);
  assert.deepEqual(list.map((x) => x.person.id), ['max']); // Oktober endete erst vor 9 Tagen
  assert.equal(list[0].since, '2026-09');
  const nov20 = new Date(2026, 10, 20).getTime();
  assert.deepEqual(Core.overdue(st, nov20).map((x) => x.person.id).sort(), ['leo', 'max']);
});

test('Übernahme v1: Bezahlt-Haken werden zu Zahlungen, nichts geht verloren', () => {
  const v1 = {
    version: 1,
    persons: [{ id: 'p1', name: 'Leo', archived: false }],
    drinks: [{ id: 'd1', name: 'Bier', price: 1.8, archived: false }],
    months: { '2026-10': { prices: { d1: 1.8 }, counts: { 1: { p1: { d1: 3 } } }, paid: { p1: true } } },
  };
  const s = Core.migrate(clone(v1));
  assert.equal(s.version, Core.VERSION);
  assert.equal(s.payments.length, 1);
  assert.equal(s.payments[0].amount, 5.4);
  assert.equal(s.payments[0].method, 'bar');
  assert.equal(s.payments[0].legacy, true);
  assert.equal(Core.cashBalance(s), 0, 'alte Zahlungen landen nicht in der neuen Kasse');
  assert.equal(s.months['2026-10'].paid, undefined);
  assert.equal(s.months['2026-10'].counts[1].p1.d1, 3);
  assert.equal(s.drinks[0].emoji, '🍺');
  assert.deepEqual(s.cash, []);
  assert.equal(s.settings.purchasesFromCash, true);
  // erneutes Übernehmen ist unschädlich (idempotent)
  assert.equal(Core.migrate(clone(s)).payments.length, 1);
});

test('Übernahme v2: Zahlungen und Einkäufe vor dem Kassenbuch zählen nicht zur Kasse', () => {
  const v2 = Core.migrate({
    version: 2,
    persons: [{ id: 'leo', name: 'Leo' }],
    drinks: [{ id: 'bier', name: 'Bier', price: 1.8, stock: 20 }],
    months: {},
    payments: [{ id: 'x', pid: 'leo', month: '2026-10', amount: 5, date: '2026-10-03T10:00:00Z' }],
    purchases: [{ id: 'k', drinkId: 'bier', date: '2026-10-02T10:00:00Z', crates: 1, bottles: 20, cost: 15 }],
  });
  assert.equal(v2.purchases[0].fromCash, false);
  assert.equal(Core.cashBalance(v2), 0);
  v2.payments.push({ id: 'y', pid: 'leo', month: '2026-11', amount: 2, method: 'bar', date: '2026-11-03T10:00:00Z' });
  assert.equal(Core.cashBalance(v2), 2, 'neue Barzahlungen zählen');
});

test('Bier steht oben: neue Listen und einmalige Umstellung alter Listen', () => {
  assert.deepEqual(Core.defaultState().drinks.map((d) => d.name), ['Bier', 'Limo', 'Spezi']);
  const old = Core.migrate({
    version: 2,
    persons: [],
    drinks: [{ id: 'l', name: 'Limo', price: 1.5 }, { id: 'b', name: 'Bier', price: 1.8 }, { id: 's', name: 'Spezi', price: 1.8 }],
    months: {},
  });
  assert.deepEqual(old.drinks.map((d) => d.id), ['b', 'l', 's']);
  // danach frei sortierbar: wer Limo wieder nach oben holt, behält das
  old.drinks.reverse();
  assert.deepEqual(Core.migrate(clone(old)).drinks.map((d) => d.id), ['s', 'l', 'b']);
  // selbst sortierte Listen werden nicht angefasst
  const custom = Core.migrate({
    version: 2, persons: [], months: {},
    drinks: [{ id: 's', name: 'Spezi', price: 1.8 }, { id: 'l', name: 'Limo', price: 1.5 }, { id: 'b', name: 'Bier', price: 1.8 }],
  });
  assert.deepEqual(custom.drinks.map((d) => d.id), ['s', 'l', 'b']);
});

test('Prüfung: präparierte Daten werden bereinigt, gültige bleiben unverändert', () => {
  const xss = '"><img src=x onerror=alert(1)>';
  const dirty = fixture();
  tally(dirty, '2026-10', 1, 'leo', 'bier', 2);
  dirty.persons.push({ id: xss, name: 'x' }, { id: '__proto__', name: 'x' }, { id: 'leo', name: 'Doppelt' });
  dirty.persons[0].color = xss;
  dirty.drinks[0].perCrate = `5${xss}`;
  dirty.drinks[0].stock = xss;
  dirty.drinks[0].price = '1.5';
  dirty.months[xss] = { counts: {} };
  dirty.months['2026-10'].counts[1].leo.limo = `3${xss}`;
  dirty.months['2026-10'].counts[1][xss] = { bier: 1 };
  dirty.months['2026-10'].counts[9] = { leo: { bier: 1 } };
  dirty.months['2026-10'].unbekannt = xss;
  dirty.payments.push({ id: 'ok', pid: 'leo', month: '2026-10', amount: 2, method: 'bar' },
    { id: 'neg', pid: 'leo', month: '2026-10', amount: -5 }, { id: 'mon', pid: 'leo', month: xss, amount: 5 },
    { id: 'str', pid: 'leo', month: '2026-10', amount: '5' });
  dirty.purchases = [{ id: 'k', drinkId: 'bier', crates: xss, bottles: 20, cost: 15, date: xss }];
  dirty.cash = [{ id: 'c', kind: 'in', amount: 5, note: `Hallo\u0000${'x'.repeat(100)}`, date: '2026-10-01T10:00:00Z' }, { id: 'c2', kind: xss, amount: 5 }];
  dirty.settings.defaultMethod = xss;
  dirty.settings.fremd = xss;

  const s = Core.migrate(clone(dirty));
  assert.deepEqual(s.persons.map((p) => p.id), ['leo', 'max'], 'ungültige und doppelte ids fallen weg');
  assert.ok(Core.COLOR_NAMES.includes(s.persons[0].color));
  assert.equal(s.drinks[0].perCrate, 12, 'kaputte Kistengröße → Standard');
  assert.equal(s.drinks[0].stock, null);
  assert.equal(s.drinks[0].price, 0, 'Preis als Text wird nicht übernommen');
  assert.deepEqual(Object.keys(s.months), ['2026-10']);
  assert.deepEqual(s.months['2026-10'].counts, { 1: { leo: { bier: 2 } } });
  assert.equal(s.months['2026-10'].unbekannt, undefined);
  assert.deepEqual(s.payments.map((p) => p.id), ['ok']);
  assert.equal(s.purchases[0].crates, 0);
  assert.equal(s.purchases[0].date, '1970-01-01T00:00:00.000Z');
  assert.equal(s.cash.length, 1);
  assert.equal(s.cash[0].note.length, 60);
  assert.equal(s.settings.defaultMethod, 'bar');
  assert.equal(s.settings.fremd, undefined);
  assert.equal(JSON.stringify(s).includes('<img'), false, 'kein HTML mehr in den Daten');
  assert.equal({}.polluted, undefined);

  // ein sauberer Stand übersteht die Prüfung unverändert
  const clean = Core.defaultState();
  tally(clean, '2026-11', 2, clean.persons[0].id, clean.drinks[0].id, 3);
  clean.payments.push({ id: 'p1', pid: clean.persons[0].id, month: '2026-11', amount: 5.4, date: '2026-11-10T10:00:00.000Z', method: 'paypal' });
  assert.deepEqual(Core.migrate(clone(clean)), clean);
});

test('Ungültige Daten werden erkannt', () => {
  assert.equal(Core.isValidState(null), false);
  assert.equal(Core.isValidState({ persons: [], drinks: [] }), false);
  assert.equal(Core.isValidState({ persons: [], drinks: [], months: [] }), false);
  assert.equal(Core.isValidState(fixture()), true);
});

test('Kasse: Barzahlungen, Einkäufe aus der Kasse, Pfand und Buchungen', () => {
  const st = fixture();
  st.cash.push({ id: 'c1', kind: 'in', amount: 50, date: '2026-10-01T10:00:00Z', note: 'Anfangsbestand' });
  st.payments.push({ id: 'p1', pid: 'leo', month: '2026-10', amount: 10, method: 'bar', date: '2026-10-05T10:00:00Z' });
  st.payments.push({ id: 'p2', pid: 'max', month: '2026-10', amount: 7, method: 'paypal', date: '2026-10-05T11:00:00Z' });
  st.purchases.push({ id: 'k1', drinkId: 'bier', crates: 1, bottles: 20, cost: 15, deposit: 3.1, fromCash: true, date: '2026-10-06T10:00:00Z' });
  st.purchases.push({ id: 'k2', drinkId: 'bier', crates: 1, bottles: 20, cost: 15, deposit: 3.1, fromCash: false, date: '2026-10-07T10:00:00Z' });
  st.cash.push({ id: 'c2', kind: 'out', amount: 4.5, date: '2026-10-08T10:00:00Z', note: 'Chips' });
  st.empties.push({ id: 'e1', drinkId: 'bier', crates: 1, refund: 3.1, date: '2026-10-09T10:00:00Z' });
  // 50 + 10 − 18,10 − 4,50 + 3,10 = 40,50 (PayPal und nicht-bar Einkauf zählen nicht)
  assert.equal(Core.cashBalance(st), 40.5);
  const mv = Core.cashMovements(st);
  assert.equal(mv[0].id, 'e1', 'neueste zuerst');
  const dep = Core.deposits(st);
  const bier = dep.rows.find((r) => r.drink.id === 'bier');
  assert.equal(bier.crates, 1);
  assert.equal(bier.value, 3.1);
  assert.equal(dep.total, 3.1);
});

test('Sync: gleichzeitige Striche auf zwei Geräten werden addiert', () => {
  const base = fixture();
  tally(base, '2026-10', 1, 'leo', 'bier', 2);
  const a = clone(base);
  const b = clone(base);
  tally(a, '2026-10', 1, 'leo', 'bier', 1); // Gerät A: +1
  tally(b, '2026-10', 1, 'leo', 'bier', 3); // Gerät B: +3
  tally(b, '2026-10', 2, 'max', 'limo', 1);
  const m = Core.mergeState(base, a, b);
  assert.equal(m.months['2026-10'].counts[1].leo.bier, 6);
  assert.equal(m.months['2026-10'].counts[2].max.limo, 1);
});

test('Sync: Abziehen auf einem Gerät, Hinzufügen auf dem anderen', () => {
  const base = fixture();
  tally(base, '2026-10', 1, 'leo', 'bier', 2);
  const a = clone(base);
  const b = clone(base);
  tally(a, '2026-10', 1, 'leo', 'bier', -2);
  tally(b, '2026-10', 1, 'leo', 'bier', 1);
  assert.equal(Core.mergeState(base, a, b).months['2026-10'].counts[1].leo.bier, 1);
});

test('Sync: neue Personen und Zahlungen von beiden Seiten bleiben erhalten', () => {
  const base = fixture();
  const a = clone(base);
  const b = clone(base);
  a.persons.push({ id: 'jonas', name: 'Jonas', color: 'purple', archived: false });
  b.persons.push({ id: 'gast', name: 'Gast', color: 'pink', archived: false });
  a.payments.push({ id: 'pa', pid: 'leo', month: '2026-10', amount: 5, method: 'bar' });
  b.payments.push({ id: 'pb', pid: 'max', month: '2026-10', amount: 3, method: 'bar' });
  const m = Core.mergeState(base, a, b);
  assert.deepEqual(m.persons.map((p) => p.id).sort(), ['gast', 'jonas', 'leo', 'max']);
  assert.deepEqual(m.payments.map((p) => p.id).sort(), ['pa', 'pb']);
});

test('Sync: Löschen auf einer Seite bleibt gelöscht, Umbenennen wird übernommen', () => {
  const base = fixture();
  base.payments.push({ id: 'p1', pid: 'leo', month: '2026-10', amount: 5, method: 'bar' });
  const a = clone(base);
  const b = clone(base);
  a.payments = []; // A löscht die Zahlung
  b.persons[0].name = 'Leonhard'; // B benennt um
  const m = Core.mergeState(base, a, b);
  assert.equal(m.payments.length, 0);
  assert.equal(m.persons.find((p) => p.id === 'leo').name, 'Leonhard');
});

test('Sync: Lagerbestand wird wie ein Zähler zusammengeführt', () => {
  const base = fixture();
  base.drinks[1].stock = 40;
  const a = clone(base);
  const b = clone(base);
  a.drinks[1].stock = 37; // drei Striche auf A
  b.drinks[1].stock = 58; // B: Kiste gekauft (+20) und zwei Striche
  assert.equal(Core.mergeState(base, a, b).drinks[1].stock, 55);
});

test('Sync: Umsortieren auf einem Gerät gewinnt', () => {
  const base = fixture();
  const a = clone(base);
  const b = clone(base);
  a.persons.reverse();
  b.persons.push({ id: 'neu', name: 'Neu', color: 'red', archived: false });
  const m = Core.mergeState(base, a, b);
  assert.deepEqual(m.persons.map((p) => p.id), ['max', 'leo', 'neu']);
});

test('Sync: Monat geleert auf einem Gerät, neue Striche auf dem anderen bleiben', () => {
  const base = fixture();
  tally(base, '2026-10', 1, 'leo', 'bier', 4);
  const a = clone(base);
  const b = clone(base);
  delete a.months['2026-10'];
  tally(b, '2026-10', 1, 'max', 'bier', 1);
  const m = Core.mergeState(base, a, b);
  assert.equal(m.months['2026-10'].counts[1].leo, undefined);
  assert.equal(m.months['2026-10'].counts[1].max.bier, 1);
  assert.equal(m.months['2026-10'].prices.bier, 1.8, 'Monatspreise bleiben erhalten');
});

test('Sync: ohne gemeinsamen Stand wird der Cloud-Stand übernommen', () => {
  const remote = fixture();
  tally(remote, '2026-10', 1, 'leo', 'bier', 1);
  const m = Core.mergeState(null, fixture(), remote);
  assert.equal(m.months['2026-10'].counts[1].leo.bier, 1);
});

test('Preise und Zählerstände werden robust eingelesen', () => {
  assert.equal(Core.parsePrice('1,80'), 1.8);
  assert.equal(Core.parsePrice(' 2.5 € '), 2.5);
  assert.equal(Core.parsePrice('abc'), null);
  assert.equal(Core.parsePrice('-1'), null);
  assert.equal(Core.parseCount('12'), 12);
  assert.equal(Core.parseCount('1,5'), null);
});
