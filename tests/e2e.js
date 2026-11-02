// End-to-End-Test im echten Browser (Playwright). Ausführen mit:  npm run test:e2e
// Startet einen eigenen Server, der die App ausliefert und Supabase (zs_get/zs_save)
// im Speicher nachbildet – so lässt sich auch der Abgleich zweier Geräte prüfen.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.log('Playwright ist nicht installiert – E2E-Test übersprungen (npm i -D playwright).');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const rooms = new Map();
const KEY = 'test-anon-key';

function serve(req, res) {
  if (req.method === 'POST' && req.url.startsWith('/rest/v1/rpc/')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.headers.apikey !== KEY) {
        res.writeHead(401);
        res.end('{"message":"Invalid API key"}');
        return;
      }
      const b = JSON.parse(body || '{}');
      const fn = req.url.split('/').pop();
      let out;
      if (fn === 'zs_get') {
        const r = rooms.get(b.p_code);
        out = r ? [{ data: r.data, version: r.version }] : [];
      } else if (fn === 'zs_save') {
        const r = rooms.get(b.p_code);
        if (b.p_version === 0) {
          if (r) out = -1;
          else { rooms.set(b.p_code, { data: b.p_data, version: 1 }); out = 1; }
        } else if (r && r.version === b.p_version) {
          r.data = b.p_data;
          r.version += 1;
          out = r.version;
        } else out = -1;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const V1 = {
  version: 1,
  persons: [{ id: 'p1', name: 'Leo', archived: false }, { id: 'p2', name: 'Max', archived: false }],
  drinks: [{ id: 'd1', name: 'Limo', price: 1.5, archived: false }, { id: 'd2', name: 'Bier', price: 1.8, archived: false }],
  months: { '2026-09': { prices: { d1: 1.5, d2: 1.8 }, counts: { 2: { p1: { d2: 5 }, p2: { d2: 2 } } }, paid: { p1: true } } },
};

(async () => {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const errors = [];
  const device = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    return page;
  };
  const step = (t) => console.log(`✓ ${t}`);
  const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('zirbenstube-getraenkeliste-v1')));

  try {
    // 1) Alte Daten (v1) werden übernommen, nicht überschrieben
    const a = await device('A');
    await a.goto(`${base}/index.html#liste`);
    await a.evaluate((v1) => localStorage.setItem('zirbenstube-getraenkeliste-v1', JSON.stringify(v1)), V1);
    await a.reload();
    let st = await stored(a);
    assert.equal(st.version, 3);
    assert.equal(st.months['2026-09'].counts[2].p1.d2, 5, 'Striche bleiben erhalten');
    assert.equal(st.payments.length, 1, 'Bezahlt-Haken wird zur Zahlung');
    assert.equal(st.payments[0].amount, 9);
    step('Übernahme alter Daten ohne Verlust');

    // 2) Strich + Rückgängig
    const inc = a.locator('.list-section [data-act="inc"]').nth(1);
    await inc.click();
    await inc.click();
    await a.locator('#hud [data-undo]').click();
    st = await stored(a);
    const week = Object.values(st.months[Object.keys(st.months).sort().pop()].counts)[0];
    assert.equal(week.p1.d2, 1, 'Rückgängig nimmt den letzten Strich zurück');
    step('Striche und Rückgängig');

    // 3) Max hat September offen → Vormonat in der Abrechnung
    await a.click('[data-tab="abrechnung"]');
    const status = await a.locator('.bill-row').nth(1).innerText();
    assert.match(status, /3,60\s€/, 'offener September-Betrag erscheint');
    await a.locator('[data-paid="p2"]').click();
    assert.match(await a.locator('.bill-row').nth(1).innerText(), /Bezahlt/);
    step('Offene Beträge aus Vormonaten und Bezahlen');

    // 4) Kasse: neue Barzahlung von Max (3,60) + Einnahme 20 – alte Zahlungen zählen nicht
    await a.click('[data-tab="bestand"]');
    await a.click('[data-cash="in"]');
    await a.fill('#sheetBody [name="amount"]', '20');
    await a.locator('#sheetBody .sheet-actions button').click();
    assert.equal((await a.locator('.cash-card .big').innerText()).replace(/\s/g, ' '), '23,60 €');
    step('Kassenbuch');

    // 5) Monat abschließen sperrt Striche
    await a.click('[data-tab="abrechnung"]');
    await a.click('[data-action="close-month"]');
    await a.locator('.alert-btn.default').click();
    await a.click('[data-tab="liste"]');
    assert.equal(await a.locator('[data-act="inc"]').first().isDisabled(), true);
    await a.locator('[data-action="reopen-month"]').click();
    assert.equal(await a.locator('[data-act="inc"]').first().isDisabled(), false);
    step('Monat abschließen und wieder öffnen');

    // 6) Gemeinsame Liste: A erstellt, B tritt bei, beide tragen gleichzeitig ein
    await a.click('[data-tab="einstellungen"]');
    await a.fill('[data-sync-field="url"]', base);
    await a.press('[data-sync-field="url"]', 'Tab');
    await a.fill('[data-sync-field="key"]', KEY);
    await a.press('[data-sync-field="key"]', 'Tab');
    await a.click('[data-action="sync-create"]');
    await a.waitForFunction(() => window.Sync.status === 'ok');
    const invite = (await a.evaluate(() => navigator.clipboard.readText())).match(/https?:\S+#join=\S+/)[0];
    assert.equal(rooms.size, 1, 'Liste in der Cloud angelegt');

    const b = await device('B');
    await b.goto(invite);
    await b.locator('.alert-btn.default').click();
    await b.waitForFunction(() => window.Sync.status === 'ok' && window.Sync.lastSync > 0);
    assert.equal((await stored(b)).payments.length, 2, 'B hat die Daten von A');
    step('Gemeinsame Liste erstellen und per Link beitreten');

    await a.click('[data-tab="liste"]');
    await b.click('[data-tab="liste"]');
    const tallyOn = async (p, n) => {
      for (let i = 0; i < n; i++) await p.locator('.list-section [data-act="inc"]').nth(1).click(); // Leo · Bier
    };
    await Promise.all([tallyOn(a, 2), tallyOn(b, 3)]);
    for (let i = 0; i < 3; i++) {
      await a.evaluate(() => window.Sync.run());
      await b.evaluate(() => window.Sync.run());
    }
    const leoBeer = async (p) => {
      const s = await stored(p);
      const m = s.months[Object.keys(s.months).sort().pop()];
      return Object.values(m.counts).reduce((n, w) => n + (w.p1?.d2 || 0), 0);
    };
    assert.equal(await leoBeer(a), 6, 'A: 1 + 2 + 3 Striche');
    assert.equal(await leoBeer(b), 6, 'B: 1 + 2 + 3 Striche');
    await a.waitForFunction(() => document.querySelector('[data-count="p1-d2"]')?.textContent === '6');
    step('Gleichzeitige Striche auf zwei Geräten werden zusammengezählt');

    // 7) Layout: kein seitliches Scrollen in allen Tabs
    for (const tab of ['liste', 'abrechnung', 'bestand', 'statistik', 'einstellungen']) {
      await a.click(`[data-tab="${tab}"]`);
      assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `kein Überlauf in ${tab}`);
    }
    step('Kein horizontales Scrollen auf 375 px');

    assert.deepEqual(errors, [], 'keine JavaScript-Fehler');
    step('Keine JavaScript-Fehler');
    console.log('\nAlle E2E-Tests bestanden.');
  } catch (e) {
    console.error('\n✗ E2E-Test fehlgeschlagen:', e.message);
    if (errors.length) console.error('Konsole:', errors);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
