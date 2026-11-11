# Security-Review

Stand: 10.11.2026 · geprüft: `index.html`, `app.js`, `core.js`, `sync.js`, `sw.js`,
`supabase.sql`, GitHub-Workflow.

## Wie die App aufgebaut ist

- Statische Seite ohne Server, ohne Login, ohne Abhängigkeiten von Dritten, ohne Tracking.
- Daten liegen im Gerätespeicher des Browsers (`localStorage`).
- Optional: gemeinsame Liste über Supabase. Die Tabelle ist gesperrt, Zugriff gibt es
  nur über zwei Funktionen mit einem geheimen 32-stelligen Raumcode (rund 186 Bit).
- Daten von außen kommen an drei Stellen herein: **Sicherung importieren**,
  **gemeinsame Liste** und **Einladungslink**.

## Befunde

| # | Schwere | Befund | Status |
| --- | --- | --- | --- |
| 1 | Hoch | **Eingeschleuster Code (XSS) über Sicherung oder gemeinsame Liste.** Kennungen und Zahlenfelder aus fremden Daten wurden ungeprüft in die Seite geschrieben. Eine präparierte Sicherungsdatei oder ein Mitglied der gemeinsamen Liste hätte so Code auf allen Geräten ausführen und Daten samt Zugang zur Liste auslesen können. | **Behoben.** Alle Daten laufen vor Anzeige und Verrechnung durch eine strenge Prüfung (`Core.sanitize`): feste Formate für Kennungen und Monate, Typ- und Wertebereiche für jedes Feld, Unbekanntes wird verworfen. Gilt für Laden, Import, Abgleich und Rückgängig. Tests: S-01, Unit-Test „Prüfung“. |
| 2 | Mittel | **Keine Content-Security-Policy.** Ein einzelner Fehler beim Escapen hätte sofort zur Codeausführung geführt. | **Behoben.** CSP erlaubt nur eigene Skripte, keine Inline-Skripte und keine Inline-Handler. Test: S-02. |
| 3 | Mittel | **Einladungslinks konnten auf beliebige Server zeigen**, auch unverschlüsselt (`http`), und der Beitrittsdialog nannte den Server nicht. | **Behoben.** Nur `https`, Format von Schlüssel und Raumcode wird geprüft, der Dialog zeigt den Server, ohne Bestätigung passiert nichts. Die Zugangsdaten verschwinden sofort aus der Adresszeile. Test: S-04. |
| 4 | Niedrig | **Formeln im CSV-Export.** Ein Name wie `=HYPERLINK(…)` wäre in Excel als Formel ausgeführt worden. | **Behoben.** Solche Zellen bekommen ein vorangestelltes `'`. Test: S-03. |
| 5 | Niedrig | **Kennungen wie `__proto__`** hätten interne Objekte verändern können (Prototype Pollution). | **Behoben** durch die Prüfung aus Befund 1. |
| 6 | Niedrig | **Sicherheitskopien wuchsen unbegrenzt** (bei jedem Laden eines unlesbaren Stands eine neue Kopie) und konnten den Speicher füllen. | **Behoben.** Pro Art bleiben die zwei neuesten. |
| 7 | Niedrig | **GitHub-Workflow lief mit Standardrechten.** | **Behoben.** Nur Leserechte (`contents: read`). |

## Bekannte Grenzen (bewusst akzeptiert)

- **Gemeinsame Liste = gemeinsames Vertrauen.** Wer den Einladungslink hat, kann alles
  lesen, ändern und löschen. Es gibt kein Login pro Person und keine Änderungshistorie
  auf dem Server. Deshalb: Link nur in der Runde teilen und regelmäßig eine Sicherung
  exportieren. Bei Verdacht: *Verbindung trennen* und eine neue Liste erstellen, dann
  gilt ein neuer Raumcode.
- **Daten liegen unverschlüsselt auf dem Gerät**, auch der Zugang zur gemeinsamen Liste.
  Wer das entsperrte Handy in der Hand hat, hat auch die Daten.
- **Der öffentliche Supabase-Key** erlaubt jedem, der ihn kennt, neue Listen anzulegen
  (je höchstens 5 MB). Fremde Listen lassen sich damit nicht lesen. Die Nutzung im
  Supabase-Dashboard gelegentlich ansehen.
- **Einbetten in fremde Seiten** lässt sich auf GitHub Pages nicht per Header verbieten.
  Das Risiko ist gering, weil Browser den Speicher eingebetteter Seiten getrennt halten.
- **PayPal-Links** werden nur aus dem eingetragenen Namen gebaut und kodiert. Die App
  kann nicht prüfen, ob der Name stimmt.

## Nicht geprüft

- Der Abgleich gegen ein **echtes Supabase-Projekt**. Getestet ist er gegen einen
  nachgebauten Server; `supabase.sql` wurde gelesen, aber nicht ausgeführt.
- Verhalten auf einem **echten iPhone** (Tests laufen in Chromium).

## Tests

```sh
npm test                  # Rechenkern inkl. Datenprüfung
npm run test:acceptance   # Abnahmetests, Sicherheit: S-01 bis S-04
npm run test:e2e          # Abgleich zweier Geräte
```

Eine Schwachstelle gefunden? Bitte als Issue im Repository melden, ohne echte
Zugangsdaten oder Einladungslinks anzuhängen.
