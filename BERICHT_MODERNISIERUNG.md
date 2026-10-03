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

---

## Status Betrieb (Branch `claude/betrieb`)

| Punkt | Stand |
|---|---|
| Container | `backend/Dockerfile`, `frontend/Dockerfile` (Next.js Standalone), Laufzeit ohne Root-Rechte, Healthcheck |
| HTTPS | Caddy mit automatischem Let's Encrypt, HSTS und Sicherheits-Header, `/api` → Backend, Rest → Frontend; Variante für internes Netz (`local_certs`) |
| Sicherung | `npm run db:backup` (`VACUUM INTO`, konsistent im laufenden Betrieb, Integritätsprüfung, Rotation); Dienst `backup` täglich |
| Wiederherstellung | `npm run db:restore`: prüft die Sicherung, ersetzt die DB erst nach Prüfung, behält die alte als Kopie |
| Konfiguration | Eine Datei `deploy/.env`; Compose verweigert den Start ohne Geheimnisse und Adresse |
| Fix | 15 fest eingebaute `http://localhost:5000`-Adressen in den Admin-Seiten → zentrale `NEXT_PUBLIC_API_URL` (ohne das wären *Benutzer* und *Minijob* auf einem Server leer geblieben) |
| Prüfung | 50 Unit-/Integrationstests; Standalone-Frontend und Produktions-Backend einzeln gestartet; CI-Job `docker` baut beide Images, validiert Compose/Caddyfile, startet die Container |

Bewusst offen: Lauf auf einem echten Server (Docker war lokal nicht verfügbar), automatische externe Ablage der Sicherungen
(Ziel ist eine Entscheidung: NAS/Cloud), Monitoring/Alarmierung, Tokens im `localStorage` (Phase 2: Cookie-Login).

---

## Status Betrieb im internen Netz mit NAS-Sicherung (Branch `claude/betrieb-nas`)

Anpassung des Betriebs-Setups an: eigener Docker-Server im Firmennetz, Sicherung zusätzlich auf das NAS.

| Punkt | Stand |
|---|---|
| HTTPS intern | `TLS_MODE=internal` (Standard): Caddy mit eigener interner CA; Verteilen des Stammzertifikats (GPO/`certutil`) in der Anleitung. Alternativen: eigenes Zertifikat (`deploy/certs`, nie im Git) oder Let's Encrypt |
| NAS-Kopie | Täglich 02:30 (`BACKUP_TIME`): lokal (30) und geprüft auf das auf dem Host eingebundene NAS (90, `NAS_KEEP`); Zwischendatei + Integritätsprüfung + Umbenennen |
| Schutz vor "NAS nicht eingebunden" | Kopie nur, wenn im NAS-Ordner `.zeiterfassung-offsite` liegt; sonst Fehler statt stiller Ablage auf der lokalen Platte |
| Fehler sichtbar | `status.json` nach jedem Lauf → Container-Healthcheck (`docker compose ps`), `GET /api/admin/system/backup`, Banner und Karte *Datensicherung* auf der Admin-Startseite |
| Admin-Startseite | fest eingebautes „Alle Systeme funktionieren normal“ und Beispiel-Aktivitäten durch echten Sicherungsstatus und die letzten Protokolleinträge ersetzt |
| Tests | 62 Unit-/Integrationstests (12 neu: NAS, Status, Zeitplan, Skript-Exitcodes), 59 Smoke-Checks; Mutationen (Markierungsprüfung, NAS-Alter, Erfolgs-Zeitpunkt) färben je einen Test rot; Dashboard in allen Zuständen im Browser geprüft |

Bewusst offen: Lauf auf dem echten Server/NAS (Abnahme-Liste in `deploy/README.md`), Benachrichtigung per E-Mail bei Störung
(heute: Banner und Healthcheck), Tokens im `localStorage` (Cookie-Login).

---

## Status Cookie-Anmeldung (Branch `claude/cookie-login`)

