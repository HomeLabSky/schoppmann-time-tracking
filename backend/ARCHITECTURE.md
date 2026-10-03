# Backend-Architektur

Express-API für die Zeiterfassung. Die REST-API ist das Produkt: **Web-Oberfläche und (spätere) App sind zwei
gleichberechtigte Clients**. Ziel der Struktur: klare Schichten, eine Wahrheit je Domäne, ein maschinenlesbarer
Vertrag (OpenAPI), der aus dem Code entsteht.

## Schichten (von außen nach innen)

```
HTTP-Request
   │
   ▼
routes/        Routen-Definition mit Vertrag (lib/route.js): Berechtigung, Eingabe- und Antwort-Schema.
   │           KEINE Geschäftslogik – übersetzt nur HTTP ↔ Service-Aufruf.
   ▼
services/      GESAMTE Geschäftslogik. Eine Klasse je Domäne. Wirft AppError('CODE', 'Meldung').
   ▼
models/        Sequelize-Models (Persistenz) + Model-eigene Hooks.
   ▼
SQLite (config/database.js)
```

Querschnitt:

```
schemas/       zod-Schemas je Domäne: Eingaben (geprüft, normalisiert) und Antworten (dokumentiert, in Tests geprüft).
lib/           errors.js (AppError, Statuscode je Fehlercode), route.js (Routen mit Vertrag), openapi.js
               (OpenAPI-3.1-Dokument), logger.js (pino, ohne personenbezogene Daten).
middleware/    auth.js (Cookie oder Bearer), csrf.js, errorHandler.js (einziges Fehlerformat), security.js
               (Helmet/CORS/Content-Type), rateLimiting.js.
config/        Umgebungsvariablen, mit zod geprüft (ungültig = kein Start) + DB-Verbindung.
utils/         Reine Hilfen: billing.js (Geldlogik), clock.js, authCookies.js, Sicherung.
```

## Einstiegspunkte

| Datei | Verantwortung |
|---|---|
| `app.js` | Baut die Express-App auf (Request-Log, Sicherheit, Routen, Error-Handler). Kein `listen()`. |
| `server.js` | DB-Initialisierung, startet den HTTP-Listener, Prozess-Lifecycle. |
| `routes/index.js` | Registriert alle Domänen-Router; eingehängt unter `/api/v1` und (Alias) `/api`. |
| `models/index.js` | Model-Beziehungen und `initDatabase()` (Migrationen vor und nach `sync()`). |

## Domänen / Modul-Landkarte

Pfade relativ zu `/api/v1` (gleichwertig: `/api`).

| Domäne | Route | Service | Model |
|---|---|---|---|
| Anmeldung (Web + App) | `routes/auth.js` (`/auth`) | `authService.js`, `sessionService.js`, `loginThrottle.js`, `userService.js` | `User`, `Session`, `LoginThrottle` |
| Zeiterfassung | `routes/timetracking.js` (`/timetracking`) | `timeEntryService.js`, `dateService.js` | `TimeEntry` |
| Mitarbeiter (Selbstbedienung) | `routes/employee.js` (`/employee`) | `userService.js` | `User`, `MinijobSetting` |
| Benutzerverwaltung | `routes/admin.js` (`/admin`) | `userService.js` | `User` |
| Minijob-Grenzen | `routes/minijob.js` (`/admin/minijob`) | `minijobService.js` | `MinijobSetting` |
| Zeitnachweise & Monatsabschluss | `routes/timesheets.js` (`/admin/timesheets`) | `periodService.js`, `periodGuard.js` | `PeriodClosure` |
| Änderungsprotokoll (nur lesend) | `routes/audit.js` (`/admin/audit`) | `auditService.js` | `AuditLog` |
| Systemstatus | `routes/system.js` (`/admin/system`) | `utils/backupStatus.js` | – |
| Wartung (nur lokal, kein HTTP) | `scripts/create-admin.js`, `scripts/reset-password.js` | `models/` direkt | `User` |

## API-Vertrag (verbindlich)

- **Maschinenlesbar**: `GET /api/v1/openapi.json` bzw. die Datei `backend/openapi.json` (`npm run openapi`). Ein
  Unit-Test schlägt fehl, wenn die Datei nicht zum Code passt. Clients (App, Web) können daraus Typen erzeugen.
