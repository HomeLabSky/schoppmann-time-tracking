# Modernisierungsbericht – Schoppmann Time Tracking

Stand: 02.10.2026 · Basis: Branch `claude/unruffled-nobel-a1334e` (Commit `7bc687b`)
Umfang: komplettes Repo (Backend, Frontend, `shared/`, Konfiguration). Nichts wurde geändert.

> **Wie belastbar sind die Aussagen?**
> Alles mit **[gemessen]** habe ich ausgeführt (Build, Typecheck, Lint, `npm audit`, Smoke-Test, eigene Probe-Skripte).
> **[Code]** heißt: aus dem Quelltext gelesen, nicht ausgeführt. **[Annahme]** ist meine Einschätzung bzw. von dir zu bestätigen.
> Aufwände in Personentagen sind grobe Schätzungen.

---

## 1. Kurzfazit

Die **Backend-Struktur ist nach dem letzten Refactoring ordentlich** (Routen → Services → Models, dokumentiert in `backend/ARCHITECTURE.md`, 40 Smoke-Checks grün). Das Projekt ist aber **nicht auf neuestem Stand und hat drei Gruppen von Problemen, die vor jedem Redesign anstehen**:

1. **Die Anwendung ist nicht auslieferbar:** `next build` bricht ab, es gibt keine Lockfiles, Next.js 15.4.4 hat laut `npm audit` kritische Lücken, es gibt keine CI und keine Frontend-Tests.
2. **Die Zahlen auf der Oberfläche können falsch sein:** Ich habe drei Fachlogik-Fehler per Probe-Skript bestätigt (Pausen, Stundenlohn rückwirkend, Minijob-Grenze pro Monat – siehe 3.2). Eine schönere Oberfläche über falschen Beträgen wäre das falsche Investment.
3. **Das Frontend ist technisch ein Prototyp:** zwei parallele API-Clients plus ein dritter in `auth.ts`, 17 hartkodierte `localhost:5000`-Aufrufe, Auth-Prüfung an fünf Stellen per `localStorage`, 53 Inline-SVGs statt Icon-Bibliothek, null Barrierefreiheit, keine Mobilnavigation, kein Designsystem.

**Empfehlung:** In dieser Reihenfolge vorgehen – (0) Hygiene & Sicherheit → (1) Fachlogik korrekt und getestet → (2) Backend modernisieren → (3) Frontend neu aufbauen → (4) neue Funktionen. Details und Aufwand in Abschnitt 6.

---

## 2. Messwerte (Ist-Zustand)

| Prüfung | Ergebnis | Quelle |
|---|---|---|
| Backend Smoke-Test (`npm run smoke`) | **40 grün, 0 rot** | gemessen |
| Frontend `next build` | **FEHLGESCHLAGEN** – `admin/users/page.tsx:209` (Typfehler) | gemessen |
| Frontend `tsc --noEmit` | **16 Fehler** in 3 Dateien (`employee/page.tsx` 12, `admin/users/page.tsx` 2, `employee/layout.tsx` 2) | gemessen |
| Frontend ESLint | **72 Fehler, 27 Warnungen** (v. a. `any`, leere Interfaces, ungenutzte Variablen) | gemessen |
| `npm audit` Backend | 9 Funde (1 kritisch, 4 hoch, 2 mittel, 2 niedrig) – überwiegend Build-Kette `sqlite3` → `node-gyp` → `tar`, dazu `sequelize` → `uuid` | gemessen |
| `npm audit` Frontend | 3 Funde (1 kritisch, 2 hoch) – **alle durch `next@15.4.4`**, u. a. RCE im React-Flight-Protokoll, SSRF, Middleware-Bypass | gemessen |
| Lockfiles | **keine im Repo** – `package-lock.json` steht in `.gitignore:155`; `npm ci` schlägt deshalb fehl | gemessen |
| Tests | Backend: 1 Smoke-Skript. Frontend: **keine**. CI: **keine** (`.github/` fehlt) | gemessen |
| Ungenutzte Frontend-Abhängigkeiten | `axios`, `@types/axios`, `date-fns`, `lucide-react`: **0 Importe** (stattdessen `fetch` und Inline-SVG) | gemessen |
| Totcode Backend | 11 Funktionen ohne einzige Verwendung (u. a. `ipWhitelist`, `requestSizeLimit`, `debugAuth`, `generateTemporaryToken`, `verifyAccessToken`) | gemessen |
| Größte Dateien | `admin/users/page.tsx` 823 Z., `admin/minijob/page.tsx` 761 Z., `timeEntryService.js` 648 Z. | gemessen |

Verfügbare Major-Versionen laut `npm outdated`: Next 16, Express 5, sqlite3 6, dotenv 18, React 19.3.

---

## 3. Kritische Befunde (vor allem anderen)

### 3.1 Sicherheit & Auslieferbarkeit

