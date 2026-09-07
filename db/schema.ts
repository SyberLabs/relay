import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
export const applicationPolicies = sqliteTable('application_policies', {
  owner: text('owner').primaryKey(),
  version: integer('version').notNull(),
  enabled: integer('enabled').notNull(),
  review: text('review').notNull(),
  jobs: text('jobs').notNull(),
  expires: text('expires').notNull(),
  maximum: integer('maximum').notNull(),
  updated: text('updated').notNull(),
});
export const applicationOperations = sqliteTable(
  'application_operations',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    job_id: text('job_id').notNull(),
    job_version: integer('job_version').notNull(),
    policy_version: integer('policy_version').notNull(),
    policy_snapshot: text('policy_snapshot').notNull(),
    actor: text('actor').notNull(),
    manifest: text('manifest').notNull(),
    digest: text('digest').notNull(),
    state: text('state').notNull(),
    authority: text('authority').notNull(),
    created: text('created').notNull(),
    started: text('started'),
    finished: text('finished'),
    receipt: text('receipt').notNull(),
  },
  (t) => [
    index('application_operations_owner_id').on(t.owner, t.id),
    index('application_operations_owner_job').on(t.owner, t.job_id),
  ],
);
// Fixed rows per authenticated owner/scope; windows overwrite rather than grow.
export const securityCounters = sqliteTable('security_counters', {
  scope: text('scope').primaryKey(),
  period: text('period').notNull(),
  used: integer('used').notNull(),
});
export const securityClearances = sqliteTable('security_clearances', {
  owner: text('owner').primaryKey(),
  expires: integer('expires').notNull(),
});
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
    company: text('company').notNull().default(''),
    level: text('level').notNull().default(''),
    remote: text('remote').notNull().default(''),
    comp_min: integer('comp_min'),
    comp_max: integer('comp_max'),
    location: text('location').notNull().default(''),
    size: text('size').notNull().default(''),
    posted: text('posted'),
    source: text('source').notNull().default(''),
    effort: integer('effort').notNull().default(20),
    receipt: text('receipt'),
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
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    job_id: text('job_id').notNull(),
    kind: text('kind').notNull(),
    detail: text('detail').notNull(),
    created: text('created').notNull(),
  },
  (t) => [index('security_events_owner').on(t.owner)],
);
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
export const drafts = sqliteTable(
  'drafts',
  {
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
  },
  (t) => [index('drafts_owner_verdict').on(t.owner, t.verdict)],
);
export const reviewBatches = sqliteTable(
  'review_batches',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    reason: text('reason').notNull(),
    opened: text('opened').notNull(),
    closed: text('closed'),
    size: integer('size').notNull().default(0),
    rules_added: integer('rules_added').notNull().default(0),
  },
  (t) => [index('security_batches_owner').on(t.owner)],
);
export const preferences = sqliteTable('preferences', {
  owner: text('owner').primaryKey(),
  weights: text('weights').notNull().default(''),
  pairs: integer('pairs').notNull().default(0),
  minutes: integer('minutes').notNull().default(120),
  updated: text('updated').notNull(),
});
export const choices = sqliteTable(
  'choices',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    winner: text('winner').notNull(),
    loser: text('loser').notNull(),
    delta: text('delta').notNull(),
    created: text('created').notNull(),
  },
  (t) => [index('choices_owner').on(t.owner)],
);
export const outcomes = sqliteTable(
  'outcomes',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    job_id: text('job_id').notNull(),
    kind: text('kind').notNull(),
    detail: text('detail').notNull().default(''),
    receipt: text('receipt'),
    occurred: text('occurred').notNull(),
    created: text('created').notNull(),
  },
  (t) => [index('outcomes_owner_job').on(t.owner, t.job_id)],
);
// A refusal record is not a draft. It never enters the review queue, is never
// citable and never counts toward graduation.
//
// It holds no text from the refused draft. An earlier revision stored the
// failing clause, which for a single-sentence draft is the whole body -- so
// the columns are a one-way summary instead: which rule fired, how many
// figures the clause carried, its length, and whether an employer possessive
// governed it. That measures the gate's strictness without retaining a word of
// what was written.
export const refusals = sqliteTable('refusals', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  job_id: text('job_id').notNull(),
  reason: text('reason').notNull(),
  trigger_kind: text('trigger_kind').notNull().default('other'),
  numbers: integer('numbers').notNull().default(0),
  words: integer('words').notNull().default(0),
  employer_ref: integer('employer_ref').notNull().default(0),
  created: text('created').notNull(),
});
