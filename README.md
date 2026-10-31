# Zirbenstube – Getränkeliste

Web-App für die Bier- und Getränkeabrechnung der Zirbenstube. Sie ersetzt die
Papier-Strichliste: Getränke pro Woche antippen, die Monatsabrechnung rechnet
sich von selbst.

## Funktionen

- **Strichliste:** Woche wählen (Woche 1–5, mit Datum), pro Person und Getränk
  mit **+** / **−** zählen. Die aktuelle Woche ist vorausgewählt.
- **Abrechnung:** Stückzahl und Betrag je Person und Getränk, Gesamtbetrag,
  „bezahlt“-Haken pro Person, offene Summe und eine Wochenübersicht wie auf dem
  Papierbogen.
- **Drucken:** die ausgefüllte Monatsabrechnung oder die leere Druckvorlage
  (A4, wie das Original-PDF).
- **CSV-Export** der Abrechnung (öffnet direkt in Excel).
- **Einstellungen:** Personen und Getränke hinzufügen, umbenennen, sortieren und
  entfernen; Preise ändern. Jeder Monat speichert seine eigenen Preise, eine
  Preiserhöhung ändert also keine alten Abrechnungen.
- **Sicherung:** alle Daten als JSON herunterladen und wieder laden, z. B. um sie
  auf ein anderes Gerät zu übertragen.
- Funktioniert offline und lässt sich auf dem Handy oder Tablet zum
  Startbildschirm hinzufügen.

## Design

Die Oberfläche folgt dem SwiftUI- bzw. iOS-Design: große Navigationstitel,
gruppierte Listen (Inset Grouped), Segmented Control für die Wochen, Stepper
zum Zählen, eine schwebende Tab-Leiste im Liquid-Glass-Stil, Alerts im
iOS-Stil sowie iOS-Systemfarben im Hell- und Dunkelmodus. Die Akzentfarbe ist
Bernstein. Personen und Getränke lassen sich unter *Einstellungen → Bearbeiten*
per Ziehen sortieren oder löschen.

Standardmäßig angelegt: Leo, Max, Jonas, Gast 1, Gast 2 sowie Limo (1,50 €),
Bier (1,80 €) und Spezi (1,80 €).

## Datenspeicherung

Die Daten liegen **nur im Browser des Geräts** (localStorage). Am besten nutzt
ihr ein gemeinsames Gerät, zum Beispiel ein Tablet in der Stube, und ladet ab und
zu unter *Einstellungen → Sicherung herunterladen* eine Sicherung herunter.

## Starten

Es gibt keinen Build-Schritt, die App besteht nur aus statischen Dateien.

```sh
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

**Online stellen mit GitHub Pages:** *Settings → Pages → Source: Deploy from a
branch*, Branch `main` und Ordner `/ (root)` wählen. Die App ist danach unter
`https://<benutzer>.github.io/bierrechnung/` erreichbar.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Grundgerüst |
| `app.js` | Logik, Speicherung, Druck und Export |
| `style.css` | Layout, Dunkelmodus, Druckansicht |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-Betrieb und Installation als App |
