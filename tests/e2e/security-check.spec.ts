import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { captchaPage } from '../../deploy/captcha.mjs';
import { principalKey } from '../../deploy/security.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  return {
    sqlite,
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return {
        bind(owner: string, expires: number) {
          return {
            async run() {
              return statement.run(owner, expires);
            },
          };
        },
      };
    },
  };
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function toRequest(req: IncomingMessage, body: Buffer, port: number) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'host' || value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('oai-authenticated-user-id', 'cloudflare:alice');
  return new Request(`http://127.0.0.1:${port}${req.url}`, {
    method: req.method,
    headers,
    body:
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : new Uint8Array(body),
  });
}

async function startCheckServer(env: {
  DB: ReturnType<typeof database>;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_HOSTNAME: string;
}) {
  const posts: Array<{ origin: string | null; referer: string | null }> = [];
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const address = server.address();
        const port = address && typeof address !== 'string' ? address.port : 0;
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        if (url.pathname !== '/security/check') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('ok');
          return;
        }
        const request = toRequest(req, await readBody(req), port);
        if (req.method === 'POST') {
          posts.push({
            origin: request.headers.get('origin'),
            referer: request.headers.get('referer'),
          });
        }
        const response = await captchaPage(request, env);
        const bytes = Buffer.from(await response.arrayBuffer());
        res.writeHead(
          response.status,
          Object.fromEntries(response.headers.entries()),
        );
        res.end(bytes);
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(error instanceof Error ? error.message : 'error');
      }
    },
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('expected TCP port');
  return {
    base: `http://127.0.0.1:${address.port}`,
    posts,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test('ordinary browser Continue stores owner-bound clearance', async ({
  page,
}) => {
  const db = database();
  const env = {
    DB: db,
    TURNSTILE_SITE_KEY: 'fictional-site-key',
    TURNSTILE_SECRET_KEY: 'fictional-secret',
    TURNSTILE_HOSTNAME: '127.0.0.1',
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    expect(input).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect(
      init?.body instanceof URLSearchParams && init.body.get('response'),
    ).toBe('browser-form-token');
    return Response.json({
      success: true,
      hostname: '127.0.0.1',
      action: 'relay_write',
    });
  };
  const server = await startCheckServer(env);
  try {
    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({ status: 204, body: '' }),
    );
    const rendered = await page.goto(`${server.base}/security/check`);
    await page.locator('form').evaluate((form) => {
      const input = document.createElement('input');
      input.name = 'cf-turnstile-response';
      input.value = 'browser-form-token';
      form.appendChild(input);
    });
    const posted = page.waitForResponse(
      (response) =>
        response.url().includes('/security/check') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Continue' }).click();
    const response = await posted;
    expect(response.request().headers()['origin']).toBe(server.base);
    expect(server.posts).toEqual([
      { origin: server.base, referer: `${server.base}/security/check` },
    ]);
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/');
    expect(rendered?.headers()['referrer-policy']).toBe('same-origin');
    const owner = await principalKey(
      new Request(`${server.base}/security/check`, {
        headers: { 'oai-authenticated-user-id': 'cloudflare:alice' },
      }),
    );
    const rows = db.sqlite.prepare('SELECT * FROM security_clearances').all();
    expect(rows).toHaveLength(1);
    expect(rows[0].owner).toBe(owner);
    expect(rows[0].expires).toBeGreaterThan(Date.now());
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
    db.sqlite.close();
  }
});
