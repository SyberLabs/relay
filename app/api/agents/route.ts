import { getChatGPTUser } from '../../chatgpt-auth';
import { database } from '../../../lib/database';
import { refuseUntrustedOrigin } from '../../../lib/request-origin';
import { AgentRuntimeRefusal } from '../../../lib/agent-runtime';
import {
  answerAgentSession,
  cancelAgentSession,
  continueAgentSession,
  getAgentSession,
  startAgentSession,
  syncAgentSession,
  agentPublicMode,
} from '../../../lib/agent-runtime-control';
import { env } from 'cloudflare:workers';
import type { AgentAdmissionEnv } from '../../../lib/agent-runtime-admission';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function admission(): AgentAdmissionEnv {
  return env as unknown as AgentAdmissionEnv;
}

export async function GET(request: Request) {
  const viewer = (await getChatGPTUser())?.userId;
  if (!viewer)
    return reply({ error: 'Sign in to open the agent session.' }, 401);
  const db = database();
  const url = new URL(request.url);
  const job = url.searchParams.get('job');
  if (!job) return reply({ error: 'Select a job.' }, 400);
  try {
    const { session } = await getAgentSession(
      db,
      viewer,
      job,
      admission(),
      new Date().toISOString(),
    );
    return reply({
      viewer,
      mode: agentPublicMode(admission()),
      session,
    });
  } catch (e) {
    return reply(
      {
        error:
          e instanceof AgentRuntimeRefusal
            ? e.message
            : 'Agent session is unavailable.',
      },
      e instanceof AgentRuntimeRefusal ? e.status : 503,
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
    const db = database();
    const now = new Date().toISOString();
    const envVars = admission();
    if (b.action === 'start')
      return reply({
        viewer,
        mode: agentPublicMode(envVars),
        session: await startAgentSession(db, viewer, b, envVars, now),
      });
    if (b.action === 'answer')
      return reply({
        viewer,
        mode: agentPublicMode(envVars),
        session: await answerAgentSession(db, viewer, b, envVars, now),
      });
    if (b.action === 'continue')
      return reply({
        viewer,
        mode: agentPublicMode(envVars),
        session: await continueAgentSession(db, viewer, b, envVars, now),
      });
    if (b.action === 'sync')
      return reply({
        viewer,
        mode: agentPublicMode(envVars),
        session: await syncAgentSession(db, viewer, b, envVars, now),
      });
    if (b.action === 'cancel')
      return reply({
        viewer,
        mode: agentPublicMode(envVars),
        session: await cancelAgentSession(db, viewer, b, envVars, now),
      });
    if (
      b.action === 'approve' ||
      b.action === 'begin' ||
      b.action === 'verify' ||
      b.action === 'authorize_send'
    )
      return reply({ error: 'That action is not an agent capability.' }, 403);
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    if (e instanceof AgentRuntimeRefusal)
      return reply({ error: e.message }, e.status);
    if (e instanceof SyntaxError)
      return reply({ error: 'Invalid request.' }, 400);
    return reply({ error: 'Agent work could not be confirmed.' }, 503);
  }
}
