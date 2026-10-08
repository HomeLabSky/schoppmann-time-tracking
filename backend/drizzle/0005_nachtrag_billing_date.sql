-- Nachträge: Arbeitstag in einer abgeschlossenen Periode, abgerechnet in der Periode, die billingDate enthält (NULL = Periode des Arbeitstags)
ALTER TABLE `TimeEntries` ADD `billingDate` DATE;
