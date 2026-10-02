# Backend-Architektur

Express-API für die Zeiterfassung. Ziel der Struktur: **klare Schichten,
eine Wahrheit je Domäne, isoliert bearbeitbare Module** – damit gezielt an
einem Feature gearbeitet werden kann, ohne das ganze Backend zu lesen.

## Schichten (von außen nach innen)

```
HTTP-Request
   │
   ▼
routes/        Pfad-Definition + Middleware-Verkettung. KEINE Geschäftslogik.
   │           Übersetzt nur HTTP ↔ Service-Aufruf und mappt Domänenfehler
   │           auf HTTP-Statuscodes/Fehlercodes.
   ▼
services/      GESAMTE Geschäftslogik. Eine Klasse je Domäne. Wirft
   │           sprechende Fehler im Format `CODE:Nachricht`.
   ▼
models/        Sequelize-Models (Persistenz) + Model-eigene Helfer/Hooks.
   ▼
SQLite (config/database.js)
```

Querschnitt:

```
config/        Zentrale Konfiguration (Env, JWT, DB, CORS, Rate-Limit) + DB-Verbindung.
middleware/    Auth (JWT), Validierung (express-validator), Security (Helmet/CORS),
               Rate-Limiting. Wird in routes/ verkettet.
utils/         Einheitliche Response-Helfer (responses.js) und zentrales
               Fehler-Mapping (errorHandler.js).
```

## Einstiegspunkte

| Datei | Verantwortung |
|---|---|
| `app.js` | Baut die Express-App auf (Middleware, Routen, Error-Handler). Kein `listen()`. |
| `server.js` | DB-Initialisierung, startet den HTTP-Listener, Prozess-Lifecycle. |
| `routes/index.js` | Registriert alle Domänen-Router unter `/api` + Meta-Routen. |
| `models/index.js` | Definiert Model-Beziehungen und `initDatabase()`. |

## Domänen / Modul-Landkarte

| Domäne | Route | Service | Model |
|---|---|---|---|
| Authentifizierung | `routes/auth.js` (`/api/auth`) | `services/userService.js`, `services/tokenService.js` | `User` |
| Zeiterfassung | `routes/timetracking.js` (`/api/timetracking`) | `services/timeEntryService.js`, `services/dateService.js` | `TimeEntry` |
| Mitarbeiter (Self-Service) | `routes/employee.js` (`/api/employee`) | `services/userService.js`, `services/minijobService.js` | `User`, `MinijobSetting` |
| Administration | `routes/admin.js` (`/api/admin`) | `services/userService.js` | `User`, `MinijobSetting` |
| Minijob-Grenzen | `routes/minijob.js` (`/api/admin/minijob`) | `services/minijobService.js` | `MinijobSetting` |
| Zeitnachweise & Monatsabschluss (Admin) | `routes/timesheets.js` (`/api/admin/timesheets`) | `services/periodService.js`, `services/periodGuard.js` | `PeriodClosure` |
| Änderungsprotokoll (Admin, nur lesend) | `routes/audit.js` (`/api/admin/audit`) | `services/auditService.js` | `AuditLog` |
| Wartung (nur lokal, kein HTTP) | `scripts/create-admin.js`, `scripts/reset-password.js` (`npm run admin:create` / `user:reset-password`) | `models/` direkt | `User` |

## API-Vertrag (verbindlich)

Das Frontend (`frontend/src/lib/api.ts`) hängt fest an diesem Format:

- Erfolg: `{ success: true, message, data }`
- Fehler: `{ success: false, error, code }` mit passendem HTTP-Status
- Auth: httpOnly-Cookies (siehe *Anmeldung*), keine Tokens im Body. Bei `401` versucht das Frontend still
  `POST /api/auth/refresh` und wiederholt die Anfrage einmal. `403` heißt: angemeldet, aber nicht berechtigt.
- Ändernde Anfragen (POST/PUT/PATCH/DELETE) brauchen den Header `X-CSRF-Protection: 1`.

**Statuscodes und `code`-Werte dürfen bei Refactorings nicht stillschweigend
geändert werden** – sie sind Teil des öffentlichen Vertrags.

## Konventionen

