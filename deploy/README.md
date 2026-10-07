# Betrieb im internen Netz: Installation, NAS-Sicherung, Updates

Diese Anleitung bringt die Zeiterfassung auf einen **eigenen Docker-Server im Firmennetz**, mit HTTPS (interne
Zertifizierungsstelle) und täglicher Sicherung **lokal und auf das NAS**.

```
Arbeitsplatz ──HTTPS──► Docker-Server
                         ├─ Caddy ──/api/*──► Backend (Express + SQLite, Volume "db-data")
                         │        └─ alles andere ► Frontend (Next.js)
                         └─ Backup-Dienst: täglich 02:30 ─► Volume "backups"  (letzte 30)
                                                       └──► NAS-Freigabe       (letzte 90)
```

> **Stand der Prüfung:** Die Images werden in der GitHub-CI gebaut und gestartet, Backup/NAS-Kopie/Status/Wiederherstellung
> sind mit Tests abgedeckt. Ein Lauf auf eurem Server und eurem NAS steht noch aus. Führt die Schritte unter
> *Abnahme* beim ersten Mal in Ruhe durch.

> Kurzfassung mit konkreten Befehlen, Portainer-Variante und Unraid-Freigabe: [`INSTALLATION_DOCKER.md`](INSTALLATION_DOCKER.md).

## 1. Voraussetzungen

- Linux-Server mit **Docker** und dem **Compose-Plugin**, im Firmennetz erreichbar (Ports **80** und **443**).
- Ein **interner DNS-Name** (z. B. `zeit.firma.de`), der auf den Server zeigt. Nicht `…local` verwenden (kollidiert mit mDNS).
- Eine **NAS-Freigabe** per SMB (CIFS) oder NFS, auf die der Server schreiben darf (Abschnitt 3).
- Von außen sind keine Ports nötig. Der Server sollte aus dem Internet **nicht** erreichbar sein.

## 2. Installation

```bash
git clone https://github.com/homelabsky/schoppmann-time-tracking.git
cd schoppmann-time-tracking/deploy
cp .env.example .env
```

In `deploy/.env` eintragen:

- `DOMAIN` – der interne Name ohne `https://`.
- `JWT_SECRET` und `JWT_REFRESH_SECRET` – **zwei verschiedene** Zufallswerte (je mind. 32 Zeichen):

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

  Ohne diese Werte startet das Backend bewusst nicht. `.env` nicht weitergeben und nicht einchecken (`chmod 600 .env`).
- `NAS_BACKUP_DIR` – Ordner **auf dem Server**, in den das NAS eingebunden ist (Abschnitt 3).

Starten (erst **nach** Abschnitt 3, wenn das NAS eingebunden ist):

```bash
docker compose up -d --build
docker compose ps          # alle Dienste "running"; backup zeigt nach ca. 2 Minuten "healthy"
```

## 3. NAS einbinden

Der Server bindet die NAS-Freigabe **selbst** ein; der Backup-Dienst schreibt dann in diesen Ordner.

**Auf dem NAS:**

1. Freigabe anlegen, z. B. `zeiterfassung-backup`.
2. Eigenen NAS-Benutzer nur für diese Freigabe mit Schreibrecht (nicht den Admin-Account verwenden).
3. Empfohlen: **Snapshots/Versionierung** für die Freigabe aktivieren. Dann bleiben ältere Stände auch erhalten, wenn
   eine Sicherung versehentlich überschrieben oder der Server kompromittiert wird.

**Auf dem Docker-Server (Beispiel SMB/CIFS):**

```bash
sudo apt install cifs-utils
sudo mkdir -p /mnt/nas-zeiterfassung

# Zugangsdaten nur für root lesbar
sudo tee /root/.nas-zeiterfassung >/dev/null <<'EOF'
username=BENUTZER
password=PASSWORT
EOF
sudo chmod 600 /root/.nas-zeiterfassung
```

In `/etc/fstab` eintragen (eine Zeile; `uid/gid=1000` ist der Benutzer im Container):

```
//nas.firma.de/zeiterfassung-backup  /mnt/nas-zeiterfassung  cifs  credentials=/root/.nas-zeiterfassung,uid=1000,gid=1000,file_mode=0660,dir_mode=0770,vers=3.0,_netdev,nofail  0  0
```

