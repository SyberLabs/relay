-- Earlier migrations 0002–0005 were hand-authored; only these tables are new.
CREATE TABLE security_counters (scope TEXT PRIMARY KEY NOT NULL, period TEXT NOT NULL, used INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE security_clearances (owner TEXT PRIMARY KEY NOT NULL, expires INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX security_events_owner ON events(owner);
--> statement-breakpoint
CREATE INDEX security_batches_owner ON review_batches(owner);
--> statement-breakpoint
CREATE TRIGGER security_jobs_insert_quota AFTER INSERT ON jobs
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM jobs WHERE owner = NEW.owner LIMIT 501)) > 500
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_jobs_update_quota AFTER UPDATE OF owner ON jobs
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM jobs WHERE owner = NEW.owner LIMIT 501)) > 500
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_observations_insert_quota AFTER INSERT ON observations
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM observations WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_observations_update_quota AFTER UPDATE OF owner ON observations
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM observations WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_events_insert_quota AFTER INSERT ON events
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM events WHERE owner = NEW.owner LIMIT 20001)) > 20000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_events_update_quota AFTER UPDATE OF owner ON events
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM events WHERE owner = NEW.owner LIMIT 20001)) > 20000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_profile_facts_insert_quota AFTER INSERT ON profile_facts
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM profile_facts WHERE owner = NEW.owner LIMIT 501)) > 500
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_profile_facts_update_quota AFTER UPDATE OF owner ON profile_facts
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM profile_facts WHERE owner = NEW.owner LIMIT 501)) > 500
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_style_rules_insert_quota AFTER INSERT ON style_rules
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM style_rules WHERE owner = NEW.owner LIMIT 501)) > 500
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_style_rules_update_quota AFTER UPDATE OF owner ON style_rules
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM style_rules WHERE owner = NEW.owner LIMIT 501)) > 500
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_drafts_insert_quota AFTER INSERT ON drafts
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM drafts WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_drafts_update_quota AFTER UPDATE OF owner ON drafts
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM drafts WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_review_batches_insert_quota AFTER INSERT ON review_batches
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM review_batches WHERE owner = NEW.owner LIMIT 1001)) > 1000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_review_batches_update_quota AFTER UPDATE OF owner ON review_batches
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM review_batches WHERE owner = NEW.owner LIMIT 1001)) > 1000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_choices_insert_quota AFTER INSERT ON choices
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM choices WHERE owner = NEW.owner LIMIT 2001)) > 2000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_choices_update_quota AFTER UPDATE OF owner ON choices
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM choices WHERE owner = NEW.owner LIMIT 2001)) > 2000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_outcomes_insert_quota AFTER INSERT ON outcomes
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM outcomes WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_outcomes_update_quota AFTER UPDATE OF owner ON outcomes
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM outcomes WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_refusals_insert_quota AFTER INSERT ON refusals
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM refusals WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER security_refusals_update_quota AFTER UPDATE OF owner ON refusals
WHEN (SELECT COUNT(*) FROM (SELECT 1 FROM refusals WHERE owner = NEW.owner LIMIT 5001)) > 5000
BEGIN SELECT RAISE(ABORT, 'Workspace storage quota exceeded'); END;
