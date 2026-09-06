import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
// The one place anything talks to the Relay API. The CLI uses it today and an
// MCP server will use it later; sharing it is what stops two transports from
// drifting into two subtly different sets of rules.

// Exit codes are the contract an unattended agent relies on. The distinction
// that matters is 3 against 4: a domain refusal means fix the input, a server
// failure means try again. An agent that confuses them will retry a refused
// draft until some phrasing slips past the citation gate, which turns a safety
// check into an obstacle to route around.
export const EXIT = {
  ok: 0,
  usage: 1,
  auth: 2,
  refused: 3,
  server: 4,
  empty: 5,
};
export class RelayError extends Error {
  constructor(message, code = EXIT.server, detail = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}
export const SESSION_FILE = 'private-data/.session';
export function baseUrl() {
  const base = process.env.RELAY_URL || 'http://localhost:3000';
  let host;
  try {
    host = new URL(base).hostname;
  } catch {
    throw new RelayError(`RELAY_URL is not a valid URL: ${base}`, EXIT.usage);
  }
  // Local-only, deliberately. Production identity comes from a trusted gateway
  // the CLI cannot present, so there is nothing safe to point this at yet.
  if (!['localhost', '127.0.0.1'].includes(host))
    throw new RelayError(
      'The Relay CLI is local-only. It has no way to authenticate against a deployment.',
      EXIT.usage,
    );
  return base.replace(/\/$/, '');
}
export async function readSession() {
  try {
    const raw = await readFile(SESSION_FILE, 'utf8');
    return raw.trim() || null;
  } catch {
    return null;
  }
}
export async function login(fetchImpl = fetch) {
  const response = await fetchImpl(
    `${baseUrl()}/signin-with-chatgpt?return_to=/`,
    { redirect: 'manual' },
  );
  const cookie = response.headers.get('set-cookie');
  if (!cookie)
    throw new RelayError(
      'The development sign-in returned no session. Is `pnpm dev` running?',
      EXIT.auth,
    );
  const session = cookie.split(';')[0];
  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, session + '\n', { mode: 0o600 });
  return session;
}
// HTTP status to exit code. 403 is included with the refusals because the only
// way to provoke it is sending a request the server considers malformed.
export function exitFor(status) {
  if (status === 401) return EXIT.auth;
  if ([400, 403, 404, 409, 413].includes(status)) return EXIT.refused;
  if (status >= 500) return EXIT.server;
  return EXIT.ok;
}
export async function request(path, body, { fetchImpl = fetch, session } = {}) {
  // `undefined` means look one up; `null` means the caller knows there is none.
  // Keeping those distinct stops behaviour depending on whatever happens to be
  // on disk.
  const cookie = session === undefined ? await readSession() : session;
  if (!cookie)
    throw new RelayError('Not signed in. Run `relay login` first.', EXIT.auth);
  let response;
  try {
    response = await fetchImpl(baseUrl() + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        cookie,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new RelayError(
      `Could not reach Relay at ${baseUrl()}: ${error.message}`,
      EXIT.server,
    );
  }
  if (response.status === 401)
    throw new RelayError('Not signed in. Run `relay login` first.', EXIT.auth);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new RelayError(
      `Relay returned a non-JSON response (HTTP ${response.status}).`,
      EXIT.server,
    );
  }
  if (!response.ok)
    throw new RelayError(
      data?.error || `Relay returned HTTP ${response.status}.`,
      exitFor(response.status),
      data,
    );
  return data;
}