```bash
sudo mount -a
```

*NFS statt SMB:* `nas.firma.de:/volume1/zeiterfassung-backup  /mnt/nas-zeiterfassung  nfs  defaults,_netdev,nofail  0  0` –
auf dem NAS muss die Freigabe für den Server schreibbar sein und Schreibzugriffe dem Benutzer `1000` zuordnen.

**Markierungsdatei anlegen (wichtig):**

```bash
touch /mnt/nas-zeiterfassung/.zeiterfassung-offsite
```

Warum? Ist das NAS einmal nicht eingebunden (NAS aus, Netzwerkfehler, Neustart), ist `/mnt/nas-zeiterfassung` nur ein leerer
Ordner auf der lokalen Platte – die Sicherung würde unbemerkt *dort* landen und nicht auf dem NAS. Der Backup-Dienst kopiert
deshalb nur, wenn die Markierungsdatei vorhanden ist, und meldet sonst einen Fehler.

**Schreibtest** (sollte ohne Fehler laufen):

```bash
sudo -u '#1000' sh -c 'touch /mnt/nas-zeiterfassung/test && rm /mnt/nas-zeiterfassung/test' && echo OK
```

## 4. HTTPS im internen Netz

Standard ist `TLS_MODE=internal`: Caddy erzeugt eine **eigene interne Zertifizierungsstelle** und stellt damit das Zertifikat
aus. Die Verbindung ist verschlüsselt; damit Browser **keine Warnung** zeigen, muss das Stammzertifikat der
Zertifizierungsstelle einmal auf den Arbeitsplätzen als vertrauenswürdig eingerichtet werden.

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Die Datei `caddy-root.crt` verteilen:

- **Windows-Domäne (empfohlen):** Gruppenrichtlinie → *Computerkonfiguration → Windows-Einstellungen →
  Sicherheitseinstellungen → Richtlinien für öffentliche Schlüssel → Vertrauenswürdige Stammzertifizierungsstellen →
  Importieren*.
- **Einzelner PC:** als Administrator `certutil -addstore -f Root caddy-root.crt`.
- Firefox nutzt einen eigenen Zertifikatsspeicher (Einstellung *Zertifikate → Importieren* oder Firmen-Richtlinie
  `ImportEnterpriseRoots`). Smartphones: Zertifikat als Profil installieren.

Habt ihr eine **eigene Firmen-CA** oder ein Zertifikat? Dateien in `deploy/certs/` ablegen und in `.env`
`TLS_MODE=/certs/fullchain.pem /certs/privkey.pem` setzen. Die privaten Schlüssel gehören nie ins Git (der Ordner ist ignoriert).

## 5. Ersten Administrator anlegen

```bash
docker compose exec backend node dist/scripts/create-admin.js
```

Das Skript fragt E-Mail, Name und Passwort (verdeckt) ab; mit `--generate` entsteht ein Zufallspasswort, das einmal angezeigt
wird. Dann unter `https://<DOMAIN>/login` anmelden. Passwort vergessen:

```bash
docker compose exec backend node dist/scripts/reset-password.js admin@firma.de
```

Danach im Portal: **Minijob** → Grenze eintragen (gültig ab dem ersten Arbeitstag; ohne Eintrag rechnet das System mit einem
Notwert von 550 €), **Benutzer** → Mitarbeiter anlegen, Admin-Passwort ändern.

## 6. Sicherungen

Der Dienst `backup` sichert **sofort beim Start** und danach **täglich um 02:30** (`BACKUP_TIME`):

1. konsistent und im laufenden Betrieb, mit Integritätsprüfung → Volume `backups` (letzte `BACKUP_KEEP` = 30),
2. geprüft kopiert auf das **NAS** (letzte `NAS_KEEP` = 90).

**Störungen sind sichtbar:**

- Auf der **Admin-Startseite** erscheint ein rotes/gelbes Banner, wenn die letzte erfolgreiche Sicherung älter als 36 Stunden ist
  oder das NAS nicht erreicht wurde, und die Karte *Datensicherung* zeigt Zeitpunkt der letzten Sicherung und der NAS-Kopie.
- `docker compose ps` zeigt den Dienst `backup` als `unhealthy`.
- Details: `docker compose logs backup`.