- **Versionierung**: `/api/v1` ist verbindlich. `/api` ist ein Alias für die bestehende Web-Oberfläche. Nicht
  abwärtskompatible Änderungen kommen unter `/api/v2` – installierte App-Versionen nutzen v1 weiter.
- Erfolg: `{ success: true, message, data }`
- Fehler: `{ success: false, error, code }`, bei Eingabefehlern zusätzlich `fields` (Meldung je Feld) und `details`;
  bei `ACCOUNT_LOCKED` `retryAfter` (+ Header `Retry-After`); bei `INTERNAL_ERROR` die `requestId`.
  Alle Codes mit Status stehen in `lib/errors.js` (`ERROR_STATUS`) und im OpenAPI-Schema `Error`.
- `401` heißt ausschließlich „nicht (mehr) angemeldet“ – der Client erneuert dann still die Sitzung. Fachliche
  Ablehnungen bei bestehender Sitzung (z. B. `INVALID_CURRENT_PASSWORD`) sind **nie 401**, sondern 400/403/409.
- **Statuscodes und `code`-Werte dürfen nicht stillschweigend geändert werden** – sie sind Teil des Vertrags.

## Konventionen

- **Neue Route** = `api.get/post/…(pfad, { summary, auth, params, query, body, response, status, errors }, handler)`
  in `routes/*.js` (siehe `lib/route.js`). Der Handler bekommt geprüfte Eingaben in `req.valid` und gibt
  `{ data, message, status }` zurück. Unbekannte Body-Felder werden entfernt (kein Mass-Assignment).
- **Berechtigung** steht an der Route (`auth: 'public' | 'user' | 'employee' | 'admin'`); `/admin/*` prüft zusätzlich
  am Einhängepunkt.
- **Fehler**: `throw new AppError('CODE', 'Meldung')` – neue Codes in `lib/errors.js` mit Status eintragen. Kein
  try/catch in Routen: Express 5 reicht Fehler an `middleware/errorHandler.js` weiter.
- **Antwort-Schemas** werden im Smoke-Test (`VALIDATE_RESPONSES=1`) gegen jede echte Antwort geprüft; er listet
  Endpunkte ohne geprüfte Erfolgsantwort auf.
- **Logging** nur über `lib/logger.js` bzw. `req.log`; keine E-Mail-Adressen, Namen oder Tokens, Personen als ID.
  `console` nur in CLI-Skripten.

## Anmeldung (Web: Cookies, App: Bearer-Token)

Beide Wege nutzen dieselbe Sitzungs-Tabelle, dieselbe Rotation und dieselbe Konto-Sperre.

| | Web | App |
|---|---|---|
| Anmelden | `POST /auth/login` → Cookies | `POST /auth/token` → `{ accessToken, refreshToken, expiresIn, refreshExpiresAt }` |
| Anfragen | Cookie `zeit_access` (+ Header `X-CSRF-Protection: 1` bei Änderungen) | `Authorization: Bearer <accessToken>` |
| Erneuern | `POST /auth/refresh` (Cookie) | `POST /auth/token/refresh` `{ refreshToken }` |
| Abmelden | `POST /auth/logout` | `POST /auth/token/revoke` `{ refreshToken }` |
| Laufzeit Erneuerung | gleitend 7 Tage, höchstens 30 | gleitend 30 Tage, höchstens 90 |

| Cookie | Inhalt | Pfad | Laufzeit |
|---|---|---|---|
| `zeit_access` | JWT mit nur Benutzer- und Sitzungs-ID | `/api` | 15 Minuten |
| `zeit_refresh` | zufälliges Erneuerungs-Token `<Sitzungs-ID>.<Geheimnis>` | Auth-Pfad der Anmeldung (`/api/auth` oder `/api/v1/auth`) | gleitend 7 Tage |

Beide Cookies: `HttpOnly`, `SameSite=Strict`, in Produktion `Secure`.

