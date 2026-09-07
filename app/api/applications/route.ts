import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { refuseUntrustedOrigin } from '../../../lib/request-origin';
import {
  ApplicationRefusal,
  actOnApplication,
  changeApplicationPolicy,
  emptyInspect,
  inspectApplication,
  loadApplicationPolicy,
  loadOperation,
  proposeApplication,
  upsertPreparation,
} from '../../../lib/application-automation';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const viewer = (await getChatGPTUser())?.userId;
  if (!viewer) return reply({ error: 'Sign in to open applications.' }, 401);
  const db = database(),
    url = new URL(request.url);
  try {
    const id = url.searchParams.get('id');
    if (id)
      return reply({ viewer, operation: await loadOperation(db, viewer, id) });
    const job = url.searchParams.get('job');
    if (job) {
      try {
        return reply({
          viewer,
          ...(await inspectApplication(
            db,
            viewer,
            job,
            new Date().toISOString(),
          )),
        });
      } catch (e) {
        if (e instanceof ApplicationRefusal && e.status === 404)
          return reply({ viewer, ...emptyInspect(job) }, 404);
        throw e;
      }
    }
    const cursor = url.searchParams.get('after') || '';
    if (cursor.length > 100)
      return reply({ error: 'Invalid page cursor.' }, 400);
    const [policy, jobs, operations] = await Promise.all([
      loadApplicationPolicy(db, viewer),
      db
        .prepare(
          'SELECT id,name,url,status,version FROM jobs WHERE owner=? ORDER BY name LIMIT 500',
        )
        .bind(viewer)
        .all(),
      db
        .prepare(
          'SELECT id,job_id,state,authority,actor,created,started,finished,receipt,digest FROM application_operations WHERE owner=? AND id>? ORDER BY id LIMIT 21',
        )
        .bind(viewer, cursor)
        .all<{ id: string }>(),
    ]);
    return reply({
      viewer,
      policy,
      jobs: jobs.results,
      operations: operations.results.slice(0, 20),
      next: operations.results.length > 20 ? operations.results[19].id : null,
    });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof ApplicationRefusal
            ? e.message
            : 'Application history is unavailable.',
      },
      e instanceof ApplicationRefusal ? e.status : 503,
    );
  }
}
export async function POST(request: Request) {
  const viewer = (await getChatGPTUser())?.userId;
  if (!viewer) return reply({ error: 'Sign in first.' }, 401);
  const denied = await refuseUntrustedOrigin(request);
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 248000)
      return reply({ error: 'Request is too large.' }, 413);
    const b = JSON.parse(raw);
    if (!b || typeof b !== 'object' || b.viewer !== viewer)
      return reply(
        { error: 'This work belongs to a different session. Reload.' },
        409,
      );
    const db = database(),
      now = new Date().toISOString();
    if (b.action === 'policy')
      return reply({
        viewer,
        policy: await changeApplicationPolicy(db, viewer, b, now),
      });
    if (b.action === 'propose')
      return reply({
        viewer,
        operation: await proposeApplication(db, viewer, b, now),
      });
    if (b.action === 'prepare')
      return reply({
        viewer,
        ...(await upsertPreparation(db, viewer, b, now)),
      });
    return reply({ viewer, ...(await actOnApplication(db, viewer, b, now)) });
  } catch (e) {
    if (e instanceof ApplicationRefusal)
      return reply({ error: e.message }, e.status);
    if (e instanceof SyntaxError)
      return reply({ error: 'Invalid request.' }, 400);
    return reply(
      {
        error:
          'Application work could not be confirmed. Inspect saved history before continuing; do not retry employer submission.',
      },
      503,
    );
  }
}