| # | Befund | Beleg | Empfehlung |
|---|---|---|---|
| S1 | **Produktions-Build bricht ab.** Dev läuft nur, weil `next dev` Typfehler ignoriert. | gemessen | Typfehler beheben; CI-Gate `build` |
| S2 | **Next.js 15.4.4 ist verwundbar** (Kritisch laut `npm audit`). Viele Advisories betreffen Funktionen, die ihr kaum nutzt (Server Actions, Image Optimizer) – das RCE-Advisory betrifft aber App-Router-Server generell. | gemessen | Sofort auf gepatchte Version, mittelfristig Next 16 |
| S3 | **Lockfiles sind ignoriert** → jede Installation zieht andere Versionen, Builds sind nicht reproduzierbar, Audits nicht belastbar. | `.gitignore:155` | `package-lock.json` einchecken, aus `.gitignore` entfernen |
| S4 | **Öffentlicher Reset-Endpunkt:** `POST /api/setup/dev-reset` ist ohne Login erreichbar (Router `publicAPI`) und existiert, wenn `nodeEnv === 'development'`. Der Default von `nodeEnv` ist aber `'development'`, wenn `NODE_ENV` **nicht gesetzt** ist. Vergisst man die Variable auf dem Server, kann jeder Benutzer zurücksetzen und einen Admin mit bekanntem Passwort `Admin123!` anlegen. | Code: `routes/setup.js:196`, `routes/index.js:118`, `config/index.js:27` | Endpunkt ersatzlos entfernen; Default `production`; Setup nur per CLI |
| S5 | **Bekannte Standardpasswörter im Code und README** (`Admin123!`, `Test123!`) in 4 Routen; `GET` mit Seiteneffekt (`create-first-admin`) in zwei Varianten (`/api/setup/…` und `/api/admin/…`). | Code | Ersten Admin per CLI-Skript mit abgefragtem Passwort anlegen; Routen löschen |
| S6 | **Geheimnis-Fallback wird in Produktion akzeptiert:** Der Fallback `dev_fallback_secret_not_for_production` hat 38 Zeichen und besteht damit die ≥32-Prüfung. (Korrektur: Die echte `backend/.env` auf D: enthält eigene Secrets mit 56/60 Zeichen; die Fallbacks greifen dort nicht. Das Risiko besteht für jede Umgebung, in der die Variablen fehlen.) | Code `config/index.js:13-36` | Kein Fallback; Start verweigern, wenn Secret fehlt; `.env.example` ergänzen |
| S7 | **Offene Selbstregistrierung** liefert sofort Tokens. Die Domain-Whitelist greift nur in `production` und enthält `example.com`. | Code `validation.js:12-17`, `routes/auth.js` | Registrierung abschalten, Konten per Admin-Einladung |
| S8 | **Info-Leck:** `/health`, `/api/version`, `/api/setup/status|health|info` sind öffentlich und nennen Node-/Express-Version, Dependency-Versionen, DB-Pfad, Speicher, Benutzeranzahl. Acht Status-Endpunkte für eine Aufgabe. | Code `app.js:77-107` | Einen schlanken `/healthz` ohne Details behalten |
| S9 | **Tokens im `localStorage`** (Access + Refresh) → bei jeder XSS-Lücke komplett abgreifbar. Refresh-Token wird nicht rotiert und kann nicht widerrufen werden (7 Tage gültig). | Code `lib/api.ts`, `tokenService.js` | Refresh-Token als `httpOnly`-Cookie mit Rotation; Access-Token nur im Speicher |
| S10 | **Deaktivierte/gelöschte Benutzer behalten bis zu 15 min Zugriff**, weil `authenticateToken` den Benutzer nicht in der DB prüft. Rollenänderungen greifen ebenfalls verzögert. | Code `middleware/auth.js` | Kurz cachen + DB-Check, oder Session-Tabelle |
| S11 | **Sperre nur pro IP**, nicht pro Konto; hinter einem Proxy zählen alle als dieselbe IP, solange `trust proxy` nicht konfiguriert ist. | Code `rateLimiting.js` | Zusätzlich Konto-Sperre mit Backoff; `trust proxy` setzen |
| S12 | **Personenbezogene Daten im Log:** jede Anfrage schreibt E-Mail-Adressen per `console.log` (Datenminimierung, DSGVO). | Code (alle Routen) | Strukturiertes Logging (pino) mit Request-ID statt PII |
| S13 | **Kein Passwort-Zurücksetzen** – genau das Problem, das du heute hattest. Es gibt weder Self-Service noch Admin-Funktion „Passwort zurücksetzen“ noch CLI. | Code | Admin-Aktion + CLI `npm run user:reset-password` (Phase 0); später E-Mail-Flow |

### 3.2 Fachlogik: drei bestätigte Fehler

Ich habe die Services mit einer temporären Datenbank direkt aufgerufen **[gemessen]**:

