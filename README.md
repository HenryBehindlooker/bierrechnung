# Zirbenstube – Getränkeliste

Web-App für die Bier- und Getränkeabrechnung der Zirbenstube. Sie ersetzt die
Papier-Strichliste: Getränke antippen, die Monatsabrechnung rechnet sich von
selbst. Läuft im Browser, offline und als App auf dem Home-Bildschirm.

**Online:** <https://henrybehindlooker.github.io/bierrechnung/>

## Funktionen

- **Strichliste:** Woche wählen, pro Person und Getränk mit **+** / **−** zählen.
  Jede Aktion lässt sich direkt **rückgängig** machen.
- **Theke:** großer Modus für Feiern – Person antippen, Getränk antippen, fertig.
  Gäste lassen sich dort direkt mit Namen anlegen.
- **Abrechnung:** Beträge je Person, Bezahlt-Kreis, **Teilzahlungen**,
  **Guthaben** und **offene Beträge aus Vormonaten** (werden automatisch
  mitgenommen). Zahlart Bar, PayPal oder Überweisung.
- **Verschicken:** Abrechnung pro Person als Text oder als **Bild**, Übersicht
  an alle, **Zahlungserinnerung** an alle, die länger als zwei Wochen offen
  sind – jeweils mit PayPal.me-Link über den offenen Betrag.
- **Monat abschließen:** sperrt die Striche eines abgerechneten Monats.
- **Kasse & Lager:** Barkasse mit Kassenbuch (Barzahlungen, Einkäufe, Leergut,
  Einnahmen/Ausgaben, „Zählen“ zum Abgleichen), Lagerbestand mit „+ Kiste“ und
  Warnung, **Pfand & Leergut**, Gewinn pro Monat.
- **Statistik:** Umsatz pro Monat, beliebteste Getränke, Rangliste und der
  **Bierkönig des Monats** 👑.
- **Drucken & Export:** ausgefüllte Monatsabrechnung oder leere Druckvorlage
  (A4, wie das Original-PDF), CSV für Excel.
- **Einstellungen:** Personen (farbige Initialen) und Getränke (Symbol & Farbe)
  anlegen, umbenennen, sortieren, wischen zum Löschen. Jeder Monat behält seine
  eigenen Preise.
- **Gemeinsam nutzen (optional):** alle tragen auf dem eigenen Handy ein, die
  Daten werden über Supabase abgeglichen (siehe unten).
- **Sicherung:** über das Teilen-Menü (z. B. iCloud Drive) speichern und wieder
  importieren; nach 30 Tagen ohne Sicherung erinnert die App.

Die Oberfläche folgt dem SwiftUI-/iOS-Design (große Titel, gruppierte Listen,
Liquid-Glass-Leisten, Hell- und Dunkelmodus).

## Datenspeicherung

Ohne „Gemeinsam nutzen“ liegen alle Daten **nur auf dem jeweiligen Gerät**
(localStorage). Tipps:

- Auf dem iPhone die App vom Home-Bildschirm nutzen (Safari-Tabs löschen Daten
  nach 7 Tagen ohne Nutzung; Home-Bildschirm-App und Safari haben getrennte Daten).
- Regelmäßig unter *Einstellungen → Sicherung teilen / speichern* sichern.
- Updates der App löschen keine Daten. Alte Datenstände werden beim Laden
  automatisch übernommen; ein unlesbarer Stand wird nie überschrieben, sondern
  als Kopie aufbewahrt.

## Gemeinsam nutzen (Supabase)

Damit alle auf ihrem eigenen Handy eintragen können, braucht es einmalig ein
kostenloses Supabase-Projekt:

1. Auf <https://supabase.com> ein Konto und ein neues Projekt anlegen
   (Region z. B. Frankfurt).
2. Im Projekt *SQL Editor* öffnen, den Inhalt von [`supabase.sql`](supabase.sql)
   einfügen und ausführen.
3. Unter *Project Settings → API* die **Project URL** und den **anon / publishable
   key** kopieren.
4. In der App *Einstellungen → Gemeinsam nutzen*: beides eintragen und
   **„Gemeinsame Liste erstellen“** tippen. Die bisherigen Daten werden hochgeladen.
5. **„Einladungslink teilen“** an die anderen schicken. Wer den Link öffnet und
   „Beitreten“ tippt, ist dabei (die bisherigen Daten auf dem Gerät werden als
   Kopie aufbewahrt).

So funktioniert der Abgleich: Jedes Gerät merkt sich den letzten gemeinsamen
Stand und führt Änderungen zusammen. Striche und Lagerbestand von mehreren
Handys werden **addiert**, neue Personen, Zahlungen und Buchungen von allen
Seiten bleiben erhalten. Offline weitergezählte Striche werden beim nächsten
Online-Sein abgeglichen. Der grüne Punkt neben dem Titel zeigt den Status
(antippen = sofort abgleichen).

Sicherheit: Die Tabelle ist für den öffentlichen Key gesperrt; Zugriff gibt es
nur über zwei Funktionen mit dem geheimen 32-stelligen Raumcode aus dem
Einladungslink. Wer den Link hat, kann mitschreiben – also nur an die
Stube-Runde schicken.

## Entwicklung

Keine Abhängigkeiten, kein Build-Schritt – nur statische Dateien.

```sh
npm start          # http://localhost:8000
npm test           # Unit-Tests der Rechenlogik (Node ≥ 20)
npm run test:e2e   # Browser-Test inkl. Abgleich zweier Geräte (braucht Playwright)
```

Die Unit-Tests laufen bei jedem Push automatisch (GitHub Actions).

| Datei | Zweck |
| --- | --- |
| `index.html` | Grundgerüst |
| `core.js` | Rechenkern: Datenmodell, Übernahme alter Stände, Abrechnung, Kasse, Pfand, Zusammenführen |
| `app.js` | Oberfläche, Bedienung, Druck, Teilen |
| `sync.js` | Abgleich mit Supabase |
| `style.css` | Design, Dunkelmodus, Druckansicht |
| `supabase.sql` | Einmaliges Setup für „Gemeinsam nutzen“ |
| `tests/` | Unit- und Browser-Tests |
| `sw.js`, `manifest.webmanifest`, Icons | Offline-Betrieb und Installation als App |

**Veröffentlichen mit GitHub Pages:** *Settings → Pages → Deploy from a branch*,
Branch `main`, Ordner `/ (root)`.