- **Routen bleiben dünn:** keine Sequelize-Queries direkt in Routen; stattdessen
  Service-Methoden aufrufen.
- **Validierung zentral:** Validatoren leben in `middleware/validation.js`,
  nicht inline in den Routen.
- **Fehler aus Services:** Format `CODE:Nachricht`; die Route übersetzt den
  Code in Status + Response.
- **Kein Debug-`console.log`** im Request-Pfad; Start-/Lifecycle-Logs gehören in
  `server.js`.

## Anmeldung (Cookies und Sitzungen)

Tokens liegen ausschließlich in **httpOnly-Cookies** – JavaScript im Browser kann sie nicht lesen; ein Skript-Angriff
(XSS) kann sie daher nicht stehlen. Es gibt kein `localStorage` und keinen `Authorization`-Header mehr.

| Cookie | Inhalt | Pfad | Laufzeit |
|---|---|---|---|
| `zeit_access` | JWT mit nur Benutzer- und Sitzungs-ID | `/api` | 15 Minuten |
| `zeit_refresh` | zufälliges Erneuerungs-Token `<Sitzungs-ID>.<Geheimnis>` | `/api/auth` | gleitend 7 Tage, höchstens 30 Tage je Sitzung |

Beide Cookies: `HttpOnly`, `SameSite=Strict`, in Produktion `Secure`.

- **Sitzungen in der Datenbank** (`Sessions`): Jede Anmeldung ist eine Sitzung. Gespeichert wird nur ein HMAC-Prüfwert
  des Erneuerungs-Tokens (mit `JWT_REFRESH_SECRET`), nie das Token selbst.
- **Prüfung bei jeder Anfrage** (`middleware/auth.js`): Sitzung nicht beendet, Benutzer aktiv; Rolle, Name und E-Mail
  kommen aus der Datenbank. **Abmelden, Sperren und Rollenänderungen wirken sofort** (früher bis zu 15 Minuten).
- **Rotation mit Wiederverwendungs-Erkennung** (`services/sessionService.js`): Jede Erneuerung ersetzt das Token.
  Taucht ein bereits ausgetauschtes Token später wieder auf, gilt es als gestohlen → die ganze Sitzung wird beendet
  (`REFRESH_TOKEN_REUSED`). Innerhalb von 10 Sekunden gilt ein altes Token nur als „Erneuerung läuft“ (`409`, zwei Tabs).
- **Sitzungen werden beendet** bei Abmeldung, Passwortwechsel (alle *anderen* Geräte), Passwort-Reset durch Admin/CLI,
  Sperrung und Löschung des Kontos.
- **CSRF**: `SameSite=Strict` + Pflicht-Header `X-CSRF-Protection` (`middleware/csrf.js`) + JSON-Content-Type + CORS nur
  für die eigene Oberfläche.
- **Protokoll**: `auth.login`, `auth.login_failed`, `auth.logout`, `auth.session_reuse_detected` (mit IP).

Entwicklung: Frontend und Backend müssen unter **demselben Hostnamen** laufen (`localhost:3000` und `localhost:5000`,
nicht `127.0.0.1` und `localhost` mischen), sonst sendet der Browser die `SameSite=Strict`-Cookies nicht mit.

## Rechenlogik (Abrechnung)

Die Geldlogik liegt als **reine Funktionen** in `utils/billing.js` (kein DB-Zugriff, keine
Systemzeit): Arbeitsminuten, Verdienst, Fachregeln für Zeiteinträge, Auflösung der
Minijob-Grenze zu einem Stichtag und die Übertrag-Verrechnung (`foldCarry`). Beträge werden
in **ganzen Cent** gerechnet; erst die API-Antwort wandelt in Euro um. `utils/clock.js`
liefert den Kalendertag in `Europe/Berlin` (nie `toISOString()` für „heute“ verwenden).

Wichtige Regeln:

- Jeder Zeiteintrag friert beim Anlegen den Stundensatz ein (`TimeEntry.hourlyRateCents`);
  spätere Lohnänderungen wirken nur auf neue Einträge.
- Für jede Periode gilt die Minijob-Grenze, die an ihrem Enddatum gültig war.
- Pause: nur wenn *keine* Angabe vorliegt, gilt der Standard (30 min); ein ausdrückliches `0`
  bleibt `0`.
