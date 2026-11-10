/* ------------------------------------------------------------------
 * Zirbenstube – gemeinsame Daten über Supabase (optional)
 *
 * Alle Geräte teilen einen Datenstand in einer Supabase-Tabelle, die nur
 * über zwei Funktionen (zs_get, zs_save) mit einem geheimen Raumcode
 * erreichbar ist (siehe supabase.sql). Jedes Gerät merkt sich den zuletzt
 * gemeinsamen Stand („Basis“) und führt per Core.mergeState zusammen:
 * Striche und Lagerbestand werden addiert, Listen nach id vereinigt.
 * Gespeichert wird nur, wenn die Version in der Cloud unverändert ist
 * (optimistisches Sperren) – sonst wird neu geladen und erneut gemischt.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const CFG_KEY = 'zirbenstube-sync-v1';
  const BASE_KEY = 'zirbenstube-sync-base-v1';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const write = (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
    } catch { /* Speicher voll – Sync läuft trotzdem weiter */ }
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const Sync = {
    cfg: read(CFG_KEY), // { url, key, code }
    status: 'idle', // idle | busy | ok | error | offline
    lastSync: 0,
    lastError: '',
    hooks: { getState: null, setState: null, onStatus: null },
    running: null,
    again: false,
    timer: null,

    configured() {
      return !!(this.cfg && this.cfg.url && this.cfg.key && this.cfg.code);
    },

    configure(cfg) {
      this.cfg = cfg;
      write(CFG_KEY, cfg);
      write(BASE_KEY, null);
      this.lastSync = 0;
      this.lastError = '';
      this.setStatus('idle');
    },

    setStatus(s, err = '') {
      this.status = s;
      if (s === 'error') this.lastError = err;
      if (s === 'ok') {
        this.lastError = '';
        this.lastSync = Date.now();
      }
      this.hooks.onStatus?.(s);
    },

    newCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return [...bytes].map((b) => chars[b % chars.length]).join('');
    },

    inviteLink() {
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ u: this.cfg.url, k: this.cfg.key, c: this.cfg.code }))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${location.origin}${location.pathname}#join=${payload}`;
    },

    parseInvite(hash) {
      const m = /^#join=([A-Za-z0-9_-]+)$/.exec(hash || '');
      if (!m) return null;
      try {
        const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
        const o = JSON.parse(decodeURIComponent(escape(atob(b64))));
        const cfg = { url: this.cleanUrl(o.u), key: o.k, code: o.c };
        return cfg.url && this.validKey(cfg.key) && /^[A-Za-z0-9]{24,64}$/.test(cfg.code) ? cfg : null;
      } catch {
        return null;
      }
    },

    /** Nur verschlüsselte Verbindungen (https); http ist allein für lokale Tests erlaubt. */
    cleanUrl(u) {
      try {
        const url = new URL(String(u).trim());
        const local = ['localhost', '127.0.0.1'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
        if (url.username || url.password) return null;
        return url.origin;
      } catch {
        return null;
      }
    },

    validKey(k) {
      return typeof k === 'string' && /^[A-Za-z0-9._-]{8,2000}$/.test(k);
    },

    host() {
      try { return new URL(this.cfg.url).host; } catch { return ''; }
    },

    async rpc(fn, body) {
      const res = await fetch(`${this.cfg.url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          apikey: this.cfg.key,
          // Alte Anon-Keys sind JWTs und gehören zusätzlich in den Authorization-Header,
          // neue „Publishable Keys“ (sb_publishable_…) nur in den apikey-Header.
          ...(this.cfg.key.startsWith('eyJ') ? { Authorization: `Bearer ${this.cfg.key}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Server antwortet ${res.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
      }
      return res.json();
    },

    /** Nach lokalen Änderungen gebündelt abgleichen. */
    schedule(delay = 1200) {
      if (!this.configured()) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.run().catch(() => {}), delay);
    },

    /** Abgleich starten; läuft schon einer, wird danach erneut abgeglichen. */
    run(opts = {}) {
      if (!this.configured()) return Promise.resolve(false);
      if (this.running) {
        this.again = true;
        return this.running;
      }
      this.running = this.syncOnce(opts)
        .then((ok) => {
          this.setStatus('ok');
          return ok;
        })
        .catch((e) => {
          if (!navigator.onLine) this.setStatus('offline');
          else this.setStatus('error', e.message || String(e));
          throw e;
        })
        .finally(() => {
          this.running = null;
          if (this.again) {
            this.again = false;
            this.schedule(300);
          }
        });
      return this.running;
    },

    async syncOnce({ join = false } = {}) {
      if (!navigator.onLine) throw new Error('offline');
      this.setStatus('busy');
      const code = this.cfg.code;
      for (let attempt = 0; attempt < 5; attempt++) {
        const rows = await this.rpc('zs_get', { p_code: code });
        const remote = Array.isArray(rows) && rows.length ? rows[0] : null;
        const base = join ? null : read(BASE_KEY);
        const local = clone(this.hooks.getState());
        let merged;
        let expected;
        if (!remote) {
          if (join) throw new Error('Diese gemeinsame Liste gibt es nicht (mehr). Einladungslink prüfen.');
          merged = local;
          expected = 0;
        } else {
          merged = Core.mergeState(base?.data || null, local, remote.data);
          expected = remote.version;
          if (Core.same(merged, remote.data)) {
            this.commit(local, merged, remote.version);
            return true;
          }
        }
        const v = await this.rpc('zs_save', { p_code: code, p_data: merged, p_version: expected });
        if (typeof v === 'number' && v > 0) {
          this.commit(local, merged, v);
          return true;
        }
        // jemand anderes war schneller → neu laden und erneut mischen
      }
      throw new Error('Zu viele gleichzeitige Änderungen – bitte gleich nochmal versuchen.');
    },

    /** Ergebnis übernehmen, ohne Änderungen zu verlieren, die während des Abgleichs passiert sind. */
    commit(snapshot, merged, version) {
      write(BASE_KEY, { data: merged, version });
      const now = this.hooks.getState();
      if (Core.same(now, snapshot)) {
        if (!Core.same(now, merged)) this.hooks.setState(clone(merged));
      } else {
        // während des Abgleichs wurde weiter getippt: diese Änderungen obendrauf legen
        this.hooks.setState(Core.mergeState(snapshot, now, merged));
        this.again = true;
      }
    },
  };

  window.Sync = Sync;
}());
