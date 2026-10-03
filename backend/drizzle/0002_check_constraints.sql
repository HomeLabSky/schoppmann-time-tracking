PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_MinijobSettings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monthlyLimit` real NOT NULL,
	`description` text(500) NOT NULL,
	`validFrom` DATE NOT NULL,
	`validUntil` DATE,
	`isActive` integer DEFAULT false,
	`createdBy` integer NOT NULL,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "minijob_settings_limit_check" CHECK("__new_MinijobSettings"."monthlyLimit" BETWEEN 0 AND 999999.99),
	CONSTRAINT "minijob_settings_range_check" CHECK("__new_MinijobSettings"."validUntil" IS NULL OR "__new_MinijobSettings"."validUntil" > "__new_MinijobSettings"."validFrom"),
	CONSTRAINT "minijob_settings_is_active_check" CHECK("__new_MinijobSettings"."isActive" IN (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_MinijobSettings`("id", "monthlyLimit", "description", "validFrom", "validUntil", "isActive", "createdBy", "createdAt", "updatedAt") SELECT "id", "monthlyLimit", "description", "validFrom", "validUntil", "isActive", "createdBy", "createdAt", "updatedAt" FROM `MinijobSettings`;--> statement-breakpoint
DROP TABLE `MinijobSettings`;--> statement-breakpoint
ALTER TABLE `__new_MinijobSettings` RENAME TO `MinijobSettings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `minijob_settings_valid_from` ON `MinijobSettings` (`validFrom`);--> statement-breakpoint
CREATE INDEX `minijob_settings_is_active` ON `MinijobSettings` (`isActive`);--> statement-breakpoint
CREATE INDEX `minijob_settings_valid_from_valid_until` ON `MinijobSettings` (`validFrom`,`validUntil`);--> statement-breakpoint
CREATE INDEX `minijob_settings_created_by` ON `MinijobSettings` (`createdBy`);--> statement-breakpoint
CREATE TABLE `__new_PeriodClosures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`periodStart` DATE NOT NULL,
	`periodEnd` DATE NOT NULL,
	`closedBy` integer,
	`closedAt` DATETIME NOT NULL,
	`entryCount` integer DEFAULT 0 NOT NULL,
	`totalMinutes` integer DEFAULT 0 NOT NULL,
	`earningsCents` integer DEFAULT 0 NOT NULL,
	`limitCents` integer NOT NULL,
	`carryInCents` integer DEFAULT 0 NOT NULL,
	`paidCents` integer DEFAULT 0 NOT NULL,
	`carryOutCents` integer DEFAULT 0 NOT NULL,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "period_closures_range_check" CHECK("__new_PeriodClosures"."periodEnd" >= "__new_PeriodClosures"."periodStart")
);
--> statement-breakpoint
INSERT INTO `__new_PeriodClosures`("id", "userId", "periodStart", "periodEnd", "closedBy", "closedAt", "entryCount", "totalMinutes", "earningsCents", "limitCents", "carryInCents", "paidCents", "carryOutCents", "createdAt", "updatedAt") SELECT "id", "userId", "periodStart", "periodEnd", "closedBy", "closedAt", "entryCount", "totalMinutes", "earningsCents", "limitCents", "carryInCents", "paidCents", "carryOutCents", "createdAt", "updatedAt" FROM `PeriodClosures`;--> statement-breakpoint
DROP TABLE `PeriodClosures`;--> statement-breakpoint
ALTER TABLE `__new_PeriodClosures` RENAME TO `PeriodClosures`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_user_period_start` ON `PeriodClosures` (`userId`,`periodStart`);--> statement-breakpoint
CREATE INDEX `period_closures_user_id_period_end` ON `PeriodClosures` (`userId`,`periodEnd`);--> statement-breakpoint
CREATE TABLE `__new_Sessions` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`userId` integer NOT NULL,
	`refreshHash` text(64) NOT NULL,
	`previousHash` text(64),
	`rotatedAt` DATETIME,
	`lastUsedAt` DATETIME NOT NULL,
	`expiresAt` DATETIME NOT NULL,
	`absoluteExpiresAt` DATETIME NOT NULL,
	`revokedAt` DATETIME,
	`revokedReason` text(64),
	`clientType` text(8) DEFAULT 'web' NOT NULL,
	`deviceName` text(100),
	`ip` text(64),
	`userAgent` text(255),
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "sessions_client_type_check" CHECK("__new_Sessions"."clientType" IN ('web', 'app'))
);
--> statement-breakpoint
INSERT INTO `__new_Sessions`("id", "userId", "refreshHash", "previousHash", "rotatedAt", "lastUsedAt", "expiresAt", "absoluteExpiresAt", "revokedAt", "revokedReason", "clientType", "deviceName", "ip", "userAgent", "createdAt", "updatedAt") SELECT "id", "userId", "refreshHash", "previousHash", "rotatedAt", "lastUsedAt", "expiresAt", "absoluteExpiresAt", "revokedAt", "revokedReason", "clientType", "deviceName", "ip", "userAgent", "createdAt", "updatedAt" FROM `Sessions`;--> statement-breakpoint
DROP TABLE `Sessions`;--> statement-breakpoint
ALTER TABLE `__new_Sessions` RENAME TO `Sessions`;--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `Sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `sessions_revoked_at` ON `Sessions` (`revokedAt`);--> statement-breakpoint
CREATE INDEX `sessions_absolute_expires_at` ON `Sessions` (`absoluteExpiresAt`);--> statement-breakpoint
CREATE TABLE `__new_TimeEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`clientId` text(64),
	`date` DATE NOT NULL,
	`startTime` TIME NOT NULL,
	`endTime` TIME NOT NULL,
	`breakMinutes` integer DEFAULT 30 NOT NULL,
	`description` text(500),
	`hourlyRateCents` integer,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "time_entries_break_check" CHECK("__new_TimeEntries"."breakMinutes" BETWEEN 0 AND 480),
	CONSTRAINT "time_entries_rate_check" CHECK("__new_TimeEntries"."hourlyRateCents" IS NULL OR "__new_TimeEntries"."hourlyRateCents" >= 0),
	CONSTRAINT "time_entries_date_check" CHECK("__new_TimeEntries"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "time_entries_start_check" CHECK("__new_TimeEntries"."startTime" GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'),
	CONSTRAINT "time_entries_end_check" CHECK("__new_TimeEntries"."endTime" GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'),
	CONSTRAINT "time_entries_range_check" CHECK("__new_TimeEntries"."startTime" <> "__new_TimeEntries"."endTime")
);
--> statement-breakpoint
INSERT INTO `__new_TimeEntries`("id", "userId", "clientId", "date", "startTime", "endTime", "breakMinutes", "description", "hourlyRateCents", "createdAt", "updatedAt") SELECT "id", "userId", "clientId", "date", "startTime", "endTime", "breakMinutes", "description", "hourlyRateCents", "createdAt", "updatedAt" FROM `TimeEntries`;--> statement-breakpoint
DROP TABLE `TimeEntries`;--> statement-breakpoint
ALTER TABLE `__new_TimeEntries` RENAME TO `TimeEntries`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_user_date` ON `TimeEntries` (`userId`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_user_client_id` ON `TimeEntries` (`userId`,`clientId`);--> statement-breakpoint
CREATE INDEX `time_entries_date` ON `TimeEntries` (`date`);--> statement-breakpoint
CREATE TABLE `__new_Users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text(255) NOT NULL,
	`password` text(255) NOT NULL,
	`name` text(255) NOT NULL,
	`role` text DEFAULT 'mitarbeiter' NOT NULL,
	`isActive` integer DEFAULT true,
	`stundenlohn` real DEFAULT 12,
	`abrechnungStart` integer DEFAULT 1 NOT NULL,
	`abrechnungEnde` integer DEFAULT 31 NOT NULL,
	`lohnzettelEmail` text(255),
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	CONSTRAINT "users_role_check" CHECK("__new_Users"."role" IN ('admin', 'mitarbeiter')),
	CONSTRAINT "users_is_active_check" CHECK("__new_Users"."isActive" IN (0, 1)),
	CONSTRAINT "users_stundenlohn_check" CHECK("__new_Users"."stundenlohn" IS NULL OR "__new_Users"."stundenlohn" BETWEEN 0 AND 999),
	CONSTRAINT "users_abrechnung_start_check" CHECK("__new_Users"."abrechnungStart" BETWEEN 1 AND 31),
	CONSTRAINT "users_abrechnung_ende_check" CHECK("__new_Users"."abrechnungEnde" BETWEEN 1 AND 31)
);
--> statement-breakpoint
INSERT INTO `__new_Users`("id", "email", "password", "name", "role", "isActive", "stundenlohn", "abrechnungStart", "abrechnungEnde", "lohnzettelEmail", "createdAt", "updatedAt") SELECT "id", "email", "password", "name", "role", "isActive", "stundenlohn", "abrechnungStart", "abrechnungEnde", "lohnzettelEmail", "createdAt", "updatedAt" FROM `Users`;--> statement-breakpoint
DROP TABLE `Users`;--> statement-breakpoint
ALTER TABLE `__new_Users` RENAME TO `Users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `Users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role` ON `Users` (`role`);--> statement-breakpoint
CREATE INDEX `users_is_active` ON `Users` (`isActive`);