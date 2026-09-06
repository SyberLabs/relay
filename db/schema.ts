import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    job_key: text('job_key').notNull(),
    name: text('name').notNull(),
    url: text('url'),
    status: text('status').notNull(),
    blocker: text('blocker').notNull().default(''),
    draft: text('draft').notNull().default(''),
    accepted_draft: text('accepted_draft'),
    version: integer('version').notNull().default(1),
    updated: text('updated').notNull(),
  },
  (t) => [uniqueIndex('jobs_owner_key').on(t.owner, t.job_key)],
);
export const observations = sqliteTable(
  'observations',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    job_key: text('job_key').notNull(),
    source_url: text('source_url').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    notes: text('notes').notNull(),
    created: text('created').notNull(),
  },
  (t) => [
    uniqueIndex('observations_owner_source').on(
      t.owner,
      t.job_key,
      t.source_url,
      t.name,
      t.status,
      t.notes,
    ),
  ],
);
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  job_id: text('job_id').notNull(),
  kind: text('kind').notNull(),
  detail: text('detail').notNull(),
  created: text('created').notNull(),
});
export const profileFacts = sqliteTable(
  'profile_facts',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    claim: text('claim').notNull(),
    evidence: text('evidence').notNull().default(''),
    tag: text('tag').notNull().default('detail'),
    status: text('status').notNull().default('Proposed'),
    verified: text('verified'),
    expires: text('expires'),
    created: text('created').notNull(),
  },
  (t) => [uniqueIndex('facts_owner_claim').on(t.owner, t.claim)],
);
export const styleRules = sqliteTable(
  'style_rules',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    rule: text('rule').notNull(),
    scope: text('scope').notNull().default('global'),
    origin: text('origin').notNull().default(''),
    created: text('created').notNull(),
  },
  (t) => [uniqueIndex('rules_owner_scope_rule').on(t.owner, t.scope, t.rule)],
);
export const profileState = sqliteTable('profile_state', {
  owner: text('owner').primaryKey(),
  profile_version: integer('profile_version').notNull().default(1),
  updated: text('updated').notNull(),
});
export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  job_id: text('job_id').notNull(),
  cluster: text('cluster').notNull(),
  body: text('body').notNull(),
  corrected: text('corrected').notNull().default(''),
  profile_version: integer('profile_version').notNull(),
  cited: text('cited').notNull().default(''),
  confidence: text('confidence').notNull().default('high'),
  batch: text('batch'),
  verdict: text('verdict').notNull().default('Logged'),
  created: text('created').notNull(),
});
export const reviewBatches = sqliteTable('review_batches', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  reason: text('reason').notNull(),
  opened: text('opened').notNull(),
  closed: text('closed'),
  size: integer('size').notNull().default(0),
  rules_added: integer('rules_added').notNull().default(0),
});