| # | Erwartung | Tatsächlich | Ursache |
|---|---|---|---|
| F1 | Eintrag 09:00–17:00 mit „Pause 0“ → **8:00 h** | Beim **Anlegen**: Pause **30** min gespeichert, Arbeitszeit **07:30**. Beim **Bearbeiten** desselben Eintrags mit Pause 0: **08:00**. Derselbe Eintrag ändert also seine Dauer allein durch Speichern. | `timeEntryService.js:266`: `breakMinutes \|\| 30` – `0` ist falsy. Das Frontend sendet überall hartkodiert `0`. |
| F2 | Verdienst eines **vergangenen** Monats bleibt stabil | Lohnänderung 10 € → 20 € verdoppelt rückwirkend den Verdienst von Juni 2024 (**80 € → 160 €**). Bereits abgerechnete Monate ändern sich. | `TimeEntry.earnings` nutzt immer den *aktuellen* `User.stundenlohn` |
| F3 | Für Juni 2024 gilt die damals gültige Minijob-Grenze | Es wird die **heute** gültige verwendet (Probe: Grenze 100 € gültig 2024, 600 € ab 2025 → Juni 2024 rechnete mit **600**). Übertrag und „Limit überschritten“ sind für alte Monate damit falsch. | `getCurrentSetting()` ohne Periodenbezug, `timeEntryService.js:83` |

Weitere Fachlogik-Risiken **[Code]**:

- **Geld als Fließkommazahl** (`Math.round(x*100)/100` über `DECIMAL`/`number`) – Summationsfehler sind möglich; besser ganzzahlige Cent-Beträge.
- **Nur ein Eintrag pro Tag** (`unique_user_date`): geteilte Schichten sind unmöglich.
- **Regeln nur im Frontend:** „max. 1 Monat zurück“, „nicht in der Zukunft“, „max. 12 h“ prüft nur der Browser (`lib/timetracking.ts:195-245`). Das Backend lässt beliebige Daten zu; gleichzeitig blockiert das Frontend Nachtschichten, die das Backend unterstützt.
- **Übertrag-Berechnung** (`calculateCarryIn`) iteriert ab dem ersten Eintrag Periode für Periode mit je einer DB-Abfrage; `getMultiMonthStats` ruft das 12× auf → O(n²)-Abfragen.
- **Hartkodierte Grenzen:** 538 € in beiden Reset-Routen, 550 € als Fallback im Service. **[Annahme – bitte prüfen]** Die Minijob-Grenze ist an den Mindestlohn gekoppelt und hat sich seit 2024 geändert (2025: 556 €; 2026: 603 €).
- **Nachweispflicht:** **[Annahme – bitte rechtlich prüfen]** Für Minijobber verlangt das Mindestlohngesetz (§ 17 MiLoG) tägliche Aufzeichnung von Beginn, Ende und Dauer, zeitnah und mit Aufbewahrung. Heute kann jeder Eintrag ohne Spur gelöscht oder geändert werden, und es gibt keinen Monatsabschluss.
- Der Smoke-Test hat F1–F3 nicht aufgedeckt: Er prüft den API-Vertrag, nicht die Rechenergebnisse.

### 3.3 Funktionslücken (aus dem Code ersichtlich)

- **Admins können keine Arbeitszeiten ansehen oder korrigieren** (`admin.js` und `minijob.js` enthalten keinen Zugriff auf `TimeEntry`). Die Abrechnung ist also nur über die Mitarbeiter selbst möglich.
- **`lohnzettelEmail` wird nirgends verwendet** – kein Mailversand, kein Export, kein PDF.
- **Tote Links:** `/employee/settings` (2× verlinkt) und `/admin/logs` existieren nicht → 404. Die „Letzten Aktivitäten“ im Admin-Dashboard sind **fest einprogrammierte Beispieldaten** („Max Mustermann …, System-Backup erstellt“), werden aber wie echte Daten dargestellt.
- **Verwaiste Seite** `employee/page.tsx` (Route `/employee`) mit 12 Typfehlern; die eigentliche Zeiterfassung liegt in `employee/dashboard` (irreführender Name).
- **Datenbankpfad ist relativ zum Startverzeichnis** (`./database/timetracking.db`, `config/index.js:46`) und `*.db` ist ignoriert. Wer das Backend aus einem anderen Ordner oder einem frischen Worktree startet, bekommt still eine neue, leere Datenbank (so ist es dir heute passiert: „no such table: Users“). Es gibt kein dokumentiertes Backup.

---

## 4. Architektur – was ich ändern würde

### 4.1 Was bleibt (bewusst nicht anfassen)

- **Getrenntes Frontend/Backend** und die **Schichtung Routen → Services → Models** inkl. `ARCHITECTURE.md`.
- **SQLite** reicht für diese Größenordnung, sofern es ein Backup gibt (nächtliche Kopie oder Litestream) und der Pfad absolut konfiguriert ist.
- Das **Abrechnungsperioden-Konzept** (`abrechnungStart`/`abrechnungEnde`) ist fachlich sinnvoll; ich würde das Verhalten behalten, aber die Implementierung neu schreiben und tabellengetrieben testen.
- bcrypt-Hashing, Helmet, Rate-Limiting, Transaktionen beim Schreiben, Schutz vor Selbstlöschung.

