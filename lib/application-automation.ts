// External agents execute employer requests. Relay issues one permit and stores
// their exact proposed payload and reported result; it never retries submission.
export type SubmissionManifest = {
  destination: string;
  fields: { label: string; value: string }[];
  files: { name: string; base64: string; sha256: string }[];
};
export type ApplicationPolicy = {
  owner: string;
  version: number;
  enabled: number;
  review: string;
  jobs: string;
  expires: string;
  maximum: number;
  updated: string;
};
export type InspectView = {
  job_id: string;
  destination: string | null;
  fields: {
    label: string;
    filled: boolean;
    unknown: boolean;
    value: string;
  }[];
  files: { name: string; sha256: string }[];
  missing: string[];
  ready: boolean;
  armed: boolean;
  operation_id: string | null;
  digest: string | null;
  state: string | null;
  accept_enabled: boolean;
};
export type ApplicationOperation = {
  id: string;
  owner: string;
  job_id: string;
  job_version: number;
  policy_version: number;
  policy_snapshot: string;
  actor: string;
  manifest: string;
  digest: string;
  state: string;
  authority: string;
  created: string;
  started: string | null;
  finished: string | null;
  receipt: string;
};
export class ApplicationRefusal extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}
function requireThat(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new ApplicationRefusal(message, status);
}
function shortText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}
export async function digest(value: string | Uint8Array) {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function validateManifest(
  raw: unknown,
): Promise<SubmissionManifest> {
  requireThat(
    raw && typeof raw === 'object',
    'Provide the complete submission.',
  );
  const m = raw as SubmissionManifest;
  requireThat(
    shortText(m.destination, 2048),
    'Provide the employer application URL.',
  );
  let url: URL;
  try {
    url = new URL(m.destination);
  } catch {
    throw new ApplicationRefusal('Invalid destination.', 400);
  }
  requireThat(
    url.protocol === 'https:' && !url.username && !url.password && !url.hash,
    'Use an HTTPS destination without credentials or a fragment.',
  );
  requireThat(
    Array.isArray(m.fields) && m.fields.length > 0 && m.fields.length <= 100,
    'Provide 1–100 fields.',
  );
  requireThat(
    m.fields.every(
      (f) =>
        f &&
        shortText(f.label, 300) &&
        typeof f.value === 'string' &&
        f.value.length <= 20000,
    ),
    'Invalid field label or value.',
  );
  requireThat(
    new Set(m.fields.map((f) => f.label)).size === m.fields.length,
    'Field labels must be unique.',
  );
  requireThat(
    Array.isArray(m.files) && m.files.length <= 2,
    'At most two files are allowed.',
  );
  for (const file of m.files) {
    requireThat(
      file &&
        shortText(file.name, 200) &&
        !/[\\/]/.test(file.name) &&
        Array.from(file.name).every((c) => c.charCodeAt(0) >= 32),
      'Invalid file name.',
    );
    requireThat(
      shortText(file.base64, 213336) &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          file.base64,
        ),
      'Invalid or oversized file.',
    );
    const binary = atob(file.base64);
    requireThat(
      btoa(binary) === file.base64 && binary.length <= 160000,
      'Invalid file encoding or size.',
    );
    requireThat(
      (await digest(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) ===
        file.sha256,
      'File checksum does not match its exact bytes.',
    );
  }
  const manifest = {
    destination: m.destination,
    fields: m.fields.map(({ label, value }) => ({ label, value })),
    files: m.files.map(({ name, base64, sha256 }) => ({
      name,
      base64,
      sha256,
    })),
  };
  requireThat(
    new TextEncoder().encode(JSON.stringify(manifest)).length <= 240000,
    'Submission exceeds 240,000 bytes.',
  );
  return manifest;
}
// Unknown questions require review. This allowlist does not verify truth: the
// agent still must use confirmed facts and pause on missing information.
export function requiresReview(manifest: SubmissionManifest) {
  const ordinary =
    /^(full name|first name|last name|email|phone|city|location|linkedin|github|website|portfolio|resume|cover letter)$/i;
  return manifest.fields.some((f) => !ordinary.test(f.label));
}
export async function loadApplicationPolicy(db: D1Database, owner: string) {
  return db
    .prepare('SELECT * FROM application_policies WHERE owner=?')
    .bind(owner)
    .first<ApplicationPolicy>();
}
export async function loadOperation(db: D1Database, owner: string, id: string) {
  const op = await db
    .prepare('SELECT * FROM application_operations WHERE owner=? AND id=?')
    .bind(owner, id)
    .first<ApplicationOperation>();
  requireThat(op, 'Application operation not found.', 404);
  return op;
}
export function emptyInspect(jobId: string): InspectView {
  return {
    job_id: jobId,
    destination: null,
    fields: [],
    files: [],
    missing: [],
    ready: false,
    armed: false,
    operation_id: null,
    digest: null,
    state: null,
    accept_enabled: false,
  };
}
export async function inspectApplication(
  db: D1Database,
  owner: string,
  jobId: string,
  now: string,
): Promise<InspectView> {
  requireThat(shortText(jobId, 100), 'A selected job is unavailable.', 404);
  const job = await db
    .prepare('SELECT status FROM jobs WHERE owner=? AND id=?')
    .bind(owner, jobId)
    .first<{ status: string }>();
  requireThat(job, 'A selected job is unavailable.', 404);
  const row = await db
    .prepare(
      `SELECT p.destination,p.fields,p.files,p.ready,p.armed_until,p.operation_id,o.digest,o.state
       FROM application_preparations p
       LEFT JOIN application_operations o ON o.owner=p.owner AND o.id=p.operation_id
       WHERE p.owner=? AND p.job_id=?`,
    )
    .bind(owner, jobId)
    .first<{
      destination: string;
      fields: string;
      files: string;
      ready: number;
      armed_until: string;
      operation_id: string | null;
      digest: string | null;
      state: string | null;
    }>();
  if (!row) return emptyInspect(jobId);
  const fields = JSON.parse(row.fields) as {
    label: string;
    value: string;
    unknown: boolean;
  }[];
  const files = JSON.parse(row.files) as { name: string; sha256: string }[];
  const ready = row.ready === 1;
  const armed = Date.parse(row.armed_until) > Date.parse(now);
  const state = row.state ?? null;
  return {
    job_id: jobId,
    destination: row.destination,
    fields: fields.map((f) => ({
      label: f.label,
      filled: f.value.length > 0,
      unknown: Boolean(f.unknown),
      value: f.value,
    })),
    files: files.map(({ name, sha256 }) => ({ name, sha256 })),
    missing: fields.filter((f) => f.unknown || !f.value).map((f) => f.label),
    ready,
    armed,
    operation_id: row.operation_id,
    digest: row.digest ?? null,
    state,
    accept_enabled:
      ready &&
      armed &&
      state === 'proposed' &&
      (job.status === 'Held' || job.status === 'Ready'),
  };
}
export async function upsertPreparation(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
  now: string,
): Promise<InspectView> {
  requireThat(
    shortText(input.job, 100) && shortText(input.actor, 100),
    'Supply job and agent name.',
  );
  const job = await db
    .prepare('SELECT version FROM jobs WHERE owner=? AND id=?')
    .bind(owner, input.job)
    .first<{ version: number }>();
  requireThat(job, 'A selected job is unavailable.', 404);
  requireThat(
    !(await db
      .prepare(
        "SELECT 1 FROM application_operations WHERE owner=? AND job_id=? AND state='executing'",
      )
      .bind(owner, input.job)
      .first()),
    'An application is already executing. Do not change the payload.',
    409,
  );
  requireThat(
    Array.isArray(input.fields) &&
      input.fields.every(
        (f) => f && typeof f === 'object' && typeof f.unknown === 'boolean',
      ),
    'Invalid field label or value.',
  );
  const manifest = await validateManifest({
    destination: input.destination,
    fields: input.fields.map(({ label, value }) => ({ label, value })),
    files: input.files,
  });
  const fields = input.fields.map(({ label, value, unknown }) => ({
    label,
    value,
    unknown,
  }));
  const fieldsJson = JSON.stringify(fields);
  const filesJson = JSON.stringify(manifest.files);
  requireThat(
    new TextEncoder().encode(fieldsJson).length +
      new TextEncoder().encode(filesJson).length <=
      240000,
    'Submission exceeds 240,000 bytes.',
  );
  await cancelPreBeginForJob(
    db,
    owner,
    input.job,
    now,
    await digest(JSON.stringify(manifest)),
  );
  await statement(
    db,
    `INSERT INTO application_preparations (owner,job_id,actor,job_version,destination,fields,files,operation_id,ready,armed_until,updated)
     VALUES (?,?,?,?,?,?,?,NULL,0,'',?)
     ON CONFLICT(owner,job_id) DO UPDATE SET
       actor=excluded.actor,
       job_version=excluded.job_version,
       destination=excluded.destination,
       fields=excluded.fields,
       files=excluded.files,
       operation_id=NULL,
       ready=0,
       armed_until='',
       updated=excluded.updated`,
    owner,
    input.job,
    input.actor,
    job.version,
    manifest.destination,
    fieldsJson,
    filesJson,
    now,
  ).run();
  return inspectApplication(db, owner, input.job, now);
}
export async function answerPreparation(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
  now: string,
): Promise<InspectView> {
  requireThat(shortText(input.job, 100), 'A selected job is unavailable.', 404);
  requireThat(shortText(input.label, 300), 'Invalid field label or value.');
  requireThat(shortText(input.value, 20000), 'Invalid field label or value.');
  const job = await db
    .prepare('SELECT version FROM jobs WHERE owner=? AND id=?')
    .bind(owner, input.job)
    .first<{ version: number }>();
  requireThat(job, 'A selected job is unavailable.', 404);
  requireThat(
    !(await db
      .prepare(
        "SELECT 1 FROM application_operations WHERE owner=? AND job_id=? AND state='executing'",
      )
      .bind(owner, input.job)
      .first()),
    'An application is already executing. Do not change the payload.',
    409,
  );
  const prep = await db
    .prepare(
      'SELECT destination,fields,files FROM application_preparations WHERE owner=? AND job_id=?',
    )
    .bind(owner, input.job)
    .first<{ destination: string; fields: string; files: string }>();
  requireThat(prep, 'Prepare a complete application first.', 409);
  const fields = JSON.parse(prep.fields) as {
    label: string;
    value: string;
    unknown: boolean;
  }[];
  const index = fields.findIndex((field) => field.label === input.label);
  requireThat(index >= 0, 'Invalid field label or value.');
  fields[index] = {
    label: fields[index].label,
    value: String(input.value),
    unknown: false,
  };
  const fieldsJson = JSON.stringify(fields);
  requireThat(
    new TextEncoder().encode(fieldsJson).length +
      new TextEncoder().encode(prep.files).length <=
      240000,
    'Submission exceeds 240,000 bytes.',
  );
  const manifest = await validateManifest({
    destination: prep.destination,
    fields: fields.map(({ label, value }) => ({ label, value })),
    files: JSON.parse(prep.files),
  });
  await cancelPreBeginForJob(
    db,
    owner,
    input.job,
    now,
    await digest(JSON.stringify(manifest)),
  );
  await statement(
    db,
    `UPDATE application_preparations SET
       fields=?,
       operation_id=NULL,
       ready=0,
       armed_until='',
       updated=?
     WHERE owner=? AND job_id=?`,
    fieldsJson,
    now,
    owner,
    input.job,
  ).run();
  return inspectApplication(db, owner, input.job, now);
}
export async function cancelPreBeginForJob(
  db: D1Database,
  owner: string,
  jobId: string,
  now: string,
  keepDigest?: string,
) {
  const leftovers = keepDigest
    ? await db
        .prepare(
          "SELECT id,digest FROM application_operations WHERE owner=? AND job_id=? AND state IN ('proposed','authorized') AND digest!=?",
        )
        .bind(owner, jobId, keepDigest)
        .all<{ id: string; digest: string }>()
    : await db
        .prepare(
          "SELECT id,digest FROM application_operations WHERE owner=? AND job_id=? AND state IN ('proposed','authorized')",
        )
        .bind(owner, jobId)
        .all<{ id: string; digest: string }>();
  for (const old of leftovers.results)
    await actOnApplication(
      db,
      owner,
      { id: old.id, digest: old.digest, action: 'cancel' },
      now,
    );
}
export async function armPreparation(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
  now: string,
): Promise<InspectView> {
  requireThat(
    shortText(input.job, 100) &&
      shortText(input.id, 100) &&
      shortText(input.actor, 100),
    'Supply job, operation ID and agent name.',
  );
  const prep = await db
    .prepare(
      'SELECT * FROM application_preparations WHERE owner=? AND job_id=?',
    )
    .bind(owner, input.job)
    .first<{
      actor: string;
      job_version: number;
      destination: string;
      fields: string;
      files: string;
      operation_id: string | null;
    }>();
  requireThat(prep, 'Prepare a complete application first.', 409);
  const fields = JSON.parse(prep.fields) as {
    label: string;
    value: string;
    unknown: boolean;
  }[];
  requireThat(
    fields.every((f) => f.value.length > 0 && f.unknown === false),
    'Provide the complete submission.',
  );
  const manifest = await validateManifest({
    destination: prep.destination,
    fields: fields.map(({ label, value }) => ({ label, value })),
    files: JSON.parse(prep.files),
  });
  const hash = await digest(JSON.stringify(manifest));
  const linked = prep.operation_id
    ? await db
        .prepare('SELECT * FROM application_operations WHERE owner=? AND id=?')
        .bind(owner, prep.operation_id)
        .first<ApplicationOperation>()
    : null;
  const liveFreeze =
    linked?.digest === hash &&
    (linked.state === 'proposed' || linked.state === 'authorized');
  let operationId = liveFreeze ? linked.id : null;
  if (!operationId) {
    const policy = await loadApplicationPolicy(db, owner);
    const jobRow = await db
      .prepare('SELECT url FROM jobs WHERE owner=? AND id=? AND version=?')
      .bind(owner, input.job, prep.job_version)
      .first<{ url: string }>();
    requireThat(
      !(
        policy?.review === 'sensitive' &&
        jobRow?.url === manifest.destination &&
        !requiresReview(manifest)
      ),
      'Inspect freeze requires review of every application.',
      409,
    );
    if (linked) {
      requireThat(
        linked.state !== 'executing' && linked.state !== 'submitted',
        'An application is already executing. Do not change the payload.',
        409,
      );
      if (linked.state === 'proposed' || linked.state === 'authorized')
        await actOnApplication(
          db,
          owner,
          { id: linked.id, digest: linked.digest, action: 'cancel' },
          now,
        );
    }
    const leftovers = await db
      .prepare(
        "SELECT id,digest FROM application_operations WHERE owner=? AND job_id=? AND state IN ('proposed','authorized') AND id!=?",
      )
      .bind(owner, input.job, input.id)
      .all<{ id: string; digest: string }>();
    for (const old of leftovers.results)
      await actOnApplication(
        db,
        owner,
        { id: old.id, digest: old.digest, action: 'cancel' },
        now,
      );
    const op = await proposeApplication(
      db,
      owner,
      {
        id: input.id,
        job: input.job,
        version: prep.job_version,
        actor: input.actor,
        manifest,
      },
      now,
    );
    if (op.state !== 'proposed') {
      if (op.state === 'authorized')
        await actOnApplication(
          db,
          owner,
          { id: op.id, digest: op.digest, action: 'cancel' },
          now,
        );
      requireThat(
        false,
        'Inspect freeze requires review of every application.',
        409,
      );
    }
    operationId = op.id;
  }
  await statement(
    db,
    `UPDATE application_preparations SET ready=1,armed_until=?,operation_id=?,updated=? WHERE owner=? AND job_id=?`,
    new Date(Date.parse(now) + 20_000).toISOString(),
    operationId,
    now,
    owner,
    input.job,
  ).run();
  return inspectApplication(db, owner, input.job, now);
}
function statement(
  db: D1Database,
  sql: string,
  ...values: (string | number | null)[]
) {
  return db.prepare(sql).bind(...values);
}
function event(
  db: D1Database,
  owner: string,
  job: string,
  id: string,
  kind: string,
  now: string,
  receipt?: string,
) {
  return statement(
    db,
    'INSERT INTO events (id,owner,job_id,kind,detail,created) SELECT ?,?,?,?,?,? WHERE changes()=1',
    crypto.randomUUID(),
    owner,
    job,
    kind,
    JSON.stringify({ operation: id, receipt }),
    now,
  );
}
export async function changeApplicationPolicy(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
  now: string,
) {
  requireThat(
    Number.isInteger(input.version) && Number(input.version) >= 0,
    'Supply the current policy version.',
  );
  requireThat(
    typeof input.enabled === 'boolean' &&
      ['all', 'sensitive'].includes(String(input.review)),
    'Choose an approval setting.',
  );
  requireThat(
    Array.isArray(input.jobs) &&
      input.jobs.length <= 100 &&
      input.jobs.every((id) => shortText(id, 100)),
    'Choose at most 100 saved jobs.',
  );
  const jobs = [...new Set(input.jobs as string[])];
  requireThat(
    !input.enabled || jobs.length > 0,
    'Choose jobs before enabling automation.',
  );
  requireThat(
    Number.isInteger(input.maximum) &&
      Number(input.maximum) >= 1 &&
      Number(input.maximum) <= 100,
    'Set a limit from 1 to 100 applications.',
  );
  requireThat(
    typeof input.expires === 'string' &&
      Number.isFinite(Date.parse(input.expires)) &&
      (!input.enabled ||
        (Date.parse(input.expires) > Date.parse(now) &&
          Date.parse(input.expires) <= Date.parse(now) + 30 * 86400000)),
    'Expiration must be within 30 days.',
  );
  for (const id of jobs)
    requireThat(
      await db
        .prepare('SELECT 1 FROM jobs WHERE owner=? AND id=?')
        .bind(owner, id)
        .first(),
      'A selected job is unavailable.',
      404,
    );
  const values = [
    Number(input.enabled),
    String(input.review),
    JSON.stringify(jobs),
    new Date(input.expires).toISOString(),
    Number(input.maximum),
    now,
  ] as const;
  const result =
    Number(input.version) === 0
      ? await statement(
          db,
          'INSERT INTO application_policies (owner,version,enabled,review,jobs,expires,maximum,updated) VALUES (?,1,?,?,?,?,?,?) ON CONFLICT(owner) DO NOTHING',
          owner,
          ...values,
        ).run()
      : await statement(
          db,
          'UPDATE application_policies SET version=version+1,enabled=?,review=?,jobs=?,expires=?,maximum=?,updated=? WHERE owner=? AND version=?',
          ...values,
          owner,
          Number(input.version),
        ).run();
  requireThat(
    result.meta.changes === 1,
    'Policy changed. Reload before saving.',
    409,
  );
  return loadApplicationPolicy(db, owner);
}
export async function proposeApplication(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
  now: string,
) {
  requireThat(
    shortText(input.id, 100) &&
      shortText(input.job, 100) &&
      shortText(input.actor, 100) &&
      Number.isInteger(input.version),
    'Supply operation ID, job, version and agent name.',
  );
  const manifest = JSON.stringify(await validateManifest(input.manifest));
  const hash = await digest(manifest);
  const prior = await db
    .prepare('SELECT * FROM application_operations WHERE owner=? AND id=?')
    .bind(owner, input.id)
    .first<ApplicationOperation>();
  if (prior) {
    requireThat(
      prior.digest === hash &&
        prior.job_id === input.job &&
        prior.job_version === input.version &&
        prior.actor === input.actor,
      'Operation ID already belongs to different content.',
      409,
    );
    return prior;
  }
  const policy = await loadApplicationPolicy(db, owner);
  requireThat(policy, 'Configure application permissions first.', 409);
  const job = await db
    .prepare('SELECT url FROM jobs WHERE owner=? AND id=? AND version=?')
    .bind(owner, input.job, input.version)
    .first<{ url: string }>();
  const authority =
    policy.review === 'sensitive' &&
    job?.url === JSON.parse(manifest).destination &&
    !requiresReview(JSON.parse(manifest))
      ? 'policy'
      : 'review-required';
  const result = await db.batch([
    statement(
      db,
      `INSERT INTO application_operations (id,owner,job_id,job_version,policy_version,policy_snapshot,actor,manifest,digest,state,authority,created,receipt)
      SELECT ?,?,?,?,?,?,?,?,?, ?,?,?,'' FROM jobs j JOIN application_policies p ON p.owner=j.owner
      WHERE j.owner=? AND j.id=? AND j.version=? AND j.status IN ('Held','Ready')
      AND p.version=? AND p.enabled=1 AND p.expires>? AND EXISTS (SELECT 1 FROM json_each(p.jobs) WHERE value=j.id)`,
      input.id,
      owner,
      input.job,
      Number(input.version),
      policy.version,
      JSON.stringify(policy),
      input.actor,
      manifest,
      hash,
      authority === 'policy' ? 'authorized' : 'proposed',
      authority,
      now,
      owner,
      input.job,
      Number(input.version),
      policy.version,
      now,
    ),
    event(db, owner, input.job, input.id, 'Application proposed', now),
  ]);
  requireThat(
    result[0].meta.changes === 1,
    'Job or permission changed, expired, or excludes this application.',
    409,
  );
  return loadOperation(db, owner, input.id);
}
export async function actOnApplication(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
  now: string,
) {
  requireThat(
    shortText(input.id, 100) && shortText(input.digest, 64),
    'Supply the operation and exact content checksum.',
  );
  const op = await loadOperation(db, owner, input.id);
  requireThat(
    op.digest === input.digest,
    'Content checksum differs from the saved proposal.',
    409,
  );
  let sql: string;
  let args: (string | number | null)[];
  let kind: string;
  const authorized = `EXISTS (SELECT 1 FROM application_policies p JOIN jobs j ON j.owner=p.owner
    WHERE p.owner=application_operations.owner AND p.version=application_operations.policy_version
    AND p.enabled=1 AND p.expires>? AND j.id=application_operations.job_id
    AND j.version=application_operations.job_version AND j.status IN ('Held','Ready') AND j.blocker=''
    AND EXISTS (SELECT 1 FROM json_each(p.jobs) WHERE value=j.id))`;
  if (input.action === 'approve') {
    sql = `UPDATE application_operations SET state='authorized',authority='explicit-review' WHERE owner=? AND id=? AND state='proposed' AND ${authorized}
      AND EXISTS (SELECT 1 FROM application_preparations pr WHERE pr.owner=application_operations.owner AND pr.job_id=application_operations.job_id AND pr.operation_id=application_operations.id AND pr.armed_until>?)`;
    args = [owner, op.id, now, now];
    kind = 'Application explicitly reviewed';
  } else if (input.action === 'begin') {
    sql = `UPDATE application_operations SET state='executing',started=? WHERE owner=? AND id=? AND state='authorized' AND ${authorized}
      AND (SELECT COUNT(*) FROM application_operations a WHERE a.owner=? AND a.started>=?)<10
      AND (SELECT COUNT(*) FROM application_operations a WHERE a.owner=? AND a.policy_version=? AND a.started IS NOT NULL)<(SELECT maximum FROM application_policies WHERE owner=?)
      AND NOT EXISTS (SELECT 1 FROM application_operations a WHERE a.owner=application_operations.owner AND a.state='executing')
      AND NOT EXISTS (SELECT 1 FROM application_operations a WHERE a.owner=? AND a.job_id=? AND a.started IS NOT NULL AND a.state<>'not-submitted')`;
    args = [
      now,
      owner,
      op.id,
      now,
      owner,
      now.slice(0, 10),
      owner,
      op.policy_version,
      owner,
      owner,
      op.job_id,
    ];
    kind = 'Application execution started';
  } else if (input.action === 'cancel') {
    sql =
      "UPDATE application_operations SET state='cancelled',finished=? WHERE owner=? AND id=? AND state IN ('proposed','authorized')";
    args = [now, owner, op.id];
    kind = 'Application cancelled';
  } else if (
    ['complete', 'uncertain', 'not-submitted'].includes(String(input.action))
  ) {
    requireThat(
      shortText(input.receipt, 10000),
      'Record the employer confirmation or reason for uncertainty.',
    );
    sql = `UPDATE application_operations SET state=?,receipt=?,finished=? WHERE owner=? AND id=? AND ${input.action === 'uncertain' ? "state='executing'" : "state IN ('executing','uncertain')"}`;
    args = [
      input.action === 'complete' ? 'submitted' : String(input.action),
      input.receipt,
      now,
      owner,
      op.id,
    ];
    kind =
      input.action === 'complete'
        ? 'Application submission reported'
        : input.action === 'not-submitted'
          ? 'Application confirmed not submitted'
          : 'Application outcome uncertain';
    // Do not silently rewrite previously recorded evidence.
    requireThat(
      op.state !== 'uncertain' || input.action !== 'uncertain',
      'Inspect the uncertain result before recording an employer confirmation.',
      409,
    );
  } else throw new ApplicationRefusal('Unknown application action.', 400);
  const statements = [
    statement(db, sql, ...args),
    event(
      db,
      owner,
      op.job_id,
      op.id,
      kind,
      now,
      typeof input.receipt === 'string' ? input.receipt : undefined,
    ),
  ];
  if (input.action === 'complete')
    statements.push(
      statement(
        db,
        "UPDATE jobs SET status=CASE WHEN status IN ('Held','Ready') THEN 'Submitted' ELSE status END,receipt=CASE WHEN status IN ('Held','Ready') THEN ? ELSE COALESCE(receipt,?) END,version=version+1,updated=? WHERE changes()=1 AND owner=? AND id=?",
        String(input.receipt),
        String(input.receipt),
        now,
        owner,
        op.job_id,
      ),
    );
  if (input.action === 'complete')
    statements.push(
      statement(
        db,
        "INSERT INTO outcomes (id,owner,job_id,kind,detail,receipt,occurred,created) SELECT ?,?,?,'submitted',?,?,?,? WHERE changes()=1",
        crypto.randomUUID(),
        owner,
        op.job_id,
        `Application operation ${op.id}`,
        String(input.receipt),
        now,
        now,
      ),
    );
  const result = await db.batch(statements);
  requireThat(
    result[0].meta.changes === 1,
    input.action === 'approve'
      ? 'Operative is not on the page.'
      : 'No permission issued. State, policy, job version or capacity changed. Inspect the saved operation; never repeat an employer submission.',
    409,
  );
  return {
    operation: await loadOperation(db, owner, op.id),
    execute: input.action === 'begin' || undefined,
  };
}
