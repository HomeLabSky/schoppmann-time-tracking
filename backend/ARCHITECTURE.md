# Backend-Architektur

Express-API für die Zeiterfassung in **TypeScript (strict)** mit **SQLite über Drizzle/better-sqlite3**. Die REST-API
ist das Produkt: **Web-Oberfläche und (spätere) App sind zwei gleichberechtigte Clients**. Ziel der Struktur: klare
Schichten, eine Wahrheit je Domäne, ein maschinenlesbarer Vertrag (OpenAPI), der aus dem Code entsteht.

Quelltext liegt in `src/`, `npm run build` erzeugt `dist/` (läuft im Container). Entwicklung (`npm run dev`), Tests und
Smoke-Test laufen direkt aus `src/` über `tsx`.

## Schichten (von außen nach innen)

```
HTTP-Request
   │
   ▼
routes/        Routen-Definition mit Vertrag (lib/route.ts): Berechtigung, Eingabe- und Antwort-Schema.
   │           KEINE Geschäftslogik – übersetzt nur HTTP ↔ Service-Aufruf.
   ▼
services/      GESAMTE Geschäftslogik. Eine Klasse je Domäne. Wirft AppError('CODE', 'Meldung').
   ▼
models/        Domänen-Helfer ohne Datenbank: Passwort-Hashing, Antwortform eines Kontos/Zeiteintrags,
   │           abgeleitete Werte (Arbeitszeit, Verdienst aus dem eingefrorenen Satz).
   ▼
db/            schema.ts (Drizzle-Tabellen, Prüfregeln), client.ts (Verbindung, Transaktionen),
   │           migrate.ts (versionierte Migrationen, Übernahme alter Datenbanken)
   ▼
SQLite-Datei (DB_STORAGE)
```

Querschnitt:

```
schemas/       zod-Schemas je Domäne: Eingaben (geprüft, normalisiert) und Antworten (dokumentiert, in Tests geprüft).
lib/           errors.ts (AppError, Statuscode je Fehlercode), route.ts (Routen mit Vertrag, typisiertes req.valid),
               openapi.ts (OpenAPI-3.1-Dokument), logger.ts (pino, ohne personenbezogene Daten), paths.ts/env.ts
               (Backend-Ordner und .env unabhängig vom Startverzeichnis).
middleware/    auth.ts (Cookie oder Bearer), csrf.ts, errorHandler.ts (einziges Fehlerformat), security.ts
               (Helmet/CORS/Content-Type), rateLimiting.ts.
config/        Umgebungsvariablen, mit zod geprüft (ungültig = kein Start).
utils/         Reine Hilfen: billing.ts (Geldlogik), clock.ts, authCookies.ts, Sicherung (dbBackup.ts, backupStatus.ts).
scripts/       CLI: create-admin, reset-password, backup-db/-loop/-healthcheck, restore-db, openapi.
```

## Einstiegspunkte

| Datei | Verantwortung |
|---|---|
| `src/app.ts` | Baut die Express-App auf (Request-Log, Sicherheit, Routen, Error-Handler). Kein `listen()`. |
| `src/server.ts` | DB-Initialisierung, startet den HTTP-Listener, Prozess-Lifecycle. |
| `src/routes/index.ts` | Registriert alle Domänen-Router; eingehängt unter `/api/v1` und (Alias) `/api`. |
| `src/db/index.ts` | `initDatabase()`: Verbindung, Migrationen, Minijob-Aktivkennzeichen. |

## Domänen / Modul-Landkarte

Pfade relativ zu `/api/v1` (gleichwertig: `/api`).