### 4.2 Zielbild

```
schoppmann-time-tracking/            (npm-Workspaces, 1 Lockfile)
├─ apps/
│  ├─ api/        Express 5 + TypeScript
│  │   src/modules/{auth,users,time-entries,minijob,billing}/
│  │        ├─ *.routes.ts   (dünn: HTTP ↔ Service)
│  │        ├─ *.service.ts  (Geschäftslogik, rein, testbar)
│  │        └─ *.schema.ts   (zod)
│  │   src/db/  Schema + Migrationen
│  │   src/lib/ config (zod-validiert), logger (pino), errors, clock
│  └─ web/        Next.js 16 (App Router) + Tailwind v4 + shadcn/ui
└─ packages/
   └─ shared/     zod-Schemas + abgeleitete Typen (EINE Wahrheit für FE & BE)
```

Heute existiert `shared/` zwar, wird aber **von niemandem importiert** (nur im README erwähnt); das Frontend pflegt eigene, teils abweichende Typen (`types/api.ts`, 411 Zeilen).

### 4.3 Backend-Maßnahmen

| Thema | Heute | Soll | Nutzen |
|---|---|---|---|
| Sprache | JavaScript (obwohl `typescript`/`ts-node` als devDependency vorhanden) | TypeScript, `strict` | Fehler beim Bauen statt in Produktion |
| Framework | Express 4 | Express 5 (async-Fehler automatisch an Handler) | entfernt die 47 `try/catch`-Blöcke in den Routen |
| Validierung | `express-validator` in Middleware + zusätzlich Model-Validierung + Frontend-Duplikate | `zod`-Schemas aus `packages/shared` | eine Definition, FE und BE identisch |
| Fehler | Strings `CODE:Nachricht`, per Split geparst (`serviceErrors.js`) | `AppError`-Klassen mit `code`, `status`; ein zentraler Error-Handler | typsicher, keine String-Parserei |
| Statuscodes | Ungültiger Token → **403**, Frontend refresht bei 401 *und* 403 | 401 = nicht angemeldet, 403 = keine Berechtigung | Frontend kann Berechtigung von Ablauf unterscheiden |
| DB-Zugriff | Sequelize 6 + `sequelize.sync()` (Tabellen-Drift möglich, keine Migrationen) | Drizzle (oder Prisma) + `better-sqlite3` + **versionierte Migrationen** | sichere Schemaänderungen; `better-sqlite3` beseitigt die `node-gyp`/`tar`-Audit-Kette |
| Geld | `DECIMAL`/Float | Ganzzahl-Cent, Rundungsregel zentral | keine Rundungsfehler |
| Verdienst | aktueller Stundenlohn | **Stundensatz pro Eintrag einfrieren** (Snapshot), Limit pro Periode auflösen | behebt F2/F3 |
| Monatsabschluss | keiner | Perioden schließen (danach nur mit Korrekturbuchung), **Änderungsprotokoll** (Audit-Log) | Nachvollziehbarkeit, ersetzt die Mock-Aktivitäten |
| Zeiteinträge | 1 pro Tag, Pause mit Falsy-Bug | n Einträge pro Tag, Pause explizit (`null` = Standard, `0` = keine), serverseitige Regeln | behebt F1 |
| Authentifizierung | JWT im `localStorage`, 2 Secrets, kein Widerruf | `httpOnly`-Cookie für Refresh (Rotation + Wiederverwendungserkennung), Sessions-Tabelle, Passwort-Reset-Flow | S9, S10, S13 |
| Konfiguration | Fallbacks, `NODE_ENV` default `development` | `zod`-geprüfte Env-Variablen, Start bricht bei Fehlern ab, `.env.example`, absoluter DB-Pfad | S4, S6 |
| Logging | `console.log` mit Emojis und E-Mail | `pino`, Request-ID, keine PII | S12 |
| Totcode/Dopplung | `MinijobSetting.getCurrentSetting` ≙ `MinijobService.getCurrentSetting`; `getDateBefore` 2×; Endpunktliste 2× hartkodiert in `routes/index.js`; `jwt.verify` in Middleware statt `TokenService` | entfernen/zusammenführen | weniger Fläche, weniger Widersprüche |
| Performance | N+1 beim Übertrag | Verdienst pro Periode in **einer** aggregierten Abfrage, Übertrag im Speicher falten | 12 Monate statt ~100 Abfragen |
| Tests | 1 Smoke-Skript | Vitest + Supertest; Rechenkern (Perioden, Übertrag, Limit-Auflösung) **tabellengetrieben**; Smoke-Skript als E2E behalten | schützt genau den fehleranfälligen Teil |
| API-Doku | Handgepflegte JSON-Listen | OpenAPI aus den zod-Schemas | immer aktuell |

### 4.4 Frontend-Architektur

