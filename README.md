# Schoppmann Time Tracking

Zeiterfassungssystem für Minijob-/Stundenabrechnung mit getrenntem Frontend und Backend.

| Bereich | Technologie | Pfad |
|---|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript, Tailwind | `frontend/` |
| Backend | Express 4, Sequelize, SQLite, JWT | `backend/` |
| Shared | Geteilte TypeScript-Typen | `shared/` |

## Schnellstart

```bash
npm run install:all      # Abhängigkeiten in Root, frontend, backend
npm run dev              # Frontend (:3000) + Backend (:5000) parallel
```

Einzeln:

```bash
npm run dev:backend      # nur Backend
npm run dev:frontend     # nur Frontend
```

Ersteinrichtung (erster Admin): nach dem Start
`GET http://localhost:5000/api/setup/create-first-admin`
→ legt `admin@schoppmann.de` / `Admin123!` an (Passwort danach sofort ändern).

## Tests

```bash
cd backend && npm run smoke    # End-to-End-Smoke-Test der API gegen temporäre DB
```

## Architektur

Frontend und Backend sind bewusst getrennt und kommunizieren ausschließlich über
die REST-API unter `/api`. Alle Antworten folgen dem Vertrag
`{ success, message, data }` (Fehler: `{ success, error, code }`).

Details zur Backend-Struktur, Schichten und Verantwortlichkeiten:
siehe [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).