| Domäne | Route | Service | Tabellen |
|---|---|---|---|
| Anmeldung (Web + App) | `routes/auth.ts` (`/auth`) | `authService.ts`, `sessionService.ts`, `loginThrottle.ts`, `userService.ts` | `Users`, `Sessions`, `LoginThrottles` |
| Zeiterfassung | `routes/timetracking.ts` (`/timetracking`) | `timeEntryService.ts`, `dateService.ts` | `TimeEntries` |
| Mitarbeiter (Selbstbedienung) | `routes/employee.ts` (`/employee`) | `userService.ts`, `minijobService.ts` | `Users`, `MinijobSettings` |
| Benutzerverwaltung | `routes/admin.ts` (`/admin`) | `userService.ts` | `Users` |
| Minijob-Grenzen | `routes/minijob.ts` (`/admin/minijob`) | `minijobService.ts` | `MinijobSettings` |
| Zeitnachweise & Monatsabschluss | `routes/timesheets.ts` (`/admin/timesheets`) | `periodService.ts`, `periodGuard.ts` | `PeriodClosures` |
| Lohnzettel (PDF) | `routes/employee.ts` (`/employee/payslips`), `routes/timesheets.ts` (`/admin/timesheets/…/payslip(s)`) | `payslipService.ts`, `utils/payslipPdf.ts` | `PeriodClosures`, `TimeEntries` |
| Änderungsprotokoll (nur lesend) | `routes/audit.ts` (`/admin/audit`) | `auditService.ts` | `AuditLogs` |
| Systemstatus | `routes/system.ts` (`/admin/system`) | `utils/backupStatus.ts` | – |
| Wartung (nur lokal, kein HTTP) | `scripts/create-admin.ts`, `scripts/reset-password.ts` | Drizzle direkt | `Users` |

## API-Vertrag (verbindlich)

- **Maschinenlesbar**: `GET /api/v1/openapi.json` bzw. die Datei `backend/openapi.json` (`npm run openapi`). Ein
  Unit-Test schlägt fehl, wenn die Datei nicht zum Code passt. Clients (App, Web) können daraus Typen erzeugen.
- **Versionierung**: `/api/v1` ist verbindlich. `/api` ist ein Alias für die bestehende Web-Oberfläche. Nicht
  abwärtskompatible Änderungen kommen unter `/api/v2` – installierte App-Versionen nutzen v1 weiter.
- Erfolg: `{ success: true, message, data }`
- Fehler: `{ success: false, error, code }`, bei Eingabefehlern zusätzlich `fields` (Meldung je Feld) und `details`;
  bei `ACCOUNT_LOCKED` `retryAfter` (+ Header `Retry-After`); bei `INTERNAL_ERROR` die `requestId`.
  Alle Codes mit Status stehen in `lib/errors.ts` (`ERROR_STATUS`) und im OpenAPI-Schema `Error`.
- `401` heißt ausschließlich „nicht (mehr) angemeldet“ – der Client erneuert dann still die Sitzung. Fachliche
  Ablehnungen bei bestehender Sitzung (z. B. `INVALID_CURRENT_PASSWORD`) sind **nie 401**, sondern 400/403/409.
- **Statuscodes und `code`-Werte dürfen nicht stillschweigend geändert werden** – sie sind Teil des Vertrags.

## Konventionen

- **Neue Route** = `api.get/post/…(pfad, { summary, auth, params, query, body, response, status, errors }, handler)`
  in `routes/*.ts` (siehe `lib/route.ts`). Der Handler bekommt geprüfte Eingaben in `req.valid` und gibt
  `{ data, message, status }` zurück. Unbekannte Body-Felder werden entfernt (kein Mass-Assignment).
- **Berechtigung** steht an der Route (`auth: 'public' | 'user' | 'employee' | 'admin'`); `/admin/*` prüft zusätzlich
  am Einhängepunkt.
- **Fehler**: `throw new AppError('CODE', 'Meldung')` – neue Codes in `lib/errors.ts` mit Status eintragen (der Typ
  `ErrorCode` lässt nur eingetragene Codes zu). Kein try/catch in Routen: Express 5 reicht Fehler an
  `middleware/errorHandler.ts` weiter.
- **Datei-Antworten** (PDF): Route mit `produces: 'application/pdf'`, der Handler gibt `{ file: { body, filename,
  contentType } }` zurück → Download mit `Content-Disposition: attachment` und `Cache-Control: no-store`; im
  OpenAPI-Dokument als Binärantwort. Lohnzettel rendert `utils/payslipPdf.ts` (pdfkit, Standardschriften, keine
  Schriftdateien) ausschließlich aus abgeschlossenen Perioden mit den eingefrorenen Zahlen.
- **Antwort-Schemas** werden im Smoke-Test (`VALIDATE_RESPONSES=1`) gegen jede echte Antwort geprüft; er listet
  Endpunkte ohne geprüfte Erfolgsantwort auf.
