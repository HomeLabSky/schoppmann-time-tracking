-- Änderungsprotokoll ist auch auf Datenbankebene schreibgeschützt: jedes UPDATE und DELETE bricht ab,
-- auch bei direktem SQL. (Bestehende Datenbanken haben die Trigger schon – daher IF NOT EXISTS.)
CREATE TRIGGER IF NOT EXISTS auditlogs_no_update BEFORE UPDATE ON AuditLogs
  BEGIN SELECT RAISE(ABORT, 'AuditLogs sind unveränderlich'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS auditlogs_no_delete BEFORE DELETE ON AuditLogs
  BEGIN SELECT RAISE(ABORT, 'AuditLogs sind unveränderlich'); END;
--> statement-breakpoint
-- Vorbereitung für die Prüfregeln der nächsten Migration: Uhrzeiten aus sehr alten Einträgen ('9:00', '09:00')
-- auf das einheitliche Format HH:MM:SS bringen.
UPDATE TimeEntries SET startTime = substr('0' || startTime, -5) || ':00' WHERE length(startTime) IN (4, 5);
--> statement-breakpoint
UPDATE TimeEntries SET endTime = substr('0' || endTime, -5) || ':00' WHERE length(endTime) IN (4, 5);
