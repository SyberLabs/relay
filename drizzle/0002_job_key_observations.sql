DROP INDEX `observations_owner_source`;--> statement-breakpoint
CREATE UNIQUE INDEX `observations_owner_source` ON `observations` (`owner`,`job_key`,`source_url`,`name`,`status`,`notes`);--> statement-breakpoint
UPDATE `jobs` SET `status`='Held', `accepted_draft`=NULL, `version`=`version`+1 WHERE `status`='Ready' AND (`accepted_draft` IS NULL OR `accepted_draft`!=`draft`);

