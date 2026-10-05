DROP INDEX IF EXISTS `unique_user_date`;--> statement-breakpoint
CREATE INDEX `time_entries_user_date` ON `TimeEntries` (`userId`,`date`);