| Thema | Heute | Soll |
|---|---|---|
| API-Zugriff | `lib/api.ts` (ApiClient + TokenManager), **identischer** zweiter Client + TokenManager + `AuthManager` in `lib/auth.ts`; Seiten rufen zusätzlich direkt `fetch('http://localhost:5000/…')` (17 Stellen) | **ein** typisierter Client; Basis-URL aus Umgebung bzw. Next-Rewrite `/api` (entfernt CORS und ermöglicht Cookies) |
| Server-Zustand | `useState` + `useEffect` je Seite (10–13 `useState` pro Seite), manuelles Neuladen | **TanStack Query** (Cache, Reload, Fehler/Loading einheitlich, optimistische Updates) |
| Auth-Schutz | 5 verschiedene Client-Prüfungen per `localStorage` (Landing, `(dashboard)/layout`, `employee/layout`, `admin/layout`, Seiten) – kurzes Aufblitzen der Seite möglich | **Next-Middleware** (Cookie vorhanden?) + eine `<RequireRole>`-Komponente; Rollenprüfung serverseitig maßgeblich |
| Formulare | handgebaut, ~800-Zeilen-Seiten mit 3 Modals inline | `react-hook-form` + zod-Schema aus `shared`; Seiten in Feature-Komponenten zerlegen (`components/features/…` existiert bereits als leere Ordner) |
| Typen | `any` an 72 Stellen, `useState(null)` ohne Typ | strikt, generiert aus `shared`; ESLint-Regeln als Fehler in CI |
| Fehler/Feedback | `confirm()`, Statusmeldung als String mit `✅`/`❌` und `message.includes('✅')` zur Farbwahl | Toasts + Bestätigungsdialog; Zustand typisiert, nicht über Emoji |
| Datum | `new Date().toISOString().split('T')[0]` als „heute“ (liefert **UTC-Datum**: zwischen 0:00 und 1:00/2:00 Ortszeit „gestern“) an 6 Stellen; `date-fns` installiert, aber ungenutzt | zentrale Datums-Helfer mit `date-fns` (`de`-Locale), Europa/Berlin |
| Formatierung | `formatCurrency`/`formatDate` in `utils.ts` **und** lokal dupliziert in 3 Seiten | nur `utils.ts` |
| Next/Tailwind | Next 15.4.4, `tailwind.config.js` wird unter Tailwind v4 nicht mehr geladen; `bg-opacity-50` (Modal-Hintergründe) ist in v4 entfernt – **[Annahme]** Overlay wird dadurch deckend schwarz, bitte im Browser prüfen | Next 16, Tailwind v4 CSS-first (`@theme`-Tokens in `globals.css`), alte Utilities migrieren |
| Bilder/Fonts | `<img>` mit 1,1-MB-PNG-Logo (quadratisch, viel Weißraum) in 32-px-Kopfzeile; `Geist` wird geladen, aber **nie angewendet** (`geistSans`/`geistMono` unbenutzt) | SVG-Logo (Kopf-/Vollversion), `next/image`, Schrift wirklich einbinden |
| Abhängigkeiten | `axios`, `date-fns`, `lucide-react`, `@types/axios` ungenutzt | `lucide-react` + `date-fns` nutzen, `axios` entfernen |

---

## 5. Oberfläche – was ich ändern würde

### 5.1 Befunde

- **Keine Markenidentität:** Das Logo ist dunkles Marineblau mit Serifen-Wortmarke; die Oberfläche nutzt generisches Tailwind-`blue-600`/`green-600`/`slate`. Admin-Bereich nutzt `gray`, Mitarbeiterbereich `slate` – uneinheitlich.
- **Mobil unbenutzbar:** Mitarbeiter-Navigation ist ab `md` sichtbar (`hidden md:flex`) und hat **keinen Ersatz** auf dem Handy; der Menü-Button im Admin-Header hat **keinen Klick-Handler**. Die Zeiterfassung ist eine breite Tabelle mit Inline-Bearbeitung – genau die Aufgabe, die man am Handy erledigen will.
- **Barrierefreiheit:** In allen Seiten kommt **kein einziges** `htmlFor`, `aria-*` oder `role=` vor. Labels sind nicht mit Feldern verknüpft, Modals haben weder Fokusfalle noch Esc-Schließen, Status nur über Farbe.
- **Kein Dunkelmodus**, keine Design-Tokens, keine wiederverwendbaren Komponenten: Button-, Input-, Karten- und Modal-Klassen sind hunderte Male kopiert; Icons als 53 Inline-SVG-Pfade im Quelltext, obwohl `lucide-react` installiert ist.
- **Wichtige Information ist versteckt:** Wie viel vom Minijob-Limit ist verbraucht? Der Mitarbeiter sieht Zahlenkarten, aber keine Fortschrittsanzeige; Warnung erst *nach* Überschreitung.
- **Platzhalter statt Funktion:** „System-Test“-Karten (Admin und Mitarbeiter), erfundene Aktivitäten, „System-Status: Online“ ist fest eingetragen.
- Login: „Konto erstellen“ prominent (siehe S7), kein „Passwort vergessen“, Footer „© 2024“.