- **Logging** nur über `lib/logger.ts` bzw. `req.log`; keine E-Mail-Adressen, Namen oder Tokens, Personen als ID.
  `console` nur in CLI-Skripten.
- **Datenbankzugriff** nur in Services (und CLI-Skripten) über Drizzle (`db()`); Routen fragen nie direkt ab.
- **Transaktionen** sind synchron (better-sqlite3): `transaction(() => { … })` aus `db/client.ts`, darin **kein `await`**
  (Passwort-Hashing u. Ä. vorher erledigen). Änderung und Protokolleintrag gehören in dieselbe Transaktion.

- **ESLint** (`npm run lint`, einmalig `npm run lint:install`; `npm run lint:fix` behebt Formales): typgestützte Regeln
  von typescript-eslint, u. a. keine unbehandelten Promises, kein `await` auf Nicht-Promises, keine `any`-Werte im
  Server-Code, `console` nur in CLI-Skripten und Tests. Konfiguration und Abhängigkeiten liegen in `tools/eslint/`, weil
  typescript-eslint die JavaScript-API von TypeScript 6 braucht – das Backend selbst baut und prüft mit TypeScript 7
  (nativer Compiler ohne diese API). Läuft in der CI vor den Tests; 0 Warnungen erlaubt.

## Datenbank und Migrationen

- **Schema** in `src/db/schema.ts` (Tabellen, Indizes, Fremdschlüssel, **Prüfregeln/CHECK**: Rollen, Anmeldeweg,
  Pausen 0–480, Uhrzeiten `HH:MM:SS`, Datum `YYYY-MM-DD`, Grenzen ≥ 0, Zeiträume Ende nach Beginn …). Was die
  zod-Schemas an der API prüfen, sichert die Datenbank ein zweites Mal ab – auch gegen Fehler im Code und direktes SQL.
- **Trigger** (eigene Migrationen): Änderungsprotokoll unveränderlich (`0001`), keine überschneidenden Zeiteinträge eines
  Mitarbeiters (`0004`, auch über Mitternacht). **Ein Neuaufbau einer Tabelle** (drizzle-kit macht das z. B. für neue
  CHECK-Regeln) **löscht ihre Trigger** – danach in derselben Migration neu anlegen. `test/migrate.test.ts` prüft, dass
  alle Trigger vorhanden sind.
- **Speicherformate** wie zur Sequelize-Zeit (bestehende Datenbanken laufen ohne Umwandlung weiter): Zeitpunkte als
  Text `YYYY-MM-DD HH:MM:SS.SSS +00:00` (UTC), Wahrheitswerte 0/1 – siehe `src/db/columns.ts`.
- **Schema ändern:** `src/db/schema.ts` anpassen → `npm run db:generate` → neue Datei in `drizzle/` prüfen und
  einchecken. Eigenes SQL (Trigger, Datenbereinigung): `npx drizzle-kit generate --custom --name <name>`.
  Die CI schlägt fehl, wenn Schema und Migrationen auseinanderlaufen.
- **Anwenden** beim Start (`src/db/migrate.ts`): Sicherungskopie `*.pre-migration-<Zeit>`, dann **alle ausstehenden
  Migrationen in einer Transaktion** mit ausgeschalteten Fremdschlüsseln (der Tabellen-Neuaufbau für CHECK-Regeln
  würde sonst per ON DELETE CASCADE abhängige Zeilen löschen) und anschließender `foreign_key_check`. Scheitert ein
  Schritt – z. B. weil Altdaten eine Prüfregel verletzen –, bleibt die Datei unverändert und der Server nennt die Regel.
- **Übernahme alter Datenbanken:** Hat eine Datenbank Tabellen, aber noch keinen Migrationsverlauf
  (`__drizzle_migrations`), stammt sie aus der Sequelize-Zeit. Fehlende Spalten/Tabellen/Indizes werden ergänzt, die
  Ausgangsmigration `0000_baseline` als angewendet eingetragen, danach laufen die weiteren Migrationen normal.
  Getestet mit einem Abzug einer echten Sequelize-Datenbank (`test/fixtures/legacy-sequelize.sql`).

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
- **Prüfung bei jeder Anfrage** (`middleware/auth.ts`): Sitzung nicht beendet, Benutzer aktiv; Rolle, Name und E-Mail
  kommen aus der Datenbank. **Abmelden, Sperren und Rollenänderungen wirken sofort.**
