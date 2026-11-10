// Abnahmetests (Acceptance Tests) im echten Browser – ausführen mit:  npm run test:acceptance
// Jede Anforderung hat eine Kennung und wird als Userflow durchgespielt, so wie
// jemand in der Stube die App bedient. Die Uhr steht fest auf Di, 10.11.2026.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('Playwright ist nicht installiert – Abnahmetests übersprungen (npm i -D playwright).');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const STORE = 'zirbenstube-getraenkeliste-v1';
const NOW = new Date(2026, 10, 10, 12, 0, 0); // 10. November 2026 → Woche 2
const only = process.argv[2];

function serve(req, res) {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

/** Datenstand mit festen ids: Leo/Max/Jonas, Bier/Limo/Spezi. */
function seed(extra = {}) {
  return {
    version: 3,
    persons: [['leo', 'Leo', 'blue'], ['max', 'Max', 'green'], ['jonas', 'Jonas', 'purple']].map(([id, name, color]) => ({ id, name, color, archived: false })),
    drinks: [['bier', 'Bier', 1.8, '🍺'], ['limo', 'Limo', 1.5, '🍋'], ['spezi', 'Spezi', 1.8, '🥤']]
      .map(([id, name, price, emoji]) => ({ id, name, price, emoji, color: 'orange', archived: false, stock: null, perCrate: 20, crateCost: null, crateDeposit: null, minStock: null })),
    months: {},
    payments: [],
    purchases: [],
    empties: [],
    cash: [],
    settings: { paypal: '', note: '', defaultMethod: 'bar', purchasesFromCash: true, bierFirst: true },
    ...extra,
  };
}
const prices = { bier: 1.8, limo: 1.5, spezi: 1.8 };
const txt = (s) => s.replace(/\s+/g, ' ').trim(); // geschützte Leerzeichen der Euro-Beträge normalisieren

const tests = [];
const test = (id, title, fn, opts = {}) => tests.push({ id, title, fn, opts });

/* =========================== A · Strichliste =========================== */

test('A-01', 'Neue Liste: 5 Personen und Bier, Limo, Spezi mit Preisen – Bier zuerst', async ({ page }) => {
  assert.deepEqual(await page.locator('.person-head span:not(.avatar)').allInnerTexts(), ['Leo', 'Max', 'Jonas', 'Gast 1', 'Gast 2']);
  const first = page.locator('.list-section').first();
  assert.deepEqual(await first.locator('.row .title').allInnerTexts(), ['Bier', 'Limo', 'Spezi']);
  assert.deepEqual((await first.locator('.row .subtitle').allInnerTexts()).map(txt), ['1,80 €', '1,50 €', '1,80 €']);
});

test('A-02', 'Aktueller Monat und aktuelle Woche sind vorausgewählt; Wochen 1–5, Februar hat 4', async ({ page }) => {
  assert.equal(await page.locator('#largeSubtitle').innerText(), 'November 2026');
  assert.equal(await page.locator('.segmented [aria-checked="true"]').getAttribute('data-week'), '2');
  assert.equal(await page.locator('.segmented [data-week]').count(), 5);
  assert.match(await page.locator('.seg-caption').innerText(), /Woche 2 · 8\.–14\. November · diese Woche/);
  for (let i = 0; i < 3; i++) await page.click('[data-nav="next"]');
  assert.equal(await page.locator('#largeSubtitle').innerText(), 'Februar 2027');
  assert.equal(await page.locator('.segmented [data-week]').count(), 4);
  await page.click('[data-nav="today"]');
  assert.equal(await page.locator('#largeSubtitle').innerText(), 'November 2026');
}, { state: seed() });

test('A-03', 'Strich mit einem Tipp setzen und abziehen; bleibt nach Neuladen erhalten', async ({ page }) => {
  await page.click('[data-act="inc"][data-p="leo"][data-d="bier"]');
  await page.click('[data-act="inc"][data-p="leo"][data-d="bier"]');
  await page.click('[data-act="dec"][data-p="leo"][data-d="bier"]');
  assert.equal(await page.locator('[data-count="leo-bier"]').innerText(), '1');
  assert.equal(await page.locator('[data-act="dec"][data-p="leo"][data-d="limo"]').isDisabled(), true, 'unter 0 geht nicht');
  await page.reload();
  assert.equal(await page.locator('[data-count="leo-bier"]').innerText(), '1');
  assert.match(txt(await page.locator('.list-section').first().locator('.section-footer').innerText()), /Woche 2: 1,80 € · Monat: 1,80 €/);
}, { state: seed() });

test('A-04', 'Jede Änderung lässt sich direkt rückgängig machen', async ({ page }) => {
  await page.click('[data-act="inc"][data-p="max"][data-d="spezi"]');
  assert.match(await page.locator('#hud').innerText(), /Max · \+1 Spezi/);
  await page.click('#hud [data-undo]');
  assert.equal(await page.locator('[data-count="max-spezi"]').innerText(), '0');
}, { state: seed() });

test('A-05', 'Theke: Person antippen, Getränk antippen = ein Strich; Gast direkt anlegen', async ({ page }) => {
  await page.click('[data-nav="theke"]');
  await page.click('[data-theke-person="jonas"]');
  await page.click('[data-theke-drink="bier"]');
  assert.match(await page.locator('[data-theke-person="jonas"]').innerText(), /1 Getränk diese Woche/);
  await page.click('[data-theke-guest]');
  await page.fill('.alert-input', 'Sepp');
  await page.keyboard.press('Enter');
  await page.click('[data-theke-drink="limo"]');
  await page.click('[data-theke-close]');
  assert.equal(await page.locator('[data-count="jonas-bier"]').innerText(), '1');
  assert.ok((await page.locator('.person-head').allInnerTexts()).some((t) => t.includes('Sepp')));
}, { state: seed() });

/* ========================= B · Monatsabrechnung ========================= */

const billState = () => seed({
  months: {
    '2026-10': { prices, counts: { 2: { max: { bier: 2 } } } }, // Max: 3,60 € offen aus Oktober
    '2026-11': { prices, counts: { 1: { leo: { bier: 3, limo: 1 } }, 2: { max: { spezi: 2 } } } },
  },
});

test('B-01', 'Stückzahl × Preis ergibt den Betrag je Person; Gesamtbetrag stimmt', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  assert.equal(txt(await page.locator('.summary .big').innerText()), '10,50 €');
  const leo = txt(await page.locator('.bill-row').nth(0).innerText());
  assert.match(leo, /3× Bier · 1× Limo/);
  assert.match(leo, /6,90 €/);
  assert.match(txt(await page.locator('.list.tiles .row').first().innerText()), /Bier 3 Stk\. × 1,80 € 5,40 €/);
}, { state: billState() });