### 5.2 Zielbild

**Designsystem:** shadcn/ui (Radix) auf Tailwind v4. Passt zum Bestand: `clsx` und eine `cn()`-Hilfe sind schon da, `lucide-react` ist installiert. Das liefert barrierefreie Dialoge, Selects, Tabellen, Toasts und Tastaturbedienung ohne Eigenbau.

**Tokens (Vorschlag, aus dem Logo abgeleitet):**
- Primär: Marineblau (Logo-Farbe, ≈ `#1F3A5F`), Hover/Active als Abstufungen; Akzent sparsam.
- Status: Erfolg/Warnung/Fehler getrennt von der Marke; Warnstufe „Limit ≥ 80 %“.
- Typografie: Serife nur für die Wortmarke/Überschriften der Marke, UI in einer Grotesk (Geist ist bereits geladen).
- Hell/Dunkel über `prefers-color-scheme` plus Umschalter; Kontrast ≥ AA.

**Mitarbeiter (mobile-first, 80 % der Nutzung):**
1. **Start = „Heute“**: Großer Button „Arbeitszeit erfassen“ (Bottom-Sheet mit Start/Ende, Standardwerte aus dem letzten Eintrag), optional Stempeluhr „Start/Stop“.
2. **Limit-Fortschritt** als Balken mit Zahlen („412 € von 603 € · 68 %“), Warnfarbe ab 80 %, Hinweis auf Übertrag.
3. **Periodenliste als Karten** auf dem Handy, Tabelle ab Tablet; Bearbeiten im Sheet statt Inline-Zellen; Löschen mit Bestätigungsdialog.
4. Periodenwähler als Segment/Prev-Next statt breitem `<select>`.
5. Einstellungen & Passwort ändern endlich als echte Seite (`/employee/settings`).

**Admin (Desktop-orientiert):**
1. Dashboard mit echten Kennzahlen: Stunden und Verdienst pro Mitarbeiter in der laufenden Periode, Mitarbeiter nahe/über Limit, offene Korrekturen.
2. **Zeiten-Ansicht je Mitarbeiter** (ansehen, korrigieren mit Protokoll, Periode abschließen), Export **CSV/PDF** und Versand an `lohnzettelEmail`.
3. Benutzerverwaltung mit Suche/Filter/Paginierung (Backend kann es bereits), Aktion „Passwort zurücksetzen“, Einladungslink statt freier Registrierung.
4. Minijob-Grenzen als **Zeitleiste** (Gültigkeitsbereiche sichtbar, Überlappungen sofort erkennbar) statt Liste; Neuberechnung mit Vorschau („x Einträge betroffen“).
5. Echtes Aktivitätsprotokoll (speist sich aus dem Audit-Log).

**Querschnitt:** deutsche Texte zentral, `Intl`-Formatierung (€ und Datum), Skeleton-Loader statt Vollbild-Spinner, Leerzustände mit Handlungsaufforderung, tastaturbedienbar, `prefers-reduced-motion` beachten, Logo als SVG.

---

## 6. Umsetzungsplan

| Phase | Inhalt | Aufwand (grob) | Ergebnis |
|---|---|---|---|
| **0 – Hygiene & Sicherheit** | Build-Fehler beheben; Lockfiles einchecken; Next patchen; `dev-reset`, feste Passwörter und `GET`-Setup entfernen → CLI für ersten Admin/Passwort-Reset; Env-Validierung ohne Fallbacks, `NODE_ENV`-Default `production`; Registrierung abschaltbar; `/health` verschlanken; GitHub-Actions-CI (Typecheck, Lint, Build, Smoke, `npm audit`); `.env.example`; DB-Pfad absolut + Backup-Hinweis | 1–2 Tage | auslieferbar und nicht mehr trivial angreifbar |
| **1 – Fachlogik korrigieren** | F1–F3 beheben (Pause `null`/`0`, Stundensatz-Snapshot pro Eintrag mit Migration der Bestandsdaten, Limit pro Periode); Regeln (Zeitraum, Nachtschicht, Maximaldauer) serverseitig; Geld in Cent; Rechenkern mit Tabellen-Tests absichern | 3–5 Tage | korrekte Beträge, Regressionsschutz |
| **2 – Backend modernisieren** | TypeScript, Express 5, zod + `shared`, Drizzle/`better-sqlite3` + Migrationen, `AppError`, pino, Cookie-Auth mit Rotation, Audit-Log, Monatsabschluss, aggregierter Übertrag, Totcode entfernen | 5–8 Tage | wartbar, typsicher, nachvollziehbar |
| **3 – Frontend neu aufbauen** | Next 16, Tailwind-v4-Tokens, shadcn/ui, **ein** API-Client + TanStack Query, Middleware-Auth, Seiten neu (mobile-first), A11y, Dunkelmodus, SVG-Logo, tote Links/Mocks entfernen, Playwright-Smoke (Login → Eintrag → Summe) | 6–10 Tage | moderne, barrierefreie, mobile Oberfläche |
| **4 – Funktionen** | Admin-Zeitenansicht + Freigabe, Export/Lohnzettel-Mail, Stempeluhr, Erinnerungen bei Limit-Nähe, PWA | je 1–3 Tage | echter Mehrwert für die Abrechnung |