| Punkt | Stand |
|---|---|
| S9 Tokens im `localStorage` | behoben: httpOnly-Cookies (`SameSite=Strict`, in Produktion `Secure`), kein `localStorage`, keine Tokens im Antwort-Body |
| S9 Erneuerungs-Token ohne Rotation/Widerruf | behoben: Sitzungen in der Datenbank, Rotation bei jeder Nutzung, Wiederverwendung beendet die Sitzung, Prüfwert statt Token gespeichert |
| S10 Sperre wirkt verzögert | behoben: Sitzung und Benutzer werden bei jeder Anfrage geprüft; Abmelden, Sperren, Passwortwechsel/-reset beenden Sitzungen sofort; Rolle kommt aus der Datenbank |
| CSRF | `SameSite=Strict` + Pflicht-Header `X-CSRF-Protection` + JSON-Content-Type + CORS-Freigabe nur für die eigene Oberfläche |
| Protokoll | Anmeldung, Fehlversuche (mit IP), Abmeldung und erkannte Token-Wiederverwendung im Änderungsprotokoll |
| Nebenbei behoben | SQLite-Wartezeit (`busyTimeout`) gegen `SQLITE_BUSY` bei gleichzeitigen Schreibvorgängen; doppelte Token-/API-Client-Logik im Frontend (3 Kopien → 1) entfernt |
| Tests | 74 Unit-/Integrationstests (12 neu für Sitzungen), 84 Smoke-Checks; Mutationen (Sitzungsprüfung, Wiederverwendungs-Erkennung, Rotation, httpOnly, CSRF) färben je einen Test rot; Anmeldung, stille Erneuerung, Reload, Abmeldung und Seitenschutz im Browser geprüft |

Bewusst offen: Konto-Sperre nach Fehlversuchen (heute nur Begrenzung pro IP), Verwaltung eigener Sitzungen/„überall abmelden“
in der Oberfläche, Passwort-vergessen-Ablauf per E-Mail.

---

## Kritische Prüfung: Architektur & Oberfläche im Enterprise-Maßstab (03.10.2026)

Basis: `main` nach Cookie-Login (Commit `9cd9df0`). Die Anwendung lief lokal mit Wegwerf-Datenbank und Testkonten. Geprüft
wurde als Admin und als Mitarbeiter im Browser, am Desktop und in Handybreite (375 px). Zusätzlich liefen `tsc`, ESLint,
Unit-Tests und `npm audit`.

### Gesamturteil

| Bereich | Urteil |
|---|---|
| Fachlogik & Sicherheit (Backend) | **gut**: Sitzungen, Änderungsprotokoll, Monatsabschluss, Cent-Rechnung; 74/74 Tests grün |
| Technik Backend | **veraltet**: sauber geschichtet, aber JavaScript, Express 4, Sequelize mit `sync()`, Fehler als Text `CODE:Nachricht`, `console.log` statt Logger, keine API-Doku |
| Frontend | **Prototyp-Niveau**, für den Enterprise-Bereich nicht vorzeigbar; größte Baustelle |

### Oberfläche (im Browser bestätigt)

| # | Befund |
|---|---|
| U1 | **Dialoge mit deckend schwarzem Hintergrund**: `bg-opacity-50` gibt es in Tailwind v4 nicht mehr (Annahme aus 4.4 damit bestätigt). Kein `role="dialog"`, Esc schließt nicht, kein Fokus-Management |
| U2 | **Handybreite**: Navigation verschwindet ohne Ersatz; Periodenwahl und „Neue Arbeitszeit erfassen“ ragen aus dem Bild; Menü-Knopf im Admin-Kopf ohne Funktion. *Einordnung siehe Entscheidung unten.* |
| U3 | **Uneinheitliche Zahlen**: „128.25 €“ / „9.5h“ (Dashboard) neben „74,25 €“ (Tabelle); „13.5€“ in der Benutzerliste |
| U4 | **Stille Ersatz-Grenze**: Ohne Minijob-Einstellung meldet die Minijob-Seite „Keine aktuelle Einstellung“, das Dashboard „N/A“ – die Zeitnachweise rechnen aber still mit **550 €** (`DEFAULT_LIMIT_CENTS`). Ein Monatsabschluss würde mit einer nie festgelegten Grenze festgeschrieben |
| U5 | **Test-Elemente im Produktivbetrieb**: Karte „System-Test / Test starten“ (Admin-Start), Knopf „API Test“ (Benutzerverwaltung) |
| U6 | **Toter Link**: „Einstellungen“ → `/employee/settings` = 404; Mitarbeiter können ihr Passwort im Portal nicht ändern, obwohl das Backend es anbietet |
| U7 | **Barrierefreiheit**: Login-Felder ohne verknüpftes Label (Screenreader liest den Platzhalter), im ganzen Frontend 5× `aria-`, 7× `htmlFor`; Löschen per `confirm()` |
| U8 | **Kein durchgängiges Erscheinungsbild**: Seitenköpfe mal als Karte, mal frei; Admin `gray` (260×), Mitarbeiter `slate` (96×), `blue-600` 34× fest; kein Dunkelmodus; Logo als 1,1-MB-PNG; Footer „© 2024“ |
| U9 | **Fehlende Enterprise-Standards**: Tabellen ohne Suche/Filter/Sortierung/Paginierung, kein CSV/PDF-Export, keine Toasts, keine Lade-Skelette; Zeitnachweise nur je Mitarbeiter, keine Übersicht „offen/abgeschlossen“ über alle |

