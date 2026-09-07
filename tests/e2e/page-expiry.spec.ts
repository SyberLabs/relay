import { expect, test, type Page } from '@playwright/test';

const unauthorized = {
  json: {
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Sign in first.' }),
  },
  plain: { contentType: 'text/plain', body: 'Unauthorized' },
} as const;

async function assertSignedOut(
  page: Page,
  heading: string,
  markers: string[],
  actions: string[],
  url: string,
) {
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in with ChatGPT' }),
  ).toBeVisible();
  for (const marker of markers)
    await expect(page.getByText(marker)).toHaveCount(0);
  for (const name of actions)
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(page.url()).toBe(url);
}

const profileGet = {
  facts: [
    {
      id: 'f1',
      claim: 'PRIVATE_PROFILE_FACT',
      evidence: 'ledger evidence',
      tag: 'role',
      status: 'Verified',
      verified: '2026-01-01T00:00:00.000Z',
      expires: null,
    },
  ],
  rules: [{ id: 'r1', rule: 'PRIVATE_PROFILE_RULE', scope: 'global' }],
  version: 3,
  usable: 1,
};

for (const [format, payload] of Object.entries(unauthorized)) {
  test(`/profile POST 401 ${format} clears private UI without reload`, async ({
    page,
  }) => {
    await page.route('**/api/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: profileGet });
        return;
      }
      await route.fulfill({ status: 401, ...payload });
    });
    await page.goto('/profile');
    await expect(page.getByText('PRIVATE_PROFILE_FACT')).toBeVisible();
    await page.getByLabel('New style rule').fill('Keep openings short.');
    const url = page.url();
    await page.getByRole('button', { name: 'Add rule' }).click();
    await assertSignedOut(
      page,
      'Your profile',
      ['PRIVATE_PROFILE_FACT', 'PRIVATE_PROFILE_RULE'],
      ['Add rule'],
      url,
    );
  });

  test(`/preferences POST 401 ${format} clears private UI without reload`, async ({
    page,
  }) => {
    await page.route('**/api/preferences', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            weights: { comp: 0.2, remote: 0.1, level: 0, size: 0, domain: 0 },
            answered: 1,
            minutes: 120,
            pool: 4,
            target: 12,
            pair: {
              a: {
                job_key: 'a',
                name: 'PRIVATE_PREF_JOB_A',
                company: 'Example',
                level: 'mid',
                remote: 'remote',
                comp_min: 120000,
                comp_max: 150000,
                size: 'growth',
                posted: null,
              },
              b: {
                job_key: 'b',
                name: 'PRIVATE_PREF_JOB_B',
                company: 'Example',
                level: 'senior',
                remote: 'onsite',
                comp_min: 140000,
                comp_max: 180000,
                size: 'large',
                posted: null,
              },
            },
          },
        });
        return;
      }
      await route.fulfill({ status: 401, ...payload });
    });
    await page.goto('/preferences');
    await expect(page.getByText('PRIVATE_PREF_JOB_A')).toBeVisible();
    const url = page.url();
    await page.getByRole('button', { name: 'Save budget' }).click();
    await assertSignedOut(
      page,
      'Preferences',
      ['PRIVATE_PREF_JOB_A', 'PRIVATE_PREF_JOB_B'],
      ['Save budget'],
      url,
    );
  });

  test(`/review POST 401 ${format} clears private UI without reload`, async ({
    page,
  }) => {
    await page.route('**/api/drafts', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            drafts: [
              {
                id: 'd1',
                job_id: 'j1',
                cluster: 'backend',
                body: 'PRIVATE_REVIEW_DRAFT',
                corrected: '',
                cited: 'f1',
                confidence: 'high',
                verdict: 'Logged',
                profile_version: 1,
              },
            ],
            batches: [],
            trust: {},
            trigger: { reason: 'PRIVATE_REVIEW_REASON', ids: ['d1'] },
          },
        });
        return;
      }
      await route.fulfill({ status: 401, ...payload });
    });
    await page.route('**/api/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            facts: [
              {
                id: 'f1',
                claim: 'PRIVATE_REVIEW_FACT',
                evidence: 'ev',
                tag: 'role',
                status: 'Verified',
                verified: '2026-01-01T00:00:00.000Z',
                expires: null,
              },
            ],
            rules: [],
            version: 1,
            usable: 1,
          },
        });
        return;
      }
      await route.fallback();
    });
    await page.goto('/review');
    await expect(page.getByText('PRIVATE_REVIEW_REASON')).toBeVisible();
    const url = page.url();
    await page.getByRole('button', { name: 'Open review session' }).click();
    await assertSignedOut(
      page,
      'Batch review',
      ['PRIVATE_REVIEW_REASON', 'PRIVATE_REVIEW_FACT', 'PRIVATE_REVIEW_DRAFT'],
      ['Open review session'],
      url,
    );
  });

  test(`/track POST 401 ${format} clears private UI without reload`, async ({
    page,
  }) => {
    await page.route('**/api/outcomes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: {
            outcomes: [],
            prep: [
              {
                id: 'job-1',
                name: 'PRIVATE_TRACK_JOB',
                status: 'Ready',
                version: 2,
                receipt: null,
                claims: [
                  {
                    id: 'c1',
                    claim: 'PRIVATE_TRACK_CLAIM',
                    evidence: 'cited evidence',
                  },
                ],
              },
            ],
            rates: {},
          },
        });
        return;
      }
      await route.fulfill({ status: 401, ...payload });
    });
    await page.goto('/track');
    await expect(page.getByText('PRIVATE_TRACK_JOB')).toBeVisible();
    await page.getByLabel('Submission receipt').fill('https://example.com/r1');
    const url = page.url();
    await page.getByRole('button', { name: 'Record submission' }).click();
    await assertSignedOut(
      page,
      'Track',
      ['PRIVATE_TRACK_JOB', 'PRIVATE_TRACK_CLAIM'],
      ['Record submission'],
      url,
    );
  });
}

test('/profile extract POST 401 clears resume candidates without reload', async ({
  page,
}) => {
  await page.route('**/api/profile', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { ...profileGet, rules: [] } });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Sign in first.' }),
    });
  });
  await page.goto('/profile');
  await expect(page.getByText('PRIVATE_PROFILE_FACT')).toBeVisible();
  await page.getByLabel('Resume text').fill('PRIVATE_RESUME_TEXT');
  const url = page.url();
  await page.getByRole('button', { name: 'Extract candidate facts' }).click();
  await assertSignedOut(
    page,
    'Your profile',
    ['PRIVATE_PROFILE_FACT', 'PRIVATE_RESUME_TEXT'],
    ['Extract candidate facts'],
    url,
  );
});
