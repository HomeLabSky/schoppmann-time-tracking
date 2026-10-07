# Schoppmann Time Tracking

Zeiterfassungssystem für Minijob-/Stundenabrechnung mit getrenntem Frontend und Backend.

| Bereich | Technologie | Pfad |
|---|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, TanStack Query, react-hook-form + zod | `frontend/` |
| Backend | TypeScript, Express 5, zod, Drizzle + SQLite (better-sqlite3), pino; REST-API `/api/v1` mit OpenAPI-Vertrag | `backend/` |

Die Website ist **desktop-first**; mobil arbeiten Mitarbeiter später über eine eigene App gegen dieselbe REST-API.
Frontend-Aufbau und Regeln: [`frontend/README.md`](frontend/README.md).

## Schnellstart

```bash
npm run install:all      # Abhängigkeiten in Root, frontend, backend
```

Danach einmalig die Umgebung einrichten:

```bash
cp backend/.env.example backend/.env     # Windows: copy backend\.env.example backend\.env
```

In `backend/.env` **müssen** `JWT_SECRET` und `JWT_REFRESH_SECRET` gesetzt sein (je mind. 32 Zeichen,
Erzeugung steht in der Datei). Für lokale Entwicklung dort `NODE_ENV=development` eintragen.
Im Frontend legt `frontend/.env.local` die API-Adresse fest: `NEXT_PUBLIC_API_URL=http://localhost:5000`.

```bash
npm run dev              # Frontend (:3000) + Backend (:5000) parallel
npm run dev:backend      # nur Backend
npm run dev:frontend     # nur Frontend
```

API-Vertrag (für Web und spätere App): `http://localhost:5000/api/v1/openapi.json`, als Datei `backend/openapi.json`
(nach Änderungen an Routen: `npm run openapi` im Ordner `backend`). Details: `backend/ARCHITECTURE.md`.

## Benutzer und Passwörter

Es gibt keine öffentlichen Setup- oder Reset-Routen mehr. Wartung läuft lokal per Skript
(im Ordner `backend`, gegen die Datenbank aus `.env`; vorher die `.db`-Datei sichern):

```bash
npm run admin:create                                  # ersten/weiteren Admin anlegen (Passwort wird verdeckt abgefragt)
npm run admin:create -- --generate                    # mit zufälligem Passwort
npm run user:reset-password -- admin@schoppmann.de    # Passwort zurücksetzen
npm run user:reset-password -- admin@schoppmann.de --generate
```

Weitere Konten legt ein Admin im Portal unter *Benutzer* an. Die Selbstregistrierung ist
standardmäßig **aus** (`ALLOW_REGISTRATION=false`).

## Anmeldung

Die Anmeldung läuft über **httpOnly-Cookies** mit Sitzungen in der Datenbank (kein `localStorage`, keine Tokens im
Browser-Code). Abmelden, Sperren und Passwortwechsel beenden Sitzungen sofort; ein wiederverwendetes (gestohlenes)
Erneuerungs-Token beendet die ganze Sitzung. Details: [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).

Lokal müssen Frontend und Backend unter demselben Hostnamen laufen (`http://localhost:3000` und `http://localhost:5000`).

## Monatsabschluss und Änderungsprotokoll

Im Admin-Bereich:

- **Zeitnachweise** (`/admin/timesheets`): Zeiten eines Mitarbeiters je Abrechnungsperiode prüfen,
  die Periode **abschließen** (erst nach Periodenende) oder mit Begründung **wieder öffnen**. In einer abgeschlossenen
  Periode kann der Mitarbeiter nichts mehr anlegen, ändern oder löschen; die Beträge sind festgeschrieben.
- **Lohnzettel (PDF)**: Für jede abgeschlossene Periode gibt es einen Lohnzettel mit den festgeschriebenen Zahlen
  (Arbeitszeitnachweis, Verdienst, Übertrag, Auszahlung). Admins laden ihn im Zeitnachweis eines Mitarbeiters herunter;
  in der Übersicht erzeugt **Alle Lohnzettel (PDF)** zum Monatsabschluss eine Datei mit allen abgeschlossenen
  Lohnzetteln des Monats (jeder ab einer neuen Seite). Mitarbeiter finden ihre Lohnzettel unter *Lohnzettel* (auch
  rückwirkend) und direkt in der Zeiterfassung einer abgeschlossenen Periode. Wird eine Periode wieder geöffnet,
  verschwindet ihr Lohnzettel bis zum erneuten Abschluss. Firmenanschrift im Kopf: `PAYSLIP_COMPANY_ADDRESS`.
- **Protokoll** (*Protokoll*): zeigt, wer wann was geändert hat (Zeiteinträge, Abschlüsse, Benutzer, Minijob-Grenzen) –
  unveränderlich und ohne Passwörter.

Mitarbeiterkonten mit Zeiteinträgen lassen sich nicht löschen, nur deaktivieren (Nachweise bleiben erhalten).
Technische Details: [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).

## Betrieb (Server, HTTPS, Sicherung)

Für den Produktivbetrieb liegt ein Docker-Setup mit automatischem HTTPS (Caddy), täglicher Datenbank-Sicherung und
Wiederherstellung bereit. Schritt-für-Schritt-Anleitung, Sicherheits-Checkliste und Hinweise zu Datenschutz:
[`deploy/README.md`](deploy/README.md). Konkrete Schritt-für-Schritt-Installation auf einem Docker-Server (mit Portainer-Variante und
Unraid-Freigabe für die Sicherung): [`deploy/INSTALLATION_DOCKER.md`](deploy/INSTALLATION_DOCKER.md).

Sicherung und Wiederherstellung funktionieren auch ohne Docker (im Ordner `backend`):

```bash
npm run db:backup                                   # konsistente, geprüfte Sicherung (auch bei laufendem Backend)
npm run db:restore -- backups/timetracking-JJJJMMTT-HHMMSS.db   # Backend vorher stoppen
```

## Tests

```bash
cd backend  && npm test                   # Unit-/Integrationstests (node:test) + End-to-End-Smoke-Test der API
cd backend  && npm run test:unit          # nur die Unit-/Integrationstests (Rechenlogik, Zeiterfassung)
cd backend  && npm run lint               # ESLint (einmalig: npm run lint:install), 0 Warnungen erlaubt
cd frontend && npx tsc --noEmit && npm run lint && npm run build
cd frontend && npm run e2e                # Ende-zu-Ende im Browser (Playwright; einmalig: npx playwright install chromium)
```

Dieselben Prüfungen laufen in GitHub Actions (`.github/workflows/ci.yml`).

## Architektur

Frontend und Backend sind bewusst getrennt und kommunizieren ausschließlich über
die REST-API unter `/api`. Alle Antworten folgen dem Vertrag
`{ success, message, data }` (Fehler: `{ success, error, code }`).

Details zur Backend-Struktur, Schichten und Verantwortlichkeiten:
siehe [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).
Befunde und Umbauplan: siehe [`BERICHT_MODERNISIERUNG.md`](BERICHT_MODERNISIERUNG.md).
