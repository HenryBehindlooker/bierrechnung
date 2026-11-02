# Zirbenstube – Getränkeliste

Web-App für die Bier- und Getränkeabrechnung der Zirbenstube. Sie ersetzt die
Papier-Strichliste: Getränke pro Woche antippen, die Monatsabrechnung rechnet
sich von selbst.

## Funktionen

- **Strichliste:** Woche wählen (Woche 1–5, mit Datum), pro Person und Getränk
  mit **+** / **−** zählen. Jede Aktion lässt sich direkt **rückgängig** machen.
- **Abrechnung:** Betrag je Person und Getränk, Bezahlt-Kreis zum Abhaken,
  **Teilzahlungen**, **Guthaben** und **offene Beträge aus Vormonaten**, die
  automatisch mitgenommen werden. Wochenübersicht wie auf dem Papierbogen.
- **Abrechnung verschicken:** pro Person oder für alle als fertiger Text über
  WhatsApp, iMessage usw., auf Wunsch mit PayPal.me-Link über den offenen Betrag.
- **Bestand:** Flaschen im Lager, „+ Kiste“ für Einkäufe, jeder Strich zieht
  eine Flasche ab, Warnung bei niedrigem Bestand (roter Punkt am Tab). Mit
  Kistenpreis zeigt die **Kasse** Einnahmen, Wareneinsatz und Gewinn.
- **Statistik:** Jahresumsatz, Umsatz pro Monat als Diagramm, beliebteste
  Getränke, Rangliste und der **Bierkönig des Monats** 👑.
- **Drucken:** die ausgefüllte Monatsabrechnung oder die leere Druckvorlage
  (A4, wie das Original-PDF). **CSV-Export** für Excel.
- **Einstellungen:** Personen (farbige Initialen) und Getränke (Symbol & Farbe)
  anlegen, umbenennen, per Ziehen sortieren, nach links wischen zum Löschen;
  Preise ändern – jeder Monat behält seine eigenen Preise.
- **Sicherung:** über das Teilen-Menü z. B. in iCloud Drive speichern und wieder
  importieren. Nach 30 Tagen ohne Sicherung erinnert die App.
- Gedrückt halten öffnet an vielen Stellen ein Kontextmenü.
- Funktioniert offline und lässt sich auf dem Handy oder Tablet zum
  Startbildschirm hinzufügen (mit eigenem App-Icon).

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
zu unter *Einstellungen → Sicherung exportieren* eine Sicherung herunter.

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
