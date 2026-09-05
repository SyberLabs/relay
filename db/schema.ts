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
