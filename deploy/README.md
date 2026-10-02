# Betrieb: Installation, Sicherung, Updates

Diese Anleitung bringt die Zeiterfassung produktiv auf einen Server – mit automatischem HTTPS und täglicher
Datenbank-Sicherung. Der Aufbau:

```
Browser ──HTTPS──► Caddy ──/api/*──► Backend (Express, SQLite im Volume "db-data")
                     └──── alles andere ──► Frontend (Next.js)
                                   Backup-Dienst ──► Volume "backups" (täglich, 30 Stück)
```

> **Stand der Prüfung:** Die Images werden in der GitHub-CI gebaut und gestartet, die Komponenten wurden
> einzeln getestet (Produktionsmodus, Backup, Wiederherstellung). Ein Lauf auf einem echten Server steht noch aus –
> bitte die erste Installation in Ruhe durchführen und die Schritte unter *Abnahme* abhaken.

## 1. Voraussetzungen

- Ein Server mit **Docker** und dem **Compose-Plugin** (Linux empfohlen; Windows/macOS mit Docker Desktop reicht für
  ein internes Netz).
- Eine **Adresse** (z. B. `zeit.firma.de`), die per DNS auf den Server zeigt, und freie **Ports 80 und 443**
  (Let's Encrypt prüft über Port 80, welcher Server zur Adresse gehört).
- Kein öffentlicher DNS-Eintrag möglich (rein internes Netz)? Siehe *Internes Netz ohne öffentliche Adresse*.

## 2. Installation

```bash
git clone https://github.com/homelabsky/schoppmann-time-tracking.git
cd schoppmann-time-tracking/deploy
cp .env.example .env
```

In `deploy/.env` eintragen:

- `DOMAIN` – die Adresse ohne `https://`.
- `JWT_SECRET` und `JWT_REFRESH_SECRET` – **zwei verschiedene** Zufallswerte (je mind. 32 Zeichen):

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

  Ohne diese Werte startet das Backend bewusst nicht. Die Datei `.env` nicht weitergeben und nicht einchecken
  (unter Linux: `chmod 600 .env`).

Starten:

```bash
docker compose up -d --build
docker compose ps          # alle Dienste sollten "running"/"healthy" zeigen
```

## 3. Ersten Administrator anlegen

```bash
docker compose exec backend node scripts/create-admin.js
```

Das Skript fragt E-Mail, Name und Passwort (verdeckt) ab. Mit `--generate` wird ein zufälliges Passwort erzeugt und
einmal angezeigt. Danach unter `https://<DOMAIN>/login` anmelden.

Passwort vergessen?

```bash
docker compose exec backend node scripts/reset-password.js admin@firma.de
```

## 4. Erste Einrichtung im Portal

1. **Minijob** → Grenze eintragen (gültig ab dem ersten Arbeitstag). Ohne Eintrag rechnet das System mit einem
   Notwert von 550 €.
2. **Benutzer** → Mitarbeiter anlegen, Stundenlohn und Abrechnungszeitraum setzen.
3. Admin-Passwort im Portal ändern.

## 5. Sicherungen

Der Dienst `backup` sichert die Datenbank **beim Start und danach alle 24 Stunden** (konsistent, auch im laufenden
Betrieb; jede Sicherung wird auf Integrität geprüft; es bleiben die letzten `BACKUP_KEEP` = 30 Stück).

```bash
docker compose exec backup ls -l /backups            # vorhandene Sicherungen
docker compose exec backup node scripts/backup-db.js # sofort eine Sicherung anlegen
```

> **Wichtig:** Die Sicherungen liegen auf *demselben Server*. Sie schützen vor Bedienfehlern und defekten Daten,
> **nicht** vor Serverausfall oder Diebstahl. Kopiere sie regelmäßig an einen anderen Ort (NAS, Cloud-Speicher, anderer
> Rechner), z. B. täglich per Cron bzw. Windows-Aufgabenplanung:
>
> ```bash
> docker compose cp backup:/backups ./sicherungen-export
> ```

### Wiederherstellen

```bash
docker compose stop backend backup
docker compose run --rm --no-deps backend npm run db:restore -- /backups/timetracking-20261002-031500.db
docker compose start backend backup
```

Die Sicherung wird vorher geprüft. Die bisherige Datenbank bleibt als
`timetracking.db.vor-wiederherstellung-<zeit>` im Volume erhalten. Bei einer defekten Sicherung bricht der Vorgang ab,
ohne etwas zu ändern.

**Teste die Wiederherstellung einmal vor dem Produktivstart** (z. B. auf einem zweiten Rechner). Eine Sicherung, die nie
wiederhergestellt wurde, ist nur eine Vermutung.

## 6. Updates

```bash
cd schoppmann-time-tracking
git pull
cd deploy
docker compose up -d --build
```

Schema-Änderungen laufen beim Start des Backends automatisch; vorher legt es eine Sicherung der Datenbankdatei an.
Vor größeren Updates zusätzlich: `docker compose exec backup node scripts/backup-db.js`.

## 7. Überwachung und Fehlersuche

- **Erreichbarkeit:** `https://<DOMAIN>/api/status` liefert `{"status":"OK"}` – diese Adresse kann ein
  Überwachungsdienst (z. B. UptimeRobot) prüfen.
- **Logs:** `docker compose logs -f backend` (bzw. `frontend`, `caddy`, `backup`).
- **Zertifikat wird nicht ausgestellt:** DNS zeigt nicht auf den Server, oder Port 80/443 ist gesperrt →
  `docker compose logs caddy`.
- **Backend startet nicht und meldet "JWT_SECRET fehlt":** `deploy/.env` prüfen.
- **Anmeldung klappt, aber Seiten bleiben leer / "Verbindungsfehler":** `DOMAIN` wurde nach dem Bauen geändert →
  `docker compose up -d --build` (die Adresse wird beim Bauen in die Oberfläche eingebaut).

## 8. Sicherheits-Checkliste

- [ ] Nur Ports 80 und 443 (und SSH, nur mit Schlüssel) sind von außen erreichbar.
- [ ] `deploy/.env` ist nur für Administratoren lesbar und wurde nirgends veröffentlicht.
- [ ] `ALLOW_REGISTRATION=false` (Konten legt ein Admin an).
- [ ] Standard-/Testkonten gibt es nicht; das Admin-Passwort wurde geändert.
- [ ] Server-Updates (Betriebssystem, Docker) werden eingespielt.
- [ ] Sicherungen werden extern abgelegt **und** die Wiederherstellung wurde getestet.
- [ ] Nur Vertrauenspersonen haben Zugriff auf den Server bzw. die Docker-Rechte (wer Docker steuert, kann alle Daten lesen).

## 9. Datenschutz und Aufbewahrung (bitte klären)

Die Anwendung verarbeitet personenbezogene Beschäftigtendaten (Arbeitszeiten, Verdienst, Konten). Technisch ist
vorgesorgt: Zugriff nur nach Anmeldung, Änderungsprotokoll, Monatsabschluss, Sicherungen. Organisatorisch musst du
klären (z. B. mit der/dem Datenschutzbeauftragten):

- Auftragsverarbeitungsvertrag mit dem Hosting-Anbieter, falls der Server nicht bei dir steht.
- Eintrag im Verzeichnis der Verarbeitungstätigkeiten und Information der Mitarbeiter.
- **Aufbewahrungs- und Löschfristen** für Arbeitszeitnachweise (u. a. Mindestlohndokumentation) – die Anwendung löscht
  bewusst nichts automatisch, auch Sicherungen werden nach `BACKUP_KEEP` Tagen rotiert, nicht nach Rechtsfrist.

## 10. Internes Netz ohne öffentliche Adresse

Ohne öffentlichen DNS-Eintrag kann Let's Encrypt kein Zertifikat ausstellen. Dann in `deploy/Caddyfile` ganz oben
einen Block einfügen:

```
{
	local_certs
}
```

Caddy stellt dann Zertifikate über eine eigene interne Zertifizierungsstelle aus. Deren Stammzertifikat
(`docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .`) muss auf den Arbeitsplätzen als vertrauenswürdig
eingerichtet werden, sonst warnt der Browser. `DOMAIN` ist dann ein interner Name, der in eurem Netz auflösbar ist.

## 11. Ohne Docker (Kurzfassung)

1. Node.js 22 installieren, im Projekt `npm run install:all`.
2. `backend/.env` aus `backend/.env.example` anlegen (`NODE_ENV=production`, Geheimnisse, `CORS_ORIGIN`,
   `DB_STORAGE` mit absolutem Pfad, `TRUST_PROXY=1` hinter einem Proxy).
3. Frontend bauen: `cd frontend && NEXT_PUBLIC_API_URL=https://<DOMAIN> npm run build`, starten mit `npm start` (Port 3000).
4. Backend starten: `cd backend && npm start` (Port 5000) – über einen Prozessmanager (pm2, Windows-Dienst via NSSM),
   damit es nach Neustarts wieder läuft.
5. Einen Reverse-Proxy mit HTTPS (Caddy, nginx, IIS) davorsetzen: `/api/*` → Port 5000, alles andere → Port 3000.
6. Sicherung täglich per Aufgabenplanung/Cron: `cd backend && npm run db:backup` (Ziel `BACKUP_DIR`, Standard
   `backend/backups`) und den Ordner extern ablegen.
