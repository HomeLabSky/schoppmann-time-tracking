-- Sonderposten erfasst der Mitarbeiter selbst (auch per App): clientId für sichere Wiederholung bei Offline-Erfassung
ALTER TABLE `SpecialItems` ADD `clientId` text(64);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_special_item_client_id` ON `SpecialItems` (`userId`,`clientId`);