- **Sitzungen in der Datenbank** (`Sessions`, Spalte `clientType` = `web`/`app`): Gespeichert wird nur ein
  HMAC-Prüfwert des Erneuerungs-Tokens (mit `JWT_REFRESH_SECRET`), nie das Token selbst.
- **Ein Token gilt nur auf seinem Weg**: Ein Web-Erneuerungs-Cookie wird an `/auth/token/refresh` abgelehnt und
  umgekehrt (`INVALID_REFRESH_TOKEN`).
- **Authorization-Header hat Vorrang**: Ist er vorhanden, werden Cookies ignoriert (kein Rückfall). Solche Anfragen
  brauchen keinen CSRF-Header – eine fremde Webseite kann den Header ohne CORS-Freigabe nicht setzen, und
  `Authorization` ist in CORS nicht freigegeben.
- **Prüfung bei jeder Anfrage** (`middleware/auth.js`): Sitzung nicht beendet, Benutzer aktiv; Rolle, Name und E-Mail
  kommen aus der Datenbank. **Abmelden, Sperren und Rollenänderungen wirken sofort.**
- **Rotation mit Wiederverwendungs-Erkennung** (`services/sessionService.js`): Jede Erneuerung ersetzt das Token.
  Taucht ein bereits ausgetauschtes Token später wieder auf, gilt es als gestohlen → die ganze Sitzung wird beendet
  (`REFRESH_TOKEN_REUSED`). Innerhalb von 10 Sekunden gilt ein altes Token nur als „Erneuerung läuft“ (`409`).
- **Konto-Sperre** (`services/loginThrottle.js`): nach 5 Fehlversuchen je E-Mail-Adresse 15 Minuten
  (`429 ACCOUNT_LOCKED`, `Retry-After`), jede weitere Serie doppelt so lange, höchstens 24 h. Während der Sperre wird
  das Passwort nicht geprüft. Gezählt wird auch für unbekannte Adressen (die Sperre verrät nicht, ob ein Konto
  existiert); unbekannte Adressen kosten dieselbe Rechenzeit wie falsche Passwörter. Erfolgreiche Anmeldung und
  Passwort-Reset durch Admin oder CLI heben die Sperre auf.
- **Sitzungen werden beendet** bei Abmeldung, Passwortwechsel (alle *anderen* Geräte), Passwort-Reset durch Admin/CLI,
  Sperrung und Löschung des Kontos.
- **Protokoll**: `auth.login`, `auth.login_failed`, `auth.account_locked`, `auth.logout`,
  `auth.session_reuse_detected` (mit IP und Weg `web`/`app`).

Entwicklung: Frontend und Backend müssen unter **demselben Hostnamen** laufen (`localhost:3000` und `localhost:5000`,
nicht `127.0.0.1` und `localhost` mischen), sonst sendet der Browser die `SameSite=Strict`-Cookies nicht mit.

## Offline-Erfassung (App)

`POST /timetracking` akzeptiert eine vom Client erzeugte `clientId` (z. B. UUID, eindeutig je Mitarbeiter). Wird
dieselbe Anfrage wiederholt (Antwort ging verloren), entsteht kein zweiter Eintrag: Die API liefert den bestehenden
mit `200` statt `201`. Dieselbe `clientId` für einen anderen Tag ist ein Client-Fehler (`409 CLIENT_ID_CONFLICT`).
Weitere eindeutige Konflikte: `ENTRY_EXISTS` (Tag schon erfasst), `PERIOD_CLOSED` (Periode abgeschlossen).

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

Schema-Änderungen für bestehende Datenbanken: `models/migrations.js` (idempotent; neue Spalten vor `sync()`,
Datenpflege danach; legt vor der ersten Änderung eine Sicherungskopie der DB-Datei an).

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
- `test/phase2-api.test.js`: Konto-Sperre (Eskalation, Verfall), App-Sitzungen (Laufzeit, Weg-Bindung), idempotente
  Anlage, Fehlerformat, CSRF-Ausnahmen, Konfigurationsprüfung, OpenAPI-Dokument aktuell.
- Smoke-Test: prüft jede Erfolgsantwort gegen ihr Schema und listet Endpunkte ohne Erfolgsfall auf.
- Nach strukturellen Änderungen oder Änderungen an der Abrechnung immer ausführen.