test('B-02', 'Offene Beträge aus Vormonaten werden mitgenommen', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  assert.match(txt(await page.locator('.bill-row').nth(1).innerText()), /Offen 7,20 € \(inkl\. Vormonate\)/);
  assert.match(txt(await page.locator('.carry-note').innerText()), /3,60 € offen aus Vormonaten/);
}, { state: billState() });

test('B-03', 'Bezahlt abhaken, Teilzahlung und Guthaben', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  await page.click('[data-paid="leo"]');
  assert.match(txt(await page.locator('.bill-row').nth(0).innerText()), /Bezahlt/);
  assert.match(txt(await page.locator('.legend').innerText()), /Bezahlt 6,90 €/);
  // Max zahlt 5 € von 7,20 € → 2,20 € offen
  await page.click('[data-open-person="max"]');
  await page.fill('#sheetBody [name="amount"]', '5');
  await page.click('#sheetBody form[data-form="payment"] button.prominent');
  assert.match(txt(await page.locator('#sheetBody .total-row').innerText()), /Noch offen 2,20 €/);
  // dann 10 € → 7,80 € Guthaben
  await page.fill('#sheetBody [name="amount"]', '10');
  await page.click('#sheetBody form[data-form="payment"] button.prominent');
  assert.match(txt(await page.locator('#sheetBody .total-row').innerText()), /Guthaben 7,80 €/);
}, { state: billState() });

