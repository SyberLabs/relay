ALTER TABLE `jobs` ADD `drafting_direction` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `routine_drafting` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `drafting_version` integer DEFAULT 1 NOT NULL;