### Frontend-Architektur (gemessen)

- **0 wiederverwendbare Komponenten**: `components/` enthält nur leere Ordner; 15 Seiten mit 4.060 Zeilen, `admin/users` 813, `admin/minijob` 763.
- **Server-Daten von Hand**: 77× `useState`, 30× `useEffect`, kein Cache-/Query-Layer.
- **Alles Client-Komponenten**: alle Layouts `'use client'`, Login-Schutz dreifach im Browser, keine Next-Middleware.
- **Installiert, aber ungenutzt**: `lucide-react`, `date-fns` (0 Importe); stattdessen 49 kopierte Inline-SVGs.
- **Altlasten**: 39× `any`, 85 Lint-Warnungen, 24 `console.log` im Browser-Code, Prototyp-Kommentare („VERBESSERTE VERSION“, `// ✅ ÄNDERUNGEN`), `shared/` weiterhin von niemandem importiert, keine Frontend-Tests.

### Backend-Architektur

- JavaScript statt TypeScript, Express 4, Fehler als Text `CODE:Nachricht` (per Split geparst).
- `sequelize.sync()` + handgeschriebene Migrationen; **Enum-Werte werden in SQLite nicht erzwungen** (eine ungültige Rolle `employee` wurde beim Test ohne Fehler gespeichert).
- 48× `console.log` mit Emojis in Routen/Services, teils mit E-Mail-Adressen; keine OpenAPI.
- `npm audit --omit=dev`: **Backend 27 Funde (1 kritisch, 16 hoch)** – kritisch ist `tar` über `sqlite3`/`node-gyp`, hoch u. a. `express`, `sequelize`, `express-rate-limit`. Frontend: 2 (1 hoch, 1 mittel).

### Entscheidung: mobile Nutzung über eigene App (03.10.2026)

Mitarbeiter sollen **mobil ausschließlich über eine später entwickelte App** arbeiten. Daraus folgt:

- Die **Website ist eine Desktop-Anwendung** (Verwaltung, Prüfung, Abschluss, Zeiterfassung am Arbeitsplatz). Eine mobile
  Variante der Website ist **nicht erforderlich**. Das Zielbild „mobile-first“ für Mitarbeiter in 5.2 entfällt; U2 wird nur
  so weit behoben, dass schmale Desktop-Fenster (ab ca. 1024 px, Split-Screen) nicht abschneiden.
- Die **Trennung Frontend/Backend wird dadurch zum Kern der Architektur**: Die REST-API ist das Produkt, Web und App sind zwei
  gleichberechtigte Clients. Konsequenzen für Phase 2/3:
  - **API-Vertrag maschinenlesbar** (OpenAPI aus zod-Schemas in `shared/`), damit die App einen generierten Client nutzen kann.
  - **Anmeldung für die App**: httpOnly-Cookies mit `SameSite=Strict` passen zum Browser, nicht zu nativen Apps. Für die App
    braucht es einen zweiten Weg auf derselben Sitzungs-Tabelle (z. B. Bearer-Access-Token + Refresh-Token im sicheren
    Gerätespeicher, gleiche Rotation/Wiederverwendungs-Erkennung). Die CSRF-Prüfung gilt dann nur für Cookie-Anfragen.
  - **API-Versionierung** (`/api/v1`), weil installierte App-Versionen nicht sofort aktualisiert werden.
  - **Fachregeln ausschließlich serverseitig** (bereits weitgehend umgesetzt): Die App darf keine Rechenlogik duplizieren.
  - **Offline-Erfassung in der App** braucht idempotente Anlage (Client-ID je Eintrag) und eindeutige Konfliktmeldungen
    (`PERIOD_CLOSED`, `ENTRY_EXISTS`).

### Angepasster Plan