```bash
docker compose exec backup node dist/scripts/backup-db.js   # sofort eine Sicherung auslösen
docker compose exec backup ls -l /backups              # lokale Sicherungen
ls -l /mnt/nas-zeiterfassung                           # Sicherungen auf dem NAS
```

### Wiederherstellen

Backend und Backup-Dienst stoppen, Sicherung einspielen, wieder starten:

```bash
docker compose stop backend backup

# aus der lokalen Sicherung
docker compose run --rm --no-deps backend npm run db:restore -- /backups/timetracking-20261002-023000.db

# oder vom NAS (z. B. wenn der Server neu aufgesetzt wurde)
docker compose run --rm --no-deps -v /mnt/nas-zeiterfassung:/nas:ro backend \
  npm run db:restore -- /nas/timetracking-20261002-023000.db

docker compose start backend backup
```

Die Sicherung wird vorher geprüft. Die bisherige Datenbank bleibt als `timetracking.db.vor-wiederherstellung-<zeit>` im
Volume erhalten; bei einer defekten Sicherung bricht der Vorgang ab, ohne etwas zu ändern.

**Notfall – Server komplett verloren:** Neuen Docker-Server nach Abschnitt 2–4 aufsetzen, mit **denselben** `JWT_*`-Werten
(sonst müssen sich alle neu anmelden), Datenbank vom NAS einspielen (siehe oben), starten.

## 7. Abnahme (beim ersten Mal)

- [ ] `https://<DOMAIN>` öffnet die Anmeldeseite ohne Zertifikatswarnung (nach Verteilen des Stammzertifikats).
- [ ] Anmeldung als Admin klappt; Mitarbeiter angelegt; Zeiteintrag als Mitarbeiter erfasst.
- [ ] Admin-Startseite zeigt unter *Datensicherung* „Sicherung und NAS-Ablage sind aktuell“.
- [ ] Auf dem NAS liegt eine Datei `timetracking-….db`.
- [ ] **NAS-Ausfall simulieren:** NAS-Freigabe aushängen (`sudo umount /mnt/nas-zeiterfassung`), `docker compose exec backup node
  dist/scripts/backup-db.js` → Fehler „NAS nicht eingebunden“, Banner auf der Admin-Startseite. Wieder einhängen (`sudo mount -a`),
  Sicherung erneut auslösen → Banner verschwindet.
- [ ] **Wiederherstellung auf einem zweiten Rechner/Testsystem einmal komplett durchgespielt.** Eine Sicherung, die nie
  wiederhergestellt wurde, ist nur eine Vermutung.

## 8. Updates

> **Einmalig nach dem Update auf die Cookie-Anmeldung:** Alle Benutzer müssen sich einmal neu anmelden (die alten
> Anmeldungen im Browser sind ungültig). Das ist erwartet.

```bash
cd schoppmann-time-tracking
git pull
cd deploy
docker compose up -d --build
```

Schema-Änderungen laufen beim Start des Backends automatisch (versionierte Migrationen, alle in einer Transaktion);
vorher legt es eine Sicherung der Datenbankdatei an (`/data/timetracking.db.pre-migration-<Zeit>`). Vor größeren
Updates zusätzlich: `docker compose exec backup node dist/scripts/backup-db.js`.

> **Einmalig beim Update auf Phase 2 Teil 2 (TypeScript/Drizzle):** Die bestehende Datenbank wird beim ersten Start
> übernommen und bekommt Prüfregeln (z. B. nur gültige Rollen und Pausen). Im Log steht dann
> „Bestehende Datenbank (Sequelize) wird in die versionierten Migrationen übernommen“ und „Migrationen angewendet“.
> Verletzt ein Altdatensatz eine Regel, startet das Backend ohne Datenbank (`/health` meldet 503), die Datei bleibt
> **unverändert** und das Log nennt die Regel (z. B. `users_role_check`). Dann die Zeile korrigieren oder das
> Update zurücknehmen (`git checkout <vorheriger Stand>` und neu bauen). Wartungsbefehle im Container heißen jetzt
> `node dist/scripts/…` statt `node scripts/…`.

## 9. Fehlersuche