- **Rotation mit Wiederverwendungs-Erkennung** (`services/sessionService.ts`): Jede Erneuerung ersetzt das Token.
  Taucht ein bereits ausgetauschtes Token später wieder auf, gilt es als gestohlen → die ganze Sitzung wird beendet
  (`REFRESH_TOKEN_REUSED`). Innerhalb von 10 Sekunden gilt ein altes Token nur als „Erneuerung läuft“ (`409`).
- **Konto-Sperre** (`services/loginThrottle.ts`): nach 5 Fehlversuchen je E-Mail-Adresse 15 Minuten
  (`429 ACCOUNT_LOCKED`, `Retry-After`), jede weitere Serie doppelt so lange, höchstens 24 h. Während der Sperre wird
  das Passwort nicht geprüft. Gezählt wird auch für unbekannte Adressen (die Sperre verrät nicht, ob ein Konto
  existiert); unbekannte Adressen kosten dieselbe Rechenzeit wie falsche Passwörter. Erfolgreiche Anmeldung und
  Passwort-Reset durch Admin oder CLI heben die Sperre auf.
- **Sitzungen werden beendet** bei Abmeldung, Passwortwechsel (alle *anderen* Geräte), Passwort-Reset durch Admin/CLI,
  Sperrung und Löschung des Kontos – und auf Wunsch:
- **Sitzungsübersicht** (Web und App gleich): `GET /auth/sessions` listet die eigenen laufenden Sitzungen (aktuelle
  zuerst, `current: true`; Bezeichnung aus dem Gerätenamen der App bzw. Browser/System aus dem User-Agent,
  `utils/userAgent.ts`; nie Token-Prüfwerte). `DELETE /auth/sessions/{sid}` beendet eine einzelne eigene Sitzung (die
  aktuelle nur über `/auth/logout` → `CANNOT_REVOKE_CURRENT_SESSION`; fremde/beendete → `404 SESSION_NOT_FOUND`).
  `POST /auth/sessions/revoke-others` = „auf allen anderen Geräten abmelden“. Admins: `POST /admin/users/{id}/sessions/revoke`
  beendet alle Sitzungen eines Benutzers, das Konto bleibt aktiv. Wirkt sofort, weil jede Anfrage die Sitzung prüft.
- **Zuletzt aktiv** (`lastUsedAt`): bei Anfragen höchstens alle 5 Minuten fortgeschrieben (kein Schreibzugriff je Anfrage).
- **Protokoll**: `auth.login`, `auth.login_failed`, `auth.account_locked`, `auth.logout`,
  `auth.session_reuse_detected` (mit IP und Weg `web`/`app`), `auth.session_revoke`, `auth.sessions_revoke_others`,
  `auth.sessions_revoke_all` (Admin; mit Anzahl beendeter Sitzungen).

Entwicklung: Frontend und Backend müssen unter **demselben Hostnamen** laufen (`localhost:3000` und `localhost:5000`,
nicht `127.0.0.1` und `localhost` mischen), sonst sendet der Browser die `SameSite=Strict`-Cookies nicht mit.

## Offline-Erfassung (App)

`POST /timetracking` akzeptiert eine vom Client erzeugte `clientId` (z. B. UUID, eindeutig je Mitarbeiter). Wird
dieselbe Anfrage wiederholt (Antwort ging verloren), entsteht kein zweiter Eintrag: Die API liefert den bestehenden
mit `200` statt `201`. Dieselbe `clientId` für einen anderen Tag ist ein Client-Fehler (`409 CLIENT_ID_CONFLICT`).
Weitere eindeutige Konflikte: `ENTRY_OVERLAP` (überschneidet sich mit einem anderen Eintrag), `PERIOD_CLOSED`
(Periode abgeschlossen).

## Rechenlogik (Abrechnung)

Die Geldlogik liegt als **reine Funktionen** in `utils/billing.ts` (kein DB-Zugriff, keine
Systemzeit): Arbeitsminuten, Verdienst, Fachregeln für Zeiteinträge, Auflösung der
Minijob-Grenze zu einem Stichtag und die Übertrag-Verrechnung (`foldCarry`). Beträge werden
in **ganzen Cent** gerechnet; erst die API-Antwort wandelt in Euro um. `utils/clock.ts`
liefert den Kalendertag in `Europe/Berlin` (nie `toISOString()` für „heute“ verwenden).

