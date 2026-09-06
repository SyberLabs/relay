ALTER TABLE `jobs` ADD `company` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `level` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `remote` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `comp_min` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `comp_max` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `size` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `posted` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `source` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `effort` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `receipt` text;--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner` text PRIMARY KEY NOT NULL,
	`weights` text DEFAULT '' NOT NULL,
	`pairs` integer DEFAULT 0 NOT NULL,
	`minutes` integer DEFAULT 120 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `choices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`winner` text NOT NULL,
	`loser` text NOT NULL,
	`delta` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `choices_owner` ON `choices` (`owner`);--> statement-breakpoint
CREATE TABLE `outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`receipt` text,
	`occurred` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `outcomes_owner_job` ON `outcomes` (`owner`,`job_id`);