test('B-04', 'Preisänderung gilt ab jetzt – alte Monate behalten ihren Preis', async ({ page }) => {
  await page.click('[data-tab="einstellungen"]');
  await page.fill('[data-price-drink="bier"]', '2,50');
  await page.press('[data-price-drink="bier"]', 'Tab');
  await page.click('[data-tab="abrechnung"]');
  assert.match(txt(await page.locator('.bill-row').nth(0).innerText()), /9,00 €/, 'November: 3 × 2,50 + 1,50');
  await page.click('[data-nav="prev"]');
  assert.match(txt(await page.locator('.bill-row').nth(1).innerText()), /3,60 €/, 'Oktober bleibt bei 2 × 1,80');
}, { state: billState() });

test('B-05', 'Monat abschließen sperrt Striche (auch in der Theke); wieder öffnen möglich', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  await page.click('[data-action="close-month"]');
  await page.click('.alert-btn.default');
  assert.match(await page.locator('#largeSubtitle').innerText(), /abgeschlossen/);
  await page.click('[data-tab="liste"]');
  assert.equal(await page.locator('[data-act="inc"]').first().isDisabled(), true);
  await page.click('[data-nav="theke"]');
  assert.equal(await page.locator('[data-theke-person]').first().isDisabled(), true);
  await page.click('[data-theke-close]');
  await page.click('[data-action="reopen-month"]');
  assert.equal(await page.locator('[data-act="inc"]').first().isDisabled(), false);
}, { state: billState() });

test('B-06', 'Druck: ausgefüllte Abrechnung und leere Vorlage wie das Original, je eine A4-Seite', async ({ page }) => {
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('[data-tab="abrechnung"]');
  await page.click('[data-print="filled"]');
  let sheet = txt(await page.locator('#print').innerText());
  assert.match(sheet, /Zirbenstube – Getränkeliste/);
  assert.match(sheet, /3 Stk\. \/ 5,40 €/);
  assert.match(sheet, /Aus Vormonaten/);
  await page.emulateMedia({ media: 'print' });
  const pages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages(await page.pdf({ format: 'A4' })), 1, 'Abrechnung passt auf eine Seite');
  await page.evaluate(() => document.querySelector('[data-print="blank"]').click());
  sheet = txt(await page.locator('#print').innerText());
  assert.equal(await page.locator('#print table.sheet').count(), 6, '5 Wochen + Monatsabrechnung');
  assert.match(sheet, /____ Stk\. \/ ____ €/);
  assert.match(sheet, /Gesamtbetrag \(€\)/);
  assert.equal(pages(await page.pdf({ format: 'A4' })), 1, 'Vorlage passt auf eine Seite');
}, { state: billState() });

test('B-07', 'Abrechnung verschicken: Text mit Getränken, offenem Betrag und PayPal-Link', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  await page.click('[data-open-person="max"]');
  await page.click('[data-share-person="max"]');
  const text = txt(await page.evaluate(() => navigator.clipboard.readText()));
  assert.match(text, /Hallo Max/);
  assert.match(text, /2× Spezi à 1,80 € = 3,60 €/);
  assert.match(text, /offen aus Vormonaten: 3,60 €/);
  assert.match(text, /Zu zahlen: 7,20 €/);
  assert.match(text, /https:\/\/paypal\.me\/zirbenstube\/7\.20EUR/);
}, { state: (() => { const s = billState(); s.settings.paypal = 'zirbenstube'; return s; })() });

/* ============================ C · Kasse & Lager ============================ */

test('C-01', 'Kasse: Zählen setzt den Stand, Barzahlung erhöht ihn, PayPal nicht', async ({ page }) => {
  await page.click('[data-tab="bestand"]');
  assert.match(await page.locator('.list-section').first().locator('.section-footer').innerText(), /So startest du/);
  await page.click('[data-cash="adjust"]');
  await page.fill('#sheetBody [name="amount"]', '50');
  await page.click('#sheetBody .sheet-actions button');
  assert.equal(txt(await page.locator('.cash-card .big').innerText()), '50,00 €');
  await page.click('[data-tab="abrechnung"]');
  await page.click('[data-paid="leo"]'); // bar 6,90
  await page.click('[data-open-person="max"]');
  await page.click('[data-pay-method="paypal"]');
  await page.click('#sheetBody form[data-form="payment"] button.prominent'); // PayPal 7,20
  await page.keyboard.press('Escape');
  await page.click('[data-tab="bestand"]');
  assert.equal(txt(await page.locator('.cash-card .big').innerText()), '56,90 €');
}, { state: billState() });

