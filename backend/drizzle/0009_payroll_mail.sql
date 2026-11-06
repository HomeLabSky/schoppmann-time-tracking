-- Lohnabrechnung per E-Mail: Empfänger und Text (eine Zeile, id = 1); SMTP-Zugang steht in der Umgebung
CREATE TABLE `PayrollMailSettings` (
	`id` integer PRIMARY KEY NOT NULL,
	`recipient` text(255) DEFAULT '' NOT NULL,
	`subject` text(200) NOT NULL,
	`body` text(5000) NOT NULL,
	`updatedBy` integer,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	CONSTRAINT "payroll_mail_settings_singleton_check" CHECK("PayrollMailSettings"."id" = 1)
);
