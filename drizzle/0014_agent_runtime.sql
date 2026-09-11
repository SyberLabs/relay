CREATE TABLE `agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`job_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_session_id` text NOT NULL,
	`status` text NOT NULL,
	`capabilities` text NOT NULL,
	`provider_state` text DEFAULT '' NOT NULL,
	`turn_id` text DEFAULT '' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `agent_sessions_owner_job` ON `agent_sessions` (`owner`,`job_id`);--> statement-breakpoint
CREATE INDEX `agent_sessions_owner_status` ON `agent_sessions` (`owner`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_owner_provider_session` ON `agent_sessions` (`owner`,`provider_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_owner_active` ON `agent_sessions` (`owner`) WHERE `status` IN ('queued','in_progress');--> statement-breakpoint
CREATE TABLE `agent_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`call_id` text NOT NULL,
	`name` text NOT NULL,
	`arguments` text NOT NULL,
	`status` text NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`side_effect` text DEFAULT 'none' NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tool_calls_owner_turn_call` ON `agent_tool_calls` (`owner`,`turn_id`,`call_id`);--> statement-breakpoint
CREATE INDEX `agent_tool_calls_owner_session` ON `agent_tool_calls` (`owner`,`session_id`);--> statement-breakpoint
CREATE TRIGGER `agent_sessions_capacity` BEFORE INSERT ON `agent_sessions`
WHEN (SELECT COUNT(*) FROM agent_sessions WHERE owner=NEW.owner)>=50
BEGIN SELECT RAISE(ABORT,'Agent session storage limit reached'); END;--> statement-breakpoint
CREATE TRIGGER `agent_tool_calls_capacity` BEFORE INSERT ON `agent_tool_calls`
WHEN (SELECT COUNT(*) FROM agent_tool_calls WHERE owner=NEW.owner)>=500
BEGIN SELECT RAISE(ABORT,'Agent tool call storage limit reached'); END;