- Neue Einträge: nicht in der Zukunft, höchstens 1 Monat zurück, 15 min bis 12 h.

Schema-Änderungen für bestehende Datenbanken: `models/migrations.js` (idempotent, legt vor der
ersten Änderung eine Sicherungskopie der DB-Datei an).

## Änderungsprotokoll (Audit-Log)

Jede fachliche Änderung wird in `AuditLogs` festgehalten: wer (`actorId`, `actorEmail` als Momentaufnahme),
wann, welcher Vorgang (`time_entry.update`, `period.close`, `user.update` …), welcher Datensatz, welcher
Mitarbeiter betroffen ist (`targetUserId`) sowie Zustand vorher/nachher als JSON.

- **Gleiche Transaktion:** `AuditService.record(..., { transaction })` läuft zusammen mit der Änderung. Schlägt
  eine von beiden fehl, passiert keine – es gibt nie eine Änderung ohne Eintrag.
- **Unveränderlich:** Model-Hooks verhindern Update/Delete; zusätzlich brechen SQLite-Trigger
  (`auditlogs_no_update` / `auditlogs_no_delete`, angelegt in `models/migrations.js`) jedes UPDATE/DELETE – auch
  bei direktem SQL. Für eine gewollte Bereinigung müssen die Trigger bewusst entfernt werden.
- **Keine Geheimnisse:** Snapshots enthalten nie Passwörter; `stripSecrets` entfernt zusätzlich Felder wie
  `password` und `token` aus allen Einträgen.
- **Auslöser (`actor`):** Routen übergeben `{ id, email }` aus dem JWT an die Services. Fehlt er, gilt der
  betroffene Benutzer selbst (Selbstbedienung/Registrierung).
- Lesen nur über `GET /api/admin/audit` (Filter: `userId`, `action`-Präfix, `entityType`, `from`, `to`, Seite).

## Monatsabschluss

`PeriodClosure` hält je (Mitarbeiter, Abrechnungsperiode) die eingefrorenen Zahlen (Minuten, Verdienst, Grenze,
Übertrag ein/aus, Auszahlung). Regeln (`services/periodService.js`):

- Abschluss erst **nach Periodenende** und nur, wenn frühere Perioden **mit Einträgen** bereits abgeschlossen sind
  (der Übertrag baut aufeinander auf).
- In abgeschlossenen Perioden sind Anlegen, Ändern und Löschen von Zeiteinträgen gesperrt (`PERIOD_CLOSED`,
  Prüfung in `periodGuard.assertDateOpen`, innerhalb der Eintrags-Transaktion).
- Für abgeschlossene Perioden gelten die **eingefrorenen** Zahlen – spätere Änderungen an Minijob-Grenzen verändern
  Auszahlung und Übertrag nicht.
- Wiedereröffnen nur durch Admins, **mit Begründung** (mind. 5 Zeichen) und nur für die **jüngste** abgeschlossene
  Periode. Der Vorgang inkl. Begründung steht im Protokoll.
- Konten mit Zeiteinträgen oder Abschlüssen können nicht gelöscht, nur deaktiviert werden (Nachweise bleiben erhalten).

## Tests

- `npm test` führt alles aus: `npm run test:unit` (`test/*.test.js`, Node-Testrunner) und
  `npm run smoke` (End-to-End gegen die HTTP-API).
- `test/billing.test.js`: tabellengetriebene Tests der reinen Rechenlogik.
- `test/timeEntryService.test.js`: Integrationstests gegen eine temporäre SQLite-DB (Pause,
  eingefrorener Stundensatz, Grenze je Periode, Monatsende, Periode 22.–21., Fachregeln).
- `test/sessions.test.js`: Sitzungen – Rotation, Wiederverwendungs-Erkennung, Ablauf, Widerruf, Besitznachweis beim Abmelden.
- `test/audit-closure.test.js`: Protokollierung, Unveränderlichkeit, keine Passwörter, Abschluss/Sperre,
  eingefrorene Zahlen, Reihenfolge, Wiedereröffnen mit Begründung.
- Nach strukturellen Änderungen oder Änderungen an der Abrechnung immer ausführen.
