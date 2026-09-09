ALTER TABLE `profile_facts` ADD `field_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `facts_owner_field_key` ON `profile_facts` (`owner`,`field_key`);