Wichtige Regeln:

- Jeder Zeiteintrag friert beim Anlegen den Stundensatz ein (`TimeEntry.hourlyRateCents`);
  spätere Lohnänderungen wirken nur auf neue Einträge.
- Für jede Periode gilt die Minijob-Grenze, die an ihrem Enddatum gültig war.
- Pause: nur wenn *keine* Angabe vorliegt, gilt der Standard – 30 min für den ersten Eintrag eines Tages, 0 für
  weitere (die Pause liegt zwischen den Einträgen); ein ausdrückliches `0` bleibt `0`.
- Neue Einträge: nicht in der Zukunft, höchstens 1 Monat zurück, 15 min bis 12 h.
- **Mehrere Einträge pro Tag** (geteilte Schichten): erlaubt, solange sie sich nicht überschneiden
  (`findOverlap`, Zeiträume auf einer durchgehenden Zeitachse, also auch mit einer Nachtschicht vom Vortag; direkt
  anschließend ist erlaubt) und die Arbeitszeit aller Einträge mit demselben Datum 12 h nicht übersteigt
  (`validateDayRules`; ein Eintrag zählt zum Tag seines Beginns). Gilt beim Anlegen und Bearbeiten.
- Summen einer Periode laufen über alle Einträge; `summary.workDays` zählt die Tage mit Einträgen.

Schema-Änderungen: siehe *Datenbank und Migrationen*.

## Änderungsprotokoll (Audit-Log)

Jede fachliche Änderung wird in `AuditLogs` festgehalten: wer (`actorId`, `actorEmail` als Momentaufnahme),
wann, welcher Vorgang (`time_entry.update`, `period.close`, `user.update` …), welcher Datensatz, welcher
Mitarbeiter betroffen ist (`targetUserId`) sowie Zustand vorher/nachher als JSON.

- **Gleiche Transaktion:** `AuditService.record(..., { transaction })` läuft zusammen mit der Änderung. Schlägt
  eine von beiden fehl, passiert keine – es gibt nie eine Änderung ohne Eintrag.
- **Unveränderlich:** SQLite-Trigger (`auditlogs_no_update` / `auditlogs_no_delete`, Migration
  `drizzle/0001_audit_triggers_and_cleanup.sql`) brechen jedes UPDATE/DELETE ab – auch
  bei direktem SQL. Für eine gewollte Bereinigung müssen die Trigger bewusst entfernt werden.
- **Keine Geheimnisse:** Snapshots enthalten nie Passwörter; `stripSecrets` entfernt zusätzlich Felder wie
  `password` und `token` aus allen Einträgen.
- **Auslöser (`actor`):** Routen übergeben `{ id, email }` aus dem JWT an die Services. Fehlt er, gilt der
  betroffene Benutzer selbst (Selbstbedienung/Registrierung).
- Lesen nur über `GET /api/admin/audit` (Filter: `userId`, `action`-Präfix, `entityType`, `from`, `to`, Seite).

## Monatsabschluss

`PeriodClosure` hält je (Mitarbeiter, Abrechnungsperiode) die eingefrorenen Zahlen (Minuten, Verdienst, Grenze,
Übertrag ein/aus, Auszahlung). Regeln (`services/periodService.ts`):

- Abschluss, sobald die Periode **begonnen** hat – auch **vor Periodenende** (vorzeitiger Abschluss, etwa um die
  Unterlagen früher an den Steuerberater zu geben; im Protokoll `meta.early`). Künftige Perioden: `PERIOD_NOT_STARTED`.
  Arbeitszeiten für die restlichen Tage werden Nachträge in der nächsten offenen Periode (siehe unten).
- Nur, wenn frühere Perioden **mit Einträgen** bereits abgeschlossen sind (der Übertrag baut aufeinander auf).
- In abgeschlossenen Perioden sind Ändern und Löschen von Zeiteinträgen gesperrt (`PERIOD_CLOSED`,
  Prüfung in `periodGuard.assertDateOpen`, innerhalb der Eintrags-Transaktion).
