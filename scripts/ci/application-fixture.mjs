import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export async function verifyApplicationGateway({
  base,
  token,
  workspace,
  expectStatus,
}) {
  const owner = await token('application-fixture'),
    other = await token('application-other');
  const call = (jwt, body, suffix = '', extra = {}) =>
    fetch(`${base}/api/applications${suffix}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}),
        'content-type': 'application/json',
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  await expectStatus(
    await workspace(owner, {
      action: 'import',
      rows: [
        {
          Name: 'Fictional application fixture',
          Job: 'https://example.com/jobs/application-fixture',
          url: 'https://example.com/research/application-fixture',
          Status: 'Held',
          Notes: 'Fictional scout evidence',
        },
      ],
    }),
    200,
    'application scout import',
  );
  const initial = await (await call(owner)).json(),
    job = initial.jobs[0];
  const body = {
    action: 'policy',
    viewer: initial.viewer,
    version: 0,
    enabled: true,
    review: 'sensitive',
    jobs: [job.id],
    expires: new Date(Date.now() + 86400000).toISOString(),
    maximum: 2,
  };
  await expectStatus(
    await call(null, body),
    401,
    'anonymous application permissions',
  );
  await expectStatus(
    await call(other, body),
    409,
    'cross-owner application permissions',
  );
  await expectStatus(
    await call(owner, body, '', { origin: 'https://untrusted.example' }),
    403,
    'foreign-origin application permissions',
  );
  assert.deepEqual(await (await call(owner)).json(), initial);
  await expectStatus(await call(owner, body), 200, 'application permissions');
  const bytes = Buffer.alloc(148000, 65);
  const proposed = {
    action: 'propose',
    viewer: initial.viewer,
    id: 'production-application-fixture',
    job: job.id,
    version: job.version,
    actor: 'Fictional applying agent',
    manifest: {
      destination: job.url,
      fields: [{ label: 'Full name', value: 'Avery Example' }],
      files: [
        {
          name: 'fictional-resume.txt',
          base64: bytes.toString('base64'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
    },
  };
  const response = await expectStatus(
    await call(owner, proposed),
    200,
    '148KB application through compiled gateway',
  );
  const { operation } = await response.json();
  await expectStatus(
    await call(other, undefined, `?id=${operation.id}`),
    404,
    'cross-owner evidence read',
  );
  const start = {
    action: 'begin',
    viewer: initial.viewer,
    id: operation.id,
    digest: operation.digest,
  };
  const competing = await Promise.all([call(owner, start), call(owner, start)]);
  assert.deepEqual(competing.map((r) => r.status).sort((a, b) => a - b), [200, 409]);
  const uncertain = await Promise.all([
    call(owner, {
      ...start,
      action: 'uncertain',
      receipt: 'Fictional observation A',
    }),
    call(owner, {
      ...start,
      action: 'uncertain',
      receipt: 'Fictional observation B',
    }),
  ]);
  assert.deepEqual(uncertain.map((r) => r.status).sort((a, b) => a - b), [200, 409]);
  const observed = await (
    await call(owner, undefined, `?id=${operation.id}`)
  ).json();
  assert.equal(observed.operation.state, 'uncertain');
  assert.deepEqual(
    Buffer.from(
      JSON.parse(observed.operation.manifest).files[0].base64,
      'base64',
    ),
    bytes,
  );
  await expectStatus(
    await call(owner, start),
    409,
    'uncertain application cannot restart',
  );
  await expectStatus(
    await call(owner, {
      ...start,
      action: 'complete',
      receipt: 'Observed fictional employer confirmation ABC',
    }),
    200,
    'application confirmation',
  );
  const saved = await (await workspace(owner)).json();
  assert.equal(saved.jobs[0].status, 'Submitted');
  assert.equal(saved.jobs[0].accepted_draft, null);
  assert.equal(
    saved.events.filter((e) => e.kind === 'Application outcome uncertain')
      .length,
    1,
  );
  console.log(
    'PASS: compiled application gateway, 148KB exact file, owner/origin refusal, concurrent single permit and uncertainty report, persisted confirmation.',
  );
}