test('C-02', 'Lager: Strich zieht ab, Warnung bei niedrigem Bestand, Kiste und Leergut mit Pfand', async ({ page }) => {
  await page.click('[data-act="inc"][data-p="leo"][data-d="bier"]');
  assert.match(await page.locator('#hud').innerText(), /Bier: nur noch 5 Flaschen/);
  assert.equal(await page.locator('[data-tab="bestand"] .badge').isVisible(), true);
  await page.click('[data-tab="bestand"]');
  await page.click('[data-buy="bier"]');
  assert.equal(await page.locator('.stock-row .stock-num').first().innerText(), '25');
  assert.equal(txt(await page.locator('.cash-card .big').innerText()), '-18,10 €', 'Kiste 15 € + Pfand 3,10 € aus der Kasse');
  await page.click('[data-empties="bier"]');
  assert.equal(txt(await page.locator('.cash-card .big').innerText()), '-15,00 €', 'Pfand kommt zurück');
}, {
  state: (() => {
    const s = seed();
    Object.assign(s.drinks[0], { stock: 6, minStock: 5, crateCost: 15, crateDeposit: 3.1 });
    return s;
  })(),
});

/* ============================ D · Verwaltung ============================ */

test('D-01', 'Person anlegen, umbenennen, löschen; mit Einträgen wird sie nur ausgeblendet', async ({ page }) => {
  await page.click('[data-tab="einstellungen"]');
  await page.fill('form[data-form="person"] [name="name"]', 'Franz');
  await page.keyboard.press('Enter');
  await page.fill('[data-rename-person="jonas"]', 'Joni');
  await page.press('[data-rename-person="jonas"]', 'Tab');
  await page.click('[data-nav="edit"]');
  await page.click('[data-remove-person="leo"]'); // hat Striche → ausblenden
  assert.match(await page.locator('.alert').innerText(), /nur ausgeblendet/);
  await page.click('.alert-btn.destructive');
  await page.click('[data-remove-person="max"]'); // ohne Striche → löschen
  await page.click('.alert-btn.destructive');
  await page.click('[data-nav="edit"]');
  assert.deepEqual(await page.locator('[data-rename-person]').evaluateAll((els) => els.map((e) => e.value)), ['Joni', 'Franz']);
  assert.equal(await page.locator('[data-restore-person="leo"]').count(), 1);
  await page.click('[data-tab="abrechnung"]');
  assert.match(await page.locator('.bill-row').first().innerText(), /Leo/, 'alte Abrechnung zeigt Leo weiter');
}, { state: seed({ months: { '2026-11': { prices, counts: { 1: { leo: { bier: 1 } } } } } }) });

test('D-02', 'Reihenfolge ändern (Tastatur) wirkt in der Strichliste', async ({ page }) => {
  await page.click('[data-tab="einstellungen"]');
  await page.click('[data-nav="edit"]');
  await page.focus('[data-list="person"] [data-handle="jonas"]');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.click('[data-nav="edit"]');
  await page.click('[data-tab="liste"]');
  assert.deepEqual(await page.locator('.person-head span:not(.avatar)').allInnerTexts(), ['Jonas', 'Leo', 'Max']);
}, { state: seed() });

