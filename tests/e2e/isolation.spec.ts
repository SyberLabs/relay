import { expect, test, type Page } from '@playwright/test';

// Two independently signed-in browser sessions against the production Access
// gateway. Identities are the same RS256 JWTs run-production.mjs already
// mints. This is not a third identity stack. Sites mock remains single-user.
const jwtA = process.env.RELAY_OWNER_A_JWT;
const jwtB = process.env.RELAY_OWNER_B_JWT;
const baseURL = process.env.RELAY_TEST_URL || 'http://127.0.0.1:4173';

const ownerARow = {
  url: 'https://example.com/research/browser-owner-a',
  Name: 'Willow Example — Isolation Owner A',
  Job: 'https://example.com/jobs/browser-owner-a',
  Status: 'Held',
  Notes: 'Fictional owner-a browser note that must not appear for owner-b.',
};
const ownerBRow = {
  url: 'https://example.com/research/browser-owner-b',
  Name: 'Maple Example — Isolation Owner B',
  Job: 'https://example.com/jobs/browser-owner-b',
  Status: 'Held',
  Notes: 'Fictional owner-b browser note that must not appear for owner-a.',
};

async function importResearch(page: Page, row: typeof ownerARow) {
  // After a successful import the panel stays open and the JSON editor
  // collapses. Clicking Import research would toggle it closed.
  const panel = page.getByRole('heading', { name: 'Import research' });
  if (!(await panel.isVisible())) {
    await page
      .getByRole('button', { name: 'Import research', exact: true })
      .click();
  }
  await expect(panel).toBeVisible();
  const json = page.getByRole('textbox', { name: 'Research JSON' });
  if (!(await json.isVisible())) {
    await page.getByText('Paste or edit import data').click();
  }
  await json.fill(JSON.stringify([row]));
  await expect(
    page.getByRole('button', { name: 'Import into workspace' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Preview matches' }).click();
  // Do not wait on leftover Preview complete copy from an earlier import.
  await expect(
    page.getByRole('button', { name: 'Import into workspace' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Import into workspace' }).click();
  await expect(page.getByText('Workspace updated.')).toBeVisible();
}

test('two independently signed-in accounts cannot read, edit, import into, or enumerate each other', async ({
  browser,
}) => {
  if (!jwtA || !jwtB) {
    throw new Error(
      'RELAY_OWNER_A_JWT and RELAY_OWNER_B_JWT are required. run-production.mjs supplies them.',
    );
  }

  const contextA = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': jwtA },
  });
  const contextB = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'Cf-Access-Jwt-Assertion': jwtB },
  });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errors: string[] = [];
  pageA.on('pageerror', (error) => errors.push(`A: ${error.message}`));
  pageB.on('pageerror', (error) => errors.push(`B: ${error.message}`));

  try {
    await pageA.goto('/');
    await expect(
      pageA.getByRole('heading', { name: 'Make your next move.' }),
    ).toBeVisible();
    await expect(pageA.getByText('Opening your workspace…')).toHaveCount(0);
    await expect(
      pageA.getByRole('link', { name: 'Sign in with ChatGPT' }),
    ).toHaveCount(0);

    await pageB.goto('/');
    await expect(
      pageB.getByRole('heading', { name: 'Make your next move.' }),
    ).toBeVisible();
    await expect(pageB.getByText('Opening your workspace…')).toHaveCount(0);
    await expect(
      pageB.getByRole('link', { name: 'Sign in with ChatGPT' }),
    ).toHaveCount(0);

    await importResearch(pageA, ownerARow);
    await importResearch(pageB, ownerBRow);
    await pageB.reload();
    await expect(
      pageB.getByRole('heading', { name: 'Make your next move.' }),
    ).toBeVisible();
    await expect(pageB.getByText('Opening your workspace…')).toHaveCount(0);
    await importResearch(pageB, {
      url: 'https://example.com/research/browser-owner-b-into-a',
      Name: 'Maple Example — Isolation Collision',
      Job: ownerARow.Job,
      Status: 'Held',
      Notes: 'Fictional colliding import that must not attach to owner-a.',
    });

    await pageA.getByRole('button', { name: /All opportunities/ }).click();
    await expect(
      pageA.getByRole('button', { name: /Willow Example — Isolation Owner A/ }),
    ).toBeVisible();
    await expect(
      pageA.getByText('Maple Example — Isolation Owner B'),
    ).toHaveCount(0);
    await expect(
      pageA.getByText('Northstar Example — Isolation Engineer'),
    ).toHaveCount(0);
    await expect(
      pageA.getByText('Maple Example — Isolation Collision'),
    ).toHaveCount(0);
    await expect(
      pageA.getByText(
        'Fictional colliding import that must not attach to owner-a.',
      ),
    ).toHaveCount(0);

    await pageB.getByRole('button', { name: /All opportunities/ }).click();
    await expect(
      pageB.getByRole('button', { name: /Maple Example — Isolation Owner B/ }),
    ).toBeVisible();
    await expect(
      pageB.getByRole('button', {
        name: /Maple Example — Isolation Collision/,
      }),
    ).toBeVisible();
    await expect(
      pageB.getByText('Willow Example — Isolation Owner A'),
    ).toHaveCount(0);
    await expect(
      pageB.getByText('Harbor Example — Platform Engineer'),
    ).toHaveCount(0);
    await expect(
      pageB.getByText(
        'Fictional owner-a browser note that must not appear for owner-b.',
      ),
    ).toHaveCount(0);

    const aGet = await pageA.request.get('/api/workspace');
    const bGet = await pageB.request.get('/api/workspace');
    expect(aGet.status()).toBe(200);
    expect(bGet.status()).toBe(200);
    const ownerA = await aGet.json();
    const ownerB = await bGet.json();
    const jobA = ownerA.jobs.find(
      (job: {
        id: string;
        version: number;
        job_key: string;
        name: string;
        status: string;
        draft: string;
      }) => job.job_key === ownerARow.Job,
    );
    const jobB = ownerB.jobs.find(
      (job: {
        id: string;
        version: number;
        job_key: string;
        name: string;
        status: string;
        draft: string;
      }) => job.job_key === ownerBRow.Job,
    );
    if (!jobA || !jobB) {
      throw new Error(
        'Each signed-in session must retain its own imported job',
      );
    }
    expect(jobA.name).toContain('Willow Example — Isolation Owner A');
    expect(ownerA.jobs.some((job: { id: string }) => job.id === jobB.id)).toBe(
      false,
    );
    expect(
      ownerA.sources.some(
        (source: { source_url: string }) => source.source_url === ownerBRow.url,
      ),
    ).toBe(false);
    expect(
      ownerA.sources.some(
        (source: { source_url: string }) =>
          source.source_url ===
          'https://example.com/research/browser-owner-b-into-a',
      ),
    ).toBe(false);
    expect(ownerB.jobs.some((job: { id: string }) => job.id === jobA.id)).toBe(
      false,
    );
    expect(
      ownerB.jobs.some(
        (job: { job_key: string; id: string }) =>
          job.job_key === ownerARow.Job && job.id !== jobA.id,
      ),
    ).toBe(true);
    expect(
      ownerB.sources.some(
        (source: { source_url: string }) => source.source_url === ownerARow.url,
      ),
    ).toBe(false);
    expect(
      ownerB.events.some(
        (event: { job_id: string }) => event.job_id === jobA.id,
      ),
    ).toBe(false);
    expect(
      ownerA.events.some(
        (event: { job_id: string }) => event.job_id === jobB.id,
      ),
    ).toBe(false);

    const stealA = await pageB.request.post('/api/workspace', {
      data: {
        action: 'save',
        id: jobA.id,
        version: jobA.version,
        status: 'Ready',
        draft: 'Owner B must not accept owner A text.',
        blocker: '',
      },
    });
    const stealB = await pageA.request.post('/api/workspace', {
      data: {
        action: 'save',
        id: jobB.id,
        version: jobB.version,
        status: 'Ready',
        draft: 'Owner A must not accept owner B text.',
        blocker: '',
      },
    });
    expect(stealA.status()).toBe(404);
    expect(stealB.status()).toBe(404);
    const aAfter = await pageA.request.get('/api/workspace');
    const bAfter = await pageB.request.get('/api/workspace');
    expect(aAfter.status()).toBe(200);
    expect(bAfter.status()).toBe(200);
    expect(
      (await aAfter.json()).jobs.find(
        (job: { id: string }) => job.id === jobA.id,
      ),
    ).toMatchObject({
      status: jobA.status,
      draft: jobA.draft,
      version: jobA.version,
      name: jobA.name,
    });
    expect(
      (await bAfter.json()).jobs.find(
        (job: { id: string }) => job.id === jobB.id,
      ),
    ).toMatchObject({
      status: jobB.status,
      draft: jobB.draft,
      version: jobB.version,
      name: jobB.name,
    });

    await pageA.reload();
    await pageA.getByRole('button', { name: /All opportunities/ }).click();
    await expect(
      pageA.getByRole('button', { name: /Willow Example — Isolation Owner A/ }),
    ).toBeVisible();
    await expect(
      pageA.getByText('Maple Example — Isolation Owner B'),
    ).toHaveCount(0);
    await expect(
      pageA.getByText('Maple Example — Isolation Collision'),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
