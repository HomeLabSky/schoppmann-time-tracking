CREATE TABLE `AuditLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actorId` integer,
	`actorEmail` text(255) DEFAULT 'system' NOT NULL,
	`action` text(64) NOT NULL,
	`entityType` text(64) NOT NULL,
	`entityId` integer,
	`targetUserId` integer,
	`before` TEXT,
	`after` TEXT,
	`meta` TEXT,
	`createdAt` DATETIME NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at` ON `AuditLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_user_id_created_at` ON `AuditLogs` (`targetUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_type_entity_id` ON `AuditLogs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_logs_action` ON `AuditLogs` (`action`);--> statement-breakpoint
CREATE TABLE `LoginThrottles` (
	`email` text(255) PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`lastFailureAt` DATETIME,
	`lockedUntil` DATETIME
);
--> statement-breakpoint
CREATE TABLE `MinijobSettings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monthlyLimit` real NOT NULL,
	`description` text(500) NOT NULL,
	`validFrom` DATE NOT NULL,
	`validUntil` DATE,
	`isActive` integer DEFAULT false,
	`createdBy` integer NOT NULL,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `minijob_settings_valid_from` ON `MinijobSettings` (`validFrom`);--> statement-breakpoint
CREATE INDEX `minijob_settings_is_active` ON `MinijobSettings` (`isActive`);--> statement-breakpoint
CREATE INDEX `minijob_settings_valid_from_valid_until` ON `MinijobSettings` (`validFrom`,`validUntil`);--> statement-breakpoint
CREATE INDEX `minijob_settings_created_by` ON `MinijobSettings` (`createdBy`);--> statement-breakpoint
CREATE TABLE `PeriodClosures` (
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
	FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_user_period_start` ON `PeriodClosures` (`userId`,`periodStart`);--> statement-breakpoint
CREATE INDEX `period_closures_user_id_period_end` ON `PeriodClosures` (`userId`,`periodEnd`);--> statement-breakpoint
CREATE TABLE `Sessions` (
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
	FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `Sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `sessions_revoked_at` ON `Sessions` (`revokedAt`);--> statement-breakpoint
CREATE INDEX `sessions_absolute_expires_at` ON `Sessions` (`absoluteExpiresAt`);--> statement-breakpoint
CREATE TABLE `TimeEntries` (
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
	FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_user_date` ON `TimeEntries` (`userId`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_user_client_id` ON `TimeEntries` (`userId`,`clientId`);--> statement-breakpoint
CREATE INDEX `time_entries_date` ON `TimeEntries` (`date`);--> statement-breakpoint
CREATE TABLE `Users` (
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
	`updatedAt` DATETIME NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `Users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role` ON `Users` (`role`);--> statement-breakpoint
CREATE INDEX `users_is_active` ON `Users` (`isActive`);