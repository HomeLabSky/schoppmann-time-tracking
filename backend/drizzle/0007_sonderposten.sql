-- Sonderposten: privat verauslagte Beträge, zusätzlich zum Lohn erstattet; Summe wird beim Monatsabschluss eingefroren
CREATE TABLE `SpecialItems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`date` DATE NOT NULL,
	`description` text(200) NOT NULL,
	`amountCents` integer NOT NULL,
	`billingDate` DATE,
	`createdBy` integer,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "special_items_amount_check" CHECK("SpecialItems"."amountCents" > 0 AND "SpecialItems"."amountCents" <= 10000000),
	CONSTRAINT "special_items_date_check" CHECK("SpecialItems"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "special_items_description_check" CHECK(length(trim("SpecialItems"."description")) > 0)
);
--> statement-breakpoint
CREATE INDEX `special_items_user_date` ON `SpecialItems` (`userId`,`date`);--> statement-breakpoint
ALTER TABLE `PeriodClosures` ADD `specialItemsCents` integer DEFAULT 0 NOT NULL;