test('D-03', 'Sicherung exportieren, alles zurücksetzen, importieren – Daten sind wieder da', async ({ page }) => {
  await page.click('[data-tab="einstellungen"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  const file = await dl.path();
  await page.click('[data-action="reset"]');
  await page.click('.alert-btn.destructive');
  await page.click('[data-tab="abrechnung"]');
  assert.equal(txt(await page.locator('.summary .big').innerText()), '0,00 €');
  await page.click('[data-tab="einstellungen"]');
  await page.setInputFiles('#importFile', file);
  await page.click('.alert-btn.destructive');
  await page.click('[data-tab="abrechnung"]');
  assert.equal(txt(await page.locator('.summary .big').innerText()), '10,50 €');
}, { state: billState() });

test('D-04', 'Statistik: Jahresumsatz, Monatsdiagramm und Bierkönig', async ({ page }) => {
  await page.click('[data-tab="statistik"]');
  assert.equal(txt(await page.locator('.stat-tile .value').first().innerText()), '14,10 €');
  assert.match(txt(await page.locator('.king').innerText()), /Bierkönig im November Leo 3× Bier/i);
  await page.locator('.col').nth(9).click();
  assert.match(txt(await page.locator('.tip').innerText()), /Oktober: 3,60 € · 2 Getränke/);
}, { state: billState() });

test('D-05', 'Daten aus der allerersten Version werden übernommen (Bezahlt-Haken → Zahlung)', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  assert.match(txt(await page.locator('.bill-row').first().innerText()), /5,40 €.*Bezahlt|Bezahlt.*5,40 €/);
  const st = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORE);
  assert.equal(st.months['2026-11'].counts[1].p1.d1, 3);
}, {
  state: {
    version: 1,
    persons: [{ id: 'p1', name: 'Leo', archived: false }],
    drinks: [{ id: 'd1', name: 'Bier', price: 1.8, archived: false }],
    months: { '2026-11': { prices: { d1: 1.8 }, counts: { 1: { p1: { d1: 3 } } }, paid: { p1: true } } },
  },
});

/* ====================== E · Bedienbarkeit & Design ====================== */

const TABS = ['liste', 'abrechnung', 'bestand', 'statistik', 'einstellungen'];

