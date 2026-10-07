# Schritt-für-Schritt: Installation auf dem Docker-Server 10.69.3.150

Konkrete Kurzanleitung für den vorhandenen Docker-Server **10.69.3.150** – von der leeren Maschine bis zur ersten
Zeiterfassung. Hintergründe, NAS-Details, Wiederherstellung und Sicherheits-Checkliste stehen in [`README.md`](README.md)
(im Folgenden „Betriebsanleitung“).

Ergebnis am Ende: Das System läuft unter `https://10.69.3.150`, ein Administrator ist angelegt, die Minijob-Grenze und
ein erster Mitarbeiter sind eingerichtet, die erste Zeit ist erfasst, die tägliche Sicherung läuft.

---

## Teil A – Server vorbereiten

### 1. Anmelden und Voraussetzungen prüfen

```bash
ssh <benutzer>@10.69.3.150
docker --version
docker compose version     # "Compose-Plugin" muss vorhanden sein (v2)
git --version
```

Fehlt etwas: `sudo apt install git` bzw. Docker nach der offiziellen Anleitung installieren
(<https://docs.docker.com/engine/install/>). Der Benutzer sollte Docker ohne `sudo` nutzen dürfen
(`sudo usermod -aG docker $USER`, danach neu anmelden).

> **Ohne Docker-Rechte?** Dann jedem `docker …`-Befehl in dieser Anleitung `sudo` voranstellen (z. B.
> `sudo docker compose up -d --build`). Dateien, die Docker dabei erzeugt (z. B. `caddy-root.crt`), gehören `root`;
> vor dem Kopieren per `scp` mit `sudo chown $USER <datei>` übernehmen. Die Gruppe `docker` ist gleichbedeutend mit
> Root-Rechten auf dem Server und sollte nur Administratoren zugewiesen werden.

### 2. Ports prüfen

Auf dem Server müssen **80** und **443** (TCP, 443 auch UDP) frei sein und von den Arbeitsplätzen erreichbar sein:

```bash
sudo ss -tulpn | grep -E ':(80|443)\b' || echo "frei"
```

Läuft dort schon ein anderer Dienst (z. B. ein anderer Webserver), muss er verlegt werden – Caddy braucht diese Ports.

### 3. Projekt holen

```bash
git clone https://github.com/homelabsky/schoppmann-time-tracking.git
cd schoppmann-time-tracking/deploy
```

(Bei privatem Repository: mit Zugangsdaten bzw. Deploy-Key klonen.)

---

## Teil B – Konfiguration

### 4. Adresse festlegen: IP oder Name

Es gibt zwei Möglichkeiten:

| Variante | `DOMAIN` | Hinweis |
|---|---|---|
| **Schnellstart** | `10.69.3.150` | Funktioniert sofort, ohne DNS. Alle Nutzer müssen genau diese Adresse im Browser eingeben. |
| **Empfohlen für den Dauerbetrieb** | z. B. `zeit.firma.de` | Im DNS (oder per hosts-Datei) auf `10.69.3.150` zeigen lassen. Nicht `…local` verwenden. |

Wichtig: `DOMAIN` wird beim Bauen in das Frontend eingebaut. Wer später von IP auf Namen wechselt, muss neu bauen
(`docker compose up -d --build`) und das Stammzertifikat (Schritt 9) neu verteilen. Ruft man das System unter einer
anderen Adresse auf, als in `DOMAIN` steht, schlagen Anmeldung und API-Aufrufe fehl.

### 5. Geheimnisse erzeugen und `.env` anlegen

```bash
cp .env.example .env
chmod 600 .env
```

Zwei **verschiedene** Zufallswerte erzeugen (Befehl zweimal ausführen; ohne Node auf dem Server z. B. `openssl rand -hex 48`):

```bash
openssl rand -hex 48
openssl rand -hex 48
```

`.env` bearbeiten (`nano .env`) und mindestens setzen:

```ini
DOMAIN=10.69.3.150
JWT_SECRET=<erster Wert>
JWT_REFRESH_SECRET=<zweiter Wert>
TLS_MODE=internal
NAS_BACKUP_DIR=/mnt/nas-zeiterfassung
ALLOW_REGISTRATION=false
TZ=Europe/Berlin
```

Die JWT-Werte **sicher aufbewahren** (Passwortmanager): Bei einem Neuaufbau des Servers werden dieselben Werte
gebraucht, sonst müssen sich alle neu anmelden.

### 6. Sicherungsziel vorbereiten

Der Backup-Dienst legt jede Sicherung zusätzlich in `NAS_BACKUP_DIR` ab und startet nur, wenn der Ordner existiert.
Dort muss die Markierungsdatei `.zeiterfassung-offsite` liegen, sonst meldet das System „NAS nicht eingebunden“.

**Variante 1 – gleich mit NAS (empfohlen):** NAS-Freigabe einbinden wie in der Betriebsanleitung, **Abschnitt 3**
(CIFS/NFS, `fstab`, `touch /mnt/nas-zeiterfassung/.zeiterfassung-offsite`, Schreibtest).
Liegt das NAS auf dem Unraid-Server **10.69.1.12**, steht die komplette Anleitung (Freigabe, Benutzer, Einbinden) im
Anhang *NAS-Freigabe auf Unraid* am Ende dieser Datei.

**Variante 2 – vorläufig ohne NAS (nur zum Ausprobieren):** lokaler Ordner als Platzhalter.

```bash
sudo mkdir -p /mnt/nas-zeiterfassung
sudo touch /mnt/nas-zeiterfassung/.zeiterfassung-offsite
sudo chown -R 1000:1000 /mnt/nas-zeiterfassung
```

> Achtung: Diese Kopie liegt dann auf **demselben Server** und schützt nicht vor dessen Ausfall. Für den echten Betrieb
> unbedingt auf Variante 1 umstellen (Ordner leeren/aushängen, NAS einbinden, Markierungsdatei anlegen, Dienste neu starten:
> `docker compose up -d`).

---

## Teil C – Starten

### 7. Bauen und starten

```bash
docker compose up -d --build
```

Der erste Lauf dauert einige Minuten (Images werden gebaut). Danach:

```bash
docker compose ps
```

Erwartet: `backend`, `frontend`, `caddy`, `backup` laufen; `backend` wird nach kurzer Zeit „healthy“, `backup` nach
ca. 2 Minuten. Bei Problemen:

```bash
docker compose logs backend      # z. B. fehlende JWT-Werte
docker compose logs backup       # z. B. NAS-Ordner / Markierungsdatei
docker compose logs caddy
```

Schneller Test auf dem Server:

```bash
curl -k https://10.69.3.150/api/status      # erwartet: {"status":"OK"...}
```

### 8. Ersten Administrator anlegen

Es gibt bewusst keine öffentliche Einrichtungsseite. Der Admin wird per Skript im Container angelegt:

```bash
docker compose exec backend node dist/scripts/create-admin.js
```

Abgefragt werden E-Mail-Adresse, Name und Passwort (verdeckt eingeben). Alternativ ein Zufallspasswort erzeugen lassen
(wird **einmal** angezeigt – notieren):

```bash
docker compose exec backend node dist/scripts/create-admin.js --generate --email=chef@firma.de --name="Vorname Nachname"
```

Passwort vergessen: `docker compose exec backend node dist/scripts/reset-password.js chef@firma.de`

### 9. HTTPS-Zertifikat auf den Arbeitsplätzen einrichten

Caddy stellt ein Zertifikat aus einer eigenen internen Zertifizierungsstelle aus. Damit die Browser **keine Warnung**
zeigen, wird deren Stammzertifikat einmal auf jedem Arbeitsplatz hinterlegt:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Datei auf den Arbeitsplatz kopieren (z. B. per `scp <benutzer>@10.69.3.150:~/schoppmann-time-tracking/deploy/caddy-root.crt .`)
und als Administrator (Windows) installieren:

```powershell
certutil -addstore -f Root caddy-root.crt
```

Für viele PCs: per Gruppenrichtlinie verteilen (Betriebsanleitung, Abschnitt 4). Firefox hat einen eigenen Zertifikatsspeicher.
Zum bloßen Ausprobieren kann man die Warnung im Browser einmalig bestätigen – für den Alltag ist das nicht geeignet.

---

## Teil D – Erste Schritte im System

Alle folgenden Schritte im Browser unter **`https://10.69.3.150`** (bzw. dem gewählten Namen).

### 10. Als Administrator anmelden

Die Anmeldeseite öffnet sich automatisch. Mit der in Schritt 8 angelegten E-Mail und dem Passwort anmelden. Danach
ggf. im Bereich **Einstellungen** das Passwort ändern (insbesondere bei einem generierten Passwort).

Die Admin-Startseite zeigt unten die Karte **Datensicherung**; direkt nach dem Start sollte dort stehen, dass Sicherung
und NAS-Ablage aktuell sind.

### 11. Minijob-Grenze hinterlegen (wichtig, vor den ersten Buchungen)

Menü **Minijob** → neue Grenze anlegen:

- **Monatliche Grenze (€)** – der aktuell gültige Betrag, z. B. `603,00`
- **Beschreibung** – z. B. „Gesetzliche Minijob-Grenze 2026“
- **Gültig ab** – frühestens der erste Arbeitstag, auch rückwirkend möglich; **Gültig bis** leer lassen = unbegrenzt

Ohne Eintrag rechnet das System mit einem Notwert von 550 € und zeigt eine Warnung „Für heute ist keine Grenze
hinterlegt“. Ändert sich die Grenze später, legt man einfach eine neue mit „Gültig ab“ an.

### 12. Mitarbeiter anlegen

Menü **Benutzer** → neuen Benutzer anlegen:

- **Vollständiger Name**, **E-Mail-Adresse** (dient zur Anmeldung)
- **Startpasswort** (dem Mitarbeiter mitteilen)
- **Rolle:** *Mitarbeiter* (für Administratoren *Admin*)

Danach beim Mitarbeiter über das Aktionsmenü (⋯) die **Abrechnungseinstellungen** öffnen:

- **Stundenlohn (€)**
- **Abrechnungszeitraum** (*Von Tag* / *Bis Tag*, z. B. 1 bis Monatsende)
- **E-Mail für Lohnzettel** (optional)

Selbstregistrierung bleibt aus (`ALLOW_REGISTRATION=false`) – Konten legt nur ein Admin an.

### 13. Als Mitarbeiter anmelden und Zeit erfassen

Abmelden und mit dem Mitarbeiterkonto anmelden (am besten in einem privaten Fenster, um beide Rollen parallel zu sehen).
Auf dem **Dashboard** der Mitarbeiter:

1. Neuen Eintrag anlegen: **Datum**, **Beginn**, **Ende**, **Pause (Min.)**, optional **Tätigkeit**.
   Mehrere Einträge pro Tag (geteilte Schichten) sind möglich, sie dürfen sich aber nicht überlappen.
2. Die Kennzahlen **Arbeitszeit**, **Verdienst**, **Auszahlung**, die **Ausschöpfung der Minijob-Grenze** und der
   **Übertrag in die nächste Periode** werden sofort berechnet.
3. Mit den Pfeilen zwischen den Abrechnungsperioden blättern.

### 14. Periode prüfen und abschließen (Admin)

Als Administrator: Menü **Zeitnachweise** → Mitarbeiter und Periode wählen, Zeiten prüfen. Eine Periode lässt sich
**erst nach ihrem Ende abschließen**; danach kann der Mitarbeiter dort nichts mehr anlegen, ändern oder löschen.
Mit Begründung kann ein Admin sie wieder öffnen. Alle Änderungen erscheinen im Menü **Protokoll**.

---

## Teil E – Abnahme (kurz)

- [ ] `https://10.69.3.150` öffnet die Anmeldeseite, ohne Zertifikatswarnung (nach Schritt 9).
- [ ] Admin-Anmeldung klappt; Minijob-Grenze und mindestens ein Mitarbeiter sind angelegt.
- [ ] Mitarbeiter hat einen Zeiteintrag erfasst; Verdienst wird angezeigt.
- [ ] Admin-Startseite: „Sicherung und NAS-Ablage sind aktuell“ (sonst `docker compose logs backup`).
- [ ] `ls -l /mnt/nas-zeiterfassung` zeigt eine Datei `timetracking-….db`.
- [ ] Wiederherstellung einmal auf einem Testsystem durchgespielt (Betriebsanleitung, Abschnitte 6 und 7).

## Alltag

```bash
cd ~/schoppmann-time-tracking/deploy
docker compose ps                                           # Zustand
docker compose logs -f backend                              # Logs
docker compose exec backup node dist/scripts/backup-db.js   # sofort sichern

# Update
cd .. && git pull && cd deploy && docker compose up -d --build
```

Vor größeren Updates zuerst eine Sicherung auslösen. Datenbank, Sicherungen und Zertifikate liegen in Docker-Volumes und
bleiben bei Updates erhalten; **nicht** `docker compose down -v` ausführen (löscht die Volumes samt Datenbank).

## Häufige Stolpersteine

| Problem | Lösung |
|---|---|
| Anmeldung klappt, aber Seiten bleiben leer / „Verbindungsfehler“ | Aufruf nicht unter der Adresse aus `DOMAIN`, oder `DOMAIN` nach dem Bauen geändert → `docker compose up -d --build`. |
| `docker compose up` bricht ab: „NAS_BACKUP_DIR fehlt“ / „JWT_SECRET fehlt“ | `deploy/.env` vervollständigen (Schritte 5 und 6). |
| Banner „NAS nicht eingebunden …“ | Markierungsdatei `.zeiterfassung-offsite` fehlt oder NAS nicht eingehängt; danach Sicherung neu auslösen. |
| „Permission denied“ beim Sichern | Ordner muss für Benutzer-ID 1000 beschreibbar sein (`chown 1000:1000` bzw. `uid=1000` in den Mount-Optionen). |
| Port 80/443 belegt | Anderen Dienst verlegen oder stoppen (Schritt 2). |
| Browser warnt vor dem Zertifikat | Stammzertifikat fehlt auf dem Arbeitsplatz (Schritt 9). |

---

## Variante: Verwaltung mit Portainer

Wer den Server bereits mit Portainer verwaltet, kann den Betrieb (Start/Stopp, Logs, Konsole, Update) dort erledigen.
Die Teile A, B (Schritte 4–6) und D bleiben unverändert; Teil C (Schritte 7 und 8) wird durch das Folgende ersetzt.

> **Warum nicht direkt „Stack aus Git-Repository“?** Das Compose-File baut die Images aus dem Repository und bindet
> `Caddyfile` und `certs` über relative Pfade ein. Portainer (Community Edition) löst relative Pfade nicht auf dem Host auf;
> Caddy bekäme dann leere Ordner statt der Konfiguration. Deshalb: Images einmal auf dem Host bauen, Stack mit festen Pfaden
> in Portainer anlegen.

### P1. Projekt und Images auf dem Host vorbereiten (per SSH)

```bash
sudo git clone https://github.com/homelabsky/schoppmann-time-tracking.git /opt/zeiterfassung
sudo chown -R $USER /opt/zeiterfassung
cd /opt/zeiterfassung/deploy
cp .env.example .env && chmod 600 .env      # DOMAIN, JWT_*, NAS_BACKUP_DIR wie in Schritt 5/6 eintragen
docker compose build                         # erzeugt die Images schoppmann-zeiterfassung-{backend,frontend,backup}
docker images | grep schoppmann
```

Das Bauen braucht `.env` (die Adresse `DOMAIN` wird ins Frontend eingebaut). NAS-Ordner und Markierungsdatei wie in
Schritt 6 anlegen.

### P2. Stack in Portainer anlegen

1. Portainer öffnen → Umgebung wählen → **Stacks → Add stack**.
2. **Name:** `schoppmann-zeiterfassung` (genau so, damit die Image-Namen aus P1 passen).
3. **Build method:** *Web editor* und folgenden Inhalt einfügen:

```yaml
services:
  backend:
    image: schoppmann-zeiterfassung-backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: "5000"
      DB_STORAGE: /data/timetracking.db
      BACKUP_DIR: /backups
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      CORS_ORIGIN: https://${DOMAIN}
      TRUST_PROXY: "1"
      ALLOW_REGISTRATION: "false"
    volumes:
      - db-data:/data
      - backups:/backups:ro
    expose: ["5000"]

  frontend:
    image: schoppmann-zeiterfassung-frontend
    restart: unless-stopped
    expose: ["3000"]

  caddy:
    image: caddy:2
    restart: unless-stopped
    depends_on: [frontend, backend]
    environment:
      DOMAIN: ${DOMAIN}
      TLS_MODE: internal
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - /opt/zeiterfassung/deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - /opt/zeiterfassung/deploy/certs:/certs:ro
      - caddy-data:/data
      - caddy-config:/config

  backup:
    image: schoppmann-zeiterfassung-backup
    restart: unless-stopped
    command: ["node", "dist/scripts/backup-loop.js"]
    environment:
      TZ: Europe/Berlin
      DB_STORAGE: /data/timetracking.db
      BACKUP_DIR: /backups
      BACKUP_KEEP: "30"
      BACKUP_TIME: "02:30"
      OFFSITE_DIR: /nas
      OFFSITE_KEEP: "90"
    volumes:
      - db-data:/data
      - backups:/backups
      - /mnt/nas-zeiterfassung:/nas
    healthcheck:
      test: ["CMD", "node", "dist/scripts/backup-healthcheck.js"]
      interval: 1h
      timeout: 10s
      start_period: 2m
      retries: 1

volumes:
  db-data:
  backups:
  caddy-data:
  caddy-config:
```

4. Unter **Environment variables** (*Advanced mode* oder einzeln) eintragen – diese Werte stehen nur in Portainer, nicht im Stack-Text:
   - `DOMAIN` = `10.69.3.150` (muss dem Wert aus P1 beim Bauen entsprechen)
   - `JWT_SECRET` und `JWT_REFRESH_SECRET` = dieselben Werte wie in `/opt/zeiterfassung/deploy/.env`
5. **Deploy the stack.**

Danach unter **Stacks → schoppmann-zeiterfassung** alle vier Container prüfen: `backend` und `backup` werden „healthy“.
Logs: Container anklicken → **Logs**.

### P3. Administrator anlegen (Portainer-Konsole)

**Containers → backend → Console** (Symbol `>_`) → Command `/bin/sh` → *Connect*, dann:

```bash
node dist/scripts/create-admin.js
```

(oder mit `--generate --email=chef@firma.de --name="Vorname Nachname"`). Das Passwort wird verdeckt abgefragt.
Weiter mit Schritt 9 (Zertifikat; Export: Container `caddy` → Console → `cat /data/caddy/pki/authorities/local/root.crt`
oder per SSH: `docker cp $(docker ps -qf name=caddy):/data/caddy/pki/authorities/local/root.crt .`) und Teil D.

### P4. Update mit Portainer

Die Images werden weiterhin auf dem Host gebaut, Portainer startet die Container neu:

```bash
cd /opt/zeiterfassung && git pull && cd deploy && docker compose build
```

Dann in Portainer: **Stacks → schoppmann-zeiterfassung → Update the stack**, Schalter **Re-pull image** *aus*
(die Images sind lokal, es gibt kein Registry-Image) und **Update the stack**. Container mit neuem Image werden neu erstellt;
die Daten bleiben in den Volumes. Vor größeren Updates zuerst eine Sicherung auslösen (Console von `backup`:
`node dist/scripts/backup-db.js`).

> Den Stack **nicht** mit der Option zum Löschen der Volumes entfernen – darin liegen Datenbank und Sicherungen.

---

## Anhang: NAS-Freigabe auf Unraid (10.69.1.12)

Ziel: Auf dem Unraid-Server entsteht die SMB-Freigabe `zeiterfassung-backup` mit einem eigenen Benutzer, die der Docker-Server
(10.69.3.150) unter `/mnt/nas-zeiterfassung` einbindet. Die Bezeichnungen in der Oberfläche können je nach Unraid-Version leicht abweichen.

### U1. Eigenen Benutzer anlegen

1. Unraid-Weboberfläche öffnen: `http://10.69.1.12`.
2. **Users → Add User**.
3. Benutzername z. B. `zeitbackup`, starkes Passwort vergeben (im Passwortmanager ablegen) → **Add**.

Nicht `root` verwenden: Der Docker-Server soll nur auf diese eine Freigabe zugreifen dürfen.

### U2. Freigabe anlegen

1. **Shares → Add Share**.
2. **Share name:** `zeiterfassung-backup`
3. **Primary storage:** der Speicher, auf dem die Sicherungen liegen sollen (Array bzw. ein Pool). Die Sicherungen sind klein
   (eine SQLite-Datei pro Tag, 90 Stück); sinnvoll ist ein Speicher, der selbst abgesichert ist (Parität/Pool).
4. **Add Share**.

### U3. SMB-Zugriff nur für den Backup-Benutzer

Freigabe `zeiterfassung-backup` anklicken, Abschnitt **SMB Security Settings**:

- **Export:** `Yes`
- **Security:** `Private`
- Beim Benutzer `zeitbackup` **Read/Write** einstellen, alle anderen auf *No Access* lassen.
- **Apply** / **Done**.

Prüfen, dass SMB aktiv ist: **Settings → SMB** → *Enable SMB:* `Yes`.

### U4. Auf dem Docker-Server einbinden

Auf dem Docker-Server (10.69.3.150):

```bash
sudo apt install cifs-utils
sudo mkdir -p /mnt/nas-zeiterfassung

sudo tee /root/.nas-zeiterfassung >/dev/null <<'EOT'
username=zeitbackup
password=DAS_PASSWORT_AUS_U1
EOT
sudo chmod 600 /root/.nas-zeiterfassung
```

In `/etc/fstab` als **eine Zeile** ergänzen (`sudo nano /etc/fstab`):

```
//10.69.1.12/zeiterfassung-backup  /mnt/nas-zeiterfassung  cifs  credentials=/root/.nas-zeiterfassung,uid=1000,gid=1000,file_mode=0660,dir_mode=0770,vers=3.0,_netdev,nofail  0  0
```

Einbinden, Markierungsdatei anlegen und Schreibtest:

```bash
sudo systemctl daemon-reload
sudo mount -a
mount | grep nas-zeiterfassung          # Eintrag muss erscheinen
touch /mnt/nas-zeiterfassung/.zeiterfassung-offsite
sudo -u '#1000' sh -c 'touch /mnt/nas-zeiterfassung/test && rm /mnt/nas-zeiterfassung/test' && echo OK
```

Die Markierungsdatei muss **auf dem eingebundenen Unraid-Share** liegen (prüfen: in Unraid unter *Shares →
zeiterfassung-backup → Browse*, ggf. versteckte Dateien einblenden). Danach weiter mit Schritt 7.

Hinweis: `uid=1000` setzt voraus, dass die Container-Benutzer-ID 1000 ist (Benutzer `node` im Image). Das ist unabhängig vom
Benutzer auf dem Docker-Host.

### U5. Hinweise

- **Einbinden schlägt fehl:** zuerst `ping 10.69.1.12`, dann `smbclient -L //10.69.1.12 -U zeitbackup` (Paket `smbclient`).
  „Permission denied“ → Benutzer/Passwort aus U1/U3 prüfen. Bei Protokollfehlern `vers=3.0` durch `vers=3.1.1` oder `vers=2.1` ersetzen.
- **Reihenfolge nach Neustart:** Fährt der Docker-Server vor dem Unraid-Server hoch, ist der Share zunächst nicht eingebunden
  (`nofail` verhindert Boot-Probleme). Dann `sudo mount -a` ausführen und die Container neu starten. Die Markierungsdatei
  verhindert, dass dabei unbemerkt auf die lokale Platte gesichert wird.
- **Versionierung:** Unraid legt für Array-Freigaben nicht automatisch Snapshots an. Wer Schutz gegen versehentlich überschriebene
  oder gelöschte Sicherungen möchte, sichert die Freigabe zusätzlich (z. B. ZFS-Pool mit Snapshots oder regelmäßiges Kopieren
  auf ein weiteres Medium).
- **Kontrolle:** Nach dem ersten Lauf des Dienstes `backup` liegt eine Datei `timetracking-….db` im Share.
