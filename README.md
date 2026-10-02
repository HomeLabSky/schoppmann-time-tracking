# Schoppmann Time Tracking

Zeiterfassungssystem für Minijob-/Stundenabrechnung mit getrenntem Frontend und Backend.

| Bereich | Technologie | Pfad |
|---|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript, Tailwind | `frontend/` |
| Backend | Express 4, Sequelize, SQLite, JWT | `backend/` |
| Shared | Geteilte TypeScript-Typen (noch nicht eingebunden) | `shared/` |

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

## Tests

```bash
cd backend  && npm run smoke              # End-to-End-Smoke-Test der API gegen temporäre DB
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

Dieselben Prüfungen laufen in GitHub Actions (`.github/workflows/ci.yml`).

## Architektur

Frontend und Backend sind bewusst getrennt und kommunizieren ausschließlich über
die REST-API unter `/api`. Alle Antworten folgen dem Vertrag
`{ success, message, data }` (Fehler: `{ success, error, code }`).

Details zur Backend-Struktur, Schichten und Verantwortlichkeiten:
siehe [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).
Befunde und Umbauplan: siehe [`BERICHT_MODERNISIERUNG.md`](BERICHT_MODERNISIERUNG.md).