- **Nachträge:** Ein neuer Eintrag für einen Tag in einer abgeschlossenen Periode wird nicht abgelehnt, sondern
  behält sein Datum und bekommt `billingDate` = Beginn der nächsten offenen Periode (`periodGuard.nextOpenPeriodFor`).
  Perioden ordnen Einträge nach `coalesce(billingDate, date)` zu (Summen, Übertrag, Abschluss, Lohnzettel), der
  Abschluss des Arbeitstag-Monats bleibt unverändert. Gesperrt wird ein Nachtrag, sobald seine Abrechnungsperiode
  abgeschlossen ist. Überschneidungs- und Tagesregeln gelten weiter nach dem echten Datum.
- Für abgeschlossene Perioden gelten die **eingefrorenen** Zahlen – spätere Änderungen an Minijob-Grenzen verändern
  Auszahlung und Übertrag nicht.
- Wiedereröffnen nur durch Admins, **mit Begründung** (mind. 5 Zeichen) und nur für die **jüngste** abgeschlossene
  Periode. Der Vorgang inkl. Begründung steht im Protokoll.
- Konten mit Zeiteinträgen oder Abschlüssen können nicht gelöscht, nur deaktiviert werden (Nachweise bleiben erhalten).
- Ohne gültige Minijob-Grenze (für die Periode oder eine frühere offene Periode im Übertrag) meldet die API
  `summary.minijobLimitMissing`; der Abschluss wird mit `MINIJOB_LIMIT_MISSING` (409) abgelehnt.
- Monatsübersicht aller Mitarbeiter: `GET /api/v1/admin/timesheets/overview?month=YYYY-MM` – je Mitarbeiter Stunden,
  Beträge und Status (`open` läuft, `ready` abschließbar, `closed`) in dessen eigener Abrechnungsperiode
  (`PeriodService.overview`). Deaktivierte Konten erscheinen nur mit Einträgen in der Periode.

## Tests

- `npm test` führt alles aus: `npm run typecheck` (Code strikt, Tests), `npm run test:unit` (`test/*.test.ts`,
  Node-Testrunner über tsx) und `npm run smoke` (End-to-End gegen die HTTP-API, `test/smoke.ts`).
- Jede Testdatei bekommt eine eigene, frische SQLite-Datei (`test/env/unit-env.ts` als erster Import);
  Datensätze für Ausgangslagen legen die Helfer in `test/helpers.ts` direkt an.
- `test/billing.test.ts`: tabellengetriebene Tests der reinen Rechenlogik.
- `test/timeEntryService.test.ts`: Integrationstests gegen eine temporäre SQLite-DB (Pause,
  eingefrorener Stundensatz, Grenze je Periode, Monatsende, Periode 22.–21., Fachregeln).
- `test/sessions.test.ts`: Sitzungen – Rotation, Wiederverwendungs-Erkennung, Ablauf, Widerruf, Besitznachweis beim Abmelden.
- `test/audit-closure.test.ts`: Protokollierung, Unveränderlichkeit, keine Passwörter, Abschluss/Sperre,
  eingefrorene Zahlen, Reihenfolge, Wiedereröffnen mit Begründung, Monatsübersicht (Status, eigene Periode, Filter).
- `test/phase2-api.test.ts`: Konto-Sperre (Eskalation, Verfall), App-Sitzungen (Laufzeit, Weg-Bindung), idempotente
  Anlage, Fehlerformat, CSRF-Ausnahmen, Konfigurationsprüfung, OpenAPI-Dokument aktuell.
- `test/migrate.test.ts`: Übernahme einer Sequelize-Datenbank ohne Datenverlust (auch sehr alte Stände), Prüfregeln
  aktiv, zweiter Start ohne Änderung, atomarer Abbruch bei Altdaten, die eine Prüfregel verletzen.
- Smoke-Test: prüft jede Erfolgsantwort gegen ihr Schema und listet Endpunkte ohne Erfolgsfall auf.
- `test/e2e-server.ts` (`npm run e2e:server`): startet die API mit Wegwerf-DB und festen Testdaten für die
  Playwright-Tests des Frontends (`frontend/e2e`, `npm run e2e` im Ordner `frontend`). Nie gegen echte Daten verwenden.
- Nach strukturellen Änderungen oder Änderungen an der Abrechnung immer ausführen.