**Warum diese Reihenfolge:** Phase 0 macht das Projekt überhaupt auslieferbar; Phase 1 stellt sicher, dass die Zahlen stimmen, **bevor** sie in einer neuen Oberfläche prominent dargestellt werden; Phase 2 liefert Schemas/Typen, auf denen Phase 3 aufbaut. Phase 0 und 1 lassen sich ohne Redesign umsetzen und sind unabhängig voneinander freigebbar.

**Risiken:** Datenmigration (Stundensatz-Snapshot für Bestandseinträge: Annahme „Satz von heute“, bitte fachlich bestätigen); API-Vertrag ändert sich bei Cookie-Auth (Frontend und Backend gemeinsam umstellen); Verhalten der Perioden bei `abrechnungStart > abrechnungEnde` (z. B. 22.–21.) muss mit Testfällen aus echten Abrechnungen abgesichert werden.

---

## 7. Entscheidungen, die ich von dir brauche

1. **Umfang:** Nur Phase 0–1 (Stabilisieren), oder das ganze Programm bis Phase 3?
2. **Registrierung:** Soll sich jemand selbst registrieren dürfen, oder nur Einladung durch Admins?
3. **Abrechnung:** Wird nach diesem System tatsächlich abgerechnet (dann Monatsabschluss + Protokoll zwingend), oder ist es eine Arbeitshilfe? Wer prüft die Fachregeln (Minijob-Übertrag, Grenzen)?
4. **Mailversand** für Passwort-Reset und Lohnzettel: ist ein SMTP-Zugang vorhanden?
5. **Betrieb:** Wo soll es laufen (eigener Server, Docker, Cloud)? Davon hängen Backup, HTTPS/Cookies und Proxy-Konfiguration ab.
6. **Nutzung:** Überwiegend Handy oder Desktop bei den Mitarbeitern? Bestimmt, ob die Stempeluhr/PWA Priorität bekommt.
7. **Marke:** Gibt es Farbwerte und Schriften aus dem Corporate Design (und das Logo als Vektor)? Sonst leite ich sie aus dem PNG ab.

---

## Anhang – wie ich gemessen habe

```bash
cd backend  && npm install && npm run smoke && npm audit
cd frontend && npm install && npx tsc --noEmit && npx eslint src && npm run build && npm audit
```

Die drei Fachlogik-Fehler stammen aus einem eigenen Probe-Skript, das `TimeEntryService` gegen eine temporäre SQLite-Datei aufruft (nicht im Repo abgelegt). Falls gewünscht, überführe ich es in reguläre Tests.

---

## Status Phase 0 (umgesetzt, Branch `claude/phase0-hygiene`)

