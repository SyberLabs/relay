CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_key` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`status` text NOT NULL,
	`blocker` text DEFAULT '' NOT NULL,
	`draft` text DEFAULT '' NOT NULL,
	`accepted_draft` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_owner_key` ON `jobs` (`owner`,`job_key`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_key` text NOT NULL,
	`source_url` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observations_owner_source` ON `observations` (`owner`,`source_url`);