| Beobachtung | Ursache / Maßnahme |
|---|---|
| Banner „NAS nicht eingebunden oder falscher Ordner: Markierungsdatei … fehlt“ | NAS nicht eingehängt (`mount | grep nas`, `sudo mount -a`) oder `touch …/.zeiterfassung-offsite` vergessen. Danach Sicherung erneut auslösen. |
| „Permission denied“ beim Schreiben auf das NAS | Mount-Optionen `uid=1000,gid=1000` (CIFS) bzw. Benutzerzuordnung (NFS) prüfen; Schreibtest aus Abschnitt 3. |
| Banner „Es wurde noch keine Sicherung gefunden“ direkt nach dem Start | Normal für die ersten Sekunden; sonst `docker compose logs backup`. |
| Browser warnt vor dem Zertifikat | Stammzertifikat (Abschnitt 4) auf dem Arbeitsplatz nicht eingerichtet. |
| Backend startet nicht („JWT_SECRET fehlt“) | `deploy/.env` prüfen. |
| Anmeldung klappt, Seiten bleiben leer / „Verbindungsfehler“ | `DOMAIN` wurde nach dem Bauen geändert → `docker compose up -d --build` (die Adresse wird beim Bauen eingebaut). |
| Erreichbarkeit überwachen | `https://<DOMAIN>/api/status` liefert `{"status":"OK"}`. |

## 10. Sicherheits-Checkliste

- [ ] Server nur im Firmennetz erreichbar; nur 80/443 (und SSH mit Schlüssel) offen.
- [ ] `deploy/.env` nur für Administratoren lesbar, nirgends veröffentlicht.
- [ ] NAS-Benutzer hat nur Zugriff auf die Backup-Freigabe; Snapshots auf dem NAS aktiv.
- [ ] `ALLOW_REGISTRATION=false`; Admin-Passwort geändert; keine Test-/Standardkonten.
- [ ] Anmeldung läuft über `https://` (die Cookies sind in Produktion `Secure` und funktionieren nur über HTTPS).
- [ ] Verdacht auf ein gestohlenes Konto: im Portal das Passwort zurücksetzen (beendet alle Sitzungen sofort) bzw. das Konto deaktivieren.
- [ ] Server-Updates (Betriebssystem, Docker) werden eingespielt.
- [ ] Wiederherstellung wurde getestet.
- [ ] Wer Docker auf dem Server steuern darf, kann alle Daten lesen – Zugang entsprechend begrenzen.

## 11. Datenschutz und Aufbewahrung (bitte klären)

Die Anwendung verarbeitet personenbezogene Beschäftigtendaten (Arbeitszeiten, Verdienst, Konten). Technisch ist vorgesorgt:
Zugriff nur nach Anmeldung, Änderungsprotokoll, Monatsabschluss, Sicherungen. Organisatorisch zu klären (z. B. mit der/dem
Datenschutzbeauftragten): Eintrag im Verzeichnis der Verarbeitungstätigkeiten, Information der Mitarbeiter und
**Aufbewahrungs-/Löschfristen** für Arbeitszeitnachweise. Die Anwendung löscht bewusst nichts automatisch; Sicherungen
werden nach Anzahl (30 lokal, 90 auf dem NAS), nicht nach Rechtsfrist rotiert.

## 12. Ohne Docker (Kurzfassung)

1. Node.js 22 installieren, im Projekt `npm run install:all`.
2. `backend/.env` aus `backend/.env.example` anlegen (`NODE_ENV=production`, Geheimnisse, `CORS_ORIGIN`, `DB_STORAGE` mit
   absolutem Pfad, `TRUST_PROXY=1` hinter einem Proxy).
3. Frontend bauen: `cd frontend && NEXT_PUBLIC_API_URL=https://<DOMAIN> npm run build`, starten mit `npm start` (Port 3000).
4. Backend bauen und starten: `cd backend && npm run build && npm start` (Port 5000) über einen Prozessmanager (pm2,
   Windows-Dienst via NSSM). Nach jedem Update erneut `npm ci && npm run build`.
5. Reverse-Proxy mit HTTPS davor (Caddy, nginx, IIS): `/api/*` → Port 5000, alles andere → Port 3000.
6. Sicherung als Dauerprozess: `cd backend && OFFSITE_DIR=<NAS-Ordner> npm run db:backup:loop` (oder einzeln per
   Aufgabenplanung/Cron: `npm run db:backup`). Im NAS-Ordner die Datei `.zeiterfassung-offsite` anlegen.