| Punkt | Stand |
|---|---|
| S1 Produktions-Build | behoben: `next build` läuft (Typfehler gefixt, `/employee` leitet nur noch weiter) |
| S2 Next.js | auf 15.5.27 angehoben; `npm audit` Frontend: 3 Funde (1 kritisch) → 2 (0 kritisch). Rest (`next`, `postcss`) nur mit Next 16 → Phase 3 |
| S3 Lockfiles | eingecheckt (PR #2), CI nutzt `npm ci` |
| S4 `dev-reset` | Endpunkt und kompletter Setup-Router entfernt; `NODE_ENV` ist standardmäßig `production` |
| S5 Standardpasswörter | `create-first-admin` (2×), `reset-database` (2×) entfernt; Ersatz: `npm run admin:create`, `npm run user:reset-password` |
| S6 Secret-Fallbacks | entfernt; Backend startet ohne `JWT_SECRET`/`JWT_REFRESH_SECRET` (≥ 32 Zeichen) nicht |
| S7 Registrierung | standardmäßig aus (`ALLOW_REGISTRATION`), Domain-Liste konfigurierbar (`ALLOWED_EMAIL_DOMAINS`) statt fest verdrahtet inkl. `example.com`; Login-Seite blendet den Link aus |
| S8 Info-Leck | `/health`, `/`, `/api/` ohne Versionen, Pfade, Speicher; `/api/version`, `/api/setup/*`, `/api/dev/*` entfernt |
| S11 Proxy | `TRUST_PROXY` konfigurierbar |
| S13 Passwort-Reset | CLI vorhanden; im Portal weiterhin über *Benutzer → Bearbeiten* |
| Weitere | DB-Pfad relativ zu `backend/` statt Startverzeichnis; Request-Body-Limit 10 MB → 1 MB; Klartext-Passwort-Logging im Admin-Frontend entfernt; ungenutztes `axios` entfernt; 11 tote Funktionen entfernt; CI-Workflow ergänzt |
| Smoke-Test | 44 Prüfungen grün (inkl. neuer Checks, dass entfernte Routen 404 liefern und Registrierung 403 ist) |

Bewusst offen (Phase 1–3): S9 Tokens im `localStorage`, S10 Benutzerprüfung pro Request, S11 Konto-Sperre, S12 PII im Log, Fachlogik F1–F3, ESLint-Altlasten (`no-explicit-any` ist übergangsweise Warnung).

---

## Status Phase 1 (umgesetzt, Branch `claude/phase1-fachlogik`)

| Punkt | Stand |
|---|---|
| F1 Pause | behoben: ausdrückliches `0` bleibt `0` (Anlegen = Bearbeiten); Standard 30 min nur ohne Angabe |
| F2 Stundenlohn rückwirkend | behoben: Stundensatz wird pro Eintrag eingefroren (`hourlyRateCents`); Lohnänderung wirkt nur auf neue Einträge |
| F3 Minijob-Grenze | behoben: je Periode gilt die am Periodenende gültige Grenze, auch für den Übertrag |
| **Neu gefunden: Monatsletzter** | behoben: Einträge am 30./31. fehlten in der Kalendermonat-Ansicht (Zeitzonenfehler `new Date(y, m, 0).toISOString()` → Vortag) |
| **Neu gefunden: Übertrag-Limit** | behoben: Übertrag brach nach 50 Monaten ab (jetzt 600) |
| Geld in Cent | `utils/billing.js`: ganzzahlige Cent-Beträge, keine Fließkomma-Summen |
| Performance | Übertrag mit 2 statt 1 Abfrage je Periode (N+1 entfernt) |
| Regeln serverseitig | nicht in der Zukunft, höchstens 1 Monat zurück (nur beim Anlegen), 15 min – 12 h; Nachtschichten erlaubt |
| Mass-Assignment | Einträge werden per Whitelist übernommen; ein Client kann `hourlyRateCents` nicht setzen |
| „Heute“ in Berliner Zeit | Backend `utils/clock.js`, Frontend `toLocalDateString()` (6 Stellen mit UTC-Datum ersetzt) |
| Migration | `models/migrations.js`: Spalte anlegen, Bestandseinträge mit aktuellem Stundenlohn versehen, vorher automatische DB-Sicherung; an einer Kopie der echten DB geprüft |
| Tests | 24 Unit-/Integrationstests (`npm run test:unit`) + 44 Smoke-Checks; per Mutation geprüft, dass jeder der alten Fehler einen Test rot färbt |

Bewusst offen: Monatsabschluss/Änderungsprotokoll und mehrere Einträge pro Tag (Phase 2), Nachtschicht im Frontend-Formular (Phase 3), Bereinigung der Pausen-Altdaten (Entscheidung nötig, siehe PR).

---

## Status Änderungsprotokoll & Monatsabschluss (Branch `claude/phase2a-audit-closure`)

Vorgezogener Teil von Phase 2, weil die Anwendung produktiv gehen soll und Arbeitszeitnachweise nachvollziehbar sein müssen.

| Punkt | Stand |
|---|---|
| Änderungsprotokoll | `AuditLogs`: wer, wann, was, Vorher/Nachher; für Zeiteinträge, Abschlüsse, Benutzer (inkl. Passwortwechsel ohne Wert), Arbeitseinstellungen und Minijob-Grenzen |
| Unveränderlich | Model-Hooks **und** SQLite-Trigger (auch gegen direktes SQL); in derselben Transaktion wie die Änderung |
| Monatsabschluss | je Mitarbeiter und Periode; erst nach Periodenende, frühere Perioden mit Einträgen zuerst; Zahlen werden eingefroren |
| Sperre | Anlegen/Ändern/Löschen in abgeschlossenen Perioden → `PERIOD_CLOSED` (409) |
| Wiedereröffnen | nur Admin, Begründung Pflicht, nur jüngste abgeschlossene Periode; im Protokoll |
| Konto löschen | blockiert, sobald Zeiteinträge oder Abschlüsse existieren (stattdessen deaktivieren) |
| Oberfläche | neue Admin-Seiten *Zeitnachweise* und *Protokoll*; Mitarbeiter sehen "abgeschlossen" und gesperrte Aktionen |
| Tests | 42 Unit-/Integrationstests, 57 Smoke-Checks; Mutationen (Sperre, Einfrieren, Reihenfolge, Geheimnisse) färben je einen Test rot |

Bewusst offen: Admin-Korrekturen direkt an Einträgen (heute: Periode öffnen, Mitarbeiter korrigiert), Export/PDF des Abschlusses,
Login-Ereignisse im Protokoll, Aufbewahrungs-/Löschfristen (DSGVO) – fachlich/rechtlich zu klären.
