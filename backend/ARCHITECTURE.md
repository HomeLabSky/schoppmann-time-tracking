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
| Wartung (nur lokal, kein HTTP) | `scripts/create-admin.js`, `scripts/reset-password.js` (`npm run admin:create` / `user:reset-password`) | `models/` direkt | `User` |

## API-Vertrag (verbindlich)

Das Frontend (`frontend/src/lib/api.ts`) hängt fest an diesem Format:

- Erfolg: `{ success: true, message, data }`
- Fehler: `{ success: false, error, code }` mit passendem HTTP-Status
- Auth: `Authorization: Bearer <accessToken>`; bei 401/403 versucht das
  Frontend automatisch einen Refresh über `POST /api/auth/refresh`.

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

## Tests

- `npm test` führt alles aus: `npm run test:unit` (`test/*.test.js`, Node-Testrunner) und
  `npm run smoke` (End-to-End gegen die HTTP-API).
- `test/billing.test.js`: tabellengetriebene Tests der reinen Rechenlogik.
- `test/timeEntryService.test.js`: Integrationstests gegen eine temporäre SQLite-DB (Pause,
  eingefrorener Stundensatz, Grenze je Periode, Monatsende, Periode 22.–21., Fachregeln).
- Nach strukturellen Änderungen oder Änderungen an der Abrechnung immer ausführen.
