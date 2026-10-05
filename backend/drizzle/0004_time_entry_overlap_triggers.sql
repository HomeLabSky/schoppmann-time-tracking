-- Mehrere Einträge pro Tag: Die Datenbank verhindert zeitliche Überschneidungen eines Mitarbeiters ein zweites Mal
-- (erste Linie: TimeEntryService, Fehler ENTRY_OVERLAP). Zeiträume als Sekunden [Beginn, Ende); Ende <= Beginn ist
-- eine Nachtschicht, das Ende liegt am Folgetag. Direkt anschließende Einträge (Ende = Beginn) sind erlaubt.
-- Geprüft werden Einträge vom Vortag bis Folgetag (Nachtschicht vom Vortag kann in den Tag hineinreichen).
-- Achtung: Ein Neuaufbau der Tabelle TimeEntries (z. B. für neue CHECK-Regeln) löscht diese Trigger –
-- danach neu anlegen (test/migrate.test.ts prüft, dass sie vorhanden sind).
CREATE TRIGGER IF NOT EXISTS time_entries_no_overlap_insert BEFORE INSERT ON TimeEntries
WHEN EXISTS (
  SELECT 1 FROM TimeEntries t
  WHERE t.userId = NEW.userId
    AND t.date BETWEEN date(NEW.date, '-1 day') AND date(NEW.date, '+1 day')
    AND CAST(strftime('%s', t.date || ' ' || t.startTime) AS INTEGER)
      < CAST(strftime('%s', NEW.date || ' ' || NEW.endTime) AS INTEGER) + CASE WHEN NEW.endTime <= NEW.startTime THEN 86400 ELSE 0 END
    AND CAST(strftime('%s', NEW.date || ' ' || NEW.startTime) AS INTEGER)
      < CAST(strftime('%s', t.date || ' ' || t.endTime) AS INTEGER) + CASE WHEN t.endTime <= t.startTime THEN 86400 ELSE 0 END
)
BEGIN SELECT RAISE(ABORT, 'time_entries_overlap'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS time_entries_no_overlap_update BEFORE UPDATE OF userId, date, startTime, endTime ON TimeEntries
WHEN EXISTS (
  SELECT 1 FROM TimeEntries t
  WHERE t.userId = NEW.userId
    AND t.id <> NEW.id
    AND t.date BETWEEN date(NEW.date, '-1 day') AND date(NEW.date, '+1 day')
    AND CAST(strftime('%s', t.date || ' ' || t.startTime) AS INTEGER)
      < CAST(strftime('%s', NEW.date || ' ' || NEW.endTime) AS INTEGER) + CASE WHEN NEW.endTime <= NEW.startTime THEN 86400 ELSE 0 END
    AND CAST(strftime('%s', NEW.date || ' ' || NEW.startTime) AS INTEGER)
      < CAST(strftime('%s', t.date || ' ' || t.endTime) AS INTEGER) + CASE WHEN t.endTime <= t.startTime THEN 86400 ELSE 0 END
)
BEGIN SELECT RAISE(ABORT, 'time_entries_overlap'); END;