1. **Sofortmaßnahmen** (U1, U3–U7 und U2 nur für schmale Desktop-Fenster) – siehe Status unten.
2. **Frontend neu aufbauen (Phase 3, desktop-first)**: Designsystem mit Tokens (shadcn/ui auf Tailwind v4), App-Shell mit
   Seitenleiste, TanStack Query, react-hook-form + zod aus `shared/`, Daten-Tabellen mit Suche/Filter/Sortierung/Export,
   Middleware-Login-Schutz, Toasts, Dunkelmodus, Playwright-Tests. Mobile Layouts nur als „bricht nicht“.
3. **Backend als App-taugliche API (Phase 2)**: TypeScript, Express 5, zod + OpenAPI, `/api/v1`, Token-Anmeldung für die App,
   pino-Logging ohne personenbezogene Daten, `better-sqlite3` + Drizzle mit versionierten Migrationen (beseitigt die
   kritische `sqlite3`/`tar`-Kette), DB-seitige Prüfungen (CHECK) für Enums.

### Status Sofortmaßnahmen (Branch `claude/modern-architecture-ui-review-57b766`)

| Punkt | Stand |
|---|---|
| U1 Dialoge | gemeinsame Komponente `components/ui/Modal.tsx`: halbtransparenter Hintergrund, `role="dialog"`/`aria-modal`, Überschrift als Name, Esc und Klick daneben schließen, Fokus bleibt im Dialog und kehrt zurück. Alle 6 Dialoge (Benutzer, Minijob, Zeitnachweise) umgestellt |
| U2 Breite | nur für schmale Desktop-Fenster: Werkzeugleiste der Zeiteinträge bricht um (geprüft bei 1024 und 800 px); Menü-Knopf ohne Funktion entfernt, Navigation immer sichtbar mit Markierung der aktiven Seite (`aria-current`) |
| U3 Zahlen | einheitlich über `Intl` (`formatCurrency`, neu `formatHours`): „128,25 €“, „9,50 Std.“, „13,50 €“; doppelte lokale Formatierer entfernt |
| U4 Ersatz-Grenze | API meldet `summary.minijobLimitMissing`, wenn für die Periode oder eine frühere offene Periode im Übertrag keine Grenze gilt; **Abschluss wird abgelehnt** (`409 MINIJOB_LIMIT_MISSING`). Oberfläche: Warnung + gesperrter Abschluss in *Zeitnachweise*, „Nicht hinterlegt“ auf der Admin-Startseite, Hinweis „vorläufig“ beim Mitarbeiter |
| U4 Folgeänderung | Minijob-Grenzen dürfen jetzt **rückwirkend** beginnen. Vorher war das verboten – dann hätte sich eine Periode ohne Grenze nie abschließen lassen. Abgeschlossene Perioden behalten ihre eingefrorene Grenze, betroffen sind nur offene |
| U5 Test-Elemente | „System-Test“-Karte (ersetzt durch „Zeitnachweise prüfen“) und „API Test“-Knopf entfernt; Debug-`console.log` aus Mitarbeiter-Dashboard, Benutzer- und Minijob-Seite entfernt |
| U6 Einstellungen | neue Seite `/employee/settings`: Konto, Stundenlohn/Abrechnungszeitraum (nur lesend), Lohnzettel-E-Mail, Passwort ändern. Toter Link „Zum Employee Dashboard“ im Admin-Kopf entfernt (der Mitarbeiterbereich leitet Admins zurück) |
| U7 Barrierefreiheit | Labels mit Feldern verknüpft (Login, Registrierung, Benutzer-, Minijob-, Zeiterfassungs-Formulare), `autocomplete` am Login, `confirm()` durch eigenen Bestätigungsdialog ersetzt (`useConfirm`), Meldungen mit `role="alert"`/`"status"` |
| U8 (Teil) | Footer-Jahr dynamisch |
| **Neu gefunden: Mitarbeiter konnten ihren Stundenlohn selbst ändern** | `PUT /api/employee/settings` übernahm `stundenlohn`, `abrechnungStart`, `abrechnungEnde` ungeprüft vom Mitarbeiter (der Smoke-Test prüfte das sogar als gewollt). Behoben: nur noch Lohnzettel-E-Mail, sonst `403 SETTINGS_ADMIN_ONLY` |
| **Neu gefunden: falsches Passwort meldete ab** | `INVALID_CURRENT_PASSWORD` kam als 401; der Client deutete das als abgelaufene Sitzung und meldete ab. Jetzt 400; Regel in `backend/ARCHITECTURE.md` festgehalten (fachliche Ablehnungen nie 401) |
| Prüfung | 76 Unit-/Integrationstests (neu: fehlende Grenze), 88 Smoke-Checks (neu: Abschluss ohne Grenze, Stundenlohn-Sperre, falsches Passwort ohne Abmeldung); `tsc`, ESLint ohne Fehler, `next build` erfolgreich; alle Punkte im Browser als Admin und Mitarbeiter durchgespielt |

