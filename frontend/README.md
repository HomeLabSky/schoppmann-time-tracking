# Frontend – Architektur

Next.js 16 (App Router, Turbopack für Dev und Build) · React 19 · TypeScript (strict) · Tailwind CSS v4.
**Desktop-first:** Die Website ist die Arbeitsoberfläche für Verwaltung und Zeiterfassung am Arbeitsplatz.
Mobil arbeiten Mitarbeiter später über eine eigene App gegen dieselbe REST-API (siehe `BERICHT_MODERNISIERUNG.md`).

```bash
npm run dev        # http://localhost:3000 (API-Adresse: NEXT_PUBLIC_API_URL in .env.local)
npm run lint       # ESLint-CLI (Flat Config, inkl. React-Compiler-Regeln), 0 Warnungen erlaubt
npx tsc --noEmit   # Typecheck
npm run build      # Produktions-Build
npm run e2e        # Ende-zu-Ende-Tests (Playwright, startet eigenes Test-Backend)
```

## Schichten

```
src/
├─ app/                      Routen (App Router). Seiten sind dünn: Daten-Hooks + Fach-Komponenten.
│  ├─ (auth)/                Anmeldung, Registrierung (Markenfläche + Formular)
│  ├─ (dashboard)/admin/     Übersicht, Zeitnachweise, Minijob-Grenzen, Benutzer, Protokoll, Einstellungen
│  ├─ (dashboard)/employee/  Zeiterfassung, Einstellungen
│  ├─ providers.tsx          Theme (hell/dunkel), TanStack Query, Anmeldung, Tooltips, Toasts
│  └─ globals.css            Design-Tokens (CSS-Variablen, @theme)
├─ components/
│  ├─ ui/                    Designsystem (shadcn-Stil, eigener Code): Button, Input, Modal (Radix), DataTable, …
│  ├─ layout/                AppShell (Seitenleiste), UserMenu, RequireRole (Seitenschutz)
│  ├─ features/              Fach-Bausteine: Dialoge, Zeitnachweis-Übersicht/-Detail, Konto-Einstellungen
│  └─ brand/                 Logo als SVG
├─ lib/
│  ├─ api.ts                 EIN HTTP-Client: Cookies, CSRF-Header, stille Sitzungserneuerung, ApiError
│  ├─ queries.ts             Server-Zustand: alle Abfragen/Änderungen als TanStack-Query-Hooks
│  ├─ timetracking.ts        Zeiterfassung des Mitarbeiters (Typen + API)
│  ├─ forms.ts               Backend-Feldfehler → react-hook-form
│  ├─ csv.ts                 CSV-Export (Semikolon, UTF-8-BOM für Excel)
│  └─ utils.ts               Formatierung (Intl, de-DE), Datum in Ortszeit
├─ schemas/                  zod-Schemas für alle Formulare (spiegeln die Backend-Regeln)
└─ types/                    API-Typen
```

## Regeln

- **Server-Daten nur über `lib/queries.ts`.** Kein `fetch`/`useEffect` in Seiten. Änderungen invalidieren die betroffenen
  Abfragen; Erfolg/Fehler meldet ein Toast. Beim Ab-/Anmelden wird der Cache geleert.
- **Formulare:** react-hook-form + zod-Schema aus `src/schemas`, Felder über `<FormField>` (Label, Hinweis, Fehler, ARIA).
  Feldgenaue Fehler des Backends landen per `applyServerErrors` am Feld.
- **Farben nur über Tokens** (`bg-card`, `text-muted-foreground`, `text-danger` …), nie Rohfarben – so funktionieren
  Hell- und Dunkelmodus automatisch. Status nie nur über Farbe (immer Text/Symbol dazu).
- **Zahlen/Datum** ausschließlich über `formatCurrency`, `formatHours`, `formatDate`, `formatDateTime` (de-DE).
- **Dialoge** über `<Modal>`/`useConfirm()` (Radix: Fokusfalle, Esc, Fokus startet im ersten Feld). Kein `window.confirm`.
- **Tabellen** über `<DataTable>` (Suche, Sortierung, Seitenweise-Anzeige, CSV-Export).
- **Seitenschutz** zentral über `<RequireRole>` in den Bereichs-Layouts. Eine Next-Middleware ist nicht möglich: Die
  Sitzungs-Cookies gelten nur für `/api` bzw. `/api/auth` und werden beim Seitenaufruf nicht mitgeschickt.
  Maßgeblich bleibt die Rechteprüfung im Backend.

## Tests

`e2e/app.spec.ts` spielt die Kernabläufe im Browser gegen das echte Backend durch: Seitenschutz und Anmeldung,
Benutzer anlegen (inkl. Feldprüfung und Esc im Dialog), Arbeitszeit mit Pause erfassen, Periode abschließen und mit
Begründung wieder öffnen, Protokolleintrag. Das Test-Backend (`backend/scripts/e2e-server.js`) startet mit einer
Wegwerf-Datenbank und festen Testdaten. Lokal ohne Browser-Download: `PW_CHANNEL=msedge npm run e2e`.

## Hinweise zu Next.js 16

- `next lint` gibt es nicht mehr; `npm run lint` ruft ESLint direkt auf (`eslint.config.mjs`). ESLint bleibt auf v9, weil
  `eslint-plugin-react` (über `eslint-config-next`) mit ESLint 10 noch nicht läuft.
- `next dev` schreibt nach `.next/dev`, `next build` nach `.next` – Dev-Server und Build bzw. E2E-Tests stören sich nicht.
- `AGENTS.md`/`CLAUDE.md` legt `next dev` an (Verweis auf die zur Version passende Doku unter `node_modules/next/dist/docs/`)
  und gehören ins Repository.