for (const width of [320, 375, 768]) {
  test(`E-01/${width}`, `Kein seitliches Scrollen und kein abgeschnittener Preis bei ${width} px`, async ({ page }) => {
    for (const tab of TABS) {
      await page.click(`[data-tab="${tab}"]`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Überlauf in ${tab}`);
    }
    await page.click('[data-tab="liste"]');
    const clipped = await page.locator('.row.tall .subtitle').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
    assert.equal(clipped, 0, 'Preise in der Strichliste sind vollständig lesbar');
    const tabs = await page.locator('.tabbar span').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right]));
    for (let i = 1; i < tabs.length; i++) assert.ok(tabs[i][0] >= tabs[i - 1][1], 'Tab-Beschriftungen überlappen nicht');
  }, { state: billState(), viewport: { width, height: 800 } });
}

test('E-02', 'Tippflächen der wichtigsten Bedienelemente sind mindestens 44 pt hoch', async ({ page }) => {
  // Prüft per Treffertest: 21 px über/unter der Mitte muss noch das Element getroffen werden.
  const probe = (sel, d = 21) => page.evaluate(([s, dist]) => {
    const bad = [];
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.disabled || el.closest('[hidden]')) continue;
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      for (const dy of [-dist, dist]) {
        const hit = document.elementFromPoint(cx, cy + dy);
        if (!(hit && (hit === el || el.contains(hit)))) bad.push(`${s} (${Math.round(b.width)}×${Math.round(b.height)})`);
      }
    }
    return [...new Set(bad)];
  }, [sel, d]);
  assert.deepEqual(await probe('.stepper button'), []);
  assert.deepEqual(await probe('.segmented button'), []);
  assert.deepEqual(await probe('.tabbar button'), []);
  assert.deepEqual(await probe('.navbar button', 20), []);
  await page.click('[data-tab="abrechnung"]');
  assert.deepEqual(await probe('.check'), []);
  await page.click('[data-tab="bestand"]');
  assert.deepEqual(await probe('.pill-btn'), []);
  await page.click('[data-tab="einstellungen"]');
  assert.deepEqual(await probe('.avatar-btn, .tile-btn, .add-circle, .mini-seg button', 19), []);
  await page.click('[data-nav="edit"]');
  assert.deepEqual(await probe('.del-circle', 19), []);
}, { state: billState() });

test('E-03', 'SwiftUI-Look: Systemschrift, Systemfarben hell/dunkel, einheitliche Listen', async ({ page, browser, base }) => {
  const look = (p) => p.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.body).fontFamily,
    radii: [...new Set([...document.querySelectorAll('.list')].map((l) => getComputedStyle(l).borderRadius))],
    tabbar: getComputedStyle(document.querySelector('.tabbar')).position,
    title: getComputedStyle(document.querySelector('.large-title h1')).fontSize,
  }));
  const light = await look(page);
  assert.equal(light.bg, 'rgb(242, 242, 247)', 'systemGroupedBackground');
  assert.match(light.font, /-apple-system/);
  assert.deepEqual(light.radii, ['26px']);
  assert.equal(light.tabbar, 'fixed');
  assert.equal(light.title, '34px', 'Large Title');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 800 } });
  const dark = await ctx.newPage();
  await dark.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORE, JSON.stringify(billState())]);
  await dark.goto(`${base}/index.html`);
  assert.equal((await look(dark)).bg, 'rgb(0, 0, 0)');
  for (const tab of TABS) { // jede Ansicht nutzt dieselben Listen-Bausteine
    await dark.click(`[data-tab="${tab}"]`);
    assert.ok(await dark.locator('#content .list').count() > 0, `${tab} nutzt gruppierte Listen`);
  }
  await ctx.close();
}, { state: seed() });

test('E-04', 'Tastatur: Sheet fängt den Fokus, Escape schließt, Fokus kehrt zurück; Pfeile wechseln die Woche', async ({ page }) => {
  await page.focus('.segmented [aria-checked="true"]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.segmented [aria-checked="true"]').getAttribute('data-week'), '3');
  await page.click('[data-tab="abrechnung"]');
  await page.focus('[data-open-person="leo"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#sheet-root.open');
  assert.equal(await page.evaluate(() => document.querySelector('#view').inert && document.querySelector('#tabbar').inert), true, 'Hintergrund ist gesperrt');
  assert.equal(await page.evaluate(() => document.querySelector('#sheet-root').contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.openPerson), 'leo', 'Fokus kehrt zurück');
  assert.equal(await page.evaluate(() => document.querySelector('#view').inert), false);
}, { state: billState() });

test('E-05', 'Sheet lässt sich nach unten wegwischen', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  await page.click('[data-open-person="leo"]');
  await page.waitForSelector('#sheet-root.open');
  await page.waitForTimeout(450);
  const box = await page.locator('.sheet-grab').boundingBox();
  await page.mouse.move(box.x + 60, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 200, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#sheet-root').hidden);
}, { state: billState() });

test('E-06', 'Offline nutzbar: App startet ohne Netz und speichert weiter', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  assert.equal(await page.locator('#largeTitle').innerText(), 'Strichliste');
  await page.click('[data-act="inc"][data-p="leo"][data-d="bier"]');
  await page.reload();
  assert.equal(await page.locator('[data-count="leo-bier"]').innerText(), '1');
}, { state: seed() });

/* ============================== S · Sicherheit ============================== */

test('S-01', 'Präparierte Sicherung kann keinen Code einschleusen (XSS)', async ({ page }) => {
  const evil = seed();
  const xss = '"><img src=x onerror="window.__xss=1"><script>window.__xss=1</script>';
  evil.persons.push({ id: xss, name: 'Böse-ID', color: 'red' }); // ungültige id → wird verworfen
  evil.persons[0].name = `Leo${xss}`;
  evil.persons[0].color = xss;
  evil.drinks[0].emoji = xss;
  evil.drinks[0].perCrate = `5${xss}`;
  evil.drinks[0].stock = xss;
  evil.months['2026-11'] = { prices: { bier: xss }, counts: { 2: { leo: { bier: `3${xss}` }, [xss]: { bier: 2 } }, [xss]: {} }, closed: xss };
  evil.months[xss] = { counts: {} };
  evil.payments.push({ id: 'p1', pid: 'leo', month: xss, amount: 5 }, { id: xss, pid: 'leo', month: '2026-11', amount: 5 });
  evil.purchases.push({ id: 'k1', drinkId: 'bier', crates: xss, bottles: xss, date: xss, cost: 1 });
  evil.cash.push({ id: 'c1', kind: 'in', amount: 5, note: xss, category: xss, date: '2026-11-01T10:00:00Z' });
  evil.settings.paypal = xss;
  evil.settings.note = xss;
  const file = path.join(require('node:os').tmpdir(), `zs-evil-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(evil));
  await page.click('[data-tab="einstellungen"]');
  await page.setInputFiles('#importFile', file);
  await page.click('.alert-btn.destructive');
  fs.unlinkSync(file);
  for (const tab of TABS) {
    await page.click(`[data-tab="${tab}"]`);
    assert.equal(await page.locator('#content img, #content script, #content [onerror]').count(), 0, `kein eingeschleustes Element in ${tab}`);
  }
  await page.click('[data-tab="abrechnung"]');
  await page.click('[data-open-person="leo"]');
  assert.equal(await page.locator('#sheetBody img, #sheetBody script').count(), 0);
  await page.keyboard.press('Escape');
  await page.click('[data-tab="liste"]');
  await page.click('[data-nav="theke"]');
  assert.equal(await page.locator('#theke-root img, #theke-root script').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'kein Code ausgeführt');
  assert.match(await page.locator('#theke-root').innerText(), /Leo"><img/, 'Name wird als Text gezeigt');
  const st = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORE);
  assert.equal(st.persons.length, 3, 'Person mit ungültiger id verworfen');
  assert.deepEqual(Object.keys(st.months), ['2026-11']);
}, { state: seed() });

test('S-02', 'Content-Security-Policy blockt Inline-Skripte', async ({ page }) => {
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /script-src 'self'/);
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__inline = 1';
    document.body.appendChild(s);
    const d = document.createElement('div');
    d.innerHTML = '<img src="x" onerror="window.__handler = 1">';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__inline || window.__handler), undefined);
}, { state: seed(), allowConsoleErrors: true });

