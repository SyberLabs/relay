// Save the reviewed job and its cancellation evidence as one owner/version-bound write.
export async function saveJobReview(
  db: D1Database,
  owner: string,
  input: {
    id: string;
    version: number;
    draft: string;
    blocker: string;
    status: string;
  },
  now: string,
) {
  const savedEvent = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        `UPDATE jobs SET drafting_direction=CASE WHEN blocker=? THEN drafting_direction ELSE '' END,
       draft=?,blocker=?,status=?,accepted_draft=?,version=version+1,updated=?
       WHERE id=? AND owner=? AND version=?
       AND (?!='Skip' OR NOT EXISTS (SELECT 1 FROM application_operations a
         WHERE a.owner=jobs.owner AND a.job_id=jobs.id AND a.state IN ('executing','uncertain')))`,
      )
      .bind(
        input.blocker,
        input.draft,
        input.blocker,
        input.status,
        input.status === 'Ready' ? input.draft : null,
        now,
        input.id,
        owner,
        input.version,
        input.status,
      ),
    db
      .prepare(
        `INSERT INTO events (id,owner,job_id,kind,detail,created) SELECT ?,?,?,?,?,?
       WHERE changes()=1 AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner=? AND version=? AND updated=?)`,
      )
      .bind(
        savedEvent,
        owner,
        input.id,
        input.status === 'Ready' ? 'Draft accepted' : 'Review saved',
        JSON.stringify({
          status: input.status,
          draft: input.draft,
          blocker: input.blocker,
        }),
        now,
        input.id,
        owner,
        input.version + 1,
        now,
      ),
  ];
  if (input.status === 'Skip') {
    const cancelledEvent = crypto.randomUUID() + ':';
    statements.push(
      db
        .prepare(
          `INSERT INTO events (id,owner,job_id,kind,detail,created)
         SELECT ? || a.id,a.owner,a.job_id,'Application cancelled',json_object('operation',a.id),?
         FROM application_operations a WHERE a.owner=? AND a.job_id=? AND a.state IN ('proposed','authorized')
         AND EXISTS (SELECT 1 FROM events e WHERE e.id=? AND e.owner=a.owner AND e.job_id=a.job_id)`,
        )
        .bind(cancelledEvent, now, owner, input.id, savedEvent),
      db
        .prepare(
          `UPDATE application_operations SET state='cancelled',finished=?
         WHERE owner=? AND job_id=? AND state IN ('proposed','authorized')
         AND EXISTS (SELECT 1 FROM events e WHERE e.id=? || application_operations.id AND e.owner=application_operations.owner AND e.job_id=application_operations.job_id)`,
        )
        .bind(now, owner, input.id, cancelledEvent),
    );
  }
  return (await db.batch(statements))[0].meta.changes === 1;
}
