CREATE TABLE `refusals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`reason` text NOT NULL,
	`sentence` text DEFAULT '' NOT NULL,
	`cited` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refusals_owner_created` ON `refusals` (`owner`,`created`);
