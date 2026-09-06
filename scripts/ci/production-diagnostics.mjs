import { spawn } from 'node:child_process';

const BODY_BYTE_LIMIT = 2048;
const BODY_READ_TIMEOUT_MS = 2_000;
const RESPONSE_METADATA_NAMES = ['content-type', 'retry-after'];

const JWT_SHAPE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function processSnapshot(child) {
  return {
    pid: child?.pid ?? null,
    exitCode: child?.exitCode ?? null,
    signal: child?.signalCode ?? null,
  };
}

function selectedResponseMetadata(headers) {
  const selected = {};
  if (!headers) return selected;
  for (const name of RESPONSE_METADATA_NAMES) {
    const value =
      typeof headers.get === 'function' ? headers.get(name) : headers[name];
    if (value) selected[name] = String(value);
  }
  return selected;
}

function redactAuthenticationJwts(text) {
  return String(text ?? '').replace(JWT_SHAPE, '[redacted-jwt]');
}

export async function readBoundedBody(
  response,
  { byteLimit = BODY_BYTE_LIMIT, timeoutMs = BODY_READ_TIMEOUT_MS } = {},
) {
  const empty = { text: '', bytes: 0, truncated: false, timedOut: false };
  if (!response?.body || typeof response.body.getReader !== 'function') {
    return empty;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  let timedOut = false;
  let timeoutId;
  const expired = new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs);
  });
  try {
    while (bytes < byteLimit && !timedOut) {
      const outcome = await Promise.race([
        reader.read().then((chunk) => ({ kind: 'chunk', chunk })),
        expired.then(() => ({ kind: 'timeout' })),
      ]);
      if (outcome.kind === 'timeout') {
        timedOut = true;
        break;
      }
      const { done, value } = outcome.chunk;
      if (done) break;
      if (!value) continue;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const room = byteLimit - bytes;
      if (chunk.byteLength > room) {
        chunks.push(chunk.subarray(0, room));
        bytes += room;
        truncated = true;
        break;
      }
      chunks.push(chunk);
      bytes += chunk.byteLength;
    }
  } finally {
    const cancel = Promise.resolve(reader.cancel()).catch(() => {});
    await Promise.race([cancel, expired]);
    clearTimeout(timeoutId);
  }
  return {
    text: Buffer.concat(chunks.map((part) => Buffer.from(part))).toString(
      'utf8',
    ),
    bytes,
    truncated,
    timedOut,
  };
}

export function describeUnexpectedResponse({
  operation,
  status,
  body,
  truncated = false,
  timedOut = false,
  bodyBytes,
  headers,
  processState,
}) {
  const meta = selectedResponseMetadata(headers);
  const state = processState ?? {};
  const safeBody = redactAuthenticationJwts(body);
  const flags = `${truncated ? ' truncated' : ''}${timedOut ? ' timed-out' : ''}`;
  const lines = [
    '=== unexpected response ===',
    `operation: ${operation}`,
    `status: ${status}`,
  ];
  for (const name of RESPONSE_METADATA_NAMES) {
    if (meta[name]) lines.push(`${name}: ${meta[name]}`);
  }
  lines.push(
    `body-bytes: ${bodyBytes ?? Buffer.byteLength(String(body ?? ''))}${flags}`,
  );
  lines.push('body:');
  lines.push(safeBody);
  lines.push(
    `process: pid=${state.pid ?? null} exit=${state.exitCode ?? null} signal=${state.signal ?? null}`,
  );
  lines.push('=== end unexpected response ===');
  return `${lines.join('\n')}\n`;
}

function stdioOpen(server) {
  return [server?.stdout, server?.stderr].some(
    (stream) => stream && !stream.destroyed && !stream.readableEnded,
  );
}

function waitForClose(server, timeoutMs) {
  if (!server) return Promise.resolve();
  if (
    !stdioOpen(server) &&
    (server.exitCode !== null || server.signalCode !== null)
  ) {
    return Promise.resolve();
  }
  return new Promise((accept) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      accept();
    };
    const timer = setTimeout(done, timeoutMs);
    server.once('close', done);
    if (
      !stdioOpen(server) &&
      (server.exitCode !== null || server.signalCode !== null)
    ) {
      done();
    }
  });
}

async function signalGroup(server, posixSignal) {
  if (!server?.pid) return;
  if (process.platform === 'win32') {
    await new Promise((accept) => {
      const stop = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      stop.on('exit', accept);
      stop.on('error', accept);
    });
    return;
  }
  try {
    process.kill(-server.pid, posixSignal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      console.error('Unable to stop test worker:', error);
      process.exitCode = 1;
    }
  }
}

export async function finishProductionServer(
  server,
  log,
  { timeoutMs = 5_000 } = {},
) {
  const closed = waitForClose(server, timeoutMs);
  await signalGroup(server, 'SIGTERM');
  await closed;
  if (server?.pid && stdioOpen(server)) {
    const last = waitForClose(server, timeoutMs);
    await signalGroup(server, 'SIGKILL');
    await last;
  }
  if (log && !log.writableEnded) {
    await new Promise((accept, reject) => {
      log.once('finish', accept);
      log.once('error', reject);
      log.end();
    });
  }
}