Bewusst offen (→ Phase 2/3): restliche Inline-SVGs und `gray`/`slate`-Mischung, Toasts statt Emoji-Statusmeldungen
(`message.includes('✅')`), Logo als SVG/`next/image`, Tabellen mit Suche/Filter/Export, Übersicht aller Mitarbeiter in
*Zeitnachweise*, Bereinigung der übrigen ~85 Lint-Warnungen.

---

## Status Phase 2, Teil 1: App-taugliche API (Branch `claude/phase2-api`)

| Punkt | Stand |
|---|---|
| Express 5 | umgestellt; asynchrone Fehler landen automatisch im zentralen Error-Handler (47 `try/catch` in Routen entfallen) |
| Fehler | `AppError('CODE', 'Meldung')` statt Text `CODE:Nachricht` mit Split-Parser; Status je Code an einer Stelle (`lib/errors.js`); unbekannte Fehler → `500 INTERNAL_ERROR` mit Request-ID, ohne interne Details |
| Validierung | zod-Schemas für alle 48 Endpunkte (Pfad, Query, Body); unbekannte Felder werden entfernt; Fehlerformat unverändert (`fields`, `details`); `express-validator` entfernt |
| OpenAPI | 3.1-Dokument aus den Routen und Schemas: `/api/v1/openapi.json` und `backend/openapi.json`; ein Test schlägt fehl, wenn die Datei veraltet ist |
| Antworten geprüft | Der Smoke-Test prüft jede Erfolgsantwort gegen ihr Schema (alle 48 Endpunkte abgedeckt). Fund dabei: neu angelegte Konten lieferten `lohnzettelEmail` gar nicht statt `null` – behoben |
| Versionierung | `/api/v1` verbindlich, `/api` als Alias für die bestehende Web-Oberfläche (keine Frontend-Änderung nötig) |
| App-Anmeldung | `POST /auth/token`, `/token/refresh`, `/token/revoke`: Bearer-Token auf derselben Sitzungs-Tabelle mit Rotation und Wiederverwendungs-Erkennung; Laufzeit App 30/90 Tage; ein Token gilt nur auf seinem Weg (Web-Cookie ≠ App-Token); kein CSRF-Header für Bearer-Anfragen |
| S11 Konto-Sperre | nach 5 Fehlversuchen je Adresse 15 min (`429 ACCOUNT_LOCKED`, `Retry-After`), jede weitere Serie doppelt, max. 24 h; auch für unbekannte Adressen (keine Konto-Erkennung), gleiche Antwortzeit; Protokoll `auth.account_locked`; Admin-/CLI-Passwort-Reset hebt sie auf |
| Offline-Erfassung | `clientId` beim Anlegen: Wiederholung liefert den bestehenden Eintrag (200), anderer Tag → `409 CLIENT_ID_CONFLICT` |
| S12 Logging | pino (JSON) mit Request-ID; keine E-Mail-Adressen, Namen, Tokens; Personen nur als ID; 48 `console.log` mit Emojis entfernt |
| Konfiguration | Umgebungsvariablen mit zod geprüft – ungültige Werte (z. B. `PORT=abc`) verhindern den Start statt stiller Ersatzwerte |
| Totcode | Fehler-Parser, Validierungs-Middleware, Dev-Testdaten-Route, doppelte Minijob-Statuslogik, ungenutzte Model-Helfer entfernt |
| Prüfung | 86 Unit-/Integrationstests, 124 Smoke-Checks; Mutationen (Weg-Bindung App/Web, Sperre, CSRF-Ausnahme, `clientId`-Konflikt, Rückfall auf Cookie) färben je einen Test rot |

Bewusst offen (Phase 2, Teil 2): TypeScript, Drizzle + `better-sqlite3` mit versionierten Migrationen und DB-Prüfungen
(CHECK) für Enums. Die verbleibenden `npm audit`-Funde (u. a. `tar` kritisch) hängen alle an `sqlite3`/`sequelize` und
entfallen mit diesem Wechsel. Frontend: auf `/api/v1` umstellen und Typen aus `openapi.json` erzeugen (Phase 3).