test('S-03', 'CSV-Export entschärft Formeln in Namen', async ({ page }) => {
  await page.click('[data-tab="abrechnung"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="csv"]')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x"";""klick""\)"/);
  assert.doesNotMatch(csv, /\n"=/);
}, {
  state: (() => {
    const s = billState();
    s.persons[0].name = '=HYPERLINK("http://x";"klick")';
    return s;
  })(),
});

test('S-04', 'Einladungslinks: nur https-Server, Beitritt zeigt den Server und braucht Bestätigung', async ({ page, base }) => {
  const link = (cfg) => `${base}/index.html#join=${Buffer.from(JSON.stringify(cfg)).toString('base64url')}`;
  const code = 'A'.repeat(32);
  await page.goto(link({ u: 'http://boese.example', k: 'anon-key-123', c: code }));
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.alert').count(), 0, 'unverschlüsselter Server wird ignoriert');
  await page.goto(link({ u: 'https://abc.supabase.co', k: 'anon-key-123', c: 'kurz' }));
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.alert').count(), 0, 'zu kurzer Raumcode wird ignoriert');
  await page.goto(link({ u: 'https://abc.supabase.co', k: 'anon-key-123', c: code }));
  assert.match(await page.locator('.alert').innerText(), /abc\.supabase\.co/);
  assert.equal(new URL(page.url()).hash.includes('join='), false, 'Zugangsdaten verschwinden aus der Adresszeile');
  await page.click('.alert-btn.cancel');
  assert.equal(await page.evaluate(() => window.Sync.configured()), false, 'ohne Bestätigung keine Verbindung');
}, { state: seed() });

/* ================================ Lauf ================================ */

(async () => {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const results = [];

  for (const t of tests) {
    if (only && !t.id.startsWith(only)) continue;
    const context = await browser.newContext({ viewport: t.opts.viewport || { width: 390, height: 800 }, acceptDownloads: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    let error = null;
    try {
      await page.clock.install({ time: NOW });
      if (t.opts.state) {
        await page.addInitScript(([k, v]) => {
          if (!localStorage.getItem('test-seeded')) {
            localStorage.setItem(k, v);
            localStorage.setItem('test-seeded', '1');
          }
        }, [STORE, JSON.stringify(t.opts.state)]);
      }
      await page.goto(`${base}/index.html`);
      await t.fn({ page, context, browser, base });
      if (!t.opts.allowConsoleErrors) assert.deepEqual(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)), [], 'keine JavaScript-Fehler');
    } catch (e) {
      error = e;
    }
    await context.close();
    results.push({ ...t, error });
    console.log(`${error ? '✗' : '✓'} ${t.id.padEnd(9)} ${t.title}${error ? `\n    → ${String(error.message).split('\n').slice(0, 6).join('\n      ')}` : ''}`);
  }

  await browser.close();
  server.close();
  const failed = results.filter((r) => r.error);
  console.log(`\n${results.length - failed.length} von ${results.length} Abnahmetests bestanden.`);
  process.exitCode = failed.length ? 1 : 0;
})();
