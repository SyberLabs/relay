CREATE TABLE `refusals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`reason` text NOT NULL,
	`trigger_kind` text DEFAULT 'other' NOT NULL,
	`numbers` integer DEFAULT 0 NOT NULL,
	`words` integer DEFAULT 0 NOT NULL,
	`employer_ref` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `refusals_owner_created` ON `refusals` (`owner`,`created`);
