CREATE TABLE `profile_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`claim` text NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`tag` text DEFAULT 'detail' NOT NULL,
	`status` text DEFAULT 'Proposed' NOT NULL,
	`verified` text,
	`expires` text,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facts_owner_claim` ON `profile_facts` (`owner`,`claim`);--> statement-breakpoint
CREATE TABLE `style_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`rule` text NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_owner_scope_rule` ON `style_rules` (`owner`,`scope`,`rule`);--> statement-breakpoint
CREATE TABLE `profile_state` (
	`owner` text PRIMARY KEY NOT NULL,
	`profile_version` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`cluster` text NOT NULL,
	`body` text NOT NULL,
	`corrected` text DEFAULT '' NOT NULL,
	`profile_version` integer NOT NULL,
	`cited` text DEFAULT '' NOT NULL,
	`confidence` text DEFAULT 'high' NOT NULL,
	`batch` text,
	`verdict` text DEFAULT 'Logged' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drafts_owner_verdict` ON `drafts` (`owner`,`verdict`);--> statement-breakpoint
CREATE TABLE `review_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`reason` text NOT NULL,
	`opened` text NOT NULL,
	`closed` text,
	`size` integer DEFAULT 0 NOT NULL,
	`rules_added` integer DEFAULT 0 NOT NULL
);
