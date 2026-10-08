-- Nacherfassung: vom Admin freigegeben, Zeiten bis zu diesem Tag zurück erfassen (NULL = nur das normale Fenster von einem Monat)
ALTER TABLE `Users` ADD `nacherfassungAb` DATE;
